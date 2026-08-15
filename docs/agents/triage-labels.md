# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.

## Current state in this repo

All five labels exist on `farandclose/markwise` as of 2026-08-15. `wontfix` predates this setup; the other four were created with:

```
gh label create needs-triage    --description "Maintainer needs to evaluate this issue"  --color FBCA04
gh label create needs-info      --description "Waiting on reporter for more information" --color D4C5F9
gh label create ready-for-agent --description "Fully specified, ready for an AFK agent"  --color 5319E7
gh label create ready-for-human --description "Requires human implementation"            --color 1D76DB
```

These sit alongside the repo's existing `bug` / `enhancement` / `documentation` / `cli-feedback` labels, which describe *what* an issue is. The triage labels describe *what happens next*, so the two sets are complementary and an issue normally carries one of each.
