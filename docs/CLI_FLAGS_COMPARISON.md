# CLI Flags Comparison: Claude, Codex, Gemini, Copilot

> Generated from `--help` output on 2025-12-06

This document provides an exhaustive comparison of CLI flags across all supported runners to inform the unified front matter schema design.

## Quick Reference: Flag Mapping

| Concept | Unified Key | Claude | Codex | Gemini | Copilot |
|---------|-------------|--------|-------|--------|---------|
| Model | `model` | `--model` | `-m, --model` | `-m, --model` | `--model` |
| Non-interactive (run & exit) | `interactive: false` | `-p, --print` | `exec` subcommand | positional query | `-p, --prompt` |
| Interactive (REPL mode) | `interactive: true` | (default) | (default) | `-i, --prompt-interactive` | `-i, --interactive` |
| Directory access | `add-dir` | `--add-dir` | `--add-dir` | `--include-directories` | `--add-dir` |
| Allow all tools | `allow-all-tools` | `--dangerously-skip-permissions` | `--full-auto` | `-y, --yolo` | `--allow-all-tools` |
| Tool whitelist | `allow-tool` | `--allowed-tools` | ❌ | `--allowed-tools` | `--allow-tool` |
| Tool blacklist | `deny-tool` | `--disallowed-tools` | ❌ | ❌ | `--deny-tool` |
| Resume session | `resume` | `-r, --resume` | `resume` subcommand | `-r, --resume` | `--resume` |
| Continue last | `continue` | `-c, --continue` | `--last` (with resume) | `--resume latest` | `--continue` |
| MCP config | `mcp-config` | `--mcp-config` | `mcp` subcommand | `--allowed-mcp-server-names` | `--additional-mcp-config` |
| Debug mode | `debug` | `-d, --debug` | ❌ | `-d, --debug` | `--log-level debug` |
| Output format | `output-format` | `--output-format` | ❌ | `-o, --output-format` | ❌ |
| Sandbox mode | `sandbox` | ❌ | `-s, --sandbox` | `-s, --sandbox` | ❌ |
| Working directory | `cd` | ❌ | `-C, --cd` | ❌ | ❌ |

---

## Detailed Flag Documentation

### Claude CLI (`claude --help`)

#### Core Execution
| Flag | Type | Description |
|------|------|-------------|
| `-p, --print` | boolean | Print response and exit (non-interactive) |
| `--output-format <format>` | `text\|json\|stream-json` | Output format (only with --print) |
| `--json-schema <schema>` | string | JSON Schema for structured output validation |
| `--include-partial-messages` | boolean | Include partial message chunks (with stream-json) |
| `--input-format <format>` | `text\|stream-json` | Input format (only with --print) |
| `--replay-user-messages` | boolean | Re-emit user messages from stdin to stdout |

#### Model & Agent
| Flag | Type | Description |
|------|------|-------------|
| `--model <model>` | string | Model alias (sonnet, opus, haiku) or full name |
| `--agent <agent>` | string | Agent for the current session |
| `--agents <json>` | JSON | Custom agents definition |
| `--fallback-model <model>` | string | Fallback when default model is overloaded |
| `--betas <betas...>` | string[] | Beta headers to include in API requests |

#### Session Management
| Flag | Type | Description |
|------|------|-------------|
| `-c, --continue` | boolean | Continue the most recent conversation |
| `-r, --resume [value]` | string? | Resume by session ID or open picker |
| `--fork-session` | boolean | Create new session ID when resuming |
| `--session-id <uuid>` | UUID | Use specific session ID |

#### Context & Files
| Flag | Type | Description |
|------|------|-------------|
| `--add-dir <directories...>` | string[] | Additional directories for tool access |
| `--ide` | boolean | Connect to IDE on startup |

#### System Prompt
| Flag | Type | Description |
|------|------|-------------|
| `--system-prompt <prompt>` | string | Override default system prompt |
| `--append-system-prompt <prompt>` | string | Append to default system prompt |

#### Permissions & Safety
| Flag | Type | Description |
|------|------|-------------|
| `--dangerously-skip-permissions` | boolean | Bypass ALL permission checks |
| `--allow-dangerously-skip-permissions` | boolean | Enable bypass as option (not default) |
| `--allowedTools, --allowed-tools <tools...>` | string[] | Tool whitelist (e.g., "Bash(git:*) Edit") |
| `--tools <tools...>` | string[] | Available tools from built-in set |
| `--disallowedTools, --disallowed-tools <tools...>` | string[] | Tool blacklist |
| `--permission-mode <mode>` | enum | acceptEdits, bypassPermissions, default, dontAsk, plan |

#### MCP Configuration
| Flag | Type | Description |
|------|------|-------------|
| `--mcp-config <configs...>` | string[] | Load MCP servers from JSON files or strings |
| `--strict-mcp-config` | boolean | Only use MCP servers from --mcp-config |

#### Settings & Plugins
| Flag | Type | Description |
|------|------|-------------|
| `--settings <file-or-json>` | string | Path to settings JSON or JSON string |
| `--setting-sources <sources>` | string | Comma-separated: user, project, local |
| `--plugin-dir <paths...>` | string[] | Load plugins from directories |
| `--disable-slash-commands` | boolean | Disable all slash commands |

#### Debug & Info
| Flag | Type | Description |
|------|------|-------------|
| `-d, --debug [filter]` | string? | Debug mode with optional category filter |
| `--verbose` | boolean | Override verbose mode from config |
| `--mcp-debug` | boolean | [DEPRECATED] MCP debug mode |
| `-v, --version` | boolean | Output version number |
| `-h, --help` | boolean | Display help |

---

### Codex CLI (`codex --help`)

#### Core Execution
| Flag | Type | Description |
|------|------|-------------|
| `[PROMPT]` | positional | Optional prompt to start session |
| `exec` / `e` | subcommand | Run non-interactively |
| `review` | subcommand | Run code review non-interactively |
| `resume` | subcommand | Resume previous session (--last for most recent) |
| `apply` / `a` | subcommand | Apply latest diff as git apply |

#### Model & Provider
| Flag | Type | Description |
|------|------|-------------|
| `-m, --model <MODEL>` | string | Model the agent should use |
| `--oss` | boolean | Use local OSS model provider (Ollama/LM Studio) |
| `--local-provider <provider>` | `lmstudio\|ollama` | Specify local provider |

#### Configuration
| Flag | Type | Description |
|------|------|-------------|
| `-c, --config <key=value>` | string | Override config (dotted path, TOML value) |
| `--enable <FEATURE>` | string | Enable a feature |
| `--disable <FEATURE>` | string | Disable a feature |
| `-p, --profile <profile>` | string | Configuration profile from config.toml |

#### Execution Control
| Flag | Type | Description |
|------|------|-------------|
| `-C, --cd <DIR>` | path | Working directory for the agent |
| `-i, --image <FILE>...` | file[] | Images to attach to initial prompt |
| `--search` | boolean | Enable web search tool |

#### Approval & Sandbox
| Flag | Type | Description |
|------|------|-------------|
| `-a, --ask-for-approval <policy>` | enum | `untrusted`, `on-failure`, `on-request`, `never` |
| `--full-auto` | boolean | Low-friction sandboxed auto execution |
| `-s, --sandbox <mode>` | enum | `read-only`, `workspace-write`, `danger-full-access` |
| `--dangerously-bypass-approvals-and-sandbox` | boolean | Skip ALL prompts (EXTREMELY DANGEROUS) |
| `--add-dir <DIR>` | path | Additional writable directories |

#### Info
| Flag | Type | Description |
|------|------|-------------|
| `-h, --help` | boolean | Print help |
| `-V, --version` | boolean | Print version |

---

### Gemini CLI (`gemini --help`)

#### Core Execution
| Flag | Type | Description |
|------|------|-------------|
| `[query..]` | positional | Prompt (defaults to one-shot mode) |
| `-p, --prompt` | string | [DEPRECATED] Use positional instead |
| `-i, --prompt-interactive` | string | Execute prompt and continue interactively |

#### Model
| Flag | Type | Description |
|------|------|-------------|
| `-m, --model` | string | Model to use |

#### Output
| Flag | Type | Description |
|------|------|-------------|
| `-o, --output-format` | `text\|json\|stream-json` | Output format |

#### Approval & Sandbox
| Flag | Type | Description |
|------|------|-------------|
| `-s, --sandbox` | boolean | Run in sandbox |
| `-y, --yolo` | boolean | Auto-accept all actions |
| `--approval-mode` | `default\|auto_edit\|yolo` | Approval mode |

#### Context & Extensions
| Flag | Type | Description |
|------|------|-------------|
| `--include-directories` | string[] | Additional directories |
| `-e, --extensions` | string[] | Extensions to use |
| `-l, --list-extensions` | boolean | List available extensions |

#### Session Management
| Flag | Type | Description |
|------|------|-------------|
| `-r, --resume` | string | Resume session ("latest" or index) |
| `--list-sessions` | boolean | List available sessions |
| `--delete-session` | string | Delete session by index |

#### MCP & Tools
| Flag | Type | Description |
|------|------|-------------|
| `--allowed-mcp-server-names` | string[] | Allowed MCP server names |
| `--allowed-tools` | string[] | Tools allowed without confirmation |

#### Other
| Flag | Type | Description |
|------|------|-------------|
| `-d, --debug` | boolean | Debug mode |
| `--screen-reader` | boolean | Screen reader accessibility mode |
| `--experimental-acp` | boolean | ACP mode |
| `-v, --version` | boolean | Show version |
| `-h, --help` | boolean | Show help |

---

### Copilot CLI (`copilot --help`)

#### Core Execution
| Flag | Type | Description |
|------|------|-------------|
| `-p, --prompt <text>` | string | Non-interactive prompt (exits after) |
| `-i, --interactive <prompt>` | string | Interactive mode with initial prompt |
| `-s, --silent` | boolean | Output only agent response (for scripting) |
| `--stream <mode>` | `on\|off` | Streaming mode |
| `--banner` | boolean | Show startup banner |

#### Model & Agent
| Flag | Type | Description |
|------|------|-------------|
| `--model <model>` | enum | claude-sonnet-4.5, gpt-5, gemini-3-pro-preview, etc. |
| `--agent <agent>` | string | Custom agent to use |

#### Session Management
| Flag | Type | Description |
|------|------|-------------|
| `--continue` | boolean | Resume most recent session |
| `--resume [sessionId]` | string? | Resume from session (optional ID) |

#### Directory & Path Access
| Flag | Type | Description |
|------|------|-------------|
| `--add-dir <directory>` | string | Add directory to allowed list (repeatable) |
| `--allow-all-paths` | boolean | Disable path verification |
| `--disallow-temp-dir` | boolean | Prevent temp directory access |

#### Tool Permissions
| Flag | Type | Description |
|------|------|-------------|
| `--allow-all-tools` | boolean | Allow all tools without confirmation |
| `--allow-tool [tools...]` | string[] | Allow specific tools |
| `--deny-tool [tools...]` | string[] | Deny specific tools (precedence over allow) |

#### MCP Configuration
| Flag | Type | Description |
|------|------|-------------|
| `--additional-mcp-config <json>` | string | MCP servers config (JSON or @filepath) |
| `--disable-builtin-mcps` | boolean | Disable built-in MCP servers |
| `--disable-mcp-server <name>` | string | Disable specific MCP server |
| `--enable-all-github-mcp-tools` | boolean | Enable all GitHub MCP tools |
| `--disable-parallel-tools-execution` | boolean | Sequential tool execution |

#### Other
| Flag | Type | Description |
|------|------|-------------|
| `--no-color` | boolean | Disable color output |
| `--no-custom-instructions` | boolean | Disable AGENTS.md loading |
| `--log-dir <directory>` | string | Log file directory |
| `--log-level <level>` | enum | none, error, warning, info, debug, all |
| `--screen-reader` | boolean | Screen reader optimizations |
| `-v, --version` | boolean | Show version |
| `-h, --help` | boolean | Display help |

---

## Shared Concepts Analysis

### Universally Shared (All 4 CLIs)
1. **Model selection** - All support `--model`
2. **Non-interactive mode** - Different implementations but same concept
3. **Directory access** - `--add-dir` or `--include-directories`
4. **Session resume** - All support resuming previous sessions
5. **Help/Version** - Standard `-h`/`-v` flags

### Mostly Shared (3+ CLIs)
1. **Tool permissions** - Allow/deny specific tools (not Codex)
2. **Debug mode** - Claude, Gemini, Copilot (via log-level)
3. **Output format** - Claude, Gemini support JSON output
4. **MCP configuration** - All support MCP but differently

### Partially Shared (2 CLIs)
1. **Sandbox mode** - Codex (levels), Gemini (boolean)
2. **Approval mode** - Codex (`--ask-for-approval`), Gemini (`--approval-mode`)
3. **System prompt** - Only Claude has direct support
4. **Extensions/Plugins** - Claude (plugins), Gemini (extensions)

### Unique Features
| Feature | CLI | Flag |
|---------|-----|------|
| Permission mode levels | Claude | `--permission-mode` |
| Beta headers | Claude | `--betas` |
| Fork session | Claude | `--fork-session` |
| IDE integration | Claude | `--ide` |
| Image input | Codex | `--image` |
| Web search | Codex | `--search` |
| OSS/Local models | Codex | `--oss`, `--local-provider` |
| Working directory | Codex | `--cd` |
| Profile configs | Codex | `--profile` |
| Screen reader | Gemini, Copilot | `--screen-reader` |
| **Silent (suppress metadata)** | Copilot | `-s, --silent` |
| Streaming toggle | Copilot | `--stream` |
| Banner display | Copilot | `--banner` |
| Color disable | Copilot | `--no-color` |
| Custom instructions disable | Copilot | `--no-custom-instructions` |

> **Note on `silent`**: Copilot's `--silent` flag suppresses session metadata and stats in output - it does NOT control interactive vs non-interactive mode. It's useful for clean output when piping to other tools. Our codebase defaults `silent: true` because the metadata is rarely useful and interferes with scripting.

---

## "God Mode" / Full Automation Mapping

| CLI | Flag | Effect |
|-----|------|--------|
| Claude | `--dangerously-skip-permissions` | Bypasses ALL permission checks |
| Codex | `--full-auto` | Low-friction sandboxed auto execution |
| Codex | `--dangerously-bypass-approvals-and-sandbox` | Skip ALL prompts (more dangerous) |
| Gemini | `--yolo` | Auto-accept all actions |
| Copilot | `--allow-all-tools` | Allow all tools without confirmation |

**Recommendation**: Map unified `allow-all-tools: true` to the safest "full auto" option for each:
- Claude → `--dangerously-skip-permissions`
- Codex → `--full-auto`
- Gemini → `--yolo`
- Copilot → `--allow-all-tools`

---

## Approval Policy Mapping

| Level | Claude | Codex | Gemini | Copilot |
|-------|--------|-------|--------|---------|
| Default (ask) | (default) | `untrusted` | `default` | (default) |
| Auto-edit only | `--permission-mode acceptEdits` | `--ask-for-approval on-failure` | `auto_edit` | N/A |
| Full auto | `--dangerously-skip-permissions` | `never` | `yolo` | `--allow-all-tools` |

---

## Maintenance Guide: How to Update This Table

### Quick Sync Process

When CLI tools update, follow this process to refresh the comparison:

#### Step 1: Run --help for Each CLI

```bash
# Run these commands and capture output
claude --help > /tmp/claude-help.txt 2>&1
codex --help > /tmp/codex-help.txt 2>&1
gemini --help > /tmp/gemini-help.txt 2>&1
copilot --help > /tmp/copilot-help.txt 2>&1
```

#### Step 2: Check for New/Changed Flags

For each CLI, look for:
- **New flags** not in this document
- **Deprecated flags** (often marked with `[DEPRECATED]`)
- **Changed flag values** (enum options, types)
- **Renamed flags** (e.g., `--allowedTools` → `--allowed-tools`)

#### Step 3: Update the Sections

1. **Detailed Flag Documentation** - Add new flags to the appropriate CLI section
2. **Quick Reference Matrix** - Update if a new shared concept emerges
3. **Shared Concepts Analysis** - Recategorize if flags become shared/unique
4. **God Mode Mapping** - Update if auto-approval flags change

### AI Prompt for Future Updates

Use this prompt to have an AI update the table:

```
I need to update the CLI flags comparison table for markdown-agent.

Here is the current --help output for each CLI:

## Claude CLI
<paste claude --help output>

## Codex CLI
<paste codex --help output>

## Gemini CLI
<paste gemini --help output>

## Copilot CLI
<paste copilot --help output>

Tasks:
1. Compare against the existing table in docs/CLI_FLAGS_COMPARISON.md
2. Identify NEW flags not currently documented
3. Identify DEPRECATED or REMOVED flags
4. Identify flags that CHANGED (type, values, description)
5. Update the Quick Reference Matrix if new shared concepts emerged
6. Update the "God Mode" / approval policy mappings if changed
7. Add any new runner-unique features to the Unique Features table

Output the specific edits needed to update the document.
```

### Validation: Run the Flag Tests

After updating, run the flag validation tests:

```bash
bun test src/runners/cli-flags.test.ts
```

This test extracts flags from `--help` output and validates that our runner implementations use valid flags. If a flag was renamed or removed, this test will catch it.

### Common Changes to Watch For

| Change Type | How to Detect | Action |
|-------------|---------------|--------|
| New model names | `--model` help text | Update model mappings in runner |
| New approval levels | `--approval-mode` or similar | Update approval policy mapping |
| New tool permission syntax | `--allowed-tools` help | Update allow-tool documentation |
| Deprecated flag | `[DEPRECATED]` in help | Add deprecation note, plan removal |
| Flag renamed | Old flag missing, new similar flag | Update runner code + docs |
| New subcommand | Commands section in help | Document if relevant to our use |

### Changelog

| Date | Changes |
|------|---------|
| 2025-12-06 | Initial comprehensive documentation from --help |

---

## Source of Truth

The authoritative source for each CLI's flags:

| CLI | Help Command | Official Docs |
|-----|--------------|---------------|
| Claude | `claude --help` | https://docs.anthropic.com/claude-code |
| Codex | `codex --help` | https://github.com/openai/codex |
| Gemini | `gemini --help` | https://github.com/google-gemini/gemini-cli |
| Copilot | `copilot --help` | https://docs.github.com/copilot |

**Note**: The `--help` output is always more current than online documentation. When in doubt, trust `--help`.
