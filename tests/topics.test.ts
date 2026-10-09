import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from './helpers/db.js';
import { openDatabase } from '../src/db/connection.js';
import { migrations, runMigrations } from '../src/db/migrations.js';
import { assistantPreferences, setAssistantPreferences, createTopic, captureThought, getTopic, topicDetail, topicThoughts, organizeTopic, editTopic, moveThought, runTopicSweep, listTopics } from '../src/services/topics.js';
import type { JsonModel } from '../src/services/assistantModel.js';
import { createTask } from '../src/services/tasks.js';

const opened:ReturnType<typeof createTestDb>[]=[];
function setup(){const ctx=createTestDb();opened.push(ctx);setAssistantPreferences(ctx.db,{aiEnabled:true,autoOrganize:true});return ctx;}
afterEach(()=>{for(const c of opened.splice(0)) c.close();vi.restoreAllMocks();});
const summarize:JsonModel=async(_system,input)=>({points:(input as {sources:{id:string;text:string}[]}).sources.map(s=>({kind:'idea',text:s.text,sourceIds:[s.id]}))});
const now='2026-10-08T04:00:00.000Z';
const later='2026-10-08T04:03:00.000Z';

describe('topic sources and versions',()=>{
  it('TC-TOPIC-001 migrates an old database without changing its tasks',()=>{
    const db=openDatabase(':memory:');
    db.exec('create table schema_migrations(id text primary key,applied_at text not null)');
    for(const m of migrations.filter(m=>m.id<'0007')){db.exec(m.sql);db.prepare('insert into schema_migrations values(?,?)').run(m.id,now);}
    const task=createTask(db,{title:'旧任务'});
    runMigrations(db);
    expect(db.prepare('select title from tasks where id=?').get(task.id)?.title).toBe('旧任务');
    expect(assistantPreferences(db).aiEnabled).toBe(false);
    expect(runMigrations(db)).toEqual([]);db.close();
  });
  it('TC-TOPIC-001 preserves verbatim captures and deduplicates retries',()=>{
    const {db}=setup();const t=createTopic(db,'论文');
    const text='  也许做两种\n边界条件。 ';
    const a=captureThought(db,{text,topicId:t.id,requestId:'once'});
    const b=captureThought(db,{text,topicId:t.id,requestId:'once'});
    expect(a.id).toBe(b.id);expect(a.raw_text).toBe(text);expect(topicThoughts(db,t.id)).toHaveLength(1);
    expect(()=>captureThought(db,{text:'不同内容',requestId:'once'})).toThrow();
  });
  it('TC-TOPIC-002 preserves every source, uncertainty and alternatives in validated model output',async()=>{
    const {db}=setup();const t=createTopic(db,'实验');
    const a=captureThought(db,{text:'可能用两种边界',topicId:t.id});
    const b=captureThought(db,{text:'也考虑三种边界',topicId:t.id});
    await organizeTopic(db,t.id,async()=>({points:[{kind:'alternative',text:'可能用两种；也考虑三种，尚未决定。',sourceIds:[a.id,b.id]}]}));
    const d=topicDetail(db,t.id);expect(d.topic.summary).toContain('尚未决定');expect(d.versions).toHaveLength(1);
    expect(JSON.parse(d.topic.points_json)[0].sourceIds).toEqual([a.id,b.id]);
  });
  it.each(['missing','invented','invalid'])('TC-TOPIC-002 rejects %s evidence without replacing prior summary',async(kind)=>{
    const {db}=setup();const t=createTopic(db,'论文');const a=captureThought(db,{text:'第一条',topicId:t.id});
    await organizeTopic(db,t.id,summarize);const old=getTopic(db,t.id).summary;
    captureThought(db,{text:'第二条',topicId:t.id});
    const model=async()=>kind==='invalid'?{points:'oops'}:{points:[{kind:'idea',text:'内容',sourceIds:[kind==='invented'?'fake':a.id]}]};
    await expect(organizeTopic(db,t.id,model)).rejects.toThrow();
    expect(getTopic(db,t.id).summary).toBe(old);expect(getTopic(db,t.id).last_error).toBeTruthy();
  });
  it('TC-TOPIC-003 rejects a stale result after a concurrent capture',async()=>{
    const {db}=setup();const t=createTopic(db,'主题');captureThought(db,{text:'原始',topicId:t.id});
    const result=await organizeTopic(db,t.id,async(s,i)=>{captureThought(db,{text:'新内容',topicId:t.id});return summarize(s,i);});
    expect(result).toMatchObject({stale:true});expect(getTopic(db,t.id).summary).toBe('');
  });
  it('TC-TOPIC-003 keeps manual edits and their evidence across resumed organization',async()=>{
    const {db}=setup();const t=createTopic(db,'主题');captureThought(db,{text:'原始',topicId:t.id});
    await organizeTopic(db,t.id,async(s,i)=>{editTopic(db,t.id,{revision:getTopic(db,t.id).revision,summary:'这只是设想，尚未决定'});return summarize(s,i);});
    expect(getTopic(db,t.id).summary).toBe('这只是设想，尚未决定');expect(getTopic(db,t.id).paused).toBe(1);
    editTopic(db,t.id,{revision:getTopic(db,t.id).revision,paused:false});
    await organizeTopic(db,t.id,summarize);expect(getTopic(db,t.id).summary).toContain('手动修订');
    expect(()=>editTopic(db,t.id,{revision:0,summary:'旧编辑'})).toThrow('已更新');
  });
  it('TC-TOPIC-004 restores as a new version and pauses automatic rewriting',async()=>{
    const {db}=setup();const t=createTopic(db,'主题');captureThought(db,{text:'初稿',topicId:t.id});
    await organizeTopic(db,t.id,summarize);const original=topicDetail(db,t.id).versions[0];
    captureThought(db,{text:'补充',topicId:t.id});await organizeTopic(db,t.id,summarize);
    editTopic(db,t.id,{revision:getTopic(db,t.id).revision,restoreId:String(original.id)});
    expect(getTopic(db,t.id).summary).toBe(original.summary);expect(getTopic(db,t.id).paused).toBe(1);expect(topicDetail(db,t.id).versions).toHaveLength(3);
  });
  it('TC-TOPIC-005 moving a source marks both summaries dirty and never changes its text',async()=>{
    const {db}=setup();const a=createTopic(db,'A'),b=createTopic(db,'B');const c=captureThought(db,{text:'原文',topicId:a.id});
    await organizeTopic(db,a.id,summarize);moveThought(db,c.id,b.id);
    expect(getTopic(db,a.id).dirty_at).toBeTruthy();expect(getTopic(db,b.id).dirty_at).toBeTruthy();
    expect(topicThoughts(db,b.id)[0].raw_text).toBe('原文');
  });
});
describe('background organization',()=>{
  it('TC-TOPIC-006 disabled AI and disabled auto mode call no model',async()=>{
    const {db}=setup();const t=createTopic(db,'主题');captureThought(db,{text:'原文',topicId:t.id},now);
    const model=vi.fn(summarize);setAssistantPreferences(db,{aiEnabled:false});await runTopicSweep(db,model,later);
    setAssistantPreferences(db,{aiEnabled:true,autoOrganize:false});await runTopicSweep(db,model,later);expect(model).not.toHaveBeenCalled();
  });
  it('TC-TOPIC-006 persisted dirty work survives database restart',async()=>{
    const ctx=setup();const t=createTopic(ctx.db,'主题');captureThought(ctx.db,{text:'原文',topicId:t.id},now);
    const another=openDatabase(ctx.path);await runTopicSweep(another,summarize,later);expect(getTopic(another,t.id).summary).toContain('原文');another.close();
  });
  it('TC-TOPIC-007 debounces and skips unchanged topics',async()=>{
    const {db}=setup();const t=createTopic(db,'主题');captureThought(db,{text:'原文',topicId:t.id},now);const model=vi.fn(summarize);
    await runTopicSweep(db,model,'2026-10-08T04:01:00.000Z');expect(model).not.toHaveBeenCalled();
    await runTopicSweep(db,model,later);await runTopicSweep(db,model,'2026-10-09T04:00:00.000Z');expect(model).toHaveBeenCalledTimes(1);
  });
  it('TC-TOPIC-007 backs off failures while preserving evidence',async()=>{
    const {db}=setup();const t=createTopic(db,'主题');captureThought(db,{text:'原文',topicId:t.id},now);
    const model=vi.fn(async()=>{throw new Error('网络失败');});await runTopicSweep(db,model,later);await runTopicSweep(db,model,'2026-10-08T04:04:00.000Z');
    expect(model).toHaveBeenCalledTimes(1);expect(topicThoughts(db,t.id)).toHaveLength(1);expect(getTopic(db,t.id).last_error).toBe('网络失败');
    await organizeTopic(db,t.id,summarize);expect(getTopic(db,t.id).last_error).toBeNull();
  });
  it('TC-TOPIC-008 classifies clear thoughts but leaves uncertain ones available',async()=>{
    const {db}=setup();const clear=captureThought(db,{text:'论文的边界条件'},now);const unsure=captureThought(db,{text:'再想想'},now);
    await runTopicSweep(db,async()=>({assignments:[{id:clear.id,newTitle:'论文'},{id:unsure.id,topicId:null,newTitle:null}]}),later);
    expect(listTopics(db)).toHaveLength(1);expect(topicThoughts(db,null).map(t=>t.id)).toEqual([unsure.id]);
    expect(db.prepare('select count(*) n from tasks').get()?.n).toBe(0);
  });
  it('TC-TOPIC-009 rejects oversized context before calling the model',async()=>{
    const {db}=setup();const t=createTopic(db,'主题');for(let i=0;i<8;i++)captureThought(db,{text:'想'.repeat(7900),topicId:t.id});
    const model=vi.fn(summarize);await expect(organizeTopic(db,t.id,model)).rejects.toThrow('上限');expect(model).not.toHaveBeenCalled();expect(topicThoughts(db,t.id)).toHaveLength(8);
  });
  it('disabling AI while a request is running discards the result',async()=>{
    const {db}=setup();const t=createTopic(db,'主题');captureThought(db,{text:'内容',topicId:t.id});
    await organizeTopic(db,t.id,async(s,i)=>{setAssistantPreferences(db,{aiEnabled:false});return summarize(s,i);});expect(getTopic(db,t.id).summary).toBe('');
  });
});

it('TC-0912 independent point editing preserves sibling, original sources and history',async()=>{
 const {db}=setup();const t=createTopic(db,'秋招');const a=captureThought(db,{text:'按JD改简历',topicId:t.id}),b=captureThought(db,{text:'明确目标岗位',topicId:t.id});
 await organizeTopic(db,t.id,async()=>({points:[{title:'调整简历',chapter:'简历',kind:'idea',text:'按JD修改',sourceIds:[a.id]},{title:'明确方向',chapter:'求职方向',kind:'idea',text:'明确目标岗位',sourceIds:[b.id]}]}));
 const before=getTopic(db,t.id),points=JSON.parse(before.points_json);
 editTopic(db,t.id,{revision:before.revision,pointIndex:0,point:{title:'匹配经历',text:'只保留真实经历',chapter:'简历'}});
 const after=getTopic(db,t.id),next=JSON.parse(after.points_json);expect(next[1]).toEqual(points[1]);expect(next[0].sourceIds).toContain(a.id);expect(next[0].sourceIds).not.toContain(b.id);expect(after.paused).toBe(1);expect(topicDetail(db,t.id).versions).toHaveLength(2);expect(topicThoughts(db,t.id).find(t=>t.id===a.id)?.raw_text).toBe('按JD改简历');
 expect(()=>editTopic(db,t.id,{revision:before.revision,pointIndex:0,point:{title:'过期',text:'覆盖'}})).toThrow('更新');
});
