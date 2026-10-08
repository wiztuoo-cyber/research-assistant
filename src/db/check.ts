import { openDatabase } from './connection.js';
import { runMigrations } from './migrations.js';

const db = openDatabase();
runMigrations(db);

const requiredTables = [
  'schema_migrations',
  'inbox_items',
  'tasks',
  'task_requirements',
  'task_events',
  'ai_suggestions',
  'reminder_syncs',
  'thought_topics', 'thought_captures', 'thought_versions', 'assistant_preferences', 'assistant_messages'
];

const existing = new Set(
  db
    .prepare("select name from sqlite_master where type = 'table'")
    .all()
    .map((row) => String(row.name))
);

const missing = requiredTables.filter((table) => !existing.has(table));

db.close();

if (missing.length > 0) {
  console.error(`Missing tables: ${missing.join(', ')}`);
  process.exit(1);
}

console.log('Database check passed.');

