import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import type {
  UserInterface,
  TestUIConfig,
  Choice,
  RecordedPrompt,
} from "./ui";
import {
  ConsoleUI,
  TestUI,
  getUI,
  setUI,
  resetUI,
  createAutoApproveUI,
  createAutoRejectUI,
} from "./ui";

describe("TestUI", () => {
  describe("confirm", () => {
    test("returns default value when no config", async () => {
      const ui = new TestUI();
      const result = await ui.confirm("Test message?");
      expect(result).toBe(false); // default is false
    });

    test("returns configured confirmResponse", async () => {
      const ui = new TestUI({ confirmResponse: true });
      const result = await ui.confirm("Test message?");
      expect(result).toBe(true);
    });

    test("matches confirmResponses by string pattern", async () => {
      const ui = new TestUI({
        confirmResponse: false,
        confirmResponses: new Map([
          ["approve", true],
          ["reject", false],
        ]),
      });

      expect(await ui.confirm("Do you approve this?")).toBe(true);
      expect(await ui.confirm("Should we reject?")).toBe(false);
      expect(await ui.confirm("Unknown question")).toBe(false);
    });

    test("matches confirmResponses by regex pattern", async () => {
      const ui = new TestUI({
        confirmResponses: new Map([
          [/execute.*agent/i, true],
          [/delete/i, false],
        ]),
      });

      expect(await ui.confirm("Execute remote agent?")).toBe(true);
      expect(await ui.confirm("Delete all files?")).toBe(false);
    });

    test("records prompts for inspection", async () => {
      const ui = new TestUI({ confirmResponse: true });

      await ui.confirm("First question?");
      await ui.confirm("Second question?", true);

      const prompts = ui.getPrompts();
      expect(prompts.length).toBe(2);
      expect(prompts[0]).toEqual({
        type: "confirm",
        message: "First question?",
        defaultValue: false,
        response: true,
      });
      expect(prompts[1]).toEqual({
        type: "confirm",
        message: "Second question?",
        defaultValue: true,
        response: true,
      });
    });
  });

  describe("select", () => {
    const choices: Choice<string>[] = [
      { name: "Option A", value: "a" },
      { name: "Option B", value: "b" },
      { name: "Option C", value: "c" },
    ];

    test("returns first choice by default", async () => {
      const ui = new TestUI();
      const result = await ui.select("Pick one:", choices);
      expect(result).toBe("a");
    });

    test("returns choice by index", async () => {
      const ui = new TestUI({ selectResponse: 1 });
      const result = await ui.select("Pick one:", choices);
      expect(result).toBe("b");
    });

    test("returns choice by value", async () => {
      const ui = new TestUI({ selectResponse: "c" });
      const result = await ui.select("Pick one:", choices);
      expect(result).toBe("c");
    });

    test("matches selectResponses by pattern", async () => {
      const ui = new TestUI({
        selectResponses: new Map([
          ["Trust this domain", 1], // "yes" option (index 1)
          ["Select agent", 0], // first option
        ]),
      });

      expect(await ui.select("Trust this domain?", [
        { name: "No", value: "no" },
        { name: "Yes", value: "yes" },
      ])).toBe("yes");

      expect(await ui.select("Select agent:", choices)).toBe("a");
    });

    test("uses defaultValue when provided and no match", async () => {
      const ui = new TestUI();
      const result = await ui.select("Pick one:", choices, "b");
      expect(result).toBe("b");
    });

    test("records prompts with choices", async () => {
      const ui = new TestUI({ selectResponse: 1 });
      await ui.select("Pick one:", choices);

      const prompts = ui.getPrompts();
      expect(prompts.length).toBe(1);
      expect(prompts[0]!.type).toBe("select");
      expect(prompts[0]!.message).toBe("Pick one:");
      expect(prompts[0]!.choices).toEqual(choices);
      expect(prompts[0]!.response).toBe("b");
    });
  });

  describe("input", () => {
    test("returns empty string by default", async () => {
      const ui = new TestUI();
      const result = await ui.input("Enter name:");
      expect(result).toBe("");
    });

    test("returns configured inputResponse", async () => {
      const ui = new TestUI({ inputResponse: "John" });
      const result = await ui.input("Enter name:");
      expect(result).toBe("John");
    });

    test("returns defaultValue when no inputResponse", async () => {
      const ui = new TestUI();
      const result = await ui.input("Enter name:", "DefaultName");
      expect(result).toBe("DefaultName");
    });

    test("matches inputResponses by pattern", async () => {
      const ui = new TestUI({
        inputResponses: new Map([
          ["name", "Alice"],
          ["email", "alice@example.com"],
        ]),
      });

      expect(await ui.input("Enter name:")).toBe("Alice");
      expect(await ui.input("Enter email:")).toBe("alice@example.com");
      expect(await ui.input("Enter age:")).toBe("");
    });

    test("records prompts for inspection", async () => {
      const ui = new TestUI({ inputResponse: "test value" });
      await ui.input("Enter something:", "default");

      const prompts = ui.getPrompts();
      expect(prompts.length).toBe(1);
      expect(prompts[0]).toEqual({
        type: "input",
        message: "Enter something:",
        defaultValue: "default",
        response: "test value",
      });
    });
  });

  describe("logging", () => {
    test("captures logs when configured", () => {
      const ui = new TestUI({ captureLogs: true });

      ui.log("Info message");
      ui.error("Error message");
      ui.warn("Warning message");

      expect(ui.getLogs()).toEqual(["Info message"]);
      expect(ui.getErrors()).toEqual(["Error message"]);
      expect(ui.getWarnings()).toEqual(["Warning message"]);
    });

    test("does not capture logs when not configured", () => {
      const ui = new TestUI({ captureLogs: false });

      ui.log("Info message");
      ui.error("Error message");
      ui.warn("Warning message");

      expect(ui.getLogs()).toEqual([]);
      expect(ui.getErrors()).toEqual([]);
      expect(ui.getWarnings()).toEqual([]);
    });
  });

  describe("reset", () => {
    test("clears all recorded data", async () => {
      const ui = new TestUI({
        confirmResponse: true,
        captureLogs: true,
      });

      await ui.confirm("Question?");
      ui.log("Log message");
      ui.error("Error message");

      expect(ui.getPrompts().length).toBe(1);
      expect(ui.getLogs().length).toBe(1);
      expect(ui.getErrors().length).toBe(1);

      ui.reset();

      expect(ui.getPrompts()).toEqual([]);
      expect(ui.getLogs()).toEqual([]);
      expect(ui.getErrors()).toEqual([]);
    });
  });

  describe("setConfig", () => {
    test("updates configuration", async () => {
      const ui = new TestUI({ confirmResponse: false });

      expect(await ui.confirm("Test?")).toBe(false);

      ui.setConfig({ confirmResponse: true });

      expect(await ui.confirm("Test?")).toBe(true);
    });
  });
});

describe("global UI management", () => {
  let originalUI: UserInterface;

  beforeEach(() => {
    originalUI = getUI();
  });

  afterEach(() => {
    setUI(originalUI);
  });

  test("default UI is ConsoleUI", () => {
    resetUI();
    const ui = getUI();
    expect(ui).toBeInstanceOf(ConsoleUI);
  });

  test("setUI changes global UI", () => {
    const testUI = new TestUI();
    setUI(testUI);
    expect(getUI()).toBe(testUI);
  });

  test("resetUI restores ConsoleUI", () => {
    const testUI = new TestUI();
    setUI(testUI);
    expect(getUI()).toBe(testUI);

    resetUI();
    expect(getUI()).toBeInstanceOf(ConsoleUI);
  });
});

describe("createAutoApproveUI", () => {
  test("creates UI that approves all confirms", async () => {
    const ui = createAutoApproveUI();

    expect(await ui.confirm("Execute?")).toBe(true);
    expect(await ui.confirm("Delete?")).toBe(true);
    expect(await ui.confirm("Trust?")).toBe(true);
  });

  test("selects first option by default", async () => {
    const ui = createAutoApproveUI();

    const result = await ui.select("Choose:", [
      { name: "First", value: "first" },
      { name: "Second", value: "second" },
    ]);

    expect(result).toBe("first");
  });

  test("captures logs by default", () => {
    const ui = createAutoApproveUI();
    ui.log("Test message");
    expect(ui.getLogs()).toEqual(["Test message"]);
  });

  test("can disable log capture", () => {
    const ui = createAutoApproveUI({ captureLogs: false });
    ui.log("Test message");
    expect(ui.getLogs()).toEqual([]);
  });
});

describe("createAutoRejectUI", () => {
  test("creates UI that rejects all confirms", async () => {
    const ui = createAutoRejectUI();

    expect(await ui.confirm("Execute?")).toBe(false);
    expect(await ui.confirm("Delete?")).toBe(false);
    expect(await ui.confirm("Trust?")).toBe(false);
  });

  test("captures logs by default", () => {
    const ui = createAutoRejectUI();
    ui.error("Error message");
    expect(ui.getErrors()).toEqual(["Error message"]);
  });
});

describe("trust flow simulation", () => {
  test("auto-approve trust flow", async () => {
    const ui = new TestUI({
      confirmResponse: true, // approve execution
      selectResponse: 1, // "yes, trust domain" (second option)
      captureLogs: true,
    });

    // Simulate promptForTrust behavior
    const approved = await ui.confirm("Execute this remote agent from example.com?");
    expect(approved).toBe(true);

    const trustChoice = await ui.select<string>(
      "Trust example.com for future executions?",
      [
        { name: "No, ask me next time", value: "no" },
        { name: "Yes, always trust example.com", value: "yes" },
      ]
    );
    expect(trustChoice).toBe("yes");

    // Verify prompts were recorded correctly
    const prompts = ui.getPrompts();
    expect(prompts.length).toBe(2);
    expect(prompts[0]!.type).toBe("confirm");
    expect(prompts[0]!.message).toContain("Execute");
    expect(prompts[1]!.type).toBe("select");
    expect(prompts[1]!.message).toContain("Trust");
  });

  test("auto-reject trust flow", async () => {
    const ui = new TestUI({
      confirmResponse: false, // reject execution
      captureLogs: true,
    });

    const approved = await ui.confirm("Execute this remote agent from example.com?");
    expect(approved).toBe(false);

    // Should not prompt for trust since execution was rejected
    const prompts = ui.getPrompts();
    expect(prompts.length).toBe(1);
    expect(prompts[0]!.response).toBe(false);
  });

  test("approve execution but decline trust", async () => {
    const ui = new TestUI({
      confirmResponse: true,
      selectResponse: 0, // "no, ask me next time" (first option)
      captureLogs: true,
    });

    const approved = await ui.confirm("Execute?");
    expect(approved).toBe(true);

    const trustChoice = await ui.select<string>(
      "Trust domain?",
      [
        { name: "No, ask me next time", value: "no" },
        { name: "Yes, always trust", value: "yes" },
      ]
    );
    expect(trustChoice).toBe("no");
  });
});

describe("interactive variable input simulation", () => {
  test("simulates missing variable input", async () => {
    const ui = new TestUI({
      inputResponses: new Map([
        ["name:", "Alice"],
        ["task:", "write tests"],
      ]),
      captureLogs: true,
    });

    const missingVars = ["name", "task"];
    const templateVars: Record<string, string> = {};

    for (const v of missingVars) {
      templateVars[v] = await ui.input(`${v}:`);
    }

    expect(templateVars).toEqual({
      name: "Alice",
      task: "write tests",
    });

    const prompts = ui.getPrompts();
    expect(prompts.length).toBe(2);
    expect(prompts[0]!.message).toBe("name:");
    expect(prompts[1]!.message).toBe("task:");
  });

  test("uses default values for unmatched inputs", async () => {
    const ui = new TestUI({
      inputResponse: "default-value",
    });

    const result = await ui.input("Enter something:");
    expect(result).toBe("default-value");
  });
});

describe("agent selector simulation", () => {
  test("simulates agent file selection", async () => {
    const ui = new TestUI({
      selectResponse: 1, // Select second agent
    });

    const agents = [
      { name: "agent1.md", value: "/path/to/agent1.md", description: "cwd" },
      { name: "agent2.md", value: "/path/to/agent2.md", description: ".mdflow" },
      { name: "agent3.md", value: "/path/to/agent3.md", description: "~/.mdflow" },
    ];

    const selected = await ui.select("Select an agent to run:", agents);
    expect(selected).toBe("/path/to/agent2.md");
  });

  test("selects by value match", async () => {
    const ui = new TestUI({
      selectResponse: "/path/to/agent3.md",
    });

    const agents = [
      { name: "agent1.md", value: "/path/to/agent1.md", description: "cwd" },
      { name: "agent2.md", value: "/path/to/agent2.md", description: ".mdflow" },
      { name: "agent3.md", value: "/path/to/agent3.md", description: "~/.mdflow" },
    ];

    const selected = await ui.select("Select an agent to run:", agents);
    expect(selected).toBe("/path/to/agent3.md");
  });
});

describe("security warning display", () => {
  test("captures security warning output", async () => {
    const ui = new TestUI({
      confirmResponse: true,
      captureLogs: true,
    });

    // Simulate the security warning from trust.ts
    ui.error("=".repeat(70));
    ui.error("SECURITY WARNING: Remote Agent Execution");
    ui.error("=".repeat(70));
    ui.error("");
    ui.error("URL: https://example.com/agent.md");
    ui.error("Domain: example.com");

    const errors = ui.getErrors();
    expect(errors.length).toBe(6);
    expect(errors[1]).toContain("SECURITY WARNING");
    expect(errors[4]).toContain("example.com");
  });
});

describe("prompt message verification", () => {
  test("verifies correct trust prompt messages", async () => {
    const domain = "example.com";
    const ui = new TestUI({
      confirmResponse: true,
      selectResponse: 0,
    });

    await ui.confirm(`Execute this remote agent from ${domain}?`, false);
    await ui.select<string>(
      `Trust ${domain} for future executions?`,
      [
        { name: "No, ask me next time", value: "no" },
        { name: `Yes, always trust ${domain}`, value: "yes" },
      ],
      "no"
    );

    const prompts = ui.getPrompts();

    // Verify confirm prompt
    expect(prompts[0]!.message).toBe(`Execute this remote agent from ${domain}?`);
    expect(prompts[0]!.defaultValue).toBe(false);

    // Verify select prompt
    expect(prompts[1]!.message).toBe(`Trust ${domain} for future executions?`);
    expect(prompts[1]!.choices).toBeDefined();
    expect(prompts[1]!.choices?.length).toBe(2);
    expect(prompts[1]!.choices?.[1]!.name).toContain(domain);
  });
});
