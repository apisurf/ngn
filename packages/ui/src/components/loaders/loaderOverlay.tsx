import { Box, Center, Spinner } from "@chakra-ui/react";

export const LoaderOverlay = () => {
  return (
    <Box pos="absolute" inset="0" bg="bg/80" h="vh">
      <Center h="full">
        <Spinner color="teal.500" size="lg" />
      </Center>
    </Box>
  );
};
