// Electron 主进程
import { app, BrowserWindow, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import { pathToFileURL } from 'url';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !!process.env.VITE_DEV_SERVER_URL;

// 日志：写到 userData 目录，方便排查桌面模式问题
function getLogPath() {
  return path.join(app.getPath('userData'), 'main.log');
}
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(getLogPath(), line + '\n');
  } catch { /* 日志写入失败不阻断主流程 */ }
}

let mainWindow = null;

// 等待后端 HTTP 服务就绪（轮询 /api/characters）
async function waitForBackend(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url + '/api/characters');
      if (res.ok) return true;
    } catch { /* 还没起来，继续等 */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

async function startBackend() {
  process.env.APP_DATA_DIR = app.getPath('userData');
  process.env.PORT = '3001';
  log('APP_DATA_DIR=' + process.env.APP_DATA_DIR);
  log('PORT=' + process.env.PORT);

  // 先检测端口是否已有服务（避免重复启动 / 端口冲突）
  try {
    const res = await fetch('http://localhost:3001/api/characters');
    if (res.ok) {
      log('端口 3001 已有服务运行，跳过后端启动（复用已有服务）');
      return;
    }
  } catch { /* 端口空闲，继续启动后端 */ }

  // 后端入口（相对于本文件的 ../backend/dist/index.js）
  const backendPath = path.join(__dirname, '..', 'backend', 'dist', 'index.js');
  log('backendPath=' + backendPath + ' exists=' + fs.existsSync(backendPath));
  if (!fs.existsSync(backendPath)) {
    throw new Error('后端入口不存在: ' + backendPath);
  }

  // Windows ESM 动态 import 需要合法的 file:// URL
  const backendURL = pathToFileURL(backendPath).href;
  log('importing backend: ' + backendURL);
  await import(backendURL);
  log('backend import done');

  // 轮询等待 HTTP 服务就绪
  const ok = await waitForBackend('http://localhost:3001', 15000);
  if (!ok) {
    throw new Error('后端启动超时（15s 内端口 3001 未就绪）');
  }
  log('backend ready');
}

async function start() {
  if (!isDev) {
    try {
      await startBackend();
    } catch (e) {
      log('后端启动失败: ' + (e && e.stack ? e.stack : e));
      dialog.showErrorBox('启动失败', '后端服务启动失败：\n' + (e && e.message ? e.message : e) + '\n\n日志：' + getLogPath());
      app.quit();
      return;
    }
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 720,
    title: '虚拟伴侣',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const targetUrl = isDev ? process.env.VITE_DEV_SERVER_URL : 'http://localhost:3001';
  log('loading url: ' + targetUrl);
  mainWindow.loadURL(targetUrl);

  if (isDev) mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => { mainWindow = null; });

  // 捕获渲染进程加载失败
  mainWindow.webContents.on('did-fail-load', (_e, errorCode, errorDescription) => {
    log('did-fail-load: code=' + errorCode + ' desc=' + errorDescription);
  });
}

// 捕获未处理异常，防止弹出系统错误框（如后端 app.listen 的异步 EADDRINUSE）
process.on('uncaughtException', (e) => {
  log('uncaughtException: ' + (e && e.stack ? e.stack : e));
  if (e && e.message && e.message.includes('EADDRINUSE')) {
    // 端口占用：可能是已有实例在运行，不退出，窗口照常加载
    log('端口被占用，忽略（可能已有实例运行）');
  } else {
    dialog.showErrorBox('错误', String(e && e.message ? e.message : e));
    app.quit();
  }
});

app.whenReady().then(start).catch((e) => {
  log('start() 异常: ' + (e && e.stack ? e.stack : e));
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) start();
});
