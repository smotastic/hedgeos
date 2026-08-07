# ADR-0004: Raspberry Pi Deployment

- **Status:** Accepted
- **Date:** 2026-08-07

## Context

The current target is a Raspberry Pi 4 Model B with 4 GB RAM, ARM64, Debian 13, Docker, and Docker Compose. HedgeOS is local-first and must communicate with devices on the home LAN.

## Decision

HedgeOS v1 is deployed with Docker Compose using:

- PostgreSQL with persistent storage
- Ingestor service
- Automation runner service
- One-shot CLI container/application
- Optional Mosquitto service

Mosquitto is not part of the HedgeOS core. However, it is a runtime dependency for the current Shelly observation path unless an existing MQTT broker is configured. Compose may provide it for a self-contained installation or local testing.

The automation runner must be able to reach the local Shelly HTTP/RPC endpoint. Tailscale is external infrastructure used for remote access and is not managed by HedgeOS v1.

No UI or HTTP control API is deployed in v1.

## Consequences

- Docker image and dependency choices must support ARM64.
- PostgreSQL data must use a persistent Docker volume.
- The deployment remains simple enough for one Raspberry Pi.
- Unbounded event storage is a known deferred operational risk.
- Backup, rollback, power-loss hardening, and automatic retention require future work.
