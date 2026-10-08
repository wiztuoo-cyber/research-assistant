import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

function runCli(dbPath: string, args: string[]): string {
  return execFileSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_NO_WARNINGS: '1',
      TASK_DB_PATH: dbPath
    },
    encoding: 'utf8'
  });
}

describe('CLI', () => {
  it('TC-INBOX-001 can add and list Inbox items', () => {
    const dbPath = join(mkdtempSync(join(tmpdir(), 'ai-task-cli-')), 'test.sqlite');
    const added = runCli(dbPath, ['inbox', 'add', '明天下午还信用卡']);
    expect(added).toContain('明天下午还信用卡');

    const listed = runCli(dbPath, ['inbox', 'list']);
    expect(listed).toContain('明天下午还信用卡');
  });

  it('TC-INBOX-003 can process Inbox item', () => {
    const dbPath = join(mkdtempSync(join(tmpdir(), 'ai-task-cli-')), 'test.sqlite');
    const added = runCli(dbPath, ['inbox', 'add', '处理后不显示']);
    const id = added.split('\t')[0];

    runCli(dbPath, ['inbox', 'process', id]);
    const listed = runCli(dbPath, ['inbox', 'list']);
    expect(listed).not.toContain('处理后不显示');
  });

  it('lists tasks delegated to AI', () => {
    const dbPath = join(mkdtempSync(join(tmpdir(), 'ai-task-cli-')), 'test.sqlite');
    const added = runCli(dbPath, ['inbox', 'add', '帮我做个算账的工具']);
    const inboxId = added.split('\t')[0];
    const converted = runCli(dbPath, ['inbox', 'convert', inboxId, '帮我做个算账的工具']);
    const taskId = converted.split('\t')[0];

    const db = new DatabaseSync(dbPath);
    db.prepare("update tasks set delegated_to = 'ai', notes = 'AI协作: 代码实现/工具原型' where id = ?").run(taskId);
    db.close();

    const listed = runCli(dbPath, ['ai']);
    expect(listed).toContain(taskId);
    expect(listed).toContain('帮我做个算账的工具');
    expect(listed).toContain('AI协作: 代码实现/工具原型');
  });

  it('can queue and dispatch a fake message', () => {
    const dbPath = join(mkdtempSync(join(tmpdir(), 'ai-task-cli-')), 'test.sqlite');
    const added = runCli(dbPath, ['inbox', 'add', '提醒 Alice 看项目状态']);
    const inboxId = added.split('\t')[0];
    const converted = runCli(dbPath, ['inbox', 'convert', inboxId, '提醒 Alice 看项目状态']);
    const taskId = converted.split('\t')[0];
    const recipient = runCli(dbPath, [
      'message',
      'recipient',
      'add',
      'Alice',
      '--wecom-user',
      'alice',
      '--fake'
    ]);
    const recipientId = recipient.split('\t')[0];

    const queued = runCli(dbPath, ['message', 'queue', taskId, '--to', recipientId]);
    const outboxId = queued.split('\t')[0];
    const dispatched = runCli(dbPath, ['message', 'dispatch', '--fake']);

    expect(dispatched).toContain(outboxId);
    expect(dispatched).toContain('sent');
    expect(dispatched).toContain(`fake-${outboxId}`);
  });
});
