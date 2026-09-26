import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { nowIso } from '../db/connection.js';

type Row = Record<string, unknown>;

export interface ScheduleItem {
  id: string;
  title: string;
  kind: string;
  start_at: string | null;
  end_at: string | null;
  location: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobApplication {
  id: string;
  company: string;
  role: string | null;
  status: string;
  next_action: string | null;
  deadline_at: string | null;
  event_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeItem {
  id: string;
  kind: 'sop' | 'skill' | 'note';
  title: string;
  category: string | null;
  content: string | null;
  tags_json: string | null;
  proficiency: number | null;
  status: string;
  created_at: string;
  updated_at: string;
}

function ns(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v);
}

function nn(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v);
}

function toSchedule(row: Row): ScheduleItem {
  return {
    id: String(row.id), title: String(row.title), kind: String(row.kind),
    start_at: ns(row.start_at), end_at: ns(row.end_at), location: ns(row.location),
    status: String(row.status), notes: ns(row.notes),
    created_at: String(row.created_at), updated_at: String(row.updated_at)
  };
}

function toJob(row: Row): JobApplication {
  return {
    id: String(row.id), company: String(row.company), role: ns(row.role),
    status: String(row.status), next_action: ns(row.next_action),
    deadline_at: ns(row.deadline_at), event_at: ns(row.event_at), notes: ns(row.notes),
    created_at: String(row.created_at), updated_at: String(row.updated_at)
  };
}

function toKnowledge(row: Row): KnowledgeItem {
  return {
    id: String(row.id), kind: row.kind as KnowledgeItem['kind'], title: String(row.title),
    category: ns(row.category), content: ns(row.content), tags_json: ns(row.tags_json),
    proficiency: nn(row.proficiency), status: String(row.status),
    created_at: String(row.created_at), updated_at: String(row.updated_at)
  };
}

export function listScheduleItems(db: DatabaseSync): ScheduleItem[] {
  return db.prepare(`
    select * from schedule_items
    where status != 'canceled'
    order by case when start_at is null then 1 else 0 end, start_at asc, created_at desc
  `).all().map((r)=>toSchedule(r as Row));
}

export function createScheduleItem(db: DatabaseSync, input: Partial<ScheduleItem> & {title:string}, at=nowIso()): ScheduleItem {
  const id=randomUUID();
  db.prepare(`
    insert into schedule_items (id,title,kind,start_at,end_at,location,status,notes,created_at,updated_at)
    values (?,?,?,?,?,?,?,?,?,?)
  `).run(id,input.title.trim(),input.kind ?? 'other',input.start_at ?? null,input.end_at ?? null,input.location ?? null,input.status ?? 'scheduled',input.notes ?? null,at,at);
  const row=db.prepare('select * from schedule_items where id=?').get(id) as Row;
  return toSchedule(row);
}

export function listJobApplications(db: DatabaseSync): JobApplication[] {
  return db.prepare(`
    select * from job_applications
    order by
      case status
        when 'interview' then 0
        when 'written_test' then 1
        when 'applied' then 2
        when 'wishlist' then 3
        when 'offer' then 4
        else 5
      end,
      coalesce(event_at, deadline_at, updated_at) asc
  `).all().map((r)=>toJob(r as Row));
}

export function createJobApplication(db: DatabaseSync, input: Partial<JobApplication> & {company:string}, at=nowIso()): JobApplication {
  const id=randomUUID();
  db.prepare(`
    insert into job_applications (id,company,role,status,next_action,deadline_at,event_at,notes,created_at,updated_at)
    values (?,?,?,?,?,?,?,?,?,?)
  `).run(id,input.company.trim(),input.role ?? null,input.status ?? 'wishlist',input.next_action ?? null,input.deadline_at ?? null,input.event_at ?? null,input.notes ?? null,at,at);
  const row=db.prepare('select * from job_applications where id=?').get(id) as Row;
  return toJob(row);
}

export function listKnowledgeItems(db: DatabaseSync): KnowledgeItem[] {
  return db.prepare(`
    select * from knowledge_items
    where status='active'
    order by updated_at desc
  `).all().map((r)=>toKnowledge(r as Row));
}

export function createKnowledgeItem(db: DatabaseSync, input: Partial<KnowledgeItem> & {kind:KnowledgeItem['kind'];title:string}, at=nowIso()): KnowledgeItem {
  const id=randomUUID();
  db.prepare(`
    insert into knowledge_items (id,kind,title,category,content,tags_json,proficiency,status,created_at,updated_at)
    values (?,?,?,?,?,?,?,?,?,?)
  `).run(id,input.kind,input.title.trim(),input.category ?? null,input.content ?? null,input.tags_json ?? null,input.proficiency ?? null,input.status ?? 'active',at,at);
  const row=db.prepare('select * from knowledge_items where id=?').get(id) as Row;
  return toKnowledge(row);
}

export function personalDashboard(db: DatabaseSync) {
  return {
    schedule: listScheduleItems(db),
    applications: listJobApplications(db),
    knowledge: listKnowledgeItems(db)
  };
}
