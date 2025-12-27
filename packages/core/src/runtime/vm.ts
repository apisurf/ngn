import { createRequire } from "node:module";
import { Script, createContext } from "node:vm";

const commonDefaultGlobals = {
  // for CJS exports coming from the user script
  module: { exports: {} },
  exports: {},
};

// const restrictedGlobals = {
//   ...commonDefaultGlobals,
// };

const unrestrictedGlobals = {
  ...global,
  ...commonDefaultGlobals,
};

// function executeInRestrictedContext(code: string, contextExtension?: any) {
//   // last line of code is the return statement; used to collect module exports
//   const returnStatement = `module.exports`;
//   const script = new vm.Script(`${code};${returnStatement};`);
//   const sandbox = vm.createContext({
//     ...restrictedGlobals,
//     ...contextExtension,
//   });
//   return script.runInContext(sandbox);
// }

export function executeUnrestricted(code: string, customGlobals?: any) {
  const requireResolutionRoot = `${process.cwd()}/`;
  // last line of code is the return statement; used to collect module exports(as return value)
  const returnStatement = `module.exports`;
  const script = new Script(`${code};\n${returnStatement};`);
  const sandbox = createContext({
    ...unrestrictedGlobals,
    ...customGlobals,
    console,
    require: createRequire(requireResolutionRoot),
  });
  return script.runInContext(sandbox);
}
