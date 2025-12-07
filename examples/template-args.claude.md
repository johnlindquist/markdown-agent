---
# Named template variables with defaults - CLI flags override
# Usage: ma template-args.claude.md
# Or override: ma template-args.claude.md --feature_name "CustomFeature"
$feature_name: Authentication
$target_dir: src/features
model: sonnet
print: true
---

Write a haiku about {{ feature_name }} in {{ target_dir }}.
