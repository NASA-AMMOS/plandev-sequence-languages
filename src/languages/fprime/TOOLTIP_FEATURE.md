# F-Prime Tooltip Feature

## Overview

The F-Prime sequence editor now includes comprehensive tooltip support that displays contextual information when hovering over:
- **Command stems** - Shows command signature and description from the dictionary
- **Command arguments** - Shows argument details (type, range, units, etc.)
- **Time tags** - Shows parsed time and computed absolute time for relative times

## Features

### Command Stem Tooltips

When hovering over any command mnemonic (stem) in an fprime sequence, a tooltip displays:

- **Command signature** - Shows the command name with argument names and types
- **Command description** - The description from the command dictionary

**Example:**
```fprime
A2015-075T22:32:40.123 cmdDisp.CMD_NO_OP
                        ^^^^^^^^^^^^^^^^^
                        Hover here to see command info
```

**Tooltip displays:**
```
cmdDisp.CMD_NO_OP
No-operation command for testing
```

For commands with arguments:
```
SET_VALUE(value: integer, timeout: float)
Set a value with a timeout parameter
```

### Command Argument Tooltips

When hovering over any argument value in a command, a tooltip displays detailed information about that specific argument:

- **Name** - The argument name from the dictionary
- **Type** - The argument data type (integer, float, string, enum, etc.)
- **Description** - What the argument is for
- **Default Value** - The default value if applicable
- **Range** - Valid min/max values for numeric arguments
- **Units** - Units of measurement (seconds, meters, etc.)
- **Bit Length** - Size in bits
- **Enum Symbols** - For enum arguments, shows valid values

**Example:**
```fprime
R00:00:05.000 SET_VALUE 42, 3.14
                         ^^  ^^^^
                         |   Hover for 'timeout' arg info
                         Hover for 'value' arg info
```

**Tooltip for `42` displays:**
```
Name: value
Type: integer
Description: The value to set
Default Value: 0
Range: [0, 100]
Units: None
Bit Length: 32
```

**Tooltip for `3.14` displays:**
```
Name: timeout
Type: float
Description: Timeout in seconds
Default Value: 1.0
Range: [0.0, 60.0]
Units: seconds
Bit Length: 32
```

## Implementation

The tooltip system is implemented in `fprime-tooltip.ts` and follows the same pattern as the seq-n tooltip implementation:

1. Uses CodeMirror's `hoverTooltip` API
2. Parses the syntax tree to identify command mnemonics and argument nodes
3. Looks up command definitions in the AMPCS command dictionary
4. Uses existing `buildAmpcsCommandTooltip` and `buildAmpcsArgumentTooltip` utilities
5. Creates tooltips with formatted information

## Usage

The tooltip extension is automatically included when using the fprime language in Phoenix:

```typescript
import { fprimeLanguage } from '@nasa-jpl/aerie-sequence-languages';

// Tooltips are automatically included in the language extensions
const extensions = fprimeLanguage.getEditorExtension(context, resources);
```

Or manually:

```typescript
import { fprimeTooltip } from '@nasa-jpl/aerie-sequence-languages';

const tooltipExtension = fprimeTooltip(commandDictionary, resources);
```

### Time Tag Tooltips

When hovering over time tags, tooltips display parsed time information and computed absolute times for relative time tags.

#### Absolute Time Tags

For absolute time tags (e.g., `A2015-075T22:32:40.123`), the tooltip shows:

- **Parsed time** - The time in a readable format

**Example:**
```fprime
A2015-075T22:32:40.123 CMD_NO_OP
^^^^^^^^^^^^^^^^^^^^^^^
Hover here to see time info
```

**Tooltip displays:**
```
Absolute Time:
2015-075T22:32:40.123
Monday, March 16, 2015
```

The tooltip now includes a human-readable calendar date showing the day of week, month name, day, and year.

#### Relative Time Tags

For relative time tags (e.g., `R01:00:05.000`), the tooltip shows:

- **Relative time** - The offset from the previous command
- **Computed absolute time** - The calculated absolute time based on all prior commands in the sequence

**Example:**
```fprime
A2015-075T22:32:40.123 CMD_NO_OP
R01:00:05.000 CMD_NEXT
^^^^^^^^^^^^^
Hover here to see computed time
```

**Tooltip displays:**
```
Relative Time:
01:00:05.000

Computed Absolute Time:
2015-075T23:32:45.123
Monday, March 16, 2015
```

The computed absolute time is calculated by:
1. Finding the most recent absolute time tag in prior commands
2. Summing all relative time offsets between that absolute time and the current command
3. Adding the current relative time to get the final absolute time

If no prior absolute time exists, the tooltip shows the cumulative relative time from the start of the sequence.

## Benefits

- **Improved usability** - Users can quickly reference command and argument details without leaving the editor
- **Reduced errors** - Clear information about argument types, ranges, and units helps prevent mistakes
- **Time tracking** - Instantly see when commands will execute without manual calculation
- **Better documentation** - Command dictionary documentation is accessible directly in the editing context
- **Consistent with other formats** - Follows the same tooltip pattern as seq-n and vml languages
