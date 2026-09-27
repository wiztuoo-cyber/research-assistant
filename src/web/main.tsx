import { Check, CalendarDays, BriefcaseBusiness, BookOpen, RefreshCw, Sparkles, Star, X, Plus } from 'lucide-react';
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
  return response.json() as Promise<T>;
}

function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeItem[]>([]);
  const [smartInput, setSmartInput] = useState('');
  const [smartResult, setSmartResult] = useState('');
  const [message, setMessage] = useState('');
  const [selectedTask, setSelectedTask] = useState<TaskDetailsResponse | null>(null);
  const [newStep, setNewStep] = useState('');
  const [newPoint, setNewPoint] = useState('');

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

  async function openTask(taskId: string) {
    setSelectedTask(await api<TaskDetailsResponse>(`/api/tasks/${taskId}/details`));
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

  async function addPoint() {
    if (!selectedTask || !newPoint.trim()) return;
    await api(`/api/tasks/${selectedTask.task.id}/points`, {
      method: 'POST', body: JSON.stringify({ content: newPoint })
    });
    setNewPoint('');
    await openTask(selectedTask.task.id);
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
          <li key={task.id} className="simple-task-row">
            <button className="task-main-button" type="button" onClick={() => void openTask(task.id)}>
              <span className="task-title-line">
                {task.starred ? <Star size={15} fill="currentColor" /> : null}
                <strong>{task.title}</strong>
              </span>
              <small>{task.deadline_at ? `截止 ${new Date(task.deadline_at).toLocaleString()}` : ' '}</small>
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
        <button className="icon-button" type="button" onClick={() => void refresh()} title="刷新"><RefreshCw size={18} /></button>
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
                      <span className={step.completed ? 'completed-text' : ''}>{step.title}</span>
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
                  {selectedTask.points.map((point) => <li key={point.id}>{point.content}</li>)}
                </ul>
              ) : <p className="empty-state">暂无要点。</p>}
              <div className="quick-add-row">
                <input value={newPoint} onChange={(e)=>setNewPoint(e.target.value)} placeholder="记一个重要要点..." onKeyDown={(e)=>{ if(e.key==='Enter'){ e.preventDefault(); void addPoint(); } }} />
                <button className="icon-button" type="button" onClick={() => void addPoint()}><Plus size={16}/></button>
              </div>
            </section>

            <button className="complete-wide" type="button" onClick={() => void completeTask(selectedTask.task.id)}>
              <Check size={17}/>完成这个任务
            </button>
          </aside>
        </div>
      ) : null}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
