#!/usr/bin/env bun
/**
 * Entry point for mdflow CLI
 *
 * This is a minimal entry point that:
 * 1. Initializes ProcessManager for centralized lifecycle management
 * 2. Sets up EPIPE handlers for graceful pipe handling
 * 3. Creates a CliRunner with the real system environment
 * 4. Runs the CLI and exits with the appropriate code
 *
 * All orchestration logic is in CliRunner for testability.
 */

import { CliRunner } from "./cli-runner";
import { BunSystemEnvironment } from "./system-environment";
import { getProcessManager } from "./process-manager";

async function main() {
  // Initialize ProcessManager early for centralized signal handling
  // This ensures cursor restoration and process cleanup on SIGINT/SIGTERM
  const pm = getProcessManager();
  pm.initialize();

  // Handle EPIPE gracefully when downstream closes the pipe early
  // (e.g., `md task.md | head -n 5`)
  process.stdout.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EPIPE") {
      pm.restoreTerminal(); // Ensure cursor is visible
      process.exit(0);
    }
    throw err;
  });

  process.stderr.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EPIPE") {
      pm.restoreTerminal(); // Ensure cursor is visible
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
