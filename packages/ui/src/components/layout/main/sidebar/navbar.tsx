import {
  CloseButton,
  Container,
  Drawer,
  HStack,
  Heading,
  IconButton,
  Portal,
} from "@chakra-ui/react";
import type { ContainerProps } from "@chakra-ui/react";
import { LuAlignRight } from "react-icons/lu";
import { Sidebar } from "./sidebar";

export const Navbar = (props: ContainerProps) => {
  return (
    <Container
      py="2.5"
      background="surface.700"
      borderBottomWidth="1px"
      {...props}
    >
      <HStack justify="space-between">
        <Heading as="span" size="md" color="tan.500">
          op3
        </Heading>
        <Drawer.Root placement="start">
          <Drawer.Trigger asChild>
            <IconButton
              aria-label="Open Menu"
              variant="ghost"
              colorPalette="gray"
            >
              <LuAlignRight />
            </IconButton>
          </Drawer.Trigger>
          <Portal>
            <Drawer.Backdrop />
            <Drawer.Positioner>
              <Drawer.Content>
                <Drawer.CloseTrigger asChild>
                  <CloseButton size="sm" colorPalette="gray" />
                </Drawer.CloseTrigger>
                <Sidebar />
              </Drawer.Content>
            </Drawer.Positioner>
          </Portal>
        </Drawer.Root>
      </HStack>
    </Container>
  );
};
