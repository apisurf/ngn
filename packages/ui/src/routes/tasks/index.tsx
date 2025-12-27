import { CardLight } from "@/components/cards/cardLight";
import { PageHeader } from "@/components/headers/pageHeader";
import { NotAvailableLabel } from "@/components/labels/notAvailableLabel";
import { TaskStatusLabel } from "@/components/labels/taskStatusLabel";
import { PageLayout } from "@/components/layout/pageLayout";
import { LoaderOverlay } from "@/components/loaders/loaderOverlay";
import { listFileTasks } from "@/lib/fileTasks";
import {
  Box,
  Flex,
  HStack,
  Icon,
  Input,
  InputGroup,
  Portal,
  Select,
  Table,
  Text,
  VStack,
  createListCollection,
} from "@chakra-ui/react";
import {
  Link,
  createFileRoute,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { useDebounce } from "@uidotdev/usehooks";
import { format, formatDistanceToNow } from "date-fns";
import { useEffect, useState } from "react";
import { FaSearch } from "react-icons/fa";
import { LuChevronDown, LuFile } from "react-icons/lu";

export const Route = createFileRoute("/tasks/")({
  component: RouteComponent,
  validateSearch: (search) =>
    search as {
      search?: string;
      status?: string;
    },
  loaderDeps: ({ search: { search, status } }) => ({ search, status }),
  loader: async ({ deps: { search, status } }) => {
    try {
      return listFileTasks({ search, status });
    } catch (error) {
      console.error("Error loading tasks:", error);
      return [];
    }
  },
  pendingComponent: LoaderOverlay,
});

const filterOptions = createListCollection({
  items: [
    { label: "All", value: "all" },
    { label: "Active", value: "active" },
    { label: "Inactive", value: "inactive" },
  ],
});

function RouteComponent() {
  const tasks = Route.useLoaderData();
  const navigate = useNavigate({ from: Route.fullPath });
  const { search, status } = useSearch({ from: Route.fullPath });
  const [searchTerm, setSearchTerm] = useState(search);
  const debouncedSearchTerm = useDebounce(searchTerm, 250);
  const handleSearch = (search?: string, status?: string) => {
    navigate({ search: { search, status } });
  };

  useEffect(() => {
    handleSearch(debouncedSearchTerm, status);
  }, [debouncedSearchTerm]);

  // Calculate summary stats
  const activeTasks = tasks.filter((t) => t.status === "active").length;
  const totalRuns = tasks.reduce((acc, t) => acc + (t.run_count || 0), 0);

  return (
    <PageLayout>
      <PageHeader
        noBorder
        allowGoBack
        title="Tasks"
        description="Manage and monitor script tasks, their status, and execution history"
      />

      {/* Context Banner */}
      <CardLight>
        <Flex align="center" justify="space-between" gap={6} flexWrap="wrap">
          <HStack gap={3}>
            <Box p={2} borderRadius="lg" bg="blue.500/15" color="blue.400">
              <LuFile size={20} />
            </Box>
            <Box>
              <Text fontSize="sm" fontWeight="medium" color="fg.emphasized">
                Task Registry
              </Text>
              <Text fontSize="xs" color="fg.muted">
                Oversee all script tasks and their execution status
              </Text>
            </Box>
          </HStack>

          <HStack gap={6} flexWrap="wrap">
            <VStack gap={0} align="center">
              <Text fontSize="lg" fontWeight="bold" color="fg.emphasized">
                {tasks.length}
              </Text>
              <Text fontSize="xs" color="fg.muted">
                Total
              </Text>
            </VStack>
            <Box h="8" w="px" bg="border" />
            <VStack gap={0} align="center">
              <Text fontSize="lg" fontWeight="bold" color="fg.emphasized">
                {activeTasks}
              </Text>
              <Text fontSize="xs" color="fg.muted">
                Active
              </Text>
            </VStack>
            <Box h="8" w="px" bg="border" />
            <VStack gap={0} align="center">
              <Text fontSize="lg" fontWeight="bold" color="fg.emphasized">
                {totalRuns}
              </Text>
              <Text fontSize="xs" color="fg.muted">
                Runs
              </Text>
            </VStack>
          </HStack>
        </Flex>
      </CardLight>

      <CardLight>
        <HStack gap={4} w="full">
          <InputGroup startElement={<Icon as={FaSearch} boxSize={3} mr={2} />}>
            <Input
              placeholder="Search tasks..."
              pl={10}
              size="md"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </InputGroup>
          <Select.Root
            size="md"
            width="48"
            defaultValue={["all"]}
            value={status ? [status] : ["all"]}
            collection={filterOptions}
            onSelect={(value) => {
              handleSearch(debouncedSearchTerm, value.value);
            }}
          >
            <Select.HiddenSelect />
            <Select.Control>
              <Select.Trigger>
                <Select.ValueText placeholder="All Status" />
              </Select.Trigger>
              <Select.IndicatorGroup>
                <Box as={LuChevronDown} boxSize={4} opacity={0.5} />
              </Select.IndicatorGroup>
            </Select.Control>
            <Portal>
              <Select.Positioner>
                <Select.Content>
                  {filterOptions.items.map((item) => (
                    <Select.Item item={item} key={item.value}>
                      {item.label}
                      <Select.ItemIndicator />
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Positioner>
            </Portal>
          </Select.Root>
        </HStack>

        <Box overflowX="auto" w="full">
          <Table.Root
            size="sm"
            variant="line"
            bg="transparent"
            rounded="lg"
            overflow="hidden"
            borderWidth="1px"
            borderColor="rgba(255, 255, 255, 0.06)"
            w="full"
            css={{
              "& tbody td": {
                borderColor: "rgba(255, 255, 255, 0.04)",
              },
              "& tbody tr:last-child td": { borderBottom: "none" },
              "& th:first-child, & td:first-child": {
                paddingLeft: "var(--chakra-spacing-4)",
              },
              "& th:last-child, & td:last-child": {
                paddingRight: "var(--chakra-spacing-4)",
              },
            }}
          >
            <Table.Header>
              <Table.Row
                bg="rgba(255, 255, 255, 0.02)"
                borderBottomWidth="1px"
                borderColor="rgba(255, 255, 255, 0.06)"
              >
                <Table.ColumnHeader color="fg.muted">Path</Table.ColumnHeader>
                <Table.ColumnHeader color="fg.muted">Status</Table.ColumnHeader>
                <Table.ColumnHeader color="fg.muted">Runs</Table.ColumnHeader>
                <Table.ColumnHeader color="fg.muted">
                  Versions
                </Table.ColumnHeader>
                <Table.ColumnHeader color="fg.muted">
                  Last run
                </Table.ColumnHeader>
                <Table.ColumnHeader color="fg.muted">
                  Last version
                </Table.ColumnHeader>
                <Table.ColumnHeader color="fg.muted">
                  Created
                </Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {tasks.map((task) => (
                <Table.Row
                  key={task.id}
                  borderBottomWidth="1px"
                  borderColor="rgba(255, 255, 255, 0.04)"
                  _hover={{ bg: "rgba(255, 255, 255, 0.04)" }}
                >
                  <Table.Cell>
                    <Link
                      to="/tasks/$taskId/details"
                      params={{
                        taskId: task.id.toString(),
                      }}
                    >
                      {task.path}
                    </Link>
                  </Table.Cell>
                  <Table.Cell>
                    <TaskStatusLabel status={task.status} />
                  </Table.Cell>
                  <Table.Cell>{task.run_count}</Table.Cell>
                  <Table.Cell>{task.last_version}</Table.Cell>
                  <Table.Cell>
                    {task.last_run_started_at ? (
                      format(new Date(task.last_run_started_at), "PP pp")
                    ) : (
                      <NotAvailableLabel />
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    {task.last_version_created_at ? (
                      format(new Date(task.last_version_created_at), "PP pp")
                    ) : (
                      <NotAvailableLabel />
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    {task.created_at ? (
                      formatDistanceToNow(new Date(task.created_at), {
                        addSuffix: true,
                      })
                    ) : (
                      <NotAvailableLabel />
                    )}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Box>
      </CardLight>
    </PageLayout>
  );
}
