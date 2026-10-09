import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {recordTaskEvent} from './events.js';
import {undoMerge} from './libraryManagement.js';
type Kind = 'task'|'thought'|'knowledge'|'schedule'|'topic'|'card';
const tables = { task:'tasks', thought:'thought_captures', knowledge:'knowledge_items',schedule:'schedule_items',topic:'thought_topics',card:'thought_topics' };
export function undoable<T>(db:DatabaseSync,kind:Kind,id:string,action:()=>T):T & {undoToken:string} {
  const before=db.prepare(`select * from ${tables[kind]} where id=?`).get(id);
  if(!before) throw new Error('记录不存在。');
  const result=action();
  const after=db.prepare(`select * from ${tables[kind]} where id=?`).get(id);
  const token=randomUUID();
  db.prepare('delete from ui_undo where expires_at<?').run(new Date().toISOString());
  db.prepare('insert into ui_undo values(?,?,?,?,?,?)').run(token,kind,id,JSON.stringify(before),JSON.stringify(after),new Date(Date.now()+120000).toISOString());
  return {...result,undoToken:token};
}
export function undoAction(db:DatabaseSync,token:string) {
  const item=db.prepare('select * from ui_undo where id=?').get(token);
  if(!item || String(item.expires_at)<new Date().toISOString()) throw new Error('撤销已过期，请到详情或回收站处理。');
  if(item.kind==='merge')return undoMerge(db,item);
  const kind=item.kind as Kind;
  const current=db.prepare(`select * from ${tables[kind]} where id=?`).get(String(item.target_id));
  if(JSON.stringify(current)!==item.after_json) throw new Error('记录已被再次修改，不能覆盖后续操作。');
  const before=JSON.parse(String(item.before_json));
  const fields=kind==='card'?['points_json','revision','paused']:kind==='topic'?['title','category','kind','revision']:kind==='schedule'?['title','start_at','end_at','reminder_at','location','status','notes','updated_at']:kind==='task'?['status','completed_at','deleted_at','updated_at']:kind==='knowledge'?['status','category','updated_at']:['topic_id','assignment_locked','classification_attempted'];
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`update ${tables[kind]} set ${fields.map(f=>`${f}=?`).join(',')} where id=?`).run(...fields.map(f=>before[f]),String(item.target_id));
    if(kind==='task') recordTaskEvent(db,{taskId:String(item.target_id),eventType:'undo',oldValue:current,newValue:before,createdBy:'web',at:new Date().toISOString()});
    if(kind==='thought') for(const id of new Set([before.topic_id,current?.topic_id].filter(Boolean))) {
      db.prepare('update thought_topics set revision=revision+1,dirty_at=?,retry_at=null,last_error=null where id=?').run(new Date().toISOString(),id);
    }
    db.prepare('delete from ui_undo where id=?').run(token);db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  return {ok:true};
}
