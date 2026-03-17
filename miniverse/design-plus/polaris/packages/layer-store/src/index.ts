import {
  type AssetsLayer,
  type CopyLayer,
  type PageMapDocument,
  type MotionLayer,
  type PageDocument,
  type PageStyle,
  type ProjectDocument,
  type ProjectEditorConfig,
  type RegistryLayer,
  type StoryLayer,
  type Theme,
  type TypeSystemLayer,
  type SectionNode,
  rebindPageMap
} from "@polaris/compiler"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import {
  derivePageStructureFromDocument,
  parseOpenPencilDocument
} from "./open-pencil"

export const PROJECT_FILE = "project.json"

export const PAGE_LAYER_FILES = {
  structure: "page.structure.json",
  map: "page.map.json",
  copy: "page.copy.json",
  story: "page.story.json",
  typeSystem: "page.type-system.json",
  style: "page.style.json",
  assets: "page.assets.json",
  motion: "page.motion.json"
} as const

export interface ProjectPaths {
  root: string
  projectFile: string
  pagesDir: string
  assetsDir: string
}

export interface ProjectPageMeta {
  id: string
  name: string
  route: string
  canvasPageName: string
}

export interface StoredProjectManifest {
  id: string
  name: string
  editor: ProjectEditorConfig
  pages: ProjectPageMeta[]
  themes: Theme[]
  assets: AssetsLayer
  registry: RegistryLayer
  motions?: MotionLayer
}

export interface PageLayerUpdate {
  structure?: SectionNode[]
  map?: PageMapDocument
  copy?: CopyLayer
  story?: StoryLayer
  typeSystem?: TypeSystemLayer
  style?: PageStyle
}

export interface ProjectManifestUpdate {
  editor?: ProjectEditorConfig
  themes?: Theme[]
  assets?: AssetsLayer
  registry?: RegistryLayer
  motions?: MotionLayer
}

export function resolveProjectPaths(root: string): ProjectPaths {
  return {
    root,
    projectFile: `${root}/${PROJECT_FILE}`,
    pagesDir: `${root}/pages`,
    assetsDir: `${root}/assets`
  }
}

export function resolvePageLayerFiles(root: string, pageId: string): Record<string, string> {
  const pageRoot = `${resolveProjectPaths(root).pagesDir}/${pageId}`

  return {
    structure: `${pageRoot}/${PAGE_LAYER_FILES.structure}`,
    map: `${pageRoot}/${PAGE_LAYER_FILES.map}`,
    copy: `${pageRoot}/${PAGE_LAYER_FILES.copy}`,
    story: `${pageRoot}/${PAGE_LAYER_FILES.story}`,
    typeSystem: `${pageRoot}/${PAGE_LAYER_FILES.typeSystem}`,
    style: `${pageRoot}/${PAGE_LAYER_FILES.style}`,
    assets: `${pageRoot}/${PAGE_LAYER_FILES.assets}`,
    motion: `${pageRoot}/${PAGE_LAYER_FILES.motion}`
  }
}

export function resolveProjectsDir(root: string): string {
  return path.resolve(root, "projects")
}

export function resolveProjectRoot(projectsDir: string, projectId: string): string {
  return path.join(projectsDir, projectId)
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, "utf8")
  return JSON.parse(raw) as T
}

async function readJsonFileOrDefault<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return await readJsonFile<T>(filePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return fallback
    }

    throw error
  }
}

async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8")
}

export async function loadStoredProjectManifest(projectRoot: string): Promise<StoredProjectManifest> {
  return readJsonFile<StoredProjectManifest>(resolveProjectPaths(projectRoot).projectFile)
}

export async function loadStoredPage(
  projectRoot: string,
  pageMeta: ProjectPageMeta,
  documentGraph?: Awaited<ReturnType<typeof parseOpenPencilDocument>>
): Promise<PageDocument> {
  const files = resolvePageLayerFiles(projectRoot, pageMeta.id)
  const [storedStructure, map, copy, story, typeSystem, style] = await Promise.all([
    readJsonFileOrDefault<SectionNode[]>(files.structure, []),
    readJsonFileOrDefault<PageMapDocument>(files.map, { entries: [] }),
    readJsonFile<CopyLayer>(files.copy),
    readJsonFile<StoryLayer>(files.story),
    readJsonFile<TypeSystemLayer>(files.typeSystem),
    readJsonFile<PageStyle>(files.style)
  ])
  const reboundMap = documentGraph
    ? rebindPageMap({
        graph: documentGraph,
        canvasPageName: pageMeta.canvasPageName,
        structure: storedStructure,
        fallbackMap: map
      })
    : map
  const structure = documentGraph
    ? derivePageStructureFromDocument({
        graph: documentGraph,
        page: {
          canvasPageName: pageMeta.canvasPageName,
          map: reboundMap,
          structure: storedStructure
        }
      })
    : storedStructure

  return {
    id: pageMeta.id,
    name: pageMeta.name,
    route: pageMeta.route,
    canvasPageName: pageMeta.canvasPageName,
    structure,
    map: reboundMap,
    copy,
    story,
    typeSystem,
    style
  }
}

export async function loadProjectDocument(projectRoot: string): Promise<ProjectDocument> {
  const manifest = await loadStoredProjectManifest(projectRoot)
  let documentGraph: Awaited<ReturnType<typeof parseOpenPencilDocument>> | undefined

  try {
    const editorDocument = await loadEditorDocument(projectRoot, manifest.editor.documentPath)
    documentGraph = await parseOpenPencilDocument(editorDocument)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn("Failed to parse Polaris editor document, falling back to stored structure.", error)
    }
  }

  const pages = await Promise.all(
    manifest.pages.map((pageMeta) => loadStoredPage(projectRoot, pageMeta, documentGraph))
  )

  return {
    id: manifest.id,
    name: manifest.name,
    editor: manifest.editor,
    pages,
    themes: manifest.themes,
    assets: manifest.assets,
    registry: manifest.registry,
    motions: manifest.motions
  }
}

export async function savePageLayers(
  projectRoot: string,
  pageId: string,
  update: PageLayerUpdate
): Promise<void> {
  const files = resolvePageLayerFiles(projectRoot, pageId)
  const writes: Promise<void>[] = []

  if (update.structure) {
    writes.push(writeJsonFile(files.structure, update.structure))
  }

  if (update.map) {
    writes.push(writeJsonFile(files.map, update.map))
  }

  if (update.copy) {
    writes.push(writeJsonFile(files.copy, update.copy))
  }

  if (update.story) {
    writes.push(writeJsonFile(files.story, update.story))
  }

  if (update.typeSystem) {
    writes.push(writeJsonFile(files.typeSystem, update.typeSystem))
  }

  if (update.style) {
    writes.push(writeJsonFile(files.style, update.style))
  }

  await Promise.all(writes)
}

export async function saveProjectManifest(
  projectRoot: string,
  update: ProjectManifestUpdate
): Promise<StoredProjectManifest> {
  const existing = await loadStoredProjectManifest(projectRoot)
  const nextManifest: StoredProjectManifest = {
    ...existing,
    editor: update.editor ?? existing.editor,
    themes: update.themes ?? existing.themes,
    assets: update.assets ?? existing.assets,
    registry: update.registry ?? existing.registry,
    motions: update.motions ?? existing.motions
  }

  await writeJsonFile(resolveProjectPaths(projectRoot).projectFile, nextManifest)

  return nextManifest
}

export function resolveEditorDocumentFile(projectRoot: string, documentPath: string): string {
  return path.join(projectRoot, documentPath)
}

export async function loadEditorDocument(projectRoot: string, documentPath: string): Promise<Uint8Array> {
  return readFile(resolveEditorDocumentFile(projectRoot, documentPath))
}

export async function saveEditorDocument(
  projectRoot: string,
  documentPath: string,
  data: Uint8Array
): Promise<void> {
  const filePath = resolveEditorDocumentFile(projectRoot, documentPath)
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, data)
}
