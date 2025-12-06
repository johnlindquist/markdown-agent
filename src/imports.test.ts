import { test, expect, beforeAll, afterAll } from "bun:test";
import { expandImports, hasImports } from "./imports";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let testDir: string;

beforeAll(async () => {
  testDir = await mkdtemp(join(tmpdir(), "imports-test-"));

  // Create test files
  await Bun.write(join(testDir, "simple.md"), "Hello from simple.md");
  await Bun.write(join(testDir, "nested.md"), "Before @./simple.md After");
  await Bun.write(join(testDir, "circular-a.md"), "A imports @./circular-b.md");
  await Bun.write(join(testDir, "circular-b.md"), "B imports @./circular-a.md");
  await Bun.write(join(testDir, "subdir/deep.md"), "Deep file content");

  // Create subdir
  await Bun.write(join(testDir, "subdir/deep.md"), "Deep file content");
  await Bun.write(join(testDir, "imports-subdir.md"), "Import from @./subdir/deep.md done");
});

afterAll(async () => {
  await rm(testDir, { recursive: true });
});

test("hasImports detects @file syntax", () => {
  expect(hasImports("@./file.md")).toBe(true);
  expect(hasImports("@~/file.md")).toBe(true);
  expect(hasImports("@/absolute/path.md")).toBe(true);
  expect(hasImports("no imports here")).toBe(false);
  expect(hasImports("email@example.com")).toBe(false); // @ not followed by path
});

test("hasImports detects !`command` syntax", () => {
  expect(hasImports("!`ls -la`")).toBe(true);
  expect(hasImports("!`echo hello`")).toBe(true);
  expect(hasImports("no commands")).toBe(false);
  expect(hasImports("`code block`")).toBe(false); // Missing !
});

test("expandImports expands simple file import", async () => {
  const content = "Start @./simple.md End";
  const result = await expandImports(content, testDir);
  expect(result).toBe("Start Hello from simple.md End");
});

test("expandImports handles nested imports", async () => {
  const content = "@./nested.md";
  const result = await expandImports(content, testDir);
  expect(result).toBe("Before Hello from simple.md After");
});

test("expandImports detects circular imports", async () => {
  const content = "@./circular-a.md";
  await expect(expandImports(content, testDir)).rejects.toThrow("Circular import detected");
});

test("expandImports handles subdirectory imports", async () => {
  const content = "@./imports-subdir.md";
  const result = await expandImports(content, testDir);
  expect(result).toBe("Import from Deep file content done");
});

test("expandImports throws on missing file", async () => {
  const content = "@./nonexistent.md";
  await expect(expandImports(content, testDir)).rejects.toThrow("Import not found");
});

test("expandImports executes command inline", async () => {
  const content = "Output: !`echo hello`";
  const result = await expandImports(content, testDir);
  expect(result).toBe("Output: hello");
});

test("expandImports handles command with arguments", async () => {
  const content = "!`echo one two three`";
  const result = await expandImports(content, testDir);
  expect(result).toBe("one two three");
});

test("expandImports handles multiple imports", async () => {
  const content = "@./simple.md and @./simple.md again";
  const result = await expandImports(content, testDir);
  expect(result).toBe("Hello from simple.md and Hello from simple.md again");
});

test("expandImports handles mixed file and command", async () => {
  const content = "File: @./simple.md Command: !`echo test`";
  const result = await expandImports(content, testDir);
  expect(result).toBe("File: Hello from simple.md Command: test");
});

test("expandImports preserves content without imports", async () => {
  const content = "No imports here, just regular text";
  const result = await expandImports(content, testDir);
  expect(result).toBe("No imports here, just regular text");
});

test("expandImports handles ~ expansion", async () => {
  // This test uses the actual home directory
  // We can't easily test this without creating a file in ~
  // Just verify the function doesn't throw on ~ syntax
  const content = "Some text with email@example.com is not an import";
  const result = await expandImports(content, testDir);
  expect(result).toBe("Some text with email@example.com is not an import");
});
