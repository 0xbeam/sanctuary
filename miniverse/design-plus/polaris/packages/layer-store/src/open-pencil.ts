import { parseFigFile } from "@open-pencil/core/kiwi"
import { derivePageStructure } from "@polaris/compiler"
import type {
  PageDocument,
  SectionNode,
  StructureGraphLike
} from "@polaris/compiler"

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
}

export async function parseOpenPencilDocument(data: Uint8Array): Promise<StructureGraphLike> {
  return parseFigFile(toArrayBuffer(data))
}

export function derivePageStructureFromDocument(params: {
  graph: StructureGraphLike
  page: Pick<PageDocument, "canvasPageName" | "map" | "structure">
}): SectionNode[] {
  return derivePageStructure({
    graph: params.graph,
    pageMap: params.page.map,
    canvasPageName: params.page.canvasPageName,
    fallbackStructure: params.page.structure
  })
}
