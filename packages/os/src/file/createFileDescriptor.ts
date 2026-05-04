import { join, basename, dirname } from "node:path";
import { getFilenameExtLong } from "./path.js";
import { FsNodeFileDescriptor } from "./types/FsNodeDescriptor.js";

export function createFileDescriptor({
  path: fileRelativePath,
  rootDir,
}: {
  path: string;
  rootDir: string;
}): FsNodeFileDescriptor {
  const absolutePath = join(rootDir, fileRelativePath);
  const relativePath = fileRelativePath;
  const filename = basename(fileRelativePath);
  const ext = getFilenameExtLong(relativePath);
  const filenameNoExt = basename(fileRelativePath, ext);
  const parentAbsolutePath = dirname(absolutePath);
  const parentRelativePath = dirname(relativePath);

  return {
    type: "file",
    path: {
      absolute: absolutePath,
      relative: relativePath,
      parent: {
        absolute: parentAbsolutePath,
        relative: parentRelativePath,
      },
    },
    ext,
    filename,
    filenameNoExt,
  };
}
