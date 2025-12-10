# Agent Tips & Tricks

Advanced patterns for building powerful agents with mdflow. Each tip combines multiple features to solve real-world problems.

---

## Tip 1: Self-Documenting Agents with Symbol Extraction

Combine symbol extraction (`#Symbol`) with template variables to create agents that reference their own interfaces.

```markdown
---
model: opus
_target: createUser
---

Here's the function signature I need to refactor:

@./src/api/users.ts#{{ _target }}

And its related type:

@./src/types/user.ts#UserInput

Refactor this function to:
1. Add input validation
2. Return a Result<User, ValidationError> type
3. Keep backward compatibility
```

**Why it works:** Symbol extraction pulls only the relevant code, keeping context focused. Template variables let you reuse the same agent for different functions.

**Usage:**
```bash
md refactor.claude.md --_target "updateUser"
md refactor.claude.md --_target "deleteUser"
```

---

## Tip 2: Dynamic Code Review with Globs + Git Diff

Combine command inlines with globs to review only files that have changed.

```markdown
---
model: opus
---

## Changed Files

!`git diff --name-only HEAD~1 | grep -E '\.(ts|tsx)$'`

## Full Diff

!`git diff HEAD~1 -- '*.ts' '*.tsx'`

## Type Definitions for Context

@./src/types/**/*.ts

Review these changes for:
- Breaking API changes
- Missing error handling
- Type safety issues
- Test coverage gaps
```

**Why it works:** Command inlines capture the current git state dynamically. The glob import provides type context without including unchanged implementation files.

---

## Tip 3: Conditional Tool Configuration with Filters

Use LiquidJS conditionals and filters to create environment-aware agents.

```markdown
---
model: {{ _model | default: "sonnet" }}
_env: production
_strict: false
---

{% if _env == "production" %}
You are reviewing production-critical code. Be extra thorough about:
- Security vulnerabilities (OWASP Top 10)
- Performance implications
- Backward compatibility
{% elsif _env == "staging" %}
Focus on functionality and integration issues.
{% else %}
Quick review for obvious bugs only.
{% endif %}

{% if _strict %}
Fail the review if ANY issues are found.
{% else %}
Categorize issues as: critical, warning, or suggestion.
{% endif %}

Review this code:

{{ _stdin }}
```

**Usage:**
```bash
git diff --staged | md review.claude.md --_env production --_strict
git diff --staged | md review.claude.md --_env development
```

---

## Tip 4: Composable Agents with Nested Imports

Create a library of reusable prompt fragments and compose them.

**`~/.mdflow/prompts/style-guide.md`:**
```markdown
## Code Style Rules
- Use TypeScript strict mode
- Prefer `const` over `let`
- Use explicit return types on functions
- No `any` types without justification
```

**`~/.mdflow/prompts/security.md`:**
```markdown
## Security Checklist
- No hardcoded secrets
- Validate all user input
- Use parameterized queries
- Escape output for XSS prevention
```

**`implement.claude.md`:**
```markdown
---
model: opus
_feature: "user authentication"
---

Implement {{ _feature }} following these guidelines:

@~/.mdflow/prompts/style-guide.md

@~/.mdflow/prompts/security.md

## Feature Requirements

{{ _stdin }}
```

**Why it works:** Nested imports let you maintain a single source of truth for standards. Updates to the shared prompts immediately apply to all agents.

---

## Tip 5: Multi-File Refactoring with Line Ranges

Target specific code sections across multiple files for coordinated refactoring.

```markdown
---
model: opus
---

## Current Error Handling Pattern

Logger configuration:
@./src/utils/logger.ts:1-30

Error class definitions:
@./src/errors/index.ts#AppError
@./src/errors/index.ts#ValidationError

Current usage in API routes:
@./src/routes/users.ts:45-80
@./src/routes/orders.ts:60-95

## Task

Refactor error handling to:
1. Use structured error codes
2. Add request ID tracking
3. Standardize error response format

Generate the updated code for each file section shown above.
```

**Why it works:** Line ranges focus attention on specific areas that need refactoring without overwhelming context. Symbol extraction pulls related types.

---

## Tip 6: Pipeline Agents with Stdin Chaining

Chain agents together using stdin for multi-stage processing.

**`analyze.claude.md`:**
```markdown
---
model: haiku
---

Analyze this code and output ONLY a JSON object with:
- complexity: "low" | "medium" | "high"
- patterns: string[] (detected design patterns)
- concerns: string[] (potential issues)

{{ _stdin }}
```

**`improve.claude.md`:**
```markdown
---
model: opus
---

Based on this analysis:

{{ _stdin }}

And this source code:

@./src/target.ts

Generate improved code addressing each concern. Maintain detected patterns.
```

**Usage:**
```bash
cat src/target.ts | md analyze.claude.md | md improve.claude.md
```

**Why it works:** Haiku quickly produces structured analysis, which Opus uses for deeper improvements. This is faster and cheaper than using Opus for both stages.

---

## Tip 7: Context-Aware Commit Messages

Use git commands and conditionals to generate appropriate commit messages.

```markdown
---
model: haiku
---

## Staged Changes

!`git diff --cached --stat`

## Detailed Diff

!`git diff --cached`

## Recent Commit Style

!`git log --oneline -5`

{% if _breaking %}
## Breaking Change

This is a BREAKING CHANGE. Include:
- What breaks
- Migration path
- Affected versions
{% endif %}

Generate a conventional commit message:
- Type: feat|fix|docs|style|refactor|test|chore
- Scope: (affected area)
- Description: imperative mood, max 72 chars
- Body: why, not what (if needed)

{% if _breaking %}
Include BREAKING CHANGE footer.
{% endif %}
```

**Usage:**
```bash
md commit.claude.md                    # Regular commit
md commit.claude.md --_breaking        # Breaking change
```

---

## Tip 8: Remote Schema Integration

Fetch remote API schemas and generate typed code.

```markdown
---
model: opus
_api_base: https://api.example.com
---

## API Schema

@{{ _api_base }}/openapi.json

## Existing Types

@./src/types/api.ts

## Task

Generate TypeScript types and fetch wrappers for all endpoints.
Requirements:
- Use zod for runtime validation
- Include error handling
- Match existing type patterns from api.ts
- Add JSDoc comments with endpoint descriptions
```

**Why it works:** URL imports fetch the live API specification. Combined with existing types, the agent generates code that fits your codebase.

**Usage:**
```bash
md generate-api.claude.md --_api_base "https://staging.api.example.com"
```

---

## Tip 9: Interactive Debugging Sessions

Use the interactive marker with MCP tools for debugging sessions.

**`debug.i.claude.md`:**
```markdown
---
model: opus
mcp-config: ./mcp-tools.json
dangerously-skip-permissions: true
_file:
---

## Debugging Session

{% if _file %}
Target file:
@./{{ _file }}
{% endif %}

## Available Context

Test results:
!`bun test --bail=1 2>&1 | tail -50`

Recent errors:
!`tail -100 ~/.mdflow/logs/latest.log 2>/dev/null || echo "No logs"`

## Instructions

You have access to filesystem and code execution tools via MCP.
Help me debug the issue. Start by analyzing the test output and
asking clarifying questions.
```

**Why it works:** The `.i.` marker creates an interactive session. Command inlines provide fresh context. MCP integration enables the agent to explore and fix issues autonomously.

**Usage:**
```bash
md debug.i.claude.md --_file "src/parser.ts"
```

---

## Tip 10: Multi-Model Orchestration with Subcommands

Create specialized agents for different models and chain them.

**`quick-fix.haiku.md`:**
```markdown
---
model: haiku
---

Fix the syntax error in this code. Output ONLY the corrected code:

{{ _stdin }}
```

**`deep-review.opus.md`:**
```markdown
---
model: opus
_subcommand: exec
---

Review this code thoroughly:

{{ _stdin }}

Consider architecture, patterns, and long-term maintainability.
```

**`orchestrate.claude.md`:**
```markdown
---
model: sonnet
---

## Quick Analysis Results

!`cat src/target.ts | md quick-fix.haiku.md`

## Deep Review

!`cat src/target.ts | md deep-review.opus.md`

## Synthesis

Combine the quick fixes with the deep review insights.
Prioritize changes by impact and effort.
Generate a final implementation plan.
```

**Why it works:** Different models excel at different tasks. Haiku is fast for simple fixes, Opus is thorough for reviews, Sonnet synthesizes both efficiently.

---

## Quick Reference

| Feature | Syntax | Use Case |
|---------|--------|----------|
| Symbol extraction | `@./file.ts#Name` | Pull specific functions/types |
| Line ranges | `@./file.ts:10-50` | Target code sections |
| Globs | `@./src/**/*.ts` | Include multiple files |
| URL import | `@https://url/file` | Fetch remote content |
| Command inline | `` !`cmd` `` | Dynamic context from shell |
| Template vars | `{{ _var }}` | Parameterize agents |
| Conditionals | `{% if _x %}...{% endif %}` | Environment-aware prompts |
| Stdin | `{{ _stdin }}` | Pipeline chaining |
| Interactive | `.i.` in filename | Conversational sessions |
| Nested imports | `@./other.md` | Composable prompt libraries |

---

## Best Practices

1. **Start small** - Begin with one feature, then combine as needed
2. **Use haiku for triage** - Quick analysis before deep processing
3. **Keep prompts focused** - One clear goal per agent
4. **Leverage globs carefully** - Watch token limits with large codebases
5. **Build prompt libraries** - Reuse common instructions via nested imports
6. **Test with `--dry-run`** - Preview expanded prompts before execution
7. **Use `_cwd`** - For global agents that need local file access
8. **Chain with stdin** - Multi-stage pipelines are more efficient
9. **Parameterize everything** - Template variables make agents reusable
10. **Interactive for exploration** - Use `.i.` when you need back-and-forth
