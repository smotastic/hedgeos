export * from './ingestion.js';

import { randomUUID } from 'node:crypto';
import { normalizeBleAddress, registerDevice, type DeviceStatus, type RegisteredDevice } from '@hedgeos/domain';
import type { Clock, DeviceRepository, DeviceUseCases, IdGenerator } from '@hedgeos/ports';

export class DeviceService implements DeviceUseCases {
  constructor(private readonly repository: DeviceRepository, private readonly clock: Clock, private readonly ids: IdGenerator) {}

  async register(input: { address: string; displayName: string }) {
    const address = normalizeBleAddress(input.address);
    const existing = await this.repository.findByAddress(address);
    if (existing) return { device: existing, created: false };
    const device = registerDevice({ ...input, address, id: this.ids.next(), now: this.clock.now() });
    await this.repository.save(device);
    return { device, created: true };
  }

  list() { return this.repository.list(); }

  async show(idOrAddress: string) {
    const device = await this.find(idOrAddress);
    if (!device) throw new Error(`Device not found: ${idOrAddress}`);
    return device;
  }

  enable(idOrAddress: string) { return this.changeStatus(idOrAddress, 'enabled'); }
  disable(idOrAddress: string) { return this.changeStatus(idOrAddress, 'disabled'); }

  private async find(value: string) {
    const byId = await this.repository.findById(value);
    if (byId) return byId;
    try { return await this.repository.findByAddress(normalizeBleAddress(value)); }
    catch { return null; }
  }
  private async changeStatus(value: string, status: DeviceStatus): Promise<RegisteredDevice> {
    const device = await this.show(value);
    return this.repository.setStatus(device.id, status, this.clock.now());
  }
}

export class SystemClock implements Clock { now() { return new Date(); } }
export class RandomIdGenerator implements IdGenerator { next() { return randomUUID(); } }
