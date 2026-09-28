import type { DatabaseSync } from 'node:sqlite';
import { completeTask, createTask, listPlanningTasks, trashTask, updateTaskFields } from './tasks.js';
import { addTaskPoint, addTaskStep, setTaskStarred } from './taskDetails.js';
import { createJobApplication, createKnowledgeItem, createScheduleItem } from './personalOps.js';
import { unifiedCapture, type UnifiedCaptureResult } from './unifiedCapture.js';

type AiAction =
  | { type: 'task'; title: string; status?: 'today'|'next'|'scheduled'|'waiting'|'someday'; priority?: 'low'|'medium'|'high'; start_at?: string|null; deadline_at?: string|null; reminder_at?: string|null; notes?: string|null; starred?: boolean; steps?: string[]; points?: string[] }
  | { type: 'update_task'; task_id: string; title?: string; status?: 'today'|'next'|'scheduled'|'waiting'|'someday'|'completed'; priority?: 'low'|'medium'|'high'; start_at?: string|null; deadline_at?: string|null; reminder_at?: string|null; notes?: string|null; starred?: boolean }
  | { type: 'delete_task'; task_id: string }
  | { type: 'add_step'; task_id: string; title: string }
  | { type: 'add_point'; task_id: string; content: string }
  | { type: 'schedule'; title: string; kind?: string; start_at?: string|null; end_at?: string|null; reminder_at?: string|null; location?: string|null; notes?: string|null }
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

export async function aiCapture(db: DatabaseSync, text: string, options: { forcedStartAt?: string | null } = {}): Promise<UnifiedCaptureResult & { provider: string }> {
  const key = process.env.DEEPSEEK_API_KEY?.trim();
  if (!key) {
    if (options.forcedStartAt) {
      const task = createTask(db, {
        title: text.trim(),
        status: 'next',
        priority: 'medium',
        importance: 3,
        urgency: 3,
        startAt: options.forcedStartAt
      }, 'local');
      return {
        category: 'task',
        summary: '已按指定日期保存任务',
        actions: [{ index: 0 }],
        provider: 'local'
      };
    }
    return { ...unifiedCapture(db, text), provider: 'local' };
  }

  const localNow = localClockContext();
  const activeTasks = listPlanningTasks(db).slice(0, 50).map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    start_at: task.start_at,
    deadline_at: task.deadline_at,
    reminder_at: task.reminder_at,
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
update_task字段：task_id,title,status(today/next/scheduled/waiting/someday/completed),priority,start_at,deadline_at,reminder_at,notes,starred。start_at是计划执行时间；deadline_at是截止时间；二者不能混用。
delete_task字段：task_id。
add_step字段：task_id,title。
add_point字段：task_id,content。
如果用户说“这两个任务”“上面的任务”“今天这两个”等，要根据已有任务列表匹配对应task_id并分别生成动作。
如果用户只说“明天”“后天”而没有具体时刻，deadline_at只写YYYY-MM-DD，不要擅自添加09:00。
task字段：title,status(today/next/scheduled/waiting/someday),priority(low/medium/high),start_at(计划执行时间，ISO或YYYY-MM-DD或null),deadline_at(截止时间，ISO或null),reminder_at(提醒时间，带本地时区偏移的ISO或null),notes,starred(boolean),steps(string数组),points(string数组)。计划执行时间、截止时间、提醒时间是三个独立概念，不能互相替代。有明确计划执行日期时填写start_at。用户明确说“提醒我”时必须填写reminder_at；例如今晚20:00应转换为包含当前本地时区偏移的完整ISO时间。
steps只放“需要逐项完成”的子任务；points只放“重要提醒/要点/约束”，不要把同一句同时放进steps和points。用户说“重要/很重要/优先”时starred=true。
时间分层：今天必须做= today；本周/近期/无明确长期字样=next；等待别人/结果=waiting；长期/以后/有空再做=someday。
时间字段语义必须严格区分：
- “安排到/挪到/推迟到/改到某天做/准备某天做”表示计划执行时间，填写 start_at，不要修改 deadline_at。
- “截止/最晚/DDL/必须在某时前完成”才填写 deadline_at。
- “提醒我/到点叫我”才填写 reminder_at。
修改已有任务时，只修改用户明确要求变化的字段；没有提到的状态、截止时间、提醒时间等必须保持不变。
如果用户说“提醒我做某事/到点提醒我做某事”，必须创建或更新 task，不要创建 schedule；若没有另外指定计划执行时间，则 start_at 与 reminder_at 使用同一时间。
schedule只用于“固定发生的事件”，例如面试、笔试、会议、考试，字段title,kind(interview/written_test/meeting/exam/other),start_at,end_at,reminder_at,location,notes。
不要把任务DDL单独创建为schedule；“论文周五截止”应是task.deadline_at。
不要把“提醒我做某事”创建为schedule；它应是task.reminder_at，并在未指定计划时间时让task.start_at=reminder_at。
如果固定事件同时说“提前30分钟提醒/某时提醒”，schedule.reminder_at必须填写对应的完整ISO时间。
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
        startAt: options.forcedStartAt ?? action.start_at ?? action.reminder_at,
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
        startAt: options.forcedStartAt ?? action.start_at ?? action.reminder_at ?? null,
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
        reminder_at: action.reminder_at ?? null,
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
