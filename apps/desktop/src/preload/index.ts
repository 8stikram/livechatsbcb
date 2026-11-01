import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IpcChannel, type AppState, type LiveChatApi } from '../shared/ipc';

const api: LiveChatApi = {
  getState: () => ipcRenderer.invoke(IpcChannel.GetState),
  onState: (listener) => {
    const handler = (_event: IpcRendererEvent, state: AppState) => listener(state);
    ipcRenderer.on(IpcChannel.StateChanged, handler);
    return () => ipcRenderer.removeListener(IpcChannel.StateChanged, handler);
  },
  login: () => ipcRenderer.invoke(IpcChannel.Login),
  cancelLogin: () => ipcRenderer.invoke(IpcChannel.CancelLogin),
  logout: () => ipcRenderer.invoke(IpcChannel.Logout),
  refreshGuilds: () => ipcRenderer.invoke(IpcChannel.RefreshGuilds),
  setGuilds: (guildIds) => ipcRenderer.invoke(IpcChannel.SetGuilds, guildIds),
  joinGuild: (guildId) => ipcRenderer.invoke(IpcChannel.JoinGuild, guildId),
  returnToPrivateParty: () => ipcRenderer.invoke(IpcChannel.ReturnToPrivateParty),
  createParty: () => ipcRenderer.invoke(IpcChannel.CreateParty),
  joinParty: (code) => ipcRenderer.invoke(IpcChannel.JoinParty, code),
  rotateCode: () => ipcRenderer.invoke(IpcChannel.RotateCode),
  leaveParty: () => ipcRenderer.invoke(IpcChannel.LeaveParty),
  reconnect: () => ipcRenderer.invoke(IpcChannel.Reconnect),
  copyCode: () => ipcRenderer.invoke(IpcChannel.CopyCode),
  scanLibrary: () => ipcRenderer.invoke(IpcChannel.ScanLibrary),
  addLibraryFolder: () => ipcRenderer.invoke(IpcChannel.AddLibraryFolder),
  removeLibraryFolder: (path) => ipcRenderer.invoke(IpcChannel.RemoveLibraryFolder, path),
  setLibraryFavorite: (fileId, favorite) => ipcRenderer.invoke(IpcChannel.SetLibraryFavorite, fileId, favorite),
  useLibraryFile: (fileId) => ipcRenderer.invoke(IpcChannel.UseLibraryFile, fileId),
  saveLiveChat: (input) => ipcRenderer.invoke(IpcChannel.SaveLiveChat, input),
  sendSaved: (savedId) => ipcRenderer.invoke(IpcChannel.SendSaved, savedId),
  editSaved: (savedId) => ipcRenderer.invoke(IpcChannel.EditSaved, savedId),
  relocateSaved: (savedId) => ipcRenderer.invoke(IpcChannel.RelocateSaved, savedId),
  setSavedFavorite: (savedId, favorite) => ipcRenderer.invoke(IpcChannel.SetSavedFavorite, savedId, favorite),
  deleteSaved: (savedId) => ipcRenderer.invoke(IpcChannel.DeleteSaved, savedId),
  pickMedia: (slot) => ipcRenderer.invoke(IpcChannel.PickMedia, slot),
  clearDraft: (slot) => ipcRenderer.invoke(IpcChannel.ClearDraft, slot),
  sendMedia: (input) => ipcRenderer.invoke(IpcChannel.SendMedia, input),
  cancelUpload: () => ipcRenderer.invoke(IpcChannel.CancelUpload),
  skipMedia: (mediaId) => ipcRenderer.invoke(IpcChannel.SkipMedia, mediaId),
  replayForAll: (historyId) => ipcRenderer.invoke(IpcChannel.ReplayForAll, historyId),
  replayForMe: (historyId) => ipcRenderer.invoke(IpcChannel.ReplayForMe, historyId),
  stopLocalReplay: () => ipcRenderer.invoke(IpcChannel.StopLocalReplay),
  setSettings: (change) => ipcRenderer.invoke(IpcChannel.SetSettings, change),
  testOverlay: () => ipcRenderer.invoke(IpcChannel.TestOverlay),
  installUpdate: () => ipcRenderer.invoke(IpcChannel.InstallUpdate),
};

contextBridge.exposeInMainWorld('liveChat', api);
