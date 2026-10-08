# Project Status

Last updated: 2026-10-08

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
