import { CardLight } from "@/components/cards/cardLight";
import { PageHeader } from "@/components/headers/pageHeader";
import { LogStatusLabel } from "@/components/labels/logStatusLabel";
import { TaskRunStatusLabel } from "@/components/labels/taskRunStatusLabel";
import { TaskStatusLabel } from "@/components/labels/taskStatusLabel";
import { PageLayout } from "@/components/layout/pageLayout";
import {
  fetchFileTask,
  fetchFileTaskKvs,
  fetchFileTaskLogs,
  fetchFileTaskRuns,
  fetchFileTaskTimings,
  fetchFileTaskVersions,
} from "@/lib/fileTasks";
import {
  Badge,
  Box,
  Flex,
  HStack,
  Table,
  Tabs,
  Text,
  VStack,
} from "@chakra-ui/react";
import { createFileRoute } from "@tanstack/react-router";
import { LuClock, LuFile, LuFileText, LuKey, LuLayers } from "react-icons/lu";

export const Route = createFileRoute("/tasks/$taskId/details")({
  component: RouteComponent,
  loader: async ({ params }) => {
    const task = await fetchFileTask(params.taskId);
    const runs = await fetchFileTaskRuns(params.taskId);
    const kvs = await fetchFileTaskKvs(params.taskId);
    const logs = await fetchFileTaskLogs(params.taskId);
    const timings = await fetchFileTaskTimings(params.taskId);
    const versions = await fetchFileTaskVersions(params.taskId);

    return { task, runs, kvs, logs, timings, versions };
  },
});

function RouteComponent() {
  const { task, runs, kvs, logs, timings, versions } = Route.useLoaderData();

  return (
    <PageLayout>
      <PageHeader
        noBorder
        allowGoBack
        title="Task Details"
        description={task.path}
      />

      {/* Task Context Banner */}
      <CardLight>
        <Flex align="center" justify="space-between" gap={6} flexWrap="wrap">
          <HStack gap={3}>
            <Box p={2} borderRadius="lg" bg="blue.500/15" color="blue.400">
              <LuFile size={20} />
            </Box>
            <Box>
              <Text fontSize="sm" fontWeight="medium" color="fg.emphasized">
                {task.path}
              </Text>
              <Text fontSize="xs" color="fg.muted">
                <TaskStatusLabel status={task.status} />
              </Text>
            </Box>
          </HStack>

          <HStack gap={6} flexWrap="wrap">
            <VStack gap={0} align="center">
              <Text fontSize="lg" fontWeight="bold" color="fg.emphasized">
                {task.last_version ?? "-"}
              </Text>
              <Text fontSize="xs" color="fg.muted">
                Version
              </Text>
            </VStack>
            <Box h="8" w="px" bg="border" />
            <VStack gap={0} align="center">
              <Text fontSize="lg" fontWeight="bold" color="fg.emphasized">
                {runs.length}
              </Text>
              <Text fontSize="xs" color="fg.muted">
                Runs
              </Text>
            </VStack>
            <Box h="8" w="px" bg="border" />
            <VStack gap={0} align="center">
              <Text fontSize="lg" fontWeight="bold" color="fg.emphasized">
                {logs?.length ?? 0}
              </Text>
              <Text fontSize="xs" color="fg.muted">
                Logs
              </Text>
            </VStack>
            <Box h="8" w="px" bg="border" />
            <VStack gap={0} align="center">
              <Text fontSize="lg" fontWeight="bold" color="fg.emphasized">
                {timings?.length ?? 0}
              </Text>
              <Text fontSize="xs" color="fg.muted">
                Timings
              </Text>
            </VStack>
          </HStack>
        </Flex>
      </CardLight>

      {/* Tabs Section */}
      <Tabs.Root
        defaultValue="runs"
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
            <LuClock size={14} />
            Runs ({runs.length})
          </Tabs.Trigger>
          <Tabs.Trigger
            value="kv"
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
            <LuKey size={14} />
            KV ({kvs?.length ?? 0})
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
            <LuFileText size={14} />
            Logs ({logs?.length ?? 0})
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
            <LuClock size={14} />
            Timings ({timings?.length ?? 0})
          </Tabs.Trigger>
          <Tabs.Trigger
            value="versions"
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
            <LuLayers size={14} />
            Versions ({versions?.length ?? 0})
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="runs" pt={4}>
          <CardLight>
            <HStack gap={3} mb={4}>
              <Box p={2} borderRadius="lg" bg="green.500/15" color="green.400">
                <LuClock size={16} />
              </Box>
              <Box>
                <Text fontSize="sm" fontWeight="medium" color="fg.emphasized">
                  Task Runs
                </Text>
                <Text fontSize="xs" color="fg.muted">
                  Click on any run to view detailed logs and timings
                </Text>
              </Box>
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
                  "& tbody td": { borderColor: "rgba(255, 255, 255, 0.04)" },
                  "& tbody tr:last-child td": { borderBottom: "none" },
                  "& th:first-child, & td:first-child": { paddingLeft: "var(--chakra-spacing-4)" },
                  "& th:last-child, & td:last-child": { paddingRight: "var(--chakra-spacing-4)" },
                }}
              >
                <Table.Header>
                  <Table.Row bg="rgba(255, 255, 255, 0.02)" borderBottomWidth="1px" borderColor="rgba(255, 255, 255, 0.06)">
                    <Table.ColumnHeader color="fg.muted">Version</Table.ColumnHeader>
                    <Table.ColumnHeader color="fg.muted">Status</Table.ColumnHeader>
                    <Table.ColumnHeader color="fg.muted">Started</Table.ColumnHeader>
                    <Table.ColumnHeader color="fg.muted">Ended</Table.ColumnHeader>
                    <Table.ColumnHeader
                      display="flex"
                      alignItems="center"
                      gap={1}
                      color="fg.muted"
                    >
                      <LuClock size={16} /> Duration
                    </Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {runs.map((run) => (
                    <Table.Row
                      key={run.id}
                      cursor="pointer"
                      onClick={() => {
                        window.location.assign(`/runs/${run.id}/details`);
                      }}
                      borderBottomWidth="1px"
                      borderColor="rgba(255, 255, 255, 0.04)"
                      _hover={{ bg: "rgba(255, 255, 255, 0.04)" }}
                    >
                      <Table.Cell>{run.task_version}</Table.Cell>
                      <Table.Cell>
                        <TaskRunStatusLabel status={run.run_status} />
                      </Table.Cell>
                      <Table.Cell>{run.started_at}</Table.Cell>
                      <Table.Cell>{run.ended_at}</Table.Cell>
                      <Table.Cell>{run.run_duration}</Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            </Box>
          </CardLight>
        </Tabs.Content>

        <Tabs.Content value="kv" pt={4}>
          <CardLight>
            <HStack gap={3} mb={4}>
              <Box p={2} borderRadius="lg" bg="purple.500/15" color="purple.400">
                <LuKey size={16} />
              </Box>
              <Box>
                <Text fontSize="sm" fontWeight="medium" color="fg.emphasized">
                  Key-Value Store
                </Text>
                <Text fontSize="xs" color="fg.muted">
                  {kvs?.length ?? 0} stored entries
                </Text>
              </Box>
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
                  "& tbody td": { borderColor: "rgba(255, 255, 255, 0.04)" },
                  "& tbody tr:last-child td": { borderBottom: "none" },
                  "& th:first-child, & td:first-child": { paddingLeft: "var(--chakra-spacing-4)" },
                  "& th:last-child, & td:last-child": { paddingRight: "var(--chakra-spacing-4)" },
                }}
              >
                <Table.Header>
                  <Table.Row bg="rgba(255, 255, 255, 0.02)" borderBottomWidth="1px" borderColor="rgba(255, 255, 255, 0.06)">
                    <Table.ColumnHeader color="fg.muted">Key</Table.ColumnHeader>
                    <Table.ColumnHeader color="fg.muted">Value</Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {kvs.map((kv) => (
                    <Table.Row
                      key={kv.id}
                      borderBottomWidth="1px"
                      borderColor="rgba(255, 255, 255, 0.04)"
                      _hover={{ bg: "rgba(255, 255, 255, 0.04)" }}
                    >
                      <Table.Cell>
                        <Badge
                          size="xs"
                          borderRadius="md"
                          fontFamily="mono"
                          borderWidth="1px"
                          borderColor="border"
                          bg="bg.muted"
                          color="fg.emphasized"
                        >
                          {kv.key}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell>
                        <Text fontFamily="mono" color="fg">{kv.value}</Text>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            </Box>
          </CardLight>
        </Tabs.Content>

        <Tabs.Content value="logs" pt={4}>
          <CardLight>
            <HStack gap={3} mb={4}>
              <Box p={2} borderRadius="lg" bg="orange.500/15" color="orange.400">
                <LuFileText size={16} />
              </Box>
              <Box>
                <Text fontSize="sm" fontWeight="medium" color="fg.emphasized">
                  Log Entries ({logs?.length ?? 0})
                </Text>
                <Text fontSize="xs" color="fg.muted">
                  All log messages from script executions
                </Text>
              </Box>
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
                  "& tbody td": { borderColor: "rgba(255, 255, 255, 0.04)" },
                  "& tbody tr:last-child td": { borderBottom: "none" },
                  "& th:first-child, & td:first-child": { paddingLeft: "var(--chakra-spacing-4)" },
                  "& th:last-child, & td:last-child": { paddingRight: "var(--chakra-spacing-4)" },
                }}
              >
                <Table.Header>
                  <Table.Row bg="rgba(255, 255, 255, 0.02)" borderBottomWidth="1px" borderColor="rgba(255, 255, 255, 0.06)">
                    <Table.ColumnHeader color="fg.muted">Status</Table.ColumnHeader>
                    <Table.ColumnHeader color="fg.muted">Message</Table.ColumnHeader>
                    <Table.ColumnHeader color="fg.muted">File Path</Table.ColumnHeader>
                    <Table.ColumnHeader color="fg.muted">Run ID</Table.ColumnHeader>
                    <Table.ColumnHeader color="fg.muted">Timestamp</Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {logs.map((entry, idx) => (
                    <Table.Row
                      key={`${entry.id}-${idx}`}
                      borderBottomWidth="1px"
                      borderColor="rgba(255, 255, 255, 0.04)"
                      _hover={{ bg: "rgba(255, 255, 255, 0.04)" }}
                    >
                      <Table.Cell>
                        <LogStatusLabel status={entry.log_status} />
                      </Table.Cell>
                      <Table.Cell>
                        <Text truncate title={entry.log_value}>
                          {entry.log_value}
                        </Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Text fontFamily="mono" textStyle="sm">
                          {entry.task_path}
                        </Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Text
                          fontFamily="mono"
                          cursor="pointer"
                          _hover={{
                            textDecoration: "underline",
                            bg: "bg.subtle",
                          }}
                        >
                          {entry.task_run_id}
                        </Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Text textStyle="sm" color="fg.muted">
                          {entry.log_created_at}
                        </Text>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            </Box>
          </CardLight>
        </Tabs.Content>

        <Tabs.Content value="timings" pt={4}>
          <CardLight>
            <HStack gap={3} mb={4}>
              <Box p={2} borderRadius="lg" bg="cyan.500/15" color="cyan.400">
                <LuClock size={16} />
              </Box>
              <Box>
                <Text fontSize="sm" fontWeight="medium" color="fg.emphasized">
                  Performance Timings
                </Text>
                <Text fontSize="xs" color="fg.muted">
                  Measured script execution timings
                </Text>
              </Box>
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
                  "& tbody td": { borderColor: "rgba(255, 255, 255, 0.04)" },
                  "& tbody tr:last-child td": { borderBottom: "none" },
                  "& th:first-child, & td:first-child": { paddingLeft: "var(--chakra-spacing-4)" },
                  "& th:last-child, & td:last-child": { paddingRight: "var(--chakra-spacing-4)" },
                }}
              >
                <Table.Header>
                  <Table.Row bg="rgba(255, 255, 255, 0.02)" borderBottomWidth="1px" borderColor="rgba(255, 255, 255, 0.06)">
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
                  {timings.map((timing) => (
                    <Table.Row
                      key={timing.id}
                      borderBottomWidth="1px"
                      borderColor="rgba(255, 255, 255, 0.04)"
                      _hover={{ bg: "rgba(255, 255, 255, 0.04)" }}
                    >
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
                      <Table.Cell fontFamily="mono">
                        {timing.value}
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            </Box>
          </CardLight>
        </Tabs.Content>

        <Tabs.Content value="versions" pt={4}>
          <CardLight>
            <HStack gap={3} mb={4}>
              <Box p={2} borderRadius="lg" bg="pink.500/15" color="pink.400">
                <LuLayers size={16} />
              </Box>
              <Box>
                <Text fontSize="sm" fontWeight="medium" color="fg.emphasized">
                  Versions
                </Text>
                <Text fontSize="xs" color="fg.muted">
                  Task script versions
                </Text>
              </Box>
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
                  "& tbody td": { borderColor: "rgba(255, 255, 255, 0.04)" },
                  "& tbody tr:last-child td": { borderBottom: "none" },
                  "& th:first-child, & td:first-child": { paddingLeft: "var(--chakra-spacing-4)" },
                  "& th:last-child, & td:last-child": { paddingRight: "var(--chakra-spacing-4)" },
                }}
              >
                <Table.Header>
                  <Table.Row bg="rgba(255, 255, 255, 0.02)" borderBottomWidth="1px" borderColor="rgba(255, 255, 255, 0.06)">
                    <Table.ColumnHeader color="fg.muted">Version</Table.ColumnHeader>
                    <Table.ColumnHeader color="fg.muted">Created at</Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {versions.map((version) => (
                    <Table.Row
                      key={version.id}
                      borderBottomWidth="1px"
                      borderColor="rgba(255, 255, 255, 0.04)"
                      _hover={{ bg: "rgba(255, 255, 255, 0.04)" }}
                    >
                      <Table.Cell>
                        <Badge
                          size="xs"
                          borderRadius="md"
                          fontFamily="mono"
                          borderWidth="1px"
                          borderColor="border"
                          bg="bg.muted"
                          color="fg.emphasized"
                        >
                          {version.version}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell>
                        <Text fontFamily="mono" color="fg.muted">{version.created_at}</Text>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            </Box>
          </CardLight>
        </Tabs.Content>
      </Tabs.Root>
    </PageLayout>
  );
}
