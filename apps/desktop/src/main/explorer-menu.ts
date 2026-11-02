import { execFile } from 'node:child_process';
import { app } from 'electron';
import { CONTENT_TYPE_BY_EXTENSION } from './media-files';

export const PREPARE_ARG = '--livechat-prepare';
export const SEND_ARG = '--livechat-send';

const VERBS = [
  { key: 'LiveChatSBCB.Prepare', label: 'LiveChatSBCB : préparer', arg: PREPARE_ARG },
  { key: 'LiveChatSBCB.Send', label: 'LiveChatSBCB : envoyer direct', arg: SEND_ARG },
];

// By extension: Windows doesn't always know the kind of a file, and then hides the entry.
const APPLIES_TO = Object.keys(CONTENT_TYPE_BY_EXTENSION).map((extension) => `System.FileExtension:=.${extension}`).join(' OR ');

const reg = (...args: string[]): Promise<void> => new Promise((done) => execFile('reg', ['add', ...args, '/f'], () => done()));

// Only for this Windows account, and only on the kinds of file the app can send.
export const registerExplorerMenu = async (): Promise<void> => {
  if (!app.isPackaged || process.platform !== 'win32') return;
  const exe = process.execPath;
  for (const { key, label, arg } of VERBS) {
    const root = `HKCU\\Software\\Classes\\*\\shell\\${key}`;
    await reg(root, '/ve', '/d', label);
    await reg(root, '/v', 'Icon', '/d', exe);
    await reg(root, '/v', 'AppliesTo', '/d', APPLIES_TO);
    await reg(`${root}\\command`, '/ve', '/d', `\"${exe}\" ${arg} \"%1\"`);
  }
};
