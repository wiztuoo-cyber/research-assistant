import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

export function backupDatabase(databasePath: string, keep = 30): string | null {
  if (databasePath === ':memory:' || !existsSync(databasePath)) return null;
  const backupDir = join(dirname(databasePath), 'backups');
  mkdirSync(backupDir, { recursive: true });

  const d = new Date();
  const stamp = [
    d.getFullYear(),
    String(d.getMonth()+1).padStart(2,'0'),
    String(d.getDate()).padStart(2,'0')
  ].join('-');
  const target = join(backupDir, `${basename(databasePath, '.sqlite')}-${stamp}.sqlite`);

  if (!existsSync(target)) copyFileSync(databasePath, target);

  const files = readdirSync(backupDir)
    .filter((name)=>name.endsWith('.sqlite'))
    .map((name)=>({name,path:join(backupDir,name),mtime:statSync(join(backupDir,name)).mtimeMs}))
    .sort((a,b)=>b.mtime-a.mtime);

  for (const file of files.slice(keep)) unlinkSync(file.path);
  return target;
}
