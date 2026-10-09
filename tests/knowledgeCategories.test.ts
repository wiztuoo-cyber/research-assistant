import {it,expect} from 'vitest';
import {createTestDb} from './helpers/db.js';
import {createKnowledgeCategory,listKnowledgeCategories,renameKnowledgeCategory} from '../src/services/knowledgeCategories.js';
import {createTopic,captureThought,getTopic} from '../src/services/topics.js';
import {createKnowledgeItem} from '../src/services/personalOps.js';
import {moveKnowledgeCard} from '../src/services/libraryManagement.js';
it('TC-0916 empty categories, normalized duplicates, rename preserves sources and siblings',()=>{const {db,close}=createTestDb();try{
 createKnowledgeCategory(db,'自学');expect(listKnowledgeCategories(db)).toContainEqual({name:'自学',count:0});expect(createKnowledgeCategory(db,' 自学 ').name).toBe('自学');expect(()=>createKnowledgeCategory(db,'  ')).toThrow();
 const t=createTopic(db,'秋招'),raw=captureThought(db,{text:'准备简历',topicId:t.id});const legacy=createKnowledgeItem(db,{kind:'note',title:'旧笔记',category:'秋招',content:'原文'});
 renameKnowledgeCategory(db,'秋招','求职');expect(listKnowledgeCategories(db)).toContainEqual({name:'求职',count:2});expect(listKnowledgeCategories(db).some(c=>c.name==='秋招')).toBe(false);expect(JSON.parse(getTopic(db,t.id).points_json)[0]).toMatchObject({category:'求职',categoryLocked:true,sourceIds:[raw.id]});expect(db.prepare('select raw_text from thought_captures where id=?').get(raw.id)?.raw_text).toBe('准备简历');expect(db.prepare('select content from knowledge_items where id=?').get(legacy.id)?.content).toBe('原文');
 expect(()=>renameKnowledgeCategory(db,'求职','自学')).toThrow();moveKnowledgeCard(db,{kind:'legacy',id:legacy.id,category:'自学'});moveKnowledgeCard(db,{kind:'topic',id:t.id,index:0,revision:getTopic(db,t.id).revision,category:'自学'});expect(listKnowledgeCategories(db)).toContainEqual({name:'求职',count:0});
 }finally{close();}});
