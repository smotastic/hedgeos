# Issue tracker: GitHub

Issues and specifications for this repository live in GitHub Issues. Use the
`gh` CLI for tracker operations from the repository root.

## General operations

```bash
gh issue create --title "..." --body-file body.md
gh issue view <number> --comments
gh issue list --state open --json number,title,body,labels
 gh issue comment <number> --body "..."
gh issue edit <number> --add-label "..."
gh issue close <number> --comment "..."
```

## Wayfinding operations

The map is a single parent issue labelled `wayfinder:map`. Its decision tickets
are child issues labelled with one of:

- `wayfinder:research`
- `wayfinder:prototype`
- `wayfinder:grilling`
- `wayfinder:task`

Create the parent and child issues first, then link children through GitHub's
sub-issue endpoint:

```bash
gh api --method POST repos/OWNER/REPO/issues/PARENT/sub_issues \\
  -F sub_issue_id=CHILD_DATABASE_ID
```

Use native GitHub issue dependencies for blocking edges. The dependency API
requires the blocker's database ID, not its issue number:

```bash
gh api --method POST \\
  repos/OWNER/REPO/issues/CHILD/dependencies/blocked_by \\
  -F issue_id=BLOCKER_DATABASE_ID
```

The frontier is the set of open, unassigned child issues with no open blocking
dependencies. Claim a ticket before doing work:

```bash
gh issue edit TICKET --add-assignee @me
```

Resolve a ticket by posting the decision as a comment, closing the issue, and
adding one linked summary line to the map's `Decisions so far` section. Keep
future work outside the current map as separate issues labelled `future`; do
not make it a child ticket of the current map.

## Pull requests

PRs are not a triage surface for this repository.
