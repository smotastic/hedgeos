import { Command } from 'commander';
import { Pool } from 'pg';
import { DeviceService, SystemClock, RandomIdGenerator } from '@hedgeos/application';
import { PostgresDeviceRepository } from '@hedgeos/infrastructure';

export function createProgram(service: DeviceService) {
  const program = new Command().name('hedgeos').description('HedgeOS operator CLI');
  const device = program.command('device').description('Manage registered devices');
  device.command('register').requiredOption('--address <ble-address>').requiredOption('--name <display-name>')
    .action(async (options) => { const result=await service.register({address:options.address,displayName:options.name}); console.log(`${result.created?'Registered':'Already registered'} ${format(result.device)}`); });
  device.command('list').action(async()=>{ for(const d of await service.list()) console.log(format(d)); });
  device.command('show <id-or-address>').action(async value=>console.log(format(await service.show(value))));
  device.command('enable <id-or-address>').action(async value=>console.log(`Enabled ${format(await service.enable(value))}`));
  device.command('disable <id-or-address>').action(async value=>console.log(`Disabled ${format(await service.disable(value))}`));
  return program;
}
function format(d: Awaited<ReturnType<DeviceService['show']>>) { return `${d.id}  ${d.displayName}  ${d.address}  ${d.capability}  ${d.status}  state=${d.state}`; }

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const service = new DeviceService(new PostgresDeviceRepository(pool), new SystemClock(), new RandomIdGenerator());
  try { await createProgram(service).parseAsync(); } finally { await pool.end(); }
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch(error=>{ console.error(error instanceof Error ? error.message : error); process.exitCode=1; });
