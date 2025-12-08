/**
 * Phase 2: Impure Resolver
 *
 * Takes ImportActions and fetches their content via I/O operations.
 * This is the impure part of the pipeline that interacts with the filesystem,
 * network, and shell.
 */

import type {
  ImportAction,
  ResolvedImport,
  SystemEnvironment,
  FileImportAction,
  GlobImportAction,
  UrlImportAction,
  CommandImportAction,
  SymbolImportAction,
} from './imports-types';

/**
 * Extract lines from content by range
 */
function extractLines(content: string, start: number, end: number): string {
  const lines = content.split('\n');
  // Convert to 0-indexed, clamp to valid range
  const startIdx = Math.max(0, start - 1);
  const endIdx = Math.min(lines.length, end);
  return lines.slice(startIdx, endIdx).join('\n');
}

/**
 * Extract a symbol definition from TypeScript/JavaScript content
 * Supports: interface, type, function, class, const, let, var, enum
 */
function extractSymbol(content: string, symbolName: string): string {
  const lines = content.split('\n');

  // Patterns to match symbol declarations
  const patterns = [
    // interface Name { ... }
    new RegExp(`^(export\\s+)?interface\\s+${symbolName}\\s*(extends\\s+[^{]+)?\\{`),
    // type Name = ...
    new RegExp(`^(export\\s+)?type\\s+${symbolName}\\s*(<[^>]+>)?\\s*=`),
    // function Name(...) { ... }
    new RegExp(`^(export\\s+)?(async\\s+)?function\\s+${symbolName}\\s*(<[^>]+>)?\\s*\\(`),
    // class Name { ... }
    new RegExp(`^(export\\s+)?(abstract\\s+)?class\\s+${symbolName}\\s*(extends\\s+[^{]+)?(implements\\s+[^{]+)?\\{`),
    // const/let/var Name = ...
    new RegExp(`^(export\\s+)?(const|let|var)\\s+${symbolName}\\s*(:[^=]+)?\\s*=`),
    // enum Name { ... }
    new RegExp(`^(export\\s+)?enum\\s+${symbolName}\\s*\\{`),
  ];

  let startLine = -1;
  let braceDepth = 0;
  let parenDepth = 0;
  let inString = false;
  let stringChar = '';
  let foundDeclaration = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Check if this line starts the symbol we're looking for
    if (startLine === -1) {
      for (const pattern of patterns) {
        if (pattern.test(line)) {
          startLine = i;
          foundDeclaration = true;
          break;
        }
      }
    }

    if (startLine !== -1) {
      // Count braces/parens to find the end of the declaration
      for (let j = 0; j < lines[i].length; j++) {
        const char = lines[i][j];
        const prevChar = j > 0 ? lines[i][j - 1] : '';

        // Handle string literals
        if (!inString && (char === '"' || char === "'" || char === '`')) {
          inString = true;
          stringChar = char;
        } else if (inString && char === stringChar && prevChar !== '\\') {
          inString = false;
        }

        if (!inString) {
          if (char === '{') braceDepth++;
          else if (char === '}') braceDepth--;
          else if (char === '(') parenDepth++;
          else if (char === ')') parenDepth--;
        }
      }

      // Check if we've closed all braces (for block declarations)
      if (foundDeclaration && braceDepth === 0 && parenDepth === 0) {
        // For type aliases, we need to check for semicolon or end of statement
        const currentLine = lines[i].trim();
        if (
          currentLine.endsWith(';') ||
          currentLine.endsWith('}') ||
          (i + 1 < lines.length && !lines[i + 1].trim().startsWith('.'))
        ) {
          return lines.slice(startLine, i + 1).join('\n');
        }
      }
    }
  }

  if (startLine !== -1) {
    // Return everything from start to end if we couldn't find proper closure
    return lines.slice(startLine).join('\n');
  }

  throw new Error(`Symbol "${symbolName}" not found in file`);
}

/**
 * Allowed content types for URL imports
 */
const ALLOWED_CONTENT_TYPES = [
  'text/markdown',
  'text/x-markdown',
  'text/plain',
  'application/json',
  'application/x-json',
  'text/json',
];

/**
 * Check if a content type is allowed
 */
function isAllowedContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  // Extract the base type (ignore charset and other params)
  const baseType = contentType.split(';')[0].trim().toLowerCase();
  return ALLOWED_CONTENT_TYPES.includes(baseType);
}

/**
 * Determine if content looks like markdown or JSON
 */
function inferContentType(content: string, url: string): 'markdown' | 'json' | 'unknown' {
  const trimmed = content.trim();

  // Check if it looks like JSON
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // Not valid JSON
    }
  }

  // Check URL extension
  const urlLower = url.toLowerCase();
  if (urlLower.endsWith('.md') || urlLower.endsWith('.markdown')) {
    return 'markdown';
  }
  if (urlLower.endsWith('.json')) {
    return 'json';
  }

  // Check for common markdown patterns
  if (
    trimmed.startsWith('#') ||
    trimmed.includes('\n#') ||
    trimmed.includes('\n- ') ||
    trimmed.includes('\n* ') ||
    trimmed.includes('```')
  ) {
    return 'markdown';
  }

  return 'unknown';
}

/**
 * Resolve a single file import
 */
async function resolveFileImport(
  action: FileImportAction,
  env: SystemEnvironment,
  stack: Set<string>
): Promise<string> {
  const { path, lineRange } = action;

  // Check if file exists
  if (!(await env.fileExists(path))) {
    throw new Error(`Import not found: ${path}`);
  }

  // Check for binary file
  if (await env.isBinaryFile(path)) {
    throw new Error(`Cannot import binary file: ${path}`);
  }

  // Handle line range
  if (lineRange) {
    env.log(`Loading lines ${lineRange.start}-${lineRange.end} from: ${path}`);
    const content = await env.readFile(path);
    return extractLines(content, lineRange.start, lineRange.end);
  }

  // Regular file import - check for circular imports
  const canonicalPath = env.toCanonicalPath(path);

  if (stack.has(canonicalPath)) {
    const cycle = [...stack, canonicalPath].join(' -> ');
    throw new Error(`Circular import detected: ${cycle}`);
  }

  env.log(`Loading: ${path}`);
  const content = await env.readFile(path);

  // Note: Recursive import expansion would happen here in the full pipeline
  // For now, we return the content as-is
  return content;
}

/**
 * Resolve a symbol import
 */
async function resolveSymbolImport(
  action: SymbolImportAction,
  env: SystemEnvironment
): Promise<string> {
  const { path, symbol } = action;

  if (!(await env.fileExists(path))) {
    throw new Error(`Import not found: ${path}`);
  }

  if (await env.isBinaryFile(path)) {
    throw new Error(`Cannot import binary file: ${path}`);
  }

  env.log(`Extracting symbol "${symbol}" from: ${path}`);
  const content = await env.readFile(path);
  return extractSymbol(content, symbol);
}

/**
 * Resolve a glob import
 */
async function resolveGlobImport(
  action: GlobImportAction,
  env: SystemEnvironment
): Promise<string> {
  env.log(`Glob pattern: ${action.pattern}`);
  const files = await env.expandGlob(action.pattern, env.cwd);

  env.log(`Expanding ${action.pattern}: ${files.length} files`);

  // Format as XML
  return files
    .map((file) => {
      const name = file.path
        .split('/')
        .pop()!
        .replace(/\.[^.]+$/, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/^(\d)/, '_$1') || 'file';
      return `<${name} path="${file.path}">\n${file.content}\n</${name}>`;
    })
    .join('\n\n');
}

/**
 * Resolve a URL import
 */
async function resolveUrlImport(
  action: UrlImportAction,
  env: SystemEnvironment
): Promise<string> {
  env.log(`Fetching: ${action.url}`);

  const { content, contentType } = await env.fetchUrl(action.url);

  // Check content type header
  if (contentType && isAllowedContentType(contentType)) {
    return content.trim();
  }

  // Content-type missing or generic - infer from content
  const inferred = inferContentType(content, action.url);
  if (inferred === 'markdown' || inferred === 'json') {
    return content.trim();
  }

  // Cannot determine content type - reject
  throw new Error(
    `URL returned unsupported content type: ${contentType || 'unknown'}. ` +
      `Only markdown and JSON are allowed. URL: ${action.url}`
  );
}

/**
 * Resolve a command import
 */
async function resolveCommandImport(
  action: CommandImportAction,
  env: SystemEnvironment
): Promise<string> {
  env.log(`Executing: ${action.command}`);
  return env.execCommand(action.command, env.cwd);
}

/**
 * Resolve a single import action
 */
async function resolveSingleImport(
  action: ImportAction,
  env: SystemEnvironment,
  stack: Set<string>
): Promise<string> {
  switch (action.type) {
    case 'file':
      return resolveFileImport(action, env, stack);
    case 'symbol':
      return resolveSymbolImport(action, env);
    case 'glob':
      return resolveGlobImport(action, env);
    case 'url':
      return resolveUrlImport(action, env);
    case 'command':
      return resolveCommandImport(action, env);
    default:
      throw new Error(`Unknown import type: ${(action as ImportAction).type}`);
  }
}

/**
 * Resolve all import actions
 *
 * @param actions - Array of import actions to resolve
 * @param env - System environment for I/O operations
 * @param stack - Set of files being processed (for circular detection)
 * @returns Array of resolved imports with content
 */
export async function resolveImports(
  actions: ImportAction[],
  env: SystemEnvironment,
  stack: Set<string> = new Set()
): Promise<ResolvedImport[]> {
  const resolved: ResolvedImport[] = [];

  for (const action of actions) {
    const content = await resolveSingleImport(action, env, stack);
    resolved.push({ action, content });
  }

  return resolved;
}
