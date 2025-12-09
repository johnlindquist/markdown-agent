/**
 * CliRunner - Testable entry point for mdflow CLI
 *
 * This class encapsulates all orchestration logic from main(), accepting
 * a SystemEnvironment for dependency injection. This enables testing
 * without spawning actual subprocesses or touching the real filesystem.
 */

import { parseFrontmatter } from "./parse";
import { parseCliArgs, handleMaCommands } from "./cli";
import { substituteTemplateVars, extractTemplateVars } from "./template";
import { isRemoteUrl, fetchRemote, cleanupRemote } from "./remote";
import {
  resolveCommand, buildArgs, runCommand, extractPositionalMappings,
  extractEnvVars, killCurrentChildProcess, hasInteractiveMarker,
} from "./command";
import { expandImports, hasImports } from "./imports";
import { loadEnvFiles } from "./env";
import {
  loadGlobalConfig, getCommandDefaults, applyDefaults, applyInteractiveMode,
} from "./config";
import {
  initLogger, getParseLogger, getTemplateLogger, getCommandLogger,
  getImportLogger, getCurrentLogPath,
} from "./logger";
import { isDomainTrusted, promptForTrust, addTrustedDomain, extractDomain } from "./trust";
import { dirname, resolve } from "path";
import { input } from "@inquirer/prompts";
import { exceedsLimit, StdinSizeLimitError } from "./limits";
import { countTokens } from "./tokenizer";
import {
  MarkdownAgentError, EarlyExitRequest, UserCancelledError, FileNotFoundError,
  NetworkError, SecurityError, ConfigurationError, TemplateError, ImportError,
} from "./errors";
import type { SystemEnvironment } from "./system-environment";

/** Result from CliRunner.run() */
export interface CliRunResult {
  exitCode: number;
  errorMessage?: string;
  logPath?: string | null;
}

/** Options for CliRunner */
export interface CliRunnerOptions {
  env: SystemEnvironment;
  processEnv?: Record<string, string | undefined>;
  cwd?: string;
  isStdinTTY?: boolean;
  stdinContent?: string;
  promptInput?: (message: string) => Promise<string>;
}

/** CliRunner - Main orchestrator for mdflow CLI */
export class CliRunner {
  private env: SystemEnvironment;
  private processEnv: Record<string, string | undefined>;
  private cwd: string;
  private isStdinTTY: boolean;
  private stdinContent: string | undefined;
  private promptInput: (message: string) => Promise<string>;

  constructor(options: CliRunnerOptions) {
    this.env = options.env;
    this.processEnv = options.processEnv ?? process.env;
    this.cwd = options.cwd ?? process.cwd();
    this.isStdinTTY = options.isStdinTTY ?? Boolean(process.stdin.isTTY);
    this.stdinContent = options.stdinContent;
    this.promptInput = options.promptInput ?? ((msg) => input({ message: msg }));
  }

  private async readStdin(): Promise<string> {
    if (this.stdinContent !== undefined) return this.stdinContent;
    if (this.isStdinTTY) return "";
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    for await (const chunk of process.stdin) {
      totalBytes += chunk.length;
      if (exceedsLimit(totalBytes)) throw new StdinSizeLimitError(totalBytes);
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString("utf-8").trim();
  }

  private writeStdout(data: string): void { console.log(data); }
  private writeStderr(data: string): void { console.error(data); }

  private printErrorWithLogPath(message: string, logPath: string | null): void {
    this.writeStderr(`\n${message}`);
    if (logPath) this.writeStderr(`   Detailed logs: ${logPath}`);
  }

  async run(argv: string[]): Promise<CliRunResult> {
    let logPath: string | null = null;
    try {
      return await this.runInternal(argv, (lp) => { logPath = lp; });
    } catch (err) {
      return this.handleError(err, logPath);
    }
  }

  private handleError(err: unknown, logPath: string | null): CliRunResult {
    if (err instanceof EarlyExitRequest) return { exitCode: err.code, logPath };
    if (err instanceof UserCancelledError) return { exitCode: err.code, logPath };
    if (err instanceof MarkdownAgentError) {
      this.printErrorWithLogPath(`Agent failed: ${err.message}`, logPath);
      return { exitCode: err.code, errorMessage: err.message, logPath };
    }
    const errorMessage = (err as Error).message;
    this.printErrorWithLogPath(`Agent failed: ${errorMessage}`, logPath);
    return { exitCode: 1, errorMessage, logPath };
  }

  private async runInternal(
    argv: string[],
    setLogPath: (lp: string | null) => void
  ): Promise<CliRunResult> {
    const cliArgs = parseCliArgs(argv);
    const subcommand = cliArgs.filePath;

    // Handle subcommands
    if (subcommand === "create") {
      const { runCreate } = await import("./create");
      await runCreate(cliArgs.passthroughArgs);
      return { exitCode: 0 };
    }
    if (subcommand === "setup") {
      const { runSetup } = await import("./setup");
      await runSetup();
      return { exitCode: 0 };
    }
    if (subcommand === "logs") {
      const { getLogDir, listLogDirs } = await import("./logger");
      this.writeStdout(`Log directory: ${getLogDir()}\n`);
      const dirs = listLogDirs();
      if (dirs.length === 0) {
        this.writeStdout("No agent logs yet. Run an agent to generate logs.");
      } else {
        this.writeStdout("Agent logs:");
        dirs.forEach((d) => this.writeStdout(`  ${d}/`));
      }
      return { exitCode: 0 };
    }
    if (subcommand === "help") cliArgs.help = true;

    let filePath = cliArgs.filePath;
    if (!filePath || subcommand === "help") {
      const result = await handleMaCommands(cliArgs);
      if (result.selectedFile) filePath = result.selectedFile;
      else if (!result.handled) {
        this.writeStderr("Usage: md <file.md> [flags for command]");
        this.writeStderr("       md <command> [options]");
        this.writeStderr("\nCommands: create, setup, logs, help");
        this.writeStderr("Run 'md help' for more info");
        throw new ConfigurationError("No agent file specified", 1);
      }
    }

    return this.runAgent(filePath, cliArgs.passthroughArgs, setLogPath);
  }

  private async runAgent(
    filePath: string,
    passthroughArgs: string[],
    setLogPath: (lp: string | null) => void
  ): Promise<CliRunResult> {
    let localFilePath = filePath;
    let isRemote = false;

    if (isRemoteUrl(filePath)) {
      const remoteResult = await fetchRemote(filePath);
      if (!remoteResult.success) {
        throw new NetworkError(`Failed to fetch remote file: ${remoteResult.error}`);
      }
      localFilePath = remoteResult.localPath!;
      isRemote = true;
    }

    // Signal handling
    const handleSignal = async (signal: string) => {
      killCurrentChildProcess();
      if (isRemote) await cleanupRemote(localFilePath);
      process.exit(signal === "SIGINT" ? 130 : 143);
    };
    process.on("SIGINT", () => handleSignal("SIGINT"));
    process.on("SIGTERM", () => handleSignal("SIGTERM"));

    if (!(await this.env.fs.exists(localFilePath))) {
      throw new FileNotFoundError(`File not found: ${localFilePath}`);
    }

    const fileDir = dirname(resolve(localFilePath));
    await loadEnvFiles(fileDir);

    const logger = initLogger(localFilePath);
    const logPath = getCurrentLogPath();
    setLogPath(logPath);
    logger.info({ filePath: localFilePath }, "Session started");

    const stdinContent = await this.readStdin();
    const content = await this.env.fs.readText(localFilePath);
    const { frontmatter: baseFrontmatter, body: rawBody } = parseFrontmatter(content);
    getParseLogger().debug({ frontmatter: baseFrontmatter, bodyLength: rawBody.length }, "Frontmatter parsed");

    // Parse CLI flags
    const parsed = this.parseFlags(passthroughArgs);
    const { command, frontmatter, templateVars, finalBody, args, positionalMappings } =
      await this.processAgent(localFilePath, baseFrontmatter, rawBody, stdinContent, parsed);

    // Dry run
    if (parsed.dryRun) {
      return this.handleDryRun(command, frontmatter, args, [finalBody], positionalMappings, logger, isRemote, localFilePath, logPath);
    }

    // TOFU check
    if (isRemote && !parsed.trustFlag) {
      await this.handleTOFU(filePath, localFilePath, command, baseFrontmatter, rawBody);
    }

    // Execute
    let finalRunArgs = args;
    if (frontmatter._subcommand) {
      const subs = Array.isArray(frontmatter._subcommand) ? frontmatter._subcommand : [frontmatter._subcommand];
      finalRunArgs = [...subs, ...args];
    }

    getCommandLogger().info({ command, argsCount: finalRunArgs.length, promptLength: finalBody.length }, "Executing command");

    const runResult = await runCommand({
      command, args: finalRunArgs, positionals: [finalBody], positionalMappings, captureOutput: false, env: extractEnvVars(frontmatter),
    });

    getCommandLogger().info({ exitCode: runResult.exitCode }, "Command completed");
    if (isRemote) await cleanupRemote(localFilePath);

    if (runResult.exitCode !== 0) {
      this.printErrorWithLogPath(`Agent exited with code ${runResult.exitCode}`, logPath);
    }

    logger.info({ exitCode: runResult.exitCode }, "Session ended");
    return { exitCode: runResult.exitCode, logPath };
  }

  private parseFlags(passthroughArgs: string[]) {
    let remainingArgs = [...passthroughArgs];
    let commandFromCli: string | undefined;
    let dryRun = false, trustFlag = false, interactiveFromCli = false;
    let cwdFromCli: string | undefined;

    const cmdIdx = remainingArgs.findIndex((a) => a === "--command" || a === "-c");
    if (cmdIdx !== -1 && cmdIdx + 1 < remainingArgs.length) {
      commandFromCli = remainingArgs[cmdIdx + 1];
      remainingArgs.splice(cmdIdx, 2);
    }
    const dryIdx = remainingArgs.indexOf("--dry-run");
    if (dryIdx !== -1) { dryRun = true; remainingArgs.splice(dryIdx, 1); }
    const trustIdx = remainingArgs.indexOf("--trust");
    if (trustIdx !== -1) { trustFlag = true; remainingArgs.splice(trustIdx, 1); }
    const intIdx = remainingArgs.findIndex((a) => a === "--_interactive" || a === "-_i");
    if (intIdx !== -1) { interactiveFromCli = true; remainingArgs.splice(intIdx, 1); }
    const cwdIdx = remainingArgs.findIndex((a) => a === "--_cwd");
    if (cwdIdx !== -1 && cwdIdx + 1 < remainingArgs.length) {
      cwdFromCli = remainingArgs[cwdIdx + 1];
      remainingArgs.splice(cwdIdx, 2);
    }

    return { remainingArgs, commandFromCli, dryRun, trustFlag, interactiveFromCli, cwdFromCli };
  }

  private async processAgent(
    localFilePath: string,
    baseFrontmatter: Record<string, unknown>,
    rawBody: string,
    stdinContent: string,
    parsed: ReturnType<typeof this.parseFlags>
  ) {
    const { remainingArgs, commandFromCli, interactiveFromCli, cwdFromCli } = parsed;
    let remaining = [...remainingArgs];

    // Resolve command
    let command: string;
    if (commandFromCli) {
      command = commandFromCli;
      getCommandLogger().debug({ command, source: "cli" }, "Command from --command flag");
    } else {
      command = resolveCommand(localFilePath);
      getCommandLogger().debug({ command }, "Command resolved");
    }

    await loadGlobalConfig();
    const commandDefaults = await getCommandDefaults(command);
    let frontmatter = applyDefaults(baseFrontmatter, commandDefaults);
    const interactiveFromFilename = hasInteractiveMarker(localFilePath);
    frontmatter = applyInteractiveMode(frontmatter, command, interactiveFromFilename || interactiveFromCli);

    const envVars = extractEnvVars(frontmatter);
    if (envVars) Object.entries(envVars).forEach(([k, v]) => { this.processEnv[k] = v; });

    // Template vars
    let templateVars: Record<string, string> = {};
    if (frontmatter.args && Array.isArray(frontmatter.args)) {
      for (const argName of frontmatter.args) {
        const idx = remaining.findIndex((a) => !a.startsWith("-"));
        if (idx !== -1) { templateVars[argName] = remaining[idx]; remaining.splice(idx, 1); }
      }
    }

    const namedVarFields = Object.keys(frontmatter).filter((k) => k.startsWith("$") && !/^\$\d+$/.test(k));
    for (const key of namedVarFields) {
      const varName = key.slice(1);
      const defaultValue = frontmatter[key];
      const flags = [`--${varName}`, `--${varName.replace(/_/g, "-")}`];
      let found = false;
      for (const flag of flags) {
        const idx = remaining.findIndex((a) => a === flag);
        if (idx !== -1 && idx + 1 < remaining.length) {
          templateVars[varName] = remaining[idx + 1];
          remaining.splice(idx, 2);
          found = true;
          break;
        }
      }
      if (!found && defaultValue != null && defaultValue !== "") {
        templateVars[varName] = String(defaultValue);
      }
    }

    // Expand imports
    let expandedBody = rawBody;
    const fileDir = dirname(resolve(localFilePath));
    if (hasImports(rawBody)) {
      try {
        const commandCwd = cwdFromCli ?? (frontmatter._cwd as string | undefined) ?? this.cwd;
        getImportLogger().debug({ fileDir, commandCwd }, "Expanding imports");
        expandedBody = await expandImports(rawBody, fileDir, new Set(), false, { invocationCwd: commandCwd });
        getImportLogger().debug({ originalLength: rawBody.length, expandedLength: expandedBody.length }, "Imports expanded");
      } catch (err) {
        getImportLogger().error({ error: (err as Error).message }, "Import expansion failed");
        throw new ImportError(`Import error: ${(err as Error).message}`);
      }
    }

    // Missing vars
    const requiredVars = extractTemplateVars(expandedBody);
    const missingVars = requiredVars.filter((v) => !(v in templateVars));
    if (missingVars.length > 0) {
      if (this.isStdinTTY) {
        this.writeStderr("Missing required variables. Please provide values:");
        for (const v of missingVars) templateVars[v] = await this.promptInput(`${v}:`);
      } else {
        throw new TemplateError(`Missing template variables: ${missingVars.join(", ")}. Use 'args:' in frontmatter to map CLI arguments to variables`);
      }
    }

    getTemplateLogger().debug({ vars: Object.keys(templateVars) }, "Substituting template variables");
    const body = substituteTemplateVars(expandedBody, templateVars);
    getTemplateLogger().debug({ bodyLength: body.length }, "Template substitution complete");

    // Cat file if no frontmatter
    if (Object.keys(baseFrontmatter).length === 0 && !commandDefaults) {
      try { resolveCommand(localFilePath); }
      catch { this.writeStdout(await this.env.fs.readText(localFilePath)); throw new EarlyExitRequest(); }
    }

    let finalBody = body;
    if (stdinContent) finalBody = `<stdin>\n${stdinContent}\n</stdin>\n\n${finalBody}`;

    const templateVarSet = new Set(Object.keys(templateVars));
    const args = [...buildArgs(frontmatter, templateVarSet), ...remaining];
    const positionalMappings = extractPositionalMappings(frontmatter);

    return { command, frontmatter, templateVars, finalBody, args, positionalMappings };
  }

  private async handleDryRun(
    command: string, frontmatter: Record<string, unknown>, args: string[],
    positionals: string[], positionalMappings: Map<number, string>,
    logger: ReturnType<typeof initLogger>, isRemote: boolean, localFilePath: string, logPath: string | null
  ): Promise<CliRunResult> {
    this.writeStdout("═══════════════════════════════════════════════════════════");
    this.writeStdout("DRY RUN - Command will NOT be executed");
    this.writeStdout("═══════════════════════════════════════════════════════════\n");

    let dryRunArgs = [...args];
    if (frontmatter._subcommand) {
      const subs = Array.isArray(frontmatter._subcommand) ? frontmatter._subcommand : [frontmatter._subcommand];
      dryRunArgs = [...subs, ...dryRunArgs];
    }

    for (let i = 0; i < positionals.length; i++) {
      const pos = i + 1, value = positionals[i];
      if (positionalMappings.has(pos)) {
        const flagName = positionalMappings.get(pos)!;
        dryRunArgs.push(flagName.length === 1 ? `-${flagName}` : `--${flagName}`, `"${value.replace(/"/g, '\\"')}"`);
      } else {
        dryRunArgs.push(`"${value.replace(/"/g, '\\"')}"`);
      }
    }

    this.writeStdout("Command:");
    this.writeStdout(`   ${command} ${dryRunArgs.join(" ")}\n`);
    this.writeStdout("Final Prompt:");
    this.writeStdout("───────────────────────────────────────────────────────────");
    this.writeStdout(positionals[0]);
    this.writeStdout("───────────────────────────────────────────────────────────\n");
    this.writeStdout(`Estimated tokens: ~${countTokens(positionals[0]).toLocaleString()}`);

    if (isRemote) await cleanupRemote(localFilePath);
    logger.info({ dryRun: true }, "Dry run completed");
    throw new EarlyExitRequest();
  }

  private async handleTOFU(
    filePath: string, localFilePath: string, command: string,
    baseFrontmatter: Record<string, unknown>, rawBody: string
  ): Promise<void> {
    const domain = extractDomain(filePath);
    const trusted = await isDomainTrusted(filePath);

    if (!trusted) {
      if (!this.isStdinTTY) {
        await cleanupRemote(localFilePath);
        throw new SecurityError(`Untrusted remote domain: ${domain}. Use --trust flag to bypass this check in non-interactive mode, or run interactively to add the domain to known_hosts.`);
      }

      const trustResult = await promptForTrust(filePath, command, baseFrontmatter, rawBody);
      if (!trustResult.approved) {
        await cleanupRemote(localFilePath);
        throw new UserCancelledError("Execution cancelled by user");
      }
      if (trustResult.rememberDomain) {
        await addTrustedDomain(filePath);
        this.writeStderr(`\nDomain ${domain} added to known_hosts.\n`);
      }
    } else {
      getCommandLogger().debug({ domain }, "Domain already trusted");
    }
  }
}

/** Create a CliRunner with the given environment */
export function createCliRunner(env: SystemEnvironment, options?: Partial<Omit<CliRunnerOptions, "env">>): CliRunner {
  return new CliRunner({ env, ...options });
}
