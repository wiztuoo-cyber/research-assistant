import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { nowIso } from '../db/connection.js';
import type {
  ComputeJob,
  ComputeJobInput,
  ComputeJobStatus,
  Device,
  DeviceInput
} from '../domain/types.js';

type Row = Record<string, unknown>;

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function toDevice(row: Row): Device {
  return {
    id: String(row.id),
    name: String(row.name),
    notes: nullableString(row.notes),
    status: row.status as Device['status'],
    created_at: String(row.created_at),
    updated_at: String(row.updated_at)
  };
}

function toComputeJob(row: Row): ComputeJob {
  return {
    id: String(row.id),
    title: String(row.title),
    project: nullableString(row.project),
    device_id: nullableString(row.device_id),
    device_name: nullableString(row.device_name),
    status: row.status as ComputeJobStatus,
    gamma: nullableNumber(row.gamma),
    k_pcm: nullableNumber(row.k_pcm),
    move_rule: nullableString(row.move_rule),
    iteration: row.iteration === null || row.iteration === undefined ? null : Number(row.iteration),
    objective: nullableNumber(row.objective),
    change_value: nullableNumber(row.change_value),
    convergence_note: nullableString(row.convergence_note),
    notes: nullableString(row.notes),
    next_action: nullableString(row.next_action),
    started_at: nullableString(row.started_at),
    completed_at: nullableString(row.completed_at),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at)
  };
}

export function listDevices(db: DatabaseSync): Device[] {
  return db
    .prepare('select * from devices order by name collate nocase asc')
    .all()
    .map((row) => toDevice(row as Row));
}

export function createDevice(
  db: DatabaseSync,
  input: DeviceInput,
  at = nowIso()
): Device {
  const name = input.name.trim();
  if (!name) throw new Error('Device name is required.');
  const id = randomUUID();

  db.prepare(
    `
      insert into devices (id, name, notes, status, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?)
    `
  ).run(id, name, input.notes ?? null, input.status ?? 'active', at, at);

  const row = db.prepare('select * from devices where id = ?').get(id) as Row | undefined;
  if (!row) throw new Error('Failed to create device.');
  return toDevice(row);
}

export function listComputeJobs(db: DatabaseSync): ComputeJob[] {
  return db
    .prepare(
      `
        select compute_jobs.*, devices.name as device_name
        from compute_jobs
        left join devices on devices.id = compute_jobs.device_id
        order by
          case compute_jobs.status
            when 'running' then 0
            when 'queued' then 1
            when 'paused' then 2
            when 'failed' then 3
            when 'completed' then 4
            else 5
          end,
          compute_jobs.updated_at desc
      `
    )
    .all()
    .map((row) => toComputeJob(row as Row));
}

export function createComputeJob(
  db: DatabaseSync,
  input: ComputeJobInput,
  createdBy = 'web',
  at = nowIso()
): ComputeJob {
  const title = input.title.trim();
  if (!title) throw new Error('Compute job title is required.');
  const id = randomUUID();
  const status = input.status ?? 'queued';
  const startedAt = input.startedAt ?? (status === 'running' ? at : null);
  const completedAt = input.completedAt ?? (status === 'completed' ? at : null);

  db.prepare(
    `
      insert into compute_jobs (
        id, title, project, device_id, status, gamma, k_pcm, move_rule, iteration,
        objective, change_value, convergence_note, notes, next_action,
        started_at, completed_at, created_at, updated_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    id,
    title,
    input.project ?? null,
    input.deviceId ?? null,
    status,
    input.gamma ?? null,
    input.kPcm ?? null,
    input.moveRule ?? null,
    input.iteration ?? null,
    input.objective ?? null,
    input.changeValue ?? null,
    input.convergenceNote ?? null,
    input.notes ?? null,
    input.nextAction ?? null,
    startedAt,
    completedAt,
    at,
    at
  );

  db.prepare(
    `
      insert into compute_job_events (id, compute_job_id, event_type, old_value_json, new_value_json, created_by, created_at)
      values (?, ?, 'created', null, ?, ?, ?)
    `
  ).run(randomUUID(), id, JSON.stringify({ title, status }), createdBy, at);

  const job = getComputeJob(db, id);
  if (!job) throw new Error('Failed to create compute job.');
  return job;
}

export function getComputeJob(db: DatabaseSync, id: string): ComputeJob | null {
  const row = db
    .prepare(
      `
        select compute_jobs.*, devices.name as device_name
        from compute_jobs
        left join devices on devices.id = compute_jobs.device_id
        where compute_jobs.id = ?
      `
    )
    .get(id) as Row | undefined;
  return row ? toComputeJob(row) : null;
}

export function updateComputeJob(
  db: DatabaseSync,
  id: string,
  input: Partial<ComputeJobInput>,
  createdBy = 'web',
  at = nowIso()
): ComputeJob {
  const oldJob = getComputeJob(db, id);
  if (!oldJob) throw new Error(`Compute job not found: ${id}`);

  const status = input.status ?? oldJob.status;
  const startedAt =
    input.startedAt !== undefined
      ? input.startedAt
      : oldJob.started_at ?? (status === 'running' ? at : null);
  const completedAt =
    input.completedAt !== undefined
      ? input.completedAt
      : status === 'completed'
        ? oldJob.completed_at ?? at
        : status === 'running'
          ? null
          : oldJob.completed_at;

  db.prepare(
    `
      update compute_jobs
      set title = ?, project = ?, device_id = ?, status = ?, gamma = ?, k_pcm = ?,
          move_rule = ?, iteration = ?, objective = ?, change_value = ?,
          convergence_note = ?, notes = ?, next_action = ?, started_at = ?,
          completed_at = ?, updated_at = ?
      where id = ?
    `
  ).run(
    input.title ?? oldJob.title,
    input.project === undefined ? oldJob.project : input.project,
    input.deviceId === undefined ? oldJob.device_id : input.deviceId,
    status,
    input.gamma === undefined ? oldJob.gamma : input.gamma,
    input.kPcm === undefined ? oldJob.k_pcm : input.kPcm,
    input.moveRule === undefined ? oldJob.move_rule : input.moveRule,
    input.iteration === undefined ? oldJob.iteration : input.iteration,
    input.objective === undefined ? oldJob.objective : input.objective,
    input.changeValue === undefined ? oldJob.change_value : input.changeValue,
    input.convergenceNote === undefined ? oldJob.convergence_note : input.convergenceNote,
    input.notes === undefined ? oldJob.notes : input.notes,
    input.nextAction === undefined ? oldJob.next_action : input.nextAction,
    startedAt,
    completedAt,
    at,
    id
  );

  db.prepare(
    `
      insert into compute_job_events (id, compute_job_id, event_type, old_value_json, new_value_json, created_by, created_at)
      values (?, ?, 'updated', ?, ?, ?, ?)
    `
  ).run(randomUUID(), id, JSON.stringify(oldJob), JSON.stringify(input), createdBy, at);

  const job = getComputeJob(db, id);
  if (!job) throw new Error('Failed to update compute job.');
  return job;
}

export function researchDashboard(db: DatabaseSync): {
  devices: Device[];
  jobs: ComputeJob[];
} {
  return {
    devices: listDevices(db),
    jobs: listComputeJobs(db)
  };
}
