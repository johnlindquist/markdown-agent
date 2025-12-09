/**
 * Tests for the Tool Adapter pattern
 */

import { expect, test, describe, beforeEach } from "bun:test";
import {
  getAdapter,
  hasAdapter,
  registerAdapter,
  getRegisteredAdapters,
  buildBuiltinDefaults,
  clearAdapterRegistry,
  getDefaultAdapter,
} from "./index";
import { claudeAdapter } from "./claude";
import { copilotAdapter } from "./copilot";
import { codexAdapter } from "./codex";
import { geminiAdapter } from "./gemini";
import type { ToolAdapter, AgentFrontmatter } from "../types";

describe("Tool Adapter Registry", () => {
  describe("built-in adapters", () => {
    test("claude adapter is registered", () => {
      expect(hasAdapter("claude")).toBe(true);
    });

    test("copilot adapter is registered", () => {
      expect(hasAdapter("copilot")).toBe(true);
    });

    test("codex adapter is registered", () => {
      expect(hasAdapter("codex")).toBe(true);
    });

    test("gemini adapter is registered", () => {
      expect(hasAdapter("gemini")).toBe(true);
    });

    test("getRegisteredAdapters returns all built-in adapters", () => {
      const adapters = getRegisteredAdapters();
      expect(adapters).toContain("claude");
      expect(adapters).toContain("copilot");
      expect(adapters).toContain("codex");
      expect(adapters).toContain("gemini");
    });
  });

  describe("getAdapter", () => {
    test("returns specific adapter for known tool", () => {
      const adapter = getAdapter("claude");
      expect(adapter.name).toBe("claude");
    });

    test("returns default adapter for unknown tool", () => {
      const adapter = getAdapter("unknown-tool");
      expect(adapter.name).toBe("default");
    });
  });

  describe("buildBuiltinDefaults", () => {
    test("generates correct defaults from adapters", () => {
      const defaults = buildBuiltinDefaults();

      // Claude defaults
      expect(defaults.claude).toBeDefined();
      expect(defaults.claude.print).toBe(true);

      // Copilot defaults
      expect(defaults.copilot).toBeDefined();
      expect(defaults.copilot.$1).toBe("prompt");
      expect(defaults.copilot.silent).toBe(true);

      // Codex defaults
      expect(defaults.codex).toBeDefined();
      expect(defaults.codex._subcommand).toBe("exec");

      // Gemini has no defaults (empty object not included)
      // Actually, gemini returns empty object, so it won't be in defaults
    });
  });

  describe("custom adapter registration", () => {
    // Note: We need to be careful with registration in tests since it affects global state
    test("can register a custom adapter", () => {
      const customAdapter: ToolAdapter = {
        name: "my-custom-tool",
        getDefaults() {
          return { verbose: true };
        },
        applyInteractiveMode(frontmatter) {
          return { ...frontmatter, interactive: true };
        },
      };

      registerAdapter(customAdapter);
      expect(hasAdapter("my-custom-tool")).toBe(true);

      const adapter = getAdapter("my-custom-tool");
      expect(adapter.name).toBe("my-custom-tool");
      expect(adapter.getDefaults()).toEqual({ verbose: true });
    });
  });
});

describe("Claude Adapter", () => {
  test("has correct name", () => {
    expect(claudeAdapter.name).toBe("claude");
  });

  test("getDefaults returns print mode settings", () => {
    const defaults = claudeAdapter.getDefaults();
    expect(defaults.print).toBe(true);
  });

  test("applyInteractiveMode removes print flag", () => {
    const frontmatter: AgentFrontmatter = {
      print: true,
      model: "opus",
    };

    const result = claudeAdapter.applyInteractiveMode(frontmatter);
    expect(result.print).toBeUndefined();
    expect(result.model).toBe("opus");
  });

  test("applyInteractiveMode preserves other settings", () => {
    const frontmatter: AgentFrontmatter = {
      print: true,
      model: "opus",
      verbose: true,
    };

    const result = claudeAdapter.applyInteractiveMode(frontmatter);
    expect(result.model).toBe("opus");
    expect(result.verbose).toBe(true);
  });
});

describe("Copilot Adapter", () => {
  test("has correct name", () => {
    expect(copilotAdapter.name).toBe("copilot");
  });

  test("getDefaults returns prompt mapping and silent mode", () => {
    const defaults = copilotAdapter.getDefaults();
    expect(defaults.$1).toBe("prompt");
    expect(defaults.silent).toBe(true);
  });

  test("applyInteractiveMode changes $1 to interactive", () => {
    const frontmatter: AgentFrontmatter = {
      $1: "prompt",
      silent: true,
    };

    const result = copilotAdapter.applyInteractiveMode(frontmatter);
    expect(result.$1).toBe("interactive");
    expect(result.silent).toBe(true);
  });
});

describe("Codex Adapter", () => {
  test("has correct name", () => {
    expect(codexAdapter.name).toBe("codex");
  });

  test("getDefaults returns exec subcommand", () => {
    const defaults = codexAdapter.getDefaults();
    expect(defaults._subcommand).toBe("exec");
  });

  test("applyInteractiveMode removes _subcommand", () => {
    const frontmatter: AgentFrontmatter = {
      _subcommand: "exec",
      model: "gpt-4",
    };

    const result = codexAdapter.applyInteractiveMode(frontmatter);
    expect(result._subcommand).toBeUndefined();
    expect(result.model).toBe("gpt-4");
  });
});

describe("Gemini Adapter", () => {
  test("has correct name", () => {
    expect(geminiAdapter.name).toBe("gemini");
  });

  test("getDefaults returns empty object (one-shot is default)", () => {
    const defaults = geminiAdapter.getDefaults();
    expect(Object.keys(defaults).length).toBe(0);
  });

  test("applyInteractiveMode adds prompt-interactive flag", () => {
    const frontmatter: AgentFrontmatter = {
      model: "pro",
    };

    const result = geminiAdapter.applyInteractiveMode(frontmatter);
    expect(result.$1).toBe("prompt-interactive");
    expect(result.model).toBe("pro");
  });
});

describe("Default Adapter", () => {
  test("has name 'default'", () => {
    const adapter = getDefaultAdapter();
    expect(adapter.name).toBe("default");
  });

  test("getDefaults returns empty object", () => {
    const adapter = getDefaultAdapter();
    expect(adapter.getDefaults()).toEqual({});
  });

  test("applyInteractiveMode returns copy without modifications", () => {
    const adapter = getDefaultAdapter();
    const frontmatter: AgentFrontmatter = {
      custom: "value",
      flag: true,
    };

    const result = adapter.applyInteractiveMode(frontmatter);
    expect(result).toEqual(frontmatter);
    // Ensure it's a copy, not the same object
    expect(result).not.toBe(frontmatter);
  });
});
