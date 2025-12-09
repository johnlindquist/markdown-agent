import { expect, test, describe, beforeAll, afterAll } from "bun:test";
import { spawn } from "bun";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { join, resolve } from "path";
import { tmpdir } from "os";

// Get the project root directory for absolute imports
const PROJECT_ROOT = resolve(import.meta.dir, "..");

/**
 * Tests for sanitized output streams
 *
 * Ensures all system/status messages go to stderr,
 * keeping stdout exclusively for agent output.
 * This enables clean piping like: git diff | md review.md > review.txt
 */

describe("Output Stream Separation", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "md-streams-test-"));
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("remote.ts status messages", () => {
    test("fetchRemote outputs status to stderr, not stdout", async () => {
      // Create a test script that imports and calls fetchRemote with absolute path
      const testScript = `
        import { fetchRemote } from "${PROJECT_ROOT}/src/remote";

        // Capture and test a valid URL fetch
        const result = await fetchRemote("https://raw.githubusercontent.com/johnlindquist/kit/main/README.md");

        // Output result to stdout so we can verify it
        console.log(JSON.stringify({ success: result.success, isRemote: result.isRemote }));
      `;

      const scriptPath = join(tempDir, "test-remote.ts");
      await writeFile(scriptPath, testScript);

      const proc = spawn({
        cmd: ["bun", "run", scriptPath],
        cwd: PROJECT_ROOT,
        stdout: "pipe",
        stderr: "pipe",
      });

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      await proc.exited;

      // Stderr should contain "Fetching:" and "Saved to:" status messages
      expect(stderr).toContain("Fetching:");
      expect(stderr).toContain("Saved to:");

      // Stdout should only contain our JSON result, not status messages
      expect(stdout).not.toContain("Fetching:");
      expect(stdout).not.toContain("Saved to:");

      // Verify we got valid JSON output
      const result = JSON.parse(stdout.trim());
      expect(result.success).toBe(true);
      expect(result.isRemote).toBe(true);
    });

    test("local files produce no status output", async () => {
      const testScript = `
        import { fetchRemote } from "${PROJECT_ROOT}/src/remote";

        const result = await fetchRemote("./src/remote.ts");
        console.log(JSON.stringify({ success: result.success, isRemote: result.isRemote }));
      `;

      const scriptPath = join(tempDir, "test-local.ts");
      await writeFile(scriptPath, testScript);

      const proc = spawn({
        cmd: ["bun", "run", scriptPath],
        cwd: PROJECT_ROOT,
        stdout: "pipe",
        stderr: "pipe",
      });

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      await proc.exited;

      // No status messages for local files
      expect(stderr).not.toContain("Fetching:");
      expect(stderr).not.toContain("Saved to:");

      const result = JSON.parse(stdout.trim());
      expect(result.success).toBe(true);
      expect(result.isRemote).toBe(false);
    });
  });

  describe("CLI commands output routing", () => {
    test("--help outputs to stdout (requested data)", async () => {
      const proc = spawn({
        cmd: ["bun", "run", `${PROJECT_ROOT}/src/index.ts`, "--help"],
        cwd: PROJECT_ROOT,
        stdout: "pipe",
        stderr: "pipe",
      });

      const stdout = await new Response(proc.stdout).text();
      await proc.exited;

      // Help text should be on stdout since user explicitly requested it
      expect(stdout).toContain("Usage: md");
      expect(stdout).toContain("Commands:");
    });

    test("'logs' subcommand outputs directory info to stdout", async () => {
      const proc = spawn({
        cmd: ["bun", "run", `${PROJECT_ROOT}/src/index.ts`, "logs"],
        cwd: PROJECT_ROOT,
        stdout: "pipe",
        stderr: "pipe",
      });

      const stdout = await new Response(proc.stdout).text();
      await proc.exited;

      // Log directory info should be on stdout since user explicitly requested it
      expect(stdout).toContain("Log directory:");
    });

    test("missing file error goes to stderr", async () => {
      const proc = spawn({
        cmd: ["bun", "run", `${PROJECT_ROOT}/src/index.ts`, "nonexistent-file.md"],
        cwd: PROJECT_ROOT,
        stdout: "pipe",
        stderr: "pipe",
      });

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      await proc.exited;

      // Error should be on stderr
      expect(stderr).toContain("File not found");
      // Stdout should be empty
      expect(stdout.trim()).toBe("");
    });

    test("usage error goes to stderr", async () => {
      const proc = spawn({
        cmd: ["bun", "run", `${PROJECT_ROOT}/src/index.ts`],
        cwd: PROJECT_ROOT,
        stdout: "pipe",
        stderr: "pipe",
      });

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      await proc.exited;

      // Usage error should be on stderr
      expect(stderr).toContain("Usage:");
      // Stdout should be empty for errors
      expect(stdout.trim()).toBe("");
    });
  });

  describe("Plain markdown file output", () => {
    test("plain markdown without command pattern outputs error to stderr", async () => {
      // Create a plain markdown file without frontmatter and without command pattern in name
      const mdContent = "# Hello World\n\nThis is plain markdown.";
      const mdPath = join(tempDir, "plain.md");
      await writeFile(mdPath, mdContent);

      const proc = spawn({
        cmd: ["bun", "run", `${PROJECT_ROOT}/src/index.ts`, mdPath],
        cwd: PROJECT_ROOT,
        stdout: "pipe",
        stderr: "pipe",
      });

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      await proc.exited;

      // Error should be on stderr (no command could be resolved)
      expect(stderr).toContain("No command specified");
      // Stdout should be empty for errors
      expect(stdout.trim()).toBe("");
    });
  });

  describe("Piping scenarios", () => {
    test("output can be cleanly redirected without status noise", async () => {
      // Create a simple echo agent that just outputs its body
      const agentContent = `---
model: test
---
Echo test content`;
      const agentPath = join(tempDir, "echo.md");
      await writeFile(agentPath, agentContent);

      // This would fail with an unknown command, but the important thing
      // is that any status messages before the command runs go to stderr
      const proc = spawn({
        cmd: ["bun", "run", `${PROJECT_ROOT}/src/index.ts`, agentPath],
        cwd: PROJECT_ROOT,
        stdout: "pipe",
        stderr: "pipe",
      });

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      await proc.exited;

      // Any md-specific status/error messages should be on stderr
      // stdout should only contain command output (or be empty if command fails early)
      // The key assertion: no "Fetching:", "Saved to:", "Resolving:", etc on stdout
      expect(stdout).not.toContain("Fetching:");
      expect(stdout).not.toContain("Saved to:");
    });
  });
});
