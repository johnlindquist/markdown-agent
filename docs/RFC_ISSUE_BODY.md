# RFC: Unified Front Matter Schema for Multi-Runner Support

## Summary

This RFC proposes a unified front matter schema that provides consistent configuration across all supported CLI runners (Claude, Codex, Gemini, Copilot) while preserving access to runner-specific features.

## Motivation

Currently, each runner has its own flags with different names for similar concepts:
- **"God mode"**: `--dangerously-skip-permissions` (Claude), `--full-auto` (Codex), `--yolo` (Gemini), `--allow-all-tools` (Copilot)
- **Directory access**: `--add-dir` (most), `--include-directories` (Gemini)
- **Non-interactive**: `-p` (Claude/Copilot), `exec` subcommand (Codex), positional query (Gemini)

Users shouldn't need to memorize different flags for the same functionality.

---

## Research: Complete CLI Flag Comparison

### Quick Reference Matrix

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

### Runner-Unique Features

| Feature | CLI | Flag |
|---------|-----|------|
| Permission mode levels | Claude | `--permission-mode` |
| System prompt override | Claude | `--system-prompt` |
| Image input | Codex | `--image` |
| Web search | Codex | `--search` |
| OSS/Local models | Codex | `--oss`, `--local-provider` |
| Working directory | Codex | `--cd` |
| Extensions | Gemini | `--extensions` |
| Custom agent | Copilot | `--agent` |
| Silent (suppress metadata) | Copilot | `-s, --silent` |

> **Note on `silent`**: Copilot's `--silent` suppresses session metadata/stats - it does NOT control interactive mode. We default `silent: true` in our implementation because the metadata interferes with piping.

---

## Proposed Schema

### Top-Level Universal Keys

```yaml
---
runner: claude | codex | gemini | copilot | auto
model: string
interactive: boolean  # true = REPL (default), false = run once and exit
add-dir: string | string[]
allow-all-tools: boolean
allow-tool: string | string[]
deny-tool: string | string[]
resume: string | boolean
continue: boolean
mcp-config: string | string[]
output-format: text | json | stream-json
debug: boolean | string
---
```

### Runner-Specific Nested Keys

```yaml
---
claude:
  dangerously-skip-permissions: boolean
  permission-mode: acceptEdits | bypassPermissions | default | dontAsk | plan
  system-prompt: string
  append-system-prompt: string

codex:
  sandbox: read-only | workspace-write | danger-full-access
  approval: untrusted | on-failure | on-request | never
  cd: string
  oss: boolean
  local-provider: lmstudio | ollama

gemini:
  sandbox: boolean
  yolo: boolean
  approval-mode: default | auto_edit | yolo
  extensions: string[]

copilot:
  agent: string
  silent: boolean  # Suppress session metadata (default: true)
  allow-all-paths: boolean
  log-level: none | error | warning | info | debug | all
---
```

---

## Flag Resolution Priority

1. **CLI flags** (highest)
2. **Runner-specific nested config**
3. **Top-level universal config**
4. **Defaults** (lowest)

---

## Implementation Tasks

- [ ] Update `src/types.ts` with new schema types
- [ ] Modify each runner to map universal keys
- [ ] Add validation for runner-specific configs
- [ ] Update documentation
- [ ] Add migration warnings for deprecated patterns

---

## Documentation

Full detailed comparison and schema proposal available in:
- `docs/CLI_FLAGS_COMPARISON.md` - Exhaustive flag comparison from `--help`
- `docs/FRONTMATTER_SCHEMA_PROPOSAL.md` - Full schema with TypeScript types

---

## Open Questions

1. **Naming**: Keep `kebab-case` or switch to `camelCase`?
2. **Strict mode**: Should unknown keys error or warn?
3. **Passthrough**: How to handle arbitrary flags? (proposed: `extra-args: []`)

---

*Research generated from `--help` output on 2025-12-06*
