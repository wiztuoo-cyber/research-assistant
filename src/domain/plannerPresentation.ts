import {localDateKey} from './timePresentation.js';
export interface CalendarItem {id:string;title:string;start_at:string|null;end_at?:string|null;deadline_at?:string|null;status:string;starred?:boolean}
export const categoryColors:Record<string,string>={'秋招':'#6587c7','论文':'#a081bd','生活':'#739980','其他':'#9299a4'};
export function inferCategory(title:string){return /面试|简历|投递|招聘|笔试|秋招|宣讲/.test(title)?'秋招':/论文|实验|算例|文献|绘图|研究/.test(title)?'论文':/购物|健身|吃饭|生活|运动|家务/.test(title)?'生活':'其他';}
export function calendarEvent(item:CalendarItem,kind:'task'|'schedule',appearance?:{category?:string;color?:string|null}){
  const start=item.start_at||(kind==='task'?item.deadline_at:null);if(!start)return null;
  const first=localDateKey(start),last=item.end_at?localDateKey(item.end_at):first;
  const span=Boolean(item.start_at&&item.end_at&&last>first);
  const end=span?new Date(Number(last.slice(0,4)),Number(last.slice(5,7))-1,Number(last.slice(8,10))+1):null;
  const category=appearance?.category||inferCategory(item.title),color=appearance?.color||categoryColors[category]||categoryColors['其他'];
  return {id:kind+':'+item.id,title:item.title,start:first,end:end?localDateKey(end):undefined,allDay:true,display:span?'block':'list-item',backgroundColor:color,borderColor:color,textColor:span?'#ffffff':'#283548',extendedProps:{kind,item,category,color,span,time:start.length>10?new Date(start).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false}):'',deadlineOnly:!item.start_at}};
}
