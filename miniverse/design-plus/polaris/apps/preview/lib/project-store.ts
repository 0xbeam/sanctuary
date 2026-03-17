import {
  loadEditorDocument,
  loadProjectDocument,
  resolveProjectRoot,
  resolveProjectsDir,
  saveEditorDocument,
  savePageLayers,
  saveProjectManifest
} from "@polaris/layer-store"
import path from "node:path"

const workspaceRoot = path.resolve(process.cwd(), "../..")
const projectsDir = resolveProjectsDir(workspaceRoot)

function resolveRoot(projectId: string) {
  return resolveProjectRoot(projectsDir, projectId)
}

export async function loadProject(projectId: string) {
  return loadProjectDocument(resolveRoot(projectId))
}

export async function persistPageUpdate(
  projectId: string,
  pageId: string,
  update: Parameters<typeof savePageLayers>[2]
) {
  return savePageLayers(resolveRoot(projectId), pageId, update)
}

export async function persistProjectUpdate(
  projectId: string,
  update: Parameters<typeof saveProjectManifest>[1]
) {
  return saveProjectManifest(resolveRoot(projectId), update)
}

export async function loadProjectEditorDocument(projectId: string) {
  const project = await loadProject(projectId)
  return loadEditorDocument(resolveRoot(projectId), project.editor.documentPath)
}

export async function persistProjectEditorDocument(projectId: string, data: Uint8Array) {
  const project = await loadProject(projectId)
  return saveEditorDocument(resolveRoot(projectId), project.editor.documentPath, data)
}
