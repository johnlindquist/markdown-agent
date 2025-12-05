/**
 * Native context globs for including file contents in prompts
 * Resolves glob patterns and formats file contents for LLM consumption
 */

import { Glob } from "bun";
import { basename, relative } from "path";

export interface ContextFile {
  path: string;
  relativePath: string;
  content: string;
}

/**
 * Check if a pattern is a negation pattern
 */
function isNegation(pattern: string): boolean {
  return pattern.startsWith("!");
}

/**
 * Resolve glob patterns and read file contents
 * Supports negation patterns (starting with !)
 */
export async function resolveContextGlobs(
  patterns: string | string[],
  cwd: string = process.cwd()
): Promise<ContextFile[]> {
  const patternList = Array.isArray(patterns) ? patterns : [patterns];

  // Separate include and exclude patterns
  const includePatterns = patternList.filter(p => !isNegation(p));
  const excludePatterns = patternList.filter(isNegation).map(p => p.slice(1));

  // Collect all matching files from include patterns
  const matchedPaths = new Set<string>();
  for (const pattern of includePatterns) {
    const glob = new Glob(pattern);
    for await (const file of glob.scan({ cwd, absolute: true, onlyFiles: true })) {
      matchedPaths.add(file);
    }
  }

  // Remove files matching exclude patterns
  for (const pattern of excludePatterns) {
    const glob = new Glob(pattern);
    for await (const file of glob.scan({ cwd, absolute: true, onlyFiles: true })) {
      matchedPaths.delete(file);
    }
  }

  // Read file contents
  const files: ContextFile[] = [];
  for (const filePath of matchedPaths) {
    try {
      const file = Bun.file(filePath);
      const content = await file.text();
      files.push({
        path: filePath,
        relativePath: relative(cwd, filePath),
        content,
      });
    } catch (err) {
      console.warn(`Warning: Could not read ${filePath}: ${(err as Error).message}`);
    }
  }

  // Sort by path for consistent ordering
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  return files;
}

/**
 * Format context files as XML for LLM consumption
 */
export function formatContextAsXml(files: ContextFile[]): string {
  if (files.length === 0) return "";

  const parts = files.map(file => {
    // Use filename without extension as tag, with path as attribute
    const tag = slugifyPath(file.relativePath);
    return `<${tag} path="${file.relativePath}">\n${file.content}\n</${tag}>`;
  });

  return parts.join("\n\n");
}

/**
 * Convert file path to valid XML tag name
 */
function slugifyPath(path: string): string {
  // Get filename without directory
  const name = basename(path);

  // Remove extension, convert to lowercase, replace non-alphanumeric
  return name
    .replace(/\.[^.]+$/, "") // Remove extension
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^(\d)/, "_$1") || "file";
}

/**
 * Get summary stats for context files
 */
export function getContextStats(files: ContextFile[]): {
  fileCount: number;
  totalBytes: number;
  totalLines: number;
} {
  let totalBytes = 0;
  let totalLines = 0;

  for (const file of files) {
    totalBytes += Buffer.byteLength(file.content, "utf-8");
    totalLines += file.content.split("\n").length;
  }

  return {
    fileCount: files.length,
    totalBytes,
    totalLines,
  };
}
