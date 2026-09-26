import { Check, Cpu, Inbox, ListChecks, Monitor, Plus, RefreshCw, Sparkles } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

interface InboxItem {
  id: string;
  raw_text: string;
  source: string;
  status: string;
  created_at: string;
}

interface Task {
  id: string;
  title: string;
  status: string;
  deadline_at: string | null;
  estimated_minutes: number | null;
}

interface Recommendation {
  task: Task;
  score: number;
  reasons: string[];
}

interface Device {
  id: string;
  name: string;
  notes: string | null;
  status: 'active' | 'offline' | 'retired';
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

interface ComputeJob {
  id: string;
  title: string;
  project: string | null;
  device_id: string | null;
  device_name: string | null;
  status: 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'canceled';
  gamma: number | null;
  k_pcm: number | null;
  move_rule: string | null;
  iteration: number | null;
  objective: number | null;
  change_value: number | null;
  notes: string | null;
  next_action: string | null;
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
    throw new Error(body.error ?? `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function App() {
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([]);
  const [todayTasks, setTodayTasks] = useState<Task[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeItem[]>([]);
  const [jobs, setJobs] = useState<ComputeJob[]>([]);
  const [input, setInput] = useState('');
  const [selectedInboxId, setSelectedInboxId] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [deadlineAt, setDeadlineAt] = useState('');
  const [message, setMessage] = useState('');
  const [smartInput, setSmartInput] = useState('');
  const [smartResult, setSmartResult] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [jobDeviceId, setJobDeviceId] = useState('');
  const [jobProject, setJobProject] = useState('');
  const [jobGamma, setJobGamma] = useState('');
  const [jobKpcm, setJobKpcm] = useState('');
  const [jobMove, setJobMove] = useState('');

  const selectedInbox = useMemo(
    () => inboxItems.find((item) => item.id === selectedInboxId) ?? null,
    [inboxItems, selectedInboxId]
  );

  const runningJobs = jobs.filter((job) => job.status === 'running');
  const queuedJobs = jobs.filter((job) => job.status === 'queued');

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    const [inbox, today, research, personal] = await Promise.all([
      api<{ items: InboxItem[] }>('/api/inbox'),
      api<{ tasks: Task[] }>('/api/tasks/today'),
      api<{ devices: Device[]; jobs: ComputeJob[] }>('/api/research/dashboard'),
      api<{ schedule: ScheduleItem[]; applications: JobApplication[]; knowledge: KnowledgeItem[] }>('/api/personal/dashboard')
    ]);
    setInboxItems(inbox.items);
    setTodayTasks(today.tasks);
    setDevices(research.devices);
    setJobs(research.jobs);
    setScheduleItems(personal.schedule);
    setApplications(personal.applications);
    setKnowledgeItems(personal.knowledge);
  }

  async function addInbox(event: React.FormEvent) {
    event.preventDefault();
    if (!input.trim()) return;
    await api('/api/inbox', {
      method: 'POST',
      body: JSON.stringify({ rawText: input, source: 'web' })
    });
    setInput('');
    setMessage('已记录到 Inbox');
    await refresh();
  }

  async function convertSelected(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedInbox) return;
    await api(`/api/inbox/${selectedInbox.id}/convert`, {
      method: 'POST',
      body: JSON.stringify({
        task: {
          title: taskTitle || selectedInbox.raw_text,
          status: deadlineAt ? 'scheduled' : 'next',
          deadlineAt: deadlineAt || null,
          reminderAt: deadlineAt || null,
          priority: 'medium',
          importance: 3,
          urgency: deadlineAt ? 4 : 3
        },
        createdBy: 'web'
      })
    });
    setSelectedInboxId(null);
    setTaskTitle('');
    setDeadlineAt('');
    setMessage('已转换为任务');
    await refresh();
  }

  async function completeTask(taskId: string) {
    await api(`/api/tasks/${taskId}/complete`, {
      method: 'POST',
      body: JSON.stringify({ createdBy: 'web' })
    });
    setMessage('任务已完成');
    await refresh();
  }

  async function addDevice(event: React.FormEvent) {
    event.preventDefault();
    if (!deviceName.trim()) return;
    await api('/api/research/devices', {
      method: 'POST',
      body: JSON.stringify({ name: deviceName })
    });
    setDeviceName('');
    setMessage('设备已添加');
    await refresh();
  }

  async function addComputeJob(event: React.FormEvent) {
    event.preventDefault();
    if (!jobTitle.trim()) return;
    await api('/api/research/jobs', {
      method: 'POST',
      body: JSON.stringify({
        job: {
          title: jobTitle,
          project: jobProject || null,
          deviceId: jobDeviceId || null,
          status: 'running',
          gamma: jobGamma ? Number(jobGamma) : null,
          kPcm: jobKpcm ? Number(jobKpcm) : null,
          moveRule: jobMove || null
        },
        createdBy: 'web'
      })
    });
    setJobTitle('');
    setJobProject('');
    setJobGamma('');
    setJobKpcm('');
    setJobMove('');
    setMessage('计算任务已添加');
    await refresh();
  }

  async function setJobStatus(jobId: string, status: ComputeJob['status']) {
    await api(`/api/research/jobs/${jobId}`, {
      method: 'PATCH',
      body: JSON.stringify({ job: { status }, createdBy: 'web' })
    });
    setMessage(status === 'completed' ? '计算任务已完成' : '计算任务状态已更新');
    await refresh();
  }

  async function submitSmartCapture(event: React.FormEvent) {
    event.preventDefault();
    if (!smartInput.trim()) return;
    const response = await api<{ summary: string }>('/api/personal/capture', {
      method: 'POST',
      body: JSON.stringify({ text: smartInput })
    });
    setSmartResult(response.summary);
    setSmartInput('');
    setMessage('自然语言信息已写入数据库');
    await refresh();
  }

  async function getRecommendations() {
    const response = await api<{ recommendations: Recommendation[] }>('/api/recommendations/now', {
      method: 'POST',
      body: JSON.stringify({
        context: {
          onCommute: false,
          hasComputer: true,
          availableMinutes: 45
        }
      })
    });
    setRecommendations(response.recommendations.slice(0, 5));
  }

  function jobMeta(job: ComputeJob): string {
    const parts = [];
    if (job.gamma !== null) parts.push(`γ=${job.gamma}`);
    if (job.k_pcm !== null) parts.push(`k_PCM=${job.k_pcm}`);
    if (job.move_rule) parts.push(`move=${job.move_rule}`);
    if (job.iteration !== null) parts.push(`iter=${job.iteration}`);
    if (job.objective !== null) parts.push(`obj=${job.objective}`);
    return parts.join(' · ') || '暂无参数';
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>科研私人助理</h1>
          <p>本地 SQLite 记录任务、设备与计算状态</p>
        </div>
        <button className="icon-button" type="button" onClick={() => void refresh()} title="刷新">
          <RefreshCw size={18} />
        </button>
      </header>

      {message ? <div className="status-line">{message}</div> : null}

      <section className="summary-grid">
        <div className="summary-card">
          <strong>{runningJobs.length}</strong>
          <span>正在计算</span>
        </div>
        <div className="summary-card">
          <strong>{queuedJobs.length}</strong>
          <span>等待运行</span>
        </div>
        <div className="summary-card">
          <strong>{todayTasks.length}</strong>
          <span>今日任务</span>
        </div>
        <div className="summary-card">
          <strong>{devices.filter((item) => item.status === 'active').length}</strong>
          <span>可用设备</span>
        </div>
      </section>

      <section className="smart-capture-panel">
        <div className="panel-heading">
          <Sparkles size={19} />
          <h2>直接告诉助理发生了什么</h2>
        </div>
        <form className="smart-capture-form" onSubmit={(event) => void submitSmartCapture(event)}>
          <textarea
            value={smartInput}
            onChange={(event) => setSmartInput(event.target.value)}
            placeholder="例如：明天下午三点OPPO面试 / 记录一个ANSYS SOP / 工位电脑测试新Newton"
            rows={3}
          />
          <button type="submit">
            <Sparkles size={17} />
            智能记录
          </button>
        </form>
        {smartResult ? <div className="smart-result">{smartResult}</div> : null}
      </section>

      <section className="personal-grid">
        <div className="panel">
          <div className="panel-heading">
            <ListChecks size={19} />
            <h2>秋招进展</h2>
          </div>
          <ul className="simple-list stacked-list">
            {applications.slice(0, 8).map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.company}</strong>
                  <small>{item.role ?? '未填写岗位'} · {item.status}</small>
                  {item.next_action ? <small>下一步：{item.next_action}</small> : null}
                </div>
              </li>
            ))}
          </ul>
          {applications.length === 0 ? <p className="empty-state">暂无秋招记录。</p> : null}
        </div>

        <div className="panel">
          <div className="panel-heading">
            <Check size={19} />
            <h2>日程</h2>
          </div>
          <ul className="simple-list stacked-list">
            {scheduleItems.slice(0, 8).map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.kind}{item.start_at ? ` · ${item.start_at}` : ''}</small>
                </div>
              </li>
            ))}
          </ul>
          {scheduleItems.length === 0 ? <p className="empty-state">暂无日程。</p> : null}
        </div>

        <div className="panel">
          <div className="panel-heading">
            <Sparkles size={19} />
            <h2>SOP / 技能 / 知识</h2>
          </div>
          <ul className="simple-list stacked-list">
            {knowledgeItems.slice(0, 8).map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.category ?? item.kind}</small>
                </div>
              </li>
            ))}
          </ul>
          {knowledgeItems.length === 0 ? <p className="empty-state">暂无知识记录。</p> : null}
        </div>
      </section>

      <section className="workspace research-workspace">
        <div className="panel wide-panel">
          <div className="panel-heading">
            <Cpu size={19} />
            <h2>当前计算</h2>
          </div>
          <div className="compute-grid">
            {devices.map((device) => {
              const deviceJobs = runningJobs.filter((job) => job.device_id === device.id);
              return (
                <div className="device-card" key={device.id}>
                  <div className="device-title">
                    <Monitor size={17} />
                    <strong>{device.name}</strong>
                  </div>
                  {deviceJobs.length ? (
                    deviceJobs.map((job) => (
                      <div className="job-card" key={job.id}>
                        <strong>{job.title}</strong>
                        <small>{job.project ?? '未设置项目'}</small>
                        <small>{jobMeta(job)}</small>
                        <div className="job-actions">
                          <button type="button" onClick={() => void setJobStatus(job.id, 'completed')}>
                            <Check size={15} />
                            完成
                          </button>
                          <button className="secondary-button" type="button" onClick={() => void setJobStatus(job.id, 'paused')}>
                            暂停
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="empty-state">当前空闲</p>
                  )}
                </div>
              );
            })}
            {devices.length === 0 ? <p className="empty-state">先添加你的工作站、宿舍电脑等设备。</p> : null}
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <Monitor size={19} />
            <h2>设备</h2>
          </div>
          <form className="capture-form" onSubmit={(event) => void addDevice(event)}>
            <input
              value={deviceName}
              onChange={(event) => setDeviceName(event.target.value)}
              placeholder="例如：工作站"
            />
            <button type="submit">
              <Plus size={17} />
              添加设备
            </button>
          </form>
          <ul className="simple-list">
            {devices.map((device) => (
              <li key={device.id}>
                <span>{device.name}</span>
                <small>{device.status}</small>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <Cpu size={19} />
            <h2>新增计算任务</h2>
          </div>
          <form className="process-form" onSubmit={(event) => void addComputeJob(event)}>
            <label>
              名称
              <input value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} placeholder="例如：γ=0.5 基准算例" />
            </label>
            <label>
              项目
              <input value={jobProject} onChange={(event) => setJobProject(event.target.value)} placeholder="例如：Cu/Al 双材料 TO" />
            </label>
            <label>
              设备
              <select value={jobDeviceId} onChange={(event) => setJobDeviceId(event.target.value)}>
                <option value="">未指定</option>
                {devices.map((device) => (
                  <option key={device.id} value={device.id}>{device.name}</option>
                ))}
              </select>
            </label>
            <div className="inline-fields">
              <label>
                γ
                <input value={jobGamma} onChange={(event) => setJobGamma(event.target.value)} placeholder="0.5" />
              </label>
              <label>
                k_PCM
                <input value={jobKpcm} onChange={(event) => setJobKpcm(event.target.value)} placeholder="0.1" />
              </label>
            </div>
            <label>
              move
              <input value={jobMove} onChange={(event) => setJobMove(event.target.value)} placeholder="0.15×0.98^loop" />
            </label>
            <button type="submit">
              <Plus size={17} />
              开始记录
            </button>
          </form>
        </div>

        <div className="panel inbox-panel">
          <div className="panel-heading">
            <Inbox size={19} />
            <h2>快速记录</h2>
          </div>
          <form className="capture-form" onSubmit={(event) => void addInbox(event)}>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="先把事情记下来，例如：周日之前确认所有 gamma 结果"
              rows={3}
            />
            <button type="submit">
              <Plus size={17} />
              记录
            </button>
          </form>
          <ul className="inbox-list">
            {inboxItems.map((item) => (
              <li key={item.id}>
                <button
                  className={item.id === selectedInboxId ? 'selected item-button' : 'item-button'}
                  type="button"
                  onClick={() => {
                    setSelectedInboxId(item.id);
                    setTaskTitle(item.raw_text);
                  }}
                >
                  <span>{item.raw_text}</span>
                  <small>{new Date(item.created_at).toLocaleString()}</small>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <Check size={19} />
            <h2>转为任务</h2>
          </div>
          {selectedInbox ? (
            <form className="process-form" onSubmit={(event) => void convertSelected(event)}>
              <label>
                任务标题
                <input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} />
              </label>
              <label>
                截止时间 / 提醒
                <input
                  type="datetime-local"
                  value={deadlineAt}
                  onChange={(event) => setDeadlineAt(event.target.value)}
                />
              </label>
              <button type="submit">
                <Check size={17} />
                转换
              </button>
            </form>
          ) : (
            <p className="empty-state">选择一条快速记录后再转换。</p>
          )}
        </div>

        <div className="panel">
          <div className="panel-heading">
            <ListChecks size={19} />
            <h2>今日任务</h2>
          </div>
          <ul className="task-list">
            {todayTasks.map((task) => (
              <li key={task.id}>
                <div>
                  <strong>{task.title}</strong>
                  <small>{task.deadline_at ?? '无截止时间'}</small>
                </div>
                <button className="icon-button" type="button" title="完成" onClick={() => void completeTask(task.id)}>
                  <Check size={17} />
                </button>
              </li>
            ))}
          </ul>
          {todayTasks.length === 0 ? <p className="empty-state">今天暂无明确任务。</p> : null}
        </div>

        <div className="panel">
          <div className="panel-heading">
            <Sparkles size={19} />
            <h2>下一步建议</h2>
          </div>
          <button type="button" onClick={() => void getRecommendations()}>
            <Sparkles size={17} />
            我现在应该做什么？
          </button>
          <ul className="recommendation-list">
            {recommendations.map((item) => (
              <li key={item.task.id}>
                <strong>{item.task.title}</strong>
                <small>{item.reasons.join('; ')}</small>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
