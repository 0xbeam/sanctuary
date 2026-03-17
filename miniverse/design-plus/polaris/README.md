# Polaris

Designer-first landing page composer built on top of OpenPencil.

The product goal is simple:

- import a website, Figma frame, or blank structure
- edit the page as stacked layers instead of one frozen artifact
- let agents operate on story, type systems, assets, style, remix, and motion
- render the final result into a real Next.js site

## Why This Exists

One-shot page generation is not enough for serious landing page work.

Designers need to be able to:

- rearrange sections without losing story
- rewrite copy systemically instead of box by box
- swap assets while preserving layout intent
- remix references from existing sites and Figma
- apply global type and theme changes across the page
- preview the real runtime, not only a static mock

## Product Thesis

The source of truth is a layered page model, not the generated codebase.

Core editable layers:

- `structure`
- `copy`
- `story`
- `type-system`
- `style-system`
- `assets`
- `remix`
- `motion`
- `registry`

The `codebase` is the render target produced from those layers.

## Workspace Layout

`apps/editor`

- OpenPencil-powered editing surface and custom panels

`apps/preview`

- Next.js runtime preview that renders the stacked layers

`packages/compiler`

- normalizes layers into a renderable page model

`packages/layer-store`

- versioned JSON documents for layers

`packages/registry`

- component registry and implementation bindings

`schemas`

- machine-readable JSON schemas for the core layer documents

`examples`

- canonical sample project documents that show how the layers stack together

`projects`

- live Polaris projects split into actual layer files and loaded by the studio

`docs`

- product spec, execution plan, and integration strategy

## Key Documents

- [docs/PRODUCT_SPEC.md](./docs/PRODUCT_SPEC.md)
- [docs/EXECUTION_PLAN.md](./docs/EXECUTION_PLAN.md)
- [docs/OPENPENCIL_STRATEGY.md](./docs/OPENPENCIL_STRATEGY.md)

## Current Decision

We are not doing a deep fork of OpenPencil on day one.

We are building a sidecar product on top of it first:

- OpenPencil owns the canvas, scene graph, collaboration, and programmable edit surface
- Polaris owns the higher-order website model and live page compiler
