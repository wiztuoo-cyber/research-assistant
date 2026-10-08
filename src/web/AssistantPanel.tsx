import React, { useEffect, useRef, useState } from 'react';

interface Topic { id:string; title:string; revision:number; summary:string; points_json:string; paused:number; dirty_at:string|null; last_error:string|null; organized_at:string|null }
interface Thought { id:string; raw_text:string; topic_id:string|null; created_at:string }
interface Version { id:string; summary:string; author:string; created_at:string }
interface Detail { topic:Topic; thoughts:Thought[]; versions:Version[] }
interface State { preferences:{aiEnabled:boolean;autoOrganize:boolean;configured:boolean}; topics:Topic[]; unassigned:Thought[]; messages:{id:number;role:string;content:string}[] }
interface Point { kind:string;text:string;sourceIds:string[] }
async function call<T>(path:string,method='GET',body?:unknown):Promise<T> {
  const response=await fetch('/api/assistant'+path,{method,headers:{'content-type':'application/json'},body:body===undefined ? undefined : JSON.stringify(body)});
  const data=await response.json();
  if (!response.ok) throw new Error(data.error ?? '请求失败');
  if (method!=='GET') localStorage.setItem('assistant-data-revision',String(Date.now()));
  return data as T;
}
const kindNames:Record<string,string>={idea:'主要想法',decision:'已明确的决定',question:'待明确的问题',alternative:'不同方案'};

export function AssistantPanel() {
  const [state,setState]=useState<State|null>(null);
  const [selected,setSelected]=useState('');
  const selectedRef=useRef('');
  const [detail,setDetail]=useState<Detail|null>(null);
  const [mode,setMode]=useState<'chat'|'idea'|'capture'>('chat');
  const [input,setInput]=useState('');
  const [title,setTitle]=useState('');
  const [minutes,setMinutes]=useState('');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [draft,setDraft]=useState<string|null>(null);
  const [editRevision,setEditRevision]=useState(0);
  const [historyOpen,setHistoryOpen]=useState(false);
  const [references,setReferences]=useState<{id:string;label:string}[]>([]);
  const requestRef=useRef<{text:string;topic:string;id:string}|null>(null);

  async function refresh(id=selectedRef.current) {
    const next=await call<State>('/state'); setState(next);
    if(id) {
      const nextDetail=await call<Detail>('/topics/'+id);
      if(selectedRef.current===id) setDetail(nextDetail);
    }
  }
  useEffect(()=> {
    void refresh().catch(e=>setMessage(String(e.message)));
    const timer=setInterval(()=>{void refresh().catch(()=>{});},10000);
    return ()=>clearInterval(timer);
  },[]);
  async function run(fn:()=>Promise<void>) {
    if(busy) return;
    setBusy(true);setMessage('');
    try {await fn();await refresh();} catch(e){setMessage(e instanceof Error?e.message:String(e));} finally{setBusy(false);}
  }
  async function select(id:string) {
    selectedRef.current=id;setSelected(id);setDetail(null);setDraft(null);setHistoryOpen(false);
    try{await refresh(id);}catch(e){setMessage(String(e));}
  }
  async function send(e:React.FormEvent) {
    e.preventDefault();
    if(!input.trim()) return;
    await run(async()=> {
      if(mode==='idea') {
        if(requestRef.current?.text!==input || requestRef.current.topic!==selected) requestRef.current={text:input,topic:selected,id:crypto.randomUUID()};
        await call('/thoughts','POST',{text:input,topicId:selected||null,requestId:requestRef.current.id});
        requestRef.current=null;
        setMessage(selected?'已保存原文。开启自动整理后会在停止输入两分钟后更新。':'已保存到待归类。可手动选择主题，或开启 AI 和自动整理。');
      } else if(mode==='capture') {
        const result=await call<{summary:string}>('/capture','POST',{text:input});setMessage(result.summary);
      } else {
        const result=await call<{answer:string;references:{id:string;label:string}[]}>('/chat','POST',{text:input,topicId:selected||undefined,minutes:minutes?Number(minutes):undefined});
        setReferences(result.references);
      }
      setInput('');
    });
  }
  const points:Point[]=detail ? JSON.parse(detail.topic.points_json) : [];
  function sourceList(thoughts:Thought[]) {
    return <ul className="thought-sources">{thoughts.map(t=><li key={t.id} id={'source-'+t.id}>
      <small>{new Date(t.created_at).toLocaleString()}</small><p>{t.raw_text}</p>
      <label>移动到主题<select aria-label={'移动记录 '+t.raw_text.slice(0,20)} value={t.topic_id??''} disabled={busy} onChange={e=>{void run(async()=>{await call('/thoughts/'+t.id,'PATCH',{topicId:e.target.value||null});});}}>
        <option value="">待归类</option>{state?.topics.map(topic=><option key={topic.id} value={topic.id}>{topic.title}</option>)}
      </select></label>
    </li>)}</ul>;
  }
  return <section className="assistant-panel" aria-label="对话与主题笔记">
    <header className="assistant-heading"><div><h2>对话与主题笔记</h2><p>随手记录，让想法逐渐成形。</p></div>
      <div className="assistant-switches">
        <label><input type="checkbox" aria-label="助理 AI" checked={state?.preferences.aiEnabled??false} disabled={!state||busy} onChange={e=>{const value=e.target.checked;void run(async()=>{await call('/preferences','PATCH',{aiEnabled:value});});}}/>AI</label>
        <label><input type="checkbox" aria-label="自动整理" checked={state?.preferences.autoOrganize??false} disabled={!state||busy} onChange={e=>{const value=e.target.checked;void run(async()=>{await call('/preferences','PATCH',{autoOrganize:value});});}}/>自动整理</label>
      </div>
    </header>
    <p className="assistant-hint">开启 AI 后，相关内容会发送给 DeepSeek。自动整理仅处理有变化的主题；AI 关闭时只保存原文。{state&&!state.preferences.configured?' 请在主界面设置中配置 DeepSeek。':''}</p>
    <div className="assistant-workspace">
      <aside className="topic-sidebar">
        <label>当前主题<select aria-label="当前主题" value={selected} disabled={busy||draft!==null} onChange={e=>void select(e.target.value)}>
          <option value="">全部事务 / 待归类</option>{state?.topics.map(t=><option value={t.id} key={t.id}>{t.title}{t.dirty_at?' · 待整理':''}</option>)}
        </select></label>
        <form onSubmit={e=>{e.preventDefault();void run(async()=>{const t=await call<Topic>('/topics','POST',{title});setTitle('');await select(t.id);});}}>
          <input aria-label="新主题名称" placeholder="新主题，例如论文修改" maxLength={100} value={title} onChange={e=>setTitle(e.target.value)}/>
          <button disabled={busy||!title.trim()||draft!==null}>新建主题</button>
        </form>
        <small>选择主题后，对话会读取该主题原文；记想法会直接存入这个主题。</small>
      </aside>
      <div className="assistant-main">
        <form onSubmit={e=>void send(e)} className="assistant-compose">
          <div className="assistant-controls"><label>操作<select aria-label="操作类型" value={mode} onChange={e=>setMode(e.target.value as typeof mode)} disabled={busy}>
            <option value="chat">问助理</option><option value="idea">记想法</option><option value="capture">记任务 / 日程</option>
          </select></label>{mode==='chat'?<label>可用分钟（选填）<input type="number" min={1} max={1440} value={minutes} onChange={e=>setMinutes(e.target.value)}/></label>:null}</div>
          <textarea aria-label="告诉助理" rows={3} maxLength={mode==='idea'?8000:4000} value={input} onChange={e=>setInput(e.target.value)} placeholder={mode==='chat'?'今天先做哪个？或：这个主题有哪些想法还没想清楚？':mode==='idea'?'随手记下想法，也可以补充：刚才那条只是设想，还没决定。':'明天下午三点面试，提前半小时提醒我。'}/>
          <div className="assistant-controls"><small>{mode==='chat'?'回答只提供建议，不改动任务或日程。':mode==='idea'?'保留原文，不自动创建待办。':'提交后会写入任务或日程；AI 关闭时按原文创建任务。'}</small><button disabled={busy||!input.trim()}>{busy?'处理中…':mode==='chat'?'发送问题':'保存记录'}</button></div>
        </form>
        {message?<p role="status" className="assistant-notice">{message}</p>:null}
        {state?.messages.length?<details className="assistant-conversation" open><summary>最近对话</summary>
          <div className="conversation-scroll">{state.messages.map(m=><div className={'conversation-message '+m.role} key={m.id}><strong>{m.role==='user'?'你':'助理'}</strong><p>{m.content}</p></div>)}</div>
          {references.length?<small>本次回答依据：{references.map(r=>r.label).join('、')}</small>:null}
        </details>:null}
        {detail?<article className="topic-document">
          <header><h3>{detail.topic.title}</h3><small>{detail.topic.organized_at?`最近整理：${new Date(detail.topic.organized_at).toLocaleString()}`:'尚未整理'}{detail.topic.paused?' · 已暂停自动改写':detail.topic.dirty_at?' · 有新内容待整理':' · 已是最新'}</small></header>
          {detail.topic.last_error?<p role="alert">{detail.topic.last_error}</p>:null}
          <div className="assistant-controls">
            <button disabled={busy||draft!==null||!state?.preferences.aiEnabled||!state?.preferences.configured||Boolean(detail.topic.paused)} onClick={()=>void run(async()=>{await call('/topics/'+selected+'/organize','POST');})}>现在整理</button>
            <button disabled={busy||draft!==null} onClick={()=>void run(async()=>{await call('/topics/'+selected,'PATCH',{revision:detail.topic.revision,paused:!detail.topic.paused});})}>{detail.topic.paused?'恢复自动整理':'暂停自动改写'}</button>
            <button disabled={busy||draft!==null||!detail.topic.summary} onClick={()=>{setDraft(detail.topic.summary);setEditRevision(detail.topic.revision);}}>编辑整理稿</button>
            <button onClick={()=>setHistoryOpen(!historyOpen)}>历史版本</button>
          </div>
          {draft!==null?<div><textarea aria-label="编辑整理稿" rows={12} value={draft} onChange={e=>setDraft(e.target.value)}/><small>保存后暂停自动改写。要持续自动整理，可用“记想法”补充纠正意见。</small><div className="assistant-controls"><button disabled={busy} onClick={()=>void run(async()=>{await call('/topics/'+selected,'PATCH',{revision:editRevision,summary:draft});setDraft(null);})}>保存整理稿</button><button onClick={()=>setDraft(null)}>取消编辑</button></div></div>:
            points.length?<div>{Object.entries(kindNames).map(([kind,label])=>points.some(p=>p.kind===kind)?<section key={kind}><h4>{label}</h4>{points.filter(p=>p.kind===kind).map((p,i)=><div key={i}><p className="topic-point">{p.text}</p><details className="point-evidence"><summary>查看依据（{p.sourceIds.length}）</summary>{p.sourceIds.map(id=><blockquote key={id}>{detail.thoughts.find(t=>t.id===id)?.raw_text??'原文已移到其他主题'}</blockquote>)}</details></div>)}</section>:null)}</div>:<p className="topic-summary">{detail.topic.summary||'想法已保存后会在这里形成整理稿。你也可以点击“现在整理”。'}</p>}
          {historyOpen?<div className="topic-history">{detail.versions.map(v=><details key={v.id}><summary>{new Date(v.created_at).toLocaleString()} · {v.author==='ai'?'AI 整理':v.author==='user'?'手动编辑':'恢复版本'}</summary><pre>{v.summary}</pre><button disabled={busy||draft!==null} onClick={()=>void run(async()=>{await call('/topics/'+selected,'PATCH',{revision:detail.topic.revision,restoreId:v.id});})}>恢复此版本并暂停自动改写</button></details>)}{!detail.versions.length?<p>暂无历史版本。</p>:null}</div>:null}
          <details><summary>原始记录（{detail.thoughts.length}）</summary>{sourceList(detail.thoughts)}</details>
        </article>:<details className="unassigned-thoughts"><summary>待归类想法（{state?.unassigned.length??0}）</summary><p>不确定或归类失败的想法保留在这里，可手动选择主题。</p><button disabled={busy} onClick={()=>void run(async()=>{await call('/classify/retry','POST');setMessage('已加入归类队列。需开启 AI 和自动整理。');})}>重新尝试自动归类</button>{sourceList(state?.unassigned??[])}</details>}
      </div>
    </div>
  </section>;
}
