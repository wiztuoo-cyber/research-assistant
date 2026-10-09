import {it,expect} from 'vitest';
import {createTestDb} from './helpers/db.js';
import {captureThought,getTopic,topicThoughts,recoverCategorizedThoughts,assignThoughtCategory,retryClassification,setAssistantPreferences} from '../src/services/topics.js';
it('TC-0918 selected category immediately creates an AI-independent raw card and deduplicates retries',()=>{const {db,close}=createTestDb();try{
 const body={text:'  简历需要突出贡献。\n保留原文。',category:'秋招',requestId:'chosen-once',sourceTitle:'帖子A',sourceUrl:'https://example.com/a'};const a=captureThought(db,body);expect(a.topic_id).toBeTruthy();expect(captureThought(db,body).id).toBe(a.id);expect(topicThoughts(db,null)).toHaveLength(0);const t=getTopic(db,a.topic_id!);expect(t.category).toBe('秋招');expect(JSON.parse(t.points_json)[0]).toMatchObject({text:body.text,sourceIds:[a.id],categoryLocked:true});expect(a.source_url).toBe(body.sourceUrl);
 const b=captureThought(db,{text:body.text,category:'秋招'});expect(b.topic_id).not.toBe(a.topic_id);
 }finally{close();}});
it('TC-0918 old hinted thoughts recover once and unassigned thoughts can be classified manually',()=>{const {db,close}=createTestDb();try{
 const old=captureThought(db,{text:'旧的想法'});db.prepare('update thought_captures set category_hint=?,classification_attempted=1 where id=?').run('学习',old.id);expect(recoverCategorizedThoughts(db)).toBe(1);expect(recoverCategorizedThoughts(db)).toBe(0);expect(db.prepare('select raw_text from thought_captures where id=?').get(old.id)?.raw_text).toBe('旧的想法');
 const pending=captureThought(db,{text:'手动归类'});const r=assignThoughtCategory(db,pending.id,'学习');expect(getTopic(db,r.topicId).summary).toBe('手动归类');expect(()=>assignThoughtCategory(db,pending.id,'其他')).toThrow('已归类');
 }finally{close();}});
it('TC-0918 explicit AI classification runs immediately with auto disabled and reports failure',async()=>{const {db,close}=createTestDb();try{
 const p=captureThought(db,{text:'刚刚记录'});await expect(retryClassification(db,async()=>({}))).rejects.toThrow('AI 已关闭');setAssistantPreferences(db,{aiEnabled:true,autoOrganize:false});await expect(retryClassification(db,async()=>{throw new Error('接口不可用');})).rejects.toThrow('接口不可用');expect(topicThoughts(db,null)).toHaveLength(1);
 const result=await retryClassification(db,async()=>({assignments:[{id:p.id,newTitle:'即时笔记',category:'学习'}]}));expect(result).toMatchObject({classified:1,remaining:0});const row=db.prepare('select * from thought_topics').get()!;expect(JSON.parse(String(row.points_json))[0]).toMatchObject({text:'刚刚记录',sourceIds:[p.id]});
 }finally{close();}});
