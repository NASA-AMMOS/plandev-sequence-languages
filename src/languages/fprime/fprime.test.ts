import { describe, expect, it } from 'vitest';
import { fprimeParser } from './fprime.js';
import { FPRIME_NODES } from './fprime-grammar-constants.js';

describe('F-Prime Sequence Parser', () => {
  it('should parse absolute time command', () => {
    const input = 'A2015-075T22:32:40.123 cmdDisp.CMD_NO_OP\n';
    const tree = fprimeParser.parse(input);
    const cursor = tree.cursor();

    expect(tree.length).toBe(input.length);
    expect(cursor.node.type.name).toBe(FPRIME_NODES.Sequence);

    // Navigate to Command node
    cursor.firstChild();
    expect(cursor.node.type.name).toBe(FPRIME_NODES.Command);

    // Check TimeTag
    cursor.firstChild();
    expect(cursor.node.type.name).toBe(FPRIME_NODES.TimeTag);
    cursor.firstChild();
    expect(cursor.node.type.name).toBe(FPRIME_NODES.TimeAbsolute);
    expect(input.slice(cursor.from, cursor.to).trim()).toBe('A2015-075T22:32:40.123');
  });

  it('should parse relative time command with string argument', () => {
    const input = 'R01:00:01.050 CMD_NO_OP_STRING "Awesome string!"\n';
    const tree = fprimeParser.parse(input);
    const cursor = tree.cursor();

    expect(tree.length).toBe(input.length);
    cursor.firstChild(); // Command
    expect(cursor.node.type.name).toBe(FPRIME_NODES.Command);

    cursor.firstChild(); // TimeTag
    cursor.firstChild(); // TimeRelative
    expect(cursor.node.type.name).toBe(FPRIME_NODES.TimeRelative);
    expect(input.slice(cursor.from, cursor.to).trim()).toBe('R01:00:01.050');
  });

  it('should parse command with comment', () => {
    const input = 'R01:00:01.050 CMD_NO_OP_STRING "Awesome string!" ; And a nice comment too\n';
    const tree = fprimeParser.parse(input);
    const cursor = tree.cursor();

    cursor.firstChild(); // Command
    expect(cursor.node.type.name).toBe(FPRIME_NODES.Command);

    // Find LineComment as a child of Command
    cursor.firstChild(); // Enter Command's children
    let foundComment = false;
    do {
      if (cursor.node.type.name === FPRIME_NODES.LineComment) {
        foundComment = true;
        expect(input.slice(cursor.from, cursor.to)).toContain('; And a nice comment too');
        break;
      }
    } while (cursor.nextSibling());

    expect(foundComment).toBe(true);
  });

  it('should parse comment-only line', () => {
    const input = '; This is a comment\n';
    const tree = fprimeParser.parse(input);
    const cursor = tree.cursor();

    expect(tree.length).toBe(input.length);
    cursor.firstChild();
    expect(cursor.node.type.name).toBe(FPRIME_NODES.CommentLine);
  });

  it('should parse multiple commands', () => {
    const input = `A2015-075T22:32:40.123 cmdDisp.CMD_NO_OP
R01:00:01.050 CMD_NO_OP_STRING "Awesome string!"
; A comment line
R00:00:05.000 ANOTHER_COMMAND 42
`;
    const tree = fprimeParser.parse(input);
    const cursor = tree.cursor();

    expect(tree.length).toBe(input.length);
    cursor.firstChild();

    const nodeTypes: string[] = [];
    do {
      nodeTypes.push(cursor.node.type.name);
    } while (cursor.nextSibling());

    expect(nodeTypes).toContain(FPRIME_NODES.Command);
    expect(nodeTypes).toContain(FPRIME_NODES.CommentLine);
    expect(nodeTypes.filter(t => t === FPRIME_NODES.Command).length).toBe(3);
  });

  it('should parse command with numeric arguments', () => {
    const input = 'R00:00:05.000 SOME_COMMAND 42, 3.14\n';
    const tree = fprimeParser.parse(input);
    const cursor = tree.cursor();

    cursor.firstChild(); // Command
    expect(cursor.node.type.name).toBe(FPRIME_NODES.Command);

    // Enter Command's children to find Args node
    cursor.firstChild();
    do {
      if (cursor.node.type.name === FPRIME_NODES.Args) {
        cursor.firstChild();
        // Should have Number arguments
        let foundNumbers = 0;
        do {
          // Re-read the type to prevent TS from using the narrowed "Args" type
          const nodeType: string = cursor.node.type.name;
          if (nodeType === FPRIME_NODES.Number) {
            foundNumbers++;
          }
        } while (cursor.nextSibling());
        expect(foundNumbers).toBe(2); // Should find both 42 and 3.14
        break;
      }
    } while (cursor.nextSibling());
  });

  it('should parse command with namespaced mnemonic', () => {
    const input = 'A2015-075T22:32:40.123 module.submodule.CMD_NAME\n';
    const tree = fprimeParser.parse(input);
    const cursor = tree.cursor();

    cursor.firstChild(); // Command
    cursor.firstChild(); // TimeTag
    cursor.nextSibling(); // CommandMnemonic

    expect(cursor.node.type.name).toBe(FPRIME_NODES.CommandMnemonic);
    expect(input.slice(cursor.from, cursor.to)).toBe('module.submodule.CMD_NAME');
  });

  it('should handle hex numbers', () => {
    const input = 'R00:00:01.000 HEX_COMMAND 0xFF, 0x1234ABCD\n';
    const tree = fprimeParser.parse(input);
    const cursor = tree.cursor();

    expect(tree.length).toBe(input.length);
    cursor.firstChild();
    expect(cursor.node.type.name).toBe(FPRIME_NODES.Command);
  });

  it('should parse absolute time without subseconds', () => {
    const input = 'A2015-075T22:32:40 cmdDisp.CMD_NO_OP\n';
    const tree = fprimeParser.parse(input);
    const cursor = tree.cursor();

    cursor.firstChild();
    expect(cursor.node.type.name).toBe(FPRIME_NODES.Command);
    cursor.firstChild(); // TimeTag
    cursor.firstChild(); // TimeAbsolute
    expect(cursor.node.type.name).toBe(FPRIME_NODES.TimeAbsolute);
  });

  it('should parse relative time without subseconds', () => {
    const input = 'R01:00:01 CMD_NO_OP\n';
    const tree = fprimeParser.parse(input);
    const cursor = tree.cursor();

    cursor.firstChild();
    cursor.firstChild();
    cursor.firstChild();
    expect(cursor.node.type.name).toBe(FPRIME_NODES.TimeRelative);
  });

  it('should parse sequence with one absolute time followed by relative times', () => {
    const input = `A2024-100T12:00:00.000 INIT_COMMAND
R00:01:00.000 CMD_ONE 1
R00:02:30.500 CMD_TWO "test", 42
R00:00:15.250 CMD_THREE 0xAB, 0xCD, 0xEF
R00:05:00.000 CMD_FOUR 3.14159, 2.71828
`;
    const tree = fprimeParser.parse(input);
    const cursor = tree.cursor();

    expect(tree.length).toBe(input.length);
    cursor.firstChild();

    // Collect all commands and their time tag types
    const commands: Array<{ timeType: string; mnemonic: string }> = [];
    do {
      if (cursor.node.type.name === FPRIME_NODES.Command) {
        // Enter the command to find its time tag and mnemonic
        cursor.firstChild();
        let timeType = '';
        let mnemonic = '';

        do {
          const nodeType: string = cursor.node.type.name;
          if (nodeType === FPRIME_NODES.TimeTag) {
            cursor.firstChild();
            timeType = cursor.node.type.name;
            cursor.parent();
          } else if (nodeType === FPRIME_NODES.CommandMnemonic) {
            mnemonic = input.slice(cursor.from, cursor.to);
          }
        } while (cursor.nextSibling());

        commands.push({ timeType, mnemonic });
        cursor.parent(); // Back to Command
      }
    } while (cursor.nextSibling());

    // Verify we found 5 commands
    expect(commands.length).toBe(5);

    // First command should have absolute time
    expect(commands[0].timeType).toBe(FPRIME_NODES.TimeAbsolute);
    expect(commands[0].mnemonic).toBe('INIT_COMMAND');

    // All other commands should have relative time
    expect(commands[1].timeType).toBe(FPRIME_NODES.TimeRelative);
    expect(commands[1].mnemonic).toBe('CMD_ONE');

    expect(commands[2].timeType).toBe(FPRIME_NODES.TimeRelative);
    expect(commands[2].mnemonic).toBe('CMD_TWO');

    expect(commands[3].timeType).toBe(FPRIME_NODES.TimeRelative);
    expect(commands[3].mnemonic).toBe('CMD_THREE');

    expect(commands[4].timeType).toBe(FPRIME_NODES.TimeRelative);
    expect(commands[4].mnemonic).toBe('CMD_FOUR');
  });

  it('should detect missing commas between arguments', () => {
    const testCases = [
      'R00:00:01.000 CMD_TEST 42 3.14\n', // missing comma between numbers
      'R00:00:01.000 CMD_TEST "str1" "str2"\n', // missing comma between strings
      'R00:00:01.000 CMD_TEST 42 "test"\n', // missing comma between number and string
      'R00:00:01.000 CMD_TEST INPUT_A INPUT_B\n', // missing comma between identifiers
    ];

    testCases.forEach(input => {
      const tree = fprimeParser.parse(input);

      // Should have parse errors due to missing commas
      expect(tree.toString()).toContain('⚠');

      // The parser should still recognize the command structure
      const cursor = tree.cursor();
      cursor.firstChild();
      expect(cursor.node.type.name).toBe(FPRIME_NODES.Command);
    });
  });

  it('should parse fprime-gds simple_sequence.seq example', () => {
    // Real-world example from https://github.com/nasa/fprime-gds/blob/devel/examples/simple_sequence.seq
    const input = `;--------------------------------------------------------------------
; Simple sequence file
; Note: that anything after a ';' is a comment
;--------------------------------------------------------------------
; Commands in a sequence can either be timed absolutely or relative
; to the execution of the previous command. Here is an absolute NOOP
; command.
A2015-075T22:32:40.123 cmdDisp.CMD_NO_OP
; Here is a relative NOOP command, which will be run 1 second after
; the execution of the previous command
R00:00:01 cmdDisp.CMD_NO_OP; Send a no op command
; This command will run immediately after the previously executed command
; has completed
R00:00:00 cmdDisp.CMD_NO_OP
; Let's try out some commands with arguments
R01:00:01.050 cmdDisp.CMD_NO_OP_STRING "Awesome string!"; <- cool argument right?
R03:51:01.000 cmdDisp.CMD_TEST_CMD_1 17, 3.2, 2; <- this command has 3 arguments
R00:05:00 eventLogger.ALOG_SET_EVENT_REPORT_FILTER INPUT_COMMAND, INPUT_DISABLED; <- this command uses enum arguments
`;

    const tree = fprimeParser.parse(input);
    const cursor = tree.cursor();

    expect(tree.length).toBe(input.length);
    cursor.firstChild();

    // Count commands and comment lines
    let commandCount = 0;
    let commentCount = 0;

    do {
      const nodeType: string = cursor.node.type.name;
      if (nodeType === FPRIME_NODES.Command) {
        commandCount++;
      } else if (nodeType === FPRIME_NODES.CommentLine) {
        commentCount++;
      }
    } while (cursor.nextSibling());

    // Should have 6 commands and multiple comment lines
    expect(commandCount).toBe(6);
    expect(commentCount).toBeGreaterThan(5);

    // Reset cursor to beginning
    cursor.moveTo(tree.topNode.from);
    cursor.firstChild();

    // Verify specific commands parse correctly
    const commands: Array<{ mnemonic: string; argCount: number }> = [];

    do {
      const nodeType: string = cursor.node.type.name;
      if (nodeType === FPRIME_NODES.Command) {
        cursor.firstChild();
        let mnemonic = '';
        let argCount = 0;

        do {
          const childType: string = cursor.node.type.name;
          if (childType === FPRIME_NODES.CommandMnemonic) {
            mnemonic = input.slice(cursor.from, cursor.to);
          } else if (childType === FPRIME_NODES.Args) {
            // Args node may have children, check if it does
            if (cursor.firstChild()) {
              do {
                const argType: string = cursor.node.type.name;
                if (argType === FPRIME_NODES.String || argType === FPRIME_NODES.Number || argType === FPRIME_NODES.Identifier) {
                  argCount++;
                }
              } while (cursor.nextSibling());
              cursor.parent(); // Back to Args
            }
          }
        } while (cursor.nextSibling());

        commands.push({ mnemonic, argCount });
        cursor.parent(); // Back to Command
      }
    } while (cursor.nextSibling());

    // Verify we collected all 6 commands
    expect(commands.length).toBe(6);

    // Verify command mnemonics
    expect(commands[0].mnemonic).toBe('cmdDisp.CMD_NO_OP');
    expect(commands[0].argCount).toBe(0);

    expect(commands[1].mnemonic).toBe('cmdDisp.CMD_NO_OP');
    expect(commands[1].argCount).toBe(0);

    expect(commands[2].mnemonic).toBe('cmdDisp.CMD_NO_OP');
    expect(commands[2].argCount).toBe(0);

    expect(commands[3].mnemonic).toBe('cmdDisp.CMD_NO_OP_STRING');
    expect(commands[3].argCount).toBe(1); // "Awesome string!"

    expect(commands[4].mnemonic).toBe('cmdDisp.CMD_TEST_CMD_1');
    expect(commands[4].argCount).toBe(3); // 17, 3.2, 2

    expect(commands[5].mnemonic).toBe('eventLogger.ALOG_SET_EVENT_REPORT_FILTER');
    expect(commands[5].argCount).toBe(2); // INPUT_COMMAND, INPUT_DISABLED
  });
});
