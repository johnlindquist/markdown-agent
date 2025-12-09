#!/usr/bin/env bun
/**
 * Entry point for mdflow CLI
 *
 * This is a minimal entry point that:
 * 1. Sets up EPIPE handlers for graceful pipe handling
 * 2. Creates a CliRunner with the real system environment
 * 3. Runs the CLI and exits with the appropriate code
 *
 * All orchestration logic is in CliRunner for testability.
 */

import { CliRunner } from "./cli-runner";
import { BunSystemEnvironment } from "./system-environment";

async function main() {
  // Handle EPIPE gracefully when downstream closes the pipe early
  // (e.g., `md task.md | head -n 5`)
  process.stdout.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EPIPE") {
      process.exit(0);
    }
    throw err;
  });

  process.stderr.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EPIPE") {
      process.exit(0);
    }
    throw err;
  });

  // Create the runner with the real system environment
  const runner = new CliRunner({
    env: new BunSystemEnvironment(),
  });

  // Run the CLI and exit with the result code
  const result = await runner.run(process.argv);
  process.exit(result.exitCode);
}

main();
