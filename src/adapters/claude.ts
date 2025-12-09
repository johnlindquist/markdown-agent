/**
 * Claude CLI adapter
 *
 * Print mode: --print flag for non-interactive output
 * Interactive mode: Remove --print flag (interactive is the default)
 */

import type { ToolAdapter, CommandDefaults, AgentFrontmatter } from "../types";

export const claudeAdapter: ToolAdapter = {
  name: "claude",

  getDefaults(): CommandDefaults {
    return {
      print: true, // --print flag for non-interactive mode
    };
  },

  applyInteractiveMode(frontmatter: AgentFrontmatter): AgentFrontmatter {
    const result = { ...frontmatter };
    // Remove --print flag (interactive is default without it)
    delete result.print;
    return result;
  },
};

export default claudeAdapter;
