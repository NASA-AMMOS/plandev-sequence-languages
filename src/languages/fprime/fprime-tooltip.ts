import { syntaxTree } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import type { EditorView, Tooltip } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';
import type { CommandDictionary, FswCommand, HwCommand } from '@nasa-jpl/aerie-ampcs';
import { PhoenixResources } from '../../interfaces/phoenix.js';
import { buildAmpcsArgumentTooltip, buildAmpcsCommandTooltip } from '../../utils/editor-utils.js';
import { getTokenPositionInLine } from '../../utils/tree-utils.js';
import { FPRIME_NODES } from './fprime-grammar-constants.js';

/**
 * Parsed time tag information
 */
interface ParsedTimeTag {
  type: 'absolute' | 'relative';
  hours: number;
  minutes: number;
  seconds: number;
  milliseconds: number;
  year?: number;
  dayOfYear?: number;
}

/**
 * Parses an F-Prime absolute time tag (AYYYY-DDDTHH:MM:SS[.sss])
 */
function parseAbsoluteTime(timeText: string): ParsedTimeTag | null {
  const pattern = /^A(\d{4})-(\d{3})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/;
  const match = timeText.match(pattern);

  if (!match) {
    return null;
  }

  return {
    type: 'absolute',
    year: Number.parseInt(match[1], 10),
    dayOfYear: Number.parseInt(match[2], 10),
    hours: Number.parseInt(match[3], 10),
    minutes: Number.parseInt(match[4], 10),
    seconds: Number.parseInt(match[5], 10),
    milliseconds: match[6] ? Number.parseInt(match[6].padEnd(3, '0').substring(0, 3), 10) : 0,
  };
}

/**
 * Parses an F-Prime relative time tag (RHH:MM:SS[.sss])
 */
function parseRelativeTime(timeText: string): ParsedTimeTag | null {
  const pattern = /^R(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/;
  const match = timeText.match(pattern);

  if (!match) {
    return null;
  }

  return {
    type: 'relative',
    hours: Number.parseInt(match[1], 10),
    minutes: Number.parseInt(match[2], 10),
    seconds: Number.parseInt(match[3], 10),
    milliseconds: match[4] ? Number.parseInt(match[4].padEnd(3, '0').substring(0, 3), 10) : 0,
  };
}

/**
 * Converts a parsed time to total milliseconds
 */
function timeToMilliseconds(time: ParsedTimeTag): number {
  let ms = 0;
  ms += time.hours * 3600000;
  ms += time.minutes * 60000;
  ms += time.seconds * 1000;
  ms += time.milliseconds;
  return ms;
}

/**
 * Converts total milliseconds back to time components
 */
function millisecondsToTime(ms: number): { hours: number; minutes: number; seconds: number; milliseconds: number } {
  const hours = Math.floor(ms / 3600000);
  ms -= hours * 3600000;
  const minutes = Math.floor(ms / 60000);
  ms -= minutes * 60000;
  const seconds = Math.floor(ms / 1000);
  const milliseconds = ms % 1000;

  return { hours, minutes, seconds, milliseconds };
}

/**
 * Converts day-of-year to month and day
 */
function dayOfYearToMonthDay(year: number, dayOfYear: number): { month: number; day: number } {
  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  let remainingDays = dayOfYear;
  let month = 0;

  for (let i = 0; i < daysInMonth.length; i++) {
    if (remainingDays <= daysInMonth[i]) {
      month = i;
      break;
    }
    remainingDays -= daysInMonth[i];
  }

  return { month: month + 1, day: remainingDays };
}

/**
 * Gets day of week for a given date
 */
function getDayOfWeek(year: number, month: number, day: number): string {
  const date = new Date(year, month - 1, day);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[date.getDay()];
}

/**
 * Gets month name
 */
function getMonthName(month: number): string {
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  return months[month - 1];
}

/**
 * Formats an absolute time as a calendar date
 */
function formatCalendarDate(parsed: ParsedTimeTag): string | null {
  if (parsed.type !== 'absolute' || parsed.year === undefined || parsed.dayOfYear === undefined) {
    return null;
  }

  const { month, day } = dayOfYearToMonthDay(parsed.year, parsed.dayOfYear);
  const dayOfWeek = getDayOfWeek(parsed.year, month, day);
  const monthName = getMonthName(month);

  return `${dayOfWeek}, ${monthName} ${day}, ${parsed.year}`;
}

/**
 * Formats a time for display
 */
function formatTime(parsed: ParsedTimeTag): string {
  const pad = (n: number, width: number = 2) => n.toString().padStart(width, '0');

  if (parsed.type === 'absolute') {
    let result = `${parsed.year}-${pad(parsed.dayOfYear!, 3)}T${pad(parsed.hours)}:${pad(parsed.minutes)}:${pad(parsed.seconds)}`;
    if (parsed.milliseconds > 0) {
      result += `.${pad(parsed.milliseconds, 3)}`;
    }
    return result;
  } else {
    let result = `${pad(parsed.hours)}:${pad(parsed.minutes)}:${pad(parsed.seconds)}`;
    if (parsed.milliseconds > 0) {
      result += `.${pad(parsed.milliseconds, 3)}`;
    }
    return result;
  }
}

/**
 * Computes cumulative absolute time for a relative time tag by summing all prior commands
 */
function computeAbsoluteTime(
  view: EditorView,
  currentCommandNode: SyntaxNode,
  currentRelativeTime: ParsedTimeTag,
): ParsedTimeTag | null {
  let cumulativeMs = 0;
  let baseYear: number | undefined;
  let baseDayOfYear: number | undefined;
  let reachedCurrentCommand = false;

  // Walk through the tree to find all prior commands
  const tree = syntaxTree(view.state);

  // Iterate through all commands in document order
  tree.iterate({
    enter: node => {
      // Skip if we've already reached the current command
      if (reachedCurrentCommand) {
        return false; // Stop iteration
      }

      if (node.name === FPRIME_NODES.Command) {
        const commandNode = node.node;

        // If we've reached the current command, mark it and stop
        if (commandNode.from === currentCommandNode.from) {
          reachedCurrentCommand = true;
          return false; // Stop iteration
        }

        // Process this prior command
        const timeTagNode = commandNode.getChild(FPRIME_NODES.TimeTag);
        if (timeTagNode) {
          const absoluteNode = timeTagNode.getChild(FPRIME_NODES.TimeAbsolute);
          const relativeNode = timeTagNode.getChild(FPRIME_NODES.TimeRelative);

          if (absoluteNode) {
            const timeText = view.state.doc.sliceString(absoluteNode.from, absoluteNode.to).trim();
            const parsed = parseAbsoluteTime(timeText);
            if (parsed && parsed.year !== undefined && parsed.dayOfYear !== undefined) {
              // Found an absolute time - set it as the base and reset cumulative time
              baseYear = parsed.year;
              baseDayOfYear = parsed.dayOfYear;
              cumulativeMs = timeToMilliseconds(parsed);
            }
          } else if (relativeNode) {
            const timeText = view.state.doc.sliceString(relativeNode.from, relativeNode.to).trim();
            const parsed = parseRelativeTime(timeText);
            if (parsed) {
              // Add relative offset to cumulative time
              cumulativeMs += timeToMilliseconds(parsed);
            }
          }
        }
      }
    },
  });

  // Now add the current command's relative time
  cumulativeMs += timeToMilliseconds(currentRelativeTime);

  const finalTime = millisecondsToTime(cumulativeMs);

  // If we have a base absolute time, return it with the computed time
  if (baseYear !== undefined && baseDayOfYear !== undefined) {
    return {
      type: 'absolute',
      year: baseYear,
      dayOfYear: baseDayOfYear,
      hours: finalTime.hours,
      minutes: finalTime.minutes,
      seconds: finalTime.seconds,
      milliseconds: finalTime.milliseconds,
    };
  }

  // No absolute time found, just return the cumulative relative time
  return {
    type: 'relative',
    hours: finalTime.hours,
    minutes: finalTime.minutes,
    seconds: finalTime.seconds,
    milliseconds: finalTime.milliseconds,
  };
}

/**
 * Searches up through a node's ancestors to find a node by the given name.
 */
function getParentNodeByName(view: EditorView, pos: number, name: string): SyntaxNode | undefined {
  let node: SyntaxNode | undefined = syntaxTree(view.state).resolveInner(pos, -1);

  while (node && node.name !== name) {
    node = node.parent?.node;
  }

  return node;
}

/**
 * Tooltip function that returns a CodeMirror extension for F-Prime sequences.
 * Displays command descriptions when hovering over command stems and argument
 * details when hovering over command arguments.
 */
export function fprimeTooltip(
  commandDictionary: CommandDictionary | null = null,
  resources: PhoenixResources,
): Extension {
  return resources.hoverTooltip((view, pos, side): Tooltip | null => {
    const { from, to } = getTokenPositionInLine(view, pos);

    // First handle the case where the token is out of bounds.
    if ((from === pos && side < 0) || (to === pos && side > 0)) {
      return null;
    }

    const node = syntaxTree(view.state).resolveInner(pos, -1);

    // Check if we're hovering over a TimeAbsolute or TimeRelative node
    if (node.name === FPRIME_NODES.TimeAbsolute || node.name === FPRIME_NODES.TimeRelative) {
      const timeText = view.state.doc.sliceString(node.from, node.to).trim();
      const tooltipLines: string[] = [];

      if (node.name === FPRIME_NODES.TimeAbsolute) {
        const parsed = parseAbsoluteTime(timeText);
        if (parsed) {
          tooltipLines.push('Absolute Time:', formatTime(parsed));

          // Add calendar date format
          const calendarDate = formatCalendarDate(parsed);
          if (calendarDate) {
            tooltipLines.push(calendarDate);
          }
        }
      } else if (node.name === FPRIME_NODES.TimeRelative) {
        const parsed = parseRelativeTime(timeText);
        if (parsed) {
          tooltipLines.push('Relative Time:', formatTime(parsed));

          // Find the containing command node
          let commandNode: SyntaxNode | null | undefined = node.parent;
          while (commandNode && commandNode.name !== FPRIME_NODES.Command) {
            commandNode = commandNode.parent?.node;
          }

          if (commandNode) {
            const absoluteTime = computeAbsoluteTime(view, commandNode, parsed);
            if (absoluteTime) {
              tooltipLines.push('');
              if (absoluteTime.type === 'absolute') {
                tooltipLines.push('Computed Absolute Time:');
                tooltipLines.push(formatTime(absoluteTime));

                // Add calendar date format for computed absolute time
                const calendarDate = formatCalendarDate(absoluteTime);
                if (calendarDate) {
                  tooltipLines.push(calendarDate);
                }
              } else {
                tooltipLines.push('Cumulative Relative Time:');
                tooltipLines.push(formatTime(absoluteTime));
              }
            }
          }
        }
      }

      if (tooltipLines.length > 0) {
        return resources.createTooltip(tooltipLines, node.from, node.to);
      }
    }

    // Check if the current node or its parent is a CommandMnemonic
    const commandMnemonicNode =
      node.name === FPRIME_NODES.CommandMnemonic
        ? node
        : node.parent?.name === FPRIME_NODES.CommandMnemonic
          ? node.parent.node
          : null;

    if (commandMnemonicNode && commandDictionary) {
      const { hwCommandMap, fswCommandMap } = commandDictionary;

      // Get the full command mnemonic text (e.g., "Module.Component.CMD_NAME")
      const commandText = view.state.doc.sliceString(commandMnemonicNode.from, commandMnemonicNode.to);

      // Look up the command in the dictionary
      const command: FswCommand | HwCommand | null = fswCommandMap[commandText] ?? hwCommandMap[commandText] ?? null;

      if (command) {
        // Use the existing utility to build a tooltip with command description
        return resources.createTooltip(
          buildAmpcsCommandTooltip(command),
          commandMnemonicNode.from,
          commandMnemonicNode.to,
        );
      }
    }

    // Check to see if we are hovering over command arguments
    const argsNode = getParentNodeByName(view, pos, FPRIME_NODES.Args);

    if (argsNode && commandDictionary) {
      // Find the CommandMnemonic node (sibling of Args under Command)
      const commandNode = argsNode.parent;
      const mnemonicNode = commandNode?.getChild(FPRIME_NODES.CommandMnemonic);

      if (mnemonicNode) {
        const { fswCommandMap } = commandDictionary;
        const commandText = view.state.doc.sliceString(mnemonicNode.from, mnemonicNode.to);
        const fswCommand: FswCommand | null = fswCommandMap[commandText] ?? null;

        if (!fswCommand || !fswCommand.arguments || fswCommand.arguments.length === 0) {
          return null;
        }

        // Collect all argument nodes in order
        const argNodes: SyntaxNode[] = [];
        let argNode = argsNode.firstChild;
        while (argNode) {
          // Only include actual argument nodes (String, Number, Identifier), skip whitespace and commas
          if (
            argNode.name === FPRIME_NODES.String ||
            argNode.name === FPRIME_NODES.Number ||
            argNode.name === FPRIME_NODES.Identifier
          ) {
            argNodes.push(argNode);
          }
          argNode = argNode.nextSibling;
        }

        // Find which argument we're hovering over
        for (let i = 0; i < argNodes.length; i++) {
          const currentArg = argNodes[i];
          if (currentArg.from === from && currentArg.to === to) {
            // We're hovering over this argument
            const argDef = fswCommand.arguments[i];
            if (argDef) {
              return resources.createTooltip(buildAmpcsArgumentTooltip(argDef, commandDictionary), from, to);
            }
          }
        }
      }
    }

    return null;
  });
}
