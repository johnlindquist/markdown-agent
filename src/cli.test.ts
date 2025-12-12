import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import { parseCliArgs, findAgentFiles, getProjectAgentsDir, getUserAgentsDir } from "./cli";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

describe("parseCliArgs", () => {
  test("extracts file path", () => {
    const result = parseCliArgs(["node", "script", "DEMO.md"]);
    expect(result.filePath).toBe("DEMO.md");
    expect(result.passthroughArgs).toEqual([]);
  });

  test("all flags pass through when file is provided", () => {
    const result = parseCliArgs([
      "node", "script", "DEMO.md",
      "-p", "print mode",
      "--model", "opus",
      "--verbose"
    ]);
    expect(result.filePath).toBe("DEMO.md");
    expect(result.passthroughArgs).toEqual(["-p", "print mode", "--model", "opus", "--verbose"]);
  });

  test("--help works when no file provided", () => {
    const result = parseCliArgs(["node", "script", "--help"]);
    expect(result.filePath).toBe("");
    expect(result.help).toBe(true);
  });

  test("subcommands are treated as filePath (handled by index.ts)", () => {
    // setup, logs, create are subcommands - they appear as filePath
    // and are intercepted by index.ts before being treated as files
    const setupResult = parseCliArgs(["node", "script", "setup"]);
    expect(setupResult.filePath).toBe("setup");

    const logsResult = parseCliArgs(["node", "script", "logs"]);
    expect(logsResult.filePath).toBe("logs");

    const createResult = parseCliArgs(["node", "script", "create", "-g"]);
    expect(createResult.filePath).toBe("create");
    expect(createResult.passthroughArgs).toEqual(["-g"]);
  });

  test("md flags pass through when file is provided", () => {
    const result = parseCliArgs(["node", "script", "DEMO.md", "--help", "--model", "opus"]);
    expect(result.filePath).toBe("DEMO.md");
    expect(result.help).toBe(false);
    expect(result.passthroughArgs).toEqual(["--help", "--model", "opus"]);
  });
});

describe("agent directory paths", () => {
  test("getProjectAgentsDir returns .mdflow in cwd", () => {
    const dir = getProjectAgentsDir();
    expect(dir).toBe(join(process.cwd(), ".mdflow"));
  });

  test("getUserAgentsDir returns ~/.mdflow", () => {
    const dir = getUserAgentsDir();
    expect(dir).toBe(join(homedir(), ".mdflow"));
  });
});

describe("findAgentFiles", () => {
  const testProjectDir = join(process.cwd(), ".mdflow-test");
  const testUserDir = join(homedir(), ".mdflow-test-user");

  beforeEach(() => {
    // Create test directories
    if (!existsSync(testProjectDir)) {
      mkdirSync(testProjectDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Cleanup test directories
    if (existsSync(testProjectDir)) {
      rmSync(testProjectDir, { recursive: true, force: true });
    }
  });

  test("finds files from current directory", async () => {
    const files = await findAgentFiles();
    // Should find .md files in cwd (like CLAUDE.md, README.md, etc.)
    const cwdFiles = files.filter(f => f.source === "cwd");
    expect(cwdFiles.length).toBeGreaterThan(0);
  });

  test("finds files from .mdflow/ directory when present", async () => {
    // Create a test .mdflow directory with a file
    const mdflowDir = join(process.cwd(), ".mdflow");
    const testFile = join(mdflowDir, "test-agent.claude.md");

    try {
      mkdirSync(mdflowDir, { recursive: true });
      writeFileSync(testFile, "---\nmodel: opus\n---\nTest agent");

      const files = await findAgentFiles();
      const mdflowFiles = files.filter(f => f.source === ".mdflow");

      expect(mdflowFiles.length).toBeGreaterThan(0);
      expect(mdflowFiles.some(f => f.name === "test-agent.claude.md")).toBe(true);
    } finally {
      // Cleanup
      if (existsSync(testFile)) rmSync(testFile);
      if (existsSync(mdflowDir)) rmSync(mdflowDir, { recursive: true, force: true });
    }
  });

  test("deduplicates files by normalized path", async () => {
    const files = await findAgentFiles();
    const paths = files.map(f => f.path);
    const uniquePaths = new Set(paths);
    expect(paths.length).toBe(uniquePaths.size);
  });

  test("returns files with correct structure", async () => {
    const files = await findAgentFiles();
    if (files.length > 0) {
      const file = files[0]!;
      expect(file).toHaveProperty("name");
      expect(file).toHaveProperty("path");
      expect(file).toHaveProperty("source");
      expect(typeof file.name).toBe("string");
      expect(typeof file.path).toBe("string");
      expect(typeof file.source).toBe("string");
    }
  });
});
