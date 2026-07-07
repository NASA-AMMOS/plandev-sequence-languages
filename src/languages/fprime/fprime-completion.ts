import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { syntaxTree } from '@codemirror/language';
import type { CommandDictionary } from '@nasa-jpl/aerie-ampcs';
import { FPRIME_NODES } from './fprime-grammar-constants.js';
import { fswCommandArgDefault } from '../../utils/sequence-utils.js';

/**
 * Completion function for F-Prime sequences.
 * Provides autocompletion for time tags and command stems.
 */
export function fprimeCompletion(
  commandDictionary: CommandDictionary | null,
): (context: CompletionContext) => CompletionResult | null {
  return (context: CompletionContext): CompletionResult | null => {
  const nodeBefore = syntaxTree(context.state).resolveInner(context.pos, -1);
  const text = context.state.doc.toString();
  const line = context.state.doc.lineAt(context.pos);
  const lineText = line.text;
  const cursorInLine = context.pos - line.from;

  // Check if we're at the start of a line or after whitespace (where time tags appear)
  const beforeCursor = lineText.slice(0, cursorInLine);
  const afterCursor = lineText.slice(cursorInLine);

  // Check if there's a valid time tag on this line
  const hasTimeTag = /^[AR]\S+\s+/.test(lineText.trim());

  // Match partial time tags at cursor position
  const absoluteMatch = beforeCursor.match(/A(\d{0,4})?(-(\d{0,3})?)?(T(\d{0,2})?(:(\d{0,2})?(:(\d{0,2})?(\.(\d*))?)?)?)?$/);
  const relativeMatch = beforeCursor.match(/R(\d{0,2})?(:(\d{0,2})?(:(\d{0,2})?(\.(\d*))?)?)?$/);

  const completions: Completion[] = [];

  // Generate time tag completions
  if (absoluteMatch || relativeMatch || beforeCursor.trimStart() === '') {
    // Get current date/time for intelligent defaults
    const now = new Date();
    const year = now.getUTCFullYear();
    const dayOfYear = Math.floor((now.getTime() - new Date(now.getUTCFullYear(), 0, 0).getTime()) / 86400000);
    const hours = String(now.getUTCHours()).padStart(2, '0');
    const minutes = String(now.getUTCMinutes()).padStart(2, '0');
    const seconds = String(now.getUTCSeconds()).padStart(2, '0');

    if (absoluteMatch) {
      // Complete absolute time tag based on what's already typed
      const typed = absoluteMatch[0];
      let completion = '';

      if (typed === 'A') {
        // Just "A" - suggest full template
        completion = `A${year}-${String(dayOfYear).padStart(3, '0')}T${hours}:${minutes}:${seconds}`;
      } else if (!typed.includes('-')) {
        // Has A and some year digits
        const yearDigits = typed.slice(1); // Remove 'A'
        if (yearDigits.length < 4) {
          // Incomplete year (0-3 digits) - complete with current year
          completion = `A${year}-${String(dayOfYear).padStart(3, '0')}T${hours}:${minutes}:${seconds}`;
        } else {
          // Full 4-digit year but no dash yet
          completion = typed + `-${String(dayOfYear).padStart(3, '0')}T${hours}:${minutes}:${seconds}`;
        }
      } else if (!typed.includes('T')) {
        // Has year-doy but no T yet
        completion = typed + `T${hours}:${minutes}:${seconds}`;
      } else {
        // Has A, year, doy, and T - complete the time part
        const timePart = typed.split('T')[1] || '';
        if (!timePart.includes(':')) {
          completion = typed + `${hours}:${minutes}:${seconds}`;
        } else {
          const colons = (timePart.match(/:/g) || []).length;
          if (colons === 0) {
            completion = typed + `:${minutes}:${seconds}`;
          } else if (colons === 1) {
            completion = typed + `:${seconds}`;
          }
        }
      }

      if (completion) {
        completions.push({
          label: completion,
          type: 'text',
          apply: completion,
          info: 'Absolute time tag (AYYYY-DDDTHH:MM:SS)',
          section: 'Time Tags',
        });
      }
    } else if (relativeMatch) {
      // Complete relative time tag based on what's already typed
      const typed = relativeMatch[0];
      let completion = '';

      if (typed === 'R') {
        // Just "R" - suggest full template
        completion = `00:00:00`;
      } else {
        // Has R and possibly some time - complete the rest
        const timePart = typed.slice(1); // Remove 'R'
        if (!timePart.includes(':')) {
          completion = typed + `00:00:00`;
        } else {
          const colons = (timePart.match(/:/g) || []).length;
          if (colons === 1) {
            completion = typed + `:00`;
          }
        }
      }

      if (completion) {
        completions.push({
          label: completion,
          type: 'text',
          apply: completion,
          info: 'Relative time tag (RHH:MM:SS)',
          section: 'Time Tags',
        });
      }
    } else if (beforeCursor.trimStart() === '' || /^\s*$/.test(beforeCursor)) {
      // At start of line or after whitespace - suggest both time tag types
      completions.push(
        {
          label: `A${year}-${String(dayOfYear).padStart(3, '0')}T${hours}:${minutes}:${seconds}`,
          type: 'text',
          apply: `A${year}-${String(dayOfYear).padStart(3, '0')}T${hours}:${minutes}:${seconds}`,
          info: 'Absolute time tag (AYYYY-DDDTHH:MM:SS)',
          section: 'Time Tags',
        },
        {
          label: 'R00:00:00',
          type: 'text',
          apply: 'R00:00:00',
          info: 'Relative time tag (RHH:MM:SS)',
          section: 'Time Tags',
        },
      );
    }
  }

  // Generate command stem completions if there's a valid time tag on the line
  if (hasTimeTag && commandDictionary && !absoluteMatch && !relativeMatch) {
    // Check if cursor is after the time tag (in command position)
    const timeTagEndMatch = lineText.match(/^[AR]\S+\s+/);
    if (timeTagEndMatch && cursorInLine >= timeTagEndMatch[0].length) {
      // Get the word/token at cursor
      const word = context.matchBefore(/[\w.]+/);

      if (word || context.explicit) {
        const prefix = word ? word.text : '';

        // Add FSW command completions
        for (const fswCommand of commandDictionary.fswCommands) {
          if (fswCommand.stem.toUpperCase().startsWith(prefix.toUpperCase())) {
            const { description, stem, arguments: args } = fswCommand;
            let apply = stem;

            if (args && args.length) {
              const argDefaults: string[] = [];
              args.forEach(arg => {
                argDefaults.push(fswCommandArgDefault(arg, commandDictionary.enumMap));
              });
              const argsStr = argDefaults.join(', ');
              apply = `${stem} ${argsStr}`;
            }

            completions.push({
              label: stem,
              type: 'function',
              apply,
              info: description || 'FSW Command',
              section: 'Flight Software Commands',
            });
          }
        }

        // Add hardware command completions
        for (const hwCommand of commandDictionary.hwCommands) {
          if (hwCommand.stem.toUpperCase().startsWith(prefix.toUpperCase())) {
            const { description, stem} = hwCommand;
            const apply = stem;
            completions.push({
              label: stem,
              type: 'function',
              apply,
              info: description || 'Hardware Command',
              section: 'Hardware Commands',
            });
          }
        }
      }
    }
  }

  if (completions.length === 0) {
    return null;
  }

  // Find the range to replace
  let from = context.pos;
  let to = context.pos;

  if (absoluteMatch || relativeMatch) {
    const match = absoluteMatch || relativeMatch;
    from = context.pos - match![0].length;
    to = context.pos;
  } else {
    // For command completions, replace the current word
    const word = context.matchBefore(/[\w.]+/);
    if (word) {
      from = word.from;
      to = word.to;
    }
  }

  return {
    from,
    to,
    options: completions,
    filter: false, // We've already done custom filtering
  };
  };
}
