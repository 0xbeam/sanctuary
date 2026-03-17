import { computed, ref, watch } from "vue"
import { exportFigFile } from "@open-pencil/core"
import { parseFigFile } from "@open-pencil/core/kiwi"
import { derivePageStructure, rebindPageMap } from "@polaris/compiler"
import type {
  AssetBinding,
  CopyEntry,
  PageDocument,
  PageMapEntry,
  ProjectDocument,
  SectionMode,
  SectionNode,
  StorySection
} from "@polaris/compiler"

import type { EditorStore } from "@/stores/editor"

type SaveState = "idle" | "saving" | "saved" | "error"

const projectId = ref("launch-kit")
const project = ref<ProjectDocument | null>(null)
const activePageId = ref<string | null>(null)
const selectedNodeId = ref<string | null>(null)
const selectionOverride = ref<PageMapEntry | null>(null)
const saveState = ref<SaveState>("idle")
const statusMessage = ref("Loading Polaris project…")
const loading = ref(false)
const previewRevision = ref(0)
let previewSyncTimer: ReturnType<typeof setTimeout> | null = null
let graphSyncCleanup: Array<() => void> = []

interface PreviewSyncOptions {
  includeManifest?: boolean
  persistDocument?: boolean
}

function apiUrl(path: string) {
  return path
}

function generateLocalId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
}

function updateProject(updater: (current: ProjectDocument) => ProjectDocument) {
  if (!project.value) {
    return
  }

  project.value = updater(project.value)
  saveState.value = "idle"
}

function updatePage(pageId: string, updater: (page: PageDocument) => PageDocument) {
  updateProject((current) => ({
    ...current,
    pages: current.pages.map((page) => (page.id === pageId ? updater(page) : page))
  }))
}

function cleanupGraphSync() {
  graphSyncCleanup.forEach((dispose) => dispose())
  graphSyncCleanup = []
}

function attachStoreSync(store: EditorStore) {
  graphSyncCleanup.push(
    watch(
      () => store.state.selectionVersion,
      () => {
        usePolarisSession.syncSelection(store)
      },
      { immediate: true }
    )
  )

  graphSyncCleanup.push(
    watch(
      () => store.state.currentPageId,
      () => {
        usePolarisSession.syncSelection(store)
      },
      { immediate: true }
    )
  )
}

function preserveSelectionAfterSync(
  store: EditorStore,
  entry: PageMapEntry,
  delayMs = 450
) {
  const applySelection = () => {
    if (!store.graph.getNode(entry.nodeId)) {
      return
    }

    store.select([entry.nodeId])
    selectionOverride.value = entry
    usePolarisSession.syncSelection(store)
  }

  applySelection()
  window.setTimeout(applySelection, delayMs)
}

function findPageByCanvasId(store: EditorStore): PageDocument | undefined {
  if (!project.value) {
    return undefined
  }

  const canvas = store.graph.getNode(store.state.currentPageId)
  return project.value.pages.find((page) => page.canvasPageName === canvas?.name)
}

function getSectionMapEntry(page: PageDocument, sectionId: string) {
  return page.map.entries.find((entry) => entry.kind === "section" && entry.sectionId === sectionId)
}

function getPageForNode(nodeId: string, store: EditorStore): PageDocument | undefined {
  if (!project.value) {
    return undefined
  }

  let current = store.graph.getNode(nodeId)
  while (current) {
    if (current.type === "CANVAS") {
      return project.value.pages.find((page) => page.canvasPageName === current?.name)
    }

    current = current.parentId ? store.graph.getNode(current.parentId) : undefined
  }

  return undefined
}

function pageOwnsNode(page: PageDocument, nodeId: string, store: EditorStore): boolean {
  const node = store.graph.getNode(nodeId)
  if (!node) {
    return false
  }

  return getPageForNode(nodeId, store)?.id === page.id
}

function getSelectedEntry(page: PageDocument, store: EditorStore): PageMapEntry | undefined {
  let currentId = selectedNodeId.value

  while (currentId) {
    const match = page.map.entries.find((entry) => entry.nodeId === currentId)
    if (match) {
      return match
    }

    currentId = store.graph.getNode(currentId)?.parentId ?? null
  }

  return undefined
}

function cloneSectionNode(section: SectionNode, slotIdMap: Map<string, string>): SectionNode {
  return {
    ...section,
    id: generateLocalId("section"),
    slots: section.slots.map((slot) => {
      const nextSlotId = generateLocalId("slot")
      slotIdMap.set(slot.id, nextSlotId)
      return {
        ...slot,
        id: nextSlotId
      }
    }),
    children: section.children?.map((child) => cloneSectionNode(child, slotIdMap))
  }
}

function pairClonedTreeIds(
  store: EditorStore,
  sourceNodeId: string,
  clonedNodeId: string,
  pairs: Map<string, string> = new Map()
): Map<string, string> {
  pairs.set(sourceNodeId, clonedNodeId)
  const sourceNode = store.graph.getNode(sourceNodeId)
  const clonedNode = store.graph.getNode(clonedNodeId)

  sourceNode?.childIds.forEach((childId, index) => {
    const clonedChildId = clonedNode?.childIds[index]
    if (clonedChildId) {
      pairClonedTreeIds(store, childId, clonedChildId, pairs)
    }
  })

  return pairs
}

function deriveStructureForPage(page: PageDocument, store: EditorStore) {
  return derivePageStructure({
    graph: store.graph,
    pageMap: page.map,
    canvasPageName: page.canvasPageName,
    fallbackStructure: page.structure
  })
}

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
}

function rebindProjectPagesToGraph(currentProject: ProjectDocument, graph: Awaited<ReturnType<typeof parseFigFile>>) {
  return {
    ...currentProject,
    pages: currentProject.pages.map((page) => {
      const map = rebindPageMap({
        graph,
        canvasPageName: page.canvasPageName,
        structure: page.structure,
        fallbackMap: page.map
      })

      return {
        ...page,
        map,
        structure: derivePageStructure({
          graph,
          pageMap: map,
          canvasPageName: page.canvasPageName,
          fallbackStructure: page.structure
        })
      }
    })
  }
}

function reconcilePageWithGraph(page: PageDocument, store: EditorStore) {
  const nextMapEntries = page.map.entries.filter((entry) => pageOwnsNode(page, entry.nodeId, store))
  const nextSectionIds = new Set(
    nextMapEntries
      .filter((entry) => entry.kind === "section")
      .map((entry) => entry.sectionId)
  )
  const nextSlotIds = new Set(
    nextMapEntries.flatMap((entry) => (entry.kind === "slot" && entry.slotId ? [entry.slotId] : []))
  )
  const removedSlotIds = new Set(
    page.map.entries
      .flatMap((entry) => (entry.kind === "slot" && entry.slotId ? [entry.slotId] : []))
      .filter((slotId) => !nextSlotIds.has(slotId))
  )

  const nextPage: PageDocument = {
    ...page,
    map: {
      entries: nextMapEntries
    },
    copy: {
      ...page.copy,
      slots: page.copy.slots.filter((entry) => nextSlotIds.has(entry.slotId))
    },
    story: {
      ...page.story,
      sections: page.story.sections.filter((entry) => nextSectionIds.has(entry.sectionId))
    },
    style: {
      ...page.style,
      sectionModes: (page.style.sectionModes ?? []).filter((entry) =>
        nextSectionIds.has(entry.sectionId)
      )
    },
    structure: derivePageStructure({
      graph: store.graph,
      pageMap: { entries: nextMapEntries },
      canvasPageName: page.canvasPageName,
      fallbackStructure: page.structure.filter((section) => nextSectionIds.has(section.id))
    })
  }

  return {
    page: nextPage,
    removedSlotIds
  }
}

function reconcileAllPagesFromGraph(store: EditorStore) {
  if (!project.value) {
    return
  }

  const removedSlotIds = new Set<string>()

  updateProject((currentProject) => {
    const pages = currentProject.pages.map((page) => {
      const result = reconcilePageWithGraph(page, store)
      result.removedSlotIds.forEach((slotId) => removedSlotIds.add(slotId))
      return result.page
    })

    if (removedSlotIds.size === 0) {
      return {
        ...currentProject,
        pages
      }
    }

    return {
      ...currentProject,
      pages,
      assets: {
        ...currentProject.assets,
        bindings: currentProject.assets.bindings.filter((binding) => !removedSlotIds.has(binding.slotId))
      }
    }
  })
}

async function persistEditorDocumentSnapshot(store: EditorStore) {
  const data = await exportFigFile(
    store.graph,
    undefined,
    store.renderer ?? undefined,
    store.state.currentPageId
  )
  const graph = await parseFigFile(toArrayBuffer(data))

  if (project.value) {
    project.value = rebindProjectPagesToGraph(project.value, graph)
  }

  const response = await fetch(apiUrl(`/api/projects/${projectId.value}/editor/document`), {
    method: "PUT",
    headers: {
      "content-type": "application/octet-stream"
    },
    body: data
  })

  if (!response.ok) {
    throw new Error(`Failed to save editor document (${response.status})`)
  }
}

const activePage = computed(() => {
  if (!project.value) {
    return null
  }

  return project.value.pages.find((page) => page.id === activePageId.value) ?? project.value.pages[0] ?? null
})

const selectedMapEntry = computed(() => {
  const page = activePage.value
  if (!page) {
    return null
  }

  return page.map.entries.find((entry) => entry.nodeId === selectedNodeId.value) ?? selectionOverride.value ?? null
})

const resolvedSelection = computed(() => {
  const page = activePage.value
  const store = usePolarisSession.editorStore.value
  if (!page || !selectedNodeId.value || !store) {
    return selectionOverride.value ?? null
  }

  return getSelectedEntry(page, store) ?? selectionOverride.value ?? null
})

const selectedSection = computed(() => {
  const page = activePage.value
  const entry = resolvedSelection.value
  if (!page || !entry) {
    return null
  }

  return page.structure.find((section) => section.id === entry.sectionId) ?? null
})

const selectedSlot = computed(() => {
  const section = selectedSection.value
  const entry = resolvedSelection.value
  if (!section || !entry?.slotId) {
    return null
  }

  return section.slots.find((slot) => slot.id === entry.slotId) ?? null
})

const selectedCopy = computed(() => {
  const page = activePage.value
  const slot = selectedSlot.value
  if (!page || !slot) {
    return ""
  }

  const entry = page.copy.slots.find((candidate) => candidate.slotId === slot.id)
  return Array.isArray(entry?.value) ? entry.value.join("\n") : (entry?.value ?? "")
})

const selectedStory = computed(() => {
  const page = activePage.value
  const section = selectedSection.value
  if (!page || !section) {
    return null
  }

  return page.story.sections.find((item) => item.sectionId === section.id) ?? null
})

const selectedAsset = computed(() => {
  const currentProject = project.value
  const slot = selectedSlot.value
  if (!currentProject || !slot) {
    return null
  }

  const binding = currentProject.assets.bindings.find((item) => item.slotId === slot.id)
  if (!binding) {
    return null
  }

  return {
    binding,
    asset: currentProject.assets.library.find((item) => item.id === binding.assetId) ?? null
  }
})

function selectedMappedEntriesForStore(store: EditorStore): PageMapEntry[] {
  if (!project.value) {
    return []
  }

  const entries: PageMapEntry[] = []
  for (const nodeId of store.state.selectedIds) {
    const page = getPageForNode(nodeId, store)
    if (!page) {
      continue
    }

    const entry = getSelectedEntry(page, store)
    if (entry && !entries.some((candidate) => candidate.nodeId === entry.nodeId)) {
      entries.push(entry)
    }
  }

  return entries
}

async function fetchProject(projectKey: string) {
  const response = await fetch(apiUrl(`/api/projects/${projectKey}`))
  if (!response.ok) {
    throw new Error(`Failed to load Polaris project (${response.status})`)
  }

  return (await response.json()) as ProjectDocument
}

async function fetchDocument(projectKey: string) {
  const response = await fetch(apiUrl(`/api/projects/${projectKey}/editor/document`))
  if (!response.ok) {
    throw new Error(`Failed to load editor document (${response.status})`)
  }

  return new Uint8Array(await response.arrayBuffer())
}

async function savePage(projectKey: string, page: PageDocument) {
  const response = await fetch(apiUrl(`/api/projects/${projectKey}/pages/${page.id}`), {
    method: "PATCH",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      structure: page.structure,
      map: page.map,
      copy: page.copy,
      story: page.story,
      typeSystem: page.typeSystem,
      style: page.style
    })
  })

  if (!response.ok) {
    throw new Error(`Failed to save page layers (${response.status})`)
  }
}

async function saveProjectManifest(projectKey: string, currentProject: ProjectDocument) {
  const response = await fetch(apiUrl(`/api/projects/${projectKey}`), {
    method: "PATCH",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      editor: currentProject.editor,
      assets: currentProject.assets,
      themes: currentProject.themes,
      registry: currentProject.registry,
      motions: currentProject.motions
    })
  })

  if (!response.ok) {
    throw new Error(`Failed to save project manifest (${response.status})`)
  }
}

async function syncPreview(options: PreviewSyncOptions = {}) {
  const store = usePolarisSession.editorStore.value
  if (!project.value || !activePage.value) {
    return
  }

  const currentPage =
    store && options.persistDocument
      ? {
          ...activePage.value,
          structure: deriveStructureForPage(activePage.value, store)
        }
      : activePage.value

  if (currentPage !== activePage.value) {
    updatePage(currentPage.id, () => currentPage)
  }

  const writes: Promise<unknown>[] = [
    savePage(projectId.value, currentPage),
    options.includeManifest ? saveProjectManifest(projectId.value, project.value) : Promise.resolve()
  ]

  if (options.persistDocument && store) {
    writes.push(persistEditorDocumentSnapshot(store))
  }

  await Promise.all(writes)

  previewRevision.value += 1
}

function requestPreviewSync(options: PreviewSyncOptions = {}) {
  if (previewSyncTimer) {
    clearTimeout(previewSyncTimer)
  }

  previewSyncTimer = setTimeout(() => {
    void syncPreview(options).catch((error) => {
      console.error(error)
      statusMessage.value =
        error instanceof Error ? error.message : "Failed to refresh Polaris preview."
    })
  }, 300)
}

function syncMappedTextNode(nodeId: string, store: EditorStore) {
  const page = getPageForNode(nodeId, store)
  const node = store.graph.getNode(nodeId)
  if (!page || node?.type !== "TEXT") {
    return
  }

  const slotEntry = page.map.entries.find(
    (entry) => entry.kind === "slot" && entry.nodeId === nodeId && entry.slotId
  )
  if (!slotEntry?.slotId) {
    return
  }

  const existingValue = page.copy.slots.find((entry) => entry.slotId === slotEntry.slotId)?.value
  const nextValue = node.text ?? ""
  const normalizedExisting = Array.isArray(existingValue) ? existingValue.join("\n") : (existingValue ?? "")
  if (normalizedExisting === nextValue) {
    return
  }

  updatePage(page.id, (currentPage) => ({
    ...currentPage,
    copy: {
      ...currentPage.copy,
      slots: currentPage.copy.slots.some((entry) => entry.slotId === slotEntry.slotId)
        ? currentPage.copy.slots.map((entry) =>
            entry.slotId === slotEntry.slotId ? { slotId: slotEntry.slotId!, value: nextValue } : entry
          )
        : [...currentPage.copy.slots, { slotId: slotEntry.slotId, value: nextValue }]
    }
  }))

  requestPreviewSync({ persistDocument: true })
}

function attachGraphSync(store: EditorStore) {
  cleanupGraphSync()

  graphSyncCleanup.push(
    store.graph.emitter.on("node:updated", (nodeId, changes) => {
      if ("text" in changes) {
        syncMappedTextNode(nodeId, store)
      }
    })
  )

  const reconcile = () => {
    reconcileAllPagesFromGraph(store)
    requestPreviewSync({ includeManifest: true, persistDocument: true })
  }

  graphSyncCleanup.push(store.graph.emitter.on("node:created", reconcile))
  graphSyncCleanup.push(store.graph.emitter.on("node:deleted", reconcile))
  graphSyncCleanup.push(store.graph.emitter.on("node:reparented", reconcile))
  graphSyncCleanup.push(store.graph.emitter.on("node:reordered", reconcile))
}

export const usePolarisSession = {
  editorStore: ref<EditorStore | null>(null),
  projectId,
  project,
  activePageId,
  saveState,
  statusMessage,
  loading,
  previewRevision,
  activePage,
  selectedNodeId,
  selectionOverride,
  selectedMapEntry,
  resolvedSelection,
  selectedSection,
  selectedSlot,
  selectedCopy,
  selectedStory,
  selectedAsset,
  async load(store: EditorStore, nextProjectId = "launch-kit") {
    loading.value = true
    statusMessage.value = "Loading Polaris project…"
    projectId.value = nextProjectId
    usePolarisSession.editorStore.value = store

    try {
      const [loadedProject, documentData] = await Promise.all([
        fetchProject(nextProjectId),
        fetchDocument(nextProjectId)
      ])

      project.value = loadedProject
      activePageId.value = loadedProject.pages[0]?.id ?? null

      const file = new File([documentData], `${loadedProject.name}.fig`, {
        type: "application/octet-stream"
      })
      cleanupGraphSync()
      await store.openFigFile(file)
      attachGraphSync(store)
      attachStoreSync(store)
      project.value = rebindProjectPagesToGraph(loadedProject, store.graph)

      const firstPage = project.value.pages[0]
      const canvasNode = store.graph.getPages().find((page) => page.name === firstPage?.canvasPageName)
      if (canvasNode) {
        store.switchPage(canvasNode.id)
      }

      if (firstPage) {
        updatePage(firstPage.id, (currentPage) => ({
          ...currentPage,
          structure: deriveStructureForPage(currentPage, store)
        }))
      }

      statusMessage.value = "Canvas and live preview are in sync."
      saveState.value = "saved"
    } finally {
      loading.value = false
    }
  },
  syncSelection(store: EditorStore) {
    usePolarisSession.editorStore.value = store
    selectedNodeId.value = [...store.state.selectedIds][0] ?? null

    const nextPage = findPageByCanvasId(store)
    if (nextPage) {
      activePageId.value = nextPage.id
      updatePage(nextPage.id, (currentPage) => ({
        ...currentPage,
        structure: deriveStructureForPage(currentPage, store)
      }))
    }

    const actualSelection = nextPage ? getSelectedEntry(nextPage, store) : null
    if (actualSelection) {
      selectionOverride.value = null
    } else if (!selectedNodeId.value) {
      selectionOverride.value = null
    } else if (selectionOverride.value?.nodeId !== selectedNodeId.value) {
      selectionOverride.value = null
    }

    if (project.value && saveState.value === "idle" && statusMessage.value === "Loading Polaris project…") {
      statusMessage.value = "Canvas and live preview are in sync."
      saveState.value = "saved"
    }
  },
  updateCopy(value: string) {
    const page = activePage.value
    const slot = selectedSlot.value
    const store = usePolarisSession.editorStore.value
    if (!page || !slot) {
      return
    }

    updatePage(page.id, (currentPage) => {
      const existing = currentPage.copy.slots.find((entry) => entry.slotId === slot.id)
      const nextEntry: CopyEntry = { slotId: slot.id, value }

      return {
        ...currentPage,
        copy: {
          ...currentPage.copy,
          slots: existing
            ? currentPage.copy.slots.map((entry) => (entry.slotId === slot.id ? nextEntry : entry))
            : [...currentPage.copy.slots, nextEntry]
        }
      }
    })

    const mappedNodeId = page.map.entries.find((entry) => entry.slotId === slot.id)?.nodeId
    const mappedNode = mappedNodeId && store ? store.graph.getNode(mappedNodeId) : null
    if (mappedNode?.type === "TEXT" && store) {
      store.updateNode(mappedNode.id, {
        text: value
      })
      store.requestRender()
    }

    requestPreviewSync({ persistDocument: mappedNode?.type === "TEXT" })
    statusMessage.value = `Updated copy for ${slot.name}.`
  },
  updateStoryField(field: keyof StorySection, value: string) {
    const page = activePage.value
    const section = selectedSection.value
    if (!page || !section) {
      return
    }

    updatePage(page.id, (currentPage) => {
      const existing = currentPage.story.sections.find((entry) => entry.sectionId === section.id)
      const nextStory = existing
        ? currentPage.story.sections.map((entry) =>
            entry.sectionId === section.id ? { ...entry, [field]: value } : entry
          )
        : [...currentPage.story.sections, { sectionId: section.id, intent: "", [field]: value }]

      return {
        ...currentPage,
        story: {
          ...currentPage.story,
          sections: nextStory
        }
      }
    })
    requestPreviewSync()
    statusMessage.value = `Updated story for ${section.type}.`
  },
  updateAssetField(field: "src" | "alt", value: string) {
    const currentProject = project.value
    const selected = selectedAsset.value
    if (!currentProject || !selected?.asset) {
      return
    }

    updateProject((projectDocument) => ({
      ...projectDocument,
      assets: {
        ...projectDocument.assets,
        library: projectDocument.assets.library.map((asset) =>
          asset.id === selected.asset?.id ? { ...asset, [field]: value } : asset
        )
      }
    }))
    requestPreviewSync({ includeManifest: true })
    statusMessage.value = `Updated asset ${selected.asset.id}.`
  },
  moveSelectedSection(store: EditorStore, direction: "up" | "down") {
    const page = activePage.value
    const section = selectedSection.value
    if (!page || !section) {
      return
    }

    const sectionIndex = page.structure.findIndex((item) => item.id === section.id)
    if (sectionIndex === -1) {
      return
    }

    const targetIndex = direction === "up" ? sectionIndex - 1 : sectionIndex + 1
    if (targetIndex < 0 || targetIndex >= page.structure.length) {
      return
    }

    const sectionEntry = getSectionMapEntry(page, section.id)
    if (sectionEntry) {
      store.graph.reorderChild(sectionEntry.nodeId, store.state.currentPageId, targetIndex)
      store.requestRender()
    }

    updatePage(page.id, (currentPage) => ({
      ...currentPage,
      structure: deriveStructureForPage(currentPage, store)
    }))
    requestPreviewSync({ persistDocument: true })
    statusMessage.value = `Moved ${section.type} ${direction}.`
  },
  duplicateSelectedSection(store: EditorStore) {
    const page = activePage.value
    const section = selectedSection.value
    if (!page || !section) {
      return
    }

    const sectionEntry = getSectionMapEntry(page, section.id)
    if (!sectionEntry) {
      return
    }

    const clone = store.graph.cloneTree(sectionEntry.nodeId, store.state.currentPageId)
    if (!clone) {
      return
    }

    const sourceIndex = page.structure.findIndex((item) => item.id === section.id)
    store.graph.reorderChild(clone.id, store.state.currentPageId, sourceIndex + 1)

    const nodeIdPairs = pairClonedTreeIds(store, sectionEntry.nodeId, clone.id)
    const slotIdMap = new Map<string, string>()
    const duplicatedSection = cloneSectionNode(section, slotIdMap)
    const nextSectionId = duplicatedSection.id

    const nextMapEntries = page.map.entries.flatMap((entry) => {
      if (entry.sectionId !== section.id) {
        return []
      }

      const nextNodeId = nodeIdPairs.get(entry.nodeId)
      if (!nextNodeId) {
        return []
      }

      return [
        {
          ...entry,
          nodeId: nextNodeId,
          sectionId: nextSectionId,
          slotId: entry.slotId ? slotIdMap.get(entry.slotId) : undefined
        }
      ]
    })

    updatePage(page.id, (currentPage) => {
      const nextPage: PageDocument = {
        ...currentPage,
        map: {
          entries: [...currentPage.map.entries, ...nextMapEntries]
        },
        copy: {
          ...currentPage.copy,
          slots: [
            ...currentPage.copy.slots,
            ...currentPage.copy.slots.flatMap((entry) => {
              const nextSlotId = slotIdMap.get(entry.slotId)
              return nextSlotId ? [{ slotId: nextSlotId, value: entry.value }] : []
            })
          ]
        },
        story: {
          ...currentPage.story,
          sections: [
            ...currentPage.story.sections,
            ...currentPage.story.sections.flatMap((entry) =>
              entry.sectionId === section.id ? [{ ...entry, sectionId: nextSectionId }] : []
            )
          ]
        },
        style: {
          ...currentPage.style,
          sectionModes: [
            ...(currentPage.style.sectionModes ?? []),
            ...(currentPage.style.sectionModes ?? []).flatMap((entry: SectionMode) =>
              entry.sectionId === section.id ? [{ ...entry, sectionId: nextSectionId }] : []
            )
          ]
        }
      }

      return {
        ...nextPage,
        structure: deriveStructureForPage(nextPage, store)
      }
    })

    updateProject((currentProject) => ({
      ...currentProject,
      assets: {
        ...currentProject.assets,
        bindings: [
          ...currentProject.assets.bindings,
          ...currentProject.assets.bindings.flatMap((binding: AssetBinding) => {
            const nextSlotId = slotIdMap.get(binding.slotId)
            return nextSlotId ? [{ ...binding, slotId: nextSlotId }] : []
          })
        ]
      }
    }))

    const nextSelection: PageMapEntry = {
      nodeId: clone.id,
      kind: "section",
      sectionId: nextSectionId,
      componentKey: section.componentKey
    }
    preserveSelectionAfterSync(store, nextSelection)
    store.requestRender()
    requestPreviewSync({ includeManifest: true, persistDocument: true })
    statusMessage.value = `Duplicated ${section.type}.`
  },
  removeSelectedSection(store: EditorStore) {
    const page = activePage.value
    const section = selectedSection.value
    if (!page || !section) {
      return
    }

    const sectionIndex = page.structure.findIndex((item) => item.id === section.id)
    const slotIds = new Set(section.slots.map((slot) => slot.id))
    const sectionEntry = getSectionMapEntry(page, section.id)
    const fallbackSection =
      page.structure[sectionIndex + 1] ?? page.structure[sectionIndex - 1] ?? null
    const fallbackEntry = fallbackSection ? getSectionMapEntry(page, fallbackSection.id) : undefined
    if (sectionEntry) {
      store.graph.deleteNode(sectionEntry.nodeId)
      store.requestRender()
    }

    updatePage(page.id, (currentPage) => {
      const nextPage: PageDocument = {
        ...currentPage,
        map: {
          entries: currentPage.map.entries.filter((entry) => entry.sectionId !== section.id)
        },
        copy: {
          ...currentPage.copy,
          slots: currentPage.copy.slots.filter((entry) => !slotIds.has(entry.slotId))
        },
        story: {
          ...currentPage.story,
          sections: currentPage.story.sections.filter((entry) => entry.sectionId !== section.id)
        },
        style: {
          ...currentPage.style,
          sectionModes: (currentPage.style.sectionModes ?? []).filter(
            (entry) => entry.sectionId !== section.id
          )
        }
      }

      return {
        ...nextPage,
        structure: deriveStructureForPage(nextPage, store)
      }
    })

    updateProject((currentProject) => ({
      ...currentProject,
      assets: {
        ...currentProject.assets,
        bindings: currentProject.assets.bindings.filter((binding) => !slotIds.has(binding.slotId))
      }
    }))

    if (fallbackEntry) {
      preserveSelectionAfterSync(store, fallbackEntry)
    } else {
      store.clearSelection()
      selectedNodeId.value = null
      selectionOverride.value = null
    }

    requestPreviewSync({ includeManifest: true, persistDocument: true })
    statusMessage.value = `Removed ${section.type}.`
  },
  duplicateSelection(store: EditorStore) {
    const mappedEntries = selectedMappedEntriesForStore(store)

    if (mappedEntries.length === 0) {
      store.duplicateSelected()
      return
    }

    if (store.state.selectedIds.size > 1) {
      statusMessage.value = "Duplicate mapped Polaris sections one at a time for now."
      return
    }

    const [entry] = mappedEntries
    if (entry.kind === "section") {
      usePolarisSession.duplicateSelectedSection(store)
      return
    }

    statusMessage.value = "Slot duplication is not supported yet. Duplicate the whole section instead."
  },
  deleteSelection(store: EditorStore) {
    const mappedEntries = selectedMappedEntriesForStore(store)

    if (mappedEntries.length === 0) {
      store.deleteSelected()
      return
    }

    if (store.state.selectedIds.size > 1) {
      statusMessage.value = "Remove mapped Polaris sections one at a time for now."
      return
    }

    const [entry] = mappedEntries
    if (entry.kind === "section") {
      usePolarisSession.removeSelectedSection(store)
      return
    }

    statusMessage.value = "Slot deletion is not supported yet. Clear the content instead."
  },
  async save(store: EditorStore) {
    if (!project.value || !activePage.value) {
      return
    }

    saveState.value = "saving"
    statusMessage.value = "Saving canvas and layer state…"

    try {
      const currentPage = {
        ...activePage.value,
        structure: deriveStructureForPage(activePage.value, store)
      }
      updatePage(currentPage.id, () => currentPage)

      await Promise.all([
        persistEditorDocumentSnapshot(store),
        saveProjectManifest(projectId.value, project.value),
        savePage(projectId.value, currentPage)
      ])

      saveState.value = "saved"
      previewRevision.value += 1
      statusMessage.value = "Saved Polaris project and canvas document."
    } catch (error) {
      console.error(error)
      saveState.value = "error"
      statusMessage.value = error instanceof Error ? error.message : "Failed to save Polaris project."
    }
  }
}
