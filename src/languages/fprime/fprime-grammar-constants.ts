/**
 * Grammar node type constants for F' sequences.
 * Used for traversing and analyzing the parse tree.
 */
export const FPRIME_NODES = {
  Sequence: 'Sequence',
  Command: 'Command',
  TimeTag: 'TimeTag',
  TimeAbsolute: 'TimeAbsolute',
  TimeRelative: 'TimeRelative',
  CommandMnemonic: 'CommandMnemonic',
  Args: 'Args',
  String: 'String',
  Number: 'Number',
  Identifier: 'Identifier',
  LineComment: 'LineComment',
  CommentLine: 'CommentLine',
} as const;

export type FprimeNode = (typeof FPRIME_NODES)[keyof typeof FPRIME_NODES];
