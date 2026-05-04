interface FsNodePath {
  absolute: string;
  relative: string;
  parent: {
    absolute: string;
    relative: string;
  };
}

export interface FsNodeFileDescriptor {
  type: "file";
  path: FsNodePath;
  ext: string;
  filename: string;
  filenameNoExt: string;
}

export type FsNodeDescriptor = FsNodeFileDescriptor;
