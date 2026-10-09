export function localDateKey(value: string | Date): string {
  if(typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d=value instanceof Date?value:new Date(value);
  if(!Number.isFinite(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
export function dayDistance(value:string,now=new Date()):number {
  const ordinal=(key:string)=>{const [y,m,d]=key.split('-').map(Number);return Date.UTC(y,m-1,d)/86400000;};
  return ordinal(localDateKey(value))-ordinal(localDateKey(now));
}
export function dateCaption(value:string|null|undefined):string {
  if(!value) return '';
  if(value.length===10) return value;
  return new Date(value).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
}
export function timeBadge(value:string|null|undefined,kind:'deadline'|'plan'|'event',now=new Date()) {
  if(!value) return {label:kind==='deadline'?'无截止日期':'未安排',overdue:false};
  const days=dayDistance(value,now);
  if(!Number.isFinite(days)) return {label:'日期待检查',overdue:false};
  if(kind==='deadline') {
    if(days<0) return {label:`逾期 ${-days} 天`,overdue:true};
    if(days===0 && value.length>10 && Date.parse(value)<now.getTime()) return {label:'已过截止时间',overdue:true};
    return {label:days===0?'今天截止':days===1?'明天截止':`距截止 ${days} 天`,overdue:false};
  }
  if(kind==='event') return {label:days<0?'已开始':days===0?`今天 ${value.length>10?dateCaption(value).split(' ').pop():''}`:days===1?'明天开始':`距开始 ${days} 天`,overdue:false};
  return {label:days<0?`原计划${days===-1?'昨天':`${-days} 天前`}`:days===0?'今天做':days===1?'明天做':`${days} 天后做`,overdue:false};
}
interface PlannedTask {status:string;start_at:string|null;deadline_at:string|null;importance?:number}
export function sortTaskAgenda<T extends PlannedTask>(tasks:T[],now=new Date()):T[] {
  const today=(t:T)=>t.status==='today'||Boolean(t.start_at&&dayDistance(t.start_at,now)===0);
  const deadline=(t:T)=>t.deadline_at?Date.parse(t.deadline_at.length===10?t.deadline_at+'T23:59:59.999':t.deadline_at):Infinity;
  return [...tasks].sort((a,b)=>Number(today(b))-Number(today(a)) || deadline(a)-deadline(b) || (b.importance??0)-(a.importance??0));
}
