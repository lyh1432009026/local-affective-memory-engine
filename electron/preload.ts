import { contextBridge, ipcRenderer } from 'electron';

export interface EngineStatus {
  running: boolean;
  port: number;
  pid: number | null;
  mode: string;
  activePersona: string;
}

contextBridge.exposeInMainWorld('electronDesktop', {
  getStatus: (): Promise<EngineStatus> => ipcRenderer.invoke('engine:get-status'),
  startEngine: (): Promise<{ success: boolean; message?: string; error?: string }> =>
    ipcRenderer.invoke('engine:start'),
  stopEngine: (): Promise<{ success: boolean; message?: string; error?: string }> =>
    ipcRenderer.invoke('engine:stop'),
  restartEngine: (): Promise<{ success: boolean; message?: string; error?: string }> =>
    ipcRenderer.invoke('engine:restart'),
  killPort: (port: number): Promise<{ success: boolean; message?: string; error?: string }> =>
    ipcRenderer.invoke('engine:kill-port', port),
  getLogs: (): Promise<string[]> => ipcRenderer.invoke('engine:get-logs'),
  clearLogs: (): Promise<boolean> => ipcRenderer.invoke('engine:clear-logs'),
  onLog: (callback: (line: string) => void) => {
    const handler = (_event: any, line: string) => callback(line);
    ipcRenderer.on('engine:log', handler);
    return () => {
      ipcRenderer.removeListener('engine:log', handler);
    };
  },
  onStatusChange: (callback: (status: EngineStatus) => void) => {
    const handler = (_event: any, status: EngineStatus) => callback(status);
    ipcRenderer.on('engine:status-change', handler);
    return () => {
      ipcRenderer.removeListener('engine:status-change', handler);
    };
  },
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:open-external', url),
  copyToClipboard: (text: string): Promise<boolean> => ipcRenderer.invoke('app:copy-text', text),
  minimizeToTray: (): void => ipcRenderer.send('app:minimize-to-tray'),
  toggleAutoStart: (enable: boolean): Promise<boolean> =>
    ipcRenderer.invoke('app:toggle-auto-start', enable),
  isAutoStart: (): Promise<boolean> => ipcRenderer.invoke('app:is-auto-start'),
  getAppVersion: (): string => '2.4.0',
});
