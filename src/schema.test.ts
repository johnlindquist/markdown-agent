import { expect, test, describe } from "bun:test";
import { validateFrontmatter, safeParseFrontmatter } from "./schema";

describe("validateFrontmatter", () => {
  test("validates empty frontmatter", () => {
    const result = validateFrontmatter({});
    expect(result).toEqual({});
  });

  test("validates args array", () => {
    const result = validateFrontmatter({
      args: ["message", "branch"]
    });
    expect(result.args).toEqual(["message", "branch"]);
  });

  test("validates env as object (process.env config)", () => {
    const result = validateFrontmatter({
      env: { HOST: "localhost", PORT: "3000" }
    });
    expect(result.env).toEqual({ HOST: "localhost", PORT: "3000" });
  });

  test("validates env as array (--env flags)", () => {
    const result = validateFrontmatter({
      env: ["HOST=localhost", "PORT=3000"]
    });
    expect(result.env).toEqual(["HOST=localhost", "PORT=3000"]);
  });

  test("validates env as string", () => {
    const result = validateFrontmatter({
      env: "HOST=localhost"
    });
    expect(result.env).toBe("HOST=localhost");
  });

  test("allows $N positional mappings", () => {
    const result = validateFrontmatter({
      $1: "prompt",
      $2: "model"
    });
    expect((result as any).$1).toBe("prompt");
    expect((result as any).$2).toBe("model");
  });

  test("allows unknown keys - they become CLI flags", () => {
    const result = validateFrontmatter({
      model: "opus",
      "dangerously-skip-permissions": true,
      "mcp-config": "./mcp.json"
    });
    expect((result as any).model).toBe("opus");
    expect((result as any)["dangerously-skip-permissions"]).toBe(true);
    expect((result as any)["mcp-config"]).toBe("./mcp.json");
  });
});

describe("safeParseFrontmatter", () => {
  test("returns success with valid data", () => {
    const result = safeParseFrontmatter({ model: "opus" });
    expect(result.success).toBe(true);
    expect(result.data?.model).toBe("opus");
  });

  test("returns success with args", () => {
    const result = safeParseFrontmatter({ args: ["name", "value"] });
    expect(result.success).toBe(true);
    expect(result.data?.args).toEqual(["name", "value"]);
  });

  test("returns errors when args is not an array", () => {
    const result = safeParseFrontmatter({ args: "invalid" });
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
  });
});
