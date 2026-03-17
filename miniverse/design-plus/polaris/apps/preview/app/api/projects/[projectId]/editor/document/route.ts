import { NextResponse } from "next/server"
import {
  loadProjectEditorDocument,
  persistProjectEditorDocument
} from "../../../../../../lib/project-store"

export async function GET(_: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params
  const document = await loadProjectEditorDocument(projectId)

  return new NextResponse(Buffer.from(document), {
    headers: {
      "content-type": "application/octet-stream"
    }
  })
}

export async function PUT(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params
  const buffer = new Uint8Array(await request.arrayBuffer())

  await persistProjectEditorDocument(projectId, buffer)

  return NextResponse.json({ ok: true })
}
