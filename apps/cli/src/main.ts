import { Command } from 'commander';
import { Pool } from 'pg';
import { AutomationService, DeviceService, SystemClock, RandomIdGenerator } from '@hedgeos/application';
import { PostgresAutomationRepository, PostgresDeviceRepository } from '@hedgeos/infrastructure';
import type { StateTransitionPredicate } from '@hedgeos/domain';

export function createProgram(service: DeviceService, automations?: AutomationService) {
  const program = new Command().name('hedgeos').description('HedgeOS operator CLI');
  const device = program.command('device').description('Manage registered devices');
  device.command('register').requiredOption('--address <ble-address>').requiredOption('--name <display-name>')
    .action(async (options) => { const result=await service.register({address:options.address,displayName:options.name}); console.log(`${result.created?'Registered':'Already registered'} ${format(result.device)}`); });
  device.command('list').action(async()=>{ for(const d of await service.list()) console.log(format(d)); });
  device.command('show <id-or-address>').action(async value=>console.log(format(await service.show(value))));
  device.command('enable <id-or-address>').action(async value=>console.log(`Enabled ${format(await service.enable(value))}`));
  device.command('disable <id-or-address>').action(async value=>console.log(`Disabled ${format(await service.disable(value))}`));
  if (automations) {
    const automation = program.command('automation').description('Manage typed state-transition automations');
    automation.command('create').requiredOption('--name <name>').requiredOption('--current <state>', 'open or closed').option('--previous <state>').option('--device <address>')
      .action(async (options) => console.log(formatAutomation(await automations.create({ name: options.name, predicate: predicate(options) }))));
    automation.command('list').action(async () => { for (const item of await automations.list()) console.log(`${item.id}  ${item.name}  ${item.enabled ? 'enabled' : 'disabled'}  revision=${item.currentRevision}`); });
    automation.command('show <id>').action(async id => console.log(formatAutomation(await automations.show(id))));
    automation.command('enable <id>').action(async id => console.log(formatAutomation(await automations.enable(id))));
    automation.command('disable <id>').action(async id => console.log(formatAutomation(await automations.disable(id))));
    automation.command('revise <id>').requiredOption('--current <state>').option('--previous <state>').option('--device <address>').option('--name <name>')
      .action(async (id, options) => console.log(formatAutomation(await automations.revise(id, { name: options.name, predicate: predicate(options) }))));
  }
  return program;
}
function predicate(options: { current: string; previous?: string; device?: string }): StateTransitionPredicate { return { capability:'contact', currentState: options.current, ...(options.previous ? {previousState: options.previous} : {}), ...(options.device ? {deviceAddress: options.device} : {}) } as StateTransitionPredicate; }
function formatAutomation(value: any) { return `${value.automation.id}  ${value.automation.name}  ${value.automation.enabled ? 'enabled' : 'disabled'}  revision=${value.automation.currentRevision ?? value.revision?.revision}`; }
function format(d: Awaited<ReturnType<DeviceService['show']>>) { return `${d.id}  ${d.displayName}  ${d.address}  ${d.capability}  ${d.status}  state=${d.state}`; }

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const clock = new SystemClock();
  const ids = new RandomIdGenerator();
  const service = new DeviceService(new PostgresDeviceRepository(pool), clock, ids);
  const automations = new AutomationService(new PostgresAutomationRepository(pool), clock, ids);
  try { await createProgram(service, automations).parseAsync(); } finally { await pool.end(); }
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch(error=>{ console.error(error instanceof Error ? error.message : error); process.exitCode=1; });
