import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { startSpinner, stopSpinner, isSpinnerRunning } from "./spinner";

describe("spinner", () => {
  beforeEach(() => {
    // Ensure spinner is stopped before each test
    stopSpinner();
  });

  afterEach(() => {
    // Clean up after each test
    stopSpinner();
  });

  it("should not start on non-TTY", () => {
    // The test runner is not a TTY, so spinner should not start
    startSpinner("Test message");
    expect(isSpinnerRunning()).toBe(false);
  });

  it("should report not running when stopped", () => {
    expect(isSpinnerRunning()).toBe(false);
  });

  it("should handle multiple stopSpinner calls gracefully", () => {
    stopSpinner();
    stopSpinner();
    stopSpinner();
    expect(isSpinnerRunning()).toBe(false);
  });

  it("should export all required functions", () => {
    expect(typeof startSpinner).toBe("function");
    expect(typeof stopSpinner).toBe("function");
    expect(typeof isSpinnerRunning).toBe("function");
  });
});
