import { CardLight } from "@/components/cards/cardLight";
import { PageHeader } from "@/components/headers/pageHeader";
import { TaskRunStatusBlip } from "@/components/labels/taskRunStatusBlip";
import { PageLayout } from "@/components/layout/pageLayout";
import { LoaderOverlay } from "@/components/loaders/loaderOverlay";
import {
  fetchLogEntries,
  fetchTaskRunsCount,
  fetchTaskRunTrends,
  fetchTasksCount,
} from "@/lib/dashboard";
import { listFileTasksSimple, listTaskActivity } from "@/lib/fileTasks";
import {
  Box,
  Flex,
  Grid,
  GridItem,
  HStack,
  Stack,
  Text,
  Select,
  TreeView,
  VStack,
  createListCollection,
  createTreeCollection,
} from "@chakra-ui/react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Tooltip as UITooltip } from "@/components/ui/tooltip";
import { formatDistanceToNow, format } from "date-fns";
import { useState } from "react";
import {
  LuActivity,
  LuFile,
  LuFolder,
  LuLayoutDashboard,
} from "react-icons/lu";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export const Route = createFileRoute("/")({
  component: Dashboard,
  loader: async () => {
    try {
      const [tasks, tasksRuns, logEntries, trends, fileTasks, activity] =
        await Promise.all([
          fetchTasksCount(),
          fetchTaskRunsCount(),
          fetchLogEntries(),
          fetchTaskRunTrends(),
          listFileTasksSimple(),
          listTaskActivity(),
        ]);
      return { tasks, tasksRuns, logEntries, trends, fileTasks, activity };
    } catch (error) {
      console.error("Error loading dashboard:", error);
      return null;
    }
  },
  pendingComponent: LoaderOverlay,
});

interface FileTaskNode {
  _id: number;
  id: string;
  name: string;
  status?: string;
  children?: FileTaskNode[];
}

function buildTree(
  tasks: Array<{
    id: number;
    path: string;
    parent_path: string | null;
    status: string;
  }>
): FileTaskNode {
  const nodes: Record<string, FileTaskNode> = {};
  const root: FileTaskNode = { _id: -1, id: "ROOT", name: "", children: [] };
  const sortedTasks = tasks.sort((a, b) => a.path.localeCompare(b.path));

  for (const task of sortedTasks) {
    nodes[task.path] = {
      _id: task.id,
      id: task.path,
      name: task.path.split("/").pop() || task.path,
      status: task.status,
      children: [],
    };
  }
  for (const task of sortedTasks) {
    if (task.parent_path && !nodes[task.parent_path]) {
      nodes[task.parent_path] = {
        _id: -1,
        id: task.parent_path,
        name: task.parent_path.split("/").pop() || task.parent_path,
        children: [],
      };
      root.children?.push(nodes[task.parent_path]);
    }
    if (task.parent_path) {
      nodes[task.parent_path].children?.push(nodes[task.path]);
    } else {
      root.children?.push(nodes[task.path]);
    }
  }

  return root;
}

type TimeRange = "hour" | "day" | "week";

const timeRangeOptions = createListCollection({
  items: [
    { label: "Last Hour", value: "hour" },
    { label: "Last Day", value: "day" },
    { label: "Last Week", value: "week" },
  ],
});

function Dashboard() {
  const data = Route.useLoaderData();
  const navigate = useNavigate({ from: Route.id });
  const [selectedRange, setSelectedRange] = useState<TimeRange>("hour");
  const [trends, setTrends] = useState(data?.trends || []);
  const [isLoadingTrends, setIsLoadingTrends] = useState(false);

  if (!data) return null;

  const { tasks, tasksRuns, logEntries, fileTasks, activity } = data;

  const fileTasksTree = buildTree(fileTasks);
  const fileTasksCollection = createTreeCollection({
    nodeToValue: (node) => node.id,
    nodeToString: (node) => node.name,
    rootNode: fileTasksTree,
  });

  // Get top-level folder IDs to auto-expand
  const topLevelFolderIds =
    fileTasksTree.children
      ?.filter((child) => child.children && child.children.length > 0)
      .map((child) => child.id) || [];

  // Format numbers with k/m notation
  const formatNumber = (num: number): string => {
    if (num >= 1_000_000) {
      return (num / 1_000_000).toFixed(1).replace(/\.0$/, "") + "m";
    }
    if (num >= 1_000) {
      return (num / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
    }
    return num.toString();
  };

  // Get chart configuration based on selected range
  const getChartConfig = (range: TimeRange) => {
    switch (range) {
      case "week":
        return {
          title: "Task Runs - Last Week (30-minute intervals)",
          format: (date: Date) => format(date, "MMM dd HH:mm"),
        };
      case "day":
        return {
          title: "Task Runs - Last 24 Hours (5-minute intervals)",
          format: (date: Date) => format(date, "HH:mm"),
        };
      case "hour":
      default:
        return {
          title: "Task Runs - Last Hour (15-second intervals)",
          format: (date: Date) => format(date, "HH:mm:ss"),
        };
    }
  };

  const chartConfig = getChartConfig(selectedRange);

  // Prepare chart data
  const chartData = trends.map((trend) => ({
    time: chartConfig.format(new Date(trend.time)),
    Success: trend.success_count,
    Skipped: trend.skipped_count,
    Failed: trend.failure_count,
  }));

  // Handle range change
  const handleRangeChange = async (details: { value: string[] }) => {
    const newRange = details.value[0] as TimeRange;
    setSelectedRange(newRange);
    setIsLoadingTrends(true);
    try {
      const newTrends = await fetchTaskRunTrends(newRange);
      setTrends(newTrends);
    } catch (error) {
      console.error("Error fetching trends:", error);
    } finally {
      setIsLoadingTrends(false);
    }
  };

  return (
    <PageLayout>
      <PageHeader
        noBorder
        title="Dashboard"
        description="Overview of the system's status"
      />

      {/* Summary Context Banner */}
      <CardLight>
        <Flex align="center" justify="space-between" gap={6} flexWrap="wrap">
          <HStack gap={3}>
            <Box p={2} borderRadius="lg" bg="blue.500/15" color="blue.400">
              <LuLayoutDashboard size={20} />
            </Box>
            <Box>
              <Text fontSize="sm" fontWeight="medium" color="fg.emphasized">
                System Overview
              </Text>
              <Text fontSize="xs" color="fg.muted">
                Aggregated metrics across all tasks
              </Text>
            </Box>
          </HStack>

          <HStack gap={6} flexWrap="wrap">
            <UITooltip
              content={
                <Box py={1}>
                  <Text fontSize="xs" color="fg.muted">
                    {formatNumber(tasks.total - tasks.active)} inactive
                  </Text>
                </Box>
              }
              contentProps={{
                bg: "bg.emphasized",
                borderWidth: "1px",
                borderColor: "border",
                borderRadius: "8px",
              }}
              positioning={{ placement: "bottom" }}
              showArrow
            >
              <VStack gap={0} align="center" cursor="pointer">
                <Text fontSize="lg" fontWeight="bold" color="fg.emphasized">
                  {formatNumber(tasks.total)}
                </Text>
                <Text fontSize="xs" color="fg.muted">
                  Tasks
                </Text>
              </VStack>
            </UITooltip>
            <Box h="8" w="px" bg="border" />
            <UITooltip
              content={
                <Box py={1}>
                  <Text fontSize="xs" color="fg.success">
                    {formatNumber(tasksRuns.success)} successful
                  </Text>
                  <Text fontSize="xs" color="fg.error">
                    {formatNumber(tasksRuns.failure)} failed
                  </Text>
                  <Text fontSize="xs" color="fg.muted">
                    {formatNumber(tasksRuns.skipped)} skipped
                  </Text>
                </Box>
              }
              contentProps={{
                bg: "bg.emphasized",
                borderWidth: "1px",
                borderColor: "border",
                borderRadius: "8px",
              }}
              positioning={{ placement: "bottom" }}
              showArrow
            >
              <VStack gap={0} align="center" cursor="pointer">
                <Text fontSize="lg" fontWeight="bold" color="fg.emphasized">
                  {formatNumber(tasksRuns.total)}
                </Text>
                <Text fontSize="xs" color="fg.muted">
                  Runs
                </Text>
              </VStack>
            </UITooltip>
            <Box h="8" w="px" bg="border" />
            <UITooltip
              content={
                <Box py={1}>
                  <Text fontSize="xs" color="fg.error">
                    {formatNumber(logEntries.errors)} errors
                  </Text>
                  <Text fontSize="xs" color="fg.info">
                    {formatNumber(logEntries.total - logEntries.errors)} other
                  </Text>
                  {logEntries.latest_error && (
                    <Text
                      fontSize="xs"
                      color="fg.muted"
                      mt={1}
                      pt={1}
                      borderTopWidth="1px"
                    >
                      Last error {formatDistanceToNow(logEntries.latest_error)}{" "}
                      ago
                    </Text>
                  )}
                </Box>
              }
              contentProps={{
                bg: "bg.emphasized",
                borderWidth: "1px",
                borderColor: "border",
                borderRadius: "8px",
              }}
              positioning={{ placement: "bottom" }}
              showArrow
            >
              <VStack gap={0} align="center" cursor="pointer">
                <Text fontSize="lg" fontWeight="bold" color="fg.emphasized">
                  {formatNumber(logEntries.total)}
                </Text>
                <Text fontSize="xs" color="fg.muted">
                  Logs
                </Text>
              </VStack>
            </UITooltip>
          </HStack>
        </Flex>
      </CardLight>

      <Grid templateColumns={{ base: "1fr", lg: "1fr 1fr" }} gap={6} mt={6}>
        {/* Left Column - File Tasks (full height) */}
        <GridItem>
          <Flex h="full" direction="column">
            <CardLight h="full" display="flex" flexDirection="column">
              <HStack gap={3} mb={4}>
                <Box
                  p={2}
                  borderRadius="lg"
                  bg="green.500/15"
                  color="green.400"
                >
                  <LuFolder size={20} />
                </Box>
                <Box>
                  <Text fontSize="sm" fontWeight="medium" color="fg.emphasized">
                    File Tasks
                  </Text>
                  <Text fontSize="xs" color="fg.muted">
                    Browse registered task files
                  </Text>
                </Box>
              </HStack>
              <TreeView.Root
                collection={fileTasksCollection}
                defaultExpandedValue={topLevelFolderIds}
              >
                <Box flex={1} overflowY="auto">
                  <TreeView.Tree>
                    <TreeView.Node
                      indentGuide={<TreeView.BranchIndentGuide />}
                      render={({ node, nodeState }) =>
                        nodeState.isBranch ? (
                          <TreeView.BranchControl cursor="pointer">
                            <LuFolder />
                            <TreeView.BranchText fontSize="md">
                              {node.name}
                            </TreeView.BranchText>
                          </TreeView.BranchControl>
                        ) : (
                          <TreeView.Item
                            cursor="pointer"
                            onClick={() => {
                              navigate({
                                to: "/tasks/$taskId/details",
                                params: { taskId: node._id.toString() },
                              });
                            }}
                          >
                            <LuFile size={20} />
                            <TreeView.ItemText fontSize="md">
                              {node.name}
                            </TreeView.ItemText>
                          </TreeView.Item>
                        )
                      }
                    />
                  </TreeView.Tree>
                </Box>
              </TreeView.Root>
            </CardLight>
          </Flex>
        </GridItem>

        {/* Right Column - Chart (top) + Recent Activity (bottom) */}
        <GridItem>
          <Stack gap={6} h="full">
            {/* Chart Card */}
            <CardLight>
              <Flex justify="space-between" align="center" mb={4}>
                <HStack gap={3}>
                  <Box
                    p={2}
                    borderRadius="lg"
                    bg="orange.500/15"
                    color="orange.400"
                  >
                    <LuActivity size={20} />
                  </Box>
                  <Box>
                    <Text
                      fontSize="sm"
                      fontWeight="medium"
                      color="fg.emphasized"
                    >
                      {chartConfig.title}
                    </Text>
                    <Text fontSize="xs" color="fg.muted">
                      Task execution trends over time
                    </Text>
                  </Box>
                </HStack>
                <Select.Root
                  collection={timeRangeOptions}
                  size="sm"
                  width="180px"
                  value={[selectedRange]}
                  onValueChange={handleRangeChange}
                >
                  <Select.HiddenSelect />
                  <Select.Control>
                    <Select.Trigger>
                      <Select.ValueText placeholder="Select range" />
                    </Select.Trigger>
                    <Select.IndicatorGroup>
                      <Select.Indicator />
                    </Select.IndicatorGroup>
                  </Select.Control>
                  <Select.Positioner>
                    <Select.Content>
                      {timeRangeOptions.items.map((option) => (
                        <Select.Item item={option} key={option.value}>
                          {option.label}
                          <Select.ItemIndicator />
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select.Positioner>
                </Select.Root>
              </Flex>
              <Box
                opacity={isLoadingTrends ? 0.5 : 1}
                transition="opacity 0.2s"
              >
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis
                      dataKey="time"
                      stroke="#9ca3af"
                      tick={{ fill: "#9ca3af" }}
                    />
                    <YAxis stroke="#9ca3af" tick={{ fill: "#9ca3af" }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1f2937",
                        border: "1px solid #374151",
                        borderRadius: "8px",
                      }}
                      labelStyle={{ color: "#fff" }}
                    />
                    <Legend wrapperStyle={{ color: "#9ca3af" }} />
                    <Line
                      type="monotone"
                      dataKey="Success"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="Skipped"
                      stroke="#6b7280"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="Failed"
                      stroke="#ef4444"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            </CardLight>

            {/* Recent Activity Card */}
            <Box flex={1}>
              <CardLight>
                <HStack gap={3} mb={4}>
                  <Box
                    p={2}
                    borderRadius="lg"
                    bg="purple.500/15"
                    color="purple.400"
                  >
                    <LuActivity size={20} />
                  </Box>
                  <Box>
                    <Text
                      fontSize="sm"
                      fontWeight="medium"
                      color="fg.emphasized"
                    >
                      Recent Activity
                    </Text>
                    <Text fontSize="xs" color="fg.muted">
                      Latest task executions
                    </Text>
                  </Box>
                </HStack>
                <Stack gap={2} maxH="220px" overflowY="auto">
                  {activity.length === 0 ? (
                    <Text color="fg.muted" fontSize="sm">
                      No recent activity
                    </Text>
                  ) : (
                    activity.map((item) => (
                      <Link
                        key={item.task_run_id}
                        to="/runs/$runId/details"
                        params={{ runId: item.task_run_id.toString() }}
                      >
                        <Flex
                          align="center"
                          justify="space-between"
                          px="4"
                          py="2"
                          borderRadius="md"
                          borderWidth={1}
                          borderStyle="solid"
                          borderColor="border"
                          transition="all 0.2s"
                          _hover={{
                            background: "bg.glowSubtle",
                            borderColor: "border.glow",
                          }}
                          cursor="pointer"
                        >
                          <HStack gap={4} justify="space-between" w="full">
                            <HStack gap={2}>
                              <TaskRunStatusBlip status={item.status} />
                              <Text
                                fontSize="sm"
                                fontWeight="medium"
                                fontFamily="mono"
                              >
                                {item.path}
                              </Text>
                            </HStack>
                            <Text
                              fontSize="xs"
                              fontFamily="mono"
                              color="fg.subtle"
                              flexShrink={0}
                            >
                              {formatDistanceToNow(item.created_at)}
                            </Text>
                          </HStack>
                        </Flex>
                      </Link>
                    ))
                  )}
                </Stack>
              </CardLight>
            </Box>
          </Stack>
        </GridItem>
      </Grid>
    </PageLayout>
  );
}
