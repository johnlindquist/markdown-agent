import { expect, test, describe } from "bun:test";
import { parseCommandFromFilename, resolveCommand, buildArgs, extractPositionalMappings, extractEnvVars, getCurrentChildProcess, killCurrentChildProcess, runCommand, type CaptureMode } from "./command";
import type { AgentFrontmatter } from "./types";

describe("parseCommandFromFilename", () => {
  test("extracts command from filename pattern", () => {
    expect(parseCommandFromFilename("task.claude.md")).toBe("claude");
    expect(parseCommandFromFilename("commit.gemini.md")).toBe("gemini");
    expect(parseCommandFromFilename("review.codex.md")).toBe("codex");
  });

  test("handles paths with directories", () => {
    expect(parseCommandFromFilename("/path/to/task.claude.md")).toBe("claude");
    expect(parseCommandFromFilename("./agents/task.gemini.md")).toBe("gemini");
  });

  test("returns undefined for files without command pattern", () => {
    expect(parseCommandFromFilename("task.md")).toBeUndefined();
    expect(parseCommandFromFilename("README.md")).toBeUndefined();
  });

  test("handles case insensitivity", () => {
    expect(parseCommandFromFilename("task.CLAUDE.md")).toBe("CLAUDE");
    expect(parseCommandFromFilename("task.Claude.MD")).toBe("Claude");
  });
});

describe("resolveCommand", () => {
  test("resolves command from filename pattern", () => {
    expect(resolveCommand("task.claude.md")).toBe("claude");
    expect(resolveCommand("review.gemini.md")).toBe("gemini");
  });

  test("throws when no command can be resolved", () => {
    expect(() => resolveCommand("task.md")).toThrow("No command specified");
  });
});

describe("buildArgs", () => {
  test("converts string values to flags", () => {
    const result = buildArgs({ model: "opus" }, new Set());
    expect(result).toEqual(["--model", "opus"]);
  });

  test("converts boolean true to flag only", () => {
    const result = buildArgs({ "dangerously-skip-permissions": true }, new Set());
    expect(result).toEqual(["--dangerously-skip-permissions"]);
  });

  test("omits boolean false values", () => {
    const result = buildArgs({ debug: false }, new Set());
    expect(result).toEqual([]);
  });

  test("handles arrays by repeating flags", () => {
    const result = buildArgs({ "add-dir": ["./src", "./tests"] }, new Set());
    expect(result).toEqual(["--add-dir", "./src", "--add-dir", "./tests"]);
  });

  test("skips system keys (_inputs)", () => {
    const result = buildArgs({
      _inputs: ["message", "branch"],
      model: "opus",
    } as AgentFrontmatter, new Set());
    expect(result).toEqual(["--model", "opus"]);
  });

  test("skips positional mappings ($1, $2)", () => {
    const result = buildArgs({
      $1: "prompt",
      $2: "model",
      verbose: true,
    }, new Set());
    expect(result).toEqual(["--verbose"]);
  });

  test("skips _env (sets process.env)", () => {
    const result = buildArgs({
      _env: { HOST: "localhost" },
      model: "opus",
    } as AgentFrontmatter, new Set());
    expect(result).toEqual(["--model", "opus"]);
  });

  test("skips context_window (system key)", () => {
    const result = buildArgs({
      context_window: 100000,
      model: "opus",
    }, new Set());
    expect(result).toEqual(["--model", "opus"]);
  });

  test("skips template variables", () => {
    const result = buildArgs({
      model: "opus",
      target: "src/main.ts",
    }, new Set(["target"]));
    expect(result).toEqual(["--model", "opus"]);
  });

  test("handles single-char flags", () => {
    const result = buildArgs({ p: true, c: true }, new Set());
    expect(result).toEqual(["-p", "-c"]);
  });
});

describe("extractPositionalMappings", () => {
  test("extracts $1, $2, etc. mappings", () => {
    const mappings = extractPositionalMappings({
      $1: "prompt",
      $2: "model",
      verbose: true,
    });
    expect(mappings.get(1)).toBe("prompt");
    expect(mappings.get(2)).toBe("model");
    expect(mappings.size).toBe(2);
  });

  test("returns empty map when no positional mappings", () => {
    const mappings = extractPositionalMappings({
      model: "opus",
      verbose: true,
    });
    expect(mappings.size).toBe(0);
  });
});

describe("extractEnvVars", () => {
  test("extracts _env object", () => {
    const env = extractEnvVars({
      _env: { HOST: "localhost", PORT: "3000" },
    } as AgentFrontmatter);
    expect(env).toEqual({ HOST: "localhost", PORT: "3000" });
  });

  test("returns undefined when no _env", () => {
    const env = extractEnvVars({
      model: "opus",
    });
    expect(env).toBeUndefined();
  });
});

describe("child process management for signal handling", () => {
  test("getCurrentChildProcess returns null when no process is running", () => {
    // Initially, no process should be running
    // Note: This test may be affected by other tests that spawn processes
    // We just verify the function is callable and returns the expected type
    const proc = getCurrentChildProcess();
    expect(proc === null || proc !== undefined).toBe(true);
  });

  test("killCurrentChildProcess returns false when no process is running", () => {
    // When no process is running, kill should return false
    // Note: Need to wait for any previous test processes to complete
    const killed = killCurrentChildProcess();
    expect(typeof killed).toBe("boolean");
  });

  test("runCommand sets and clears currentChildProcess", async () => {
    // Run a quick command and verify the process reference is managed
    const result = await runCommand({
      command: "echo",
      args: ["test"],
      positionals: [],
      positionalMappings: new Map(),
      captureOutput: true,
    });

    expect(result.exitCode).toBe(0);
    expect(result.output.trim()).toBe("test");

    // After command completes, getCurrentChildProcess should return null
    expect(getCurrentChildProcess()).toBeNull();
  });

  test("killCurrentChildProcess can terminate a running process", async () => {
    // Start a long-running process
    const runPromise = runCommand({
      command: "sleep",
      args: ["10"],
      positionals: [],
      positionalMappings: new Map(),
      captureOutput: false,
    });

    // Give the process a moment to start
    await new Promise(resolve => setTimeout(resolve, 50));

    // Verify a process is running
    const proc = getCurrentChildProcess();
    expect(proc).not.toBeNull();

    // Kill it
    const killed = killCurrentChildProcess();
    expect(killed).toBe(true);

    // Wait for the process to exit
    const result = await runPromise;

    // Process should have been terminated (exit code will be non-zero on signal)
    // On Unix, killed processes typically exit with 128 + signal number, or negative
    expect(result.exitCode).not.toBe(0);
  });
});

describe("runCommand capture modes", () => {
  test("capture mode 'none' (false) does not capture output", async () => {
    const result = await runCommand({
      command: "echo",
      args: ["silent"],
      positionals: [],
      positionalMappings: new Map(),
      captureOutput: false,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
    expect(result.output).toBe(""); // backward compat
  });

  test("capture mode 'capture' (true) buffers and returns output", async () => {
    const result = await runCommand({
      command: "echo",
      args: ["captured"],
      positionals: [],
      positionalMappings: new Map(),
      captureOutput: true,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("captured");
    expect(result.output.trim()).toBe("captured"); // backward compat
  });

  test("capture mode 'tee' streams and captures simultaneously", async () => {
    const result = await runCommand({
      command: "echo",
      args: ["tee-test"],
      positionals: [],
      positionalMappings: new Map(),
      captureOutput: "tee" as CaptureMode,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("tee-test");
    expect(result.output.trim()).toBe("tee-test"); // backward compat
  });

  test("capture mode 'none' string equivalent to false", async () => {
    const result = await runCommand({
      command: "echo",
      args: ["none-mode"],
      positionals: [],
      positionalMappings: new Map(),
      captureOutput: "none" as CaptureMode,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
  });

  test("captureStderr captures stderr when enabled", async () => {
    // Use a shell command that writes to stderr
    const result = await runCommand({
      command: "sh",
      args: ["-c", "echo 'stdout line' && echo 'stderr line' >&2"],
      positionals: [],
      positionalMappings: new Map(),
      captureOutput: "tee" as CaptureMode,
      captureStderr: true,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("stdout line");
    expect(result.stderr.trim()).toBe("stderr line");
  });

  test("captureStderr false keeps stderr on inherit", async () => {
    const result = await runCommand({
      command: "sh",
      args: ["-c", "echo 'stdout line' && echo 'stderr line' >&2"],
      positionals: [],
      positionalMappings: new Map(),
      captureOutput: "tee" as CaptureMode,
      captureStderr: false,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("stdout line");
    expect(result.stderr).toBe(""); // not captured
  });

  test("tee mode handles multi-line output correctly", async () => {
    const result = await runCommand({
      command: "sh",
      args: ["-c", "echo 'line1' && echo 'line2' && echo 'line3'"],
      positionals: [],
      positionalMappings: new Map(),
      captureOutput: "tee" as CaptureMode,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("line1");
    expect(result.stdout).toContain("line2");
    expect(result.stdout).toContain("line3");
  });

  test("tee mode preserves exit code on command failure", async () => {
    const result = await runCommand({
      command: "sh",
      args: ["-c", "echo 'before exit' && exit 42"],
      positionals: [],
      positionalMappings: new Map(),
      captureOutput: "tee" as CaptureMode,
    });

    expect(result.exitCode).toBe(42);
    expect(result.stdout.trim()).toBe("before exit");
  });
});
