# HedgeOS v1 Project Brief

**Status:** Accepted from Wayfinder session  
**Date:** 2026-08-07

## Product vision

HedgeOS is a local-first smart-home platform for Raspberry Pi installations. It is a platform rather than a personal one-off system: the core provides stable domain and integration boundaries, while applications select capabilities and plugins at build time through composition roots.

The first customer is the project owner. The platform is designed so that future customers could use it, but multi-customer and cloud concerns are not part of v1.

The development process is AI-first and follows the Spec Kit workflow. AI-first describes the development method; it is not a v1 runtime feature.

## First-release scope

HedgeOS v1 supports one home per installation and focuses on two Shelly device use cases:

1. **Shelly BLU Door/Window**
   - Receive observations through MQTT.
   - Normalize open/closed state and available readings.
   - Persist current state and observation history.
   - Trigger a notification when a window opens.

2. **Shelly TRV**
   - Receive observations through MQTT.
   - Persist current state and observation history.
   - Execute scheduled target-temperature commands through the local Shelly HTTP/RPC endpoint.

3. **Automations**
   - Schedule trigger → set TRV target temperature.
   - Window observation trigger → send a Telegram notification.
   - Definitions are stored in PostgreSQL and managed through the CLI.

4. **Operations and management**
   - Device discovery and registration through the CLI.
   - Device state and history are observed through PostgreSQL.
   - Deployment uses Docker Compose on Raspberry Pi.

There is no user interface or HTTP control API required for v1.

## Non-goals

The following are explicitly out of scope for v1:

- Mobile applications
- Cloud SaaS or remote multi-customer hosting
- Multiple homes per installation
- Multi-user accounts and permissions
- Plugin marketplace or runtime plugin installation
- Broad vendor support
- Hedgehome data/configuration migration
- Complex automation designers, scenes, or a general-purpose rule language
- Automatic data retention, backup, rollback, and power-loss hardening
- Internal event hubs, message buses, or pub/sub infrastructure

## Architecture direction

- TypeScript stack.
- Hexagonal architecture with domain and application code independent of infrastructure.
- Service topology is currently:
  - ingestor service
  - automation-runner service
  - CLI application
  - PostgreSQL
  - optional managed Mosquitto broker
- PostgreSQL is the durable integration boundary between services for v1.
- The ingestor and automation runner are independently deployable applications.
- Plugins and features are selected at build time by composition roots.

## Domain vocabulary

- **Raw transport message:** immutable external message as received.
- **Registered device:** device known and enabled by HedgeOS.
- **Device observation:** normalized fact reported by a device.
- **Device state:** current-state projection of observations.
- **Device command:** durable intent to request an action from a device.
- **Automation:** stored trigger and action definition.
- **Automation execution:** durable record of an automation evaluation and its actions.

## Success criteria for v1

- The application stack runs on the target Raspberry Pi through Docker Compose.
- The CLI can register the BLU and TRV devices.
- Raw MQTT messages and normalized observations are persisted in PostgreSQL.
- Current BLU and TRV state can be queried from PostgreSQL.
- A scheduled automation can set the TRV target temperature.
- A window-open observation can produce a Telegram notification.
- Commands, outcomes, and automation executions are persisted.
- Duplicate event processing does not create incorrect state or repeated logical executions.
- Replaying observations can rebuild projections without sending external side effects.
