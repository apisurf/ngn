import { Flex, HStack } from "@chakra-ui/react";
import { Link } from "@tanstack/react-router";
import type { PropsWithChildren } from "react";

interface Props extends PropsWithChildren {
  to: string;
  activeOptions?: {
    exact?: boolean;
  };
}

export const SidebarLink = (props: Props) => {
  return (
    <Link
      to={props.to}
      activeOptions={props.activeOptions}
      style={{ width: "100%", textDecoration: "none" }}
    >
      {({ isActive }) => (
        <Flex
          align="center"
          gap={3}
          px={3}
          py={2.5}
          borderRadius="md"
          fontSize="sm"
          fontWeight="medium"
          transition="all 0.2s"
          color="white"
          bg={isActive ? "bg.glow" : "transparent"}
          borderWidth={1}
          borderStyle="solid"
          borderColor={isActive ? "border.glowEmphasized" : "transparent"}
          boxShadow={isActive ? "glow.md" : "none"}
          cursor="pointer"
          width="full"
          _hover={{
            background: "bg.glow",
          }}
          {...props}
        >
          <HStack gap={3}>{props.children}</HStack>
        </Flex>
      )}
    </Link>
  );
};
