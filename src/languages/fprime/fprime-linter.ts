import { syntaxTree } from '@codemirror/language';
import type { Diagnostic } from '@codemirror/lint';
import type { EditorView } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';
import type { CommandDictionary } from '@nasa-jpl/aerie-ampcs';
import { distance } from 'fastest-levenshtein';
import { getChildrenNode, getFromAndTo } from '../../utils/tree-utils.js';
import { pluralize } from '../../utils/string.js';
import { FPRIME_NODES } from './fprime-grammar-constants.js';

/**
 * Linter for F-Prime sequences.
 * Flags parse errors and validates sequence structure.
 */
export function fprimeLinter(view: EditorView, commandDictionary?: CommandDictionary | null): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const tree = syntaxTree(view.state);

  if (!tree) {
    return diagnostics;
  }

  // Walk the tree and find error nodes
  tree.iterate({
    enter: node => {
      // Flag any parse errors (⚠ nodes)
      if (node.type.isError) {
        const text = view.state.sliceDoc(node.from, node.to);
        const errorDiagnostic = createErrorDiagnostic(node.node, text, view);
        if (errorDiagnostic) {
          diagnostics.push(errorDiagnostic);
        }
      }

      // Validate time tags
      if (node.name === FPRIME_NODES.TimeAbsolute || node.name === FPRIME_NODES.TimeRelative) {
        const timeDiagnostic = validateTimeTag(node.node, view);
        if (timeDiagnostic) {
          diagnostics.push(timeDiagnostic);
        }
      }

      // Validate commands against dictionary
      if (node.name === FPRIME_NODES.Command && commandDictionary) {
        const commandDiagnostics = validateCommandDictionary(node.node, view, commandDictionary);
        diagnostics.push(...commandDiagnostics);
      }
    },
  });

  return diagnostics;
}

/**
 * Creates a diagnostic for parse errors, attempting to provide helpful messages.
 */
function createErrorDiagnostic(node: SyntaxNode, text: string, _view: EditorView): Diagnostic | null {
  // Get context around the error
  const parent = node.parent;
  const prevSibling = node.prevSibling;

  let message = 'Syntax error';
  const severity: 'error' | 'warning' = 'error';

  // Try to provide more specific error messages based on context
  if (parent?.name === FPRIME_NODES.Args) {
    // Error in arguments - likely missing comma
    if (prevSibling) {
      const prevType = prevSibling.name;
      if (
        prevType === FPRIME_NODES.Number ||
        prevType === FPRIME_NODES.String ||
        prevType === FPRIME_NODES.Identifier
      ) {
        message = 'Missing comma between arguments';
      }
    }

    // Check if this looks like a valid argument type that's in the wrong place
    if (text.trim()) {
      const trimmed = text.trim();
      // Check if it's a number-like token
      if (/^\d+(\.\d+)?$/.test(trimmed) || /^0x[0-9a-f]+$/i.test(trimmed)) {
        message = 'Missing comma before this number argument';
      }
      // Check if it's an identifier-like token
      else if (/^[a-z_]\w*$/i.test(trimmed)) {
        message = 'Missing comma before this identifier';
      }
      // Check if it's a string-like token
      else if (trimmed.startsWith('"')) {
        message = 'Missing comma before this string argument';
      }
    }

    // For empty error nodes in Args context, still report as missing comma
    // (zero-width errors typically indicate missing separators)
    if (!text.trim() && prevSibling) {
      // Return diagnostic for zero-width error indicating missing comma
      return {
        from: node.from,
        to: node.from + 1, // Make it at least 1 character wide for visibility
        severity,
        message: 'Missing comma between arguments',
        source: 'fprime-linter',
      };
    }
  } else if (parent?.name === FPRIME_NODES.Command) {
    // Error at command level
    message = 'Invalid command syntax';
  }

  // If the error is just whitespace or empty (and not handled above), skip it
  if (!text.trim()) {
    return null;
  }

  return {
    from: node.from,
    to: node.to,
    severity,
    message,
    source: 'fprime-linter',
  };
}

/**
 * Validates F-Prime time format.
 */
function validateTimeTag(node: SyntaxNode, view: EditorView): Diagnostic | null {
  const text = view.state.sliceDoc(node.from, node.to).trim();

  if (node.name === FPRIME_NODES.TimeAbsolute) {
    // Format: AYYYY-DDDTHH:MM:SS[.sss]
    const absolutePattern = /^A\d{4}-\d{3}T\d{2}:\d{2}:\d{2}(\.\d+)?$/;
    if (!absolutePattern.test(text)) {
      return {
        from: node.from,
        to: node.to,
        severity: 'error',
        message: 'Invalid absolute time format. Expected: AYYYY-DDDTHH:MM:SS[.sss]',
        source: 'fprime-linter',
      };
    }

    // Validate day of year (001-366)
    // Extract DDD from AYYYY-DDDTHH:MM:SS (positions 6-8, after the dash at position 5)
    const dayOfYear = Number.parseInt(text.substring(6, 9), 10);
    if (dayOfYear < 1 || dayOfYear > 366) {
      return {
        from: node.from + 6,
        to: node.from + 9,
        severity: 'error',
        message: `Invalid day of year: ${dayOfYear}. Must be between 001 and 366`,
        source: 'fprime-linter',
      };
    }
  } else if (node.name === FPRIME_NODES.TimeRelative) {
    // Format: RHH:MM:SS[.sss]
    const relativePattern = /^R\d{2}:\d{2}:\d{2}(\.\d+)?$/;
    if (!relativePattern.test(text)) {
      return {
        from: node.from,
        to: node.to,
        severity: 'error',
        message: 'Invalid relative time format. Expected: RHH:MM:SS[.sss]',
        source: 'fprime-linter',
      };
    }

    // Validate hours are less than 24 (relative times limited to 24 hours)
    const hours = Number.parseInt(text.substring(1, 3), 10);
    if (hours >= 24) {
      return {
        from: node.from + 1,
        to: node.from + 3,
        severity: 'error',
        message: `Relative time hours must be less than 24, got: ${hours}`,
        source: 'fprime-linter',
      };
    }

    // Validate minutes and seconds
    const minutes = Number.parseInt(text.substring(4, 6), 10);
    const seconds = Number.parseInt(text.substring(7, 9), 10);
    if (minutes >= 60) {
      return {
        from: node.from + 4,
        to: node.from + 6,
        severity: 'error',
        message: `Invalid minutes: ${minutes}. Must be between 00 and 59`,
        source: 'fprime-linter',
      };
    }
    if (seconds >= 60) {
      return {
        from: node.from + 7,
        to: node.from + 9,
        severity: 'error',
        message: `Invalid seconds: ${seconds}. Must be between 00 and 59`,
        source: 'fprime-linter',
      };
    }
  }

  return null;
}

/**
 * Validates that command mnemonics exist in the command dictionary.
 * Returns diagnostic errors for commands not found in the dictionary.
 */
export function validateCommandDictionary(
  commandNode: SyntaxNode,
  view: EditorView,
  commandDictionary: CommandDictionary,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // Get the command mnemonic node
  const mnemonicNode = commandNode.getChild(FPRIME_NODES.CommandMnemonic);
  if (!mnemonicNode) {
    return diagnostics;
  }

  // Extract the mnemonic text
  const mnemonicText = view.state.sliceDoc(mnemonicNode.from, mnemonicNode.to);

  // Check if the command exists in either FSW or hardware command maps
  const { fswCommandMap, hwCommandMap, fswCommands, hwCommands } = commandDictionary;
  const dictionaryCommand = fswCommandMap[mnemonicText] || hwCommandMap[mnemonicText];

  if (!dictionaryCommand) {
    // Command not found - generate suggestions using Levenshtein distance
    const allCommandStems = [...fswCommands.map(cmd => cmd.stem), ...hwCommands.map(cmd => cmd.stem)];

    const closestMatches = closestStrings(mnemonicText, allCommandStems, 3);

    diagnostics.push({
      from: mnemonicNode.from,
      to: mnemonicNode.to,
      severity: 'error',
      message: `Command '${mnemonicText}' not found in command dictionary`,
      source: 'fprime-linter',
      actions: closestMatches.map(suggestion => ({
        name: `Change to ${suggestion}`,
        apply(view, from, to) {
          view.dispatch({
            changes: { from, to, insert: suggestion },
          });
        },
      })),
    });
    return diagnostics;
  }

  // Validate argument count
  const argsNode = commandNode.getChild(FPRIME_NODES.Args);
  const expectedArgCount = dictionaryCommand.arguments?.length ?? 0;

  if (argsNode) {
    const argNodes = getChildrenNode(argsNode);
    const actualArgCount = argNodes.length;

    if (actualArgCount > expectedArgCount) {
      // Too many arguments
      const extraArgs = argNodes.slice(expectedArgCount);
      const { from, to } = getFromAndTo(extraArgs);
      const commandArgs = `argument${pluralize(extraArgs.length)}`;

      // Check if there's a comma before the first extra argument
      const firstExtraArg = extraArgs[0];
      let deleteFrom = from;
      if (firstExtraArg && expectedArgCount > 0) {
        // Look for comma between last valid arg and first extra arg
        const lastValidArg = argNodes[expectedArgCount - 1];
        if (lastValidArg) {
          const textBetween = view.state.sliceDoc(lastValidArg.to, firstExtraArg.from);
          const commaMatch = textBetween.match(/,/);
          if (commaMatch) {
            // Include the comma in the deletion range
            deleteFrom = lastValidArg.to + textBetween.indexOf(',');
          }
        }
      }

      diagnostics.push({
        from,
        to,
        severity: 'error',
        message: `Extra ${commandArgs}, definition has ${expectedArgCount}, but ${actualArgCount} ${pluralize(actualArgCount) ? 'are' : 'is'} present`,
        source: 'fprime-linter',
        actions: [
          {
            name: `Remove ${extraArgs.length} extra ${commandArgs}`,
            apply(view, argsFrom, argsTo) {
              view.dispatch({ changes: { from: deleteFrom, to: argsTo } });
            },
          },
        ],
      });
    } else if (actualArgCount < expectedArgCount) {
      // Too few arguments
      const commandArgs = `argument${pluralize(expectedArgCount - actualArgCount)}`;

      diagnostics.push({
        from: argsNode.from,
        to: argsNode.to,
        severity: 'error',
        message: `Missing ${commandArgs}, definition has ${expectedArgCount}, but ${actualArgCount} ${pluralize(actualArgCount) ? 'are' : 'is'} present`,
        source: 'fprime-linter',
      });
    }
  } else if (expectedArgCount > 0) {
    // No arguments provided but command expects some
    const commandArgs = `argument${pluralize(expectedArgCount)}`;

    diagnostics.push({
      from: mnemonicNode.to,
      to: mnemonicNode.to,
      severity: 'error',
      message: `Missing ${commandArgs}, definition has ${expectedArgCount}, but 0 are present`,
      source: 'fprime-linter',
    });
  }

  return diagnostics;
}

/**
 * Helper function to find the N closest strings using Levenshtein distance.
 */
function closestStrings(value: string, potentialMatches: string[], n: number): string[] {
  const distances = potentialMatches.map(s => ({ distance: distance(s, value), s }));
  distances.sort((a, b) => a.distance - b.distance);
  return distances.slice(0, n).map(pair => pair.s);
}
