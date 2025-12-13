# Executable Code Fence Feature Expert Bundle

## Executive Summary

mdflow needs a new feature to execute code fences that contain a shebang line (e.g., `#!/usr/bin/env bun`). When a code fence starts with a shebang, the code inside should be executed using the specified interpreter, and the output should replace the code fence in the final prompt.

### Key Problems:
1. Code fences are currently static content passed through unchanged
2. Users need a way to execute dynamic TypeScript/JavaScript during template processing
3. The existing `` !`cmd` `` syntax is awkward for multi-line code

### Required Changes:
1. `src/imports-types.ts`: Add `ExecutableCodeFenceAction` type
2. `src/imports-parser.ts`: Detect code fences with shebangs
3. `src/imports.ts`: Execute code fences and inject output

### Files Included:
- `src/imports-types.ts`: Import action type definitions
- `src/imports-parser.ts`: Context-aware parser (already detects code fences)
- `src/imports.ts`: Main import expansion with command execution
- `src/template.ts`: Template variable substitution
- `src/cli-runner.ts`: Orchestration flow
- `CLAUDE.md`: Project documentation

---

# Packx Output

This file contains 6 filtered files from the repository.

## Files

### src/imports-parser.ts

```ts
/**
 * Phase 1: Pure Parser
 *
 * Scans content and returns a list of ImportActions.
 * This is a pure function with no I/O - uses a context-aware scanner
 * that properly ignores imports inside code blocks.
 */

import type {
  ImportAction,
  FileImportAction,
  GlobImportAction,
  UrlImportAction,
  CommandImportAction,
  SymbolImportAction,
} from './imports-types';

/**
 * Context state for the scanner
 */
type ScanContext = 'normal' | 'fenced_code' | 'inline_code';

/**
 * Scans content character by character, tracking context to determine
 * if we're inside a code block (fenced or inline).
 *
 * Returns an array of "safe" ranges where imports can be parsed.
 * Exported for unit testing.
 */
export function findSafeRanges(content: string): Array<{ start: number; end: number }> {
  const safeRanges: Array<{ start: number; end: number }> = [];
  let context: ScanContext = 'normal';
  let rangeStart = 0;
  let i = 0;

  while (i < content.length) {
    if (context === 'normal') {
      // Check for fenced code block start (``` or ~~~)
      if (
        (content[i] === '`' && content.slice(i, i + 3) === '```') ||
        (content[i] === '~' && content.slice(i, i + 3) === '~~~')
      ) {
        // End current safe range before the fence
        if (i > rangeStart) {
          safeRanges.push({ start: rangeStart, end: i });
        }
        context = 'fenced_code';
        // Skip the opening fence and any language identifier on the same line
        const fenceChar = content[i];
        i += 3;
        // Skip to end of line (the info string after ```)
        while (i < content.length && content[i] !== '\n') {
          i++;
        }
        continue;
      }

      // Check for inline code start (single backtick, not followed by another)
      if (content[i] === '`' && content[i + 1] !== '`') {
        // End current safe range before the backtick
        if (i > rangeStart) {
          safeRanges.push({ start: rangeStart, end: i });
        }
        context = 'inline_code';
        i++;
        continue;
      }

      i++;
    } else if (context === 'fenced_code') {
      // Look for closing fence (``` or ~~~)
      // Must be at start of line (after newline or at start of content)
      const atLineStart = i === 0 || content[i - 1] === '\n';
      if (
        atLineStart &&
        ((content[i] === '`' && content.slice(i, i + 3) === '```') ||
          (content[i] === '~' && content.slice(i, i + 3) === '~~~'))
      ) {
        // Skip the closing fence
        i += 3;
        // Skip to end of line
        while (i < content.length && content[i] !== '\n') {
          i++;
        }
        if (i < content.length) {
          i++; // Skip the newline
        }
        context = 'normal';
        rangeStart = i;
        continue;
      }
      i++;
    } else if (context === 'inline_code') {
      // Look for closing backtick
      if (content[i] === '`') {
        i++; // Skip the closing backtick
        context = 'normal';
        rangeStart = i;
        continue;
      }
      // Inline code cannot span multiple lines in standard markdown
      if (content[i] === '\n') {
        context = 'normal';
        rangeStart = i;
      }
      i++;
    }
  }

  // Add final range if we ended in normal context
  if (context === 'normal' && rangeStart < content.length) {
    safeRanges.push({ start: rangeStart, end: content.length });
  }

  return safeRanges;
}

/**
 * Check if an index falls within any of the safe ranges
 */
function isInSafeRange(index: number, safeRanges: Array<{ start: number; end: number }>): boolean {
  for (const range of safeRanges) {
    if (index >= range.start && index < range.end) {
      return true;
    }
  }
  return false;
}

/**
 * Pattern to match @filepath imports (including globs, line ranges, and symbols)
 * Matches: @~/path/to/file.md, @./relative/path.md, @/absolute/path.md
 * Also: @./src/**\/*.ts, @./file.ts:10-50, @./file.ts#Symbol
 * The path continues until whitespace or end of line
 */
const FILE_IMPORT_PATTERN = /@(~?[./][^\s]+)/g;

/**
 * Pattern to match !`command` inlines with balanced backticks
 * Matches: !`any command here`, !``cmd with `backticks` ``
 * Supports commands containing backticks by using variable-length delimiters.
 * Capture group 1: The backtick delimiter (` or `` or ```)
 * Capture group 2: The command content
 */
const COMMAND_INLINE_PATTERN = /!(`+)([\s\S]+?)\1/g;

/**
 * Pattern to match @url imports
 * Matches: @https://example.com/path, @http://example.com/path
 * Does NOT match emails like foo@example.com (requires http:// or https://)
 * The URL continues until whitespace or end of line
 */
const URL_IMPORT_PATTERN = /@(https?:\/\/[^\s]+)/g;

/**
 * Check if a path contains glob characters
 */
export function isGlobPattern(path: string): boolean {
  return path.includes('*') || path.includes('?') || path.includes('[');
}

/**
 * Parse import path for line range syntax: @./file.ts:10-50
 */
export function parseLineRange(path: string): { path: string; start?: number; end?: number } {
  const match = path.match(/^(.+):(\d+)-(\d+)$/);
  if (match && match[1] && match[2] && match[3]) {
    return {
      path: match[1],
      start: parseInt(match[2], 10),
      end: parseInt(match[3], 10),
    };
  }
  return { path };
}

/**
 * Parse import path for symbol extraction: @./file.ts#SymbolName
 */
export function parseSymbolExtraction(path: string): { path: string; symbol?: string } {
  const match = path.match(/^(.+)#([a-zA-Z_$][a-zA-Z0-9_$]*)$/);
  if (match && match[1] && match[2]) {
    return {
      path: match[1],
      symbol: match[2],
    };
  }
  return { path };
}

/**
 * Parse a single file import path into the appropriate action type
 */
function parseFileImportPath(
  fullMatch: string,
  path: string,
  index: number
): FileImportAction | GlobImportAction | SymbolImportAction {
  // Check for glob pattern first
  if (isGlobPattern(path)) {
    return {
      type: 'glob',
      pattern: path,
      original: fullMatch,
      index,
    };
  }

  // Check for symbol extraction syntax
  const symbolParsed = parseSymbolExtraction(path);
  if (symbolParsed.symbol) {
    return {
      type: 'symbol',
      path: symbolParsed.path,
      symbol: symbolParsed.symbol,
      original: fullMatch,
      index,
    };
  }

  // Check for line range syntax
  const rangeParsed = parseLineRange(path);
  if (rangeParsed.start !== undefined && rangeParsed.end !== undefined) {
    return {
      type: 'file',
      path: rangeParsed.path,
      lineRange: { start: rangeParsed.start, end: rangeParsed.end },
      original: fullMatch,
      index,
    };
  }

  // Regular file import
  return {
    type: 'file',
    path,
    original: fullMatch,
    index,
  };
}

/**
 * Parse all imports from content
 *
 * This is a pure function that scans the content and returns all found imports.
 * It does NOT perform any I/O operations.
 *
 * Uses a context-aware scanner to ignore imports inside:
 * - Fenced code blocks (``` or ~~~)
 * - Inline code spans (`)
 *
 * @param content - The content to scan for imports
 * @returns Array of ImportActions, sorted by index (position in string)
 */
export function parseImports(content: string): ImportAction[] {
  const actions: ImportAction[] = [];

  // Find safe ranges where imports should be parsed (outside code blocks)
  const safeRanges = findSafeRanges(content);

  // Parse file imports (includes globs, line ranges, symbols)
  FILE_IMPORT_PATTERN.lastIndex = 0;
  let match;

  while ((match = FILE_IMPORT_PATTERN.exec(content)) !== null) {
    // Only include imports that are in safe ranges (outside code blocks)
    if (isInSafeRange(match.index, safeRanges) && match[1]) {
      const action = parseFileImportPath(match[0], match[1], match.index);
      actions.push(action);
    }
  }

  // Parse URL imports
  URL_IMPORT_PATTERN.lastIndex = 0;
  while ((match = URL_IMPORT_PATTERN.exec(content)) !== null) {
    // Only include imports that are in safe ranges (outside code blocks)
    if (isInSafeRange(match.index, safeRanges) && match[1]) {
      const urlAction: UrlImportAction = {
        type: 'url',
        url: match[1],
        original: match[0],
        index: match.index,
      };
      actions.push(urlAction);
    }
  }

  // Parse command inlines (with balanced backtick support)
  // match[1] = backtick delimiter, match[2] = command content
  COMMAND_INLINE_PATTERN.lastIndex = 0;
  while ((match = COMMAND_INLINE_PATTERN.exec(content)) !== null) {
    // Only include imports that are in safe ranges (outside code blocks)
    const commandContent = match[2];
    if (isInSafeRange(match.index, safeRanges) && commandContent) {
      const cmdAction: CommandImportAction = {
        type: 'command',
        command: commandContent,
        original: match[0],
        index: match.index,
      };
      actions.push(cmdAction);
    }
  }

  // Sort by index to maintain order
  actions.sort((a, b) => a.index - b.index);

  return actions;
}

/**
 * Check if content contains any imports
 *
 * Uses context-aware scanning to ignore imports inside code blocks.
 *
 * @param content - The content to check
 * @returns true if any imports are found outside of code blocks
 */
export function hasImportsInContent(content: string): boolean {
  // Use parseImports which is already context-aware
  return parseImports(content).length > 0;
}

```

### src/cli-runner.ts

```ts
/**
 * CliRunner - Testable entry point for mdflow CLI
 *
 * This class encapsulates all orchestration logic from main(), accepting
 * a SystemEnvironment for dependency injection. This enables testing
 * without spawning actual subprocesses or touching the real filesystem.
 */

import { parseFrontmatter } from "./parse";
import { parseCliArgs, handleMaCommands } from "./cli";
import type { AgentFrontmatter } from "./types";
import { substituteTemplateVars, extractTemplateVars } from "./template";
import { isRemoteUrl, fetchRemote, cleanupRemote } from "./remote";
import {
  resolveCommand, buildArgs, runCommand, extractPositionalMappings,
  extractEnvVars, killCurrentChildProcess, hasInteractiveMarker,
} from "./command";
import { expandImports, hasImports } from "./imports";
import { loadEnvFiles } from "./env";
import {
  loadGlobalConfig, getCommandDefaults, applyDefaults, applyInteractiveMode,
} from "./config";
import {
  initLogger, getParseLogger, getTemplateLogger, getCommandLogger,
  getImportLogger, getCurrentLogPath,
} from "./logger";
import { isDomainTrusted, promptForTrust, addTrustedDomain, extractDomain } from "./trust";
import { dirname, resolve, join } from "path";
import { homedir } from "os";
import { input } from "@inquirer/prompts";
import { exceedsLimit, StdinSizeLimitError } from "./limits";
import { countTokens } from "./tokenizer";
import {
  MarkdownAgentError, EarlyExitRequest, UserCancelledError, FileNotFoundError,
  NetworkError, SecurityError, ConfigurationError, TemplateError, ImportError,
} from "./errors";
import type { SystemEnvironment } from "./system-environment";

/** Result from CliRunner.run() */
export interface CliRunResult {
  exitCode: number;
  errorMessage?: string;
  logPath?: string | null;
}

/** Options for CliRunner */
export interface CliRunnerOptions {
  env: SystemEnvironment;
  processEnv?: Record<string, string | undefined>;
  cwd?: string;
  isStdinTTY?: boolean;
  stdinContent?: string;
  promptInput?: (message: string) => Promise<string>;
}

/** CliRunner - Main orchestrator for mdflow CLI */
export class CliRunner {
  private env: SystemEnvironment;
  private processEnv: Record<string, string | undefined>;
  private cwd: string;
  private isStdinTTY: boolean;
  private stdinContent: string | undefined;
  private promptInput: (message: string) => Promise<string>;

  constructor(options: CliRunnerOptions) {
    this.env = options.env;
    this.processEnv = options.processEnv ?? process.env;
    this.cwd = options.cwd ?? process.cwd();
    this.isStdinTTY = options.isStdinTTY ?? Boolean(process.stdin.isTTY);
    this.stdinContent = options.stdinContent;
    this.promptInput = options.promptInput ?? ((msg) => input({ message: msg }));
  }

  private async readStdin(): Promise<string> {
    if (this.stdinContent !== undefined) return this.stdinContent;
    if (this.isStdinTTY) return "";
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    for await (const chunk of process.stdin) {
      totalBytes += chunk.length;
      if (exceedsLimit(totalBytes)) throw new StdinSizeLimitError(totalBytes);
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString("utf-8").trim();
  }

  private writeStdout(data: string): void { console.log(data); }
  private writeStderr(data: string): void { console.error(data); }

  private printErrorWithLogPath(message: string, logPath: string | null): void {
    this.writeStderr(`\n${message}`);
    if (logPath) this.writeStderr(`   Detailed logs: ${logPath}`);
  }

  /**
   * Resolve file path by checking multiple locations in order:
   * 1. As-is (absolute path or relative to cwd)
   * 2. Project agents: ./.mdflow/<filename>
   * 3. User agents: ~/.mdflow/<filename>
   * 4. PATH directories (for files without path separators)
   */
  private async resolveFilePath(filePath: string): Promise<string> {
    // 1. Try as-is (could be absolute or relative from cwd)
    if (await this.env.fs.exists(filePath)) {
      return filePath;
    }

    // Only search directories for simple filenames (no path separators)
    if (!filePath.includes("/")) {
      // 2. Try ./.mdflow/
      const projectPath = join(this.cwd, ".mdflow", filePath);
      if (await this.env.fs.exists(projectPath)) {
        return projectPath;
      }

      // 3. Try ~/.mdflow/
      const userPath = join(homedir(), ".mdflow", filePath);
      if (await this.env.fs.exists(userPath)) {
        return userPath;
      }

      // 4. Try $PATH directories
      const pathDirs = (this.processEnv.PATH || "").split(":");
      for (const dir of pathDirs) {
        if (!dir) continue;
        const pathFilePath = join(dir, filePath);
        if (await this.env.fs.exists(pathFilePath)) {
          return pathFilePath;
        }
      }
    }

    // Not found anywhere - return original for error message
    return filePath;
  }

  async run(argv: string[]): Promise<CliRunResult> {
    let logPath: string | null = null;
    try {
      return await this.runInternal(argv, (lp) => { logPath = lp; });
    } catch (err) {
      return this.handleError(err, logPath);
    }
  }

  private handleError(err: unknown, logPath: string | null): CliRunResult {
    if (err instanceof EarlyExitRequest) return { exitCode: err.code, logPath };
    if (err instanceof UserCancelledError) return { exitCode: err.code, logPath };
    if (err instanceof MarkdownAgentError) {
      this.printErrorWithLogPath(`Agent failed: ${err.message}`, logPath);
      return { exitCode: err.code, errorMessage: err.message, logPath };
    }
    const errorMessage = (err as Error).message;
    this.printErrorWithLogPath(`Agent failed: ${errorMessage}`, logPath);
    return { exitCode: 1, errorMessage, logPath };
  }

  private async runInternal(
    argv: string[],
    setLogPath: (lp: string | null) => void
  ): Promise<CliRunResult> {
    const cliArgs = parseCliArgs(argv);
    const subcommand = cliArgs.filePath;

    // Handle subcommands
    if (subcommand === "create") {
      const { runCreate } = await import("./create");
      await runCreate(cliArgs.passthroughArgs);
      return { exitCode: 0 };
    }
    if (subcommand === "setup") {
      const { runSetup } = await import("./setup");
      await runSetup();
      return { exitCode: 0 };
    }
    if (subcommand === "logs") {
      const { getLogDir, listLogDirs } = await import("./logger");
      this.writeStdout(`Log directory: ${getLogDir()}\n`);
      const dirs = listLogDirs();
      if (dirs.length === 0) {
        this.writeStdout("No agent logs yet. Run an agent to generate logs.");
      } else {
        this.writeStdout("Agent logs:");
        dirs.forEach((d) => this.writeStdout(`  ${d}/`));
      }
      return { exitCode: 0 };
    }
    if (subcommand === "help") cliArgs.help = true;

    let filePath = cliArgs.filePath;
    if (!filePath || subcommand === "help") {
      const result = await handleMaCommands(cliArgs);
      if (result.selectedFile) filePath = result.selectedFile;
      else if (!result.handled) {
        this.writeStderr("Usage: md <file.md> [flags for command]");
        this.writeStderr("       md <command> [options]");
        this.writeStderr("\nCommands: create, setup, logs, help");
        this.writeStderr("Run 'md help' for more info");
        throw new ConfigurationError("No agent file specified", 1);
      }
    }

    return this.runAgent(filePath, cliArgs.passthroughArgs, setLogPath);
  }

  private async runAgent(
    filePath: string,
    passthroughArgs: string[],
    setLogPath: (lp: string | null) => void
  ): Promise<CliRunResult> {
    let localFilePath = filePath;
    let isRemote = false;

    // Check for --_no-cache flag early (needed before fetchRemote call)
    let noCacheFlag = false;
    const noCacheIdx = passthroughArgs.indexOf("--_no-cache");
    if (noCacheIdx !== -1) {
      noCacheFlag = true;
      passthroughArgs = [...passthroughArgs.slice(0, noCacheIdx), ...passthroughArgs.slice(noCacheIdx + 1)];
    }

    if (isRemoteUrl(filePath)) {
      const remoteResult = await fetchRemote(filePath, { noCache: noCacheFlag });
      if (!remoteResult.success) {
        throw new NetworkError(`Failed to fetch remote file: ${remoteResult.error}`);
      }
      localFilePath = remoteResult.localPath!;
      isRemote = true;
    } else {
      // Resolve local file path by checking multiple directories
      localFilePath = await this.resolveFilePath(filePath);
    }

    // Signal handling
    const handleSignal = async (signal: string) => {
      killCurrentChildProcess();
      if (isRemote) await cleanupRemote(localFilePath);
      process.exit(signal === "SIGINT" ? 130 : 143);
    };
    process.on("SIGINT", () => handleSignal("SIGINT"));
    process.on("SIGTERM", () => handleSignal("SIGTERM"));

    if (!(await this.env.fs.exists(localFilePath))) {
      throw new FileNotFoundError(`File not found: ${localFilePath}`);
    }

    const fileDir = dirname(resolve(localFilePath));
    await loadEnvFiles(fileDir);

    const logger = initLogger(localFilePath);
    const logPath = getCurrentLogPath();
    setLogPath(logPath);
    logger.info({ filePath: localFilePath }, "Session started");

    const stdinContent = await this.readStdin();
    const content = await this.env.fs.readText(localFilePath);
    const { frontmatter: baseFrontmatter, body: rawBody } = parseFrontmatter(content);
    getParseLogger().debug({ frontmatter: baseFrontmatter, bodyLength: rawBody.length }, "Frontmatter parsed");

    // Parse CLI flags
    const parsed = this.parseFlags(passthroughArgs);
    const { command, frontmatter, templateVars, finalBody, args, positionalMappings } =
      await this.processAgent(localFilePath, baseFrontmatter, rawBody, stdinContent, parsed);

    // Dry run
    if (parsed.dryRun) {
      return this.handleDryRun(command, frontmatter, args, [finalBody], positionalMappings, logger, isRemote, localFilePath, logPath);
    }

    // TOFU check
    if (isRemote && !parsed.trustFlag) {
      await this.handleTOFU(filePath, localFilePath, command, baseFrontmatter, rawBody);
    }

    // Execute
    let finalRunArgs = args;
    if (frontmatter._subcommand) {
      const subs = Array.isArray(frontmatter._subcommand) ? frontmatter._subcommand : [frontmatter._subcommand];
      finalRunArgs = [...subs, ...args];
    }

    getCommandLogger().info({ command, argsCount: finalRunArgs.length, promptLength: finalBody.length }, "Executing command");

    const runResult = await runCommand({
      command, args: finalRunArgs, positionals: [finalBody], positionalMappings, captureOutput: false, env: extractEnvVars(frontmatter),
    });

    getCommandLogger().info({ exitCode: runResult.exitCode }, "Command completed");
    if (isRemote) await cleanupRemote(localFilePath);

    if (runResult.exitCode !== 0) {
      this.printErrorWithLogPath(`Agent exited with code ${runResult.exitCode}`, logPath);
    }

    logger.info({ exitCode: runResult.exitCode }, "Session ended");
    return { exitCode: runResult.exitCode, logPath };
  }

  private parseFlags(passthroughArgs: string[]) {
    let remainingArgs = [...passthroughArgs];
    let commandFromCli: string | undefined;
    let dryRun = false, trustFlag = false, interactiveFromCli = false, noCache = false;
    let cwdFromCli: string | undefined;

    const cmdIdx = remainingArgs.findIndex((a) => a === "--_command" || a === "-_c");
    if (cmdIdx !== -1 && cmdIdx + 1 < remainingArgs.length) {
      commandFromCli = remainingArgs[cmdIdx + 1];
      remainingArgs.splice(cmdIdx, 2);
    }
    const dryIdx = remainingArgs.indexOf("--_dry-run");
    if (dryIdx !== -1) { dryRun = true; remainingArgs.splice(dryIdx, 1); }
    const trustIdx = remainingArgs.indexOf("--_trust");
    if (trustIdx !== -1) { trustFlag = true; remainingArgs.splice(trustIdx, 1); }
    const noCacheIdx = remainingArgs.indexOf("--_no-cache");
    if (noCacheIdx !== -1) { noCache = true; remainingArgs.splice(noCacheIdx, 1); }
    const intIdx = remainingArgs.findIndex((a) => a === "--_interactive" || a === "-_i");
    if (intIdx !== -1) { interactiveFromCli = true; remainingArgs.splice(intIdx, 1); }
    const cwdIdx = remainingArgs.findIndex((a) => a === "--_cwd");
    if (cwdIdx !== -1 && cwdIdx + 1 < remainingArgs.length) {
      cwdFromCli = remainingArgs[cwdIdx + 1];
      remainingArgs.splice(cwdIdx, 2);
    }

    return { remainingArgs, commandFromCli, dryRun, trustFlag, interactiveFromCli, cwdFromCli, noCache };
  }

  private async processAgent(
    localFilePath: string,
    baseFrontmatter: Record<string, unknown>,
    rawBody: string,
    stdinContent: string,
    parsed: ReturnType<typeof this.parseFlags>
  ) {
    const { remainingArgs, commandFromCli, interactiveFromCli, cwdFromCli } = parsed;
    let remaining = [...remainingArgs];

    // Resolve command
    let command: string;
    if (commandFromCli) {
      command = commandFromCli;
      getCommandLogger().debug({ command, source: "cli" }, "Command from --_command flag");
    } else {
      command = resolveCommand(localFilePath);
      getCommandLogger().debug({ command }, "Command resolved");
    }

    await loadGlobalConfig();
    const commandDefaults = await getCommandDefaults(command);
    let frontmatter = applyDefaults(baseFrontmatter as AgentFrontmatter, commandDefaults);
    const interactiveFromFilename = hasInteractiveMarker(localFilePath);
    frontmatter = applyInteractiveMode(frontmatter, command, interactiveFromFilename || interactiveFromCli);

    const envVars = extractEnvVars(frontmatter);
    if (envVars) Object.entries(envVars).forEach(([k, v]) => { this.processEnv[k] = v; });

    // Template vars - all use _prefix (e.g., _name in frontmatter → {{ _name }} in body)
    let templateVars: Record<string, string> = {};

    // Inject stdin as _stdin template variable
    if (stdinContent) {
      templateVars["_stdin"] = stdinContent;
    }

    // Extract _varname fields from frontmatter and match with --_varname CLI flags
    // Variables starting with _ are template variables (except internal keys)
    const internalKeys = new Set(["_interactive", "_i", "_cwd", "_subcommand"]);
    const namedVarFields = Object.keys(frontmatter).filter((k) => k.startsWith("_") && !internalKeys.has(k));
    for (const key of namedVarFields) {
      const defaultValue = frontmatter[key];
      // CLI flag matches the full key including underscore: --_name
      const flag = `--${key}`;
      const idx = remaining.findIndex((a) => a === flag);
      const flagValue = idx !== -1 && idx + 1 < remaining.length ? remaining[idx + 1] : undefined;
      if (flagValue !== undefined) {
        templateVars[key] = flagValue;
        remaining.splice(idx, 2);
      } else if (defaultValue != null && defaultValue !== "") {
        templateVars[key] = String(defaultValue);
      }
    }

    // Also extract any --_varname CLI flags not declared in frontmatter
    // This allows optional template vars without frontmatter declaration
    // Supports both --_key value and --_key=value syntax
    for (let i = remaining.length - 1; i >= 0; i--) {
      const arg = remaining[i];
      if (!arg) continue;
      // Check for --_key=value syntax
      if (arg.startsWith("--_") && arg.includes("=")) {
        const eqIndex = arg.indexOf("=");
        const key = arg.slice(2, eqIndex); // Remove -- and get key before =
        if (!internalKeys.has(key)) {
          templateVars[key] = arg.slice(eqIndex + 1);
          remaining.splice(i, 1);
        }
      } else if (arg.startsWith("--_") && !internalKeys.has(arg.slice(2))) {
        const key = arg.slice(2); // Remove --
        const nextArg = remaining[i + 1];
        if (i + 1 < remaining.length && nextArg && !nextArg.startsWith("-")) {
          templateVars[key] = nextArg;
          remaining.splice(i, 2);
        } else {
          // Boolean flag without value
          templateVars[key] = "true";
          remaining.splice(i, 1);
        }
      }
    }

    // Inject positional CLI args as template variables (_1, _2, etc.)
    // First, separate flags from positional args in remaining
    const positionalCliArgs: string[] = [];
    const flagArgs: string[] = [];
    for (let i = 0; i < remaining.length; i++) {
      const arg = remaining[i];
      if (!arg) continue;
      if (arg.startsWith("-")) {
        // It's a flag - include it and its value if present
        flagArgs.push(arg);
        const nextArg = remaining[i + 1];
        if (i + 1 < remaining.length && nextArg && !nextArg.startsWith("-")) {
          flagArgs.push(nextArg);
          i++;
        }
      } else {
        // It's a positional arg
        positionalCliArgs.push(arg);
      }
    }
    // Inject positional args as _1, _2, etc. template variables
    // Uses underscore prefix to match other template var conventions
    for (let i = 0; i < positionalCliArgs.length; i++) {
      const posArg = positionalCliArgs[i];
      if (posArg) templateVars[`_${i + 1}`] = posArg;
    }
    // Inject _args as all positional args formatted as a numbered list
    if (positionalCliArgs.length > 0) {
      templateVars["_args"] = positionalCliArgs.map((arg, i) => `${i + 1}. ${arg}`).join("\n");
    }
    // Update remaining to only contain flag args (positionals consumed for templates)
    remaining = flagArgs;

    // Expand imports
    let expandedBody = rawBody;
    const fileDir = dirname(resolve(localFilePath));
    if (hasImports(rawBody)) {
      try {
        const commandCwd = cwdFromCli ?? (frontmatter._cwd as string | undefined) ?? this.cwd;
        getImportLogger().debug({ fileDir, commandCwd, templateVarCount: Object.keys(templateVars).length }, "Expanding imports");
        expandedBody = await expandImports(rawBody, fileDir, new Set(), false, {
          invocationCwd: commandCwd,
          templateVars,
        });
        getImportLogger().debug({ originalLength: rawBody.length, expandedLength: expandedBody.length }, "Imports expanded");
      } catch (err) {
        getImportLogger().error({ error: (err as Error).message }, "Import expansion failed");
        throw new ImportError(`Import error: ${(err as Error).message}`);
      }
    }

    // Missing vars
    const requiredVars = extractTemplateVars(expandedBody);
    const missingVars = requiredVars.filter((v) => !(v in templateVars));
    if (missingVars.length > 0) {
      if (this.isStdinTTY) {
        this.writeStderr("Missing required variables. Please provide values:");
        for (const v of missingVars) templateVars[v] = await this.promptInput(`${v}:`);
      } else {
        throw new TemplateError(`Missing template variables: ${missingVars.join(", ")}. Use 'args:' in frontmatter to map CLI arguments to variables`);
      }
    }

    getTemplateLogger().debug({ vars: Object.keys(templateVars) }, "Substituting template variables");
    const body = substituteTemplateVars(expandedBody, templateVars);
    getTemplateLogger().debug({ bodyLength: body.length }, "Template substitution complete");

    // Cat file if no frontmatter
    if (Object.keys(baseFrontmatter).length === 0 && !commandDefaults) {
      try { resolveCommand(localFilePath); }
      catch { this.writeStdout(await this.env.fs.readText(localFilePath)); throw new EarlyExitRequest(); }
    }

    let finalBody = body;

    const templateVarSet = new Set(Object.keys(templateVars));
    const args = [...buildArgs(frontmatter, templateVarSet), ...remaining];
    const positionalMappings = extractPositionalMappings(frontmatter);

    return { command, frontmatter, templateVars, finalBody, args, positionalMappings };
  }

  private async handleDryRun(
    command: string, frontmatter: Record<string, unknown>, args: string[],
    positionals: string[], positionalMappings: Map<number, string>,
    logger: ReturnType<typeof initLogger>, isRemote: boolean, localFilePath: string, logPath: string | null
  ): Promise<CliRunResult> {
    this.writeStdout("═══════════════════════════════════════════════════════════");
    this.writeStdout("DRY RUN - Command will NOT be executed");
    this.writeStdout("═══════════════════════════════════════════════════════════\n");

    let dryRunArgs = [...args];
    if (frontmatter._subcommand) {
      const subCmd = frontmatter._subcommand;
      const subs = Array.isArray(subCmd) ? subCmd.map(String) : [String(subCmd)];
      dryRunArgs = [...subs, ...dryRunArgs];
    }

    for (let i = 0; i < positionals.length; i++) {
      const pos = i + 1, value = positionals[i] ?? "";
      if (positionalMappings.has(pos)) {
        const flagName = positionalMappings.get(pos)!;
        dryRunArgs.push(flagName.length === 1 ? `-${flagName}` : `--${flagName}`, `"${value.replace(/"/g, '\\"')}"`);
      } else {
        dryRunArgs.push(`"${value.replace(/"/g, '\\"')}"`);
      }
    }

    this.writeStdout("Command:");
    this.writeStdout(`   ${command} ${dryRunArgs.join(" ")}\n`);
    this.writeStdout("Final Prompt:");
    this.writeStdout("───────────────────────────────────────────────────────────");
    this.writeStdout(positionals[0] ?? "");
    this.writeStdout("───────────────────────────────────────────────────────────\n");
    this.writeStdout(`Estimated tokens: ~${countTokens(positionals[0] ?? "").toLocaleString()}`);

    if (isRemote) await cleanupRemote(localFilePath);
    logger.info({ dryRun: true }, "Dry run completed");
    throw new EarlyExitRequest();
  }

  private async handleTOFU(
    filePath: string, localFilePath: string, command: string,
    baseFrontmatter: Record<string, unknown>, rawBody: string
  ): Promise<void> {
    const domain = extractDomain(filePath);
    const trusted = await isDomainTrusted(filePath);

    if (!trusted) {
      if (!this.isStdinTTY) {
        await cleanupRemote(localFilePath);
        throw new SecurityError(`Untrusted remote domain: ${domain}. Use --_trust flag to bypass this check in non-interactive mode, or run interactively to add the domain to known_hosts.`);
      }

      const trustResult = await promptForTrust(filePath, command, baseFrontmatter as AgentFrontmatter, rawBody);
      if (!trustResult.approved) {
        await cleanupRemote(localFilePath);
        throw new UserCancelledError("Execution cancelled by user");
      }
      if (trustResult.rememberDomain) {
        await addTrustedDomain(filePath);
        this.writeStderr(`\nDomain ${domain} added to known_hosts.\n`);
      }
    } else {
      getCommandLogger().debug({ domain }, "Domain already trusted");
    }
  }
}

/** Create a CliRunner with the given environment */
export function createCliRunner(env: SystemEnvironment, options?: Partial<Omit<CliRunnerOptions, "env">>): CliRunner {
  return new CliRunner({ env, ...options });
}

```

### src/imports.ts

```ts
import { resolve, dirname, relative, basename } from "path";
import { realpathSync } from "fs";
import { homedir, platform } from "os";
import { Glob } from "bun";
import ignore from "ignore";
import { resilientFetch } from "./fetch";
import { MAX_INPUT_SIZE, FileSizeLimitError, exceedsLimit } from "./limits";
import { countTokens, getContextLimit } from "./tokenizer";
import { Semaphore, DEFAULT_CONCURRENCY_LIMIT } from "./concurrency";
import { substituteTemplateVars } from "./template";
import { parseImports as parseImportsSafe } from "./imports-parser";
import type { ImportAction } from "./imports-types";

/**
 * TTY Dashboard for monitoring parallel command execution
 * Handles rendering stacked spinners and live output previews
 */
class ParallelDashboard {
  private items: Map<string, { command: string; status: string; frame: number }> = new Map();
  private interval: ReturnType<typeof setInterval> | null = null;
  private isTTY: boolean;
  private spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private linesRendered = 0;

  constructor() {
    this.isTTY = process.stderr.isTTY ?? false;
  }

  start() {
    if (!this.isTTY) return;
    process.stderr.write('\x1B[?25l'); // Hide cursor
    this.interval = setInterval(() => this.render(), 80);
  }

  stop() {
    if (!this.isTTY) return;
    if (this.interval) clearInterval(this.interval);
    this.clear();
    process.stderr.write('\x1B[?25h'); // Show cursor
  }

  register(id: string, command: string) {
    // Truncate command visual if too long
    const displayCmd = command.length > 40 ? command.slice(0, 37) + '...' : command;
    this.items.set(id, { command: displayCmd, status: 'Starting...', frame: 0 });
  }

  update(id: string, chunk: string) {
    const item = this.items.get(id);
    if (item) {
      // Clean newlines and take last 15 chars
      const clean = chunk.replace(/[\r\n]/g, ' ').trim();
      const preview = clean.length > 15 ? '...' + clean.slice(-15) : clean;
      item.status = preview || item.status;
    }
  }

  finish(id: string) {
    this.items.delete(id);
    this.render(); // Immediate update to remove line
  }

  private clear() {
    if (this.linesRendered > 0) {
      // Move up linesRendered times and clear screen down
      process.stderr.write(`\x1B[${this.linesRendered}A`);
      process.stderr.write('\x1B[0J');
      this.linesRendered = 0;
    }
  }

  private render() {
    this.clear();

    const lines: string[] = [];

    for (const [_, item] of this.items) {
      item.frame = (item.frame + 1) % this.spinnerFrames.length;
      const spinner = this.spinnerFrames[item.frame];
      // Format: ⠋ command : last output
      lines.push(`${spinner} ${item.command} : \x1B[90m${item.status}\x1B[0m`);
    }

    if (lines.length > 0) {
      process.stderr.write(lines.join('\n') + '\n');
      this.linesRendered = lines.length;
    }
  }
}

// Re-export pipeline components for direct access
export { parseImports, hasImportsInContent, isGlobPattern, parseLineRange, parseSymbolExtraction } from "./imports-parser";
export { injectImports, createResolvedImport } from "./imports-injector";
export type { ImportAction, ResolvedImport, SystemEnvironment } from "./imports-types";
export { Semaphore, DEFAULT_CONCURRENCY_LIMIT } from "./concurrency";

/**
 * Expand markdown imports, URL imports, and command inlines
 *
 * Supports multiple syntaxes:
 * - @~/path/to/file.md or @./relative/path.md - Inline file contents
 * - @./src/**\/*.ts - Glob patterns (respects .gitignore)
 * - @./file.ts:10-50 - Line range extraction
 * - @./file.ts#SymbolName - Symbol extraction (interface, function, class, type, const)
 * - @https://example.com/docs or @http://... - Fetch URL content (markdown/json only)
 * - !`command` - Execute command and inline stdout/stderr
 *
 * Imports are processed recursively, with circular import detection.
 * URL imports validate content type - only markdown and json are allowed.
 *
 * ## Pipeline Architecture
 *
 * The import system is split into three phases:
 * 1. **Parser** (pure): `parseImports()` - scans content, returns ImportActions
 * 2. **Resolver** (impure): resolves actions via I/O (files, URLs, commands)
 * 3. **Injector** (pure): `injectImports()` - stitches resolved content back
 *
 * This separation enables thorough unit testing of regex parsing and injection
 * without filesystem dependencies.
 */

/** Track files being processed to detect circular imports */
type ImportStack = Set<string>;

/** Track resolved import paths for introspection */
export type ResolvedImportsTracker = string[];

/**
 * Import context for passing runtime dependencies
 * Used to inject environment variables and track resolved imports
 */
export interface ImportContext {
  /** Environment variables (defaults to process.env) */
  env?: Record<string, string | undefined>;
  /** Track resolved imports for ExecutionPlan */
  resolvedImports?: ResolvedImportsTracker;
  /**
   * Working directory for command execution (!`cmd` inlines).
   * When set, commands run in this directory instead of the agent file's directory.
   * This allows agents in ~/.mdflow to execute commands in the user's invocation directory.
   */
  invocationCwd?: string;
  /**
   * Template variables for substitution in inline commands (!`cmd`).
   * When provided, {{ _varname }} patterns in command strings are substituted
   * before execution, allowing dynamic command construction.
   */
  templateVars?: Record<string, string>;
  /**
   * Dry-run mode: when true, commands are not executed.
   * Instead, a placeholder message is returned showing what would have been executed.
   */
  dryRun?: boolean;
}

/**
 * File extensions that are known to be binary
 * These are checked first before content inspection
 */
const BINARY_EXTENSIONS = new Set([
  // Images
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp", ".bmp", ".svg", ".tiff", ".tif",
  // Executables and libraries
  ".exe", ".dll", ".so", ".dylib", ".bin",
  // Archives
  ".zip", ".tar", ".gz", ".7z", ".rar", ".bz2", ".xz",
  // Documents
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  // Databases
  ".sqlite", ".db", ".sqlite3",
  // Data files
  ".dat", ".data",
  // System files
  ".DS_Store",
  // Other binary formats
  ".wasm", ".pyc", ".class", ".o", ".a", ".lib",
]);

/** Size of buffer to check for binary content (8KB) */
const BINARY_CHECK_SIZE = 8192;

/**
 * Check if a file is binary based on extension or content
 *
 * @param filePath - Path to the file
 * @param content - Optional buffer to check (if already read)
 * @returns true if file appears to be binary
 */
export function isBinaryFile(filePath: string, content?: Buffer): boolean {
  // Check extension first (fast path)
  const ext = filePath.toLowerCase().match(/\.[^./\\]+$/)?.[0] || "";
  if (BINARY_EXTENSIONS.has(ext)) {
    return true;
  }

  // Check for files without extensions that are typically binary
  const base = filePath.split(/[/\\]/).pop() || "";
  if (base === ".DS_Store") {
    return true;
  }

  // If content provided, check for null bytes
  if (content) {
    const checkSize = Math.min(content.length, BINARY_CHECK_SIZE);
    for (let i = 0; i < checkSize; i++) {
      if (content[i] === 0) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if a file is binary by reading its first bytes
 *
 * @param filePath - Path to the file
 * @returns true if file appears to be binary
 */
export async function isBinaryFileAsync(filePath: string): Promise<boolean> {
  // Check extension first (fast path)
  if (isBinaryFile(filePath)) {
    return true;
  }

  // Read first 8KB and check for null bytes
  const file = Bun.file(filePath);
  const buffer = await file.slice(0, BINARY_CHECK_SIZE).arrayBuffer();
  const bytes = new Uint8Array(buffer);

  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0) {
      return true;
    }
  }

  return false;
}

/** Maximum token count before error (approx 4 chars per token) */
export const MAX_TOKENS = 100_000;
/** Warning threshold for high token count */
export const WARN_TOKENS = 50_000;
export const CHARS_PER_TOKEN = 4;
const MAX_CHARS = MAX_TOKENS * CHARS_PER_TOKEN;

/** Command execution timeout in milliseconds (30 seconds) */
const COMMAND_TIMEOUT_MS = 30_000;

/** Maximum command output size in characters (~25k tokens) */
const MAX_COMMAND_OUTPUT_SIZE = 100_000;

/** Regex to strip ANSI escape codes from command output */
// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE_REGEX = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

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
 * Resolve a path to its canonical form (resolving symlinks)
 * This ensures that symlinks to the same file are detected as identical
 * for cycle detection purposes.
 *
 * @param filePath - The path to resolve
 * @returns The canonical (real) path, or the original path if resolution fails
 */
export function toCanonicalPath(filePath: string): string {
  try {
    return realpathSync(filePath);
  } catch {
    // File might not exist yet, or other error - return original path
    return filePath;
  }
}

/**
 * Check if a path contains glob characters
 */
function isGlobPatternInternal(path: string): boolean {
  return path.includes("*") || path.includes("?") || path.includes("[");
}

/**
 * Parse import path for line range syntax: @./file.ts:10-50
 */
function parseLineRangeInternal(path: string): { path: string; start?: number; end?: number } {
  const match = path.match(/^(.+):(\d+)-(\d+)$/);
  if (match && match[1] && match[2] && match[3]) {
    return {
      path: match[1],
      start: parseInt(match[2], 10),
      end: parseInt(match[3], 10),
    };
  }
  return { path };
}

/**
 * Parse import path for symbol extraction: @./file.ts#SymbolName
 */
function parseSymbolExtractionInternal(path: string): { path: string; symbol?: string } {
  const match = path.match(/^(.+)#([a-zA-Z_$][a-zA-Z0-9_$]*)$/);
  if (match && match[1] && match[2]) {
    return {
      path: match[1],
      symbol: match[2],
    };
  }
  return { path };
}

/**
 * Extract lines from content by range
 */
function extractLines(content: string, start: number, end: number): string {
  const lines = content.split("\n");
  // Convert to 0-indexed, clamp to valid range
  const startIdx = Math.max(0, start - 1);
  const endIdx = Math.min(lines.length, end);
  return lines.slice(startIdx, endIdx).join("\n");
}

/**
 * Extract a symbol definition from TypeScript/JavaScript content
 * Supports: interface, type, function, class, const, let, var, enum
 */
function extractSymbol(content: string, symbolName: string): string {
  const lines = content.split("\n");

  // Patterns to match symbol declarations
  const patterns = [
    // interface Name { ... }
    new RegExp(`^(export\\s+)?interface\\s+${symbolName}\\s*(extends\\s+[^{]+)?\\{`),
    // type Name = ...
    new RegExp(`^(export\\s+)?type\\s+${symbolName}\\s*(<[^>]+>)?\\s*=`),
    // function Name(...) { ... }
    new RegExp(`^(export\\s+)?(async\\s+)?function\\s+${symbolName}\\s*(<[^>]+>)?\\s*\\(`),
    // class Name { ... }
    new RegExp(`^(export\\s+)?(abstract\\s+)?class\\s+${symbolName}\\s*(extends\\s+[^{]+)?(implements\\s+[^{]+)?\\{`),
    // const/let/var Name = ...
    new RegExp(`^(export\\s+)?(const|let|var)\\s+${symbolName}\\s*(:[^=]+)?\\s*=`),
    // enum Name { ... }
    new RegExp(`^(export\\s+)?enum\\s+${symbolName}\\s*\\{`),
  ];

  let startLine = -1;
  let braceDepth = 0;
  let parenDepth = 0;
  let inString = false;
  let stringChar = "";
  let foundDeclaration = false;

  for (let i = 0; i < lines.length; i++) {
    const currentLine = lines[i];
    if (!currentLine) continue;
    const line = currentLine.trim();

    // Check if this line starts the symbol we're looking for
    if (startLine === -1) {
      for (const pattern of patterns) {
        if (pattern.test(line)) {
          startLine = i;
          foundDeclaration = true;
          break;
        }
      }
    }

    if (startLine !== -1) {
      // Count braces/parens to find the end of the declaration
      for (let j = 0; j < currentLine.length; j++) {
        const char = currentLine[j];
        const prevChar = j > 0 ? currentLine[j - 1] : "";

        // Handle string literals
        if (!inString && (char === '"' || char === "'" || char === "`")) {
          inString = true;
          stringChar = char;
        } else if (inString && char === stringChar && prevChar !== "\\") {
          inString = false;
        }

        if (!inString) {
          if (char === "{") braceDepth++;
          else if (char === "}") braceDepth--;
          else if (char === "(") parenDepth++;
          else if (char === ")") parenDepth--;
        }
      }

      // Check if we've closed all braces (for block declarations)
      if (foundDeclaration && braceDepth === 0 && parenDepth === 0) {
        // For type aliases, we need to check for semicolon or end of statement
        const trimmedLine = currentLine.trim();
        const nextLine = lines[i + 1];
        if (trimmedLine.endsWith(";") || trimmedLine.endsWith("}") ||
            (i + 1 < lines.length && nextLine && !nextLine.trim().startsWith("."))) {
          return lines.slice(startLine, i + 1).join("\n");
        }
      }
    }
  }

  if (startLine !== -1) {
    // Return everything from start to end if we couldn't find proper closure
    return lines.slice(startLine).join("\n");
  }

  throw new Error(`Symbol "${symbolName}" not found in file`);
}

/**
 * Load .gitignore patterns from directory and parents
 */
async function loadGitignore(dir: string): Promise<ReturnType<typeof ignore>> {
  const ig = ignore();

  // Always ignore common patterns
  ig.add([
    ".git",
    "node_modules",
    ".DS_Store",
    "*.log",
  ]);

  // Walk up to find .gitignore files
  let currentDir = dir;
  const root = resolve("/");

  while (currentDir !== root) {
    const gitignorePath = resolve(currentDir, ".gitignore");
    const file = Bun.file(gitignorePath);

    if (await file.exists()) {
      const content = await file.text();
      ig.add(content.split("\n").filter(line => line.trim() && !line.startsWith("#")));
    }

    // Stop at git root
    const gitDir = resolve(currentDir, ".git");
    if (await Bun.file(gitDir).exists()) {
      break;
    }

    currentDir = dirname(currentDir);
  }

  return ig;
}

/**
 * Pattern to match @filepath imports (including globs, line ranges, and symbols)
 * Matches: @~/path/to/file.md, @./relative/path.md, @/absolute/path.md
 * Also: @./src/**\/*.ts, @./file.ts:10-50, @./file.ts#Symbol
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
 * Pattern to match @url imports
 * Matches: @https://example.com/path, @http://example.com/path
 * Does NOT match emails like foo@example.com (requires http:// or https://)
 * The URL continues until whitespace or end of line
 */
const URL_IMPORT_PATTERN = /@(https?:\/\/[^\s]+)/g;

/**
 * Allowed content types for URL imports
 */
const ALLOWED_CONTENT_TYPES = [
  "text/markdown",
  "text/x-markdown",
  "text/plain",
  "application/json",
  "application/x-json",
  "text/json",
];

/**
 * Check if a content type is allowed
 */
function isAllowedContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  // Extract the base type (ignore charset and other params)
  const baseType = (contentType.split(";")[0] ?? "").trim().toLowerCase();
  return ALLOWED_CONTENT_TYPES.includes(baseType);
}

/**
 * Determine if content looks like markdown or JSON
 * Used when content-type header is missing or generic
 */
function inferContentType(content: string, url: string): "markdown" | "json" | "unknown" {
  const trimmed = content.trim();

  // Check if it looks like JSON
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      JSON.parse(trimmed);
      return "json";
    } catch {
      // Not valid JSON
    }
  }

  // Check URL extension
  const urlLower = url.toLowerCase();
  if (urlLower.endsWith(".md") || urlLower.endsWith(".markdown")) {
    return "markdown";
  }
  if (urlLower.endsWith(".json")) {
    return "json";
  }

  // Check for common markdown patterns
  if (trimmed.startsWith("#") ||
      trimmed.includes("\n#") ||
      trimmed.includes("\n- ") ||
      trimmed.includes("\n* ") ||
      trimmed.includes("```")) {
    return "markdown";
  }

  return "unknown";
}

/**
 * Process a URL import by fetching and validating content
 */
async function processUrlImport(
  url: string,
  verbose: boolean
): Promise<string> {
  // Always log URL fetches to stderr for visibility
  console.error(`[imports] Fetching: ${url}`);

  try {
    const response = await resilientFetch(url, {
      headers: {
        "Accept": "text/markdown, application/json, text/plain, */*",
        "User-Agent": "mdflow/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type");
    const content = await response.text();

    // Check content type header
    if (contentType && isAllowedContentType(contentType)) {
      return content.trim();
    }

    // Content-type missing or generic - infer from content
    const inferred = inferContentType(content, url);
    if (inferred === "markdown" || inferred === "json") {
      return content.trim();
    }

    // Cannot determine content type - reject
    throw new Error(
      `URL returned unsupported content type: ${contentType || "unknown"}. ` +
      `Only markdown and JSON are allowed. URL: ${url}`
    );
  } catch (err) {
    if (err instanceof Error && err.message.includes("unsupported content type")) {
      throw err;
    }
    throw new Error(`Failed to fetch URL: ${url} - ${(err as Error).message}`);
  }
}

/**
 * Format files as XML for LLM consumption
 */
function formatFilesAsXml(files: Array<{ path: string; content: string }>): string {
  return files.map(file => {
    const name = basename(file.path)
      .replace(/\.[^.]+$/, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/^(\d)/, "_$1") || "file";
    return `<${name} path="${file.path}">\n${file.content}\n</${name}>`;
  }).join("\n\n");
}

/**
 * Process a glob import pattern
 */
async function processGlobImport(
  pattern: string,
  currentFileDir: string,
  verbose: boolean
): Promise<string> {
  const resolvedPattern = expandTilde(pattern);
  const baseDir = resolvedPattern.startsWith("/") ? "/" : currentFileDir;

  // For relative patterns, we need to resolve from the current directory
  const globPattern = resolvedPattern.startsWith("/")
    ? resolvedPattern
    : resolve(currentFileDir, resolvedPattern).replace(currentFileDir + "/", "");

  if (verbose) {
    console.error(`[imports] Glob pattern: ${globPattern} in ${currentFileDir}`);
  }

  // Load gitignore
  const ig = await loadGitignore(currentFileDir);

  // Collect matching files
  const glob = new Glob(resolvedPattern.startsWith("/") ? resolvedPattern : pattern.replace(/^\.\//, ""));
  const files: Array<{ path: string; content: string }> = [];
  let totalChars = 0;

  const skippedBinaryFiles: string[] = [];

  for await (const file of glob.scan({ cwd: currentFileDir, absolute: true, onlyFiles: true })) {
    // Check gitignore
    const relativePath = relative(currentFileDir, file);
    if (ig.ignores(relativePath)) {
      continue;
    }

    // Check if file is binary (skip with warning in glob imports)
    if (await isBinaryFileAsync(file)) {
      skippedBinaryFiles.push(relativePath);
      continue;
    }

    const bunFile = Bun.file(file);

    // Check individual file size before reading
    if (exceedsLimit(bunFile.size)) {
      throw new FileSizeLimitError(file, bunFile.size);
    }

    const content = await bunFile.text();
    totalChars += content.length;

    files.push({ path: relativePath, content });
  }

  // Log warning about skipped binary files
  if (skippedBinaryFiles.length > 0 && verbose) {
    console.error(`[imports] Skipped ${skippedBinaryFiles.length} binary file(s): ${skippedBinaryFiles.join(", ")}`);
  }

  // Sort by path for consistent ordering
  files.sort((a, b) => a.path.localeCompare(b.path));

  // Count tokens using real tokenizer
  const allContent = files.map((f) => f.content).join("\n");
  const actualTokens = countTokens(allContent);

  // Get context limit (use env vars for model/limit override)
  const contextLimit = getContextLimit(
    process.env.MA_MODEL,
    Number(process.env.MA_CONTEXT_WINDOW) || undefined
  );

  // Always log glob expansion to stderr for visibility
  console.error(
    `[imports] Expanding ${pattern}: ${files.length} files (~${actualTokens.toLocaleString()} tokens)`
  );

  // Error threshold - use dynamic context limit
  if (actualTokens > contextLimit && !process.env.MA_FORCE_CONTEXT) {
    throw new Error(
      `Glob import "${pattern}" would include ~${actualTokens.toLocaleString()} tokens (${files.length} files), ` +
        `which exceeds the ${contextLimit.toLocaleString()} token limit.\n` +
        `To override this limit, set the MA_FORCE_CONTEXT=1 environment variable.`
    );
  }

  // Warning threshold (50% of limit) - warn but don't error
  const warnThreshold = Math.floor(contextLimit * 0.5);
  if (actualTokens > warnThreshold && actualTokens <= contextLimit) {
    console.error(
      `[imports] Warning: High token count (~${actualTokens.toLocaleString()}). This may be expensive.`
    );
  }

  return formatFilesAsXml(files);
}

/**
 * Process a single file import (with optional line range or symbol extraction)
 */
async function processFileImport(
  importPath: string,
  currentFileDir: string,
  stack: ImportStack,
  verbose: boolean,
  importCtx?: ImportContext
): Promise<string> {
  const resolvedImports = importCtx?.resolvedImports;
  // Check for glob pattern first
  if (isGlobPatternInternal(importPath)) {
    return processGlobImport(importPath, currentFileDir, verbose);
  }

  // Check for symbol extraction syntax
  const symbolParsed = parseSymbolExtractionInternal(importPath);
  if (symbolParsed.symbol) {
    const resolvedPath = resolveImportPath(symbolParsed.path, currentFileDir);

    const file = Bun.file(resolvedPath);
    if (!await file.exists()) {
      throw new Error(`Import not found: ${symbolParsed.path} (resolved to ${resolvedPath})`);
    }

    // Check file size before reading
    if (exceedsLimit(file.size)) {
      throw new FileSizeLimitError(resolvedPath, file.size);
    }

    // Check for binary file (throw error for direct imports)
    if (await isBinaryFileAsync(resolvedPath)) {
      throw new Error(`Cannot import binary file: ${symbolParsed.path} (resolved to ${resolvedPath})`);
    }

    if (verbose) {
      console.error(`[imports] Extracting symbol "${symbolParsed.symbol}" from: ${symbolParsed.path}`);
    }

    const content = await file.text();
    // Track the resolved import
    if (resolvedImports) {
      resolvedImports.push(importPath);
    }
    return extractSymbol(content, symbolParsed.symbol);
  }

  // Check for line range syntax
  const rangeParsed = parseLineRangeInternal(importPath);
  if (rangeParsed.start !== undefined && rangeParsed.end !== undefined) {
    const resolvedPath = resolveImportPath(rangeParsed.path, currentFileDir);

    const file = Bun.file(resolvedPath);
    if (!await file.exists()) {
      throw new Error(`Import not found: ${rangeParsed.path} (resolved to ${resolvedPath})`);
    }

    // Check file size before reading
    if (exceedsLimit(file.size)) {
      throw new FileSizeLimitError(resolvedPath, file.size);
    }

    // Check for binary file (throw error for direct imports)
    if (await isBinaryFileAsync(resolvedPath)) {
      throw new Error(`Cannot import binary file: ${rangeParsed.path} (resolved to ${resolvedPath})`);
    }

    if (verbose) {
      console.error(`[imports] Loading lines ${rangeParsed.start}-${rangeParsed.end} from: ${rangeParsed.path}`);
    }

    const content = await file.text();
    // Track the resolved import
    if (resolvedImports) {
      resolvedImports.push(importPath);
    }
    return extractLines(content, rangeParsed.start, rangeParsed.end);
  }

  // Regular file import
  const resolvedPath = resolveImportPath(importPath, currentFileDir);

  // Check if file exists first (needed for canonical path resolution)
  const file = Bun.file(resolvedPath);
  if (!await file.exists()) {
    throw new Error(`Import not found: ${importPath} (resolved to ${resolvedPath})`);
  }

  // Resolve to canonical path for cycle detection (handles symlinks)
  const canonicalPath = toCanonicalPath(resolvedPath);

  // Check for circular imports using canonical path
  if (stack.has(canonicalPath)) {
    const cycle = [...stack, canonicalPath].join(" -> ");
    throw new Error(`Circular import detected: ${cycle}`);
  }

  // Check file size before reading
  if (exceedsLimit(file.size)) {
    throw new FileSizeLimitError(resolvedPath, file.size);
  }

  // Check for binary file (throw error for direct imports)
  if (await isBinaryFileAsync(resolvedPath)) {
    throw new Error(`Cannot import binary file: ${importPath} (resolved to ${resolvedPath})`);
  }

  // Always log file loading to stderr for visibility
  console.error(`[imports] Loading: ${importPath}`);

  // Track the resolved import
  if (resolvedImports) {
    resolvedImports.push(importPath);
  }

  // Read file content
  const content = await file.text();

  // Recursively process imports in the imported file
  // Use canonical path in stack for consistent cycle detection
  const newStack = new Set(stack);
  newStack.add(canonicalPath);

  return expandImports(content, dirname(resolvedPath), newStack, verbose, importCtx);
}

/**
 * Pattern to detect markdown file paths that should be auto-run with `md`
 * Matches: foo.md, ./foo.md, ~/foo.md, /path/to/foo.md, foo.claude.md, etc.
 * The command must start with a path-like pattern and end with .md
 */
const MD_FILE_COMMAND_PATTERN = /^(~?\.?\.?\/)?[^\s]+\.md(\s|$)/;

/**
 * Check if a command looks like a markdown file that should be run with `mdflow`
 */
export function isMarkdownFileCommand(command: string): boolean {
  return MD_FILE_COMMAND_PATTERN.test(command.trim());
}

/**
 * Process a single command inline with comprehensive safety measures:
 * - Dry-run mode support
 * - Cross-platform shell support (Windows/Unix)
 * - Execution timeout (30s default)
 * - Binary output detection
 * - ANSI escape code stripping
 * - LiquidJS tag sanitization
 * - Output size limiting
 * - Detailed error reporting
 */
async function processCommandInline(
  command: string,
  currentFileDir: string,
  verbose: boolean,
  importCtx?: ImportContext,
  onProgress?: (chunk: string) => void,
  useDashboard: boolean = false
): Promise<string> {
  // Substitute template variables in command string if provided
  // This allows commands like !`echo {{ _name }}` to use frontmatter variables
  let processedCommand = command;
  if (importCtx?.templateVars && Object.keys(importCtx.templateVars).length > 0) {
    processedCommand = substituteTemplateVars(command, importCtx.templateVars);
    if (processedCommand !== command) {
      console.error(`[imports] Command with vars: ${command} → ${processedCommand}`);
    }
  }

  // Auto-prefix markdown files with `mdflow` to run them as agents
  let actualCommand = processedCommand;
  if (isMarkdownFileCommand(processedCommand)) {
    actualCommand = `mdflow ${processedCommand}`;
    console.error(`[imports] Auto-running .md file with mdflow: ${actualCommand}`);
  } else {
    // Always log command execution unless dashboard is active (it shows progress)
    if (!useDashboard) {
      console.error(`[imports] Executing: ${processedCommand}`);
    }
  }

  // Improvement #3: Dry-run safety - skip execution if in dry-run mode
  if (importCtx?.dryRun) {
    console.error(`[imports] Dry-run: Skipping execution of '${actualCommand}'`);
    return `{% raw %}\n[Dry Run: Command "${actualCommand}" not executed]\n{% endraw %}`;
  }

  // Use importCtx.env if provided, otherwise fall back to process.env
  const env = importCtx?.env ?? process.env;

  // Use invocationCwd for command execution if provided (allows agents in ~/.mdflow
  // to run commands in the user's current directory), fall back to file directory
  const commandCwd = importCtx?.invocationCwd ?? currentFileDir;

  // Improvement #5: Cross-platform shell support
  const isWin = platform() === "win32";
  const shell = isWin ? "cmd.exe" : "sh";
  const shellArgs = isWin ? ["/d", "/s", "/c", actualCommand] : ["-c", actualCommand];

  // Track process for timeout cleanup
  let proc: ReturnType<typeof Bun.spawn> | null = null;
  let timedOut = false;

  try {
    proc = Bun.spawn([shell, ...shellArgs], {
      cwd: commandCwd,
      stdout: "pipe",
      stderr: "pipe",
      env: env as Record<string, string>,
    });

    // Buffers for final output
    const stdoutChunks: Uint8Array[] = [];
    const stderrChunks: Uint8Array[] = [];

    // Helper to read a stream and trigger callbacks
    const readStream = async (
      stream: ReadableStream<Uint8Array>,
      chunks: Uint8Array[],
      isStdout: boolean
    ) => {
      const reader = stream.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);

        // Update dashboard via callback if provided (only for stdout to reduce noise)
        if (isStdout && onProgress) {
          onProgress(decoder.decode(value));
        }
      }
    };

    // Improvement #4: Execution timeout using Promise.race
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        timedOut = true;
        proc?.kill();
        reject(new Error(`Command timed out after ${COMMAND_TIMEOUT_MS}ms: ${actualCommand}`));
      }, COMMAND_TIMEOUT_MS);
    });

    // Read streams with timeout (stdout/stderr are guaranteed with "pipe" option)
    const stdoutStream = proc.stdout as ReadableStream<Uint8Array>;
    const stderrStream = proc.stderr as ReadableStream<Uint8Array>;
    await Promise.race([
      Promise.all([
        readStream(stdoutStream, stdoutChunks, true),
        readStream(stderrStream, stderrChunks, false)
      ]),
      timeoutPromise
    ]);

    await proc.exited;

    // Reconstruct full output as bytes first
    const stdoutBytes = Buffer.concat(stdoutChunks);
    const stderrBytes = Buffer.concat(stderrChunks);

    // Improvement #9: Detect and block binary output (check first 1KB for null bytes)
    const checkChunk = new Uint8Array(stdoutBytes.slice(0, 1024));
    if (checkChunk.includes(0)) {
      throw new Error(`Command returned binary data. Inline commands must return text: ${actualCommand}`);
    }

    // Decode to strings
    let stdout = new TextDecoder().decode(stdoutBytes).trim();
    let stderr = new TextDecoder().decode(stderrBytes).trim();

    // Improvement #6: Strip ANSI escape codes from output
    stdout = stdout.replace(ANSI_ESCAPE_REGEX, '');
    stderr = stderr.replace(ANSI_ESCAPE_REGEX, '');

    // Improvement #10: Detailed error reporting with stderr
    if (proc.exitCode !== 0) {
      const errorOutput = stderr || stdout || "No output";
      throw new Error(`Command failed (Exit ${proc.exitCode}): ${actualCommand}\nOutput: ${errorOutput}`);
    }

    // Combine stdout and stderr (stderr first if both exist)
    let output: string;
    if (stderr && stdout) {
      output = `${stderr}\n${stdout}`;
    } else {
      output = stdout || stderr || "";
    }

    // Improvement #8: Enforce output size limits
    if (output.length > MAX_COMMAND_OUTPUT_SIZE) {
      const truncatedChars = output.length - MAX_COMMAND_OUTPUT_SIZE;
      output = output.slice(0, MAX_COMMAND_OUTPUT_SIZE) +
        `\n... [Output truncated: ${truncatedChars.toLocaleString()} characters removed]`;
    }

    // Improvement #7: Sanitize LiquidJS tags - escape {% endraw %} in output
    // to prevent breaking out of the raw block
    if (output) {
      const safeOutput = output.replace(/\{% endraw %\}/g, "{% endraw %}{{ '{% endraw %}' }}{% raw %}");
      return `{% raw %}\n${safeOutput}\n{% endraw %}`;
    }
    return output;
  } catch (err) {
    // Include more context in error messages
    const errorMessage = (err as Error).message;
    if (errorMessage.includes("timed out") || errorMessage.includes("Exit ")) {
      throw err; // Re-throw timeout and exit code errors as-is
    }
    throw new Error(`Command failed: ${actualCommand} - ${errorMessage}`);
  }
}

/** Import types for categorizing imports during parallel resolution */
type ParsedImport =
  | { type: 'file'; full: string; path: string; index: number }
  | { type: 'url'; full: string; url: string; index: number }
  | { type: 'command'; full: string; command: string; index: number };

/** Result of resolving an import */
interface ResolvedImportResult {
  import: ParsedImport;
  content: string;
}

/**
 * Parse all imports from content in a single pass
 * Returns imports sorted by their position in the content
 */
function parseAllImports(content: string): ParsedImport[] {
  const imports: ParsedImport[] = [];
  let match;

  // Parse file imports
  FILE_IMPORT_PATTERN.lastIndex = 0;
  while ((match = FILE_IMPORT_PATTERN.exec(content)) !== null) {
    if (match[1]) {
      imports.push({
        type: 'file',
        full: match[0],
        path: match[1],
        index: match.index,
      });
    }
  }

  // Parse URL imports
  URL_IMPORT_PATTERN.lastIndex = 0;
  while ((match = URL_IMPORT_PATTERN.exec(content)) !== null) {
    if (match[1]) {
      imports.push({
        type: 'url',
        full: match[0],
        url: match[1],
        index: match.index,
      });
    }
  }

  // Parse command inlines
  COMMAND_INLINE_PATTERN.lastIndex = 0;
  while ((match = COMMAND_INLINE_PATTERN.exec(content)) !== null) {
    if (match[1]) {
      imports.push({
        type: 'command',
        full: match[0],
        command: match[1],
        index: match.index,
      });
    }
  }

  // Sort by index to maintain order
  imports.sort((a, b) => a.index - b.index);

  return imports;
}

/**
 * Inject resolved imports back into content
 * Processes in reverse order to preserve indices
 */
function injectResolvedImports(content: string, resolved: ResolvedImportResult[]): string {
  let result = content;

  // Sort by index descending to process from end to start (preserves indices)
  const sortedResolved = [...resolved].sort((a, b) => b.import.index - a.import.index);

  for (const { import: imp, content: replacement } of sortedResolved) {
    result = result.slice(0, imp.index) + replacement + result.slice(imp.index + imp.full.length);
  }

  return result;
}

/**
 * Expand all imports, URL imports, and command inlines in content
 *
 * This is the main entry point that orchestrates the three-phase pipeline:
 * 1. Parse: Find all imports in the content (single pass)
 * 2. Resolve: Fetch content for each import in parallel (with concurrency limit)
 * 3. Inject: Replace import markers with resolved content
 *
 * The parallel resolution uses a semaphore to limit concurrent I/O operations,
 * preventing file descriptor exhaustion when processing many imports.
 *
 * For TTY environments with multiple commands, a live dashboard shows progress
 * with spinners and output previews for each running command.
 *
 * @param content - The markdown content to process
 * @param currentFileDir - Directory of the current file (for relative imports)
 * @param stack - Set of files already being processed (for circular detection)
 * @param verbose - Whether to log import/command activity
 * @param contextOrTracker - Optional ImportContext or array to collect resolved import paths
 * @param concurrencyLimit - Maximum concurrent I/O operations (default: 10)
 * @returns Content with all imports and commands expanded
 */
export async function expandImports(
  content: string,
  currentFileDir: string,
  stack: ImportStack = new Set(),
  verbose: boolean = false,
  contextOrTracker?: ImportContext | ResolvedImportsTracker,
  concurrencyLimit: number = DEFAULT_CONCURRENCY_LIMIT
): Promise<string> {
  // Normalize the 5th parameter - can be either ImportContext or ResolvedImportsTracker (for backward compat)
  const importCtx: ImportContext = Array.isArray(contextOrTracker)
    ? { resolvedImports: contextOrTracker }
    : (contextOrTracker ?? {});
  const resolvedImportsTracker = importCtx.resolvedImports;

  // Phase 1: Parse all imports using the context-aware parser
  // SECURITY FIX: Uses parseImportsSafe which ignores imports inside code blocks,
  // preventing accidental command execution from documentation examples
  const rawActions = parseImportsSafe(content);

  // Map ImportAction[] from the safe parser to ParsedImport[] for internal processing
  const imports: ParsedImport[] = rawActions.map(action => {
    switch (action.type) {
      case 'file': {
        // Preserve line range syntax in the path if present
        let path = action.path;
        if (action.lineRange) {
          path = `${action.path}:${action.lineRange.start}-${action.lineRange.end}`;
        }
        return { type: 'file' as const, full: action.original, path, index: action.index };
      }
      case 'glob':
        return { type: 'file' as const, full: action.original, path: action.pattern, index: action.index };
      case 'symbol':
        return { type: 'file' as const, full: action.original, path: `${action.path}#${action.symbol}`, index: action.index };
      case 'url':
        return { type: 'url' as const, full: action.original, url: action.url, index: action.index };
      case 'command':
        return { type: 'command' as const, full: action.original, command: action.command, index: action.index };
      default:
        // Should never happen, but TypeScript needs exhaustive handling
        return null as never;
    }
  });

  // If no imports, return content as-is
  if (imports.length === 0) {
    return content;
  }

  // Create semaphore for concurrency limiting
  const semaphore = new Semaphore(concurrencyLimit);

  // Initialize dashboard if we have any commands and are in a TTY environment
  const commandImports = imports.filter(i => i.type === 'command');
  const useDashboard = commandImports.length > 0 && process.stderr.isTTY && !verbose;
  const dashboard = useDashboard ? new ParallelDashboard() : null;

  if (dashboard) dashboard.start();

  try {
    // Phase 2: Resolve all imports in parallel with concurrency limiting
    const resolvePromises = imports.map(async (imp): Promise<ResolvedImportResult> => {
      return semaphore.run(async () => {
        let resolvedContent: string;

        switch (imp.type) {
          case 'file':
            resolvedContent = await processFileImport(imp.path, currentFileDir, stack, verbose, importCtx);
            break;
          case 'url':
            resolvedContent = await processUrlImport(imp.url, verbose);
            // Track URL imports
            if (resolvedImportsTracker) {
              resolvedImportsTracker.push(imp.url);
            }
            break;
          case 'command':
            // Register with dashboard if active
            const cmdId = Math.random().toString(36).substring(7);
            if (dashboard) dashboard.register(cmdId, imp.command);

            try {
              resolvedContent = await processCommandInline(
                imp.command,
                currentFileDir,
                verbose,
                importCtx,
                (chunk) => {
                  if (dashboard) dashboard.update(cmdId, chunk);
                },
                useDashboard
              );
            } finally {
              if (dashboard) dashboard.finish(cmdId);
            }
            break;
        }

        return { import: imp, content: resolvedContent };
      });
    });

    // Wait for all resolutions to complete
    const resolvedImports = await Promise.all(resolvePromises);

    // Phase 3: Inject resolved content back into the original
    return injectResolvedImports(content, resolvedImports);
  } finally {
    if (dashboard) dashboard.stop();
  }
}

/**
 * Check if content contains any imports, URL imports, or command inlines
 */
export function hasImports(content: string): boolean {
  FILE_IMPORT_PATTERN.lastIndex = 0;
  URL_IMPORT_PATTERN.lastIndex = 0;
  COMMAND_INLINE_PATTERN.lastIndex = 0;

  return (
    FILE_IMPORT_PATTERN.test(content) ||
    URL_IMPORT_PATTERN.test(content) ||
    COMMAND_INLINE_PATTERN.test(content)
  );
}

```

### src/imports-types.ts

```ts
/**
 * Import Action Types - Output of the pure parser (Phase 1)
 *
 * These represent the different types of imports found when scanning content,
 * before any I/O operations are performed.
 */

/** File import with optional line range */
export interface FileImportAction {
  type: 'file';
  path: string;
  lineRange?: { start: number; end: number };
  /** Original matched text for replacement */
  original: string;
  /** Position in the original string */
  index: number;
}

/** Glob pattern import */
export interface GlobImportAction {
  type: 'glob';
  pattern: string;
  /** Original matched text for replacement */
  original: string;
  /** Position in the original string */
  index: number;
}

/** URL import */
export interface UrlImportAction {
  type: 'url';
  url: string;
  /** Original matched text for replacement */
  original: string;
  /** Position in the original string */
  index: number;
}

/** Command inline */
export interface CommandImportAction {
  type: 'command';
  command: string;
  /** Original matched text for replacement */
  original: string;
  /** Position in the original string */
  index: number;
}

/** Symbol extraction import */
export interface SymbolImportAction {
  type: 'symbol';
  path: string;
  symbol: string;
  /** Original matched text for replacement */
  original: string;
  /** Position in the original string */
  index: number;
}

/** Union of all import action types */
export type ImportAction =
  | FileImportAction
  | GlobImportAction
  | UrlImportAction
  | CommandImportAction
  | SymbolImportAction;

/**
 * Resolved Import - Output of the resolver (Phase 2)
 *
 * Contains the original action plus the resolved content.
 */
export interface ResolvedImport {
  /** The original action that was resolved */
  action: ImportAction;
  /** The resolved content to inject */
  content: string;
}

/**
 * System Environment interface for the resolver
 * Abstracts away file system and network operations for testability
 */
export interface SystemEnvironment {
  /** Read a file's content */
  readFile(path: string): Promise<string>;
  /** Check if a file exists */
  fileExists(path: string): Promise<boolean>;
  /** Get file size in bytes */
  fileSize(path: string): Promise<number>;
  /** Check if a file is binary */
  isBinaryFile(path: string): Promise<boolean>;
  /** Resolve a path to canonical form (resolving symlinks) */
  toCanonicalPath(path: string): string;
  /** Fetch URL content */
  fetchUrl(url: string): Promise<{ content: string; contentType: string | null }>;
  /** Execute a shell command */
  execCommand(command: string, cwd: string): Promise<string>;
  /** Expand glob pattern and return matching files */
  expandGlob(pattern: string, cwd: string): Promise<Array<{ path: string; content: string }>>;
  /** Current working directory */
  cwd: string;
  /** Whether to log verbose output */
  verbose: boolean;
  /** Log a message (for verbose output) */
  log(message: string): void;
}

```

### src/template.ts

```ts
/**
 * Template variable substitution for markdown content
 * Uses LiquidJS for full template support including conditionals and loops
 */

import { Liquid, analyzeSync } from "liquidjs";

export interface TemplateVars {
  [key: string]: string;
}

// Shared Liquid engine instance with lenient settings
const engine = new Liquid({
  strictVariables: false,  // Don't throw on undefined variables
  strictFilters: false,    // Don't throw on undefined filters
});

/**
 * Extract template variables from content using LiquidJS AST parsing
 * Returns array of global variable names (root segments) found in:
 * - {{ variable }} output patterns
 * - {% if variable %}, {% unless variable %}, {% elsif variable %} logic tags
 * - {% for item in collection %} loop tags
 * - Variables with filters: {{ name | upcase }}
 * - Nested variables: {{ user.name }} (returns "user" as the root)
 *
 * Uses LiquidJS's analyzeSync for accurate AST-based extraction,
 * avoiding regex fragility with complex Liquid syntax.
 */
export function extractTemplateVars(content: string): string[] {
  try {
    // Parse the template into AST
    const templates = engine.parse(content);
    // Analyze to find all global variables (undefined in template scope)
    const analysis = analyzeSync(templates, { partials: false });
    // Return the root variable names from globals
    return Object.keys(analysis.globals);
  } catch {
    // Fallback: return empty array if template parsing fails
    // This maintains backward compatibility for malformed templates
    return [];
  }
}

/**
 * Substitute template variables in content using LiquidJS
 * Supports:
 * - Variable substitution: {{ variable }}
 * - Conditionals: {% if condition %}...{% endif %}
 * - Loops: {% for item in items %}...{% endfor %}
 * - Filters: {{ name | upcase }}
 * - Default values: {{ name | default: "World" }}
 */
export function substituteTemplateVars(
  content: string,
  vars: TemplateVars,
  options: { strict?: boolean } = {}
): string {
  const { strict = false } = options;

  if (strict) {
    // In strict mode, check for missing variables before rendering
    const required = extractTemplateVars(content);
    const missing = required.filter(v => !(v in vars));
    if (missing.length > 0) {
      throw new Error(`Missing required template variable: ${missing[0]}`);
    }
  }

  // Use synchronous renderSync for compatibility
  return engine.parseAndRenderSync(content, vars);
}

/**
 * Parse CLI arguments into template variables
 * Extracts --key value pairs that aren't known flags
 */
export function parseTemplateArgs(
  args: string[],
  knownFlags: Set<string>
): TemplateVars {
  const vars: TemplateVars = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    // Skip non-flags
    if (!arg?.startsWith("--")) continue;

    const key = arg.slice(2); // Remove --

    // Skip known flags (handled by CLI parser)
    if (knownFlags.has(arg) || knownFlags.has(`--${key}`)) continue;

    // If next arg exists and isn't a flag, it's the value
    if (nextArg && !nextArg.startsWith("-")) {
      vars[key] = nextArg;
      i++; // Skip the value arg
    } else {
      // Boolean flag without value
      vars[key] = "true";
    }
  }

  return vars;
}

```

### CLAUDE.md

```md
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

**mdflow** (`md`) is a CLI tool that executes AI agents defined as markdown files. It parses YAML frontmatter for configuration and passes keys directly as CLI flags to the specified command (claude, codex, gemini, copilot, or any other CLI tool).

## CLI Subcommands

```bash
md <file.md> [flags]     # Run an agent
md create [name]         # Create a new agent file
md setup                 # Configure shell (PATH, aliases)
md logs                  # Show agent log directory
md help                  # Show help
```

## Development Commands

```bash
# Run tests (bail on first failure)
bun test --bail=1

# Run single test file
bun test src/cli.test.ts

# Run a specific test by name
bun test --test-name-pattern "parses command"

# Execute the CLI directly
bun run src/index.ts task.claude.md

# Or using the alias
bun run md task.claude.md
```

## Architecture

### Core Flow (`src/index.ts`)
```
.md file → parseFrontmatter() → resolveCommand(filename/env)
        → loadGlobalConfig() → applyDefaults()
        → applyInteractiveMode() → expandImports()
        → substituteTemplateVars() → buildArgs() → runCommand()
```

### Key Modules

- **`command.ts`** - Command resolution and execution
  - `parseCommandFromFilename()`: Infers command from `task.claude.md` → `claude`
  - `hasInteractiveMarker()`: Detects `.i.` in filename (e.g., `task.i.claude.md`)
  - `resolveCommand()`: Priority: MA_COMMAND env var > filename
  - `buildArgs()`: Converts frontmatter to CLI flags
  - `extractPositionalMappings()`: Extracts $1, $2, etc. mappings
  - `runCommand()`: Spawns the command with positional args

- **`config.ts`** - Global configuration
  - Loads defaults from `~/.mdflow/config.yaml`
  - Built-in defaults: All commands default to print mode
  - `getCommandDefaults()`: Get defaults for a command
  - `applyDefaults()`: Merge defaults with frontmatter
  - `applyInteractiveMode()`: Converts print defaults to interactive mode per command

- **`types.ts`** - Core TypeScript interfaces
  - `AgentFrontmatter`: Simple interface with system keys + passthrough
  - System keys: `_varname` (template vars), `env`, `$1`/`$2`/etc.

- **`schema.ts`** - Minimal Zod validation (system keys only, rest passthrough)

- **`imports.ts`** - File imports with advanced features:
  - Basic: `@./path.md` - inline file contents
  - Globs: `@./src/**/*.ts` - multiple files (respects .gitignore)
  - Line ranges: `@./file.ts:10-50` - extract specific lines
  - Symbols: `@./file.ts#InterfaceName` - extract TypeScript symbols
  - Commands: `` !`cmd` `` - inline command output
  - URLs: `@https://example.com/file.md` - fetch remote content

- **`env.ts`** - Environment variable loading from .env files

- **`template.ts`** - LiquidJS-powered template engine for variable substitution

- **`logger.ts`** - Structured logging with pino (logs to `~/.mdflow/logs/<agent>/`)

### Command Resolution

Commands are resolved in priority order:
1. `MA_COMMAND` environment variable
2. Filename pattern: `task.claude.md` → `claude`

### Frontmatter Keys

**System keys** (consumed by md, not passed to command):
- `_varname`: Template variables (e.g., `_name: "default"` → `{{ _name }}` in body → `--_name` CLI flag)
- `_stdin`: Auto-injected template variable containing piped input
- `_1`, `_2`, etc.: Auto-injected positional CLI args (e.g., `md task.md "foo"` → `{{ _1 }}` = "foo")
- `_args`: Auto-injected numbered list of all positional args
- `env` (object form): Sets process.env before execution
- `$1`, `$2`, etc.: Map positional args to flags
- `_interactive`: Enable interactive mode (overrides print-mode defaults)
- `_subcommand`: Prepend subcommand(s) to CLI args (e.g., `_subcommand: exec`)
- `_cwd`: Override working directory for inline commands (`` !`cmd` ``)

**Note:** `--_varname` CLI flags work without frontmatter declaration. If a `_` prefixed variable is used in the body but not provided, you'll be prompted for it.

**All other keys** are passed directly as CLI flags:

```yaml
---
model: opus                  # → --model opus
dangerously-skip-permissions: true  # → --dangerously-skip-permissions
add-dir:                     # → --add-dir ./src --add-dir ./tests
  - ./src
  - ./tests
env:                         # Object form: sets process.env
  API_KEY: secret
---
```

### Positional Mapping ($N)

Map the body or positional args to specific flags:

```yaml
---
$1: prompt    # Body passed as --prompt <body> instead of positional
---
```

### Print vs Interactive Mode

All commands default to **print mode** (non-interactive). Use `.i.` filename marker or `_interactive: true` for interactive mode.

```bash
task.claude.md      # Print mode: claude --print "..."
task.i.claude.md    # Interactive: claude "..."
task.copilot.md     # Print mode: copilot --silent --prompt "..."
task.i.copilot.md   # Interactive: copilot --silent --interactive "..."
task.codex.md       # Print mode: codex exec "..."
task.i.codex.md     # Interactive: codex "..."
task.gemini.md      # Print mode: gemini "..." (one-shot)
task.i.gemini.md    # Interactive: gemini --prompt-interactive "..."
task.droid.md       # Print mode: droid exec "..."
task.i.droid.md     # Interactive: droid "..."
task.opencode.md    # Print mode: opencode run "..."
task.i.opencode.md  # Interactive: opencode "..."
```

### Global Config (`~/.mdflow/config.yaml`)

Set default frontmatter per command:

```yaml
commands:
  claude:
    model: sonnet # Default model for claude
```

### Template System (LiquidJS)

Uses [LiquidJS](https://liquidjs.com/) for full template support:

- Variables: `{{ _varname }}` (use `_` prefix for template vars)
- Stdin: `{{ _stdin }}` (auto-injected from piped input)
- Conditionals: `{% if _force %}--force{% endif %}`
- Filters: `{{ _name | upcase }}`, `{{ _value | default: "fallback" }}`
- CLI override: `--_varname value` matches `_varname` in frontmatter

## Testing Patterns

Tests use Bun's test runner with `describe`/`it` blocks:

```typescript
import { describe, it, expect } from "bun:test";

describe("parseCliArgs", () => {
  it("parses command flag", () => {
    const result = parseCliArgs(["node", "script", "file.md"]);
    expect(result.filePath).toBe("file.md");
  });
});
```

```


---

## Implementation Guide

### Step 1: Add Type (src/imports-types.ts)

Add after the existing action interfaces:

```typescript
export interface ExecutableCodeFenceAction {
  type: 'executable_code_fence';
  shebang: string;      // "#!/usr/bin/env bun"
  language: string;     // "ts", "js", "python"
  code: string;         // Code content (without shebang)
  original: string;     // Full match including fence markers
  index: number;
}
```

Update the ImportAction union to include it.

### Step 2: Parser Detection (src/imports-parser.ts)

Add pattern after COMMAND_INLINE_PATTERN:

```typescript
const EXECUTABLE_FENCE_PATTERN = /```(\w+)\n(#![^\n]+)\n([\s\S]*?)```/g;
```

In `parseImports()`, add after command parsing:

```typescript
EXECUTABLE_FENCE_PATTERN.lastIndex = 0;
while ((match = EXECUTABLE_FENCE_PATTERN.exec(content)) !== null) {
  const [fullMatch, language, shebang, code] = match;
  if (language && shebang && code !== undefined) {
    actions.push({
      type: 'executable_code_fence',
      language,
      shebang,
      code: code.trim(),
      original: fullMatch,
      index: match.index,
    });
  }
}
```

### Step 3: Executor (src/imports.ts)

Add imports and executor function:

```typescript
import { tmpdir } from "os";
import { chmod, unlink } from "fs/promises";

async function processExecutableCodeFence(
  action: ExecutableCodeFenceAction,
  currentFileDir: string,
  verbose: boolean,
  importCtx?: ImportContext
): Promise<string> {
  const { shebang, language, code } = action;
  const fullScript = `${shebang}\n${code}`;

  console.error(`[imports] Executing code fence (${language}): ${shebang}`);

  if (importCtx?.dryRun) {
    return `{% raw %}\n[Dry Run: Code fence not executed]\n{% endraw %}`;
  }

  const ext = { ts: 'ts', js: 'js', py: 'py', sh: 'sh' }[language] ?? language;
  const tmpFile = join(tmpdir(), `mdflow-${Date.now()}.${ext}`);

  try {
    await Bun.write(tmpFile, fullScript);
    await chmod(tmpFile, 0o755);

    const proc = Bun.spawn([tmpFile], {
      cwd: importCtx?.invocationCwd ?? currentFileDir,
      stdout: "pipe", stderr: "pipe",
      env: (importCtx?.env ?? process.env) as Record<string, string>,
    });

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    await proc.exited;

    if (proc.exitCode !== 0) {
      throw new Error(`Code fence failed (Exit ${proc.exitCode}): ${stderr || stdout}`);
    }

    const output = (stdout + stderr).trim().replace(ANSI_ESCAPE_REGEX, '');
    if (output) {
      const safe = output.replace(/\{% endraw %\}/g, "{% endraw %}{{ '{% endraw %}' }}{% raw %}");
      return `{% raw %}\n${safe}\n{% endraw %}`;
    }
    return output;
  } finally {
    try { await unlink(tmpFile); } catch {}
  }
}
```

### Step 4: Integration in expandImports

Add case in the switch handling import types:

```typescript
case 'executable_code_fence':
  resolvedContent = await processExecutableCodeFence(imp, currentFileDir, verbose, importCtx);
  break;
```

---

## Usage Example

```markdown
---
print: true
---
Current timestamp:

\`\`\`ts
#!/usr/bin/env bun
console.log(new Date().toISOString())
\`\`\`

Please summarize.
```

---

## Instructions For The Next AI Agent

You are reading the "Executable Code Fence Feature Expert Bundle". Your job is to implement the changes described above. Only fences with shebangs (`#!`) on the first line of code should execute. Regular code fences remain static.
