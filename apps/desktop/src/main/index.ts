import { app, BrowserWindow, clipboard, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { z } from 'zod';
import { CodeSchema, NameSchema, type SessionResponse } from '@livechatsbcb/protocol';
import { IpcChannel, type ActionResult, type AppState } from '../shared/ipc';
import { registerAppScheme, serveRenderer } from './app-protocol';
import * as partyApi from './party-api';
import { PartyConnection } from './party-connection';
import { SessionStore } from './session-store';
import { createControlWindow, createStageWindow, denyAllPermissions, isOwnPage } from './windows';

// Lets one PC run several members for testing; each profile has its own folder and its own single-instance lock.
const profile = process.env['LIVECHATSBCB_PROFILE'];
if (profile) app.setPath('userData', profile);

registerAppScheme();

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  void app.whenReady().then(start);
}

function start(): void {
  denyAllPermissions();
  if (!process.env['ELECTRON_RENDERER_URL']) serveRenderer();

  const store = new SessionStore();
  let connection: PartyConnection | null = null;
  let notice: AppState['notice'] = null;
  let stagePinned = false;
  let quitting = false;

  const stageWindow = createStageWindow();
  const controlWindow = createControlWindow();

  const getState = (): AppState => {
    const snapshot = connection?.current();
    return {
      version: app.getVersion(),
      lastName: store.lastName,
      notice,
      party: snapshot
        ? {
            code: snapshot.code,
            memberId: snapshot.memberId,
            members: snapshot.members,
            connection: snapshot.status,
          }
        : null,
      stage: { visible: stageWindow.isVisible(), pinned: stagePinned },
    };
  };

  const publishState = (): void => {
    const state = getState();
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(IpcChannel.StateChanged, state);
    }
  };

  const connectTo = (session: SessionResponse): void => {
    connection?.stop();
    connection = new PartyConnection(session, {
      onChange: publishState,
      onSessionRevoked: () => {
        connection?.stop();
        connection = null;
        notice = 'session_expired';
        store.update({ session: null });
        publishState();
      },
    });
    connection.start();
    publishState();
  };

  const enterParty = (session: SessionResponse, name: string): void => {
    notice = null;
    store.update({ session, lastName: name });
    connectTo(session);
    if (!stageWindow.isVisible()) stageWindow.showInactive();
  };

  // Windows only ever show our own pages, but a handler should still refuse anything else that reaches it.
  const handle = <Args extends unknown[], Result>(
    channel: string,
    handler: (...args: Args) => Result | Promise<Result>,
  ): void => {
    ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
      if (!event.senderFrame || !isOwnPage(event.senderFrame.url)) throw new Error('Refused');
      return handler(...(args as Args));
    });
  };

  handle(IpcChannel.GetState, getState);

  handle(IpcChannel.CreateParty, async (rawName: unknown): Promise<ActionResult> => {
    const name = NameSchema.safeParse(rawName);
    if (!name.success) return { ok: false, error: 'invalid_request' };

    const result = await partyApi.createParty(name.data);
    if (!result.ok) return result;
    enterParty(result.value, name.data);
    return { ok: true };
  });

  handle(IpcChannel.JoinParty, async (rawCode: unknown, rawName: unknown): Promise<ActionResult> => {
    const input = z.object({ code: CodeSchema, name: NameSchema }).safeParse({ code: rawCode, name: rawName });
    if (!input.success) return { ok: false, error: 'invalid_request' };

    const result = await partyApi.joinParty(input.data.code, input.data.name);
    if (!result.ok) return result;
    enterParty(result.value, input.data.name);
    return { ok: true };
  });

  handle(IpcChannel.RotateCode, async (): Promise<ActionResult> => {
    const session = store.session;
    if (!session) return { ok: false, error: 'unauthorized' };

    const result = await partyApi.rotateCode(session);
    if (!result.ok) return result;
    store.update({ session: { ...session, code: result.value } });
    connection?.setCode(result.value);
    return { ok: true };
  });

  handle(IpcChannel.LeaveParty, async (): Promise<ActionResult> => {
    const session = store.session;
    if (!session) return { ok: true };

    const result = await partyApi.leaveParty(session);
    if (!result.ok && result.error !== 'unauthorized') return result;

    connection?.stop();
    connection = null;
    store.update({ session: null });
    publishState();
    return { ok: true };
  });

  handle(IpcChannel.Reconnect, () => connection?.reconnectNow());

  handle(IpcChannel.CopyCode, () => {
    const code = connection?.current().code;
    if (code) clipboard.writeText(code);
  });

  handle(IpcChannel.SetStageVisible, (visible: unknown) => {
    if (visible === true) stageWindow.showInactive();
    if (visible === false) stageWindow.hide();
    publishState();
  });

  handle(IpcChannel.SetStagePinned, (pinned: unknown) => {
    stagePinned = pinned === true;
    stageWindow.setAlwaysOnTop(stagePinned, 'screen-saver');
    publishState();
  });

  // Closing the stage only hides it: it stays ready, and the control window remains the way to quit.
  stageWindow.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    stageWindow.hide();
  });
  stageWindow.on('hide', publishState);
  stageWindow.on('show', publishState);

  controlWindow.on('closed', () => app.quit());
  app.on('before-quit', () => {
    quitting = true;
    connection?.stop();
  });
  app.on('second-instance', () => {
    if (controlWindow.isMinimized()) controlWindow.restore();
    controlWindow.focus();
  });

  const saved = store.session;
  if (saved) {
    connectTo(saved);
    stageWindow.once('ready-to-show', () => stageWindow.showInactive());
  }
}
