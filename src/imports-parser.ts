/**
 * Phase 1: Pure Parser
 *
 * Scans content and returns a list of ImportActions.
 * This is a pure function with no I/O - uses a context-aware scanner
 * that properly ignores imports inside code blocks.
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
 * Context state for the scanner
 */
type ScanContext = 'normal' | 'fenced_code' | 'inline_code';

/**
 * Scans content character by character, tracking context to determine
 * if we're inside a code block (fenced or inline).
 *
 * Returns an array of "safe" ranges where imports can be parsed.
 * Exported for unit testing.
 */
export function findSafeRanges(content: string): Array<{ start: number; end: number }> {
  const safeRanges: Array<{ start: number; end: number }> = [];
  let context: ScanContext = 'normal';
  let rangeStart = 0;
  let i = 0;

  while (i < content.length) {
    if (context === 'normal') {
      // Check for fenced code block start (``` or ~~~)
      if (
        (content[i] === '`' && content.slice(i, i + 3) === '```') ||
        (content[i] === '~' && content.slice(i, i + 3) === '~~~')
      ) {
        // End current safe range before the fence
        if (i > rangeStart) {
          safeRanges.push({ start: rangeStart, end: i });
        }
        context = 'fenced_code';
        // Skip the opening fence and any language identifier on the same line
        const fenceChar = content[i];
        i += 3;
        // Skip to end of line (the info string after ```)
        while (i < content.length && content[i] !== '\n') {
          i++;
        }
        continue;
      }

      // Check for inline code start (single backtick, not followed by another)
      if (content[i] === '`' && content[i + 1] !== '`') {
        // End current safe range before the backtick
        if (i > rangeStart) {
          safeRanges.push({ start: rangeStart, end: i });
        }
        context = 'inline_code';
        i++;
        continue;
      }

      i++;
    } else if (context === 'fenced_code') {
      // Look for closing fence (``` or ~~~)
      // Must be at start of line (after newline or at start of content)
      const atLineStart = i === 0 || content[i - 1] === '\n';
      if (
        atLineStart &&
        ((content[i] === '`' && content.slice(i, i + 3) === '```') ||
          (content[i] === '~' && content.slice(i, i + 3) === '~~~'))
      ) {
        // Skip the closing fence
        i += 3;
        // Skip to end of line
        while (i < content.length && content[i] !== '\n') {
          i++;
        }
        if (i < content.length) {
          i++; // Skip the newline
        }
        context = 'normal';
        rangeStart = i;
        continue;
      }
      i++;
    } else if (context === 'inline_code') {
      // Look for closing backtick
      if (content[i] === '`') {
        i++; // Skip the closing backtick
        context = 'normal';
        rangeStart = i;
        continue;
      }
      // Inline code cannot span multiple lines in standard markdown
      if (content[i] === '\n') {
        context = 'normal';
        rangeStart = i;
      }
      i++;
    }
  }

  // Add final range if we ended in normal context
  if (context === 'normal' && rangeStart < content.length) {
    safeRanges.push({ start: rangeStart, end: content.length });
  }

  return safeRanges;
}

/**
 * Check if an index falls within any of the safe ranges
 */
function isInSafeRange(index: number, safeRanges: Array<{ start: number; end: number }>): boolean {
  for (const range of safeRanges) {
    if (index >= range.start && index < range.end) {
      return true;
    }
  }
  return false;
}

/**
 * Pattern to match @filepath imports (including globs, line ranges, and symbols)
 * Matches: @~/path/to/file.md, @./relative/path.md, @/absolute/path.md
 * Also: @./src/**\/*.ts, @./file.ts:10-50, @./file.ts#Symbol
 * The path continues until whitespace or end of line
 */
const FILE_IMPORT_PATTERN = /@(~?[./][^\s]+)/g;

/**
 * Pattern to match !`command` inlines with balanced backticks
 * Matches: !`any command here`, !``cmd with `backticks` ``
 * Supports commands containing backticks by using variable-length delimiters.
 * Capture group 1: The backtick delimiter (` or `` or ```)
 * Capture group 2: The command content
 */
const COMMAND_INLINE_PATTERN = /!(`+)([\s\S]+?)\1/g;

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
  if (match && match[1] && match[2] && match[3]) {
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
  if (match && match[1] && match[2]) {
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
 * Uses a context-aware scanner to ignore imports inside:
 * - Fenced code blocks (``` or ~~~)
 * - Inline code spans (`)
 *
 * @param content - The content to scan for imports
 * @returns Array of ImportActions, sorted by index (position in string)
 */
export function parseImports(content: string): ImportAction[] {
  const actions: ImportAction[] = [];

  // Find safe ranges where imports should be parsed (outside code blocks)
  const safeRanges = findSafeRanges(content);

  // Parse file imports (includes globs, line ranges, symbols)
  FILE_IMPORT_PATTERN.lastIndex = 0;
  let match;

  while ((match = FILE_IMPORT_PATTERN.exec(content)) !== null) {
    // Only include imports that are in safe ranges (outside code blocks)
    if (isInSafeRange(match.index, safeRanges) && match[1]) {
      const action = parseFileImportPath(match[0], match[1], match.index);
      actions.push(action);
    }
  }

  // Parse URL imports
  URL_IMPORT_PATTERN.lastIndex = 0;
  while ((match = URL_IMPORT_PATTERN.exec(content)) !== null) {
    // Only include imports that are in safe ranges (outside code blocks)
    if (isInSafeRange(match.index, safeRanges) && match[1]) {
      const urlAction: UrlImportAction = {
        type: 'url',
        url: match[1],
        original: match[0],
        index: match.index,
      };
      actions.push(urlAction);
    }
  }

  // Parse command inlines (with balanced backtick support)
  // match[1] = backtick delimiter, match[2] = command content
  COMMAND_INLINE_PATTERN.lastIndex = 0;
  while ((match = COMMAND_INLINE_PATTERN.exec(content)) !== null) {
    // Only include imports that are in safe ranges (outside code blocks)
    const commandContent = match[2];
    if (isInSafeRange(match.index, safeRanges) && commandContent) {
      const cmdAction: CommandImportAction = {
        type: 'command',
        command: commandContent,
        original: match[0],
        index: match.index,
      };
      actions.push(cmdAction);
    }
  }

  // Sort by index to maintain order
  actions.sort((a, b) => a.index - b.index);

  return actions;
}

/**
 * Check if content contains any imports
 *
 * Uses context-aware scanning to ignore imports inside code blocks.
 *
 * @param content - The content to check
 * @returns true if any imports are found outside of code blocks
 */
export function hasImportsInContent(content: string): boolean {
  // Use parseImports which is already context-aware
  return parseImports(content).length > 0;
}
