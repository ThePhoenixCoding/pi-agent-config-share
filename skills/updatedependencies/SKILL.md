---
name: updatedependencies
description: Update all dependencies to their latest versions with test verification.
disable-model-invocation: true
---

Update all project dependencies to their latest versions, ensuring tests pass before and after.

## Pre-flight Check

1. Use the `read` tool on the project's AGENTS.md and/or CLAUDE.md, if present, to understand build commands and test conventions
2. Run all tests to establish a green baseline.
3. **If tests fail: STOP and report the failures. Do not proceed with updates.**

## Update Process

1. **Use the `read` tool for dependency files** (pom.xml, package.json, build.gradle, requirements.txt, etc.) to identify all dependencies with explicit versions
2. **For each dependency**, check the package registry for the latest stable version. Skip pre-release versions unless already using them.
3. **Update the dependency file** with new versions
4. **Track all changes** for the report

## Post-Update Verification

1. Run all tests again. Save the output to a temp file and read this to avoid running tests again just to have access to the test output again.
2. **If tests fail**:
   - Analyze the failure to identify which dependency update caused it
   - Attempt to fix compatibility issues in the code
   - If unfixable, revert that specific dependency and note in report
   - Re-run tests until green

## Output

```markdown
# Dependency Update Report: [Project Name]

## Summary
[X dependencies updated, Y kept at current version, Z required code fixes]

## Pre-flight
- Tests passing: YES/NO
- [If NO: list failures and stop]

## Updates Applied
| Dependency | Old Version | New Version | Status |
|------------|-------------|-------------|--------|
| package-name | 1.0.0 | 2.0.0 | Updated |
| package-name | 1.0.0 | 1.0.0 | Kept (latest) |

## Code Fixes Required
[List any code changes needed for compatibility]

## Reverted Updates
[Dependencies rolled back due to incompatibility, with reasons]

## Post-Update Verification
- All tests passing: YES/NO
- [Details of any remaining issues]
```

## Notes

- Only update to stable releases (no pre-release versions unless already using them)
- Also check parent/shared dependency management and build plugins
- If a major version bump breaks things and can't be fixed, do a minor/patch update instead
