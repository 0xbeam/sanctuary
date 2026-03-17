# Execution Plan

## Strategic Choice

Start as a sidecar product on top of OpenPencil.

Do not deep-fork the editor until the product model is validated.

## Phase 0: Feasibility Spike

Goal: prove the layer model can drive a real page preview.

Deliverables:

- local OpenPencil integration strategy
- stable section and slot identity model
- minimal layer documents
- tiny compiler that merges `structure`, `copy`, `story`, `style`, and `assets`
- live preview of one page in Next.js

Exit criteria:

- one imported or hand-authored page renders from layers
- one section can be moved without losing copy bindings
- one semantic text role can be rewritten globally

## Phase 1: Composer MVP

Goal: make the workflow usable for one-page landing sites.

Deliverables:

- section tree editing
- slot-aware copy panel
- semantic text role editing
- theme token editing
- asset binding panel
- section-level motion presets
- import from website
- import from Figma

Exit criteria:

- a designer can remix a site into an editable draft
- a designer can rewrite and restyle the page systemically
- preview reflects the real runtime, not a static export

## Phase 2: Agent Workflows

Goal: make the product feel qualitatively better than normal page builders.

Deliverables:

- story agent
- type agent
- remix agent
- asset sourcing from Figma and references
- QA agent

Exit criteria:

- copy editing is meaningfully faster than manual edits
- imported references can become coherent page systems
- agents operate on the page model, not only raw visuals

## Phase 3: Production Hardening

Goal: make the output reliable enough for repeated project use.

Deliverables:

- registry-driven clean code export
- motion runtime hardening
- responsive rules
- better diffing and version control for layers
- better team collaboration flows

## First Two Weeks

### Week 1

- finalize layer schema set
- decide OpenPencil integration approach
- build normalized page graph in the compiler
- render one static page from layer data

### Week 2

- add semantic text roles
- add theme token overrides
- add asset bindings
- add one website import path
- prove global rewrite and live preview loop

## Engineering Boundaries

- support `Next.js` only in the first renderer
- support `landing pages` only in v0
- support `declarative motion presets` before custom script
- keep `generated code` downstream from the layer source of truth

## Open Questions

- should structure live inside OpenPencil documents or a parallel JSON graph
- what identity strategy best survives remix import and section duplication
- how much of style extraction should be automatic in v0
- whether motion should compile to Framer Motion, CSS, GSAP, or a small runtime
