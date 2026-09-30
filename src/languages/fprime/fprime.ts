import { foldNodeProp, indentNodeProp } from '@codemirror/language';
import { styleTags, tags as t } from '@lezer/highlight';
import { parser } from './fprime.grammar.js';
import type { PhoenixResources } from '../../interfaces/phoenix.js';

export const fprimeParser = parser;

// Export F-Prime dictionary utilities
export { parseFPrimeJsonToAmpcsXml, type FPrimeToAmpcsOptions } from './fprime-dictionary.js';

/**
 * Get the F' Lezer-based LRLanguage instance.
 * This configures syntax highlighting, folding, and indentation for F' sequences.
 */
export function getFprimeLRLanguage(resources: PhoenixResources) {
  return resources.LRLanguage.define({
    languageData: {
      commentTokens: { line: ';' },
    },
    parser: fprimeParser.configure({
      props: [
        indentNodeProp.add({}),
        foldNodeProp.add({}),
        styleTags({
          TimeAbsolute: t.className,
          TimeRelative: t.className,
          CommandMnemonic: t.keyword,
          String: t.string,
          Number: t.number,
          LineComment: t.lineComment,
          'Args/...': t.content,
        }),
      ],
    }),
  });
}
