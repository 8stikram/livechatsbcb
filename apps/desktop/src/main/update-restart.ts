export const RESTART_COUNTDOWN_SECONDS = 3;

// Runs only while restarting is possible: anything starting to play or to be sent calls it off.
export class RestartCountdown {
  private timer: NodeJS.Timeout | null = null;
  private left: number | null = null;

  constructor(
    private readonly onTick: () => void,
    private readonly onFinish: () => void,
    private readonly onCancel: () => void,
  ) {}

  get seconds(): number | null {
    return this.left;
  }

  sync(wanted: boolean): void {
    if (wanted && this.left === null) this.start();
    else if (!wanted && this.left !== null) this.stop();
  }

  private start(): void {
    this.left = RESTART_COUNTDOWN_SECONDS;
    this.timer = setInterval(() => {
      this.left! -= 1;
      if (this.left! > 0) {
        this.onTick();
        return;
      }
      clearInterval(this.timer!);
      this.onFinish();
    }, 1_000);
  }

  private stop(): void {
    clearInterval(this.timer!);
    this.left = null;
    this.onCancel();
  }
}
