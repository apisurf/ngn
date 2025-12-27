import { LuClock, LuInfo, LuX } from "react-icons/lu";
import { Badge } from "@chakra-ui/react";
import { z } from "zod";
import { $log } from "op3-schema";
import { NotAvailableLabel } from "./notAvailableLabel";

type LogStatus = z.infer<typeof $log>["status"];

const statusStyles: Record<
  LogStatus,
  { borderColor: string; bg: string; color: string }
> = {
  info: { borderColor: "blue.600", bg: "blue.950", color: "blue.300" },
  error: { borderColor: "red.600", bg: "red.950", color: "red.300" },
  warn: { borderColor: "orange.600", bg: "orange.950", color: "orange.300" },
} as const;

const statusIcons: Record<LogStatus, React.ReactNode> = {
  info: <LuInfo size={16} />,
  error: <LuX size={16} />,
  warn: <LuClock size={16} />,
} as const;

export const LogStatusLabel = ({ status }: { status?: LogStatus }) => {
  if (!status) {
    return <NotAvailableLabel />;
  }

  const styles = statusStyles[status];
  const icon = statusIcons[status];

  return (
    <Badge
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
      {icon} {status}
    </Badge>
  );
};
