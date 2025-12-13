# mdflow Frontmatter/Flags/Internals Architecture Review

## Executive Summary

**mdflow** (`md`) is a CLI tool that executes AI agents defined as markdown files. This bundle is for expert review of the frontmatter parsing, flag handling, template system, and import resolution.

### Key Areas for Review:

1. **Frontmatter → CLI Flag Conversion**: `buildArgs()` in `command.ts` converts YAML keys to CLI flags with special handling for system keys, positional mappings, and template variables.

2. **Config Cascade**: Three-tier loading (built-in defaults → git root → CWD) with command-specific defaults.

3. **Template System**: LiquidJS-powered `_` prefixed variables with stdin/positional injection.

4. **Import System**: Files (`@./path`), globs (`@**/*.ts`), line ranges (`:10-50`), symbols (`#Func`), commands (`` !`cmd` ``), URLs.

5. **Command Resolution**: Filename parsing (`task.claude.md` → `claude`) with `.i.` interactive marker.

---

## Code Bundle

**See: `expert-bundle-packx-content.md`** (~36K tokens)

Contains all source files:
- `src/types.ts` - Core interfaces (`AgentFrontmatter`)
- `src/schema.ts` - Zod validation (minimal passthrough)
- `src/command.ts` - `buildArgs()`, `runCommand()`, command resolution
- `src/config.ts` - Config loading, defaults, interactive mode
- `src/template.ts` - LiquidJS template engine
- `src/imports.ts` - Import expansion (files, globs, symbols, commands, URLs)
- `src/imports-types.ts` - Import action types
- `src/imports-parser.ts` - Pure parser for import syntax
- `src/index.ts` - Main entry point
- `src/env.ts` - .env file loading
- `src/frontmatter.ts` - YAML parsing
- `src/cli.ts` - CLI argument parsing
- `src/*.test.ts` - Test files showing usage patterns
- `CLAUDE.md` - Project documentation

---

## Analysis Guide

### 1. Frontmatter Key Consistency

**Current conventions:**
- `_varname` - Template variables (consumed, not passed to CLI)
- `$1`, `$2` - Positional mapping (maps body/args to flags)
- `_1`, `_2` - Auto-injected positional args in templates
- `_interactive`/`_i` - Interactive mode toggle
- `_subcommand` - Prepend subcommand
- `_cwd`, `_capture`, `_hide`, `_command` - Internal controls

**Questions:**
- Is `$1` vs `_1` distinction clear? (`$1: prompt` maps to flag, `{{ _1 }}` is template var)
- Should all internal keys have consistent prefix (`_` only)?
- Why does `env` not have underscore prefix when object form is consumed?

### 2. Config Cascade

**Load order:** Built-in → `~/.mdflow/config.yaml` → Git root config → CWD config

**Merge strategy:** Deep merge per-command, later overrides earlier

**Questions:**
- Is this order intuitive? (Global before project)
- Should there be `extends` or explicit override syntax?
- How to handle conflicting array values (replace vs append)?

### 3. Command-Specific Defaults

```typescript
// Built-in defaults in config.ts
claude:    { print: true }
copilot:   { silent: true, $1: "prompt" }
codex:     { _subcommand: "exec" }
droid:     { _subcommand: "exec" }
opencode:  { _subcommand: "run" }
gemini:    {} // No special flags needed
```

**Questions:**
- Are these correct for each tool's print mode?
- What about: aider, continue, cursor, cody, tabnine?
- How to add new tool defaults without code changes?

### 4. Template System

**Features:**
- LiquidJS full syntax (conditionals, loops, filters)
- `_` prefixed vars only
- `_stdin` for piped input
- `_args` array for iteration

**Questions:**
- Is LiquidJS overkill? (Most use simple substitution)
- How to escape literal `{{ }}`?
- Should missing vars prompt interactively or use default filter?

### 5. Import System

**Syntax:**
- `@./file.md` - File import
- `@./src/**/*.ts` - Glob (respects .gitignore)
- `@./file.ts:10-50` - Line range
- `@./file.ts#Symbol` - TypeScript symbol extraction
- `` !`command` `` - Inline command output
- `@https://url` - URL fetch
- `` ```lang\n#!shebang\ncode\n``` `` - Executable code fence (NEW)

**Questions:**
- Symbol extraction handles functions, classes, interfaces, types, enums - what about `const` objects?
- Should URL imports cache results?
- Executable fences: security implications? sandboxing?

### 6. Type Safety

**Current approach:**
- `AgentFrontmatter` uses `[key: string]: unknown` for passthrough
- Zod validates system keys only, rest passes through
- Runtime checks minimal

**Questions:**
- Should flag values be validated (string, number, boolean, array)?
- Type coercion issues? (YAML `yes`/`no` → boolean)
- Error on unknown system keys?

### 7. Error Handling

**Current behavior:**
- Config parse errors: silent, return empty
- Import file not found: `<!-- Error: ... -->` comment
- Command not found: error message + exit 127
- Template errors: LiquidJS handles gracefully

**Questions:**
- Should config errors be visible?
- Should import errors be fatal or warnings?
- Structured error types vs strings?

### 8. CLI Parsing

**Formats supported:**
- `--_varname=value`
- `--_varname value`
- `--_flag` (boolean)
- Positional args after file path

**Questions:**
- What if value starts with `--`?
- Order sensitivity of flags?
- Conflict between CLI and frontmatter values?

---

## Specific Review Requests

### A. Naming Convention Audit

Review all key prefixes and recommend consistent scheme:
- Internal (consumed) keys
- Template variables
- Positional mapping
- Pass-through flags

### B. Edge Case Analysis

For each module, identify unhandled cases:
- Empty values, null, undefined
- Unicode, special characters
- Very long content
- Circular imports
- Race conditions

### C. Extensibility Assessment

How easy to:
- Add new AI tool with custom defaults?
- Add new import syntax?
- Add new template features?
- Override behavior per-project?

### D. Security Review

- Command injection in `!`cmd``?
- Path traversal in `@./path`?
- SSRF in `@https://url`?
- Code execution in executable fences?

---

## Instructions For The Next AI Agent

You are reading the "mdflow Frontmatter Architecture Review" bundle.

**Your job:**
1. Read `expert-bundle-packx-content.md` for full source code
2. Analyze for gaps, inconsistencies, and improvements
3. Provide specific recommendations with exact code changes

**Rules:**
- Provide **precise code snippets** that can be copy-pasted
- Include **exact file paths** and line locations
- Show before/after or complete replacement code
- Prioritize by user impact and implementation complexity

**Focus areas:**
- Consistency in naming and behavior
- Completeness of edge case handling
- Clarity of error messages
- Extensibility for new tools/features
- Correctness of logic
