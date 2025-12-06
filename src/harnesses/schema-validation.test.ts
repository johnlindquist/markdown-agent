/**
 * Schema validation tests
 * Tests that frontmatter types match actual usage and all keys are documented
 */

import { test, expect, describe } from "bun:test";
import { ClaudeHarness } from "./claude";
import { CodexHarness } from "./codex";
import { CopilotHarness } from "./copilot";
import { GeminiHarness } from "./gemini";
import type { RunContext } from "./types";
import type { AgentFrontmatter, ToolsConfig, SessionConfig } from "../types";

function makeContext(frontmatter: AgentFrontmatter = {}): RunContext {
  return {
    prompt: "test prompt",
    frontmatter,
    passthroughArgs: [],
    captureOutput: false,
  };
}

// =============================================================================
// TYPE STRUCTURE TESTS
// =============================================================================

describe("AgentFrontmatter type structure", () => {
  test("ToolsConfig accepts string", () => {
    const config: ToolsConfig = {
      allow: "SingleTool",
      deny: "SingleBadTool"
    };
    expect(config.allow).toBe("SingleTool");
  });

  test("ToolsConfig accepts string array", () => {
    const config: ToolsConfig = {
      allow: ["Tool1", "Tool2"],
      deny: ["Bad1", "Bad2"]
    };
    expect(config.allow).toHaveLength(2);
  });

  test("ToolsConfig allows partial", () => {
    const allowOnly: ToolsConfig = { allow: "Tool" };
    const denyOnly: ToolsConfig = { deny: "Bad" };
    expect(allowOnly.allow).toBe("Tool");
    expect(denyOnly.deny).toBe("Bad");
  });

  test("SessionConfig accepts boolean resume", () => {
    const config: SessionConfig = { resume: true };
    expect(config.resume).toBe(true);
  });

  test("SessionConfig accepts string resume", () => {
    const config: SessionConfig = { resume: "session-id" };
    expect(config.resume).toBe("session-id");
  });

  test("SessionConfig accepts fork", () => {
    const config: SessionConfig = { fork: true };
    expect(config.fork).toBe(true);
  });

  test("SessionConfig allows combined", () => {
    const config: SessionConfig = {
      resume: "session-id",
      fork: true
    };
    expect(config.resume).toBe("session-id");
    expect(config.fork).toBe(true);
  });
});

// =============================================================================
// UNIVERSAL KEY COMPLETENESS
// =============================================================================

describe("Universal key completeness", () => {
  const universalKeys = [
    "model",
    "interactive",
    "approval",
    "tools",
    "dirs",
    "session",
    "output",
    "debug",
    "mcp-config",
  ];

  const deprecatedKeys = [
    "allow-all-tools",
    "allow-tool",
    "deny-tool",
    "add-dir",
    "resume",
    "continue",
    "output-format",
  ];

  test("All universal keys are valid frontmatter properties", () => {
    for (const key of universalKeys) {
      const frontmatter: AgentFrontmatter = { [key]: "test" };
      expect(frontmatter[key]).toBe("test");
    }
  });

  test("All deprecated keys are valid frontmatter properties", () => {
    for (const key of deprecatedKeys) {
      const frontmatter: AgentFrontmatter = { [key]: "test" };
      expect(frontmatter[key]).toBe("test");
    }
  });

  test("Harness-specific configs are valid properties", () => {
    const frontmatter: AgentFrontmatter = {
      claude: { "system-prompt": "test" },
      codex: { oss: true },
      copilot: { agent: "test" },
      gemini: { sandbox: true },
    };
    expect(frontmatter.claude).toBeDefined();
    expect(frontmatter.codex).toBeDefined();
    expect(frontmatter.copilot).toBeDefined();
    expect(frontmatter.gemini).toBeDefined();
  });
});

// =============================================================================
// APPROVAL ENUM VALUES
// =============================================================================

describe("Approval enum values", () => {
  test("ask is valid", () => {
    const frontmatter: AgentFrontmatter = { approval: "ask" };
    expect(frontmatter.approval).toBe("ask");
  });

  test("sandbox is valid", () => {
    const frontmatter: AgentFrontmatter = { approval: "sandbox" };
    expect(frontmatter.approval).toBe("sandbox");
  });

  test("yolo is valid", () => {
    const frontmatter: AgentFrontmatter = { approval: "yolo" };
    expect(frontmatter.approval).toBe("yolo");
  });

  test("All harnesses handle ask without god mode flags", () => {
    const harnesses = [
      new ClaudeHarness(),
      new CodexHarness(),
      new CopilotHarness(),
      new GeminiHarness()
    ];

    for (const harness of harnesses) {
      const args = harness.buildArgs(makeContext({ approval: "ask" }));
      expect(args).not.toContain("--dangerously-skip-permissions");
      expect(args).not.toContain("--full-auto");
      expect(args).not.toContain("--yolo");
      expect(args).not.toContain("--allow-all-tools");
    }
  });
});

// =============================================================================
// OUTPUT FORMAT VALUES
// =============================================================================

describe("Output format values", () => {
  const validFormats = ["text", "json", "stream-json"];

  for (const format of validFormats) {
    test(`${format} is valid output format`, () => {
      const frontmatter: AgentFrontmatter = { output: format as any };
      expect(frontmatter.output).toBe(format);
    });
  }

  test("All harnesses that support output use --output-format", () => {
    const claude = new ClaudeHarness();
    const gemini = new GeminiHarness();

    const claudeArgs = claude.buildArgs(makeContext({ output: "json" }));
    const geminiArgs = gemini.buildArgs(makeContext({ output: "json" }));

    expect(claudeArgs).toContain("--output-format");
    expect(geminiArgs).toContain("--output-format");
  });
});

// =============================================================================
// COMPLEX NESTED STRUCTURES
// =============================================================================

describe("Complex nested structures", () => {
  test("Full tools config with arrays", () => {
    const frontmatter: AgentFrontmatter = {
      tools: {
        allow: ["Read", "Write", "Edit", "Glob", "Grep"],
        deny: ["Bash", "Task"]
      }
    };

    const harness = new ClaudeHarness();
    const args = harness.buildArgs(makeContext(frontmatter));

    expect(args.filter(a => a === "--allowed-tools")).toHaveLength(5);
    expect(args.filter(a => a === "--disallowed-tools")).toHaveLength(2);
  });

  test("Full session config", () => {
    const frontmatter: AgentFrontmatter = {
      session: {
        resume: "session-abc123",
        fork: true
      }
    };

    const harness = new ClaudeHarness();
    const args = harness.buildArgs(makeContext(frontmatter));

    expect(args).toContain("-r");
    expect(args).toContain("session-abc123");
    expect(args).toContain("--fork-session");
  });

  test("Mixed new and deprecated (new takes precedence)", () => {
    const frontmatter: AgentFrontmatter = {
      // New
      dirs: ["/new/path1", "/new/path2"],
      tools: { allow: ["NewTool"] },
      session: { resume: "new-session" },
      output: "json",
      approval: "sandbox",
      // Deprecated
      "add-dir": "/old/path",
      "allow-tool": ["OldTool"],
      resume: "old-session",
      "output-format": "text",
      "allow-all-tools": true,
    };

    const harness = new ClaudeHarness();
    const args = harness.buildArgs(makeContext(frontmatter));

    // New values should be present
    expect(args).toContain("/new/path1");
    expect(args).toContain("/new/path2");
    expect(args).toContain("NewTool");
    expect(args).toContain("new-session");
    expect(args).toContain("json");

    // Old values should not be present (new takes precedence)
    expect(args).not.toContain("/old/path");
    expect(args).not.toContain("OldTool");
    expect(args).not.toContain("old-session");
    expect(args).not.toContain("text");
  });
});

// =============================================================================
// HARNESS CONFIG PASSTHROUGH
// =============================================================================

describe("Harness config passthrough", () => {
  test("Claude config accepts known keys", () => {
    const frontmatter: AgentFrontmatter = {
      claude: {
        "dangerously-skip-permissions": true,
        "permission-mode": "strict",
        "mcp-config": "./mcp.json",
        "strict-mcp-config": true,
        "allowed-tools": "Read,Write",
        "disallowed-tools": "Bash",
        "system-prompt": "Be helpful",
        "append-system-prompt": "Additional",
        betas: ["beta1"],
        "fork-session": true,
        ide: true,
      }
    };

    const harness = new ClaudeHarness();
    const args = harness.buildArgs(makeContext(frontmatter));

    expect(args).toContain("--dangerously-skip-permissions");
    expect(args).toContain("--permission-mode");
    expect(args).toContain("--mcp-config");
    expect(args).toContain("--strict-mcp-config");
    expect(args).toContain("--system-prompt");
    expect(args).toContain("--append-system-prompt");
    expect(args).toContain("--betas");
    expect(args).toContain("--fork-session");
    expect(args).toContain("--ide");
  });

  test("Codex config accepts known keys", () => {
    const frontmatter: AgentFrontmatter = {
      codex: {
        sandbox: "workspace-write",
        approval: "on-failure",
        "full-auto": false,  // explicitly false
        oss: true,
        "local-provider": "ollama",
        cd: "/workspace",
        search: true,
        image: ["img.png"],
        profile: "default"
      }
    };

    const harness = new CodexHarness();
    const args = harness.buildArgs(makeContext(frontmatter));

    expect(args).toContain("--sandbox");
    expect(args).toContain("--ask-for-approval");
    expect(args).toContain("--oss");
    expect(args).toContain("--local-provider");
    expect(args).toContain("--cd");
    expect(args).toContain("--search");
    expect(args).toContain("--image");
    expect(args).toContain("--profile");
  });

  test("Gemini config accepts known keys", () => {
    const frontmatter: AgentFrontmatter = {
      gemini: {
        sandbox: true,
        yolo: false,  // explicitly false
        "approval-mode": "auto_edit",
        "allowed-tools": ["tool1"],
        extensions: ["code_execution"],
        resume: "latest",
        "allowed-mcp-server-names": ["server1"],
        "screen-reader": true,
      }
    };

    const harness = new GeminiHarness();
    const args = harness.buildArgs(makeContext(frontmatter));

    expect(args).toContain("--sandbox");
    expect(args).toContain("--approval-mode");
    expect(args).toContain("--extensions");
    expect(args).toContain("--allowed-mcp-server-names");
    expect(args).toContain("--screen-reader");
  });

  test("Copilot config accepts known keys", () => {
    const frontmatter: AgentFrontmatter = {
      copilot: {
        agent: "my-agent",
        silent: false,
        "allow-all-paths": true,
        stream: "always",
        banner: true,
        "no-color": true,
        "no-custom-instructions": true,
        "log-level": "info",
      }
    };

    const harness = new CopilotHarness();
    const args = harness.buildArgs(makeContext(frontmatter));

    expect(args).toContain("--agent");
    expect(args).not.toContain("--silent");  // silent: false
    expect(args).toContain("--allow-all-paths");
    expect(args).toContain("--stream");
    expect(args).toContain("--banner");
    expect(args).toContain("--no-color");
    expect(args).toContain("--no-custom-instructions");
    expect(args).toContain("--log-level");
  });
});

// =============================================================================
// EDGE CASES IN TYPE HANDLING
// =============================================================================

describe("Edge cases in type handling", () => {
  test("Empty string for model", () => {
    const frontmatter: AgentFrontmatter = { model: "" };
    const harness = new ClaudeHarness();
    // Empty model should either be skipped or passed through
    expect(() => harness.buildArgs(makeContext(frontmatter))).not.toThrow();
  });

  test("Zero for numeric fields", () => {
    const frontmatter: AgentFrontmatter = {
      codex: { timeout: 0 as any }
    };
    const harness = new CodexHarness();
    const args = harness.buildArgs(makeContext(frontmatter));
    // Zero should be converted to "0" string
    expect(args).toContain("0");
  });

  test("False for optional boolean fields", () => {
    const frontmatter: AgentFrontmatter = {
      debug: false,
      interactive: false
    };
    const harness = new CopilotHarness();
    const args = harness.buildArgs(makeContext(frontmatter));
    // debug: false should not add debug flag
    expect(args).not.toContain("--log-level");
    // interactive: false should add -p
    expect(args).toContain("-p");
  });

  test("Undefined in arrays", () => {
    const frontmatter: AgentFrontmatter = {
      dirs: ["/valid", undefined as any, "/also-valid"]
    };
    const harness = new ClaudeHarness();
    // Should handle undefined in array gracefully
    expect(() => harness.buildArgs(makeContext(frontmatter))).not.toThrow();
  });
});
