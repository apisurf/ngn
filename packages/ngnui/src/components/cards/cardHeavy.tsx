import { Box } from "@chakra-ui/react";
import type { ComponentProps, PropsWithChildren } from "react";

export const CardHeavy = ({
  children,
  ...rest
}: PropsWithChildren<ComponentProps<typeof Box>>) => {
  return (
    <Box
      gridColumn={{ base: "span 1" }}
      p={6}
      borderRadius="xl"
      borderWidth={1}
      borderStyle="solid"
      borderColor="border.panel"
      bg="bg.panel"
      boxShadow="panel"
      w="full"
      display="flex"
      flexDirection="column"
      gap={6}
      {...rest}
    >
      {children}
    </Box>
  );
};
