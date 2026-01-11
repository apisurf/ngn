import { Box } from "@chakra-ui/react";
import { $taskRun } from "ngn-schema";
import { z } from "zod";
import { NotAvailableLabel } from "./notAvailableLabel";

type TaskRunStatus = z.infer<typeof $taskRun>["status"];

const statusStyles: Record<TaskRunStatus, { bg: string; boxShadow: string }> = {
  success: { bg: "green.400", boxShadow: "0 0 8px {colors.green.400}" },
  failure: { bg: "red.400", boxShadow: "0 0 8px {colors.red.400}" },
  running: { bg: "blue.400", boxShadow: "0 0 8px {colors.blue.400}" },
  skipped: { bg: "gray.400", boxShadow: "0 0 8px {colors.gray.400}" },
  pending: {
    bg: "orange.400",
    boxShadow: "0 0 8px {colors.orange.400}",
  },
} as const;

export const TaskRunStatusBlip = ({ status }: { status?: TaskRunStatus }) => {
  if (!status) {
    return <NotAvailableLabel />;
  }

  const styles = statusStyles[status] || {};

  return (
    <Box
      w={2}
      h={2}
      borderRadius="full"
      bg={styles.bg}
      boxShadow={styles.boxShadow}
    />
  );
};
