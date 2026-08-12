# Infrastructure

The default deployment is Docker Compose. Supply secrets from a deployment environment (never commit them):

```sh
export POSTGRES_PASSWORD='a-long-random-password'
export TELEGRAM_BOT_TOKEN='...'
export TELEGRAM_CHAT_ID='...'
docker compose up -d --build
```

PostgreSQL readiness gates the one-shot `migrate` service. Ingestor and runner
start only after migrations complete; migrations are versioned, transactional,
and non-destructive. The ingestor health check is green only after connecting
and subscribing to MQTT. The runner health check performs a database query and
does not depend on ingestor availability.

Configure a gateway/component mapping before starting the ingestor:

```sh
SHELLY_GATEWAY_MAPPINGS='[{"gatewayComponent":"bthomesensor:205","deviceAddress":"7c:c6:b6:7f:52:df"}]' \
  docker compose up -d --build
```

The host ports default to PostgreSQL `5432` and MQTT `1883`. Override them with
`POSTGRES_HOST_PORT` and `MQTT_HOST_PORT` when those ports are already in use.
The services communicate over the Compose network regardless of host-port
overrides.

The ingestor runs migrations before subscribing to MQTT. Raw records include the
original UTF-8 bytes, a delivery key for duplicate suppression, and a quarantine
reason for rejected input. Valid observations and projection updates are
committed atomically in PostgreSQL.

A basic end-to-end smoke test can publish the captured fixture after registering
the mapped device. Configure the device and automation with the CLI first:

```sh
DATABASE_URL="postgresql://hedgeos:$POSTGRES_PASSWORD@localhost:5432/hedgeos" \
  pnpm cli device register --address 7c:c6:b6:7f:52:df --name "Kitchen window"
DATABASE_URL="postgresql://hedgeos:$POSTGRES_PASSWORD@localhost:5432/hedgeos" \
  pnpm cli automation create --name "Window opened" --previous closed --current open
```

```sh
payload=$(python3 -c 'import json; print(json.dumps(json.load(open("docs/fixtures/shelly-blu-gateway-notify-status.json"))["payload"]))')
docker compose exec -T mosquitto mosquitto_pub \
  -h localhost -t shellyblugwg3-b08184a4a9bc/events/rpc -m "$payload"
docker compose exec -T postgres psql -U hedgeos -d hedgeos \
  -c 'SELECT * FROM observations ORDER BY received_at DESC LIMIT 1;'
```
