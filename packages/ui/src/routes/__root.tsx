/// <reference types="vite/client" />
import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import type * as React from "react";
import { Shell } from "~/components/shell";
import { NotFound, RouteError } from "~/components/states";
import { PrefsProvider, THEME_BOOT_SCRIPT } from "~/lib/prefs";
import { TabsProvider } from "~/lib/tabs";
import { getWorkspace } from "~/server/api";
import appCss from "~/styles/globals.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "color-scheme", content: "light dark" },
      { title: "ngnui" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
    ],
  }),
  // The frame — sidebar, tabs, status bar — is part of every
  // page, so what it draws is loaded once, here, and re-read on refresh/Live.
  loader: () => getWorkspace(),
  // Loader data is always re-read: this is a viewer over a file that changes.
  staleTime: 0,
  // Only reached when the frame's own loader failed, so it renders without the
  // frame. A page's error renders inside it, through the router's default.
  errorComponent: RouteError,
  notFoundComponent: NotFound,
  component: RootLayout,
  shellComponent: RootDocument,
});

function RootLayout() {
  return (
    <Frame>
      <Outlet />
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <PrefsProvider>
      <TabsProvider>
        <Shell>{children}</Shell>
      </TabsProvider>
    </PrefsProvider>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    // The theme attribute is set by the boot script before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* oxlint-disable-next-line react/no-danger -- a constant, not user input */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
