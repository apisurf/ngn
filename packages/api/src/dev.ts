import { getConfig } from "./config.js";
import { runApi } from "./api.js";

const dbPath = process.env.OP3_API_DB_PATH || ":memory:";
const port = Number(process.env.OP3_API_PORT) || 8787;

const apiConfig = getConfig({
  dbPath,
  port,
});

runApi(apiConfig).catch((error) => {
  console.error("Error running the application:", error);
  process.exit(1);
});
