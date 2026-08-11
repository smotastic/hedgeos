import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
export default defineConfig({ resolve: { alias: {
  '@hedgeos/domain': resolve(__dirname, 'libs/domain/src/index.ts'),
  '@hedgeos/ports': resolve(__dirname, 'libs/ports/src/index.ts'),
  '@hedgeos/application': resolve(__dirname, 'libs/application/src/index.ts'),
  '@hedgeos/infrastructure': resolve(__dirname, 'libs/infrastructure/src/index.ts')
} } });
