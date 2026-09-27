import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { nowIso } from '../db/connection.js';
import type { Task, TaskInput, TaskStatus } from '../domain/types.js';
import { getInboxItem, updateInboxStatus } from './inbox.js';
import { recordTaskEvent, withTransaction } from './events.js';
import { enrichTaskInputWithNaturalDates } from './naturalDates.js';

type Row = Record<string, unknown>;

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

export function toTask(row: Row): Task {
  return {
    id: String(row.id),
    title: String(row.title),
    notes: nullableString(row.notes),
    source_inbox_id: nullableString(row.source_inbox_id),
    status: row.status as TaskStatus,
    project_id: nullableString(row.project_id),
    importance: Number(row.importance),
    urgency: Number(row.urgency),
    priority: row.priority as Task['priority'],
    deadline_at: nullableString(row.deadline_at),
    start_at: nullableString(row.start_at),
    reminder_at: nullableString(row.reminder_at),
    repeat_rule: nullableString(row.repeat_rule),
    estimated_minutes: row.estimated_minutes === null ? null : Number(row.estimated_minutes),
    energy_level: row.energy_level as Task['energy_level'],
    delegated_to: nullableString(row.delegated_to),
    waiting_for: nullableString(row.waiting_for),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    completed_at: nullableString(row.completed_at),
    deleted_at: nullableString(row.deleted_at),
    starred: Number(row.starred) === 1,
    requires_computer: row.requires_computer === undefined ? undefined : Number(row.requires_computer),
    requires_phone: row.requires_phone === undefined ? undefined : Number(row.requires_phone),
    requires_internet: row.requires_internet === undefined ? undefined : Number(row.requires_internet),
    requires_quiet: row.requires_quiet === undefined ? undefined : Number(row.requires_quiet),
    can_do_on_commute: row.can_do_on_commute === undefined ? undefined : Number(row.can_do_on_commute),
    can_do_offline: row.can_do_offline === undefined ? undefined : Number(row.can_do_offline),
    location_hint: nullableString(row.location_hint),
    person_hint: nullableString(row.person_hint)
  };
}

function insertRequirements(db: DatabaseSync, taskId: string, input: TaskInput): void {
  const req = input.requirements ?? {};
  db.prepare(
    `
      insert into task_requirements (
        task_id, requires_computer, requires_phone, requires_internet, requires_quiet,
        can_do_on_commute, can_do_offline, location_hint, person_hint, metadata_json
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, null)
    `
  ).run(
    taskId,
    req.requiresComputer ? 1 : 0,
    req.requiresPhone ? 1 : 0,
    req.requiresInternet ? 1 : 0,
    req.requiresQuiet ? 1 : 0,
    req.canDoOnCommute ? 1 : 0,
    req.canDoOffline ? 1 : 0,
    req.locationHint ?? null,
    req.personHint ?? null
  );
}

export function createTask(
  db: DatabaseSync,
  input: TaskInput & { sourceInboxId?: string | null },
  createdBy = 'api',
  at = nowIso(),
  sourceTexts: string[] = []
): Task {
  const normalizedInput = enrichTaskInputWithNaturalDates(input, sourceTexts, at);
  const id = randomUUID();
  db.prepare(
    `
      insert into tasks (
        id, title, notes, source_inbox_id, status, project_id, importance, urgency, priority,
        deadline_at, start_at, reminder_at, repeat_rule, estimated_minutes, energy_level,
        delegated_to, waiting_for, created_at, updated_at, completed_at, deleted_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, null)
    `
  ).run(
    id,
    normalizedInput.title.trim(),
    normalizedInput.notes ?? null,
    normalizedInput.sourceInboxId ?? null,
    normalizedInput.status ?? 'next',
    normalizedInput.projectId ?? null,
    normalizedInput.importance ?? 3,
    normalizedInput.urgency ?? 3,
    normalizedInput.priority ?? 'medium',
    normalizedInput.deadlineAt ?? null,
    normalizedInput.startAt ?? null,
    normalizedInput.reminderAt ?? null,
    normalizedInput.repeatRule ?? null,
    normalizedInput.estimatedMinutes ?? null,
    normalizedInput.energyLevel ?? null,
    normalizedInput.delegatedTo ?? null,
    normalizedInput.waitingFor ?? null,
    at,
    at
  );

  insertRequirements(db, id, normalizedInput);
  recordTaskEvent(db, {
    taskId: id,
    eventType: 'created',
    newValue: { title: normalizedInput.title, sourceInboxId: normalizedInput.sourceInboxId ?? null },
    createdBy,
    at
  });

  const task = getTask(db, id);
  if (!task) throw new Error('Failed to create task.');
  return task;
}

export function convertInboxToTask(
  db: DatabaseSync,
  inboxId: string,
  input: TaskInput,
  createdBy = 'api',
  at = nowIso()
): Task {
  return withTransaction(db, () => {
    const inbox = getInboxItem(db, inboxId);
    if (!inbox) throw new Error(`Inbox item not found: ${inboxId}`);
    if (inbox.status !== 'new') throw new Error(`Inbox item is not new: ${inboxId}`);

    const task = createTask(
      db,
      {
        ...input,
        title: input.title.trim() || inbox.raw_text,
        sourceInboxId: inboxId
      },
      createdBy,
      at,
      [inbox.raw_text]
    );

    updateInboxStatus(db, inboxId, 'processed', at);
    recordTaskEvent(db, {
      taskId: task.id,
      eventType: 'converted_from_inbox',
      newValue: { inboxId, rawText: inbox.raw_text },
      createdBy,
      at
    });
    return getTask(db, task.id) ?? task;
  });
}

export function getTask(db: DatabaseSync, id: string): Task | null {
  const row = db
    .prepare(
      `
        select tasks.*, task_requirements.*
        from tasks
        left join task_requirements on task_requirements.task_id = tasks.id
        where tasks.id = ?
      `
    )
    .get(id) as Row | undefined;
  return row ? toTask(row) : null;
}

export function listTasks(db: DatabaseSync): Task[] {
  return db
    .prepare(
      `
        select tasks.*, task_requirements.*
        from tasks
        left join task_requirements on task_requirements.task_id = tasks.id
        order by tasks.created_at desc
      `
    )
    .all()
    .map((row) => toTask(row as Row));
}

export function completeTask(db: DatabaseSync, taskId: string, createdBy = 'api', at = nowIso()): Task {
  return withTransaction(db, () => {
    const oldTask = getTask(db, taskId);
    if (!oldTask) throw new Error(`Task not found: ${taskId}`);

    db.prepare(
      `
        update tasks
        set status = 'completed', completed_at = ?, updated_at = ?
        where id = ?
      `
    ).run(at, at, taskId);

    recordTaskEvent(db, {
      taskId,
      eventType: 'completed',
      oldValue: { status: oldTask.status, completed_at: oldTask.completed_at },
      newValue: { status: 'completed', completed_at: at },
      createdBy,
      at
    });

    const task = getTask(db, taskId);
    if (!task) throw new Error(`Task not found after completion: ${taskId}`);
    return task;
  });
}

export function updateTaskFields(
  db: DatabaseSync,
  taskId: string,
  fields: Partial<TaskInput>,
  createdBy = 'api',
  at = nowIso()
): Task {
  return withTransaction(db, () => {
    const oldTask = getTask(db, taskId);
    if (!oldTask) throw new Error(`Task not found: ${taskId}`);

    const next = {
      title: fields.title ?? oldTask.title,
      notes: fields.notes === undefined ? oldTask.notes : fields.notes,
      status: fields.status ?? oldTask.status,
      importance: fields.importance ?? oldTask.importance,
      urgency: fields.urgency ?? oldTask.urgency,
      priority: fields.priority ?? oldTask.priority,
      deadlineAt: fields.deadlineAt === undefined ? oldTask.deadline_at : fields.deadlineAt,
      startAt: fields.startAt === undefined ? oldTask.start_at : fields.startAt,
      reminderAt: fields.reminderAt === undefined ? oldTask.reminder_at : fields.reminderAt,
      estimatedMinutes:
        fields.estimatedMinutes === undefined ? oldTask.estimated_minutes : fields.estimatedMinutes
    };

    db.prepare(
      `
        update tasks
        set title = ?, notes = ?, status = ?, importance = ?, urgency = ?, priority = ?,
            deadline_at = ?, start_at = ?, reminder_at = ?, estimated_minutes = ?, updated_at = ?
        where id = ?
      `
    ).run(
      next.title,
      next.notes,
      next.status,
      next.importance,
      next.urgency,
      next.priority,
      next.deadlineAt,
      next.startAt,
      next.reminderAt,
      next.estimatedMinutes,
      at,
      taskId
    );

    recordTaskEvent(db, {
      taskId,
      eventType: 'updated',
      oldValue: oldTask,
      newValue: next,
      createdBy,
      at
    });

    const task = getTask(db, taskId);
    if (!task) throw new Error(`Task not found after update: ${taskId}`);
    return task;
  });
}

export function listTodayTasks(db: DatabaseSync, now = nowIso()): Task[] {
  const day = now.slice(0, 10);
  return db
    .prepare(
      `
        select tasks.*, task_requirements.*
        from tasks
        left join task_requirements on task_requirements.task_id = tasks.id
        where tasks.status not in ('completed', 'canceled', 'trash')
          and (
            tasks.status = 'today'
            or substr(tasks.deadline_at, 1, 10) = ?
          )
        order by
          case when substr(tasks.deadline_at, 1, 10) = ? then 0 else 1 end,
          tasks.importance desc,
          tasks.urgency desc,
          tasks.created_at asc
      `
    )
    .all(day, day)
    .map((row) => toTask(row as Row));
}

export function listActiveTasksWithReminders(db: DatabaseSync): Task[] {
  return db
    .prepare(
      `
        select tasks.*, task_requirements.*
        from tasks
        left join task_requirements on task_requirements.task_id = tasks.id
        where tasks.deleted_at is null
          and tasks.status not in ('completed', 'canceled', 'trash')
          and tasks.reminder_at is not null
          and trim(tasks.reminder_at) != ''
        order by tasks.reminder_at asc, tasks.importance desc, tasks.urgency desc, tasks.created_at asc
      `
    )
    .all()
    .map((row) => toTask(row as Row));
}

export function listAiDelegatedTasks(db: DatabaseSync): Task[] {
  return db
    .prepare(
      `
        select tasks.*, task_requirements.*
        from tasks
        left join task_requirements on task_requirements.task_id = tasks.id
        where tasks.deleted_at is null
          and tasks.status not in ('completed', 'canceled', 'trash')
          and tasks.delegated_to = 'ai'
        order by
          case tasks.status
            when 'today' then 0
            when 'next' then 1
            when 'scheduled' then 2
            when 'someday' then 3
            else 4
          end,
          tasks.urgency desc,
          tasks.importance desc,
          tasks.created_at desc
      `
    )
    .all()
    .map((row) => toTask(row as Row));
}

export function listCompletedAiDelegatedTasksSince(db: DatabaseSync, since: string): Task[] {
  return db
    .prepare(
      `
        select tasks.*, task_requirements.*
        from tasks
        left join task_requirements on task_requirements.task_id = tasks.id
        where tasks.deleted_at is null
          and tasks.status = 'completed'
          and tasks.delegated_to = 'ai'
          and tasks.completed_at is not null
          and tasks.completed_at >= ?
        order by tasks.completed_at desc, tasks.created_at desc
      `
    )
    .all(since)
    .map((row) => toTask(row as Row));
}


export function listPlanningTasks(db: DatabaseSync): Task[] {
  return db
    .prepare(
      `
        select tasks.*, task_requirements.*
        from tasks
        left join task_requirements on task_requirements.task_id = tasks.id
        where tasks.deleted_at is null
          and tasks.status in ('today', 'next', 'scheduled', 'waiting', 'someday')
        order by
          case tasks.status
            when 'today' then 0
            when 'next' then 1
            when 'scheduled' then 1
            when 'waiting' then 2
            when 'someday' then 3
            else 4
          end,
          case tasks.priority
            when 'high' then 0
            when 'medium' then 1
            else 2
          end,
          tasks.importance desc,
          tasks.urgency desc,
          coalesce(tasks.deadline_at, '9999-12-31') asc,
          tasks.created_at asc
      `
    )
    .all()
    .map((row) => toTask(row as Row));
}


export function listCompletedTasks(db: DatabaseSync, limit = 100): Task[] {
  return db
    .prepare(
      `
        select tasks.*, task_requirements.*
        from tasks
        left join task_requirements on task_requirements.task_id = tasks.id
        where tasks.deleted_at is null
          and tasks.status = 'completed'
        order by tasks.completed_at desc, tasks.updated_at desc
        limit ?
      `
    )
    .all(limit)
    .map((row) => toTask(row as Row));
}


export function trashTask(db: DatabaseSync, taskId: string, createdBy = 'api', at = nowIso()): Task {
  return withTransaction(db, () => {
    const oldTask = getTask(db, taskId);
    if (!oldTask) throw new Error(`Task not found: ${taskId}`);

    db.prepare(
      `
        update tasks
        set status = 'trash', deleted_at = ?, updated_at = ?
        where id = ?
      `
    ).run(at, at, taskId);

    recordTaskEvent(db, {
      taskId,
      eventType: 'trashed',
      oldValue: { status: oldTask.status, deleted_at: oldTask.deleted_at },
      newValue: { status: 'trash', deleted_at: at },
      createdBy,
      at
    });

    const task = getTask(db, taskId);
    if (!task) throw new Error(`Task not found after trash: ${taskId}`);
    return task;
  });
}

export function restoreTask(db: DatabaseSync, taskId: string, status: TaskStatus = 'next', createdBy = 'api', at = nowIso()): Task {
  return withTransaction(db, () => {
    const oldTask = getTask(db, taskId);
    if (!oldTask) throw new Error(`Task not found: ${taskId}`);

    db.prepare(
      `
        update tasks
        set status = ?, deleted_at = null, completed_at = null, updated_at = ?
        where id = ?
      `
    ).run(status, at, taskId);

    recordTaskEvent(db, {
      taskId,
      eventType: 'restored',
      oldValue: { status: oldTask.status, deleted_at: oldTask.deleted_at },
      newValue: { status, deleted_at: null },
      createdBy,
      at
    });

    const task = getTask(db, taskId);
    if (!task) throw new Error(`Task not found after restore: ${taskId}`);
    return task;
  });
}
