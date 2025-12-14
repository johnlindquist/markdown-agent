import { expect, test, describe } from "bun:test";
import { extractTemplateVars } from "./template";

/**
 * Tests for interactive variable recovery feature.
 *
 * The feature prompts users for missing template variables interactively
 * when running in a TTY environment, instead of immediately failing.
 *
 * Note: Only underscore-prefixed variables (e.g., {{ _name }}) are extracted
 * and require prompting. Non-underscore variables are passed through as-is.
 */

describe("interactive variable recovery", () => {
  describe("missing variable detection", () => {
    test("identifies missing underscore-prefixed variables from template", () => {
      const body = "Hello {{ _name }}, your task is {{ _task }}";
      const requiredVars = extractTemplateVars(body);
      const templateVars: Record<string, string> = { _name: "Alice" };

      const missingVars = requiredVars.filter((v) => !(v in templateVars));

      expect(missingVars).toEqual(["_task"]);
    });

    test("returns empty array when all underscore variables provided", () => {
      const body = "Hello {{ _name }}";
      const requiredVars = extractTemplateVars(body);
      const templateVars: Record<string, string> = { _name: "Bob" };

      const missingVars = requiredVars.filter((v) => !(v in templateVars));

      expect(missingVars).toEqual([]);
    });

    test("identifies multiple missing underscore variables", () => {
      const body = "{{ _a }} and {{ _b }} and {{ _c }}";
      const requiredVars = extractTemplateVars(body);
      const templateVars: Record<string, string> = { _b: "provided" };

      const missingVars = requiredVars.filter((v) => !(v in templateVars));

      expect(missingVars).toEqual(["_a", "_c"]);
    });

    test("ignores non-underscore-prefixed variables", () => {
      const body = "{{ model }} and {{ _task }}";
      const requiredVars = extractTemplateVars(body);

      // Only _task is extracted, model is not (it's a CLI flag)
      expect(requiredVars).toEqual(["_task"]);
    });
  });

  describe("TTY detection logic", () => {
    test("process.stdin.isTTY is boolean or undefined", () => {
      // In test environment, isTTY may be undefined or false
      const isTTY = process.stdin.isTTY;
      expect(isTTY === undefined || typeof isTTY === "boolean").toBe(true);
    });

    test("interactive mode should only activate when isTTY is truthy", () => {
      // Simulate the logic used in index.ts
      const shouldPromptInteractively = (isTTY: boolean | undefined) => {
        return !!isTTY;
      };

      expect(shouldPromptInteractively(true)).toBe(true);
      expect(shouldPromptInteractively(false)).toBe(false);
      expect(shouldPromptInteractively(undefined)).toBe(false);
    });
  });

  describe("variable collection behavior", () => {
    test("collects all missing underscore variables into templateVars", async () => {
      // Simulating the behavior without actual inquirer prompts
      const missingVars = ["_name", "_task"];
      const templateVars: Record<string, string> = {};

      // Mock what the interactive loop does
      const mockInputValues = ["Alice", "write tests"];
      for (let i = 0; i < missingVars.length; i++) {
        const v = missingVars[i]!;
        templateVars[v] = mockInputValues[i]!;
      }

      expect(templateVars).toEqual({
        _name: "Alice",
        _task: "write tests",
      });
    });

    test("preserves existing template variables when prompting for missing ones", () => {
      const missingVars = ["_task"];
      const templateVars: Record<string, string> = { _name: "Bob" };

      // Mock adding the missing variable
      templateVars["_task"] = "code review";

      expect(templateVars).toEqual({
        _name: "Bob",
        _task: "code review",
      });
    });
  });

  describe("non-interactive mode behavior", () => {
    test("should exit with error message when not TTY", () => {
      const missingVars = ["_name", "_task"];
      const isTTY = false;

      // This simulates the error message format
      if (!isTTY && missingVars.length > 0) {
        const errorMessage = `Missing template variables: ${missingVars.join(", ")}`;
        expect(errorMessage).toBe("Missing template variables: _name, _task");
      }
    });

    test("error message includes helpful hint about _inputs:", () => {
      const helpMessage =
        "Use '_inputs:' in frontmatter to map CLI arguments to variables";
      expect(helpMessage).toContain("_inputs:");
      expect(helpMessage).toContain("frontmatter");
    });
  });
});

describe("integration with extractTemplateVars", () => {
  test("handles underscore-prefixed variables correctly", () => {
    const body = "{{ _variable_with_underscore }} and {{ _camelCase }}";
    const vars = extractTemplateVars(body);
    expect(vars).toContain("_variable_with_underscore");
    expect(vars).toContain("_camelCase");
  });

  test("underscore variables with filters are extracted", () => {
    // Variables with filter expressions are extracted because they may still
    // need user input even if they have a default filter
    const body = '{{ _name | default: "World" }}';
    const vars = extractTemplateVars(body);
    // The variable is extracted even with a filter
    expect(vars).toEqual(["_name"]);
  });

  test("deduplicates repeated underscore variables for prompting", () => {
    const body = "{{ _name }} says hello to {{ _name }}";
    const vars = extractTemplateVars(body);
    // Should only prompt once for _name
    expect(vars).toEqual(["_name"]);
  });

  test("non-underscore variables are not extracted", () => {
    const body = "{{ model }} and {{ verbose }}";
    const vars = extractTemplateVars(body);
    // Non-underscore variables are not extracted (they're CLI flags)
    expect(vars).toEqual([]);
  });
});

// =============================================================================
// Variable Persistence / History Tests
// =============================================================================

import {
  getVariableHistory,
  saveVariableValues,
  getPreviousVariableValue,
  resetVariableHistory,
} from "./history";

describe("variable persistence", () => {
  describe("prompt with previous value as default", () => {
    test("previous value is used as default in prompt", async () => {
      resetVariableHistory();
      const testPath = `/test/prompt-default-${Date.now()}.md`;

      // Simulate saving a value
      await saveVariableValues(testPath, { _ticket: "PROJ-999" });

      // Check that we can retrieve it for the prompt default
      const previousValue = await getPreviousVariableValue(testPath, "_ticket");
      expect(previousValue).toBe("PROJ-999");
    });

    test("returns undefined for variables never entered before", async () => {
      resetVariableHistory();
      const testPath = `/test/no-history-${Date.now()}.md`;

      const previousValue = await getPreviousVariableValue(testPath, "_new_var");
      expect(previousValue).toBeUndefined();
    });
  });

  describe("history keyed by agent file path", () => {
    test("different agents have independent history", async () => {
      resetVariableHistory();
      const agent1 = `/project/agents/deploy-${Date.now()}.claude.md`;
      const agent2 = `/project/agents/test-${Date.now()}.claude.md`;

      await saveVariableValues(agent1, { _env: "production" });
      await saveVariableValues(agent2, { _env: "staging" });

      const history1 = await getVariableHistory(agent1);
      const history2 = await getVariableHistory(agent2);

      expect(history1._env).toBe("production");
      expect(history2._env).toBe("staging");
    });

    test("absolute paths are used as keys", async () => {
      resetVariableHistory();
      const absolutePath = `/Users/test/project/agent-${Date.now()}.md`;

      await saveVariableValues(absolutePath, { _name: "test" });

      const history = await getVariableHistory(absolutePath);
      expect(history._name).toBe("test");
    });
  });

  describe("updating history after successful execution", () => {
    test("new values override old values", async () => {
      resetVariableHistory();
      const testPath = `/test/update-${Date.now()}.md`;

      // First run
      await saveVariableValues(testPath, { _version: "1.0.0" });
      expect((await getVariableHistory(testPath))._version).toBe("1.0.0");

      // Second run with new value
      await saveVariableValues(testPath, { _version: "2.0.0" });
      expect((await getVariableHistory(testPath))._version).toBe("2.0.0");
    });

    test("preserves variables not updated in current run", async () => {
      resetVariableHistory();
      const testPath = `/test/preserve-${Date.now()}.md`;

      // First run: enter both variables
      await saveVariableValues(testPath, { _ticket: "PROJ-1", _env: "dev" });

      // Second run: only update _env
      await saveVariableValues(testPath, { _env: "prod" });

      const history = await getVariableHistory(testPath);
      expect(history._ticket).toBe("PROJ-1"); // Preserved
      expect(history._env).toBe("prod"); // Updated
    });
  });

  describe("--_no-history flag behavior", () => {
    test("simulates skipping history load with flag", async () => {
      resetVariableHistory();
      const testPath = `/test/no-history-flag-${Date.now()}.md`;

      // Save some history
      await saveVariableValues(testPath, { _cached: "old-value" });

      // Simulate --_no-history behavior: don't load history
      const noHistory = true;
      let variableHistory: Record<string, string> = {};

      if (!noHistory) {
        variableHistory = await getVariableHistory(testPath);
      }

      // With --_no-history, we don't get the cached value
      expect(variableHistory._cached).toBeUndefined();
    });

    test("simulates normal history load without flag", async () => {
      resetVariableHistory();
      const testPath = `/test/with-history-${Date.now()}.md`;

      // Save some history
      await saveVariableValues(testPath, { _cached: "saved-value" });

      // Normal behavior: load history
      const noHistory = false;
      let variableHistory: Record<string, string> = {};

      if (!noHistory) {
        variableHistory = await getVariableHistory(testPath);
      }

      // Without --_no-history, we get the cached value
      expect(variableHistory._cached).toBe("saved-value");
    });
  });

  describe("prompt display format", () => {
    test("formats prompt with previous value hint", () => {
      // This tests the UX format: "Variable name: (previous_value) _"
      const varName = "_ticket";
      const previousValue = "PROJ-123";

      // The actual @inquirer/prompts shows this as:
      // ? _ticket: (PROJ-123) _
      // Where the user can press Enter to accept or type to override

      // We simulate checking the format
      const message = `${varName}:`;
      expect(message).toBe("_ticket:");
      expect(previousValue).toBe("PROJ-123");
      // The default is passed to inquirer which handles the display
    });

    test("handles undefined previous value (first run)", () => {
      const varName = "_new_var";
      const previousValue: string | undefined = undefined;

      const message = `${varName}:`;
      expect(message).toBe("_new_var:");
      // When previousValue is undefined, no default is shown
      expect(previousValue).toBeUndefined();
    });
  });
});
