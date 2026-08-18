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
  const res = await post("/live", body);

  // The viewer forwards this route to a running `ngn` and answers with an
  // error object when there is none. That is a failure of the environment, not
  // a result of the code, so it is raised rather than rendered as output.
  if (res && typeof res === "object" && "error" in res) {
    throw new Error(res.detail ? `${res.error}: ${res.detail}` : res.error);
  }

  return res;
};
