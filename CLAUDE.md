# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

**markdown-agent** (`ma`) is a CLI tool that executes AI agents defined as markdown files. It parses YAML frontmatter for configuration and passes keys directly as CLI flags to the specified command (claude, codex, gemini, copilot, or any other CLI tool).

## Commands

```bash
# Run tests (bail on first failure)
bun test --bail=1

# Run single test file
bun test src/cli.test.ts

# Run a specific test by name
bun test --test-name-pattern "parses command"

# Execute the CLI directly
bun run src/index.ts task.claude.md

# Or using the alias
bun run ma task.claude.md
```

## Architecture

### Core Flow (`src/index.ts`)
```
.md file → parseFrontmatter() → resolveCommand(filename/env)
        → loadGlobalConfig() → applyDefaults()
        → expandImports() → substituteTemplateVars()
        → buildArgs() → runCommand()
```

### Key Modules

- **`command.ts`** - Command resolution and execution
  - `parseCommandFromFilename()`: Infers command from `task.claude.md` → `claude`
  - `resolveCommand()`: Priority: MA_COMMAND env var > filename
  - `buildArgs()`: Converts frontmatter to CLI flags
  - `extractPositionalMappings()`: Extracts $1, $2, etc. mappings
  - `runCommand()`: Spawns the command with positional args

- **`config.ts`** - Global configuration
  - Loads defaults from `~/.markdown-agent/config.yaml`
  - Built-in defaults: copilot maps $1 → prompt
  - `getCommandDefaults()`: Get defaults for a command
  - `applyDefaults()`: Merge defaults with frontmatter

- **`types.ts`** - Core TypeScript interfaces
  - `AgentFrontmatter`: Simple interface with system keys + passthrough
  - System keys: `args`, `env`, `$1`/`$2`/etc.

- **`schema.ts`** - Minimal Zod validation (system keys only, rest passthrough)

- **`imports.ts`** - File imports with advanced features:
  - Basic: `@./path.md` - inline file contents
  - Globs: `@./src/**/*.ts` - multiple files (respects .gitignore)
  - Line ranges: `@./file.ts:10-50` - extract specific lines
  - Symbols: `@./file.ts#InterfaceName` - extract TypeScript symbols
  - Commands: `` !`cmd` `` - inline command output
  - URLs: `@https://example.com/file.md` - fetch remote content

- **`env.ts`** - Environment variable loading from .env files

- **`template.ts`** - LiquidJS-powered template engine for variable substitution

- **`logger.ts`** - Structured logging with pino (logs to `~/.markdown-agent/logs/<agent>/`)

### Command Resolution

Commands are resolved in priority order:
1. `MA_COMMAND` environment variable
2. Filename pattern: `task.claude.md` → `claude`

### Frontmatter Keys

**System keys** (consumed by ma, not passed to command):
- `args`: Named positional arguments for template vars
- `env` (object form): Sets process.env before execution
- `$1`, `$2`, etc.: Map positional args to flags

**All other keys** are passed directly as CLI flags:

```yaml
---
model: opus                  # → --model opus
dangerously-skip-permissions: true  # → --dangerously-skip-permissions
add-dir:                     # → --add-dir ./src --add-dir ./tests
  - ./src
  - ./tests
env:                         # Object form: sets process.env
  API_KEY: secret
---
```

### Positional Mapping ($N)

Map the body or positional args to specific flags:

```yaml
---
$1: prompt    # Body passed as --prompt <body> instead of positional
---
```

### Global Config (`~/.markdown-agent/config.yaml`)

Set default frontmatter per command:

```yaml
commands:
  copilot:
    $1: prompt    # Always map body to --prompt for copilot
  claude:
    model: sonnet # Default model for claude
```

### Template System (LiquidJS)

Uses [LiquidJS](https://liquidjs.com/) for full template support:

- Variables: `{{ variable }}`
- Conditionals: `{% if force %}--force{% endif %}`
- Filters: `{{ name | upcase }}`, `{{ value | default: "fallback" }}`
- `args:` frontmatter to consume CLI positionals as template vars

## Testing Patterns

Tests use Bun's test runner with `describe`/`it` blocks:

```typescript
import { describe, it, expect } from "bun:test";

describe("parseCliArgs", () => {
  it("parses command flag", () => {
    const result = parseCliArgs(["node", "script", "file.md"]);
    expect(result.filePath).toBe("file.md");
  });
});
```
