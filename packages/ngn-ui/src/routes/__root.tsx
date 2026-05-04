import { Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import { MainLayout } from "@/components/layout/main/mainLayout.tsx";

import TanStackQueryLayout from "../integrations/tanstack-query/layout.tsx";

import type { QueryClient } from "@tanstack/react-query";

interface MyRouterContext {
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
	component: () => (
		<>
			<MainLayout>
				<Outlet />
			</MainLayout>

			<TanStackRouterDevtools />
			<TanStackQueryLayout />
		</>
	),
});
