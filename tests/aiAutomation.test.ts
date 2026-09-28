import { describe, expect, it } from 'vitest';
import { parseRelativeReminder } from '../src/services/aiCapture.js';
import { scanAiTasks, syncAiScanReminders } from '../src/services/aiAutomation.js';
import type { ReminderProvider } from '../src/services/reminders.js';
import { completeTask, createTask, getTask } from '../src/services/tasks.js';
import { createTestDb } from './helpers/db.js';

class RecordingReminderProvider implements ReminderProvider {
  provider = 'fake' as const;
  calls: Array<{
    taskId: string;
    title: string;
    notes: string | null;
    reminderAt: string;
    externalId: string | null;
  }> = [];

  async upsertReminder(input: {
    taskId: string;
    title: string;
    notes: string | null;
    reminderAt: string;
    externalId: string | null;
  }): Promise<{ externalId: string }> {
    this.calls.push(input);
    return { externalId: `fake-${input.taskId}` };
  }
}

class FailingReminderProvider implements ReminderProvider {
  provider = 'fake' as const;

  async upsertReminder(): Promise<{ externalId: string }> {
    throw new Error('reminder unavailable');
  }
}

describe('AI automation', () => {
  it('adds AI label and splits ready, future, and decision queues', () => {
    const { db, close } = createTestDb();
    try {
      const ready = createTask(db, {
        title: '做算账工具',
        delegatedTo: 'ai',
        notes: 'AI协作: 代码实现/工具原型'
      });
      const future = createTask(db, {
        title: '生成公众号草稿',
        status: 'scheduled',
        startAt: '2026-05-18T13:00:00.000Z',
        delegatedTo: 'ai'
      });
      const decision = createTask(db, {
        title: '确认视频生成工具',
        delegatedTo: 'ai',
        notes: 'AI协作: 工具调研，需本人决策'
      });
      createTask(db, { title: '普通任务' });

      const report = scanAiTasks(db, {
        now: '2026-05-17T01:00:00.000Z',
        createdBy: 'test'
      });

      expect(getTask(db, ready.id)?.title).toBe('[AI] 做算账工具');
      expect(getTask(db, future.id)?.title).toBe('[AI] 生成公众号草稿');
      expect(report.labeledTasks).toHaveLength(3);
      expect(report.readyTasks.map((task) => task.id)).toEqual([ready.id]);
      expect(report.futureTasks.map((task) => task.id)).toEqual([future.id]);
      expect(report.decisionTasks.map((task) => task.id)).toEqual([decision.id]);

      const events = db
        .prepare('select event_type from task_events where task_id = ?')
        .all(ready.id)
        .map((row) => row.event_type);
      expect(events).toContain('ai_label_added');
    } finally {
      close();
    }
  });

  it('syncs a daily report and decision reminders through reminder provider', async () => {
    const { db, close } = createTestDb();
    try {
      createTask(db, {
        title: '做算账工具',
        delegatedTo: 'ai',
        notes: 'AI协作: 代码实现/工具原型'
      });
      const completed = createTask(db, {
        title: '[AI] 生成公众号草稿',
        delegatedTo: 'ai',
        notes: 'AI协作: 写作初稿'
      });
      completeTask(db, completed.id, 'test', '2026-05-17T02:00:00.000Z');
      const decision = createTask(db, {
        title: '确认视频生成工具',
        status: 'waiting',
        delegatedTo: 'ai',
        waitingFor: 'Bonnie'
      });
      const report = scanAiTasks(db, { now: '2026-05-17T01:00:00.000Z' });
      const provider = new RecordingReminderProvider();

      const synced = await syncAiScanReminders(report, provider, {
        now: '2026-05-17T01:00:00.000Z',
        dailyAt: '21:00',
        decisionAt: '10:00'
      });

      expect(synced.map((item) => item.kind)).toEqual(['daily_report', 'decision']);
      expect(synced.every((item) => item.syncStatus === 'synced')).toBe(true);
      expect(synced[0].title).toContain('完成 1');
      expect(provider.calls[0].taskId).toBe('ai-daily-2026-05-17');
      expect(provider.calls[0].title).toContain('AI任务日报');
      expect(provider.calls[0].notes).toContain('今日已完成');
      expect(provider.calls[0].notes).toContain('[AI] 生成公众号草稿');
      expect(provider.calls[0].notes).toContain('[AI] 做算账工具');
      expect(provider.calls[1].taskId).toBe(`ai-decision-${decision.id}`);
      expect(provider.calls[1].title).toContain('[AI] 确认视频生成工具');
    } finally {
      close();
    }
  });

  it('returns failed reminder sync items without aborting the scan', async () => {
    const { db, close } = createTestDb();
    try {
      createTask(db, {
        title: '确认视频生成工具',
        status: 'waiting',
        delegatedTo: 'ai',
        waitingFor: 'Bonnie'
      });
      const report = scanAiTasks(db, { now: '2026-05-17T01:00:00.000Z' });

      const synced = await syncAiScanReminders(report, new FailingReminderProvider(), {
        now: '2026-05-17T01:00:00.000Z'
      });

      expect(synced.map((item) => item.syncStatus)).toEqual(['failed', 'failed']);
      expect(synced[0].error).toContain('reminder unavailable');
      expect(synced[1].kind).toBe('decision');
    } finally {
      close();
    }
  });
});


describe('Relative reminder parser', () => {
  it('parses one-minute reminder deterministically', () => {
    const result = parseRelativeReminder('一分钟后提醒我', new Date('2026-09-28T07:57:00.000Z'));
    expect(result?.title).toBe('提醒');
    expect(result?.reminderAt).toBe('2026-09-28T07:58:00.000Z');
  });

  it('keeps reminder content as one task title', () => {
    const result = parseRelativeReminder('10分钟后提醒我关程序', new Date('2026-09-28T07:57:00.000Z'));
    expect(result?.title).toBe('关程序');
    expect(result?.reminderAt).toBe('2026-09-28T08:07:00.000Z');
  });
});
