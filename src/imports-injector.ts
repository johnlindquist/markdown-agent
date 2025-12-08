/**
 * Phase 3: Pure Injector
 *
 * Stitches resolved content back into the original template.
 * This is a pure function with no I/O.
 */

import type { ResolvedImport } from './imports-types';

/**
 * Inject resolved imports back into the original content
 *
 * This is a pure function that replaces import markers with their resolved content.
 * It processes imports in reverse order to preserve string indices.
 *
 * @param original - The original content with import markers
 * @param resolved - Array of resolved imports with their content
 * @returns The content with all imports replaced by their resolved content
 */
export function injectImports(original: string, resolved: ResolvedImport[]): string {
  if (resolved.length === 0) {
    return original;
  }

  let result = original;

  // Sort by index in descending order to process from end to start
  // This preserves indices as we make replacements
  const sortedResolved = [...resolved].sort((a, b) => b.action.index - a.action.index);

  for (const { action, content } of sortedResolved) {
    const before = result.slice(0, action.index);
    const after = result.slice(action.index + action.original.length);
    result = before + content + after;
  }

  return result;
}

/**
 * Create a ResolvedImport from an action and content
 *
 * Utility function to create resolved imports for testing or manual construction.
 *
 * @param action - The import action
 * @param content - The resolved content
 * @returns A ResolvedImport object
 */
export function createResolvedImport(
  action: ResolvedImport['action'],
  content: string
): ResolvedImport {
  return { action, content };
}
