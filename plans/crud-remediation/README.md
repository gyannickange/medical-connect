# CRUD Remediation — AI Execution Runbook

This directory converts `CRUD_AUDIT_REPORT.md` into an ordered implementation queue. It is written for an AI coding agent to execute one task at a time, with a test-first checkpoint and an explicit handoff after every task.

## Mandatory execution rules

1. Execute tasks in numeric order. Do not start a task until all dependencies and the previous task's completion gate are satisfied.
2. At the start of every task, run `git status --short`. Preserve unrelated and pre-existing changes. Never reset or overwrite them.
3. Read every file listed in the task before editing it. Search for existing helpers and tests before introducing new abstractions.
4. Add the task's tests first and confirm that at least one new test fails for the expected reason. A test that passes before the implementation does not prove the change.
5. Make the smallest implementation that satisfies the tests and acceptance criteria. Do not bundle optional refactors.
6. Run the task-specific commands from the stated working directory. Do not mark a task complete with failed, skipped, or `.only` tests.
7. Record evidence in the task's `Execution record`: changed files, commands, results, and any deviations.
8. Stop and request a product decision only where a task explicitly names a decision gate. Continue through discoverable technical questions without asking.
9. After a task is green, inspect the diff for secrets, debug logging, generated artifacts, accidental formatting churn, and unrelated edits.
10. Do not commit or push unless the user separately requests it.

## Task order

| Order | Task | Depends on | Completion signal |
|---:|---|---|---|
| 00 | [Baseline and contract harness](TASK-00-baseline-and-contracts.md) | None | Existing suites recorded; HTTP and transaction contracts covered |
| 01 | [DTO boundary validation](TASK-01-dto-boundary-validation.md) | 00 | Product, stock, customer, and sale DTO tests green |
| 02 | [Pricing integrity and tenant isolation](TASK-02-pricing-integrity.md) | 01 | No `any` pricing bodies; pricing invariants and ownership tested |
| 03 | [Sales and stock atomicity](TASK-03-sales-stock-atomicity.md) | 01, 02 | Server totals and concurrent stock protection tested |
| 04 | [Database uniqueness and conflict responses](TASK-04-unique-constraints.md) | 00 | Tenant-scoped constraints migrated; duplicate races return `409` |
| 05 | [Offline operation queue](TASK-05-offline-operation-queue.md) | 00 | CRUD operations replay in order and idempotently |
| 06 | [Offline deletes in entity pages](TASK-06-offline-delete-integration.md) | 05 | All scoped deletes queue safely and update local UI |
| 07 | [Frontend errors, localization, and cleanup](TASK-07-frontend-error-handling.md) | 01, 02, 06 | CRUD mutations share parsed, localized error handling |
| 08 | [E2E UI findings](TASK-08-e2e-ui-findings.md) | 00 | Sales route decision implemented; empty and connecting states tested |
| 09 | [Full regression and audit reconciliation](TASK-09-final-regression.md) | 01–08 | Full suite green and audit statuses updated with evidence |

## Standard verification commands

Run backend commands from `backend/`:

```bash
npm run build
npm test -- --runInBand
npm run test:e2e -- --runInBand
```

Run frontend commands from `frontend/`:

```bash
npm run check
npm run build
npx playwright test
```

If a repository command is broken before task changes, document the exact baseline failure in Task 00. A task may not silently ignore a new failure.

## Shared definition of done

A task is complete only when:

- every implementation checkbox is satisfied;
- every named new test exists and passes;
- applicable pre-existing tests pass;
- build/type-check passes for the affected application;
- no new `any`, skipped test, temporary log, or unhandled response-body edge case was introduced;
- the execution record contains reproducible evidence.

## Execution record template

Copy this block into the bottom of the task being executed:

```markdown
### Execution record

- Status: not started | in progress | blocked | complete
- Changed files:
- Tests added:
- Commands run:
- Results:
- Decisions/assumptions:
- Follow-up risks:
```
