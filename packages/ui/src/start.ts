// The app's server-side entry: one request middleware, ahead of every page and
// every server function, that refuses a request addressed to anything but a
// loopback name. See ./server/guard.ts for why the Host header is the check.

import { createMiddleware, createStart } from "@tanstack/react-start";
import { isLoopbackHost } from "./server/loopback";

const loopbackOnly = createMiddleware({ type: "request" }).server(({ next, request }) => {
  if (!isLoopbackHost(request.headers.get("host"))) {
    throw new Response("ngnui only answers to 127.0.0.1 and localhost.\n", {
      status: 403,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  return next();
});

export const startInstance = createStart(() => ({
  requestMiddleware: [loopbackOnly],
}));
