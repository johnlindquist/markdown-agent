# Unified Front Matter Schema Proposal

> RFC for multi-runner support in markdown-agent

## Goals

1. **Simplicity** - Common operations should be easy (one line)
2. **Consistency** - Same key means same thing across runners
3. **Extensibility** - Runner-specific features remain accessible
4. **Backward Compatibility** - Existing configs continue to work

## Proposed Schema

### Top-Level (Universal) Keys

These keys work identically across all runners:

```yaml
---
# Runner Selection
runner: claude | codex | gemini | copilot | auto  # default: auto

# Model Selection
model: string  # Runner resolves aliases (e.g., "sonnet" → "claude-sonnet-4")

# Execution Mode
interactive: boolean  # true = REPL mode (default), false = run once and exit

# Directory Access
add-dir: string | string[]  # Additional directories for tool access

# Tool Permissions (Universal "God Mode")
allow-all-tools: boolean  # Maps to runner's full-auto equivalent

# Tool Filtering
allow-tool: string | string[]   # Whitelist specific tools
deny-tool: string | string[]    # Blacklist specific tools (takes precedence)

# Session Management
resume: string | boolean  # Resume session (true = latest, string = session ID)
continue: boolean         # Alias for resume: true

# MCP Configuration
mcp-config: string | string[]  # MCP server configs (paths or JSON)

# Output Control
output-format: text | json | stream-json

# Debug
debug: boolean | string  # Enable debug (string = filter categories)
---
```

### Runner-Specific Nested Keys

For features unique to a specific runner:

```yaml
---
# Claude-specific
claude:
  dangerously-skip-permissions: boolean
  permission-mode: acceptEdits | bypassPermissions | default | dontAsk | plan
  system-prompt: string
  append-system-prompt: string
  allowed-tools: string  # Claude's pattern syntax: "Bash(git:*) Edit"
  disallowed-tools: string
  betas: string[]
  fork-session: boolean
  ide: boolean
  strict-mcp-config: boolean

# Codex-specific
codex:
  sandbox: read-only | workspace-write | danger-full-access
  approval: untrusted | on-failure | on-request | never  # maps to --ask-for-approval
  full-auto: boolean
  cd: string           # Working directory
  oss: boolean         # Use local models
  local-provider: lmstudio | ollama
  search: boolean      # Enable web search
  image: string[]      # Attach images

# Gemini-specific
gemini:
  sandbox: boolean
  yolo: boolean
  approval-mode: default | auto_edit | yolo
  extensions: string[]
  allowed-mcp-server-names: string[]

# Copilot-specific
copilot:
  agent: string              # Custom agent name
  silent: boolean            # Suppress session metadata/stats (default: true in our impl)
  allow-all-paths: boolean   # Disable path verification
  stream: on | off
  banner: boolean
  no-color: boolean
  no-custom-instructions: boolean
  log-level: none | error | warning | info | debug | all
---
```

## Flag Resolution Logic

### Priority Order
1. CLI flags (highest)
2. Runner-specific nested config
3. Top-level universal config
4. Defaults (lowest)

### Universal → Runner Mapping

When a universal key is set, it maps to the runner-specific equivalent:

| Universal | Claude | Codex | Gemini | Copilot |
|-----------|--------|-------|--------|---------|
| `allow-all-tools: true` | `--dangerously-skip-permissions` | `--full-auto` | `--yolo` | `--allow-all-tools` |
| `add-dir: ./src` | `--add-dir ./src` | `--add-dir ./src` | `--include-directories ./src` | `--add-dir ./src` |
| `interactive: false` | `-p` | `exec` subcommand | positional query | `-p` |
| `interactive: true` | (default) | (default) | `--prompt-interactive` | `--interactive` |
| `resume: true` | `-c` | `resume --last` | `--resume latest` | `--continue` |
| `resume: "abc123"` | `-r abc123` | `resume abc123` | `--resume abc123` | `--resume abc123` |
| `allow-tool: [...]` | `--allowed-tools` | ❌ (ignored) | `--allowed-tools` | `--allow-tool` |
| `deny-tool: [...]` | `--disallowed-tools` | ❌ (ignored) | ❌ (ignored) | `--deny-tool` |

> **Note**: Copilot's `--silent` flag (suppresses session metadata) is separate from interactive mode and lives under `copilot.silent`. We default it to `true` in our implementation since the metadata interferes with piping.

### Conflict Resolution

If both universal and runner-specific are set, runner-specific wins:

```yaml
---
allow-all-tools: true    # Universal: enable god mode
claude:
  permission-mode: acceptEdits  # Override: only accept edits
---
```

Result for Claude: `--permission-mode acceptEdits` (not `--dangerously-skip-permissions`)

## Examples

### Simple: Run with Sonnet
```yaml
---
model: sonnet
---
```

### Full Auto Mode (Any Runner)
```yaml
---
runner: auto
allow-all-tools: true
add-dir:
  - ./src
  - ./tests
---
```

### Claude with Custom Permissions
```yaml
---
runner: claude
model: opus
claude:
  permission-mode: acceptEdits
  allowed-tools: "Bash(git:*) Read Edit"
  append-system-prompt: "Always explain changes before making them."
---
```

### Codex with Sandbox
```yaml
---
runner: codex
model: gpt-5.1
codex:
  sandbox: workspace-write
  approval: on-failure
  search: true
---
```

### Gemini with Extensions
```yaml
---
runner: gemini
model: gemini-2.5-pro
gemini:
  extensions:
    - code-execution
    - web-search
  approval-mode: auto_edit
---
```

### Copilot with Tool Restrictions
```yaml
---
runner: copilot
model: claude-sonnet-4.5
allow-tool:
  - shell(git:*)
  - write
deny-tool:
  - shell(rm:*)
---
```

### Multi-Model Comparison (Future)
```yaml
---
# Run same prompt against multiple models
runners:
  - runner: claude
    model: sonnet
  - runner: codex
    model: gpt-5
  - runner: gemini
    model: gemini-2.5-pro
compare: true
---
```

## Type Definitions

```typescript
interface AgentFrontmatter {
  // Runner selection
  runner?: "claude" | "codex" | "gemini" | "copilot" | "auto";

  // Universal keys
  model?: string;
  interactive?: boolean;  // true = REPL, false = run once and exit
  "add-dir"?: string | string[];
  "allow-all-tools"?: boolean;
  "allow-tool"?: string | string[];
  "deny-tool"?: string | string[];
  resume?: string | boolean;
  continue?: boolean;
  "mcp-config"?: string | string[];
  "output-format"?: "text" | "json" | "stream-json";
  debug?: boolean | string;

  // Runner-specific nested configs
  claude?: ClaudeConfig;
  codex?: CodexConfig;
  gemini?: GeminiConfig;
  copilot?: CopilotConfig;
}

interface ClaudeConfig {
  "dangerously-skip-permissions"?: boolean;
  "permission-mode"?: "acceptEdits" | "bypassPermissions" | "default" | "dontAsk" | "plan";
  "system-prompt"?: string;
  "append-system-prompt"?: string;
  "allowed-tools"?: string;
  "disallowed-tools"?: string;
  betas?: string[];
  "fork-session"?: boolean;
  ide?: boolean;
  "strict-mcp-config"?: boolean;
}

interface CodexConfig {
  sandbox?: "read-only" | "workspace-write" | "danger-full-access";
  approval?: "untrusted" | "on-failure" | "on-request" | "never";
  "full-auto"?: boolean;
  cd?: string;
  oss?: boolean;
  "local-provider"?: "lmstudio" | "ollama";
  search?: boolean;
  image?: string[];
}

interface GeminiConfig {
  sandbox?: boolean;
  yolo?: boolean;
  "approval-mode"?: "default" | "auto_edit" | "yolo";
  extensions?: string[];
  "allowed-mcp-server-names"?: string[];
}

interface CopilotConfig {
  agent?: string;
  silent?: boolean;  // Suppress session metadata/stats (default: true in our impl)
  "allow-all-paths"?: boolean;
  stream?: "on" | "off";
  banner?: boolean;
  "no-color"?: boolean;
  "no-custom-instructions"?: boolean;
  "log-level"?: "none" | "error" | "warning" | "info" | "debug" | "all";
}
```

## Migration Path

### Phase 1: Current State
- Existing `runner:` and runner-specific configs work as-is

### Phase 2: Universal Keys
- Add universal keys that map to runner-specific equivalents
- Both work simultaneously (universal + nested)

### Phase 3: Deprecation Warnings
- Warn when using runner-specific keys that have universal equivalents
- Example: `codex.full-auto: true` → suggest `allow-all-tools: true`

### Phase 4: Documentation
- Update docs to prefer universal keys
- Document runner-specific keys as "advanced"

## Open Questions

1. **Naming Convention**: Should we use `kebab-case` (current) or `camelCase`?
   - Recommendation: Keep `kebab-case` for YAML friendliness

2. **Strict Mode**: Should unknown keys error or warn?
   - Recommendation: Warn by default, `strict: true` to error

3. **Passthrough**: How to pass arbitrary flags not in schema?
   - Recommendation: `extra-args: ["--some-new-flag", "value"]`

4. **Validation**: Should we validate runner-specific configs only when that runner is selected?
   - Recommendation: Yes, only validate active runner's config
