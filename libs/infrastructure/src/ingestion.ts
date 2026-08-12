import type { Pool } from 'pg';
import { applyObservation, type ContactState, type NormalizedObservation, type RawTransportMessage, type StateTransition } from '@hedgeos/domain';
import type { IngestionRepositories } from '@hedgeos/ports';
import { PostgresDeviceRepository } from './index.js';

export class PostgresIngestionRepositories implements IngestionRepositories {
  readonly devices: IngestionRepositories['devices'];

  constructor(private readonly pool: Pool) {
    const deviceRepository = new PostgresDeviceRepository(pool);
    this.devices = { findByAddress: address => deviceRepository.findByAddress(address) };
  }

  readonly raw = {
    save: async (message: RawTransportMessage) => {
      await this.pool.query(
        `INSERT INTO raw_transport_messages
         (id, topic, payload, payload_bytes, gateway_identity, received_at, correlation_id, delivery_key, quarantine_reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (delivery_key) DO NOTHING`,
        [message.id, message.topic, message.payload, Buffer.from(message.payloadBytes), message.gatewayIdentity,
          message.receivedAt, message.correlationId, message.deliveryKey, message.quarantineReason],
      );
    },
    saveIfNew: async (message: RawTransportMessage) => {
      const result = await this.pool.query(
        `INSERT INTO raw_transport_messages
         (id, topic, payload, payload_bytes, gateway_identity, received_at, correlation_id, delivery_key, quarantine_reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (delivery_key) DO NOTHING`,
        [message.id, message.topic, message.payload, Buffer.from(message.payloadBytes), message.gatewayIdentity,
          message.receivedAt, message.correlationId, message.deliveryKey, message.quarantineReason],
      );
      return result.rowCount === 1;
    },
  };

  readonly observations = {
    nextSequence: async (deviceAddress: string) => {
      const result = await this.pool.query<{ next_sequence: string }>(
        `INSERT INTO observation_sequences (device_address, next_sequence)
         VALUES ($1, 1)
         ON CONFLICT (device_address) DO UPDATE
         SET next_sequence = observation_sequences.next_sequence + 1
         RETURNING next_sequence`, [deviceAddress],
      );
      return Number(result.rows[0].next_sequence);
    },
    save: async (observation: NormalizedObservation) => {
      await this.pool.query(
        `INSERT INTO observations
         (id, raw_message_id, device_address, capability, state, occurred_at, received_at, sequence)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO NOTHING`,
        [observation.id, observation.rawMessageId, observation.deviceAddress, observation.capability,
          observation.state, observation.occurredAt, observation.receivedAt, observation.sequence],
      );
    },
    commitObservation: async (observation: NormalizedObservation, transitionId: string) => {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO observations (id, raw_message_id, device_address, capability, state, occurred_at, received_at, sequence)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
          [observation.id, observation.rawMessageId, observation.deviceAddress, observation.capability,
            observation.state, observation.occurredAt, observation.receivedAt, observation.sequence],
        );
        const current = await client.query<{ state: ContactState; last_observation_occurred_at: Date | null }>(
          'SELECT state, last_observation_occurred_at FROM devices WHERE address = $1 FOR UPDATE', [observation.deviceAddress],
        );
        const row = current.rows[0];
        const result = applyObservation({
          currentState: row?.state ?? 'unknown', currentOccurredAt: row?.last_observation_occurred_at,
          observation, transitionId,
        });
        if (result.accepted) {
          await client.query(
            `UPDATE devices SET state=$2,last_observation_sequence=$3,last_observation_occurred_at=$5,updated_at=$4 WHERE address=$1`,
            [observation.deviceAddress, result.state, observation.sequence, observation.receivedAt, observation.occurredAt],
          );
          if (result.transition) {
            await client.query(
              `INSERT INTO state_transitions (id,observation_id,device_address,capability,previous_state,current_state,occurred_at,sequence)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
              [result.transition.id, result.transition.observationId, result.transition.deviceAddress, result.transition.capability,
                result.transition.previousState, result.transition.currentState, result.transition.occurredAt, result.transition.sequence],
            );
          }
        }
        await client.query('COMMIT');
        return { accepted: result.accepted, transition: result.transition };
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
  };

  readonly state = {
    getState: async (deviceAddress: string): Promise<{ state: ContactState; occurredAt: Date | null }> => {
      const result = await this.pool.query<{ state: ContactState; last_observation_occurred_at: Date | null }>(
        'SELECT state, last_observation_occurred_at FROM devices WHERE address = $1', [deviceAddress],
      );
      return result.rows[0] ? { state: result.rows[0].state, occurredAt: result.rows[0].last_observation_occurred_at } : { state: 'unknown', occurredAt: null };
    },
    apply: async (deviceAddress: string, state: ContactState, observation: NormalizedObservation) => {
      await this.pool.query(
        `UPDATE devices
         SET state = $2, last_observation_sequence = $3, last_observation_occurred_at = $5, updated_at = $4
         WHERE address = $1
           AND last_observation_sequence < $3
           AND (last_observation_occurred_at IS NULL OR last_observation_occurred_at < $5)`,
        [deviceAddress, state, observation.sequence, observation.receivedAt, observation.occurredAt],
      );
    },
  };

  readonly transitions = { save: async (transition: StateTransition) => {
    await this.pool.query(
      `INSERT INTO state_transitions
       (id, observation_id, device_address, capability, previous_state, current_state, occurred_at, sequence)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO NOTHING`,
      [transition.id, transition.observationId, transition.deviceAddress, transition.capability,
        transition.previousState, transition.currentState, transition.occurredAt, transition.sequence],
    );
  }};

}
