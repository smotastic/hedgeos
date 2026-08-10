# HedgeOS agent guidance

## Agent skills

### Issue tracker

HedgeOS work is tracked in GitHub Issues. Wayfinder maps are parent issues
labelled `wayfinder:map`; decision tickets are child issues labelled
`wayfinder:research`, `wayfinder:grilling`, `wayfinder:prototype`, or
`wayfinder:task`. See `docs/agents/issue-tracker.md` for commands and
Wayfinding operations.

### Domain docs

Before exploring or changing product behavior, read `CONTEXT.md`,
`docs/project-principles.md`, and the relevant ADRs under
`docs/architecture/adr/`. See `docs/agents/domain.md` for the consumer rules.

## Working rules

- Use `/wayfinder` for multi-session work whose destination is known but whose
  route is uncertain.
- Keep Wayfinder work focused on decisions; do not implement product code while
  the map is open.
- After the map clears, use `/to-spec`, `/to-tickets`, and then `/implement`.
- Refer to Wayfinder maps and tickets by their full names, not bare issue numbers.
