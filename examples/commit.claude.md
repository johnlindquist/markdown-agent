---
# A practical example: Generate commit messages
# Usage: git diff --staged | ma commit.claude.md
model: sonnet
p: true
---

Generate a concise, conventional commit message for the following diff.
Use the format: type(scope): description

Types: feat, fix, docs, style, refactor, test, chore

Keep it under 72 characters.
