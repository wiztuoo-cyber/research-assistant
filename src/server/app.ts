import express, { type Request, type Response, type NextFunction } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { createAiSuggestion, acceptAiSuggestionForTask } from '../services/aiSuggestions.js';
import { scanAiTasks, syncAiScanReminders } from '../services/aiAutomation.js';
import { captureInbox, listInbox, updateInboxStatus } from '../services/inbox.js';
import {
  createMessageRecipient,
  dispatchDueMessages,
  FakeMessageProvider,
  listMessageOutbox,
  listMessageRecipients,
  queueTaskMessage,
  WeComAppMessageProvider
} from '../services/messages.js';
import { recommendNow } from '../services/recommendation.js';
import {
  AppleRemindersProvider,
  FakeReminderProvider,
  syncActiveTaskReminders,
  syncTaskReminder
} from '../services/reminders.js';
import { completeTask, convertInboxToTask, createTask, listTodayTasks } from '../services/tasks.js';
import { createComputeJob, createDevice, listComputeJobs, listDevices, researchDashboard, updateComputeJob } from '../services/research.js';

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = process.env.API_TOKEN;
  if (!token) {
    next();
    return;
  }

  const authHeader = req.header('authorization');
  const apiToken = req.header('x-api-token');
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;

  if (apiToken === token || bearer === token) {
    next();
    return;
  }

  res.status(401).json({ error: 'Unauthorized' });
}

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void> | void
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function createApp(db: DatabaseSync): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api', requireAuth);

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/inbox', (req, res) => {
    const item = captureInbox(db, {
      rawText: String(req.body.rawText ?? req.body.raw_text ?? ''),
      source: req.body.source ?? 'api',
      metadata: req.body.metadata
    });
    res.status(201).json({ item });
  });

  app.get('/api/inbox', (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : 'new';
    res.json({ items: listInbox(db, status as Parameters<typeof listInbox>[1]) });
  });

  app.patch('/api/inbox/:id', (req, res) => {
    const item = updateInboxStatus(db, req.params.id, req.body.status);
    res.json({ item });
  });

  app.post('/api/inbox/:id/convert', (req, res) => {
    const task = convertInboxToTask(db, req.params.id, req.body.task, req.body.createdBy ?? 'api');
    res.status(201).json({ task });
  });

  app.post('/api/tasks', (req, res) => {
    const task = createTask(db, req.body.task, req.body.createdBy ?? 'api');
    res.status(201).json({ task });
  });

  app.post('/api/tasks/:id/complete', (req, res) => {
    const task = completeTask(db, req.params.id, req.body.createdBy ?? 'api');
    res.json({ task });
  });

  app.get('/api/tasks/today', (req, res) => {
    const now = typeof req.query.now === 'string' ? req.query.now : undefined;
    res.json({ tasks: listTodayTasks(db, now) });
  });

  app.post('/api/recommendations/now', (req, res) => {
    res.json({ recommendations: recommendNow(db, req.body.context ?? {}) });
  });

  app.get('/api/research/dashboard', (_req, res) => {
    res.json(researchDashboard(db));
  });

  app.get('/api/research/devices', (_req, res) => {
    res.json({ devices: listDevices(db) });
  });

  app.post('/api/research/devices', (req, res) => {
    const device = createDevice(db, {
      name: String(req.body.name ?? ''),
      notes: req.body.notes ?? null,
      status: req.body.status
    });
    res.status(201).json({ device });
  });

  app.get('/api/research/jobs', (_req, res) => {
    res.json({ jobs: listComputeJobs(db) });
  });

  app.post('/api/research/jobs', (req, res) => {
    const job = createComputeJob(db, req.body.job ?? req.body, req.body.createdBy ?? 'web');
    res.status(201).json({ job });
  });

  app.patch('/api/research/jobs/:id', (req, res) => {
    const job = updateComputeJob(db, req.params.id, req.body.job ?? req.body, req.body.createdBy ?? 'web');
    res.json({ job });
  });

  app.post('/api/ai-suggestions', (req, res) => {
    const suggestion = createAiSuggestion(db, req.body);
    res.status(201).json({ suggestion });
  });

  app.post('/api/ai-suggestions/:id/accept-task', (req, res) => {
    const suggestion = acceptAiSuggestionForTask(
      db,
      req.params.id,
      req.body.taskId,
      req.body.fields,
      req.body.createdBy ?? 'api'
    );
    res.json({ suggestion });
  });

  app.post(
    '/api/ai/scan',
    asyncHandler(async (req, res) => {
      const report = scanAiTasks(db, {
        now: req.body.now,
        readyLimit: req.body.readyLimit,
        labelPrefix: req.body.labelPrefix,
        createdBy: req.body.createdBy ?? 'api'
      });
      if (!req.body.syncReminders) {
        res.json({ report });
        return;
      }

      const provider =
        req.body.provider === 'fake'
          ? new FakeReminderProvider()
          : new AppleRemindersProvider(req.body.listName);
      const taskReminders = await syncActiveTaskReminders(db, provider);
      const reminders = await syncAiScanReminders(report, provider, {
        now: req.body.now,
        dailyAt: req.body.dailyAt,
        decisionAt: req.body.decisionAt
      });
      res.json({ report, taskReminders, reminders });
    })
  );

  app.post(
    '/api/reminders/sync-active',
    asyncHandler(async (req, res) => {
      const provider =
        req.body.provider === 'fake'
          ? new FakeReminderProvider()
          : new AppleRemindersProvider(req.body.listName);
      const syncs = await syncActiveTaskReminders(db, provider);
      res.json({ syncs });
    })
  );

  app.post(
    '/api/tasks/:id/sync-reminder',
    asyncHandler(async (req, res) => {
      const provider =
        req.body.provider === 'fake'
          ? new FakeReminderProvider()
          : new AppleRemindersProvider(req.body.listName);
      const sync = await syncTaskReminder(db, String(req.params.id), provider);
      res.json({ sync });
    })
  );

  app.post('/api/messages/recipients', (req, res) => {
    const recipient = createMessageRecipient(db, {
      displayName: String(req.body.displayName ?? req.body.display_name ?? ''),
      provider: req.body.provider ?? 'wecom_app',
      channel: req.body.channel,
      externalId: String(req.body.externalId ?? req.body.external_id ?? ''),
      metadata: req.body.metadata
    });
    res.status(201).json({ recipient });
  });

  app.get('/api/messages/recipients', (_req, res) => {
    res.json({ recipients: listMessageRecipients(db) });
  });

  app.post('/api/messages/outbox', (req, res) => {
    const item = queueTaskMessage(db, {
      taskId: req.body.taskId ?? req.body.task_id,
      recipientId: String(req.body.recipientId ?? req.body.recipient_id ?? ''),
      body: req.body.body,
      scheduledAt: req.body.scheduledAt ?? req.body.scheduled_at,
      provider: req.body.provider
    });
    res.status(201).json({ item });
  });

  app.get('/api/messages/outbox', (req, res) => {
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 50;
    res.json({ items: listMessageOutbox(db, Number.isFinite(limit) ? limit : 50) });
  });

  app.post(
    '/api/messages/dispatch',
    asyncHandler(async (req, res) => {
      const provider =
        req.body.provider === 'fake' ? new FakeMessageProvider() : new WeComAppMessageProvider();
      const results = await dispatchDueMessages(db, provider, {
        now: req.body.now,
        limit: req.body.limit,
        createdBy: req.body.createdBy ?? 'api'
      });
      res.json({ results });
    })
  );

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = error instanceof Error ? error.message : String(error);
    res.status(400).json({ error: message });
  });

  return app;
}
