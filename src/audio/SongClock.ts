/**
 * Converts the audio hardware clock into song time.
 * Song time 0 = beat 0. Uses AudioContext.getOutputTimestamp() (what the
 * speakers play *now*) when available so visuals and judging match what is
 * heard, plus a user calibration offset.
 */
export class SongClock {
  private readonly ctx: AudioContext;
  /** Context time at which beat 0 is scheduled. */
  startCtxTime = 0;
  /** User calibration in seconds (positive = judge later). */
  userOffset = 0;
  private offset = NaN; // audio seconds − performance seconds
  private last = -Infinity;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
  }

  start(ctxTime: number): void {
    this.startCtxTime = ctxTime;
    this.last = -Infinity;
    this.offset = NaN;
  }

  /** Call once per frame. */
  sync(perfNowMs: number): void {
    let audioSec: number;
    let perfSec: number;
    const ts = this.ctx.getOutputTimestamp?.();
    if (ts && ts.contextTime !== undefined && ts.performanceTime !== undefined && ts.performanceTime > 0) {
      audioSec = ts.contextTime;
      perfSec = ts.performanceTime / 1000;
    } else {
      audioSec = this.ctx.currentTime - (this.ctx.outputLatency || this.ctx.baseLatency || 0);
      perfSec = perfNowMs / 1000;
    }
    const estimate = audioSec - perfSec;
    if (Number.isNaN(this.offset) || Math.abs(estimate - this.offset) > 0.05) this.offset = estimate;
    else this.offset += (estimate - this.offset) * 0.05;
  }

  /** Song time at a performance.now() timestamp (e.g. a key event). */
  timeAt(perfMs: number): number {
    if (Number.isNaN(this.offset)) return -Infinity;
    return perfMs / 1000 + this.offset - this.startCtxTime - this.userOffset;
  }

  /** Monotonic song time for the current frame. */
  now(perfNowMs: number): number {
    const t = this.timeAt(perfNowMs);
    if (t > this.last) this.last = t;
    return this.last;
  }

  /** Reset monotonic guard after pause/resume. */
  resync(): void {
    this.offset = NaN;
  }
}
