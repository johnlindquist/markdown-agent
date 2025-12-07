import { test, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { loadEnvFiles, getEnvFilesInDirectory } from "./env";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let testDir: string;
let originalEnv: Record<string, string | undefined>;

beforeAll(async () => {
  testDir = await mkdtemp(join(tmpdir(), "env-test-"));
});

afterAll(async () => {
  await rm(testDir, { recursive: true });
});

beforeEach(() => {
  // Save original env
  originalEnv = { ...process.env };
});

afterEach(() => {
  // Restore original env
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value !== undefined) {
      process.env[key] = value;
    }
  }
});

test("loadEnvFiles loads .env file", async () => {
  await Bun.write(join(testDir, ".env"), "TEST_VAR=hello");

  const count = await loadEnvFiles(testDir);

  expect(count).toBe(1);
  expect(process.env.TEST_VAR).toBe("hello");
});

test("loadEnvFiles handles quoted values", async () => {
  await Bun.write(join(testDir, ".env"), `
DOUBLE_QUOTED="hello world"
SINGLE_QUOTED='hello world'
`);

  await loadEnvFiles(testDir);

  expect(process.env.DOUBLE_QUOTED).toBe("hello world");
  expect(process.env.SINGLE_QUOTED).toBe("hello world");
});

test("loadEnvFiles ignores comments", async () => {
  await Bun.write(join(testDir, ".env"), `
# This is a comment
KEY=value
# Another comment
`);

  await loadEnvFiles(testDir);

  expect(process.env.KEY).toBe("value");
});

test("loadEnvFiles does not override existing env vars", async () => {
  process.env.EXISTING_VAR = "original";
  await Bun.write(join(testDir, ".env"), "EXISTING_VAR=new");

  await loadEnvFiles(testDir);

  expect(process.env.EXISTING_VAR).toBe("original");
});

test("loadEnvFiles loads multiple files in order", async () => {
  await Bun.write(join(testDir, ".env"), "BASE=base\nOVERRIDE=base");
  await Bun.write(join(testDir, ".env.local"), "OVERRIDE=local");

  const count = await loadEnvFiles(testDir);

  expect(count).toBe(2);
  expect(process.env.BASE).toBe("base");
  expect(process.env.OVERRIDE).toBe("local");
});

test("loadEnvFiles handles inline comments", async () => {
  await Bun.write(join(testDir, ".env"), "KEY=value # this is a comment");

  await loadEnvFiles(testDir);

  expect(process.env.KEY).toBe("value");
});

test("getEnvFilesInDirectory lists existing files", async () => {
  await Bun.write(join(testDir, ".env"), "A=1");
  await Bun.write(join(testDir, ".env.local"), "B=2");

  const files = await getEnvFilesInDirectory(testDir);

  expect(files).toContain(".env");
  expect(files).toContain(".env.local");
});

test("loadEnvFiles returns 0 for directory with no env files", async () => {
  const emptyDir = await mkdtemp(join(tmpdir(), "env-empty-"));

  const count = await loadEnvFiles(emptyDir);

  expect(count).toBe(0);

  await rm(emptyDir, { recursive: true });
});
