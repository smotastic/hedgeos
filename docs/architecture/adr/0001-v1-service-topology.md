# ADR-0001: v1 Service Topology

- **Status:** Accepted
- **Date:** 2026-08-07

## Context

HedgeOS runs on one Raspberry Pi and initially serves one home. The system must separate inbound device ingestion from automation execution, while avoiding unnecessary distributed infrastructure.

## Decision

HedgeOS v1 uses the following applications:

- **Ingestor service:** consumes transport messages, persists raw messages, normalizes observations, and maintains current-state projections.
- **Automation runner service:** consumes persisted observations, evaluates schedules and observation triggers, executes commands and notifications, and records outcomes.
- **CLI application:** performs discovery, registration, configuration, automation management, and diagnostics through application use cases.
- **PostgreSQL:** shared durable persistence and service integration boundary.

The ingestor and automation runner are separate deployable services. No internal event hub, message broker, or direct service-to-service application-code dependency is introduced in v1.

## Data ownership

- The ingestor owns raw transport messages, normalized observations, and device-state projections.
- The automation runner owns automation executions, device commands, command outcomes, and notification attempts.
- Device and automation configuration is managed through application use cases invoked by the CLI.

Services may read the persisted data needed for their use cases, but do not import one another's application or domain code.

## Consequences

### Positive

- Ingestion failure and automation failure are isolated.
- The service boundary reflects an important operational distinction.
- PostgreSQL provides a simple durable handoff without another broker.
- Services can be extracted or reorganized later without changing the domain model.

### Negative

- The automation runner must poll or claim new observations.
- Delivery latency depends on the polling interval.
- Shared database schema ownership must remain disciplined.
- A future event hub may be needed if push delivery or higher scale becomes necessary.
