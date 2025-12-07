import { expect, test, describe } from "bun:test";
import { parseCliArgs } from "./cli";

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

  test("--setup works when no file provided", () => {
    const result = parseCliArgs(["node", "script", "--setup"]);
    expect(result.filePath).toBe("");
    expect(result.setup).toBe(true);
  });

  test("--logs works when no file provided", () => {
    const result = parseCliArgs(["node", "script", "--logs"]);
    expect(result.filePath).toBe("");
    expect(result.logs).toBe(true);
  });

  test("ma flags ignored when file is provided", () => {
    const result = parseCliArgs(["node", "script", "DEMO.md", "--help", "--setup"]);
    expect(result.filePath).toBe("DEMO.md");
    expect(result.help).toBe(false);
    expect(result.setup).toBe(false);
    expect(result.passthroughArgs).toEqual(["--help", "--setup"]);
  });
});
