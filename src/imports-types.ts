/**
 * Import Action Types - Output of the pure parser (Phase 1)
 *
 * These represent the different types of imports found when scanning content,
 * before any I/O operations are performed.
 */

/** File import with optional line range */
export interface FileImportAction {
  type: 'file';
  path: string;
  lineRange?: { start: number; end: number };
  /** Original matched text for replacement */
  original: string;
  /** Position in the original string */
  index: number;
}

/** Glob pattern import */
export interface GlobImportAction {
  type: 'glob';
  pattern: string;
  /** Original matched text for replacement */
  original: string;
  /** Position in the original string */
  index: number;
}

/** URL import */
export interface UrlImportAction {
  type: 'url';
  url: string;
  /** Original matched text for replacement */
  original: string;
  /** Position in the original string */
  index: number;
}

/** Command inline */
export interface CommandImportAction {
  type: 'command';
  command: string;
  /** Original matched text for replacement */
  original: string;
  /** Position in the original string */
  index: number;
}

/** Symbol extraction import */
export interface SymbolImportAction {
  type: 'symbol';
  path: string;
  symbol: string;
  /** Original matched text for replacement */
  original: string;
  /** Position in the original string */
  index: number;
}

/** Union of all import action types */
export type ImportAction =
  | FileImportAction
  | GlobImportAction
  | UrlImportAction
  | CommandImportAction
  | SymbolImportAction;

/**
 * Resolved Import - Output of the resolver (Phase 2)
 *
 * Contains the original action plus the resolved content.
 */
export interface ResolvedImport {
  /** The original action that was resolved */
  action: ImportAction;
  /** The resolved content to inject */
  content: string;
}

/**
 * System Environment interface for the resolver
 * Abstracts away file system and network operations for testability
 */
export interface SystemEnvironment {
  /** Read a file's content */
  readFile(path: string): Promise<string>;
  /** Check if a file exists */
  fileExists(path: string): Promise<boolean>;
  /** Get file size in bytes */
  fileSize(path: string): Promise<number>;
  /** Check if a file is binary */
  isBinaryFile(path: string): Promise<boolean>;
  /** Resolve a path to canonical form (resolving symlinks) */
  toCanonicalPath(path: string): string;
  /** Fetch URL content */
  fetchUrl(url: string): Promise<{ content: string; contentType: string | null }>;
  /** Execute a shell command */
  execCommand(command: string, cwd: string): Promise<string>;
  /** Expand glob pattern and return matching files */
  expandGlob(pattern: string, cwd: string): Promise<Array<{ path: string; content: string }>>;
  /** Current working directory */
  cwd: string;
  /** Whether to log verbose output */
  verbose: boolean;
  /** Log a message (for verbose output) */
  log(message: string): void;
}
