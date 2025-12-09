/**
 * GitHub Copilot CLI adapter
 *
 * Print mode: Map body to --prompt flag, silent mode for clean output
 * Interactive mode: Map body to --interactive flag instead
 */

import type { ToolAdapter, CommandDefaults, AgentFrontmatter } from "../types";

export const copilotAdapter: ToolAdapter = {
  name: "copilot",

  getDefaults(): CommandDefaults {
    return {
      $1: "prompt", // Map body to --prompt for copilot (print mode)
      silent: true, // Output only the agent response (no stats)
    };
  },

  applyInteractiveMode(frontmatter: AgentFrontmatter): AgentFrontmatter {
    const result = { ...frontmatter };
    // Change from --prompt to --interactive
    result.$1 = "interactive";
    return result;
  },
};

export default copilotAdapter;
