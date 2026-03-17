# Product Spec

## Product Definition

Polaris is a designer-first website composer for landing pages.

It is not a generic AI page generator and not a raw design-to-code converter.
It is a collaborative system where a designer and agents edit a page across
multiple layers, then render a real website from the stacked result.

## Design Principles

- `designer-first`: the canvas and composition model lead the workflow
- `system-first`: copy, story, type, style, assets, and motion are editable systems
- `agent-native`: agents operate on semantic structures, not only pixels
- `runtime-aware`: every decision can be previewed in a real web runtime
- `remix-friendly`: websites and Figma frames can be captured into editable structure
- `landing-page-focused`: narrow scope before broader product ambitions

## Primary User

Creative technologists, designers, and founders iterating on marketing and
launch pages who need faster story, style, and remix loops than code-only or
design-only workflows allow.

## Product Jobs To Be Done

- turn an existing site or reference into editable sections
- edit actual page copy independently from layout and visual treatment
- improve storytelling across the full page
- manipulate text globally through semantic text roles
- remix visual systems from references without losing structure
- swap assets with better composition and narrative alignment
- choreograph motion at the section and page level
- preview and export a real Next.js page

## Core Objects

### Project

A container for pages, themes, assets, remix sources, and registry bindings.

### Page

An ordered landing page composed of `SectionNode` objects.

### SectionNode

A layout-aware block in the structure tree.

Examples:

- `hero`
- `logo-strip`
- `proof-grid`
- `feature-stack`
- `testimonial`
- `cta`

### Slot

An editable content or media region inside a section.

Examples:

- `headline`
- `subcopy`
- `primary-cta`
- `proof-stat`
- `hero-image`

### SemanticTextRole

A reusable system-level text type.

Examples:

- `hero_headline`
- `hero_subcopy`
- `section_claim`
- `proof_stat`
- `testimonial_quote`
- `cta_label`

### Theme

The visual rules for a page, including color tokens, type scale, spacing,
radius, density, and section modes.

### AssetRef

A reference to an image, video, logo, or illustration with crop, focal point,
source provenance, and usage metadata.

### MotionPreset

A declarative behavior definition, such as reveal, stagger, sticky, hover, or
parallax.

### RegistryComponent

A mapping from an abstract section or slot to a real React implementation.

### RemixSource

A captured website, Figma frame, or reference board that can be mined for
structure, style, or assets.

## Layer System

### Structure Layer

Owns:

- section order
- component hierarchy
- slot definitions
- layout relationships

### Copy Layer

Owns:

- actual slot content
- button labels
- list items
- rich text blocks
- content variants

### Story Layer

Owns:

- page narrative arc
- audience framing
- section intent
- proof sequence
- CTA progression

### Type System Layer

Owns:

- semantic text roles
- tone rules
- rewrite constraints
- compression rules
- mobile copy density rules

### Style System Layer

Owns:

- theme tokens
- type scale
- spacing scale
- visual texture rules
- section visual modes

### Assets Layer

Owns:

- media library
- source provenance
- crop and focal metadata
- per-slot asset bindings

### Remix Layer

Owns:

- imported website references
- imported Figma references
- derived section patterns
- "inspired by" mappings

### Motion Layer

Owns:

- behavior presets
- section choreography
- page-level scroll logic

### Registry Layer

Owns:

- component bindings
- prop mappings
- render rules

## Agent Roles

### Story Agent

Improves persuasion, sequencing, CTA logic, and narrative density.

### Type Agent

Applies text changes by semantic role across the page or project.

### Remix Agent

Ingests a website or Figma frame, segments it into editable structure, and
proposes reusable patterns.

### Asset Agent

Sources assets from Figma, local libraries, or references and proposes
replacements that preserve composition.

### Style Agent

Applies system-level visual changes across tokens and section modes.

### Motion Agent

Applies motion primitives and checks choreography consistency.

### QA Agent

Checks hierarchy, consistency, responsiveness, readability, and implementation
drift.

## Core Workflows

### Remix Import

1. User pastes a URL or Figma link
2. System captures it into a `RemixSource`
3. Segmentation proposes a `Structure` tree
4. Copy extraction populates the `Copy` layer
5. Style extraction proposes a `Theme`
6. Slots and text roles are inferred
6. Designer edits the result on canvas

### System Rewrite

1. User selects a semantic text role or page section
2. Story or Type Agent proposes rewrites
3. Changes are applied to the Copy, Story, or Type System layer
4. Preview updates without manual box edits

### Asset Pass

1. User selects a slot or section
2. Asset Agent proposes sourced or inspired variants
3. Composition metadata is preserved
4. Preview updates while keeping structure intact

### Motion Pass

1. User selects page-level or section-level choreography
2. Motion Agent proposes declarative behavior presets
3. Runtime preview reflects actual movement

## Non-Goals For V0

- full app design tooling
- arbitrary freeform code as the primary editing mode
- multi-page CMS architecture
- perfect fidelity import of every website
- generic Figma replacement

## V0 Success Criteria

- one landing page can be imported and segmented into editable sections
- copy exists as an explicit layer with stable slot bindings
- copy can be rewritten globally by semantic text role
- style can be changed globally via theme tokens
- assets can be swapped without destroying composition
- motion presets can be applied to sections
- the result renders live in a Next.js preview
