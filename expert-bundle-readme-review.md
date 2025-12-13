# README Documentation Review Expert Bundle

## Executive Summary
Review the mdflow README for clarity, organization, and completeness. The README is comprehensive (660 lines) but may benefit from restructuring for better user journeys.

### Key Review Areas:
1. **Value proposition**: Is "markdown files as executable agents" clear upfront?
2. **Filename convention**: Is `task.claude.md` and `.i.` for interactive clear?
3. **Organization**: Should it lead with use cases or technical details?
4. **Import features**: Are `@path`, globs, symbol extraction well explained?

### Files Included:
- `README.md`: Current documentation
- `CLAUDE.md`: Architecture reference
- `src/command.ts`: Command resolution logic
- `src/types.ts`: Core interfaces

---

This file is a merged representation of the filtered codebase, combined into a single document by packx.

<file_summary>
This section contains a summary of this file.

<purpose>
This file contains a packed representation of filtered repository contents.
It is designed to be easily consumable by AI systems for analysis, code review,
or other automated processes.
</purpose>

<usage_guidelines>
- Treat this file as a snapshot of the repository's state
- Be aware that this file may contain sensitive information
</usage_guidelines>

<notes>
- Files were filtered by packx based on content and extension matching
- Total files included: 5
</notes>
</file_summary>

<directory_structure>
src/command.ts
src/types.ts
CLAUDE.md
README.md
instructions/README.md
</directory_structure>

<files>
This section contains the contents of the repository's files.

<file path="src/command.ts">
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

</file>

<file path="src/types.ts">
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

</file>

<file path="CLAUDE.md">
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

</file>

<file path="README.md">
# mdflow

```bash
review.claude.md                 # Run with Claude
commit.gemini.md "fix auth bug"  # Run with Gemini
git diff | explain.claude.md     # Pipe through any command
```

**Your markdown files are now executable AI agents.**

---

## What Is This?

Markdown files become first-class CLI commands. Write a prompt in markdown, run it like a script. The command is inferred from the filename.

```markdown
# review.claude.md
---
model: opus
---
Review this code for bugs and suggest improvements.

@./src/**/*.ts
```

```bash
review.claude.md                 # Runs: claude --model opus <prompt>
review.claude.md --verbose       # Pass extra flags
```

---

## How It Works

### 1. Filename → Command

Name your file `task.COMMAND.md` and the command is inferred:

```bash
task.claude.md    # Runs claude
task.gemini.md    # Runs gemini
task.codex.md     # Runs codex
task.copilot.md   # Runs copilot (print mode by default)
```

### 2. Frontmatter → CLI Flags

Every YAML key becomes a CLI flag passed to the command:

```yaml
---
model: opus              # → --model opus
dangerously-skip-permissions: true  # → --dangerously-skip-permissions
mcp-config: ./mcp.json   # → --mcp-config ./mcp.json
add-dir:                 # → --add-dir ./src --add-dir ./tests
  - ./src
  - ./tests
---
```

### 3. Body → Prompt

The markdown body is passed as the final argument to the command.

---

## Unix Philosophy

mdflow embraces the Unix philosophy:

- **No magic mapping** - Frontmatter keys pass directly to the command
- **Stdin/stdout** - Pipe data in and out
- **Composable** - Chain agents together
- **Transparent** - See what runs in logs

```bash
# Pipe input
git diff | mdflow review.claude.md

# Chain agents
mdflow plan.claude.md | mdflow implement.codex.md
```

---

## Installation

```bash
npm install -g mdflow
# or
bun install && bun link
```

## Quick Start

```bash
# Run with filename-inferred command
mdflow task.claude.md
mdflow task.gemini.md

# Override command via --command flag
mdflow task.md --command claude
mdflow task.md -c gemini

# Pass additional flags to the command
mdflow task.claude.md --verbose --debug
```

> **Note:** Both `mdflow` and `md` commands are available.

---

## Command Resolution

Commands are resolved in this priority order:

1. **CLI flag**: `--command claude` or `-c claude`
2. **Filename pattern**: `task.claude.md` → `claude`

If no command can be resolved, you'll get an error with instructions.

---

## Flag Hijacking

Some CLI flags are "hijacked" by mdflow—they're consumed and never passed to the underlying command. This allows generic markdown files without command names to be executed.

### `--command` / `-c`

Override the command for any markdown file:

```bash
# Run a generic .md file with any command
mdflow task.md --command claude
mdflow task.md -c gemini

# Override the filename-inferred command
mdflow task.claude.md --command gemini  # Runs gemini, not claude
```

### `_varname` Template Variables

Frontmatter fields starting with `_` (except internal keys like `_interactive`, `_cwd`, `_subcommand`) define template variables:

```yaml
---
_feature_name: Authentication   # Default value
_target_dir: src/features       # Default value
---
Build {{ _feature_name }} in {{ _target_dir }}.
```

```bash
# Use defaults
mdflow create.claude.md

# Override with CLI flags (consumed by mdflow, not passed to command)
mdflow create.claude.md --_feature_name "Payments" --_target_dir "src/billing"
```

The `--_feature_name` and `--_target_dir` flags are consumed by mdflow for template substitution—they won't be passed to the command.

**No frontmatter declaration required:** You can pass `--_varname` flags without declaring them in frontmatter. If the variable is used in the body but not provided, you'll be prompted for it:

```yaml
---
print: true
---
{% if _verbose == "yes" %}Detailed analysis:{% endif %}
Review this code: {{ _target }}
```

```bash
mdflow review.claude.md --_verbose yes --_target "./src"
```

### Positional Arguments as Template Variables

CLI positional arguments are available as `{{ _1 }}`, `{{ _2 }}`, etc.:

```yaml
---
print: true
---
Translate "{{ _1 }}" to {{ _2 }}.
```

```bash
mdflow translate.claude.md "hello world" "French"
# → Translate "hello world" to French.
```

Use `{{ _args }}` to get all positional args as a numbered list:

```yaml
---
print: true
---
Process these items:
{{ _args }}
```

```bash
mdflow process.claude.md "apple" "banana" "cherry"
# → Process these items:
# → 1. apple
# → 2. banana
# → 3. cherry
```

### `_stdin` - Piped Input

When you pipe content to mdflow, it's available as the `_stdin` template variable:

```yaml
---
model: haiku
---
Summarize this: {{ _stdin }}
```

```bash
cat README.md | mdflow summarize.claude.md
```

---

## Frontmatter Reference

### System Keys (handled by mdflow)

| Field | Type | Description |
|-------|------|-------------|
| `_varname` | string | Template variable with default value (use `{{ _varname }}` in body) |
| `env` | object | Set process environment variables |
| `env` | string[] | Pass as `--env` flags to command |
| `$1`, `$2`... | string | Map positional args to flags (e.g., `$1: prompt`) |
| `_interactive` / `_i` | boolean | Enable interactive mode (overrides print-mode defaults) |
| `_subcommand` | string/string[] | Prepend subcommand(s) to CLI args |
| `_cwd` | string | Override working directory for inline commands |

### Auto-Injected Template Variables

| Variable | Description |
|----------|-------------|
| `{{ _stdin }}` | Content piped to mdflow |
| `{{ _1 }}`, `{{ _2 }}`... | Positional CLI arguments |
| `{{ _args }}` | All positional args as numbered list (1. arg1, 2. arg2, ...) |

### All Other Keys → CLI Flags

Every other frontmatter key is passed directly to the command:

```yaml
---
model: opus                           # → --model opus
dangerously-skip-permissions: true    # → --dangerously-skip-permissions
mcp-config: ./mcp.json                # → --mcp-config ./mcp.json
p: true                               # → -p (single char = short flag)
---
```

**Value conversion:**
- `key: "value"` → `--key value`
- `key: true` → `--key`
- `key: false` → (omitted)
- `key: [a, b]` → `--key a --key b`

---

## Print vs Interactive Mode

All commands run in **print mode by default** (non-interactive, exit after completion). Use the `.i.` filename marker, `_interactive` frontmatter, or CLI flags to enable interactive mode.

### Print Mode (Default)

```bash
task.claude.md      # Runs: claude --print "..."
task.copilot.md     # Runs: copilot --silent --prompt "..."
task.codex.md       # Runs: codex exec "..."
task.gemini.md      # Runs: gemini "..." (one-shot)
```

### Interactive Mode

Add `.i.` before the command name in the filename:

```bash
task.i.claude.md    # Runs: claude "..." (interactive session)
task.i.copilot.md   # Runs: copilot --silent --interactive "..."
task.i.codex.md     # Runs: codex "..." (interactive session)
task.i.gemini.md    # Runs: gemini --prompt-interactive "..."
```

Or use `_interactive` (or `_i`) in frontmatter:

```yaml
---
_interactive: true   # or _interactive: (empty), or _i:
model: opus
---
Review this code with me interactively.
```

Or use CLI flags:

```bash
mdflow task.claude.md --_interactive  # Enable interactive mode
mdflow task.claude.md -_i             # Short form
```

---

## Global Configuration

Set default frontmatter per command in `~/.mdflow/config.yaml`:

```yaml
commands:
  claude:
    model: sonnet # Default model for claude
  copilot:
    silent: true  # Always use --silent for copilot
```

**Built-in defaults:** All commands default to print mode with appropriate flags per CLI tool.

---

## Examples

### Claude with MCP Server

```markdown
# db.claude.md
---
model: opus
mcp-config: ./postgres-mcp.json
dangerously-skip-permissions: true
---
Analyze the database schema and suggest optimizations.
```

### Gemini YOLO Mode

```markdown
# refactor.gemini.md
---
model: gemini-3-pro-preview
yolo: true
---
Refactor the authentication module to use async/await.
```

### Codex with Sandbox

```markdown
# analyze.codex.md
---
model: o3
sandbox: workspace-write
full-auto: true
---
Analyze this codebase and suggest improvements.
```

### Copilot (no frontmatter needed!)

```markdown
# task.copilot.md
Explain this code.
```

This runs: `copilot --silent --prompt "Explain this code."` (print mode)

For interactive mode, use `.i.` in the filename:

```markdown
# task.i.copilot.md
Explain this code.
```

This runs: `copilot --silent --interactive "Explain this code."`

### Template Variables

```markdown
# create-feature.claude.md
---
_feature_name: ""
_target_dir: src/features
model: sonnet
---
Create a new feature called "{{ _feature_name }}" in {{ _target_dir }}.
```

```bash
mdflow create-feature.claude.md --_feature_name "Auth"
```

### Environment Variables

```markdown
# api-test.claude.md
---
env:
  API_URL: https://api.example.com
  DEBUG: "true"
---
Test the API at !`echo $API_URL`
```

---

## Imports & Command Inlines

Inline content from other files or command output directly in your prompts.

### File Imports

Use `@` followed by a path to inline file contents:

```markdown
---
model: claude
---
Follow these coding standards:
@~/.config/coding-standards.md

Now review this code:
@./src/api.ts
```

- `@~/path` - Expands `~` to home directory
- `@./path` - Relative to current markdown file
- `@/path` - Absolute path

Imports are recursive—imported files can have their own `@` imports.

### Glob Imports

Use glob patterns to include multiple files at once:

```markdown
Review all TypeScript files in src:
@./src/**/*.ts
```

Glob imports:
- Respect `.gitignore` automatically
- Include common exclusions (`node_modules`, `.git`, etc.)
- Are limited to ~100,000 tokens by default
- Set `MDFLOW_FORCE_CONTEXT=1` to override the token limit

Files are formatted as XML with path attributes:

```xml
<api path="src/api.ts">
...file content...
</api>

<utils path="src/utils.ts">
...file content...
</utils>
```

### Line Range Imports

Extract specific lines from a file:

```markdown
@./src/api.ts:10-50
```

This imports only lines 10-50 from the file.

### Symbol Extraction

Extract specific TypeScript/JavaScript symbols (interfaces, types, functions, classes, etc.):

```markdown
@./src/types.ts#UserInterface
@./src/api.ts#fetchUser
```

Supported symbols:
- `interface Name { ... }`
- `type Name = ...`
- `function Name(...) { ... }`
- `class Name { ... }`
- `const/let/var Name = ...`
- `enum Name { ... }`

### Command Inlines

Use `` !`command` `` to execute a shell command and inline its output:

```markdown
Current branch: !`git branch --show-current`
Recent commits:
!`git log --oneline -5`

Based on the above, suggest what to work on next.
```

### URL Imports

Fetch content from URLs (markdown and JSON only):

```markdown
@https://raw.githubusercontent.com/user/repo/main/README.md
```

**Caching:** Remote URLs are cached locally at `~/.mdflow/cache/` with a 1-hour TTL. Use `--no-cache` to force a fresh fetch:

```bash
mdflow agent.claude.md --no-cache
```

---

## Environment Variables

mdflow automatically loads `.env` files from the markdown file's directory.

### Loading Order

Files are loaded in order (later files override earlier):

1. `.env` - Base environment
2. `.env.local` - Local overrides (not committed)
3. `.env.development` / `.env.production` - Environment-specific
4. `.env.development.local` / `.env.production.local` - Environment-specific local

### Example

```
my-agents/
├── .env                    # API_KEY=default
├── .env.local              # API_KEY=my-secret (gitignored)
└── review.claude.md
```

Environment variables are available:
- In command inlines: `` !`echo $API_KEY` ``
- In the spawned command's environment

---

## CLI Options

```
Usage: mdflow <file.md> [any flags for the command]
       mdflow <file.md> --command <cmd>
       mdflow --setup
       mdflow --logs
       mdflow --help

Command resolution:
  1. --command flag (e.g., mdflow task.md --command claude)
  2. Filename pattern (e.g., task.claude.md → claude)

All frontmatter keys are passed as CLI flags to the command.
Global defaults can be set in ~/.mdflow/config.yaml

mdflow-specific flags (consumed, not passed to command):
  --command, -c       Specify command to run
  --dry-run           Preview without executing
  --_interactive, -_i Enable interactive mode
  --no-cache          Force fresh fetch for remote URLs (bypass cache)
  --trust             Bypass TOFU prompts for remote URLs

Examples:
  mdflow task.claude.md -p "print mode"
  mdflow task.claude.md --model opus --verbose
  mdflow commit.gemini.md
  mdflow task.md --command claude
  mdflow task.md -c gemini
  mdflow task.claude.md -_i  # Run in interactive mode

Without a file:
  mdflow --setup    Configure shell to run .md files directly
  mdflow --logs     Show log directory
  mdflow --help     Show this help
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `MDFLOW_FORCE_CONTEXT` | Set to `1` to disable the 100k token limit for glob imports |
| `NODE_ENV` | Controls which `.env.[NODE_ENV]` file is loaded (default: `development`) |

---

## Shell Setup

Make `.md` files directly executable:

```bash
mdflow --setup   # One-time setup
```

Then run agents directly:

```bash
task.claude.md                   # Just type the filename
task.claude.md --verbose         # With passthrough args
```

### Manual Setup (zsh)

Add to `~/.zshrc`:

```bash
alias -s md='mdflow'
export PATH="$HOME/agents:$PATH"  # Your agent library
```

---

## Building Your Agent Library

Create a directory of agents and add it to PATH:

```
~/agents/
├── review.claude.md     # Code review
├── commit.gemini.md     # Commit messages
├── explain.claude.md    # Code explainer
├── test.codex.md        # Test generator
└── debug.claude.md      # Debugging helper
```

```bash
export PATH="$HOME/agents:$PATH"
```

Now use them from anywhere:

```bash
review.claude.md                 # Review current directory
commit.gemini.md "add auth"      # Generate commit message
git diff | review.claude.md      # Review staged changes
```

---

## Notes

- If no frontmatter is present, the file is printed as-is (unless command inferred from filename)
- Template system uses [LiquidJS](https://liquidjs.com/) - supports conditionals, loops, and filters
- Logs are always written to `~/.mdflow/logs/<agent-name>/` for debugging
- Use `--logs` to show the log directory
- Piped input is available as `{{ _stdin }}` template variable
- Template variables use `_` prefix: `_name` in frontmatter → `{{ _name }}` in body → `--_name` CLI flag
- Remote URLs are cached at `~/.mdflow/cache/` with 1-hour TTL (use `--no-cache` to bypass)
- Imports inside code blocks (``` or `) are ignored by the parser

</file>

<file path="instructions/README.md">
---
model: claude-haiku-4.5
silent: true
allow-tool: write
---

# Copilot Prompt Agents

Drop `.md` files here with YAML frontmatter to create reusable copilot prompts.

## Usage

Just type the filename in your terminal:

```bash
CHECK_ACTIONS.md
DEMO.md
```

## Frontmatter Options

| Field | Type | Description |
|-------|------|-------------|
| `model` | enum | AI model (claude-haiku-4.5, claude-opus-4.5, gpt-5, etc.) |
| `agent` | string | Custom agent name |
| `silent` | bool | Only output response, no stats |
| `interactive` | bool | Start interactive mode |
| `allow-all-tools` | bool | Auto-approve all tools |
| `allow-all-paths` | bool | Allow access to any file path |
| `allow-tool` | string | Allow specific tools |
| `deny-tool` | string | Deny specific tools |
| `add-dir` | string | Additional allowed directory |

## Example

```markdown
---
pre: gh run list --limit 5
model: claude-haiku-4.5
silent: true
---

Analyze the CI output above and summarize any failures.
```


Fix the current README.md based on the codebase

</file>

</files>

---

## Instructions For The Next AI Agent

You are reading the "README Documentation Review Expert Bundle". This file is self-contained.

**Your job:** Review the README.md and propose improvements for clarity, organization, and completeness.

**Rules:**
1. Provide **precise markdown snippets** that can be copy-pasted directly
2. Include **exact file paths** and section headers for location
3. Show the full section as it should look **after** the change
4. Keep instructions **unambiguous**

**Suggested improvements to consider:**
- Add a "Why mdflow?" comparison table
- Restructure for user journeys (quickstart → concepts → reference)
- Make the `.i.` interactive convention more prominent
- Strengthen the opening hook
- Consider a shorter "TL;DR" section at the top