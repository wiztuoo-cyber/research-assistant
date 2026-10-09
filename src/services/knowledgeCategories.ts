import type {DatabaseSync} from 'node:sqlite';
import {knowledgeCards} from '../domain/knowledgeCards.js';
import {textValue} from './assistantModel.js';

const normalize=(name:string)=>name.normalize('NFKC').trim().toLowerCase();
export function listKnowledgeCategories(db:DatabaseSync){
 const counts=new Map<string,number>();
 for(const r of db.prepare('select name from knowledge_categories order by created_at,name').all())counts.set(String(r.name),0);
 const add=(name:string)=>counts.set(name,(counts.get(name)||0)+1);
 for(const t of db.prepare('select title,summary,points_json,category from thought_topics where archived=0').all())for(const p of knowledgeCards(t as any))add(p.category||String(t.category||t.title));
 for(const r of db.prepare("select category from knowledge_items where status='active'").all())add(String(r.category||'其他'));
 return [...counts].map(([name,count])=>({name,count}));
}
export function createKnowledgeCategory(db:DatabaseSync,value:unknown){
 const name=textValue(value,100).trim();
 if(normalize(name)==='全部知识')throw new Error('请使用其他大类名称');
 const existing=listKnowledgeCategories(db).find(c=>normalize(c.name)===normalize(name));
 const canonical=existing?.name||name;
 db.prepare('insert or ignore into knowledge_categories values(?,?)').run(canonical,new Date().toISOString());return {name:canonical};
}
export function rememberKnowledgeCategories(db:DatabaseSync){
 const stmt=db.prepare('insert or ignore into knowledge_categories values(?,?)');
 for(const c of listKnowledgeCategories(db))stmt.run(c.name,new Date().toISOString());
}
export function renameKnowledgeCategory(db:DatabaseSync,from:string,value:unknown){
 textValue(from,100);const name=textValue(value,100).trim(),categories=listKnowledgeCategories(db);
 if(!categories.some(c=>c.name===from))throw new Error('大类已变更，请刷新');
 if(name===from)return {name};
 if(normalize(name)==='全部知识'||categories.some(c=>c.name!==from&&normalize(c.name)===normalize(name)))throw new Error('该名称已存在，请换一个名称');
 db.exec('BEGIN IMMEDIATE');try{
  rememberKnowledgeCategories(db);
  db.prepare('update knowledge_categories set name=? where name=?').run(name,from);
  for(const t of db.prepare('select * from thought_topics where archived=0').all()){
   const points=knowledgeCards(t as any);let changed=false;
   for(const p of points)if((p.category||t.category||t.title)===from){p.category=name;p.categoryLocked=true;if(!p.sourceIds.length)p.sourceIds=db.prepare('select id from thought_captures where topic_id=?').all(t.id).map(r=>String(r.id));changed=true;}
   if(changed||t.category===from)db.prepare('update thought_topics set category=?,points_json=?,revision=revision+1 where id=?').run(t.category===from?name:t.category,JSON.stringify(points),t.id);
  }
  db.prepare("update knowledge_items set category=?,updated_at=? where coalesce(nullif(category,''),'其他')=? and status='active'").run(name,new Date().toISOString(),from);
  db.prepare('update thought_captures set category_hint=? where category_hint=?').run(name,from);
  db.exec('COMMIT');return {name};
 }catch(e){db.exec('ROLLBACK');throw e;}
}

export function deleteKnowledgeCategory(db:DatabaseSync,from:unknown,to?:unknown){
 const name=textValue(from,100).trim();
 db.exec('BEGIN IMMEDIATE');try{
  const categories=listKnowledgeCategories(db),source=categories.find(c=>c.name===name);
  if(!source)throw new Error('大类已变更，请刷新');
  const target=to===undefined?null:textValue(to,100).trim();
  if(target===name)throw new Error('请选择另一个大类');
  if(target&&!categories.some(c=>c.name===target))throw new Error('目标大类已变更，请重新选择');
  if(source.count&&!target)throw new Error('大类中有知识，请先选择移动到哪个大类');
  rememberKnowledgeCategories(db);
  for(const t of db.prepare('select * from thought_topics where archived=0').all()){
   const points=knowledgeCards(t as any);let changed=false;
   for(const p of points)if((p.category||t.category||t.title)===name){
    p.category=target!;p.categoryLocked=true;
    if(!p.sourceIds.length)p.sourceIds=db.prepare('select id from thought_captures where topic_id=?').all(t.id).map(r=>String(r.id));
    changed=true;
   }
   if(changed||t.category===name)db.prepare('update thought_topics set category=?,points_json=?,revision=revision+1 where id=?').run(t.category===name?target:t.category,JSON.stringify(points),t.id);
  }
  db.prepare("update knowledge_items set category=?,updated_at=? where coalesce(nullif(category,''),'其他')=? and status='active'").run(target,new Date().toISOString(),name);
  db.prepare('update thought_captures set category_hint=? where category_hint=?').run(target,name);
  db.prepare('delete from knowledge_categories where name=?').run(name);
  db.exec('COMMIT');return {deleted:name,moved:source.count,target};
 }catch(e){db.exec('ROLLBACK');throw e;}
}
