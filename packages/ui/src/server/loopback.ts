// The Host check on its own, with no Node imports: the request middleware in
// ../start.ts is part of an isomorphic module, so what it imports must load in
// a browser too. Everything else about the guard is in ./guard.ts.

const LOOPBACK = /^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i;

/** True for `127.0.0.1:3000`, `localhost`, `[::1]:4000`. */
export function isLoopbackHost(host: string | null | undefined): boolean {
  return Boolean(host && LOOPBACK.test(host));
}
