import type { PageLayerUpdate } from "@polaris/layer-store"
import { NextResponse } from "next/server"
import { persistPageUpdate } from "../../../../../../lib/project-store"

export async function PATCH(request: Request, context: { params: Promise<{ projectId: string; pageId: string }> }) {
  const { projectId, pageId } = await context.params
  const update = (await request.json()) as PageLayerUpdate

  await persistPageUpdate(projectId, pageId, update)

  return NextResponse.json({ ok: true })
}

