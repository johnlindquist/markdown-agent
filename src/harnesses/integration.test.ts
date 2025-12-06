/**
 * Integration tests for harness system
 * Tests factory resolution, cross-harness consistency, and end-to-end scenarios
 */

import { test, expect, describe } from "bun:test";
import { ClaudeHarness } from "./claude";
import { CodexHarness } from "./codex";
import { CopilotHarness } from "./copilot";
import { GeminiHarness } from "./gemini";
import {
  createHarness,
  detectHarnessFromModel,
  resolveHarnessSync,
} from "./factory";
import type { RunContext, HarnessName } from "./types";
import type { AgentFrontmatter } from "../types";

function makeContext(frontmatter: AgentFrontmatter = {}): RunContext {
  return {
    prompt: "test prompt",
    frontmatter,
    passthroughArgs: [],
    captureOutput: false,
  };
}

// =============================================================================
// FACTORY RESOLUTION TESTS
// =============================================================================

describe("Factory resolution priority", () => {
  test("CLI harness overrides everything", () => {
    const harness = resolveHarnessSync({
      cliHarness: "claude",
      frontmatter: { harness: "codex", model: "gemini-pro" }
    });
    expect(harness.name).toBe("claude");
  });

  test("Frontmatter harness overrides model detection", () => {
    const harness = resolveHarnessSync({
      frontmatter: { harness: "codex", model: "claude-sonnet-4" }
    });
    expect(harness.name).toBe("codex");
  });

  test("Model detection when no explicit harness", () => {
    expect(resolveHarnessSync({ frontmatter: { model: "opus" } }).name).toBe("claude");
    expect(resolveHarnessSync({ frontmatter: { model: "gpt-5" } }).name).toBe("codex");
    expect(resolveHarnessSync({ frontmatter: { model: "gemini-pro" } }).name).toBe("gemini");
  });

  test("Falls back to copilot when no detection possible", () => {
    const harness = resolveHarnessSync({ frontmatter: {} });
    expect(harness.name).toBe("copilot");
  });

  test("Falls back to copilot for unknown model", () => {
    const harness = resolveHarnessSync({ frontmatter: { model: "llama-3" } });
    expect(harness.name).toBe("copilot");
  });

  test("harness: auto triggers model detection", () => {
    const harness = resolveHarnessSync({
      frontmatter: { harness: "auto" as any, model: "sonnet" }
    });
    expect(harness.name).toBe("claude");
  });
});

describe("Model detection patterns", () => {
  const claudeModels = [
    "claude", "claude-3", "claude-sonnet-4", "claude-opus-4.5", "claude-haiku-4.5",
    "sonnet", "opus", "haiku", "claude-instant", "CLAUDE", "Sonnet"
  ];

  const codexModels = [
    "gpt-5", "gpt-5.1", "gpt-5.1-codex", "gpt-5-mini", "gpt-4.1",
    "codex", "GPT-5", "CODEX"
  ];

  const geminiModels = [
    "gemini", "gemini-pro", "gemini-2.5-pro", "gemini-2.5-flash",
    "gemini-3-pro-preview", "GEMINI", "Gemini-Pro"
  ];

  for (const model of claudeModels) {
    test(`detects "${model}" as claude`, () => {
      expect(detectHarnessFromModel(model)).toBe("claude");
    });
  }

  for (const model of codexModels) {
    test(`detects "${model}" as codex`, () => {
      expect(detectHarnessFromModel(model)).toBe("codex");
    });
  }

  for (const model of geminiModels) {
    test(`detects "${model}" as gemini`, () => {
      expect(detectHarnessFromModel(model)).toBe("gemini");
    });
  }

  test("returns null for unknown models", () => {
    const unknownModels = ["llama", "mistral", "phi", "qwen", "unknown"];
    for (const model of unknownModels) {
      expect(detectHarnessFromModel(model)).toBeNull();
    }
  });
});

// =============================================================================
// CROSS-HARNESS CONSISTENCY TESTS
// =============================================================================

describe("Cross-harness consistency", () => {
  const allHarnesses = [
    new ClaudeHarness(),
    new CodexHarness(),
    new CopilotHarness(),
    new GeminiHarness(),
  ];

  test("All harnesses implement required interface", () => {
    for (const harness of allHarnesses) {
      expect(harness.name).toBeDefined();
      expect(typeof harness.name).toBe("string");
      expect(harness.getCommand).toBeDefined();
      expect(typeof harness.getCommand()).toBe("string");
      expect(harness.buildArgs).toBeDefined();
      expect(harness.run).toBeDefined();
    }
  });

  test("All harnesses handle empty frontmatter", () => {
    for (const harness of allHarnesses) {
      expect(() => harness.buildArgs(makeContext({}))).not.toThrow();
    }
  });

  test("All harnesses handle model key", () => {
    for (const harness of allHarnesses) {
      const args = harness.buildArgs(makeContext({ model: "test-model" }));
      expect(args).toContain("--model");
    }
  });

  test("All harnesses handle interactive: false without crashing", () => {
    for (const harness of allHarnesses) {
      // Each harness should handle interactive: false without throwing
      // Note: Codex handles this in run() with exec subcommand, not in buildArgs()
      expect(() => harness.buildArgs(makeContext({ interactive: false }))).not.toThrow();
    }
  });

  test("Claude/Copilot add -p for interactive: false", () => {
    const claude = new ClaudeHarness();
    const copilot = new CopilotHarness();

    expect(claude.buildArgs(makeContext({ interactive: false }))).toContain("-p");
    expect(copilot.buildArgs(makeContext({ interactive: false }))).toContain("-p");
  });

  test("All harnesses handle debug key", () => {
    for (const harness of allHarnesses) {
      const args = harness.buildArgs(makeContext({ debug: true }));
      // Should have some debug-related flag
      expect(args.some(a => a.includes("debug") || a === "-c")).toBe(true);
    }
  });

  test("All harnesses handle dirs key", () => {
    for (const harness of allHarnesses) {
      const args = harness.buildArgs(makeContext({ dirs: "/test/dir" }));
      // Should have a directory-related flag
      expect(args.some(a =>
        a === "--add-dir" || a === "--include-directories"
      )).toBe(true);
    }
  });

  test("All harnesses handle approval: yolo", () => {
    for (const harness of allHarnesses) {
      const args = harness.buildArgs(makeContext({ approval: "yolo" }));
      // Should have some god mode flag
      expect(args.some(a =>
        a === "--dangerously-skip-permissions" ||
        a === "--full-auto" ||
        a === "--yolo" ||
        a === "--allow-all-tools"
      )).toBe(true);
    }
  });
});

// =============================================================================
// FLAG ORDERING AND STRUCTURE TESTS
// =============================================================================

describe("Flag ordering and structure", () => {
  test("Passthrough args come last", () => {
    const harness = new ClaudeHarness();
    const ctx = makeContext({ model: "opus" });
    ctx.passthroughArgs = ["--custom-last"];
    const args = harness.buildArgs(ctx);

    const lastArg = args[args.length - 1];
    expect(lastArg).toBe("--custom-last");
  });

  test("Flag values follow their flags", () => {
    const harness = new ClaudeHarness();
    const args = harness.buildArgs(makeContext({ model: "opus" }));

    const modelIndex = args.indexOf("--model");
    expect(args[modelIndex + 1]).toBe("opus");
  });

  test("Boolean flags don't have values", () => {
    const harness = new ClaudeHarness();
    const args = harness.buildArgs(makeContext({
      interactive: false,
      approval: "yolo"
    }));

    const pIndex = args.indexOf("-p");
    const skipIndex = args.indexOf("--dangerously-skip-permissions");

    // -p should not be followed by "false"
    expect(args[pIndex + 1]).not.toBe("false");
    // --dangerously-skip-permissions should not be followed by "true"
    if (skipIndex < args.length - 1) {
      expect(args[skipIndex + 1]).not.toBe("true");
    }
  });

  test("Array values create repeated flags", () => {
    const harness = new ClaudeHarness();
    const args = harness.buildArgs(makeContext({
      dirs: ["/dir1", "/dir2", "/dir3"]
    }));

    // Should be: --add-dir /dir1 --add-dir /dir2 --add-dir /dir3
    const flagCount = args.filter(a => a === "--add-dir").length;
    expect(flagCount).toBe(3);

    // Values should follow their flags
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--add-dir") {
        expect(args[i + 1]).toMatch(/^\/dir\d$/);
      }
    }
  });
});

// =============================================================================
// REAL-WORLD FRONTMATTER SCENARIOS
// =============================================================================

describe("Real-world frontmatter scenarios", () => {
  test("Simple Claude agent", () => {
    const harness = new ClaudeHarness();
    const args = harness.buildArgs(makeContext({
      model: "sonnet",
      interactive: false,
    }));

    expect(args).toContain("--model");
    expect(args).toContain("sonnet");
    expect(args).toContain("-p");
  });

  test("Yolo mode with MCP servers", () => {
    const harness = new ClaudeHarness();
    const args = harness.buildArgs(makeContext({
      approval: "yolo",
      "mcp-config": "./servers.json",
      claude: {
        "allowed-tools": "mcp__*"
      }
    }));

    expect(args).toContain("--dangerously-skip-permissions");
    expect(args).toContain("--mcp-config");
    expect(args).toContain("--allowed-tools");
  });

  test("Sandbox mode for Codex", () => {
    const harness = new CodexHarness();
    const args = harness.buildArgs(makeContext({
      model: "gpt-5.1",
      approval: "sandbox",
      dirs: ["/workspace", "/shared"],
    }));

    expect(args).toContain("--model");
    expect(args).toContain("--sandbox");
    expect(args.filter(a => a === "--add-dir")).toHaveLength(2);
  });

  test("Session continuation", () => {
    const harness = new CopilotHarness();
    const args = harness.buildArgs(makeContext({
      session: { resume: true },
      tools: {
        allow: ["Read", "Write", "Edit"],
        deny: ["Bash"]
      }
    }));

    expect(args).toContain("--continue");
    expect(args.filter(a => a === "--allow-tool")).toHaveLength(3);
    expect(args).toContain("--deny-tool");
  });

  test("Gemini with extensions", () => {
    const harness = new GeminiHarness();
    const args = harness.buildArgs(makeContext({
      model: "gemini-2.5-pro",
      approval: "yolo",
      output: "json",
      gemini: {
        extensions: ["code_execution", "web_search"],
        "screen-reader": true
      }
    }));

    expect(args).toContain("--yolo");
    expect(args).toContain("--output-format");
    expect(args).toContain("json");
    expect(args.filter(a => a === "--extensions")).toHaveLength(2);
    expect(args).toContain("--screen-reader");
  });

  test("Multi-directory project with tool restrictions", () => {
    const harness = new ClaudeHarness();
    const args = harness.buildArgs(makeContext({
      dirs: ["/project/src", "/project/tests", "/shared/lib"],
      tools: {
        allow: ["Read", "Glob", "Grep"],
        deny: ["Write", "Edit", "Bash"]
      },
      interactive: false,
      output: "stream-json"
    }));

    expect(args.filter(a => a === "--add-dir")).toHaveLength(3);
    expect(args.filter(a => a === "--allowed-tools")).toHaveLength(3);
    expect(args.filter(a => a === "--disallowed-tools")).toHaveLength(3);
    expect(args).toContain("-p");
    expect(args).toContain("stream-json");
  });
});

// =============================================================================
// ERROR RESILIENCE TESTS
// =============================================================================

describe("Error resilience", () => {
  test("Invalid harness name throws", () => {
    expect(() => createHarness("invalid" as HarnessName)).toThrow();
  });

  test("Deeply nested invalid values don't crash", () => {
    const harness = new ClaudeHarness();
    expect(() => harness.buildArgs(makeContext({
      tools: {
        allow: [null, undefined, "", [], {}] as any
      }
    }))).not.toThrow();
  });

  test("Circular references in frontmatter", () => {
    const frontmatter: any = { normal: "value" };
    // Can't actually create circular ref in frontmatter parsing,
    // but we can test with complex nested objects
    frontmatter.nested = { deep: { deeper: { value: "test" } } };

    const harness = new ClaudeHarness();
    expect(() => harness.buildArgs(makeContext(frontmatter))).not.toThrow();
  });

  test("Very long string values", () => {
    const harness = new ClaudeHarness();
    const longString = "x".repeat(10000);
    const args = harness.buildArgs(makeContext({
      claude: { "system-prompt": longString }
    }));
    expect(args).toContain(longString);
  });

  test("Unicode in values", () => {
    const harness = new ClaudeHarness();
    const args = harness.buildArgs(makeContext({
      dirs: "/path/with/émojis/🎉",
      claude: { "system-prompt": "你好世界 مرحبا" }
    }));
    expect(args).toContain("/path/with/émojis/🎉");
    expect(args).toContain("你好世界 مرحبا");
  });

  test("Whitespace-only values", () => {
    const harness = new ClaudeHarness();
    const args = harness.buildArgs(makeContext({
      dirs: "   ",  // Just spaces
      model: "\t\n"  // Just whitespace
    }));
    // Whitespace values should still be passed (let CLI handle validation)
    expect(args).toBeDefined();
  });
});

// =============================================================================
// HARNESS-SPECIFIC FLAG MAPPING VERIFICATION
// =============================================================================

describe("Harness-specific flag mapping", () => {
  describe("Claude flag mapping", () => {
    const harness = new ClaudeHarness();

    test("dirs -> --add-dir", () => {
      const args = harness.buildArgs(makeContext({ dirs: "/path" }));
      expect(args).toContain("--add-dir");
    });

    test("approval: yolo -> --dangerously-skip-permissions", () => {
      const args = harness.buildArgs(makeContext({ approval: "yolo" }));
      expect(args).toContain("--dangerously-skip-permissions");
    });

    test("tools.allow -> --allowed-tools", () => {
      const args = harness.buildArgs(makeContext({ tools: { allow: ["Read"] } }));
      expect(args).toContain("--allowed-tools");
    });

    test("tools.deny -> --disallowed-tools", () => {
      const args = harness.buildArgs(makeContext({ tools: { deny: ["Bash"] } }));
      expect(args).toContain("--disallowed-tools");
    });

    test("session.resume: true -> -c", () => {
      const args = harness.buildArgs(makeContext({ session: { resume: true } }));
      expect(args).toContain("-c");
    });

    test("session.resume: string -> -r", () => {
      const args = harness.buildArgs(makeContext({ session: { resume: "id" } }));
      expect(args).toContain("-r");
    });

    test("output -> --output-format", () => {
      const args = harness.buildArgs(makeContext({ output: "json" }));
      expect(args).toContain("--output-format");
    });

    test("interactive: false -> -p", () => {
      const args = harness.buildArgs(makeContext({ interactive: false }));
      expect(args).toContain("-p");
    });
  });

  describe("Codex flag mapping", () => {
    const harness = new CodexHarness();

    test("dirs -> --add-dir", () => {
      const args = harness.buildArgs(makeContext({ dirs: "/path" }));
      expect(args).toContain("--add-dir");
    });

    test("approval: yolo -> --full-auto", () => {
      const args = harness.buildArgs(makeContext({ approval: "yolo" }));
      expect(args).toContain("--full-auto");
    });

    test("approval: sandbox -> --sandbox", () => {
      const args = harness.buildArgs(makeContext({ approval: "sandbox" }));
      expect(args).toContain("--sandbox");
    });

    test("debug -> -c debug=true", () => {
      const args = harness.buildArgs(makeContext({ debug: true }));
      expect(args).toContain("-c");
      expect(args).toContain("debug=true");
    });
  });

  describe("Gemini flag mapping", () => {
    const harness = new GeminiHarness();

    test("dirs -> --include-directories", () => {
      const args = harness.buildArgs(makeContext({ dirs: "/path" }));
      expect(args).toContain("--include-directories");
    });

    test("approval: yolo -> --yolo", () => {
      const args = harness.buildArgs(makeContext({ approval: "yolo" }));
      expect(args).toContain("--yolo");
    });

    test("approval: sandbox -> --sandbox", () => {
      const args = harness.buildArgs(makeContext({ approval: "sandbox" }));
      expect(args).toContain("--sandbox");
    });

    test("tools.allow -> --allowed-tools", () => {
      const args = harness.buildArgs(makeContext({ tools: { allow: ["shell"] } }));
      expect(args).toContain("--allowed-tools");
    });

    test("session.resume: true -> --resume latest", () => {
      const args = harness.buildArgs(makeContext({ session: { resume: true } }));
      expect(args).toContain("--resume");
      expect(args).toContain("latest");
    });

    test("output -> --output-format", () => {
      const args = harness.buildArgs(makeContext({ output: "json" }));
      expect(args).toContain("--output-format");
    });
  });

  describe("Copilot flag mapping", () => {
    const harness = new CopilotHarness();

    test("dirs -> --add-dir", () => {
      const args = harness.buildArgs(makeContext({ dirs: "/path" }));
      expect(args).toContain("--add-dir");
    });

    test("approval: yolo -> --allow-all-tools", () => {
      const args = harness.buildArgs(makeContext({ approval: "yolo" }));
      expect(args).toContain("--allow-all-tools");
    });

    test("tools.allow -> --allow-tool", () => {
      const args = harness.buildArgs(makeContext({ tools: { allow: ["Read"] } }));
      expect(args).toContain("--allow-tool");
    });

    test("tools.deny -> --deny-tool", () => {
      const args = harness.buildArgs(makeContext({ tools: { deny: ["Bash"] } }));
      expect(args).toContain("--deny-tool");
    });

    test("session.resume: true -> --continue", () => {
      const args = harness.buildArgs(makeContext({ session: { resume: true } }));
      expect(args).toContain("--continue");
    });

    test("session.resume: string -> --resume", () => {
      const args = harness.buildArgs(makeContext({ session: { resume: "id" } }));
      expect(args).toContain("--resume");
    });

    test("mcp-config -> --additional-mcp-config", () => {
      const args = harness.buildArgs(makeContext({ "mcp-config": "./mcp.json" }));
      expect(args).toContain("--additional-mcp-config");
    });

    test("debug -> --log-level debug", () => {
      const args = harness.buildArgs(makeContext({ debug: true }));
      expect(args).toContain("--log-level");
      expect(args).toContain("debug");
    });

    test("interactive: false -> -p", () => {
      const args = harness.buildArgs(makeContext({ interactive: false }));
      expect(args).toContain("-p");
    });

    test("interactive: true -> --interactive", () => {
      const args = harness.buildArgs(makeContext({ interactive: true }));
      expect(args).toContain("--interactive");
    });
  });
});

// =============================================================================
// CREATEHARNESS FACTORY TESTS
// =============================================================================

describe("createHarness factory", () => {
  const harnessNames: HarnessName[] = ["claude", "codex", "copilot", "gemini"];

  for (const name of harnessNames) {
    test(`creates ${name} harness`, () => {
      const harness = createHarness(name);
      expect(harness.name).toBe(name);
      expect(harness.getCommand()).toBe(name);
    });
  }

  test("throws for unknown harness", () => {
    expect(() => createHarness("unknown" as HarnessName)).toThrow("Unknown harness");
  });
});
