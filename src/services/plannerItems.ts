import type {DatabaseSync} from 'node:sqlite';
import {textValue} from './assistantModel.js';
export function updateSchedule(db:DatabaseSync,id:string,input:Record<string,unknown>){
  const old=db.prepare('select * from schedule_items where id=?').get(id);if(!old)throw new Error('事项不存在。');
  const next:Record<string,unknown>={...old};for(const key of ['title','start_at','end_at','reminder_at','location','status','notes'])if(Object.hasOwn(input,key))next[key]=input[key];
  textValue(next.title,500);if(!['scheduled','completed','canceled'].includes(String(next.status)))throw new Error('状态无效。');
  for(const key of ['start_at','end_at','reminder_at'])if(next[key]!==null&&(typeof next[key]!=='string'||!Number.isFinite(Date.parse(String(next[key])))))throw new Error('日期无效。');
  if(next.end_at&&(!next.start_at||Date.parse(String(next.end_at))<Date.parse(String(next.start_at))))throw new Error('结束时间不能早于开始。');
  db.prepare('update schedule_items set title=?,start_at=?,end_at=?,reminder_at=?,location=?,status=?,notes=?,updated_at=? where id=?').run(String(next.title),next.start_at as string|null,next.end_at as string|null,next.reminder_at as string|null,next.location as string|null,String(next.status),next.notes as string|null,new Date().toISOString(),id);
  return {item:db.prepare('select * from schedule_items where id=?').get(id)};
}
export function saveAppearance(db:DatabaseSync,id:string,input:{category?:string;color?:string|null;position?:number}){
  if(!db.prepare('select id from tasks where id=? union select id from schedule_items where id=?').get(id,id))throw new Error('事项不存在。');
  if(input.category!==undefined&&typeof input.category!=='string')throw new Error('分类无效。');
  if(input.color&& !/^#[0-9a-f]{6}$/i.test(input.color))throw new Error('颜色无效。');
  if(input.position!==undefined&&!Number.isFinite(input.position))throw new Error('顺序无效。');
  const old=db.prepare('select * from item_appearance where item_id=?').get(id);
  db.prepare('insert into item_appearance(item_id,category,color,position) values(?,?,?,?) on conflict(item_id) do update set category=excluded.category,color=excluded.color,position=excluded.position').run(id,input.category??String(old?.category??''),input.color===undefined?old?.color??null:input.color,input.position??Number(old?.position??0));return {ok:true};
}
