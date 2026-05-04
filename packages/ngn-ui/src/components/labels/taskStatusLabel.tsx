import { $fileTask } from "ngn-schema";
import { Box } from "@chakra-ui/react";
import { z } from "zod";

type TaskStatus = z.infer<typeof $fileTask>["status"];

const statusStyles: Record<
  TaskStatus,
  { borderColor: string; bg: string; color: string }
> = {
  active: { borderColor: "green.600", bg: "green.950", color: "green.300" },
  archived: { borderColor: "gray.600", bg: "gray.800", color: "gray.300" },
  error: { borderColor: "red.600", bg: "red.950", color: "red.300" },
} as const;

export const TaskStatusLabel = ({ status }: { status: TaskStatus }) => {
  const styles = statusStyles[status] || {};

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
