import { z } from 'zod';

/**
 * Local MCP access for AI apps on this device (D36).
 *
 * The server is read-only. The switch is a device setting, off by default, and never enters
 * backups. It runs only while CubeCroom is open.
 */
export const mcpSetEnabledSchema = z.object({ enabled: z.boolean() }).strict();
export type McpSetEnabledInput = z.infer<typeof mcpSetEnabledSchema>;

/** How an AI app starts the relay. The app computes each value, all of them absolute. */
export type McpLaunch = {
  readonly command: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
};

export type McpStatus =
  | { readonly state: 'off' }
  | { readonly state: 'running'; readonly connections: number; readonly launch: McpLaunch }
  | { readonly state: 'failed'; readonly message: string };

export interface McpBridge {
  mcpStatus(): Promise<McpStatus>;
  mcpSetEnabled(input: McpSetEnabledInput): Promise<McpStatus>;
}

export const MCP_IPC = {
  status: 'mcp:status',
  setEnabled: 'mcp:set-enabled',
} as const;

const mcpId = z.string().min(1).max(128);

/** The reviewed tool set and the arguments each tool accepts. Every tool only reads. */
export const mcpToolInputs = {
  list_classes: { includeArchived: z.boolean().optional().describe('Also list archived classes.') },
  list_lessons: { classId: mcpId },
  read_lesson: { lessonId: mcpId },
  list_activities: { classId: mcpId },
  read_activity: { activityId: mcpId },
  activity_results: { activityId: mcpId },
  list_learning_experiences: { classId: mcpId },
  read_learning_experience: { experienceId: mcpId },
  learning_progress: { experienceId: mcpId },
} satisfies Record<string, z.ZodRawShape>;

export type McpToolName = keyof typeof mcpToolInputs;
export type McpToolArgs<Name extends McpToolName> = z.infer<z.ZodObject<(typeof mcpToolInputs)[Name]>>;
