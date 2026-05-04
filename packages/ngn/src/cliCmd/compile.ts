import { Compiler } from "ngn-core";
import { getRunConfig } from "../config";
import { isAbsolute } from "node:path";

/**
 * Compile command - validates that all tasks can be compiled successfully.
 * Note: Tasks are now compiled on-the-fly and stored in the database,
 * so this command is mainly useful for validation/debugging.
 */
export const compile = async (options: { root?: string; match?: string }) => {
  const rootDirAbs =
    options.root && isAbsolute(options.root) ? options.root : process.cwd();
  const config = await getRunConfig(rootDirAbs, options.match);

  try {
    const compiler = new Compiler({
      minify: false,
      silent: true,
    });
    const result = await compiler.compile(config.sourcePaths);

    for (const [sourcePath, compiledCode] of result.compiled.entries()) {
      console.log(`${sourcePath}\n\n ${compiledCode}`);
    }

    console.log(`\n\nSuccessfully compiled ${result.compiled.size} task(s).`);
  } catch (error) {
    console.error("Error compiling tasks.");
    console.error(error);
  }
};
