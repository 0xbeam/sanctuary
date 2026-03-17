import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import { SceneGraph, exportFigFile } from "@open-pencil/core"

const workspaceRoot = path.resolve(import.meta.dirname, "..")
const projectId = process.argv[2] ?? "launch-kit"
const projectRoot = path.join(workspaceRoot, "projects", projectId)
const projectFile = path.join(projectRoot, "project.json")

const PAGE_X = 80
const PAGE_Y = 80
const PAGE_WIDTH = 1440
const SECTION_GAP = 56
const SLOT_X = 40
const SLOT_Y = 72
const SLOT_GAP = 24

function readJson(filePath) {
  return readFile(filePath, "utf8").then((raw) => JSON.parse(raw))
}

async function writeJson(filePath, data) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8")
}

function slotValue(copyEntries, slotId) {
  const entry = copyEntries.find((candidate) => candidate.slotId === slotId)?.value
  return Array.isArray(entry) ? entry.join("\n") : (entry ?? "")
}

function fontSize(slot) {
  switch (slot.semanticRole) {
    case "hero_headline":
      return 48
    case "hero_subcopy":
      return 24
    case "proof_stat":
      return 28
    case "cta_label":
      return 18
    default:
      return 20
  }
}

function fontWeight(slot) {
  switch (slot.semanticRole) {
    case "hero_headline":
      return 700
    case "proof_stat":
    case "cta_label":
      return 600
    default:
      return 400
  }
}

function slotHeight(slot, value) {
  if (slot.kind === "image") {
    return 260
  }

  const lineCount = Math.max(value.split("\n").length, 1)
  return Math.max(40, lineCount * Math.max(fontSize(slot) * 1.35, 32))
}

function addSlotNode(graph, sectionNodeId, slot, value, y) {
  if (slot.kind === "image") {
    return graph.createNode("FRAME", sectionNodeId, {
      name: slot.name,
      x: SLOT_X,
      y,
      width: PAGE_WIDTH - SLOT_X * 2,
      height: slotHeight(slot, value),
      fills: [
        {
          type: "SOLID",
          color: { r: 0.92, g: 0.91, b: 0.88, a: 1 },
          opacity: 1,
          visible: true
        }
      ],
      strokes: [
        {
          color: { r: 0.76, g: 0.73, b: 0.68, a: 1 },
          weight: 1,
          opacity: 1,
          visible: true,
          align: "INSIDE"
        }
      ],
      cornerRadius: 18
    })
  }

  return graph.createNode("TEXT", sectionNodeId, {
    name: slot.name,
    x: SLOT_X,
    y,
    width: PAGE_WIDTH - SLOT_X * 2,
    height: slotHeight(slot, value),
    text: value || slot.name,
    fontSize: fontSize(slot),
    fontWeight: fontWeight(slot)
  })
}

async function main() {
  const project = await readJson(projectFile)
  const graph = new SceneGraph()
  const pageMaps = {}

  for (let index = 0; index < project.pages.length; index += 1) {
    const pageMeta = project.pages[index]
    const pageRoot = path.join(projectRoot, "pages", pageMeta.id)
    const [structure, copy] = await Promise.all([
      readJson(path.join(pageRoot, "page.structure.json")),
      readJson(path.join(pageRoot, "page.copy.json"))
    ])

    const canvas = graph.getPages(true)[index] ?? graph.addPage(pageMeta.canvasPageName)
    graph.updateNode(canvas.id, {
      name: pageMeta.canvasPageName,
      width: PAGE_WIDTH + PAGE_X * 2,
      height: 0
    })

    const entries = []
    let cursorY = PAGE_Y

    for (const section of structure) {
      const sectionNode = graph.createNode("SECTION", canvas.id, {
        name: `${section.type} / ${section.componentKey}`,
        x: PAGE_X,
        y: cursorY,
        width: PAGE_WIDTH,
        height: 320
      })

      entries.push({
        nodeId: sectionNode.id,
        kind: "section",
        sectionId: section.id,
        componentKey: section.componentKey
      })

      let slotY = SLOT_Y
      for (const slot of section.slots) {
        const value = slotValue(copy.slots, slot.id)
        const slotNode = addSlotNode(graph, sectionNode.id, slot, value, slotY)
        entries.push({
          nodeId: slotNode.id,
          kind: "slot",
          sectionId: section.id,
          slotId: slot.id,
          semanticRole: slot.semanticRole,
          slotKind: slot.kind
        })
        slotY += slotHeight(slot, value) + SLOT_GAP
      }

      const sectionHeight = Math.max(260, slotY + 40)
      graph.updateNode(sectionNode.id, { height: sectionHeight })
      cursorY += sectionHeight + SECTION_GAP
    }

    graph.updateNode(canvas.id, {
      height: cursorY + PAGE_Y
    })

    pageMaps[pageMeta.id] = { entries }
  }

  const document = await exportFigFile(graph)
  const documentPath = path.join(projectRoot, project.editor.documentPath)
  await mkdir(path.dirname(documentPath), { recursive: true })
  await writeFile(documentPath, document)

  await Promise.all(
    project.pages.map((pageMeta) =>
      writeJson(path.join(projectRoot, "pages", pageMeta.id, "page.map.json"), pageMaps[pageMeta.id])
    )
  )

  console.log(`Bootstrapped OpenPencil editor artifacts for "${projectId}".`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
