import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/tasks")({
	component: RouteComponent,
});

function RouteComponent() {
	return <Outlet />;
}
