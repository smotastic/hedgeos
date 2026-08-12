import { describe, expect, it } from 'vitest';
import { AutomationRunner, AutomationService } from './automation.js';
import type { Automation, AutomationExecution, AutomationRevision, LogicalNotificationAction, StateTransition } from '@hedgeos/domain';
import type { AutomationExecutionRepository, AutomationRepository, TransitionClaim, TransitionHandoff } from '@hedgeos/ports';

const now = new Date('2026-01-01T00:00:00Z');
const transition: StateTransition = { id:'transition-1', observationId:'observation-1', deviceAddress:'AA:BB:CC:DD:EE:FF', capability:'contact', previousState:'closed', currentState:'open', occurredAt:now, sequence:2 };

class MemoryAutomations implements AutomationRepository {
  values = new Map<string, { automation: Automation; revision: AutomationRevision }>();
  async create(value: { automation: Automation; revision: AutomationRevision }) { this.values.set(value.automation.id, value); }
  async list() { return [...this.values.values()].map(v => v.automation); }
  async findById(id: string) { return this.values.get(id)?.automation ?? null; }
  async currentRevision(id: string) { return this.values.get(id)?.revision ?? null; }
  async listEnabledWithCurrentRevisions() { return [...this.values.values()].filter(v => v.automation.enabled); }
  async setEnabled(id: string, enabled: boolean, updatedAt: Date) { const value=this.values.get(id)!; value.automation={...value.automation,enabled,updatedAt}; return value.automation; }
  async addRevision(automation: Automation, revision: AutomationRevision) { this.values.set(automation.id, { automation, revision }); }
}

class MemoryExecutions implements AutomationExecutionRepository {
  executions = new Map<string, AutomationExecution>();
  actions = new Map<string, LogicalNotificationAction>();
  async findByIdentity(transitionId: string, revisionId: string, mode: 'live'|'replay') { return [...this.executions.values()].find(e => e.transitionId===transitionId && e.automationRevisionId===revisionId && e.mode===mode) ?? null; }
  async create(execution: AutomationExecution) { const existing=await this.findByIdentity(execution.transitionId,execution.automationRevisionId,execution.mode); if(existing)return {execution:existing,created:false}; this.executions.set(execution.id,execution); return {execution,created:true}; }
  async createAction(action: LogicalNotificationAction) { const existing=[...this.actions.values()].find(a=>a.executionId===action.executionId); if(existing)return {action:existing,created:false}; this.actions.set(action.id,action); return {action,created:true}; }
  async updateExecution(id: string, status: 'recorded'|'failed', updatedAt: Date, reason?: string) { const e=this.executions.get(id)!; this.executions.set(id,{...e,status,updatedAt}); void reason; }
  attempts: Array<{ actionId: string; attemptNumber: number }> = [];
  async updateAction(id: string, status: 'pending'|'suppressed'|'failed'|'delivered', updatedAt: Date, reason?: string) { const a=this.actions.get(id)!; this.actions.set(id,{...a,status,updatedAt,...(reason?{failureReason:reason}:{})}); }
  async findAction(id: string) { return this.actions.get(id) ?? null; }
  async createAttempt(attempt: { actionId: string; attemptNumber: number }) { this.attempts.push(attempt); }
  async updateAttempt() {}
  async listAttempts(actionId?: string) { return this.attempts.filter(attempt => !actionId || attempt.actionId === actionId).map((attempt, index) => ({ id:`attempt-${index}`, ...attempt, status:'retryable' as const, createdAt:now })); }
  async list() { return [...this.executions.values()]; }
  async listActions() { return [...this.actions.values()]; }
}

class MemoryHandoff implements TransitionHandoff {
  claimCount=0; acknowledged=0; retried=0; private pending=true;
  async claim(input: { workerId: string; now: Date; leaseMs: number }): Promise<TransitionClaim[]> { if(!this.pending)return []; this.claimCount++; return [{claimId:'claim-1',workerId:input.workerId,transition,attempt:this.claimCount,leaseUntil:new Date(input.now.getTime()+input.leaseMs)}]; }
  async heartbeat() { return true; }
  async acknowledge() { this.pending=false; this.acknowledged++; return true; }
  async retry() { this.retried++; return true; }
  async expire() { return 0; }
}

function automationService(repository = new MemoryAutomations()) {
  let id=0;
  return new AutomationService(repository, {now:()=>now}, {next:()=>`id-${++id}`});
}

describe('typed automations', () => {
  it('matches closed to open and preserves immutable revisions', async () => {
    const repository = new MemoryAutomations(); const service=automationService(repository);
    const created=await service.create({name:'Notify windows',predicate:{capability:'contact',currentState:'open'}});
    expect(created.revision.revision).toBe(1);
    const revised=await service.revise(created.automation.id,{predicate:{capability:'contact',previousState:'open',currentState:'closed'}});
    expect(revised.revision.revision).toBe(2);
    expect((await service.show(created.automation.id)).revision.predicate.currentState).toBe('closed');
    expect(repository.values.get(created.automation.id)?.automation.currentRevision).toBe(2);
  });

  it('deduplicates delivery by transition and revision', async () => {
    const service=automationService(); const created=await service.create({name:'Open',predicate:{capability:'contact',currentState:'open'}});
    const handoff=new MemoryHandoff(); const executions=new MemoryExecutions();
    const runner=new AutomationRunner(handoff, (service as unknown as { repository: MemoryAutomations }).repository, executions, undefined, {next:()=>`execution-${executions.executions.size+1}`}, {now:()=>now});
    const claim = (await handoff.claim({workerId:'w',now,leaseMs:1000}))[0]!;
    await runner.evaluateClaim(claim);
    await runner.evaluateClaim(claim);
    expect(created.automation.id).toBeDefined(); expect(executions.executions.size).toBe(1);
  });

  it('isolates replay from notification delivery', async () => {
    const repository=new MemoryAutomations(); const service=automationService(repository); await service.create({name:'Open',predicate:{capability:'contact',currentState:'open'}});
    const executions=new MemoryExecutions(); let sends=0; let ids=0;
    const runner=new AutomationRunner(new MemoryHandoff(),repository,executions,undefined,{next:()=>`id-${++ids}`},{now:()=>now},{send:async()=>{sends++;}});
    await runner.evaluateClaim({claimId:'c',workerId:'w',transition,attempt:1,leaseUntil:now},'replay');
    expect(sends).toBe(0); expect((await executions.listActions())[0]?.status).toBe('suppressed');
  });

  it('records failure and retries the handoff instead of acknowledging it', async () => {
    const repository=new MemoryAutomations(); const service=automationService(repository); await service.create({name:'Open',predicate:{capability:'contact',currentState:'open'}});
    const handoff=new MemoryHandoff(); const executions=new MemoryExecutions();
    const runner=new AutomationRunner(handoff,repository,executions,undefined,{next:()=>`id-${executions.executions.size+1}`},{now:()=>now},{send:async()=>{throw new Error('telegram unavailable');}});
    const result=await runner.runOnce({workerId:'w',now,leaseMs:1000});
    expect(result.acknowledged).toBe(0); expect(handoff.retried).toBe(1); expect((await executions.listActions())[0]?.status).toBe('failed');
  });
});
