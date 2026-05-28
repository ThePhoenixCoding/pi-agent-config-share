---
name: bughunt
description: Hunt for bugs across the codebase and create failing tests that demonstrate the issues.
disable-model-invocation: true
---

Systematically hunt for bugs across the codebase, document findings, and create failing tests.

## Setup

1. Use the `read` tool on the project's AGENTS.md and/or CLAUDE.md, if present, to understand architecture and conventions
2. Identify the tech stack, test framework, and build commands

## Bug Hunting Strategy

Investigate these categories in parallel using subagents where appropriate:

1. **Null/Undefined Handling**: Missing null checks, optional unwrapping without guards, NPE-prone code paths
2. **Edge Cases**: Empty collections, zero/negative values, boundary conditions, max/min values
3. **Error Handling**: Swallowed exceptions, missing catch blocks, inconsistent error propagation
4. **Race Conditions**: Shared mutable state, non-atomic operations, missing synchronization
5. **Resource Leaks**: Unclosed streams/connections, missing try-with-resources, cleanup in finally blocks
6. **Input Validation**: Unsanitized user input, missing bounds checks, type coercion issues
7. **Logic Errors**: Off-by-one errors, incorrect boolean logic, wrong comparison operators
8. **State Management**: Invalid state transitions, uninitialized fields, stale cache data

## For Each Bug Found

1. Verify it's a real bug by tracing the code path
2. Create a failing test that demonstrates the bug:
   - Name: check naming conventions in AGENTS.md and/or CLAUDE.md, if present
   - Test must fail with current code and pass when bug is fixed
3. Document in the report

## Output

```markdown
# Bug Hunt Report: [Project Name]

## Summary
[X bugs found, Y tests created, overview of severity]

## Critical Bugs
### Bug 1: [Title]
- **Location**: `path/file:line`
- **Category**: [from list above]
- **Description**: What's wrong and why
- **Impact**: What can go wrong
- **Test**: `TestClass#testMethodName`

## Medium Severity
[Same format]

## Low Severity / Code Smells
[Same format]

## Tests Created
| Test Class | Test Method | Bug |
|------------|-------------|-----|
| ... | ... | ... |

```

## Notes

- Prioritize bugs by severity (data loss, security, crashes > incorrect behavior > edge cases)
- Only create tests for confirmed bugs, not speculative issues
- Tests should be minimal and focused on demonstrating the single bug
- Follow project test conventions from AGENTS.md and/or CLAUDE.md, if present
