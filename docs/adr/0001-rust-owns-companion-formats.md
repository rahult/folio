---
status: accepted
---

# Rust owns the format of companion files written by more than one producer

The Analysis (`<doc>.analysis.md`) is appended to by the app when a Model
runs a Lens and by the `folio lens append` command when an Agent produces a
Reading. Two writers in two languages would drift. The append lives in Rust
as a command the app invokes, and TypeScript keeps only the parser it needs
to render; the same rule applies to any future Companion with a second
writer.

## Considered options

- Append in both TypeScript and Rust with a round-trip test that they agree.
  Rejected: the test catches drift after it happens, and every format change
  is two changes.
- Have the CLI write a request file for the running app to act on. Rejected:
  a Reading could only be produced while Folio is open.
