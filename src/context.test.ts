import { expect, test, describe, beforeAll, afterAll } from "bun:test";
import { resolveContextGlobs, formatContextAsXml, getContextStats } from "./context";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

let testDir: string;

beforeAll(async () => {
  // Create temp directory with test files
  testDir = await mkdtemp(join(tmpdir(), "context-test-"));

  // Create test files
  await Bun.write(join(testDir, "file1.ts"), "const x = 1;");
  await Bun.write(join(testDir, "file2.ts"), "const y = 2;");
  await Bun.write(join(testDir, "file.test.ts"), "test('hello', () => {});");
  await Bun.write(join(testDir, "readme.md"), "# Hello");

  // Create subdirectory
  const subDir = join(testDir, "src");
  await Bun.write(join(subDir, "index.ts"), "export {};");
  await Bun.write(join(subDir, "utils.ts"), "export function util() {}");
});

afterAll(async () => {
  await rm(testDir, { recursive: true });
});

describe("resolveContextGlobs", () => {
  test("resolves single glob pattern", async () => {
    const files = await resolveContextGlobs("*.ts", testDir);
    const names = files.map(f => f.relativePath);
    expect(names).toContain("file1.ts");
    expect(names).toContain("file2.ts");
    expect(names).toContain("file.test.ts");
    expect(names).not.toContain("readme.md");
  });

  test("resolves multiple glob patterns", async () => {
    const files = await resolveContextGlobs(["*.ts", "*.md"], testDir);
    const names = files.map(f => f.relativePath);
    expect(names).toContain("file1.ts");
    expect(names).toContain("readme.md");
  });

  test("supports negation patterns", async () => {
    const files = await resolveContextGlobs(
      ["*.ts", "!*.test.ts"],
      testDir
    );
    const names = files.map(f => f.relativePath);
    expect(names).toContain("file1.ts");
    expect(names).toContain("file2.ts");
    expect(names).not.toContain("file.test.ts");
  });

  test("resolves recursive globs", async () => {
    const files = await resolveContextGlobs("**/*.ts", testDir);
    const names = files.map(f => f.relativePath);
    expect(names).toContain("file1.ts");
    expect(names).toContain("src/index.ts");
    expect(names).toContain("src/utils.ts");
  });

  test("reads file contents", async () => {
    const files = await resolveContextGlobs("file1.ts", testDir);
    expect(files).toHaveLength(1);
    expect(files[0]!.content).toBe("const x = 1;");
  });

  test("returns empty array for no matches", async () => {
    const files = await resolveContextGlobs("*.xyz", testDir);
    expect(files).toEqual([]);
  });

  test("sorts files by path", async () => {
    const files = await resolveContextGlobs("*.ts", testDir);
    const names = files.map(f => f.relativePath);
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
  });
});

describe("formatContextAsXml", () => {
  test("formats single file as XML", () => {
    const files = [{
      path: "/test/utils.ts",
      relativePath: "utils.ts",
      content: "export const x = 1;",
    }];
    const xml = formatContextAsXml(files);
    expect(xml).toBe(`<utils path="utils.ts">\nexport const x = 1;\n</utils>`);
  });

  test("formats multiple files with separators", () => {
    const files = [
      { path: "/test/a.ts", relativePath: "a.ts", content: "a" },
      { path: "/test/b.ts", relativePath: "b.ts", content: "b" },
    ];
    const xml = formatContextAsXml(files);
    expect(xml).toContain("<a path=\"a.ts\">\na\n</a>");
    expect(xml).toContain("<b path=\"b.ts\">\nb\n</b>");
    expect(xml).toContain("\n\n"); // Separator between files
  });

  test("returns empty string for no files", () => {
    const xml = formatContextAsXml([]);
    expect(xml).toBe("");
  });

  test("handles files with dots in name", () => {
    const files = [{
      path: "/test/file.test.ts",
      relativePath: "file.test.ts",
      content: "test",
    }];
    const xml = formatContextAsXml(files);
    // Should use "file-test" as tag (removes extension, keeps rest)
    expect(xml).toContain("<file-test path=\"file.test.ts\">");
  });
});

describe("getContextStats", () => {
  test("calculates stats correctly", () => {
    const files = [
      { path: "/a", relativePath: "a", content: "line1\nline2" },
      { path: "/b", relativePath: "b", content: "line1\nline2\nline3" },
    ];
    const stats = getContextStats(files);
    expect(stats.fileCount).toBe(2);
    expect(stats.totalLines).toBe(5); // 2 + 3
  });

  test("handles empty files array", () => {
    const stats = getContextStats([]);
    expect(stats.fileCount).toBe(0);
    expect(stats.totalBytes).toBe(0);
    expect(stats.totalLines).toBe(0);
  });
});
