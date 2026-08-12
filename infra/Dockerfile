FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.base.json nx.json vitest.config.ts ./
COPY apps ./apps
COPY libs ./libs
COPY infra ./infra
RUN pnpm install --frozen-lockfile
RUN pnpm typecheck

FROM node:24-bookworm-slim
WORKDIR /app
RUN corepack enable
COPY --from=build /app ./
ENV NODE_ENV=production
