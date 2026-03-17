import type { ProjectManifestUpdate } from "@polaris/layer-store"
import { NextResponse } from "next/server"
import { loadProject, persistProjectUpdate } from "../../../../lib/project-store"

export async function GET(_: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params
  const project = await loadProject(projectId)
  return NextResponse.json(project)
}

export async function PATCH(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params
  const update = (await request.json()) as ProjectManifestUpdate

  await persistProjectUpdate(projectId, update)

  return NextResponse.json({ ok: true })
}
