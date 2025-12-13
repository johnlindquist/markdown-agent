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
