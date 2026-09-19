# Contributing to E.R.I.C.A.

## Workflow

- No direct pushes to `master`. Work on a feature branch, open a PR, merge
  from there. This isn't process for its own sake — the repo's first two
  commits landed straight on `master` from two different people within
  twenty minutes of each other and one overwrote the other's changes. A PR
  gives both of us a diff to look at before it lands.
- Branch naming: `phase-N/short-description` (e.g. `phase-1/contacts-crud`)
  or `fix/short-description` for bugs.
- Keep PRs scoped to one roadmap item where possible — see `docs/ROADMAP.md`.

## Roadmap

`docs/ROADMAP.md` is the sequencing — phase by phase, each with a concrete
"done when" line. Check there before starting work so effort doesn't
duplicate or jump ahead of a phase's prerequisites.

## Ground rules carried over from the concept paper

- **Clean-room only.** No code from `dhilipmpms/SOS-alerter` or any other
  GPL-licensed project gets copied in, ever — that repo is a design
  reference, not a source. See the README for why.
- **Privacy-first stays non-negotiable.** No analytics, no ad SDKs, no
  third-party data collection. Everything stays on-device unless a phase
  explicitly says otherwise (e.g. Phase 7's dispatch abstraction, which is
  opt-in and institutional, not consumer tracking).
- **Nothing on the emergency path blocks the main thread.** Network calls,
  DB writes, file I/O — background thread, always. This was a real bug in
  the reference project.
