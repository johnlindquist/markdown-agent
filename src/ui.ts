/**
 * User Interface Abstraction
 *
 * Provides an abstraction layer for user interactions (prompts, logging).
 * This enables:
 * 1. Testing without hanging on interactive prompts
 * 2. Different UI implementations (CLI, GUI, automated testing)
 * 3. Consistent error/warning/log handling
 */

import { confirm, select, input } from "@inquirer/prompts";

/** Choice option for select prompts */
export interface Choice<T> {
  name: string;
  value: T;
  description?: string;
}

/** User Interface abstraction for prompts and logging */
export interface UserInterface {
  /** Prompt user for yes/no confirmation */
  confirm(message: string, defaultValue?: boolean): Promise<boolean>;

  /** Prompt user to select from choices */
  select<T>(message: string, choices: Choice<T>[], defaultValue?: T): Promise<T>;

  /** Prompt user for text input */
  input(message: string, defaultValue?: string): Promise<string>;

  /** Log informational message */
  log(message: string): void;

  /** Log error message */
  error(message: string): void;

  /** Log warning message */
  warn(message: string): void;
}

/**
 * Console-based UI implementation using @inquirer/prompts
 * This is the real implementation for interactive CLI use
 */
export class ConsoleUI implements UserInterface {
  async confirm(message: string, defaultValue: boolean = false): Promise<boolean> {
    return confirm({ message, default: defaultValue });
  }

  async select<T>(message: string, choices: Choice<T>[], defaultValue?: T): Promise<T> {
    return select({
      message,
      choices: choices.map(c => ({
        name: c.name,
        value: c.value,
        description: c.description,
      })),
      default: defaultValue,
    });
  }

  async input(message: string, defaultValue?: string): Promise<string> {
    return input({ message, default: defaultValue });
  }

  log(message: string): void {
    console.log(message);
  }

  error(message: string): void {
    console.error(message);
  }

  warn(message: string): void {
    console.warn(message);
  }
}

/** Configuration for TestUI auto-responses */
export interface TestUIConfig {
  /** Default response for confirm prompts */
  confirmResponse?: boolean;

  /** Map of message patterns to confirm responses */
  confirmResponses?: Map<string | RegExp, boolean>;

  /** Default response for select prompts (by index or value) */
  selectResponse?: number | unknown;

  /** Map of message patterns to select responses */
  selectResponses?: Map<string | RegExp, number | unknown>;

  /** Default response for input prompts */
  inputResponse?: string;

  /** Map of message patterns to input responses */
  inputResponses?: Map<string | RegExp, string>;

  /** Whether to capture logs for inspection */
  captureLogs?: boolean;
}

/** Recorded prompt for test inspection */
export interface RecordedPrompt {
  type: "confirm" | "select" | "input";
  message: string;
  choices?: Choice<unknown>[];
  defaultValue?: unknown;
  response: unknown;
}

/**
 * Test UI implementation that auto-responds based on configuration
 * Useful for automated testing of trust flows and other interactive features
 */
export class TestUI implements UserInterface {
  private config: TestUIConfig;
  private prompts: RecordedPrompt[] = [];
  private logs: string[] = [];
  private errors: string[] = [];
  private warnings: string[] = [];

  constructor(config: TestUIConfig = {}) {
    this.config = config;
  }

  /**
   * Find a matching response from a pattern map
   */
  private findMatch<T>(
    message: string,
    patterns: Map<string | RegExp, T> | undefined,
    defaultValue: T | undefined
  ): T | undefined {
    if (!patterns) return defaultValue;

    for (const [pattern, response] of patterns) {
      if (typeof pattern === "string") {
        if (message.includes(pattern)) return response;
      } else {
        if (pattern.test(message)) return response;
      }
    }
    return defaultValue;
  }

  async confirm(message: string, defaultValue: boolean = false): Promise<boolean> {
    const response = this.findMatch(
      message,
      this.config.confirmResponses,
      this.config.confirmResponse ?? defaultValue
    );

    this.prompts.push({
      type: "confirm",
      message,
      defaultValue,
      response,
    });

    return response ?? defaultValue;
  }

  async select<T>(message: string, choices: Choice<T>[], defaultValue?: T): Promise<T> {
    const rawResponse = this.findMatch(
      message,
      this.config.selectResponses,
      this.config.selectResponse
    );

    let response: T;
    if (typeof rawResponse === "number") {
      // Response is an index
      response = choices[rawResponse]?.value ?? choices[0]?.value ?? defaultValue as T;
    } else if (rawResponse !== undefined) {
      // Response is a value - find matching choice
      const match = choices.find(c => c.value === rawResponse);
      response = match?.value ?? choices[0]?.value ?? defaultValue as T;
    } else {
      // Use default or first choice
      response = defaultValue ?? choices[0]?.value!;
    }

    this.prompts.push({
      type: "select",
      message,
      choices: choices as Choice<unknown>[],
      defaultValue,
      response,
    });

    return response;
  }

  async input(message: string, defaultValue?: string): Promise<string> {
    const response = this.findMatch(
      message,
      this.config.inputResponses,
      this.config.inputResponse ?? defaultValue ?? ""
    );

    this.prompts.push({
      type: "input",
      message,
      defaultValue,
      response,
    });

    return response ?? defaultValue ?? "";
  }

  log(message: string): void {
    if (this.config.captureLogs) {
      this.logs.push(message);
    }
  }

  error(message: string): void {
    if (this.config.captureLogs) {
      this.errors.push(message);
    }
  }

  warn(message: string): void {
    if (this.config.captureLogs) {
      this.warnings.push(message);
    }
  }

  /** Get all recorded prompts for inspection */
  getPrompts(): RecordedPrompt[] {
    return [...this.prompts];
  }

  /** Get recorded logs */
  getLogs(): string[] {
    return [...this.logs];
  }

  /** Get recorded errors */
  getErrors(): string[] {
    return [...this.errors];
  }

  /** Get recorded warnings */
  getWarnings(): string[] {
    return [...this.warnings];
  }

  /** Clear all recorded data */
  reset(): void {
    this.prompts = [];
    this.logs = [];
    this.errors = [];
    this.warnings = [];
  }

  /** Update configuration */
  setConfig(config: Partial<TestUIConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// Global UI instance - defaults to ConsoleUI
let globalUI: UserInterface = new ConsoleUI();

/**
 * Get the current UI instance
 */
export function getUI(): UserInterface {
  return globalUI;
}

/**
 * Set the global UI instance
 * Useful for testing or custom UI implementations
 */
export function setUI(ui: UserInterface): void {
  globalUI = ui;
}

/**
 * Reset to default ConsoleUI
 */
export function resetUI(): void {
  globalUI = new ConsoleUI();
}

/**
 * Helper to create a TestUI with common auto-approve configuration
 */
export function createAutoApproveUI(options: { captureLogs?: boolean } = {}): TestUI {
  return new TestUI({
    confirmResponse: true,
    selectResponse: 0,
    inputResponse: "",
    captureLogs: options.captureLogs ?? true,
  });
}

/**
 * Helper to create a TestUI with common auto-reject configuration
 */
export function createAutoRejectUI(options: { captureLogs?: boolean } = {}): TestUI {
  return new TestUI({
    confirmResponse: false,
    selectResponse: 0,
    inputResponse: "",
    captureLogs: options.captureLogs ?? true,
  });
}
