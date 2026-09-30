import { describe, it, expect } from 'vitest';
import { fprimeParser } from './fprime.js';
import { FPRIME_NODES } from './fprime-grammar-constants.js';

/**
 * Test the time tag parsing and computation by examining the parse tree.
 * This tests the structure without requiring a full CodeMirror EditorState.
 */
describe('F-Prime Time Tag Parsing', () => {
  it('should parse absolute time A2015-075T22:32:40.123', () => {
    const input = 'A2015-075T22:32:40.123 CMD_NO_OP\n';
    const tree = fprimeParser.parse(input);
    const cursor = tree.cursor();

    // Navigate to Command -> TimeTag -> TimeAbsolute
    cursor.firstChild(); // Command
    cursor.firstChild(); // TimeTag
    cursor.firstChild(); // TimeAbsolute

    expect(cursor.node.type.name).toBe(FPRIME_NODES.TimeAbsolute);

    const timeText = input.slice(cursor.from, cursor.to).trim();
    expect(timeText).toBe('A2015-075T22:32:40.123');
  });

  it('should parse relative time R00:00:01', () => {
    const input = 'R00:00:01 CMD_NO_OP\n';
    const tree = fprimeParser.parse(input);
    const cursor = tree.cursor();

    // Navigate to Command -> TimeTag -> TimeRelative
    cursor.firstChild(); // Command
    cursor.firstChild(); // TimeTag
    cursor.firstChild(); // TimeRelative

    expect(cursor.node.type.name).toBe(FPRIME_NODES.TimeRelative);

    const timeText = input.slice(cursor.from, cursor.to).trim();
    expect(timeText).toBe('R00:00:01');
  });

  it('should parse sequence with absolute then relative time', () => {
    const input = 'A2015-075T22:32:40.123 CMD_FIRST\nR00:00:01 CMD_SECOND\n';
    const tree = fprimeParser.parse(input);

    expect(tree.length).toBe(input.length);

    // Find all commands using cursor navigation
    const commands: Array<{ timeType: string; timeText: string; commandText: string }> = [];
    const cursor = tree.cursor();

    do {
      if (cursor.name === FPRIME_NODES.Command) {
        const commandNode = cursor.node;

        // Get time tag
        const timeTagNode = commandNode.getChild(FPRIME_NODES.TimeTag);
        const absoluteNode = timeTagNode?.getChild(FPRIME_NODES.TimeAbsolute);
        const relativeNode = timeTagNode?.getChild(FPRIME_NODES.TimeRelative);

        const timeNode = absoluteNode || relativeNode;
        const timeType = absoluteNode ? 'absolute' : 'relative';
        const timeText = timeNode ? input.slice(timeNode.from, timeNode.to).trim() : '';

        // Get command mnemonic
        const mnemonicNode = commandNode.getChild(FPRIME_NODES.CommandMnemonic);
        const commandText = mnemonicNode ? input.slice(mnemonicNode.from, mnemonicNode.to) : '';

        commands.push({ timeType, timeText, commandText });
      }
    } while (cursor.next());

    expect(commands).toHaveLength(2);

    // First command - absolute time
    expect(commands[0].timeType).toBe('absolute');
    expect(commands[0].timeText).toBe('A2015-075T22:32:40.123');
    expect(commands[0].commandText).toBe('CMD_FIRST');

    // Second command - relative time
    expect(commands[1].timeType).toBe('relative');
    expect(commands[1].timeText).toBe('R00:00:01');
    expect(commands[1].commandText).toBe('CMD_SECOND');
  });

  it('should parse multiple relative times in sequence', () => {
    const input = 'A2015-075T10:00:00.000 CMD_1\nR00:10:00.000 CMD_2\nR00:05:30.500 CMD_3\n';
    const tree = fprimeParser.parse(input);

    const commands: Array<{ timeType: string; timeText: string }> = [];
    const cursor = tree.cursor();

    do {
      if (cursor.name === FPRIME_NODES.Command) {
        const commandNode = cursor.node;
        const timeTagNode = commandNode.getChild(FPRIME_NODES.TimeTag);
        const absoluteNode = timeTagNode?.getChild(FPRIME_NODES.TimeAbsolute);
        const relativeNode = timeTagNode?.getChild(FPRIME_NODES.TimeRelative);

        const timeNode = absoluteNode || relativeNode;
        const timeType = absoluteNode ? 'absolute' : 'relative';
        const timeText = timeNode ? input.slice(timeNode.from, timeNode.to).trim() : '';

        commands.push({ timeType, timeText });
      }
    } while (cursor.next());

    expect(commands).toHaveLength(3);
    expect(commands[0].timeType).toBe('absolute');
    expect(commands[0].timeText).toBe('A2015-075T10:00:00.000');
    expect(commands[1].timeType).toBe('relative');
    expect(commands[1].timeText).toBe('R00:10:00.000');
    expect(commands[2].timeType).toBe('relative');
    expect(commands[2].timeText).toBe('R00:05:30.500');
  });

  it('should handle relative time without milliseconds', () => {
    const input = 'R00:00:01 CMD_NO_OP\n';
    const tree = fprimeParser.parse(input);
    const cursor = tree.cursor();

    cursor.firstChild(); // Command
    cursor.firstChild(); // TimeTag
    cursor.firstChild(); // TimeRelative

    const timeText = input.slice(cursor.from, cursor.to).trim();
    expect(timeText).toBe('R00:00:01');

    // Verify it matches the pattern RHH:MM:SS
    expect(/^R\d{2}:\d{2}:\d{2}$/.test(timeText)).toBe(true);
  });

  it('should handle absolute time with milliseconds', () => {
    const input = 'A2015-075T22:32:40.123 CMD_NO_OP\n';
    const tree = fprimeParser.parse(input);
    const cursor = tree.cursor();

    cursor.firstChild(); // Command
    cursor.firstChild(); // TimeTag
    cursor.firstChild(); // TimeAbsolute

    const timeText = input.slice(cursor.from, cursor.to).trim();
    expect(timeText).toBe('A2015-075T22:32:40.123');

    // Verify it matches the pattern AYYYY-DDDTHH:MM:SS.sss
    expect(/^A\d{4}-\d{3}T\d{2}:\d{2}:\d{2}\.\d+$/.test(timeText)).toBe(true);
  });
});

/**
 * Test time computation logic conceptually.
 * These tests document the expected behavior without requiring CodeMirror.
 */
describe('F-Prime Time Computation Logic', () => {
  it('should compute time for A2015-075T22:32:40.123 + R00:00:01', () => {
    // Base absolute time: 2015-075T22:32:40.123
    // Add 1 second: R00:00:01
    // Expected result: 2015-075T22:32:41.123

    const baseMs = (22 * 3600 + 32 * 60 + 40) * 1000 + 123; // 81,160,123 ms
    const relativeMs = 1 * 1000; // 1,000 ms
    const totalMs = baseMs + relativeMs; // 81,161,123 ms

    // Convert back to time components
    const hours = Math.floor(totalMs / 3600000);
    const remainingMs1 = totalMs % 3600000;
    const minutes = Math.floor(remainingMs1 / 60000);
    const remainingMs2 = remainingMs1 % 60000;
    const seconds = Math.floor(remainingMs2 / 1000);
    const milliseconds = remainingMs2 % 1000;

    expect(hours).toBe(22);
    expect(minutes).toBe(32);
    expect(seconds).toBe(41);
    expect(milliseconds).toBe(123);

    // Formatted: 2015-075T22:32:41.123
  });

  it('should compute cumulative time for multiple relative offsets', () => {
    // Base: A2015-075T10:00:00.000
    // Add: R00:10:00.000
    // Add: R00:05:30.500
    // Expected: 2015-075T10:15:30.500

    const baseMs = (10 * 3600) * 1000; // 36,000,000 ms
    const offset1Ms = (10 * 60) * 1000; // 600,000 ms
    const offset2Ms = (5 * 60 + 30) * 1000 + 500; // 330,500 ms
    const totalMs = baseMs + offset1Ms + offset2Ms; // 36,930,500 ms

    const hours = Math.floor(totalMs / 3600000);
    const remainingMs1 = totalMs % 3600000;
    const minutes = Math.floor(remainingMs1 / 60000);
    const remainingMs2 = remainingMs1 % 60000;
    const seconds = Math.floor(remainingMs2 / 1000);
    const milliseconds = remainingMs2 % 1000;

    expect(hours).toBe(10);
    expect(minutes).toBe(15);
    expect(seconds).toBe(30);
    expect(milliseconds).toBe(500);

    // Formatted: 2015-075T10:15:30.500
  });

  it('should convert day of year to calendar date', () => {
    // Test day-of-year to month/day conversion
    // 2015-075 should be March 16, 2015 (Monday)

    // 2015 is not a leap year
    const isLeapYear = (2015 % 4 === 0 && 2015 % 100 !== 0) || 2015 % 400 === 0;
    expect(isLeapYear).toBe(false);

    // Days in each month for non-leap year: 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31
    // Jan: 1-31 (31 days)
    // Feb: 32-59 (28 days)
    // Mar: 60-90 (31 days)
    // Day 75 is in March: 75 - 59 = 16

    // Calculate manually
    const dayOfYear = 75;
    const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

    let remainingDays = dayOfYear;
    let month = 0;

    for (let i = 0; i < daysInMonth.length; i++) {
      if (remainingDays <= daysInMonth[i]) {
        month = i + 1; // 1-based month
        break;
      }
      remainingDays -= daysInMonth[i];
    }

    expect(month).toBe(3); // March
    expect(remainingDays).toBe(16); // 16th day

    // Verify day of week: March 16, 2015
    const date = new Date(2015, 2, 16); // Month is 0-based in Date constructor
    const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
    expect(dayOfWeek).toBe(1); // Monday
  });

  it('should compute different absolute times for each relative command', () => {
    // This test verifies that each relative time gets its own computed absolute time
    // Base: A2015-075T22:00:00.000
    // CMD_2 at R00:10:00.000 should be: 22:10:00.000
    // CMD_3 at R00:05:00.000 should be: 22:15:00.000 (not 22:05:00.000!)

    const baseMs = (22 * 3600) * 1000; // 79,200,000 ms

    // CMD_2: base + 10 minutes
    const cmd2Ms = baseMs + (10 * 60 * 1000); // 79,800,000 ms
    const cmd2Time = {
      hours: Math.floor(cmd2Ms / 3600000),
      minutes: Math.floor((cmd2Ms % 3600000) / 60000),
      seconds: Math.floor((cmd2Ms % 60000) / 1000),
    };
    expect(cmd2Time.hours).toBe(22);
    expect(cmd2Time.minutes).toBe(10);
    expect(cmd2Time.seconds).toBe(0);

    // CMD_3: base + 10 minutes + 5 minutes = base + 15 minutes
    const cmd3Ms = baseMs + (10 * 60 * 1000) + (5 * 60 * 1000); // 80,100,000 ms
    const cmd3Time = {
      hours: Math.floor(cmd3Ms / 3600000),
      minutes: Math.floor((cmd3Ms % 3600000) / 60000),
      seconds: Math.floor((cmd3Ms % 60000) / 1000),
    };
    expect(cmd3Time.hours).toBe(22);
    expect(cmd3Time.minutes).toBe(15);
    expect(cmd3Time.seconds).toBe(0);
  });
});
