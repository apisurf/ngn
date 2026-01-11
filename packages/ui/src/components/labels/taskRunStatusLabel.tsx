import { $taskRun } from "ngn-schema";
import { Box } from "@chakra-ui/react";
import { z } from "zod";
import { NotAvailableLabel } from "./notAvailableLabel";

type TaskRunStatus = z.infer<typeof $taskRun>["status"];

const statusStyles: Record<
  TaskRunStatus,
  { borderColor: string; bg: string; color: string }
> = {
  success: { borderColor: "green.600", bg: "green.950", color: "green.300" },
  failure: { borderColor: "red.600", bg: "red.950", color: "red.300" },
  running: { borderColor: "blue.600", bg: "blue.950", color: "blue.300" },
  skipped: { borderColor: "gray.600", bg: "gray.800", color: "gray.300" },
  pending: {
    borderColor: "orange.600",
    bg: "orange.950",
    color: "orange.300",
  },
} as const;

export const TaskRunStatusLabel = ({ status }: { status?: TaskRunStatus }) => {
  if (!status) return <NotAvailableLabel />;

  const styles = statusStyles[status];

  return (
    <Box
      as="span"
      px={2.5}
      py={0.5}
      borderRadius="full"
      fontSize="xs"
      fontWeight="semibold"
      borderWidth={1}
      borderColor={styles.borderColor}
      bg={styles.bg}
      color={styles.color}
    >
      {status}
    </Box>
  );
};
