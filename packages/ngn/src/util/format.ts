/**
 * Terminal output for query results.
 *
 * The table is deliberately border-free: columns padded to width with a single
 * rule under the header. It stays readable when piped through `less`, and
 * copies cleanly into an issue.
 */

export type Row = Record<string, unknown>;

export interface TableOptions {
  /** Cells longer than this are elided with `…`. 0 disables truncation. */
  maxColumnWidth?: number;
}

const NULL_CELL = "—";

/** Render one SQLite value as a display string. */
export function cell(value: unknown): string {
  if (value === null || value === undefined) return NULL_CELL;
  if (value instanceof Uint8Array) return `<blob ${value.byteLength} B>`;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") {
    // Keep floats readable without lying about integers.
    return Number.isInteger(value)
      ? String(value)
      : String(Number(value.toFixed(3)));
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Right-align numeric columns; everything else reads better left-aligned. */
function isNumericColumn(rows: Row[], key: string): boolean {
  let seen = false;
  for (const row of rows) {
    const value = row[key];
    if (value === null || value === undefined) continue;
    if (typeof value !== "number" && typeof value !== "bigint") return false;
    seen = true;
  }
  return seen;
}

function truncate(text: string, max: number): string {
  if (max <= 0 || text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 1))}…`;
}

const pad = (text: string, width: number, right: boolean): string =>
  right ? text.padStart(width) : text.padEnd(width);

export function renderTable(
  rows: Row[],
  columns: string[],
  options: TableOptions = {}
): string {
  if (rows.length === 0) return "";

  const max = options.maxColumnWidth ?? 60;
  const numeric = new Set(columns.filter((c) => isNumericColumn(rows, c)));

  const cells = rows.map((row) =>
    columns.map((c) => truncate(cell(row[c]), max))
  );
  const widths = columns.map((c, i) =>
    Math.max(c.length, ...cells.map((r) => (r[i] ?? "").length))
  );

  const lines: string[] = [];
  lines.push(
    columns
      .map((c, i) => pad(c, widths[i] ?? 0, numeric.has(c)))
      .join("  ")
      .trimEnd()
  );
  lines.push(widths.map((w) => "─".repeat(w)).join("  "));
  for (const row of cells) {
    lines.push(
      row
        .map((v, i) => pad(v, widths[i] ?? 0, numeric.has(columns[i] ?? "")))
        .join("  ")
        .trimEnd()
    );
  }
  return lines.join("\n");
}

export function renderCsv(rows: Row[], columns: string[]): string {
  if (rows.length === 0) return "";
  const escape = (value: unknown): string => {
    const text = value === null || value === undefined ? "" : cell(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [
    columns.join(","),
    ...rows.map((row) => columns.map((c) => escape(row[c])).join(",")),
  ].join("\n");
}

export function renderJson(rows: Row[]): string {
  return JSON.stringify(
    rows,
    (_key, value) =>
      value instanceof Uint8Array ? `<blob ${value.byteLength} B>` : value,
    2
  );
}

export function formatMs(ms: number): string {
  return ms < 1 ? `${ms.toFixed(2)} ms` : `${ms.toFixed(1)} ms`;
}
