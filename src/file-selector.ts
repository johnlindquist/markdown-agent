/**
 * Interactive file selector with split-pane preview
 * Provides file preview, path display, and fuzzy filtering
 */

import {
  createPrompt,
  useState,
  useKeypress,
  isEnterKey,
  isUpKey,
  isDownKey,
  usePrefix,
  makeTheme,
  type KeypressEvent,
} from "@inquirer/core";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "os";
import { spawnSync } from "node:child_process";
import type { AgentFile } from "./cli";

/** Result from file selector - either a path to run or edit */
export interface FileSelectorResult {
  action: "run" | "edit";
  path: string;
}

// Extended key event type (runtime has more properties than type declares)
interface ExtendedKeyEvent extends KeypressEvent {
  sequence?: string;
  meta?: boolean;
}

// Cache for file contents to avoid repeated reads
const fileContentCache = new Map<string, string>();

/**
 * Read file content with caching (synchronous for use in render loop)
 */
function readFileContentSync(filePath: string): string {
  if (fileContentCache.has(filePath)) {
    return fileContentCache.get(filePath)!;
  }
  try {
    if (!existsSync(filePath)) {
      return `[File not found: ${filePath}]`;
    }
    const content = readFileSync(filePath, "utf8");
    // Limit cache size to prevent memory issues
    if (fileContentCache.size > 100) {
      const firstKey = fileContentCache.keys().next().value;
      if (firstKey) fileContentCache.delete(firstKey);
    }
    fileContentCache.set(filePath, content);
    return content;
  } catch (error) {
    return `[Error reading file: ${error}]`;
  }
}

/**
 * Get terminal width, defaulting to 80 if unavailable
 */
function getTerminalWidth(): number {
  return process.stdout.columns || 80;
}

/**
 * Get terminal height, defaulting to 24 if unavailable
 */
function getTerminalHeight(): number {
  return process.stdout.rows || 24;
}

/**
 * Replace home directory with ~ in path
 */
function shortenPath(filePath: string): string {
  const home = homedir();
  if (filePath.startsWith(home)) {
    return "~" + filePath.slice(home.length);
  }
  return filePath;
}

/**
 * Strip ANSI codes for length calculation
 */
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

/**
 * Truncate or pad a string to a specific width (ANSI-aware)
 */
function fitToWidth(str: string, width: number): string {
  const plainStr = stripAnsi(str);
  if (plainStr.length > width) {
    // Find where to cut in the original string
    let visibleLen = 0;
    let cutIndex = 0;
    for (let i = 0; i < str.length; i++) {
      if (str[i] === "\x1b") {
        // Skip ANSI sequence
        const end = str.indexOf("m", i);
        if (end !== -1) {
          i = end;
          continue;
        }
      }
      visibleLen++;
      if (visibleLen >= width - 1) {
        cutIndex = i + 1;
        break;
      }
    }
    return str.slice(0, cutIndex) + "\x1b[0m";
  }
  return str + " ".repeat(Math.max(0, width - plainStr.length));
}

/**
 * Format preview content with line numbers
 */
function formatPreviewContent(
  content: string,
  previewHeight: number,
  scrollOffset: number,
  previewWidth: number
): { lines: string[]; totalLines: number } {
  const allLines = content.split("\n");
  const totalLines = allLines.length;

  // Clamp scroll offset
  const maxScroll = Math.max(0, totalLines - previewHeight);
  const startLine = Math.min(scrollOffset, maxScroll);
  const visibleLines = allLines.slice(startLine, startLine + previewHeight);

  const lineNumWidth = String(totalLines).length;
  const contentWidth = previewWidth - lineNumWidth - 3; // "123| " format

  const formattedLines = visibleLines.map((line, idx) => {
    const lineNum = startLine + idx + 1;
    const lineNumStr = String(lineNum).padStart(lineNumWidth, " ");
    // Truncate line if too long
    const displayLine =
      line.length > contentWidth ? line.slice(0, contentWidth - 1) + "~" : line;
    return `\x1b[90m${lineNumStr}\x1b[0m\x1b[90m|\x1b[0m ${displayLine}`;
  });

  // Pad with empty lines if content is shorter than preview height
  while (formattedLines.length < previewHeight) {
    formattedLines.push("");
  }

  return { lines: formattedLines, totalLines };
}

/**
 * Fuzzy match a filter against a filename
 */
function fuzzyMatch(filter: string, text: string): boolean {
  const lowerFilter = filter.toLowerCase();
  const lowerText = text.toLowerCase();

  // Check if all filter chars appear in order
  let filterIdx = 0;
  for (let i = 0; i < lowerText.length && filterIdx < lowerFilter.length; i++) {
    if (lowerText[i] === lowerFilter[filterIdx]) {
      filterIdx++;
    }
  }
  return filterIdx === lowerFilter.length;
}

/**
 * Highlight matching characters in text
 */
function highlightMatch(filter: string, text: string): string {
  if (!filter) return text;

  const lowerFilter = filter.toLowerCase();
  const lowerText = text.toLowerCase();

  let result = "";
  let filterIdx = 0;

  for (let i = 0; i < text.length; i++) {
    if (
      filterIdx < lowerFilter.length &&
      lowerText[i] === lowerFilter[filterIdx]
    ) {
      result += `\x1b[36m\x1b[1m${text[i]}\x1b[0m`; // Cyan bold for matches
      filterIdx++;
    } else {
      result += text[i];
    }
  }

  return result;
}

export interface FileSelectorConfig {
  message: string;
  files: AgentFile[];
  pageSize?: number;
}

/**
 * Interactive file selector with preview pane
 */
export const fileSelector = createPrompt<FileSelectorResult, FileSelectorConfig>(
  (config, done) => {
    const { files, pageSize = 15 } = config;
    const prefix = usePrefix({ status: "idle", theme: makeTheme({}) });

    const [cursor, setCursor] = useState(0);
    const [filter, setFilter] = useState("");
    const [previewScroll, setPreviewScroll] = useState(0);

    // Filter files based on current filter
    const filteredFiles = filter
      ? files.filter((f) => fuzzyMatch(filter, f.name))
      : files;

    // Ensure cursor is within bounds
    const effectiveCursor = Math.min(cursor, Math.max(0, filteredFiles.length - 1));

    // Reset preview scroll when cursor changes
    const currentFile = filteredFiles[effectiveCursor];

    useKeypress((key, rl) => {
      const extKey = key as ExtendedKeyEvent;
      if (isEnterKey(key)) {
        if (currentFile) {
          done({ action: "run", path: currentFile.path });
        }
        return;
      }

      // Ctrl+E to edit the file in $EDITOR
      if (key.ctrl && key.name === "e") {
        if (currentFile) {
          done({ action: "edit", path: currentFile.path });
        }
        return;
      }

      if (isUpKey(key)) {
        setCursor(Math.max(0, effectiveCursor - 1));
        setPreviewScroll(0);
        return;
      }

      if (isDownKey(key)) {
        setCursor(Math.min(filteredFiles.length - 1, effectiveCursor + 1));
        setPreviewScroll(0);
        return;
      }

      // Page up/down for preview scrolling
      if (key.name === "pageup" || (key.ctrl && key.name === "u")) {
        setPreviewScroll(Math.max(0, previewScroll - 5));
        return;
      }

      if (key.name === "pagedown" || (key.ctrl && key.name === "d")) {
        setPreviewScroll(previewScroll + 5);
        return;
      }

      // Backspace to delete filter character
      if (key.name === "backspace") {
        setFilter(filter.slice(0, -1));
        setCursor(0);
        setPreviewScroll(0);
        return;
      }

      // Escape to clear filter
      if (key.name === "escape") {
        if (filter) {
          setFilter("");
          setCursor(0);
          setPreviewScroll(0);
        }
        return;
      }

      // Add character to filter (printable characters only)
      if (extKey.sequence && extKey.sequence.length === 1 && !extKey.ctrl && !extKey.meta) {
        const char = extKey.sequence;
        if (char.match(/[\w\-\.]/)) {
          setFilter(filter + char);
          setCursor(0);
          setPreviewScroll(0);
        }
      }
    });

    // Calculate layout dimensions
    const termWidth = getTerminalWidth();
    const termHeight = getTerminalHeight();
    const listWidth = Math.floor(termWidth * 0.35);
    const separatorWidth = 3;
    const previewWidth = termWidth - listWidth - separatorWidth - 2;
    const contentHeight = Math.min(pageSize, termHeight - 6);

    // Build file list with pagination
    const startIdx = Math.max(
      0,
      Math.min(effectiveCursor - Math.floor(contentHeight / 2), filteredFiles.length - contentHeight)
    );
    const visibleFiles = filteredFiles.slice(startIdx, startIdx + contentHeight);

    const listLines: string[] = [];

    for (let i = 0; i < contentHeight; i++) {
      const file = visibleFiles[i];
      if (!file) {
        listLines.push("");
        continue;
      }

      const fileIdx = startIdx + i;
      const isSelected = fileIdx === effectiveCursor;
      const pointer = isSelected ? "\x1b[36m>\x1b[0m" : " ";
      const name = highlightMatch(filter, file.name);
      const source =
        file.source === "cwd"
          ? ""
          : ` \x1b[90m(${file.source})\x1b[0m`;

      if (isSelected) {
        listLines.push(`${pointer} \x1b[1m${name}\x1b[0m${source}`);
      } else {
        listLines.push(`${pointer} ${name}${source}`);
      }
    }

    // Build preview pane
    let previewLines: string[] = [];
    let previewHeader = "";
    let previewFooter = "";
    let totalLines = 0;

    if (currentFile) {
      const content = readFileContentSync(currentFile.path);
      const formatted = formatPreviewContent(
        content,
        contentHeight - 2, // Leave room for header and footer
        previewScroll,
        previewWidth
      );
      previewLines = formatted.lines;
      totalLines = formatted.totalLines;

      // Header: shortened path
      const shortPath = shortenPath(currentFile.path);
      previewHeader = `\x1b[1m\x1b[34m${shortPath}\x1b[0m`;

      // Footer: scroll position
      const scrollPct =
        totalLines <= contentHeight - 2
          ? 100
          : Math.round(
              ((previewScroll + contentHeight - 2) / totalLines) * 100
            );
      previewFooter = `\x1b[90m${Math.min(previewScroll + 1, totalLines)}-${Math.min(previewScroll + contentHeight - 2, totalLines)} of ${totalLines} lines (${Math.min(scrollPct, 100)}%)\x1b[0m`;
    }

    // Combine list and preview side by side
    const separator = " \x1b[90m│\x1b[0m ";
    const outputLines: string[] = [];

    // Header line
    const filterDisplay = filter
      ? `\x1b[90mFilter:\x1b[0m \x1b[36m${filter}\x1b[0m`
      : `\x1b[90mType to filter...\x1b[0m`;
    const matchCount = `\x1b[90m(${filteredFiles.length}/${files.length})\x1b[0m`;
    outputLines.push(`${prefix} ${config.message} ${matchCount}  ${filterDisplay}`);
    outputLines.push("");

    for (let i = 0; i < contentHeight; i++) {
      const listLine = fitToWidth(listLines[i] || "", listWidth);
      let previewLine = "";

      if (i === 0) {
        previewLine = previewHeader;
      } else if (i === contentHeight - 1) {
        previewLine = previewFooter;
      } else if (previewLines[i - 1]) {
        previewLine = previewLines[i - 1] ?? "";
      }

      previewLine = fitToWidth(previewLine, previewWidth);
      outputLines.push(`${listLine}${separator}${previewLine}`);
    }

    // Help line
    outputLines.push("");
    outputLines.push(
      `\x1b[90m↑↓ navigate  PgUp/PgDn scroll preview  Enter run  Ctrl+E edit  Esc clear filter\x1b[0m`
    );

    return outputLines.join("\n");
  }
);

/**
 * Open a file in the user's $EDITOR
 * Returns true if successful, false if editor not configured or failed
 */
function openInEditor(filePath: string): boolean {
  const editor = process.env.EDITOR || process.env.VISUAL;

  if (!editor) {
    console.error(
      "\x1b[33mNo $EDITOR environment variable set.\x1b[0m\n" +
      "Set it in your shell config (e.g., ~/.bashrc or ~/.zshrc):\n" +
      "  export EDITOR=vim\n" +
      "  export EDITOR=nano\n" +
      "  export EDITOR=\"code --wait\"\n"
    );
    return false;
  }

  try {
    // Parse editor command (may include flags like "code --wait")
    const parts = editor.split(/\s+/);
    const cmd = parts[0]!;
    const args = [...parts.slice(1), filePath];

    const result = spawnSync(cmd, args, {
      stdio: "inherit",
      shell: false,
    });

    if (result.error) {
      console.error(
        `\x1b[31mFailed to open editor "${editor}":\x1b[0m ${result.error.message}\n` +
        "Check that your $EDITOR is installed and in your PATH."
      );
      return false;
    }

    return result.status === 0;
  } catch (error) {
    console.error(
      `\x1b[31mFailed to open editor "${editor}":\x1b[0m ${error}\n` +
      "Check that your $EDITOR is installed and in your PATH."
    );
    return false;
  }
}

/**
 * Show interactive file picker with preview and return selected file path
 */
export async function showFileSelectorWithPreview(
  files: AgentFile[]
): Promise<string | undefined> {
  if (files.length === 0) {
    return undefined;
  }

  // Loop to allow editing and returning to selector
  while (true) {
    try {
      const result = await fileSelector({
        message: "Select an agent to run:",
        files,
        pageSize: 15,
      });

      if (result.action === "edit") {
        // Open in editor, then return to selector
        openInEditor(result.path);
        // Clear file content cache so preview reflects edits
        fileContentCache.clear();
        // Clear screen before re-showing selector to avoid duplication artifacts
        process.stdout.write("\x1b[2J\x1b[H");
        continue;
      }

      // action === "run"
      return result.path;
    } catch {
      // User cancelled (Ctrl+C) or other error
      return undefined;
    }
  }
}
