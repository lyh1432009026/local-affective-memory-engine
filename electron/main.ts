import { app, BrowserWindow, Tray, Menu, ipcMain, shell, clipboard, Notification } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import net from 'node:net';
import http from 'node:http';
import { fork, ChildProcess, exec } from 'node:child_process';

interface EngineState {
  running: boolean;
  port: number;
  pid: number | null;
  mode: string;
  activePersona: string;
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let engineProcess: ChildProcess | null = null;
let isAppQuitting = false;
const logBuffer: string[] = [];
const MAX_LOG_LINES = 2000;

const state: EngineState = {
  running: false,
  port: 4100,
  pid: null,
  mode: 'Inline Dual-Stream Only',
  activePersona: 'default',
};

// 获取项目根目录
function getProjectRoot(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app');
  }
  return process.cwd();
}

function appendLog(line: string) {
  const timestamp = new Date().toLocaleTimeString();
  const formatted = `[${timestamp}] ${line}`;
  logBuffer.push(formatted);
  if (logBuffer.length > MAX_LOG_LINES) {
    logBuffer.shift();
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('engine:log', formatted);
  }
}

// 检查端口是否被占用
function checkPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        resolve(false);
      }
    });
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port, '127.0.0.1');
  });
}

// 探测引擎健康检查接口
function queryEngineHealth(port: number): Promise<{ healthy: boolean; data?: any }> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/health`, { timeout: 1500 }, (res) => {
      if (res.statusCode === 200) {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            const data = JSON.parse(raw);
            resolve({ healthy: true, data });
          } catch {
            resolve({ healthy: true });
          }
        });
      } else {
        resolve({ healthy: false });
      }
    });
    req.on('error', () => resolve({ healthy: false }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ healthy: false });
    });
  });
}

// 释放指定端口（支持 Windows netstat + taskkill）
function killPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      exec(`netstat -ano | findstr :${port}`, (err, stdout) => {
        if (err || !stdout) {
          return resolve(false);
        }
        const lines = stdout.trim().split('\n');
        const pids = new Set<string>();
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && pid !== '0') {
            pids.add(pid);
          }
        }
        if (pids.size === 0) return resolve(false);

        let killed = 0;
        pids.forEach((p) => {
          exec(`taskkill /F /PID ${p}`, () => {
            killed++;
            if (killed === pids.size) {
              setTimeout(() => resolve(true), 500);
            }
          });
        });
      });
    } else {
      exec(`lsof -i :${port} -t | xargs kill -9`, () => resolve(true));
    }
  });
}

// 启动伴生引擎子进程
async function startEngine(): Promise<{ success: boolean; message?: string; error?: string }> {
  if (state.running && engineProcess) {
    return { success: true, message: '引擎已在运行中' };
  }

  const root = getProjectRoot();
  const scriptPath = path.join(root, 'dist', 'index.js');

  if (!fs.existsSync(scriptPath)) {
    appendLog(`[错误] 未找到编译产物: ${scriptPath}，请先执行 npm run build`);
    return { success: false, error: '未找到编译产物 dist/index.js，请先构建项目' };
  }

  // 确保存储目录存在
  const dataDir = path.join(root, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // 检查端口是否被占用
  const port = state.port;
  const isAvailable = await checkPortAvailable(port);
  if (!isAvailable) {
    appendLog(`[探测] 端口 ${port} 当前已被占用，正在探查是否为既有引擎实例...`);
    const health = await queryEngineHealth(port);
    if (health.healthy) {
      appendLog(`[连接] 成功对接已有伴生引擎服务！`);
      state.running = true;
      state.mode = health.data?.mode || 'Active Engine';
      state.activePersona = health.data?.personaName || 'default';
      updateTrayMenu();
      notifyStatusChange();
      return { success: true, message: '成功连接到当前正在运行的引擎实例' };
    } else {
      appendLog(`[提示] 端口 ${port} 被其他程序占用，可点击「释放端口」后重试`);
      return { success: false, error: `端口 ${port} 已被占用，请先释放端口` };
    }
  }

  appendLog(`[启动] 正在唤醒本地记忆与情感伴生引擎 (端口: ${port})...`);

  // 使用 Electron 内置 Node 环境以子进程方式运行，小白电脑无需安装独立 Node.js！
  const childEnv = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    NODE_ENV: 'production',
    PORT: String(port),
  };

  try {
    engineProcess = fork(scriptPath, [], {
      cwd: root,
      env: childEnv,
      silent: true,
      execPath: process.execPath, // 关键：复用 Electron 可执行文件作为 Node.js 解释器！
    });

    state.pid = engineProcess.pid || null;

    engineProcess.stdout?.on('data', (chunk) => {
      const text = chunk.toString();
      text.split('\n').forEach((line: string) => {
        if (line.trim()) appendLog(line.trim());
      });
    });

    engineProcess.stderr?.on('data', (chunk) => {
      const text = chunk.toString();
      text.split('\n').forEach((line: string) => {
        if (line.trim()) appendLog(`[STDERR] ${line.trim()}`);
      });
    });

    engineProcess.on('exit', (code, signal) => {
      appendLog(`[停止] 伴生引擎进程已退出 (代码: ${code}, 信号: ${signal})`);
      state.running = false;
      state.pid = null;
      engineProcess = null;
      updateTrayMenu();
      notifyStatusChange();
    });

    // 轮询等待服务健康就绪
    let ready = false;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 400));
      const h = await queryEngineHealth(port);
      if (h.healthy) {
        ready = true;
        state.running = true;
        state.mode = h.data?.mode || 'Inline Dual-Stream Only';
        state.activePersona = h.data?.personaName || 'default';
        break;
      }
    }

    if (ready) {
      appendLog(`[就绪] 伴生引擎启动完毕！监听于 http://127.0.0.1:${port}/v1`);
      updateTrayMenu();
      notifyStatusChange();
      return { success: true, message: '伴生引擎已成功启动' };
    } else {
      appendLog(`[超时] 伴生引擎拉起后未能及时响应健康检查，请查看日志`);
      return { success: false, error: '服务就绪超时，请检查运行日志' };
    }
  } catch (err: any) {
    appendLog(`[异常] 启动失败: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// 停止引擎
async function stopEngine(): Promise<{ success: boolean; message?: string }> {
  if (engineProcess) {
    appendLog(`[停止] 正在安全关停伴生引擎进程...`);
    engineProcess.kill('SIGINT');
    await new Promise((r) => setTimeout(r, 600));
    if (engineProcess && !engineProcess.killed) {
      engineProcess.kill('SIGKILL');
    }
    engineProcess = null;
  }
  state.running = false;
  state.pid = null;
  appendLog(`[完成] 伴生引擎已停止`);
  updateTrayMenu();
  notifyStatusChange();
  return { success: true, message: '引擎已关停' };
}

// 重启引擎
async function restartEngine(): Promise<{ success: boolean; message?: string; error?: string }> {
  appendLog(`[重启] 正在重启伴生引擎...`);
  await stopEngine();
  await new Promise((r) => setTimeout(r, 600));
  return await startEngine();
}

function notifyStatusChange() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('engine:status-change', { ...state });
  }
}

function createMainWindow() {
  const root = getProjectRoot();
  const preloadPath = path.join(__dirname, 'preload.js');
  const launcherPath = path.join(root, 'electron', 'launcher.html');

  mainWindow = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 880,
    minHeight: 600,
    title: '本地记忆与情感神经伴生引擎 v2.4 - 客户端控制台',
    autoHideMenuBar: true,
    show: false,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (fs.existsSync(launcherPath)) {
    mainWindow.loadFile(launcherPath);
  } else {
    mainWindow.loadURL(`http://127.0.0.1:${state.port}`);
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    appendLog(`[桌面客户端] 界面已加载完成`);
  });

  // 点击关闭按钮时最小化到系统托盘，保持后台伴生
  mainWindow.on('close', (event) => {
    if (!isAppQuitting) {
      event.preventDefault();
      mainWindow?.hide();
      if (Notification.isSupported()) {
        new Notification({
          title: '伴生引擎后台静默守护',
          body: '客户端已最小化到系统托盘，伴生服务持续可用。双击托盘图标可重新呼出。',
        }).show();
      }
    }
  });
}

function createTray() {
  const root = getProjectRoot();
  // 查找或使用备用图标
  let iconPath = path.join(root, 'electron', 'assets', 'icon.png');
  if (!fs.existsSync(iconPath)) {
    iconPath = path.join(root, 'public', 'favicon.ico');
  }

  try {
    tray = new Tray(iconPath);
  } catch {
    // 若图标不存在则尝试生成或由系统默认处理
    return;
  }

  tray.setToolTip('本地记忆与情感伴生引擎 v2.4');
  updateTrayMenu();

  tray.on('double-click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
      }
    }
  });
}

function updateTrayMenu() {
  if (!tray) return;

  const statusLabel = state.running
    ? `● 伴生引擎: 运行中 (4100)`
    : `○ 伴生引擎: 已停止`;

  const contextMenu = Menu.buildFromTemplate([
    { label: statusLabel, enabled: false },
    { type: 'separator' },
    {
      label: '打开控制面板',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    {
      label: state.running ? '停止伴生引擎' : '启动伴生引擎',
      click: async () => {
        if (state.running) {
          await stopEngine();
        } else {
          await startEngine();
        }
      },
    },
    {
      label: '重启伴生引擎',
      enabled: state.running,
      click: async () => {
        await restartEngine();
      },
    },
    { type: 'separator' },
    {
      label: '复制接口 Base URL',
      click: () => {
        clipboard.writeText(`http://127.0.0.1:${state.port}/v1`);
      },
    },
    {
      label: '在浏览器中打开 Web 仪表盘',
      click: () => {
        shell.openExternal(`http://127.0.0.1:${state.port}`);
      },
    },
    { type: 'separator' },
    {
      label: '开机自动启动',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => {
        app.setLoginItemSettings({ openAtLogin: item.checked });
      },
    },
    {
      label: '彻底退出程序',
      click: async () => {
        isAppQuitting = true;
        await stopEngine();
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

// 注册 IPC 接口通信
function registerIpcHandlers() {
  ipcMain.handle('engine:get-status', () => ({ ...state }));
  ipcMain.handle('engine:start', () => startEngine());
  ipcMain.handle('engine:stop', () => stopEngine());
  ipcMain.handle('engine:restart', () => restartEngine());
  ipcMain.handle('engine:kill-port', async (_e, port) => {
    appendLog(`[操作] 正在强制释放端口 ${port}...`);
    const ok = await killPort(port);
    if (ok) {
      appendLog(`[完成] 端口 ${port} 释放成功！`);
      return { success: true, message: `端口 ${port} 释放成功` };
    }
    return { success: false, error: `未能释放端口 ${port}` };
  });

  ipcMain.handle('engine:get-logs', () => [...logBuffer]);
  ipcMain.handle('engine:clear-logs', () => {
    logBuffer.length = 0;
    return true;
  });

  ipcMain.handle('shell:open-external', (_e, url) => shell.openExternal(url));
  ipcMain.handle('app:copy-text', (_e, text) => {
    clipboard.writeText(text);
    return true;
  });
  ipcMain.on('app:minimize-to-tray', () => {
    mainWindow?.hide();
  });

  ipcMain.handle('app:toggle-auto-start', (_e, enable) => {
    app.setLoginItemSettings({ openAtLogin: enable });
    return app.getLoginItemSettings().openAtLogin;
  });
  ipcMain.handle('app:is-auto-start', () => app.getLoginItemSettings().openAtLogin);
}

// 应用生命周期
app.whenReady().then(async () => {
  registerIpcHandlers();
  createMainWindow();
  createTray();

  // 默认自启动伴生引擎，免除小白手动点启动步骤
  setTimeout(() => {
    startEngine();
  }, 800);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('before-quit', () => {
  isAppQuitting = true;
});

app.on('window-all-closed', () => {
  // macOS 下不关闭，Windows 下最小化到托盘已在 close 拦截
  if (process.platform !== 'darwin' && isAppQuitting) {
    app.quit();
  }
});
