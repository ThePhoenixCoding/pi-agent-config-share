---
name: sonar-report
description: Generate a SonarQube quality report.
disable-model-invocation: true
---

Generate a SonarQube quality report for the current project.

## Steps

1. **Find project key** from `sonar-project.properties`, `pom.xml` (`<sonar.projectKey>` or `<groupId>:<artifactId>`), or `package.json`. If not found, search SonarQube projects or ask user.

2. **Fetch data** using SonarQube MCP tools:
   - Quality gate status via `get_project_quality_gate_status`
   - Metrics via `get_component_measures`: coverage, branch_coverage, bugs, vulnerabilities, code_smells, duplicated_lines_density, ncloc, complexity, cognitive_complexity, reliability_rating, security_rating, sqale_rating
   - Issues via `search_sonar_issues_in_projects` (BLOCKER and HIGH severity, limit 20)

3. **Generate report**:

```markdown
# SonarQube Report: [Project Name]

## Quality Gate: [PASSED/FAILED]
[List failing conditions if any]

## Metrics Summary
| Metric | Value | Rating |
|--------|-------|--------|
| Coverage | X% | |
| Bugs | X | |
| Vulnerabilities | X | |
| Code Smells | X | |
| Duplication | X% | |
| Lines of Code | X | |

## Ratings
- Reliability: [A-E]
- Security: [A-E]
- Maintainability: [A-E]

## Critical Issues (BLOCKER/HIGH)
[Top issues with file paths and descriptions]

## Recommendations
[Actionable next steps, prioritized by impact]
```

## Notes
- If project not found, suggest running `mvn sonar:sonar` or equivalent
- Focus on actionable insights over raw data
