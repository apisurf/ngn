import { isAbsolute } from "node:path";
import invariant from "tiny-invariant";
import { runApi } from "ngn-api";
import { handleSigInt, handleSigTerm } from "ngn-os";
import { setupDbClient, getDbClient } from "ngn-core";
import { getRunConfig } from "../config";

export const http = async (options: { root?: string; match?: string }) => {
  const rootDirAbs =
    options.root && isAbsolute(options.root) ? options.root : process.cwd();

  const config = await getRunConfig(rootDirAbs, options.match);
  let apiServer: Awaited<ReturnType<typeof runApi>>;

  try {
    await setupDbClient(config.configFileOptions.dbPath);
    const dbClient = getDbClient();
    invariant(dbClient, "DB client not initialized");

    apiServer = await runApi({
      dbClient,
      port: 8787,
    });
  } catch (error) {
    console.error("Error starting API.");
    console.error(error);
  }

  handleSigInt(async () => {
    apiServer?.close();
    process.exit(0);
  });
  handleSigTerm(async () => {
    apiServer?.close();
    process.exit(0);
  });
};
