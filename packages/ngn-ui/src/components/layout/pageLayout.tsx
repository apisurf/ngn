import { Container, VStack } from "@chakra-ui/react";

export const PageLayout = ({ children }: { children: React.ReactNode }) => {
	return (
		<Container maxW="7xl">
			<VStack align="stretch" gap={6} w="full">
				{children}
			</VStack>
		</Container>
	);
};
