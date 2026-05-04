import { Navbar } from "./navbar";
import { Sidebar } from "./sidebar";

export const MainLayoutSidebar = () => {
	return (
		<>
			<Navbar hideFrom="md" />
			<Sidebar hideBelow="md" />
		</>
	);
};
