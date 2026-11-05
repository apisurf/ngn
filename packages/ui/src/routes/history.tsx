// The page that is now Runs, under its old name: a bookmark or a remembered tab
// lands on the same view, filters and all. `show` was the status filter, with
// the stored words; Runs takes the filter language `ngn runs` takes.

import { createFileRoute, redirect } from "@tanstack/react-router";

const STATUS: Record<string, string> = { failure: "failed", skipped: "skipped", open: "running" };

export const Route = createFileRoute("/history")({
  beforeLoad: ({ search }) => {
    const old = search as Record<string, unknown>;
    const q = [
      typeof old.q === "string" ? old.q : "",
      typeof old.show === "string" && STATUS[old.show] ? `status:${STATUS[old.show]}` : "",
      old.hideLive === true ? "origin:scheduled" : "",
    ]
      .filter(Boolean)
      .join(" ");
    throw redirect({ to: "/runs", search: { q: q || undefined }, replace: true });
  },
});
