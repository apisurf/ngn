import {
  Box,
  Heading,
  Separator,
  Stack,
  type StackProps,
} from "@chakra-ui/react";
import { Link } from "@tanstack/react-router";
import { FaRegFileCode } from "react-icons/fa6";
import { FiTerminal } from "react-icons/fi";
import { LuHistory, LuLayoutDashboard } from "react-icons/lu";
import { VscDebugStart } from "react-icons/vsc";
import { SidebarLink } from "./sidebarLink";

export const Sidebar = (props: StackProps) => {
  return (
    <Box
      position="relative"
      w="64"
      bg="surface.900"
      style={{
        background: "#0f172a", // solid slate-900
        borderRight: "1px solid rgba(51,65,85,0.5)", // slate-700/50
      }}
      {...props}
    >
      <Stack p="6" gap={8}>
        <Link to="/">
          <Stack direction="row" align="center" gap={2} pl="4">
            <Box position="relative">
              <Box as={FiTerminal} boxSize="8" color="blue.500" />
            </Box>
            <Box>
              <Heading
                as="h1"
                size="md"
                color="blue.500"
                fontWeight="bold"
                letterSpacing="tight"
              >
                ngn
              </Heading>
              <Box as="p" fontSize="2xs" color="gray.600" fontFamily="mono">
                {APP_VERSION}
              </Box>
            </Box>
          </Stack>
        </Link>
        <Stack as="nav" px="4" gap={1}>
          <SidebarLink to="/" activeOptions={{ exact: true }}>
            <LuLayoutDashboard size={18} /> Dashboard
          </SidebarLink>
          <SidebarLink to="/live">
            <VscDebugStart size={18} /> Live
          </SidebarLink>

          <Separator my="4" />

          <SidebarLink to="/tasks">
            <FaRegFileCode size={18} /> Tasks
          </SidebarLink>
          <SidebarLink to="/history">
            <LuHistory size={18} /> History
          </SidebarLink>
        </Stack>
      </Stack>
    </Box>
  );
};
