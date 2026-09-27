import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { nowIso } from '../db/connection.js';

type Row = Record<string, unknown>;

export interface TaskStep {
  id: string;
  task_id: string;
  title: string;
  completed: boolean;
  position: number;
}

export interface TaskPoint {
  id: string;
  task_id: string;
  content: string;
  position: number;
}

export function listTaskSteps(db: DatabaseSync, taskId: string): TaskStep[] {
  return db.prepare('select * from task_steps where task_id=? order by position, created_at')
    .all(taskId).map((row:any)=>({
      id:String(row.id), task_id:String(row.task_id), title:String(row.title),
      completed:Number(row.completed)===1, position:Number(row.position)
    }));
}

export function addTaskStep(db: DatabaseSync, taskId: string, title: string, at=nowIso()): TaskStep {
  const pos = Number((db.prepare('select coalesce(max(position),-1)+1 as p from task_steps where task_id=?').get(taskId) as Row).p ?? 0);
  const id=randomUUID();
  db.prepare('insert into task_steps (id,task_id,title,completed,position,created_at,updated_at) values (?,?,?,?,?,?,?)')
    .run(id,taskId,title.trim(),0,pos,at,at);
  return {id,task_id:taskId,title:title.trim(),completed:false,position:pos};
}

export function setTaskStepCompleted(db: DatabaseSync, stepId: string, completed: boolean, at=nowIso()): TaskStep {
  db.prepare('update task_steps set completed=?, updated_at=? where id=?').run(completed?1:0,at,stepId);
  const row=db.prepare('select * from task_steps where id=?').get(stepId) as any;
  if(!row) throw new Error('Step not found.');
  return {id:String(row.id),task_id:String(row.task_id),title:String(row.title),completed:Number(row.completed)===1,position:Number(row.position)};
}

export function listTaskPoints(db: DatabaseSync, taskId: string): TaskPoint[] {
  return db.prepare('select * from task_points where task_id=? order by position, created_at')
    .all(taskId).map((row:any)=>({
      id:String(row.id), task_id:String(row.task_id), content:String(row.content), position:Number(row.position)
    }));
}

export function addTaskPoint(db: DatabaseSync, taskId: string, content: string, at=nowIso()): TaskPoint {
  const pos = Number((db.prepare('select coalesce(max(position),-1)+1 as p from task_points where task_id=?').get(taskId) as Row).p ?? 0);
  const id=randomUUID();
  db.prepare('insert into task_points (id,task_id,content,position,created_at,updated_at) values (?,?,?,?,?,?)')
    .run(id,taskId,content.trim(),pos,at,at);
  return {id,task_id:taskId,content:content.trim(),position:pos};
}

export function setTaskStarred(db: DatabaseSync, taskId: string, starred: boolean, at=nowIso()): void {
  db.prepare('update tasks set starred=?, updated_at=? where id=?').run(starred?1:0,at,taskId);
}

export function getTaskDetails(db: DatabaseSync, taskId: string) {
  const row = db.prepare('select id,title,notes,status,priority,importance,urgency,start_at,deadline_at,reminder_at,starred from tasks where id=?').get(taskId) as Row | undefined;
  if(!row) throw new Error('Task not found.');
  return {
    task: {
      id:String(row.id), title:String(row.title), notes: row.notes==null?null:String(row.notes),
      status:String(row.status), priority:String(row.priority), importance:Number(row.importance),
      urgency:Number(row.urgency), start_at: row.start_at==null?null:String(row.start_at),
      deadline_at: row.deadline_at==null?null:String(row.deadline_at), reminder_at: row.reminder_at==null?null:String(row.reminder_at),
      starred:Number(row.starred)===1
    },
    steps:listTaskSteps(db,taskId),
    points:listTaskPoints(db,taskId)
  };
}


export function deleteTaskStep(db: DatabaseSync, stepId: string): void {
  db.prepare('delete from task_steps where id=?').run(stepId);
}

export function deleteTaskPoint(db: DatabaseSync, pointId: string): void {
  db.prepare('delete from task_points where id=?').run(pointId);
}


export function updateTaskStepTitle(db: DatabaseSync, stepId: string, title: string, at=nowIso()): TaskStep {
  db.prepare('update task_steps set title=?, updated_at=? where id=?').run(title.trim(), at, stepId);
  const row=db.prepare('select * from task_steps where id=?').get(stepId) as any;
  if(!row) throw new Error('Step not found.');
  return {id:String(row.id),task_id:String(row.task_id),title:String(row.title),completed:Number(row.completed)===1,position:Number(row.position)};
}

export function updateTaskPointContent(db: DatabaseSync, pointId: string, content: string, at=nowIso()): TaskPoint {
  db.prepare('update task_points set content=?, updated_at=? where id=?').run(content.trim(), at, pointId);
  const row=db.prepare('select * from task_points where id=?').get(pointId) as any;
  if(!row) throw new Error('Point not found.');
  return {id:String(row.id),task_id:String(row.task_id),content:String(row.content),position:Number(row.position)};
}
