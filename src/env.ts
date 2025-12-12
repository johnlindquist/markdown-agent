/**
 * Environment variable loading using Bun's native .env support
 *
 * Bun automatically loads .env files from the current working directory.
 * This module extends that to also load from the markdown file's directory.
 *
 * Loading order (later files override earlier):
 * 1. .env (base environment)
 * 2. .env.local (local overrides, not committed)
 * 3. .env.[NODE_ENV] (environment-specific: .env.development, .env.production)
 * 4. .env.[NODE_ENV].local (environment-specific local overrides)
 */

import { join, dirname } from "path";

/**
 * Load environment files from a directory using Bun's native file reading
 * Files are loaded in order, with later files overriding earlier ones
 */
export async function loadEnvFiles(
  directory: string,
  verbose: boolean = false
): Promise<number> {
  const nodeEnv = process.env.NODE_ENV || "development";

  // Files to load in order (later overrides earlier)
  const envFiles = [
    ".env",
    ".env.local",
    `.env.${nodeEnv}`,
    `.env.${nodeEnv}.local`,
  ];

  // Track which keys were set by our loading (so later files can override)
  const loadedKeys = new Set<string>();
  // Snapshot of env vars that existed before we started loading
  const preExistingKeys = new Set(Object.keys(process.env));

  let loadedCount = 0;

  for (const envFile of envFiles) {
    const envPath = join(directory, envFile);
    const file = Bun.file(envPath);

    if (await file.exists()) {
      try {
        const content = await file.text();
        const vars = parseEnvFile(content);

        for (const [key, value] of Object.entries(vars)) {
          // Don't override pre-existing env vars (CLI/system take precedence)
          // But DO allow later .env files to override earlier .env files
          if (!preExistingKeys.has(key) || loadedKeys.has(key)) {
            process.env[key] = value;
            loadedKeys.add(key);
          }
        }

        loadedCount++;
        if (verbose) {
          console.error(`[env] Loaded: ${envFile} (${Object.keys(vars).length} vars)`);
        }
      } catch (err) {
        if (verbose) {
          console.error(`[env] Failed to load ${envFile}: ${(err as Error).message}`);
        }
      }
    }
  }

  return loadedCount;
}

/**
 * Parse .env file content into key-value pairs
 * Supports:
 * - KEY=value
 * - KEY="quoted value"
 * - KEY='single quoted'
 * - # comments
 * - Empty lines
 * - Multiline values with quotes
 */
function parseEnvFile(content: string): Record<string, string> {
  const vars: Record<string, string> = {};
  const lines = content.split("\n");

  let currentKey: string | null = null;
  let currentValue: string[] = [];
  let inMultiline = false;
  let quoteChar: string | null = null;

  for (const line of lines) {
    // Skip empty lines and comments (unless in multiline)
    if (!inMultiline && (line.trim() === "" || line.trim().startsWith("#"))) {
      continue;
    }

    if (inMultiline) {
      // Continue collecting multiline value
      currentValue.push(line);

      // Check if this line ends the multiline
      if (line.trimEnd().endsWith(quoteChar!)) {
        const fullValue = currentValue.join("\n");
        // Remove the closing quote
        vars[currentKey!] = fullValue.slice(0, -1);
        inMultiline = false;
        currentKey = null;
        currentValue = [];
        quoteChar = null;
      }
      continue;
    }

    // Parse KEY=value
    const match = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.*)/);
    if (!match) continue;

    const key = match[1];
    const rawValue = match[2];
    if (!key || rawValue === undefined) continue;

    let value = rawValue.trim();

    // Handle quoted values
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      // Simple quoted value on one line
      vars[key] = value.slice(1, -1);
    } else if (value.startsWith('"') || value.startsWith("'")) {
      // Start of multiline quoted value
      inMultiline = true;
      currentKey = key;
      quoteChar = value[0] ?? null;
      currentValue = [value.slice(1)]; // Remove opening quote
    } else {
      // Unquoted value - remove inline comments
      const commentIndex = value.indexOf(" #");
      if (commentIndex !== -1) {
        value = value.slice(0, commentIndex).trim();
      }
      vars[key] = value;
    }
  }

  return vars;
}

/**
 * Get a list of env files that would be loaded from a directory
 */
export async function getEnvFilesInDirectory(directory: string): Promise<string[]> {
  const nodeEnv = process.env.NODE_ENV || "development";
  const envFiles = [
    ".env",
    ".env.local",
    `.env.${nodeEnv}`,
    `.env.${nodeEnv}.local`,
  ];

  const existing: string[] = [];
  for (const envFile of envFiles) {
    const envPath = join(directory, envFile);
    if (await Bun.file(envPath).exists()) {
      existing.push(envFile);
    }
  }

  return existing;
}
