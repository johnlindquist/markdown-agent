---
# Command inlines - embed shell command output in prompts
# Usage: md command-inline.claude.md
model: sonnet
print: true
---

Based on the current git status:
!`git status --short`

And recent commits:
!`git log --oneline -5`

What should I work on next?
