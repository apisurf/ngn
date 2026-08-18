import type { StackProps } from "@chakra-ui/react";
import { Heading, Text, VStack } from "@chakra-ui/react";
import { Button } from "@chakra-ui/react";
import { useCanGoBack, useRouter } from "@tanstack/react-router";
import { LuArrowLeft } from "react-icons/lu";

export const BackButton = () => {
  const router = useRouter();
  const canGoBack = useCanGoBack();

  if (!canGoBack) return null;

  return (
    <Button
      variant="plain"
      size="xs"
      rounded="md"
      p={0}
      onClick={() => router.history.back()}
    >
      <LuArrowLeft size={24} /> Back
    </Button>
  );
};

interface Props extends StackProps {
  title: string;
  description?: string;
  allowGoBack?: boolean;
  noBorder?: boolean;
}

export const PageHeader = ({
  title,
  description,
  allowGoBack,
  noBorder,
  ...vStackProps
}: Props) => {
  return (
    <VStack
      gap={4}
      borderBottomWidth={noBorder ? 0 : 1}
      borderStyle="solid"
      borderColor="gray.800"
      align="start"
      pb={2}
      {...vStackProps}
    >
      {allowGoBack && <BackButton />}
      <VStack gap={1} align="start">
        <Heading as="h1" fontSize="3xl" fontWeight="bold" color="fg.emphasized">
          {title}
        </Heading>
        {description && <Text>{description}</Text>}
      </VStack>
    </VStack>
  );
};
