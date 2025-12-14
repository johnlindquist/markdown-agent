/**
 * Tests for ProcessManager - centralized process lifecycle management
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  ProcessManager,
  getProcessManager,
  getTimeoutConfig,
  DEFAULT_TIMEOUTS,
  TIMEOUT_ENV_VARS,
  withTimeout,
} from "./process-manager";

describe("ProcessManager", () => {
  beforeEach(() => {
    // Reset the singleton before each test
    ProcessManager.reset();
  });

  afterEach(() => {
    // Clean up after each test
    ProcessManager.reset();
  });

  describe("singleton behavior", () => {
    it("returns the same instance", () => {
      const pm1 = ProcessManager.getInstance();
      const pm2 = ProcessManager.getInstance();
      expect(pm1).toBe(pm2);
    });

    it("returns the same instance via getProcessManager()", () => {
      const pm1 = getProcessManager();
      const pm2 = getProcessManager();
      expect(pm1).toBe(pm2);
    });

    it("reset creates a new instance", () => {
      const pm1 = ProcessManager.getInstance();
      ProcessManager.reset();
      const pm2 = ProcessManager.getInstance();
      expect(pm1).not.toBe(pm2);
    });
  });

  describe("AbortController", () => {
    it("provides an abort signal", () => {
      const pm = getProcessManager();
      expect(pm.signal).toBeInstanceOf(AbortSignal);
    });

    it("isAborted is false initially", () => {
      const pm = getProcessManager();
      expect(pm.isAborted).toBe(false);
    });

    it("abort() sets isAborted to true", () => {
      const pm = getProcessManager();
      pm.abort();
      expect(pm.isAborted).toBe(true);
    });

    it("signal is aborted after abort()", () => {
      const pm = getProcessManager();
      pm.abort();
      expect(pm.signal.aborted).toBe(true);
    });
  });

  describe("process registration", () => {
    it("starts with zero active processes", () => {
      const pm = getProcessManager();
      expect(pm.activeCount).toBe(0);
    });

    it("can register and track a process", async () => {
      const pm = getProcessManager();

      // Spawn a simple process
      const proc = Bun.spawn(["echo", "test"], {
        stdout: "pipe",
        stderr: "pipe",
      });

      pm.register(proc, "test-echo");
      expect(pm.activeCount).toBe(1);

      // Wait for process to complete
      await proc.exited;

      // Should auto-unregister
      expect(pm.activeCount).toBe(0);
    });

    it("getActiveProcesses returns process info", async () => {
      const pm = getProcessManager();

      // Spawn a process that runs for a bit
      const proc = Bun.spawn(["sleep", "0.1"], {
        stdout: "pipe",
        stderr: "pipe",
      });

      pm.register(proc, "test-sleep");

      const active = pm.getActiveProcesses();
      expect(active.length).toBe(1);
      expect(active[0]?.label).toBe("test-sleep");
      expect(active[0]?.pid).toBe(proc.pid);
      expect(active[0]?.runningMs).toBeGreaterThanOrEqual(0);

      await proc.exited;
    });

    it("unregister removes a process", async () => {
      const pm = getProcessManager();

      const proc = Bun.spawn(["echo", "test"], {
        stdout: "pipe",
        stderr: "pipe",
      });

      pm.register(proc, "test");
      expect(pm.activeCount).toBe(1);

      pm.unregister(proc);
      expect(pm.activeCount).toBe(0);

      await proc.exited;
    });

    it("killAll kills all registered processes", async () => {
      const pm = getProcessManager();

      // Spawn a long-running process
      const proc = Bun.spawn(["sleep", "10"], {
        stdout: "pipe",
        stderr: "pipe",
      });

      pm.register(proc, "long-sleep");
      expect(pm.activeCount).toBe(1);

      const killed = pm.killAll();
      expect(killed).toBe(1);
      expect(pm.activeCount).toBe(0);

      // Process should exit with non-zero code due to being killed
      const exitCode = await proc.exited;
      expect(exitCode).not.toBe(0);
    });
  });

  describe("cursor state tracking", () => {
    it("tracks cursor hidden state", () => {
      const pm = getProcessManager();

      pm.setCursorHidden(true);
      // Can't directly test private field, but restoreTerminal should work

      pm.setCursorHidden(false);
      // No crash means success
    });
  });

  describe("cleanup callbacks", () => {
    it("can register and remove cleanup callbacks", () => {
      const pm = getProcessManager();
      let called = false;

      const callback = () => {
        called = true;
      };

      pm.onCleanup(callback);
      pm.offCleanup(callback);

      // Cleanup won't call the callback since it was removed
      pm.cleanup();
      expect(called).toBe(false);
    });
  });

  describe("timeout configuration", () => {
    it("has default timeouts", () => {
      const pm = getProcessManager();
      const timeouts = pm.timeouts;

      expect(timeouts.fetchTimeout).toBe(DEFAULT_TIMEOUTS.fetchTimeout);
      expect(timeouts.commandTimeout).toBe(DEFAULT_TIMEOUTS.commandTimeout);
      expect(timeouts.agentTimeout).toBe(DEFAULT_TIMEOUTS.agentTimeout);
    });

    it("setTimeouts updates configuration", () => {
      const pm = getProcessManager();

      pm.setTimeouts({ fetchTimeout: 5000 });

      const timeouts = pm.timeouts;
      expect(timeouts.fetchTimeout).toBe(5000);
      expect(timeouts.commandTimeout).toBe(DEFAULT_TIMEOUTS.commandTimeout);
    });

    it("returns a copy of timeouts (not mutable)", () => {
      const pm = getProcessManager();
      const timeouts = pm.timeouts;

      timeouts.fetchTimeout = 1;

      expect(pm.timeouts.fetchTimeout).toBe(DEFAULT_TIMEOUTS.fetchTimeout);
    });
  });
});

describe("getTimeoutConfig", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
  });

  it("returns defaults when no env vars set", () => {
    delete process.env[TIMEOUT_ENV_VARS.fetchTimeout];
    delete process.env[TIMEOUT_ENV_VARS.commandTimeout];
    delete process.env[TIMEOUT_ENV_VARS.agentTimeout];

    const config = getTimeoutConfig();
    expect(config.fetchTimeout).toBe(DEFAULT_TIMEOUTS.fetchTimeout);
    expect(config.commandTimeout).toBe(DEFAULT_TIMEOUTS.commandTimeout);
    expect(config.agentTimeout).toBe(DEFAULT_TIMEOUTS.agentTimeout);
  });

  it("respects MDFLOW_FETCH_TIMEOUT env var", () => {
    process.env[TIMEOUT_ENV_VARS.fetchTimeout] = "5000";

    const config = getTimeoutConfig();
    expect(config.fetchTimeout).toBe(5000);
  });

  it("respects MDFLOW_COMMAND_TIMEOUT env var", () => {
    process.env[TIMEOUT_ENV_VARS.commandTimeout] = "60000";

    const config = getTimeoutConfig();
    expect(config.commandTimeout).toBe(60000);
  });

  it("respects MDFLOW_AGENT_TIMEOUT env var", () => {
    process.env[TIMEOUT_ENV_VARS.agentTimeout] = "300000";

    const config = getTimeoutConfig();
    expect(config.agentTimeout).toBe(300000);
  });

  it("uses default for invalid env values", () => {
    process.env[TIMEOUT_ENV_VARS.fetchTimeout] = "invalid";

    const config = getTimeoutConfig();
    expect(config.fetchTimeout).toBe(DEFAULT_TIMEOUTS.fetchTimeout);
  });

  it("uses default for negative env values", () => {
    process.env[TIMEOUT_ENV_VARS.fetchTimeout] = "-1000";

    const config = getTimeoutConfig();
    expect(config.fetchTimeout).toBe(DEFAULT_TIMEOUTS.fetchTimeout);
  });
});

describe("withTimeout", () => {
  beforeEach(() => {
    ProcessManager.reset();
  });

  afterEach(() => {
    ProcessManager.reset();
  });

  it("returns promise result if within timeout", async () => {
    const result = await withTimeout(
      Promise.resolve("success"),
      1000,
      "Timed out"
    );
    expect(result).toBe("success");
  });

  it("throws on timeout", async () => {
    const slowPromise = new Promise((resolve) => setTimeout(resolve, 500));

    await expect(
      withTimeout(slowPromise, 50, "Operation timed out")
    ).rejects.toThrow("Operation timed out");
  });

  it("no timeout when ms is 0", async () => {
    const result = await withTimeout(
      Promise.resolve("success"),
      0,
      "Should not timeout"
    );
    expect(result).toBe("success");
  });

  it("throws on abort", async () => {
    const pm = getProcessManager();
    const slowPromise = new Promise((resolve) => setTimeout(resolve, 1000));

    // Abort after a short delay
    setTimeout(() => pm.abort(), 50);

    await expect(
      withTimeout(slowPromise, 5000, "Timed out")
    ).rejects.toThrow("Operation cancelled");
  });
});
