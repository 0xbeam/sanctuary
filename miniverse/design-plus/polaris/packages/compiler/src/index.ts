export interface Slot {
  id: string
  name: string
  kind: string
  semanticRole?: string
  required?: boolean
}

export interface SectionLayout {
  widthMode?: "full" | "container" | "custom"
  columns?: number
  gap?: number
}

export interface SectionNode {
  id: string
  type: string
  componentKey: string
  variant?: string
  slots: Slot[]
  children?: SectionNode[]
  layout?: SectionLayout
}

export interface StorySection {
  sectionId: string
  intent: string
  message?: string
  proofType?: string
  ctaRole?: string
}

export interface TypeSystemRole {
  id: string
  name: string
  maxWords?: number
  tone?: string[]
  mobileCompression?: number
}

export interface TransformRule {
  targetRole: string
  operation: "shorten" | "sharpen" | "soften" | "compress-mobile" | "increase-conviction"
  value?: string | number | boolean
}

export interface TypeSystemLayer {
  roles: TypeSystemRole[]
  transformRules?: TransformRule[]
}

export interface CopyEntry {
  slotId: string
  value: string | string[]
}

export interface CopyLayer {
  slots: CopyEntry[]
}

export interface StoryLayer {
  audience: string
  pagePromise: string
  tone?: string[]
  ctaStrategy?: string
  sections: StorySection[]
}

export interface SectionMode {
  sectionId: string
  mode: string
}

export interface PageStyle {
  themeId: string
  sectionModes?: SectionMode[]
}

export interface AssetBinding {
  slotId: string
  assetId: string
  cropMode?: "cover" | "contain" | "fill"
}

export interface AssetRef {
  id: string
  kind: string
  src: string
  alt?: string
}

export interface AssetsLayer {
  library: AssetRef[]
  bindings: AssetBinding[]
}

export interface MotionBinding {
  targetId: string
  preset: string
  trigger?: string
  config?: Record<string, unknown>
}

export interface MotionLayer {
  bindings: MotionBinding[]
}

export interface RegistryComponent {
  key: string
  source: string
}

export interface RegistryLayer {
  components: RegistryComponent[]
}

export interface Theme {
  id: string
  name: string
  tokens: Record<string, unknown>
}

export interface ProjectEditorConfig {
  documentPath: string
}

export interface PageMapEntry {
  nodeId: string
  kind: "section" | "slot"
  sectionId: string
  slotId?: string
  componentKey?: string
  semanticRole?: string
  slotKind?: string
}

export interface PageMapDocument {
  entries: PageMapEntry[]
}

export interface PageDocument {
  id: string
  name: string
  route: string
  canvasPageName: string
  structure: SectionNode[]
  map: PageMapDocument
  copy: CopyLayer
  story: StoryLayer
  typeSystem: TypeSystemLayer
  style: PageStyle
}

export interface ProjectDocument {
  id: string
  name: string
  editor: ProjectEditorConfig
  pages: PageDocument[]
  themes: Theme[]
  assets: AssetsLayer
  registry: RegistryLayer
  motions?: MotionLayer
}

export interface GraphNodeLike {
  id: string
  type: string
  name: string
  parentId: string | null
  childIds: string[]
}

export interface StructureGraphLike {
  getNode(id: string): GraphNodeLike | undefined
  getPages(includeInternal?: boolean): GraphNodeLike[]
}

export interface NormalizedSlot {
  id: string
  name: string
  kind: string
  semanticRole?: string
  value?: string | string[]
  asset?: AssetRef
}

export interface NormalizedSection {
  id: string
  type: string
  componentKey: string
  componentSource?: string
  variant?: string
  story?: StorySection
  styleMode?: string
  motions: MotionBinding[]
  slots: NormalizedSlot[]
  children: NormalizedSection[]
}

export interface NormalizedPage {
  id: string
  name: string
  route: string
  theme?: Theme
  audience: string
  pagePromise: string
  sections: NormalizedSection[]
}

function indexById<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]))
}

function groupByTarget(items: MotionBinding[]): Map<string, MotionBinding[]> {
  const grouped = new Map<string, MotionBinding[]>()
  for (const item of items) {
    const existing = grouped.get(item.targetId) ?? []
    existing.push(item)
    grouped.set(item.targetId, existing)
  }
  return grouped
}

function inferSectionType(
  componentKey: string | undefined,
  nodeName: string | undefined,
  fallbackSection?: SectionNode
): string {
  if (fallbackSection?.type) {
    return fallbackSection.type
  }

  if (componentKey?.includes("hero")) {
    return "hero"
  }

  if (componentKey?.includes("proof")) {
    return "proof-grid"
  }

  if (componentKey?.includes("testimonial")) {
    return "testimonial"
  }

  if (componentKey?.includes("cta")) {
    return "cta"
  }

  if (nodeName?.includes("/")) {
    const [prefix] = nodeName.split("/")
    return prefix.trim().toLowerCase().replace(/\s+/g, "-")
  }

  return "section"
}

function inferSlotName(
  entry: PageMapEntry,
  node: GraphNodeLike | undefined,
  fallbackSlot?: Slot
): string {
  if (fallbackSlot?.name) {
    return fallbackSlot.name
  }

  if (node?.name) {
    return node.name
  }

  if (entry.slotId) {
    return entry.slotId
      .replace(/^slot_/, "")
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  }

  return "Slot"
}

function inferSlotKind(
  entry: PageMapEntry,
  node: GraphNodeLike | undefined,
  fallbackSlot?: Slot
): string {
  if (entry.slotKind) {
    return entry.slotKind
  }

  if (fallbackSlot?.kind) {
    return fallbackSlot.kind
  }

  if (node?.type === "TEXT") {
    return "text"
  }

  if (node?.type === "FRAME" || node?.type === "RECTANGLE") {
    return "image"
  }

  return "text"
}

function deriveSectionNode(
  graph: StructureGraphLike,
  sectionEntry: PageMapEntry,
  pageMap: PageMapDocument,
  previousSectionById: Map<string, SectionNode>
): SectionNode {
  const sectionNode = graph.getNode(sectionEntry.nodeId)
  const fallbackSection = previousSectionById.get(sectionEntry.sectionId)
  const slotEntriesByNodeId = new Map(
    pageMap.entries
      .filter((entry) => entry.kind === "slot" && entry.sectionId === sectionEntry.sectionId)
      .map((entry) => [entry.nodeId, entry])
  )
  const childSectionEntriesByNodeId = new Map(
    pageMap.entries
      .filter((entry) => entry.kind === "section")
      .map((entry) => [entry.nodeId, entry])
  )
  const previousSlotsById = new Map(
    (fallbackSection?.slots ?? []).map((slot) => [slot.id, slot])
  )

  const orderedSlotEntries = (sectionNode?.childIds ?? [])
    .map((childId) => slotEntriesByNodeId.get(childId))
    .filter((entry): entry is PageMapEntry => Boolean(entry))
  const seenSlotIds = new Set(orderedSlotEntries.map((entry) => entry.slotId))
  const remainingSlotEntries = pageMap.entries.filter(
    (entry) =>
      entry.kind === "slot" &&
      entry.sectionId === sectionEntry.sectionId &&
      !seenSlotIds.has(entry.slotId)
  )
  const slots = [...orderedSlotEntries, ...remainingSlotEntries].flatMap((entry) => {
    if (!entry.slotId) {
      return []
    }

    const slotNode = graph.getNode(entry.nodeId)
    const fallbackSlot = previousSlotsById.get(entry.slotId)

    return [
      {
        id: entry.slotId,
        name: inferSlotName(entry, slotNode, fallbackSlot),
        kind: inferSlotKind(entry, slotNode, fallbackSlot),
        semanticRole: entry.semanticRole ?? fallbackSlot?.semanticRole,
        required: fallbackSlot?.required
      }
    ]
  })

  const childSections = (sectionNode?.childIds ?? [])
    .map((childId) => childSectionEntriesByNodeId.get(childId))
    .filter(
      (entry): entry is PageMapEntry =>
        entry !== undefined && entry.sectionId !== sectionEntry.sectionId
    )
    .map((entry) => deriveSectionNode(graph, entry, pageMap, previousSectionById))

  return {
    id: sectionEntry.sectionId,
    type: inferSectionType(sectionEntry.componentKey, sectionNode?.name, fallbackSection),
    componentKey:
      sectionEntry.componentKey ?? fallbackSection?.componentKey ?? "marketing.section.unknown",
    variant: fallbackSection?.variant,
    slots,
    children: childSections.length > 0 ? childSections : undefined,
    layout: fallbackSection?.layout
  }
}

export function derivePageStructure(params: {
  graph: StructureGraphLike
  pageMap: PageMapDocument
  canvasPageName: string
  fallbackStructure?: SectionNode[]
}): SectionNode[] {
  const { graph, pageMap, canvasPageName, fallbackStructure = [] } = params
  const previousSectionById = indexById(fallbackStructure)
  const sectionEntriesByNodeId = new Map(
    pageMap.entries
      .filter((entry) => entry.kind === "section")
      .map((entry) => [entry.nodeId, entry])
  )
  const canvasNode = graph
    .getPages(true)
    .find((page) => page.name === canvasPageName)

  if (!canvasNode) {
    return fallbackStructure
  }

  const orderedSectionEntries = canvasNode.childIds
    .map((childId) => sectionEntriesByNodeId.get(childId))
    .filter((entry): entry is PageMapEntry => Boolean(entry))

  if (orderedSectionEntries.length === 0) {
    return fallbackStructure
  }

  return orderedSectionEntries.map((entry) =>
    deriveSectionNode(graph, entry, pageMap, previousSectionById)
  )
}

function findCanvasNode(graph: StructureGraphLike, canvasPageName: string) {
  return graph.getPages(true).find((page) => page.name === canvasPageName)
}

function rebindSectionEntries(
  graph: StructureGraphLike,
  section: SectionNode,
  sectionNodeId: string
): PageMapEntry[] {
  const sectionNode = graph.getNode(sectionNodeId)
  const childIds = sectionNode?.childIds ?? []
  const slotNodeIds = childIds.filter((childId) => graph.getNode(childId)?.type !== "SECTION")
  const childSectionNodeIds = childIds.filter((childId) => graph.getNode(childId)?.type === "SECTION")

  const entries: PageMapEntry[] = [
    {
      nodeId: sectionNodeId,
      kind: "section",
      sectionId: section.id,
      componentKey: section.componentKey
    }
  ]

  section.slots.forEach((slot, index) => {
    const slotNodeId = slotNodeIds[index]
    if (!slotNodeId) {
      return
    }

    entries.push({
      nodeId: slotNodeId,
      kind: "slot",
      sectionId: section.id,
      slotId: slot.id,
      semanticRole: slot.semanticRole,
      slotKind: slot.kind
    })
  })

  ;(section.children ?? []).forEach((childSection, index) => {
    const childSectionNodeId = childSectionNodeIds[index]
    if (!childSectionNodeId) {
      return
    }

    entries.push(...rebindSectionEntries(graph, childSection, childSectionNodeId))
  })

  return entries
}

export function rebindPageMap(params: {
  graph: StructureGraphLike
  canvasPageName: string
  structure: SectionNode[]
  fallbackMap?: PageMapDocument
}): PageMapDocument {
  const canvasNode = findCanvasNode(params.graph, params.canvasPageName)
  if (!canvasNode) {
    return params.fallbackMap ?? { entries: [] }
  }

  const topLevelSectionIds = canvasNode.childIds.filter(
    (childId) => params.graph.getNode(childId)?.type === "SECTION"
  )

  const entries = params.structure.flatMap((section, index) => {
    const sectionNodeId = topLevelSectionIds[index]
    if (!sectionNodeId) {
      return []
    }

    return rebindSectionEntries(params.graph, section, sectionNodeId)
  })

  return entries.length > 0 ? { entries } : (params.fallbackMap ?? { entries: [] })
}

function normalizeSection(
  section: SectionNode,
  copyBySlot: Map<string, CopyEntry>,
  storyBySection: Map<string, StorySection>,
  styleModeBySection: Map<string, string>,
  motionByTarget: Map<string, MotionBinding[]>,
  assetBySlot: Map<string, AssetRef>,
  componentByKey: Map<string, RegistryComponent>
): NormalizedSection {
  return {
    id: section.id,
    type: section.type,
    componentKey: section.componentKey,
    componentSource: componentByKey.get(section.componentKey)?.source,
    variant: section.variant,
    story: storyBySection.get(section.id),
    styleMode: styleModeBySection.get(section.id),
    motions: motionByTarget.get(section.id) ?? [],
    slots: section.slots.map((slot) => ({
      id: slot.id,
      name: slot.name,
      kind: slot.kind,
      semanticRole: slot.semanticRole,
      value: copyBySlot.get(slot.id)?.value,
      asset: assetBySlot.get(slot.id)
    })),
    children: (section.children ?? []).map((child) =>
      normalizeSection(child, copyBySlot, storyBySection, styleModeBySection, motionByTarget, assetBySlot, componentByKey)
    )
  }
}

export function normalizePage(project: ProjectDocument, pageId: string): NormalizedPage {
  const page = project.pages.find((candidate) => candidate.id === pageId)

  if (!page) {
    throw new Error(`Page not found: ${pageId}`)
  }

  const assetLibrary = indexById(project.assets.library)
  const componentByKey = new Map(project.registry.components.map((component) => [component.key, component]))
  const assetBySlot = new Map<string, AssetRef>()
  for (const binding of project.assets.bindings) {
    const asset = assetLibrary.get(binding.assetId)
    if (asset) {
      assetBySlot.set(binding.slotId, asset)
    }
  }
  const copyBySlot = new Map(page.copy.slots.map((slot) => [slot.slotId, slot]))
  const storyBySection = new Map(page.story.sections.map((section) => [section.sectionId, section]))
  const styleModeBySection = new Map(
    (page.style.sectionModes ?? []).map((sectionMode) => [sectionMode.sectionId, sectionMode.mode])
  )
  const motionByTarget = groupByTarget(project.motions?.bindings ?? [])
  const theme = project.themes.find((candidate) => candidate.id === page.style.themeId)

  return {
    id: page.id,
    name: page.name,
    route: page.route,
    theme,
    audience: page.story.audience,
    pagePromise: page.story.pagePromise,
    sections: page.structure.map((section) =>
      normalizeSection(section, copyBySlot, storyBySection, styleModeBySection, motionByTarget, assetBySlot, componentByKey)
    )
  }
}

export function compileProject(project: ProjectDocument): NormalizedPage[] {
  return project.pages.map((page) => normalizePage(project, page.id))
}
