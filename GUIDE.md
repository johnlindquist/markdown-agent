# The `markdown-agent` Examples Tour

This guide demonstrates 10 progressively more impressive ways to use `markdown-agent` (`ma`). We start with basic scripts and end with a self-orchestrating swarm that works in parallel across multiple git worktrees.

---

## 1. The "Hello World"

**Concept:** *Command Inference*
The command to run (`claude`) is inferred automatically from the filename.

**File:** `01-hello.claude.md`

```markdown
---
model: haiku
---
Say "Hello! I am an executable markdown file." and nothing else.
```

**Run it:**

```bash
ma 01-hello.claude.md
```

---

## 2. The Configurator

**Concept:** *Hijacked Flags & Defaults*
Variables starting with `$` define defaults that can be overridden by CLI flags.

**File:** `02-config.gemini.md`

```markdown
---
model: gemini-1.5-flash
# Default values
$env: development
$port: 8080
# Pass-through flags for Gemini
temperature: 0.1
json: true
---
Generate a JSON configuration for a server running in **{{ env }}** mode on port **{{ port }}**.
Return ONLY the raw JSON.
```

**Run it:**

```bash
# Use defaults
ma 02-config.gemini.md

# Override with flags
ma 02-config.gemini.md --env production --port 3000
```

---

## 3. The Logic Gate

**Concept:** *Conditionals & Args*
Use `args` to map positional arguments, and LiquidJS tags to change the prompt dynamically.

**File:** `03-deploy.copilot.md`

```markdown
---
args: [service_name, platform]
model: gpt-4
---
Generate a deployment script for {{ service_name }}.

{% if platform == 'k8s' %}
Generate a Kubernetes Deployment YAML. Include liveness probes.
{% elsif platform == 'aws' %}
Generate an AWS Lambda SAM template.
{% else %}
Generate a simple Dockerfile.
{% endif %}
```

**Run it:**

```bash
ma 03-deploy.copilot.md "auth-service" "k8s"
```

---

## 4. The Live Context

**Concept:** *Command Inlines*
Execute shell commands *inside* the prompt to inject the current system state.

**File:** `04-debug.claude.md`

```markdown
---
model: sonnet
---
I am seeing an error. Here is my current system state:

**Git Status:**
!`git status --short`

**Recent Logs:**
!`tail -n 5 error.log 2>/dev/null || echo "No logs found"`

Based on this, what should I check first?
```

**Run it:**

```bash
ma 04-debug.claude.md
```

---

## 5. The Surgeon

**Concept:** *Symbol Extraction*
Import specific TypeScript interfaces or functions instead of wasting tokens on entire files.

**File:** `05-mock-gen.claude.md`

```markdown
---
model: sonnet
---
Generate a JSON mock object that satisfies this TypeScript interface:

@./src/types.ts#UserSession

Output only the JSON.
```

**Run it:**

```bash
ma 05-mock-gen.claude.md > mock-user.json
```

---

## 6. The Auditor

**Concept:** *Glob Imports & Environment Config*
Import entire directory trees. We set `MA_FORCE_CONTEXT` in `env` to override the default token safety limit for large imports.

**File:** `06-audit.gemini.md`

```markdown
---
model: gemini-1.5-pro
env:
  MA_FORCE_CONTEXT: "1"
---
You are a Security Auditor. Scan the following files for hardcoded secrets or unsafe regex:

@./src/**/*.ts

List any vulnerabilities found.
```

**Run it:**

```bash
ma 06-audit.gemini.md
```

---

## 7. The Unix Filter

**Concept:** *Standard Input (Stdin)*
`ma` automatically wraps piped input in `<stdin>` tags, allowing agents to act as filters in Unix pipes.

**File:** `07-describe-changes.claude.md`

```markdown
---
model: haiku
---
Generate a concise PR description for the changes in <stdin>.
Include a "Summary" and "Key Changes" section.
```

**Run it:**

```bash
git diff --staged | ma 07-describe-changes.claude.md
```

---

## 8. The Architecture Review

**Concept:** *Agent Chaining*
Pipe the output of one agent (The Summarizer) into another (The Critic).

**File:** `08a-summarize.claude.md`

```markdown
---
model: haiku
---
Summarize the file content in <stdin> into a high-level architecture description.
```

**File:** `08b-critique.claude.md`

```markdown
---
model: opus
---
You are a Principal Engineer. Critique the architecture description provided in <stdin>.
Identify bottlenecks and suggest scalability improvements.
```

**Run it:**

```bash
cat src/*.ts | ma 08a-summarize.claude.md | ma 08b-critique.claude.md
```

---

## 9. The Remote Agent

**Concept:** *Remote Execution*
Run an agent directly from a URL without downloading it. Perfect for sharing team SOPs.

**Run it:**

```bash
ma https://raw.githubusercontent.com/johnlindquist/markdown-agent/main/examples/hello.claude.md
```

---

## 10. The Grand Finale: Worktree Swarm

**Concept:** *Multi-Agent Worktree Orchestration*
An "Architect" agent generates a shell script that spawns multiple "Worker" agents, each running in a purely isolated git worktree.

**The Worker:** `10-worker.claude.md`

```markdown
---
args: [task]
model: sonnet
---
You are a worker bee. Implement this task in the current directory: {{ task }}
Write the code to a file named `implementation.ts`.
```

**The Architect:** `10-architect.claude.md`

```markdown
---
args: [goal]
model: opus
---
You are a Fleet Commander. Break down the goal "{{ goal }}" into 2 parallel sub-tasks.

Generate a BASH script that:
1. Creates 2 git worktrees (`wt-frontend` and `wt-backend`) on new branches.
2. Inside each worktree, runs `ma ../10-worker.claude.md "sub-task description"`.
3. Runs them in the background (`&`) and `wait`s for them to finish.

Output ONLY the raw bash script.
```

**Run the Swarm:**

```bash
# 1. The Architect creates the plan and script
# 2. We pipe the script to sh to execute the swarm immediately
ma 10-architect.claude.md "Build a login page with a fastify backend" | sh
```
