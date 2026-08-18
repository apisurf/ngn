import { LiveSourceParams, DbSourceParams, EntryParams } from "./types.js";

export function isLiveSourceParams(params: EntryParams): params is LiveSourceParams {
  return "livePath" in params && "code" in params;
}

export function isDbSourceParams(params: EntryParams): params is DbSourceParams {
  return "compiledCode" in params && "descriptor" in params;
}
