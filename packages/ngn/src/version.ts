// Single source for the version string. Read from the manifest rather than
// duplicated in code, so a release bump cannot leave the CLI reporting a
// version it is not.
export const VERSION: string = require("../package.json").version;
