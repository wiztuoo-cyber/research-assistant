import {describe,it,expect,vi} from 'vitest';
import request from 'supertest';
import {createTestDb} from './helpers/db.js';
import {createApp} from '../src/server/app.js';
import {createTask,getTask,updateTaskFields} from '../src/services/tasks.js';
import {askAssistant} from '../src/services/assistantChat.js';
import {createTopic,captureThought,editTopic,getTopic,setAssistantPreferences} from '../src/services/topics.js';
import {dateCaption,timeBadge,dayDistance,sortTaskAgenda,localDateKey} from '../src/domain/timePresentation.js';

describe('approved usability changes',()=>{
  it('TC-UX-004 distinguishes plan age from deadline age using local calendar days',()=>{
    const now=new Date(2026,9,8,12);
    expect(timeBadge('2026-10-07','plan',now)).toEqual({label:'原计划昨天',overdue:false});
    expect(timeBadge('2026-10-07','deadline',now)).toEqual({label:'逾期 1 天',overdue:true});
    expect(timeBadge('2026-10-08','deadline',now).overdue).toBe(false);
    expect(timeBadge(new Date(2026,9,8,11).toISOString(),'deadline',now).overdue).toBe(true);
    expect(dayDistance(new Date(2026,9,9,0,30).toISOString(),now)).toBe(1);
    expect(localDateKey(new Date(2026,9,9,0,30).toISOString())).toBe('2026-10-09');
    expect(dateCaption('2026-10-08')).toBe('2026-10-08');
  });
  it('TC-UX-004 today precedes other tasks, then actual deadline order',()=>{
    const now=new Date(2026,9,8,12);
    const result=sortTaskAgenda([{status:'next',start_at:null,deadline_at:null,id:'undated'},{status:'next',start_at:null,deadline_at:'2026-10-09',id:'due'},{status:'next',start_at:'2026-10-08',deadline_at:null,id:'today'}],now);
    expect(result.map(r=>r.id)).toEqual(['today','due','undated']);
  });
  it('TC-UX-005 unfinished queries list every active task with no model call or topic scope',async()=>{
    const {db,close}=createTestDb();try{
      setAssistantPreferences(db,{aiEnabled:true});
      const topic=createTopic(db,'秋招');for(let i=0;i<5;i++)createTask(db,{title:'事项'+i});
      const model=vi.fn();const r=await askAssistant(db,{text:'我还有什么任务没做',topicId:topic.id},model);
      expect(r.answer).toContain('共 5 项');expect(r.answer).toContain('事项4');expect(model).not.toHaveBeenCalled();
    }finally{close();}
  });
  it('TC-UX-005 selected-note questions retain original evidence',async()=>{
    const {db,close}=createTestDb();try{
      setAssistantPreferences(db,{aiEnabled:true});const t=createTopic(db,'论文');const source=captureThought(db,{text:'尚未确定',topicId:t.id});
      await askAssistant(db,{text:'这篇笔记有哪些不确定之处',topicId:t.id},async(_s,input)=>{expect((input as any).topic.sources[0].text).toBe('尚未确定');return {answer:'尚未确定',references:[{id:source.id,label:'原文'}]};});
    }finally{close();}
  });
  it('TC-UX-006 completes only the selected duplicate and restores exact original status',async()=>{
    const {db,close}=createTestDb();try{
      const a=createTask(db,{title:'论文',status:'scheduled',startAt:'2026-10-10',deadlineAt:'2026-10-11'}),b=createTask(db,{title:'论文'}),app=createApp(db);
      const r=await request(app).post('/api/tasks/'+a.id+'/complete').send({}).expect(200);
      expect(getTask(db,b.id)?.status).toBe('next');expect(getTask(db,a.id)?.status).toBe('completed');
      await request(app).post('/api/undo/'+r.body.undoToken).expect(200);
      expect(getTask(db,a.id)).toMatchObject({status:'scheduled',start_at:'2026-10-10',deadline_at:'2026-10-11',completed_at:null});
      await request(app).post('/api/undo/'+r.body.undoToken).expect(400);
    }finally{close();}
  });
  it('TC-UX-006 rejects undo after a subsequent edit',async()=>{
    const {db,close}=createTestDb();try{
      const a=createTask(db,{title:'论文'}),app=createApp(db);const r=await request(app).post('/api/tasks/'+a.id+'/trash').send({}).expect(200);
      updateTaskFields(db,a.id,{title:'已改名'});
      await request(app).post('/api/undo/'+r.body.undoToken).expect(400);expect(getTask(db,a.id)?.title).toBe('已改名');
    }finally{close();}
  });
  it('TC-UX-003 renames and classifies a topic without copying or discarding evidence',()=>{
    const {db,close}=createTestDb();try{
      const t=createTopic(db,'秋招');captureThought(db,{text:'根据JD修改简历',topicId:t.id});
      const d=editTopic(db,t.id,{revision:getTopic(db,t.id).revision,title:'岗位匹配与简历调整',category:'秋招',kind:'sop'});
      expect(d.topic).toMatchObject({title:'岗位匹配与简历调整',category:'秋招',kind:'sop'});expect(d.thoughts).toHaveLength(1);
    }finally{close();}
  });
  it('TC-UX-006 undoes a source move and marks both topics for regeneration',async()=>{
    const {db,close}=createTestDb();try{
      const a=createTopic(db,'A'),b=createTopic(db,'B'),thought=captureThought(db,{text:'原文',topicId:a.id}),app=createApp(db);
      const r=await request(app).patch('/api/assistant/thoughts/'+thought.id).send({topicId:b.id}).expect(200);
      await request(app).post('/api/undo/'+r.body.undoToken).expect(200);
      expect(db.prepare('select topic_id from thought_captures where id=?').get(thought.id)?.topic_id).toBe(a.id);
      expect(getTopic(db,a.id).dirty_at).toBeTruthy();expect(getTopic(db,b.id).dirty_at).toBeTruthy();
    }finally{close();}
  });
  it('TC-UX-007 exposes main-window focus without duplicating windows',async()=>{
    const {db,close}=createTestDb();try{
      const open=vi.fn();const app=createApp(db,{openMainWindow:open});await request(app).post('/api/desktop/open-main').expect(200);expect(open).toHaveBeenCalledTimes(1);
    }finally{close();}
  });
});
