# F-Prime Sequence Language Support

This module provides language support for NASA's F' (F-Prime) flight software sequencing format in the Phoenix Sequence Editor.

## Overview

F-Prime sequences use a simple text-based format with time-tagged commands. Each command specifies either an absolute or relative time, a command mnemonic, and optional arguments.

## Sequence Format

### Command Structure

```
<TimeTag> <CommandMnemonic> [arguments...]
```

### Time Tags

**Absolute Time:** `AYYYY-DDDTHH:MM:SS[.sss]`
- Format: ISO 8601 ordinal date and time
- Example: `A2015-075T22:32:40.123`
- Year, day-of-year, and time with optional milliseconds

**Relative Time:** `RHH:MM:SS[.sss]`
- Format: Hour, minute, second with optional milliseconds
- Example: `R01:00:01.050`
- Limited to 24 hours

### Command Mnemonics

Command mnemonics can include dots for namespace qualification:
- Simple: `CMD_NO_OP`
- Qualified: `cmdDisp.CMD_NO_OP`
- Nested: `module.submodule.COMMAND_NAME`

### Arguments

**String Arguments:**
- Enclosed in double quotes
- Example: `"Awesome string!"`

**Numeric Arguments:**
- Integers: `42`, `-10`
- Floats: `3.14159`, `-2.5`
- Hex: `0xFF`, `0x1234ABCD`

### Comments

Comments start with a semicolon (`;`) and continue to the end of the line:
```
; This is a full-line comment
R01:00:01.050 CMD_NO_OP ; This is an inline comment
```

## Example Sequence

```fprime
; F-Prime Sequence Example
; Demonstrates various command types

; Absolute time command
A2015-075T22:32:40.123 cmdDisp.CMD_NO_OP

; Relative time command with string argument
R01:00:01.050 CMD_NO_OP_STRING "Awesome string!" ; With a comment

; Command with numeric arguments
R00:00:05.000 SET_VALUE 42, 3.14159

; Command with hex arguments
R00:00:10.500 MEMORY_WRITE 0xFF, 0x1234ABCD

; Complex namespaced command
A2015-075T23:00:00.000 module.submodule.COMPLEX_CMD 1, 2, 3, "test"
```

## Usage in Code

### Importing

```typescript
import {
  fprimeLanguage,
  fprimeParser,
  getFprimeLRLanguage,
  getFprimeExtensions,
  FPRIME_NODES,
  FPrimeCommandInfoMapper
} from '@nasa-jpl/aerie-sequence-languages';
```

### Parser

```typescript
const text = 'A2015-075T22:32:40.123 cmdDisp.CMD_NO_OP\n';
const tree = fprimeParser.parse(text);
```

### Language Definition

```typescript
// Get the language definition for Phoenix
const language = fprimeLanguage;
console.log(language.name); // 'F-Prime'
console.log(language.fileExtension); // '.seq'

// Access the command info mapper
const mapper = language.commandInfoMapper;

// Get editor extensions
const extensions = language.getEditorExtension(context, resources);
```

### CommandInfoMapper

The `FPrimeCommandInfoMapper` provides utilities for the Phoenix UI command panel:

```typescript
import { FPrimeCommandInfoMapper } from '@nasa-jpl/aerie-sequence-languages';

const mapper = new FPrimeCommandInfoMapper();

// Format arguments for insertion
const formatted = mapper.formatArgumentArray(['42', '"test"', '0xFF'], commandNode);
// Returns: ' 42, "test", 0xFF' (or ', 42, "test", 0xFF' if existing args lack trailing comma)

// Get command definition from dictionary
const commandDef = mapper.getCommandDef(commandDictionary, [], 'cmdDisp.CMD_NO_OP');

// Extract argument nodes from a command
const argsNode = mapper.getArgumentNodeContainer(commandNode);
const argNodes = mapper.getArgumentsFromContainer(argsNode);
```

### Tree Traversal

```typescript
import { FPRIME_NODES } from '@nasa-jpl/aerie-sequence-languages';

const tree = fprimeParser.parse(text);
const cursor = tree.cursor();

if (cursor.firstChild()) {
  if (cursor.node.type.name === FPRIME_NODES.Command) {
    // Process command...
  }
}
```

## Grammar

The F-Prime grammar is defined in `fprime.grammar` using Lezer syntax. To regenerate the parser after modifying the grammar:

```bash
npm run fprime
```

## Testing

Run the F-Prime tests:

```bash
npm test src/languages/fprime/
```

## F-Prime Command Dictionary Conversion

This module includes utilities to convert F-Prime JSON command dictionaries (FPP JSON format) to AMPCS XML format.

### Usage

```typescript
import { parseFPrimeJsonToAmpcsXml } from '@nasa-jpl/aerie-sequence-languages';

// F-Prime JSON dictionary (from FPP compiler)
const fprimeJson = JSON.stringify({
  enums: [
    {
      name: 'STATUS_ENUM',
      constants: [
        { name: 'OFF', value: 0 },
        { name: 'ON', value: 1 },
        { name: 'STANDBY', value: 2 }
      ]
    }
  ],
  commands: [
    {
      name: 'Module.Component.CMD_NAME',
      commandKind: 'sync',
      opcode: 257,
      annotation: 'A command with parameters',
      formalParams: [
        {
          name: 'param1',
          annotation: 'First parameter',
          type: {
            name: 'U32',
            kind: 'integer',
            size: 32,
            signed: false
          },
          ref: false
        }
      ]
    }
  ]
});

// Convert to AMPCS XML
const ampcsXml = parseFPrimeJsonToAmpcsXml(fprimeJson, {
  missionName: 'my_mission',
  version: '1.0.0',
  spacecraftId: 44,
  defaultUnits: 'none',
  extractModuleFromName: true
});

// Write to file
import fs from 'fs';
fs.writeFileSync('command-dictionary.xml', ampcsXml);
```

### Conversion Options

```typescript
interface FPrimeToAmpcsOptions {
  missionName?: string;           // Mission name (default: 'fprime')
  version?: string;                // Dictionary version (default: '1.0.0')
  schemaVersion?: string;          // AMPCS schema version (default: '5.4')
  spacecraftId?: number;           // Spacecraft ID (default: 0)
  defaultCommandClass?: string;    // Default class for FSW commands (default: 'FSW')
  defaultUnits?: string;           // Default units for numeric args (default: 'none')
  extractModuleFromName?: boolean; // Extract module from command name (default: true)
}
```

### Type Mapping

| F-Prime Type | AMPCS XML Type | Notes |
|--------------|----------------|-------|
| `integer` (signed) | `<integer_arg>` | Supports 8, 16, 32, 64 bit |
| `integer` (unsigned) | `<unsigned_arg>` | Supports 8, 16, 32, 64 bit |
| `float` | `<float_arg>` | Supports 32, 64 bit |
| `string` | `<var_string_arg>` | Variable length with prefix |
| `boolean` | `<boolean_arg>` | TRUE/FALSE format |
| `enum` | `<enum_arg>` | References enum table |
| `array` | `<repeat_arg>` | Repeating argument block |

### Command Type Determination

- **FSW Command**: Commands with `formalParams` (arguments)
- **Hardware Command**: Commands without `formalParams`

### Module Extraction

When `extractModuleFromName` is `true` (default):
- Input: `"Module.Component.CMD_NAME"`
- Output: `stem="CMD_NAME"` with `<category name="module" value="Module.Component">`

When `false`:
- Input: `"Module.Component.CMD_NAME"`
- Output: `stem="Module.Component.CMD_NAME"` with no category

## References

- [F-Prime User Guide - Sequence Generation](https://nasa.github.io/fprime/UsersGuide/gds/seqgen.html)
- [F-Prime GitHub Repository](https://github.com/nasa/fprime)
- [FPP JSON Dictionary Format](https://github.com/nasa/fprime/blob/main/docs/reference/fpp-json-dict.md)
- [AMPCS Dictionary Schemas](https://github.com/NASA-AMMOS/ampcs-dict-schemas)
