export interface BackoffConfig {
  /**
   * Sequence of retry delays in milliseconds for initial attempts.
   * Defaults to [5000, 15000, 30000, 60000] (5s, 15s, 30s, 60s).
   */
  stepDelaysMs: number[];
  /**
   * Maximum backoff ceiling in milliseconds.
   * Default: 60000 (60s).
   */
  ceilingMs: number;
  /**
   * Optional maximum attempts. Default is undefined (persists retries up to ceiling
   * rather than giving up after 3 static tries).
   */
  maxAttempts?: number;
}

export const DEFAULT_BACKOFF_CONFIG: BackoffConfig = {
  stepDelaysMs: [5_000, 15_000, 30_000, 60_000],
  ceilingMs: 60_000,
  maxAttempts: undefined,
};

/**
 * Computes backoff delay in milliseconds for a given attempt count.
 *
 * Example progression with defaults:
 * Attempt 1: 5,000ms  (5s)
 * Attempt 2: 15,000ms (15s)
 * Attempt 3: 30,000ms (30s)
 * Attempt 4: 60,000ms (60s)
 * Attempt 5+: capped at ceilingMs (default 60s or custom ceiling)
 *
 * @param attempts Total attempts completed so far (1-indexed after 1st failure)
 * @param config Optional backoff configuration overrides
 */
export function calculateBackoffDelay(
  attempts: number,
  config: Partial<BackoffConfig> = {}
): number {
  if (attempts <= 0) {
    return 0;
  }

  const { stepDelaysMs, ceilingMs } = {
    ...DEFAULT_BACKOFF_CONFIG,
    ...config,
  };

  const stepIndex = attempts - 1;
  let delay: number;

  if (stepIndex < stepDelaysMs.length) {
    delay = stepDelaysMs[stepIndex];
  } else {
    // Beyond preset steps, apply exponential backoff capped by the ceiling
    const lastStep = stepDelaysMs[stepDelaysMs.length - 1] ?? 60_000;
    const overflow = attempts - stepDelaysMs.length;
    delay = lastStep * Math.pow(2, overflow);
  }

  return Math.min(delay, ceilingMs);
}

/**
 * Computes the timestamp for the next retry attempt.
 */
export function calculateNextRetryAt(
  attempts: number,
  fromTimestamp: number = Date.now(),
  config?: Partial<BackoffConfig>
): number {
  const delay = calculateBackoffDelay(attempts, config);
  return fromTimestamp + delay;
}

/**
 * Checks whether further retries are permitted.
 * By default returns true rather than abandoning dispatch after 3 static tries.
 */
export function shouldRetry(
  attempts: number,
  config?: Partial<BackoffConfig>
): boolean {
  if (config?.maxAttempts === undefined || config?.maxAttempts === null) {
    return true;
  }
  return attempts < config.maxAttempts;
}

/**
 * Manages timer-based retry scheduling to flush the queue when the next backoff expires.
 */
export class RetryScheduler {
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private scheduledTargetTime: number | null = null;

  /**
   * Schedules a callback to fire at the target timestamp.
   * If a later timer is already running, replaces it with this earlier target.
   */
  schedule(targetTime: number, callback: () => void): void {
    const now = Date.now();
    const delay = Math.max(0, targetTime - now);

    // If already scheduled for an earlier or equal time, retain the earlier timer
    if (this.timerId !== null && this.scheduledTargetTime !== null) {
      if (this.scheduledTargetTime <= targetTime) {
        return;
      }
      this.cancel();
    }

    this.scheduledTargetTime = targetTime;
    this.timerId = setTimeout(() => {
      this.timerId = null;
      this.scheduledTargetTime = null;
      callback();
    }, delay);
  }

  /**
   * Cancels any pending scheduled retry timer.
   */
  cancel(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
      this.scheduledTargetTime = null;
    }
  }

  /**
   * Returns true if a retry timer is actively scheduled.
   */
  isScheduled(): boolean {
    return this.timerId !== null;
  }

  /**
   * Returns the target timestamp for the currently scheduled timer, if any.
   */
  getScheduledTargetTime(): number | null {
    return this.scheduledTargetTime;
  }
}
