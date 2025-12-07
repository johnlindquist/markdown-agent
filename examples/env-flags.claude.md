---
# Environment variables (array form) - passes as --env flags to command
# Useful for tools that accept --env KEY=VALUE
env:
  - CUSTOM_SETTING=enabled
  - LOG_LEVEL=debug
model: sonnet
---

Run with custom environment flags.
