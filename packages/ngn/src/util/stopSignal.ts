import { STOP_GRACE_MS } from "@apisurf/ngn-core";

/**
 * Ctrl-C and SIGTERM for a command that schedules: the first stops starting
 * runs and gives the ones in progress time to end (`stop`), then exits; a
 * second exits at once, leaving whatever is still going for the next
 * `ngn run` to recover.
 */
export function onStopSignal(stop: () => Promise<void>) {
  let stopping = false;
  const handle = () => {
    if (stopping) {
      console.error("ngn: stopped at once; the next ngn run recovers what was still going");
      process.exit(130);
    }
    stopping = true;
    console.error(
      `ngn: stopping — waiting up to ${STOP_GRACE_MS / 1000} s for runs in progress (Ctrl-C again to exit now)`,
    );
    stop()
      .catch((error: unknown) => console.error(error))
      .finally(() => process.exit(0));
  };
  process.on("SIGINT", handle);
  process.on("SIGTERM", handle);
}
