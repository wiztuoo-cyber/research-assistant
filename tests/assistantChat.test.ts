import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createTestDb } from './helpers/db.js';
import { createTask } from '../src/services/tasks.js';
import { createScheduleItem } from '../src/services/personalOps.js';
import { askAssistant, conversationHistory } from '../src/services/assistantChat.js';
import { createTopic, captureThought, setAssistantPreferences } from '../src/services/topics.js';
import { createApp } from '../src/server/app.js';
import { assistantModel } from '../src/services/assistantModel.js';

const opened:ReturnType<typeof createTestDb>[]=[];
function setup(){const c=createTestDb();opened.push(c);return c;}
afterEach(()=>{opened.splice(0).forEach(c=>c.close());vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe('read-only assistant',()=>{
  it('TC-CHAT-001 reads real tasks, fixed schedules and source text without mutating plans',async()=>{
    const {db}=setup();setAssistantPreferences(db,{aiEnabled:true});
    const t=createTask(db,{title:'论文',startAt:'2026-10-08',deadlineAt:'2026-10-10',estimatedMinutes:90});
    const s=createScheduleItem(db,{title:'面试',start_at:'2026-10-08T15:00:00+08:00',end_at:'2026-10-08T16:00:00+08:00'});
    const topic=createTopic(db,'论文修改');const thought=captureThought(db,{text:'还没有决定是否补实验',topicId:topic.id});
    const before=db.prepare('select * from tasks').all();
    const result=await askAssistant(db,{text:'今天先做什么？',topicId:topic.id,minutes:60},async(system,input)=>{
      const ctx=input as any;
      expect(ctx.tasks[0]).toMatchObject({id:t.id,start_at:'2026-10-08',deadline_at:'2026-10-10',estimated_minutes:90});
      expect(ctx.schedules[0].id).toBe(s.id);expect(ctx.topic).toBeNull();expect(ctx.availableMinutes).toBe(60);
      expect(system).toContain('不能声称已经');
      return {answer:'先准备面试；论文预计90分钟，超过当前60分钟。',references:[{id:t.id,label:'论文'}]};
    },new Date('2026-10-08T04:00:00Z'));
    expect(result.provider).toBe('deepseek');expect(db.prepare('select * from tasks').all()).toEqual(before);
  });
  it('TC-CHAT-002 includes follow-up history and rejects fabricated source IDs',async()=>{
    const {db}=setup();setAssistantPreferences(db,{aiEnabled:true});
    await askAssistant(db,{text:'我只有半小时'},async()=>({answer:'还需要了解任务耗时。',references:[]}));
    await askAssistant(db,{text:'那先做哪个？'},async(_s,ctx)=>{
      expect((ctx as any).history[0].content).toBe('我只有半小时');return {answer:'先确认耗时。',references:[]};
    });
    await expect(askAssistant(db,{text:'再想想'},async()=>({answer:'不存在',references:[{id:'fake',label:'fake'}]}))).rejects.toThrow('不存在');
    expect(conversationHistory(db)).toHaveLength(4);
  });
  it('TC-CHAT-003 AI off never calls a model and literal capture never parses reminders',async()=>{
    const {db}=setup();const app=createApp(db);const model=vi.fn();
    const text='一分钟后提醒我发邮件';
    await request(app).post('/api/assistant/capture').send({text}).expect(200);
    const row=db.prepare('select * from tasks').get();expect(row?.title).toBe(text);expect(row?.reminder_at).toBeNull();
    await askAssistant(db,{text:'先做什么'},model);expect(model).not.toHaveBeenCalled();
  });
  it('TC-TOPIC-001/010 API preserves source and allows revision-guarded editing',async()=>{
    const {db}=setup();const app=createApp(db);
    const topic=(await request(app).post('/api/assistant/topics').send({title:'论文'}).expect(201)).body;
    await request(app).post('/api/assistant/thoughts').send({text:'  也许加实验  ',topicId:topic.id,requestId:'one'}).expect(201);
    const detail=(await request(app).get('/api/assistant/topics/'+topic.id).expect(200)).body;
    expect(detail.thoughts[0].raw_text).toBe('  也许加实验  ');
    await request(app).patch('/api/assistant/topics/'+topic.id).send({revision:detail.topic.revision,summary:'人工整理'}).expect(200);
    await request(app).patch('/api/assistant/topics/'+topic.id).send({revision:detail.topic.revision,summary:'过期编辑'}).expect(400);
    expect(db.prepare('select count(*) n from tasks').get()?.n).toBe(0);
    await request(app).patch('/api/assistant/preferences').send({aiEnabled:'yes'}).expect(400);
    await request(app).get('/api/assistant/topics/missing').expect(400);
  });
  it('assistant routes retain API authentication',async()=>{
    const {db}=setup();vi.stubEnv('API_TOKEN','test-secret');
    await request(createApp(db)).get('/api/assistant/state').expect(401);
    await request(createApp(db)).get('/api/assistant/state').set('x-api-token','test-secret').expect(200);
  });
  it('model boundary rejects truncation and never leaks provider body',async()=>{
    vi.stubEnv('DEEPSEEK_API_KEY','test-key');
    vi.stubGlobal('fetch',vi.fn(async()=>new Response('sensitive-provider-body',{status:429})));
    await expect(assistantModel('test',{})).rejects.toThrow('429');
    vi.stubGlobal('fetch',vi.fn(async()=>Response.json({choices:[{finish_reason:'length',message:{content:'{}'}}]})));
    await expect(assistantModel('test',{})).rejects.toThrow('过长');
  });
});
