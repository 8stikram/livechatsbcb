import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron';
import { IpcChannel, type AppState, type IncomingResult, type LiveChatApi } from '../shared/ipc';

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
  setLibraryTags: (target, tags) => ipcRenderer.invoke(IpcChannel.SetLibraryTags, target, tags),
  useLibraryFile: (fileId) => ipcRenderer.invoke(IpcChannel.UseLibraryFile, fileId),
  startScene: () => ipcRenderer.invoke(IpcChannel.StartScene),
  pickSceneFile: (wanted) => ipcRenderer.invoke(IpcChannel.PickSceneFile, wanted),
  useLibraryFileInScene: (fileId) => ipcRenderer.invoke(IpcChannel.UseLibraryFileInScene, fileId),
  forgetSceneFile: (id) => ipcRenderer.invoke(IpcChannel.ForgetSceneFile, id),
  sendScene: (input) => ipcRenderer.invoke(IpcChannel.SendScene, input),
  saveScene: (input) => ipcRenderer.invoke(IpcChannel.SaveScene, input),
  showLibraryFileMenu: (fileId, canSend) => ipcRenderer.invoke(IpcChannel.ShowLibraryFileMenu, fileId, canSend),
  showSavedMenu: (savedId, canSend) => ipcRenderer.invoke(IpcChannel.ShowSavedMenu, savedId, canSend),
  sendLibraryFile: (fileId, durationMs) => ipcRenderer.invoke(IpcChannel.SendLibraryFile, fileId, durationMs),
  renameLibraryFile: (fileId, name) => ipcRenderer.invoke(IpcChannel.RenameLibraryFile, fileId, name),
  trashLibraryFile: (fileId) => ipcRenderer.invoke(IpcChannel.TrashLibraryFile, fileId),
  saveLiveChat: (input) => ipcRenderer.invoke(IpcChannel.SaveLiveChat, input),
  sendSaved: (savedId) => ipcRenderer.invoke(IpcChannel.SendSaved, savedId),
  editSaved: (savedId) => ipcRenderer.invoke(IpcChannel.EditSaved, savedId),
  editHistory: (historyId) => ipcRenderer.invoke(IpcChannel.EditHistory, historyId),
  relocateSaved: (savedId) => ipcRenderer.invoke(IpcChannel.RelocateSaved, savedId),
  setSavedFavorite: (savedId, favorite) => ipcRenderer.invoke(IpcChannel.SetSavedFavorite, savedId, favorite),
  deleteSaved: (savedId) => ipcRenderer.invoke(IpcChannel.DeleteSaved, savedId),
  pickMedia: (slot) => ipcRenderer.invoke(IpcChannel.PickMedia, slot),
  clearDraft: (slot) => ipcRenderer.invoke(IpcChannel.ClearDraft, slot),
  sendMedia: (input) => ipcRenderer.invoke(IpcChannel.SendMedia, input),
  cancelUpload: () => ipcRenderer.invoke(IpcChannel.CancelUpload),
  skipMedia: (mediaId) => ipcRenderer.invoke(IpcChannel.SkipMedia, mediaId),
  skipMediaForMe: (mediaId) => ipcRenderer.invoke(IpcChannel.SkipMediaForMe, mediaId),
  replayForAll: (historyId) => ipcRenderer.invoke(IpcChannel.ReplayForAll, historyId),
  replayForMe: (historyId) => ipcRenderer.invoke(IpcChannel.ReplayForMe, historyId),
  keepHistory: (historyId) => ipcRenderer.invoke(IpcChannel.KeepHistory, historyId),
  replayFavoriteForMe: (savedId) => ipcRenderer.invoke(IpcChannel.ReplayFavoriteForMe, savedId),
  stopLocalReplay: () => ipcRenderer.invoke(IpcChannel.StopLocalReplay),
  setSettings: (change) => ipcRenderer.invoke(IpcChannel.SetSettings, change),
  testOverlay: () => ipcRenderer.invoke(IpcChannel.TestOverlay),
  pathForFile: (file) => webUtils.getPathForFile(file),
  pasteFiles: (paths, advanced) => ipcRenderer.invoke(IpcChannel.PasteFiles, paths, advanced),
  pasteImage: (bytes, contentType, name, advanced) => ipcRenderer.invoke(IpcChannel.PasteImage, bytes, contentType, name, advanced),
  pasteLink: (url, advanced) => ipcRenderer.invoke(IpcChannel.PasteLink, url, advanced),
  onExternalFiles: (listener) => {
    const handler = () => listener();
    ipcRenderer.on(IpcChannel.ExternalFilesWaiting, handler);
    return () => ipcRenderer.removeListener(IpcChannel.ExternalFilesWaiting, handler);
  },
  takeExternalFiles: (advanced) => ipcRenderer.invoke(IpcChannel.TakeExternalFiles, advanced),
  sendExternalFiles: (durationMs) => ipcRenderer.invoke(IpcChannel.SendExternalFiles, durationMs),
  onShortcutFeedback: (listener) => {
    const handler = (_event: unknown, sent: boolean) => listener(sent);
    ipcRenderer.on(IpcChannel.ShortcutFeedback, handler);
    return () => ipcRenderer.removeListener(IpcChannel.ShortcutFeedback, handler);
  },
  setClean: (clean) => ipcRenderer.invoke(IpcChannel.SetClean, clean),
  setActionKey: (which, key) => ipcRenderer.invoke(IpcChannel.SetActionKey, which, key),
  showMemberMenu: (memberId) => ipcRenderer.invoke(IpcChannel.ShowMemberMenu, memberId),
  ignoreMember: (memberId, choice) => ipcRenderer.invoke(IpcChannel.IgnoreMember, memberId, choice),
  assignFileShortcut: (fileId, key, durationMs) => ipcRenderer.invoke(IpcChannel.AssignFileShortcut, fileId, key, durationMs),
  assignSavedShortcut: (savedId, key) => ipcRenderer.invoke(IpcChannel.AssignSavedShortcut, savedId, key),
  clearShortcut: (key) => ipcRenderer.invoke(IpcChannel.ClearShortcut, key),
  changeShortcutKey: (key, next) => ipcRenderer.invoke(IpcChannel.ChangeShortcutKey, key, next),
  testKeys: (on) => ipcRenderer.invoke(IpcChannel.TestKeys, on),
  resetKeys: () => ipcRenderer.invoke(IpcChannel.ResetKeys),
  setWheelSlot: (index, choice) => ipcRenderer.invoke(IpcChannel.SetWheelSlot, index, choice),
  previewWheel: () => ipcRenderer.invoke(IpcChannel.PreviewWheel),
  pickWheel: (index) => ipcRenderer.invoke(IpcChannel.PickWheel, index),
  closeWheel: () => ipcRenderer.invoke(IpcChannel.CloseWheel),
  wheelActivity: () => ipcRenderer.invoke(IpcChannel.WheelActivity),
  checkForUpdates: () => ipcRenderer.invoke(IpcChannel.CheckForUpdates),
  installUpdate: () => ipcRenderer.invoke(IpcChannel.InstallUpdate),
  markNotesSeen: () => ipcRenderer.invoke(IpcChannel.MarkNotesSeen),
  stashView: (view) => ipcRenderer.invoke(IpcChannel.StashView, view),
  searchSoundCloud: (query) => ipcRenderer.invoke(IpcChannel.SearchSoundCloud, query),
  onLinkPicked: (listener) => {
    const onPicked = (_event: unknown, result: IncomingResult) => listener(result);
    ipcRenderer.on(IpcChannel.LinkPicked, onPicked);
    return () => {
      ipcRenderer.off(IpcChannel.LinkPicked, onPicked);
    };
  },
  stashDraft: (advanced, input) => ipcRenderer.invoke(IpcChannel.StashDraft, advanced, input),
  takeRestartStash: () => ipcRenderer.invoke(IpcChannel.TakeRestartStash),
  startPoll: (question, options) => ipcRenderer.invoke(IpcChannel.StartPoll, question, options),
  listApps: () => ipcRenderer.invoke(IpcChannel.ListApps),
  votePoll: (pollId, choice) => ipcRenderer.invoke(IpcChannel.VotePoll, pollId, choice),
  startGame: (kind) => ipcRenderer.invoke(IpcChannel.StartGame, kind),
  gameSay: (gameId, text) => ipcRenderer.invoke(IpcChannel.GameSay, gameId, text),
  gameVote: (gameId, choice) => ipcRenderer.invoke(IpcChannel.GameVote, gameId, choice),
  stopGame: (gameId) => ipcRenderer.invoke(IpcChannel.StopGame, gameId),
  gameAction: (gameId, action) => ipcRenderer.invoke(IpcChannel.GameAction, gameId, action),
  gameReact: (gameId, emoji) => ipcRenderer.invoke(IpcChannel.GameReact, gameId, emoji),
  sendGameFiles: (gameId) => ipcRenderer.invoke(IpcChannel.SendGameFiles, gameId),
  sendGameText: (gameId, text) => ipcRenderer.invoke(IpcChannel.SendGameText, gameId, text),
  reportLevel: (level) => ipcRenderer.send(IpcChannel.SoundLevel, level),
  onLiveLevel: (listener) => {
    const onLevel = (_event: unknown, level: number) => listener(level);
    ipcRenderer.on(IpcChannel.LiveLevel, onLevel);
    return () => {
      ipcRenderer.off(IpcChannel.LiveLevel, onLevel);
    };
  },
};

contextBridge.exposeInMainWorld('liveChat', api);
