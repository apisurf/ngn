import { Client } from "op3-persistence";
import { FileTaskService } from "./fileTask.js";
import { FileTaskVersionService } from "./fileTaskVersion.js";

export async function registerFileTask(
  dbClient: Client,
  md5Hash: string,
  compiledCode: string,
  paths: {
    relativeEntry: string;
    relativeParent: string;
  }
) {
  const fileTaskVersionService = new FileTaskVersionService(dbClient);
  const fileTaskService = new FileTaskService(dbClient);

  const previousFileTask = await fileTaskService.getByPath(paths.relativeEntry);

  if (!previousFileTask) {
    await fileTaskService.add({
      path: paths.relativeEntry,
      parent_path: paths.relativeParent,
      status: "active",
    });
  } else {
    await fileTaskService.updateStatus(previousFileTask.id, "active");
  }

  const fileTask = await fileTaskService.getByPath(paths.relativeEntry);

  if (!fileTask) {
    throw new Error("Could not create file task in DB.");
  }

  const lastVersionNumber = await fileTaskVersionService.getLastVersion(
    fileTask.id
  );

  if (!lastVersionNumber) {
    // add new version
    await fileTaskVersionService.add({
      file_task_id: fileTask.id,
      md5_hash: md5Hash,
      compiled_code: compiledCode,
      version: 1,
    });
    await fileTaskService.bumpUpdatedAt(fileTask.id);
  } else {
    const lastVersion = await fileTaskVersionService.getByVersion(
      lastVersionNumber,
      fileTask.id
    );

    if (lastVersion!.md5_hash !== md5Hash) {
      const nextVersionNumber = lastVersionNumber + 1;
      // add new version
      await fileTaskVersionService.add({
        version: nextVersionNumber,
        file_task_id: fileTask.id,
        md5_hash: md5Hash,
        compiled_code: compiledCode,
      });
      await fileTaskService.bumpUpdatedAt(fileTask.id);
    }
  }

  const version = await fileTaskVersionService.getByHash(md5Hash, fileTask.id);

  if (!version) {
    throw new Error("Could not create file task version in DB.");
  }

  return {
    fileTaskId: fileTask.id,
    fileVersionId: version.id,
    compiledCode: version.compiled_code,
  };
}
