import { CardLight } from "@/components/cards/cardLight";
import { PageHeader } from "@/components/headers/pageHeader";
import { PageLayout } from "@/components/layout/pageLayout";
import { fetchRunDetails, fetchRunLogs, fetchRunTimings } from "@/lib/runs";
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
import { LuClock, LuFileText, LuPlay } from "react-icons/lu";
import { $taskRun, $log } from "op3-schema";
import { z } from "zod";
import { TaskRunStatusLabel } from "@/components/labels/taskRunStatusLabel";
import { LogStatusLabel } from "@/components/labels/logStatusLabel";

type TaskRunStatus = z.infer<typeof $taskRun>["status"];
type LogStatus = z.infer<typeof $log>["status"];

export const Route = createFileRoute("/runs/$runId/details")({
  component: RouteComponent,
  loader: async ({ params }) => {
    const run = await fetchRunDetails(params.runId);
    const logs = await fetchRunLogs(params.runId);
    const timings = await fetchRunTimings(params.runId);
    return { run, logs, timings };
  },
});

// Types for logs and timings
type Run = {
  id?: number;
  status?: TaskRunStatus;
  task_version?: string;
  started_at?: string | number;
  ended_at?: string | number;
  run_duration?: string;
};

type RunLog = {
  id?: number;
  log_status?: LogStatus;
  log_value?: string;
  task_path?: string;
  log_created_at?: string | number;
};
type RunTiming = {
  id?: number;
  label?: string;
  value?: string | number;
};

function RouteComponent() {
  const {
    run,
    logs,
    timings,
  }: { run: Run; logs: RunLog[]; timings: RunTiming[] } = Route.useLoaderData();

  return (
    <PageLayout>
      <PageHeader
        noBorder
        allowGoBack
        title="Run Details"
        description={`Details for run ID ${run.id}`}
      />

      {/* Run Context Banner */}
      <CardLight>
        <Flex align="center" justify="space-between" gap={6} flexWrap="wrap">
          <HStack gap={3}>
            <Box p={2} borderRadius="lg" bg="blue.500/15" color="blue.400">
              <LuPlay size={20} />
            </Box>
            <Box>
              <Text fontSize="sm" fontWeight="medium" color="fg.emphasized">
                Run #{run.id}
              </Text>
              <Text fontSize="xs" color="fg.muted">
                <TaskRunStatusLabel status={run.status} />
              </Text>
            </Box>
          </HStack>

          <HStack gap={6} flexWrap="wrap">
            <VStack gap={0} align="center">
              <Text fontSize="lg" fontWeight="bold" color="fg.emphasized">
                {run.task_version ?? "-"}
              </Text>
              <Text fontSize="xs" color="fg.muted">
                Version
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
            <Box h="8" w="px" bg="border" />
            <VStack gap={0} align="center">
              <Text fontSize="sm" fontWeight="bold" color="fg.emphasized">
                {run.run_duration ?? "-"}
              </Text>
              <Text fontSize="xs" color="fg.muted">
                Duration
              </Text>
            </VStack>
          </HStack>
        </Flex>
      </CardLight>

      {/* Tabs Section */}
      <Tabs.Root defaultValue="logs" variant="line" colorPalette="blue">
        <Tabs.List
          bg="bg.panelLight"
          borderWidth={1}
          borderColor="border.panelLight"
          borderRadius="lg"
          p={1}
          gap={1}
        >
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
        </Tabs.List>

        <Tabs.Content value="logs" pt={4}>
          <CardLight>
            <HStack gap={3} mb={4}>
              <Box
                p={2}
                borderRadius="lg"
                bg="orange.500/15"
                color="orange.400"
              >
                <LuFileText size={16} />
              </Box>
              <Box>
                <Text fontSize="sm" fontWeight="medium" color="fg.emphasized">
                  Log Entries ({logs?.length ?? 0})
                </Text>
                <Text fontSize="xs" color="fg.muted">
                  All log messages for this run
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
                      Status
                    </Table.ColumnHeader>
                    <Table.ColumnHeader color="fg.muted">
                      Message
                    </Table.ColumnHeader>
                    <Table.ColumnHeader color="fg.muted">
                      File Path
                    </Table.ColumnHeader>
                    <Table.ColumnHeader color="fg.muted">
                      Timestamp
                    </Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {logs.map((entry: RunLog, idx: number) => (
                    <Table.Row
                      key={`${entry.id ?? idx}`}
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
                  Measured execution times
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
                  {timings.map((timing: RunTiming, idx: number) => (
                    <Table.Row
                      key={timing.id ?? idx}
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
                      <Table.Cell fontFamily="mono">{timing.value}</Table.Cell>
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
