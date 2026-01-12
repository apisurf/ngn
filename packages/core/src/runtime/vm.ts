/**
 * Execute ESM code using dynamic import with data URLs
 * This allows running ESM modules in-memory without writing to disk
 */
export async function executeUnrestricted(
  code: string,
  customGlobals?: any
): Promise<any> {
  // Inject custom globals into the code if provided
  let modifiedCode = code;
  if (customGlobals) {
    const globalsInjection = Object.entries(customGlobals)
      .map(([key, value]) => {
        // Convert the value to a string representation
        const valueStr =
          typeof value === "function"
            ? value.toString()
            : JSON.stringify(value);
        return `globalThis.${key} = ${valueStr};`;
      })
      .join("\n");
    modifiedCode = `${globalsInjection}\n${code}`;
  }

  // Create a data URL for the ESM module
  const dataUrl = `data:text/javascript;base64,${Buffer.from(modifiedCode).toString("base64")}`;

  // Use dynamic import to load and execute the ESM module
  // Add cache busting to ensure fresh imports
  const moduleUrl = `${dataUrl}#${Date.now()}`;
  const moduleExports = await import(moduleUrl);

  return moduleExports;
}
