import { describe, expect, it } from 'vitest';
import { DeviceService } from './index.js';
import type { DeviceRepository } from '@hedgeos/ports';
import type { RegisteredDevice, DeviceStatus } from '@hedgeos/domain';

class InMemoryDeviceRepository implements DeviceRepository {
  private devices = new Map<string, RegisteredDevice>();
  async findByAddress(address: string) { return [...this.devices.values()].find(d => d.address === address) ?? null; }
  async findById(id: string) { return this.devices.get(id) ?? null; }
  async list() { return [...this.devices.values()]; }
  async save(device: RegisteredDevice) { this.devices.set(device.id, device); }
  async setStatus(id: string, status: DeviceStatus, updatedAt: Date) { const d=this.devices.get(id)!; const result={...d,status,updatedAt}; this.devices.set(id,result); return result; }
}

const fixed = new Date('2026-01-01T00:00:00Z');
const service = () => new DeviceService(new InMemoryDeviceRepository(), { now:()=>fixed }, { next:()=> 'device-1' });

describe('registered devices', () => {
  it('normalizes identity and starts enabled with unknown state', async () => {
    const result = await service().register({ address:'aa-bb-cc-dd-ee-ff', displayName:'Front door' });
    expect(result.created).toBe(true);
    expect(result.device).toMatchObject({ address:'AA:BB:CC:DD:EE:FF', capability:'contact', status:'enabled', state:'unknown' });
  });
  it('is idempotent and does not re-enable a disabled device', async () => {
    const s = service();
    const first = await s.register({ address:'aabbccddeeff', displayName:'Door' });
    await s.disable(first.device.id);
    const again = await s.register({ address:'AA:BB:CC:DD:EE:FF', displayName:'Renamed' });
    expect(again.created).toBe(false);
    expect(again.device.status).toBe('disabled');
    expect(again.device.displayName).toBe('Door');
  });
  it('supports inspection and explicit enable', async () => {
    const s = service();
    const d = (await s.register({ address:'aabbccddeeff', displayName:'Door' })).device;
    await s.disable(d.id);
    expect((await s.show(d.address)).status).toBe('disabled');
    expect((await s.enable(d.address)).status).toBe('enabled');
  });
  it('rejects malformed addresses', async () => {
    await expect(service().register({ address:'not-an-address', displayName:'Door' })).rejects.toThrow('Invalid BLE address');
  });
});
