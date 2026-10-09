# Task Breakdown

## TASK-0910: v0.2.10 usability corrections

Requirements: independent knowledge cards grouped by category (no mind map), atomic AI points with titles and source retention; point editing; restore all-task/calendar split with persisted resizing; remove inline agenda date inputs; inline detail title editing on both surfaces. User explicitly authorized automatic organization. Acceptance: TC-0910..0912 in TEST_CASES.md. No schema change; structured points stay versioned JSON.

## Approved v0.2.9 implementation

TASK-0901..0905 and TC-0901..0905 are specified in REDESIGN_029.md. Implemented with local automated verification; real-provider and native-window acceptance remain manual.

## 2026-10-08: Confirmed usability redesign

Status: Implemented; automated coverage passed. Windows shell interactions and live model quality require manual acceptance.

- TASK-0801: Three pages, explicit capture modes, Enter submission with IME guard, knowledge library and editable topic metadata. TC-UX-001..003.
- TASK-0802: Local-day countdowns, previous unfinished plans, read-only query intent, single-task completion and guarded undo. TC-UX-004..006.
- TASK-0803: Main-window entry from widget, tray, second instance and Ctrl+Alt+M with collision notice. TC-UX-007.
- User approved implementation after reviewing the interaction proposal. One consolidated remote update; GitHub builds the installer.

## 2026-10-08: Personal assistant expansion

- TASK-0701: Topic captures, immutable originals, versioned summaries, corrections and restore. Acceptance: TC-TOPIC-001..005.
- TASK-0702: Opt-in background organization with batching, restart recovery, bounded context and retries. Acceptance: TC-TOPIC-006..009.
- TASK-0703: Read-only contextual assistant, task/schedule capture entry, topic UI. Acceptance: TC-CHAT-001..003, TC-TOPIC-010.
- Status: Implemented; local automated checks passed, live model quality remains a manual acceptance item. The user explicitly authorized automatic topic organization; generated summaries remain labeled AI output and never change tasks or schedules.

## Principle

Each task should produce a working, testable slice.

Do not start a task unless its acceptance cases are clear.

## Phase 0: Test and project skeleton

### TASK-0001: Create project skeleton

Status: Completed

Acceptance cases:

- TC-DB-001 can be implemented.
- Regression commands exist, even if some are smoke tests.

Deliverables:

- `package.json`
- TypeScript config.
- Test setup.
- Empty app/server skeleton.

### TASK-0002: Add migration runner and db check

Status: Completed

Acceptance cases:

- TC-DB-001.

Deliverables:

- Migration folder.
- `db:check` command.
- Temporary database test.

## Phase 1: Inbox core

### TASK-0101: Inbox database table

Status: Completed

Acceptance cases:

- TC-INBOX-001 database expectations.
- TC-DB-001.

Deliverables:

- `inbox_items` migration.
- Database test.

### TASK-0102: Inbox service

Status: Completed

Acceptance cases:

- TC-INBOX-001.
- TC-INBOX-003.

Deliverables:

- `captureInbox`.
- `listInbox`.
- `processInbox`.
- Service tests.

### TASK-0103: Inbox CLI

Status: Completed

Acceptance cases:

- TC-INBOX-001 API/CLI expectations.
- TC-INBOX-003.

Deliverables:

- CLI add/list/process commands.
- CLI tests.

### TASK-0104: Inbox API

Status: Completed

Acceptance cases:

- TC-INBOX-001.
- TC-INBOX-003.
- TC-SEC-001 if auth exists in this phase.

Deliverables:

- `POST /api/inbox`.
- `GET /api/inbox`.
- `PATCH /api/inbox/:id`.
- API tests.

### TASK-0105: Inbox Web UI

Status: Completed

Acceptance cases:

- TC-INBOX-002.

Deliverables:

- Inbox page.
- Add form.
- List.
- Playwright test.

## Phase 2: Task conversion

### TASK-0201: Task and event tables

Status: Completed

Acceptance cases:

- TC-CONVERT-001 database expectations.
- TC-EVENT-001.

Deliverables:

- `tasks` migration.
- `task_events` migration.
- Migration tests.

### TASK-0202: Convert Inbox to task service

Status: Completed

Acceptance cases:

- TC-CONVERT-001.

Deliverables:

- Atomic conversion service.
- Event creation.
- Service tests.

### TASK-0203: Complete task service

Status: Completed

Acceptance cases:

- TC-TASK-001.
- TC-EVENT-001.

Deliverables:

- `completeTask`.
- Service/API tests.

## Phase 3: Views and recommendation

### TASK-0301: Today query

Status: Completed

Acceptance cases:

- TC-TODAY-001.
- TC-TODAY-002.

Deliverables:

- Today service query.
- API endpoint.
- Tests with fake clock.

### TASK-0302: Recommendation engine v1

Status: Completed

Acceptance cases:

- TC-REC-001.
- TC-REC-002.
- TC-TASK-002.

Deliverables:

- Recommendation scoring function.
- Explanation output.
- Unit tests.

## Phase 4: AI suggestions

### TASK-0401: AI suggestions table and mock provider

Status: Completed

Acceptance cases:

- TC-AI-001.
- TC-AI-003.

Deliverables:

- `ai_suggestions` migration.
- Mock AI provider.
- Tests.

### TASK-0402: Accept AI suggestion

Status: Completed

Acceptance cases:

- TC-AI-002.
- TC-EVENT-001.

Deliverables:

- Accept suggestion service.
- Event logging.
- Tests.

## Phase 5: Reminder sync

### TASK-0501: Reminder sync schema and fake provider

Status: Completed

Acceptance cases:

- TC-REM-001.
- TC-REM-002.

Deliverables:

- `reminder_syncs` migration.
- Fake provider.
- Idempotency tests.

### TASK-0502: Apple Reminders manual sync

Status: Not started

Acceptance cases:

- TC-REM-003 manual.

Deliverables:

- Manual sync command.
- Documentation.
- Manual verification result in `PROJECT_STATUS.md`.

### TASK-0503: AI delegated task scan and reminder digest

Status: Completed

Acceptance cases:

- TC-AI-AUTO-001.
- TC-AI-AUTO-002.

Deliverables:

- `ai scan` CLI command that prefixes AI-delegated tasks with `[AI]`.
- AI scan report split into ready, future scheduled, needs-decision, and completed-today groups.
- Reminder digest sync for daily progress and individual decision prompts.
- LaunchAgent installer for recurring scans with Reminder sync enabled.

## Phase 6: Phone access

### TASK-0601: API auth

Status: Completed

Acceptance cases:

- TC-SEC-001.

Deliverables:

- Token-based auth.
- API tests.

### TASK-0602: Tailscale phone verification

Status: Not started

Acceptance cases:

- TC-SEC-002 manual.

Deliverables:

- Tailscale access note.
- Manual verification result.

## TASK-0913..0915: v0.2.11 approved workflow
- TASK-0913 / TC-0913: seven horizontal weekday rows, all days including empty ones, existing left tasks, week navigation, drop-to-plan preserves deadlines and time, dot/bar colors and completion/details retained.
- TASK-0914 / TC-0914: remove new-note toolbar, group old and new cards together, drag individual card into existing category with undo and concurrent-edit guard; old content remains manual-only. No new-category or record-thought toolbar buttons.
- TASK-0915 / TC-0915: assistant conversational event/weekly review with task facts, bounded relevant notes, short optional followups, editable saved review, separate history, explicit idempotent knowledge/task export, reuse saved reviews in future answers. Local fallback must not invent causes. Migration for reviews, no destructive changes.

## TASK-0916 / TC-0916: category directory and creation
Create persistent empty categories from bottom of sticky sidebar, rename with transactional reassignment preserving content/sources; reject blank/duplicate target names. Existing implicit categories included with counts. Sidebar lists all categories, click scrolls without filtering, scrolling highlights current section, drag onto directory reuses guarded card-move/undo. Test service persistence/rename/validation and E2E create empty/reload/drop/undo/rename/navigation. No new top toolbar creation buttons.
