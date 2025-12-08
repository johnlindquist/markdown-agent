/**
 * Tests for the pure import injector (Phase 3)
 *
 * These tests verify the injector's ability to replace import markers
 * with resolved content WITHOUT any filesystem dependencies.
 */

import { describe, it, expect } from 'bun:test';
import { injectImports, createResolvedImport } from './imports-injector';
import type { ResolvedImport, ImportAction } from './imports-types';

describe('injectImports', () => {
  describe('basic injection', () => {
    it('injects single file import', () => {
      const original = 'Before @./file.md After';
      const resolved: ResolvedImport[] = [
        {
          action: {
            type: 'file',
            path: './file.md',
            original: '@./file.md',
            index: 7,
          },
          content: 'INJECTED',
        },
      ];

      const result = injectImports(original, resolved);
      expect(result).toBe('Before INJECTED After');
    });

    it('injects at start of string', () => {
      const original = '@./file.md rest';
      const resolved: ResolvedImport[] = [
        {
          action: {
            type: 'file',
            path: './file.md',
            original: '@./file.md',
            index: 0,
          },
          content: 'START',
        },
      ];

      const result = injectImports(original, resolved);
      expect(result).toBe('START rest');
    });

    it('injects at end of string', () => {
      const original = 'start @./file.md';
      const resolved: ResolvedImport[] = [
        {
          action: {
            type: 'file',
            path: './file.md',
            original: '@./file.md',
            index: 6,
          },
          content: 'END',
        },
      ];

      const result = injectImports(original, resolved);
      expect(result).toBe('start END');
    });

    it('returns original when no imports', () => {
      const original = 'No imports here';
      const result = injectImports(original, []);
      expect(result).toBe(original);
    });
  });

  describe('multiple imports', () => {
    it('injects multiple imports in order', () => {
      const original = '@./a.md and @./b.md';
      const resolved: ResolvedImport[] = [
        {
          action: {
            type: 'file',
            path: './a.md',
            original: '@./a.md',
            index: 0,
          },
          content: 'AAA',
        },
        {
          action: {
            type: 'file',
            path: './b.md',
            original: '@./b.md',
            index: 12,
          },
          content: 'BBB',
        },
      ];

      const result = injectImports(original, resolved);
      expect(result).toBe('AAA and BBB');
    });

    it('handles many imports', () => {
      let original = '';
      const resolved: ResolvedImport[] = [];

      for (let i = 0; i < 10; i++) {
        const marker = `@./f${i}.md`;
        const startIndex = original.length;
        original += marker + ' ';
        resolved.push({
          action: {
            type: 'file',
            path: `./f${i}.md`,
            original: marker,
            index: startIndex,
          },
          content: `[${i}]`,
        });
      }

      const result = injectImports(original, resolved);
      expect(result).toBe('[0] [1] [2] [3] [4] [5] [6] [7] [8] [9] ');
    });

    it('handles imports out of order in resolved array', () => {
      const original = '@./first.md middle @./second.md';
      // Provide in reverse order - injector should handle it
      const resolved: ResolvedImport[] = [
        {
          action: {
            type: 'file',
            path: './second.md',
            original: '@./second.md',
            index: 19,
          },
          content: 'TWO',
        },
        {
          action: {
            type: 'file',
            path: './first.md',
            original: '@./first.md',
            index: 0,
          },
          content: 'ONE',
        },
      ];

      const result = injectImports(original, resolved);
      expect(result).toBe('ONE middle TWO');
    });
  });

  describe('mixed import types', () => {
    it('injects file, URL, and command imports', () => {
      const original = 'File: @./f.md URL: @https://x.com Cmd: !`ls`';
      const resolved: ResolvedImport[] = [
        {
          action: {
            type: 'file',
            path: './f.md',
            original: '@./f.md',
            index: 6,
          },
          content: 'FILE_CONTENT',
        },
        {
          action: {
            type: 'url',
            url: 'https://x.com',
            original: '@https://x.com',
            index: 19,
          },
          content: 'URL_CONTENT',
        },
        {
          action: {
            type: 'command',
            command: 'ls',
            original: '!`ls`',
            index: 39,
          },
          content: 'CMD_OUTPUT',
        },
      ];

      const result = injectImports(original, resolved);
      expect(result).toBe('File: FILE_CONTENT URL: URL_CONTENT Cmd: CMD_OUTPUT');
    });

    it('injects glob import', () => {
      const original = 'Files: @./src/*.ts';
      const resolved: ResolvedImport[] = [
        {
          action: {
            type: 'glob',
            pattern: './src/*.ts',
            original: '@./src/*.ts',
            index: 7,
          },
          content: '<file1>content1</file1>\n<file2>content2</file2>',
        },
      ];

      const result = injectImports(original, resolved);
      expect(result).toBe('Files: <file1>content1</file1>\n<file2>content2</file2>');
    });

    it('injects symbol import', () => {
      const original = 'Type: @./types.ts#User';
      const resolved: ResolvedImport[] = [
        {
          action: {
            type: 'symbol',
            path: './types.ts',
            symbol: 'User',
            original: '@./types.ts#User',
            index: 6,
          },
          content: 'interface User { name: string; }',
        },
      ];

      const result = injectImports(original, resolved);
      expect(result).toBe('Type: interface User { name: string; }');
    });
  });

  describe('content variations', () => {
    it('handles empty content injection', () => {
      const original = 'A @./empty.md B';
      const resolved: ResolvedImport[] = [
        {
          action: {
            type: 'file',
            path: './empty.md',
            original: '@./empty.md',
            index: 2,
          },
          content: '',
        },
      ];

      const result = injectImports(original, resolved);
      expect(result).toBe('A  B');
    });

    it('handles multiline content injection', () => {
      const original = 'Start @./multi.md End';
      const resolved: ResolvedImport[] = [
        {
          action: {
            type: 'file',
            path: './multi.md',
            original: '@./multi.md',
            index: 6,
          },
          content: 'Line 1\nLine 2\nLine 3',
        },
      ];

      const result = injectImports(original, resolved);
      expect(result).toBe('Start Line 1\nLine 2\nLine 3 End');
    });

    it('handles content with special characters', () => {
      const original = 'Data: @./data.json';
      const resolved: ResolvedImport[] = [
        {
          action: {
            type: 'file',
            path: './data.json',
            original: '@./data.json',
            index: 6,
          },
          content: '{"key": "value", "arr": [1, 2, 3]}',
        },
      ];

      const result = injectImports(original, resolved);
      expect(result).toBe('Data: {"key": "value", "arr": [1, 2, 3]}');
    });

    it('handles content with regex-special characters', () => {
      const original = '@./regex.txt';
      const resolved: ResolvedImport[] = [
        {
          action: {
            type: 'file',
            path: './regex.txt',
            original: '@./regex.txt',
            index: 0,
          },
          content: '$1 $2 .* \\d+ [a-z]',
        },
      ];

      const result = injectImports(original, resolved);
      expect(result).toBe('$1 $2 .* \\d+ [a-z]');
    });

    it('handles content larger than original', () => {
      const original = '@./x.md';
      const resolved: ResolvedImport[] = [
        {
          action: {
            type: 'file',
            path: './x.md',
            original: '@./x.md',
            index: 0,
          },
          content: 'This is a much longer piece of content that replaces a short import marker',
        },
      ];

      const result = injectImports(original, resolved);
      expect(result).toBe('This is a much longer piece of content that replaces a short import marker');
    });

    it('handles unicode content', () => {
      const original = 'Emoji: @./emoji.md';
      const resolved: ResolvedImport[] = [
        {
          action: {
            type: 'file',
            path: './emoji.md',
            original: '@./emoji.md',
            index: 7,
          },
          content: '\u{1F680} \u{1F389} \u{2728}',
        },
      ];

      const result = injectImports(original, resolved);
      expect(result).toBe('Emoji: \u{1F680} \u{1F389} \u{2728}');
    });
  });

  describe('edge cases', () => {
    it('handles adjacent imports', () => {
      const original = '@./a.md@./b.md';
      // Note: In real parsing, @./a.md@./b.md might be parsed as one long path
      // This test assumes they're somehow parsed separately
      const resolved: ResolvedImport[] = [
        {
          action: {
            type: 'file',
            path: './a.md',
            original: '@./a.md',
            index: 0,
          },
          content: 'A',
        },
        {
          action: {
            type: 'file',
            path: './b.md',
            original: '@./b.md',
            index: 7,
          },
          content: 'B',
        },
      ];

      const result = injectImports(original, resolved);
      expect(result).toBe('AB');
    });

    it('preserves surrounding whitespace', () => {
      const original = '  @./f.md  ';
      const resolved: ResolvedImport[] = [
        {
          action: {
            type: 'file',
            path: './f.md',
            original: '@./f.md',
            index: 2,
          },
          content: 'X',
        },
      ];

      const result = injectImports(original, resolved);
      expect(result).toBe('  X  ');
    });

    it('handles newlines around imports', () => {
      const original = 'Line 1\n@./f.md\nLine 3';
      const resolved: ResolvedImport[] = [
        {
          action: {
            type: 'file',
            path: './f.md',
            original: '@./f.md',
            index: 7,
          },
          content: 'Line 2',
        },
      ];

      const result = injectImports(original, resolved);
      expect(result).toBe('Line 1\nLine 2\nLine 3');
    });
  });
});

describe('createResolvedImport', () => {
  it('creates resolved import from action and content', () => {
    const action: ImportAction = {
      type: 'file',
      path: './test.md',
      original: '@./test.md',
      index: 0,
    };

    const resolved = createResolvedImport(action, 'test content');

    expect(resolved).toEqual({
      action,
      content: 'test content',
    });
  });
});
