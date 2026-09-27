import type { DatabaseSync } from 'node:sqlite';
import { createTask } from './tasks.js';
import { createJobApplication, createKnowledgeItem, createScheduleItem } from './personalOps.js';
import { unifiedCapture, type UnifiedCaptureResult } from './unifiedCapture.js';

type AiAction =
  | { type: 'task'; title: string; status?: 'today'|'next'|'waiting'|'someday'; priority?: 'low'|'medium'|'high'; deadline_at?: string|null; notes?: string|null }
  | { type: 'schedule'; title: string; kind?: string; start_at?: string|null; end_at?: string|null; location?: string|null; notes?: string|null }
  | { type: 'job'; company: string; role?: string|null; status?: string; next_action?: string|null; deadline_at?: string|null; event_at?: string|null; notes?: string|null }
  | { type: 'knowledge'; kind: 'sop'|'skill'|'note'; title: string; category?: string|null; content?: string|null };

function stripFence(s: string): string {
  return s.trim().replace(/^\`\`\`(?:json)?\s*/i, '').replace(/\s*\`\`\`$/, '');
}

export async function aiCapture(db: DatabaseSync, text: string): Promise<UnifiedCaptureResult & { provider: string }> {
  const key = process.env.DEEPSEEK_API_KEY?.trim();
  if (!key) return { ...unifiedCapture(db, text), provider: 'local' };

  const today = new Date().toISOString().slice(0,10);
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${key}`
    },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-flash',
      stream: false,
      messages: [
        {
          role: 'system',
          content: `你是个人事务数据库解析器。今天是 ${today}。把用户输入拆成一个或多个动作，只输出JSON，不要解释。
JSON格式：{"actions":[...],"summary":"简短确认"}。
action type只能是task/schedule/job/knowledge。
task字段：title,status(today/next/waiting/someday),priority(low/medium/high),deadline_at(ISO或null),notes。
时间分层：今天必须做= today；本周/近期/无明确长期字样=next；等待别人/结果=waiting；长期/以后/有空再做=someday。
schedule用于有明确时间点的面试、笔试、会议、截止、提醒，字段title,kind(deadline/interview/written_test/meeting/exam/reminder/other),start_at,end_at,location,notes。
job用于秋招进展，字段company,role,status(wishlist/applied/written_test/interview/offer/rejected/withdrawn/closed),next_action,deadline_at,event_at,notes。
knowledge用于SOP/技能/长期知识，字段kind(sop/skill/note),title,category,content。
同一句可生成多个action。优先级按实际重要程度判断，不要把所有事项都设为high。日期无法确定时填null。`
        },
        { role: 'user', content: text }
      ]
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`DeepSeek API 调用失败：${response.status} ${detail.slice(0,200)}`);
  }

  const payload = await response.json() as any;
  const raw = payload?.choices?.[0]?.message?.content;
  if (!raw) throw new Error('DeepSeek 没有返回可解析内容。');
  const parsed = JSON.parse(stripFence(String(raw))) as { actions?: AiAction[]; summary?: string };
  const actions = Array.isArray(parsed.actions) ? parsed.actions : [];
  const saved: unknown[] = [];

  for (const action of actions) {
    if (action.type === 'task') {
      saved.push(createTask(db, {
        title: action.title,
        status: action.status ?? 'next',
        priority: action.priority ?? 'medium',
        importance: action.priority === 'high' ? 5 : action.priority === 'low' ? 2 : 3,
        urgency: action.status === 'today' ? 5 : 3,
        deadlineAt: action.deadline_at ?? null,
        notes: action.notes ?? null
      }, 'deepseek'));
    } else if (action.type === 'schedule') {
      saved.push(createScheduleItem(db, {
        title: action.title,
        kind: action.kind ?? 'other',
        start_at: action.start_at ?? null,
        end_at: action.end_at ?? null,
        location: action.location ?? null,
        notes: action.notes ?? null
      }));
    } else if (action.type === 'job') {
      saved.push(createJobApplication(db, {
        company: action.company,
        role: action.role ?? null,
        status: action.status ?? 'wishlist',
        next_action: action.next_action ?? null,
        deadline_at: action.deadline_at ?? null,
        event_at: action.event_at ?? null,
        notes: action.notes ?? text
      }));
    } else if (action.type === 'knowledge') {
      saved.push(createKnowledgeItem(db, {
        kind: action.kind,
        title: action.title,
        category: action.category ?? null,
        content: action.content ?? text
      }));
    }
  }

  return {
    category: 'task',
    summary: parsed.summary || `DeepSeek 已处理并保存 ${saved.length} 项`,
    actions: saved.map((_, i) => ({ index: i })),
    provider: 'deepseek'
  };
}
