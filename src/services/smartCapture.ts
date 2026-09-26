import type { DatabaseSync } from 'node:sqlite';
import { createComputeJob, createDevice, listComputeJobs, listDevices, updateComputeJob } from './research.js';

type SmartCaptureResult = {
  summary: string;
  actions: Array<Record<string, unknown>>;
};

function extractNumber(text: string, patterns: RegExp[]): number | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return Number(match[1]);
  }
  return null;
}

function extractDeviceName(text: string): string | null {
  const known = ['工位电脑', '工作站', '宿舍电脑', '笔记本', '俊俊电脑'];
  const exact = known.find((name) => text.includes(name));
  if (exact) return exact;

  const match = text.match(/(?:在|用|换到|切到)?\s*([\u4e00-\u9fa5A-Za-z0-9_-]{2,12}(?:电脑|工作站|笔记本))/);
  return match?.[1] ?? null;
}

function extractGamma(text: string): number | null {
  const explicit = extractNumber(text, [
    /(?:γ|gamma|Gamma|GAMMA)\s*[=:：]?\s*(\d+(?:\.\d+)?)/,
    /(?:γ|gamma)\s*(\d+(?:\.\d+)?)/i
  ]);
  if (explicit !== null) return explicit;

  const deviceAdjacent = text.match(/(?:电脑|工作站|笔记本)\s*(\d(?:\.\d+)?)/);
  if (deviceAdjacent?.[1]) return Number(deviceAdjacent[1]);
  return null;
}

function extractKpcm(text: string): number | null {
  return extractNumber(text, [
    /k[_\s-]*PCM\s*[=:：]?\s*(\d+(?:\.\d+)?)/i,
    /PCM\s*(?:导热系数)?\s*[=:：]?\s*(\d+(?:\.\d+)?)/i
  ]);
}

function extractMove(text: string): string | null {
  const match = text.match(/move\s*(?:还是|为|=|：|:)\s*([^，,。;；\s]+(?:\^loop)?)/i);
  return match?.[1] ?? null;
}

function cleanTitle(text: string, deviceName: string | null): string {
  let title = text.trim();
  if (deviceName) title = title.replace(deviceName, '');
  title = title
    .replace(/^(目前|现在|正在|我)?\s*(在|用)?\s*/g, '')
    .replace(/(?:γ|gamma)\s*[=:：]?\s*\d+(?:\.\d+)?/gi, '')
    .replace(/k[_\s-]*PCM\s*[=:：]?\s*\d+(?:\.\d+)?/gi, '')
    .replace(/move\s*(?:还是|为|=|：|:)\s*[^，,。;；\s]+/gi, '')
    .replace(/(?:已经)?跑完了?|完成了?|结束了?/g, '')
    .replace(/[,，。;；]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return title || '未命名计算任务';
}

function ensureDevice(db: DatabaseSync, name: string | null) {
  if (!name) return null;
  const existing = listDevices(db).find((item) => item.name === name);
  return existing ?? createDevice(db, { name });
}

function findMatchingJob(
  db: DatabaseSync,
  deviceId: string | null,
  gamma: number | null,
  kPcm: number | null
) {
  return listComputeJobs(db).find((job) => {
    if (!['running', 'queued', 'paused'].includes(job.status)) return false;
    if (deviceId && job.device_id !== deviceId) return false;
    if (gamma !== null && job.gamma !== null && Math.abs(job.gamma - gamma) > 1e-12) return false;
    if (kPcm !== null && job.k_pcm !== null && Math.abs(job.k_pcm - kPcm) > 1e-12) return false;
    return true;
  }) ?? null;
}

export function smartCapture(db: DatabaseSync, rawText: string): SmartCaptureResult {
  const text = rawText.trim();
  if (!text) throw new Error('请输入要记录的信息。');

  const deviceName = extractDeviceName(text);
  const gamma = extractGamma(text);
  const kPcm = extractKpcm(text);
  const moveRule = extractMove(text);
  const device = ensureDevice(db, deviceName);
  const actions: Array<Record<string, unknown>> = [];

  const isComplete = /(跑完|完成|结束)/.test(text);
  const hasNewStart = /(开始|正在|测试|运行|跑)/.test(text);

  if (isComplete) {
    const oldJob = findMatchingJob(db, device?.id ?? null, gamma, kPcm);
    if (oldJob) {
      const completed = updateComputeJob(
        db,
        oldJob.id,
        { title: oldJob.title, status: 'completed' },
        'smart-capture'
      );
      actions.push({
        type: 'completed_job',
        id: completed.id,
        title: completed.title,
        device: completed.device_name,
        gamma: completed.gamma,
        kPcm: completed.k_pcm
      });
    }
  }

  const clauses = text.split(/(?:然后|现在开始|接着|同时|另外)/).map((part) => part.trim()).filter(Boolean);
  const startClause = isComplete && clauses.length > 1 ? clauses[clauses.length - 1] : text;
  const shouldCreate = hasNewStart && (!isComplete || clauses.length > 1 || /测试/.test(text));

  if (shouldCreate) {
    const startDeviceName = extractDeviceName(startClause) ?? deviceName;
    const startDevice = ensureDevice(db, startDeviceName);
    const startGamma = extractGamma(startClause) ?? (isComplete && clauses.length > 1 ? null : gamma);
    const startKpcm = extractKpcm(startClause) ?? kPcm;
    const title = cleanTitle(startClause, startDeviceName);

    const existing = findMatchingJob(db, startDevice?.id ?? null, startGamma, startKpcm);
    if (!existing || isComplete) {
      const job = createComputeJob(
        db,
        {
          title,
          deviceId: startDevice?.id ?? null,
          status: 'running',
          gamma: startGamma,
          kPcm: startKpcm,
          moveRule,
          notes: text
        },
        'smart-capture'
      );
      actions.push({
        type: 'started_job',
        id: job.id,
        title: job.title,
        device: job.device_name,
        gamma: job.gamma,
        kPcm: job.k_pcm,
        moveRule: job.move_rule
      });
    } else {
      const updated = updateComputeJob(
        db,
        existing.id,
        {
          title: existing.title,
          status: 'running',
          moveRule: moveRule ?? existing.move_rule,
          notes: text
        },
        'smart-capture'
      );
      actions.push({
        type: 'updated_job',
        id: updated.id,
        title: updated.title,
        device: updated.device_name
      });
    }
  }

  if (actions.length === 0) {
    const title = cleanTitle(text, deviceName);
    const job = createComputeJob(
      db,
      {
        title,
        deviceId: device?.id ?? null,
        status: 'running',
        gamma,
        kPcm,
        moveRule,
        notes: text
      },
      'smart-capture'
    );
    actions.push({
      type: 'started_job',
      id: job.id,
      title: job.title,
      device: job.device_name,
      gamma: job.gamma,
      kPcm: job.k_pcm
    });
  }

  const summary = actions
    .map((action) => {
      if (action.type === 'completed_job') return `已完成：${action.device ?? '未指定设备'} / ${action.title}`;
      if (action.type === 'started_job') return `已开始：${action.device ?? '未指定设备'} / ${action.title}`;
      return `已更新：${action.device ?? '未指定设备'} / ${action.title}`;
    })
    .join('；');

  return { summary, actions };
}
