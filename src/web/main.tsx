import { Check, CalendarDays, BriefcaseBusiness, BookOpen, RefreshCw, Star, X, Plus, Trash2, RotateCcw, Settings, Save } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { AssistantPanel } from './AssistantPanel';
import {PlannerCalendar,ScheduleDetail} from './PlannerCalendar';
import {UndoNotice,changed} from './interactions';
import {TaskDateEditor} from './TaskDateEditor';
import {dateCaption,timeBadge,dayDistance,sortTaskAgenda,localDateKey} from '../domain/timePresentation';

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
  end_at?: string | null;
  reminder_at?: string | null;
  location?: string | null;
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
    try { changed(data as {undoToken?:string}); } catch {}
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

function App() {
  const [selectedSchedule,setSelectedSchedule]=useState<ScheduleItem|null>(null);
  const [itemOrder,setItemOrder]=useState<Record<string,number>>({});
  useEffect(()=>{void api<{item_id:string;position:number}[]>('/api/appearance').then(rows=>setItemOrder(Object.fromEntries(rows.map(r=>[r.item_id,r.position]))));},[]);
  const [page,setPage]=useState<'tasks'|'assistant'|'library'>('tasks');
  const [libraryTopic,setLibraryTopic]=useState(''),[libraryKey,setLibraryKey]=useState(0);
  const [question,setQuestion]=useState(''),[chatTopic,setChatTopic]=useState(''),[questionKey,setQuestionKey]=useState(0);
  function openLibrary(id:string){setLibraryTopic(id);setLibraryKey(k=>k+1);setPage('library');}
  function ask(text:string,topic=''){setChatTopic(topic);setQuestion(text);setQuestionKey(k=>k+1);setPage('assistant');}
  useEffect(()=>{const fn=()=>void refresh();window.addEventListener('assistant-changed',fn);return()=>window.removeEventListener('assistant-changed',fn);},[]);
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
    const details = selectedTask?.task.id === taskId
      ? selectedTask
      : await api<TaskDetailsResponse>(`/api/tasks/${taskId}/details`);
    const incomplete = details.steps.filter((step) => !step.completed).length;
    if (incomplete > 0 && !window.confirm(`还有 ${incomplete} 个子任务未完成，仍然完成主任务吗？`)) return;
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

  const agenda=sortTaskAgenda(tasks);
  const previous=agenda.filter(t=>t.status!=='today'&&t.start_at&&dayDistance(t.start_at)<0&&!timeBadge(t.deadline_at,'deadline').overdue);
  const visibleAgenda=agenda.filter(t=>!previous.includes(t));
  const upcomingEvents=scheduleItems.filter(s=>s.status==='scheduled'&&s.start_at&&(s.end_at?Date.parse(s.end_at)>=Date.now():dayDistance(s.start_at)>=0));
  const overdue=agenda.filter(t=>timeBadge(t.deadline_at,'deadline').overdue);
  const todayItems=visibleAgenda.filter(t=>!overdue.includes(t)&&(t.status==='today'||Boolean(t.start_at&&dayDistance(t.start_at)===0)||Boolean(t.deadline_at&&dayDistance(t.deadline_at)===0))).sort((a,b)=>Number(b.starred)-Number(a.starred)||(itemOrder[a.id]??0)-(itemOrder[b.id]??0));
  const laterItems=visibleAgenda.filter(t=>!overdue.includes(t)&&!todayItems.includes(t)&&Boolean(t.start_at||t.deadline_at));
  const unplanned=visibleAgenda.filter(t=>!todayItems.includes(t)&&!t.start_at&&!t.deadline_at);

  function taskList(items: Task[], empty: string) {
    if (!items.length) return <p className="empty-state">{empty}</p>;
    return (
      <ul className="task-list">
        {items.map((task) => (
          <li key={task.id} className="simple-task-row" draggable={todayItems.includes(task)} onDragStart={e=>e.dataTransfer.setData('text/plain',task.id)} onDragOver={e=>{if(todayItems.includes(task))e.preventDefault();}} onDrop={e=>{e.preventDefault();const id=e.dataTransfer.getData('text/plain');if(id===task.id||!todayItems.some(t=>t.id===id))return;const ids=todayItems.map(t=>t.id).filter(t=>t!==id);ids.splice(ids.indexOf(task.id),0,id);const next=Object.fromEntries(ids.map((t,i)=>[t,i]));void Promise.all(ids.map(t=>api('/api/appearance/'+t,{method:'PATCH',body:JSON.stringify({position:next[t]})}))).then(()=>setItemOrder(old=>({...old,...next}))).catch(e=>setMessage(String(e)));}}>
            <button className="task-main-button" type="button" onClick={() => void openTask(task.id)}>
              <span className="task-title-line">
                {task.starred ? <Star size={15} fill="currentColor" /> : null}
                <strong>{task.title}</strong>
              </span>
              <small>{task.start_at?timeBadge(task.start_at,'plan').label:'未安排执行日期'}{task.status==='waiting'?' · 等待中':''}</small><span className={timeBadge(task.deadline_at,'deadline').overdue?'countdown overdue':'countdown'} title={task.deadline_at?dateCaption(task.deadline_at):'点击设置日期'}>{timeBadge(task.deadline_at,'deadline').label}</span>
            </button>
            <button className="icon-button" type="button" title="完成" onClick={() => void completeTask(task.id)}>
              <Check size={17} />
            </button>
            <input className="quick-plan-date" aria-label={'安排日期 '+task.title} title="安排哪天做" type="date" value={task.start_at?localDateKey(task.start_at):''} onChange={e=>{const value=e.target.value;let start:string|null=value||null;if(value&&task.start_at&&task.start_at.length>10){const d=new Date(task.start_at),[y,m,day]=value.split('-').map(Number);d.setFullYear(y,m-1,day);start=d.toISOString();}void api('/api/tasks/'+task.id,{method:'PATCH',body:JSON.stringify({task:{startAt:start}})}).then(()=>refresh()).catch(e=>setMessage(String(e)));}}/>
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
          <p>安排事情，积累想法。</p>
        </div>
        <div className="top-actions">
          <span className={aiConfigured ? 'ai-status connected' : 'ai-status'}>{aiConfigured ? 'DeepSeek 已连接' : '本地模式'}</span>
          <button className="icon-button" type="button" onClick={() => setShowSettings(true)} title="设置"><Settings size={18} /></button>
          <button className="icon-button" type="button" onClick={() => void refresh()} title="刷新"><RefreshCw size={18} /></button>
        </div>
      </header>

      {message ? <div className="status-line">{message}</div> : null}

      <nav className="main-tabs" aria-label="主导航">{([['tasks','任务'],['assistant','助理'],['library','知识库']] as const).map(([id,label])=><button key={id} aria-current={page===id?'page':undefined} onClick={()=>setPage(id)}>{label}</button>)}</nav>
      <div hidden={page!=='assistant'}><AssistantPanel key={questionKey} initialQuestion={question} initialTopic={chatTopic} onOpenTopic={openLibrary}/></div>
      <div hidden={page!=='library'}><AssistantPanel key={libraryKey} view="library" initialTopic={libraryTopic} legacy={knowledgeItems} onOpenLegacy={openKnowledge} onAsk={(id,title)=>ask('帮我梳理“'+title+'”这篇笔记的要点与未明确的问题',id)}/></div>
      <div hidden={page!=='tasks'} className="task-page">
        <header className="page-heading"><div><h2>待办事项 <small>{tasks.length}</small></h2><p>安排今天，也看清接下来。</p></div><div className="assistant-controls"><button onClick={()=>{setPage('assistant');window.dispatchEvent(new Event('assistant-record-task'));}}>＋添加事项</button><button onClick={()=>void api<{supported:boolean}>('/api/desktop/open-planner',{method:'POST'}).then(r=>{if(!r.supported)window.open('/?view=week','_blank');}).catch(e=>setMessage(String(e)))}>打开周挂件</button></div></header>
        {overdue.length?<section className="overdue-section"><h3>已过截止 · {overdue.length}</h3>{taskList(overdue,'')}</section>:null}
        {previous.length?<details className="previous-plans"><summary>之前安排的还有 {previous.length} 项未完成</summary>{taskList(previous,'')}</details>:null}
        <div className="task-dashboard"><section className="today-column"><h3>今天 <small>{todayItems.length}</small></h3>{taskList(todayItems,'今天还没有安排，留一点从容。')}</section><section className="later-column"><h3>接下来 <small>{laterItems.length}</small></h3>{taskList(laterItems,'接下来暂无安排。')}<details open className="unplanned-section"><summary>未安排 · {unplanned.length}</summary>{taskList(unplanned,'暂无未安排事项。')}</details></section></div>
        {upcomingEvents.length?<ul className="inline-events">{upcomingEvents.map(item=><li key={item.id}><CalendarDays size={17}/><button className="link-button" onClick={()=>setSelectedSchedule(item)}>{item.title}</button><small>{dateCaption(item.start_at)}</small><span className="countdown">{timeBadge(item.start_at,'event').label}</span></li>)}</ul>:null}
        {scheduleItems.some(s=>s.status==='scheduled'&&!upcomingEvents.includes(s))?<details><summary>过去或未安排的固定事项</summary>{scheduleItems.filter(s=>s.status==='scheduled'&&!upcomingEvents.includes(s)).map(s=><button key={s.id} className="link-button" onClick={()=>setSelectedSchedule(s)}>{s.title} · {dateCaption(s.start_at)}</button>)}</details>:null}
        {selectedSchedule?<ScheduleDetail item={selectedSchedule} onClose={()=>setSelectedSchedule(null)} onSaved={()=>void refresh()}/>:null}

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

      </div>
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
                <button type="button" onClick={() => { void api('/api/assistant/import-knowledge/'+selectedKnowledge.id,{method:'POST'}).then(()=>{setSelectedKnowledge(null);setMessage('已将保存过的知识内容复制到同名主题，原知识记录保留。');}).catch(error=>setMessage(String(error))); }}>复制已保存内容到主题笔记</button>
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

            <TaskDateEditor key={selectedTask.task.id} task={selectedTask.task} onSaved={()=>{void openTask(selectedTask.task.id);void refresh();}}/>
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
document.documentElement.classList.toggle('week-widget-page', isWeekPlanner);
createRoot(document.getElementById('root')!).render(<React.StrictMode>{isWeekPlanner ? <PlannerCalendar /> : <App />}<UndoNotice/></React.StrictMode>);
