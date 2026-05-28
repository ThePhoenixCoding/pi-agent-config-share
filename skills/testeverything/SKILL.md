---
name: testeverything
description: Find untested service behavior and generate tests.
disable-model-invocation: true
---

Find untested service behavior and create tests that verify observable outcomes from the outside.

## Setup

1. Use the `read` tool on the project's AGENTS.md and/or CLAUDE.md, if present, to understand architecture, test conventions, and coding standards
2. Identify test framework, base classes, and existing test patterns
3. Run all tests first. If not all tests pass, abort the process.

## Discovery Strategy

Focus on **what the service does**, not which code lines are covered. Discovery happens in two sequential phases:

### Phase 1: Identify entry points (sequential, no subagents)

Investigate the codebase yourself to build a complete list of entry points:

- Identify all ways the service receives input (REST endpoints, Kafka consumers, scheduled jobs, CLI commands). These are the primary test targets.

### Phase 2: Investigate and test per entry point (parallel subagents)

Once all entry points are known, use subagents in parallel — one per entry point or behavior area. Each subagent:

1. **Observable outputs**: Identify what the entry point produces (HTTP responses, Kafka messages, database state changes, API calls to external services).
2. **Existing test coverage**: Check which behaviors of this entry point already have tests. Look at what scenarios are tested, not which classes have test files.
3. **Untested behaviors**: Identify gaps. A gap is any path starting from an entry point without coverage.
4. **Write tests** for the untested behaviors following the principles below.

**Each subagent asks these questions for its entry point:**
- What happens on a valid request? (happy path)
- What happens on invalid input? (validation, missing fields, wrong types, etc)
- What happens when a downstream dependency fails? (timeouts, errors, unavailability, etc)
- What happens on edge cases? (empty payloads, duplicate requests, concurrent access, min/max allowed values, etc)

## Test Writing Principles

**Test observable behavior, not implementation:**
- Tests call entry points and assert on observable outputs (responses, messages sent, state changes)
- Never assert on internal method calls, field values, or intermediate state
- If refactoring internals without changing behavior would break your test, the test is too coupled

**Test the intended behavior, not current behavior:**
- Analyze what the service SHOULD do based on its contract, naming, and context
- If current behavior appears buggy, write the test for correct behavior (test will fail)
- Never write tests that assert buggy behavior is correct

**Prefer integration tests over unit tests:**
- Default to testing through the entry point (e.g., call the REST endpoint, send the Kafka message)
- Use Wiremock or similar to simulate external dependencies at the network boundary
- Only write unit tests for isolated complex logic (algorithms, calculations, state machines) that would be hard to cover thoroughly through integration tests

**Minimize mocking:**
- Mock at system boundaries (external HTTP APIs, external Kafka topics), not at internal class boundaries
- Never mock repositories, internal services, or domain objects
- If a test requires mocking more than the external boundary, reconsider the test's abstraction level

**For each untested behavior, create tests for:**
- Happy path: Valid input produces expected output
- Validation: Invalid input is rejected with appropriate error
- Dependency failure: Downstream errors are handled gracefully
- Edge cases: Empty data, boundary values, unusual but valid inputs

**Test quality:**
- One behavior per test method
- Descriptive names: see conventions in AGENTS.md and/or CLAUDE.md, if present
- Independent tests with proper state reset
- Use project conventions (test base classes, test utilities, etc.)

## Workflow

For each untested behavior:

1. Use the `read` tool to inspect the entry point code and trace the flow to understand the intended behavior
2. Determine the expected observable outcome for the scenario
3. Write the test: call the entry point, assert on the output
4. Run the new tests to verify they execute correctly
5. If tests fail, evaluate: is the test wrong or is the code buggy?
6. Document any discovered bugs in the report

## Test Deduplication

After writing all tests, deduplicate to avoid redundant coverage:

**Rules:**
1. A unit test MAY be logically contained in an integration test - this is acceptable and not considered duplication
2. Two tests at the SAME abstraction level (both unit tests, or both integration tests) MUST NOT be equivalent to each other
3. When removing duplicates, prioritize deleting NEWLY written tests over existing tests

**Process:**
1. Compare all new tests against existing tests at the same abstraction level
2. Identify tests that verify the exact same behavior with equivalent inputs
3. Remove the newly written duplicate, keeping the pre-existing test
4. Document removed duplicates in the report

## Parametrized Tests

After deduplication, evaluate opportunities for parametrized tests:

**When to parametrize:**
- Multiple tests that differ only in input values and expected outputs
- Tests verifying the same behavior across different valid/invalid inputs

**When NOT to parametrize:**
- Tests with fundamentally different setup or assertions
- Tests that would lose readability when combined
- Tests where failure diagnosis would become unclear

**Process:**
1. Identify test groups that follow the same pattern with varying data
2. Refactor into parametrized tests using the project's test framework conventions
3. Ensure parametrized test names clearly describe each case
4. Verify all original test scenarios are preserved after refactoring

## Output

```markdown
# Test Coverage Report: [Project Name]

## Summary
[X test files created, Y test methods added, Z bugs discovered]

## Tests Created

### [Entry Point / Behavior Area]
- **Test file**: `path/to/TestClass`
- **Behaviors tested**:
  | Scenario | Test Method | Type | Notes |
  |----------|-------------|------|-------|
  | Valid request returns 200 with result | shouldReturn200WhenRequestIsValid | Integration | |
  | Missing field returns 400 | shouldReturn400WhenFieldIsMissing | Integration | |
  | Downstream timeout returns 503 | shouldReturn503WhenDownstreamTimesOut | Integration | |

### [Next entry point...]

## Bugs Discovered
Tests that fail due to buggy production code (not test errors):

| Test | Expected Behavior | Actual Behavior |
|------|-------------------|-----------------|
| TestClass#testMethod | Should return X | Returns Y |

## Remaining Gaps
Behaviors that still need tests but were not addressed:
- [List with reasons, e.g., "requires specific infrastructure setup"]

## Parametrization Applied
Tests refactored to use parametrization:

| Original Tests | Parametrized Test | Parameters |
|----------------|-------------------|------------|
| testValidA, testValidB, testValidC | testValidInputs | input, expectedOutput |

```

## Notes

- Prioritize business-critical entry points and user-facing behavior
- Follow existing test patterns in the project
- Integration tests extend the appropriate base class, if present
- When unsure about intended behavior, ask via `ask_user_question`
- A good test suite allows fearless refactoring: if internals change but behavior stays the same, no tests should break
