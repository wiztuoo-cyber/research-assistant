# Approved v0.2.9 scope

TASK-0901 / TC-0901: One composer, mutually exclusive thought/task toggles; neither means read-only chat. Drafts remain separate. Latest exchanges first. Knowledge questions use this same assistant and validated source links.

TASK-0902 / TC-0902: Category > topic > chapter knowledge structure, AI may create categories and topics, explicit category wins. Deduplicate claims while retaining every supporting source and differences. Source metadata includes title, author, URL, original text and images. Preserve originals internally; hide evidence clutter. Markmap navigation and chaptered reading share one structure. Rename/move/merge and recoverable versions; backdrop/Escape close with unsaved guard.

TASK-0903 / TC-0903: Paste/upload images, extract once and persist results, explicit vision configuration when current text provider cannot accept images. Never invent URLs or unreadable text. Tests use mock extraction; real model quality needs manual acceptance.

TASK-0904 / TC-0904: Task page today (60%) and upcoming/unplanned (40%), no sidebar/four quadrants/priority-chat button. Past plans differ from overdue deadlines. Main panel opens planner. Schedules have editable details, complete/cancel controls; do not delete task-related events by title guessing.

TASK-0905 / TC-0905: FullCalendar week styling, dots for single-day entries, bars only for explicit start/end spans. Color by category with manual override; no inferred spans from deadlines. Drag changes plan only, dates local, previous/next/today navigation. Automated date/event mapping and UI flow checks plus manual native-window check.

User explicitly approved automatic categorization, new category creation, summary integration and source-preserving deduplication. Phone share extensions and live crawling of restricted social posts are not part of this version; desktop accepts pasted text, links and screenshots.

Verification: lint, service/API tests, db:check, E2E, production build, GitHub Windows package. Migration regression must preserve old tasks, topics, knowledge and original captures.
