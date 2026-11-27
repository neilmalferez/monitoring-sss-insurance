---
name: implementation-planner
description: Always inspect the relevant codebase and generate a detailed, Google Antigravity-style implementation plan (Goal Description, User Review Required, Open Questions, file-tagged Proposed Changes, Verification Plan, and Confirm to Proceed) for review before editing files, generating final code, or executing multi-step technical workflows.
---

# Implementation Planner

This skill ensures that you always inspect the relevant codebase first and present a structured, review-ready Implementation Plan—matching the depth and layout of Google Antigravity's `/plan` artifact—before modifying files, generating final code, or running mutating commands.

## When to Use

- When the user asks to build a new feature, application, or system.
- When the user requests a bug fix, refactor, or multi-step technical change across one or more files.
- When the user explicitly requests an implementation plan.

## Steps

1. **Inspect Before Planning**: Read the relevant files, symbols, routes, schemas, and dependencies first so every proposed change references real file paths, functions, components, and data flows rather than guesses.
2. **Draft the Implementation Plan**: Present the plan using this exact structure:

```markdown
# Implementation Plan: <Clear Descriptive Title>

## Goal Description
Concise summary or numbered list of core objectives, naming the specific screens, modules, endpoints, or data fields involved.

## User Review Required
> [!IMPORTANT]
> Highlight breaking changes, architectural trade-offs, database/schema impacts, security considerations, or workflow shifts the user must notice before approving. *(Omit this section only if there are genuinely none.)*

## Open Questions
> [!NOTE]
> List any ambiguous requirements or design decisions that need user input, and explicitly state the default assumption reflected in the plan below. *(Omit this section only if there are genuinely none.)*

## Proposed Changes

Group changes by logical component, layer, or workstream. Add a short data-flow summary or compact Mermaid flowchart when a change spans multiple layers (e.g., UI -> API/Controller -> Database).

### 1. <Component / Area Feature Name>

#### [NEW] path/to/new-file.ext
- Purpose of the new file and key functions, components, props, or exports to introduce.

#### [MODIFY] path/to/existing-file.ext
- Specific functions, hooks, routes, CSS classes, queries, validation rules, or error guards to add, update, or remove.

#### [DELETE] path/to/deprecated-file.ext
- Reason for removal and any references/imports that will be cleaned up.

## Verification Plan

### Automated Tests
- Exact lint, build, typecheck, or test commands to run (e.g., `npm test`, `php artisan test`).
- Numbered list of concrete behaviors or edge cases to assert.

### Manual Verification
1. Step-by-step walkthrough the user can follow to verify end-to-end behavior in the UI or CLI.
2. Specific edge cases and error states to confirm.

## Confirm to Proceed
- Restate any open decision(s) if applicable.
- Ask explicitly: "Do you approve this plan so I can proceed with the implementation?"
```

3. **Stop and Ask for Review**: Present the plan and wait for explicit approval. Do not write final implementation code, modify workspace files, or execute mutating commands until the user confirms.
4. **Execute Upon Approval**: Once approved (and any open questions are resolved), implement the changes following the agreed plan and execute the Verification Plan.

## Gotchas

- Never dump full implementation code in the same response as the plan; keep changes detailed at the file, symbol, and logic level so the plan stays scannable.
- Always use explicit `[NEW]`, `[MODIFY]`, and `[DELETE]` tags on every file entry under `Proposed Changes`.
- Omit `User Review Required` or `Open Questions` only when there are genuinely no breaking changes, risks, or ambiguities.
- Keep verification steps practical and tied directly to the requested changes—avoid generic or unrelated checklist items.