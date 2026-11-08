/**
 * A task's schedule, whatever kind it is: something the scheduler can stop,
 * and ask when the task runs next.
 */
export interface Schedule {
  /** When the next scheduled run is due, epoch ms; null when nothing is planned. */
  nextAt(): number | null;
  stop(): Promise<void>;
}
