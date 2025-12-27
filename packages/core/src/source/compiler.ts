import { builtinModules } from "node:module";
import { readFileSync } from "node:fs";
import invariant from "tiny-invariant";
import * as esbuild from "esbuild";

type CompilerOptions = {
  /** Minify output */
  minify?: boolean;
  /** Generate sourcemaps */
  sourcemap?: boolean;
  /** Suppress output */
  silent?: boolean;
  /** Path to package.json for resolving externals */
  packageJsonPath?: string;
  /** Patterns to NOT externalize (will be bundled) */
  noExternal?: (string | RegExp)[];
};

export class Compiler {
  private options: CompilerOptions;
  private externals: string[];

  constructor(options: CompilerOptions = {}) {
    this.options = {
      minify: options.minify ?? false,
      sourcemap: options.sourcemap ?? false,
      silent: options.silent ?? true,
      packageJsonPath: options.packageJsonPath,
      noExternal: options.noExternal ?? [/op3-(.*)/, /@op3\/(.*)/],
    };

    // Build externals list
    this.externals = this.buildExternals();
  }

  /**
   * Builds the list of externals to be used by esbuild.
   * This is used in place of tsup which does this by default.
   * Enables us to define external and internal dependencies that need to be bundled.
   * @returns List of externals that should not be bundled by esbuild
   */
  private buildExternals(): string[] {
    const externals: string[] = [];

    // Add Node.js built-in modules
    externals.push(...builtinModules);
    externals.push(...builtinModules.map((m) => `node:${m}`));

    // Read package.json if path provided
    if (this.options.packageJsonPath) {
      try {
        const pkg = JSON.parse(
          readFileSync(this.options.packageJsonPath, "utf-8")
        );
        const deps = [
          ...Object.keys(pkg.dependencies || {}),
          ...Object.keys(pkg.peerDependencies || {}),
        ];

        // Filter out noExternal patterns
        const noExternalPatterns = this.options.noExternal || [];
        const filteredDeps = deps.filter((dep) => {
          return !noExternalPatterns.some((pattern) => {
            if (typeof pattern === "string") {
              return dep === pattern;
            }
            return pattern.test(dep);
          });
        });

        externals.push(...filteredDeps);
      } catch {
        // Silently ignore if package.json can't be read
      }
    }

    return externals;
  }

  /**
   * Compile entry files to in-memory strings (no disk I/O)
   * @param entry - Array of input paths
   * @returns Map of input file path to compiled code string
   */
  async compile(entry: string[]): Promise<{
    compiled: Map<string, string>;
  }> {
    invariant(entry, "Entry file(s) not provided");

    const compiled = new Map<string, string>();

    for (const entryFile of entry) {
      const result = await esbuild.build({
        entryPoints: [entryFile],
        bundle: true,
        write: false,
        format: "cjs",
        platform: "node",
        target: "node20",
        minify: this.options.minify,
        sourcemap: this.options.sourcemap ? "inline" : false,
        external: this.externals,
        logLevel: this.options.silent ? "silent" : "info",
      });

      compiled.set(entryFile, result.outputFiles[0].text);
    }

    return {
      compiled,
    };
  }

  /**
   * Compile source code from memory (no disk I/O required)
   * @param sourceCode - The source code string to compile
   * @param virtualPath - A virtual file path for the source (used for resolve directory and loader detection)
   * @returns The compiled code string
   */
  async compileFromSource(
    sourceCode: string,
    virtualPath: string
  ): Promise<string> {
    invariant(sourceCode, "Source code not provided");
    invariant(virtualPath, "Virtual path not provided");

    // Determine loader from file extension
    const ext = virtualPath.split(".").pop()?.toLowerCase();
    const loader: esbuild.Loader =
      ext === "ts"
        ? "ts"
        : ext === "tsx"
        ? "tsx"
        : ext === "jsx"
        ? "jsx"
        : "js";

    const result = await esbuild.build({
      stdin: {
        contents: sourceCode,
        resolveDir: process.cwd(),
        sourcefile: virtualPath,
        loader,
      },
      bundle: true,
      write: false,
      format: "cjs",
      platform: "node",
      target: "node20",
      minify: this.options.minify,
      sourcemap: this.options.sourcemap ? "inline" : false,
      external: this.externals,
      logLevel: this.options.silent ? "silent" : "info",
    });

    return result.outputFiles[0].text;
  }
}
