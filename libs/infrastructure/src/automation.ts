import type { Pool } from 'pg';
import type {
  Automation, AutomationExecution, AutomationRevision, LogicalNotificationAction, StateTransition,
} from '@hedgeos/domain';
import type {
  AutomationExecutionRepository, AutomationRepository, NotificationAttempt, TransitionClaim, TransitionHandoff,
} from '@hedgeos/ports';

const mapAutomation = (row: any): Automation => ({
  id: row.id, name: row.name, enabled: row.enabled, currentRevision: row.current_revision,
  createdAt: row.created_at, updatedAt: row.updated_at,
});
const mapRevision = (row: any): AutomationRevision => ({
  id: row.id, automationId: row.automation_id, revision: row.revision,
  predicate: { capability: row.capability, ...(row.device_address ? { deviceAddress: row.device_address } : {}), ...(row.previous_state ? { previousState: row.previous_state } : {}), currentState: row.current_state },
  createdAt: row.created_at,
});
const mapTransition = (row: any): StateTransition => ({
  id: row.id, observationId: row.observation_id, deviceAddress: row.device_address,
  capability: row.capability, previousState: row.previous_state, currentState: row.current_state,
  occurredAt: row.occurred_at, sequence: Number(row.sequence),
});

export class PostgresAutomationRepository implements AutomationRepository {
  constructor(private readonly pool: Pool) {}
  async create(input: { automation: Automation; revision: AutomationRevision }) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO automations (id,name,enabled,current_revision,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6)', [input.automation.id,input.automation.name,input.automation.enabled,input.automation.currentRevision,input.automation.createdAt,input.automation.updatedAt]);
      await this.insertRevision(client, input.revision);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  async list() { const r = await this.pool.query('SELECT * FROM automations ORDER BY name, id'); return r.rows.map(mapAutomation); }
  async findById(id: string) { const r = await this.pool.query('SELECT * FROM automations WHERE id=$1', [id]); return r.rows[0] ? mapAutomation(r.rows[0]) : null; }
  async currentRevision(id: string) { const r = await this.pool.query('SELECT r.* FROM automation_revisions r JOIN automations a ON a.id=r.automation_id WHERE r.automation_id=$1 AND r.revision=a.current_revision', [id]); return r.rows[0] ? mapRevision(r.rows[0]) : null; }
  async listEnabledWithCurrentRevisions() { const r = await this.pool.query('SELECT a.*, r.id revision_id, r.automation_id revision_automation_id, r.revision revision_number, r.capability, r.device_address, r.previous_state, r.current_state, r.created_at revision_created_at FROM automations a JOIN automation_revisions r ON r.automation_id=a.id AND r.revision=a.current_revision WHERE a.enabled ORDER BY a.id'); return r.rows.map(row => ({ automation: mapAutomation(row), revision: mapRevision({ ...row, id: row.revision_id, automation_id: row.revision_automation_id, revision: row.revision_number, created_at: row.revision_created_at }) })); }
  async setEnabled(id: string, enabled: boolean, updatedAt: Date) { const r = await this.pool.query('UPDATE automations SET enabled=$2,updated_at=$3 WHERE id=$1 RETURNING *', [id,enabled,updatedAt]); if (!r.rows[0]) throw new Error(`Automation not found: ${id}`); return mapAutomation(r.rows[0]); }
  async addRevision(automation: Automation, revision: AutomationRevision) { const client = await this.pool.connect(); try { await client.query('BEGIN'); await client.query('UPDATE automations SET name=$2,current_revision=$3,updated_at=$4 WHERE id=$1', [automation.id,automation.name,automation.currentRevision,automation.updatedAt]); await this.insertRevision(client, revision); await client.query('COMMIT'); } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); } }
  private async insertRevision(client: { query: (sql: string, params?: unknown[]) => Promise<unknown> }, revision: AutomationRevision) { await client.query('INSERT INTO automation_revisions (id,automation_id,revision,capability,device_address,previous_state,current_state,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [revision.id,revision.automationId,revision.revision,revision.predicate.capability,revision.predicate.deviceAddress ?? null,revision.predicate.previousState ?? null,revision.predicate.currentState,revision.createdAt]); }
}

export class PostgresTransitionHandoff implements TransitionHandoff {
  constructor(private readonly pool: Pool) {}
  async claim(input: { workerId: string; now: Date; leaseMs: number; limit?: number }): Promise<TransitionClaim[]> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(`SELECT h.*, t.* FROM transition_handoff h JOIN state_transitions t ON t.id=h.transition_id WHERE h.acknowledged_at IS NULL AND h.available_at <= $1 AND (h.lease_until IS NULL OR h.lease_until < $1) AND NOT EXISTS (SELECT 1 FROM transition_handoff earlier_h JOIN state_transitions earlier_t ON earlier_t.id=earlier_h.transition_id WHERE earlier_h.acknowledged_at IS NULL AND earlier_t.device_address=t.device_address AND earlier_t.capability=t.capability AND earlier_t.sequence < t.sequence) ORDER BY t.device_address,t.capability,t.sequence FOR UPDATE SKIP LOCKED LIMIT $2`, [input.now, input.limit ?? 50]);
      const leaseUntil = new Date(input.now.getTime() + input.leaseMs);
      const claims: TransitionClaim[] = [];
      for (const row of result.rows) {
        await client.query('UPDATE transition_handoff SET claimed_by=$2,lease_until=$3,attempt_count=attempt_count+1 WHERE transition_id=$1', [row.transition_id,input.workerId,leaseUntil]);
        claims.push({ claimId: row.transition_id, workerId: input.workerId, transition: mapTransition(row), attempt: Number(row.attempt_count) + 1, leaseUntil });
      }
      await client.query('COMMIT'); return claims;
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  async heartbeat(claimId: string, workerId: string, now: Date, leaseMs: number) { const r = await this.pool.query('UPDATE transition_handoff SET lease_until=$4 WHERE transition_id=$1 AND claimed_by=$2 AND acknowledged_at IS NULL AND lease_until > $3', [claimId,workerId,now,new Date(now.getTime()+leaseMs)]); return r.rowCount === 1; }
  async acknowledge(claimId: string, workerId: string, now: Date) { const r = await this.pool.query('UPDATE transition_handoff SET acknowledged_at=$3,lease_until=NULL WHERE transition_id=$1 AND claimed_by=$2 AND acknowledged_at IS NULL', [claimId,workerId,now]); return r.rowCount === 1; }
  async retry(claimId: string, workerId: string, now: Date, availableAt: Date, reason: string) { const r = await this.pool.query('UPDATE transition_handoff SET available_at=$3,lease_until=NULL,last_error=$4 WHERE transition_id=$1 AND claimed_by=$2 AND acknowledged_at IS NULL', [claimId,workerId,availableAt,reason]); return r.rowCount === 1; }
  async expire(now: Date) { const r = await this.pool.query('UPDATE transition_handoff SET claimed_by=NULL,lease_until=NULL WHERE acknowledged_at IS NULL AND lease_until < $1', [now]); return r.rowCount ?? 0; }
}

const mapExecution = (row: any): AutomationExecution => ({ id:row.id, transitionId:row.transition_id, automationId:row.automation_id, automationRevisionId:row.automation_revision_id, mode:row.mode, status:row.status, createdAt:row.created_at, updatedAt:row.updated_at });
const mapAction = (row: any): LogicalNotificationAction => ({ id:row.id, executionId:row.execution_id, type:row.action_type, status:row.status, createdAt:row.created_at, updatedAt:row.updated_at, ...(row.failure_reason ? { failureReason:row.failure_reason } : {}) });

export class PostgresAutomationExecutionRepository implements AutomationExecutionRepository {
  constructor(private readonly pool: Pool) {}
  async findByIdentity(transitionId: string, automationRevisionId: string, mode: 'live'|'replay') { const r=await this.pool.query('SELECT * FROM automation_executions WHERE transition_id=$1 AND automation_revision_id=$2 AND mode=$3',[transitionId,automationRevisionId,mode]); return r.rows[0] ? mapExecution(r.rows[0]) : null; }
  async create(execution: AutomationExecution) { const r=await this.pool.query('INSERT INTO automation_executions (id,transition_id,automation_id,automation_revision_id,mode,status,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (transition_id,automation_revision_id,mode) DO NOTHING RETURNING *',[execution.id,execution.transitionId,execution.automationId,execution.automationRevisionId,execution.mode,execution.status,execution.createdAt,execution.updatedAt]); return { execution:r.rows[0] ? mapExecution(r.rows[0]) : (await this.findByIdentity(execution.transitionId,execution.automationRevisionId,execution.mode))!, created:r.rowCount===1 }; }
  async createAction(action: LogicalNotificationAction) { const r=await this.pool.query('INSERT INTO logical_notification_actions (id,execution_id,action_type,status,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (execution_id,action_type) DO NOTHING RETURNING *',[action.id,action.executionId,action.type,action.status,action.createdAt,action.updatedAt]); const existing=r.rows[0] ? mapAction(r.rows[0]) : (await this.pool.query('SELECT * FROM logical_notification_actions WHERE execution_id=$1 AND action_type=$2',[action.executionId,action.type])).rows[0]; return { action: r.rows[0] ? mapAction(r.rows[0]) : mapAction(existing), created:r.rowCount===1 }; }
  async updateExecution(id:string,status:'recorded'|'failed',updatedAt:Date,reason?:string){await this.pool.query('UPDATE automation_executions SET status=$2,updated_at=$3,failure_reason=$4 WHERE id=$1',[id,status,updatedAt,reason??null]);}
  async updateAction(id:string,status:'pending'|'sending'|'delivered'|'suppressed'|'failed',updatedAt:Date,reason?:string){await this.pool.query('UPDATE logical_notification_actions SET status=$2,updated_at=$3,failure_reason=$4 WHERE id=$1',[id,status,updatedAt,reason??null]);}
  async findAction(id:string){const r=await this.pool.query('SELECT * FROM logical_notification_actions WHERE id=$1',[id]); return r.rows[0] ? mapAction(r.rows[0]) : null;}
  async createAttempt(attempt: NotificationAttempt){await this.pool.query('INSERT INTO notification_attempts (id,action_id,attempt_number,status,created_at,completed_at,failure_reason) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (action_id,attempt_number) DO NOTHING',[attempt.id,attempt.actionId,attempt.attemptNumber,attempt.status,attempt.createdAt,attempt.completedAt??null,attempt.failureReason??null]);}
  async updateAttempt(id:string,status:NotificationAttempt['status'],completedAt:Date,reason?:string){await this.pool.query('UPDATE notification_attempts SET status=$2,completed_at=$3,failure_reason=$4 WHERE id=$1',[id,status,completedAt,reason??null]);}
  async listAttempts(actionId?: string){const r=await this.pool.query('SELECT * FROM notification_attempts '+(actionId?'WHERE action_id=$1 ':'')+'ORDER BY created_at',actionId?[actionId]:[]); return r.rows.map(row=>({id:row.id,actionId:row.action_id,attemptNumber:row.attempt_number,status:row.status,createdAt:row.created_at,...(row.completed_at?{completedAt:row.completed_at}:{}),...(row.failure_reason?{failureReason:row.failure_reason}:{})}));}
  async list(){const r=await this.pool.query('SELECT * FROM automation_executions ORDER BY created_at');return r.rows.map(mapExecution);}
  async listActions(){const r=await this.pool.query('SELECT * FROM logical_notification_actions ORDER BY created_at');return r.rows.map(mapAction);}
}
