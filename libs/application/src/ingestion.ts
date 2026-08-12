import { createHash } from 'node:crypto';
import { applyObservation, normalizeBleAddress, type ContactState, type NormalizedObservation, type RawTransportMessage } from '@hedgeos/domain';
import type { Clock, IdGenerator, IngestionRepositories } from '@hedgeos/ports';

export interface ShellyGatewayMapping {
  readonly gatewayComponent: string;
  readonly deviceAddress: string;
}

export interface ShellyMessage {
  readonly topic: string;
  readonly payload: string | Uint8Array;
  readonly receivedAt: Date;
  readonly gatewayIdentity?: string;
  readonly correlationId?: string;
}

export class IngestionService {
  constructor(
    private readonly repositories: IngestionRepositories,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly mappings: readonly ShellyGatewayMapping[],
  ) {}

  async ingest(message: ShellyMessage): Promise<{ raw: RawTransportMessage; observation: NormalizedObservation | null }> {
    const payloadBytes = typeof message.payload === 'string'
      ? new TextEncoder().encode(message.payload)
      : new Uint8Array(message.payload);
    const payload = new TextDecoder('utf-8', { fatal: false }).decode(payloadBytes);
    const envelope = envelopeMetadata(payload);
    const correlationId = message.correlationId ?? envelope.correlationId ?? this.ids.next();
    const raw: RawTransportMessage = {
      id: this.ids.next(), topic: message.topic, payload, payloadBytes,
      gatewayIdentity: message.gatewayIdentity ?? envelope.gatewayIdentity ?? this.gatewayFromTopic(message.topic),
      receivedAt: message.receivedAt, correlationId,
      deliveryKey: message.correlationId ?? envelope.correlationId ?? createHash('sha256').update(message.topic).update(payloadBytes).digest('hex'),
      quarantineReason: null,
    };
    const decoded = decodeShellyContact(message.topic, payload, this.mappings);
    if (!decoded) {
      raw.quarantineReason = quarantineReason(message.topic, payload, this.mappings);
      if (this.repositories.raw.saveIfNew) await this.repositories.raw.saveIfNew(raw);
      else await this.repositories.raw.save(raw);
      return { raw, observation: null };
    }
    const device = await this.repositories.devices.findByAddress(decoded.deviceAddress);
    if (!device || device.status !== 'enabled') raw.quarantineReason = device ? 'disabled_device' : 'unknown_device';
    if (this.repositories.raw.saveIfNew) {
      if (!await this.repositories.raw.saveIfNew(raw)) return { raw, observation: null };
    } else await this.repositories.raw.save(raw);
    if (!device || device.status !== 'enabled') return { raw, observation: null };
    const observation: NormalizedObservation = {
      id: this.ids.next(), rawMessageId: raw.id, deviceAddress: decoded.deviceAddress,
      capability: 'contact', state: decoded.state,
      occurredAt: decoded.occurredAt ?? message.receivedAt, receivedAt: message.receivedAt,
      sequence: await this.repositories.observations.nextSequence(decoded.deviceAddress),
    };
    const transitionId = this.ids.next();
    if (this.repositories.observations.commitObservation) {
      const result = await this.repositories.observations.commitObservation(observation, transitionId);
      return { raw, observation };
    }
    await this.repositories.observations.save(observation);
    const current = await this.repositories.state.getState(observation.deviceAddress);
    const result = applyObservation({ currentState: current.state, currentOccurredAt: current.occurredAt, observation, transitionId });
    if (!result.accepted) return { raw, observation };
    await this.repositories.state.apply(observation.deviceAddress, result.state, observation);
    if (result.transition) await this.repositories.transitions.save(result.transition);
    return { raw, observation };
  }

  private gatewayFromTopic(topic: string): string | null {
    const match = topic.match(/^([^/]+)\/events\/rpc$/);
    return match?.[1] ?? null;
  }
}

function envelopeMetadata(payload: string): { gatewayIdentity: string | null; correlationId: string | null } {
  try {
    const value = JSON.parse(payload) as { src?: unknown; id?: unknown };
    return {
      gatewayIdentity: typeof value?.src === 'string' ? value.src : null,
      correlationId: typeof value?.id === 'string' || typeof value?.id === 'number' ? String(value.id) : null,
    };
  } catch { return { gatewayIdentity: null, correlationId: null }; }
}

function quarantineReason(topic: string, payload: string, mappings: readonly ShellyGatewayMapping[]): string {
  try {
    const value = JSON.parse(payload) as any;
    if (!value || typeof value !== 'object') return 'unsupported_payload';
    if (/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(topic)) {
      if (value.service_data?.encryption === true) return 'encrypted_bthome';
      if (typeof value.addr !== 'string' || !value.service_data) return 'malformed_bthome';
      if (value.service_data.window === undefined) return 'missing_contact_data';
      return 'invalid_bthome';
    }
    if (value.method !== 'NotifyStatus') return 'unsupported_object';
    const entries = Object.keys(value.params ?? {}).filter(key => key.startsWith('bthomesensor:'));
    if (entries.length !== 1) return 'ambiguous_identity';
    if (!mappings.some(mapping => mapping.gatewayComponent === entries[0])) return 'unmapped_identity';
    if (typeof value.params?.[entries[0]]?.value !== 'boolean') return 'invalid_contact_value';
    return 'malformed_gateway_envelope';
  } catch { return 'malformed_json'; }
}

export function decodeShellyContact(topic: string, payload: string, mappings: readonly ShellyGatewayMapping[]): { deviceAddress: string; state: Exclude<ContactState, 'unknown'>; occurredAt: Date | null } | null {
  let value: unknown;
  try { value = JSON.parse(payload); } catch { return null; }
  if (!value || typeof value !== 'object') return null;

  if (/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(topic)) {
    const body = value as { addr?: unknown; service_data?: Record<string, unknown> };
    const service = body.service_data;
    if (typeof body.addr !== 'string' || !service || service.encryption !== false || service.BTHome_version !== 2 || typeof service.window !== 'number' || !Number.isFinite(service.window)) return null;
    if (service.window !== 0 && service.window !== 1) return null;
    try {
      const address = normalizeBleAddress(body.addr);
      if (address !== normalizeBleAddress(topic)) return null;
      return { deviceAddress: address, state: service.window === 0 ? 'closed' : 'open', occurredAt: null };
    } catch { return null; }
  }

  const body = value as { method?: unknown; params?: Record<string, unknown> };
  if (body.method !== 'NotifyStatus' || !body.params || typeof body.params.ts !== 'number' || !Number.isFinite(body.params.ts) || body.params.ts < 0) return null;
  const entries = Object.entries(body.params).filter(([key]) => key.startsWith('bthomesensor:'));
  if (entries.length !== 1) return null;
  const entry = entries[0];
  if (!entry || !entry[1] || typeof entry[1] !== 'object' || ((entry[1] as any).value !== true && (entry[1] as any).value !== false)) return null;
  const mapping = mappings.find(item => item.gatewayComponent === entry[0]);
  if (!mapping) return null;
  const entryData = entry[1] as { value: boolean; last_updated_ts?: number };
  const timestamp = entryData.last_updated_ts ?? body.params.ts;
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp < 0) return null;
  try { return { deviceAddress: normalizeBleAddress(mapping.deviceAddress), state: entryData.value ? 'open' : 'closed', occurredAt: new Date(timestamp * 1000) }; }
  catch { return null; }
}
