import { loadLocalEnv } from '../config/env.js';
import { getDatabasePath, openDatabase } from '../db/connection.js';
import { runMigrations } from '../db/migrations.js';
import { createApp } from './app.js';
import { backupDatabase } from '../services/backup.js';
import { startTopicWorker } from '../services/topics.js';

loadLocalEnv();

const port = Number(process.env.PORT ?? 4010);
const db = openDatabase();
runMigrations(db);
try { backupDatabase(getDatabasePath()); } catch (error) { console.warn('Database backup skipped:', error); }

const app = createApp(db);
const stopTopics = startTopicWorker(db);
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`API server listening on http://127.0.0.1:${port}`);
});

function shutdown(): void {
  stopTopics();
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

