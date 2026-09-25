import type { DatabaseSync } from 'node:sqlite';
import { smartCapture } from './smartCapture.js';
import { createTask } from './tasks.js';
import { createJobApplication, createKnowledgeItem, createScheduleItem } from './personalOps.js';

export type UnifiedCaptureResult = {
  category: 'research' | 'job_search' | 'schedule' | 'knowledge' | 'task';
  summary: string;
  record?: unknown;
  actions?: Array<Record<string, unknown>>;
};

function looksLikeResearch(text: string): boolean {
  return /(工作站|工位电脑|宿舍电脑|笔记本|俊俊电脑|gamma|γ|k[_\s-]*pcm|move|newton|迭代|obj|目标函数|残差|算例|跑程序|计算任务)/i.test(text);
}

function looksLikeKnowledge(text: string): boolean {
  return /(SOP|流程|步骤|技能|知识点|方法记录|操作记录|经验总结|我会|学会|掌握)/i.test(text);
}

function looksLikeJobSearch(text: string): boolean {
  return /(秋招|校招|投递|简历|笔试|面试|offer|HR|测评|一面|二面|终面)/i.test(text);
}

function looksLikeSchedule(text: string): boolean {
  return /(今天|明天|后天|周[一二三四五六日天]|星期[一二三四五六日天]|\d{1,2}[月\/.-]\d{1,2}|\d{1,2}[:：]\d{2}|上午|下午|晚上|截止|日程|提醒)/.test(text);
}

function extractCompany(text: string): string {
  const cleaned = text.replace(/^(我|已经|今天|明天|后天|目前|现在)\s*/g, '');
  const match = cleaned.match(/^([A-Za-z0-9一-龥·._-]{2,20}?)(?:的)?(?:秋招|校招|投递|笔试|面试|一面|二面|终面|offer|HR|测评)/i);
  return match?.[1] ?? '未指定公司';
}

function inferJobStatus(text: string): string {
  if (/offer/i.test(text)) return 'offer';
  if (/(面试|一面|二面|终面|HR面)/i.test(text)) return 'interview';
  if (/(笔试|测评)/i.test(text)) return 'written_test';
  if (/(投递|已投|申请)/i.test(text)) return 'applied';
  if (/(拒绝|挂了|未通过)/i.test(text)) return 'rejected';
  return 'wishlist';
}

function inferKnowledgeKind(text: string): 'sop' | 'skill' | 'note' {
  if (/(SOP|流程|步骤|操作)/i.test(text)) return 'sop';
  if (/(技能|我会|学会|掌握)/i.test(text)) return 'skill';
  return 'note';
}

export function unifiedCapture(db: DatabaseSync, rawText: string): UnifiedCaptureResult {
  const text = rawText.trim();
  if (!text) throw new Error('请输入要记录的信息。');

  if (looksLikeResearch(text)) {
    const result = smartCapture(db, text);
    return {
      category: 'research',
      summary: result.summary,
      actions: result.actions
    };
  }

  if (looksLikeKnowledge(text)) {
    const kind = inferKnowledgeKind(text);
    const item = createKnowledgeItem(db, {
      kind,
      title: text.length > 60 ? text.slice(0, 60) + '…' : text,
      content: text,
      category: kind === 'sop' ? 'SOP' : kind === 'skill' ? '技能' : '笔记'
    });
    return {
      category: 'knowledge',
      summary: kind === 'sop' ? '已保存为 SOP' : kind === 'skill' ? '已保存为技能记录' : '已保存为知识笔记',
      record: item
    };
  }

  if (looksLikeJobSearch(text)) {
    const company = extractCompany(text);
    const status = inferJobStatus(text);
    const application = createJobApplication(db, {
      company,
      status,
      notes: text,
      next_action: status === 'applied' ? '等待后续通知' : null
    });

    if (/(面试|笔试|测评)/i.test(text) && looksLikeSchedule(text)) {
      createScheduleItem(db, {
        title: company + ' ' + (status === 'interview' ? '面试' : '笔试/测评'),
        kind: status === 'interview' ? 'interview' : 'written_test',
        notes: text
      });
    }

    return {
      category: 'job_search',
      summary: `已记录秋招进展：${company} / ${status}`,
      record: application
    };
  }

  if (looksLikeSchedule(text)) {
    const item = createScheduleItem(db, {
      title: text.length > 60 ? text.slice(0, 60) + '…' : text,
      kind: /截止/.test(text) ? 'deadline' : /提醒/.test(text) ? 'reminder' : 'other',
      notes: text
    });
    return {
      category: 'schedule',
      summary: '已记录到日程',
      record: item
    };
  }

  const task = createTask(db, {
    title: text,
    status: 'next',
    priority: 'medium',
    importance: 3,
    urgency: 3
  }, 'unified-capture');

  return {
    category: 'task',
    summary: '已记录为普通待办',
    record: task
  };
}
