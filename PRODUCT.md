# Product

<!-- impeccable:product-schema 1 -->

## Platform

terminal

## Users

The primary user is the owner of this Pi setup, working in trusted local
repositories from a terminal. The setup also supports Claude and Codex
subagents that run as local host processes.

## Product purpose

This repository turns Pi into an opinionated personal coding environment. It
keeps the interface, model access, research tools, agent workflows, project
memory, browser automation, and usage reporting in one reproducible setup.
Success means the information and actions needed during a coding session are
available without leaving Pi or adding avoidable friction to the terminal.

## Positioning

The product is a checked-in, owner-operated Pi configuration rather than a
general extension collection. Its extensions share one operating model and
are tuned together for the owner's preferred workflow.

## Operating context

The setup runs inside Pi's terminal UI and trusted local repositories. The
owner uses Bash, Hound for unauthenticated research, a persistent browser
profile for authenticated sites, background terminals for long-running work,
and local Claude or Codex processes for delegated tasks. Pi reloads extension
changes with `/reload` or a restart.

## Capabilities and constraints

- The Oxocarbon theme is the default, with other checked-in themes available.
- The interface must remain useful at narrow terminal widths and must respect
  Pi theme roles instead of hard-coded colors.
- Status information must be readable without relying on color alone.
- Interface extensions must avoid moving the editor as asynchronous state
  changes.
- Project-local extensions prompt for trust by default.
- Claude and Codex subagents have normal host permissions and must run only in
  trusted directories.
- Credentials and machine-local runtime state must remain outside version
  control.
- The DeepSeek pricing widget uses fixed Beijing-time pricing windows and shows
  the next transition in local time. It starts automatically and can be
  toggled with `/ds-peak`.

## Brand commitments

The product name is "My Pi setup." Its voice is direct, technical, and
personal. The configuration is intentionally opinionated. Pi's theme system
is the source of truth for color, and Oxocarbon is the incumbent visual
reference.

## Evidence on hand

- [`README.md`](README.md) describes the setup, its repository map, and its
  safety model.
- [`assets/pi-setup.jpeg`](assets/pi-setup.jpeg) shows the current interface.
- [`themes/`](themes/) contains the supported theme definitions.
- [`extensions/`](extensions/) contains the interface and workflow behavior.
- No testimonials, external benchmarks, or public adoption claims are
  available and future work must not invent them.

## Product principles

- Keep the coding session in flow by placing relevant state and actions inside
  Pi.
- Prefer a coherent owner workflow over broad configurability.
- Preserve terminal space and keep dense status information easy to scan.
- Treat trust, credentials, and local process permissions as visible product
  constraints.
- Keep the setup reproducible from checked-in configuration while excluding
  private runtime state.

## Accessibility and inclusion

Every status must use text, position, or shape as well as color. Terminal UI
must remain legible across supported themes and narrow layouts.
