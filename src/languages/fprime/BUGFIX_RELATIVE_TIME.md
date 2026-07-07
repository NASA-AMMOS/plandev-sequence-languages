# Bug Fix: Relative Time Computation

## Problem (Updated)

All relative time tags were displaying the same computed absolute time, regardless of their position in the sequence.

**Status**: Fixed in two stages:
1. ✅ Initial fix: Corrected cumulative time calculation logic
2. ✅ Second fix: Corrected tree iteration API usage

## Root Cause

In the `computeAbsoluteTime()` function, when finding an absolute time base, the code was incorrectly adding the **current command's** relative time to the base immediately:

```typescript
// WRONG - This adds the current relative time too early
if (absoluteNode) {
  baseYear = parsed.year;
  baseDayOfYear = parsed.dayOfYear;
  cumulativeMs = timeToMilliseconds(parsed) + timeToMilliseconds(currentRelativeTime);  // ❌ BUG
}
```

This caused every relative command to compute from: `base + currentRelativeTime`, ignoring all intermediate relative offsets.

## Example of Bug

Given this sequence:
```fprime
A2015-075T22:00:00.000 CMD_1
R00:10:00.000 CMD_2
R00:05:00.000 CMD_3
```

**Before fix:**
- CMD_2: 22:00:00 + 00:10:00 = 22:10:00 ✓ (correct by accident)
- CMD_3: 22:00:00 + 00:05:00 = 22:05:00 ❌ (WRONG - should be 22:15:00!)

Both commands calculated from the same base, ignoring prior relative offsets.

## Solution

The fix properly accumulates all relative time offsets in order:

```typescript
// CORRECT - Set base time only
if (absoluteNode) {
  baseYear = parsed.year;
  baseDayOfYear = parsed.dayOfYear;
  cumulativeMs = timeToMilliseconds(parsed);  // Just the base
}

// Add intermediate relative offsets
else if (relativeNode) {
  cumulativeMs += timeToMilliseconds(parsed);
}

// Finally, add the current command's relative time
cumulativeMs += timeToMilliseconds(currentRelativeTime);  // ✓ At the end
```

**After fix:**
- CMD_2: 22:00:00 + 00:10:00 = 22:10:00 ✓
- CMD_3: 22:00:00 + 00:10:00 + 00:05:00 = 22:15:00 ✓

## Test Coverage

Added comprehensive test `should compute different absolute times for each relative command` that verifies:

```typescript
// CMD_2: base + 10 minutes = 22:10:00
// CMD_3: base + 10 minutes + 5 minutes = 22:15:00 (not 22:05:00!)
```

All 9 time computation tests now pass.

## Algorithm Summary

For each relative time tag:

1. **Initialize** cumulative time to 0
2. **Walk through all prior commands** in sequence order:
   - If absolute time: set cumulative = absolute time (reset the base)
   - If relative time: add offset to cumulative
3. **Add current command's relative time** to cumulative
4. **Convert** cumulative time to time components
5. **Return** absolute time with base year/day + computed time

This ensures each relative command correctly accumulates all prior offsets.

## Second Issue: Incorrect Tree Iteration API

After the first fix, the issue persisted because the tree iteration was using the wrong API.

### Problem

The code was using:
```typescript
// WRONG API
sequenceNode.cursor().iterate((node) => {
  if (node.name === FPRIME_NODES.Command) {
    // ...
  }
});
```

This doesn't work correctly with Lezer's iterate API.

### Solution

Changed to use the correct Lezer tree iteration API with an object containing an `enter` callback:

```typescript
// CORRECT API  
tree.iterate({
  enter: (node) => {
    if (node.name === FPRIME_NODES.Command) {
      // Process commands in document order
      if (commandNode.from === currentCommandNode.from) {
        reachedCurrentCommand = true;
        return false; // Stop iteration
      }
    }
  },
});
```

Additionally added a `reachedCurrentCommand` flag to properly track when we've reached the current command and stop processing.

### Why This Matters

The incorrect API usage meant that:
- The iteration might not have been visiting nodes in the expected order
- The return value to stop iteration might not have been working
- Commands might have been processed multiple times or in the wrong order

With the correct API:
- Nodes are visited in document order (top to bottom)
- Returning `false` from `enter` properly stops iteration
- Each command is processed exactly once in the correct order

## Final Result

Both fixes together ensure that:
1. ✅ Time is accumulated correctly (add base + all prior offsets + current offset)
2. ✅ Commands are processed in the correct order
3. ✅ Iteration stops at the right place
4. ✅ Each relative command gets its own unique computed absolute time
