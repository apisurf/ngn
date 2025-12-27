import { CardLight } from "@/components/cards/cardLight";
import { PageHeader } from "@/components/headers/pageHeader";
import { LogStatusLabel } from "@/components/labels/logStatusLabel";
import { TaskRunStatusLabel } from "@/components/labels/taskRunStatusLabel";
import { PageLayout } from "@/components/layout/pageLayout";
import { LoaderOverlay } from "@/components/loaders/loaderOverlay";
import { fetchLogs } from "@/lib/logs";
import { fetchRuns } from "@/lib/runs";
import { fetchTimings } from "@/lib/timings";
import {
  Badge,
  Box,
  Flex,
  HStack,
  Icon,
  Input,
  InputGroup,
  Portal,
  Select,
  Stack,
  Table,
  Tabs,
  Text,
  VStack,
  createListCollection,
} from "@chakra-ui/react";
import {
  createFileRoute,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { useDebounce } from "@uidotdev/usehooks";
import { format } from "date-fns";
import { useEffect, useState } from "react";
import { FaSearch } from "react-icons/fa";
import { LuChevronDown, LuHistory, LuSearch } from "react-icons/lu";
import { z } from "zod";

export const Route = createFileRoute("/history")({
  component: RouteComponent,
  validateSearch: (search) => {
    return z
      .object({
        tab: z.enum(["runs", "logs", "timings"]).optional().default("runs"),
        search: z.string().optional(),
        status: z.string().optional(),
      })
      .parse(search);
  },
  loaderDeps: ({ search: { tab, search, status } }) => ({
    tab,
    search,
    status,
  }),
  loader: async ({ deps: { tab, search, status } }) => {
    // Fetch all data in parallel for summary stats
    const [runs, logs, timings] = await Promise.all([
      fetchRuns({
        search: tab === "runs" ? search : undefined,
        status: tab === "runs" ? status : undefined,
      }),
      fetchLogs({
        search: tab === "logs" ? search : undefined,
        status: tab === "logs" ? status : undefined,
      }),
      fetchTimings({ search: tab === "timings" ? search : undefined }),
    ]);

    // Calculate summary stats
    const uniqueTaskPaths = new Set([
      ...runs.map((r) => r.path),
      ...logs.map((l) => l.path),
      ...timings.map((t) => t.path),
    ]);

    return {
      runs,
      logs,
      timings,
      summary: {
        totalRuns: runs.length,
        totalLogs: logs.length,
        totalTimings: timings.length,
        uniqueTasks: uniqueTaskPaths.size,
      },
    };
  },
  pendingComponent: LoaderOverlay,
});

const runStatusOptions = createListCollection({
  items: [
    { label: "All Status", value: "all" },
    { label: "Pending", value: "pending" },
    { label: "Skipped", value: "skipped" },
    { label: "Running", value: "running" },
    { label: "Success", value: "success" },
    { label: "Failure", value: "failure" },
  ],
});

const logStatusOptions = createListCollection({
  items: [
    { label: "All", value: "all" },
    { label: "Info", value: "info" },
    { label: "Warning", value: "warning" },
    { label: "Error", value: "error" },
  ],
});

function RouteComponent() {
  const navigate = useNavigate({ from: Route.fullPath });
  const { tab, search, status } = useSearch({ from: Route.fullPath });
  const { runs, logs, timings, summary } = Route.useLoaderData();
  const [searchTerm, setSearchTerm] = useState(search);
  const debouncedSearchTerm = useDebounce(searchTerm, 250);

  const handleSearch = (newSearch?: string, newStatus?: string) => {
    navigate({ search: { tab, search: newSearch, status: newStatus } });
  };

  const handleTabChange = (details: { value: string }) => {
    setSearchTerm("");
    navigate({
      search: {
        tab: details.value as "runs" | "logs" | "timings",
        search: undefined,
        status: undefined,
      },
    });
  };

  useEffect(() => {
    handleSearch(debouncedSearchTerm, status);
  }, [debouncedSearchTerm]);

  return (
    <PageLayout>
      <PageHeader
        noBorder
        allowGoBack
        title="History"
        description="Combined view of all execution data across your tasks"
      />

      {/* Aggregation Context Banner */}
      <CardLight>
        <Flex align="center" justify="space-between" gap={6} flexWrap="wrap">
          <HStack gap={3}>
            <Box p={2} borderRadius="lg" bg="blue.500/15" color="blue.400">
              <LuHistory size={20} />
            </Box>
            <Box>
              <Text fontSize="sm" fontWeight="medium" color="fg.emphasized">
                Aggregated Data View
              </Text>
              <Text fontSize="xs" color="fg.muted">
                Showing combined records from all task executions
              </Text>
            </Box>
          </HStack>

          <HStack gap={6} flexWrap="wrap">
            <VStack gap={0} align="center">
              <Text fontSize="lg" fontWeight="bold" color="fg.emphasized">
                {summary.uniqueTasks}
              </Text>
              <Text fontSize="xs" color="fg.muted">
                Tasks
              </Text>
            </VStack>
            <Box h="8" w="px" bg="border" />
            <VStack gap={0} align="center">
              <Text fontSize="lg" fontWeight="bold" color="fg.emphasized">
                {summary.totalRuns}
              </Text>
              <Text fontSize="xs" color="fg.muted">
                Runs
              </Text>
            </VStack>
            <Box h="8" w="px" bg="border" />
            <VStack gap={0} align="center">
              <Text fontSize="lg" fontWeight="bold" color="fg.emphasized">
                {summary.totalLogs}
              </Text>
              <Text fontSize="xs" color="fg.muted">
                Logs
              </Text>
            </VStack>
            <Box h="8" w="px" bg="border" />
            <VStack gap={0} align="center">
              <Text fontSize="lg" fontWeight="bold" color="fg.emphasized">
                {summary.totalTimings}
              </Text>
              <Text fontSize="xs" color="fg.muted">
                Timings
              </Text>
            </VStack>
          </HStack>
        </Flex>
      </CardLight>

      {/* Tabbed Content */}
      <Tabs.Root
        value={tab}
        onValueChange={handleTabChange}
        variant="line"
        colorPalette="blue"
      >
        <Tabs.List
          bg="bg.panelLight"
          borderWidth={1}
          borderColor="border.panelLight"
          borderRadius="lg"
          p={1}
          gap={1}
        >
          <Tabs.Trigger
            value="runs"
            px={4}
            py={2}
            borderRadius="md"
            fontSize="sm"
            fontWeight="medium"
            _selected={{
              bg: "bg.glow",
              color: "fg.emphasized",
              borderColor: "border.glow",
            }}
          >
            Runs
          </Tabs.Trigger>
          <Tabs.Trigger
            value="logs"
            px={4}
            py={2}
            borderRadius="md"
            fontSize="sm"
            fontWeight="medium"
            _selected={{
              bg: "bg.glow",
              color: "fg.emphasized",
              borderColor: "border.glow",
            }}
          >
            Logs
          </Tabs.Trigger>
          <Tabs.Trigger
            value="timings"
            px={4}
            py={2}
            borderRadius="md"
            fontSize="sm"
            fontWeight="medium"
            _selected={{
              bg: "bg.glow",
              color: "fg.emphasized",
              borderColor: "border.glow",
            }}
          >
            Timings
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="runs" pt={4}>
          <CardLight>
            <VStack gap={4} w="full" align="stretch">
              <HStack gap={4} w="full">
                <InputGroup
                  startElement={<Icon as={FaSearch} boxSize={3} mr={2} />}
                >
                  <Input
                    placeholder="Search runs..."
                    pl={10}
                    size="md"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </InputGroup>
                <Select.Root
                  collection={runStatusOptions}
                  size="md"
                  width="48"
                  defaultValue={["all"]}
                  value={[status || "all"]}
                  onSelect={(e) => {
                    handleSearch(debouncedSearchTerm, e.value);
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
                        {runStatusOptions.items.map((option) => (
                          <Select.Item item={option} key={option.value}>
                            {option.label}
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
                      <Table.ColumnHeader color="fg.muted">
                        File Path
                      </Table.ColumnHeader>
                      <Table.ColumnHeader color="fg.muted">
                        Version
                      </Table.ColumnHeader>
                      <Table.ColumnHeader color="fg.muted">
                        Status
                      </Table.ColumnHeader>
                      <Table.ColumnHeader color="fg.muted">
                        Started
                      </Table.ColumnHeader>
                      <Table.ColumnHeader color="fg.muted">
                        Ended
                      </Table.ColumnHeader>
                      <Table.ColumnHeader color="fg.muted">
                        Duration
                      </Table.ColumnHeader>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {runs.map((runDetails) => (
                      <Table.Row
                        key={runDetails.id}
                        onClick={() =>
                          navigate({
                            to: "/runs/$runId/details",
                            params: { runId: String(runDetails.id) },
                          })
                        }
                        style={{ cursor: "pointer" }}
                        borderBottomWidth="1px"
                        borderColor="rgba(255, 255, 255, 0.04)"
                        _hover={{ bg: "rgba(255, 255, 255, 0.04)" }}
                      >
                        <Table.Cell>{runDetails.path}</Table.Cell>
                        <Table.Cell>{runDetails.version}</Table.Cell>
                        <Table.Cell>
                          <TaskRunStatusLabel status={runDetails.status} />
                        </Table.Cell>
                        <Table.Cell>
                          {runDetails.started_at &&
                            format(runDetails.started_at, "PP pp")}
                        </Table.Cell>
                        <Table.Cell>
                          {runDetails.ended_at &&
                            format(runDetails.ended_at, "PP pp")}
                        </Table.Cell>
                        <Table.Cell>{runDetails.duration}</Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Root>
              </Box>
            </VStack>
          </CardLight>
        </Tabs.Content>

        <Tabs.Content value="logs" pt={4}>
          <CardLight>
            <VStack gap={4} w="full" align="stretch">
              <Stack
                direction={{ base: "column", md: "row" }}
                gap={4}
                align="center"
              >
                <Box flex={1}>
                  <InputGroup
                    startElement={
                      <LuSearch
                        size={16}
                        color="var(--chakra-colors-fg-muted)"
                      />
                    }
                  >
                    <Input
                      placeholder="Search logs or file paths..."
                      variant="outline"
                      size="md"
                      pl={10}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </InputGroup>
                </Box>
                <Box w={{ base: "full", md: "48" }}>
                  <Select.Root
                    collection={logStatusOptions}
                    size="md"
                    width="full"
                    defaultValue={["all"]}
                    value={status ? [status] : ["all"]}
                    onSelect={(e) => {
                      handleSearch(debouncedSearchTerm, e.value);
                    }}
                  >
                    <Select.HiddenSelect />
                    <Select.Control>
                      <Select.Trigger>
                        <Select.ValueText placeholder="All Status" />
                      </Select.Trigger>
                      <Select.IndicatorGroup>
                        <Select.Indicator />
                      </Select.IndicatorGroup>
                    </Select.Control>
                    <Portal>
                      <Select.Positioner>
                        <Select.Content>
                          {logStatusOptions.items.map((option) => (
                            <Select.Item item={option} key={option.value}>
                              {option.label}
                              <Select.ItemIndicator />
                            </Select.Item>
                          ))}
                        </Select.Content>
                      </Select.Positioner>
                    </Portal>
                  </Select.Root>
                </Box>
              </Stack>

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
                      <Table.ColumnHeader color="fg.muted">
                        File Path
                      </Table.ColumnHeader>
                      <Table.ColumnHeader color="fg.muted">
                        Status
                      </Table.ColumnHeader>
                      <Table.ColumnHeader color="fg.muted">
                        Message
                      </Table.ColumnHeader>
                      <Table.ColumnHeader color="fg.muted">
                        Run ID
                      </Table.ColumnHeader>
                      <Table.ColumnHeader color="fg.muted">
                        Log time
                      </Table.ColumnHeader>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {logs.map((entry, idx) => (
                      <Table.Row
                        key={`${entry.task_run_id}-${idx}`}
                        onClick={() =>
                          entry.file_task_id &&
                          navigate({
                            to: "/tasks/$taskId/details",
                            params: { taskId: String(entry.file_task_id) },
                          })
                        }
                        style={{
                          cursor: entry.file_task_id ? "pointer" : undefined,
                        }}
                        borderBottomWidth="1px"
                        borderColor="rgba(255, 255, 255, 0.04)"
                        _hover={{ bg: "rgba(255, 255, 255, 0.04)" }}
                      >
                        <Table.Cell>
                          <Text textStyle="sm">{entry.path}</Text>
                        </Table.Cell>
                        <Table.Cell>
                          <LogStatusLabel status={entry.status} />
                        </Table.Cell>
                        <Table.Cell>
                          <Text
                            truncate
                            title={entry.value}
                            wordWrap="break-word"
                            whiteSpace="balance"
                          >
                            {entry.value}
                          </Text>
                        </Table.Cell>
                        <Table.Cell>
                          <Text
                            cursor={entry.file_task_id ? "pointer" : undefined}
                            _hover={
                              entry.file_task_id
                                ? {
                                    textDecoration: "underline",
                                    bg: "bg.subtle",
                                  }
                                : undefined
                            }
                          >
                            {entry.task_run_id}
                          </Text>
                        </Table.Cell>
                        <Table.Cell>
                          <Text textStyle="sm" color="fg.muted">
                            {entry.created_at}
                          </Text>
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Root>
              </Box>
            </VStack>
          </CardLight>
        </Tabs.Content>

        <Tabs.Content value="timings" pt={4}>
          <CardLight>
            <VStack gap={4} w="full" align="stretch">
              <Box flex={1}>
                <InputGroup
                  startElement={
                    <LuSearch size={16} color="var(--chakra-colors-fg-muted)" />
                  }
                >
                  <Input
                    placeholder="Search timings or file paths..."
                    variant="outline"
                    size="md"
                    pl={10}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </InputGroup>
              </Box>

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
                      <Table.ColumnHeader
                        textAlign="left"
                        fontWeight="medium"
                        color="fg.muted"
                      >
                        File Path
                      </Table.ColumnHeader>
                      <Table.ColumnHeader
                        textAlign="left"
                        fontWeight="medium"
                        color="fg.muted"
                      >
                        Label
                      </Table.ColumnHeader>
                      <Table.ColumnHeader
                        textAlign="left"
                        fontWeight="medium"
                        color="fg.muted"
                      >
                        Duration
                      </Table.ColumnHeader>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {timings.map((timing, idx) => (
                      <Table.Row
                        key={idx}
                        onClick={() =>
                          timing.file_task_id &&
                          navigate({
                            to: "/tasks/$taskId/details",
                            params: { taskId: String(timing.file_task_id) },
                          })
                        }
                        style={{
                          cursor: timing.file_task_id ? "pointer" : undefined,
                        }}
                        borderBottomWidth="1px"
                        borderColor="rgba(255, 255, 255, 0.04)"
                        _hover={{ bg: "rgba(255, 255, 255, 0.04)" }}
                      >
                        <Table.Cell>{timing.path}</Table.Cell>
                        <Table.Cell>
                          <Badge
                            borderRadius="full"
                            borderWidth="1px"
                            borderColor="border"
                            bg="bg.muted"
                            color="fg.emphasized"
                            px={2.5}
                            py={0.5}
                            fontSize="xs"
                            fontWeight="semibold"
                            fontFamily="mono"
                          >
                            {timing.label}
                          </Badge>
                        </Table.Cell>
                        <Table.Cell>{timing.value}ms</Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Root>
              </Box>
            </VStack>
          </CardLight>
        </Tabs.Content>
      </Tabs.Root>
    </PageLayout>
  );
}
