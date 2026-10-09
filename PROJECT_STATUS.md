# Project Status

Last updated: 2026-10-09

## v0.2.11 review workflow and seven-day rows

TASK-0913..0915 / TC-0913..0915 implemented. Week widget keeps all unfinished tasks left and renders seven horizontal weekday rows right, including empty dates; week navigation, today highlighting, dot/color/cross-day badges, native drag-to-plan, completion and details retained. Rescheduling preserves deadlines and existing task time.

Knowledge library has only search in its toolbar, no new-category/new-note/record-thought buttons. Legacy and current cards share category groups. Individual cards can be dragged into existing categories with guarded undo. Old content is not automatically migrated or rewritten. Manual point category locks survive later AI organization; conflicting locked categories preserve the previous version with an explicit error rather than overwriting classification.

Assistant supports event/task and current-week reviews, task-detail entry, separate review history, bounded task/note snapshots, previous relevant reviews, short AI followups and editable review cards. Without AI, user descriptions are retained without invented reasons. Saving review, saving experience and creating a task are separate actions. Explicit exports and review creation are idempotent; revisions guard concurrent AI responses/edits. Saved reviews are retrievable in subsequent AI answers. Migration 0010 adds reviews and export links; originals retained. No scheduled/background review generation was added.

Validation: 81 service/unit/API tests and 11 Edge E2E flows; lint, db:check and build pass. Visual review of seven rows and review screen completed. Real model quality and native installed Windows behavior require user acceptance; cloud packaging tracked by PR #2.

## v0.2.10 corrections

TASK-0910 / TC-0910..0912: independent knowledge cards grouped by category, map removed. Existing structured points each display separately without rewriting originals. Card title/body/category/subcategory edits create guarded versions, preserve other points and source links, and pause AI rewriting. AI now receives atomic-point instructions and existing card titles for semantic reuse; actual model classification quality remains provider-dependent. Legacy manual prose without structured points remains one readable card until explicitly reorganized. Originals/history and screenshot provenance retained.

Weekly widget restores all unfinished tasks on left (including outside the selected week), FullCalendar on right, persisted adjustable splitter. Dragging an already scheduled task preserves its deadline and left card; temporary drag previews now tolerate incomplete event metadata. Agenda inline date inputs removed. Both detail surfaces support click-title editing with Enter/save, Escape, IME and blank-title validation. No schema change.

Local validation: 77 service/API/unit tests, 8 Edge E2E flows, lint, db:check and production build. Screenshot review of split calendar and independent knowledge cards completed. Final cloud CI and Windows installer verification pending.

## v0.2.9 unified assistant, knowledge and calendar

TASK-0901..0905 implemented against TC-0901..0905 (REDESIGN_029.md).

- Unified composer: two mutually exclusive thought/task toggles, neither means read-only chat; mode drafts retained, Enter/IME handling retained, newest exchanges first.
- Category/topic/chapter knowledge structure with Markmap navigation and sanitized Markdown reading. AI may create missing categories, respects explicit category hints, merges repeated claims with all supporting sources, and preserves conditions/conflicts. Original material remains stored; source metadata and screenshots are available in a collapsed Sources section.
- Metadata edit/move and topic merge support guarded undo; manual summary revisions remain recoverable and pause automatic rewriting. Backdrop/Escape close checks unsaved changes.
- Knowledge retrieval searches stored originals and legacy knowledge, returns bounded relevant evidence to the same assistant and persists validated references with each answer. Retrieval is lexical (including Chinese bigrams), not a claim of exhaustive semantic search. Missing evidence must be disclosed.
- Paste/drop/upload PNG/JPEG/WebP images, local deduplication and extraction cache. A separately configured HTTPS chat-completions-compatible vision endpoint/model/key is required. No claim that the existing text model supports images. Real vision/provider quality remains manual acceptance; source URLs are supplied by the user, not guessed or automatically crawled.
- Task page uses today/upcoming/unplanned groups without category navigation; overdue and unfinished past plans remain distinct. Today order is draggable; dates directly editable. Main opens the week widget. Fixed events can be edited/completed/canceled with guarded undo.
- FullCalendar weekly grid: single-day dots, explicit cross-day bars, category color defaults and task color overrides. Dragging tasks changes plan dates only; previous/next/today navigation and unscheduled drag-in are available.
- Migration 0009 adds source/image metadata, topic archive flag, answer references and item presentation metadata; originals and old tables preserved.
- Local checks: 76 unit/service/API tests, 6 Edge E2E flows, TypeScript, db:check and production build passed during implementation. Final exact-head GitHub checks and Windows packaging tracked in PR #2.
- Manual acceptance: actual native Windows window/shortcut behavior, real provider image parsing and nuanced classification/summary quality. Phone share extensions and live social-post crawling are not implemented; desktop accepts copied text, URLs and screenshots.

Previous release:

## v0.2.8 usability redesign

TASK-0801..0803 implemented; coverage TC-UX-001..007.

- Three pages: tasks, assistant, searchable knowledge library. Topic details support sources, history, append, title/category and note/skill/SOP metadata.
- Explicit modes and separate drafts; Enter submits, Ctrl+Enter inserts newline, IME selection is protected.
- Removed standalone recruitment/waiting/event panels without deleting data. Events remain inline; tasks show countdowns and previous unfinished plans.
- All-unfinished queries use the full local list without AI. Global task questions ignore selected notes. Completion affects only the clicked task; guarded undo covers completion, trash, archive and source moves.
- Main window entry through widget button, tray click, repeated launch and Ctrl+Alt+M; Ctrl+Alt+A retains widget behavior.
- Verification: lint, db:check and production build passed; 69 unit/service/API tests and 5 Edge E2E tests passed during implementation. Final CI and Windows packaging run in PR #2.
- Manual acceptance remains for actual Windows tray/shortcut behavior and real DeepSeek semantic quality. No production personal data was used in tests.

Earlier version notes follow.

## Current Windows extension: v0.2.7

TASK-0701, TASK-0702 and TASK-0703 implemented. Earlier Mac-first notes below are historical.

- New assistant panel in the main screen and week widget: read-only conversation, explicit thought capture and task/schedule capture.
- Topic originals, conservative automatic grouping, source-linked summaries, revisions, manual corrections, restore, and moving sources. Existing knowledge can be copied explicitly into a topic.
- Persistent AI/auto-organization controls shared with widget; two-minute idle batching; 30-second pending-work checks recover after restart. No model calls when AI is off or content is unchanged. Failed organization retains the prior version and backs off for 30 minutes. Uncertain/failed classification stays in the visible unassigned list with manual retry.
- User edits and restores pause automatic replacement. Manual edits are retained as source evidence when organization resumes. Revision checks discard stale AI results.
- Chat uses current task dates, steps, points, schedules, selected topic originals and bounded recent history. It offers advice without modifying plans.
- New migration 0007; service/API tests in topics.test.ts and assistantChat.test.ts; Playwright coverage in assistant.spec.ts. Acceptance IDs: TC-TOPIC-001..010, TC-CHAT-001..003.
- Local verification: TypeScript passed; 60 tests passed; 3 Playwright E2E tests passed using installed Edge; production build and db:check passed. Fixed pre-existing Windows CLI test launching and synchronized the previously incomplete dependency lockfile.
- User requested GitHub-hosted builds/downloads instead of further local packaging. Local packaging stopped. Windows workflow now also runs on pull requests targeting feature/research-dashboard; remote build results tracked with the PR.

Known limits / manual acceptance:

- Real DeepSeek semantic quality is not certified by mock-provider tests. Try uncertainty, competing alternatives and corrections with representative notes.
- Only changed topics are sent, but each changed topic is rebuilt from original sources (not recursively summarized). A 60,000-character serialized source cap fails visibly and asks to split the topic; no silent truncation. This trades some tokens for source fidelity.
- Chat context includes at most 100 deadline-first tasks, 40 relevant schedules and 10 recent messages; omissions are disclosed to the model. Plans still require explicit user action through capture/edit flows.
- Automatic work requires the app running. Closing/reopening recovers pending work. Existing production user data and API keys were not used in testing.

## Current phase

MVP implementation complete for local development and automated testing.

The project is ready for user-level manual acceptance testing.

## Confirmed decisions

- Build a local-first personal task manager inspired by Doit.im/GTD.
- Data source of truth: SQLite on the remote Mac.
- Current AI entry: Codex/GPT conversation.
- Visual entry: local Web App accessed from phone through Tailscale.
- AI analysis: manual trigger first, no automatic background analysis in MVP.
- Reminder delivery: do not rely on remote Mac notifications; prefer Apple Reminders/iCloud bridge.
- First version should build a small custom core, not fork a full existing task manager.
- Reuse small libraries/tools where useful, such as date parsing and Reminders integration.

## Completed planning docs

- `PRODUCT_BRIEF.md`
- `REQUIREMENTS.md`
- `ACCESS_OPTIONS.md`
- `REMINDER_STRATEGY.md`
- `OPEN_SOURCE_RESEARCH.md`
- `ENGINEERING_PLAN.md`
- `DATABASE_DESIGN.md`
- `ACCEPTANCE_TESTS.md`
- `TEST_STRATEGY.md`
- `TEST_CASES.md`
- `AI_DEVELOPMENT_WORKFLOW.md`
- `DEVELOPMENT_PROCESS.md`
- `AGENTS.md`
- `TASK_BREAKDOWN.md`

## Implemented

- TypeScript/Vite/React/Express project skeleton.
- SQLite migrations and `db:check`.
- Inbox capture, listing, processing.
- Inbox-to-task conversion.
- Task completion.
- Today query.
- Recommendation engine v1.
- AI suggestion storage and explicit acceptance flow.
- Reminder sync framework with fake provider.
- AI-delegated task scan with `[AI]` labeling, ready/future/decision/completed progress groups, CLI/API entry points, and Reminder digest sync.
- LaunchAgent installer for recurring AI scans that sync daily progress and decision reminders to Apple Reminders.
- CLI entry for Inbox, Today, and recommendation.
- HTTP API for Inbox, tasks, recommendations, AI suggestions, and reminder sync.
- Web UI for Inbox, processing, Today, and recommendations.
- Automated regression tests for DB, services, API, CLI, and Web E2E.

## Not completed / manual acceptance still needed

- Real Apple Reminders/iPhone notification sync. Fake provider is implemented and tested; real provider is still a later slice.
- Real recurring AI scan and iPhone notification delivery still need manual verification on the Mac/iPhone pair.
- Tailscale phone access manual verification.
- Live AI provider token integration. Current MVP stores AI suggestions and supports acceptance, but normal tests do not call a live model.

## Next recommended step

Start the local dev server and perform user acceptance:

```bash
npm run dev
```

Then open:

```text
http://127.0.0.1:5173
```

Manual acceptance focus:

- Add an Inbox item from Web UI.
- Add an Inbox item from CLI.
- Convert an Inbox item to a task.
- Confirm Today shows deadline tasks.
- Complete a task.
- Ask for recommendations.
- Later, expose the app through Tailscale and verify iPhone access.

## Session log

### 2026-05-17

- Confirmed product shape and access strategy.
- Added engineering management docs.
- Added initial database design and acceptance test plan.
- Added test-first strategy, detailed module test cases, AI development workflow, and small task breakdown.
- Chose hybrid development process: spec-driven planning plus acceptance-test-driven implementation.
- Added `DEVELOPMENT_PROCESS.md` and `AGENTS.md` so future AI sessions have explicit project rules.
- Implemented MVP skeleton, database, services, CLI, API, Web UI, and automated tests.
- Regression passed:
  - `npm run lint`
  - `npm test`
  - `npm run db:check`
  - `npm run build`
  - `npm run test:e2e`
- Prepared the project for a public test repository:
  - Added MIT license, contribution notes, deployment notes, CI workflow, and `.env.example`.
  - Expanded README with purpose, usage, API examples, deployment pointer, and data privacy note.
  - Tightened `.gitignore` so local SQLite databases and backups under `data/` are not committed.
  - Added short code comments for database path isolation and transparent recommendation scoring.

### 2026-05-24

- Implemented TASK-0503: AI delegated task scan and reminder digest.
- Acceptance coverage:
  - TC-AI-AUTO-001.
  - TC-AI-AUTO-002.
- Added `scanAiTasks`/`syncAiScanReminders` service behavior for `[AI]` labeling, ready queue, future scheduled queue, decision queue, completed-today progress, daily Reminder digest, and individual decision reminders.
- Reminder digest sync now returns per-reminder `synced`/`failed` status instead of aborting the whole scan when Apple Reminders is blocked.
- Added CLI/API access for AI scan and Reminder sync.
- Added launchd scripts:
  - `scripts/ai-scan-reminders.sh`
  - `scripts/install-ai-scan-launchd.sh`
- Regression passed:
  - `npm run lint`
  - `npm test`
  - `npm run db:check`
  - `npm run build`
  - `npm run test:e2e`
  - `bash -n scripts/ai-scan-reminders.sh scripts/install-ai-scan-launchd.sh`

Known issues:

- The recurring LaunchAgent has not been installed in this session.
- Real Apple Reminders delivery is currently blocked: direct `osascript` access to Reminders timed out, so the code can report Reminder sync failures cleanly but cannot create iPhone-visible reminders until macOS Reminders automation responds.
- The scan queues AI tasks and creates progress/decision reminders; actual task execution is still performed by Codex sessions, not by a background LLM worker.

## Files changed in MVP implementation

- `package.json`
- `tsconfig.json`
- `tsconfig.server.json`
- `tsconfig.check.json`
- `vite.config.ts`
- `vitest.config.ts`
- `playwright.config.ts`
- `index.html`
- `.gitignore`
- `README.md`
- `src/db/*`
- `src/domain/*`
- `src/services/*`
- `src/server/*`
- `src/web/*`
- `src/cli.ts`
- `tests/**/*`

### v0.2.10 final cloud verification

Commit 1d1059564c7ce8f16c6c976fc49ca803a6c44c37: CI run 37884163461 passed (including Chromium E2E); Windows build 37884163456 passed. Artifact personal-assistant-windows, ID 11596005427, matches this commit. Installer was not installed locally; user downloads and updates. This verification note is local session bookkeeping after the packaged commit.

### v0.2.11 final cloud verification
Final commit fb26d18d4743bd49848c9dfec88f8c22b8fd8285: CI run 37900611752 and Windows build 37900611834 succeeded. Supersedes preliminary e7ad421f9d67340d4ef6d5bac538f90b84a347a7 build; download final run only. No local installer installation performed. This is local bookkeeping after the packaged commit.

### v0.2.12 category directory
TASK-0916 / TC-0916 complete locally: persistent category registry (migration 0011), empty category creation and transactional rename, fixed directory with counts and section navigation, card drop targets and existing undo. Main library continues showing every category. New categories are included in AI classification context. Raw sources remain unchanged; rename preserves manual category locks. Validation: 82 tests, 12 Edge E2E, lint, db:check and production build passed; directory screenshot inspected. Cloud CI and Windows installer pending for this commit.
