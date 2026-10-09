import {describe,it,expect,vi} from 'vitest';
import request from 'supertest';
import {createTestDb} from './helpers/db.js';
import {createApp} from '../src/server/app.js';
import {createTopic,captureThought,getTopic,editTopic,setAssistantPreferences,runTopicSweep,organizeTopic,topicThoughts} from '../src/services/topics.js';
import {retrieveKnowledge,saveImage,extractImage} from '../src/services/knowledgeSources.js';
import {mergeTopics} from '../src/services/libraryManagement.js';
import {undoAction} from '../src/services/undo.js';
import {calendarEvent} from '../src/domain/plannerPresentation.js';
import {askAssistant,conversationHistory} from '../src/services/assistantChat.js';
import {createScheduleItem} from '../src/services/personalOps.js';

describe('v0.2.9 accepted flows',()=>{
 it('TC-0902 creates a new category and topic; explicit category wins',async()=>{const {db,close}=createTestDb();try{
  setAssistantPreferences(db,{aiEnabled:true,autoOrganize:true});const t=captureThought(db,{text:'健身训练心得',category:'健康'},'2026-10-01T00:00:00Z');
  await runTopicSweep(db,async()=>({points:[{kind:'idea',title:'力量训练',text:'健身训练心得',sourceIds:[t.id]}]}),'2026-10-01T00:03:00Z');
  const row=db.prepare('select * from thought_topics').get()!;expect(row.category).toBe('健康');expect(JSON.parse(String(row.points_json))[0]).toMatchObject({title:'力量训练',category:'健康'});
 }finally{close();}});
 it('TC-0902 merged claim retains both sources and chapter',async()=>{const {db,close}=createTestDb();try{
  setAssistantPreferences(db,{aiEnabled:true});const topic=createTopic(db,'专业选择');const a=captureThought(db,{text:'A认为机械就业机会多',topicId:topic.id,sourceTitle:'帖子A',sourceUrl:'https://example.com/a'}),b=captureThought(db,{text:'B认为机械适合考公',topicId:topic.id,sourceTitle:'帖子B'});
  await organizeTopic(db,topic.id,async()=>({points:[{chapter:'机械专业的不同评价',kind:'idea',text:'A推荐就业机会，B关注考公；均为作者观点。',sourceIds:[a.id,b.id]}]}));
  expect(getTopic(db,topic.id).summary).toContain('## 机械');expect(JSON.parse(getTopic(db,topic.id).points_json)[0].sourceIds).toHaveLength(2);
 }finally{close();}});
 it('TC-0901 knowledge retrieval reads originals and preserves references in history',async()=>{const {db,close}=createTestDb();try{
  setAssistantPreferences(db,{aiEnabled:true});const t=createTopic(db,'找公司');const c=captureThought(db,{topicId:t.id,text:'找适合投递的公司，先用岗位JD筛选。',sourceTitle:'投递经验',sourceUrl:'https://example.com/post'});
  expect(retrieveKnowledge(db,'怎么找公司').sources.map(s=>s.id)).toContain(c.id);
  const model=vi.fn(async(_s:string,ctx:any)=>{expect(ctx.knowledgeSources[0].text).toContain('JD');return {answer:'先按岗位要求筛选。',references:[{id:c.id,label:'经验'}]};});
  const result=await askAssistant(db,{text:'怎么找适合投递的公司？'},model);expect(result.references[0].url).toBe('https://example.com/post');expect(String(conversationHistory(db).at(-1)?.references_json)).toContain('投递经验');
 }finally{close();}});
 it('TC-0902 merge undo preserves originals and rejects later edits',()=>{const {db,close}=createTestDb();try{
  const a=createTopic(db,'A'),b=createTopic(db,'B');captureThought(db,{text:'来源A',topicId:a.id});const result=mergeTopics(db,a.id,b.id);expect(topicThoughts(db,b.id)).toHaveLength(1);undoAction(db,result.undoToken);expect(topicThoughts(db,a.id)).toHaveLength(1);
  const next=mergeTopics(db,a.id,b.id);editTopic(db,b.id,{revision:getTopic(db,b.id).revision,summary:'人工内容'});expect(()=>undoAction(db,next.undoToken)).toThrow('更新');
 }finally{close();}});
 it('TC-0903 image extraction caches results and source URL rejects script schemes',async()=>{const {db,close}=createTestDb();try{
  const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nAAAAABJRU5ErkJggg==';const a=saveImage(db,png),b=saveImage(db,png);expect(a.id).toBe(b.id);const model=vi.fn(async()=> '截图中的可读文字');await extractImage(db,a.id,model);await extractImage(db,a.id,model);expect(model).toHaveBeenCalledTimes(1);
  expect(()=>captureThought(db,{text:'x',sourceUrl:'javascript:alert(1)'})).toThrow();
 }finally{close();}});
 it('TC-0904 schedule can be canceled and undone; main can open planner',async()=>{const {db,close}=createTestDb();try{
  const open=vi.fn(),app=createApp(db,{openPlanner:open}),s=createScheduleItem(db,{title:'面试',start_at:'2026-10-09T10:00:00+08:00'});
  await request(app).post('/api/desktop/open-planner').expect(200);expect(open).toHaveBeenCalledOnce();const r=await request(app).patch('/api/personal/schedule/'+s.id).send({status:'canceled'}).expect(200);await request(app).post('/api/undo/'+r.body.undoToken).expect(200);expect(db.prepare('select status from schedule_items where id=?').get(s.id)?.status).toBe('scheduled');
 }finally{close();}});
 it('TC-0905 deadline alone is a dot; explicit multiday dates create an inclusive span',()=>{
  const item={id:'1',title:'修改简历',status:'next',start_at:null,deadline_at:'2026-10-12'};expect(calendarEvent(item,'task')?.display).toBe('list-item');
  const event=calendarEvent({...item,start_at:'2026-10-09',end_at:'2026-10-11'},'schedule');expect(event?.display).toBe('block');expect(event?.end).toBe('2026-10-12');expect(event?.extendedProps.category).toBe('秋招');
 });
});
