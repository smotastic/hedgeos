# ADR-0002: Plugin and Transport Boundaries

- **Status:** Accepted
- **Date:** 2026-08-07

## Context

HedgeOS must support external integrations without coupling the core domain to MQTT, Shelly, Telegram, or vendor-specific payloads. Applications select their capabilities at build time.

## Decision

MQTT is a generic **transport adapter**, not a device integration plugin.

- The MQTT adapter manages broker connectivity, subscriptions, publishing, credentials, reconnects, and transport errors.
- The Shelly plugin interprets Shelly/BTHome topics and payloads and produces canonical HedgeOS observations.
- A Shelly command adapter executes TRV commands through the configured local HTTP/RPC endpoint.
- A Telegram action adapter sends notification messages and reports outcomes.

Plugins are trusted TypeScript packages selected by each application's build-time composition root. They run in-process and are not dynamically installed, upgraded, or sandboxed at runtime in v1.

## v1 plugin capabilities

- Inbound observation decoding
- Device discovery and candidate identification
- Device command execution
- Notification action execution
- Capability and configuration declaration
- Health reporting

The core owns registered devices, capabilities, observations, state projections, commands, automations, and executions. Plugins own vendor-specific protocols and translation only.

## Lifecycle

A plugin is constructed by the composition root, configured, started with its host application, health-checked, and stopped with that application. Plugin compatibility is checked against a versioned HedgeOS plugin API.

Discovery produces candidates. Registration remains a core/CLI operation and is never implicit merely because a message was received.

## Consequences

- MQTT can later be replaced or supplemented by another transport without changing Shelly domain semantics.
- The Shelly plugin can be reused by the ingestor and automation runner for different capabilities.
- The v1 contract is intentionally narrow and does not attempt to define a marketplace or arbitrary third-party sandbox.
