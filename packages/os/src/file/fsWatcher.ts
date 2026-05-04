import { isAbsolute } from "node:path";
import { watch, FSWatcher } from "chokidar";
import invariant from "tiny-invariant";
import { isDirectory } from "./read.js";

interface FsWatcher {
  watch(): Promise<void>;
  unwatch(): Promise<void>;
  onAdd: (path: string) => void;
  onUnlink: (path: string) => void;
  onChange: (path: string) => void;
}

export class FsDirWatcher implements FsWatcher {
  dirPath: string;
  extensions: Array<string>;
  watcher: FSWatcher | undefined;
  onAdd: (path: string) => void;
  onUnlink: (path: string) => void;
  onChange: (path: string) => void;

  constructor({
    dirPath,
    extensions,
    onAdd,
    onUnlink,
    onChange,
  }: {
    dirPath: string;
    // file extensions to watch; example ['.ts', '.js']
    extensions: Array<string>;
    onAdd: (path: string) => void;
    onUnlink: (path: string) => void;
    onChange: (path: string) => void;
  }) {
    invariant(isAbsolute(dirPath), "dirPath must be absolute path");
    this.dirPath = dirPath;
    this.extensions = extensions;
    this.onAdd = onAdd;
    this.onUnlink = onUnlink;
    this.onChange = onChange;
  }

  async watch() {
    const isDir = await isDirectory(this.dirPath);
    invariant(isDir, "dirPath must be a directory");

    this.watcher = watch(this.dirPath, {
      ignored: "*.env",
    }).on("all", (event, path) => {
      if (event === "add") {
        this.onAdd(path);
      }
      if (event === "unlink") {
        this.onUnlink(path);
      }
      if (event === "change") {
        this.onChange(path);
      }
    });
  }

  async unwatch() {
    if (!this.watcher) {
      return;
    }

    await this.watcher.close();
  }
}

// export class FsFileWatcher implements FsWatcher {
//   filePath: string;
//   watcher: FSWatcher | undefined;
//   onAdd: (path: string) => void;
//   onUnlink: (path: string) => void;
//   onChange: (path: string) => void;

//   constructor({
//     filePath,
//     onAdd,
//     onUnlink,
//     onChange,
//   }: {
//     filePath: string;
//     onAdd: (path: string) => void;
//     onUnlink: (path: string) => void;
//     onChange: (path: string) => void;
//   }) {
//     invariant(isAbsolute(filePath), "dirPath must be absolute path");
//     this.filePath = filePath;
//     this.onAdd = onAdd;
//     this.onUnlink = onUnlink;
//     this.onChange = onChange;
//   }

//   async watch() {
//     const workingWithFile = await isFile(this.filePath);
//     invariant(workingWithFile, "filePath must be a file");

//     this.watcher = watch(this.filePath).on("all", (event, path) => {
//       if (event === "add") {
//         this.onAdd(path);
//       }
//       if (event === "unlink") {
//         this.onUnlink(path);
//       }
//       if (event === "change") {
//         this.onChange(path);
//       }
//     });
//   }

//   async unwatch() {
//     if (!this.watcher) {
//       return;
//     }

//     await this.watcher.close();
//   }
// }
