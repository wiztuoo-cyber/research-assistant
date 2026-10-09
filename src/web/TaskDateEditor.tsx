import React,{useState} from 'react';
import {localDateKey,dateCaption} from '../domain/timePresentation';
import {changed} from './interactions';
export function TaskDateEditor({task,onSaved}:{task:{id:string;start_at:string|null;deadline_at:string|null;reminder_at:string|null};onSaved:()=>void}) {
  const [start,setStart]=useState(task.start_at?localDateKey(task.start_at):''),[deadline,setDeadline]=useState(task.deadline_at?localDateKey(task.deadline_at):'');
  const localTime=(s:string|null)=>{if(!s)return '';const d=new Date(s);return localDateKey(d)+'T'+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');};
  const [reminder,setReminder]=useState(localTime(task.reminder_at)),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  function dateValue(value:string,old:string|null){if(!value)return null;if(old&&localDateKey(old)===value)return old;if(!old||old.length===10)return value;const d=new Date(old),[y,m,day]=value.split('-').map(Number);d.setFullYear(y,m-1,day);return d.toISOString();}
  return <form className="task-date-editor" onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);try{const r=await fetch('/api/tasks/'+task.id,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({task:{startAt:dateValue(start,task.start_at),deadlineAt:dateValue(deadline,task.deadline_at),reminderAt:reminder?new Date(reminder).toISOString():null}})});const d=await r.json();if(!r.ok)throw new Error(d.error);changed();onSaved();setError('日期已保存');}catch(e){setError(String(e));}finally{setBusy(false);}}}>
    <h3>时间安排</h3><label>计划哪天做<input aria-label="计划日期" type="date" value={start} onChange={e=>setStart(e.target.value)}/></label><label>真正的截止日期<input aria-label="截止日期" type="date" value={deadline} onChange={e=>setDeadline(e.target.value)}/></label><small>已有具体时刻会保留。{task.deadline_at&&task.deadline_at.length>10?'当前截止：'+dateCaption(task.deadline_at):''}</small><label>提醒时间<input aria-label="提醒时间" type="datetime-local" value={reminder} onChange={e=>setReminder(e.target.value)}/></label><button disabled={busy}>保存日期</button>{error?<p role="status">{error}</p>:null}
  </form>;
}
