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
