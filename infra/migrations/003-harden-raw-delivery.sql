ALTER TABLE raw_transport_messages ADD COLUMN IF NOT EXISTS payload_bytes bytea;
UPDATE raw_transport_messages SET payload_bytes = convert_to(payload, 'UTF8') WHERE payload_bytes IS NULL;
ALTER TABLE raw_transport_messages ALTER COLUMN payload_bytes SET NOT NULL;

ALTER TABLE raw_transport_messages ADD COLUMN IF NOT EXISTS delivery_key text;
UPDATE raw_transport_messages SET delivery_key = id::text WHERE delivery_key IS NULL;
ALTER TABLE raw_transport_messages ALTER COLUMN delivery_key SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS raw_transport_messages_delivery_key_idx ON raw_transport_messages (delivery_key);

ALTER TABLE raw_transport_messages ADD COLUMN IF NOT EXISTS quarantine_reason text;
