export type DeviceCapability = 'contact';
export type ContactState = 'unknown' | 'open' | 'closed';
export type DeviceStatus = 'enabled' | 'disabled';

export function normalizeBleAddress(value: string): string {
  const compact = value.trim().replace(/[:-]/g, '').toUpperCase();
  if (!/^[0-9A-F]{12}$/.test(compact)) {
    throw new Error(`Invalid BLE address: ${value}`);
  }
  return compact.match(/.{2}/g)!.join(':');
}

export interface RawTransportMessage {
  readonly id: string;
  readonly topic: string;
  readonly payload: string;
  readonly payloadBytes: Uint8Array;
  readonly gatewayIdentity: string | null;
  readonly receivedAt: Date;
  readonly correlationId: string;
  readonly deliveryKey: string;
  quarantineReason: string | null;
}

export interface NormalizedObservation {
  readonly id: string;
  readonly rawMessageId: string;
  readonly deviceAddress: string;
  readonly capability: DeviceCapability;
  readonly state: Exclude<ContactState, 'unknown'>;
  readonly occurredAt: Date;
  readonly receivedAt: Date;
  readonly sequence: number;
}

export interface StateTransition {
  readonly id: string;
  readonly observationId: string;
  readonly deviceAddress: string;
  readonly capability: DeviceCapability;
  readonly previousState: Exclude<ContactState, 'unknown'>;
  readonly currentState: Exclude<ContactState, 'unknown'>;
  readonly occurredAt: Date;
  readonly sequence: number;
}

export interface RegisteredDevice {
  readonly id: string;
  readonly address: string;
  readonly displayName: string;
  readonly capability: DeviceCapability;
  readonly status: DeviceStatus;
  readonly state: ContactState;
  readonly registeredAt: Date;
  readonly updatedAt: Date;
}

export interface StateTransitionPredicate {
  readonly capability: DeviceCapability;
  readonly deviceAddress?: string;
  readonly previousState?: Exclude<ContactState, 'unknown'>;
  readonly currentState: Exclude<ContactState, 'unknown'>;
}

export interface AutomationRevision {
  readonly id: string;
  readonly automationId: string;
  readonly revision: number;
  readonly predicate: StateTransitionPredicate;
  readonly createdAt: Date;
}

export interface Automation {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly currentRevision: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type ExecutionMode = 'live' | 'replay';
export type AutomationExecutionStatus = 'recorded' | 'failed';
export type LogicalActionStatus = 'pending' | 'sending' | 'delivered' | 'suppressed' | 'failed';

export interface AutomationExecution {
  readonly id: string;
  readonly transitionId: string;
  readonly automationId: string;
  readonly automationRevisionId: string;
  readonly mode: ExecutionMode;
  readonly status: AutomationExecutionStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface LogicalNotificationAction {
  readonly id: string;
  readonly executionId: string;
  readonly type: 'telegram_notification';
  readonly status: LogicalActionStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly failureReason?: string;
}

export function matchesStateTransition(
  predicate: StateTransitionPredicate,
  transition: Pick<StateTransition, 'deviceAddress' | 'capability' | 'previousState' | 'currentState'>,
): boolean {
  return predicate.capability === transition.capability
    && (!predicate.deviceAddress || predicate.deviceAddress === transition.deviceAddress)
    && (!predicate.previousState || predicate.previousState === transition.previousState)
    && predicate.currentState === transition.currentState;
}

export function validateStateTransitionPredicate(predicate: StateTransitionPredicate): StateTransitionPredicate {
  if (predicate.capability !== 'contact') throw new Error('Only contact automations are supported');
  if (predicate.deviceAddress) predicate = { ...predicate, deviceAddress: normalizeBleAddress(predicate.deviceAddress) };
  const candidate = predicate as { currentState: string; previousState?: string };
  if (candidate.currentState !== 'open' && candidate.currentState !== 'closed') throw new Error('Current state must be open or closed');
  if (candidate.previousState !== undefined && candidate.previousState !== 'open' && candidate.previousState !== 'closed') throw new Error('Previous state must be open or closed');
  return { ...predicate };
}

export function applyObservation(input: {
  currentState: ContactState;
  currentOccurredAt?: Date | null;
  observation: NormalizedObservation;
  transitionId: string;
}): { state: ContactState; transition: StateTransition | null; accepted: boolean } {
  if (input.currentOccurredAt && input.observation.occurredAt <= input.currentOccurredAt) {
    return { state: input.currentState, transition: null, accepted: false };
  }
  if (input.currentState === 'unknown' || input.currentState === input.observation.state) {
    return { state: input.observation.state, transition: null, accepted: true };
  }
  return {
    state: input.observation.state,
    accepted: true,
    transition: {
      id: input.transitionId,
      observationId: input.observation.id,
      deviceAddress: input.observation.deviceAddress,
      capability: input.observation.capability,
      previousState: input.currentState,
      currentState: input.observation.state,
      occurredAt: input.observation.occurredAt,
      sequence: input.observation.sequence,
    },
  };
}

export function registerDevice(input: {
  id: string; address: string; displayName: string; now: Date;
}): RegisteredDevice {
  const displayName = input.displayName.trim();
  if (!displayName) throw new Error('Display name must not be empty');
  return {
    id: input.id,
    address: normalizeBleAddress(input.address),
    displayName,
    capability: 'contact',
    status: 'enabled',
    state: 'unknown',
    registeredAt: input.now,
    updatedAt: input.now,
  };
}
