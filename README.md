# markdown-agent

```bash
REVIEW.claude.md                 # Run with Claude
COMMIT.gemini.md "fix auth bug"  # Run with Gemini
git diff | EXPLAIN.md            # Pipe through any command
```

**Your markdown files are now executable AI agents.**

---

## What Is This?

Markdown files become first-class CLI commands. Write a prompt in markdown, run it like a script. The command is inferred from the filename or specified in frontmatter.

```markdown
# review.claude.md
---
model: opus
---
Review this code for bugs and suggest improvements.

@./src/**/*.ts
```

```bash
review.claude.md                 # Runs: claude --model opus <prompt>
review.claude.md -- --verbose    # Pass extra flags after --
```

---

## How It Works

### 1. Filename → Command

Name your file `task.COMMAND.md` and the command is inferred:

```bash
task.claude.md    # Runs claude
task.gemini.md    # Runs gemini
task.codex.md     # Runs codex
task.copilot.md   # Runs copilot
```

### 2. Frontmatter → CLI Flags

Every YAML key becomes a CLI flag passed to the command:

```yaml
---
command: claude          # Explicit command (overrides filename)
model: opus              # → --model opus
dangerously-skip-permissions: true  # → --dangerously-skip-permissions
mcp-config: ./mcp.json   # → --mcp-config ./mcp.json
add-dir:                 # → --add-dir ./src --add-dir ./tests
  - ./src
  - ./tests
---
```

### 3. Body → Prompt

The markdown body is passed as the final argument to the command.

---

## Unix Philosophy

markdown-agent embraces the Unix philosophy:

- **No magic mapping** - Frontmatter keys pass directly to the command
- **Stdin/stdout** - Pipe data in and out
- **Composable** - Chain agents together
- **Transparent** - Use `--dry-run` to see exactly what runs

```bash
# Pipe input
git diff | ma review.claude.md

# Chain agents
ma plan.claude.md | ma implement.codex.md

# See what would run
ma task.claude.md --dry-run
```

---

## Installation

```bash
npm install -g markdown-agent
# or
bun install && bun link
```

## Quick Start

```bash
# Run with filename-inferred command
ma task.claude.md
ma task.gemini.md

# Explicit command override
ma task.md --command claude
ma task.md -c gemini

# Pass additional flags to the command
ma task.claude.md -- --verbose --debug

# Dry-run to see what would execute
ma task.claude.md --dry-run
```

> **Note:** Both `ma` and `markdown-agent` commands are available.

---

## Command Resolution

Commands are resolved in this priority order:

1. **CLI flag**: `--command claude` or `-c claude`
2. **Frontmatter**: `command: claude`
3. **Filename**: `task.claude.md` → `claude`

If no command can be resolved, you'll get an error with instructions.

---

## Frontmatter Reference

### System Keys (handled by markdown-agent)

| Field | Type | Description |
|-------|------|-------------|
| `command` | string | Command to execute (e.g., `claude`, `gemini`, `codex`) |
| `$1` | string | Map body to a flag instead of positional (e.g., `$1: prompt` → `--prompt <body>`) |
| `inputs` | InputField[] | Wizard mode interactive prompts |
| `cache` | boolean | Enable result caching |
| `requires` | object | Prerequisites: `bin`, `env` arrays |

### All Other Keys → CLI Flags

Every other frontmatter key is passed directly to the command:

```yaml
---
command: claude
model: opus                           # → --model opus
dangerously-skip-permissions: true    # → --dangerously-skip-permissions
mcp-config: ./mcp.json                # → --mcp-config ./mcp.json
p: true                               # → -p (single char = short flag)
---
```

**Value conversion:**
- `key: "value"` → `--key value`
- `key: true` → `--key`
- `key: false` → (omitted)
- `key: [a, b]` → `--key a --key b`

---

## Examples

### Claude with MCP Server

```markdown
# db.claude.md
---
model: opus
mcp-config: ./postgres-mcp.json
dangerously-skip-permissions: true
---
Analyze the database schema and suggest optimizations.
```

### Gemini YOLO Mode

```markdown
# refactor.gemini.md
---
model: gemini-2.5-pro
yolo: true
---
Refactor the authentication module to use async/await.
```

### Codex with Sandbox

```markdown
# analyze.codex.md
---
model: o3
sandbox: workspace-write
full-auto: true
---
Analyze this codebase and suggest improvements.
```

### Copilot (requires $1 mapping)

Some tools don't accept positional prompts. Use `$1` to map the body to a flag:

```markdown
# task.copilot.md
---
model: gpt-4.1
$1: prompt
silent: true
---
Explain this code.
```

This runs: `copilot --model gpt-4.1 --prompt "Explain this code." --silent`

### Wizard Mode with Inputs

```markdown
# deploy.claude.md
---
inputs:
  - name: env
    type: select
    message: "Deploy to which environment?"
    choices: ["staging", "production"]
  - name: force
    type: confirm
    message: "Force deploy?"
    default: false
---
Deploy to {{ env }}{% if force %} with --force{% endif %}.
```

---

## Imports & Command Inlines

Inline content from other files or command output directly in your prompts.

### File Imports

Use `@` followed by a path to inline file contents:

```markdown
---
command: claude
---
Follow these coding standards:
@~/.config/coding-standards.md

Now review this code:
@./src/api.ts
```

- `@~/path` - Expands `~` to home directory
- `@./path` - Relative to current markdown file
- `@/path` - Absolute path

Imports are recursive—imported files can have their own `@` imports.

### Glob Imports

Use glob patterns to include multiple files at once:

```markdown
---
command: claude
---
Review all TypeScript files in src:
@./src/**/*.ts
```

Glob imports:
- Respect `.gitignore` automatically
- Include common exclusions (`node_modules`, `.git`, etc.)
- Are limited to ~100,000 tokens by default
- Set `MA_FORCE_CONTEXT=1` to override the token limit

Files are formatted as XML with path attributes:

```xml
<api path="src/api.ts">
...file content...
</api>

<utils path="src/utils.ts">
...file content...
</utils>
```

### Line Range Imports

Extract specific lines from a file:

```markdown
@./src/api.ts:10-50
```

This imports only lines 10-50 from the file.

### Symbol Extraction

Extract specific TypeScript/JavaScript symbols (interfaces, types, functions, classes, etc.):

```markdown
@./src/types.ts#UserInterface
@./src/api.ts#fetchUser
```

Supported symbols:
- `interface Name { ... }`
- `type Name = ...`
- `function Name(...) { ... }`
- `class Name { ... }`
- `const/let/var Name = ...`
- `enum Name { ... }`

### Command Inlines

Use `` !`command` `` to execute a shell command and inline its output:

```markdown
---
command: claude
---
Current branch: !`git branch --show-current`
Recent commits:
!`git log --oneline -5`

Based on the above, suggest what to work on next.
```

### URL Imports

Fetch content from URLs (markdown and JSON only):

```markdown
@https://raw.githubusercontent.com/user/repo/main/README.md
```

---

## Environment Variables

markdown-agent automatically loads `.env` files from the markdown file's directory.

### Loading Order

Files are loaded in order (later files override earlier):

1. `.env` - Base environment
2. `.env.local` - Local overrides (not committed)
3. `.env.development` / `.env.production` - Environment-specific
4. `.env.development.local` / `.env.production.local` - Environment-specific local

### Example

```
my-agents/
├── .env                    # API_KEY=default
├── .env.local              # API_KEY=my-secret (gitignored)
└── review.claude.md
```

Environment variables are available:
- In command inlines: `` !`echo $API_KEY` ``
- In the spawned command's environment

---

## CLI Options

```
Usage: ma <file.md> [text] [options] [-- passthrough-args]
       ma --setup

Arguments:
  file.md                 Markdown file to execute
  text                    Additional text appended to the prompt

Options:
  --command, -c <cmd>     Command to execute (e.g., claude, gemini)
  --no-cache              Skip cache and force fresh execution
  --dry-run               Show what would be executed without running
  --check                 Validate frontmatter without executing
  --json                  Output validation as JSON (with --check)
  --verbose, -v           Show debug info
  --logs                  Show log directory (~/.markdown-agent/logs/)
  --setup                 Configure shell to run .md files directly
  --help, -h              Show help

Passthrough:
  --                      Everything after -- is passed to the command

Examples:
  ma task.claude.md "focus on error handling"
  ma task.md --command claude
  ma commit.gemini.md --verbose
  ma task.md -- --model opus --debug
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `MA_FORCE_CONTEXT` | Set to `1` to disable the 100k token limit for glob imports |
| `NODE_ENV` | Controls which `.env.[NODE_ENV]` file is loaded (default: `development`) |

---

## Shell Setup

Make `.md` files directly executable:

```bash
ma --setup   # One-time setup
```

Then run agents directly:

```bash
TASK.claude.md                   # Just type the filename
TASK.claude.md --verbose         # With passthrough args
```

### Manual Setup (zsh)

Add to `~/.zshrc`:

```bash
alias -s md='ma'
export PATH="$HOME/agents:$PATH"  # Your agent library
```

---

## Building Your Agent Library

Create a directory of agents and add it to PATH:

```
~/agents/
├── review.claude.md     # Code review
├── commit.gemini.md     # Commit messages
├── explain.claude.md    # Code explainer
├── test.codex.md        # Test generator
└── debug.claude.md      # Debugging helper
```

```bash
export PATH="$HOME/agents:$PATH"
```

Now use them from anywhere:

```bash
review.claude.md                 # Review current directory
commit.gemini.md "add auth"      # Generate commit message
git diff | review.claude.md      # Review staged changes
```

---

## Notes

- If no frontmatter is present, the file is printed as-is
- Template system uses [LiquidJS](https://liquidjs.com/) - supports conditionals, loops, and filters
- Use `--dry-run` to audit what will be executed
- Logs are always written to `~/.markdown-agent/logs/<agent-name>/` for debugging
- Use `--logs` to show the log directory
- Stdin is wrapped in `<stdin>` tags and prepended to the prompt
