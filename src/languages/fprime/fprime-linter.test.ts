import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { fprimeLinter } from './fprime-linter.js';
import { fprimeParser } from './fprime.js';
import { LRLanguage, LanguageSupport } from '@codemirror/language';

describe('F-Prime Linter', () => {
  function lint(doc: string) {
    // Create a simple language support with our parser
    const fprimeLanguage = LRLanguage.define({
      parser: fprimeParser,
    });

    const state = EditorState.create({
      doc,
      extensions: [new LanguageSupport(fprimeLanguage)],
    });

    const view = { state } as EditorView;
    return fprimeLinter(view);
  }

  describe('missing commas', () => {
    it('should flag missing comma between numbers', () => {
      const diagnostics = lint('R00:00:01.000 CMD 42 3.14\n');
      expect(diagnostics.length).toBeGreaterThan(0);
      expect(diagnostics[0].message).toContain('comma');
    });

    it('should flag missing comma between strings', () => {
      const diagnostics = lint('R00:00:01.000 CMD "str1" "str2"\n');
      expect(diagnostics.length).toBeGreaterThan(0);
      expect(diagnostics[0].message).toContain('comma');
    });

    it('should flag missing comma between identifiers', () => {
      const diagnostics = lint('R00:00:01.000 CMD INPUT_A INPUT_B\n');
      expect(diagnostics.length).toBeGreaterThan(0);
      expect(diagnostics[0].message).toContain('comma');
    });

    it('should flag missing comma between mixed types', () => {
      const diagnostics = lint('R00:00:01.000 CMD 42 "test"\n');
      expect(diagnostics.length).toBeGreaterThan(0);
      expect(diagnostics[0].message).toContain('comma');
    });
  });

  describe('valid syntax', () => {
    it('should not flag valid comma-separated arguments', () => {
      const diagnostics = lint('R00:00:01.000 CMD 42, 3.14, "test"\n');
      expect(diagnostics.length).toBe(0);
    });

    it('should not flag command without arguments', () => {
      const diagnostics = lint('R00:00:01.000 CMD_NO_OP\n');
      expect(diagnostics.length).toBe(0);
    });

    it('should not flag command with single argument', () => {
      const diagnostics = lint('R00:00:01.000 CMD 42\n');
      expect(diagnostics.length).toBe(0);
    });

    it('should not flag valid sequence with comments', () => {
      const doc = `; Comment
A2015-075T22:32:40.123 cmdDisp.CMD_NO_OP
R00:00:01.000 CMD 1, 2, 3
`;
      const diagnostics = lint(doc);
      expect(diagnostics.length).toBe(0);
    });
  });

  describe('extra tokens', () => {
    it('should flag unexpected tokens after command', () => {
      const diagnostics = lint('R00:00:01.000 CMD 42 unexpected\n');
      expect(diagnostics.length).toBeGreaterThan(0);
    });

    it('should flag invalid characters in arguments', () => {
      const diagnostics = lint('R00:00:01.000 CMD 42, @invalid\n');
      expect(diagnostics.length).toBeGreaterThan(0);
    });
  });

  describe('parse errors', () => {
    it('should provide helpful messages for missing commas', () => {
      const diagnostics = lint('R00:00:01.000 CMD 1 2 3\n');
      expect(diagnostics.length).toBeGreaterThan(0);

      // Should have helpful messages
      const hasCommaMessage = diagnostics.some(d => d.message.toLowerCase().includes('comma'));
      expect(hasCommaMessage).toBe(true);
    });

    it('should flag multiple errors in same line', () => {
      const diagnostics = lint('R00:00:01.000 CMD 1 2 3 4\n');
      // Should detect multiple missing commas
      expect(diagnostics.length).toBeGreaterThan(1);
    });
  });

  describe('empty and whitespace', () => {
    it('should not flag empty file', () => {
      const diagnostics = lint('');
      expect(diagnostics.length).toBe(0);
    });

    it('should not flag whitespace-only lines', () => {
      const diagnostics = lint('   \n\t\n  \n');
      expect(diagnostics.length).toBe(0);
    });

    it('should not flag comment-only lines', () => {
      const diagnostics = lint('; Just a comment\n; Another comment\n');
      expect(diagnostics.length).toBe(0);
    });
  });

  describe('time tag validation', () => {
    it('should not flag valid absolute time with day 001', () => {
      const diagnostics = lint('A2015-001T00:00:00.000 CMD\n');
      expect(diagnostics.length).toBe(0);
    });

    it('should not flag valid absolute time with day 075', () => {
      const diagnostics = lint('A2015-075T22:32:40.123 CMD\n');
      expect(diagnostics.length).toBe(0);
    });

    it('should not flag valid absolute time with day 366', () => {
      const diagnostics = lint('A2024-366T23:59:59.999 CMD\n');
      expect(diagnostics.length).toBe(0);
    });

    it('should flag invalid day of year 000', () => {
      const diagnostics = lint('A2015-000T00:00:00.000 CMD\n');
      expect(diagnostics.length).toBeGreaterThan(0);
      expect(diagnostics[0].message).toContain('day of year');
    });

    it('should flag invalid day of year 367', () => {
      const diagnostics = lint('A2015-367T00:00:00.000 CMD\n');
      expect(diagnostics.length).toBeGreaterThan(0);
      expect(diagnostics[0].message).toContain('day of year');
    });

    it('should not flag valid relative time', () => {
      const diagnostics = lint('R01:23:45.678 CMD\n');
      expect(diagnostics.length).toBe(0);
    });

    it('should flag relative time with hours >= 24', () => {
      const diagnostics = lint('R24:00:00.000 CMD\n');
      expect(diagnostics.length).toBeGreaterThan(0);
      expect(diagnostics[0].message).toContain('hours');
    });

    it('should flag relative time with invalid minutes', () => {
      const diagnostics = lint('R00:60:00.000 CMD\n');
      expect(diagnostics.length).toBeGreaterThan(0);
      expect(diagnostics[0].message).toContain('minutes');
    });

    it('should flag relative time with invalid seconds', () => {
      const diagnostics = lint('R00:00:60.000 CMD\n');
      expect(diagnostics.length).toBeGreaterThan(0);
      expect(diagnostics[0].message).toContain('seconds');
    });
  });
});
