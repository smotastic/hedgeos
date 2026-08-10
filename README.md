# HedgeOS

HedgeOS is a greenfield, local-first smart-home platform for Raspberry Pi.

## Status

The repository is currently in architecture and product discovery. Wayfinder establishes the destination and resolves the decisions needed before implementation begins.

## Workflow

```text
Wayfinder → to-spec → to-tickets → implementation → review
```

## Repository layout

- `docs/brief/` — approved product and project briefs
- `docs/architecture/` — architecture documentation and ADRs
- `specs/` — implementation specifications produced after Wayfinder
- `apps/` — deployable applications and composition roots
- `libs/` — reusable domain, application, adapter, and shared code
- `tools/` — development tooling and generators
- `infra/` — deployment and operational configuration
- `docs/project-principles.md` — project-wide engineering principles
