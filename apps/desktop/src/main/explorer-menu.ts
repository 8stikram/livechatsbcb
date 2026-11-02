import { execFile } from 'node:child_process';
import { app } from 'electron';

export const PREPARE_ARG = '--livechat-prepare';
export const SEND_ARG = '--livechat-send';

const VERBS = [
  { key: 'LiveChatSBCB.Prepare', label: 'LiveChatSBCB : préparer', arg: PREPARE_ARG },
  { key: 'LiveChatSBCB.Send', label: 'LiveChatSBCB : envoyer direct', arg: SEND_ARG },
];

const reg = (...args: string[]): Promise<void> => new Promise((done) => execFile('reg', ['add', ...args, '/f'], () => done()));

// Only for this Windows account, and only on the kinds of file the app can send.
export const registerExplorerMenu = async (): Promise<void> => {
  if (!app.isPackaged) return;
  const exe = process.execPath;
  for (const { key, label, arg } of VERBS) {
    const root = `HKCU\\Software\\Classes\\*\\shell\\${key}`;
    await reg(root, '/ve', '/d', label);
    await reg(root, '/v', 'Icon', '/d', exe);
    await reg(root, '/v', 'AppliesTo', '/d', 'System.Kind:=picture OR System.Kind:=video OR System.Kind:=music');
    await reg(`${root}\\command`, '/ve', '/d', `\"${exe}\" ${arg} \"%1\"`);
  }
};
