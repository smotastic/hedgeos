import {
  matchesStateTransition,
  validateStateTransitionPredicate,
  type Automation,
  type AutomationRevision,
  type StateTransitionPredicate,
} from '@hedgeos/domain';
import type {
  AutomationExecutionRepository,
  NotificationAttempt,
  AutomationRepository,
  AutomationUseCases,
  Clock,
  IdGenerator,
  NotificationActionPort,
  TransitionClaim,
  TransitionHandoff,
  DeviceRepository,
} from '@hedgeos/ports';
import type { ExecutionMode, AutomationExecution, LogicalNotificationAction } from '@hedgeos/domain';

export class AutomationService implements AutomationUseCases {
  constructor(
    private readonly repository: AutomationRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async create(input: { name: string; predicate: StateTransitionPredicate }) {
    const name = input.name.trim();
    if (!name) throw new Error('Automation name must not be empty');
    const now = this.clock.now();
    const predicate = validateStateTransitionPredicate(input.predicate);
    const automation: Automation = {
      id: this.ids.next(), name, enabled: true, currentRevision: 1, createdAt: now, updatedAt: now,
    };
    const revision: AutomationRevision = {
      id: this.ids.next(), automationId: automation.id, revision: 1, predicate, createdAt: now,
    };
    await this.repository.create({ automation, revision });
    return { automation, revision };
  }

  list() { return this.repository.list(); }

  async show(id: string) {
    const automation = await this.repository.findById(id);
    if (!automation) throw new Error(`Automation not found: ${id}`);
    const revision = await this.repository.currentRevision(id);
    if (!revision) throw new Error(`Automation revision not found: ${id}`);
    return { automation, revision };
  }

  enable(id: string) { return this.changeEnabled(id, true); }
  disable(id: string) { return this.changeEnabled(id, false); }

  async revise(id: string, input: { name?: string; predicate: StateTransitionPredicate }) {
    const current = await this.repository.findById(id);
    if (!current) throw new Error(`Automation not found: ${id}`);
    const name = input.name === undefined ? current.name : input.name.trim();
    if (!name) throw new Error('Automation name must not be empty');
    const now = this.clock.now();
    const automation: Automation = { ...current, name, currentRevision: current.currentRevision + 1, updatedAt: now };
    const revision: AutomationRevision = {
      id: this.ids.next(), automationId: id, revision: automation.currentRevision,
      predicate: validateStateTransitionPredicate(input.predicate), createdAt: now,
    };
    await this.repository.addRevision(automation, revision);
    return { automation, revision };
  }

  private async changeEnabled(id: string, enabled: boolean) {
    if (!await this.repository.findById(id)) throw new Error(`Automation not found: ${id}`);
    return this.repository.setEnabled(id, enabled, this.clock.now());
  }
}

export interface RunnerOptions {
  readonly workerId: string;
  readonly now: Date;
  readonly leaseMs: number;
  readonly limit?: number;
  readonly mode?: ExecutionMode;
  /** Maximum delivery attempts for one logical notification action. */
  readonly maxNotificationAttempts?: number;
  /** Optional random source so retry jitter can be deterministic in tests. */
  readonly random?: () => number;
}

/** Evaluates claimed transitions. It contains no PostgreSQL or ingestor dependency. */
export class AutomationRunner {
  constructor(
    private readonly handoff: TransitionHandoff,
    private readonly automations: AutomationRepository,
    private readonly executions: AutomationExecutionRepository,
    private readonly devices?: Pick<DeviceRepository, 'findByAddress'>,
    private readonly ids?: IdGenerator,
    private readonly clock?: Clock,
    private readonly notification?: NotificationActionPort,
  ) {}

  async runOnce(options: RunnerOptions): Promise<{ claimed: number; acknowledged: number }> {
    const claims = await this.handoff.claim({ workerId: options.workerId, now: options.now, leaseMs: options.leaseMs, limit: options.limit });
    let acknowledged = 0;
    for (const claim of claims) {
      try {
        await this.evaluateClaim(claim, options.mode ?? 'live', options.maxNotificationAttempts ?? 5, options.random ?? Math.random);
        await this.handoff.acknowledge(claim.claimId, options.workerId, options.now);
        acknowledged += 1;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        const base = Math.min(60_000, 1_000 * 2 ** Math.min(claim.attempt - 1, 6));
        const jitter = Math.floor(base * 0.25 * (options.random ?? Math.random)());
        await this.handoff.retry(claim.claimId, options.workerId, options.now, new Date(options.now.getTime() + base + jitter), reason);
      }
    }
    return { claimed: claims.length, acknowledged };
  }

  /** Manually retries an exhausted action without creating another execution. */
  async retryNotification(actionId: string, transition: TransitionClaim['transition'], maxAttempts = 5): Promise<void> {
    const action = await this.executions.findAction(actionId);
    if (!action) throw new Error(`Notification action not found: ${actionId}`);
    if (action.status === 'delivered') return;
    const attempts = await this.executions.listAttempts(actionId);
    const attemptNumber = Math.max(0, ...attempts.map(item => item.attemptNumber)) + 1;
    if (attemptNumber > maxAttempts) throw new Error('Notification retry limit exhausted');
    const now = this.clock?.now() ?? new Date();
    const attempt: NotificationAttempt = { id: this.ids?.next() ?? `${actionId}:${attemptNumber}`, actionId, attemptNumber, status: 'sending', createdAt: now };
    await this.executions.createAttempt(attempt);
    try {
      if (!this.notification) throw new Error('Notification adapter is not configured');
      await this.notification.send(action, transition, { deviceName: transition.deviceAddress });
      await this.executions.updateAttempt(attempt.id, 'delivered', this.clock?.now() ?? now);
      await this.executions.updateAction(actionId, 'delivered', this.clock?.now() ?? now);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const retryable = !(error && typeof error === 'object' && 'retryable' in error && (error as { retryable: unknown }).retryable === false);
      await this.executions.updateAttempt(attempt.id, retryable && attemptNumber < maxAttempts ? 'retryable' : 'permanent', this.clock?.now() ?? now, reason);
      throw error;
    }
  }

  async evaluateClaim(claim: TransitionClaim, mode: ExecutionMode = 'live', maxNotificationAttempts = 5, random = Math.random): Promise<number> {
    const device = this.devices ? await this.devices.findByAddress(claim.transition.deviceAddress) : null;
    if (device && device.status !== 'enabled') return 0;
    const active = await this.automations.listEnabledWithCurrentRevisions();
    let matched = 0;
    for (const item of active) {
      if (!matchesStateTransition(item.revision.predicate, claim.transition)) continue;
      matched += 1;
      const now = this.clock?.now() ?? new Date();
      const execution: AutomationExecution = {
        id: this.ids?.next() ?? `${claim.transition.id}:${item.revision.id}:${mode}`,
        transitionId: claim.transition.id, automationId: item.automation.id,
        automationRevisionId: item.revision.id, mode, status: 'recorded', createdAt: now, updatedAt: now,
      };
      const result = await this.executions.create(execution);
      const effectiveExecution = result.execution;
      const action: LogicalNotificationAction = {
        id: this.ids?.next() ?? `${effectiveExecution.id}:notification`, executionId: effectiveExecution.id,
        type: 'telegram_notification', status: mode === 'replay' ? 'suppressed' : 'pending', createdAt: now, updatedAt: now,
      };
      const actionResult = await this.executions.createAction(action);
      if (mode === 'replay' || !this.notification) continue;
      if (actionResult.action.status === 'delivered' || actionResult.action.status === 'suppressed') continue;

      const attempts = await this.executions.listAttempts(actionResult.action.id);
      const attemptNumber = Math.max(0, ...attempts.map(item => item.attemptNumber)) + 1;
      const attempt: NotificationAttempt = { id: this.ids?.next() ?? `${actionResult.action.id}:${attemptNumber}`, actionId: actionResult.action.id, attemptNumber, status: 'sending', createdAt: now };
      await this.executions.createAttempt(attempt);
      try {
        await this.notification.send(actionResult.action, claim.transition, {
          deviceName: device?.displayName ?? claim.transition.deviceAddress,
        });
        await this.executions.updateAttempt(attempt.id, 'delivered', this.clock?.now() ?? now);
        await this.executions.updateAction(actionResult.action.id, 'delivered', this.clock?.now() ?? now);
        await this.executions.updateExecution(effectiveExecution.id, 'recorded', this.clock?.now() ?? now);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        const retryable = !(error && typeof error === 'object' && 'retryable' in error && (error as { retryable: unknown }).retryable === false);
        const exhausted = attemptNumber >= Math.max(1, maxNotificationAttempts);
        const permanent = !retryable || exhausted;
        await this.executions.updateAttempt(attempt.id, permanent ? 'permanent' : 'retryable', this.clock?.now() ?? now, reason);
        await this.executions.updateAction(actionResult.action.id, 'failed', this.clock?.now() ?? now, reason);
        await this.executions.updateExecution(effectiveExecution.id, 'failed', this.clock?.now() ?? now, reason);
        if (permanent) continue;
        throw error;
      }
    }
    return matched;
  }
}
