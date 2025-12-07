/**
 * Global configuration for markdown-agent
 * Loads defaults from ~/.markdown-agent/config.yaml
 */

import { homedir } from "os";
import { join } from "path";
import yaml from "js-yaml";
import type { AgentFrontmatter } from "./types";

const CONFIG_DIR = join(homedir(), ".markdown-agent");
const CONFIG_FILE = join(CONFIG_DIR, "config.yaml");

/**
 * Command-specific defaults
 * Keys starting with $ are positional mappings
 * Other keys are default flags
 */
export interface CommandDefaults {
  /** Map positional arg N to a flag (e.g., $1: "prompt" → --prompt <body>) */
  [key: `$${number}`]: string;
  /** Default flag values */
  [key: string]: unknown;
}

/**
 * Global config structure
 */
export interface GlobalConfig {
  /** Default settings per command */
  commands?: Record<string, CommandDefaults>;
}

/**
 * Built-in defaults (used when no config file exists)
 */
const BUILTIN_DEFAULTS: GlobalConfig = {
  commands: {
    copilot: {
      $1: "prompt",  // Map body to --prompt for copilot
    },
  },
};

let cachedConfig: GlobalConfig | null = null;

/**
 * Load global config from ~/.markdown-agent/config.yaml
 * Falls back to built-in defaults if file doesn't exist
 */
export async function loadGlobalConfig(): Promise<GlobalConfig> {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    const file = Bun.file(CONFIG_FILE);
    if (await file.exists()) {
      const content = await file.text();
      const parsed = yaml.load(content) as GlobalConfig;
      // Merge with built-in defaults (user config takes priority)
      cachedConfig = mergeConfigs(BUILTIN_DEFAULTS, parsed);
    } else {
      cachedConfig = BUILTIN_DEFAULTS;
    }
  } catch {
    // Fall back to built-in defaults on parse error
    cachedConfig = BUILTIN_DEFAULTS;
  }

  return cachedConfig;
}

/**
 * Deep merge two configs (second takes priority)
 */
function mergeConfigs(base: GlobalConfig, override: GlobalConfig): GlobalConfig {
  const result: GlobalConfig = { ...base };

  if (override.commands) {
    result.commands = result.commands ? { ...result.commands } : {};
    for (const [cmd, defaults] of Object.entries(override.commands)) {
      result.commands[cmd] = {
        ...(result.commands[cmd] || {}),
        ...defaults,
      };
    }
  }

  return result;
}

/**
 * Get defaults for a specific command
 */
export async function getCommandDefaults(command: string): Promise<CommandDefaults | undefined> {
  const config = await loadGlobalConfig();
  return config.commands?.[command];
}

/**
 * Apply command defaults to frontmatter
 * Frontmatter values take priority over defaults
 */
export function applyDefaults(
  frontmatter: AgentFrontmatter,
  defaults: CommandDefaults | undefined
): AgentFrontmatter {
  if (!defaults) {
    return frontmatter;
  }

  // Defaults go first, frontmatter overrides
  const result: AgentFrontmatter = { ...defaults };

  for (const [key, value] of Object.entries(frontmatter)) {
    result[key] = value;
  }

  return result;
}

/**
 * Get the config directory path
 */
export function getConfigDir(): string {
  return CONFIG_DIR;
}

/**
 * Get the config file path
 */
export function getConfigFile(): string {
  return CONFIG_FILE;
}

/**
 * Clear the cached config (for testing)
 */
export function clearConfigCache(): void {
  cachedConfig = null;
}
