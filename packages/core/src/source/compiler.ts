import invariant from "tiny-invariant";
import * as esbuild from "esbuild";

type CompilerOptions = {
  /** Minify output */
  minify?: boolean;
  /** Generate sourcemaps */
  sourcemap?: boolean;
  /** Suppress output */
  silent?: boolean;
  /** Patterns to NOT externalize (will be bundled) */
  noExternal?: (string | RegExp)[];
};

export class Compiler {
  private options: CompilerOptions;
  private externalizePlugin: esbuild.Plugin;

  constructor(options: CompilerOptions = {}) {
    this.options = {
      minify: options.minify ?? false,
      sourcemap: options.sourcemap ?? false,
      silent: options.silent ?? true,
      // bundle all ngn packages by default
      noExternal: options.noExternal ?? [/^ngn-(.*)/, /^@apisurf\/(.*)/],
    };

    // Create the externalize plugin
    this.externalizePlugin = this.createExternalizePlugin();
  }

  /**
   * Creates an esbuild plugin that externalizes all bare package imports
   * except for those matching the noExternal patterns.
   * This approach automatically handles all dependencies (including transitive ones)
   * without needing to maintain a list or read package.json.
   *
   * NOTE: There are esbuild config options that can be used to externalize dependencies
   * but they are not as flexible as this plugin. This plugin is more flexible and
   * can be used to externalize dependencies that are not in the package.json(alternative approach).
   * Previous implementations used tsup which did this by default or used a list of
   * dependencies to externalize. This approach externalizes everything dynamically.
   * Problematic dependencies were: playwright, playwright-core, chromium-bidi, etc.
   */
  private createExternalizePlugin(): esbuild.Plugin {
    const noExternalPatterns = this.options.noExternal || [];

    return {
      name: "externalize-deps",
      setup(build) {
        // Match all bare imports (not starting with . or /)
        // This catches: 'playwright', '@scope/package', 'chromium-bidi/lib/...'
        build.onResolve({ filter: /^[^./]/ }, (args) => {
          // Extract the package name from the import path
          // '@scope/pkg/sub' -> '@scope/pkg', 'pkg/sub' -> 'pkg'
          const parts = args.path.split("/");
          const pkgName = args.path.startsWith("@")
            ? `${parts[0]}/${parts[1]}`
            : parts[0];

          // Check if this package should be bundled (not externalized)
          const shouldBundle = noExternalPatterns.some((pattern) => {
            if (typeof pattern === "string") {
              return pkgName === pattern || args.path === pattern;
            }
            return pattern.test(pkgName) || pattern.test(args.path);
          });

          if (shouldBundle) {
            // Let esbuild resolve and bundle it normally
            return null;
          }

          // Mark as external - esbuild won't try to bundle it
          return { path: args.path, external: true };
        });
      },
    };
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
        plugins: [this.externalizePlugin],
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
      plugins: [this.externalizePlugin],
      logLevel: this.options.silent ? "silent" : "info",
    });

    return result.outputFiles[0].text;
  }
}
