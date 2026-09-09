// Single source for the version string. Read from the manifest rather than
// duplicated in code, so a release bump cannot leave the CLI reporting a
// version it is not.
//
// createRequire rather than a bare require: this package is ESM. The path is
// relative to the built file in dist/, which sits one level below the
// manifest — and npm ships package.json with every tarball.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export const VERSION: string = require("../package.json").version;
