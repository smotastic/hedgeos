import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { IngestionService, RandomIdGenerator, SystemClock, type ShellyGatewayMapping } from '@hedgeos/application';
import { MqttTransport, PostgresIngestionRepositories, runMigrations } from '@hedgeos/infrastructure';

export interface IngestorRuntime {
  readonly pool: Pool;
  readonly transport: MqttTransport;
  readonly service: IngestionService;
  stop(): Promise<void>;
}

const readyFile = process.env.INGESTOR_READY_FILE ?? '/tmp/hedgeos-ingestor-ready';

function mappingsFromEnvironment(value = process.env.SHELLY_GATEWAY_MAPPINGS): ShellyGatewayMapping[] {
  if (!value) return [];
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error('SHELLY_GATEWAY_MAPPINGS must be a JSON array');
  return parsed.map((item: any) => {
    if (typeof item?.gatewayComponent !== 'string' || typeof item?.deviceAddress !== 'string') {
      throw new Error('Each gateway mapping requires gatewayComponent and deviceAddress');
    }
    return { gatewayComponent: item.gatewayComponent, deviceAddress: item.deviceAddress };
  });
}

export function createIngestor(): IngestorRuntime {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const repositories = new PostgresIngestionRepositories(pool);
  const service = new IngestionService(
    repositories,
    new SystemClock(), new RandomIdGenerator(), mappingsFromEnvironment(),
  );
  const transport = new MqttTransport({
    url: process.env.MQTT_URL ?? 'mqtt://localhost:1883',
    topic: process.env.MQTT_TOPIC ?? '+/events/rpc',
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    clientId: process.env.MQTT_CLIENT_ID ?? `hedgeos-ingestor-${randomUUID()}`,
  });
  return { pool, transport, service, stop: async () => {
    await transport.stop();
    await pool.end();
    const { unlink } = await import('node:fs/promises');
    await unlink(readyFile).catch(() => undefined);
  } };
}

export async function startIngestor(): Promise<IngestorRuntime> {
  const runtime = createIngestor();
  await runMigrations(runtime.pool);
  await runtime.transport.start(message => runtime.service.ingest(message).then(() => undefined));
  const { writeFile } = await import('node:fs/promises');
  await writeFile(readyFile, 'ready\n');
  return runtime;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const runtime = await startIngestor();
  const shutdown = async () => { await runtime.stop(); process.exit(0); };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
