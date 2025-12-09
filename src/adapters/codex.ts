/**
 * OpenAI Codex CLI adapter
 *
 * Print mode: Use 'exec' subcommand for non-interactive execution
 * Interactive mode: Remove subcommand (interactive is the default)
 */

import type { ToolAdapter, CommandDefaults, AgentFrontmatter } from "../types";

export const codexAdapter: ToolAdapter = {
  name: "codex",

  getDefaults(): CommandDefaults {
    return {
      _subcommand: "exec", // Use 'exec' subcommand for non-interactive mode
    };
  },

  applyInteractiveMode(frontmatter: AgentFrontmatter): AgentFrontmatter {
    const result = { ...frontmatter };
    // Remove _subcommand (interactive is default without exec subcommand)
    delete result._subcommand;
    return result;
  },
};

export default codexAdapter;
