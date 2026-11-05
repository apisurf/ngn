// The top bar's settings: what is a preference rather than something to look
// at — the theme — and where the file being read lives, kept here so the frame
// names it once.

import { getRouteApi } from "@tanstack/react-router";
import * as React from "react";
import { css, cx } from "styled-system/css";
import { formatBytes } from "~/lib/format";
import type { ThemePref } from "~/lib/prefs";
import { usePrefs } from "~/lib/prefs";
import { IconSettings } from "./icons";
import { CopyButton, IconButton, mono, Segmented, Toggle } from "./primitives";

const root = getRouteApi("__root__");

/** Open and closed by its button, and by whatever else in the top bar points at it. */
export function SettingsMenu({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: (open: boolean | ((was: boolean) => boolean)) => void;
}) {
  const ws = root.useLoaderData();
  const { prefs, set } = usePrefs();
  const box = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen]);

  return (
    <div ref={box} className={css({ position: "relative" })}>
      <IconButton
        label="Settings"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
      >
        <IconSettings />
      </IconButton>
      {open ? (
        <div
          role="dialog"
          aria-label="Settings"
          className={css({
            position: "absolute",
            right: "0",
            top: "calc(100% + 6px)",
            zIndex: "20",
            w: "340px",
            p: "3",
            display: "flex",
            flexDir: "column",
            gap: "3",
            bg: "raised",
            border: "1px solid",
            borderColor: "line",
            rounded: "lg",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.12)",
            fontSize: "12px",
          })}
        >
          <Field label="Theme">
            <Segmented<ThemePref>
              items={[
                { id: "system", label: "System" },
                { id: "light", label: "Light" },
                { id: "dark", label: "Dark" },
              ]}
              value={prefs.theme}
              onSelect={(theme) => set("theme", theme)}
            />
          </Field>
          <Field label="Pages">
            <Toggle
              checked={prefs.tabs}
              onChange={(on) => set("tabs", on)}
              label="Keep pages open as tabs"
            />
          </Field>
          <Field label="Database">
            <span className={cx(mono, css({ wordBreak: "break-all", color: "fg" }))}>
              {ws.path}
            </span>
            <span
              className={css({ display: "flex", alignItems: "center", gap: "2", color: "muted" })}
            >
              {formatBytes(ws.bytes)}, opened read-only
              <span className={css({ ml: "auto" })}>
                <CopyButton text={ws.path} label="Copy path" />
              </span>
            </span>
          </Field>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={css({ display: "flex", flexDir: "column", gap: "1.5" })}>
      <span className={css({ color: "muted", fontWeight: "600", fontSize: "11px" })}>{label}</span>
      {children}
    </div>
  );
}
