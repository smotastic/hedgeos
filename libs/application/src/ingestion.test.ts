import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { IngestionService } from './ingestion.js';
import type { IngestionRepositories } from '@hedgeos/ports';
import type { ContactState, NormalizedObservation, RawTransportMessage, StateTransition } from '@hedgeos/domain';

function setup(mapping = [{ gatewayComponent: 'bthomesensor:205', deviceAddress: '7c:c6:b6:7f:52:df' }]) {
  const raws: RawTransportMessage[] = []; const observations: NormalizedObservation[] = []; const transitions: StateTransition[] = [];
  const states = new Map<string, ContactState>(); const occurred = new Map<string, Date>(); const sequences = new Map<string, number>();
  const repositories: IngestionRepositories = {
    devices: { findByAddress: async address => address === '7C:C6:B6:7F:52:DF' ? ({ id:'device', address, displayName:'Door', capability:'contact', status:'enabled', state:'unknown', registeredAt:new Date(), updatedAt:new Date() }) : null },
    raw: { save: async value => { raws.push(value); } },
    observations: { save: async value => { observations.push(value); }, nextSequence: async address => (sequences.set(address, (sequences.get(address) ?? 0) + 1), sequences.get(address)!) },
    state: { getState: async address => ({ state: states.get(address) ?? 'unknown', occurredAt: occurred.get(address) ?? null }), apply: async (address, state, observation) => { states.set(address, state); occurred.set(address, observation.occurredAt); } },
    transitions: { save: async value => { transitions.push(value); } },
  };
  let id = 0;
  const service = new IngestionService(repositories, { now: () => new Date('2026-01-01T00:00:00Z') }, { next: () => `id-${++id}` }, mapping);
  return { service, raws, observations, transitions, states };
}

const gateway = JSON.stringify({ src:'shellyblugwg3-b08184a4a9bc', dst:'shellyblugwg3-b08184a4a9bc/events', method:'NotifyStatus', params:{ ts:1769963293.36, 'bthomesensor:205':{last_updated_ts:1769963293,value:false} } });

describe('Shelly ingestion', () => {
  it('freezes and accepts the captured gateway envelope fixture', async () => {
    const fixture = JSON.parse(readFileSync(resolve('docs/fixtures/shelly-blu-gateway-notify-status.json'), 'utf8'));
    const s = setup();
    const result = await s.service.ingest({
      topic: fixture.mqttTopic,
      payload: JSON.stringify(fixture.payload),
      receivedAt: new Date(fixture.receivedAt),
      gatewayIdentity: fixture.gatewayIdentity,
    });
    expect(result.raw.topic).toBe(fixture.mqttTopic);
    expect(result.raw.gatewayIdentity).toBe(fixture.gatewayIdentity);
    expect(result.raw.payload).toBe(JSON.stringify(fixture.payload));
    expect(result.raw.payloadBytes).toEqual(new TextEncoder().encode(result.raw.payload));
    expect(result.observation).toMatchObject({ deviceAddress: '7C:C6:B6:7F:52:DF', state: 'closed' });
  });

  it('retains the gateway envelope and normalizes mapped contact state', async () => {
    const s = setup();
    const result = await s.service.ingest({ topic:'shellyblugwg3-b08184a4a9bc/events/rpc', payload:gateway, receivedAt:new Date('2026-02-16T17:15:47Z') });
    expect(result.observation).toMatchObject({ deviceAddress:'7C:C6:B6:7F:52:DF', state:'closed', sequence:1 });
    expect(s.raws).toHaveLength(1); expect(s.transitions).toHaveLength(0);
  });
  it('creates transitions only for known state changes', async () => {
    const s = setup(); const topic = '7c:c6:b6:7f:52:df';
    await s.service.ingest({topic, receivedAt:new Date('2026-01-01'), payload:JSON.stringify({addr:topic,service_data:{encryption:false,BTHome_version:2,window:0}})});
    await s.service.ingest({topic, receivedAt:new Date('2026-01-02'), payload:JSON.stringify({addr:topic,service_data:{encryption:false,BTHome_version:2,window:1}})});
    await s.service.ingest({topic, receivedAt:new Date('2026-01-03'), payload:JSON.stringify({addr:topic,service_data:{encryption:false,BTHome_version:2,window:1}})});
    expect(s.transitions).toHaveLength(1); expect(s.transitions[0].previousState).toBe('closed'); expect(s.transitions[0].currentState).toBe('open');
  });
  it('does not rewind state for a late observation', async () => {
    const s = setup(); const topic = '7c:c6:b6:7f:52:df';
    await s.service.ingest({ topic, payload:JSON.stringify({addr:topic,service_data:{encryption:false,BTHome_version:2,window:0}}), receivedAt:new Date('2026-01-01') });
    await s.service.ingest({ topic, payload:JSON.stringify({addr:topic,service_data:{encryption:false,BTHome_version:2,window:1}}), receivedAt:new Date('2026-01-02') });
    await s.service.ingest({ topic, payload:JSON.stringify({addr:topic,service_data:{encryption:false,BTHome_version:2,window:0}}), receivedAt:new Date('2025-12-31') });
    expect(s.states.get('7C:C6:B6:7F:52:DF')).toBe('open');
    expect(s.transitions).toHaveLength(1);
  });

  it('retains malformed and unmapped messages without observations', async () => {
    const s = setup([]);
    await s.service.ingest({ topic:'shellyblugwg3-b08184a4a9bc/events/rpc', payload:'not json', receivedAt:new Date() });
    await s.service.ingest({ topic:'shellyblugwg3-b08184a4a9bc/events/rpc', payload:gateway, receivedAt:new Date() });
    expect(s.raws).toHaveLength(2); expect(s.observations).toHaveLength(0);
    expect(s.raws[0].quarantineReason).toBe('malformed_json');
    expect(s.raws[1].quarantineReason).toBe('unmapped_identity');
  });
});
