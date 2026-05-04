import { createHash } from "node:crypto";
import invariant from "tiny-invariant";
import { FsNodeFileDescriptor } from "ngn-os";
import { EntryBase } from "./entryBase.js";
import { LiveSourceParams, OnTaskCodeLoaded } from "./types.js";

export class EntryLiveSource implements EntryBase {
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
    options: LiveSourceParams,
    config: {
      onTaskCodeLoaded?: OnTaskCodeLoaded;
    }
  ) {
    invariant(options.livePath, "Live task path not provided");
    invariant(options.code, "Code not provided");

    this._code = options.code;
    this.paths = {
      compiled: options.livePath,
      source: options.livePath,
      relativeEntry: "",
      relativeParent: "",
    };
    // Placeholder values for live source (not file-based)
    this._fileDescriptor = {
      type: "file",
      path: {
        absolute: options.livePath,
        relative: options.livePath,
        parent: {
          absolute: "",
          relative: "",
        },
      },
      ext: ".ts",
      filename: options.livePath,
      filenameNoExt: options.livePath.replace(/\.[^.]+$/, ""),
    };
    this._tasksRootDir = "";
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

    this.codeMd5Hash = createHash("md5").update(this.code).digest("hex");
    console.log(
      `Loading live task from: ${this.paths.compiled}, hash: ${this.codeMd5Hash}`
    );
    console.log("Code hash:", this.codeMd5Hash);

    this.onTaskCodeLoaded?.(this.codeMd5Hash);
    return this.codeMd5Hash;
  }

  isLoaded() {
    return Boolean(this.code && this.codeMd5Hash);
  }
}

