function shutdown() {
  setTimeout(() => {
    console.log("Process exiting now");
    process.exit(0);
  }, 0);
}

type CleanupCallback = () => Promise<void> | void;

export const handleSigInt = (cleanupCb: CleanupCallback) => {
  process.on("SIGINT", async () => {
    try {
      await cleanupCb();
    } catch (err) {
      console.error(err);
    } finally {
      shutdown();
    }
  });
};

export const handleSigTerm = (cleanupCb: CleanupCallback) => {
  process.on("SIGTERM", async () => {
    try {
      await cleanupCb();
    } catch (err) {
      console.error(err);
    } finally {
      shutdown();
    }
  });
};
