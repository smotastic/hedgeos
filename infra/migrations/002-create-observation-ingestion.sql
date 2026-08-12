CREATE TABLE IF NOT EXISTS raw_transport_messages (
  id uuid PRIMARY KEY,
  topic text NOT NULL,
  payload text NOT NULL,
  payload_bytes bytea NOT NULL,
  gateway_identity text,
  received_at timestamptz NOT NULL,
  correlation_id text NOT NULL,
  delivery_key text NOT NULL UNIQUE,
  quarantine_reason text
);

CREATE TABLE IF NOT EXISTS observation_sequences (
  device_address varchar(17) PRIMARY KEY,
  next_sequence bigint NOT NULL CHECK (next_sequence > 0)
);

ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_observation_sequence bigint NOT NULL DEFAULT 0;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_observation_occurred_at timestamptz;

CREATE TABLE IF NOT EXISTS observations (
  id uuid PRIMARY KEY,
  raw_message_id uuid NOT NULL REFERENCES raw_transport_messages(id),
  device_address varchar(17) NOT NULL,
  capability text NOT NULL CHECK (capability = 'contact'),
  state text NOT NULL CHECK (state IN ('open', 'closed')),
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL,
  sequence bigint NOT NULL,
  UNIQUE (device_address, capability, sequence)
);

CREATE TABLE IF NOT EXISTS state_transitions (
  id uuid PRIMARY KEY,
  observation_id uuid NOT NULL UNIQUE REFERENCES observations(id),
  device_address varchar(17) NOT NULL,
  capability text NOT NULL CHECK (capability = 'contact'),
  previous_state text NOT NULL CHECK (previous_state IN ('open', 'closed')),
  current_state text NOT NULL CHECK (current_state IN ('open', 'closed')),
  occurred_at timestamptz NOT NULL,
  sequence bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS observations_device_sequence_idx ON observations (device_address, capability, sequence);
CREATE INDEX IF NOT EXISTS raw_transport_messages_received_at_idx ON raw_transport_messages (received_at);
