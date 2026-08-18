import { Flex, Stack } from "@chakra-ui/react";
import { Box, type BoxProps, Text, type TextProps } from "@chakra-ui/react";
import type { PropsWithChildren } from "react";
import { MainLayoutSidebar } from "./sidebar";

export interface ContentPlaceholderProps extends BoxProps {}

export const ContentPlaceholder = (props: ContentPlaceholderProps) => (
  <Box
    {...props}
    css={{
      bg: "bg.muted",
      display: "flex",
      width: "100%",
    }}
  />
);

export const Label = (props: TextProps) => (
  <Box p="2">
    <Text {...props} />
  </Box>
);

export const Navbar = (props: ContentPlaceholderProps) => {
  return (
    <ContentPlaceholder minH="16" {...props}>
      <Label>Navbar</Label>
    </ContentPlaceholder>
  );
};

export const MainLayout = ({ children }: PropsWithChildren) => {
  return (
    <>
      <Navbar hideFrom="md" />
      <Flex flex="1" minH="100vh">
        <MainLayoutSidebar />
        <Stack
          gap="12"
          pb="12"
          flex="1"
          alignItems="stretch"
          pt="8"
          style={{
            background: "#0f172a",
          }}
          position="relative"
        >
          {children}
        </Stack>
      </Flex>
    </>
  );
};
