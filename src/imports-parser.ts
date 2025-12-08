/**
 * Phase 1: Pure Parser
 *
 * Scans content and returns a list of ImportActions.
 * This is a pure function with no I/O - just regex parsing.
 */

import type {
  ImportAction,
  FileImportAction,
  GlobImportAction,
  UrlImportAction,
  CommandImportAction,
  SymbolImportAction,
} from './imports-types';

/**
 * Pattern to match @filepath imports (including globs, line ranges, and symbols)
 * Matches: @~/path/to/file.md, @./relative/path.md, @/absolute/path.md
 * Also: @./src/**\/*.ts, @./file.ts:10-50, @./file.ts#Symbol
 * The path continues until whitespace or end of line
 */
const FILE_IMPORT_PATTERN = /@(~?[./][^\s]+)/g;

/**
 * Pattern to match !`command` inlines
 * Matches: !`any command here`
 * Supports multi-word commands inside backticks
 */
const COMMAND_INLINE_PATTERN = /!`([^`]+)`/g;

/**
 * Pattern to match @url imports
 * Matches: @https://example.com/path, @http://example.com/path
 * Does NOT match emails like foo@example.com (requires http:// or https://)
 * The URL continues until whitespace or end of line
 */
const URL_IMPORT_PATTERN = /@(https?:\/\/[^\s]+)/g;

/**
 * Check if a path contains glob characters
 */
export function isGlobPattern(path: string): boolean {
  return path.includes('*') || path.includes('?') || path.includes('[');
}

/**
 * Parse import path for line range syntax: @./file.ts:10-50
 */
export function parseLineRange(path: string): { path: string; start?: number; end?: number } {
  const match = path.match(/^(.+):(\d+)-(\d+)$/);
  if (match) {
    return {
      path: match[1],
      start: parseInt(match[2], 10),
      end: parseInt(match[3], 10),
    };
  }
  return { path };
}

/**
 * Parse import path for symbol extraction: @./file.ts#SymbolName
 */
export function parseSymbolExtraction(path: string): { path: string; symbol?: string } {
  const match = path.match(/^(.+)#([a-zA-Z_$][a-zA-Z0-9_$]*)$/);
  if (match) {
    return {
      path: match[1],
      symbol: match[2],
    };
  }
  return { path };
}

/**
 * Parse a single file import path into the appropriate action type
 */
function parseFileImportPath(
  fullMatch: string,
  path: string,
  index: number
): FileImportAction | GlobImportAction | SymbolImportAction {
  // Check for glob pattern first
  if (isGlobPattern(path)) {
    return {
      type: 'glob',
      pattern: path,
      original: fullMatch,
      index,
    };
  }

  // Check for symbol extraction syntax
  const symbolParsed = parseSymbolExtraction(path);
  if (symbolParsed.symbol) {
    return {
      type: 'symbol',
      path: symbolParsed.path,
      symbol: symbolParsed.symbol,
      original: fullMatch,
      index,
    };
  }

  // Check for line range syntax
  const rangeParsed = parseLineRange(path);
  if (rangeParsed.start !== undefined && rangeParsed.end !== undefined) {
    return {
      type: 'file',
      path: rangeParsed.path,
      lineRange: { start: rangeParsed.start, end: rangeParsed.end },
      original: fullMatch,
      index,
    };
  }

  // Regular file import
  return {
    type: 'file',
    path,
    original: fullMatch,
    index,
  };
}

/**
 * Parse all imports from content
 *
 * This is a pure function that scans the content and returns all found imports.
 * It does NOT perform any I/O operations.
 *
 * @param content - The content to scan for imports
 * @returns Array of ImportActions, sorted by index (position in string)
 */
export function parseImports(content: string): ImportAction[] {
  const actions: ImportAction[] = [];

  // Parse file imports (includes globs, line ranges, symbols)
  FILE_IMPORT_PATTERN.lastIndex = 0;
  let match;

  while ((match = FILE_IMPORT_PATTERN.exec(content)) !== null) {
    const action = parseFileImportPath(match[0], match[1], match.index);
    actions.push(action);
  }

  // Parse URL imports
  URL_IMPORT_PATTERN.lastIndex = 0;
  while ((match = URL_IMPORT_PATTERN.exec(content)) !== null) {
    const urlAction: UrlImportAction = {
      type: 'url',
      url: match[1],
      original: match[0],
      index: match.index,
    };
    actions.push(urlAction);
  }

  // Parse command inlines
  COMMAND_INLINE_PATTERN.lastIndex = 0;
  while ((match = COMMAND_INLINE_PATTERN.exec(content)) !== null) {
    const cmdAction: CommandImportAction = {
      type: 'command',
      command: match[1],
      original: match[0],
      index: match.index,
    };
    actions.push(cmdAction);
  }

  // Sort by index to maintain order
  actions.sort((a, b) => a.index - b.index);

  return actions;
}

/**
 * Check if content contains any imports
 *
 * @param content - The content to check
 * @returns true if any imports are found
 */
export function hasImportsInContent(content: string): boolean {
  FILE_IMPORT_PATTERN.lastIndex = 0;
  URL_IMPORT_PATTERN.lastIndex = 0;
  COMMAND_INLINE_PATTERN.lastIndex = 0;

  return (
    FILE_IMPORT_PATTERN.test(content) ||
    URL_IMPORT_PATTERN.test(content) ||
    COMMAND_INLINE_PATTERN.test(content)
  );
}
