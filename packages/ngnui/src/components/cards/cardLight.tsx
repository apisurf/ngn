import { type BoxProps, Card } from "@chakra-ui/react";
import type { PropsWithChildren, ReactNode } from "react";

export const CardLight = ({
  children,
  header,
  ...rest
}: PropsWithChildren<{ header?: ReactNode } & BoxProps>) => {
  return (
    <Card.Root
      variant="elevated"
      bg="bg.panelLight"
      borderWidth={1}
      borderStyle="solid"
      borderColor="border.panelLight"
      rounded="lg"
      shadow="md"
      {...rest}
    >
      {header && (
        <Card.Header px={6} py={4}>
          {header}
        </Card.Header>
      )}
      <Card.Body
        gap={2}
        px={6}
        py={4}
        flex={rest.display === "flex" ? 1 : undefined}
      >
        {children}
      </Card.Body>
    </Card.Root>
  );
};
