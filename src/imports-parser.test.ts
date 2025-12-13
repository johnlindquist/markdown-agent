/**
 * Comprehensive tests for the pure import parser (Phase 1)
 *
 * These tests verify the parser's ability to extract import actions
 * from content WITHOUT any filesystem dependencies.
 */

import { describe, it, expect } from 'bun:test';
import {
  parseImports,
  hasImportsInContent,
  isGlobPattern,
  parseLineRange,
  parseSymbolExtraction,
  findSafeRanges,
} from './imports-parser';

describe('parseImports', () => {
  describe('file imports', () => {
    it('parses simple relative file import', () => {
      const actions = parseImports('@./file.md');
      expect(actions).toHaveLength(1);
      expect(actions[0]).toEqual({
        type: 'file',
        path: './file.md',
        original: '@./file.md',
        index: 0,
      });
    });

    it('parses tilde path import', () => {
      const actions = parseImports('@~/config/settings.yaml');
      expect(actions).toHaveLength(1);
      expect(actions[0]).toEqual({
        type: 'file',
        path: '~/config/settings.yaml',
        original: '@~/config/settings.yaml',
        index: 0,
      });
    });

    it('parses absolute path import', () => {
      const actions = parseImports('@/absolute/path/file.ts');
      expect(actions).toHaveLength(1);
      expect(actions[0]).toEqual({
        type: 'file',
        path: '/absolute/path/file.ts',
        original: '@/absolute/path/file.ts',
        index: 0,
      });
    });

    it('parses file import with surrounding text', () => {
      const actions = parseImports('Before @./file.md After');
      expect(actions).toHaveLength(1);
      expect(actions[0]!.type).toBe('file');
      expect((actions[0] as any).path).toBe('./file.md');
      expect(actions[0]!.index).toBe(7);
    });

    it('parses multiple file imports', () => {
      const actions = parseImports('@./first.md and @./second.md');
      expect(actions).toHaveLength(2);
      expect(actions[0]!.type).toBe('file');
      expect((actions[0] as any).path).toBe('./first.md');
      expect(actions[1]!.type).toBe('file');
      expect((actions[1] as any).path).toBe('./second.md');
    });

    it('parses file with various extensions', () => {
      const extensions = ['.md', '.ts', '.js', '.yaml', '.json', '.txt', '.tsx'];
      for (const ext of extensions) {
        const actions = parseImports(`@./file${ext}`);
        expect(actions).toHaveLength(1);
        expect((actions[0] as any).path).toBe(`./file${ext}`);
      }
    });

    it('parses deeply nested paths', () => {
      const actions = parseImports('@./src/components/ui/buttons/PrimaryButton.tsx');
      expect(actions).toHaveLength(1);
      expect((actions[0] as any).path).toBe('./src/components/ui/buttons/PrimaryButton.tsx');
    });

    it('does NOT match email addresses', () => {
      const actions = parseImports('contact@example.com');
      expect(actions).toHaveLength(0);
    });

    it('does NOT match @ in middle of word', () => {
      const actions = parseImports('user@domain');
      expect(actions).toHaveLength(0);
    });
  });

  describe('line range imports', () => {
    it('parses line range syntax', () => {
      const actions = parseImports('@./file.ts:10-50');
      expect(actions).toHaveLength(1);
      expect(actions[0]).toEqual({
        type: 'file',
        path: './file.ts',
        lineRange: { start: 10, end: 50 },
        original: '@./file.ts:10-50',
        index: 0,
      });
    });

    it('parses single line range', () => {
      const actions = parseImports('@./file.ts:1-1');
      expect(actions).toHaveLength(1);
      expect((actions[0] as any).lineRange).toEqual({ start: 1, end: 1 });
    });

    it('parses large line numbers', () => {
      const actions = parseImports('@./file.ts:1000-2000');
      expect(actions).toHaveLength(1);
      expect((actions[0] as any).lineRange).toEqual({ start: 1000, end: 2000 });
    });

    it('parses line range with nested path', () => {
      const actions = parseImports('@./src/deep/file.ts:5-15');
      expect(actions).toHaveLength(1);
      expect((actions[0] as any).path).toBe('./src/deep/file.ts');
      expect((actions[0] as any).lineRange).toEqual({ start: 5, end: 15 });
    });

    it('parses multiple line range imports', () => {
      const actions = parseImports('@./a.ts:1-10 @./b.ts:20-30');
      expect(actions).toHaveLength(2);
      expect((actions[0] as any).lineRange).toEqual({ start: 1, end: 10 });
      expect((actions[1] as any).lineRange).toEqual({ start: 20, end: 30 });
    });
  });

  describe('symbol imports', () => {
    it('parses symbol extraction syntax', () => {
      const actions = parseImports('@./types.ts#UserInterface');
      expect(actions).toHaveLength(1);
      expect(actions[0]).toEqual({
        type: 'symbol',
        path: './types.ts',
        symbol: 'UserInterface',
        original: '@./types.ts#UserInterface',
        index: 0,
      });
    });

    it('parses symbol with underscore', () => {
      const actions = parseImports('@./file.ts#_privateSymbol');
      expect(actions).toHaveLength(1);
      expect((actions[0] as any).symbol).toBe('_privateSymbol');
    });

    it('parses symbol with dollar sign', () => {
      const actions = parseImports('@./file.ts#$specialVar');
      expect(actions).toHaveLength(1);
      expect((actions[0] as any).symbol).toBe('$specialVar');
    });

    it('parses symbol with numbers', () => {
      const actions = parseImports('@./file.ts#Config2');
      expect(actions).toHaveLength(1);
      expect((actions[0] as any).symbol).toBe('Config2');
    });

    it('parses symbol from nested path', () => {
      const actions = parseImports('@./src/models/user.ts#UserModel');
      expect(actions).toHaveLength(1);
      expect((actions[0] as any).path).toBe('./src/models/user.ts');
      expect((actions[0] as any).symbol).toBe('UserModel');
    });

    it('parses multiple symbol imports', () => {
      const actions = parseImports('@./a.ts#Foo @./b.ts#Bar');
      expect(actions).toHaveLength(2);
      expect((actions[0] as any).symbol).toBe('Foo');
      expect((actions[1] as any).symbol).toBe('Bar');
    });
  });

  describe('glob imports', () => {
    it('parses asterisk glob', () => {
      const actions = parseImports('@./src/*.ts');
      expect(actions).toHaveLength(1);
      expect(actions[0]).toEqual({
        type: 'glob',
        pattern: './src/*.ts',
        original: '@./src/*.ts',
        index: 0,
      });
    });

    it('parses double asterisk glob', () => {
      const actions = parseImports('@./src/**/*.ts');
      expect(actions).toHaveLength(1);
      expect((actions[0] as any).pattern).toBe('./src/**/*.ts');
    });

    it('parses question mark glob', () => {
      const actions = parseImports('@./file?.ts');
      expect(actions).toHaveLength(1);
      expect(actions[0]!.type).toBe('glob');
    });

    it('parses bracket glob', () => {
      const actions = parseImports('@./test/[abc].ts');
      expect(actions).toHaveLength(1);
      expect(actions[0]!.type).toBe('glob');
    });

    it('parses complex glob patterns', () => {
      const actions = parseImports('@./src/**/components/**/*.tsx');
      expect(actions).toHaveLength(1);
      expect((actions[0] as any).pattern).toBe('./src/**/components/**/*.tsx');
    });

    it('parses multiple glob imports', () => {
      const actions = parseImports('@./src/*.ts @./lib/*.js');
      expect(actions).toHaveLength(2);
      expect(actions[0]!.type).toBe('glob');
      expect(actions[1]!.type).toBe('glob');
    });
  });

  describe('URL imports', () => {
    it('parses https URL', () => {
      const actions = parseImports('@https://example.com/file.md');
      expect(actions).toHaveLength(1);
      expect(actions[0]).toEqual({
        type: 'url',
        url: 'https://example.com/file.md',
        original: '@https://example.com/file.md',
        index: 0,
      });
    });

    it('parses http URL', () => {
      const actions = parseImports('@http://localhost:3000/api');
      expect(actions).toHaveLength(1);
      expect((actions[0] as any).url).toBe('http://localhost:3000/api');
    });

    it('parses URL with path and query', () => {
      const actions = parseImports('@https://api.github.com/repos/user/repo?ref=main');
      expect(actions).toHaveLength(1);
      expect((actions[0] as any).url).toBe('https://api.github.com/repos/user/repo?ref=main');
    });

    it('parses URL with hash', () => {
      const actions = parseImports('@https://example.com/docs#section');
      expect(actions).toHaveLength(1);
      expect((actions[0] as any).url).toBe('https://example.com/docs#section');
    });

    it('parses multiple URL imports', () => {
      const actions = parseImports('@https://a.com/1 @https://b.com/2');
      expect(actions).toHaveLength(2);
      expect((actions[0] as any).url).toBe('https://a.com/1');
      expect((actions[1] as any).url).toBe('https://b.com/2');
    });

    it('distinguishes URL imports from email addresses', () => {
      const actions = parseImports('email: user@example.com url: @https://example.com');
      expect(actions).toHaveLength(1);
      expect(actions[0]!.type).toBe('url');
    });
  });

  describe('command imports', () => {
    it('parses simple command', () => {
      const actions = parseImports('!`echo hello`');
      expect(actions).toHaveLength(1);
      expect(actions[0]).toEqual({
        type: 'command',
        command: 'echo hello',
        original: '!`echo hello`',
        index: 0,
      });
    });

    it('parses command with pipes', () => {
      const actions = parseImports('!`cat file.txt | grep pattern`');
      expect(actions).toHaveLength(1);
      expect((actions[0] as any).command).toBe('cat file.txt | grep pattern');
    });

    it('parses command with arguments', () => {
      const actions = parseImports('!`ls -la /path/to/dir`');
      expect(actions).toHaveLength(1);
      expect((actions[0] as any).command).toBe('ls -la /path/to/dir');
    });

    it('parses command with quotes inside', () => {
      const actions = parseImports('!`echo "hello world"`');
      expect(actions).toHaveLength(1);
      expect((actions[0] as any).command).toBe('echo "hello world"');
    });

    it('parses multiple commands', () => {
      const actions = parseImports('!`cmd1` and !`cmd2`');
      expect(actions).toHaveLength(2);
      expect((actions[0] as any).command).toBe('cmd1');
      expect((actions[1] as any).command).toBe('cmd2');
    });

    it('does NOT match regular backticks without !', () => {
      const actions = parseImports('`code block`');
      expect(actions).toHaveLength(0);
    });
  });

  describe('mixed imports', () => {
    it('parses file, URL, and command together', () => {
      const content = '@./file.md @https://example.com !`echo test`';
      const actions = parseImports(content);
      expect(actions).toHaveLength(3);
      expect(actions[0]!.type).toBe('file');
      expect(actions[1]!.type).toBe('url');
      expect(actions[2]!.type).toBe('command');
    });

    it('maintains correct order by index', () => {
      const content = 'A !`cmd` B @./file.md C @https://url.com D';
      const actions = parseImports(content);
      expect(actions).toHaveLength(3);
      // Should be in order of appearance
      expect(actions[0]!.type).toBe('command');
      expect(actions[1]!.type).toBe('file');
      expect(actions[2]!.type).toBe('url');
    });

    it('handles imports on multiple lines', () => {
      const content = "Line 1: @./first.md\nLine 2: !\`date\`\nLine 3: @https://example.com";
      const actions = parseImports(content);
      expect(actions).toHaveLength(3);
    });

    it('handles complex markdown with imports', () => {
      const content = "# Title\n\nRead the config: @./config.yaml\n\n## Commands\n\nOutput: !\`ls -la\`\n\n## External Docs\n\nSee @https://docs.example.com for more info.\n";
      const actions = parseImports(content);
      expect(actions).toHaveLength(3);
    });
  });

  describe('edge cases', () => {
    it('returns empty array for content with no imports', () => {
      const actions = parseImports('Just regular text');
      expect(actions).toHaveLength(0);
    });

    it('returns empty array for empty string', () => {
      const actions = parseImports('');
      expect(actions).toHaveLength(0);
    });

    it('handles imports at very start of string', () => {
      const actions = parseImports('@./file.md');
      expect(actions[0]!.index).toBe(0);
    });

    it('handles imports at end of string', () => {
      const content = 'text @./file.md';
      const actions = parseImports(content);
      expect(actions[0]!.index).toBe(5);
    });

    it('handles consecutive imports without space', () => {
      // This will be parsed as one import due to regex behavior
      const actions = parseImports('@./a.md@./b.md');
      // The second @ is part of the first path due to [^\s]+ matching
      expect(actions.length).toBeGreaterThanOrEqual(1);
    });

    it('handles newline-separated imports', () => {
      const actions = parseImports('@./a.md\n@./b.md');
      expect(actions).toHaveLength(2);
    });

    it('handles tab-separated imports', () => {
      const actions = parseImports('@./a.md\t@./b.md');
      expect(actions).toHaveLength(2);
    });

    it('handles paths with spaces (stops at space)', () => {
      const actions = parseImports('@./path with spaces.md more text');
      expect(actions).toHaveLength(1);
      // Path stops at first space
      expect((actions[0] as any).path).toBe('./path');
    });

    it('handles paths with special chars', () => {
      const actions = parseImports('@./file-name_v2.test.ts');
      expect(actions).toHaveLength(1);
      expect((actions[0] as any).path).toBe('./file-name_v2.test.ts');
    });
  });

  describe('context-aware parsing - ignores code blocks', () => {
    it('ignores imports inside fenced code blocks', () => {
      const content = '```\n@./inside-code.md\n```';
      const actions = parseImports(content);
      // Context-aware parser ignores imports inside code blocks
      expect(actions).toHaveLength(0);
    });

    it('ignores imports inside fenced code blocks with language', () => {
      const content = '```typescript\n@./inside-code.md\n```';
      const actions = parseImports(content);
      expect(actions).toHaveLength(0);
    });

    it('ignores imports inside tilde fenced code blocks', () => {
      const content = '~~~\n@./inside-code.md\n~~~';
      const actions = parseImports(content);
      expect(actions).toHaveLength(0);
    });

    it('ignores imports inside inline code spans', () => {
      const content = 'Use `@./path.md` syntax';
      const actions = parseImports(content);
      // Context-aware parser ignores imports inside inline code
      expect(actions).toHaveLength(0);
    });

    it('ignores command imports inside inline code spans', () => {
      const content = 'Use `!`echo test`` syntax';
      const actions = parseImports(content);
      expect(actions).toHaveLength(0);
    });

    it('ignores URL imports inside code blocks', () => {
      const content = '```\n@https://example.com\n```';
      const actions = parseImports(content);
      expect(actions).toHaveLength(0);
    });

    it('parses imports before and after code blocks', () => {
      const content = '@./before.md\n```\n@./inside.md\n```\n@./after.md';
      const actions = parseImports(content);
      expect(actions).toHaveLength(2);
      expect((actions[0] as any).path).toBe('./before.md');
      expect((actions[1] as any).path).toBe('./after.md');
    });

    it('parses imports between multiple code blocks', () => {
      const content = '```\n@./a.md\n```\n@./real.md\n```\n@./b.md\n```';
      const actions = parseImports(content);
      expect(actions).toHaveLength(1);
      expect((actions[0] as any).path).toBe('./real.md');
    });

    it('parses imports around inline code', () => {
      const content = '@./before.md `@./inside.md` @./after.md';
      const actions = parseImports(content);
      expect(actions).toHaveLength(2);
      expect((actions[0] as any).path).toBe('./before.md');
      expect((actions[1] as any).path).toBe('./after.md');
    });

    it('handles nested backticks in code blocks', () => {
      const content = '```\nconst x = `@./template.md`;\n```';
      const actions = parseImports(content);
      expect(actions).toHaveLength(0);
    });

    it('handles unclosed code block (treats rest as code)', () => {
      const content = '```\n@./inside.md';
      const actions = parseImports(content);
      expect(actions).toHaveLength(0);
    });

    it('handles complex document with mixed content', () => {
      const content = `# Documentation

Here is a real import: @./config.md

Example usage in code:
\`\`\`bash
# This should NOT be imported
@./example.md
\`\`\`

Inline example: \`@./inline-example.md\`

Another real import: @./footer.md
`;
      const actions = parseImports(content);
      expect(actions).toHaveLength(2);
      expect((actions[0] as any).path).toBe('./config.md');
      expect((actions[1] as any).path).toBe('./footer.md');
    });

    it('handles HTML comments (still parsed - not code blocks)', () => {
      const content = '<!-- @./commented.md -->';
      const actions = parseImports(content);
      // HTML comments are NOT code blocks, so imports are still parsed
      expect(actions).toHaveLength(1);
    });

    it('handles imports in markdown links', () => {
      const content = '[link](@./file.md)';
      const actions = parseImports(content);
      expect(actions).toHaveLength(1);
    });

    it('handles imports in markdown images', () => {
      const content = '![alt](@./image.png)';
      const actions = parseImports(content);
      expect(actions).toHaveLength(1);
    });

    it('handles very long paths', () => {
      const longPath = './a/' + 'b/'.repeat(50) + 'file.md';
      const actions = parseImports(`@${longPath}`);
      expect(actions).toHaveLength(1);
      expect((actions[0] as any).path).toBe(longPath);
    });

    it('handles unicode in content around imports', () => {
      const content = 'Emoji: \u{1F680} @./file.md \u{1F389}';
      const actions = parseImports(content);
      expect(actions).toHaveLength(1);
    });

    it('handles many imports in sequence', () => {
      const imports = Array.from({ length: 100 }, (_, i) => `@./file${i}.md`);
      const content = imports.join(' ');
      const actions = parseImports(content);
      expect(actions).toHaveLength(100);
    });
  });
});

describe('hasImportsInContent', () => {
  it('returns true for file imports', () => {
    expect(hasImportsInContent('@./file.md')).toBe(true);
    expect(hasImportsInContent('@~/file.md')).toBe(true);
    expect(hasImportsInContent('@/absolute.md')).toBe(true);
  });

  it('returns true for URL imports', () => {
    expect(hasImportsInContent('@https://example.com')).toBe(true);
    expect(hasImportsInContent('@http://localhost')).toBe(true);
  });

  it('returns true for command imports', () => {
    expect(hasImportsInContent('!`echo hello`')).toBe(true);
  });

  it('returns false for no imports', () => {
    expect(hasImportsInContent('just text')).toBe(false);
    expect(hasImportsInContent('')).toBe(false);
  });

  it('returns false for email addresses', () => {
    expect(hasImportsInContent('user@example.com')).toBe(false);
  });
});

describe('isGlobPattern', () => {
  it('detects asterisk', () => {
    expect(isGlobPattern('./src/*.ts')).toBe(true);
    expect(isGlobPattern('./**/*.ts')).toBe(true);
  });

  it('detects question mark', () => {
    expect(isGlobPattern('./file?.ts')).toBe(true);
  });

  it('detects brackets', () => {
    expect(isGlobPattern('./[abc].ts')).toBe(true);
    expect(isGlobPattern('./[0-9].ts')).toBe(true);
  });

  it('returns false for normal paths', () => {
    expect(isGlobPattern('./file.ts')).toBe(false);
    expect(isGlobPattern('./src/file.md')).toBe(false);
  });
});

describe('parseLineRange', () => {
  it('parses valid line range', () => {
    expect(parseLineRange('./file.ts:10-50')).toEqual({
      path: './file.ts',
      start: 10,
      end: 50,
    });
  });

  it('returns only path for no range', () => {
    expect(parseLineRange('./file.ts')).toEqual({
      path: './file.ts',
    });
  });

  it('handles single-digit ranges', () => {
    expect(parseLineRange('./f.ts:1-5')).toEqual({
      path: './f.ts',
      start: 1,
      end: 5,
    });
  });

  it('handles large numbers', () => {
    expect(parseLineRange('./f.ts:1000-9999')).toEqual({
      path: './f.ts',
      start: 1000,
      end: 9999,
    });
  });
});

describe('parseSymbolExtraction', () => {
  it('parses valid symbol', () => {
    expect(parseSymbolExtraction('./file.ts#MySymbol')).toEqual({
      path: './file.ts',
      symbol: 'MySymbol',
    });
  });

  it('returns only path for no symbol', () => {
    expect(parseSymbolExtraction('./file.ts')).toEqual({
      path: './file.ts',
    });
  });

  it('handles underscore prefix', () => {
    expect(parseSymbolExtraction('./f.ts#_private')).toEqual({
      path: './f.ts',
      symbol: '_private',
    });
  });

  it('handles dollar prefix', () => {
    expect(parseSymbolExtraction('./f.ts#$var')).toEqual({
      path: './f.ts',
      symbol: '$var',
    });
  });

  it('handles numbers in symbol', () => {
    expect(parseSymbolExtraction('./f.ts#Config2')).toEqual({
      path: './f.ts',
      symbol: 'Config2',
    });
  });
});

describe('executable code fence imports', () => {
  it('parses executable code fence with shebang', () => {
    const content = '```ts\n#!/usr/bin/env bun\nconsole.log("hello")\n```';
    const actions = parseImports(content);
    expect(actions).toHaveLength(1);
    expect(actions[0]!.type).toBe('executable_code_fence');
    const action = actions[0] as any;
    expect(action.shebang).toBe('#!/usr/bin/env bun');
    expect(action.language).toBe('ts');
    expect(action.code).toBe('console.log("hello")');
  });

  it('parses executable code fence with sh shebang', () => {
    const content = '```sh\n#!/bin/bash\necho "hello"\n```';
    const actions = parseImports(content);
    expect(actions).toHaveLength(1);
    expect(actions[0]!.type).toBe('executable_code_fence');
    const action = actions[0] as any;
    expect(action.shebang).toBe('#!/bin/bash');
    expect(action.language).toBe('sh');
    expect(action.code).toBe('echo "hello"');
  });

  it('parses executable code fence with python shebang', () => {
    const content = '```python\n#!/usr/bin/env python3\nprint("hello")\n```';
    const actions = parseImports(content);
    expect(actions).toHaveLength(1);
    expect(actions[0]!.type).toBe('executable_code_fence');
    const action = actions[0] as any;
    expect(action.shebang).toBe('#!/usr/bin/env python3');
    expect(action.language).toBe('python');
  });

  it('does NOT parse code fence without shebang', () => {
    const content = '```ts\nconsole.log("hello")\n```';
    const actions = parseImports(content);
    // No shebang means it's just a regular code block, not executable
    expect(actions).toHaveLength(0);
  });

  it('does NOT parse shebang that is not on first line of code', () => {
    const content = '```ts\n// comment\n#!/usr/bin/env bun\nconsole.log("hello")\n```';
    const actions = parseImports(content);
    // Shebang must be on the first line after the fence
    expect(actions).toHaveLength(0);
  });

  it('parses multiline code in executable fence', () => {
    const content = '```ts\n#!/usr/bin/env bun\nconst x = 1;\nconsole.log(x);\nprocess.exit(0);\n```';
    const actions = parseImports(content);
    expect(actions).toHaveLength(1);
    const action = actions[0] as any;
    expect(action.code).toContain('const x = 1;');
    expect(action.code).toContain('console.log(x);');
    expect(action.code).toContain('process.exit(0);');
  });

  it('handles variable-length fences (4+ backticks)', () => {
    const content = '````ts\n#!/usr/bin/env bun\nconsole.log("hello")\n````';
    const actions = parseImports(content);
    expect(actions).toHaveLength(1);
    expect(actions[0]!.type).toBe('executable_code_fence');
  });

  it('preserves original match for replacement', () => {
    const content = 'before\n```ts\n#!/usr/bin/env bun\nconsole.log("hello")\n```\nafter';
    const actions = parseImports(content);
    expect(actions).toHaveLength(1);
    const action = actions[0] as any;
    expect(action.original).toBe('```ts\n#!/usr/bin/env bun\nconsole.log("hello")\n```');
    expect(action.index).toBe(7); // Position after "before\n"
  });

  it('parses multiple executable fences', () => {
    const content = '```sh\n#!/bin/bash\necho 1\n```\n\n```ts\n#!/usr/bin/env bun\nconsole.log(2)\n```';
    const actions = parseImports(content);
    expect(actions).toHaveLength(2);
    expect(actions[0]!.type).toBe('executable_code_fence');
    expect(actions[1]!.type).toBe('executable_code_fence');
  });

  it('mixes executable fences with file imports', () => {
    const content = '@./config.md\n\n```ts\n#!/usr/bin/env bun\nconsole.log("hello")\n```\n\n@./footer.md';
    const actions = parseImports(content);
    expect(actions).toHaveLength(3);
    expect(actions[0]!.type).toBe('file');
    expect(actions[1]!.type).toBe('executable_code_fence');
    expect(actions[2]!.type).toBe('file');
  });
});

describe('findSafeRanges', () => {
  it('returns full range for plain text', () => {
    const content = 'plain text content';
    const ranges = findSafeRanges(content);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toEqual({ start: 0, end: content.length });
  });

  it('returns empty array for only code block', () => {
    const content = '```\ncode\n```';
    const ranges = findSafeRanges(content);
    expect(ranges).toHaveLength(0);
  });

  it('splits around fenced code block', () => {
    const content = 'before\n```\ncode\n```\nafter';
    const ranges = findSafeRanges(content);
    expect(ranges).toHaveLength(2);
    expect(ranges[0]).toEqual({ start: 0, end: 7 }); // 'before\n'
    expect(ranges[1]!.start).toBeGreaterThan(ranges[0]!.end);
  });

  it('splits around inline code', () => {
    const content = 'before `code` after';
    const ranges = findSafeRanges(content);
    expect(ranges).toHaveLength(2);
    expect(ranges[0]).toEqual({ start: 0, end: 7 }); // 'before '
    // After the closing backtick
    expect(ranges[1]!.start).toBe(13); // position after '`code`'
    expect(ranges[1]!.end).toBe(content.length);
  });

  it('handles multiple inline code spans', () => {
    const content = 'a `b` c `d` e';
    const ranges = findSafeRanges(content);
    expect(ranges).toHaveLength(3); // 'a ', ' c ', ' e'
  });

  it('handles tilde fenced code blocks', () => {
    const content = 'before\n~~~\ncode\n~~~\nafter';
    const ranges = findSafeRanges(content);
    expect(ranges).toHaveLength(2);
  });

  it('handles code block with language identifier', () => {
    const content = '```typescript\ncode\n```';
    const ranges = findSafeRanges(content);
    expect(ranges).toHaveLength(0);
  });

  it('handles unclosed code block', () => {
    const content = 'before\n```\ncode';
    const ranges = findSafeRanges(content);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toEqual({ start: 0, end: 7 }); // 'before\n'
  });

  it('handles empty content', () => {
    const ranges = findSafeRanges('');
    expect(ranges).toHaveLength(0);
  });

  it('handles multiple code blocks', () => {
    const content = 'a\n```\nb\n```\nc\n```\nd\n```\ne';
    const ranges = findSafeRanges(content);
    // Should have: 'a\n', 'c\n', 'e'
    expect(ranges).toHaveLength(3);
  });

  it('handles inline code at start', () => {
    const content = '`code` after';
    const ranges = findSafeRanges(content);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]!.start).toBe(6); // after '`code`'
  });

  it('handles inline code at end', () => {
    const content = 'before `code`';
    const ranges = findSafeRanges(content);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toEqual({ start: 0, end: 7 }); // 'before '
  });

  it('handles closing fence not at line start (stays in code)', () => {
    // Closing fence must be at start of line in markdown spec
    const content = '```\ncode ``` not closing\n```';
    const ranges = findSafeRanges(content);
    // The ``` in the middle is not a closing fence because it's not at line start
    expect(ranges).toHaveLength(0);
  });

  it('handles double backticks (not triple)', () => {
    // Per CommonMark spec, double backticks are valid inline code delimiters
    // `` @./file.md `` is a single inline code span containing "@./file.md"
    const content = '`` @./file.md ``';
    const ranges = findSafeRanges(content);
    // Entire content is inline code, so no safe ranges
    expect(ranges).toHaveLength(0);
  });
});
