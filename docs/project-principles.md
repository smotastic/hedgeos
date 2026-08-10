# HedgeOS Project Principles

These principles govern implementation decisions and reviews. Wayfinder decisions,
the project brief, ADRs, specifications, and implementation work should remain
consistent with them. If a new Wayfinder decision conflicts with a principle,
record the conflict and resolve it explicitly before implementation.

## Core Principles

### I. Domain Independence and Hexagonal Boundaries

The domain and application layers MUST remain independent of PostgreSQL, MQTT,
Shelly, Telegram, Docker, and other infrastructure concerns. Dependencies MUST
point inward through explicit ports; infrastructure MUST be implemented by
adapters at composition roots. This preserves testability and allows transports
and integrations to change without rewriting domain behavior.

### II. Composition-Root Assembly

Deployable applications MUST assemble their features, adapters, and plugins at
build time through explicit composition roots. Runtime plugin installation,
marketplaces, and arbitrary dynamic loading are prohibited for v1. Reusable
domain, application, port, and integration capabilities MUST be organized as
independently testable modules. This keeps the platform configurable without
introducing runtime packaging complexity.

### III. Explicit Service and Data Ownership

The ingestor and automation runner MUST remain separate deployable applications
in v1. The ingestor owns raw transport messages, normalized observations, and
state projections. The automation runner owns automation executions, commands,
command outcomes, and notification attempts. Services MUST NOT import one
another's application or domain code. PostgreSQL is the shared durable
integration boundary; an internal event hub or message bus is not permitted in
v1.

### IV. Durable and Truthful Event Semantics

Raw transport messages and normalized observations MUST be persisted as
immutable records. Current device state MUST be a rebuildable projection.
Processing MUST tolerate at-least-once delivery through idempotent consumers and
per-device or per-capability ordering. A device command MUST represent intent,
not observed state; only a later device observation can establish actual state.
Replay MUST NOT repeat external side effects. These rules prevent duplicate,
late, or retried messages from corrupting state or issuing unintended actions.

### V. Contract-Driven Integrations

Plugins and transport adapters MUST expose explicit, versioned contracts and
MUST keep vendor-specific protocols outside the core domain. MQTT is a generic
transport adapter; Shelly is a device integration; Telegram is a notification
action adapter. Plugin implementations MUST provide contract tests for supported
capabilities, configuration, discovery, observations, commands, and failures.
The core MUST model canonical capabilities rather than vendor payload shapes.

### VI. Verifiable Delivery

Every implementation slice MUST have testable acceptance scenarios before
implementation. Implementations MUST include automated tests for domain behavior
and relevant integration boundaries. Changes to plugin contracts, persistence
schemas, service handoffs, and shared event semantics MUST include integration or
contract coverage. A slice is not complete until its acceptance scenarios and
principle obligations are verified.

### VII. Deliberate V1 Scope

Implementation MUST remain within the accepted HedgeOS v1 brief unless the brief
or an ADR is explicitly amended. The first release is limited to one home per
installation, Shelly BLU Door/Window and Shelly TRV use cases, CLI management,
PostgreSQL-observable state, scheduled TRV automation, and window-open Telegram
notifications. New vendors, UI surfaces, cloud capabilities, multi-home
support, complex automation, and event-hub infrastructure MUST be treated as
separate future decisions rather than incidental additions.

## Additional Constraints

- The implementation MUST use TypeScript and support the ARM64 Raspberry Pi
deployment target.
- Docker Compose MUST be the initial deployment mechanism.
- PostgreSQL MUST provide v1 durable persistence.
- Mosquitto MAY be managed by Compose or supplied externally, but the current
Shelly observation path requires an MQTT broker.
- The CLI is the v1 management interface. No UI or HTTP control API is required.
- Tailscale is external infrastructure and is not part of the HedgeOS runtime.
- Secrets MUST be supplied through deployment configuration or a secret
mechanism and MUST NOT be written into raw messages, observations, or event
payloads.
- Automatic retention, backup, rollback, power-loss hardening, and hedgehome
data migration are outside v1 and MUST NOT be introduced as implicit scope.

## Working Agreement

1. Use `/wayfinder` for a multi-session effort whose destination is known but
whose route is still uncertain.
2. Keep Wayfinder tickets focused on decisions, research, prototypes, or
unblocking tasks. Do not implement product code while the map is open.
3. When a map is cleared, use `/to-spec`, then `/to-tickets`, then `/implement`.
4. For work that fits in one session, use `/grill-with-docs` or `/grill-me` and
then hand off to `/to-spec` as appropriate.
5. Record durable architecture decisions as ADRs and keep the project brief as
the product-scope source of truth.
6. Keep composition roots explicit, and give each selected plugin or adapter a
defined contract and test strategy.
7. Reviews must verify acceptance scenarios, data and service ownership, event
semantics, plugin boundaries, and deployment constraints.

## Governance

These principles are the project's governance baseline. Amendments require a
documented rationale, an explicit review decision, and a version change. Major
versions cover backward-incompatible principle removals or redefinitions; minor
versions cover new principles or materially expanded governance; patch versions
cover clarifications and non-semantic wording changes.
