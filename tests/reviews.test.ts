import {describe,it,expect} from 'vitest';
import {createTestDb} from './helpers/db.js';
import {startReview,respondReview,saveReview,exportReview,getReview,relevantReviews} from '../src/services/reviews.js';
import {createTask,updateTaskFields} from '../src/services/tasks.js';
import {createTopic,captureThought,organizeTopic,setAssistantPreferences,getTopic} from '../src/services/topics.js';
import {moveKnowledgeCard} from '../src/services/libraryManagement.js';
import {createKnowledgeItem} from '../src/services/personalOps.js';
import {undoable,undoAction} from '../src/services/undo.js';

describe('v0.2.11 reviews and manual classification',()=>{
 it('TC-0914 card drag preserves sibling and content; undo is guarded',async()=>{const {db,close}=createTestDb();try{
  setAssistantPreferences(db,{aiEnabled:true});const t=createTopic(db,'秋招'),a=captureThought(db,{text:'改简历',topicId:t.id}),b=captureThought(db,{text:'练面试',topicId:t.id});
  await organizeTopic(db,t.id,async()=>({points:[{kind:'idea',text:'改简历',sourceIds:[a.id]},{kind:'idea',text:'练面试',sourceIds:[b.id]}]}));
  const old=getTopic(db,t.id);const moved=undoable(db,'card',t.id,()=>moveKnowledgeCard(db,{kind:'topic',id:t.id,index:0,revision:old.revision,category:'求职准备'}));
  let points=JSON.parse(getTopic(db,t.id).points_json);expect(points[0].category).toBe('求职准备');expect(points[0].sourceIds).toEqual([a.id]);expect(points[1]).toEqual(JSON.parse(old.points_json)[1]);expect(getTopic(db,t.id).paused).toBe(0);
  expect(()=>moveKnowledgeCard(db,{kind:'topic',id:t.id,index:0,revision:old.revision,category:'其他'})).toThrow('更新');undoAction(db,moved.undoToken);expect(getTopic(db,t.id).points_json).toBe(old.points_json);
  const legacy=createKnowledgeItem(db,{kind:'note',title:'旧代码',content:'原代码',category:'科研'});const result=undoable(db,'knowledge',legacy.id,()=>moveKnowledgeCard(db,{kind:'legacy',id:legacy.id,category:'工具'}));undoAction(db,result.undoToken);expect(db.prepare('select category,content from knowledge_items where id=?').get(legacy.id)).toEqual({category:'科研',content:'原代码'});
 }finally{close();}});
 it('TC-0914 automatic organization retains manual category without pausing new content',async()=>{const {db,close}=createTestDb();try{
  setAssistantPreferences(db,{aiEnabled:true});const t=createTopic(db,'混合笔记'),a=captureThought(db,{text:'根据岗位改简历',topicId:t.id});
  const model=async()=>({points:[{kind:'idea',title:'简历匹配',text:'根据岗位改简历',sourceIds:[a.id]}]});await organizeTopic(db,t.id,model);
  moveKnowledgeCard(db,{kind:'topic',id:t.id,index:0,revision:getTopic(db,t.id).revision,category:'秋招'});await organizeTopic(db,t.id,model);expect(JSON.parse(getTopic(db,t.id).points_json)[0].category).toBe('秋招');expect(getTopic(db,t.id).paused).toBe(0);
  const pending=createTopic(db,'待整理笔记'),raw=captureThought(db,{text:'新想法',topicId:pending.id});moveKnowledgeCard(db,{kind:'topic',id:pending.id,index:0,revision:getTopic(db,pending.id).revision,category:'我的分类'});await organizeTopic(db,pending.id,async()=>({points:[{kind:'idea',text:'整理后的新想法',sourceIds:[raw.id]}]}));expect(JSON.parse(getTopic(db,pending.id).points_json)[0].category).toBe('我的分类');
 }finally{close();}});
 it('TC-0915 snapshot, local fallback, explicit exports are idempotent',async()=>{const {db,close}=createTestDb();try{
  const task=createTask(db,{title:'面试准备',startAt:'2026-10-09',deadlineAt:'2026-10-10'});const r=startReview(db,{title:'面试复盘',taskId:task.id,requestId:'review-once'},new Date('2026-10-09T12:00:00+08:00'));expect(startReview(db,{title:'面试复盘',taskId:task.id,requestId:'review-once'}).id).toBe(r.id);updateTaskFields(db,task.id,{title:'已改名'});expect(getReview(db,r.id).context.tasks[0].title).toBe('面试准备');
  const answered=await respondReview(db,r.id,{revision:0,text:'贡献介绍不清楚'});expect(answered.draft.outcome).toBe('贡献介绍不清楚');expect(answered.draft.reason).toContain('待补充');expect(answered.exports).toHaveLength(0);
  expect(()=>exportReview(db,r.id,{kind:'task',revision:answered.revision})).toThrow('先保存');
  const saved=saveReview(db,r.id,{revision:answered.revision,title:r.title,draft:{...answered.draft,nextStep:'准备一分钟介绍',lesson:'提前整理个人贡献'}});
  const first=exportReview(db,r.id,{kind:'task',revision:saved.revision}),repeat=exportReview(db,r.id,{kind:'task',revision:saved.revision});expect(first.itemId).toBe(repeat.itemId);expect(db.prepare('select count(*) as n from tasks').get()?.n).toBe(2);
  exportReview(db,r.id,{kind:'knowledge',revision:saved.revision,category:'秋招'});expect(db.prepare('select content from knowledge_items').get()?.content).toContain(r.id);expect(relevantReviews(db,'面试')).toHaveLength(1);
  expect(()=>saveReview(db,r.id,{revision:0,title:'过期',draft:saved.draft})).toThrow('更新');
 }finally{close();}});
 it('TC-0915 weekly scope and model result cannot overwrite concurrent edits',async()=>{const {db,close}=createTestDb();try{
  setAssistantPreferences(db,{aiEnabled:true});createTask(db,{title:'本周计划',startAt:'2026-10-09'});createTask(db,{title:'未来计划',startAt:'2099-01-01'});
  const r=startReview(db,{title:'本周复盘',scope:'week'},new Date('2026-10-09T12:00:00+08:00'));expect(r.context.tasks.map((t:any)=>t.title)).toEqual(['本周计划']);
  const next=await respondReview(db,r.id,{revision:0,text:'遇到了问题'},async(system,input:any)=>{expect(system).toContain('不推断');expect(input.messages.at(-1).content).toBe('遇到了问题');return {answer:'你认为卡在哪里？',draft:{goal:'',outcome:'遇到了问题',reason:'待补充',nextStep:'',lesson:''}};});expect(next.messages.at(-1).content).toBe('你认为卡在哪里？');
  await expect(respondReview(db,r.id,{revision:next.revision,text:'我修改了'},async()=>{saveReview(db,r.id,{revision:next.revision,title:'用户修改',draft:next.draft});return {answer:'已整理',draft:next.draft};})).rejects.toThrow('未覆盖');expect(getReview(db,r.id).title).toBe('用户修改');
 }finally{close();}});
});
