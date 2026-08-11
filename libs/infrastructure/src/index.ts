import type { Pool } from 'pg';
import { normalizeBleAddress, type DeviceStatus, type RegisteredDevice, type ContactState } from '@hedgeos/domain';
import type { DeviceRepository } from '@hedgeos/ports';

interface Row { id:string; address:string; display_name:string; capability:'contact'; status:DeviceStatus; state:ContactState; registered_at:Date; updated_at:Date; }
const map = (row: Row): RegisteredDevice => ({ id:row.id, address:row.address, displayName:row.display_name, capability:row.capability, status:row.status, state:row.state, registeredAt:row.registered_at, updatedAt:row.updated_at });

export class PostgresDeviceRepository implements DeviceRepository {
  constructor(private readonly pool: Pool) {}
  async findByAddress(address: string) { const r = await this.pool.query<Row>('SELECT * FROM devices WHERE address = $1', [normalizeBleAddress(address)]); return r.rows[0] ? map(r.rows[0]) : null; }
  async findById(id: string) { const r = await this.pool.query<Row>('SELECT * FROM devices WHERE id = $1', [id]); return r.rows[0] ? map(r.rows[0]) : null; }
  async list() { const r = await this.pool.query<Row>('SELECT * FROM devices ORDER BY display_name, address'); return r.rows.map(map); }
  async save(device: RegisteredDevice) { await this.pool.query('INSERT INTO devices (id,address,display_name,capability,status,state,registered_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (address) DO NOTHING', [device.id,device.address,device.displayName,device.capability,device.status,device.state,device.registeredAt,device.updatedAt]); }
  async setStatus(id: string, status: DeviceStatus, updatedAt: Date) { const r = await this.pool.query<Row>('UPDATE devices SET status=$2, updated_at=$3 WHERE id=$1 RETURNING *', [id,status,updatedAt]); if (!r.rows[0]) throw new Error(`Device not found: ${id}`); return map(r.rows[0]); }
}

export class InMemoryDeviceRepository implements DeviceRepository {
  private readonly devices = new Map<string, RegisteredDevice>();
  async findByAddress(address:string) { const normalized = normalizeBleAddress(address); return [...this.devices.values()].find(d=>d.address===normalized) ?? null; }
  async findById(id:string) { return this.devices.get(id) ?? null; }
  async list() { return [...this.devices.values()]; }
  async save(device:RegisteredDevice) { if (![...this.devices.values()].some(d=>d.address===device.address)) this.devices.set(device.id,device); }
  async setStatus(id:string,status:DeviceStatus,updatedAt:Date) { const d=this.devices.get(id); if(!d) throw new Error(`Device not found: ${id}`); const updated={...d,status,updatedAt}; this.devices.set(id,updated); return updated; }
}
