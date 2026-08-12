import type { NormalizedObservation, RawTransportMessage, RegisteredDevice, StateTransition, DeviceStatus } from '@hedgeos/domain';

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
export interface Clock { now(): Date; }
export interface IdGenerator { next(): string; }
export interface IngestionRepositories {
  devices: Pick<DeviceRepository, 'findByAddress'>;
  raw: RawMessageRepository;
  observations: ObservationRepository;
  state: StateProjectionRepository;
  transitions: TransitionRepository;
}

export interface DeviceUseCases {
  register(input: { address: string; displayName: string }): Promise<{ device: RegisteredDevice; created: boolean }>;
  list(): Promise<RegisteredDevice[]>;
  show(idOrAddress: string): Promise<RegisteredDevice>;
  enable(idOrAddress: string): Promise<RegisteredDevice>;
  disable(idOrAddress: string): Promise<RegisteredDevice>;
}
