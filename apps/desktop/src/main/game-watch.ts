import { spawn, type ChildProcess } from 'node:child_process';

// Whatever fills a whole screen in front of everything is most likely a game. Browsers and video players are left out,
// as are this app and the desktop itself.
const NOT_GAMES = new Set(
  ['explorer', 'chrome', 'msedge', 'firefox', 'opera', 'brave', 'vivaldi', 'arc', 'livechatsbcb', 'electron', 'vlc', 'mpc-hc64', 'mpc-be64', 'applicationframehost', 'discord', 'obs64', 'lockapp', 'searchhost', 'shellexperiencehost', 'startmenuexperiencehost', 'textinputhost'],
);

const CHECK_EVERY_S = 5;
const MAX_NAME = 40;

// What a person would call the game: the window's title most often says it best ("VALORANT", "Overwatch"),
// then what the program says it is, and last its file name made readable.
export const gameNameOf = (process: string, title: string, about: string): string => {
  const tidy = (text: string) =>
    text
      .replace(/[™®©]/g, '')
      .replace(/\s*\([^)]*\)\s*$/, '')
      .replace(/\s+/g, ' ')
      .trim();
  for (const candidate of [tidy(title), tidy(about)]) {
    if (candidate.length >= 2 && candidate.length <= MAX_NAME) return candidate;
  }
  const readable = process
    .replace(/[-_.]+/g, ' ')
    .replace(/\b(win64|win32|x64|shipping|dx11|dx12|vulkan|client)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  const name = readable ? readable.charAt(0).toUpperCase() + readable.slice(1) : process;
  return name.slice(0, MAX_NAME);
};

// Asked of Windows itself, by a small helper that stays open: nothing to install. Only the game's name may leave the PC,
// and only for whoever lets it show.
const SCRIPT = `
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class LcWin {
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct MonitorInfo { public int Size; public Rect Monitor; public Rect Work; public int Flags; }
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern IntPtr GetShellWindow();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window, out Rect rect);
  [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr window, uint flags);
  [DllImport("user32.dll")] public static extern bool GetMonitorInfo(IntPtr monitor, ref MonitorInfo info);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
}
"@
while ($true) {
  $out = '-'
  try {
    $window = [LcWin]::GetForegroundWindow()
    if ($window -ne [IntPtr]::Zero -and $window -ne [LcWin]::GetShellWindow()) {
      $rect = New-Object LcWin+Rect
      [void][LcWin]::GetWindowRect($window, [ref]$rect)
      $info = New-Object LcWin+MonitorInfo
      $info.Size = [Runtime.InteropServices.Marshal]::SizeOf($info)
      $full = 0
      if ([LcWin]::GetMonitorInfo([LcWin]::MonitorFromWindow($window, 2), [ref]$info)) {
        $screen = $info.Monitor
        if ($rect.Left -le $screen.Left -and $rect.Top -le $screen.Top -and $rect.Right -ge $screen.Right -and $rect.Bottom -ge $screen.Bottom) { $full = 1 }
      }
      $id = 0
      [void][LcWin]::GetWindowThreadProcessId($window, [ref]$id)
      $process = Get-Process -Id $id -ErrorAction SilentlyContinue
      if ($process) {
        $title = ''
        $about = ''
        try { $title = $process.MainWindowTitle } catch {}
        try { $about = $process.MainModule.FileVersionInfo.FileDescription } catch {}
        $out = $process.ProcessName + [char]9 + $full + [char]9 + $title + [char]9 + $about
      }
    }
  } catch {}
  [Console]::Out.WriteLine($out)
  [Console]::Out.Flush()
  Start-Sleep -Seconds ${CHECK_EVERY_S}
}
`;

// The apps with a window open now, for choosing where LiveChats never show.
export const openApps = (): Promise<Array<{ name: string; title: string }>> =>
  new Promise((done) => {
    if (process.platform !== 'win32') return done([]);
    const script = "Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle } | ForEach-Object { $_.ProcessName + [char]9 + $_.MainWindowTitle }";
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => (out += chunk));
    child.on('error', () => done([]));
    child.on('close', () => {
      const seen = new Map<string, string>();
      for (const line of out.split(/\r?\n/)) {
        const [name, ...title] = line.split('\t');
        const key = name?.trim().toLowerCase();
        if (key && !seen.has(key) && key !== 'livechatsbcb' && key !== 'electron') seen.set(key, title.join('\t').trim());
      }
      done([...seen].map(([name, title]) => ({ name, title })).sort((a, b) => a.name.localeCompare(b.name)));
    });
  });

export class GameWatch {
  private child: ChildProcess | null = null;
  private playing = false;
  private front: string | null = null;
  private name: string | null = null;

  // What the game in front is called, while playing. Null otherwise.
  get gameName(): string | null {
    return this.playing ? this.name : null;
  }

  // The app in front, in lower case. Null when unknown.
  get foreground(): string | null {
    return this.front;
  }

  constructor(private readonly onChange: () => void) {}

  get isPlaying(): boolean {
    return this.playing;
  }

  // Only Windows can be asked this way. Elsewhere nobody is ever seen in game.
  start(): void {
    if (process.platform !== 'win32' || this.child) return;
    const encoded = Buffer.from(SCRIPT, 'utf16le').toString('base64');
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    this.child = child;
    let pending = '';
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      pending += chunk;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? '';
      const last = lines.at(-1)?.trim();
      if (last === undefined) return;
      const [name, full, title = '', about = ''] = last.split('\t');
      const front = name && name !== '-' ? name.toLowerCase() : null;
      const playing = front !== null && full === '1' && !NOT_GAMES.has(front);
      const called = playing && name ? gameNameOf(name, title, about) : null;
      if (called !== this.name) {
        this.name = called;
        // Another game in the same full screen: nothing else changed, so say it here.
        if (playing === this.playing && front === this.front) this.onChange();
      }
      this.set(playing, front);
    });
    child.on('error', () => this.stop());
    child.on('exit', () => {
      if (this.child === child) this.child = null;
      this.set(false, null);
    });
  }

  stop(): void {
    const child = this.child;
    this.child = null;
    child?.kill();
    this.set(false, null);
  }

  private set(playing: boolean, front: string | null): void {
    if (playing === this.playing && front === this.front) return;
    this.playing = playing;
    this.front = front;
    this.onChange();
  }
}
