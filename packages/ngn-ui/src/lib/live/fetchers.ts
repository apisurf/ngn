import { z } from "zod";
import { post } from "../api";

const liveTaskSchema = z.object({
  code: z.string(),
  language: z.enum(["typescript", "javascript"]),
});

export const executeLiveTask = async ({
  code,
  language,
}: {
  code: string;
  language: "typescript" | "javascript";
}) => {
  const body = liveTaskSchema.parse({ code, language });
  const res = await post(`/live`, body);

  return res;
};
