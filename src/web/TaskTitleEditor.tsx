import React,{useState} from 'react';
import {changed} from './interactions';

export function TaskTitleEditor({task,onSaved}:{task:{id:string;title:string};onSaved:()=>void}){
  const [editing,setEditing]=useState(false),[title,setTitle]=useState(task.title),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function save(){
    if(busy)return;
    if(!title.trim()){setError('任务名称不能为空');return;}
    setBusy(true);setError('');
    try{const r=await fetch('/api/tasks/'+task.id,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({task:{title:title.trim()}})});const d=await r.json();if(!r.ok)throw new Error(d.error||'保存失败');changed(d);setEditing(false);onSaved();}
    catch(e){setError(String(e));}finally{setBusy(false);}
  }
  return editing?<form className="task-title-editor" onSubmit={e=>{e.preventDefault();void save();}} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();setEditing(false);setError('');}if(e.key==='Enter'&&e.nativeEvent.isComposing)e.preventDefault();}}><input autoFocus aria-label="任务名称" maxLength={500} value={title} disabled={busy} onChange={e=>setTitle(e.target.value)}/><button disabled={busy}>保存名称</button><button type="button" disabled={busy} onClick={()=>setEditing(false)}>取消</button>{error?<small role="alert">{error}</small>:null}</form>:<button className="editable-task-title" title="点击编辑任务名称" onClick={()=>{setTitle(task.title);setError('');setEditing(true);}}>{task.title}</button>;
}
