import { expect, test, describe, beforeEach } from "bun:test";
import { loadGlobalConfig, getCommandDefaults, applyDefaults, clearConfigCache } from "./config";

describe("config", () => {
  beforeEach(() => {
    clearConfigCache();
  });

  test("loadGlobalConfig returns built-in defaults", async () => {
    const config = await loadGlobalConfig();
    expect(config.commands).toBeDefined();
    expect(config.commands?.copilot).toBeDefined();
    expect(config.commands?.copilot.$1).toBe("prompt");
  });

  test("getCommandDefaults returns defaults for copilot", async () => {
    const defaults = await getCommandDefaults("copilot");
    expect(defaults).toBeDefined();
    expect(defaults?.$1).toBe("prompt");
  });

  test("getCommandDefaults returns undefined for unknown command", async () => {
    const defaults = await getCommandDefaults("unknown-command");
    expect(defaults).toBeUndefined();
  });

  test("applyDefaults merges defaults with frontmatter (frontmatter wins)", () => {
    const frontmatter = { model: "opus", $1: "custom" };
    const defaults = { $1: "prompt", verbose: true };
    const result = applyDefaults(frontmatter, defaults);

    expect(result.model).toBe("opus");
    expect(result.$1).toBe("custom"); // frontmatter wins
    expect(result.verbose).toBe(true); // default applied
  });

  test("applyDefaults returns frontmatter unchanged when no defaults", () => {
    const frontmatter = { model: "opus" };
    const result = applyDefaults(frontmatter, undefined);
    expect(result).toEqual(frontmatter);
  });
});
