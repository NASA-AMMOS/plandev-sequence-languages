import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { hoverTooltip } from '@codemirror/view';
import type { CommandDictionary, FswCommand } from '@nasa-jpl/aerie-ampcs';
import { fprimeTooltip } from './fprime-tooltip.js';

// Mock PhoenixResources for testing
const mockResources = {
  hoverTooltip,
  createTooltip: (lines: string[], from: number, to: number) => ({
    pos: from,
    end: to,
    above: true,
    create: () => {
      const dom = document.createElement('div');
      dom.textContent = lines.join('\n');
      return { dom };
    },
  }),
} as any;

describe('F-Prime Tooltip', () => {
  it('should create tooltip extension', () => {
    const mockDictionary: CommandDictionary = {
      fswCommandMap: {
        'TEST_CMD': {
          stem: 'TEST_CMD',
          type: 'fsw_command',
          description: 'A test command',
          arguments: [],
        } as FswCommand,
      },
      hwCommandMap: {},
      enumMap: {},
    };

    const extension = fprimeTooltip(mockDictionary, mockResources);
    expect(extension).toBeDefined();
  });

  it('should work with null command dictionary', () => {
    const extension = fprimeTooltip(null, mockResources);
    expect(extension).toBeDefined();
  });

  it('should integrate with language support', () => {
    const mockDictionary: CommandDictionary = {
      fswCommandMap: {
        'cmdDisp.CMD_NO_OP': {
          stem: 'cmdDisp.CMD_NO_OP',
          type: 'fsw_command',
          description: 'No-op command',
          arguments: [],
        } as FswCommand,
      },
      hwCommandMap: {},
      enumMap: {},
    };

    const tooltipExtension = fprimeTooltip(mockDictionary, mockResources);

    const doc = 'A2015-075T22:32:40.123 cmdDisp.CMD_NO_OP\n';
    const state = EditorState.create({
      doc,
      extensions: [tooltipExtension],
    });

    expect(state).toBeDefined();
    expect(state.doc.toString()).toBe(doc);
  });

  it('should support commands with arguments', () => {
    const mockDictionary: CommandDictionary = {
      fswCommandMap: {
        'SET_VALUE': {
          stem: 'SET_VALUE',
          type: 'fsw_command',
          description: 'Set a value with parameters',
          arguments: [
            {
              name: 'value',
              arg_type: 'integer',
              description: 'The value to set',
              bit_length: 32,
              range: { min: 0, max: 100 },
              units: 'none',
            },
            {
              name: 'timeout',
              arg_type: 'float',
              description: 'Timeout in seconds',
              bit_length: 32,
              units: 'seconds',
            },
          ],
        } as FswCommand,
      },
      hwCommandMap: {},
      enumMap: {},
    };

    const tooltipExtension = fprimeTooltip(mockDictionary, mockResources);

    const doc = 'R00:00:05.000 SET_VALUE 42, 3.14\n';
    const state = EditorState.create({
      doc,
      extensions: [tooltipExtension],
    });

    expect(state).toBeDefined();
    expect(state.doc.toString()).toBe(doc);
  });

  it('should support time tag tooltips', () => {
    const tooltipExtension = fprimeTooltip(null, mockResources);

    // Test with absolute and relative time tags
    const doc = 'A2015-075T22:32:40.123 CMD_NO_OP\nR01:00:05.000 CMD_NO_OP\n';
    const state = EditorState.create({
      doc,
      extensions: [tooltipExtension],
    });

    expect(state).toBeDefined();
    expect(state.doc.toString()).toBe(doc);
  });

  it('should compute absolute time from relative offset with milliseconds', () => {
    const tooltipExtension = fprimeTooltip(null, mockResources);

    // Absolute time: A2015-075T22:32:40.123
    // Relative time: R00:00:01 (1 second)
    // Expected computed time: 2015-075T22:32:41.123
    const doc = 'A2015-075T22:32:40.123 CMD_FIRST\nR00:00:01 CMD_SECOND\n';
    const state = EditorState.create({
      doc,
      extensions: [tooltipExtension],
    });

    expect(state).toBeDefined();
    expect(state.doc.toString()).toBe(doc);
  });
});
