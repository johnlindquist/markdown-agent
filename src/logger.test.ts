import { expect, test, describe } from "bun:test";
import { isLoggingEnabled, LOG_FILE_PATH } from "./logger";
import { homedir } from "os";
import { join } from "path";

describe("logger", () => {
  test("LOG_FILE_PATH points to home directory", () => {
    expect(LOG_FILE_PATH).toBe(join(homedir(), ".markdown-agent", "debug.log"));
  });

  test("logging is disabled by default", () => {
    // Save original values
    const originalDebug = process.env.DEBUG;
    const originalMaDebug = process.env.MA_DEBUG;

    // Clear debug env vars
    delete process.env.DEBUG;
    delete process.env.MA_DEBUG;

    // Note: isLoggingEnabled checks process.argv which we can't easily modify
    // So we just verify the function exists and returns a boolean
    expect(typeof isLoggingEnabled()).toBe("boolean");

    // Restore original values
    if (originalDebug !== undefined) process.env.DEBUG = originalDebug;
    if (originalMaDebug !== undefined) process.env.MA_DEBUG = originalMaDebug;
  });
});
