import { expect, test, describe } from "bun:test";
import { parseFrontmatter } from "./parse";
import { substituteTemplateVars, extractTemplateVars } from "./template";
import { resolveCommand } from "./command";

/**
 * Tests for the _inputs system:
 * - _inputs: [varname] in frontmatter defines positional arguments
 * - CLI positional args fill template variables in the body
 * - {{ _varname }} in body gets replaced with the CLI arg value
 *
 * Note: Template variables must use underscore prefix (e.g., {{ _name }})
 * to be detected and prompted for. Non-underscore variables pass through as-is.
 */

describe("_inputs positional argument flow", () => {
  test("_inputs field defines template variables consumed from CLI", () => {
    const content = `---
_inputs: [_message]
---
Say: {{ _message }}`;

    const { frontmatter, body } = parseFrontmatter(content);

    // Simulate CLI: md file.md "Hello World"
    const cliArgs = ["Hello World"];
    const templateVars: Record<string, string> = {};

    // Consume positional args (same logic as index.ts)
    if (frontmatter._inputs && Array.isArray(frontmatter._inputs)) {
      for (let i = 0; i < frontmatter._inputs.length; i++) {
        const argName = frontmatter._inputs[i];
        const cliValue = cliArgs[i];
        if (i < cliArgs.length && argName && cliValue !== undefined) {
          templateVars[argName] = cliValue;
        }
      }
    }

    expect(templateVars).toEqual({ _message: "Hello World" });

    // Apply substitution
    const result = substituteTemplateVars(body, templateVars);
    expect(result).toBe("Say: Hello World");
  });

  test("multiple _inputs consume multiple positional CLI arguments", () => {
    const content = `---
_inputs: [_name, _action]
---
{{ _name }} will {{ _action }}`;

    const { frontmatter, body } = parseFrontmatter(content);

    // Simulate CLI: md file.md "Alice" "run"
    const cliArgs = ["Alice", "run"];
    const templateVars: Record<string, string> = {};

    if (frontmatter._inputs && Array.isArray(frontmatter._inputs)) {
      for (let i = 0; i < frontmatter._inputs.length; i++) {
        const argName = frontmatter._inputs[i];
        const cliValue = cliArgs[i];
        if (i < cliArgs.length && argName && cliValue !== undefined) {
          templateVars[argName] = cliValue;
        }
      }
    }

    expect(templateVars).toEqual({ _name: "Alice", _action: "run" });

    const result = substituteTemplateVars(body, templateVars);
    expect(result).toBe("Alice will run");
  });

  test("body consisting only of template var becomes the CLI arg", () => {
    const content = `---
_inputs: [_prompt]
---
{{ _prompt }}`;

    const { frontmatter, body } = parseFrontmatter(content);

    // Simulate CLI: md file.md "Write me a haiku about coding"
    const cliArgs = ["Write me a haiku about coding"];
    const templateVars: Record<string, string> = {};

    if (frontmatter._inputs && Array.isArray(frontmatter._inputs)) {
      for (let i = 0; i < frontmatter._inputs.length; i++) {
        const argName = frontmatter._inputs[i];
        const cliValue = cliArgs[i];
        if (i < cliArgs.length && argName && cliValue !== undefined) {
          templateVars[argName] = cliValue;
        }
      }
    }

    const result = substituteTemplateVars(body, templateVars);
    expect(result).toBe("Write me a haiku about coding");
  });

  test("missing underscore template variables are detected", () => {
    const body = "Hello {{ _name }}, welcome to {{ _place }}";
    const requiredVars = extractTemplateVars(body);

    expect(requiredVars).toContain("_name");
    expect(requiredVars).toContain("_place");

    // If only one is provided, the other is "missing"
    const templateVars = { _name: "Alice" };
    const missingVars = requiredVars.filter((v) => !(v in templateVars));

    expect(missingVars).toEqual(["_place"]);
  });

  test("non-underscore variables are not detected as missing", () => {
    const body = "Hello {{ name }}, welcome to {{ _place }}";
    const requiredVars = extractTemplateVars(body);

    // Only _place is detected (name is not underscore-prefixed)
    expect(requiredVars).toEqual(["_place"]);
  });
});

describe("$varname fields with defaults", () => {
  test("$varname field with default value", () => {
    const content = `---
$_feature_name: Authentication
---
Build {{ _feature_name }}`;

    const { frontmatter, body } = parseFrontmatter(content);

    // Extract $varname fields
    const namedVarFields = Object.keys(frontmatter).filter(
      (key) => key.startsWith("$") && !/^\$\d+$/.test(key)
    );

    const templateVars: Record<string, string> = {};

    // Use frontmatter default (no CLI override)
    for (const key of namedVarFields) {
      const varName = key.slice(1);
      const defaultValue = frontmatter[key];
      if (
        defaultValue !== undefined &&
        defaultValue !== null &&
        defaultValue !== ""
      ) {
        templateVars[varName] = String(defaultValue);
      }
    }

    expect(templateVars).toEqual({ _feature_name: "Authentication" });

    const result = substituteTemplateVars(body, templateVars);
    expect(result).toBe("Build Authentication");
  });

  test("CLI flag overrides $varname default", () => {
    const content = `---
$_feature_name: Authentication
---
Build {{ _feature_name }}`;

    const { frontmatter, body } = parseFrontmatter(content);

    // Simulate CLI: md file.md --_feature_name "Payments"
    const cliArgs = ["--_feature_name", "Payments"];

    const namedVarFields = Object.keys(frontmatter).filter(
      (key) => key.startsWith("$") && !/^\$\d+$/.test(key)
    );

    const templateVars: Record<string, string> = {};

    for (const key of namedVarFields) {
      const varName = key.slice(1);
      const defaultValue = frontmatter[key];

      // Look for --varname in CLI args
      const flagIndex = cliArgs.findIndex((arg) => arg === `--${varName}`);
      const flagValue = flagIndex !== -1 ? cliArgs[flagIndex + 1] : undefined;
      if (flagValue !== undefined) {
        templateVars[varName] = flagValue;
      } else if (
        defaultValue !== undefined &&
        defaultValue !== null &&
        defaultValue !== ""
      ) {
        templateVars[varName] = String(defaultValue);
      }
    }

    expect(templateVars).toEqual({ _feature_name: "Payments" });

    const result = substituteTemplateVars(body, templateVars);
    expect(result).toBe("Build Payments");
  });
});

describe("flag hijacking", () => {
  test("--_command flag is consumed and used as command", () => {
    // Simulate CLI: md generic.md --_command claude --model opus
    const cliArgs = ["--_command", "claude", "--model", "opus"];

    // Extract --_command flag (same logic as index.ts)
    let commandFromCli: string | undefined;
    const remainingArgs = [...cliArgs];

    const commandFlagIndex = remainingArgs.findIndex(
      (arg) => arg === "--_command" || arg === "-_c"
    );
    if (commandFlagIndex !== -1 && commandFlagIndex + 1 < remainingArgs.length) {
      commandFromCli = remainingArgs[commandFlagIndex + 1];
      remainingArgs.splice(commandFlagIndex, 2);
    }

    expect(commandFromCli).toBe("claude");
    expect(remainingArgs).toEqual(["--model", "opus"]); // --_command consumed
  });

  test("-_c short flag also works for command", () => {
    const cliArgs = ["-_c", "gemini", "--verbose"];
    const remainingArgs = [...cliArgs];

    let commandFromCli: string | undefined;
    const commandFlagIndex = remainingArgs.findIndex(
      (arg) => arg === "--_command" || arg === "-_c"
    );
    if (commandFlagIndex !== -1 && commandFlagIndex + 1 < remainingArgs.length) {
      commandFromCli = remainingArgs[commandFlagIndex + 1];
      remainingArgs.splice(commandFlagIndex, 2);
    }

    expect(commandFromCli).toBe("gemini");
    expect(remainingArgs).toEqual(["--verbose"]);
  });

  test("--_command takes priority over filename", () => {
    // If --_command is provided, it takes priority
    // (filename would give "codex" but --_command says "claude")
    const commandFromCli = "claude";
    const commandFromFilename = "codex"; // from task.codex.md

    const command = commandFromCli || commandFromFilename;
    expect(command).toBe("claude");
  });
});
