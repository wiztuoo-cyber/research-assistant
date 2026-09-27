import { app, BrowserWindow, Menu, Tray, globalShortcut, nativeImage } from 'electron';
import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Server } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { loadLocalEnv } from '../config/env.js';
import { getDatabasePath, openDatabase } from '../db/connection.js';
import { runMigrations } from '../db/migrations.js';
import { backupDatabase } from '../services/backup.js';
import { createApp } from '../server/app.js';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let server: Server | null = null;
let db: DatabaseSync | null = null;
let quitting = false;

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

function showWindow(): void {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

async function startLocalServer(): Promise<number> {
  const web = createApp(db!);
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

function createTray(): void {
  tray = new Tray(trayImage());
  tray.setToolTip('私人助理');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开私人助理', click: showWindow },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        quitting = true;
        app.quit();
      }
    }
  ]));
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

    db = openDatabase();
    runMigrations(db);
    try {
      backupDatabase(getDatabasePath());
    } catch (error) {
      console.warn('Database backup skipped:', error);
    }

    const port = await startLocalServer();
    createWindow(`http://127.0.0.1:${port}`);
    createTray();

    globalShortcut.register('CommandOrControl+Alt+A', showWindow);
  });

  app.on('activate', showWindow);

  app.on('before-quit', () => {
    quitting = true;
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    server?.close();
    db?.close();
  });
}
