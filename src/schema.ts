/**
 * Zod schemas for frontmatter and config validation
 * Minimal validation - most keys pass through to the command
 */

import { z } from "zod";

/** Coerce any primitive value to string (for env vars where YAML may parse as bool/number) */
const stringCoerce = z.union([z.string(), z.number(), z.boolean()]).transform(v => String(v));

// ============================================================================
// Input Definition Schema (for form-style prompts)
// ============================================================================

/**
 * Input definition schema for typed prompts
 * Validates input type and associated options
 */
const inputDefinitionSchema = z.object({
  type: z.enum(['text', 'select', 'number', 'confirm', 'password']),
  description: z.string().optional(),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
  options: z.array(z.string()).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  required: z.boolean().optional(),
}).refine(
  (data) => {
    // If type is 'select', options must be provided
    if (data.type === 'select' && (!data.options || data.options.length === 0)) {
      return false;
    }
    return true;
  },
  { message: "Select type requires 'options' array with at least one item" }
).refine(
  (data) => {
    // If min/max provided, type should be 'number'
    if ((data.min !== undefined || data.max !== undefined) && data.type !== 'number') {
      return false;
    }
    return true;
  },
  { message: "'min' and 'max' are only valid for number type inputs" }
);

/**
 * Form inputs schema - either legacy string array or new object format
 */
const formInputsSchema = z.union([
  z.array(z.string()),
  z.record(z.string(), inputDefinitionSchema),
]);

export type InputDefinitionSchema = z.infer<typeof inputDefinitionSchema>;

// ============================================================================
// Config Schema (for ~/.mdflow/config.yaml and project configs)
// ============================================================================

/**
 * Command defaults schema - allows any key that becomes a CLI flag
 * Special keys:
 * - $1, $2, etc.: Positional argument mappings
 * - context_window: Token limit override (number)
 * - All other keys: CLI flag values (string, number, boolean, array)
 */
const commandDefaultsSchema = z.record(
  z.string(),
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.union([z.string(), z.number(), z.boolean()])),
  ])
).describe("Command-specific default flags");

/**
 * Global config schema for config.yaml files
 * Structure:
 * ```yaml
 * commands:
 *   claude:
 *     model: sonnet
 *     print: true
 *   gemini:
 *     model: pro
 * ```
 */
export const globalConfigSchema = z.object({
  commands: z.record(z.string(), commandDefaultsSchema).optional(),
}).strict().describe("Global mdflow configuration");

/** Type inferred from config schema */
export type GlobalConfigSchema = z.infer<typeof globalConfigSchema>;

/**
 * Validate config.yaml content
 * @throws Error with detailed message if validation fails
 */
export function validateConfig(data: unknown): GlobalConfigSchema {
  const result = globalConfigSchema.safeParse(data);

  if (!result.success) {
    const errors = formatZodIssues(result.error.issues);
    throw new Error(`Invalid config.yaml:\n  ${errors.join("\n  ")}`);
  }

  return result.data;
}

/**
 * Validate config without throwing - returns result object
 */
export function safeParseConfig(data: unknown): {
  success: boolean;
  data?: GlobalConfigSchema;
  errors?: string[];
} {
  const result = globalConfigSchema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors = formatZodIssues(result.error.issues);
  return { success: false, errors };
}

// ============================================================================
// Frontmatter Schema (for agent .md files)
// ============================================================================

/** Main frontmatter schema - minimal, passthrough everything else */
export const frontmatterSchema = z.object({
  // Form inputs - either legacy string array or new object format with typed definitions
  _inputs: formInputsSchema.optional(),

  // Environment variables (underscore-prefixed system key)
  // Object form sets process.env
  _env: z.record(z.string(), stringCoerce).optional(),
}).passthrough(); // Allow all other keys - they become CLI flags (including $1, $2, etc.)

/** Type inferred from schema */
export type FrontmatterSchema = z.infer<typeof frontmatterSchema>;

/**
 * Format zod issues into readable error strings
 */
function formatZodIssues(issues: Array<{ path: PropertyKey[]; message: string }>): string[] {
  return issues.map(issue => {
    const path = issue.path.map(String).join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}

/**
 * Validate parsed YAML against frontmatter schema
 */
export function validateFrontmatter(data: unknown): FrontmatterSchema {
  const result = frontmatterSchema.safeParse(data);

  if (!result.success) {
    const errors = formatZodIssues(result.error.issues);
    throw new Error(`Invalid frontmatter:\n  ${errors.join("\n  ")}`);
  }

  return result.data;
}

/**
 * Validate without throwing - returns result object
 */
export function safeParseFrontmatter(data: unknown): {
  success: boolean;
  data?: FrontmatterSchema;
  errors?: string[];
} {
  const result = frontmatterSchema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors = formatZodIssues(result.error.issues);
  return { success: false, errors };
}
