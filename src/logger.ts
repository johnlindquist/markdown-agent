/**
 * Structured logging for markdown-agent internals
 *
 * Enable via:
 * - DEBUG=ma environment variable
 * - --debug CLI flag
 *
 * Logs are written to:
 * - stderr (human-readable when TTY, JSON otherwise)
 * - ~/.markdown-agent/debug.log (always JSON, rotated)
 */

import pino from "pino";
import { homedir } from "os";
import { mkdirSync, existsSync } from "fs";
import { join } from "path";

const LOG_DIR = join(homedir(), ".markdown-agent");
const LOG_FILE = join(LOG_DIR, "debug.log");

// Ensure log directory exists
if (!existsSync(LOG_DIR)) {
  try {
    mkdirSync(LOG_DIR, { recursive: true });
  } catch {
    // Ignore - logging to file is optional
  }
}

// Check if debug mode is enabled
function isDebugEnabled(): boolean {
  return (
    process.env.DEBUG === "ma" ||
    process.env.DEBUG === "markdown-agent" ||
    process.env.MA_DEBUG === "1" ||
    process.argv.includes("--debug")
  );
}

// Create base logger configuration
function createLogger() {
  const enabled = isDebugEnabled();

  if (!enabled) {
    // Return a no-op logger when debug is disabled
    return pino({ level: "silent" });
  }

  // Create transports: stderr + file
  const targets: pino.TransportTargetOptions[] = [];

  // Always log to file in JSON format
  targets.push({
    target: "pino/file",
    options: { destination: LOG_FILE },
    level: "debug",
  });

  // Log to stderr with pretty printing if TTY
  if (process.stderr.isTTY) {
    targets.push({
      target: "pino-pretty",
      options: {
        destination: 2, // stderr
        colorize: true,
        translateTime: "HH:MM:ss",
        ignore: "pid,hostname",
      },
      level: "debug",
    });
  } else {
    targets.push({
      target: "pino/file",
      options: { destination: 2 }, // stderr
      level: "debug",
    });
  }

  return pino(
    {
      level: "debug",
      base: { name: "ma" },
    },
    pino.transport({ targets })
  );
}

// Export singleton logger
export const logger = createLogger();

// Convenience child loggers for different modules
export const parseLogger = logger.child({ module: "parse" });
export const templateLogger = logger.child({ module: "template" });
export const commandLogger = logger.child({ module: "command" });
export const contextLogger = logger.child({ module: "context" });
export const cacheLogger = logger.child({ module: "cache" });
export const importLogger = logger.child({ module: "import" });

// Log file location for user reference
export const LOG_FILE_PATH = LOG_FILE;

/**
 * Check if debug logging is currently enabled
 */
export function isLoggingEnabled(): boolean {
  return isDebugEnabled();
}
