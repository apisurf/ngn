import { CardLight } from "@/components/cards/cardLight";
import { PageHeader } from "@/components/headers/pageHeader";
import { PageLayout } from "@/components/layout/pageLayout";
import { createFileRoute } from "@tanstack/react-router";
import { Box, Button, Flex, HStack, Stack, Text } from "@chakra-ui/react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { useState, useRef } from "react";
import { executeLiveTask } from "@/lib/live";
import { LuPlay, LuTerminal } from "react-icons/lu";

export const Route = createFileRoute("/live")({
  component: RouteComponent,
});

const defaultTsCode = `// Write your TypeScript code here
import { TaskContext } from "@op3/cli";

export const task = async (ctx: TaskContext) => {
  console.log("This is a console log from the live task!");
  const result = await fetch("https://example.com").then(res => res.text());
  return result;
};
`;

const defaultJsCode = `// Write your JavaScript code here

export const task = async (ctx) => {
  console.log("This is a console log from the live task!");
  const result = await fetch("https://example.com").then(res => res.text());
  return result;
};
`;

function RouteComponent() {
  const [code, setCode] = useState(defaultTsCode);
  const [language, setLanguage] = useState<"typescript" | "javascript">(
    "typescript"
  );
  const [output, setOutput] = useState<string>("");
  const [isRunning, setIsRunning] = useState(false);
  const handleRunRef = useRef<(() => Promise<void>) | undefined>(undefined);

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      setCode(value);
    }
  };

  const handleRun = async () => {
    setIsRunning(true);
    setOutput("Running...");
    try {
      const result = await executeLiveTask({ code, language });
      setOutput(JSON.stringify(result, null, 2));
    } catch (error) {
      const response = {
        error: error instanceof Error ? error.message : String(error),
        explanation: "An error occurred while executing the live task.",
      };
      setOutput(JSON.stringify(response, null, 2));
    } finally {
      setIsRunning(false);
    }
  };

  // Keep handleRunRef updated with the latest handleRun function
  handleRunRef.current = handleRun;

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    // Add type definitions for TaskContext
    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      `
declare module "@op3/cli" {
  export interface TaskContext {
    /** Metadata about the task execution */
    meta: {
      fileTaskId: number;
      fileTaskVersionId: number;
    };
    /** Environment variables passed to the task */
    env: Record<string, string> | null;
    /** Key-value store for task */
    kv: {
      set(key: string, value: string): Promise<void>;
      get(key: string): Promise<string | null>;
      delete(key: string): Promise<void>;
    };
    /** Logging functions for task */
    log: {
      info(value: string): Promise<void>;
      error(value: string): Promise<void>;
      warning(value: string): Promise<void>;
    };
    /** Timing functions for task */
    timing: {
      start(label: string): () => Promise<void>;
    };
  }
}
      `,
      "@op3/cli"
    );

    // Add CMD+ENTER (or CTRL+ENTER on Windows/Linux) keyboard shortcut
    editor.addAction({
      id: "run-code",
      label: "Run Code",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run: () => {
        handleRunRef.current?.();
      },
    });
  };

  const toggleLanguage = () => {
    setLanguage((prev) => {
      const newLanguage = prev === "typescript" ? "javascript" : "typescript";
      setCode(newLanguage === "typescript" ? defaultTsCode : defaultJsCode);
      return newLanguage;
    });
  };

  return (
    <PageLayout>
      <PageHeader
        noBorder
        title="Live"
        description="Execute live tasks"
        allowGoBack
      />

      {/* Context Banner */}
      <CardLight>
        <Flex align="center" justify="space-between" gap={6} flexWrap="wrap">
          <HStack gap={3}>
            <Box p={2} borderRadius="lg" bg="blue.500/15" color="blue.400">
              <LuTerminal size={20} />
            </Box>
            <Box>
              <Text fontSize="sm" fontWeight="medium" color="fg.emphasized">
                Live Task Editor
              </Text>
              <Text fontSize="xs" color="fg.muted">
                Write and execute tasks in real-time • Press ⌘+Enter to run
              </Text>
            </Box>
          </HStack>

          <HStack gap={2}>
            <Button
              onClick={handleRun}
              color="fg.emphasized"
              size="sm"
              disabled={isRunning}
            >
              <LuPlay size={14} />
              {isRunning ? "Running..." : "Run"}
            </Button>
            <Button onClick={toggleLanguage} variant="outline" size="sm">
              {language === "typescript" ? "TypeScript" : "JavaScript"}
            </Button>
            <Button
              onClick={() =>
                setCode(
                  language === "typescript" ? defaultTsCode : defaultJsCode
                )
              }
              variant="ghost"
              size="sm"
            >
              Reset
            </Button>
          </HStack>
        </Flex>
      </CardLight>

      <Stack gap={4} height="calc(70vh - 280px)">
        <CardLight>
          <Box
            borderWidth="1px"
            borderStyle="solid"
            borderColor="border"
            borderRadius="lg"
            overflow="hidden"
            height="400px"
          >
            <Editor
              height="100%"
              language={language}
              value={code}
              onChange={handleEditorChange}
              onMount={handleEditorDidMount}
              theme="vs-dark"
              options={{
                minimap: { enabled: true },
                fontSize: 14,
                lineNumbers: "on",
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                wordWrap: "on",
              }}
            />
          </Box>
        </CardLight>

        {output && (
          <CardLight>
            <HStack gap={3} mb={3}>
              <Box p={2} borderRadius="lg" bg="green.500/15" color="green.400">
                <LuTerminal size={16} />
              </Box>
              <Text fontSize="sm" fontWeight="medium" color="fg.emphasized">
                Output
              </Text>
            </HStack>
            <Box
              borderWidth="1px"
              borderStyle="solid"
              borderColor="rgba(255, 255, 255, 0.06)"
              borderRadius="lg"
              p={4}
              maxH="300px"
              overflow="auto"
              fontFamily="mono"
              fontSize="sm"
              bg="transparent"
              whiteSpace="pre-wrap"
              color="fg"
            >
              {output}
            </Box>
          </CardLight>
        )}
      </Stack>
    </PageLayout>
  );
}
