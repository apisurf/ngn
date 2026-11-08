import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import type { LockService } from "../db/services/lock.js";
import { TaskLease } from "./lease.js";
import { RESERVED_LOCK_PREFIX } from "./locks.js";

/**
 * Each `ngn run` holds a presence lease on its database, so a start can tell
 * "ngn was not running" (interval tasks start afresh) from "another ngn run is
 * here" (it keeps their schedules). A lease left by a process that died is
 * cleared: at once when the process ran on this machine and is gone, otherwise
 * once it expires.
 */
const PRESENCE_PREFIX = `${RESERVED_LOCK_PREFIX}process:`;

/** How long a dead process looks present, when it ran on another machine. */
export const PRESENCE_TTL_MS = 15_000;

/** Whether the presence lease `name` belongs to a process on this machine that has ended. */
function isGoneHere(name: string): boolean {
  const [host, pid] = name.slice(PRESENCE_PREFIX.length).split(":");
  if (host !== hostname() || !pid) return false;
  try {
    process.kill(Number(pid), 0);
    return false;
  } catch (error) {
    // EPERM: it is there, run by someone else.
    return (error as NodeJS.ErrnoException).code === "ESRCH";
  }
}

/**
 * Take this process's presence lease, clearing leases left by dead processes.
 * `joined` is true when another ngn run was already present.
 */
export async function enterPresence(
  locks: LockService,
  ttlMs = PRESENCE_TTL_MS,
): Promise<{ lease: TaskLease | null; joined: boolean }> {
  const name = `${PRESENCE_PREFIX}${hostname()}:${process.pid}:${randomUUID()}`;
  // Taken before looking, so two processes starting together both see the other.
  const lease = await TaskLease.hold(locks, name, { ttlMs });
  const now = Date.now();
  let joined = false;
  for (const other of await locks.list(PRESENCE_PREFIX)) {
    if (other.name === name) continue;
    if (other.expiresAt <= now || isGoneHere(other.name)) await locks.remove(other.name);
    else joined = true;
  }
  return { lease, joined };
}
