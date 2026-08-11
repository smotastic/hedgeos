import type { RegisteredDevice, DeviceStatus } from '@hedgeos/domain';

export interface DeviceRepository {
  findByAddress(address: string): Promise<RegisteredDevice | null>;
  findById(id: string): Promise<RegisteredDevice | null>;
  list(): Promise<RegisteredDevice[]>;
  save(device: RegisteredDevice): Promise<void>;
  setStatus(id: string, status: DeviceStatus, updatedAt: Date): Promise<RegisteredDevice>;
}
export interface Clock { now(): Date; }
export interface IdGenerator { next(): string; }
export interface DeviceUseCases {
  register(input: { address: string; displayName: string }): Promise<{ device: RegisteredDevice; created: boolean }>;
  list(): Promise<RegisteredDevice[]>;
  show(idOrAddress: string): Promise<RegisteredDevice>;
  enable(idOrAddress: string): Promise<RegisteredDevice>;
  disable(idOrAddress: string): Promise<RegisteredDevice>;
}
