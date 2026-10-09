import React, {useEffect,useState} from 'react';
import {flushSync} from 'react-dom';
export function captureKey(e:React.KeyboardEvent<HTMLTextAreaElement>,setText:(v:string)=>void) {
  if(e.key!=='Enter'||e.nativeEvent.isComposing||e.keyCode===229)return;
  e.preventDefault();
  if(e.ctrlKey){const n=e.currentTarget,s=n.selectionStart;flushSync(()=>setText(n.value.slice(0,s)+'\n'+n.value.slice(n.selectionEnd)));n.setSelectionRange(s+1,s+1);}
  else if(!e.repeat)e.currentTarget.form?.requestSubmit();
}
export function changed(data?:{undoToken?:string}) {
  window.dispatchEvent(new Event('assistant-changed'));localStorage.setItem('assistant-data-revision',String(Date.now()));
  if(data?.undoToken)window.dispatchEvent(new CustomEvent('assistant-undo',{detail:data.undoToken}));
}
export function UndoNotice(){
  const [token,setToken]=useState(''),[error,setError]=useState('');
  useEffect(()=>{const fn=(e:Event)=>{setToken((e as CustomEvent<string>).detail);setError('');};window.addEventListener('assistant-undo',fn);return()=>window.removeEventListener('assistant-undo',fn);},[]);
  useEffect(()=>{if(!token)return;const t=setTimeout(()=>setToken(''),12000);return()=>clearTimeout(t);},[token]);
  return token||error?<div className="undo-notice" role="status">{error||'操作已完成'}{token?<button onClick={async()=>{const id=token;setToken('');try{const r=await fetch('/api/undo/'+id,{method:'POST'}),d=await r.json();if(!r.ok)throw new Error(d.error);changed();}catch(e){setError(String(e));}}}>撤销</button>:null}</div>:null;
}
