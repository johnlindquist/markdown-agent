import type { RunnerName } from "./runners/types";

/** Input field definition for wizard mode */
export interface InputField {
  name: string;
  type: "text" | "confirm" | "select" | "password";
  message: string;
  default?: string | boolean;
  choices?: string[];  // For select type
}

/** Prerequisites for script execution */
export interface Prerequisites {
  bin?: string[];   // Required binaries
  env?: string[];   // Required environment variables
}

/** Claude-specific configuration */
export interface ClaudeConfig {
  "dangerously-skip-permissions"?: boolean;
  "permission-mode"?: "acceptEdits" | "bypassPermissions" | "default" | "dontAsk" | "plan";
  "mcp-config"?: string | string[];
  "strict-mcp-config"?: boolean;
  "allowed-tools"?: string;
  "disallowed-tools"?: string;
  "system-prompt"?: string;
  "append-system-prompt"?: string;
  betas?: string[];
  "fork-session"?: boolean;
  ide?: boolean;
  /** Passthrough: any flag not explicitly defined */
  [key: string]: unknown;
}

/** Codex-specific configuration */
export interface CodexConfig {
  sandbox?: "read-only" | "workspace-write" | "danger-full-access";
  approval?: "untrusted" | "on-failure" | "on-request" | "never";
  "full-auto"?: boolean;
  oss?: boolean;
  "local-provider"?: "lmstudio" | "ollama" | string;
  cd?: string;
  search?: boolean;
  image?: string | string[];
  profile?: string;
  /** Passthrough: any flag not explicitly defined */
  [key: string]: unknown;
}

/** Copilot-specific configuration */
export interface CopilotConfig {
  agent?: string;
  /** Suppress session metadata/stats (default: true in our impl) */
  silent?: boolean;
  "allow-all-paths"?: boolean;
  stream?: "on" | "off";
  banner?: boolean;
  "no-color"?: boolean;
  "no-custom-instructions"?: boolean;
  "log-level"?: "none" | "error" | "warning" | "info" | "debug" | "all" | "default";
  /** Passthrough: any flag not explicitly defined */
  [key: string]: unknown;
}

/** Gemini-specific configuration */
export interface GeminiConfig {
  sandbox?: boolean;
  yolo?: boolean;
  "approval-mode"?: "default" | "auto_edit" | "yolo";
  "allowed-tools"?: string | string[];
  extensions?: string | string[];
  resume?: string;
  "allowed-mcp-server-names"?: string | string[];
  "screen-reader"?: boolean;
  /** Passthrough: any flag not explicitly defined */
  [key: string]: unknown;
}

/** Universal frontmatter that maps to all backends */
export interface AgentFrontmatter {
  // --- Runner Selection ---
  runner?: RunnerName | "auto";  // Default: auto

  // --- Identity ---
  model?: string;  // Maps to --model on all backends

  // --- Execution Mode ---
  /**
   * Interactive mode: true = REPL (default), false = run once and exit
   * Maps to: -p (Claude), exec (Codex), positional (Gemini), -p (Copilot)
   */
  interactive?: boolean;

  // --- Session Management ---
  /** Resume session: true = latest, string = session ID */
  resume?: string | boolean;
  /** Alias for resume: true */
  continue?: boolean;

  // --- Permissions (Universal) ---
  /**
   * "God Mode" - maps to runner's full-auto equivalent:
   * Claude: --dangerously-skip-permissions
   * Codex: --full-auto
   * Gemini: --yolo
   * Copilot: --allow-all-tools
   */
  "allow-all-tools"?: boolean;
  "allow-all-paths"?: boolean;
  /** Tool whitelist (Claude: --allowed-tools, Gemini: --allowed-tools, Copilot: --allow-tool) */
  "allow-tool"?: string | string[];
  /** Tool blacklist (Claude: --disallowed-tools, Copilot: --deny-tool) */
  "deny-tool"?: string | string[];
  /** Additional directories for tool access */
  "add-dir"?: string | string[];

  // --- MCP Configuration ---
  /** MCP server configs (paths or JSON) */
  "mcp-config"?: string | string[];

  // --- Output Control ---
  /** Output format: text, json, stream-json */
  "output-format"?: "text" | "json" | "stream-json";

  // --- Debug ---
  /** Enable debug mode (boolean or filter string) */
  debug?: boolean | string;

  // --- Wizard Mode ---
  inputs?: InputField[];

  // --- Context ---
  context?: string | string[];  // Glob patterns for files to include

  // --- Output ---
  extract?: "json" | "code" | "markdown" | "raw";  // Output extraction mode

  // --- Caching ---
  cache?: boolean;  // Enable result caching

  // --- Prerequisites ---
  requires?: Prerequisites;

  // --- Hooks ---
  before?: string | string[];
  after?: string | string[];

  // --- Backend Specific Config (Escape Hatches) ---
  claude?: ClaudeConfig;
  codex?: CodexConfig;
  copilot?: CopilotConfig;
  gemini?: GeminiConfig;

  /**
   * Passthrough: any flag not explicitly defined above.
   * These get passed through to the runner if they look like CLI flags.
   * This allows using any runner flag directly in frontmatter even if
   * we haven't mapped it to a universal key yet.
   */
  [key: string]: unknown;
}

/** @deprecated Use AgentFrontmatter instead */
export type CopilotFrontmatter = AgentFrontmatter;

export interface ParsedMarkdown {
  frontmatter: AgentFrontmatter;
  body: string;
}

export interface CommandResult {
  command: string;
  output: string;
  exitCode: number;
}

/** @deprecated Use CommandResult instead */
export type PreCommandResult = CommandResult;
