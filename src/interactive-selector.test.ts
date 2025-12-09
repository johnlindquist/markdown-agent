import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import { findAgentFiles, type AgentFile } from "./cli";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("findAgentFiles", () => {
  let testDir: string;
  let originalCwd: string;
  let originalPath: string;

  beforeEach(() => {
    // Create a temporary test directory
    testDir = join(tmpdir(), `ma-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    // Save original values
    originalCwd = process.cwd();
    originalPath = process.env.PATH || "";
  });

  afterEach(() => {
    // Restore original values
    process.chdir(originalCwd);
    process.env.PATH = originalPath;

    // Clean up test directory
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  test("finds .md files in current directory", async () => {
    // Create test files
    writeFileSync(join(testDir, "agent1.md"), "# Agent 1");
    writeFileSync(join(testDir, "agent2.md"), "# Agent 2");
    writeFileSync(join(testDir, "readme.txt"), "Not a markdown file");

    // Change to test directory
    process.chdir(testDir);

    // Clear PATH to only test cwd
    process.env.PATH = "";

    const files = await findAgentFiles();

    // Filter to only cwd files (ignoring ~/.mdflow files that may exist on user's system)
    const cwdFiles = files.filter(f => f.source === "cwd");
    expect(cwdFiles.length).toBe(2);
    expect(cwdFiles.map(f => f.name).sort()).toEqual(["agent1.md", "agent2.md"]);
  });

  test("finds .md files in PATH directories", async () => {
    // Create a PATH directory with md files
    const pathDir = join(testDir, "path-bin");
    mkdirSync(pathDir, { recursive: true });
    writeFileSync(join(pathDir, "global-agent.md"), "# Global Agent");

    // Change to a directory with no md files
    const emptyDir = join(testDir, "empty");
    mkdirSync(emptyDir, { recursive: true });
    process.chdir(emptyDir);

    // Set PATH to our test directory
    process.env.PATH = pathDir;

    const files = await findAgentFiles();

    // Filter to only PATH files (ignoring ~/.mdflow files that may exist)
    const pathFiles = files.filter(f => f.source === pathDir);
    expect(pathFiles.length).toBe(1);
    expect(pathFiles[0].name).toBe("global-agent.md");
    expect(pathFiles[0].source).toBe(pathDir);
  });

  test("deduplicates files that appear in both cwd and PATH", async () => {
    // Create a directory that's both cwd and in PATH
    writeFileSync(join(testDir, "shared-agent.md"), "# Shared Agent");

    process.chdir(testDir);
    process.env.PATH = testDir; // Same directory is in PATH

    const files = await findAgentFiles();

    // Filter to files from cwd or PATH only (ignoring ~/.mdflow files)
    const relevantFiles = files.filter(f => f.source === "cwd" || f.source === testDir);

    // Should only appear once (from cwd, since we scan that first)
    expect(relevantFiles.length).toBe(1);
    expect(relevantFiles[0].name).toBe("shared-agent.md");
    expect(relevantFiles[0].source).toBe("cwd");
  });

  test("returns empty array when no .md files exist in cwd or PATH", async () => {
    // Empty directory
    const emptyDir = join(testDir, "empty");
    mkdirSync(emptyDir, { recursive: true });

    process.chdir(emptyDir);
    process.env.PATH = "";

    const files = await findAgentFiles();

    // Filter out ~/.mdflow and .mdflow files - test only checks cwd and PATH are empty
    const cwdOrPathFiles = files.filter(f => f.source === "cwd");
    expect(cwdOrPathFiles).toEqual([]);
  });

  test("handles non-existent PATH directories gracefully", async () => {
    const emptyDir = join(testDir, "empty");
    mkdirSync(emptyDir, { recursive: true });

    process.chdir(emptyDir);
    // PATH contains non-existent directories
    process.env.PATH = "/nonexistent/dir1:/nonexistent/dir2";

    // Should not throw
    const files = await findAgentFiles();
    // Filter out ~/.mdflow and .mdflow files - test only checks non-existent PATH is handled
    const cwdOrPathFiles = files.filter(f => f.source === "cwd");
    expect(cwdOrPathFiles).toEqual([]);
  });

  test("combines files from cwd and multiple PATH directories", async () => {
    // Create cwd with file
    const cwdDir = join(testDir, "cwd");
    mkdirSync(cwdDir, { recursive: true });
    writeFileSync(join(cwdDir, "local.md"), "# Local");

    // Create two PATH directories
    const pathDir1 = join(testDir, "path1");
    const pathDir2 = join(testDir, "path2");
    mkdirSync(pathDir1, { recursive: true });
    mkdirSync(pathDir2, { recursive: true });
    writeFileSync(join(pathDir1, "global1.md"), "# Global 1");
    writeFileSync(join(pathDir2, "global2.md"), "# Global 2");

    process.chdir(cwdDir);
    process.env.PATH = `${pathDir1}:${pathDir2}`;

    const files = await findAgentFiles();

    // Filter to only cwd and our test PATH directories (ignoring ~/.mdflow files)
    const relevantFiles = files.filter(f =>
      f.source === "cwd" || f.source === pathDir1 || f.source === pathDir2
    );

    expect(relevantFiles.length).toBe(3);
    expect(relevantFiles.map(f => f.name).sort()).toEqual(["global1.md", "global2.md", "local.md"]);

    // Verify sources
    const localFile = relevantFiles.find(f => f.name === "local.md");
    const global1File = relevantFiles.find(f => f.name === "global1.md");
    const global2File = relevantFiles.find(f => f.name === "global2.md");

    expect(localFile?.source).toBe("cwd");
    expect(global1File?.source).toBe(pathDir1);
    expect(global2File?.source).toBe(pathDir2);
  });

  test("handles empty PATH entries", async () => {
    writeFileSync(join(testDir, "agent.md"), "# Agent");

    process.chdir(testDir);
    // PATH with empty entries (common in some shells)
    process.env.PATH = ":/usr/bin::";

    // Should not throw
    const files = await findAgentFiles();
    // Filter to only cwd files (ignoring ~/.mdflow files)
    const cwdFiles = files.filter(f => f.source === "cwd");
    expect(cwdFiles.length).toBe(1);
    expect(cwdFiles[0].name).toBe("agent.md");
  });
});

describe("AgentFile interface", () => {
  test("has correct shape", () => {
    const file: AgentFile = {
      name: "test.md",
      path: "/full/path/to/test.md",
      source: "cwd",
    };

    expect(file.name).toBe("test.md");
    expect(file.path).toBe("/full/path/to/test.md");
    expect(file.source).toBe("cwd");
  });
});
