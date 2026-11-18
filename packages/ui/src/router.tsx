import type { ParsedLocation } from "@tanstack/react-router";
import { createRouter } from "@tanstack/react-router";
import { NotFound, RouteError } from "~/components/states";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createRouter({
    routeTree,
    defaultPreload: "intent",
    // Loaders read a local file: a preload is a millisecond, and a stale one is
    // exactly what Follow exists to avoid.
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
    defaultNotFoundComponent: NotFound,
    defaultErrorComponent: RouteError,
    // Opening a page flies it in over the open one; going back up the crumbs
    // flies the open page out (see canvas/layers.tsx and globals.css).
    // Changing a page's own filter or tab does not animate.
    defaultViewTransition: { types: layerTransition },
  });
}

/**
 * How the layers animate when the open page changes: "down" when the new page
 * flies in over the open one (deeper, or a page at the same depth), "up" when
 * the open page flies out to a shallower one. False, so no animation, when
 * only the open page's own filters or tabs changed.
 */
export function layerTransition({
  fromLocation,
  toLocation,
  pathChanged,
}: {
  fromLocation?: ParsedLocation;
  toLocation: ParsedLocation;
  pathChanged: boolean;
}): string[] | false {
  if (!fromLocation || !pathChanged) return false;
  return depthOf(toLocation.pathname) < depthOf(fromLocation.pathname) ? ["up"] : ["down"];
}

/**
 * How many crumbs down a path is: a task or a page, then a run. Only used to
 * tell up from down.
 */
export function depthOf(pathname: string): number {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return 0;
  if (/^\/tasks\/[^/]+\/runs\/[^/]+$/.test(path)) return 2;
  return 1;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
