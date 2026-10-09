import {it,expect} from 'vitest';
import {createTestDb} from './helpers/db.js';
import {deleteKnowledgeCategory,createKnowledgeCategory,listKnowledgeCategories,renameKnowledgeCategory} from '../src/services/knowledgeCategories.js';
import {createTopic,captureThought,getTopic} from '../src/services/topics.js';
import {createKnowledgeItem} from '../src/services/personalOps.js';
import {moveKnowledgeCard} from '../src/services/libraryManagement.js';
it('TC-0916 empty categories, normalized duplicates, rename preserves sources and siblings',()=>{const {db,close}=createTestDb();try{
 createKnowledgeCategory(db,'自学');expect(listKnowledgeCategories(db)).toContainEqual({name:'自学',count:0});expect(createKnowledgeCategory(db,' 自学 ').name).toBe('自学');expect(()=>createKnowledgeCategory(db,'  ')).toThrow();
 const t=createTopic(db,'秋招'),raw=captureThought(db,{text:'准备简历',topicId:t.id});const legacy=createKnowledgeItem(db,{kind:'note',title:'旧笔记',category:'秋招',content:'原文'});
 renameKnowledgeCategory(db,'秋招','求职');expect(listKnowledgeCategories(db)).toContainEqual({name:'求职',count:2});expect(listKnowledgeCategories(db).some(c=>c.name==='秋招')).toBe(false);expect(JSON.parse(getTopic(db,t.id).points_json)[0]).toMatchObject({category:'求职',categoryLocked:true,sourceIds:[raw.id]});expect(db.prepare('select raw_text from thought_captures where id=?').get(raw.id)?.raw_text).toBe('准备简历');expect(db.prepare('select content from knowledge_items where id=?').get(legacy.id)?.content).toBe('原文');
 expect(()=>renameKnowledgeCategory(db,'求职','自学')).toThrow();moveKnowledgeCard(db,{kind:'legacy',id:legacy.id,category:'自学'});moveKnowledgeCard(db,{kind:'topic',id:t.id,index:0,revision:getTopic(db,t.id).revision,category:'自学'});expect(listKnowledgeCategories(db)).toContainEqual({name:'求职',count:0});
 }finally{close();}});

it('TC-0917 empty deletion and populated transfer preserve raw content and siblings',()=>{const {db,close}=createTestDb();try{
 createKnowledgeCategory(db,'空分类');deleteKnowledgeCategory(db,'空分类');expect(listKnowledgeCategories(db).some(c=>c.name==='空分类')).toBe(false);
 createKnowledgeCategory(db,'目标');const t=createTopic(db,'原分类'),raw=captureThought(db,{text:'不可丢失的来源',topicId:t.id});
 db.prepare('update thought_topics set points_json=? where id=?').run(JSON.stringify([{kind:'idea',text:'迁移正文',sourceIds:[raw.id]},{kind:'idea',text:'其他知识',sourceIds:[raw.id],category:'其他分类'}]),t.id);
 const old=createKnowledgeItem(db,{kind:'note',title:'旧知识',category:'原分类',content:'保留全文'});
 const before=getTopic(db,t.id);expect(()=>deleteKnowledgeCategory(db,'原分类')).toThrow('有知识');expect(()=>deleteKnowledgeCategory(db,'原分类','原分类')).toThrow();expect(()=>deleteKnowledgeCategory(db,'原分类','不存在')).toThrow();expect(getTopic(db,t.id)).toEqual(before);
 expect(deleteKnowledgeCategory(db,'原分类','目标').moved).toBe(2);expect(listKnowledgeCategories(db).some(c=>c.name==='原分类')).toBe(false);expect(listKnowledgeCategories(db)).toContainEqual({name:'目标',count:2});
 const points=JSON.parse(getTopic(db,t.id).points_json);expect(points[0]).toMatchObject({text:'迁移正文',sourceIds:[raw.id],category:'目标',categoryLocked:true});expect(points[1]).toEqual(JSON.parse(before.points_json)[1]);expect(db.prepare('select raw_text from thought_captures where id=?').get(raw.id)?.raw_text).toBe('不可丢失的来源');expect(db.prepare('select content,category from knowledge_items where id=?').get(old.id)).toEqual({content:'保留全文',category:'目标'});
 createKnowledgeCategory(db,'刚才是空的');createKnowledgeItem(db,{kind:'note',title:'新增',category:'刚才是空的'});expect(()=>deleteKnowledgeCategory(db,'刚才是空的')).toThrow('有知识');
 }finally{close();}});
