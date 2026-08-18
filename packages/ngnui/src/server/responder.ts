import type { Context } from "hono";

const entityTypes = {
  FILE_TASK: "file_task",
  TASK_RUN: "task_run",
  LOG: "log",
  TIMING: "timing",
  KV: "kv",
  FILE_TASK_VERSION: "file_task_version",
} as const;

type EntityType = (typeof entityTypes)[keyof typeof entityTypes];

export const responder = (c: Context) => {
  const notFound = (entityType: EntityType) => {
    return c.json({ error: `${entityType} not found` }, 404);
  };

  const badRequest = (message: string) => {
    return c.json({ error: message }, 400);
  };

  const one = (entityType: EntityType, data: unknown) => {
    if (!data) {
      return c.json({ error: "Record not found" }, 404);
    }

    return c.json({
      type: entityType,
      item: data,
    });
  };

  const list = (entityType: EntityType, data: unknown[]) => {
    if (!data || data.length === 0) {
      return c.json({ type: entityType, items: [] });
    }
    return c.json({
      type: entityType,
      items: data,
    });
  };

  return {
    notFound,
    badRequest,
    one,
    list,
  };
};
