import { Script, createContext } from "node:vm";
import { createRequire } from "node:module";

// Build globals dynamically from globalThis
const buildGlobals = () =>
  Object.fromEntries(
    Object.getOwnPropertyNames(globalThis).map((key) => [
      key,
      (globalThis as Record<string, unknown>)[key],
    ])
  );

/**
 * Executes IIFE-compiled code in an isolated VM context.
 * The code should be compiled with esbuild's iife format and globalName: "__exports".
 *
 * @param code - The IIFE code string to execute
 * @returns The module's exports object
 */
export async function executeEsm(
  code: string
): Promise<Record<string, unknown>> {
  const requireResolutionRoot = `${process.cwd()}/`;

  // The compiled IIFE code assigns exports to __exports global
  // We run it in a sandbox and extract the exports
  const script = new Script(`${code}\n__exports;`);

  const sandbox = createContext({
    ...buildGlobals(),
    require: createRequire(requireResolutionRoot),
  });

  return script.runInContext(sandbox);
}
