import type { Socket } from 'node:net';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { mcpToolInputs, type McpToolArgs, type McpToolName } from '@cubecroom/contracts';
import type { Repositories } from '@cubecroom/db';
import {
  activityResults,
  learningProgress,
  listActivities,
  listClasses,
  listLearningExperiences,
  listLessons,
  McpReadError,
  readActivity,
  readLearningExperience,
  readLesson,
} from './data.js';

/**
 * The CubeCroom MCP server (D36).
 *
 * Every tool is read-only and returns only what `data.ts` projects: content without answer keys,
 * and class totals without student names or answers.
 */

export const MCP_TOOL_NAMES = Object.keys(mcpToolInputs) as McpToolName[];

export type McpServerOptions = {
  readonly version: string;
  /** `null` while the teacher's data is closed; checked on every call. */
  readonly repositories: () => Repositories | null;
};

type ToolText = { readonly title: string; readonly description: string };

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const INSTRUCTIONS = [
  'CubeCroom is a classroom app on this device, and this server is read-only.',
  'Content is mostly Arabic.',
  'Answer keys, student names and individual answers are never available here; results are class totals.',
  'Start with list_classes and use the ids it returns.',
].join(' ');

const UNAVAILABLE =
  'CubeCroom data is not open yet. Open CubeCroom and finish opening your data, then try again. ' +
  'بيانات CubeCroom غير مفتوحة بعد. افتح CubeCroom وأكمل فتح بياناتك ثم أعد المحاولة.';

const UNREADABLE = 'CubeCroom could not read this item. تعذّرت قراءة هذا العنصر في CubeCroom.';

function result(value: Record<string, unknown>): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value };
}

function failure(message: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

export function createMcpServer(options: McpServerOptions): McpServer {
  const server = new McpServer(
    { name: 'cubecroom', title: 'CubeCroom', version: options.version },
    { instructions: INSTRUCTIONS },
  );

  const run = (read: (repos: Repositories) => Record<string, unknown>): CallToolResult => {
    const repos = options.repositories();
    if (repos === null) return failure(UNAVAILABLE);
    try {
      return result(read(repos));
    } catch (error) {
      if (error instanceof McpReadError) return failure(error.message);
      // A category only: never identifiers, content or database details.
      console.warn('[mcp] read failed');
      return failure(UNREADABLE);
    }
  };

  // The SDK infers tool arguments across zod 3 and zod 4, which exceeds TypeScript's instantiation
  // depth for these shapes (TS2589). The contracts type the arguments from the same schemas instead.
  const register = server.registerTool.bind(server) as unknown as (
    name: McpToolName,
    config: ToolText & { readonly inputSchema: object; readonly annotations: typeof READ_ONLY },
    callback: (args: never) => CallToolResult,
  ) => void;
  const tool = <Name extends McpToolName>(
    name: Name,
    text: ToolText,
    read: (args: McpToolArgs<Name>, repos: Repositories) => Record<string, unknown>,
  ): void =>
    register(
      name,
      { ...text, inputSchema: mcpToolInputs[name], annotations: READ_ONLY },
      (args: McpToolArgs<Name>) => run((repos) => read(args, repos)),
    );

  tool(
    'list_classes',
    {
      title: 'List classes',
      description: "List the teacher's classes with their numbers of students, lessons and activities.",
    },
    ({ includeArchived }, repos) => listClasses(repos, includeArchived === true),
  );

  tool(
    'list_lessons',
    { title: 'List lessons', description: 'List the lessons of a class, drafts included, newest first.' },
    ({ classId }, repos) => listLessons(repos, classId),
  );

  tool(
    'read_lesson',
    {
      title: 'Read a lesson',
      description: 'Read a lesson as plain text: its content, learning outcomes and summary.',
    },
    ({ lessonId }, repos) => readLesson(repos, lessonId),
  );

  tool(
    'list_activities',
    {
      title: 'List activities',
      description:
        'List the activities of a class with question counts and submission totals against the class roster size.',
    },
    ({ classId }, repos) => listActivities(repos, classId),
  );

  tool(
    'read_activity',
    {
      title: 'Read an activity',
      description:
        'Read the questions and choices of an activity, as students see them. Correct choices and expected answers are not included.',
    },
    ({ activityId }, repos) => readActivity(repos, activityId),
  );

  tool(
    'activity_results',
    {
      title: 'Activity results',
      description:
        'Class totals for an activity: submissions, reviews, the score distribution out of 5, and how many students picked each choice. No names, individual answers or correctness.',
    },
    ({ activityId }, repos) => activityResults(repos, activityId),
  );

  tool(
    'list_learning_experiences',
    {
      title: 'List learning experiences',
      description: 'List the learning experiences (practice tasks) of a class.',
    },
    ({ classId }, repos) => listLearningExperiences(repos, classId),
  );

  tool(
    'read_learning_experience',
    {
      title: 'Read a learning experience',
      description:
        'Read the items of a learning experience as students see them. Answers, explanations and grading rubrics are not included.',
    },
    ({ experienceId }, repos) => readLearningExperience(repos, experienceId),
  );

  tool(
    'learning_progress',
    {
      title: 'Learning progress',
      description:
        'Class totals per learning objective for a learning experience: attempts, correct attempts, pending reviews, mean score and the number of students. No names or answers.',
    },
    ({ experienceId }, repos) => learningProgress(repos, experienceId),
  );

  return server;
}

/** Serves one authenticated relay connection; resolves once the transport listens. */
export async function serveMcpSocket(socket: Socket, options: McpServerOptions): Promise<void> {
  const server = createMcpServer(options);
  socket.once('close', () => {
    void server.close();
  });
  await server.connect(new StdioServerTransport(socket, socket));
}
