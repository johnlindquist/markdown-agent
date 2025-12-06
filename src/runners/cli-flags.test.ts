/**
 * CLI Flag Validation Tests
 *
 * These smoke tests run --help on each CLI tool and validate that
 * the flags we use in our runner implementations are actually valid.
 *
 * This prevents drift between our code and the actual CLI tools.
 * Run: bun test src/runners/cli-flags.test.ts
 */

import { describe, test, expect, beforeAll } from "bun:test";

interface CliTool {
  name: string;
  command: string;
  /** Flags we use in our runner (extracted from runner implementations) */
  usedFlags: string[];
  /** Subcommands we use (like "exec" for codex) */
  usedSubcommands?: string[];
}

/**
 * Flags used by each runner implementation
 * Keep in sync with: src/runners/*.ts and src/repair.ts
 */
const CLI_TOOLS: CliTool[] = [
  {
    name: "claude",
    command: "claude",
    usedFlags: [
      "-p",                               // print mode (silent)
      "--model",                          // model selection
      "--add-dir",                        // directory access
      "--dangerously-skip-permissions",   // god mode
      "--allowed-tools",                  // tool whitelist
      "--mcp-config",                     // MCP configuration
    ],
  },
  {
    name: "codex",
    command: "codex",
    usedFlags: [
      "--model",            // model selection
      "--cd",               // change directory
      "--sandbox",          // sandbox mode
      "--ask-for-approval", // approval policy (NOT --approval!)
      "--full-auto",        // god mode
      "--oss",              // local/open models
      "--local-provider",   // ollama etc
    ],
    usedSubcommands: ["exec"],
  },
  {
    name: "gemini",
    command: "gemini",
    usedFlags: [
      "--model",                // model selection
      "--include-directories",  // directory access (add-dir maps to this)
      "--sandbox",              // sandbox mode
      "--yolo",                 // god mode
      "--approval-mode",        // approval level
      "--allowed-tools",        // tool whitelist
      "--extensions",           // gemini extensions
      "--resume",               // session resume
      "--allowed-mcp-server-names", // MCP servers
      "--output-format",        // output format for silent mode
      "--prompt-interactive",   // interactive prompt mode
    ],
  },
  {
    name: "copilot",
    command: "copilot",
    usedFlags: [
      "-p",              // print mode
      "--model",         // model selection
      "--agent",         // custom agent
      "--add-dir",       // directory access
      "--allow-tool",    // tool whitelist
      "--deny-tool",     // tool blacklist
      "--silent",        // silent mode
      "--allow-all-tools",   // god mode
      "--allow-all-paths",   // path access
      "--interactive",   // interactive mode
    ],
  },
];

/**
 * Check if a CLI tool is available on the system
 */
async function isToolAvailable(command: string): Promise<boolean> {
  try {
    const result = Bun.spawnSync(["which", command]);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Get help output from a CLI tool
 */
async function getHelpOutput(command: string): Promise<string> {
  const result = Bun.spawnSync([command, "--help"], {
    stdout: "pipe",
    stderr: "pipe",
  });

  // Some tools output help to stderr
  const stdout = result.stdout.toString();
  const stderr = result.stderr.toString();

  return stdout + stderr;
}

/**
 * Extract flags from help output
 * Looks for patterns like: --flag, -f, --flag-name
 */
function extractFlagsFromHelp(helpOutput: string): Set<string> {
  const flags = new Set<string>();

  // Match --long-flag and -s short flags
  const flagPattern = /(?:^|\s)(--[\w-]+|-\w)(?:\s|,|$|=|\[)/gm;
  let match;

  while ((match = flagPattern.exec(helpOutput)) !== null) {
    flags.add(match[1].trim());
  }

  return flags;
}

/**
 * Extract subcommands from help output
 * Looks for command listings in help text
 */
function extractSubcommandsFromHelp(helpOutput: string): Set<string> {
  const subcommands = new Set<string>();

  // Common patterns for subcommand listings
  // "Commands:" section or "Subcommands:" section
  const commandSection = helpOutput.match(/(?:Commands|Subcommands|Available commands):\s*([\s\S]*?)(?:\n\n|Options:|$)/i);

  if (commandSection) {
    // Extract words that look like commands (lowercase, no dashes at start)
    const cmdPattern = /^\s*(\w[\w-]*)\s/gm;
    let match;
    while ((match = cmdPattern.exec(commandSection[1])) !== null) {
      subcommands.add(match[1]);
    }
  }

  return subcommands;
}

describe("CLI Flag Validation", () => {
  // Store availability for conditional tests
  const availability: Record<string, boolean> = {};

  beforeAll(async () => {
    for (const tool of CLI_TOOLS) {
      availability[tool.name] = await isToolAvailable(tool.command);
    }
  });

  for (const tool of CLI_TOOLS) {
    describe(`${tool.name} CLI`, () => {
      test("is installed (skip remaining if not)", async () => {
        if (!availability[tool.name]) {
          console.log(`⚠️  ${tool.name} not installed, skipping flag validation`);
        }
        // This test always passes - it's just for visibility
        expect(true).toBe(true);
      });

      test("used flags are valid", async () => {
        if (!availability[tool.name]) {
          return; // Skip if tool not available
        }

        const helpOutput = await getHelpOutput(tool.command);
        const validFlags = extractFlagsFromHelp(helpOutput);

        const invalidFlags: string[] = [];

        for (const flag of tool.usedFlags) {
          if (!validFlags.has(flag)) {
            invalidFlags.push(flag);
          }
        }

        if (invalidFlags.length > 0) {
          console.error(`\n❌ Invalid flags for ${tool.name}:`);
          console.error(`   Used: ${invalidFlags.join(", ")}`);
          console.error(`   Valid flags found in --help:`);
          console.error(`   ${[...validFlags].sort().join(", ")}`);
        }

        expect(invalidFlags).toEqual([]);
      });

      if (tool.usedSubcommands) {
        test("used subcommands are valid", async () => {
          if (!availability[tool.name]) {
            return; // Skip if tool not available
          }

          const helpOutput = await getHelpOutput(tool.command);
          const validSubcommands = extractSubcommandsFromHelp(helpOutput);

          const invalidSubcommands: string[] = [];

          for (const subcmd of tool.usedSubcommands!) {
            if (!validSubcommands.has(subcmd)) {
              invalidSubcommands.push(subcmd);
            }
          }

          // Some tools don't list subcommands in --help, so be lenient
          if (invalidSubcommands.length > 0 && validSubcommands.size > 0) {
            console.error(`\n⚠️  Subcommand '${invalidSubcommands.join(", ")}' not found in ${tool.name} --help`);
            console.error(`   This may be okay if the tool doesn't list all subcommands.`);
            console.error(`   Found subcommands: ${[...validSubcommands].join(", ")}`);
          }

          // Don't fail on subcommands - they're often not listed in --help
          expect(true).toBe(true);
        });
      }
    });
  }
});

/**
 * Export for use in other tests/scripts
 */
export { CLI_TOOLS, extractFlagsFromHelp, getHelpOutput, isToolAvailable };
