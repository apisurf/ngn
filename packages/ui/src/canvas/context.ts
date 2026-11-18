// What a node can ask the canvas to do: open a page as a layer over it.

import * as React from "react";

export interface CanvasActions {
  /** Open a page as a layer over the canvas. */
  open: (href: string) => void;
}

export const CanvasActionsContext = React.createContext<CanvasActions>({
  open: () => {},
});

export function useCanvasActions(): CanvasActions {
  return React.useContext(CanvasActionsContext);
}
