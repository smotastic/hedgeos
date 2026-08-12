# Infrastructure

The default deployment is Docker Compose:

```sh
docker compose up -d --build
```

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
the mapped device:

```sh
payload=$(python3 -c 'import json; print(json.dumps(json.load(open("docs/fixtures/shelly-blu-gateway-notify-status.json"))["payload"]))')
docker compose exec -T mosquitto mosquitto_pub \
  -h localhost -t shellyblugwg3-b08184a4a9bc/events/rpc -m "$payload"
docker compose exec -T postgres psql -U hedgeos -d hedgeos \
  -c 'SELECT * FROM observations ORDER BY received_at DESC LIMIT 1;'
```
