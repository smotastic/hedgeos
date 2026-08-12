import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { AutomationRunner, RandomIdGenerator, SystemClock } from '@hedgeos/application';
import { PostgresAutomationExecutionRepository, PostgresAutomationRepository, PostgresDeviceRepository, PostgresTransitionHandoff, runMigrations, telegramFromEnvironment } from '@hedgeos/infrastructure';

export function createRunner() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const automations = new PostgresAutomationRepository(pool);
  const runner = new AutomationRunner(
    new PostgresTransitionHandoff(pool), automations,
    new PostgresAutomationExecutionRepository(pool), new PostgresDeviceRepository(pool),
    new RandomIdGenerator(), new SystemClock(), telegramFromEnvironment(),
  );
  return { name: 'runner' as const, pool, runner };
}

export async function startRunner() {
  const runtime = createRunner();
  await runMigrations(runtime.pool);
  const intervalMs = Number(process.env.RUNNER_INTERVAL_MS ?? 1000);
  let stopping = false;
  const loop = async () => {
    while (!stopping) {
      await runtime.runner.runOnce({ workerId: process.env.RUNNER_WORKER_ID ?? randomUUID(), now: new Date(), leaseMs: intervalMs * 5 });
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  };
  const done = loop();
  return { ...runtime, stop: async () => { stopping = true; await done; await runtime.pool.end(); } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const runtime = await startRunner();
  const shutdown = async () => { await runtime.stop(); process.exit(0); };
  process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
}
