import type { DatabaseSync } from 'node:sqlite';
import { completeTask, createTask, listPlanningTasks, trashTask, updateTaskFields } from './tasks.js';
import { addTaskPoint, addTaskStep, setTaskStarred } from './taskDetails.js';
import { createJobApplication, createKnowledgeItem, createScheduleItem } from './personalOps.js';
import { unifiedCapture, type UnifiedCaptureResult } from './unifiedCapture.js';

type AiAction =
  | { type: 'task'; title: string; status?: 'today'|'next'|'scheduled'|'waiting'|'someday'; priority?: 'low'|'medium'|'high'; deadline_at?: string|null; reminder_at?: string|null; notes?: string|null; starred?: boolean; steps?: string[]; points?: string[] }
  | { type: 'update_task'; task_id: string; title?: string; status?: 'today'|'next'|'scheduled'|'waiting'|'someday'|'completed'; priority?: 'low'|'medium'|'high'; deadline_at?: string|null; reminder_at?: string|null; notes?: string|null; starred?: boolean }
  | { type: 'delete_task'; task_id: string }
  | { type: 'add_step'; task_id: string; title: string }
  | { type: 'add_point'; task_id: string; content: string }
  | { type: 'schedule'; title: string; kind?: string; start_at?: string|null; end_at?: string|null; location?: string|null; notes?: string|null }
  | { type: 'job'; company: string; role?: string|null; status?: string; next_action?: string|null; deadline_at?: string|null; event_at?: string|null; notes?: string|null }
  | { type: 'knowledge'; kind: 'sop'|'skill'|'note'; title: string; category?: string|null; content?: string|null };

function localClockContext(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const offsetMinutes = -d.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const offset = `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  const weekday = new Intl.DateTimeFormat('zh-CN', { weekday: 'long' }).format(d);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${weekday} UTC${offset}`;
}

function stripFence(s: string): string {
  return s.trim().replace(/^\`\`\`(?:json)?\s*/i, '').replace(/\s*\`\`\`$/, '');
}

export async function aiCapture(db: DatabaseSync, text: string): Promise<UnifiedCaptureResult & { provider: string }> {
  const key = process.env.DEEPSEEK_API_KEY?.trim();
  if (!key) return { ...unifiedCapture(db, text), provider: 'local' };

  const localNow = localClockContext();
  const activeTasks = listPlanningTasks(db).slice(0, 50).map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    deadline_at: task.deadline_at,
    starred: task.starred
  }));
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
          content: `你是个人事务数据库解析器。当前本地日期、时间和时区是 ${localNow}。所有“今天/明天/周几/今晚/下午”等表达都必须以这个本地时间为准。把用户输入拆成一个或多个动作，只输出JSON，不要解释。
JSON格式：{"actions":[...],"summary":"简短确认"}。
action type只能是task/update_task/delete_task/add_step/add_point/schedule/job/knowledge。
如果用户是在延期、修改、完成、等待、删除一个已经存在的任务，必须操作已有任务，不要新建重复任务。
当前已有任务会附在用户消息后面。
update_task字段：task_id,title,status(today/next/scheduled/waiting/someday/completed),priority,deadline_at,reminder_at,notes,starred。
delete_task字段：task_id。
add_step字段：task_id,title。
add_point字段：task_id,content。
如果用户说“这两个任务”“上面的任务”“今天这两个”等，要根据已有任务列表匹配对应task_id并分别生成动作。
如果用户只说“明天”“后天”而没有具体时刻，deadline_at只写YYYY-MM-DD，不要擅自添加09:00。
task字段：title,status(today/next/scheduled/waiting/someday),priority(low/medium/high),deadline_at(ISO或null),reminder_at(带本地时区偏移的ISO或null),notes,starred(boolean),steps(string数组),points(string数组)。有明确日期但不属于“今天”的计划任务可用scheduled。用户明确说“提醒我”时必须填写reminder_at；例如今晚20:00应转换为包含当前本地时区偏移的完整ISO时间。
steps只放“需要逐项完成”的子任务；points只放“重要提醒/要点/约束”，不要把同一句同时放进steps和points。用户说“重要/很重要/优先”时starred=true。
时间分层：今天必须做= today；本周/近期/无明确长期字样=next；等待别人/结果=waiting；长期/以后/有空再做=someday。
schedule用于有明确时间点的面试、笔试、会议、截止、提醒，字段title,kind(deadline/interview/written_test/meeting/exam/reminder/other),start_at,end_at,location,notes。
job用于秋招进展，字段company,role,status(wishlist/applied/written_test/interview/offer/rejected/withdrawn/closed),next_action,deadline_at,event_at,notes。
knowledge用于SOP/技能/长期知识，字段kind(sop/skill/note),title,category,content。
同一句可生成多个action。优先级按实际重要程度判断，不要把所有事项都设为high。日期无法确定时填null。`
        },
        { role: 'user', content: `${text}\n\n当前已有任务：${JSON.stringify(activeTasks)}` }
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
    if (action.type === 'update_task') {
      if (action.status === 'completed') {
        const completed = completeTask(db, action.task_id, 'deepseek');
        if (action.starred !== undefined) setTaskStarred(db, action.task_id, action.starred);
        saved.push(completed);
        continue;
      }
      const updated = updateTaskFields(db, action.task_id, {
        title: action.title,
        status: action.status,
        priority: action.priority,
        importance: action.priority === 'high' ? 5 : action.priority === 'low' ? 2 : undefined,
        urgency: action.status === 'today' ? 5 : action.status ? 3 : undefined,
        deadlineAt: action.deadline_at,
        reminderAt: action.reminder_at,
        notes: action.notes
      }, 'deepseek');
      if (action.starred !== undefined) setTaskStarred(db, action.task_id, action.starred);
      saved.push(updated);
    } else if (action.type === 'delete_task') {
      saved.push(trashTask(db, action.task_id, 'deepseek'));
    } else if (action.type === 'add_step') {
      saved.push(addTaskStep(db, action.task_id, action.title));
    } else if (action.type === 'add_point') {
      saved.push(addTaskPoint(db, action.task_id, action.content));
    } else if (action.type === 'task') {
      const task = createTask(db, {
        title: action.title,
        status: action.status ?? 'next',
        priority: action.priority ?? 'medium',
        importance: action.priority === 'high' ? 5 : action.priority === 'low' ? 2 : 3,
        urgency: action.status === 'today' ? 5 : 3,
        deadlineAt: action.deadline_at ?? null,
        reminderAt: action.reminder_at ?? null,
        notes: action.notes ?? null
      }, 'deepseek');
      if (action.starred) setTaskStarred(db, task.id, true);
      for (const step of action.steps ?? []) if (step?.trim()) addTaskStep(db, task.id, step);
      for (const point of action.points ?? []) if (point?.trim()) addTaskPoint(db, task.id, point);
      saved.push(task);
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
