/**
 * GitHub Copilot CLI runner
 */

import { BaseRunner, type RunContext, type RunnerName } from "./types";
import { getRunnerPassthroughArgs, toArray } from "./flags";

/**
 * Keys explicitly handled by this runner (not passed through)
 */
const HANDLED_COPILOT_KEYS = new Set([
  "agent",
  "silent",
  "allow-all-paths",
  "stream",
  "banner",
  "no-color",
  "no-custom-instructions",
  "log-level",
]);

export class CopilotRunner extends BaseRunner {
  readonly name: RunnerName = "copilot";

  getCommand(): string {
    return "copilot";
  }

  buildArgs(ctx: RunContext): string[] {
    const { frontmatter } = ctx;
    const args: string[] = [];
    const copilotConfig = frontmatter.copilot || {};

    // --- Universal Keys ---

    // Model
    if (frontmatter.model) {
      args.push("--model", frontmatter.model);
    }

    // Interactive mode handled below with -p vs --interactive

    // Resume/Continue session
    if (frontmatter.continue || frontmatter.resume === true) {
      args.push("--continue");
    } else if (typeof frontmatter.resume === "string") {
      args.push("--resume", frontmatter.resume);
    }

    // Directory access
    for (const dir of toArray(frontmatter["add-dir"])) {
      args.push("--add-dir", dir);
    }

    // God mode: allow-all-tools
    if (frontmatter["allow-all-tools"]) {
      args.push("--allow-all-tools");
    }

    // Allow all paths (universal)
    if (frontmatter["allow-all-paths"]) {
      args.push("--allow-all-paths");
    }

    // Tool whitelist (universal)
    for (const tool of toArray(frontmatter["allow-tool"])) {
      args.push("--allow-tool", tool);
    }

    // Tool blacklist (universal)
    for (const tool of toArray(frontmatter["deny-tool"])) {
      args.push("--deny-tool", tool);
    }

    // MCP config (universal -> --additional-mcp-config)
    for (const config of toArray(frontmatter["mcp-config"])) {
      args.push("--additional-mcp-config", config);
    }

    // Debug (universal -> --log-level debug)
    if (frontmatter.debug) {
      args.push("--log-level", "debug");
    }

    // --- Copilot-Specific Keys ---

    // Agent
    if (copilotConfig.agent) {
      args.push("--agent", String(copilotConfig.agent));
    }

    // Silent: suppress session metadata (default: true for clean piping)
    // Only skip --silent if explicitly set to false
    if (copilotConfig.silent !== false) {
      args.push("--silent");
    }

    // Allow all paths from copilot config
    if (copilotConfig["allow-all-paths"]) {
      args.push("--allow-all-paths");
    }

    // Stream mode
    if (copilotConfig.stream) {
      args.push("--stream", String(copilotConfig.stream));
    }

    // Banner
    if (copilotConfig.banner) {
      args.push("--banner");
    }

    // No color
    if (copilotConfig["no-color"]) {
      args.push("--no-color");
    }

    // No custom instructions
    if (copilotConfig["no-custom-instructions"]) {
      args.push("--no-custom-instructions");
    }

    // Log level (copilot-specific, in addition to universal debug)
    if (copilotConfig["log-level"] && !frontmatter.debug) {
      args.push("--log-level", String(copilotConfig["log-level"]));
    }

    // --- Interactive mode ---
    // interactive: false -> -p (non-interactive, exits after)
    // interactive: true (or undefined) -> --interactive for REPL
    if (frontmatter.interactive === false) {
      args.push("-p");
    } else {
      args.push("--interactive");
    }

    // --- Passthrough: any copilot-specific keys we didn't handle ---
    args.push(...getRunnerPassthroughArgs(copilotConfig, HANDLED_COPILOT_KEYS));

    // --- CLI passthrough args (highest priority) ---
    args.push(...ctx.passthroughArgs);

    return args;
  }
}
