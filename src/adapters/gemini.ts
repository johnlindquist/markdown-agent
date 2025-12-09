/**
 * Google Gemini CLI adapter
 *
 * Print mode: One-shot mode (no special flags needed - default behavior)
 * Interactive mode: Add --prompt-interactive flag
 */

import type { ToolAdapter, CommandDefaults, AgentFrontmatter } from "../types";

export const geminiAdapter: ToolAdapter = {
  name: "gemini",

  getDefaults(): CommandDefaults {
    // Gemini defaults to one-shot mode (no special flags needed)
    return {};
  },

  applyInteractiveMode(frontmatter: AgentFrontmatter): AgentFrontmatter {
    const result = { ...frontmatter };
    // Add --prompt-interactive flag for interactive mode
    result.$1 = "prompt-interactive";
    return result;
  },
};

export default geminiAdapter;
