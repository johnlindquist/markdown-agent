import { select } from "@inquirer/prompts";
import { Glob } from "bun";
import { basename, join } from "path";
import { realpathSync } from "fs";
import { homedir } from "os";
import { EarlyExitRequest, UserCancelledError } from "./errors";

export interface CliArgs {
  filePath: string;
  passthroughArgs: string[];
  // These only apply when NO file is provided
  help: boolean;
  setup: boolean;
  logs: boolean;
}

/** Result of handling ma commands - can include a selected file from interactive picker */
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
 * When a markdown file is provided: ALL flags pass through to the command
 * When no file is provided: ma's own flags are processed (--help, --setup, --logs)
 */
export function parseCliArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);

  // First, find if there's a markdown file
  const fileIndex = args.findIndex(arg => !arg.startsWith("-"));
  const filePath = fileIndex >= 0 ? args[fileIndex] : "";

  // If we have a file, everything else passes through
  if (filePath) {
    const passthroughArgs = [
      ...args.slice(0, fileIndex),
      ...args.slice(fileIndex + 1)
    ];
    return {
      filePath,
      passthroughArgs,
      help: false,
      setup: false,
      logs: false,
    };
  }

  // No file - check for ma's own commands
  let help = false;
  let setup = false;
  let logs = false;

  for (const arg of args) {
    if (arg === "--help" || arg === "-h") help = true;
    if (arg === "--setup") setup = true;
    if (arg === "--logs") logs = true;
  }

  return {
    filePath: "",
    passthroughArgs: [],
    help,
    setup,
    logs,
  };
}

function printHelp() {
  console.log(`
Usage: ma <file.md> [any flags for the command]
       ma create [name] [flags]
       ma <file.md> --command <cmd>
       ma <file.md> --dry-run
       ma <url> [--trust]
       ma --setup
       ma --logs
       ma --help

Create Mode:
  ma create                     Interactive agent creator
  ma create --name my-task      Create with name
  ma create -n task -p          Create in project .ma/ folder
  ma create -g --model gpt-4    Create in global ~/.ma/ folder with frontmatter

Command resolution:
  1. --command flag (e.g., ma task.md --command claude)
  2. Filename pattern (e.g., task.claude.md → claude)

Agent file discovery (in priority order):
  1. Explicit path:      ma ./path/to/agent.md
  2. Current directory:  ./
  3. Project agents:     ./.ma/
  4. User agents:        ~/.ma/
  5. $PATH directories

All frontmatter keys are passed as CLI flags to the command.
Global defaults can be set in ~/.markdown-agent/config.yaml

Remote execution:
  ma supports running agents from URLs (npx-style).
  On first use, you'll be prompted to trust the domain.
  Trusted domains are stored in ~/.markdown-agent/known_hosts

Examples:
  ma task.claude.md -p "print mode"
  ma task.claude.md --model opus --verbose
  ma commit.gemini.md
  ma task.md --command claude
  ma task.md -c gemini
  ma task.claude.md --dry-run    # Preview without executing
  ma https://example.com/agent.claude.md          # Remote execution
  ma https://example.com/agent.claude.md --trust  # Skip trust prompt

Config file example (~/.markdown-agent/config.yaml):
  commands:
    copilot:
      $1: prompt    # Map body to --prompt flag

ma-specific flags (consumed, not passed to command):
  --command, -c   Specify command to run
  --dry-run       Show resolved command and prompt without executing
  --trust         Skip trust prompt for remote URLs (TOFU bypass)

Without a file:
  ma             Interactive agent picker (from ./.ma/, ~/.ma/, etc.)
  ma --setup     Configure shell to run .md files directly
  ma --logs      Show log directory
  ma --help      Show this help
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
const PROJECT_AGENTS_DIR = ".ma";

/** User-level agent directory */
const USER_AGENTS_DIR = join(homedir(), ".ma");

/**
 * Find agent markdown files with priority order:
 * 1. Current directory (cwd)
 * 2. Project-level: ./.ma/
 * 3. User-level: ~/.ma/
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

  // 2. Project-level: ./.ma/
  const projectAgentsPath = join(process.cwd(), PROJECT_AGENTS_DIR);
  try {
    for await (const file of glob.scan({ cwd: projectAgentsPath, absolute: true })) {
      const normalizedPath = normalizePath(file);
      if (!seenPaths.has(normalizedPath)) {
        seenPaths.add(normalizedPath);
        files.push({ name: basename(file), path: normalizedPath, source: ".ma" });
      }
    }
  } catch {
    // Skip if .ma/ doesn't exist
  }

  // 3. User-level: ~/.ma/
  try {
    for await (const file of glob.scan({ cwd: USER_AGENTS_DIR, absolute: true })) {
      const normalizedPath = normalizePath(file);
      if (!seenPaths.has(normalizedPath)) {
        seenPaths.add(normalizedPath);
        files.push({ name: basename(file), path: normalizedPath, source: "~/.ma" });
      }
    }
  } catch {
    // Skip if ~/.ma/ doesn't exist
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
 * Show interactive file picker and return selected file path
 */
export async function showInteractiveSelector(files: AgentFile[]): Promise<string | undefined> {
  if (files.length === 0) {
    return undefined;
  }

  try {
    const selected = await select({
      message: "Select an agent to run:",
      choices: files.map(f => ({
        name: f.name,
        value: f.path,
        description: f.source === "cwd" ? "(current directory)" : f.source,
      })),
    });
    return selected;
  } catch {
    // User cancelled (Ctrl+C) or other error
    return undefined;
  }
}

/**
 * Handle ma's own commands (when no file provided)
 * Returns result indicating if command was handled and optionally a selected file
 */
export async function handleMaCommands(args: CliArgs): Promise<HandleMaCommandsResult> {
  if (args.help) {
    printHelp();
    throw new EarlyExitRequest();
  }

  if (args.logs) {
    // Import dynamically to avoid circular deps
    const { getLogDir, listLogDirs } = await import("./logger");
    const logDir = getLogDir();
    console.log(`Log directory: ${logDir}\n`);
    const dirs = listLogDirs();
    if (dirs.length === 0) {
      console.log("No agent logs yet. Run an agent to generate logs.");
    } else {
      console.log("Agent logs:");
      for (const dir of dirs) {
        console.log(`  ${dir}/`);
      }
    }
    throw new EarlyExitRequest();
  }

  if (args.setup) {
    const { runSetup } = await import("./setup");
    await runSetup();
    throw new EarlyExitRequest();
  }

  // No file and no flags - show interactive picker if TTY
  if (!args.filePath && !args.help && !args.setup && !args.logs) {
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
