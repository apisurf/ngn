// The canvas is the home page, and it is part of the frame (see
// ~/components/shell), so the page itself is empty: no layer is open over it.

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: () => null,
});
