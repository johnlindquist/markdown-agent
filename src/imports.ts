import { resolve, dirname } from "path";
import { homedir } from "os";

/**
 * Expand markdown imports and command inlines
 *
 * Supports two syntaxes:
 * - @~/path/to/file.md or @./relative/path.md - Inline file contents
 * - !`command` - Execute command and inline stdout/stderr
 *
 * Imports are processed recursively, with circular import detection.
 */

/** Track files being processed to detect circular imports */
type ImportStack = Set<string>;

/**
 * Expand a path that may start with ~ to use home directory
 */
function expandTilde(filePath: string): string {
  if (filePath.startsWith("~/") || filePath === "~") {
    return filePath.replace("~", homedir());
  }
  return filePath;
}

/**
 * Resolve an import path relative to the current file's directory
 */
function resolveImportPath(importPath: string, currentFileDir: string): string {
  const expanded = expandTilde(importPath);

  // Absolute paths (including expanded ~) stay as-is
  if (expanded.startsWith("/")) {
    return expanded;
  }

  // Relative paths resolve from current file's directory
  return resolve(currentFileDir, expanded);
}

/**
 * Pattern to match @filepath imports
 * Matches: @~/path/to/file.md, @./relative/path.md, @/absolute/path.md
 * The path continues until whitespace or end of line
 */
const FILE_IMPORT_PATTERN = /@(~?[.\/][^\s]+)/g;

/**
 * Pattern to match !`command` inlines
 * Matches: !`any command here`
 * Supports multi-word commands inside backticks
 */
const COMMAND_INLINE_PATTERN = /!\`([^`]+)\`/g;

/**
 * Process a single file import
 */
async function processFileImport(
  importPath: string,
  currentFileDir: string,
  stack: ImportStack,
  verbose: boolean
): Promise<string> {
  const resolvedPath = resolveImportPath(importPath, currentFileDir);

  // Check for circular imports
  if (stack.has(resolvedPath)) {
    const cycle = [...stack, resolvedPath].join(" -> ");
    throw new Error(`Circular import detected: ${cycle}`);
  }

  // Check if file exists
  const file = Bun.file(resolvedPath);
  if (!await file.exists()) {
    throw new Error(`Import not found: ${importPath} (resolved to ${resolvedPath})`);
  }

  if (verbose) {
    console.error(`[imports] Loading: ${importPath}`);
  }

  // Read file content
  const content = await file.text();

  // Recursively process imports in the imported file
  const newStack = new Set(stack);
  newStack.add(resolvedPath);

  return expandImports(content, dirname(resolvedPath), newStack, verbose);
}

/**
 * Process a single command inline
 */
async function processCommandInline(
  command: string,
  currentFileDir: string,
  verbose: boolean
): Promise<string> {
  if (verbose) {
    console.error(`[imports] Executing: ${command}`);
  }

  try {
    const result = Bun.spawnSync(["sh", "-c", command], {
      cwd: currentFileDir,
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = result.stdout.toString().trim();
    const stderr = result.stderr.toString().trim();

    // Combine stdout and stderr (stderr first if both exist)
    if (stderr && stdout) {
      return `${stderr}\n${stdout}`;
    }
    return stdout || stderr || "";
  } catch (err) {
    throw new Error(`Command failed: ${command} - ${(err as Error).message}`);
  }
}

/**
 * Expand all imports and command inlines in content
 *
 * @param content - The markdown content to process
 * @param currentFileDir - Directory of the current file (for relative imports)
 * @param stack - Set of files already being processed (for circular detection)
 * @param verbose - Whether to log import/command activity
 * @returns Content with all imports and commands expanded
 */
export async function expandImports(
  content: string,
  currentFileDir: string,
  stack: ImportStack = new Set(),
  verbose: boolean = false
): Promise<string> {
  let result = content;

  // Process file imports first
  // We need to process them one at a time due to async and potential path changes
  let match;

  // Reset regex state and find all file imports
  FILE_IMPORT_PATTERN.lastIndex = 0;
  const fileImports: Array<{ full: string; path: string; index: number }> = [];

  while ((match = FILE_IMPORT_PATTERN.exec(content)) !== null) {
    fileImports.push({
      full: match[0],
      path: match[1],
      index: match.index,
    });
  }

  // Process file imports in reverse order to preserve indices
  for (const imp of fileImports.reverse()) {
    const replacement = await processFileImport(imp.path, currentFileDir, stack, verbose);
    result = result.slice(0, imp.index) + replacement + result.slice(imp.index + imp.full.length);
  }

  // Process command inlines
  COMMAND_INLINE_PATTERN.lastIndex = 0;
  const commandInlines: Array<{ full: string; command: string; index: number }> = [];

  while ((match = COMMAND_INLINE_PATTERN.exec(result)) !== null) {
    commandInlines.push({
      full: match[0],
      command: match[1],
      index: match.index,
    });
  }

  // Process command inlines in reverse order to preserve indices
  for (const cmd of commandInlines.reverse()) {
    const replacement = await processCommandInline(cmd.command, currentFileDir, verbose);
    result = result.slice(0, cmd.index) + replacement + result.slice(cmd.index + cmd.full.length);
  }

  return result;
}

/**
 * Check if content contains any imports or command inlines
 */
export function hasImports(content: string): boolean {
  FILE_IMPORT_PATTERN.lastIndex = 0;
  COMMAND_INLINE_PATTERN.lastIndex = 0;

  return FILE_IMPORT_PATTERN.test(content) || COMMAND_INLINE_PATTERN.test(content);
}
