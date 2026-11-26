/**
 * Active-time accounting core (Round 81) — pure logic, no imports, so
 * the accumulator can be unit-tested in plain node.
 *
 * WHY THIS EXISTS: students mostly leave their accounts logged in, so
 * wall-clock time between "screen opened" and "screen closed" wildly
 * overstates learning time (a tab left open overnight is not a night
 * of study). This tracker takes the opposite, conservative position:
 *
 *   A second counts ONLY while ALL of these hold:
 *     (a) the app is visible (web: tab not hidden; native: app active),
 *     (b) the app window is focused (web only; native treats "active"
 *         as focused), AND
 *     (c) the student has interacted within the last IDLE window
 *         (60s): a pointer press, key press, scroll, touch, or a
 *         navigation / screen change.
 *
 * Accrued seconds are handed to onFlush in chunks of at most
 * CHUNK_SECONDS (30). When tracking stops (screen closed, target
 * changed), a final remainder is flushed only if it reaches
 * MIN_REMAINDER_SECONDS (10) — shorter remainders are dropped as
 * bounces, matching the pre-Round-81 logger's floor. If the tab or
 * app is killed outright, up to one partial chunk (< 30s) is lost.
 * Both failure directions UNDERCOUNT by design: better a slightly
 * low figure than an inflated one.
 *
 * Accrual is driven by a 1-second interval, one second per tick. If
 * the timer is throttled or the thread stalls, ticks arrive late and
 * time is undercounted, never overcounted.
 */

export interface ActiveTimeEnvironment {
  /** Web: document not hidden. Native: app in the foreground. */
  isVisible(): boolean;
  /** Web: window has focus. Native: same as isVisible. */
  isFocused(): boolean;
  /** Subscribe to interaction signals; returns an unsubscribe fn. */
  onInteraction(cb: () => void): () => void;
  /** Subscribe to visibility/focus changes; returns an unsubscribe fn. */
  onVisibilityChange(cb: () => void): () => void;
}

export interface ActiveTimeTrackerOptions {
  env: ActiveTimeEnvironment;
  /** Called with each flushed chunk of active seconds (<= chunkSeconds). */
  onFlush: (seconds: number) => void;
  /** Flush granularity: accrued seconds are emitted in chunks of at most this. Default 30. */
  chunkSeconds?: number;
  /** Interaction recency window in seconds. Default 60. */
  idleAfterSeconds?: number;
  /** Final remainder below this many seconds is dropped on stop. Default 10. */
  minRemainderSeconds?: number;
  /** Injectable clock for tests. Defaults to Date.now. */
  now?: () => number;
}

export const ACTIVE_TIME_DEFAULTS = {
  chunkSeconds: 30,
  idleAfterSeconds: 60,
  minRemainderSeconds: 10,
} as const;

export class ActiveTimeTracker {
  private readonly env: ActiveTimeEnvironment;
  private readonly onFlush: (seconds: number) => void;
  private readonly chunkSeconds: number;
  private readonly idleMs: number;
  private readonly minRemainderSeconds: number;
  private readonly nowFn: () => number;

  private timer: ReturnType<typeof setInterval> | null = null;
  private unsubscribes: (() => void)[] = [];
  private running = false;
  private lastInteractionAt = 0;
  private pending = 0;

  constructor(options: ActiveTimeTrackerOptions) {
    this.env = options.env;
    this.onFlush = options.onFlush;
    this.chunkSeconds = options.chunkSeconds ?? ACTIVE_TIME_DEFAULTS.chunkSeconds;
    this.idleMs = (options.idleAfterSeconds ?? ACTIVE_TIME_DEFAULTS.idleAfterSeconds) * 1000;
    this.minRemainderSeconds =
      options.minRemainderSeconds ?? ACTIVE_TIME_DEFAULTS.minRemainderSeconds;
    this.nowFn = options.now ?? (() => Date.now());
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    // Opening the screen is itself the freshest interaction: the
    // student has just navigated here, so accrual may begin at once.
    this.lastInteractionAt = this.nowFn();
    this.unsubscribes.push(this.env.onInteraction(() => this.noteInteraction()));
    this.unsubscribes.push(
      this.env.onVisibilityChange(() => {
        // Returning to visibility/focus is not itself an interaction,
        // but regaining focus usually accompanies one; the tick gate
        // re-checks everything anyway, so there is nothing to do here
        // beyond letting the next tick see the new state.
      })
    );
    this.timer = setInterval(() => this.tick(), 1000);
  }

  /** Record a user interaction (also called for navigation changes). */
  noteInteraction(): void {
    this.lastInteractionAt = this.nowFn();
  }

  /** True while every accrual condition holds. */
  isActiveNow(): boolean {
    if (!this.env.isVisible() || !this.env.isFocused()) return false;
    return this.nowFn() - this.lastInteractionAt <= this.idleMs;
  }

  /**
   * One second of wall time. Accrues one second when active; emits a
   * chunk as soon as the pending total reaches the chunk size.
   * Public so tests can drive the clock without real timers.
   */
  tick(): void {
    if (!this.running) return;
    if (!this.isActiveNow()) return;
    this.pending += 1;
    if (this.pending >= this.chunkSeconds) {
      const seconds = this.pending;
      this.pending = 0;
      this.onFlush(seconds);
    }
  }

  /** Accrued but not yet flushed seconds (test/diagnostic visibility). */
  get pendingSeconds(): number {
    return this.pending;
  }

  get isRunning(): boolean {
    return this.running;
  }

  /**
   * Stop tracking. A final remainder is flushed when it reaches the
   * minimum-remainder floor; below the floor it is dropped as a
   * bounce (the pre-Round-81 logger's rule).
   */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    for (const unsub of this.unsubscribes) {
      try {
        unsub();
      } catch {
        // A broken listener must not block the final flush.
      }
    }
    this.unsubscribes = [];
    if (this.pending >= this.minRemainderSeconds) {
      const seconds = this.pending;
      this.pending = 0;
      this.onFlush(seconds);
    } else {
      this.pending = 0;
    }
  }
}
