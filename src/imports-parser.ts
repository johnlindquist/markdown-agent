/**
 * Phase 1: Pure Parser
 *
 * Scans content and returns a list of ImportActions.
 * This is a pure function with no I/O - uses a markdown AST parser
 * that properly ignores imports inside code blocks.
 */

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { visit } from 'unist-util-visit';
import type { Root } from 'mdast';
import type {
  ImportAction,
  FileImportAction,
  GlobImportAction,
  UrlImportAction,
  CommandImportAction,
  SymbolImportAction,
  ExecutableCodeFenceAction,
} from './imports-types';

/**
 * Range type for code regions and safe ranges
 */
interface Range {
  start: number;
  end: number;
}

/**
 * Inverts code regions to get safe ranges.
 * Given regions where code exists, returns regions where code doesn't exist.
 */
function invertRanges(codeRegions: Range[], contentLength: number): Range[] {
  const safeRanges: Range[] = [];
  let current = 0;

  for (const region of codeRegions) {
    if (current < region.start) {
      safeRanges.push({ start: current, end: region.start });
    }
    current = region.end;
  }

  if (current < contentLength) {
    safeRanges.push({ start: current, end: contentLength });
  }

  return safeRanges;
}

/**
 * Uses a markdown AST parser to find code blocks (fenced and inline),
 * then returns the "safe" ranges where imports can be parsed.
 *
 * Returns an array of "safe" ranges where imports can be parsed.
 * Exported for unit testing.
 */
export function findSafeRanges(content: string): Range[] {
  if (content.length === 0) {
    return [];
  }

  const processor = unified().use(remarkParse);
  const ast = processor.parse(content) as Root;

  // Collect all code regions (fenced + inline)
  const codeRegions: Range[] = [];

  // Find fenced/indented code blocks
  visit(ast, 'code', (node) => {
    if (node.position?.start.offset !== undefined &&
        node.position?.end.offset !== undefined) {
      codeRegions.push({
        start: node.position.start.offset,
        end: node.position.end.offset,
      });
    }
  });

  // Find inline code spans
  visit(ast, 'inlineCode', (node) => {
    if (node.position?.start.offset !== undefined &&
        node.position?.end.offset !== undefined) {
      codeRegions.push({
        start: node.position.start.offset,
        end: node.position.end.offset,
      });
    }
  });

  // Sort by start position (important for invertRanges)
  codeRegions.sort((a, b) => a.start - b.start);

  // Invert to get safe ranges
  return invertRanges(codeRegions, content.length);
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
 * Pattern to match executable code fences
 * Matches: ```lang\n#!shebang\ncode\n```
 * Supports variable length fences.
 */
const EXECUTABLE_FENCE_PATTERN = /(`{3,})(.*?)\n(#![^\n]+)\n([\s\S]*?)\1/g;

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

  // Identify starts of unsafe blocks (gaps between safe ranges)
  // These are the only valid positions for executable code fences.
  // This prevents execution of fences nested inside documentation blocks.
  const unsafeStarts = new Set<number>();
  if (safeRanges.length > 0) {
    if (safeRanges[0]!.start > 0) unsafeStarts.add(0);
    for (const range of safeRanges) {
      if (range.end < content.length) {
        unsafeStarts.add(range.end);
      }
    }
  } else if (content.length > 0) {
    // If content exists but no safe ranges, the whole thing is unsafe (a code block)
    unsafeStarts.add(0);
  }

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

  // Parse executable code fences
  // Must match a top-level code block (start of an unsafe gap)
  EXECUTABLE_FENCE_PATTERN.lastIndex = 0;
  while ((match = EXECUTABLE_FENCE_PATTERN.exec(content)) !== null) {
    // Only process if the match aligns exactly with a known code block start
    if (unsafeStarts.has(match.index)) {
      const [fullMatch, fence, infoString, shebang, code] = match;
      const language = (infoString ?? '').trim().split(/\s+/)[0] ?? ''; // Extract first word as language

      if (shebang && code !== undefined) {
        const action: ExecutableCodeFenceAction = {
          type: 'executable_code_fence',
          language: language || 'txt',
          shebang,
          code: code.trim(),
          original: fullMatch,
          index: match.index,
        };
        actions.push(action);
      }
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
