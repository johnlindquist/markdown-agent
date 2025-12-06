import type { AgentFrontmatter, CopilotFrontmatter } from "./types";
import type { RunnerName } from "./runners/types";
import { parseTemplateArgs, type TemplateVars } from "./template";

export interface CliArgs {
  filePath: string;
  overrides: Partial<AgentFrontmatter>;
  appendText: string;
  templateVars: TemplateVars;
  noCache: boolean;
  dryRun: boolean;
  verbose: boolean;
  runner?: RunnerName;
  passthroughArgs: string[];
  check: boolean;
  json: boolean;
  runBatch: boolean;
  concurrency?: number;
  setup: boolean;
}

/** Known CLI flags that shouldn't be treated as template variables */
export const KNOWN_FLAGS = new Set([
  "--model", "-m",
  "--agent",
  "--silent", "-s", "--no-silent",
  "--interactive", "-i",
  "--allow-all-tools",
  "--allow-all-paths",
  "--allow-tool",
  "--deny-tool",
  "--add-dir",
  "--help", "-h",
  "--dry-run",
  "--no-cache",
  "--verbose", "-v",
  "--runner", "-r",
  "--check",
  "--json",
  "--run-batch",
  "--concurrency",
  "--setup",
  "--",  // Passthrough separator
]);

const VALID_RUNNERS = new Set(["claude", "codex", "copilot", "gemini"]);

/**
 * Parse CLI arguments and extract overrides for frontmatter
 */
export function parseCliArgs(argv: string[]): CliArgs {
  const args = argv.slice(2); // Skip node and script path
  let filePath = "";
  const overrides: Partial<AgentFrontmatter> = {};
  const positionalArgs: string[] = [];
  const passthroughArgs: string[] = [];
  let noCache = false;
  let dryRun = false;
  let verbose = false;
  let runner: RunnerName | undefined;
  let inPassthrough = false;
  let check = false;
  let json = false;
  let runBatch = false;
  let concurrency: number | undefined;
  let setup = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    // After --, everything is passthrough
    if (arg === "--") {
      inPassthrough = true;
      continue;
    }

    if (inPassthrough) {
      passthroughArgs.push(arg);
      continue;
    }

    // Non-flag argument
    if (!arg.startsWith("-")) {
      if (!filePath) {
        filePath = arg;
      } else {
        // Additional positional args after file path
        positionalArgs.push(arg);
      }
      continue;
    }

    switch (arg) {
      case "--model":
      case "-m":
        if (nextArg) {
          overrides.model = nextArg;
          i++;
        }
        break;

      case "--agent":
        if (nextArg) {
          // Agent goes to copilot config
          overrides.copilot = { ...overrides.copilot, agent: nextArg };
          i++;
        }
        break;

      case "--silent":
      case "-s":
        overrides.silent = true;
        break;

      case "--no-silent":
        overrides.silent = false;
        break;

      case "--interactive":
      case "-i":
        overrides.interactive = true;
        break;

      case "--allow-all-tools":
        overrides["allow-all-tools"] = true;
        break;

      case "--allow-all-paths":
        overrides["allow-all-paths"] = true;
        break;

      case "--allow-tool":
        if (nextArg) {
          overrides["allow-tool"] = nextArg;
          i++;
        }
        break;

      case "--deny-tool":
        if (nextArg) {
          overrides["deny-tool"] = nextArg;
          i++;
        }
        break;

      case "--add-dir":
        if (nextArg) {
          overrides["add-dir"] = nextArg;
          i++;
        }
        break;

      case "--runner":
      case "-r":
        if (nextArg && VALID_RUNNERS.has(nextArg)) {
          runner = nextArg as RunnerName;
          i++;
        } else if (nextArg) {
          console.error(`Invalid runner: ${nextArg}. Valid options: claude, codex, copilot, gemini`);
          process.exit(1);
        }
        break;

      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;

      case "--no-cache":
        noCache = true;
        break;

      case "--dry-run":
        dryRun = true;
        break;

      case "--verbose":
      case "-v":
        verbose = true;
        break;

      case "--check":
        check = true;
        break;

      case "--json":
        json = true;
        break;

      case "--run-batch":
        runBatch = true;
        break;

      case "--concurrency":
        if (nextArg && !isNaN(parseInt(nextArg))) {
          concurrency = parseInt(nextArg);
          i++;
        }
        break;

      case "--setup":
        setup = true;
        break;
    }
  }

  // Parse template variables from remaining args
  const templateVars = parseTemplateArgs(args, KNOWN_FLAGS);

  return {
    filePath,
    overrides,
    appendText: positionalArgs.join(" "),
    templateVars,
    noCache,
    dryRun,
    verbose,
    runner,
    passthroughArgs,
    check,
    json,
    runBatch,
    concurrency,
    setup,
  };
}

/**
 * Merge frontmatter with CLI overrides (CLI wins)
 * Applies defaults for unset values
 */
export function mergeFrontmatter(
  frontmatter: AgentFrontmatter,
  overrides: Partial<AgentFrontmatter>
): AgentFrontmatter {
  const defaults: Partial<AgentFrontmatter> = {
    silent: true,
  };

  // Deep merge backend-specific configs
  const merged = { ...defaults, ...frontmatter, ...overrides };

  if (frontmatter.claude || overrides.claude) {
    merged.claude = { ...frontmatter.claude, ...overrides.claude };
  }
  if (frontmatter.codex || overrides.codex) {
    merged.codex = { ...frontmatter.codex, ...overrides.codex };
  }
  if (frontmatter.copilot || overrides.copilot) {
    merged.copilot = { ...frontmatter.copilot, ...overrides.copilot };
  }
  if (frontmatter.gemini || overrides.gemini) {
    merged.gemini = { ...frontmatter.gemini, ...overrides.gemini };
  }

  return merged;
}

function printHelp() {
  console.log(`
Usage: <file.md> [text] [options] [-- passthrough-args]
       --run-batch [options] < manifest.json
       --setup

Arguments:
  text                    Additional text appended to the prompt body

Options:
  --runner, -r <runner>   Select backend: claude, codex, copilot, gemini (default: auto)
  --model, -m <model>     Override AI model
  --agent <agent>         Override custom agent (copilot)
  --silent, -s            Suppress session metadata output (default: on)
  --no-silent             Show session metadata output
  --interactive, -i       Enable interactive mode
  --allow-all-tools       Allow all tools without confirmation
  --allow-all-paths       Allow access to any file path
  --allow-tool <pattern>  Allow specific tool
  --deny-tool <pattern>   Deny specific tool
  --add-dir <dir>         Add directory to allowed list
  --no-cache              Skip cache and force fresh execution
  --dry-run               Show what would be executed without running
  --check                 Validate frontmatter without executing
  --json                  Output validation results as JSON (with --check)
  --verbose, -v           Show debug info (runner, args, etc.)
  --setup                 Configure shell to run .md files directly
  --help, -h              Show this help

Batch/Swarm Mode:
  --run-batch             Read JSON manifest from stdin, dispatch parallel agents
  --concurrency <n>       Max parallel agents (default: 4)

Passthrough:
  --                      Everything after -- is passed to the runner

Setup (treat .md as agents):
  ma --setup              # Interactive wizard to configure your shell
                          # After setup: ./TASK.md instead of: ma TASK.md

Validation:
  ma --check task.md                    # Human-readable validation
  ma --check task.md --json             # JSON output for piping
  ma --check task.md --json | ma DOCTOR.md > fixed.md

Batch Mode:
  ma PLANNER.md | ma --run-batch        # Planner outputs JSON manifest
  ma --run-batch --concurrency 8 < jobs.json

Batch Manifest Format:
  [
    { "agent": "agents/CODER.md", "branch": "feat/api", "vars": { "task": "..." } },
    { "agent": "agents/CODER.md", "branch": true, "model": "sonnet" }
  ]

Examples:
  DEMO.md "focus on error handling"
  DEMO.md --runner claude --model sonnet
  DEMO.md --runner codex --model gpt-5
  DEMO.md --runner gemini --model gemini-3-pro-preview
  DEMO.md -- --verbose --debug
`);
}
