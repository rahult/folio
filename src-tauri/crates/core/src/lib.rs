//! Everything Folio does that needs no window: the review gate, the
//! command-line arguments, the companion file formats (Feedback, Analysis,
//! Revisions), the lens folder, and the embedded agent skill. Used by the
//! app and by the `folio` command (ADR 0001, ADR 0002).

pub mod analysis;
pub mod archive;
pub mod cliargs;
pub mod feedback;
pub mod gate;
pub mod lenses;
pub mod skill;
