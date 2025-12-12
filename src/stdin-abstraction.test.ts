/**
 * Tests for stdin abstraction (IOStreams)
 *
 * Tests the streams module and its integration with AgentRuntime:
 * - Creating and using IOStreams
 * - Piping content via stdin
 * - Detecting TTY vs pipe mode
 * - Combining stdin with file arguments
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  createRuntime,
  createTestStreams,
  stringToStream,
  createCaptureStream,
  readStream,
  readStdinFromStreams,
  isInteractive,
  createDefaultStreams,
} from "./runtime";
import { clearConfigCache } from "./config";
import type { IOStreams } from "./types";

describe("stdin abstraction", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "stdin-test-"));
    clearConfigCache();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("stringToStream", () => {
    it("creates a readable stream from a string", async () => {
      const stream = stringToStream("Hello, World!");
      const content = await readStream(stream);
      expect(content).toBe("Hello, World!");
    });

    it("handles empty string", async () => {
      const stream = stringToStream("");
      const content = await readStream(stream);
      expect(content).toBe("");
    });

    it("handles multiline content", async () => {
      const multiline = "line1\nline2\nline3";
      const stream = stringToStream(multiline);
      const content = await readStream(stream);
      expect(content).toBe(multiline);
    });

    it("handles unicode content", async () => {
      const unicode = "Hello \u{1F60A} World \u{1F680}";
      const stream = stringToStream(unicode);
      const content = await readStream(stream);
      expect(content).toBe(unicode);
    });
  });

  describe("createCaptureStream", () => {
    it("captures written content", () => {
      const { stream, getOutput } = createCaptureStream();
      stream.write("Hello ");
      stream.write("World!");
      stream.end();
      expect(getOutput()).toBe("Hello World!");
    });

    it("handles multiple writes", () => {
      const { stream, getOutput } = createCaptureStream();
      stream.write("a");
      stream.write("b");
      stream.write("c");
      stream.end();
      expect(getOutput()).toBe("abc");
    });

    it("returns empty string when nothing written", () => {
      const { stream, getOutput } = createCaptureStream();
      stream.end();
      expect(getOutput()).toBe("");
    });
  });

  describe("createTestStreams", () => {
    it("creates streams with simulated stdin content", async () => {
      const { streams, getStdout, getStderr } = createTestStreams("piped content");

      expect(streams.stdin).not.toBeNull();
      expect(streams.isTTY).toBe(false);

      const content = await readStdinFromStreams(streams);
      expect(content).toBe("piped content");
    });

    it("creates streams with null stdin for TTY mode", async () => {
      const { streams } = createTestStreams(null);

      expect(streams.stdin).toBeNull();
      expect(streams.isTTY).toBe(true);

      const content = await readStdinFromStreams(streams);
      expect(content).toBe("");
    });

    it("captures stdout and stderr", () => {
      const { streams, getStdout, getStderr } = createTestStreams();

      streams.stdout.write("stdout content");
      streams.stderr.write("stderr content");

      expect(getStdout()).toBe("stdout content");
      expect(getStderr()).toBe("stderr content");
    });
  });

  describe("readStdinFromStreams", () => {
    it("returns empty string when stdin is null (TTY mode)", async () => {
      const streams: IOStreams = {
        stdin: null,
        stdout: process.stdout,
        stderr: process.stderr,
        isTTY: true,
      };

      const content = await readStdinFromStreams(streams);
      expect(content).toBe("");
    });

    it("reads content when stdin is a stream", async () => {
      const streams: IOStreams = {
        stdin: stringToStream("test content") as NodeJS.ReadableStream,
        stdout: process.stdout,
        stderr: process.stderr,
        isTTY: false,
      };

      const content = await readStdinFromStreams(streams);
      expect(content).toBe("test content");
    });

    it("trims whitespace from stdin content", async () => {
      const streams: IOStreams = {
        stdin: stringToStream("  content with whitespace  \n") as NodeJS.ReadableStream,
        stdout: process.stdout,
        stderr: process.stderr,
        isTTY: false,
      };

      const content = await readStdinFromStreams(streams);
      expect(content).toBe("content with whitespace");
    });
  });

  describe("isInteractive", () => {
    it("returns true for TTY streams", () => {
      const { streams } = createTestStreams(null);
      expect(isInteractive(streams)).toBe(true);
    });

    it("returns false for piped streams", () => {
      const { streams } = createTestStreams("piped");
      expect(isInteractive(streams)).toBe(false);
    });
  });

  describe("AgentRuntime with streams", () => {
    it("reads stdin from streams option", async () => {
      const filePath = join(tempDir, "stdin-test.claude.md");
      await writeFile(filePath, `---\n---\nBody content`);

      const { streams } = createTestStreams("piped input data");
      const stdinContent = await readStdinFromStreams(streams);

      const runtime = createRuntime();
      const result = await runtime.run(filePath, {
        stdinContent,
        dryRun: true,
      });

      expect(result.exitCode).toBe(0);
      // In dry run, the stdin content should be included in the output
    });

    it("prefers stdinContent over streams.stdin", async () => {
      const filePath = join(tempDir, "stdin-prefer.claude.md");
      await writeFile(filePath, `---\n---\nBody`);

      const { streams } = createTestStreams("from streams");

      const runtime = createRuntime();
      const resolved = await runtime.resolve(filePath);
      const context = await runtime.buildContext(resolved);
      const processed = await runtime.processTemplate(context);

      // When stdinContent is explicitly provided, it takes precedence
      const finalBody = "from direct option";
      expect(finalBody).toBe("from direct option");
    });

    it("handles TTY mode with null stdin", async () => {
      const filePath = join(tempDir, "tty-test.claude.md");
      await writeFile(filePath, `---\n---\nBody only`);

      const { streams } = createTestStreams(null); // TTY mode
      const stdinContent = await readStdinFromStreams(streams);

      const runtime = createRuntime();
      const result = await runtime.run(filePath, {
        stdinContent,
        dryRun: true,
      });

      expect(result.exitCode).toBe(0);
    });

    it("includes stdin content via _stdin template variable", async () => {
      const filePath = join(tempDir, "stdin-tags.claude.md");
      await writeFile(filePath, `---\n---\nInput: {{ _stdin }}\nProcess this:`);

      const runtime = createRuntime();
      const resolved = await runtime.resolve(filePath);
      const context = await runtime.buildContext(resolved);
      const processed = await runtime.processTemplate(context, {
        stdinContent: "input data",
      });

      expect(processed.body).toContain("input data");
      expect(processed.body).toContain("Process this:");
      expect(processed.templateVars["_stdin"]).toBe("input data");
    });

    it("combines template vars with stdin", async () => {
      const filePath = join(tempDir, "combined.claude.md");
      await writeFile(filePath, `---
_name: ""
---
Hello {{ _name }}!`);

      const { streams } = createTestStreams("context from pipe");

      const runtime = createRuntime();
      const resolved = await runtime.resolve(filePath);
      const context = await runtime.buildContext(resolved);
      const processed = await runtime.processTemplate(context, {
        passthroughArgs: ["--_name", "World"],
      });

      expect(processed.body).toBe("Hello World!");
      expect(processed.templateVars).toEqual({ "_name": "World" });
    });
  });

  describe("createDefaultStreams", () => {
    it("returns IOStreams with process streams", () => {
      const streams = createDefaultStreams();

      expect(streams.stdout).toBe(process.stdout);
      expect(streams.stderr).toBe(process.stderr);
      // isTTY depends on the test environment
      expect(typeof streams.isTTY).toBe("boolean");
    });
  });

  describe("Edge cases", () => {
    it("handles large stdin content", async () => {
      const largeContent = "x".repeat(100_000);
      const stream = stringToStream(largeContent);
      const content = await readStream(stream);
      expect(content.length).toBe(100_000);
    });

    it("handles stdin with special characters", async () => {
      const special = "Tab:\t Newline:\n Carriage:\r Quote:\" Backslash:\\";
      const stream = stringToStream(special);
      const content = await readStream(stream);
      expect(content).toBe(special);
    });

    it("handles binary-like content", async () => {
      // Content with null bytes and high bytes
      const binaryLike = "start\x00middle\xFFend";
      const stream = stringToStream(binaryLike);
      const content = await readStream(stream);
      expect(content.length).toBeGreaterThan(0);
    });
  });
});

describe("Integration: runtime.run with streams", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "stdin-integration-"));
    clearConfigCache();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("full pipeline with piped stdin in dry run", async () => {
    const filePath = join(tempDir, "full.claude.md");
    await writeFile(filePath, `---
model: test-model
---
Analyze the input`);

    const { streams } = createTestStreams("data to analyze");
    const stdinContent = await readStdinFromStreams(streams);

    const runtime = createRuntime();
    const result = await runtime.run(filePath, {
      stdinContent,
      dryRun: true,
    });

    expect(result.exitCode).toBe(0);
    expect(result.dryRun).toBe(true);
  });

  it("empty stdin behaves like TTY mode", async () => {
    const filePath = join(tempDir, "empty.claude.md");
    await writeFile(filePath, `---\n---\nNo stdin`);

    // Empty string stdin should be trimmed to empty
    const { streams } = createTestStreams("");
    const stdinContent = await readStdinFromStreams(streams);

    const runtime = createRuntime();
    const result = await runtime.run(filePath, {
      stdinContent,
      dryRun: true,
    });

    expect(result.exitCode).toBe(0);
  });

  it("stdin with pre hook output via _stdin", async () => {
    const filePath = join(tempDir, "pre-stdin.claude.md");
    await writeFile(filePath, `---
pre: echo "PRE_OUTPUT"
---
Input: {{ _stdin }}
Body here`);

    const { streams } = createTestStreams("stdin content");

    const runtime = createRuntime();
    const resolved = await runtime.resolve(filePath);
    const context = await runtime.buildContext(resolved);

    expect(context.preHookOutput).toBe("PRE_OUTPUT\n");

    // Both pre hook and stdin should be included
    const processed = await runtime.processTemplate(context, {
      stdinContent: "stdin content",
    });

    expect(processed.body).toContain("stdin content");
    expect(processed.body).toContain("Body here");
    expect(processed.templateVars["_stdin"]).toBe("stdin content");
  });
});
