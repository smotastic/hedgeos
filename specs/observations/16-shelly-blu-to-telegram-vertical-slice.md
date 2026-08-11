## Problem Statement

A HedgeOS operator needs the first useful vertical slice of the local-first smart-home platform: a registered Shelly BLU Door/Window device should report contact changes through MQTT, HedgeOS should preserve the incoming evidence and canonical state, and a configured automation should notify the operator through Telegram. Without this slice, device observations, durable state, automation evaluation, and external notification behavior cannot be verified together on the Raspberry Pi deployment target.

## Solution

Build the first BLU-to-Telegram vertical slice across the separate ingestor and automation runner services. The ingestor will consume the configured Shelly gateway MQTT RPC stream, retain every raw transport message, normalize valid registered-device contact observations, maintain a rebuildable device-state projection, and persist state transitions. The automation runner will consume transitions through the PostgreSQL durable handoff, evaluate immutable typed automation revisions, and execute a generated Telegram notification through one configured destination with durable attempts and bounded retries.

The CLI will provide device enrollment and automation management. Docker Compose will provide the acceptance topology with PostgreSQL, Mosquitto, ingestor, and runner. The implementation will remain within the v1 one-home scope and preserve domain independence from infrastructure.

## User Stories

1. As a HedgeOS operator, I want to discover candidate Shelly devices, so that I can identify devices before accepting them.
2. As a HedgeOS operator, I want to explicitly register a BLU Door/Window device, so that only accepted devices participate in HedgeOS behavior.
3. As a HedgeOS operator, I want registered devices to have stable normalized BLE-address identities, so that identity does not depend on mutable names or gateway metadata.
4. As a HedgeOS operator, I want to assign a mutable display name, so that CLI output and notifications are understandable.
5. As a HedgeOS operator, I want to enable and disable registered devices, so that I can control whether future observations affect state and automations without deleting history.
6. As a HedgeOS operator, I want unknown and disabled device messages retained for diagnostics but excluded from normalized state, so that registration remains explicit and safe.
7. As a HedgeOS operator, I want valid BLU contact messages received over MQTT to become canonical observations, so that vendor-specific payloads do not leak into the domain.
8. As a HedgeOS operator, I want malformed, encrypted, ambiguous, unsupported, or invalid messages quarantined as raw records, so that bad input cannot corrupt state.
9. As a HedgeOS operator, I want every received raw transport message retained immutably, so that ingestion decisions can be diagnosed.
10. As a HedgeOS operator, I want valid normalized observations retained immutably, so that contact history can be inspected and projections rebuilt.
11. As a HedgeOS operator, I want the latest known contact state persisted, so that PostgreSQL exposes the current state even when services restart.
12. As a HedgeOS operator, I want a first usable observation to establish state without triggering a notification, so that an unknown baseline is not treated as a real transition.
13. As a HedgeOS operator, I want repeated reports of the same contact state retained without creating transitions, so that notifications represent actual changes rather than reporting noise.
14. As a HedgeOS operator, I want late observations retained without rewinding current state or replaying effects, so that delayed device messages remain truthful history.
15. As a HedgeOS operator, I want contact changes represented as explicit durable transitions, so that the automation runner has a stable handoff input.
16. As a HedgeOS operator, I want the automation runner to consume transitions without importing ingestor code, so that service ownership remains explicit.
17. As a HedgeOS operator, I want delivery to tolerate duplicates and retries, so that at-least-once processing does not create duplicate logical automation executions.
18. As a HedgeOS operator, I want to configure a typed automation for a contact state becoming open, so that a window opening can trigger a notification.
19. As a HedgeOS operator, I want an automation to target one canonical device or all matching registered device/capability types, so that configuration is useful without requiring a general rule language.
20. As a HedgeOS operator, I want automation revisions immutable and auditable, so that edits do not rewrite historical evaluations.
21. As a HedgeOS operator, I want disabled automations and devices to produce no new notification evaluations, so that operational controls take effect predictably.
22. As a HedgeOS operator, I want Telegram notifications generated from typed state-change data, so that messages consistently identify the device, transition, and timestamp.
23. As a HedgeOS operator, I want Telegram credentials supplied only through deployment secrets, so that tokens never enter observations, raw messages, or persisted event data.
24. As a HedgeOS operator, I want notification attempts and outcomes persisted, so that delivery status and failures are inspectable.
25. As a HedgeOS operator, I want transient Telegram failures retried with bounded backoff, so that temporary outages recover without unbounded work.
26. As a HedgeOS operator, I want exhausted failures visible and manually retryable, so that failed notifications are recoverable without creating a new automation evaluation.
27. As a HedgeOS operator, I want replay and projection rebuild operations isolated from live effects, so that recovery does not resend notifications.
28. As a HedgeOS operator, I want the complete slice to run on ARM64 Docker Compose, so that I can operate it on the target Raspberry Pi.
29. As a developer, I want a deterministic captured MQTT gateway fixture and fake Telegram boundary in automated acceptance tests, so that the complete behavior is verifiable without real credentials.
30. As an operator, I want service health checks, migrations, restart recovery, and correlation IDs, so that the deployment is diagnosable and safe to operate.

## Implementation Decisions

- Use separate ingestor and automation runner deployables with PostgreSQL as their durable integration boundary. Neither service imports the other’s application or domain code.
- Keep domain and application modules independent of PostgreSQL, MQTT, Shelly, Telegram, Docker, and logging libraries. Assemble adapters explicitly in composition roots.
- Use the selected v1 TypeScript stack: Node.js 24 LTS, Nx with pnpm, compiled TypeScript and project references, parameterized `pg` queries with versioned migrations, Commander, MQTT.js, grammY, Zod, Pino behind ports, and Vitest.
- Treat MQTT as a generic transport adapter and Shelly/BTHome decoding as the integration adapter. Subscribe to the configured gateway `<topic_prefix>/events/rpc` stream.
- Freeze the exact Shelly BLU Gateway RPC envelope from a captured target-firmware fixture before implementation. Do not infer gateway envelope fields from BTHome BLE bytes alone.
- Retain the complete received bytes/JSON, MQTT topic, gateway identity, receipt timestamp, and correlation identity as raw transport data. Secrets and tokens must never be persisted in raw messages or domain payloads.
- Normalize only validated BLU Door/Window contact observations. The canonical identity is the uppercase colon-separated stable BLE address. Canonical contact state is `open | closed`; state is `unknown` until the first usable observation.
- Reject or quarantine malformed JSON, encrypted BTHome, invalid framing or lengths, unsupported object IDs, missing or ambiguous identity, missing contact data, and invalid contact values. Illuminance, tilt, battery, button events, gateway health, and discovery are outside this slice’s normalized observation contract.
- Keep raw messages and valid observations immutable. Maintain current state as a rebuildable projection and assign monotonic per-device/capability ingestion order; occurrence time and UTC receipt time are both retained.
- The first valid observation establishes state. Only known-to-known changes create deterministic transition records. Late observations remain history but cannot rewind state or trigger effects.
- Implement the PostgreSQL handoff behind application ports with durable transition identities, claim/lease/heartbeat/expiry, acknowledgement, and retry semantics. Preserve ordering within each device/capability stream while allowing independent streams to progress.
- Make automation execution identity unique per transition and automation revision. Replay uses a separate mode/input stream and cannot execute external actions.
- Support one typed state-transition predicate per automation: device/capability type, optional canonical device identity, optional previous state, and required current state. `closed → open` matches “becomes open”; `unknown → open` and `open → open` do not match.
- Store stable automation IDs, operator-facing names, enabled status, and immutable revisions. Edits create new revisions; old revisions remain auditable and do not match future transitions.
- Support one generated Telegram notification action and one installation-level destination. Rendering remains in the Telegram adapter; user templates and arbitrary formatting are not supported.
- Persist logical notifications and every delivery attempt. Use `pending → sending → delivered` with typed retryable/permanent outcomes, bounded exponential backoff with jitter, manual retry as a new attempt for the same logical action, and acknowledged at-least-once duplicate risk after a crash following external acceptance.
- Provide the minimum CLI operations for device discovery, registration, listing, inspection, enable/disable, automation creation/editing, and notification diagnostics. Registration is explicit and idempotent; deletion and pre-registration replay are excluded.
- Provide a Compose topology containing PostgreSQL with a named volume, Mosquitto, ingestor, and automation runner. Use explicit non-destructive migrations, readiness/health checks, pinned ARM64-compatible images, and deployment-provided secrets.

## Testing Decisions

- The highest-value seam is one end-to-end Docker Compose acceptance path: publish the captured gateway MQTT fixture, then verify persisted raw message, normalized observation, state, transition, automation evaluation, notification attempt, and fake Telegram delivery.
- Acceptance coverage must include open-to-closed reversal, duplicate delivery, late observations, disabled/unknown devices, malformed input, service restart recovery, failed Telegram delivery and retry, manual retry, and replay without external side effects.
- Add focused domain tests for typed contact-state transitions and automation predicate matching, asserting only observable behavior: first-observation handling, duplicate suppression, ordering, late-event handling, device targeting, and enabled status.
- Add adapter contract tests for the Shelly/BTHome decoder, MQTT boundary, PostgreSQL repositories/handoff, and Telegram outcome classification. Use the captured gateway envelope as the Shelly contract fixture.
- Use Vitest, with deterministic fake time/IDs where needed. Do not test private implementation details, SQL structure, framework behavior, or vendor library internals.
- Follow the project’s prior art of explicit ports, adapter contract tests, immutable facts plus projections, and Compose-level acceptance verification established by the ADRs and Wayfinder decisions.

## Out of Scope

- Shelly TRV control, scheduled triggers, and device command actions.
- Other device vendors, transports, notification channels, or arbitrary executable actions.
- Illuminance, tilt, battery, button, gateway-health, or general discovery normalization.
- UI, HTTP control APIs, cloud capabilities, multi-home support, multi-user accounts, and runtime plugin installation.
- Compound criteria, custom automation languages, user-defined message templates, scenes, and composed actions.
- Event hubs, internal message buses, automatic retention, backups, rollback, power-loss hardening, and data migration.
- Device deletion and replay of quarantined pre-registration messages.
- Real Telegram delivery in CI; a real test-bot profile is optional and secret-backed.

## Further Notes

The repository is currently a greenfield architecture scaffold. This specification should be converted into implementation tickets before product code is written. The captured gateway envelope is the only remaining adapter-specific fixture prerequisite called out by the cleared Wayfinder map. The complete acceptance path should demonstrate both the product outcome and the durable event semantics required by the project principles.
