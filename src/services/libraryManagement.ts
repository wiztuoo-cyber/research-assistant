import {knowledgeCards} from '../domain/knowledgeCards.js';
import {textValue} from './assistantModel.js';
import {updateKnowledgeItem} from './personalOps.js';
import type {DatabaseSync} from 'node:sqlite';
import {getTopic,topicThoughts} from './topics.js';
import {randomUUID} from 'node:crypto';

// Keep both old documents and sources recoverable; merge cannot overwrite a manually edited summary.
export function mergeTopics(db:DatabaseSync,from:string,to:string){
  if(from===to)throw new Error('请选择不同的小类。');
  const source=getTopic(db,from),target=getTopic(db,to);
  const captures=topicThoughts(db,from),at=new Date().toISOString(),token=randomUUID();
  db.exec('BEGIN IMMEDIATE');
  try{
    db.prepare('update thought_captures set topic_id=?,assignment_locked=1 where topic_id=?').run(to,from);
    db.prepare('update thought_topics set archived=1,revision=revision+1 where id=?').run(from);
    db.prepare('update thought_topics set dirty_at=?,revision=revision+1 where id=?').run(at,to);
    const after={source:getTopic(db,from),target:getTopic(db,to),captureIds:topicThoughts(db,to).map(c=>c.id)};
    db.prepare('insert into ui_undo values(?,?,?,?,?,?)').run(token,'merge',from,JSON.stringify({source,target,captures}),JSON.stringify(after),new Date(Date.now()+120000).toISOString());
    db.exec('COMMIT');return {ok:true,undoToken:token};
  }catch(e){db.exec('ROLLBACK');throw e;}
}
export function undoMerge(db:DatabaseSync,item:Record<string,unknown>){
  const before=JSON.parse(String(item.before_json)),after=JSON.parse(String(item.after_json));
  const current={source:getTopic(db,before.source.id),target:getTopic(db,before.target.id),captureIds:topicThoughts(db,before.target.id).map(c=>c.id)};
  if(JSON.stringify(current)!==JSON.stringify(after))throw new Error('合并后已有更新，不能覆盖。原稿仍保留在历史数据中。');
  db.exec('BEGIN IMMEDIATE');
  try{for(const c of before.captures)db.prepare('update thought_captures set topic_id=?,assignment_locked=? where id=?').run(before.source.id,c.assignment_locked,c.id);
    db.prepare('update thought_topics set archived=0,revision=? where id=?').run(before.source.revision,before.source.id);
    db.prepare('update thought_topics set dirty_at=?,revision=? where id=?').run(before.target.dirty_at,before.target.revision,before.target.id);
    db.prepare('delete from ui_undo where id=?').run(String(item.id));db.exec('COMMIT');return {ok:true};
  }catch(e){db.exec('ROLLBACK');throw e;}
}

export function moveKnowledgeCard(db:DatabaseSync,input:{kind:string;id:string;index?:number;revision?:number;category:string}){
 const category=textValue(input.category,100).trim();
 if(input.kind==='legacy')return updateKnowledgeItem(db,textValue(input.id,100),{category});
 if(input.kind!=='topic')throw new Error('卡片类型无效');
 const topic=getTopic(db,input.id);if(topic.revision!==input.revision)throw new Error('笔记已更新，请刷新后再拖动');
 const points=knowledgeCards(topic),index=input.index;
 if(!Number.isInteger(index)||index!<0||index!>=points.length)throw new Error('卡片不存在');
 points[index!]={...points[index!],category,categoryLocked:true};
 db.prepare('update thought_topics set points_json=?,revision=revision+1 where id=?').run(JSON.stringify(points),topic.id);
 return {ok:true};
}
