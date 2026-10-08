# Database Design

## Topic extension (migration 0007)

`thought_topics`: unique title, monotonically increasing revision, current summary/version, pause flag, dirty/debounce timestamp and retry status. `thought_captures`: immutable raw text, timestamp, optional topic assignment and idempotency key. `thought_versions`: append-only summary snapshots with structured source references. `assistant_preferences`: persisted AI and automatic organization flags. `assistant_messages`: bounded-context conversation history (stored locally). All writes go through services; compare-and-swap revision guards protect concurrent edits. Existing knowledge tables are preserved.

## Goals

The database should be simple, inspectable, and resilient to change.

Design goals:

- Preserve raw Inbox input forever unless explicitly deleted.
- Separate raw captures from processed tasks.
- Support GTD views without complex queries.
- Store AI suggestions separately from user-accepted fields.
- Keep enough event history for future personal analytics.
- Make Apple Reminders sync idempotent.
- Allow future migration to another database if needed.

## Storage decisions

- Database: SQLite.
- IDs: text UUIDs.
- Timestamps: ISO 8601 UTC text, for example `2026-05-17T10:30:00Z`.
- Soft delete: use status fields and `deleted_at` where useful.
- Schema changes: migration files only.
- Foreign keys: enabled.

## Core tables

### inbox_items

Raw capture items.

Fields:

- `id`
- `raw_text`
- `source`: codex, web, shortcut, api, import
- `status`: new, processing, processed, trashed
- `created_at`
- `updated_at`
- `processed_at`
- `metadata_json`

Why separate from tasks:

- Some Inbox items are not tasks.
- AI and user processing may change the interpretation.
- We need to preserve what the user originally said.

### tasks

Actionable tasks.

Fields:

- `id`
- `title`
- `notes`
- `source_inbox_id`
- `status`: inbox, next, today, scheduled, waiting, someday, completed, canceled, trash
- `project_id`
- `importance`: 1-5
- `urgency`: 1-5
- `priority`: low, medium, high
- `deadline_at`
- `start_at`
- `reminder_at`
- `repeat_rule`
- `estimated_minutes`
- `energy_level`: low, medium, high
- `delegated_to`
- `waiting_for`
- `created_at`
- `updated_at`
- `completed_at`
- `deleted_at`

Notes:

- A task converted from Inbox links back through `source_inbox_id`.
- `status` powers major views.
- `deadline_at` is the hard due date.
- `start_at` controls when a scheduled task becomes visible.
- `reminder_at` controls reminder delivery.

### projects

Multi-step outcomes.

Fields:

- `id`
- `name`
- `description`
- `status`: active, waiting, someday, completed, archived
- `goal_id`
- `created_at`
- `updated_at`
- `completed_at`

### goals

Higher-level areas or outcomes.

Fields:

- `id`
- `name`
- `description`
- `status`: active, archived
- `created_at`
- `updated_at`

### contexts

User-facing contexts such as computer, commute, home, office.

Fields:

- `id`
- `name`
- `description`
- `kind`: place, tool, energy, person, time, custom
- `created_at`
- `updated_at`

### task_contexts

Many-to-many join table.

Fields:

- `task_id`
- `context_id`

### tags

Flexible labels.

Fields:

- `id`
- `name`
- `created_at`

### task_tags

Many-to-many join table.

Fields:

- `task_id`
- `tag_id`

### task_requirements

Structured conditions needed to do a task.

Fields:

- `task_id`
- `requires_computer`
- `requires_phone`
- `requires_internet`
- `requires_quiet`
- `can_do_on_commute`
- `can_do_offline`
- `location_hint`
- `person_hint`
- `metadata_json`

Why this is separate:

- Recommendation queries need these fields often.
- It avoids stuffing all conditions into unqueryable notes.

### ai_suggestions

AI-generated suggestions that have not necessarily been accepted.

Fields:

- `id`
- `target_type`: inbox_item, task, project
- `target_id`
- `provider`
- `model`
- `prompt_version`
- `suggestion_json`
- `accepted_at`
- `rejected_at`
- `created_at`

Rule:

- AI suggestions do not overwrite user data directly.
- Accepted suggestions must update real tables through normal service functions.

### task_events

Append-only history for audit and analytics.

Fields:

- `id`
- `task_id`
- `event_type`
- `old_value_json`
- `new_value_json`
- `created_by`: user, codex, api, ai
- `created_at`

Important event types:

- created
- converted_from_inbox
- status_changed
- deadline_changed
- reminder_changed
- completed
- postponed
- delegated
- ai_suggestion_accepted

### reminder_syncs

Mapping between local tasks and external reminder systems.

Fields:

- `id`
- `task_id`
- `provider`: apple_reminders, telegram, email
- `external_id`
- `sync_status`: pending, synced, failed, disabled
- `last_synced_at`
- `last_error`
- `created_at`
- `updated_at`

Why needed:

- Prevent duplicate Apple Reminders.
- Track failed sync.
- Allow multiple future reminder channels.

## Suggested first migration

First migration should include only:

- `inbox_items`
- `tasks`
- `task_events`

Do not create all tables immediately if they are not used. Add the rest when the related feature is implemented.

## View/query design

### Inbox

```sql
select *
from inbox_items
where status = 'new'
order by created_at desc;
```

### Today

Tasks should appear in Today if:

- `status = 'today'`, or
- `deadline_at` is today and task is not completed/canceled/trash.

### Scheduled

Tasks should appear in Scheduled if:

- `start_at` is in the future, or
- `status = 'scheduled'`.

### Waiting

Tasks should appear in Waiting if:

- `status = 'waiting'`, or
- `waiting_for` is not null.

### Recommendation candidates

Exclude:

- completed
- canceled
- trash
- waiting, unless explicitly requested
- tasks with future `start_at`, unless deadline is urgent

Then rank by:

- overdue or due today
- importance
- urgency
- context match
- estimated time fit
- repeated postponement

## Migration rules

- Every schema change gets a migration file.
- Never edit old migration files after they have been applied.
- Add nullable columns first, backfill, then make behavior depend on them.
- Keep migration tests or `db:check` command to ensure a fresh database can be created.

## Backup rules

Before destructive migrations:

- Copy the SQLite file.
- Export key tables to JSON.
- Run migration on a test database first.

