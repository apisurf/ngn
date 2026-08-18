import { createHash } from "node:crypto";
import invariant from "tiny-invariant";
import { FsNodeFileDescriptor } from "@apisurf/ngn-os";
import { EntryBase } from "./entryBase.js";
import { DbSourceParams, OnTaskCodeLoaded } from "./types.js";

export class EntryDbSource implements EntryBase {
  private _code: string;
  private codeMd5Hash: string | null = null;
  private onTaskCodeLoaded: OnTaskCodeLoaded | undefined;
  private paths: {
    source: string;
    compiled: string;
    relativeEntry: string;
    relativeParent: string;
  };
  private _fileDescriptor: FsNodeFileDescriptor;
  private _tasksRootDir: string;

  constructor(
    options: DbSourceParams,
    config: {
      onTaskCodeLoaded?: OnTaskCodeLoaded;
    }
  ) {
    invariant(options.compiledCode, "Compiled code not provided");
    invariant(options.descriptor, "File descriptor not provided");
    invariant(options.tasksRootDir, "Tasks root directory not provided");

    this._code = options.compiledCode;
    this._fileDescriptor = options.descriptor;
    this._tasksRootDir = options.tasksRootDir;
    this.paths = {
      // Source path is the original TypeScript file
      source: options.descriptor.path.absolute,
      // Compiled path is no longer a file path - we use the relative entry as identifier
      compiled: options.descriptor.path.relative,
      relativeEntry: options.descriptor.path.relative,
      relativeParent: options.descriptor.path.parent.relative,
    };
    this.onTaskCodeLoaded = config.onTaskCodeLoaded;
  }

  get path() {
    return this.paths;
  }

  get fileDescriptor() {
    return this._fileDescriptor;
  }

  get tasksRootDir() {
    return this._tasksRootDir;
  }

  get codeHash() {
    return this.codeMd5Hash;
  }

  get code() {
    return this._code;
  }

  async load() {
    if (this.isLoaded()) {
      return this.codeMd5Hash!;
    }

    this.codeMd5Hash = createHash("md5").update(this._code).digest("hex");

    this.onTaskCodeLoaded?.(this.codeMd5Hash);
    return this.codeMd5Hash;
  }

  isLoaded() {
    return Boolean(this._code && this.codeMd5Hash);
  }
}

