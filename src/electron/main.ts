import { app, BrowserWindow, Menu, Tray, dialog, globalShortcut, nativeImage, Notification, screen, shell } from 'electron';
import express from 'express';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import type { Server } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { loadLocalEnv } from '../config/env.js';
import { getDatabasePath, openDatabase } from '../db/connection.js';
import { runMigrations } from '../db/migrations.js';
import { backupDatabase } from '../services/backup.js';
import { createApp } from '../server/app.js';
import { startTopicWorker } from '../services/topics.js';

let stopTopics: (()=>void) | undefined;
let shortcutWarning = '';
let pendingMainWindow = false;

let mainWindow: BrowserWindow | null = null;
let plannerWindow: BrowserWindow | null = null;
let localBaseUrl = '';
let tray: Tray | null = null;
let server: Server | null = null;
let db: DatabaseSync | null = null;
let quitting = false;
const firedReminders = new Set<string>();
let reminderTimer: NodeJS.Timeout | null = null;
let desktopWidgetTimer: NodeJS.Timeout | null = null;
const activeNotifications = new Set<Notification>();
const reminderWindows = new Set<BrowserWindow>();
const pendingReminderKeys = new Set<string>();

function reminderStatePath(): string {
  return join(app.getPath('userData'), 'fired-reminders.json');
}

function loadFiredReminders(): void {
  try {
    const items = JSON.parse(readFileSync(reminderStatePath(), 'utf8')) as string[];
    for (const item of items.slice(-2000)) firedReminders.add(item);
  } catch {}
}

function saveFiredReminders(): void {
  try {
    writeFileSync(reminderStatePath(), JSON.stringify(Array.from(firedReminders).slice(-2000)), 'utf8');
  } catch {}
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch] ?? ch));
}

function showReminderPopup(key: string, title: string): boolean {
  const display = screen.getPrimaryDisplay();
  const work = display.workArea;
  const width = 390;
  const height = 150;
  const offset = Math.min(reminderWindows.size, 3) * (height + 10);
  const popup = new BrowserWindow({
    width,
    height,
    x: work.x + work.width - width - 18,
    y: work.y + work.height - height - 18 - offset,
    frame: false,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: true,
    show: false,
    hasShadow: true,
    backgroundColor: '#ffffff',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  reminderWindows.add(popup);
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;background:#fff;font-family:"Segoe UI","Microsoft YaHei",sans-serif}
    .card{box-sizing:border-box;height:100vh;padding:18px 20px;border:1px solid #d9e1ec;border-radius:14px;background:#fff}
    .cap{font-size:12px;color:#6b7280;margin-bottom:8px}
    .title{font-size:17px;line-height:1.45;color:#1f2937;font-weight:650;word-break:break-word}
    .hint{font-size:11px;color:#9ca3af;margin-top:12px}
  </style></head><body><div class="card"><div class="cap">私人助理提醒</div><div class="title">${escapeHtml(title)}</div><div class="hint">点击提醒可打开周计划</div></div></body></html>`;

  try {
    void popup.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    popup.once('ready-to-show', () => {
      if (popup.isDestroyed()) return;
      popup.show();
      shell.beep();
      firedReminders.add(key);
      pendingReminderKeys.delete(key);
      saveFiredReminders();
    });
    popup.webContents.on('before-input-event', (_event, input) => {
      if (input.type === 'keyDown' && input.key === 'Escape' && !popup.isDestroyed()) popup.close();
    });
    popup.webContents.on('did-finish-load', () => {
      popup.webContents.executeJavaScript(`document.body.addEventListener('click',()=>location.href='about:blank#open')`).catch(()=>{});
    });
    popup.webContents.on('will-navigate', (event, url) => {
      if (url.endsWith('#open')) {
        event.preventDefault();
        showPlanner();
        if (!popup.isDestroyed()) popup.close();
      }
    });
    const closeTimer = setTimeout(() => {
      if (!popup.isDestroyed()) popup.close();
    }, 15000);
    popup.on('closed', () => {
      clearTimeout(closeTimer);
      reminderWindows.delete(popup);
      pendingReminderKeys.delete(key);
    });
    return true;
  } catch {
    reminderWindows.delete(popup);
    pendingReminderKeys.delete(key);
    if (!popup.isDestroyed()) popup.destroy();
    return false;
  }
}

function showReminderNotification(key: string, title: string): boolean {
  if (!Notification.isSupported()) return false;
  const notification = new Notification({
    title: '私人助理提醒',
    body: title
  });

  activeNotifications.add(notification);

  notification.once('show', () => {
    activeNotifications.add(notification);
  });

  notification.once('failed', () => {
    activeNotifications.delete(notification);
  });

  notification.once('close', () => {
    activeNotifications.delete(notification);
  });

  notification.once('click', () => {
    activeNotifications.delete(notification);
    showPlanner();
  });

  try {
    notification.show();
    return true;
  } catch {
    activeNotifications.delete(notification);
    return false;
  }
}

function checkWindowsReminders(): void {
  if (!db) return;
  const now = new Date();
  const nowMs = now.getTime();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  const taskRows = db.prepare(`
    select id, title, reminder_at
    from tasks
    where deleted_at is null
      and status not in ('completed','canceled','trash')
      and reminder_at is not null
      and trim(reminder_at) != ''
  `).all() as Array<{id:string;title:string;reminder_at:string}>;

  const scheduleRows = db.prepare(`
    select id, title, reminder_at
    from schedule_items
    where status='scheduled'
      and reminder_at is not null
      and trim(reminder_at) != ''
  `).all() as Array<{id:string;title:string;reminder_at:string}>;

  const rows = [
    ...taskRows.map((row) => ({ ...row, source: 'task' })),
    ...scheduleRows.map((row) => ({ ...row, source: 'schedule' }))
  ];

  for (const row of rows) {
    const due = new Date(row.reminder_at).getTime();
    if (!Number.isFinite(due) || due > nowMs) continue;
    if (due < dayStart) continue;
    const key = `${row.source}|${row.id}|${row.reminder_at}`;
    if (firedReminders.has(key) || pendingReminderKeys.has(key)) continue;
    pendingReminderKeys.add(key);
    const popupShown = showReminderPopup(key, row.title);
    if (popupShown) showReminderNotification(key, row.title);
    else pendingReminderKeys.delete(key);
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

function attachPlannerToDesktopOwner(attempt = 0): void {
  if (process.platform !== 'win32' || !plannerWindow || plannerWindow.isDestroyed()) return;

  const hwndBuffer = plannerWindow.getNativeWindowHandle();
  let hwnd = 0n;
  try {
    hwnd = hwndBuffer.length >= 8
      ? hwndBuffer.readBigUInt64LE(0)
      : BigInt(hwndBuffer.readUInt32LE(0));
  } catch {
    return;
  }

  const ps = String.raw`
Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class DesktopOwner {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [DllImport("user32.dll", SetLastError=true)]
  public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

  [DllImport("user32.dll", SetLastError=true)]
  public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr childAfter, string className, string windowTitle);

  [DllImport("user32.dll")]
  public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);

  [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW", SetLastError=true)]
  public static extern IntPtr GetWindowLongPtr64(IntPtr hWnd, int nIndex);

  [DllImport("user32.dll", EntryPoint="SetWindowLongPtrW", SetLastError=true)]
  public static extern IntPtr SetWindowLongPtr64(IntPtr hWnd, int nIndex, IntPtr value);

  [DllImport("user32.dll", SetLastError=true)]
  public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint flags);

  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

  public const int GWLP_HWNDPARENT = -8;
  public const int GWL_EXSTYLE = -20;
  public const long WS_EX_TOOLWINDOW = 0x00000080L;
  public const long WS_EX_APPWINDOW = 0x00040000L;
  public const uint SWP_NOMOVE = 0x0002;
  public const uint SWP_NOSIZE = 0x0001;
  public const uint SWP_NOACTIVATE = 0x0010;
  public const uint SWP_SHOWWINDOW = 0x0040;
  public const int SW_SHOWNOACTIVATE = 4;

  public static IntPtr ResolveDesktopOwner() {
    IntPtr progman = FindWindow("Progman", null);
    IntPtr owner = IntPtr.Zero;

    EnumWindows(delegate(IntPtr top, IntPtr lParam) {
      IntPtr shellView = FindWindowEx(top, IntPtr.Zero, "SHELLDLL_DefView", null);
      if (shellView != IntPtr.Zero) {
        owner = top;
        return false;
      }
      return true;
    }, IntPtr.Zero);

    return owner != IntPtr.Zero ? owner : progman;
  }

  public static bool Attach(IntPtr child) {
    IntPtr owner = ResolveDesktopOwner();
    if (owner == IntPtr.Zero) return false;

    SetWindowLongPtr64(child, GWLP_HWNDPARENT, owner);

    long exStyle = GetWindowLongPtr64(child, GWL_EXSTYLE).ToInt64();
    exStyle = (exStyle | WS_EX_TOOLWINDOW) & ~WS_EX_APPWINDOW;
    SetWindowLongPtr64(child, GWL_EXSTYLE, new IntPtr(exStyle));

    SetWindowPos(child, new IntPtr(1), 0, 0, 0, 0,
      SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW);
    ShowWindow(child, SW_SHOWNOACTIVATE);
    return true;
  }
}
"@

$hwnd = [IntPtr]::new([Int64]::Parse($args[0]))
if (-not [DesktopOwner]::Attach($hwnd)) { exit 2 }
`;

  const encoded = Buffer.from(ps, 'utf16le').toString('base64');
  execFile(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded, hwnd.toString()],
    { windowsHide: true },
    (error) => {
      if (!error) return;
      console.warn('Desktop owner attach failed:', error.message);
      if (attempt < 4 && plannerWindow && !plannerWindow.isDestroyed() && !quitting) {
        setTimeout(() => attachPlannerToDesktopOwner(attempt + 1), 700);
      }
    }
  );
}

function widgetStatePath(): string {
  return join(app.getPath('userData'), 'widget-window.json');
}

function readWidgetBounds(): Partial<{ x:number; y:number; width:number; height:number; layoutVersion:number }> {
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
    writeFileSync(widgetStatePath(), JSON.stringify({ ...bounds, layoutVersion: 3 }), 'utf8');
  } catch {}
}

function showWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    if (!localBaseUrl) { pendingMainWindow=true; return; }
    createWindow(localBaseUrl);
  }
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
  if (process.platform === 'win32') setTimeout(attachPlannerToDesktopOwner, 80);
}

function createPlannerWindow(url: string): void {
  const display = screen.getPrimaryDisplay();
  const work = display.workArea;
  const saved = readWidgetBounds();
  const legacyBounds = saved.layoutVersion !== 3;
  const defaultWidth = Math.min(560, Math.max(360, work.width - 40));
  const defaultHeight = Math.min(460, Math.max(260, work.height - 80));
  const width = legacyBounds
    ? defaultWidth
    : Math.max(320, Math.min(saved.width ?? defaultWidth, work.width));
  const height = legacyBounds
    ? defaultHeight
    : Math.max(220, Math.min(saved.height ?? defaultHeight, work.height));

  plannerWindow = new BrowserWindow({
    width,
    height,
    x: legacyBounds ? work.x + Math.max(0, work.width - width - 18) : (saved.x ?? work.x + Math.max(0, work.width - width - 18)),
    y: legacyBounds ? work.y + 18 : (saved.y ?? work.y + 18),
    minWidth: 320,
    minHeight: 220,
    resizable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    thickFrame: true,
    title: '私人助理 · 本周计划',
    type: 'toolbar',
    frame: false,
    transparent: false,
    backgroundColor: '#f4f6fa',
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
  plannerWindow.once('ready-to-show', () => {
    plannerWindow?.showInactive();
    setTimeout(attachPlannerToDesktopOwner, 120);
  });
  plannerWindow.on('move', saveWidgetBounds);
  plannerWindow.on('resize', saveWidgetBounds);
  plannerWindow.on('minimize', () => {
    setTimeout(() => {
      if (plannerWindow && !plannerWindow.isDestroyed() && !quitting) {
        if (plannerWindow.isMinimized()) plannerWindow.restore();
        plannerWindow.showInactive();
      }
    }, 40);
  });
  plannerWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      plannerWindow?.hide();
    }
  });
}

function keepPlannerOnDesktop(): void {
  if (!plannerWindow || plannerWindow.isDestroyed() || quitting) return;
  if (plannerWindow.isMinimized()) plannerWindow.restore();
  if (!plannerWindow.isVisible()) plannerWindow.showInactive();
}

async function startLocalServer(): Promise<number> {
  const web = createApp(db!, {
    openMainWindow: showWindow,
    openPlanner: showPlanner,
    getShortcutWarning: ()=>shortcutWarning,
    setWidgetOpacity: (opacity) => {
      if (plannerWindow && !plannerWindow.isDestroyed()) plannerWindow.setOpacity(opacity);
    },
    getWidgetOpacity: () => plannerWindow && !plannerWindow.isDestroyed() ? plannerWindow.getOpacity() : 1,
    getWidgetBounds: () => plannerWindow && !plannerWindow.isDestroyed()
      ? { width: plannerWindow.getBounds().width, height: plannerWindow.getBounds().height }
      : null,
    resizeWidget: (width, height) => {
      if (plannerWindow && !plannerWindow.isDestroyed()) {
        plannerWindow.setSize(width, height, true);
        saveWidgetBounds();
      }
    }
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

function showTestNotification(): void {
  const key = `test|${Date.now()}`;
  pendingReminderKeys.add(key);
  showReminderPopup(key, '这是一条测试提醒：能看到弹窗并听到提示音，说明提醒功能正常。');
  showReminderNotification(key, '测试提醒');
}

function createTray(): void {
  tray = new Tray(trayImage());
  tray.setToolTip('私人助理');
  const autoLaunch = app.getLoginItemSettings().openAtLogin;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开桌面周计划', click: showPlanner },
    { label: '打开完整私人助理', click: showWindow },
    { label: '测试系统提醒', click: showTestNotification },
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
  tray.on('click', showWindow);
  tray.on('double-click', showWindow);
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

if (process.platform === 'win32') {
  app.setAppUserModelId('com.local.personalassistant');
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

    loadLocalEnv();
    loadFiredReminders();

    db = openDatabase();
    runMigrations(db);
    try {
      db.exec('PRAGMA wal_checkpoint(FULL);');
      backupDatabase(getDatabasePath());
    } catch (error) {
      console.warn('Database backup skipped:', error);
    }

    const port = await startLocalServer();
    stopTopics = startTopicWorker(db);
    localBaseUrl = `http://127.0.0.1:${port}`;
    createWindow(localBaseUrl);
    mainWindow?.hide();
    if (pendingMainWindow) { pendingMainWindow=false; showWindow(); }
    createPlannerWindow(localBaseUrl);
    createTray();

    reminderTimer = setInterval(checkWindowsReminders, 30000);
    desktopWidgetTimer = setInterval(keepPlannerOnDesktop, 750);
    checkWindowsReminders();

    globalShortcut.register('CommandOrControl+Alt+A', showPlanner);
    if (!globalShortcut.register('CommandOrControl+Alt+M', showWindow)) {
      shortcutWarning='Ctrl+Alt+M 已被其他程序占用，请用挂件按钮或托盘打开主面板。';
      dialog.showMessageBox({type:'info',title:'主面板快捷键未启用',message:shortcutWarning});
    }
  });

  app.on('activate', showWindow);

  app.on('before-quit', () => {
    quitting = true;
  });

  app.on('will-quit', () => {
    stopTopics?.();
    globalShortcut.unregisterAll();
    if (reminderTimer) clearInterval(reminderTimer);
    if (desktopWidgetTimer) clearInterval(desktopWidgetTimer);
    server?.close();
    plannerWindow?.destroy();
    for (const notification of activeNotifications) notification.close();
    activeNotifications.clear();
    for (const popup of reminderWindows) if (!popup.isDestroyed()) popup.destroy();
    reminderWindows.clear();
    db?.close();
  });
}
