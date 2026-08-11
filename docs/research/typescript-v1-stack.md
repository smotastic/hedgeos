# HedgeOS v1 TypeScript implementation stack

Research for [Select HedgeOS v1 TypeScript implementation stack and toolchain](https://github.com/smotastic/hedgeos/issues/15), resolved 2026-08-11.

## Recommendation

- **Runtime/deployment:** Node.js 24 LTS (Krypton), TypeScript compiled to JavaScript, and the official `node:24-bookworm-slim` image. Pin the Node image by digest in release deployment; build/test on amd64 and arm64. Node's release index identifies 24.x as LTS, and the official Node image publishes ARM64 variants through Docker Hub's multi-platform image metadata.
- **Workspace/build:** pnpm workspaces, with a small `apps/` and `libs/` monorepo. Use TypeScript project references and `tsc` for compilation; use package `exports` to make boundaries explicit. Do not add a general-purpose task/build orchestrator for v1. Each deployable app has its own image and composition root.
- **Persistence/migrations:** `pg` for PostgreSQL connections and parameterized SQL through repository ports; `node-pg-migrate` for versioned SQL migrations. Keep SQL/adapters in infrastructure packages and keep domain/application packages free of `pg` types. Do not introduce an ORM in v1.
- **CLI:** Commander. CLI commands invoke application use cases; they do not access repositories or vendor clients directly.
- **MQTT:** `mqtt` as the generic MQTT transport adapter. Shelly/BTHome topic and payload decoding remains in the Shelly integration package.
- **Telegram:** `grammy` in the Telegram notification adapter, limited to sending the generated message and translating API failures into the notification port's result.
- **Runtime validation/config:** Zod at all external boundaries (environment/config, decoded MQTT payloads, CLI input, and adapter responses where useful). Configuration is loaded once at each composition root; secrets are never included in raw messages or canonical events.
- **Logging:** Pino behind a small application logging port. Emit structured JSON with correlation/claim identifiers and redact secrets. Domain code uses the port, not Pino.
- **Tests/tooling:** Vitest for unit, integration, and contract tests; TypeScript strict mode; ESLint and Prettier in CI. Adapter contract fixtures should run without live Telegram/MQTT services; PostgreSQL integration tests may use Compose. Keep the captured MQTT fixture as a deterministic acceptance test.
- **Package policy:** pin direct dependency versions via the lockfile, review updates deliberately, and use Node's built-in test runner only for tiny dependency-free smoke tests if needed—not as a second primary test framework.

## Boundary rules

`libs/domain` depends on no infrastructure package. `libs/application` depends on domain and ports only. `libs/ports` contains interfaces for persistence, transport, clock, logging, and notification. `libs/integrations` contains MQTT, Shelly/BTHome, Telegram, and PostgreSQL adapters. `apps/ingestor`, `apps/runner`, and `apps/cli` assemble concrete adapters explicitly. The runner and ingestor share canonical contracts and migration-owned persistence records, but never import one another's application code.

## Alternatives considered

- **Node 22 LTS:** compatible and already common on Raspberry Pi, but Node 24 is the current LTS line and gives a longer support runway for a new v1 build. Keep the runtime version configurable if the deployment image must remain on 22 during rollout.
- **Drizzle/Prisma:** useful higher-level query APIs, but unnecessary for a small schema and would increase coupling between persistence modeling and application code. `pg` plus SQL keeps ownership and query behavior explicit.
- **tsx/ts-node in production:** convenient during development, but compiling with `tsc` gives smaller, deterministic production images and catches package-boundary errors before deployment.
- **Turborepo/Nx:** potentially useful at larger scale, but adds orchestration complexity before the repository has enough packages to need it.
- **Telegraf:** a lower-level Telegram API client is possible; `grammy` provides a maintained typed Telegram Bot API surface while still fitting behind one adapter.

## Primary sources

- Node.js release schedule and release metadata: https://nodejs.org/en/about/previous-releases and https://nodejs.org/dist/index.json
- Official Node Docker image tags and architecture metadata: https://hub.docker.com/_/node and https://hub.docker.com/v2/repositories/library/node/tags/24-bookworm-slim
- TypeScript project references: https://www.typescriptlang.org/docs/handbook/project-references.html
- pnpm workspaces: https://pnpm.io/workspaces
- node-postgres documentation: https://node-postgres.com/
- node-pg-migrate documentation: https://salsita.github.io/node-pg-migrate/
- Commander documentation: https://github.com/tj/commander.js
- MQTT.js documentation: https://github.com/mqttjs/MQTT.js
- grammY documentation: https://grammy.dev/
- Zod documentation: https://zod.dev/
- Pino documentation: https://getpino.io/
- Vitest documentation: https://vitest.dev/
- Docker multi-platform builds: https://docs.docker.com/build/building/multi-platform/

The package-version compatibility check used npm's first-party registry metadata on 2026-08-11: `pg` requires Node >=16, `mqtt` >=16, `grammy` supports Node >=14.13.1, `node-pg-migrate` >=20.11, `vitest` supports Node 20/22/24, and Commander 15 requires Node >=22.12. Node 24 therefore satisfies the selected tools on ARM64; native addon use should be avoided unless an ARM64 build is verified.
