// Every 20 seconds, failing on purpose. Try `ngn status` and `ngn show <run>`.
export const timing = "*/20 * * * * *";

export const task = async () => {
  throw new Error("something went wrong");
};
