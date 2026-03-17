# OpenPencil Strategy

## Position

OpenPencil should be treated as the editor substrate, not the full product.

OpenPencil is already strong at:

- canvas editing
- layout and scene graph manipulation
- collaboration
- programmable edits via agent tooling
- design export primitives

The missing product value sits above that layer:

- semantic story editing
- type-system manipulation
- remix ingestion for websites
- structured asset sourcing
- live web runtime preview
- registry-based export

## Integration Approach

### Day One

Use OpenPencil as an external dependency or close fork.

Build custom panels and layer tooling around it rather than rewriting the core
canvas or renderer.

### Day One Ownership

Own these pieces ourselves:

- layer store
- compiler
- preview runtime
- semantic text model
- registry model
- remix ingestion pipeline

### Delay Until Proven

- deep custom editor shell
- heavy OpenPencil renderer changes
- broad divergence from upstream

## Fork Trigger

Fork deeper only if we hit one of these:

- we need custom document semantics that cannot be layered externally
- we need editor-level workflows impossible to express through extension points
- upstream product velocity breaks our roadmap repeatedly

## Preferred Architecture

- OpenPencil handles geometry and interaction
- Polaris handles semantics and runtime compilation
- Next.js handles the final page preview and export target
