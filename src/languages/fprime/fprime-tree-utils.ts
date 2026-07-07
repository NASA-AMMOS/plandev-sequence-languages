import type { SyntaxNode } from '@lezer/common';
import type {
  CommandDictionary,
  EnumMap,
  FswCommand,
  FswCommandArgument,
  FswCommandArgumentRepeat,
} from '@nasa-jpl/aerie-ampcs';
import type { EditorView } from '@codemirror/view';
import type { LibrarySequenceSignature } from '../../interfaces/phoenix.js';
import type { ArgTextDef, CommandInfoMapper, TimeTagInfo } from '../../interfaces/command-info-mapper.js';
import { fswCommandArgDefault } from '../../utils/sequence-utils.js';
import { FPRIME_NODES } from './fprime-grammar-constants.js';

/**
 * Gets the command mnemonic node from a Command node.
 */
export function getNameNode(commandNode: SyntaxNode | null): SyntaxNode | null {
  if (commandNode?.name === FPRIME_NODES.Command) {
    return commandNode.getChild(FPRIME_NODES.CommandMnemonic);
  }
  return null;
}

/**
 * Finds the containing Command node from any node in the tree.
 */
export function getContainingCommand(node: SyntaxNode | null): SyntaxNode | null {
  let current = node;
  while (current) {
    if (current.name === FPRIME_NODES.Command) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

/**
 * Gets all child nodes from a container (including commas, whitespace, etc.)
 */
function getAllChildren(containerNode: SyntaxNode | null): SyntaxNode[] {
  const children: SyntaxNode[] = [];
  let child = containerNode?.firstChild;
  while (child) {
    children.push(child);
    child = child.nextSibling;
  }
  return children;
}

/**
 * CommandInfoMapper implementation for F-Prime sequences.
 * F-Prime sequences are simpler than SeqN - no variables, no library sequences,
 * just time-tagged commands with arguments.
 */
export class FPrimeCommandInfoMapper implements CommandInfoMapper {
  formatArgumentArray(values: string[], commandNode: SyntaxNode | null, editorViewOrSource?: EditorView | string): string {
    if (values.length === 0) {
      return '';
    }

    let prefix = ' ';

    // Check if we need to prepend a comma before adding new arguments
    if (commandNode?.name === FPRIME_NODES.Command && editorViewOrSource) {
      const argsNode = commandNode.getChild(FPRIME_NODES.Args);
      if (argsNode) {
        const existingArgs = this.getArgumentsFromContainer(argsNode);
        if (existingArgs.length > 0) {
          // There are existing arguments - check if Args text ends with a comma
          let argsText: string;
          if (typeof editorViewOrSource === 'string') {
            argsText = editorViewOrSource.slice(argsNode.from, argsNode.to);
          } else {
            argsText = editorViewOrSource.state.sliceDoc(argsNode.from, argsNode.to);
          }
          const trimmedArgsText = argsText.trimEnd();
          const hasTrailingComma = trimmedArgsText.endsWith(',');
          prefix = hasTrailingComma ? ' ' : ', ';
        }
      }
    }

    return prefix + values.join(', ');
  }

  getArgumentAppendPosition(commandNode: SyntaxNode | null): number | undefined {
    if (commandNode?.name === FPRIME_NODES.Command) {
      const argsNode = commandNode.getChild(FPRIME_NODES.Args);
      const mnemonicNode = commandNode.getChild(FPRIME_NODES.CommandMnemonic);
      if (argsNode) {
        return argsNode.to;
      } else if (mnemonicNode) {
        return mnemonicNode.to;
      }
    }
    return undefined;
  }

  getArgumentNodeContainer(commandNode: SyntaxNode | null): SyntaxNode | null {
    return commandNode?.getChild(FPRIME_NODES.Args) ?? null;
  }

  getArgumentsFromContainer(containerNode: SyntaxNode | null): SyntaxNode[] {
    const children: SyntaxNode[] = [];
    let child = containerNode?.firstChild;
    while (child) {
      // Only include actual argument nodes (String, Number, Identifier), skip whitespace and commas
      const nodeType: string = child.name;
      if (
        nodeType === FPRIME_NODES.String ||
        nodeType === FPRIME_NODES.Number ||
        nodeType === FPRIME_NODES.Identifier
      ) {
        children.push(child);
      }
      child = child.nextSibling;
    }
    return children;
  }

  getByteArrayElements(): string[] | null {
    // F-Prime doesn't have byte array syntax
    return null;
  }

  getContainingCommand(node: SyntaxNode | null): SyntaxNode | null {
    return getContainingCommand(node);
  }

  getDefaultValueForArgumentDef(argDef: FswCommandArgument, enumMap: EnumMap): string {
    return fswCommandArgDefault(argDef, enumMap);
  }

  getNameNode(commandNode: SyntaxNode | null): SyntaxNode | null {
    return getNameNode(commandNode);
  }

  getVariables(): string[] {
    // F-Prime sequences don't have variables
    return [];
  }

  isArgumentNodeOfVariableType(): boolean {
    // F-Prime doesn't have variables, all arguments are literals
    return false;
  }

  isByteArrayArg(): boolean {
    // F-Prime doesn't have byte array syntax
    return false;
  }

  nodeTypeEnumCompatible(node: SyntaxNode | null): boolean {
    // String and Identifier nodes can be used for enum arguments
    return node?.name === FPRIME_NODES.String || node?.name === FPRIME_NODES.Identifier;
  }

  nodeTypeHasArguments(node: SyntaxNode | null): boolean {
    return node?.name === FPRIME_NODES.Command;
  }

  nodeTypeNumberCompatible(node: SyntaxNode | null): boolean {
    return node?.name === FPRIME_NODES.Number;
  }

  getTimeTagInfo(seqEditorView: EditorView, commandNode: SyntaxNode | null): TimeTagInfo {
    const timeTagNode = commandNode?.getChild(FPRIME_NODES.TimeTag);
    if (!timeTagNode) {
      return null;
    }

    // Get the actual time type (TimeAbsolute or TimeRelative)
    const timeTypeNode = timeTagNode.firstChild;
    if (!timeTypeNode) {
      return null;
    }

    return {
      node: timeTypeNode,
      text: seqEditorView.state.sliceDoc(timeTypeNode.from, timeTypeNode.to).trim(),
    };
  }

  getArgumentInfo(
    commandDef: FswCommand | null,
    seqEditorView: EditorView,
    args: SyntaxNode | null,
    argumentDefs: FswCommandArgument[] | undefined,
    parentArgDef: FswCommandArgumentRepeat | undefined,
  ): ArgTextDef[] {
    const argArray: ArgTextDef[] = [];

    if (args) {
      const argNodes = this.getArgumentsFromContainer(args);
      for (let i = 0; i < argNodes.length; i++) {
        const node = argNodes[i];
        let argDef: FswCommandArgument | undefined = undefined;

        if (argumentDefs && i < argumentDefs.length) {
          argDef = argumentDefs[i];
        }

        const argValue = seqEditorView.state.sliceDoc(node.from, node.to);
        argArray.push({
          argDef,
          node,
          parentArgDef,
          text: argValue,
        });
      }
    }

    // Add entries for defined arguments missing from editor
    if (argumentDefs && !parentArgDef) {
      argArray.push(...argumentDefs.slice(argArray.length).map(argDef => ({ argDef })));
    }

    return argArray;
  }

  getCommandDef(
    commandDictionary: CommandDictionary | null,
    librarySequences: LibrarySequenceSignature[],
    stemName: string,
  ): FswCommand | null {
    // Look up command in dictionary by mnemonic
    return commandDictionary?.fswCommandMap[stemName] ?? null;
  }

  getVariablesInScope(): string[] {
    // F-Prime sequences don't have variables
    return [];
  }
}
