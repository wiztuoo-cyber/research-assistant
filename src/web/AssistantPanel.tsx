import React, { useEffect, useRef, useState } from 'react';
import {captureKey,changed} from './interactions';

interface Topic { category:string|null;kind:string;id:string; title:string; revision:number; summary:string; points_json:string; paused:number; dirty_at:string|null; last_error:string|null; organized_at:string|null }
interface Thought { id:string; raw_text:string; topic_id:string|null; created_at:string }
interface Version { id:string; summary:string; author:string; created_at:string }
interface Detail { topic:Topic; thoughts:Thought[]; versions:Version[] }
interface State { preferences:{aiEnabled:boolean;autoOrganize:boolean;configured:boolean}; topics:Topic[]; unassigned:Thought[]; messages:{id:number;role:string;content:string}[] }
interface Point { kind:string;text:string;sourceIds:string[] }
async function call<T>(path:string,method='GET',body?:unknown):Promise<T> {
  const response=await fetch('/api/assistant'+path,{method,headers:{'content-type':'application/json'},body:body===undefined ? undefined : JSON.stringify(body)});
  const data=await response.json();
  if (!response.ok) throw new Error(data.error ?? '请求失败');
  if (method!=='GET') changed(data);
  return data as T;
}
const kindNames:Record<string,string>={idea:'主要想法',decision:'已明确的决定',question:'待明确的问题',alternative:'不同方案'};

interface Props {view?:'capture'|'library';initialQuestion?:string;initialTopic?:string;onOpenTopic?:(id:string)=>void;onAsk?:(id:string,title:string)=>void;legacy?:{id:string;title:string;kind:string;category:string|null;content:string|null}[];onOpenLegacy?:(item:any)=>void}
export function AssistantPanel({view='capture',initialQuestion,initialTopic,onOpenTopic,onAsk,legacy=[],onOpenLegacy}:Props) {
  const [search,setSearch]=useState('');
  const [metadata,setMetadata]=useState<{title:string;category:string;kind:string;revision:number}|null>(null);
  const [addition,setAddition]=useState('');
  const [saved,setSaved]=useState('');
  const draftCache=useRef({chat:'',idea:'',capture:''});
  const inputRef=useRef<HTMLTextAreaElement>(null),lock=useRef(false);
  const addRequest=useRef<{text:string;id:string}|null>(null);
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

  useEffect(()=>{if(view==='library'&&initialTopic&&initialTopic!=='unassigned')void select(initialTopic);},[initialTopic]);
  useEffect(()=>{if(initialQuestion){setMode('chat');setInput(initialQuestion);void select(initialTopic??'');}},[initialQuestion,initialTopic]);
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
  useEffect(()=>{const fn=()=>void refresh().catch(()=>{});window.addEventListener('assistant-changed',fn);return()=>window.removeEventListener('assistant-changed',fn);},[]);
  async function run(fn:()=>Promise<void>) {
    if(lock.current) return; lock.current=true;
    setBusy(true);setMessage('');
    try {await fn();await refresh();} catch(e){setMessage(e instanceof Error?e.message:String(e));} finally{lock.current=false;setBusy(false);requestAnimationFrame(()=>inputRef.current?.focus());}
  }
  async function select(id:string) {
    selectedRef.current=id;setSelected(id);setDetail(null);setDraft(null);setHistoryOpen(false);setMetadata(null);
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
        setSaved(selected||'unassigned');setMessage(selected?'原文已保存至知识库 · '+(state?.topics.find(t=>t.id===selected)?.title??'当前笔记')+'。后台整理稍后更新。':'原文已保存至知识库 · 待归类，开启自动整理后归类。');
      } else if(mode==='capture') {
        const result=await call<{summary:string}>('/capture','POST',{text:input});setMessage(result.summary);
      } else {
        const result=await call<{answer:string;references:{id:string;label:string}[]}>('/chat','POST',{text:input,topicId:selected||undefined,minutes:minutes?Number(minutes):undefined});
        setReferences(result.references);
      }
      setInput('');draftCache.current[mode]='';
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
    <header className="assistant-heading"><div><h2>{view==='library'?'知识库':'助理'}</h2><p>{view==='library'?'SOP、技能与想法，都在这里。':'问一问，或随手记下来。'}</p></div>
      <details className="assistant-preferences"><summary>AI 与自动整理设置</summary><div className="assistant-switches">
        <label><input type="checkbox" aria-label="助理 AI" checked={state?.preferences.aiEnabled??false} disabled={!state||busy} onChange={e=>{const value=e.target.checked;void run(async()=>{await call('/preferences','PATCH',{aiEnabled:value});});}}/>AI</label>
        <label><input type="checkbox" aria-label="自动整理" checked={state?.preferences.autoOrganize??false} disabled={!state||busy} onChange={e=>{const value=e.target.checked;void run(async()=>{await call('/preferences','PATCH',{autoOrganize:value});});}}/>自动整理</label>
      </div><p className="assistant-hint">开启 AI 后，相关内容发送给 DeepSeek；自动整理只处理有变化的笔记。</p></details>
    </header>
    {view==='capture'?<div className="mode-tabs" role="group" aria-label="选择功能">{([['chat','问助理'],['idea','记想法'],['capture','记任务 / 日程']] as const).map(([key,label])=><button key={key} aria-pressed={mode===key} disabled={busy} onClick={()=>{draftCache.current[mode]=input;setMode(key);setInput(draftCache.current[key]);setMessage('');if(key==='chat')void select('');inputRef.current?.focus();}}>{label}</button>)}</div>:<><input aria-label="搜索知识库" placeholder="搜索标题、主题或内容" value={search} onChange={e=>setSearch(e.target.value)}/><div className="library-list">{state?.topics.filter(t=>[t.title,t.category,t.summary].join(' ').toLowerCase().includes(search.toLowerCase())).map(t=><button className="library-entry" key={t.id} onClick={()=>void select(t.id)}><strong>{t.title}</strong><small>{t.category||'未分类'} · {t.kind==='sop'?'SOP':t.kind==='skill'?'技能':'知识 / 想法'}{t.dirty_at?' · 待整理':''}</small></button>)}{legacy.filter(t=>[t.title,t.category,t.content].join(' ').toLowerCase().includes(search.toLowerCase())).map(t=><button className="library-entry" key={t.id} onClick={()=>onOpenLegacy?.(t)}><strong>{t.title}</strong><small>{t.category||'未分类'} · {t.kind==='sop'?'SOP':t.kind==='skill'?'技能':'知识'}</small></button>)}</div></>}
    <div className="assistant-workspace compact-workspace">
      {view==='capture'&&mode!=='capture'?<details className="topic-sidebar" open={mode==='idea'||undefined}><summary>{mode==='idea'?'保存位置：'+(selected?state?.topics.find(t=>t.id===selected)?.title:'自动判断 / 待归类'):'可选：围绕某篇笔记'}</summary>
        <label>当前主题<select aria-label="当前主题" value={selected} disabled={busy||draft!==null} onChange={e=>void select(e.target.value)}>
          <option value="">全部事务 / 待归类</option>{state?.topics.map(t=><option value={t.id} key={t.id}>{t.title}{t.dirty_at?' · 待整理':''}</option>)}
        </select></label>
        <details><summary>新建笔记</summary><form onSubmit={e=>{e.preventDefault();void run(async()=>{const t=await call<Topic>('/topics','POST',{title});setTitle('');await select(t.id);});}}>
          <input aria-label="新主题名称" placeholder="新主题，例如论文修改" maxLength={100} value={title} onChange={e=>setTitle(e.target.value)}/>
          <button disabled={busy||!title.trim()||draft!==null}>新建主题</button>
        </form></details>
        <small>手动选择优先。不选择时，想法先保存，再由后台归类。</small>
      </details>:null}
      <div className="assistant-main">
        {view==='capture'?<form onSubmit={e=>void send(e)} className="assistant-compose">
          <div className="assistant-controls">{mode==='chat'?<label>可用分钟（选填）<input type="number" min={1} max={1440} value={minutes} onChange={e=>setMinutes(e.target.value)}/></label>:null}</div>
          <textarea ref={inputRef} disabled={busy} onKeyDown={e=>captureKey(e,setInput)} aria-label="告诉助理" rows={3} maxLength={mode==='idea'?8000:4000} value={input} onChange={e=>setInput(e.target.value)} placeholder={mode==='chat'?'今天先做哪个？或：这个主题有哪些想法还没想清楚？':mode==='idea'?'随手记下想法，也可以补充：刚才那条只是设想，还没决定。':'明天下午三点面试，提前半小时提醒我。'}/>
          <div className="assistant-controls"><small>{mode==='chat'?'回答只提供建议，不改动任务或日程。':mode==='idea'?'保留原文，不自动创建待办。':'提交后会写入任务或日程；AI 关闭时按原文创建任务。'}</small><button disabled={busy||!input.trim()}>{busy?'处理中…':mode==='chat'?'发送问题':mode==='idea'?'保存想法':'保存任务 / 日程'}</button></div>
          <small>Enter 提交 · Ctrl+Enter 换行</small>
        </form>:null}
        {message?<p role="status" className="assistant-notice">{message}{saved&&onOpenTopic?<button className="link-button" onClick={()=>onOpenTopic(saved)}>查看保存位置</button>:null}</p>:null}
        {view==='capture'&&mode==='chat'&&state?.messages.length?<details className="assistant-conversation" open><summary>最近对话</summary>
          <div className="conversation-scroll">{state.messages.map(m=><div className={'conversation-message '+m.role} key={m.id}><strong>{m.role==='user'?'你':'助理'}</strong><p>{m.content}</p></div>)}</div>
          {references.length?<small>本次回答依据：{references.map(r=>r.label).join('、')}</small>:null}
        </details>:null}
        {view==='library'&&detail?<div className="drawer-backdrop"><aside className="task-drawer notebook-drawer" role="dialog" aria-label="知识详情"><button onClick={()=>{if((draft!==null||metadata||addition.trim())&&!window.confirm('还有未保存编辑，确定关闭？'))return;void select('');setMetadata(null);setAddition('');}}>关闭详情</button><article className="topic-document">
          <header><small>{detail.topic.category||'未分类'} · {detail.topic.kind==='sop'?'SOP':detail.topic.kind==='skill'?'技能':'知识 / 想法'}</small><h3>{detail.topic.title}</h3><small>{detail.topic.organized_at?`最近整理：${new Date(detail.topic.organized_at).toLocaleString()}`:'尚未整理'}{detail.topic.paused?' · 已暂停自动改写':detail.topic.dirty_at?' · 有新内容待整理':' · 已是最新'}</small></header>
          {detail.topic.last_error?<p role="alert">{detail.topic.last_error}</p>:null}
          <div className="assistant-controls">
            <button disabled={busy||draft!==null||!state?.preferences.aiEnabled||!state?.preferences.configured||Boolean(detail.topic.paused)} onClick={()=>void run(async()=>{await call('/topics/'+selected+'/organize','POST');})}>现在整理</button>
            <button onClick={()=>onAsk?.(selected,detail.topic.title)}>问问这篇笔记</button><details><summary>更多</summary><div className="more-menu"><button onClick={()=>setMetadata({title:detail.topic.title,category:detail.topic.category??'',kind:detail.topic.kind,revision:detail.topic.revision})}>名称与分类</button>
            <button disabled={busy||draft!==null} onClick={()=>void run(async()=>{await call('/topics/'+selected,'PATCH',{revision:detail.topic.revision,paused:!detail.topic.paused});})}>{detail.topic.paused?'恢复自动整理':'暂停自动改写'}</button>
            <button disabled={busy||draft!==null||!detail.topic.summary} onClick={()=>{setDraft(detail.topic.summary);setEditRevision(detail.topic.revision);}}>编辑整理稿</button>
            <button onClick={()=>setHistoryOpen(!historyOpen)}>历史版本</button></div></details>
          </div>
          {metadata?<form onSubmit={e=>{e.preventDefault();void run(async()=>{await call('/topics/'+selected,'PATCH',metadata);setMetadata(null);});}}><label>笔记名称<input aria-label="笔记名称" maxLength={100} value={metadata.title} onChange={e=>setMetadata({...metadata,title:e.target.value})}/></label><label>主题<input aria-label="笔记主题" maxLength={100} value={metadata.category} onChange={e=>setMetadata({...metadata,category:e.target.value})}/></label><label>类型<select aria-label="笔记类型" value={metadata.kind} onChange={e=>setMetadata({...metadata,kind:e.target.value})}><option value="note">知识 / 想法</option><option value="sop">SOP</option><option value="skill">技能</option></select></label><button disabled={busy}>保存名称与分类</button><button type="button" onClick={()=>setMetadata(null)}>取消</button></form>:null}
          {draft!==null?<div><textarea aria-label="编辑整理稿" rows={12} value={draft} onChange={e=>setDraft(e.target.value)}/><small>保存后暂停自动改写。要持续自动整理，可用“记想法”补充纠正意见。</small><div className="assistant-controls"><button disabled={busy} onClick={()=>void run(async()=>{await call('/topics/'+selected,'PATCH',{revision:editRevision,summary:draft});setDraft(null);})}>保存整理稿</button><button onClick={()=>setDraft(null)}>取消编辑</button></div></div>:
            points.length?<div>{Object.entries(kindNames).map(([kind,label])=>points.some(p=>p.kind===kind)?<section key={kind}><h4>{label}</h4>{points.filter(p=>p.kind===kind).map((p,i)=><div key={i}><p className="topic-point">{p.text}</p><details className="point-evidence"><summary>查看依据（{p.sourceIds.length}）</summary>{p.sourceIds.map(id=><blockquote key={id}>{detail.thoughts.find(t=>t.id===id)?.raw_text??'原文已移到其他主题'}</blockquote>)}</details></div>)}</section>:null)}</div>:<p className="topic-summary">{detail.topic.summary||'想法已保存后会在这里形成整理稿。你也可以点击“现在整理”。'}</p>}
          {historyOpen?<div className="topic-history">{detail.versions.map(v=><details key={v.id}><summary>{new Date(v.created_at).toLocaleString()} · {v.author==='ai'?'AI 整理':v.author==='user'?'手动编辑':'恢复版本'}</summary><pre>{v.summary}</pre><button disabled={busy||draft!==null} onClick={()=>void run(async()=>{await call('/topics/'+selected,'PATCH',{revision:detail.topic.revision,restoreId:v.id});})}>恢复此版本并暂停自动改写</button></details>)}{!detail.versions.length?<p>暂无历史版本。</p>:null}</div>:null}
          <form className="notebook-addition" onSubmit={e=>{e.preventDefault();if(!addition.trim())return;void run(async()=>{if(addRequest.current?.text!==addition)addRequest.current={text:addition,id:crypto.randomUUID()};await call('/thoughts','POST',{text:addition,topicId:selected,requestId:addRequest.current.id});addRequest.current=null;setAddition('');setMessage('补充原文已保存。');});}}><label>补充想法<textarea aria-label="补充想法" rows={3} maxLength={8000} value={addition} disabled={busy} onChange={e=>setAddition(e.target.value)} onKeyDown={e=>captureKey(e,setAddition)}/></label><small>Enter 保存 · Ctrl+Enter 换行</small><button disabled={busy||!addition.trim()}>保存补充</button></form>
          <details><summary>原始记录（{detail.thoughts.length}）</summary>{sourceList(detail.thoughts)}</details>
        </article></aside></div>:view==='library'?<details open={initialTopic==='unassigned'||undefined} className="unassigned-thoughts"><summary>待归类想法（{state?.unassigned.length??0}）</summary><p>不确定或归类失败的想法保留在这里，可手动选择主题。</p><button disabled={busy} onClick={()=>void run(async()=>{await call('/classify/retry','POST');setMessage('已加入归类队列。需开启 AI 和自动整理。');})}>重新尝试自动归类</button>{sourceList(state?.unassigned??[])}</details>:null}
      </div>
    </div>
  </section>;
}
