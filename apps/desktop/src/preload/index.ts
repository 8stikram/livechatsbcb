import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IpcChannel, type AppState, type LiveChatApi } from '../shared/ipc';

const api: LiveChatApi = {
  getState: () => ipcRenderer.invoke(IpcChannel.GetState),
  onState: (listener) => {
    const handler = (_event: IpcRendererEvent, state: AppState) => listener(state);
    ipcRenderer.on(IpcChannel.StateChanged, handler);
    return () => ipcRenderer.removeListener(IpcChannel.StateChanged, handler);
  },
  createParty: (name) => ipcRenderer.invoke(IpcChannel.CreateParty, name),
  joinParty: (code, name) => ipcRenderer.invoke(IpcChannel.JoinParty, code, name),
  rotateCode: () => ipcRenderer.invoke(IpcChannel.RotateCode),
  leaveParty: () => ipcRenderer.invoke(IpcChannel.LeaveParty),
  reconnect: () => ipcRenderer.invoke(IpcChannel.Reconnect),
  copyCode: () => ipcRenderer.invoke(IpcChannel.CopyCode),
  pickMedia: () => ipcRenderer.invoke(IpcChannel.PickMedia),
  clearDraft: () => ipcRenderer.invoke(IpcChannel.ClearDraft),
  sendMedia: (input) => ipcRenderer.invoke(IpcChannel.SendMedia, input),
  cancelUpload: () => ipcRenderer.invoke(IpcChannel.CancelUpload),
  skipMedia: (mediaId) => ipcRenderer.invoke(IpcChannel.SkipMedia, mediaId),
  setSettings: (change) => ipcRenderer.invoke(IpcChannel.SetSettings, change),
  testOverlay: () => ipcRenderer.invoke(IpcChannel.TestOverlay),
  installUpdate: () => ipcRenderer.invoke(IpcChannel.InstallUpdate),
};

contextBridge.exposeInMainWorld('liveChat', api);
