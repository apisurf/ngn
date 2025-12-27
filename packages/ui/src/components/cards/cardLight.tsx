import { Card } from "@chakra-ui/react";
import type { PropsWithChildren, ReactNode } from "react";

export const CardLight = ({
  children,
  header,
}: PropsWithChildren<{ header?: ReactNode }>) => {
  return (
    <Card.Root
      variant="elevated"
      bg="bg.panelLight"
      borderWidth={1}
      borderStyle="solid"
      borderColor="border.panelLight"
      rounded="lg"
      shadow="md"
    >
      {header && (
        <Card.Header px={6} py={4}>
          {header}
        </Card.Header>
      )}
      <Card.Body gap={2} px={6} py={4}>
        {children}
      </Card.Body>
    </Card.Root>
  );
};
