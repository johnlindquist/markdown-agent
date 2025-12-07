/**
 * Tests for flags utility functions
 */

import { test, expect, describe } from "bun:test";
import { getPassthroughArgs, getHarnessPassthroughArgs, toArray } from "./flags";
import type { AgentFrontmatter } from "../types";

// =============================================================================
// toArray TESTS
// =============================================================================

describe("toArray utility", () => {
  test("returns empty array for undefined", () => {
    expect(toArray(undefined)).toEqual([]);
  });

  test("returns empty array for empty string", () => {
    expect(toArray("")).toEqual([]);
  });

  test("wraps string in array", () => {
    expect(toArray("single")).toEqual(["single"]);
  });

  test("returns array unchanged", () => {
    expect(toArray(["a", "b"])).toEqual(["a", "b"]);
  });

  test("handles single-element array", () => {
    expect(toArray(["only"])).toEqual(["only"]);
  });

  test("handles empty array", () => {
    expect(toArray([])).toEqual([]);
  });
});

// =============================================================================
// getPassthroughArgs TESTS
// =============================================================================

describe("getPassthroughArgs", () => {
  test("returns empty array for empty frontmatter", () => {
    const result = getPassthroughArgs({});
    expect(result).toEqual([]);
  });

  test("skips system keys", () => {
    const frontmatter: AgentFrontmatter = {
      harness: "claude",
      inputs: ["file.txt"],
      context: ["ctx.md"],
    };
    const result = getPassthroughArgs(frontmatter);
    expect(result).not.toContain("--harness");
    expect(result).not.toContain("--inputs");
    expect(result).not.toContain("--context");
  });

  test("skips universal keys", () => {
    const frontmatter: AgentFrontmatter = {
      model: "opus",
      interactive: false,
      approval: "yolo",
      dirs: ["/path"],
      tools: { allow: ["Read"] },
      session: { resume: true },
      output: "json",
      debug: true,
    };
    const result = getPassthroughArgs(frontmatter);
    expect(result).not.toContain("--model");
    expect(result).not.toContain("--interactive");
    expect(result).not.toContain("--approval");
    expect(result).not.toContain("--dirs");
    expect(result).not.toContain("--tools");
    expect(result).not.toContain("--session");
    expect(result).not.toContain("--output");
    expect(result).not.toContain("--debug");
  });

  test("skips deprecated universal keys", () => {
    const frontmatter: AgentFrontmatter = {
      "allow-all-tools": true,
      "allow-tool": ["Read"],
      "deny-tool": ["Bash"],
      "add-dir": "/path",
      resume: "session-id",
      continue: true,
      "output-format": "json",
    };
    const result = getPassthroughArgs(frontmatter);
    expect(result).not.toContain("--allow-all-tools");
    expect(result).not.toContain("--allow-tool");
    expect(result).not.toContain("--deny-tool");
    expect(result).not.toContain("--add-dir");
    expect(result).not.toContain("--resume");
    expect(result).not.toContain("--continue");
    expect(result).not.toContain("--output-format");
  });

  test("skips harness-specific config objects", () => {
    const frontmatter: AgentFrontmatter = {
      claude: { "system-prompt": "Be helpful" },
      codex: { oss: true },
      copilot: { agent: "test" },
      gemini: { sandbox: true },
    };
    const result = getPassthroughArgs(frontmatter);
    expect(result).not.toContain("--claude");
    expect(result).not.toContain("--codex");
    expect(result).not.toContain("--copilot");
    expect(result).not.toContain("--gemini");
  });

  test("passes through unknown keys", () => {
    const frontmatter: AgentFrontmatter = {
      "custom-flag": "value",
      "another-flag": true,
    };
    const result = getPassthroughArgs(frontmatter);
    expect(result).toContain("--custom-flag");
    expect(result).toContain("value");
    expect(result).toContain("--another-flag");
  });

  test("skips undefined and null values", () => {
    const frontmatter: AgentFrontmatter = {
      "defined-flag": "value",
      "undefined-flag": undefined,
      "null-flag": null as any,
    };
    const result = getPassthroughArgs(frontmatter);
    expect(result).toContain("--defined-flag");
    expect(result).not.toContain("--undefined-flag");
    expect(result).not.toContain("--null-flag");
  });

  test("skips false boolean values", () => {
    const frontmatter: AgentFrontmatter = {
      "true-flag": true,
      "false-flag": false,
    };
    const result = getPassthroughArgs(frontmatter);
    expect(result).toContain("--true-flag");
    expect(result).not.toContain("--false-flag");
  });

  test("handles array values by repeating flag", () => {
    const frontmatter: AgentFrontmatter = {
      "multi-flag": ["val1", "val2", "val3"],
    };
    const result = getPassthroughArgs(frontmatter);
    expect(result.filter(a => a === "--multi-flag")).toHaveLength(3);
    expect(result).toContain("val1");
    expect(result).toContain("val2");
    expect(result).toContain("val3");
  });

  test("respects handledKeys option", () => {
    const frontmatter: AgentFrontmatter = {
      "custom-handled": "value",
      "not-handled": "other",
    };
    const result = getPassthroughArgs(frontmatter, {
      handledKeys: new Set(["custom-handled"]),
    });
    expect(result).not.toContain("--custom-handled");
    expect(result).toContain("--not-handled");
  });

  test("respects skipKeys option", () => {
    const frontmatter: AgentFrontmatter = {
      "skip-this": "value",
      "keep-this": "other",
    };
    const result = getPassthroughArgs(frontmatter, {
      skipKeys: ["skip-this"],
    });
    expect(result).not.toContain("--skip-this");
    expect(result).toContain("--keep-this");
  });

  test("converts single-char keys to short flags", () => {
    const frontmatter: AgentFrontmatter = {
      v: true,
      verbose: true,
    };
    const result = getPassthroughArgs(frontmatter);
    expect(result).toContain("-v");
    expect(result).toContain("--verbose");
  });

  test("handles keys that already have dashes prefix", () => {
    const frontmatter: AgentFrontmatter = {
      "--already-flagged": "value",
    };
    const result = getPassthroughArgs(frontmatter);
    expect(result).toContain("--already-flagged");
    expect(result).not.toContain("----already-flagged");
  });
});

// =============================================================================
// getHarnessPassthroughArgs TESTS
// =============================================================================

describe("getHarnessPassthroughArgs", () => {
  test("returns empty array for undefined config", () => {
    const result = getHarnessPassthroughArgs(undefined, new Set());
    expect(result).toEqual([]);
  });

  test("returns empty array for empty config", () => {
    const result = getHarnessPassthroughArgs({}, new Set());
    expect(result).toEqual([]);
  });

  test("passes through unhandled keys", () => {
    const config = {
      "unhandled-key": "value",
      "another-key": true,
    };
    const result = getHarnessPassthroughArgs(config, new Set());
    expect(result).toContain("--unhandled-key");
    expect(result).toContain("value");
    expect(result).toContain("--another-key");
  });

  test("skips handled keys", () => {
    const config = {
      "handled-key": "value",
      "not-handled": "other",
    };
    const handledKeys = new Set(["handled-key"]);
    const result = getHarnessPassthroughArgs(config, handledKeys);
    expect(result).not.toContain("--handled-key");
    expect(result).toContain("--not-handled");
  });

  test("skips undefined and null values", () => {
    const config = {
      "defined": "value",
      "undefined": undefined,
      "null": null,
    };
    const result = getHarnessPassthroughArgs(config, new Set());
    expect(result).toContain("--defined");
    expect(result).not.toContain("--undefined");
    expect(result).not.toContain("--null");
  });

  test("handles numeric values", () => {
    const config = {
      "timeout": 30,
      "retries": 3,
    };
    const result = getHarnessPassthroughArgs(config, new Set());
    expect(result).toContain("30");
    expect(result).toContain("3");
  });

  test("handles array values", () => {
    const config = {
      "multi": ["a", "b"],
    };
    const result = getHarnessPassthroughArgs(config, new Set());
    expect(result.filter(a => a === "--multi")).toHaveLength(2);
  });
});

// =============================================================================
// EDGE CASES AND INTEGRATION
// =============================================================================

describe("Flags edge cases", () => {
  test("empty string key doesn't crash", () => {
    const frontmatter: AgentFrontmatter = {
      "": "value",
    };
    expect(() => getPassthroughArgs(frontmatter)).not.toThrow();
  });

  test("special characters in key name", () => {
    const frontmatter: AgentFrontmatter = {
      "flag:with:colons": "value",
      "flag.with.dots": "value",
    };
    const result = getPassthroughArgs(frontmatter);
    expect(result).toContain("--flag:with:colons");
    expect(result).toContain("--flag.with.dots");
  });

  test("numeric string values preserved", () => {
    const frontmatter: AgentFrontmatter = {
      "port": "8080",
    };
    const result = getPassthroughArgs(frontmatter);
    expect(result).toContain("8080");
  });

  test("object values are stringified", () => {
    const frontmatter: AgentFrontmatter = {
      "json-config": { nested: "value" } as any,
    };
    const result = getPassthroughArgs(frontmatter);
    // Object.toString() gives [object Object]
    expect(result.some(a => a.includes("object"))).toBe(true);
  });

  test("combining all options works", () => {
    const frontmatter: AgentFrontmatter = {
      model: "opus",  // Universal - skipped
      harness: "claude",  // System - skipped
      claude: {},  // System - skipped
      "custom-flag": "value",  // Passed through
      "handled-flag": "value",  // Handled - skipped
      "skip-flag": "value",  // SkipKeys - skipped
    };
    const result = getPassthroughArgs(frontmatter, {
      handledKeys: new Set(["handled-flag"]),
      skipKeys: ["skip-flag"],
    });
    expect(result).toContain("--custom-flag");
    expect(result).not.toContain("--model");
    expect(result).not.toContain("--harness");
    expect(result).not.toContain("--handled-flag");
    expect(result).not.toContain("--skip-flag");
  });

});
