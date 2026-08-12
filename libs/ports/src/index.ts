import type {
  Automation,
  AutomationExecution,
  AutomationRevision,
  DeviceStatus,
  LogicalNotificationAction,
  NormalizedObservation,
  RawTransportMessage,
  RegisteredDevice,
  StateTransition,
  ExecutionMode,
  AutomationExecutionStatus,
  LogicalActionStatus,
} from '@hedgeos/domain';

export interface DeviceRepository {
  findByAddress(address: string): Promise<RegisteredDevice | null>;
  findById(id: string): Promise<RegisteredDevice | null>;
  list(): Promise<RegisteredDevice[]>;
  save(device: RegisteredDevice): Promise<void>;
  setStatus(id: string, status: DeviceStatus, updatedAt: Date): Promise<RegisteredDevice>;
}
export interface RawMessageRepository {
  save(message: RawTransportMessage): Promise<void>;
  /** Returns false when this transport delivery was already ingested. */
  saveIfNew?(message: RawTransportMessage): Promise<boolean>;
}
export interface ObservationRepository {
  save(observation: NormalizedObservation): Promise<void>;
  nextSequence(deviceAddress: string): Promise<number>;
  /** Atomically persists the observation and updates the projection/transition. */
  commitObservation?(observation: NormalizedObservation, transitionId: string): Promise<{ accepted: boolean; transition: StateTransition | null }>;
}
export interface StateProjection {
  readonly state: import('@hedgeos/domain').ContactState;
  readonly occurredAt: Date | null;
}
export interface StateProjectionRepository {
  getState(deviceAddress: string): Promise<StateProjection>;
  apply(deviceAddress: string, state: import('@hedgeos/domain').ContactState, observation: NormalizedObservation): Promise<void>;
}
export interface TransitionRepository {
  save(transition: StateTransition): Promise<void>;
}

/** A complete ingestion commit. Implementations must use one database transaction. */
export interface IngestionCommitRepository {
  commit(raw: RawTransportMessage, observation: NormalizedObservation | null, transitionId?: string): Promise<{
    inserted: boolean;
    accepted: boolean;
    observation: NormalizedObservation | null;
    transition: StateTransition | null;
  }>;
}
export interface Clock { now(): Date; }
export interface IdGenerator { next(): string; }
export interface IngestionRepositories {
  devices: Pick<DeviceRepository, 'findByAddress'>;
  raw: RawMessageRepository;
  observations: ObservationRepository;
  state: StateProjectionRepository;
  transitions: TransitionRepository;
  /** Optional until an adapter provides atomic raw + observation persistence. */
  ingestion?: IngestionCommitRepository;
}

export interface DeviceUseCases {
  register(input: { address: string; displayName: string }): Promise<{ device: RegisteredDevice; created: boolean }>;
  list(): Promise<RegisteredDevice[]>;
  show(idOrAddress: string): Promise<RegisteredDevice>;
  enable(idOrAddress: string): Promise<RegisteredDevice>;
  disable(idOrAddress: string): Promise<RegisteredDevice>;
}

export interface AutomationRepository {
  create(input: { automation: Automation; revision: AutomationRevision }): Promise<void>;
  list(): Promise<Automation[]>;
  findById(id: string): Promise<Automation | null>;
  currentRevision(id: string): Promise<AutomationRevision | null>;
  listEnabledWithCurrentRevisions(): Promise<Array<{ automation: Automation; revision: AutomationRevision }>>;
  setEnabled(id: string, enabled: boolean, updatedAt: Date): Promise<Automation>;
  addRevision(automation: Automation, revision: AutomationRevision): Promise<void>;
}

export interface AutomationUseCases {
  create(input: { name: string; predicate: import('@hedgeos/domain').StateTransitionPredicate }): Promise<{ automation: Automation; revision: AutomationRevision }>;
  list(): Promise<Automation[]>;
  show(id: string): Promise<{ automation: Automation; revision: AutomationRevision }>;
  enable(id: string): Promise<Automation>;
  disable(id: string): Promise<Automation>;
  revise(id: string, input: { name?: string; predicate: import('@hedgeos/domain').StateTransitionPredicate }): Promise<{ automation: Automation; revision: AutomationRevision }>;
}

export interface TransitionClaim {
  readonly claimId: string;
  readonly workerId: string;
  readonly transition: StateTransition;
  readonly attempt: number;
  readonly leaseUntil: Date;
}

/** Database-independent durable handoff used by the automation runner. */
export interface TransitionHandoff {
  claim(input: { workerId: string; now: Date; leaseMs: number; limit?: number }): Promise<TransitionClaim[]>;
  heartbeat(claimId: string, workerId: string, now: Date, leaseMs: number): Promise<boolean>;
  acknowledge(claimId: string, workerId: string, now: Date): Promise<boolean>;
  retry(claimId: string, workerId: string, now: Date, availableAt: Date, reason: string): Promise<boolean>;
  expire(now: Date): Promise<number>;
}

export interface AutomationExecutionRepository {
  findByIdentity(transitionId: string, automationRevisionId: string, mode: ExecutionMode): Promise<AutomationExecution | null>;
  create(execution: AutomationExecution): Promise<{ execution: AutomationExecution; created: boolean }>;
  createAction(action: LogicalNotificationAction): Promise<{ action: LogicalNotificationAction; created: boolean }>;
  updateExecution(id: string, status: AutomationExecutionStatus, updatedAt: Date, reason?: string): Promise<void>;
  updateAction(id: string, status: LogicalActionStatus, updatedAt: Date, reason?: string): Promise<void>;
  findAction(id: string): Promise<LogicalNotificationAction | null>;
  createAttempt(attempt: NotificationAttempt): Promise<void>;
  updateAttempt(id: string, status: NotificationAttempt['status'], completedAt: Date, reason?: string): Promise<void>;
  listAttempts(actionId?: string): Promise<NotificationAttempt[]>;
  list(): Promise<AutomationExecution[]>;
  listActions(): Promise<LogicalNotificationAction[]>;
}

export interface NotificationAttempt {
  readonly id: string;
  readonly actionId: string;
  readonly attemptNumber: number;
  readonly status: 'sending' | 'delivered' | 'retryable' | 'permanent';
  readonly createdAt: Date;
  readonly completedAt?: Date;
  readonly failureReason?: string;
}

export interface NotificationContext {
  readonly deviceName: string;
}

export class NotificationDeliveryError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'NotificationDeliveryError';
  }
}

export interface NotificationActionPort {
  send(action: LogicalNotificationAction, transition: StateTransition, context?: NotificationContext): Promise<void>;
}
