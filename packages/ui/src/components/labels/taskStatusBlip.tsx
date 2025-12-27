import { Box } from "@chakra-ui/react";
import { $fileTask } from "op3-schema";
import { z } from "zod";
import { NotAvailableLabel } from "./notAvailableLabel";

type TaskStatus = z.infer<typeof $fileTask>["status"];

const statusStyles: Record<TaskStatus, { bg: string; boxShadow: string }> = {
  active: { bg: "green.400", boxShadow: "0 0 8px {colors.green.400}" },
  archived: { bg: "gray.400", boxShadow: "0 0 8px {colors.gray.400}" },
  error: { bg: "red.400", boxShadow: "0 0 8px {colors.red.400}" },
} as const;

export const TaskStatusBlip = ({ status }: { status?: TaskStatus }) => {
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
