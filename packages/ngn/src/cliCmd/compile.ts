import { Compiler } from "@apisurf/ngn-core";
import { getCwd } from "@apisurf/ngn-os";
import { getRunConfig } from "../config.js";

/**
 * Compile command - validates that all tasks can be compiled successfully.
 * Note: Tasks are now compiled on-the-fly and stored in the database,
 * so this command is mainly useful for validation/debugging.
 */
export const compile = async (options: { root?: string; match?: string }) => {
  const rootDirAbs = getCwd(process.cwd(), options.root);
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

    console.log(`\ncompiled ${result.compiled.size} task(s)`);
  } catch (error) {
    console.error(`ngn: ${error instanceof Error ? error.stack : String(error)}`);
    process.exitCode = 1;
  }
};
