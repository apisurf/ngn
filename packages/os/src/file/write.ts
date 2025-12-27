import { writeFile } from "node:fs/promises";

export async function writeFileAsUtf8(path: string, content: string) {
  try {
    await writeFile(path, content, "utf-8");
  } catch (error) {
    console.error(`Error writing file at ${path}`);
    console.error(error);
  }
}
