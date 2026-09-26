import { createRouter } from "@tanstack/react-router";
import { NotFound, RouteError } from "~/components/states";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createRouter({
    routeTree,
    defaultPreload: "intent",
    // Loaders read a local file: a preload is a millisecond, and a stale one is
    // exactly what Live mode exists to avoid.
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
    defaultNotFoundComponent: NotFound,
    defaultErrorComponent: RouteError,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
