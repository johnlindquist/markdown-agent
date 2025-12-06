/**
 * Claude Code CLI runner
 * Maps universal frontmatter to claude CLI flags
 */

import { BaseRunner, type RunContext, type RunResult, type RunnerName } from "./types";
import { getRunnerPassthroughArgs, toArray } from "./flags";

/**
 * Keys explicitly handled by this runner (not passed through)
 */
const HANDLED_CLAUDE_KEYS = new Set([
  "dangerously-skip-permissions",
  "permission-mode",
  "mcp-config",
  "strict-mcp-config",
  "allowed-tools",
  "disallowed-tools",
  "system-prompt",
  "append-system-prompt",
  "betas",
  "fork-session",
  "ide",
]);

/**
 * Map generic model names to Claude-specific models
 */
export function mapClaudeModel(model: string): string {
  const modelMap: Record<string, string> = {
    "sonnet": "sonnet",
    "opus": "opus",
    "haiku": "haiku",
    "claude-sonnet-4": "sonnet",
    "claude-sonnet-4.5": "sonnet",
    "claude-opus-4.5": "opus",
    "claude-haiku-4.5": "haiku",
  };
  return modelMap[model] || model;
}

export class ClaudeRunner extends BaseRunner {
  readonly name: RunnerName = "claude";

  getCommand(): string {
    return "claude";
  }

  buildArgs(ctx: RunContext): string[] {
    const { frontmatter } = ctx;
    const args: string[] = [];
    const claudeConfig = frontmatter.claude || {};

    // --- Universal Keys ---

    // Model
    if (frontmatter.model) {
      args.push("--model", mapClaudeModel(frontmatter.model));
    }

    // Interactive mode: false = -p (print mode, run & exit)
    if (frontmatter.interactive === false) {
      args.push("-p");
    }

    // Resume/Continue session
    if (frontmatter.continue || frontmatter.resume === true) {
      args.push("-c");
    } else if (typeof frontmatter.resume === "string") {
      args.push("-r", frontmatter.resume);
    }

    // Directory access
    for (const dir of toArray(frontmatter["add-dir"])) {
      args.push("--add-dir", dir);
    }

    // God mode: allow-all-tools -> --dangerously-skip-permissions
    if (frontmatter["allow-all-tools"] || claudeConfig["dangerously-skip-permissions"]) {
      args.push("--dangerously-skip-permissions");
    }

    // Tool whitelist (universal)
    for (const tool of toArray(frontmatter["allow-tool"])) {
      args.push("--allowed-tools", tool);
    }

    // Tool blacklist (universal)
    for (const tool of toArray(frontmatter["deny-tool"])) {
      args.push("--disallowed-tools", tool);
    }

    // MCP config (universal)
    for (const config of toArray(frontmatter["mcp-config"])) {
      args.push("--mcp-config", config);
    }

    // Output format
    if (frontmatter["output-format"]) {
      args.push("--output-format", frontmatter["output-format"]);
    }

    // Debug
    if (frontmatter.debug === true) {
      args.push("--debug");
    } else if (typeof frontmatter.debug === "string") {
      args.push("--debug", frontmatter.debug);
    }

    // --- Claude-Specific Keys ---

    // Permission mode (more granular than god mode)
    if (claudeConfig["permission-mode"]) {
      args.push("--permission-mode", String(claudeConfig["permission-mode"]));
    }

    // Claude-specific allowed-tools (pattern syntax)
    if (claudeConfig["allowed-tools"]) {
      args.push("--allowed-tools", String(claudeConfig["allowed-tools"]));
    }

    // Claude-specific disallowed-tools
    if (claudeConfig["disallowed-tools"]) {
      args.push("--disallowed-tools", String(claudeConfig["disallowed-tools"]));
    }

    // MCP config from claude-specific (in addition to universal)
    for (const config of toArray(claudeConfig["mcp-config"] as string | string[])) {
      args.push("--mcp-config", config);
    }

    // Strict MCP config
    if (claudeConfig["strict-mcp-config"]) {
      args.push("--strict-mcp-config");
    }

    // System prompt
    if (claudeConfig["system-prompt"]) {
      args.push("--system-prompt", String(claudeConfig["system-prompt"]));
    }

    // Append system prompt
    if (claudeConfig["append-system-prompt"]) {
      args.push("--append-system-prompt", String(claudeConfig["append-system-prompt"]));
    }

    // Beta headers
    for (const beta of toArray(claudeConfig.betas as string | string[])) {
      args.push("--betas", beta);
    }

    // Fork session
    if (claudeConfig["fork-session"]) {
      args.push("--fork-session");
    }

    // IDE integration
    if (claudeConfig.ide) {
      args.push("--ide");
    }

    // --- Passthrough: any claude-specific keys we didn't handle ---
    args.push(...getRunnerPassthroughArgs(claudeConfig, HANDLED_CLAUDE_KEYS));

    // --- CLI passthrough args (highest priority) ---
    args.push(...ctx.passthroughArgs);

    return args;
  }
}