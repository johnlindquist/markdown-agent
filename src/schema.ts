/**
 * Zod schemas for frontmatter validation
 * Minimal validation - most keys pass through to the command
 */

import { z } from "zod";

/** Coerce any primitive value to string (for env vars where YAML may parse as bool/number) */
const stringCoerce = z.union([z.string(), z.number(), z.boolean()]).transform(v => String(v));

/** Main frontmatter schema - minimal, passthrough everything else */
export const frontmatterSchema = z.object({
  // Named positional arguments
  args: z.array(z.string()).optional(),

  // Environment variables: Object (config) or Array/String (flag)
  // Object values can be string, number, or boolean (coerced to string)
  env: z.union([
    z.record(z.string(), stringCoerce),
    z.array(z.string()),
    z.string()
  ]).optional(),
}).passthrough(); // Allow all other keys - they become CLI flags (including $1, $2, etc.)

/** Type inferred from schema */
export type FrontmatterSchema = z.infer<typeof frontmatterSchema>;

/**
 * Format zod issues into readable error strings
 */
function formatZodIssues(issues: Array<{ path: (string | number)[]; message: string }>): string[] {
  return issues.map(issue => {
    const path = issue.path.join(".");
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
