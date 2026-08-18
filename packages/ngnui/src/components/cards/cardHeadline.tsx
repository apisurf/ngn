import { Box, Card, HStack, Text, VStack } from "@chakra-ui/react";
import type { PropsWithChildren } from "react";
import type { IconType } from "react-icons";
import { CardLight } from "./cardLight";

interface Props {
  title: string;
  subtitle?: string;
  icon?: IconType;
}

export const CardHeadline = ({
  title,
  subtitle,
  icon,
  children,
}: PropsWithChildren<Props>) => {
  return (
    <CardLight
      header={
        <VStack gap={1} align="start">
          <HStack gap={2}>
            {icon && <Box as={icon} boxSize={4} color="fg.muted" />}
            <Card.Title fontWeight="semibold" color="fg.emphasized">
              <Text>{title}</Text>
            </Card.Title>
          </HStack>
          {subtitle && (
            <Card.Description fontSize="sm" color="fg.muted">
              {subtitle}
            </Card.Description>
          )}
        </VStack>
      }
    >
      {children}
    </CardLight>
  );
};
