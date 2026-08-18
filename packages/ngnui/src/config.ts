/**
 * Where the client's data comes from.
 *
 * A relative path, because the server that hands out this page is the same one
 * that answers for it — one process, one origin, nothing to configure. In
 * development the Vite proxy maps the same path onto `pnpm dev:server`, so the
 * client never needs to know which mode it is running in.
 */
export const NGN_API_URL = "/api";
