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
