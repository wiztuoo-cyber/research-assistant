import { Check, CalendarDays, BriefcaseBusiness, BookOpen, RefreshCw, Sparkles, Star, X, Plus, Trash2, RotateCcw, Settings, Save } from 'lucide-react';
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
  start_at: string | null;
  reminder_at: string | null;
  starred?: boolean;
}

interface TaskStep {
  id: string;
  task_id: string;
  title: string;
  completed: boolean;
  position: number;
}

interface TaskPoint {
  id: string;
  task_id: string;
  content: string;
  position: number;
}

interface TaskDetailsResponse {
  task: Task & { notes: string | null; starred: boolean };
  steps: TaskStep[];
  points: TaskPoint[];
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
    headers: { 'content-type': 'application/json', ...(options?.headers ?? {}) }
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `请求失败：${response.status}`);
  }
  const data = await response.json() as T;
  const method = (options?.method ?? 'GET').toUpperCase();
  if (method !== 'GET') {
    try { localStorage.setItem('assistant-data-revision', String(Date.now())); } catch {}
  }
  return data;
}


function dateOnlyLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function startOfWeekMonday(now = new Date()): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekday = d.getDay() || 7;
  d.setDate(d.getDate() - weekday + 1);
  return d;
}

function WeekPlanner() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [input, setInput] = useState('');
  const [aiEnabled, setAiEnabled] = useState(() => localStorage.getItem('week-planner-ai') === '1');
  const [opacity, setOpacity] = useState(() => Number(localStorage.getItem('week-planner-opacity') ?? '0.94'));
  const [message, setMessage] = useState('');
  const [now, setNow] = useState(new Date());
  const [selectedTask, setSelectedTask] = useState<TaskDetailsResponse | null>(null);

  useEffect(() => {
    void refreshPlanner();
    const clockTimer = window.setInterval(() => setNow(new Date()), 30000);
    const dataTimer = window.setInterval(() => { void refreshPlanner(); }, 10000);
    const onStorage = (event: StorageEvent) => { if (event.key === 'assistant-data-revision') void refreshPlanner(); };
    window.addEventListener('storage', onStorage);
    return () => { window.clearInterval(clockTimer); window.clearInterval(dataTimer); window.removeEventListener('storage', onStorage); };
  }, []);

  useEffect(() => { localStorage.setItem('week-planner-ai', aiEnabled ? '1' : '0'); }, [aiEnabled]);

  useEffect(() => {
    const safe = Math.max(0.58, Math.min(1, opacity));
    localStorage.setItem('week-planner-opacity', String(safe));
    void api('/api/desktop/widget/opacity', { method: 'POST', body: JSON.stringify({ opacity: safe }) }).catch(() => {});
  }, [opacity]);

  async function refreshPlanner() {
    const result = await api<{ tasks: Task[] }>('/api/tasks/planning');
    setTasks(result.tasks);
  }

  async function openPlannerTask(taskId: string) {
    setSelectedTask(await api<TaskDetailsResponse>('/api/tasks/' + taskId + '/details'));
  }

  const weekDays = useMemo(() => {
    const monday = startOfWeekMonday(now);
    return Array.from({ length: 7 }, (_, index) => {
      const d = new Date(monday); d.setDate(monday.getDate() + index);
      return { key: dateOnlyLocal(d), weekday: ['周一','周二','周三','周四','周五','周六','周日'][index] };
    });
  }, [now]);

  const weekKeys = useMemo(() => new Set(weekDays.map((d) => d.key)), [weekDays]);

  const allTasks = useMemo(() => [...tasks].sort((a, b) => {
    if (Boolean(a.starred) !== Boolean(b.starred)) return a.starred ? -1 : 1;
    const aPlan = a.start_at?.slice(0, 10) ?? '9999-99-99';
    const bPlan = b.start_at?.slice(0, 10) ?? '9999-99-99';
    if (aPlan !== bPlan) return aPlan.localeCompare(bPlan);
    if (a.deadline_at && b.deadline_at) return a.deadline_at.localeCompare(b.deadline_at);
    if (a.deadline_at) return -1; if (b.deadline_at) return 1;
    return a.title.localeCompare(b.title, 'zh-CN');
  }), [tasks]);

  function tasksForDay(key: string) {
    return tasks.filter((task) => task.start_at?.slice(0, 10) === key).sort((a,b) => (a.start_at ?? '').localeCompare(b.start_at ?? ''));
  }

  function dayLabelForTask(task: Task): string | null {
    const key = task.start_at?.slice(0, 10);
    if (!key || !weekKeys.has(key)) return null;
    return weekDays.find((item) => item.key === key)?.weekday ?? null;
  }

  async function addTask(text: string, date?: string) {
    const value = text.trim(); if (!value) return;
    try {
      if (aiEnabled) {
        const aiText = date ? value + '。这是计划执行日期：' + date + '，不是截止日期；请将 start_at 设为这一天，并保留用户明确提到的截止日期和提醒时间。' : value;
        const result = await api<{ summary: string }>('/api/personal/capture', { method: 'POST', body: JSON.stringify({ text: aiText }) });
        setMessage(result.summary);
      } else {
        await api('/api/tasks', { method: 'POST', body: JSON.stringify({ createdBy: 'week-planner', task: { title: value, status: 'next', priority: 'medium', startAt: date ?? null } }) });
        setMessage(date ? '已加入当天计划' : '已加入任务');
      }
      setInput(''); await refreshPlanner();
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  }

  function quickAddForDay(day: { key: string; weekday: string }) {
    const value = window.prompt(day.weekday + ' · ' + day.key + '\n输入任务');
    if (value?.trim()) void addTask(value, day.key);
  }

  async function planTask(taskId: string, date: string | null) {
    await api('/api/tasks/' + taskId, { method: 'PATCH', body: JSON.stringify({ createdBy: 'week-planner', task: { startAt: date } }) });
    await refreshPlanner();
    if (selectedTask?.task.id === taskId) await openPlannerTask(taskId);
  }

  function dragStart(event: React.DragEvent, taskId: string) { event.dataTransfer.setData('text/task-id', taskId); event.dataTransfer.effectAllowed = 'move'; }
  function allowDrop(event: React.DragEvent) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }
  function dropOnDate(event: React.DragEvent, date: string | null) { event.preventDefault(); const taskId = event.dataTransfer.getData('text/task-id'); if (taskId) void planTask(taskId, date); }

  async function completePlannerTask(taskId: string) {
    await api('/api/tasks/' + taskId + '/complete', { method: 'POST', body: JSON.stringify({ createdBy: 'week-planner' }) });
    if (selectedTask?.task.id === taskId) setSelectedTask(null);
    await refreshPlanner();
  }

  async function togglePlannerStep(step: TaskStep) {
    await api('/api/tasks/steps/' + step.id, { method: 'PATCH', body: JSON.stringify({ completed: !step.completed }) });
    if (selectedTask) await openPlannerTask(selectedTask.task.id);
  }

  const todayKey = dateOnlyLocal(now);
  const clock = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(now);

  function planTime(task: Task): string | null {
    if (!task.start_at || task.start_at.length <= 10) return null;
    const d = new Date(task.start_at); if (Number.isNaN(d.getTime())) return null;
    return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  }

  function plannerTask(task: Task, compact = false) {
    const plannedDay = dayLabelForTask(task); const time = planTime(task);
    return (
      <div className={compact ? 'planner-task compact' : 'planner-task'} key={task.id} draggable onDragStart={(e) => dragStart(e, task.id)}>
        <button className='planner-check' type='button' title='完成' onClick={(e) => { e.stopPropagation(); void completePlannerTask(task.id); }}><Check size={13}/></button>
        <button className='planner-task-title' type='button' onClick={(e) => { e.stopPropagation(); void openPlannerTask(task.id); }} onDoubleClick={(e) => e.stopPropagation()} title='点击查看详情与子任务'>
          <span>{task.starred ? '★ ' : ''}{time ? time + ' ' : ''}{task.title}</span>
          {!compact && plannedDay ? <small>{plannedDay}</small> : null}
        </button>
      </div>
    );
  }

  return (
    <main className='week-planner-shell'>
      <header className='week-planner-header'>
        <form className='planner-capture' onSubmit={(e) => { e.preventDefault(); void addTask(input); }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder='输入一个任务……' />
          <button type='submit'>添加</button>
        </form>
        <label className='ai-toggle widget-control'><span>AI</span><input type='checkbox' checked={aiEnabled} onChange={(e) => setAiEnabled(e.target.checked)} /><span className='toggle-track'><span /></span><small>{aiEnabled ? '开' : '关'}</small></label>
        <label className='opacity-control widget-control' title='调整桌面挂件透明度'><span>透明度</span><input type='range' min='0.58' max='1' step='0.02' value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} /></label>
        <span className='planner-clock'>{clock}</span>
      </header>
      {message ? <div className='planner-message'>{message}</div> : null}
      <section className='planner-board'>
        <aside className='planner-all' onDragOver={allowDrop} onDrop={(e) => dropOnDate(e, null)}>
          <div className='planner-section-title'><div><strong>所有任务</strong><small>拖到右侧只安排执行日期</small></div><span>{allTasks.length}</span></div>
          <div className='planner-task-stack'>{allTasks.map((task) => plannerTask(task))}{!allTasks.length ? <p className='planner-empty'>暂无任务</p> : null}</div>
        </aside>
        <section className='planner-week'>
          <div className='planner-section-title'><div><strong>本周</strong><small>双击空白添加 · 拖动改计划日期</small></div><span>{weekDays[0].key.slice(5)} — {weekDays[6].key.slice(5)}</span></div>
          <div className='planner-days'>
            {weekDays.map((day) => {
              const dayTasks = tasksForDay(day.key); const isToday = day.key === todayKey;
              return <div key={day.key} className={isToday ? 'planner-day today' : 'planner-day'} onDoubleClick={() => quickAddForDay(day)} onDragOver={allowDrop} onDrop={(e) => dropOnDate(e, day.key)}>
                <div className='planner-day-head'><strong>{day.weekday}</strong><span>{day.key.slice(5).replace('-', '/')}</span>{isToday ? <em>今天</em> : null}</div>
                <div className='planner-day-tasks'>{dayTasks.map((task) => plannerTask(task, true))}{!dayTasks.length ? <span className='planner-day-hint'>双击添加</span> : null}</div>
              </div>;
            })}
          </div>
        </section>
      </section>
      {selectedTask ? <div className='planner-detail-backdrop' onClick={() => setSelectedTask(null)}>
        <aside className='planner-detail' onClick={(e) => e.stopPropagation()}>
          <div className='planner-detail-head'><div><small>任务详情</small><h3>{selectedTask.task.starred ? '★ ' : ''}{selectedTask.task.title}</h3></div><button type='button' className='planner-detail-close' onClick={() => setSelectedTask(null)}><X size={17}/></button></div>
          {selectedTask.task.notes ? <p className='planner-detail-notes'>{selectedTask.task.notes}</p> : null}
          <div className='planner-detail-meta'>
            {selectedTask.task.start_at ? <span>计划：{selectedTask.task.start_at.replace('T',' ').slice(0,16)}</span> : null}
            {selectedTask.task.deadline_at ? <span>截止：{selectedTask.task.deadline_at.replace('T',' ').slice(0,16)}</span> : null}
            {selectedTask.task.reminder_at ? <span>提醒：{new Date(selectedTask.task.reminder_at).toLocaleString()}</span> : null}
          </div>
          <section><h4>子任务</h4>{selectedTask.steps.length ? <div className='planner-subtasks'>{selectedTask.steps.map((step) => <button key={step.id} type='button' onClick={() => void togglePlannerStep(step)} className={step.completed ? 'planner-subtask done' : 'planner-subtask'}><span className='subtask-box'>{step.completed ? '✓' : ''}</span><span>{step.title}</span></button>)}</div> : <p className='planner-empty'>暂无子任务</p>}</section>
          {selectedTask.points.length ? <section><h4>要点</h4><ul className='planner-points'>{selectedTask.points.map((point) => <li key={point.id}>{point.content}</li>)}</ul></section> : null}
          <div className='planner-detail-actions'><button type='button' onClick={() => void completePlannerTask(selectedTask.task.id)}>完成任务</button></div>
        </aside>
      </div> : null}
    </main>
  );
}

function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeItem[]>([]);
  const [completedTasks, setCompletedTasks] = useState<Task[]>([]);
  const [trashedTasks, setTrashedTasks] = useState<Task[]>([]);
  const [showLongTerm, setShowLongTerm] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [selectedKnowledge, setSelectedKnowledge] = useState<KnowledgeItem | null>(null);
  const [knowledgeTitle, setKnowledgeTitle] = useState('');
  const [knowledgeContent, setKnowledgeContent] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [aiModel, setAiModel] = useState('deepseek-flash');
  const [aiConfigured, setAiConfigured] = useState(false);
  const [smartInput, setSmartInput] = useState('');
  const [smartResult, setSmartResult] = useState('');
  const [message, setMessage] = useState('');
  const [selectedTask, setSelectedTask] = useState<TaskDetailsResponse | null>(null);
  const [newStep, setNewStep] = useState('');
  const [newPoint, setNewPoint] = useState('');

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 10000);
    const onStorage = (event: StorageEvent) => { if (event.key === 'assistant-data-revision') void refresh(); };
    window.addEventListener('storage', onStorage);
    return () => { window.clearInterval(timer); window.removeEventListener('storage', onStorage); };
  }, []);

  async function refresh() {
    const [planning, personal, completed, trashed, settings] = await Promise.all([
      api<{ tasks: Task[] }>('/api/tasks/planning'),
      api<{ schedule: ScheduleItem[]; applications: JobApplication[]; knowledge: KnowledgeItem[] }>('/api/personal/dashboard'),
      api<{ tasks: Task[] }>('/api/tasks/completed?limit=50'),
      api<{ tasks: Task[] }>('/api/tasks/trash?limit=50'),
      api<{ configured: boolean; model: string }>('/api/settings/ai')
    ]);
    setTasks(planning.tasks);
    setScheduleItems(personal.schedule);
    setApplications(personal.applications);
    setKnowledgeItems(personal.knowledge);
    setCompletedTasks(completed.tasks);
    setTrashedTasks(trashed.tasks);
    setAiConfigured(settings.configured);
    setAiModel(settings.model);
  }

  async function openTask(taskId: string) {
    setSelectedTask(await api<TaskDetailsResponse>(`/api/tasks/${taskId}/details`));
  }

  function openKnowledge(item: KnowledgeItem) {
    setSelectedKnowledge(item);
    setKnowledgeTitle(item.title);
    setKnowledgeContent(item.content ?? '');
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

  async function trashTask(taskId: string) {
    await api(`/api/tasks/${taskId}/trash`, { method: 'POST', body: JSON.stringify({ createdBy: 'web' }) });
    if (selectedTask?.task.id === taskId) setSelectedTask(null);
    setMessage('任务已移到回收站');
    await refresh();
  }

  async function restoreTask(taskId: string) {
    await api(`/api/tasks/${taskId}/restore`, { method: 'POST', body: JSON.stringify({ status: 'next', createdBy: 'web' }) });
    setMessage('任务已恢复到本周 / 近期');
    await refresh();
  }

  async function completeTask(taskId: string) {
    await api(`/api/tasks/${taskId}/complete`, { method: 'POST', body: JSON.stringify({ createdBy: 'web' }) });
    if (selectedTask?.task.id === taskId) setSelectedTask(null);
    await refresh();
  }

  async function toggleStar(taskId: string, starred: boolean) {
    await api(`/api/tasks/${taskId}/star`, {
      method: 'PATCH',
      body: JSON.stringify({ starred })
    });
    if (selectedTask?.task.id === taskId) {
      setSelectedTask({ ...selectedTask, task: { ...selectedTask.task, starred } });
    }
    await refresh();
  }

  async function addStep() {
    if (!selectedTask || !newStep.trim()) return;
    await api(`/api/tasks/${selectedTask.task.id}/steps`, {
      method: 'POST', body: JSON.stringify({ title: newStep })
    });
    setNewStep('');
    await openTask(selectedTask.task.id);
  }

  async function toggleStep(step: TaskStep) {
    await api(`/api/tasks/steps/${step.id}`, {
      method: 'PATCH', body: JSON.stringify({ completed: !step.completed })
    });
    if (selectedTask) await openTask(selectedTask.task.id);
  }

  async function editStep(step: TaskStep) {
    const next = window.prompt('修改子任务', step.title);
    if (!next || next.trim() === step.title) return;
    await api(`/api/tasks/steps/${step.id}`, { method: 'PATCH', body: JSON.stringify({ title: next.trim() }) });
    if (selectedTask) await openTask(selectedTask.task.id);
  }

  async function editPoint(point: TaskPoint) {
    const next = window.prompt('修改要点', point.content);
    if (!next || next.trim() === point.content) return;
    await api(`/api/tasks/points/${point.id}`, { method: 'PATCH', body: JSON.stringify({ content: next.trim() }) });
    if (selectedTask) await openTask(selectedTask.task.id);
  }

  async function deleteStep(stepId: string) {
    await api(`/api/tasks/steps/${stepId}`, { method: 'DELETE' });
    if (selectedTask) await openTask(selectedTask.task.id);
  }

  async function deletePoint(pointId: string) {
    await api(`/api/tasks/points/${pointId}`, { method: 'DELETE' });
    if (selectedTask) await openTask(selectedTask.task.id);
  }

  async function saveKnowledge() {
    if (!selectedKnowledge) return;
    const response = await api<{ item: KnowledgeItem }>(`/api/personal/knowledge/${selectedKnowledge.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ item: { title: knowledgeTitle, content: knowledgeContent } })
    });
    setSelectedKnowledge(response.item);
    setMessage('SOP / 知识已保存');
    await refresh();
  }

  async function deleteKnowledge() {
    if (!selectedKnowledge) return;
    await api(`/api/personal/knowledge/${selectedKnowledge.id}`, { method: 'DELETE' });
    setSelectedKnowledge(null);
    setMessage('SOP / 知识已归档');
    await refresh();
  }

  async function saveAiSettings() {
    const response = await api<{ configured: boolean; model: string }>('/api/settings/ai', {
      method: 'POST',
      body: JSON.stringify({ apiKey: apiKeyInput || undefined, model: aiModel })
    });
    setAiConfigured(response.configured);
    setAiModel(response.model);
    setApiKeyInput('');
    setMessage(response.configured ? 'DeepSeek 已配置' : '仍使用本地解析');
  }

  async function addPoint() {
    if (!selectedTask || !newPoint.trim()) return;
    await api(`/api/tasks/${selectedTask.task.id}/points`, {
      method: 'POST', body: JSON.stringify({ content: newPoint })
    });
    setNewPoint('');
    await openTask(selectedTask.task.id);
  }

  const groups = useMemo(() => {
    const todayKey = dateOnlyLocal(new Date());
    const plannedToday = (t: Task) => t.start_at?.slice(0, 10) === todayKey;
    return {
      today: tasks.filter((t) => t.status === 'today' || plannedToday(t)),
      week: tasks.filter((t) => !plannedToday(t) && (t.status === 'next' || t.status === 'scheduled')),
      waiting: tasks.filter((t) => t.status === 'waiting'),
      long: tasks.filter((t) => t.status === 'someday')
    };
  }, [tasks]);

  function taskList(items: Task[], empty: string) {
    if (!items.length) return <p className="empty-state">{empty}</p>;
    return (
      <ul className="task-list">
        {items.map((task) => (
          <li key={task.id} className="simple-task-row">
            <button className="task-main-button" type="button" onClick={() => void openTask(task.id)}>
              <span className="task-title-line">
                {task.starred ? <Star size={15} fill="currentColor" /> : null}
                <strong>{task.title}</strong>
              </span>
              <small>{task.start_at ? `计划 ${task.start_at.replace('T',' ').slice(0,16)}` : ''}{task.start_at && task.deadline_at ? ' · ' : ''}{task.deadline_at ? `截止 ${task.deadline_at.replace('T',' ').slice(0,16)}` : ''}</small>
            </button>
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
        <div className="top-actions">
          <span className={aiConfigured ? 'ai-status connected' : 'ai-status'}>{aiConfigured ? 'DeepSeek 已连接' : '本地模式'}</span>
          <button className="icon-button" type="button" onClick={() => setShowSettings(true)} title="设置"><Settings size={18} /></button>
          <button className="icon-button" type="button" onClick={() => void refresh()} title="刷新"><RefreshCw size={18} /></button>
        </div>
      </header>

      {message ? <div className="status-line">{message}</div> : null}

      <section className="smart-capture-panel">
        <div className="panel-heading"><Sparkles size={19} /><h2>直接告诉助理发生了什么</h2></div>
        <form className="smart-capture-form" onSubmit={(event) => void submitSmartCapture(event)}>
          <textarea value={smartInput} onChange={(event) => setSmartInput(event.target.value)}
            placeholder="例如：明天把论文回复改完，很重要；里面要补MMA对比、修改C_pred图；注意不要说设计空间降维"
            rows={3} />
          <button type="submit"><Sparkles size={17} />智能记录</button>
        </form>
        {smartResult ? <div className="smart-result">{smartResult}</div> : null}
      </section>

      <section className="planning-grid">
        <div className="panel task-bucket">
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
        <div className="panel task-bucket compact-bucket">
          <div className="panel-heading"><BookOpen size={19}/><h2>长期任务</h2></div>
          <button className="link-button" type="button" onClick={() => setShowLongTerm(!showLongTerm)}>
            {groups.long.length} 项 {showLongTerm ? '收起' : '查看'}
          </button>
          {showLongTerm ? taskList(groups.long, '暂无长期任务。') : null}
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
              <li key={item.id}><div><strong>{item.company}</strong><small>{item.role ?? '未填写岗位'} · {item.status}{item.event_at ? ` · ${new Date(item.event_at).toLocaleString()}` : ''}</small></div></li>
            ))}
          </ul>
          {!applications.length ? <p className="empty-state">暂无秋招记录。</p> : null}
        </div>

        <div className="panel">
          <div className="panel-heading"><BookOpen size={19}/><h2>SOP / 技能 / 知识</h2></div>
          <ul className="simple-list stacked-list">
            {knowledgeItems.slice(0, 10).map((item) => (
              <li key={item.id}>
                <button className="knowledge-row" type="button" onClick={() => openKnowledge(item)}>
                  <strong>{item.title}</strong>
                  <small>{item.category ?? item.kind}</small>
                </button>
              </li>
            ))}
          </ul>
          {!knowledgeItems.length ? <p className="empty-state">暂无知识记录。</p> : null}
        </div>
      </section>

      <section className="history-entry">
        <button className="link-button" type="button" onClick={() => setShowCompleted(!showCompleted)}>
          已完成 {completedTasks.length} 项 {showCompleted ? '收起' : '>'}
        </button>
        {showCompleted ? (
          <div className="completed-panel">
            {completedTasks.length ? (
              <ul className="simple-list stacked-list">
                {completedTasks.map((task) => (
                  <li key={task.id}><div><strong>✓ {task.title}</strong><small>{task.deadline_at ? `原截止：${new Date(task.deadline_at).toLocaleString()}` : '已完成'}</small></div></li>
                ))}
              </ul>
            ) : <p className="empty-state">暂无已完成任务。</p>}
          </div>
        ) : null}
      </section>

      <section className="history-entry">
        <button className="link-button" type="button" onClick={() => setShowTrash(!showTrash)}>
          回收站 {trashedTasks.length} 项 {showTrash ? '收起' : '>'}
        </button>
        {showTrash ? (
          <div className="completed-panel">
            {trashedTasks.length ? (
              <ul className="simple-list stacked-list">
                {trashedTasks.map((task) => (
                  <li key={task.id} className="restore-row">
                    <div><strong>{task.title}</strong><small>已删除</small></div>
                    <button className="secondary-icon-button" type="button" title="恢复" onClick={() => void restoreTask(task.id)}><RotateCcw size={16}/></button>
                  </li>
                ))}
              </ul>
            ) : <p className="empty-state">回收站为空。</p>}
          </div>
        ) : null}
      </section>

      {showSettings ? (
        <div className="drawer-backdrop" onClick={() => setShowSettings(false)}>
          <aside className="task-drawer settings-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <h2>设置</h2>
              <button className="icon-button" type="button" onClick={() => setShowSettings(false)}><X size={18}/></button>
            </div>
            <section className="drawer-section">
              <h3>DeepSeek</h3>
              <p className="empty-state">{aiConfigured ? '已配置。留空 API Key 可只修改模型。' : '尚未配置 API Key。'}</p>
              <label>API Key<input type="password" value={apiKeyInput} onChange={(e)=>setApiKeyInput(e.target.value)} placeholder={aiConfigured ? '••••••••（已保存）' : 'sk-...'} /></label>
              <label>模型<input value={aiModel} onChange={(e)=>setAiModel(e.target.value)} /></label>
              <button type="button" onClick={() => void saveAiSettings()}><Save size={16}/>保存设置</button>
            </section>
          </aside>
        </div>
      ) : null}

      {selectedKnowledge ? (
        <div className="drawer-backdrop" onClick={() => setSelectedKnowledge(null)}>
          <aside className="task-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <small>{selectedKnowledge.category ?? selectedKnowledge.kind}</small>
                <h2>{selectedKnowledge.title}</h2>
              </div>
              <button className="icon-button" type="button" onClick={() => setSelectedKnowledge(null)}><X size={18}/></button>
            </div>
            <section className="drawer-section">
              <label>标题<input value={knowledgeTitle} onChange={(e)=>setKnowledgeTitle(e.target.value)} /></label>
              <label>{selectedKnowledge.kind === 'sop' ? '步骤 / 要点 / 补充说明' : '内容'}
                <textarea rows={14} value={knowledgeContent} onChange={(e)=>setKnowledgeContent(e.target.value)} />
              </label>
              <div className="drawer-footer-actions">
                <button type="button" onClick={() => void saveKnowledge()}><Save size={16}/>保存</button>
                <button className="danger-button" type="button" onClick={() => void deleteKnowledge()}><Trash2 size={16}/>删除</button>
              </div>
            </section>
          </aside>
        </div>
      ) : null}

      {selectedTask ? (
        <div className="drawer-backdrop" onClick={() => setSelectedTask(null)}>
          <aside className="task-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div className="drawer-title">
                <button className={selectedTask.task.starred ? 'star-button active' : 'star-button'} type="button"
                  title="标记重要" onClick={() => void toggleStar(selectedTask.task.id, !selectedTask.task.starred)}>
                  <Star size={20} fill={selectedTask.task.starred ? 'currentColor' : 'none'} />
                </button>
                <h2>{selectedTask.task.title}</h2>
              </div>
              <button className="icon-button" type="button" onClick={() => setSelectedTask(null)}><X size={18}/></button>
            </div>

            <section className="drawer-section">
              <h3>子任务</h3>
              {selectedTask.steps.length ? (
                <ul className="detail-list">
                  {selectedTask.steps.map((step) => (
                    <li key={step.id}>
                      <button className="step-check" type="button" onClick={() => void toggleStep(step)}>
                        {step.completed ? <Check size={15}/> : <span className="empty-check" />}
                      </button>
                      <button className="detail-text-button" type="button" title="点击修改" onClick={() => void editStep(step)}><span className={step.completed ? 'completed-text' : ''}>{step.title}</span></button>
                      <button className="tiny-delete" type="button" title="删除子任务" onClick={() => void deleteStep(step.id)}><X size={14}/></button>
                    </li>
                  ))}
                </ul>
              ) : <p className="empty-state">没有子任务。</p>}
              <div className="quick-add-row">
                <input value={newStep} onChange={(e)=>setNewStep(e.target.value)} placeholder="添加一个步骤..." onKeyDown={(e)=>{ if(e.key==='Enter'){ e.preventDefault(); void addStep(); } }} />
                <button className="icon-button" type="button" onClick={() => void addStep()}><Plus size={16}/></button>
              </div>
            </section>

            <section className="drawer-section">
              <h3>要点</h3>
              {selectedTask.points.length ? (
                <ul className="point-list">
                  {selectedTask.points.map((point) => <li key={point.id}><button className="detail-text-button" type="button" title="点击修改" onClick={() => void editPoint(point)}><span>{point.content}</span></button><button className="tiny-delete" type="button" title="删除要点" onClick={() => void deletePoint(point.id)}><X size={14}/></button></li>)}
                </ul>
              ) : <p className="empty-state">暂无要点。</p>}
              <div className="quick-add-row">
                <input value={newPoint} onChange={(e)=>setNewPoint(e.target.value)} placeholder="记一个重要要点..." onKeyDown={(e)=>{ if(e.key==='Enter'){ e.preventDefault(); void addPoint(); } }} />
                <button className="icon-button" type="button" onClick={() => void addPoint()}><Plus size={16}/></button>
              </div>
            </section>

            <div className="drawer-footer-actions">
              <button className="complete-wide" type="button" onClick={() => void completeTask(selectedTask.task.id)}>
                <Check size={17}/>完成这个任务
              </button>
              <button className="danger-button" type="button" onClick={() => void trashTask(selectedTask.task.id)}>
                <Trash2 size={17}/>删除
              </button>
            </div>
          </aside>
        </div>
      ) : null}
    </main>
  );
}

const isWeekPlanner = new URLSearchParams(window.location.search).get('view') === 'week';
createRoot(document.getElementById('root')!).render(<React.StrictMode>{isWeekPlanner ? <WeekPlanner /> : <App />}</React.StrictMode>);
