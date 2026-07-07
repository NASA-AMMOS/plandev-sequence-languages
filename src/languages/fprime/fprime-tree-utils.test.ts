import { describe, expect, it } from 'vitest';
import { fprimeParser } from './fprime.js';
import { FPrimeCommandInfoMapper, getNameNode, getContainingCommand } from './fprime-tree-utils.js';
import { FPRIME_NODES } from './fprime-grammar-constants.js';

describe('F-Prime Tree Utils', () => {
  describe('getNameNode', () => {
    it('should return CommandMnemonic node from Command', () => {
      const input = 'A2015-075T22:32:40.123 cmdDisp.CMD_NO_OP\n';
      const tree = fprimeParser.parse(input);
      const cursor = tree.cursor();
      cursor.firstChild(); // Command

      const nameNode = getNameNode(cursor.node);
      expect(nameNode).not.toBeNull();
      expect(nameNode?.name).toBe(FPRIME_NODES.CommandMnemonic);
      expect(input.slice(nameNode!.from, nameNode!.to)).toBe('cmdDisp.CMD_NO_OP');
    });

    it('should return null for non-Command nodes', () => {
      const input = 'A2015-075T22:32:40.123 CMD_NO_OP\n';
      const tree = fprimeParser.parse(input);
      const cursor = tree.cursor();

      expect(getNameNode(cursor.node)).toBeNull();
    });
  });

  describe('getContainingCommand', () => {
    it('should find Command from nested node', () => {
      const input = 'A2015-075T22:32:40.123 CMD_NO_OP\n';
      const tree = fprimeParser.parse(input);
      const cursor = tree.cursor();
      cursor.firstChild(); // Command
      cursor.firstChild(); // TimeTag
      cursor.firstChild(); // TimeAbsolute

      const commandNode = getContainingCommand(cursor.node);
      expect(commandNode).not.toBeNull();
      expect(commandNode?.name).toBe(FPRIME_NODES.Command);
    });

    it('should return null if not in a Command', () => {
      const input = 'A2015-075T22:32:40.123 CMD_NO_OP\n';
      const tree = fprimeParser.parse(input);
      const cursor = tree.cursor();

      expect(getContainingCommand(cursor.node)).toBeNull();
    });
  });

  describe('FPrimeCommandInfoMapper', () => {
    const mapper = new FPrimeCommandInfoMapper();

    describe('formatArgumentArray', () => {
      it('should format arguments with commas and space prefix when no existing args', () => {
        expect(mapper.formatArgumentArray(['42', '"test"', '0xFF'], null)).toBe(' 42, "test", 0xFF');
      });

      it('should handle empty array', () => {
        expect(mapper.formatArgumentArray([], null)).toBe('');
      });

      it('should add comma prefix when existing args have no trailing comma', () => {
        const input = 'R00:00:01.000 CMD_TEST 1, 2\n';
        const tree = fprimeParser.parse(input);
        const cursor = tree.cursor();
        cursor.firstChild(); // Command

        expect(mapper.formatArgumentArray(['3', '4'], cursor.node, input)).toBe(', 3, 4');
      });

      it('should use space prefix when existing args have trailing comma', () => {
        const input = 'R00:00:01.000 CMD_TEST 1, 2,\n';
        const tree = fprimeParser.parse(input);
        const cursor = tree.cursor();
        cursor.firstChild(); // Command

        expect(mapper.formatArgumentArray(['3', '4'], cursor.node, input)).toBe(' 3, 4');
      });

      it('should use space prefix when there are no existing args', () => {
        const input = 'R00:00:01.000 CMD_TEST\n';
        const tree = fprimeParser.parse(input);
        const cursor = tree.cursor();
        cursor.firstChild(); // Command

        expect(mapper.formatArgumentArray(['1', '2'], cursor.node, input)).toBe(' 1, 2');
      });
    });

    describe('getArgumentNodeContainer', () => {
      it('should return Args node from Command', () => {
        const input = 'R00:00:01.000 CMD_TEST 42 "arg"\n';
        const tree = fprimeParser.parse(input);
        const cursor = tree.cursor();
        cursor.firstChild(); // Command

        const argsNode = mapper.getArgumentNodeContainer(cursor.node);
        expect(argsNode).not.toBeNull();
        expect(argsNode?.name).toBe(FPRIME_NODES.Args);
      });

      it('should return empty Args node for Command without arguments', () => {
        const input = 'R00:00:01.000 CMD_NO_ARGS\n';
        const tree = fprimeParser.parse(input);
        const cursor = tree.cursor();
        cursor.firstChild(); // Command

        const argsNode = mapper.getArgumentNodeContainer(cursor.node);
        expect(argsNode).not.toBeNull();
        expect(argsNode?.name).toBe(FPRIME_NODES.Args);
        // Args node exists but is empty (from === to)
        expect(argsNode?.from).toBe(argsNode?.to);
      });
    });

    describe('getArgumentsFromContainer', () => {
      it('should return all argument nodes', () => {
        const input = 'R00:00:01.000 CMD_TEST 42, "arg", 3.14\n';
        const tree = fprimeParser.parse(input);
        const cursor = tree.cursor();
        cursor.firstChild(); // Command

        const argsNode = mapper.getArgumentNodeContainer(cursor.node);
        const argNodes = mapper.getArgumentsFromContainer(argsNode);

        expect(argNodes.length).toBe(3);
        expect(argNodes[0].name).toBe(FPRIME_NODES.Number);
        expect(argNodes[1].name).toBe(FPRIME_NODES.String);
        expect(argNodes[2].name).toBe(FPRIME_NODES.Number);
      });

      it('should return empty array for no arguments', () => {
        expect(mapper.getArgumentsFromContainer(null)).toEqual([]);
      });
    });

    describe('nodeType checks', () => {
      it('should identify enum-compatible nodes', () => {
        const input = 'R00:00:01.000 CMD "test"\n';
        const tree = fprimeParser.parse(input);
        const cursor = tree.cursor();
        cursor.firstChild(); // Command
        const argsNode = mapper.getArgumentNodeContainer(cursor.node);
        const argNodes = mapper.getArgumentsFromContainer(argsNode);

        expect(mapper.nodeTypeEnumCompatible(argNodes[0])).toBe(true);
      });

      it('should identify number-compatible nodes', () => {
        const input = 'R00:00:01.000 CMD 42\n';
        const tree = fprimeParser.parse(input);
        const cursor = tree.cursor();
        cursor.firstChild(); // Command
        const argsNode = mapper.getArgumentNodeContainer(cursor.node);
        const argNodes = mapper.getArgumentsFromContainer(argsNode);

        expect(mapper.nodeTypeNumberCompatible(argNodes[0])).toBe(true);
      });

      it('should identify nodes with arguments', () => {
        const input = 'R00:00:01.000 CMD 42\n';
        const tree = fprimeParser.parse(input);
        const cursor = tree.cursor();
        cursor.firstChild(); // Command

        expect(mapper.nodeTypeHasArguments(cursor.node)).toBe(true);
      });
    });

    describe('variables', () => {
      it('should return empty array for getVariables', () => {
        expect(mapper.getVariables()).toEqual([]);
      });

      it('should return empty array for getVariablesInScope', () => {
        expect(mapper.getVariablesInScope(null as any, null)).toEqual([]);
      });

      it('should identify that nodes are not variables', () => {
        expect(mapper.isArgumentNodeOfVariableType(null)).toBe(false);
      });
    });

    describe('getCommandDef', () => {
      it('should look up command from dictionary', () => {
        const mockDict = {
          fswCommandMap: {
            'TEST_CMD': { stem: 'TEST_CMD', arguments: [] } as any,
          },
        } as any;

        const result = mapper.getCommandDef(mockDict, [], 'TEST_CMD');
        expect(result).not.toBeNull();
        expect(result?.stem).toBe('TEST_CMD');
      });

      it('should return null for unknown command', () => {
        const mockDict = {
          fswCommandMap: {},
        } as any;

        const result = mapper.getCommandDef(mockDict, [], 'UNKNOWN');
        expect(result).toBeNull();
      });
    });
  });
});
