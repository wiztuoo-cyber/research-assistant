# AI Task Manager Requirements

The approved v0.2.9 scope in REDESIGN_029.md supersedes the three large capture buttons and flat knowledge list below.

## Approved usability revision

Three main pages: Tasks (today first, then deadline; previous unfinished plans visible; fixed appointments inline), Assistant (three mode buttons), Knowledge Library (topic documents and legacy notes in one searchable list). No standalone job-application/hard-schedule/waiting panels, no deletion of their data. Topic title, subject/category and SOP/skill/note kind are editable. Preserve sources and summary versions. Enter submits, Ctrl+Enter newlines, IME composition must not submit. Conversation, thought and task drafts stay distinct. Capture confirms durable save separately from organization. Global task questions do not inherit previously browsed topics. Single-item completion is the default and destructive user actions offer guarded undo. Widget, tray click, second launch and Ctrl+Alt+M open/focus the single main window; Ctrl+Alt+A still opens the planner.

## Accepted extension (2026-10-08; supersedes earlier manual-only AI scope)

Windows local assistant: preserve each thought verbatim; group thoughts into topics; show a versioned, source-linked organized view by default. Batch changed topics after two idle minutes and recover pending work on startup. Automatic organization is a persisted opt-in; AI off performs no model calls. API key continues to use existing settings. Cloud processing disclosure appears beside the control.

Keep uncertainties and conflicting alternatives. Corrections are new source records. Manual summary editing/restoring pauses automatic replacement until the user resumes it. No silent truncation of source material. Invalid or stale model results must never replace a good summary. Provide retry and visible errors.

An assistant panel supports conversation, recording thoughts, and explicit task/schedule capture. Conversation reads current tasks, fixed schedules, selected topic sources and a bounded recent conversation. It offers reasons and assumptions without changing plans. Capturing ideas must never create tasks. Existing knowledge records remain accessible and can be explicitly copied into topics.

## 目标

做一个个人使用的、本地优先的 AI 任务管理工具，用来替代或部分替代 Doit.im。

核心目标：

- 任务数据尽量保存在自己的远端 Mac 上，而不是第三方任务管理公司的云端。
- 手机端可以方便地记录、查看和处理任务，不需要每次登录远端 Mac。
- AI 负责降低手动整理成本，包括分类、拆解、判断场景、推荐当前该做什么、总结历史行为。
- 保留 Doit.im/GTD 里好用的 Inbox、项目、场景、deadline、提醒、优先级、等待、每日计划和回顾。

## 产品形态

这个工具不是一开始就做成完整 SaaS，而是先做成一个个人本地系统：

- 远端 Mac 是数据中心和执行中心。
- SQLite 是本地任务数据库。
- Codex/GPT 是当前优先的自然语言交互入口。
- Web App 是可视化查看和整理入口。
- 手机可以通过 GPT 对话和私有 Web 地址访问系统。
- 远程访问优先使用 Tailscale 这类私有网络。
- AI 分析默认由用户手动触发，不做后台自动全量分析。

长期设计上，Codex 不是唯一入口。底层应该提供稳定的本地脚本/API，让 Codex、Web App、手机快捷指令、Telegram bot 等入口都能复用同一套能力。

## 关键使用方式

### 1. 手机通过 GPT/Codex 记录 Inbox

用户在手机 GPT 里说：

```text
帮我记一下：明天下午还信用卡。
```

系统行为：

- Codex 把原始文本写入 SQLite 的 Inbox。
- AI 可以同时生成建议字段，例如 deadline、提醒时间、场景、优先级、是否重复。
- 原始输入必须保留，方便之后回看。

### 2. 手机通过 GPT/Codex 查询任务

用户可以问：

```text
帮我看一下 Inbox 里有哪些没处理的。
今天有什么 deadline 必须完成？
我现在在公交上，有 20 分钟，可以做什么？
帮我规划一下今天的任务。
```

系统行为：

- Codex 读取 SQLite。
- AI 根据任务数据、时间、场景、deadline、优先级、重要程度进行整理和推荐。
- 输出可以是自然语言，也可以提供可执行操作，例如标记完成、延期、拆分、归档。

### 3. 手机通过 Web App 查看和整理

用户在手机浏览器打开一个私有地址，访问远端 Mac 上运行的 Web App。

Web App 需要支持：

- 查看 Inbox。
- 快速添加 Inbox 项。
- 处理 Inbox 项：转任务、转项目、设置 deadline、设置提醒、设置场景、设置优先级、丢弃。
- 查看 Today、Next、Scheduled、Waiting、Projects、Contexts。
- 查看 AI 推荐的“现在该做什么”。

访问方式优先考虑：

- Tailscale 私有网络。
- Cloudflare Tunnel 加访问控制，作为 Tailscale 不方便时的备选。

## Inbox 要求

Inbox 是第一优先级功能，不只是一个普通分类。

Inbox 需要支持：

- 随时记录想法、任务、提醒、待确认事项、临时笔记。
- 保留原始文本、创建时间、来源。
- 支持 AI 自动建议字段，但不强制立即整理。
- 支持之后批量处理。
- 支持把 Inbox 项转成：
  - 单个任务。
  - 项目。
  - 等待他人处理的事项。
  - 定时提醒。
  - 参考资料。
  - 废弃项。

## 任务模型

第一版任务建议包含：

- 标题。
- 原始输入。
- 状态：inbox、next、today、scheduled、waiting、someday、completed、trash。
- 项目。
- 场景/上下文。
- 标签。
- 重要程度。
- 紧急程度。
- deadline。
- start date。
- reminder time。
- repeat rule。
- 预计耗时。
- 所需条件：电脑、手机、网络、安静环境、通勤、家里、办公室、某个人。
- 委托对象。
- 创建时间、更新时间、完成时间。

## AI 能力

第一版 AI 不需要完全自动替用户做决定，而是先做建议和辅助整理。

需要支持：

- 从自然语言中提取 deadline、提醒时间、重复规则。
- 判断任务适合的场景和所需条件。
- 判断任务是单步行动还是应该拆成项目。
- 根据当前条件推荐任务。
- 找出今天必须完成的事项。
- 发现过期、长期未处理、表述不清的任务。
- 做每日总结和每周总结。
- 分析历史完成情况、拖延模式、任务来源和负载。

## 推荐逻辑

“现在该做什么”需要考虑：

- 当前时间。
- 用户输入的当前位置或场景。
- 当前可用设备，例如是否有电脑。
- 可用时长。
- 当前精力。
- deadline 远近。
- 重要程度。
- 紧急程度。
- 是否已经被多次延期。
- 是否依赖他人。

推荐输出应该解释原因，例如：

```text
建议先做“还信用卡”，因为 deadline 是今天，耗时短，且不需要电脑。
```

## 本地和远程访问

本地数据：

- 第一版使用 SQLite。
- 数据库文件放在工程目录或用户指定目录。
- 后续需要备份策略。

远程访问：

- Mac 上运行本地服务。
- 手机优先通过 Tailscale 私有网络访问。
- 也可以通过受保护的 Cloudflare Tunnel 访问。
- API 必须有认证，不能裸露到公网。

## 入口和 Token 策略

第一版优先使用 Codex 作为 AI 入口，因为用户已经可以在手机 GPT 中向 Codex 发指令，且 Codex 能访问远端 Mac 的工程和 SQLite。

但系统内部应该拆成两层：

- 能力层：本地 CLI/API，负责写 Inbox、查任务、更新任务、推荐任务。
- 交互层：Codex、Web App、手机快捷指令或其他 bot。

这样后续如果 Web App 或手机端也要调用 AI，可以有两种选择：

- 继续让 Codex/GPT 作为 AI 分析入口，Web App 只做查看和整理。
- 给后端配置 AI provider token，让 Web App 直接触发 AI 分类和推荐。

第一版建议：

- 不要求 Web App 配 AI token。
- AI 分析先由 Codex 手动触发。
- API 设计预留 `ai_suggestions` 字段，方便以后接入 token 后复用。

## 非目标

第一版暂时不做：

- 多用户协作。
- 公开 SaaS 注册系统。
- 完整原生 iOS/Android App。
- 复杂日历双向同步。
- 完整团队项目管理。
- 复杂权限系统。

## 开源复用策略

已有开源任务管理器可以参考，但第一版不直接 fork 完整产品。

原因：

- 当前产品形态更像“本地 SQLite 个人任务记忆 + Codex/GPT 自然语言入口 + 手机私有 Web 查看 + Apple Reminders 通知桥”。
- 现有完整任务管理器通常自带账号、同步、团队、UI 和数据模型假设，直接改造可能比做窄版 MVP 更重。
- 我们需要保留原始 Inbox 输入，方便后续 AI 分析个人历史。

第一版优先复用局部能力：

- 日期解析库，例如 `chrono-node`。
- Apple Reminders 操作工具，例如 `reminders-cli` 或 EventKit/MCP 相关实现。
- 借鉴 Mindwtr、Vikunja、Will Be Done、Doit.im 的 GTD 和 UI 设计。

详细调研见 [OPEN_SOURCE_RESEARCH.md](./OPEN_SOURCE_RESEARCH.md)。

## 主要风险和待确认问题

### 1. Codex 作为入口的稳定性

Codex 适合帮助写入和读取本地 SQLite，但它不是长期后台服务。需要确认第一版是主要依赖 Codex 对话，还是同时做一个稳定 API。

建议：两者都做，但先做稳定 API，Codex 调用本地脚本/API。

### 2. 手机访问安全

如果通过 Cloudflare Tunnel 或其他公网入口访问，必须加认证。

建议：第一版优先 Tailscale；如果用 Cloudflare Tunnel，需要 Cloudflare Access 或至少强 token。

### 3. 提醒能力

只存在 SQLite 里还不等于真正提醒用户。远端 Mac 的 macOS 本机通知只会出现在远端 Mac 上，用户平时看不到，所以不能作为主要提醒通道。

可能方案：

- Apple Reminders/iCloud：把关键提醒同步到 Apple 提醒事项，由 iPhone 负责通知。
- iOS Shortcut：从任务系统拉取今日提醒，写入 Apple Reminders 或主动展示。
- Telegram/微信/邮件推送：作为跨平台提醒方案。
- Web App 内提醒：只适合用户正在打开页面时。
- macOS 通知：只适合作为远端 Mac 上的辅助提醒，不适合作为手机提醒。

建议：第一版优先做 Apple Reminders/iCloud 集成。任务系统仍以 SQLite 为主库，只有需要真正推送到手机的 deadline/reminder 同步一份到 Apple Reminders。

### 4. AI 成本和隐私

如果用云端 AI，任务内容会发送给模型提供商。需要决定哪些数据可以发，哪些需要本地处理。

建议：先允许用户手动触发 AI 分析，后续再做自动分析和脱敏。

### 5. Doit.im 历史数据迁移

如果需要分析过往数据，需要先确认 Doit.im 是否支持导出。

建议：后续单独做一个导入模块，支持 CSV、JSON、手动复制、邮件导出等可能形式。

## MVP 范围

第一阶段目标：

1. 建立 SQLite 数据库和基础 schema。
2. 提供命令行或脚本：添加 Inbox 项、查看 Inbox、处理 Inbox。
3. 提供本地 API：`POST /inbox`、`GET /inbox`、`PATCH /tasks/:id`。
4. 提供 Web App：Inbox、Today、Next、Scheduled、Projects、Contexts。
5. 接入 AI 分类建议。
6. 支持“现在该做什么”的推荐。
7. 预留提醒同步接口，优先考虑 Apple Reminders/iCloud。

第一阶段完成后，用户应该可以：

- 在手机 GPT 里让 Codex 记录一条 Inbox。
- 在手机 Web 页面看到这条 Inbox。
- 把它整理成任务。
- 让 AI 推荐今天或当前场景下该做的事。

## 工程管理要求

为了避免 AI 开发过程中出现“改了 A 坏了 B、修了 B 又坏了 A”的问题，项目必须保留工程化约束：

- 每个功能按小阶段交付，不一次性做大而全。
- 数据库 schema 通过 migration 管理。
- 核心行为必须有自动化测试。
- UI 主流程必须有端到端测试。
- AI 输出只能作为建议，不能绕过服务层直接改数据库。
- 每次实现后必须更新 `PROJECT_STATUS.md`，记录做到哪里、改了什么、跑了哪些测试、还剩什么。
- 每个后续 session 开始前先读 `PROJECT_STATUS.md`，避免断点丢失。

详细计划见：

- [ENGINEERING_PLAN.md](./ENGINEERING_PLAN.md)
- [DATABASE_DESIGN.md](./DATABASE_DESIGN.md)
- [ACCEPTANCE_TESTS.md](./ACCEPTANCE_TESTS.md)
- [TEST_STRATEGY.md](./TEST_STRATEGY.md)
- [TEST_CASES.md](./TEST_CASES.md)
- [AI_DEVELOPMENT_WORKFLOW.md](./AI_DEVELOPMENT_WORKFLOW.md)
- [DEVELOPMENT_PROCESS.md](./DEVELOPMENT_PROCESS.md)
- [TASK_BREAKDOWN.md](./TASK_BREAKDOWN.md)

## v0.2.10 corrections (TASK-0910)
Independent knowledge cards under category headings replace maps and combined prose. Distinct points remain separate; duplicates retain all sources. Cards open individually and support editing. Existing raw records/history remain intact. Restore week widget all unfinished tasks on left, weekly calendar on right with persisted adjustable split. Remove task-list date controls. Click detail title to edit, Enter saves, Escape cancels, blank rejected, other fields preserved.

## v0.2.11 / TASK-0913..0915
Approved: seven rows instead of seven columns in week widget; retain all-task left pane. Drag knowledge cards into existing categories, preserve manual classification and old content, no new-category/record-thought/new-note toolbar. Reviews use existing assistant, event or current-week scope, auto-collected facts and user-supplied outcomes, editable saved cards, optional explicit save-as-knowledge and add-task; history separate from knowledge.

## v0.2.12 / TASK-0916
Knowledge library has a persistent left category directory with counts and bottom Add Category entry. Empty categories survive reload, menu supports rename, click scrolls right content without hiding other categories, scroll updates highlighted category, cards may be dropped onto sidebar names. Existing user content and original sources remain intact.
