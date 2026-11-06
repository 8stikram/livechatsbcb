import { spawn, type ChildProcess } from 'node:child_process';

// Whatever fills a whole screen in front of everything is most likely a game. Browsers and video players are left out,
// as are this app and the desktop itself.
const NOT_GAMES = new Set(
  ['explorer', 'chrome', 'msedge', 'firefox', 'opera', 'brave', 'vivaldi', 'arc', 'livechatsbcb', 'electron', 'vlc', 'mpc-hc64', 'mpc-be64', 'applicationframehost', 'discord', 'obs64', 'lockapp', 'searchhost', 'shellexperiencehost', 'startmenuexperiencehost', 'textinputhost'],
);

const CHECK_EVERY_S = 5;

// Asked of Windows itself, by a small helper that stays open: nothing to install, and nothing leaves the PC.
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
      if ([LcWin]::GetMonitorInfo([LcWin]::MonitorFromWindow($window, 2), [ref]$info)) {
        $screen = $info.Monitor
        if ($rect.Left -le $screen.Left -and $rect.Top -le $screen.Top -and $rect.Right -ge $screen.Right -and $rect.Bottom -ge $screen.Bottom) {
          $id = 0
          [void][LcWin]::GetWindowThreadProcessId($window, [ref]$id)
          $process = Get-Process -Id $id -ErrorAction SilentlyContinue
          if ($process) { $out = $process.ProcessName }
        }
      }
    }
  } catch {}
  [Console]::Out.WriteLine($out)
  [Console]::Out.Flush()
  Start-Sleep -Seconds ${CHECK_EVERY_S}
}
`;

export class GameWatch {
  private child: ChildProcess | null = null;
  private playing = false;

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
      if (last !== undefined) this.set(last !== '-' && last !== '' && !NOT_GAMES.has(last.toLowerCase()));
    });
    child.on('error', () => this.stop());
    child.on('exit', () => {
      if (this.child === child) this.child = null;
      this.set(false);
    });
  }

  stop(): void {
    const child = this.child;
    this.child = null;
    child?.kill();
    this.set(false);
  }

  private set(playing: boolean): void {
    if (playing === this.playing) return;
    this.playing = playing;
    this.onChange();
  }
}
