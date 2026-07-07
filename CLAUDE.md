# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a TypeScript library providing language support for NASA's Aerie Phoenix Sequence Editor. It implements parsers, linters, formatters, and CodeMirror extensions for multiple sequence languages used in spacecraft operations.

**Supported Languages:**
- **SeqN** (`.seqN.txt`) - Primary input/authoring language
- **SATF/SASF** - Spacecraft Activity Time File / Spacecraft Activity Sequence File formats
- **SeqJSON** - JSON-based sequence representation
- **VML** - Vehicle Markup Language with CDL dictionary support
- **F-Prime** (`.seq`) - NASA's F' flight software sequencing format
- **Handlebars** - Template support for SeqN

## Development Commands

### Building
```bash
npm run build              # Full build: clean + grammar generation + TypeScript compilation (CJS + ESM)
npm run clean              # Remove dist/ directory
npm run grammar-builder    # Generate all grammar parsers from .grammar files
```

### Grammar Generation (Required Before Build/Test)
```bash
npm run satf               # Generate SATF/SASF grammar parser
npm run seqn               # Generate SeqN grammar parser
npm run vml                # Generate VML grammar parser
npm run fprime             # Generate F-Prime grammar parser
```

**Important:** Grammar files must be regenerated whenever `.grammar` files are modified. The build process automatically runs grammar generation, but if you're iterating on grammar changes, run the specific grammar command directly.

### Testing
```bash
npm test                   # Run all tests (includes grammar generation)
vitest run                 # Alternative test command
vitest watch               # Run tests in watch mode
```

Test fixtures are located in `tests/dictionary/` (command dictionaries) and `tests/sequence/` (example sequences).

### Code Quality
```bash
npm run format:check       # Check Prettier formatting
npm run format:write       # Apply Prettier formatting
```

## Architecture

### Language Implementation Pattern

Each language follows a consistent architecture based on two core interfaces:

**InputLanguage** (authoring languages like SeqN):
- Provides CodeMirror extensions (linting, completion, tooltips, formatting)
- Implements `commandInfoMapper` to feed Phoenix UI command panel
- Optionally provides `getLibrarySequences` for workspace-wide call signatures
- Example: `src/languages/seq-n/language.ts`

**OutputLanguage** (export/interchange formats like SATF):
- Implements bidirectional converters: `toOutputFormat` and `toInputFormat`
- Used for converting between authoring and delivery formats
- Example: converters in `src/converters/`

### Phoenix Integration

Languages integrate with Phoenix via the `PhoenixAdaptation` interface:
```typescript
interface PhoenixAdaptation {
  input: InputLanguage;
  outputs: OutputLanguage[];
}
```

**PhoenixResources**: Static resources abstracted from CodeMirror/UI (indentService, linter, hoverTooltip, etc.)

**PhoenixContext**: Dynamic context including command/channel dictionaries and library sequences

Extensions are created using factory patterns that accept `PhoenixContext` and `PhoenixResources`, following the pattern in `getSeqnExtensions()` which returns keyed extension objects for easy composition.

### Grammar Files (Lezer)

Grammars are defined in `.grammar` files using Lezer syntax:
- `src/languages/satf/grammar/satf-sasf.grammar`
- `src/languages/seq-n/seq-n.grammar`
- `src/languages/vml/vml.grammar`
- `src/languages/fprime/fprime.grammar`

Lezer-generator compiles these into TypeScript parsers (`.grammar.js` and `.grammar.d.ts` files). The generated files are gitignored and must be regenerated on each build.

**F-Prime Sequence Format:**
- Commands with absolute time (`AYYYY-DDDTHH:MM:SS[.sss]`) or relative time (`RHH:MM:SS[.sss]`)
- Command mnemonics can include dots for namespacing (e.g., `module.CMD_NAME`)
- Arguments: strings in double quotes, numbers (decimal or hex with `0x` prefix)
- Comments start with semicolon (`;`)

### Key Utilities

**Tree Utilities** (`src/utils/tree-utils.ts`):
- Generic tree traversal and node manipulation for Lezer syntax trees

**Sequence Utilities** (`src/utils/sequence-utils.ts`):
- Command dictionary interaction (FSW/hardware commands)
- Argument parsing and validation
- Type guards for different argument types

**String Utilities** (`src/utils/string.ts`):
- Quote handling: `isQuoted`, `unquoteUnescape`, `quoteEscape`, `removeEscapedQuotes`
- Used throughout parsers for literal handling

**Converters** (`src/converters/`):
- `seqnToSeqJson` / `seqJsonToSeqn`: SeqN ↔ SeqJSON transformation
- `satf-sasf-utils.ts`: SeqN ↔ SATF/SASF conversions

### CommandInfoMapper

The `CommandInfoMapper` interface feeds the Phoenix UI command panel and provides command metadata. Each input language implements its own mapper (e.g., `SeqNCommandInfoMapper`) to extract command information from parse trees.

## Build Artifacts

The package produces dual module outputs:
- **CommonJS**: `dist/cjs/` (main entry)
- **ES Modules**: `dist/esm/` (module entry)

Both include TypeScript declarations. The package.json exports field provides conditional exports for modern bundlers.

## External Dependencies

- **@lezer/common, @lezer/lr**: Core Lezer parsing infrastructure
- **@codemirror/***: Editor extensions (autocomplete, commands, language, lint, view)
- **@nasa-jpl/aerie-ampcs**: Command dictionary types and utilities
- **@nasa-jpl/seq-json-schema**: SeqJSON type definitions
- **@nasa-jpl/aerie-time-utils**: Time parsing and validation

## Development Notes

- Tests are co-located with source files (e.g., `*.test.ts` files in `src/`)
- The sanitizeTextExtension in SeqN automatically converts smart quotes to ASCII quotes on paste/open
- ViewPlugin factories should access PhoenixResources instead of direct CodeMirror imports to follow library conventions (see recent refactor)
- Format functions operate on EditorView instances and should be idempotent
