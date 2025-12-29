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

// Build globals by evaluating each property on globalThis (preserves correct `this` binding for getters)
// createContext expects a plain object, so we need to convert the entries to an object
const unrestrictedGlobals = Object.fromEntries([
  // add common default globals
  ...Object.entries(commonDefaultGlobals),
  // add all properties from globalThis
  // TODO: check if this can lead to the global namespace pollution(i.e. overriding existing properties)
  ...Object.getOwnPropertyNames(globalThis).map((key) => [
    key,
    (globalThis as any)[key],
  ]),
]);

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
