---
description: Review the conversation for major decisions or learnings and update CLAUDE.md files — with your approval before any change is made
---

You are maintaining the Telematics Guardian project context files so every future conversation starts with accurate, current understanding.

## Step 1 — Scan the conversation

Look for things that belong permanently in the docs:
- Architecture or schema decisions (especially reversals of what the docs currently say)
- Business rule clarifications ("clients never self-register", "one user → one principal")
- New features or pages that are now built
- Things explicitly marked as pending that are now decided
- Corrections to wrong assumptions in CLAUDE.md

Skip anything ephemeral: debugging sessions, temporary errors, "let's discuss" threads that didn't land on a decision.

## Step 2 — Map each learning to a file

- `/Users/iasheyam/codes/oneGuardian/CLAUDE.md` — web dashboard, backend, DB schema, trigger engine, SSE, API
- `/Users/iasheyam/codes/TelematicsGuardian/mobile-client-react-native/CLAUDE.md` — mobile app, tracking pipeline from the phone side, access model, Expo/EAS, features
- `/Users/iasheyam/codes/oneGuardian/docs/api.md` — API reference. Update when endpoints are added, changed, or removed. Move planned endpoints from the "Planned" section to their real section once built.

Some learnings apply to both CLAUDE.md files.

## Step 3 — Draft the exact changes

For each file, write:
- What line/section currently says (if it's a correction)
- What it should say instead (or what needs to be added / removed)

Be precise. "Add under DB schema → principals:" followed by the exact text is more useful than "update the principals section."

Prefer updating existing text over appending. Keep files concise — a clean replacement is better than growing the file with addenda.

## Step 4 — Present the changes and ask for consent

Show the user a numbered list:
```
1. [CLAUDE.md — web dashboard]
   Section: DB schema → principals
   Change: Remove "Multiple principals per user is valid and intentional."
   Add: "userId is UNIQUE — one user can only be linked to one principal. Enforced at DB level."

2. [mobile CLAUDE.md]
   ...
```

Then use AskUserQuestion to ask:
- "Apply all changes?" (Yes / Let me review each one / No, skip)

If they choose "Let me review each one," go through them one by one with a Yes/Skip per change.

## Step 5 — Apply approved changes

Edit the files. Confirm briefly: "Updated 2 sections across both CLAUDE.md files."

Also check if any of these decisions should be saved as a memory entry in `/Users/iasheyam/.claude/projects/-Users-iasheyam-codes-oneGuardian/memory/`. If yes, update memory too (same consent flow applies).
