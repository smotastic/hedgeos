# ADR-0003: Persistence and Event Semantics

- **Status:** Accepted
- **Date:** 2026-08-07

## Context

The ingestor and automation runner must coordinate reliably through PostgreSQL. Device messages may be duplicated, delayed, or retried, and device state must remain distinguishable from user or automation intent.

## Decision

PostgreSQL is the durable persistence and integration boundary for v1.

The system persists:

- Raw transport messages as immutable inbox records.
- Normalized device observations as immutable facts.
- Current device state as a mutable projection.
- Device commands as durable intent records.
- Command outcomes as execution results.
- Automation executions and notification attempts.

A domain model does not depend directly on tables. Repositories and ports isolate the domain from PostgreSQL, but v1 persistence includes records for commands and outcomes.

## Processing semantics

- Processing is at-least-once.
- Consumers must be idempotent.
- The automation runner uses a monotonic observation cursor or claim mechanism rather than timestamps alone.
- Ordering is guaranteed per device/capability stream, not globally.
- Events carry both occurrence time and receipt time.
- All persisted timestamps use UTC.
- Schedule evaluation uses an explicit installation timezone.

## Command semantics

A command represents intent, not observed state. Its initial lifecycle is:

```text
requested → succeeded
          ↘ failed
```

A successful transport response does not itself update device state. A later device observation remains the source of truth.

## Replay and retention

Replay may rebuild state projections and history, but must never resend device commands or notifications. Automatic retention and deletion are deferred from v1.

## Deferred event hub

No internal event hub, push subscription mechanism, or pub/sub broker is implemented in v1. If required later, it may be introduced behind application ports without changing the canonical observation and command semantics.
