import { expect, test, describe } from "bun:test";
import {
  extractTemplateVars,
  substituteTemplateVars,
  parseTemplateArgs,
} from "./template";

describe("extractTemplateVars", () => {
  // Only underscore-prefixed variables are extracted
  // This prevents {{ model }} from consuming --model CLI flags

  test("extracts single underscore-prefixed variable", () => {
    const vars = extractTemplateVars("Hello {{ _name }}!");
    expect(vars).toEqual(["_name"]);
  });

  test("extracts multiple underscore-prefixed variables", () => {
    const vars = extractTemplateVars(
      "{{ _target }} references {{ _reference }}"
    );
    expect(vars).toEqual(["_target", "_reference"]);
  });

  test("ignores non-underscore-prefixed variables", () => {
    const vars = extractTemplateVars("{{ model }} and {{ _name }}");
    expect(vars).toEqual(["_name"]);
    expect(vars).not.toContain("model");
  });

  test("handles variable with no spaces", () => {
    const vars = extractTemplateVars("{{_name}}");
    expect(vars).toEqual(["_name"]);
  });

  test("handles variable with extra spaces", () => {
    const vars = extractTemplateVars("{{   _name   }}");
    expect(vars).toEqual(["_name"]);
  });

  test("deduplicates repeated variables", () => {
    const vars = extractTemplateVars("{{ _x }} and {{ _x }} again");
    expect(vars).toEqual(["_x"]);
  });

  test("returns empty array when no underscore variables", () => {
    const vars = extractTemplateVars("No variables here {{ regular }}");
    expect(vars).toEqual([]);
  });

  test("extracts variable from filter expression", () => {
    const vars = extractTemplateVars("{{ _name | upcase }}");
    expect(vars).toEqual(["_name"]);
  });

  // Logic tag tests ({% if/unless/elsif variable %})
  test("extracts underscore variable from if tag", () => {
    const vars = extractTemplateVars("{% if _debug %}DEBUG{% endif %}");
    expect(vars).toEqual(["_debug"]);
  });

  test("ignores non-underscore variable in if tag", () => {
    const vars = extractTemplateVars("{% if debug %}DEBUG{% endif %}");
    expect(vars).toEqual([]);
  });

  test("extracts underscore variable from unless tag", () => {
    const vars = extractTemplateVars("{% unless _silent %}Loud{% endunless %}");
    expect(vars).toEqual(["_silent"]);
  });

  test("extracts underscore variables from elsif tag", () => {
    const vars = extractTemplateVars("{% if _a %}A{% elsif _b %}B{% endif %}");
    expect(vars).toContain("_a");
    expect(vars).toContain("_b");
  });

  test("extracts underscore variables from comparison operators", () => {
    const vars = extractTemplateVars(
      '{% if _mode == "debug" %}DEBUG{% endif %}'
    );
    expect(vars).toEqual(["_mode"]);
  });

  test("extracts underscore variables from and/or conditions", () => {
    const vars = extractTemplateVars(
      "{% if _debug and _verbose %}VERBOSE DEBUG{% endif %}"
    );
    expect(vars).toContain("_debug");
    expect(vars).toContain("_verbose");
  });

  test("excludes Liquid operators and keywords", () => {
    const vars = extractTemplateVars(
      "{% if _debug and not _silent or _verbose %}test{% endif %}"
    );
    expect(vars).toContain("_debug");
    expect(vars).toContain("_silent");
    expect(vars).toContain("_verbose");
    expect(vars).not.toContain("and");
    expect(vars).not.toContain("not");
    expect(vars).not.toContain("or");
  });

  test("excludes true/false/nil keywords", () => {
    const vars = extractTemplateVars(
      "{% if _enabled == true %}yes{% endif %}"
    );
    expect(vars).toEqual(["_enabled"]);
    expect(vars).not.toContain("true");
  });

  test("excludes numeric values", () => {
    const vars = extractTemplateVars("{% if _count > 10 %}many{% endif %}");
    expect(vars).toEqual(["_count"]);
    expect(vars).not.toContain("10");
  });

  // Combined cases
  test("extracts underscore variables from both output and logic tags", () => {
    const content = `{% if _debug %}
      Debug: {{ _message }}
    {% endif %}`;
    const vars = extractTemplateVars(content);
    expect(vars).toContain("_debug");
    expect(vars).toContain("_message");
  });

  test("deduplicates underscore variables across output and logic tags", () => {
    const content = "{% if _name %}Hello {{ _name }}!{% endif %}";
    const vars = extractTemplateVars(content);
    expect(vars).toEqual(["_name"]);
  });

  test("handles complex template with multiple logic tags", () => {
    const content = `
      {% if _force %}--force{% endif %}
      {% unless _quiet %}echo "Processing {{ _file }}"{% endunless %}
      {% if _verbose and _debug %}--verbose --debug{% elsif _trace %}--trace{% endif %}
    `;
    const vars = extractTemplateVars(content);
    expect(vars).toContain("_force");
    expect(vars).toContain("_quiet");
    expect(vars).toContain("_file");
    expect(vars).toContain("_verbose");
    expect(vars).toContain("_debug");
    expect(vars).toContain("_trace");
  });

  // AST-specific tests (features that regex couldn't handle well)
  describe("AST-based extraction", () => {
    test("extracts root from nested variable access", () => {
      const vars = extractTemplateVars("{{ _user.name }}");
      expect(vars).toEqual(["_user"]);
    });

    test("extracts root from deeply nested access", () => {
      const vars = extractTemplateVars("{{ _config.database.host }}");
      expect(vars).toEqual(["_config"]);
    });

    test("handles chained filters", () => {
      const vars = extractTemplateVars("{{ _name | upcase | truncate: 10 }}");
      expect(vars).toEqual(["_name"]);
    });

    test("extracts underscore collection variable from for loop", () => {
      const vars = extractTemplateVars(
        "{% for item in _items %}{{ item.name }}{% endfor %}"
      );
      expect(vars).toEqual(["_items"]);
    });

    test("ignores variables inside comment blocks", () => {
      const vars = extractTemplateVars(
        "{% comment %}{{ _hidden }}{% endcomment %}{{ _visible }}"
      );
      expect(vars).toEqual(["_visible"]);
    });

    test("ignores variables inside raw blocks", () => {
      const vars = extractTemplateVars(
        "{% raw %}{{ _template_syntax }}{% endraw %}{{ _actual }}"
      );
      expect(vars).toEqual(["_actual"]);
    });

    test("handles variables with array index access", () => {
      const vars = extractTemplateVars("{{ _items[0].name }}");
      expect(vars).toEqual(["_items"]);
    });

    test("handles case/when statements with underscore vars", () => {
      const vars = extractTemplateVars(`
        {% case _status %}
          {% when 'active' %}{{ _active_message }}
          {% when 'pending' %}{{ _pending_message }}
        {% endcase %}
      `);
      expect(vars).toContain("_status");
      expect(vars).toContain("_active_message");
      expect(vars).toContain("_pending_message");
    });

    test("excludes locally assigned variables", () => {
      const vars = extractTemplateVars(
        "{% assign local = 'value' %}{{ local }}{{ _external }}"
      );
      expect(vars).toEqual(["_external"]);
    });

    test("excludes captured variables", () => {
      const vars = extractTemplateVars(
        "{% capture greeting %}Hello{% endcapture %}{{ greeting }}{{ _name }}"
      );
      expect(vars).toEqual(["_name"]);
    });

    test("handles contains operator with underscore variable", () => {
      const vars = extractTemplateVars(
        "{% if _haystack contains _needle %}found{% endif %}"
      );
      expect(vars).toContain("_haystack");
      expect(vars).toContain("_needle");
    });

    test("handles increment/decrement tags (exclude local counter)", () => {
      const vars = extractTemplateVars(
        "{% increment counter %}{{ _external }}"
      );
      expect(vars).toEqual(["_external"]);
    });

    test("returns empty array for malformed template", () => {
      const vars = extractTemplateVars("{{ unclosed");
      expect(vars).toEqual([]);
    });

    test("handles empty template", () => {
      const vars = extractTemplateVars("");
      expect(vars).toEqual([]);
    });

    test("handles template with only static content", () => {
      const vars = extractTemplateVars("Hello, World!");
      expect(vars).toEqual([]);
    });
  });

  // Test that non-underscore variables are intentionally ignored
  describe("namespace collision prevention", () => {
    test("{{ model }} does not consume --model CLI flag", () => {
      const vars = extractTemplateVars("Use model {{ model }} for this task");
      expect(vars).toEqual([]);
    });

    test("{{ verbose }} does not consume --verbose CLI flag", () => {
      const vars = extractTemplateVars(
        "{% if verbose %}be verbose{% endif %}"
      );
      expect(vars).toEqual([]);
    });

    test("mixed underscore and non-underscore variables", () => {
      const vars = extractTemplateVars(
        "{{ model }} with {{ _custom_var }} and {{ output }}"
      );
      expect(vars).toEqual(["_custom_var"]);
      expect(vars).not.toContain("model");
      expect(vars).not.toContain("output");
    });
  });
});

describe("substituteTemplateVars", () => {
  test("substitutes single variable", () => {
    const result = substituteTemplateVars("Hello {{ _name }}!", {
      _name: "World",
    });
    expect(result).toBe("Hello World!");
  });

  test("substitutes multiple variables", () => {
    const result = substituteTemplateVars(
      "Refactor {{ _target }} to match {{ _reference }}",
      { _target: "src/utils.ts", _reference: "src/main.ts" }
    );
    expect(result).toBe("Refactor src/utils.ts to match src/main.ts");
  });

  test("handles repeated variables", () => {
    const result = substituteTemplateVars("{{ _x }} + {{ _x }} = 2x", {
      _x: "1",
    });
    expect(result).toBe("1 + 1 = 2x");
  });

  test("renders unknown variables as empty by default", () => {
    const result = substituteTemplateVars("{{ _known }} and {{ _unknown }}", {
      _known: "yes",
    });
    expect(result).toBe("yes and ");
  });

  test("uses default filter for fallback values", () => {
    const result = substituteTemplateVars(
      'Hello {{ _name | default: "World" }}!',
      {}
    );
    expect(result).toBe("Hello World!");
  });

  test("throws in strict mode for missing underscore variables", () => {
    expect(() =>
      substituteTemplateVars("{{ _missing }}", {}, { strict: true })
    ).toThrow("Missing required template variable: _missing");
  });

  test("throws in strict mode for missing underscore variables in logic tags", () => {
    expect(() =>
      substituteTemplateVars(
        "{% if _debug %}DEBUG{% endif %}",
        {},
        { strict: true }
      )
    ).toThrow("Missing required template variable: _debug");
  });

  test("strict mode passes when underscore logic tag variables are provided", () => {
    const result = substituteTemplateVars(
      "{% if _debug %}DEBUG{% endif %}",
      { _debug: "true" },
      { strict: true }
    );
    expect(result).toBe("DEBUG");
  });

  test("supports conditionals", () => {
    const result = substituteTemplateVars(
      "{% if _force %}--force{% endif %}",
      { _force: "true" }
    );
    expect(result).toBe("--force");
  });

  test("supports conditional else", () => {
    const result = substituteTemplateVars(
      "{% if _debug %}DEBUG{% else %}PRODUCTION{% endif %}",
      {}
    );
    expect(result).toBe("PRODUCTION");
  });

  test("supports upcase filter", () => {
    const result = substituteTemplateVars("{{ _name | upcase }}", {
      _name: "hello",
    });
    expect(result).toBe("HELLO");
  });

  test("supports downcase filter", () => {
    const result = substituteTemplateVars("{{ _name | downcase }}", {
      _name: "HELLO",
    });
    expect(result).toBe("hello");
  });

  // Test shell_escape filter
  describe("shell_escape filter", () => {
    test("escapes single quotes in POSIX mode", () => {
      const result = substituteTemplateVars("{{ _cmd | shell_escape }}", {
        _cmd: "it's a test",
      });
      if (process.platform === "win32") {
        expect(result).toBe("\"it's a test\"");
      } else {
        expect(result).toBe("'it'\\''s a test'");
      }
    });

    test("escapes via q alias", () => {
      const result = substituteTemplateVars("{{ _cmd | q }}", {
        _cmd: "test value",
      });
      if (process.platform === "win32") {
        expect(result).toBe('"test value"');
      } else {
        expect(result).toBe("'test value'");
      }
    });

    test("handles empty string", () => {
      const result = substituteTemplateVars("{{ _cmd | shell_escape }}", {
        _cmd: "",
      });
      if (process.platform === "win32") {
        expect(result).toBe('""');
      } else {
        expect(result).toBe("''");
      }
    });

    test("handles special characters", () => {
      const result = substituteTemplateVars("{{ _cmd | shell_escape }}", {
        _cmd: "$(whoami)",
      });
      if (process.platform === "win32") {
        expect(result).toBe('"$(whoami)"');
      } else {
        expect(result).toBe("'$(whoami)'");
      }
    });
  });
});

describe("parseTemplateArgs", () => {
  const knownFlags = new Set(["--model", "-m", "--silent"]);

  test("parses simple template arg", () => {
    const args = ["--_target", "src/utils.ts"];
    const vars = parseTemplateArgs(args, knownFlags);
    expect(vars).toEqual({ _target: "src/utils.ts" });
  });

  test("parses multiple template args", () => {
    const args = ["--_target", "src/utils.ts", "--_reference", "src/main.ts"];
    const vars = parseTemplateArgs(args, knownFlags);
    expect(vars).toEqual({ _target: "src/utils.ts", _reference: "src/main.ts" });
  });

  test("ignores known flags", () => {
    const args = ["--model", "gpt-5", "--_target", "file.ts", "--silent"];
    const vars = parseTemplateArgs(args, knownFlags);
    expect(vars).toEqual({ _target: "file.ts" });
  });

  test("handles boolean template flags", () => {
    const args = ["--_force", "--_target", "file.ts"];
    const vars = parseTemplateArgs(args, knownFlags);
    expect(vars).toEqual({ _force: "true", _target: "file.ts" });
  });

  test("handles paths with special characters", () => {
    const args = ["--_path", "/Users/name/My Documents/file.ts"];
    const vars = parseTemplateArgs(args, knownFlags);
    expect(vars).toEqual({ _path: "/Users/name/My Documents/file.ts" });
  });

  test("returns empty object when no template args", () => {
    const args = ["--model", "gpt-5", "--silent"];
    const vars = parseTemplateArgs(args, knownFlags);
    expect(vars).toEqual({});
  });
});
