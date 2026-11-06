import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app } from 'electron';
import { CONTENT_TYPE_BY_EXTENSION } from './media-files';

export const PREPARE_ARG = '--livechat-prepare';
export const SEND_ARG = '--livechat-send';

const VERBS = [
  { key: 'LiveChatSBCB.Prepare', label: 'LiveChatSBCB : préparer', arg: PREPARE_ARG },
  { key: 'LiveChatSBCB.Send', label: 'LiveChatSBCB : envoyer direct', arg: SEND_ARG },
];

const CLASSES = 'HKEY_CURRENT_USER\\Software\\Classes';

// A .reg file keeps its own escapes: backslashes and quotes doubled.
const regString = (text: string): string => `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

// Windows 11 shows these under « Afficher plus d'options » (or Maj + clic droit). Its short menu needs a paid signature.
// Each kind of file gets its own entry, which Windows shows whatever app opens that file.
export const explorerMenuFile = (exe: string): string => {
  const lines = ['Windows Registry Editor Version 5.00', ''];
  // The first versions put them on every file, with a filter Windows didn't always follow.
  for (const { key } of VERBS) lines.push(`[-${CLASSES}\\*\\shell\\${key}]`, '');
  for (const extension of Object.keys(CONTENT_TYPE_BY_EXTENSION)) {
    for (const { key, label, arg } of VERBS) {
      const root = `${CLASSES}\\SystemFileAssociations\\.${extension}\\shell\\${key}`;
      lines.push(`[${root}]`, `@=${regString(label)}`, `"Icon"=${regString(exe)}`, '"MultiSelectModel"="Player"', '');
      lines.push(`[${root}\\command]`, `@=${regString(`"${exe}" ${arg} "%1"`)}`, '');
    }
  }
  return lines.join('\r\n');
};

// Only for this Windows account: no administrator needed. Written again at each start, in case the app moved.
export const registerExplorerMenu = async (): Promise<void> => {
  if (!app.isPackaged || process.platform !== 'win32') return;
  const file = join(app.getPath('temp'), 'livechatsbcb-menu.reg');
  // UTF-16 with its mark, which is what reg import reads accents from.
  await writeFile(file, `﻿${explorerMenuFile(process.execPath)}`, 'utf16le');
  await new Promise<void>((done) => execFile('reg', ['import', file], () => done()));
};
