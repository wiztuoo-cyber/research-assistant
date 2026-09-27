import { Check, CalendarDays, BriefcaseBusiness, BookOpen, RefreshCw, Sparkles } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

interface Task {
  id: string;
  title: string;
  status: 'today'|'next'|'waiting'|'someday'|'scheduled'|string;
  priority: 'low'|'medium'|'high';
  importance: number;
  deadline_at: string | null;
}

interface ScheduleItem {
  id: string;
  title: string;
  kind: string;
  start_at: string | null;
  status: string;
}

interface JobApplication {
  id: string;
  company: string;
  role: string | null;
  status: string;
  next_action: string | null;
  event_at: string | null;
}

interface KnowledgeItem {
  id: string;
  kind: string;
  title: string;
  category: string | null;
  content: string | null;
}

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options?.headers ?? {})
    }
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `请求失败：${response.status}`);
  }
  return response.json() as Promise<T>;
}

function priorityText(priority: Task['priority']) {
  return priority === 'high' ? '重要' : priority === 'low' ? '低优先级' : '普通';
}

function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeItem[]>([]);
  const [smartInput, setSmartInput] = useState('');
  const [smartResult, setSmartResult] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => { void refresh(); }, []);

  async function refresh() {
    const [planning, personal] = await Promise.all([
      api<{ tasks: Task[] }>('/api/tasks/planning'),
      api<{ schedule: ScheduleItem[]; applications: JobApplication[]; knowledge: KnowledgeItem[] }>('/api/personal/dashboard')
    ]);
    setTasks(planning.tasks);
    setScheduleItems(personal.schedule);
    setApplications(personal.applications);
    setKnowledgeItems(personal.knowledge);
  }

  async function submitSmartCapture(event: React.FormEvent) {
    event.preventDefault();
    if (!smartInput.trim()) return;
    try {
      const response = await api<{ summary: string; provider?: string }>('/api/personal/capture', {
        method: 'POST',
        body: JSON.stringify({ text: smartInput })
      });
      setSmartResult(`${response.summary}${response.provider ? ` · ${response.provider === 'deepseek' ? 'DeepSeek AI' : '本地解析'}` : ''}`);
      setSmartInput('');
      setMessage('已写入本地数据库');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function completeTask(taskId: string) {
    await api(`/api/tasks/${taskId}/complete`, {
      method: 'POST',
      body: JSON.stringify({ createdBy: 'web' })
    });
    await refresh();
  }

  const groups = useMemo(() => ({
    today: tasks.filter((t) => t.status === 'today'),
    week: tasks.filter((t) => t.status === 'next' || t.status === 'scheduled'),
    waiting: tasks.filter((t) => t.status === 'waiting'),
    long: tasks.filter((t) => t.status === 'someday')
  }), [tasks]);

  function taskList(items: Task[], empty: string) {
    if (!items.length) return <p className="empty-state">{empty}</p>;
    return (
      <ul className="task-list">
        {items.map((task) => (
          <li key={task.id}>
            <div>
              <strong>{task.title}</strong>
              <small>{priorityText(task.priority)}{task.deadline_at ? ` · 截止 ${new Date(task.deadline_at).toLocaleString()}` : ''}</small>
            </div>
            <button className="icon-button" type="button" title="完成" onClick={() => void completeTask(task.id)}>
              <Check size={17} />
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>私人助理</h1>
          <p>日程、秋招、待办与 SOP 都保存在本地 SQLite</p>
        </div>
        <button className="icon-button" type="button" onClick={() => void refresh()} title="刷新">
          <RefreshCw size={18} />
        </button>
      </header>

      {message ? <div className="status-line">{message}</div> : null}

      <section className="smart-capture-panel">
        <div className="panel-heading">
          <Sparkles size={19} />
          <h2>直接告诉助理发生了什么</h2>
        </div>
        <form className="smart-capture-form" onSubmit={(event) => void submitSmartCapture(event)}>
          <textarea
            value={smartInput}
            onChange={(event) => setSmartInput(event.target.value)}
            placeholder="例如：今天把论文回复改完，周三下午三点OPPO二面；记录一个ANSYS重建SOP"
            rows={3}
          />
          <button type="submit"><Sparkles size={17} />智能记录</button>
        </form>
        {smartResult ? <div className="smart-result">{smartResult}</div> : null}
      </section>

      <section className="planning-grid">
        <div className="panel task-bucket important-bucket">
          <div className="panel-heading"><Check size={19}/><h2>今天</h2></div>
          {taskList(groups.today, '今天暂无任务。')}
        </div>
        <div className="panel task-bucket">
          <div className="panel-heading"><CalendarDays size={19}/><h2>本周 / 近期</h2></div>
          {taskList(groups.week, '暂无本周或近期任务。')}
        </div>
        <div className="panel task-bucket">
          <div className="panel-heading"><RefreshCw size={19}/><h2>等待跟进</h2></div>
          {taskList(groups.waiting, '暂无等待事项。')}
        </div>
        <div className="panel task-bucket">
          <div className="panel-heading"><BookOpen size={19}/><h2>长期任务</h2></div>
          {taskList(groups.long, '暂无长期任务。')}
        </div>
      </section>

      <section className="personal-grid">
        <div className="panel">
          <div className="panel-heading"><CalendarDays size={19}/><h2>硬日程</h2></div>
          <ul className="simple-list stacked-list">
            {scheduleItems.slice(0, 10).map((item) => (
              <li key={item.id}><div><strong>{item.title}</strong><small>{item.kind}{item.start_at ? ` · ${new Date(item.start_at).toLocaleString()}` : ''}</small></div></li>
            ))}
          </ul>
          {!scheduleItems.length ? <p className="empty-state">暂无面试、笔试、会议或截止日程。</p> : null}
        </div>

        <div className="panel">
          <div className="panel-heading"><BriefcaseBusiness size={19}/><h2>秋招进展</h2></div>
          <ul className="simple-list stacked-list">
            {applications.slice(0, 10).map((item) => (
              <li key={item.id}><div><strong>{item.company}</strong><small>{item.role ?? '未填写岗位'} · {item.status}</small>{item.next_action ? <small>下一步：{item.next_action}</small> : null}</div></li>
            ))}
          </ul>
          {!applications.length ? <p className="empty-state">暂无秋招记录。</p> : null}
        </div>

        <div className="panel">
          <div className="panel-heading"><BookOpen size={19}/><h2>SOP / 技能 / 知识</h2></div>
          <ul className="simple-list stacked-list">
            {knowledgeItems.slice(0, 10).map((item) => (
              <li key={item.id}><div><strong>{item.title}</strong><small>{item.category ?? item.kind}</small></div></li>
            ))}
          </ul>
          {!knowledgeItems.length ? <p className="empty-state">暂无知识记录。</p> : null}
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>
);
