import { app, BrowserWindow, Menu, Notification, Tray, dialog, globalShortcut, nativeImage, screen } from 'electron';
import express from 'express';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Server } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { loadLocalEnv } from '../config/env.js';
import { getDatabasePath, openDatabase } from '../db/connection.js';
import { runMigrations } from '../db/migrations.js';
import { backupDatabase } from '../services/backup.js';
import { createApp } from '../server/app.js';

let mainWindow: BrowserWindow | null = null;
let plannerWindow: BrowserWindow | null = null;
let localBaseUrl = '';
let tray: Tray | null = null;
let server: Server | null = null;
let db: DatabaseSync | null = null;
let quitting = false;
const firedReminders = new Set<string>();
let reminderTimer: NodeJS.Timeout | null = null;

function checkWindowsReminders(): void {
  if (!db || !Notification.isSupported()) return;
  const now = Date.now();
  const rows = db.prepare(`
    select id, title, reminder_at
    from tasks
    where deleted_at is null
      and status not in ('completed','canceled','trash')
      and reminder_at is not null
      and trim(reminder_at) != ''
  `).all() as Array<{id:string;title:string;reminder_at:string}>;

  for (const row of rows) {
    const due = new Date(row.reminder_at).getTime();
    if (!Number.isFinite(due) || due > now) continue;
    const key = `${row.id}|${row.reminder_at}`;
    if (firedReminders.has(key)) continue;
    firedReminders.add(key);

    const notice = new Notification({
      title: '私人助理',
      body: row.title,
      silent: false
    });
    notice.on('click', showWindow);
    notice.show();
  }
}

function trayImage() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">
      <rect width="32" height="32" rx="8" fill="#3b6df2"/>
      <path d="M9 10h14v3H9zm0 6h10v3H9zm0 6h7v3H9z" fill="white"/>
    </svg>`;
  return nativeImage.createFromDataURL(
    'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')
  ).resize({ width: 18, height: 18 });
}

function widgetStatePath(): string {
  return join(app.getPath('userData'), 'widget-window.json');
}

function readWidgetBounds(): Partial<{ x:number; y:number; width:number; height:number }> {
  try {
    return JSON.parse(readFileSync(widgetStatePath(), 'utf8'));
  } catch {
    return {};
  }
}

function saveWidgetBounds(): void {
  if (!plannerWindow || plannerWindow.isDestroyed()) return;
  try {
    const bounds = plannerWindow.getBounds();
    writeFileSync(widgetStatePath(), JSON.stringify(bounds), 'utf8');
  } catch {}
}

function showWindow(): void {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function showPlanner(): void {
  if (!plannerWindow || plannerWindow.isDestroyed()) {
    if (localBaseUrl) createPlannerWindow(localBaseUrl);
    return;
  }
  plannerWindow.showInactive();
}

function createPlannerWindow(url: string): void {
  const display = screen.getPrimaryDisplay();
  const work = display.workArea;
  const saved = readWidgetBounds();
  const width = saved.width ?? Math.min(980, Math.max(760, Math.round(work.width * 0.72)));
  const height = saved.height ?? Math.min(760, Math.max(600, Math.round(work.height * 0.78)));

  plannerWindow = new BrowserWindow({
    width,
    height,
    x: saved.x ?? work.x + Math.max(0, work.width - width - 18),
    y: saved.y ?? work.y + 18,
    minWidth: 720,
    minHeight: 560,
    title: '私人助理 · 本周计划',
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    autoHideMenuBar: true,
    skipTaskbar: true,
    alwaysOnTop: false,
    hasShadow: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  void plannerWindow.loadURL(`${url}?view=week`);
  plannerWindow.once('ready-to-show', () => plannerWindow?.showInactive());
  plannerWindow.on('move', saveWidgetBounds);
  plannerWindow.on('resize', saveWidgetBounds);
  plannerWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      plannerWindow?.hide();
    }
  });
}

async function startLocalServer(): Promise<number> {
  const web = createApp(db!, {
    setWidgetOpacity: (opacity) => {
      if (plannerWindow && !plannerWindow.isDestroyed()) plannerWindow.setOpacity(opacity);
    },
    getWidgetOpacity: () => plannerWindow && !plannerWindow.isDestroyed() ? plannerWindow.getOpacity() : 1
  });
  const webRoot = join(app.getAppPath(), 'dist');

  if (!existsSync(join(webRoot, 'index.html'))) {
    throw new Error('Desktop web assets are missing. Run npm run build before packaging.');
  }

  web.use(express.static(webRoot));
  web.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
      next();
      return;
    }
    res.sendFile(join(webRoot, 'index.html'));
  });

  return await new Promise<number>((resolve, reject) => {
    server = web.listen(0, '127.0.0.1', () => {
      const address = server?.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to resolve local desktop server port.'));
        return;
      }
      resolve(address.port);
    });
    server.on('error', reject);
  });
}

async function importLegacyDatabase(): Promise<void> {
  const result = await dialog.showOpenDialog({
    title: '选择旧版 tasks.sqlite',
    properties: ['openFile'],
    filters: [{ name: 'SQLite 数据库', extensions: ['sqlite', 'db'] }]
  });
  if (result.canceled || !result.filePaths[0]) return;

  const confirm = await dialog.showMessageBox({
    type: 'warning',
    buttons: ['导入并重启', '取消'],
    defaultId: 1,
    cancelId: 1,
    title: '导入旧数据',
    message: '导入会用选中的数据库替换当前桌面版数据库。',
    detail: '当前数据库会先自动备份。完成后私人助理会自动重启。'
  });
  if (confirm.response !== 0) return;

  const target = getDatabasePath();
  try {
    db?.exec('PRAGMA wal_checkpoint(FULL);');
    backupDatabase(target);
  } catch {}

  server?.close();
  db?.close();
  db = null;

  copyFileSync(result.filePaths[0], target);
  app.relaunch();
  quitting = true;
  app.quit();
}

function setAutoLaunch(enabled: boolean): void {
  app.setLoginItemSettings({ openAtLogin: enabled });
}

function createTray(): void {
  tray = new Tray(trayImage());
  tray.setToolTip('私人助理');
  const autoLaunch = app.getLoginItemSettings().openAtLogin;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开桌面周计划', click: showPlanner },
    { label: '打开完整私人助理', click: showWindow },
    { label: '导入旧数据库…', click: () => { void importLegacyDatabase(); } },
    {
      label: '开机自动启动',
      type: 'checkbox',
      checked: autoLaunch,
      click: (item) => setAutoLaunch(item.checked)
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        quitting = true;
        app.quit();
      }
    }
  ]));
  tray.on('double-click', showPlanner);
}

function createWindow(url: string): void {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 820,
    minHeight: 620,
    title: '私人助理',
    backgroundColor: '#f5f7fb',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  void mainWindow.loadURL(url);

  mainWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', showWindow);

  app.whenReady().then(async () => {
    const userData = app.getPath('userData');
    process.env.TASK_DB_PATH = join(userData, 'tasks.sqlite');
    process.env.SETTINGS_FILE_PATH = join(userData, 'settings.env');

    app.setAppUserModelId('com.local.personalassistant');
    loadLocalEnv();

    db = openDatabase();
    runMigrations(db);
    try {
      db.exec('PRAGMA wal_checkpoint(FULL);');
      backupDatabase(getDatabasePath());
    } catch (error) {
      console.warn('Database backup skipped:', error);
    }

    const port = await startLocalServer();
    localBaseUrl = `http://127.0.0.1:${port}`;
    createWindow(localBaseUrl);
    mainWindow?.hide();
    createPlannerWindow(localBaseUrl);
    createTray();

    reminderTimer = setInterval(checkWindowsReminders, 30000);
    checkWindowsReminders();

    globalShortcut.register('CommandOrControl+Alt+A', showPlanner);
  });

  app.on('activate', showWindow);

  app.on('before-quit', () => {
    quitting = true;
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    if (reminderTimer) clearInterval(reminderTimer);
    server?.close();
    plannerWindow?.destroy();
    db?.close();
  });
}
