---
name: My Pi setup
description: A quiet terminal control system with precise, high-signal color.
colors:
  signal-magenta: "#ee5396"
  signal-magenta-highlight: "#ff7eb6"
  carbon-black: "#161616"
  raised-carbon: "#262626"
  selected-graphite: "#393939"
  structure-gray: "#525252"
  quiet-gray: "#8d8d8d"
  secondary-text: "#a8a8a8"
  primary-text: "#f2f4f8"
  diagnostic-cyan: "#3ddbd9"
  alarm-coral: "#ff8389"
typography:
  display:
    fontFamily: monospace
    fontWeight: 700
    lineHeight: 1
  title:
    fontFamily: monospace
    fontWeight: 700
    lineHeight: 1
  body:
    fontFamily: monospace
    fontWeight: 400
    lineHeight: 1
spacing:
  cell: "1ch"
  row: "1lh"
  inset: "2ch"
components:
  terminal-masthead:
    textColor: "{colors.signal-magenta}"
    typography: "{typography.title}"
    padding: "0 2ch"
  terminal-panel:
    backgroundColor: "{colors.raised-carbon}"
    textColor: "{colors.primary-text}"
    typography: "{typography.body}"
    padding: "1lh 2ch"
  selected-row:
    backgroundColor: "{colors.selected-graphite}"
    textColor: "{colors.primary-text}"
    typography: "{typography.body}"
    padding: "0 1ch"
  status-active:
    textColor: "{colors.signal-magenta}"
    typography: "{typography.title}"
  status-error:
    textColor: "{colors.alarm-coral}"
    typography: "{typography.title}"
  status-diagnostic:
    textColor: "{colors.diagnostic-cyan}"
    typography: "{typography.body}"
---

# Design System: My Pi setup

## Overview

**Creative North Star: "The Signal Console"**

The Signal Console is a quiet, cinematic terminal system. Most of the screen
recedes into carbon and cool gray so the few active signals can carry real
meaning. It favors breathing room, exact alignment, and stable information
over dashboard density.

Precision comes from the terminal cell itself. Weight, contrast, box-drawn
structure, and short labels create hierarchy without pretending the terminal
is a desktop app. Color is operational. It identifies focus, state, and risk;
it does not fill empty space.

**Key Characteristics:**

- A carbon field with tonal structure instead of shadow.
- Signal Magenta reserved for action, focus, and important warnings.
- Monospace hierarchy built from weight, contrast, and alignment.
- Responsive density that removes secondary detail before changing height.

## Colors

The palette is cold carbon lit by rare electrical signals.

### Primary

- **Signal Magenta:** Marks the current action, selected control, branded
  masthead moments, and warning states that need attention.
- **Signal Magenta Highlight:** Appears only inside the masthead gradient and
  closely related active-state transitions.

### Secondary

- **Diagnostic Cyan:** Separates diagnostic or system-level information from
  actions. It is a rare counterpoint to Signal Magenta.

### Tertiary

- **Alarm Coral:** Names failures, destructive outcomes, and states that need
  recovery.

### Neutral

- **Carbon Black:** The default terminal canvas.
- **Raised Carbon:** Groups messages and panels without adding a shadow.
- **Selected Graphite:** Marks the active row across its full width.
- **Structure Gray:** Draws borders and dividers that should remain present but
  quiet.
- **Quiet Gray:** Handles tertiary copy, inactive state, and low-priority
  structure.
- **Secondary Text:** Carries metadata and supporting telemetry.
- **Primary Text:** Carries commands, titles, paths, and content that must read
  first.

**The Signal Rarity Rule.** Signal Magenta marks something active, actionable,
or urgent. Never spend it on a whole pane or a decorative border.

**The Color Is Not Meaning Rule.** Every semantic color needs a word, glyph,
shape, or stable position that communicates the same state.

## Typography

The interface inherits the user's terminal monospace. It does not impose a
font family or simulate a proportional display face.

**Character:** Quiet and exact. Hierarchy comes from weight and contrast, not
from a stack of unrelated sizes.

### Hierarchy

- **Display:** Bold block-drawn glyphs reserved for the session masthead.
- **Title:** Bold terminal text for pane names, active tools, and current
  status.
- **Body:** Regular terminal text for commands, output, paths, and explanations.
- **Label:** Short regular or bold text placed next to a semantic glyph. Case
  follows the underlying term rather than a global uppercase rule.

**The One-Cell Rule.** Align text to terminal cells and keep labels short enough
to scan without backtracking.

## Layout

The terminal cell is the grid. Horizontal rhythm advances in one-character
steps, while vertical rhythm advances in complete rows. Major panes use two
columns when the width supports them. The left column owns identity and the
right column owns metadata.

Permanent status stays shallow. The footer remains two rows, and one-line
widgets collapse their secondary timeline or metadata before truncating the
primary state. Overlays use box-drawn boundaries and internal breathing room;
they do not resize the editor underneath.

**The Stable Editor Rule.** Asynchronous state must not move the editor. Remove
secondary detail before adding a row.

## Elevation & Depth

The system has no shadows. Depth comes from tonal layering, full-row selection
fills, and box-drawn boundaries. Most content stays directly on Carbon Black;
Raised Carbon is reserved for a real grouping or temporary layer.

**The No Shadow Rule.** Use contrast and containment to show depth. A terminal
shadow is noise unless the host terminal draws the window itself.

## Shapes

The form language follows the character grid. Rules are one cell thick, rows
are rectangular, and selected states fill a complete row. Boxed panes may use
the rounded box-drawing corners already present in the interface, but they do
not imitate cards or pills.

## Components

### Session masthead

The masthead establishes identity, then gets out of the way. Its block-drawn
`pi` mark may use the Signal Magenta gradient. The session name and mode use
Primary Text and Quiet Gray.

### Editor frame

The editor uses two thin horizontal rules around the input area. The active
rule takes the current semantic or accent color. The cursor remains the
brightest local element.

### Status rows

Status rows lead with a semantic glyph, then a bold name or state, followed by
dim metadata separated with `·`. Timelines use density as well as color, and
they disappear before the status copy on narrow terminals.

### Selection rows and panes

List selections use a full-width Selected Graphite fill plus an accent marker.
Pane edges use Structure Gray at rest and the accent border role only for the
active pane. Empty and unavailable states use short Quiet Gray sentences.

### Action hints

Action hints show the key in Signal Magenta and the action in Quiet Gray.
Separate actions with a dim middle dot. Keep the strip to one row.

### Run recap

The recap uses Raised Carbon, a compact Signal Magenta marker, and a bright
label. Supporting source text stays dim. The next action is the strongest line
inside the recap.

## Do's and Don'ts

### Do:

- Do use Pi theme roles so every surface works across checked-in themes.
- Do preserve primary state at narrow widths and remove optional metadata
  first.
- Do pair semantic color with text, glyph density, or position.
- Do leave empty carbon around important information when the terminal has
  room.

### Don't:

- Don't hard-code a new color when an existing semantic role expresses the
  state.
- Don't turn every row into a bordered container.
- Don't use Signal Magenta as ambient decoration.
- Don't add asynchronous rows that move the editor.
- Don't imitate web cards, pills, gradients, or shadows inside the TUI.
