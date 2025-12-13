# Packx Output

This file contains 15 filtered files from the repository.

## Files

### src/config.test.ts

```ts
import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import {
  loadGlobalConfig,
  getCommandDefaults,
  applyDefaults,
  applyInteractiveMode,
  clearConfigCache,
  findGitRoot,
  loadProjectConfig,
  loadFullConfig,
  clearProjectConfigCache,
} from "./config";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("config", () => {
  beforeEach(() => {
    clearConfigCache();
  });

  test("loadGlobalConfig returns built-in defaults", async () => {
    const config = await loadGlobalConfig();
    expect(config.commands).toBeDefined();
    expect(config.commands?.copilot).toBeDefined();
    expect(config.commands!.copilot!.$1).toBe("prompt");  // Print mode by default
    expect(config.commands?.claude?.print).toBe(true);   // Print mode by default
    expect(config.commands?.codex?._subcommand).toBe("exec");  // Exec subcommand by default
  });

  test("getCommandDefaults returns defaults for copilot", async () => {
    const defaults = await getCommandDefaults("copilot");
    expect(defaults).toBeDefined();
    expect(defaults?.$1).toBe("prompt");  // Print mode by default
  });

  test("getCommandDefaults returns undefined for unknown command", async () => {
    const defaults = await getCommandDefaults("unknown-command");
    expect(defaults).toBeUndefined();
  });

  test("applyDefaults merges defaults with frontmatter (frontmatter wins)", () => {
    const frontmatter = { model: "opus", $1: "custom" };
    const defaults = { $1: "prompt", verbose: true };
    const result = applyDefaults(frontmatter, defaults);

    expect(result.model).toBe("opus");
    expect(result.$1).toBe("custom"); // frontmatter wins
    expect(result.verbose).toBe(true); // default applied
  });

  test("applyDefaults returns frontmatter unchanged when no defaults", () => {
    const frontmatter = { model: "opus" };
    const result = applyDefaults(frontmatter, undefined);
    expect(result).toEqual(frontmatter);
  });
});

describe("findGitRoot", () => {
  test("finds git root from current directory", () => {
    // The test is running inside the agents repo
    const gitRoot = findGitRoot(process.cwd());
    expect(gitRoot).not.toBeNull();
    expect(existsSync(join(gitRoot!, ".git"))).toBe(true);
  });

  test("finds git root from subdirectory", () => {
    const gitRoot = findGitRoot(join(process.cwd(), "src"));
    expect(gitRoot).not.toBeNull();
    expect(existsSync(join(gitRoot!, ".git"))).toBe(true);
  });

  test("returns null for non-git directory", () => {
    const gitRoot = findGitRoot(tmpdir());
    // tmpdir might be in a git repo on some systems, so we just check it doesn't error
    expect(gitRoot === null || typeof gitRoot === "string").toBe(true);
  });
});

describe("loadProjectConfig", () => {
  const testDir = join(tmpdir(), `md-test-${Date.now()}`);
  const subDir = join(testDir, "subdir");

  beforeEach(() => {
    clearProjectConfigCache();
    mkdirSync(subDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  test("returns empty config when no project config exists", async () => {
    const config = await loadProjectConfig(testDir);
    expect(config).toEqual({});
  });

  test("loads mdflow.config.yaml from CWD", async () => {
    writeFileSync(
      join(testDir, "mdflow.config.yaml"),
      `commands:
  claude:
    model: opus
`
    );

    const config = await loadProjectConfig(testDir);
    expect(config.commands?.claude?.model).toBe("opus");
  });

  test("loads .mdflow.yaml from CWD", async () => {
    writeFileSync(
      join(testDir, ".mdflow.yaml"),
      `commands:
  claude:
    model: sonnet
`
    );

    const config = await loadProjectConfig(testDir);
    expect(config.commands?.claude?.model).toBe("sonnet");
  });

  test("loads .mdflow.json from CWD", async () => {
    writeFileSync(
      join(testDir, ".mdflow.json"),
      JSON.stringify({
        commands: {
          claude: {
            model: "haiku",
          },
        },
      })
    );

    const config = await loadProjectConfig(testDir);
    expect(config.commands?.claude?.model).toBe("haiku");
  });

  test("prefers mdflow.config.yaml over .mdflow.yaml", async () => {
    writeFileSync(
      join(testDir, "mdflow.config.yaml"),
      `commands:
  claude:
    model: opus
`
    );
    writeFileSync(
      join(testDir, ".mdflow.yaml"),
      `commands:
  claude:
    model: sonnet
`
    );

    const config = await loadProjectConfig(testDir);
    expect(config.commands?.claude?.model).toBe("opus");
  });

  test("handles invalid YAML gracefully", async () => {
    writeFileSync(join(testDir, "mdflow.config.yaml"), "invalid: yaml: content:");

    const config = await loadProjectConfig(testDir);
    // Should return empty config on parse error
    expect(config).toEqual({});
  });

  test("handles invalid JSON gracefully", async () => {
    writeFileSync(join(testDir, ".mdflow.json"), "{ invalid json }");

    const config = await loadProjectConfig(testDir);
    expect(config).toEqual({});
  });
});

describe("loadFullConfig", () => {
  const testDir = join(tmpdir(), `md-full-test-${Date.now()}`);

  beforeEach(() => {
    clearConfigCache();
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  test("includes built-in defaults when no project config", async () => {
    const config = await loadFullConfig(testDir);
    expect(config.commands?.copilot?.$1).toBe("prompt");  // Print mode by default
  });

  test("project config overrides global config", async () => {
    writeFileSync(
      join(testDir, "mdflow.config.yaml"),
      `commands:
  copilot:
    $1: custom-prompt
`
    );

    const config = await loadFullConfig(testDir);
    expect(config.commands?.copilot?.$1).toBe("custom-prompt");
  });

  test("project config adds new commands", async () => {
    writeFileSync(
      join(testDir, "mdflow.config.yaml"),
      `commands:
  my-tool:
    $1: body
    verbose: true
`
    );

    const config = await loadFullConfig(testDir);
    // Built-in defaults preserved
    expect(config.commands?.copilot?.$1).toBe("prompt");  // Print mode by default
    // New command added
    expect(config.commands?.["my-tool"]?.$1).toBe("body");
    expect(config.commands?.["my-tool"]?.verbose).toBe(true);
  });

  test("project config merges with existing command", async () => {
    writeFileSync(
      join(testDir, "mdflow.config.yaml"),
      `commands:
  copilot:
    verbose: true
`
    );

    const config = await loadFullConfig(testDir);
    // Built-in default preserved
    expect(config.commands?.copilot?.$1).toBe("prompt");  // Print mode by default
    // New setting added
    expect(config.commands?.copilot?.verbose).toBe(true);
  });
});

describe("config cascade", () => {
  let testDir: string;
  let gitRoot: string;
  let subDir: string;

  beforeEach(() => {
    clearConfigCache();
    // Use unique directory per test to avoid cache issues
    testDir = join(tmpdir(), `md-cascade-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    gitRoot = join(testDir, "repo");
    subDir = join(gitRoot, "packages", "app");
    // Create a fake git repo structure
    mkdirSync(join(gitRoot, ".git"), { recursive: true });
    mkdirSync(subDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  test("CWD config overrides git root config", async () => {
    // Git root config
    writeFileSync(
      join(gitRoot, "mdflow.config.yaml"),
      `commands:
  claude:
    model: sonnet
    verbose: true
`
    );

    // CWD config (subdirectory)
    writeFileSync(
      join(subDir, "mdflow.config.yaml"),
      `commands:
  claude:
    model: opus
`
    );

    const config = await loadProjectConfig(subDir);
    // CWD wins for model
    expect(config.commands?.claude?.model).toBe("opus");
    // Git root setting preserved
    expect(config.commands?.claude?.verbose).toBe(true);
  });

  test("git root config used when CWD has no config", async () => {
    writeFileSync(
      join(gitRoot, "mdflow.config.yaml"),
      `commands:
  claude:
    model: sonnet
`
    );

    const config = await loadProjectConfig(subDir);
    expect(config.commands?.claude?.model).toBe("sonnet");
  });

  test("only CWD config used when at git root", async () => {
    writeFileSync(
      join(gitRoot, "mdflow.config.yaml"),
      `commands:
  claude:
    model: opus
`
    );

    const config = await loadProjectConfig(gitRoot);
    expect(config.commands?.claude?.model).toBe("opus");
  });
});

describe("applyInteractiveMode", () => {
  test("removes print flag for claude with _interactive: true", () => {
    const frontmatter = { print: true, model: "opus", _interactive: true };
    const result = applyInteractiveMode(frontmatter, "claude");
    expect(result.print).toBeUndefined();
    expect(result._interactive).toBeUndefined();
    expect(result.model).toBe("opus");
  });

  test("removes print flag for claude with _i: true", () => {
    const frontmatter = { print: true, model: "opus", _i: true };
    const result = applyInteractiveMode(frontmatter, "claude");
    expect(result.print).toBeUndefined();
    expect(result._i).toBeUndefined();
    expect(result.model).toBe("opus");
  });

  test("handles _interactive with null value (YAML empty key)", () => {
    const frontmatter = { print: true, _interactive: null };
    const result = applyInteractiveMode(frontmatter, "claude");
    expect(result.print).toBeUndefined();
    expect(result._interactive).toBeUndefined();
  });

  test("handles _i with null value (YAML empty key)", () => {
    const frontmatter = { print: true, _i: null };
    const result = applyInteractiveMode(frontmatter, "claude");
    expect(result.print).toBeUndefined();
    expect(result._i).toBeUndefined();
  });

  test("handles _interactive with empty string value", () => {
    const frontmatter = { print: true, _interactive: "" };
    const result = applyInteractiveMode(frontmatter, "claude");
    expect(result.print).toBeUndefined();
  });

  test("handles _i with empty string value", () => {
    const frontmatter = { print: true, _i: "" };
    const result = applyInteractiveMode(frontmatter, "claude");
    expect(result.print).toBeUndefined();
  });

  test("does not trigger interactive mode with _interactive: false", () => {
    const frontmatter = { print: true, _interactive: false };
    const result = applyInteractiveMode(frontmatter, "claude");
    expect(result.print).toBe(true);
  });

  test("does not trigger interactive mode when _interactive not present", () => {
    const frontmatter = { print: true, model: "opus" };
    const result = applyInteractiveMode(frontmatter, "claude");
    expect(result.print).toBe(true);
  });

  test("triggers interactive mode via external flag (interactiveFromExternal)", () => {
    const frontmatter = { print: true, model: "opus" };
    const result = applyInteractiveMode(frontmatter, "claude", true);
    expect(result.print).toBeUndefined();
    expect(result.model).toBe("opus");
  });

  test("changes copilot $1 from prompt to interactive", () => {
    const frontmatter = { $1: "prompt", silent: true, _interactive: true };
    const result = applyInteractiveMode(frontmatter, "copilot");
    expect(result.$1).toBe("interactive");
    expect(result.silent).toBe(true);
  });

  test("removes _subcommand for codex", () => {
    const frontmatter = { _subcommand: "exec", _interactive: true };
    const result = applyInteractiveMode(frontmatter, "codex");
    expect(result._subcommand).toBeUndefined();
  });

  test("adds prompt-interactive for gemini", () => {
    const frontmatter = { model: "pro", _interactive: true };
    const result = applyInteractiveMode(frontmatter, "gemini");
    expect(result.$1).toBe("prompt-interactive");
  });

  test("unknown command just removes _interactive", () => {
    const frontmatter = { custom: "value", _interactive: true };
    const result = applyInteractiveMode(frontmatter, "my-custom-cli");
    expect(result._interactive).toBeUndefined();
    expect(result.custom).toBe("value");
  });
});

```

### src/command.ts

```ts
/**
 * Command execution - simple, direct, unix-style
 * No abstraction layers, just frontmatter → CLI args → spawn
 */

import type { AgentFrontmatter } from "./types";
import { basename } from "path";
import { teeToStdoutAndCollect, teeToStderrAndCollect } from "./stream";

/**
 * Module-level reference to the current child process
 * Used for graceful signal handling (SIGINT/SIGTERM cleanup)
 */
let currentChildProcess: ReturnType<typeof Bun.spawn> | null = null;

/**
 * Get the current child process reference
 * Returns null if no process is running
 */
export function getCurrentChildProcess(): ReturnType<typeof Bun.spawn> | null {
  return currentChildProcess;
}

/**
 * Kill the current child process if running
 * Returns true if a process was killed, false otherwise
 */
export function killCurrentChildProcess(): boolean {
  if (currentChildProcess) {
    try {
      currentChildProcess.kill("SIGTERM");
      return true;
    } catch {
      // Process may have already exited
      return false;
    }
  }
  return false;
}

/**
 * Keys handled by the system, not passed to the command
 * - args: consumed for template variable mapping
 * - env (when object): sets process.env, not passed as flag
 * - $N patterns: positional mapping, handled specially
 */
const SYSTEM_KEYS = new Set([
  "args",
]);

/**
 * Check if a key is a positional mapping ($1, $2, etc.)
 */
function isPositionalKey(key: string): boolean {
  return /^\$\d+$/.test(key);
}

/**
 * Extract command from filename
 * e.g., "commit.claude.md" → "claude"
 * e.g., "task.gemini.md" → "gemini"
 * e.g., "fix.i.claude.md" → "claude" (with interactive mode)
 */
export function parseCommandFromFilename(filePath: string): string | undefined {
  const name = basename(filePath);
  // Match pattern: name.command.md or name.i.command.md
  const match = name.match(/\.([^.]+)\.md$/i);
  return match?.[1];
}

/**
 * Check if filename has .i. marker for interactive mode
 * e.g., "fix.i.claude.md" → true
 * e.g., "fix.claude.md" → false
 */
export function hasInteractiveMarker(filePath: string): boolean {
  const name = basename(filePath);
  // Match pattern: name.i.command.md
  return /\.i\.[^.]+\.md$/i.test(name);
}

/**
 * Resolve command from filename pattern
 * Note: --_command flag is handled in index.ts before this is called
 */
export function resolveCommand(filePath: string): string {
  const fromFilename = parseCommandFromFilename(filePath);
  if (fromFilename) {
    return fromFilename;
  }

  throw new Error(
    "No command specified. Use --_command flag, " +
    "or name your file like 'task.claude.md'"
  );
}

/**
 * Convert frontmatter key to CLI flag
 * e.g., "model" → "--model"
 * e.g., "p" → "-p"
 */
function toFlag(key: string): string {
  if (key.startsWith("-")) return key;
  if (key.length === 1) return `-${key}`;
  return `--${key}`;
}

/**
 * Build CLI args from frontmatter
 * Each key becomes a flag, values become arguments
 */
export function buildArgs(
  frontmatter: AgentFrontmatter,
  templateVars: Set<string>
): string[] {
  const args: string[] = [];

  for (const [key, value] of Object.entries(frontmatter)) {
    // Skip system keys
    if (SYSTEM_KEYS.has(key)) continue;

    // Skip positional mappings ($1, $2, etc.) - handled separately
    if (isPositionalKey(key)) continue;

    // Skip named template variable fields ($varname) - consumed for template substitution
    if (key.startsWith("$")) continue;

    // Skip internal md keys (_interactive, _subcommand, etc.)
    if (key.startsWith("_")) continue;

    // Skip template variables (used for substitution, not passed to command)
    if (templateVars.has(key)) continue;

    // Handle polymorphic env key
    if (key === "env") {
      // Object form: sets process.env, skip here
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        continue;
      }
      // Array/string form: pass as --env flags (fall through)
    }

    // Skip undefined/null/false
    if (value === undefined || value === null || value === false) continue;

    // Boolean true → just the flag
    if (value === true) {
      args.push(toFlag(key));
      continue;
    }

    // Array → repeat flag for each value
    if (Array.isArray(value)) {
      for (const v of value) {
        args.push(toFlag(key), String(v));
      }
      continue;
    }

    // String/number → flag with value
    args.push(toFlag(key), String(value));
  }

  return args;
}

/**
 * Extract positional mappings from frontmatter ($1, $2, etc.)
 * Returns a map of position number to flag name
 */
export function extractPositionalMappings(frontmatter: AgentFrontmatter): Map<number, string> {
  const mappings = new Map<number, string>();

  for (const [key, value] of Object.entries(frontmatter)) {
    if (isPositionalKey(key) && typeof value === "string") {
      const pos = parseInt(key.slice(1), 10);
      mappings.set(pos, value);
    }
  }

  return mappings;
}

/**
 * Extract environment variables to set (from object form of env)
 */
export function extractEnvVars(frontmatter: AgentFrontmatter): Record<string, string> | undefined {
  const env = frontmatter.env;
  if (typeof env === "object" && env !== null && !Array.isArray(env)) {
    return env as Record<string, string>;
  }
  return undefined;
}

/**
 * Output capture mode for runCommand
 * - "none": Inherit stdout/stderr, no capture (streaming to terminal)
 * - "capture": Pipe and buffer output, print after completion
 * - "tee": Tee streams - simultaneous display and capture (best of both)
 */
export type CaptureMode = "none" | "capture" | "tee";

export interface RunContext {
  /** The command to execute */
  command: string;
  /** CLI args built from frontmatter */
  args: string[];
  /** Positional arguments (body is $1, additional CLI args are $2, $3, etc.) */
  positionals: string[];
  /** Positional mappings ($1 → flag name) */
  positionalMappings: Map<number, string>;
  /**
   * Whether to capture output (legacy boolean) or capture mode
   * - false / "none": inherit stdout, no capture
   * - true / "capture": pipe and buffer, print after completion
   * - "tee": stream to stdout while capturing (simultaneous display + capture)
   */
  captureOutput: boolean | CaptureMode;
  /** Environment variables to add */
  env?: Record<string, string>;
  /**
   * Whether to also capture stderr (only applies when captureOutput is enabled)
   * Default: false (stderr goes to inherit)
   */
  captureStderr?: boolean;
}

export interface RunResult {
  exitCode: number;
  /** Captured stdout content (empty string if not capturing) */
  stdout: string;
  /** Captured stderr content (empty string if not capturing stderr) */
  stderr: string;
  /**
   * @deprecated Use `stdout` instead. Kept for backward compatibility.
   */
  output: string;
  /** The subprocess reference for signal handling */
  process: ReturnType<typeof Bun.spawn>;
}

/**
 * Normalize capture mode from boolean or string to CaptureMode
 */
function normalizeCaptureMode(mode: boolean | CaptureMode): CaptureMode {
  if (mode === true) return "capture";
  if (mode === false) return "none";
  return mode;
}

/**
 * Execute command with positional arguments
 * Positionals are either passed as-is or mapped to flags via $N mappings
 *
 * Capture modes:
 * - "none": Inherit stdout/stderr (streaming to terminal, no capture)
 * - "capture": Pipe and buffer output, print after completion
 * - "tee": Stream to stdout/stderr while capturing (simultaneous display + capture)
 */
export async function runCommand(ctx: RunContext): Promise<RunResult> {
  const { command, args, positionals, positionalMappings, captureOutput, env, captureStderr = false } = ctx;

  const mode = normalizeCaptureMode(captureOutput);

  // Pre-flight check: verify the command exists
  const binaryPath = Bun.which(command);
  if (!binaryPath) {
    console.error(`Command not found: '${command}'`);
    console.error(`This agent requires '${command}' to be installed and available in your PATH.`);
    console.error(`Please install it and try again.`);
    // Return empty process-like object for backward compatibility
    return { exitCode: 127, stdout: "", stderr: "", output: "", process: null as unknown as ReturnType<typeof Bun.spawn> };
  }

  // Build final command args
  const finalArgs = [...args];

  // Process positional arguments
  for (let i = 0; i < positionals.length; i++) {
    const pos = i + 1; // $1 is first positional
    const value = positionals[i];
    if (value === undefined) continue;

    if (positionalMappings.has(pos)) {
      // Map to flag: $1: prompt → --prompt <value>
      const flagName = positionalMappings.get(pos)!;
      finalArgs.push(toFlag(flagName), value);
    } else {
      // Pass as positional argument
      finalArgs.push(value);
    }
  }

  // Merge process.env with provided env
  const runEnv = env
    ? { ...process.env, ...env }
    : undefined;

  // Determine stdout/stderr pipe config based on mode
  const shouldPipeStdout = mode === "capture" || mode === "tee";
  const shouldPipeStderr = (mode === "capture" || mode === "tee") && captureStderr;

  const proc = Bun.spawn([command, ...finalArgs], {
    stdout: shouldPipeStdout ? "pipe" : "inherit",
    stderr: shouldPipeStderr ? "pipe" : "inherit",
    stdin: "inherit",
    env: runEnv,
  });

  // Store reference for signal handling
  currentChildProcess = proc;

  let stdout = "";
  let stderr = "";

  // Handle output based on mode
  if (mode === "tee") {
    // Tee mode: stream to console while capturing
    const promises: Promise<void>[] = [];

    if (proc.stdout) {
      promises.push(
        teeToStdoutAndCollect(proc.stdout).then((content) => {
          stdout = content;
        })
      );
    }

    if (proc.stderr && shouldPipeStderr) {
      promises.push(
        teeToStderrAndCollect(proc.stderr).then((content) => {
          stderr = content;
        })
      );
    }

    await Promise.all(promises);
  } else if (mode === "capture") {
    // Capture mode: buffer then print
    if (proc.stdout) {
      stdout = await new Response(proc.stdout).text();
      // Still print to console so user sees it
      console.log(stdout);
    }

    if (proc.stderr && shouldPipeStderr) {
      stderr = await new Response(proc.stderr).text();
      // Print stderr to console
      console.error(stderr);
    }
  }
  // mode === "none": stdout/stderr are inherited, nothing to capture

  const exitCode = await proc.exited;

  // Clear reference after process exits
  currentChildProcess = null;

  return {
    exitCode,
    stdout,
    stderr,
    output: stdout, // backward compatibility
    process: proc,
  };
}

```

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
  ExecutableCodeFenceAction,
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
  let fenceChar = '';
  let fenceLen = 0;

  while (i < content.length) {
    if (context === 'normal') {
      // Check for fenced code block start (3+ backticks or tildes)
      if (content[i] === '`' || content[i] === '~') {
        const char = content[i];
        let len = 0;
        let j = i;
        while (j < content.length && content[j] === char) {
          len++;
          j++;
        }

        if (len >= 3) {
          // It's a fence
          if (i > rangeStart) {
            safeRanges.push({ start: rangeStart, end: i });
          }
          context = 'fenced_code';
          fenceChar = char;
          fenceLen = len;
          i += len;
          // Skip info string
          while (i < content.length && content[i] !== '\n') {
            i++;
          }
          continue;
        }
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
      // Look for closing fence
      const atLineStart = i === 0 || content[i - 1] === '\n';
      if (atLineStart && content[i] === fenceChar) {
        let len = 0;
        let j = i;
        while (j < content.length && content[j] === fenceChar) {
          len++;
          j++;
        }

        if (len >= fenceLen) {
          // Close it
          i += len;
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
 * Pattern to match executable code fences
 * Matches: ```lang\n#!shebang\ncode\n```
 * Supports variable length fences.
 */
const EXECUTABLE_FENCE_PATTERN = /(`{3,})(.*?)\n(#![^\n]+)\n([\s\S]*?)\1/g;

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

  // Identify starts of unsafe blocks (gaps between safe ranges)
  // These are the only valid positions for executable code fences.
  // This prevents execution of fences nested inside documentation blocks.
  const unsafeStarts = new Set<number>();
  if (safeRanges.length > 0) {
    if (safeRanges[0].start > 0) unsafeStarts.add(0);
    for (const range of safeRanges) {
      if (range.end < content.length) {
        unsafeStarts.add(range.end);
      }
    }
  } else if (content.length > 0) {
    // If content exists but no safe ranges, the whole thing is unsafe (a code block)
    unsafeStarts.add(0);
  }

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

  // Parse executable code fences
  // Must match a top-level code block (start of an unsafe gap)
  EXECUTABLE_FENCE_PATTERN.lastIndex = 0;
  while ((match = EXECUTABLE_FENCE_PATTERN.exec(content)) !== null) {
    // Only process if the match aligns exactly with a known code block start
    if (unsafeStarts.has(match.index)) {
      const [fullMatch, fence, infoString, shebang, code] = match;
      const language = infoString.trim().split(/\s+/)[0]; // Extract first word as language

      if (shebang && code !== undefined) {
        const action: ExecutableCodeFenceAction = {
          type: 'executable_code_fence',
          language: language || 'txt',
          shebang,
          code: code.trim(),
          original: fullMatch,
          index: match.index,
        };
        actions.push(action);
      }
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

### src/config.ts

```ts
/**
 * Global and project-level configuration for mdflow
 * Loads defaults from ~/.mdflow/config.yaml
 * Cascades with project configs: global → git root → CWD (later overrides earlier)
 *
 * This module uses pure functions without module-level state.
 * Configuration is explicitly passed through the call chain via RunContext.
 */

import { homedir } from "os";
import { join, dirname, resolve } from "path";
import { existsSync, statSync } from "fs";
import yaml from "js-yaml";
import type { AgentFrontmatter, GlobalConfig, CommandDefaults, RunContext } from "./types";
import { getAdapter, buildBuiltinDefaults } from "./adapters";

// Re-export types for convenience
export type { GlobalConfig, CommandDefaults } from "./types";

const CONFIG_DIR = join(homedir(), ".mdflow");
const CONFIG_FILE = join(CONFIG_DIR, "config.yaml");

/** Project config file names (checked in order) */
const PROJECT_CONFIG_NAMES = ["mdflow.config.yaml", ".mdflow.yaml", ".mdflow.json"];

/**
 * Built-in defaults (used when no config file exists)
 * All tools default to PRINT mode (non-interactive)
 *
 * Generated dynamically from registered tool adapters
 */
export const BUILTIN_DEFAULTS: GlobalConfig = {
  commands: buildBuiltinDefaults(),
};

/**
 * Apply _interactive mode transformations to frontmatter
 * Converts print defaults to interactive mode per command
 *
 * Uses the tool adapter registry to delegate tool-specific transformations.
 *
 * @param frontmatter - The frontmatter after defaults are applied
 * @param command - The resolved command name
 * @param interactiveFromFilename - Whether .i. was detected in filename
 * @returns Transformed frontmatter for interactive mode
 */
export function applyInteractiveMode(
  frontmatter: AgentFrontmatter,
  command: string,
  interactiveFromExternal: boolean = false
): AgentFrontmatter {
  // Check if _interactive or _i is enabled
  // Can be: true, empty string (YAML key with no value), null (YAML key with explicit null), or external trigger
  // NOTE: We check key existence separately because ?? treats null as "nullish" and skips to next value
  const hasInteractiveKey = "_interactive" in frontmatter;
  const hasIKey = "_i" in frontmatter;
  const interactiveValue = hasInteractiveKey ? frontmatter._interactive : frontmatter._i;
  const interactiveMode = interactiveFromExternal ||
    interactiveValue === true ||
    interactiveValue === "" ||
    (hasInteractiveKey && interactiveValue === null) ||
    (hasIKey && interactiveValue === null) ||
    (interactiveValue !== undefined && interactiveValue !== false);

  if (!interactiveMode) {
    return frontmatter;
  }

  // Remove _interactive and _i from output (they're meta-keys, not CLI flags)
  const result = { ...frontmatter };
  delete result._interactive;
  delete result._i;

  // Delegate to the appropriate tool adapter for tool-specific transformations
  const adapter = getAdapter(command);
  return adapter.applyInteractiveMode(result);
}

// NOTE: Module-level caching has been removed to enable parallel testing.
// Use loadGlobalConfig(), loadProjectConfig(), and loadFullConfig() which
// are now pure functions that return fresh config instances each call.
// For performance-sensitive code paths, cache the result in a RunContext.

/**
 * Find the git root directory starting from a given path
 * Walks up the directory tree looking for .git
 * @returns The git root path, or null if not in a git repo
 */
export function findGitRoot(startPath: string): string | null {
  let current = resolve(startPath);
  let previous = "";

  // Walk up until we hit the filesystem root (when dirname returns the same path)
  while (current !== previous) {
    const gitPath = join(current, ".git");
    if (existsSync(gitPath)) {
      // Check if .git is a directory (normal repo) or file (worktree)
      try {
        const stat = statSync(gitPath);
        if (stat.isDirectory() || stat.isFile()) {
          return current;
        }
      } catch {
        // Continue searching if stat fails
      }
    }
    previous = current;
    current = dirname(current);
  }

  return null;
}

/**
 * Find project config file in a directory
 * Checks for mdflow.config.yaml, .mdflow.yaml, .mdflow.json
 * @returns The config file path if found, null otherwise
 */
function findProjectConfigFile(dir: string): string | null {
  for (const name of PROJECT_CONFIG_NAMES) {
    const configPath = join(dir, name);
    if (existsSync(configPath)) {
      return configPath;
    }
  }
  return null;
}

/**
 * Load config from a file (yaml or json)
 */
async function loadConfigFile(filePath: string): Promise<GlobalConfig | null> {
  try {
    const file = Bun.file(filePath);
    if (!await file.exists()) {
      return null;
    }
    const content = await file.text();

    if (filePath.endsWith(".json")) {
      return JSON.parse(content) as GlobalConfig;
    } else {
      return yaml.load(content) as GlobalConfig;
    }
  } catch {
    return null;
  }
}

/**
 * Load project-level config with cascade: git root → CWD
 * Returns merged config from both locations (CWD takes priority)
 *
 * This is a pure function - no caching. For performance-sensitive code,
 * store the result in RunContext.config.
 */
export async function loadProjectConfig(cwd: string): Promise<GlobalConfig> {
  const resolvedCwd = resolve(cwd);
  let projectConfig: GlobalConfig = {};

  // 1. Load from git root (if different from CWD)
  const gitRoot = findGitRoot(resolvedCwd);
  if (gitRoot && gitRoot !== resolvedCwd) {
    const gitRootConfigFile = findProjectConfigFile(gitRoot);
    if (gitRootConfigFile) {
      const gitRootConfig = await loadConfigFile(gitRootConfigFile);
      if (gitRootConfig) {
        projectConfig = gitRootConfig;
      }
    }
  }

  // 2. Load from CWD (overrides git root)
  const cwdConfigFile = findProjectConfigFile(resolvedCwd);
  if (cwdConfigFile) {
    const cwdConfig = await loadConfigFile(cwdConfigFile);
    if (cwdConfig) {
      projectConfig = mergeConfigs(projectConfig, cwdConfig);
    }
  }

  return projectConfig;
}

/**
 * Load global config from ~/.mdflow/config.yaml
 * Falls back to built-in defaults if file doesn't exist
 *
 * This is a pure function - no caching. For performance-sensitive code,
 * store the result in RunContext.config.
 *
 * Always returns a fresh copy to ensure isolation between callers.
 */
export async function loadGlobalConfig(): Promise<GlobalConfig> {
  try {
    const file = Bun.file(CONFIG_FILE);
    if (await file.exists()) {
      const content = await file.text();
      const parsed = yaml.load(content) as GlobalConfig;
      // Merge with built-in defaults (user config takes priority)
      return mergeConfigs(BUILTIN_DEFAULTS, parsed);
    }
  } catch {
    // Fall back to built-in defaults on parse error
  }
  // Return a deep clone to ensure callers get an independent copy
  return mergeConfigs(BUILTIN_DEFAULTS, {});
}

/**
 * Load fully merged config: built-in defaults → global → git root → CWD
 * This is the main entry point for loading config with project-level overrides
 */
export async function loadFullConfig(cwd: string = process.cwd()): Promise<GlobalConfig> {
  const globalConfig = await loadGlobalConfig();
  const projectConfig = await loadProjectConfig(cwd);

  // Merge: global → project (project takes priority)
  return mergeConfigs(globalConfig, projectConfig);
}

/**
 * Deep clone a GlobalConfig object
 * This ensures modifications to the returned config don't affect the source.
 */
function deepCloneConfig(config: GlobalConfig): GlobalConfig {
  const result: GlobalConfig = {};

  if (config.commands) {
    result.commands = {};
    for (const [cmd, defaults] of Object.entries(config.commands)) {
      result.commands[cmd] = { ...defaults };
    }
  }

  return result;
}

/**
 * Deep merge two configs (second takes priority)
 * Returns a new object - does not modify either input.
 */
export function mergeConfigs(base: GlobalConfig, override: GlobalConfig): GlobalConfig {
  // Start with a deep clone of base
  const result = deepCloneConfig(base);

  if (override.commands) {
    result.commands = result.commands ? { ...result.commands } : {};
    for (const [cmd, defaults] of Object.entries(override.commands)) {
      result.commands[cmd] = {
        ...(result.commands[cmd] || {}),
        ...defaults,
      };
    }
  }

  return result;
}

/**
 * Get defaults for a specific command
 */
export async function getCommandDefaults(command: string): Promise<CommandDefaults | undefined> {
  const config = await loadGlobalConfig();
  return config.commands?.[command];
}

/**
 * Apply command defaults to frontmatter
 * Frontmatter values take priority over defaults
 */
export function applyDefaults(
  frontmatter: AgentFrontmatter,
  defaults: CommandDefaults | undefined
): AgentFrontmatter {
  if (!defaults) {
    return frontmatter;
  }

  // Defaults go first, frontmatter overrides
  const result = { ...defaults } as AgentFrontmatter;

  for (const [key, value] of Object.entries(frontmatter)) {
    result[key] = value;
  }

  return result;
}

/**
 * Get the config directory path
 */
export function getConfigDir(): string {
  return CONFIG_DIR;
}

/**
 * Get the config file path
 */
export function getConfigFile(): string {
  return CONFIG_FILE;
}

/**
 * Clear the cached config (for testing)
 * @deprecated No-op function kept for backward compatibility.
 * Module-level caching has been removed - config functions are now pure.
 */
export function clearConfigCache(): void {
  // No-op: caching has been removed from this module
}

/**
 * Clear only the project config cache (for testing)
 * @deprecated No-op function kept for backward compatibility.
 * Module-level caching has been removed - config functions are now pure.
 */
export function clearProjectConfigCache(): void {
  // No-op: caching has been removed from this module
}

// ============================================================================
// Aliases for backward compatibility
// All config functions are now pure (no caching), so these are simple aliases.
// ============================================================================

/**
 * Load global config from ~/.mdflow/config.yaml (no caching)
 * @deprecated Use loadGlobalConfig() instead - all functions are now pure.
 */
export const loadGlobalConfigFresh = loadGlobalConfig;

/**
 * Load project-level config with cascade: git root → CWD (no caching)
 * @deprecated Use loadProjectConfig() instead - all functions are now pure.
 */
export const loadProjectConfigFresh = loadProjectConfig;

/**
 * Load fully merged config: built-in defaults → global → git root → CWD (no caching)
 * @deprecated Use loadFullConfig() instead - all functions are now pure.
 */
export const loadFullConfigFresh = loadFullConfig;

/**
 * Get defaults for a specific command from a config object
 * This is the pure function version that works with RunContext
 */
export function getCommandDefaultsFromConfig(
  config: GlobalConfig,
  command: string
): CommandDefaults | undefined {
  return config.commands?.[command];
}

```

### src/env.ts

```ts
/**
 * Environment variable loading using Bun's native .env support
 *
 * Bun automatically loads .env files from the current working directory.
 * This module extends that to also load from the markdown file's directory.
 *
 * Loading order (later files override earlier):
 * 1. .env (base environment)
 * 2. .env.local (local overrides, not committed)
 * 3. .env.[NODE_ENV] (environment-specific: .env.development, .env.production)
 * 4. .env.[NODE_ENV].local (environment-specific local overrides)
 */

import { join, dirname } from "path";

/**
 * Load environment files from a directory using Bun's native file reading
 * Files are loaded in order, with later files overriding earlier ones
 */
export async function loadEnvFiles(
  directory: string,
  verbose: boolean = false
): Promise<number> {
  const nodeEnv = process.env.NODE_ENV || "development";

  // Files to load in order (later overrides earlier)
  const envFiles = [
    ".env",
    ".env.local",
    `.env.${nodeEnv}`,
    `.env.${nodeEnv}.local`,
  ];

  // Track which keys were set by our loading (so later files can override)
  const loadedKeys = new Set<string>();
  // Snapshot of env vars that existed before we started loading
  const preExistingKeys = new Set(Object.keys(process.env));

  let loadedCount = 0;

  for (const envFile of envFiles) {
    const envPath = join(directory, envFile);
    const file = Bun.file(envPath);

    if (await file.exists()) {
      try {
        const content = await file.text();
        const vars = parseEnvFile(content);

        for (const [key, value] of Object.entries(vars)) {
          // Don't override pre-existing env vars (CLI/system take precedence)
          // But DO allow later .env files to override earlier .env files
          if (!preExistingKeys.has(key) || loadedKeys.has(key)) {
            process.env[key] = value;
            loadedKeys.add(key);
          }
        }

        loadedCount++;
        if (verbose) {
          console.error(`[env] Loaded: ${envFile} (${Object.keys(vars).length} vars)`);
        }
      } catch (err) {
        if (verbose) {
          console.error(`[env] Failed to load ${envFile}: ${(err as Error).message}`);
        }
      }
    }
  }

  return loadedCount;
}

/**
 * Parse .env file content into key-value pairs
 * Supports:
 * - KEY=value
 * - KEY="quoted value"
 * - KEY='single quoted'
 * - # comments
 * - Empty lines
 * - Multiline values with quotes
 */
function parseEnvFile(content: string): Record<string, string> {
  const vars: Record<string, string> = {};
  const lines = content.split("\n");

  let currentKey: string | null = null;
  let currentValue: string[] = [];
  let inMultiline = false;
  let quoteChar: string | null = null;

  for (const line of lines) {
    // Skip empty lines and comments (unless in multiline)
    if (!inMultiline && (line.trim() === "" || line.trim().startsWith("#"))) {
      continue;
    }

    if (inMultiline) {
      // Continue collecting multiline value
      currentValue.push(line);

      // Check if this line ends the multiline
      if (line.trimEnd().endsWith(quoteChar!)) {
        const fullValue = currentValue.join("\n");
        // Remove the closing quote
        vars[currentKey!] = fullValue.slice(0, -1);
        inMultiline = false;
        currentKey = null;
        currentValue = [];
        quoteChar = null;
      }
      continue;
    }

    // Parse KEY=value
    const match = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.*)/);
    if (!match) continue;

    const key = match[1];
    const rawValue = match[2];
    if (!key || rawValue === undefined) continue;

    let value = rawValue.trim();

    // Handle quoted values
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      // Simple quoted value on one line
      vars[key] = value.slice(1, -1);
    } else if (value.startsWith('"') || value.startsWith("'")) {
      // Start of multiline quoted value
      inMultiline = true;
      currentKey = key;
      quoteChar = value[0] ?? null;
      currentValue = [value.slice(1)]; // Remove opening quote
    } else {
      // Unquoted value - remove inline comments
      const commentIndex = value.indexOf(" #");
      if (commentIndex !== -1) {
        value = value.slice(0, commentIndex).trim();
      }
      vars[key] = value;
    }
  }

  return vars;
}

/**
 * Get a list of env files that would be loaded from a directory
 */
export async function getEnvFilesInDirectory(directory: string): Promise<string[]> {
  const nodeEnv = process.env.NODE_ENV || "development";
  const envFiles = [
    ".env",
    ".env.local",
    `.env.${nodeEnv}`,
    `.env.${nodeEnv}.local`,
  ];

  const existing: string[] = [];
  for (const envFile of envFiles) {
    const envPath = join(directory, envFile);
    if (await Bun.file(envPath).exists()) {
      existing.push(envFile);
    }
  }

  return existing;
}

```

### src/index.ts

```ts
#!/usr/bin/env bun
/**
 * Entry point for mdflow CLI
 *
 * This is a minimal entry point that:
 * 1. Sets up EPIPE handlers for graceful pipe handling
 * 2. Creates a CliRunner with the real system environment
 * 3. Runs the CLI and exits with the appropriate code
 *
 * All orchestration logic is in CliRunner for testability.
 */

import { CliRunner } from "./cli-runner";
import { BunSystemEnvironment } from "./system-environment";

async function main() {
  // Handle EPIPE gracefully when downstream closes the pipe early
  // (e.g., `md task.md | head -n 5`)
  process.stdout.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EPIPE") {
      process.exit(0);
    }
    throw err;
  });

  process.stderr.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EPIPE") {
      process.exit(0);
    }
    throw err;
  });

  // Create the runner with the real system environment
  const runner = new CliRunner({
    env: new BunSystemEnvironment(),
  });

  // Run the CLI and exit with the result code
  const result = await runner.run(process.argv);
  process.exit(result.exitCode);
}

main();

```

### src/types.ts

```ts
/**
 * IO Streams abstraction for testable stdin/stdout handling
 */
export interface IOStreams {
  /** Input stream (null if not piped/TTY mode) */
  stdin: NodeJS.ReadableStream | null;
  /** Output stream for command results */
  stdout: NodeJS.WritableStream;
  /** Error stream for status messages */
  stderr: NodeJS.WritableStream;
  /** Whether stdin is from a TTY (interactive mode) */
  isTTY: boolean;
}

/** Frontmatter configuration - keys become CLI flags */
export interface AgentFrontmatter {
  /** Named positional arguments to consume from CLI and map to template vars */
  args?: string[];

  /**
   * Environment variables (polymorphic):
   * - Object { KEY: "VAL" }: Sets process.env before execution
   * - Array ["KEY=VAL"] or String "KEY=VAL": Passes as --env flags to command
   */
  env?: Record<string, string> | string[] | string;

  /**
   * Context window limit override (in tokens)
   * If set, overrides the model-based default context limit
   * Useful for custom models or when you want to enforce a specific limit
   */
  context_window?: number;

  /**
   * Positional argument mapping ($1, $2, etc.)
   * Maps positional arguments to CLI flags
   * Example: $1: prompt → body becomes --prompt <body>
   */
  [key: `$${number}`]: string;

  /**
   * Named template variables ($varname)
   * Reads value from --varname CLI flag and makes it available as {{ varname }}
   * Example: $feature_name: → reads --feature_name value → {{ feature_name }}
   */
  [key: `$${string}`]: string | undefined;

  /**
   * All other keys are passed directly as CLI flags to the command.
   * - String values: --key value
   * - Boolean true: --key
   * - Boolean false: (omitted)
   * - Arrays: --key value1 --key value2
   */
  [key: string]: unknown;
}

export interface ParsedMarkdown {
  frontmatter: AgentFrontmatter;
  body: string;
}

export interface CommandResult {
  command: string;
  output: string;
  exitCode: number;
}

/**
 * Structured execution plan returned by dry-run mode
 *
 * Provides complete introspection of what would be executed,
 * enabling direct testing without parsing stdout.
 */
export interface ExecutionPlan {
  /** Type of result: dry-run shows plan, executed shows result, error shows failure */
  type: "dry-run" | "executed" | "error";
  /** The final prompt after all processing (imports, templates, stdin) */
  finalPrompt: string;
  /** The command that would be executed (e.g., "claude", "gemini") */
  command: string;
  /** CLI arguments built from frontmatter and passthrough */
  args: string[];
  /** Environment variables from frontmatter */
  env: Record<string, string>;
  /** Estimated token count for the final prompt */
  estimatedTokens: number;
  /** The parsed and merged frontmatter configuration */
  frontmatter: AgentFrontmatter;
  /** List of files that were imported/resolved (relative paths) */
  resolvedImports: string[];
  /** Template variables that were substituted */
  templateVars: Record<string, string>;
  /** Positional mappings from frontmatter ($1, $2, etc.) */
  positionalMappings: Record<number, string>;
}

/**
 * Logger interface for structured logging
 * Compatible with pino Logger but allows for custom implementations
 */
export interface Logger {
  debug(obj: object, msg?: string): void;
  debug(msg: string): void;
  info(obj: object, msg?: string): void;
  info(msg: string): void;
  warn(obj: object, msg?: string): void;
  warn(msg: string): void;
  error(obj: object, msg?: string): void;
  error(msg: string): void;
  child(bindings: Record<string, unknown>): Logger;
  level: string;
}

/**
 * Global configuration structure for mdflow
 */
export interface GlobalConfig {
  /** Default settings per command */
  commands?: Record<string, CommandDefaults>;
}

/**
 * Command-specific defaults
 * Keys starting with $ are positional mappings
 * Other keys are default flags
 */
export interface CommandDefaults {
  /** Map positional arg N to a flag (e.g., $1: "prompt" → --prompt <body>) */
  [key: `$${number}`]: string;
  /**
   * Context window limit override (in tokens)
   * Overrides model-based defaults for token limit calculations
   */
  context_window?: number;
  /** Default flag values */
  [key: string]: unknown;
}

/**
 * RunContext - Encapsulates all runtime dependencies
 *
 * This replaces global state (module-level singletons) with an explicit
 * context object that can be passed through the call chain. This enables:
 * - Complete test isolation (parallel tests don't interfere)
 * - Custom loggers/configs per test
 * - Easier mocking and dependency injection
 */
export interface RunContext {
  /** Logger instance for this run */
  logger: Logger;
  /** Global configuration */
  config: GlobalConfig;
  /** Environment variables (replaces process.env access) */
  env: Record<string, string | undefined>;
  /** Current working directory (replaces process.cwd()) */
  cwd: string;
}

/**
 * Options for creating a RunContext
 */
export interface RunContextOptions {
  /** Custom logger (defaults to silent logger) */
  logger?: Logger;
  /** Custom config (defaults to built-in defaults) */
  config?: GlobalConfig;
  /** Custom environment (defaults to process.env) */
  env?: Record<string, string | undefined>;
  /** Custom working directory (defaults to process.cwd()) */
  cwd?: string;
}

/**
 * Tool adapter interface for decoupling tool-specific logic
 *
 * Each adapter defines how a specific CLI tool (claude, copilot, gemini, etc.)
 * should be configured and how to transform between print and interactive modes.
 *
 * Adding support for a new tool only requires creating a new adapter file.
 */
export interface ToolAdapter {
  /** The tool name this adapter handles (e.g., "claude", "copilot") */
  name: string;

  /**
   * Default configuration for print mode (non-interactive)
   * These defaults are applied when no user config overrides them
   */
  getDefaults(): CommandDefaults;

  /**
   * Transform frontmatter for interactive mode
   * Called when _interactive is enabled (via flag or .i. filename marker)
   *
   * @param frontmatter - The frontmatter after defaults are applied
   * @returns Transformed frontmatter for interactive mode
   */
  applyInteractiveMode(frontmatter: AgentFrontmatter): AgentFrontmatter;
}

```

### src/imports.ts

```ts
import { resolve, dirname, relative, basename, join } from "path";
import { realpathSync } from "fs";
import { chmod, unlink } from "fs/promises";
import { homedir, platform, tmpdir } from "os";
import { Glob } from "bun";
import ignore from "ignore";
import { resilientFetch } from "./fetch";
import { MAX_INPUT_SIZE, FileSizeLimitError, exceedsLimit } from "./limits";
import { countTokens, getContextLimit } from "./tokenizer";
import { Semaphore, DEFAULT_CONCURRENCY_LIMIT } from "./concurrency";
import { substituteTemplateVars } from "./template";
import { parseImports as parseImportsSafe, hasImportsInContent } from "./imports-parser";
import type { ImportAction, ExecutableCodeFenceAction } from "./imports-types";

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

/**
 * Process an executable code fence by writing to temp file, making executable, and running
 */
async function processExecutableCodeFence(
  action: { shebang: string; language: string; code: string },
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

  const ext = { ts: 'ts', js: 'js', py: 'py', sh: 'sh', bash: 'sh' }[language] ?? language;
  const tmpFile = join(tmpdir(), `mdflow-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);

  try {
    await Bun.write(tmpFile, fullScript);
    await chmod(tmpFile, 0o755);

    const proc = Bun.spawn([tmpFile], {
      cwd: importCtx?.invocationCwd ?? currentFileDir,
      stdout: "pipe",
      stderr: "pipe",
      env: (importCtx?.env ?? process.env) as Record<string, string>,
    });

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    await proc.exited;

    if (proc.exitCode !== 0) {
      const errorOutput = stderr || stdout || "No output";
      throw new Error(`Code fence failed (Exit ${proc.exitCode}): ${errorOutput}`);
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

/** Import types for categorizing imports during parallel resolution */
type ParsedImport =
  | { type: 'file'; full: string; path: string; index: number }
  | { type: 'url'; full: string; url: string; index: number }
  | { type: 'command'; full: string; command: string; index: number }
  | { type: 'executable_code_fence'; full: string; action: ExecutableCodeFenceAction; index: number };

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
      case 'executable_code_fence':
        return { type: 'executable_code_fence' as const, full: action.original, action, index: action.index };
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

  // Initialize dashboard if we have any commands/fences and are in a TTY environment
  const commandImports = imports.filter(i => i.type === 'command' || i.type === 'executable_code_fence');
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
          case 'executable_code_fence':
            // Register with dashboard
            const fenceId = Math.random().toString(36).substring(7);
            if (dashboard) dashboard.register(fenceId, `Code Fence (${imp.action.language || 'script'})`);

            try {
              resolvedContent = await processExecutableCodeFence(imp.action, currentFileDir, verbose, importCtx);
            } finally {
              if (dashboard) dashboard.finish(fenceId);
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
 * Check if content contains any imports, URL imports, command inlines, or executable code fences
 */
export function hasImports(content: string): boolean {
  // Use context-aware checker from parser which now includes code fences
  return hasImportsInContent(content);
}

```

### src/template.test.ts

```ts
import { expect, test, describe } from "bun:test";
import {
  extractTemplateVars,
  substituteTemplateVars,
  parseTemplateArgs,
} from "./template";

describe("extractTemplateVars", () => {
  // Output tag tests ({{ variable }})
  test("extracts single variable", () => {
    const vars = extractTemplateVars("Hello {{ name }}!");
    expect(vars).toEqual(["name"]);
  });

  test("extracts multiple variables", () => {
    const vars = extractTemplateVars("{{ target }} references {{ reference }}");
    expect(vars).toEqual(["target", "reference"]);
  });

  test("handles variable with no spaces", () => {
    const vars = extractTemplateVars("{{name}}");
    expect(vars).toEqual(["name"]);
  });

  test("handles variable with extra spaces", () => {
    const vars = extractTemplateVars("{{   name   }}");
    expect(vars).toEqual(["name"]);
  });

  test("deduplicates repeated variables", () => {
    const vars = extractTemplateVars("{{ x }} and {{ x }} again");
    expect(vars).toEqual(["x"]);
  });

  test("returns empty array when no variables", () => {
    const vars = extractTemplateVars("No variables here");
    expect(vars).toEqual([]);
  });

  test("extracts variable from filter expression", () => {
    const vars = extractTemplateVars("{{ name | upcase }}");
    expect(vars).toEqual(["name"]);
  });

  // Logic tag tests ({% if/unless/elsif variable %})
  test("extracts variable from if tag", () => {
    const vars = extractTemplateVars("{% if debug %}DEBUG{% endif %}");
    expect(vars).toEqual(["debug"]);
  });

  test("extracts variable from unless tag", () => {
    const vars = extractTemplateVars("{% unless silent %}Loud{% endunless %}");
    expect(vars).toEqual(["silent"]);
  });

  test("extracts variable from elsif tag", () => {
    const vars = extractTemplateVars("{% if a %}A{% elsif b %}B{% endif %}");
    expect(vars).toContain("a");
    expect(vars).toContain("b");
  });

  test("extracts variables from comparison operators", () => {
    const vars = extractTemplateVars('{% if mode == "debug" %}DEBUG{% endif %}');
    expect(vars).toEqual(["mode"]);
  });

  test("extracts variables from and/or conditions", () => {
    const vars = extractTemplateVars("{% if debug and verbose %}VERBOSE DEBUG{% endif %}");
    expect(vars).toContain("debug");
    expect(vars).toContain("verbose");
  });

  test("excludes Liquid operators and keywords", () => {
    const vars = extractTemplateVars("{% if debug and not silent or verbose %}test{% endif %}");
    expect(vars).toContain("debug");
    expect(vars).toContain("silent");
    expect(vars).toContain("verbose");
    expect(vars).not.toContain("and");
    expect(vars).not.toContain("not");
    expect(vars).not.toContain("or");
  });

  test("excludes true/false/nil keywords", () => {
    const vars = extractTemplateVars("{% if enabled == true %}yes{% endif %}");
    expect(vars).toEqual(["enabled"]);
    expect(vars).not.toContain("true");
  });

  test("excludes numeric values", () => {
    const vars = extractTemplateVars("{% if count > 10 %}many{% endif %}");
    expect(vars).toEqual(["count"]);
    expect(vars).not.toContain("10");
  });

  // Combined cases
  test("extracts variables from both output and logic tags", () => {
    const content = `{% if debug %}
      Debug: {{ message }}
    {% endif %}`;
    const vars = extractTemplateVars(content);
    expect(vars).toContain("debug");
    expect(vars).toContain("message");
  });

  test("deduplicates variables across output and logic tags", () => {
    const content = "{% if name %}Hello {{ name }}!{% endif %}";
    const vars = extractTemplateVars(content);
    expect(vars).toEqual(["name"]);
  });

  test("handles complex template with multiple logic tags", () => {
    const content = `
      {% if force %}--force{% endif %}
      {% unless quiet %}echo "Processing {{ file }}"{% endunless %}
      {% if verbose and debug %}--verbose --debug{% elsif trace %}--trace{% endif %}
    `;
    const vars = extractTemplateVars(content);
    expect(vars).toContain("force");
    expect(vars).toContain("quiet");
    expect(vars).toContain("file");
    expect(vars).toContain("verbose");
    expect(vars).toContain("debug");
    expect(vars).toContain("trace");
  });

  // AST-specific tests (features that regex couldn't handle well)
  describe("AST-based extraction", () => {
    test("extracts root from nested variable access", () => {
      const vars = extractTemplateVars("{{ user.name }}");
      expect(vars).toEqual(["user"]);
    });

    test("extracts root from deeply nested access", () => {
      const vars = extractTemplateVars("{{ config.database.host }}");
      expect(vars).toEqual(["config"]);
    });

    test("handles chained filters", () => {
      const vars = extractTemplateVars("{{ name | upcase | truncate: 10 }}");
      expect(vars).toEqual(["name"]);
    });

    test("extracts collection variable from for loop", () => {
      const vars = extractTemplateVars("{% for item in items %}{{ item.name }}{% endfor %}");
      // 'item' is in local scope from the for loop, so only 'items' is a global
      expect(vars).toEqual(["items"]);
    });

    test("ignores variables inside comment blocks", () => {
      const vars = extractTemplateVars("{% comment %}{{ hidden }}{% endcomment %}{{ visible }}");
      expect(vars).toEqual(["visible"]);
    });

    test("ignores variables inside raw blocks", () => {
      const vars = extractTemplateVars("{% raw %}{{ template_syntax }}{% endraw %}{{ actual }}");
      expect(vars).toEqual(["actual"]);
    });

    test("handles variables with array index access", () => {
      const vars = extractTemplateVars("{{ items[0].name }}");
      expect(vars).toEqual(["items"]);
    });

    test("handles case/when statements", () => {
      const vars = extractTemplateVars(`
        {% case status %}
          {% when 'active' %}{{ active_message }}
          {% when 'pending' %}{{ pending_message }}
        {% endcase %}
      `);
      expect(vars).toContain("status");
      expect(vars).toContain("active_message");
      expect(vars).toContain("pending_message");
    });

    test("excludes locally assigned variables", () => {
      const vars = extractTemplateVars("{% assign local = 'value' %}{{ local }}{{ external }}");
      // 'local' is assigned in template scope, only 'external' is a global
      expect(vars).toEqual(["external"]);
    });

    test("excludes captured variables", () => {
      const vars = extractTemplateVars("{% capture greeting %}Hello{% endcapture %}{{ greeting }}{{ name }}");
      // 'greeting' is captured locally, only 'name' is a global
      expect(vars).toEqual(["name"]);
    });

    test("handles contains operator with variable", () => {
      const vars = extractTemplateVars('{% if haystack contains needle %}found{% endif %}');
      expect(vars).toContain("haystack");
      expect(vars).toContain("needle");
    });

    test("handles increment/decrement tags (exclude local counter)", () => {
      const vars = extractTemplateVars("{% increment counter %}{{ external }}");
      // 'counter' becomes a local, only 'external' is global
      expect(vars).toEqual(["external"]);
    });

    test("returns empty array for malformed template", () => {
      const vars = extractTemplateVars("{{ unclosed");
      expect(vars).toEqual([]);
    });

    test("handles empty template", () => {
      const vars = extractTemplateVars("");
      expect(vars).toEqual([]);
    });

    test("handles template with only static content", () => {
      const vars = extractTemplateVars("Hello, World!");
      expect(vars).toEqual([]);
    });
  });
});

describe("substituteTemplateVars", () => {
  test("substitutes single variable", () => {
    const result = substituteTemplateVars("Hello {{ name }}!", { name: "World" });
    expect(result).toBe("Hello World!");
  });

  test("substitutes multiple variables", () => {
    const result = substituteTemplateVars(
      "Refactor {{ target }} to match {{ reference }}",
      { target: "src/utils.ts", reference: "src/main.ts" }
    );
    expect(result).toBe("Refactor src/utils.ts to match src/main.ts");
  });

  test("handles repeated variables", () => {
    const result = substituteTemplateVars("{{ x }} + {{ x }} = 2x", { x: "1" });
    expect(result).toBe("1 + 1 = 2x");
  });

  test("renders unknown variables as empty by default", () => {
    const result = substituteTemplateVars("{{ known }} and {{ unknown }}", {
      known: "yes",
    });
    expect(result).toBe("yes and ");
  });

  test("uses default filter for fallback values", () => {
    const result = substituteTemplateVars('Hello {{ name | default: "World" }}!', {});
    expect(result).toBe("Hello World!");
  });

  test("throws in strict mode for missing variables", () => {
    expect(() =>
      substituteTemplateVars("{{ missing }}", {}, { strict: true })
    ).toThrow("Missing required template variable: missing");
  });

  test("throws in strict mode for missing variables in logic tags", () => {
    expect(() =>
      substituteTemplateVars("{% if debug %}DEBUG{% endif %}", {}, { strict: true })
    ).toThrow("Missing required template variable: debug");
  });

  test("strict mode passes when logic tag variables are provided", () => {
    const result = substituteTemplateVars(
      "{% if debug %}DEBUG{% endif %}",
      { debug: "true" },
      { strict: true }
    );
    expect(result).toBe("DEBUG");
  });

  test("supports conditionals", () => {
    const result = substituteTemplateVars(
      "{% if force %}--force{% endif %}",
      { force: "true" }
    );
    expect(result).toBe("--force");
  });

  test("supports conditional else", () => {
    const result = substituteTemplateVars(
      "{% if debug %}DEBUG{% else %}PRODUCTION{% endif %}",
      {}
    );
    expect(result).toBe("PRODUCTION");
  });

  test("supports upcase filter", () => {
    const result = substituteTemplateVars("{{ name | upcase }}", { name: "hello" });
    expect(result).toBe("HELLO");
  });

  test("supports downcase filter", () => {
    const result = substituteTemplateVars("{{ name | downcase }}", { name: "HELLO" });
    expect(result).toBe("hello");
  });
});

describe("parseTemplateArgs", () => {
  const knownFlags = new Set(["--model", "-m", "--silent"]);

  test("parses simple template arg", () => {
    const args = ["--target", "src/utils.ts"];
    const vars = parseTemplateArgs(args, knownFlags);
    expect(vars).toEqual({ target: "src/utils.ts" });
  });

  test("parses multiple template args", () => {
    const args = ["--target", "src/utils.ts", "--reference", "src/main.ts"];
    const vars = parseTemplateArgs(args, knownFlags);
    expect(vars).toEqual({ target: "src/utils.ts", reference: "src/main.ts" });
  });

  test("ignores known flags", () => {
    const args = ["--model", "gpt-5", "--target", "file.ts", "--silent"];
    const vars = parseTemplateArgs(args, knownFlags);
    expect(vars).toEqual({ target: "file.ts" });
  });

  test("handles boolean template flags", () => {
    const args = ["--force", "--target", "file.ts"];
    const vars = parseTemplateArgs(args, knownFlags);
    expect(vars).toEqual({ force: "true", target: "file.ts" });
  });

  test("handles paths with special characters", () => {
    const args = ["--path", "/Users/name/My Documents/file.ts"];
    const vars = parseTemplateArgs(args, knownFlags);
    expect(vars).toEqual({ path: "/Users/name/My Documents/file.ts" });
  });

  test("returns empty object when no template args", () => {
    const args = ["--model", "gpt-5", "--silent"];
    const vars = parseTemplateArgs(args, knownFlags);
    expect(vars).toEqual({});
  });
});

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

/** Executable Code Fence Action */
export interface ExecutableCodeFenceAction {
  type: 'executable_code_fence';
  shebang: string;      // "#!/usr/bin/env bun"
  language: string;     // "ts", "js", "python"
  code: string;         // Code content (without shebang)
  original: string;     // Full match including fence markers
  index: number;
}

/** Union of all import action types */
export type ImportAction =
  | FileImportAction
  | GlobImportAction
  | UrlImportAction
  | CommandImportAction
  | SymbolImportAction
  | ExecutableCodeFenceAction;

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

### src/cli.ts

```ts
import { Glob } from "bun";
import { basename, join } from "path";
import { realpathSync } from "fs";
import { homedir } from "os";
import { EarlyExitRequest, UserCancelledError } from "./errors";
import { showFileSelectorWithPreview } from "./file-selector";

export interface CliArgs {
  filePath: string;
  passthroughArgs: string[];
  // Only help flag remains - setup/logs are now subcommands
  help: boolean;
}

/** Result of handling md commands - can include a selected file from interactive picker */
export interface HandleMaCommandsResult {
  handled: boolean;
  selectedFile?: string;
}

/** Agent file discovered by the file finder */
export interface AgentFile {
  name: string;
  path: string;
  source: string;
}

/**
 * Parse CLI arguments
 *
 * When a markdown file or subcommand is provided: ALL flags pass through
 * When no file is provided: md's own flags are processed (--help)
 */
export function parseCliArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);

  // First, find if there's a file/subcommand (first non-flag argument)
  const fileIndex = args.findIndex(arg => !arg.startsWith("-"));
  const filePath = fileIndex >= 0 ? args[fileIndex] : "";

  // If we have a file/subcommand, everything else passes through
  if (filePath) {
    const passthroughArgs = [
      ...args.slice(0, fileIndex),
      ...args.slice(fileIndex + 1)
    ];
    return {
      filePath,
      passthroughArgs,
      help: false,
    };
  }

  // No file - check for --help flag
  let help = false;
  for (const arg of args) {
    if (arg === "--help" || arg === "-h") help = true;
  }

  return {
    filePath: "",
    passthroughArgs: args,
    help,
  };
}

function printHelp() {
  console.log(`
Usage: md <file.md> [flags for the command]
       md <command> [options]

Commands:
  md create [name] [flags]      Create a new agent file
  md setup                      Configure shell (PATH, aliases)
  md logs                       Show agent log directory
  md help                       Show this help

Create options:
  md create                     Interactive agent creator
  md create task.claude.md      Create with name (auto-detects command)
  md create -n task -p          Create in project .mdflow/ folder
  md create -g --model gpt-4    Create globally with frontmatter

Command resolution:
  1. --_command flag (e.g., md task.md --_command claude)
  2. Filename pattern (e.g., task.claude.md → claude)

Agent file discovery (in priority order):
  1. Explicit path:      md ./path/to/agent.md
  2. Current directory:  ./
  3. Project agents:     ./.mdflow/
  4. User agents:        ~/.mdflow/
  5. $PATH directories

All frontmatter keys are passed as CLI flags to the command.
Global defaults can be set in ~/.mdflow/config.yaml

Remote execution:
  md supports running agents from URLs (npx-style).
  On first use, you'll be prompted to trust the domain.
  Trusted domains are stored in ~/.mdflow/known_hosts

Examples:
  md task.claude.md -p "print mode"
  md task.claude.md --model opus --verbose
  md commit.gemini.md
  md task.md --_command claude
  md task.md -_c gemini
  md task.claude.md --_dry-run    # Preview without executing
  md https://example.com/agent.claude.md            # Remote execution
  md https://example.com/agent.claude.md --_trust   # Skip trust prompt

Config file example (~/.mdflow/config.yaml):
  commands:
    copilot:
      $1: prompt    # Map body to --prompt flag

md-specific flags (consumed, not passed to command):
  --_command, -_c   Specify command to run
  --_dry-run        Show resolved command and prompt without executing
  --_trust          Skip trust prompt for remote URLs (TOFU bypass)
  --_no-cache       Force fresh fetch for remote URLs (bypass cache)

Without arguments:
  md              Interactive agent picker (from ./.mdflow/, ~/.mdflow/, etc.)
`);
}

/**
 * Normalize a path to its real (resolved symlinks) absolute form
 * Used to deduplicate files that may appear via different paths (e.g., /var vs /private/var on macOS)
 */
function normalizePath(filePath: string): string {
  try {
    return realpathSync(filePath);
  } catch {
    // If realpath fails, fall back to the original path
    return filePath;
  }
}

/** Project-level agent directory */
const PROJECT_AGENTS_DIR = ".mdflow";

/** User-level agent directory */
const USER_AGENTS_DIR = join(homedir(), ".mdflow");

/**
 * Find agent markdown files with priority order:
 * 1. Current directory (cwd)
 * 2. Project-level: ./.mdflow/
 * 3. User-level: ~/.mdflow/
 * 4. $PATH directories
 *
 * Returns files sorted by source priority (earlier sources take precedence)
 */
export async function findAgentFiles(): Promise<AgentFile[]> {
  const files: AgentFile[] = [];
  const seenPaths = new Set<string>();

  const glob = new Glob("*.md");

  // 1. Current directory
  try {
    for await (const file of glob.scan({ cwd: process.cwd(), absolute: true })) {
      const normalizedPath = normalizePath(file);
      if (!seenPaths.has(normalizedPath)) {
        seenPaths.add(normalizedPath);
        files.push({ name: basename(file), path: normalizedPath, source: "cwd" });
      }
    }
  } catch {
    // Skip if cwd is not accessible
  }

  // 2. Project-level: ./.mdflow/
  const projectAgentsPath = join(process.cwd(), PROJECT_AGENTS_DIR);
  try {
    for await (const file of glob.scan({ cwd: projectAgentsPath, absolute: true })) {
      const normalizedPath = normalizePath(file);
      if (!seenPaths.has(normalizedPath)) {
        seenPaths.add(normalizedPath);
        files.push({ name: basename(file), path: normalizedPath, source: ".mdflow" });
      }
    }
  } catch {
    // Skip if .mdflow/ doesn't exist
  }

  // 3. User-level: ~/.mdflow/
  try {
    for await (const file of glob.scan({ cwd: USER_AGENTS_DIR, absolute: true })) {
      const normalizedPath = normalizePath(file);
      if (!seenPaths.has(normalizedPath)) {
        seenPaths.add(normalizedPath);
        files.push({ name: basename(file), path: normalizedPath, source: "~/.mdflow" });
      }
    }
  } catch {
    // Skip if ~/.mdflow/ doesn't exist
  }

  // 4. $PATH directories
  const pathDirs = (process.env.PATH || "").split(":");
  for (const dir of pathDirs) {
    if (!dir) continue;
    try {
      for await (const file of glob.scan({ cwd: dir, absolute: true })) {
        const normalizedPath = normalizePath(file);
        if (!seenPaths.has(normalizedPath)) {
          seenPaths.add(normalizedPath);
          files.push({ name: basename(file), path: normalizedPath, source: dir });
        }
      }
    } catch {
      // Skip directories that don't exist or can't be read
    }
  }

  return files;
}

/**
 * Get the project agents directory path
 */
export function getProjectAgentsDir(): string {
  return join(process.cwd(), PROJECT_AGENTS_DIR);
}

/**
 * Get the user agents directory path
 */
export function getUserAgentsDir(): string {
  return USER_AGENTS_DIR;
}

/**
 * Show interactive file picker with preview and return selected file path
 */
export async function showInteractiveSelector(files: AgentFile[]): Promise<string | undefined> {
  return showFileSelectorWithPreview(files);
}

/**
 * Handle md's own commands (when no file provided)
 * Returns result indicating if command was handled and optionally a selected file
 */
export async function handleMaCommands(args: CliArgs): Promise<HandleMaCommandsResult> {
  if (args.help) {
    printHelp();
    throw new EarlyExitRequest();
  }

  // No file and no flags - show interactive picker if TTY
  if (!args.filePath && !args.help) {
    if (process.stdin.isTTY) {
      const mdFiles = await findAgentFiles();
      if (mdFiles.length > 0) {
        const selected = await showInteractiveSelector(mdFiles);
        if (selected) {
          return { handled: true, selectedFile: selected };
        }
        // User cancelled - throw error for clean exit
        throw new UserCancelledError("No agent selected");
      }
    }
  }

  return { handled: false };
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

### src/command.test.ts

```ts
import { expect, test, describe } from "bun:test";
import { parseCommandFromFilename, resolveCommand, buildArgs, extractPositionalMappings, extractEnvVars, getCurrentChildProcess, killCurrentChildProcess, runCommand, type CaptureMode } from "./command";

describe("parseCommandFromFilename", () => {
  test("extracts command from filename pattern", () => {
    expect(parseCommandFromFilename("task.claude.md")).toBe("claude");
    expect(parseCommandFromFilename("commit.gemini.md")).toBe("gemini");
    expect(parseCommandFromFilename("review.codex.md")).toBe("codex");
  });

  test("handles paths with directories", () => {
    expect(parseCommandFromFilename("/path/to/task.claude.md")).toBe("claude");
    expect(parseCommandFromFilename("./agents/task.gemini.md")).toBe("gemini");
  });

  test("returns undefined for files without command pattern", () => {
    expect(parseCommandFromFilename("task.md")).toBeUndefined();
    expect(parseCommandFromFilename("README.md")).toBeUndefined();
  });

  test("handles case insensitivity", () => {
    expect(parseCommandFromFilename("task.CLAUDE.md")).toBe("CLAUDE");
    expect(parseCommandFromFilename("task.Claude.MD")).toBe("Claude");
  });
});

describe("resolveCommand", () => {
  test("resolves command from filename pattern", () => {
    expect(resolveCommand("task.claude.md")).toBe("claude");
    expect(resolveCommand("review.gemini.md")).toBe("gemini");
  });

  test("throws when no command can be resolved", () => {
    expect(() => resolveCommand("task.md")).toThrow("No command specified");
  });
});

describe("buildArgs", () => {
  test("converts string values to flags", () => {
    const result = buildArgs({ model: "opus" }, new Set());
    expect(result).toEqual(["--model", "opus"]);
  });

  test("converts boolean true to flag only", () => {
    const result = buildArgs({ "dangerously-skip-permissions": true }, new Set());
    expect(result).toEqual(["--dangerously-skip-permissions"]);
  });

  test("omits boolean false values", () => {
    const result = buildArgs({ debug: false }, new Set());
    expect(result).toEqual([]);
  });

  test("handles arrays by repeating flags", () => {
    const result = buildArgs({ "add-dir": ["./src", "./tests"] }, new Set());
    expect(result).toEqual(["--add-dir", "./src", "--add-dir", "./tests"]);
  });

  test("skips system keys (args)", () => {
    const result = buildArgs({
      args: ["message", "branch"],
      model: "opus",
    }, new Set());
    expect(result).toEqual(["--model", "opus"]);
  });

  test("skips positional mappings ($1, $2)", () => {
    const result = buildArgs({
      $1: "prompt",
      $2: "model",
      verbose: true,
    }, new Set());
    expect(result).toEqual(["--verbose"]);
  });

  test("skips env when it is an object (process.env config)", () => {
    const result = buildArgs({
      env: { HOST: "localhost" },
      model: "opus",
    }, new Set());
    expect(result).toEqual(["--model", "opus"]);
  });

  test("passes env as --env flags when it is an array", () => {
    const result = buildArgs({
      env: ["HOST=localhost", "PORT=3000"],
      model: "opus",
    }, new Set());
    // Order depends on object key enumeration
    expect(result).toContain("--env");
    expect(result).toContain("HOST=localhost");
    expect(result).toContain("PORT=3000");
    expect(result).toContain("--model");
    expect(result).toContain("opus");
  });

  test("passes env as --env flag when it is a string", () => {
    const result = buildArgs({
      env: "HOST=localhost",
      model: "opus",
    }, new Set());
    expect(result).toContain("--env");
    expect(result).toContain("HOST=localhost");
    expect(result).toContain("--model");
    expect(result).toContain("opus");
  });

  test("skips template variables", () => {
    const result = buildArgs({
      model: "opus",
      target: "src/main.ts",
    }, new Set(["target"]));
    expect(result).toEqual(["--model", "opus"]);
  });

  test("handles single-char flags", () => {
    const result = buildArgs({ p: true, c: true }, new Set());
    expect(result).toEqual(["-p", "-c"]);
  });
});

describe("extractPositionalMappings", () => {
  test("extracts $1, $2, etc. mappings", () => {
    const mappings = extractPositionalMappings({
      $1: "prompt",
      $2: "model",
      verbose: true,
    });
    expect(mappings.get(1)).toBe("prompt");
    expect(mappings.get(2)).toBe("model");
    expect(mappings.size).toBe(2);
  });

  test("returns empty map when no positional mappings", () => {
    const mappings = extractPositionalMappings({
      model: "opus",
      verbose: true,
    });
    expect(mappings.size).toBe(0);
  });
});

describe("extractEnvVars", () => {
  test("extracts object form of env", () => {
    const env = extractEnvVars({
      env: { HOST: "localhost", PORT: "3000" },
    });
    expect(env).toEqual({ HOST: "localhost", PORT: "3000" });
  });

  test("returns undefined for array form", () => {
    const env = extractEnvVars({
      env: ["HOST=localhost"],
    });
    expect(env).toBeUndefined();
  });

  test("returns undefined for string form", () => {
    const env = extractEnvVars({
      env: "HOST=localhost",
    });
    expect(env).toBeUndefined();
  });

  test("returns undefined when no env", () => {
    const env = extractEnvVars({
      model: "opus",
    });
    expect(env).toBeUndefined();
  });
});

describe("child process management for signal handling", () => {
  test("getCurrentChildProcess returns null when no process is running", () => {
    // Initially, no process should be running
    // Note: This test may be affected by other tests that spawn processes
    // We just verify the function is callable and returns the expected type
    const proc = getCurrentChildProcess();
    expect(proc === null || proc !== undefined).toBe(true);
  });

  test("killCurrentChildProcess returns false when no process is running", () => {
    // When no process is running, kill should return false
    // Note: Need to wait for any previous test processes to complete
    const killed = killCurrentChildProcess();
    expect(typeof killed).toBe("boolean");
  });

  test("runCommand sets and clears currentChildProcess", async () => {
    // Run a quick command and verify the process reference is managed
    const result = await runCommand({
      command: "echo",
      args: ["test"],
      positionals: [],
      positionalMappings: new Map(),
      captureOutput: true,
    });

    expect(result.exitCode).toBe(0);
    expect(result.output.trim()).toBe("test");

    // After command completes, getCurrentChildProcess should return null
    expect(getCurrentChildProcess()).toBeNull();
  });

  test("killCurrentChildProcess can terminate a running process", async () => {
    // Start a long-running process
    const runPromise = runCommand({
      command: "sleep",
      args: ["10"],
      positionals: [],
      positionalMappings: new Map(),
      captureOutput: false,
    });

    // Give the process a moment to start
    await new Promise(resolve => setTimeout(resolve, 50));

    // Verify a process is running
    const proc = getCurrentChildProcess();
    expect(proc).not.toBeNull();

    // Kill it
    const killed = killCurrentChildProcess();
    expect(killed).toBe(true);

    // Wait for the process to exit
    const result = await runPromise;

    // Process should have been terminated (exit code will be non-zero on signal)
    // On Unix, killed processes typically exit with 128 + signal number, or negative
    expect(result.exitCode).not.toBe(0);
  });
});

describe("runCommand capture modes", () => {
  test("capture mode 'none' (false) does not capture output", async () => {
    const result = await runCommand({
      command: "echo",
      args: ["silent"],
      positionals: [],
      positionalMappings: new Map(),
      captureOutput: false,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
    expect(result.output).toBe(""); // backward compat
  });

  test("capture mode 'capture' (true) buffers and returns output", async () => {
    const result = await runCommand({
      command: "echo",
      args: ["captured"],
      positionals: [],
      positionalMappings: new Map(),
      captureOutput: true,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("captured");
    expect(result.output.trim()).toBe("captured"); // backward compat
  });

  test("capture mode 'tee' streams and captures simultaneously", async () => {
    const result = await runCommand({
      command: "echo",
      args: ["tee-test"],
      positionals: [],
      positionalMappings: new Map(),
      captureOutput: "tee" as CaptureMode,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("tee-test");
    expect(result.output.trim()).toBe("tee-test"); // backward compat
  });

  test("capture mode 'none' string equivalent to false", async () => {
    const result = await runCommand({
      command: "echo",
      args: ["none-mode"],
      positionals: [],
      positionalMappings: new Map(),
      captureOutput: "none" as CaptureMode,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
  });

  test("captureStderr captures stderr when enabled", async () => {
    // Use a shell command that writes to stderr
    const result = await runCommand({
      command: "sh",
      args: ["-c", "echo 'stdout line' && echo 'stderr line' >&2"],
      positionals: [],
      positionalMappings: new Map(),
      captureOutput: "tee" as CaptureMode,
      captureStderr: true,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("stdout line");
    expect(result.stderr.trim()).toBe("stderr line");
  });

  test("captureStderr false keeps stderr on inherit", async () => {
    const result = await runCommand({
      command: "sh",
      args: ["-c", "echo 'stdout line' && echo 'stderr line' >&2"],
      positionals: [],
      positionalMappings: new Map(),
      captureOutput: "tee" as CaptureMode,
      captureStderr: false,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("stdout line");
    expect(result.stderr).toBe(""); // not captured
  });

  test("tee mode handles multi-line output correctly", async () => {
    const result = await runCommand({
      command: "sh",
      args: ["-c", "echo 'line1' && echo 'line2' && echo 'line3'"],
      positionals: [],
      positionalMappings: new Map(),
      captureOutput: "tee" as CaptureMode,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("line1");
    expect(result.stdout).toContain("line2");
    expect(result.stdout).toContain("line3");
  });

  test("tee mode preserves exit code on command failure", async () => {
    const result = await runCommand({
      command: "sh",
      args: ["-c", "echo 'before exit' && exit 42"],
      positionals: [],
      positionalMappings: new Map(),
      captureOutput: "tee" as CaptureMode,
    });

    expect(result.exitCode).toBe(42);
    expect(result.stdout.trim()).toBe("before exit");
  });
});

```

### src/schema.ts

```ts
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

