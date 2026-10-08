# Test Cases

## Topic and assistant acceptance (2026-10-08)

- TC-TOPIC-001: Migration preserves existing tasks/knowledge; captures preserve exact raw text; repeated request ID is idempotent.
- TC-TOPIC-002: Summary references only real sources and covers every source; malformed/omitting responses preserve old version.
- TC-TOPIC-003: User edit or new capture during generation prevents stale writes.
- TC-TOPIC-004: Version restore creates a new revision and pauses automatic replacement; corrections remain raw sources.
- TC-TOPIC-005: Moving a capture invalidates both topic summaries; explicit assignment is never reclassified.
- TC-TOPIC-006: Disabled AI/no API key makes zero background model calls; new work survives restart.
- TC-TOPIC-007: Two-minute debounce, unchanged topics skipped, failed calls backed off; manual retry supported.
- TC-TOPIC-008: Conservative classification can leave uncertain thoughts unassigned; no task mutation.
- TC-TOPIC-009: Bounded source payload rejects oversized topics explicitly; never silently truncates.
- TC-TOPIC-010: UI capture, source inspection, manual edit, pause/resume and history are usable (Playwright).
- TC-CHAT-001: Conversation reads real tasks and fixed schedules, includes local time and explicit unknowns, and does not mutate plans.
- TC-CHAT-002: Follow-ups use bounded persisted history; source IDs are validated; API failures are shown without fabricated answers.
- TC-CHAT-003: AI-off chat uses local recommendations; AI-off task capture preserves literal title; idea capture never creates tasks.

## Status legend

- Planned: documented, not implemented.
- Automated: covered by automated test.
- Manual: requires manual verification.
- Blocked: cannot be tested until a dependency exists.

## A. Inbox capture

### TC-INBOX-001: Codex captures raw Inbox item

Status: Planned

Scenario:

```text
帮我记一下：明天下午还信用卡。
```

Expected database:

- `inbox_items` has one new row.
- `raw_text` keeps the original content.
- `source = 'codex'`.
- `status = 'new'`.
- `created_at` is set.

Expected API/CLI:

- Inbox list returns this item.

Expected UI:

- Inbox page shows this item.

Automation:

- CLI/API test.
- UI E2E after Web App exists.

### TC-INBOX-002: Web captures raw Inbox item

Status: Planned

Steps:

1. Open Web App Inbox page.
2. Type `想到一个新产品想法，后面再整理`.
3. Submit.

Expected:

- Database row is created with `source = 'web'`.
- Item appears in Inbox without page refresh.
- Original text is unchanged.

Automation:

- Playwright E2E.

### TC-INBOX-003: Processed Inbox item leaves default Inbox

Status: Planned

Steps:

1. Create an Inbox item.
2. Mark it processed.
3. Query default Inbox.

Expected:

- Item status becomes `processed`.
- Default Inbox query excludes it.
- Historical row remains in database.

Automation:

- Service/API test.

## B. Inbox processing and task conversion

### TC-CONVERT-001: Convert Inbox to task

Status: Planned

Input:

```text
明天下午还信用卡
```

Steps:

1. Create Inbox item.
2. Convert it to task with title `还信用卡`.
3. Set deadline/reminder if provided.

Expected database:

- `tasks` has one new row.
- `tasks.source_inbox_id` points to the Inbox item.
- Inbox item status becomes `processed`.
- `task_events` records `converted_from_inbox`.

Expected UI:

- Item leaves Inbox.
- Task appears in the relevant task view.

Automation:

- Service test.
- API test.
- UI E2E later.

### TC-CONVERT-002: Convert Inbox to reference note or trash

Status: Planned

Input:

```text
看到一个文章，之后可能有用
```

Expected:

- Item can be marked as non-task/reference or trashed.
- No task is created unless explicitly requested.
- Raw Inbox row remains auditable.

Automation:

- Service test after reference-note behavior is defined.

## C. Task status and completion

### TC-TASK-001: Complete task

Status: Planned

Steps:

1. Create a task due today.
2. Mark it completed.

Expected database:

- `tasks.status = 'completed'`.
- `completed_at` is set.
- `task_events` records `completed`.

Expected API/UI:

- Task no longer appears in Today active list.
- Completed view can still show it.

Automation:

- Service/API test.
- UI E2E.

### TC-TASK-002: Waiting task is not recommended

Status: Planned

Steps:

1. Create a task with `status = 'waiting'`.
2. Ask for "what should I do now?"

Expected:

- Waiting task is excluded.
- If user explicitly asks for waiting items, it can appear.

Automation:

- Recommendation unit test.

## D. Today, deadline, and planning

### TC-TODAY-001: Deadline today appears in Today

Status: Planned

Steps:

1. Create a task with `deadline_at` today.
2. Query Today.

Expected:

- Task appears in Today.
- Completed/canceled/trash tasks do not appear.

Automation:

- API/service test with fake clock.

### TC-TODAY-002: Future scheduled task does not appear too early

Status: Planned

Steps:

1. Create a task with future `start_at`.
2. Query Today.

Expected:

- Task does not appear in Today unless explicitly marked `today`.

Automation:

- Service test.

### TC-PLAN-001: Plan today's schedule

Status: Planned

Input:

```text
帮我规划一下今天的行程。
```

Expected:

- System lists due-today tasks first.
- Then suggests important next actions.
- It explains tradeoffs.
- It does not silently change task dates without explicit confirmation.

Automation:

- Partly service test for candidate selection.
- Manual/Codex test for final natural-language output.

## E. Context recommendation

### TC-REC-001: Bus context recommends commute-friendly task

Status: Planned

Given:

- Task A: requires computer.
- Task B: can do on commute, estimated 10 minutes.

Input:

```text
我现在在公交上，有 20 分钟，可以做什么？
```

Expected:

- Task B ranks above Task A.
- Explanation mentions commute and time fit.

Automation:

- Recommendation unit test.

### TC-REC-002: Computer context allows computer-required task

Status: Planned

Given:

- Task A requires computer.
- User says they are at computer with 60 minutes.

Expected:

- Computer-required task is eligible.
- Deadline/importance still affect ranking.

Automation:

- Recommendation unit test.

## F. AI suggestions

### TC-AI-001: AI suggests fields without overwriting task

Status: Planned

Input:

```text
下周五下午三点提醒我给房东转账
```

Expected:

- AI suggestion includes possible title, deadline, reminder, context, priority.
- Suggestion is stored in `ai_suggestions`.
- Real task or Inbox fields are unchanged until user accepts.

Automation:

- Mock AI response test.

### TC-AI-002: User accepts AI suggestion

Status: Planned

Steps:

1. Generate AI suggestion for an Inbox item.
2. Accept deadline and reminder.

Expected:

- Task fields update through service layer.
- `ai_suggestions.accepted_at` is set.
- `task_events` records accepted suggestion.

Automation:

- Service/API test.

### TC-AI-003: AI failure is safe

Status: Planned

Given:

- AI provider times out or returns invalid JSON.

Expected:

- Inbox item remains intact.
- Error is visible.
- No partial task corruption occurs.

Automation:

- Mock failure test.

### TC-AI-AUTO-001: AI delegated tasks are scanned and labeled

Status: Automated

Steps:

1. Create active tasks with `delegated_to = 'ai'`.
2. Run AI scan.

Expected:

- Active AI-delegated task titles are prefixed with `[AI]` if missing.
- Already labeled tasks are not double-prefixed.
- Scan output separates ready tasks, future scheduled tasks, and tasks needing user decision.
- Label changes create `task_events` rows.

Automation:

- `tests/aiAutomation.test.ts`.

### TC-AI-AUTO-002: AI scan creates progress and decision reminders

Status: Automated

Steps:

1. Create one ready AI task, one completed AI task, and one AI task needing user decision.
2. Run AI scan reminder sync with a fake provider.

Expected:

- A daily AI progress reminder is created with completed, ready, future, and decision counts.
- Completed-today AI tasks appear in the reminder notes.
- Each decision task gets an individual reminder.
- Reminder upsert uses stable IDs so repeated scans update existing reminders.
- If one Reminder upsert fails, the scan returns failed sync status instead of aborting the whole report.

Automation:

- `tests/aiAutomation.test.ts`.

## G. Reminder sync

### TC-REM-001: Reminder sync creates Apple Reminder mapping

Status: Planned

Steps:

1. Create task with `reminder_at`.
2. Run reminder sync with fake provider.

Expected:

- `reminder_syncs` row is created.
- `sync_status = 'synced'`.
- `external_id` is stored.

Automation:

- Unit/service test with fake provider.

### TC-REM-002: Reminder sync is idempotent

Status: Planned

Steps:

1. Sync a task once.
2. Sync the same task again.

Expected:

- Existing external reminder is reused or updated.
- No duplicate external reminder is created.

Automation:

- Unit/service test with fake provider.

### TC-REM-003: iPhone receives real notification

Status: Manual

Steps:

1. Create a task with reminder time 5 minutes in the future.
2. Sync to Apple Reminders.
3. Confirm the reminder exists in iPhone Reminders.
4. Wait until reminder time.

Expected:

- iPhone receives a system notification.

Notes:

- This cannot be fully automated from the local test suite.
- Record result in `PROJECT_STATUS.md`.

## H. Event log and audit

### TC-EVENT-001: Important changes create task events

Status: Planned

Actions:

- Convert Inbox to task.
- Change status.
- Change deadline.
- Complete task.
- Accept AI suggestion.

Expected:

- Each action creates one `task_events` row.
- Event records old/new values when applicable.
- Event has `created_by`.

Automation:

- Service tests.

### TC-EVENT-002: AI conversation action is traceable

Status: Planned

Scenario:

```text
帮我把这条 Inbox 规划到明天下午。
```

Expected:

- Task update is recorded.
- Event `created_by = 'codex'` or equivalent.
- Optional metadata can store command/source summary.

Automation:

- Service/API test once command metadata exists.

## I. Security and access

### TC-SEC-001: API rejects unauthenticated request

Status: Planned

Steps:

1. Call protected API without token.

Expected:

- Request is rejected.
- No database change occurs.

Automation:

- API test.

### TC-SEC-002: Tailscale phone access

Status: Manual

Steps:

1. Start local app on remote Mac.
2. Connect iPhone through Tailscale.
3. Open Web App URL.
4. Add Inbox item.

Expected:

- Phone can access Web App.
- API requires authentication.
- Created item is stored in SQLite.

## J. Backup and migration

### TC-DB-001: Fresh database can be migrated

Status: Planned

Steps:

1. Delete test database.
2. Run migrations.

Expected:

- All required tables exist.
- `db:check` passes.

Automation:

- `npm run db:check`.

### TC-DB-002: Migration preserves existing Inbox data

Status: Planned

Steps:

1. Create database with previous migration.
2. Add Inbox item.
3. Run next migration.

Expected:

- Inbox item still exists.
- Raw text unchanged.

Automation:

- Migration test after second migration exists.
