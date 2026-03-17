"use client"

import { normalizePage, type PageDocument, type ProjectDocument, type SectionNode } from "@polaris/compiler"
import { useMemo, useState, useTransition, type CSSProperties } from "react"
import { createTemplateSection, duplicateSection as duplicateSectionBundle } from "../lib/section-templates"
import { SectionRenderer } from "./SectionRenderer"

interface StudioAppProps {
  initialProject: ProjectDocument
  initialPageId: string
  projectKey: string
}

type SaveState = "idle" | "saving" | "saved" | "error"

function moveItem<T>(items: T[], index: number, direction: "up" | "down"): T[] {
  const targetIndex = direction === "up" ? index - 1 : index + 1

  if (targetIndex < 0 || targetIndex >= items.length) {
    return items
  }

  const next = [...items]
  const [item] = next.splice(index, 1)
  next.splice(targetIndex, 0, item)
  return next
}

function updatePage(project: ProjectDocument, pageId: string, updater: (page: PageDocument) => PageDocument): ProjectDocument {
  return {
    ...project,
    pages: project.pages.map((page) => (page.id === pageId ? updater(page) : page))
  }
}

function collectSlotIds(section: SectionNode): string[] {
  return [...section.slots.map((slot) => slot.id), ...(section.children ?? []).flatMap((child) => collectSlotIds(child))]
}

export function StudioApp({ initialProject, initialPageId, projectKey }: StudioAppProps) {
  const [project, setProject] = useState(initialProject)
  const [activePageId] = useState(initialPageId)
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [statusMessage, setStatusMessage] = useState("Changes are local until you save.")
  const [isPending, startTransition] = useTransition()

  const activePage = useMemo(
    () => project.pages.find((page) => page.id === activePageId) ?? project.pages[0],
    [project.pages, activePageId]
  )

  const normalizedPage = useMemo(
    () => (activePage ? normalizePage(project, activePage.id) : null),
    [project, activePage]
  )

  const assetEditors = useMemo(() => {
    const slotById = new Map(activePage?.structure.flatMap((section) => section.slots.map((slot) => [slot.id, slot])) ?? [])

    return project.assets.bindings.map((binding) => ({
      binding,
      slot: slotById.get(binding.slotId),
      asset: project.assets.library.find((asset) => asset.id === binding.assetId)
    }))
  }, [project.assets, activePage])

  if (!activePage || !normalizedPage) {
    return null
  }

  function markDirty(message: string) {
    setSaveState("idle")
    setStatusMessage(message)
  }

  function setCopyEntry(slotId: string, value: string) {
    setProject((current) =>
      updatePage(current, activePage.id, (page) => {
        const existing = page.copy.slots.find((slot) => slot.slotId === slotId)
        const nextSlots = existing
          ? page.copy.slots.map((slot) => (slot.slotId === slotId ? { ...slot, value } : slot))
          : [...page.copy.slots, { slotId, value }]

        return {
          ...page,
          copy: {
            ...page.copy,
            slots: nextSlots
          }
        }
      })
    )
    markDirty("Unsaved copy changes.")
  }

  function setStoryField(field: "audience" | "pagePromise", value: string) {
    setProject((current) =>
      updatePage(current, activePage.id, (page) => ({
        ...page,
        story: {
          ...page.story,
          [field]: value
        }
      }))
    )
    markDirty("Unsaved story changes.")
  }

  function setAssetField(assetId: string, field: "src" | "alt", value: string) {
    setProject((current) => ({
      ...current,
      assets: {
        ...current.assets,
        library: current.assets.library.map((asset) => (asset.id === assetId ? { ...asset, [field]: value } : asset))
      }
    }))
    markDirty("Unsaved asset changes.")
  }

  function moveSection(sectionId: string, direction: "up" | "down") {
    setProject((current) =>
      updatePage(current, activePage.id, (page) => {
        const index = page.structure.findIndex((section) => section.id === sectionId)
        if (index === -1) {
          return page
        }

        return {
          ...page,
          structure: moveItem(page.structure, index, direction),
          story: {
            ...page.story,
            sections: moveItem(page.story.sections, index, direction)
          }
        }
      })
    )
    markDirty("Unsaved structure changes.")
  }

  function duplicateSection(sectionId: string) {
    setProject((current) => {
      const page = current.pages.find((item) => item.id === activePage.id)
      if (!page) {
        return current
      }

      const bundle = duplicateSectionBundle(page, sectionId)
      if (!bundle) {
        return current
      }

      const sourceIndex = page.structure.findIndex((section) => section.id === sectionId)
      const sourceStoryIndex = page.story.sections.findIndex((section) => section.sectionId === sectionId)
      const sourceStyleIndex = (page.style.sectionModes ?? []).findIndex((mode) => mode.sectionId === sectionId)

      const extraBindings = current.assets.bindings.flatMap((binding) => {
        const clonedSlotId = bundle.slotIdMap.get(binding.slotId)
        return clonedSlotId ? [{ ...binding, slotId: clonedSlotId }] : []
      })

      return {
        ...updatePage(current, activePage.id, (targetPage) => ({
          ...targetPage,
          structure: [
            ...targetPage.structure.slice(0, sourceIndex + 1),
            bundle.section,
            ...targetPage.structure.slice(sourceIndex + 1)
          ],
          copy: {
            ...targetPage.copy,
            slots: [...targetPage.copy.slots, ...bundle.copyEntries]
          },
          story: {
            ...targetPage.story,
            sections: bundle.storySection
              ? [
                  ...targetPage.story.sections.slice(0, sourceStoryIndex + 1),
                  bundle.storySection,
                  ...targetPage.story.sections.slice(sourceStoryIndex + 1)
                ]
              : targetPage.story.sections
          },
          style: {
            ...targetPage.style,
            sectionModes: bundle.styleMode
              ? [
                  ...(targetPage.style.sectionModes ?? []).slice(0, sourceStyleIndex + 1),
                  bundle.styleMode,
                  ...(targetPage.style.sectionModes ?? []).slice(sourceStyleIndex + 1)
                ]
              : targetPage.style.sectionModes
          }
        })),
        assets: {
          ...current.assets,
          bindings: [...current.assets.bindings, ...extraBindings]
        }
      }
    })

    markDirty("Duplicated a section.")
  }

  function removeSection(sectionId: string) {
    setProject((current) => {
      const page = current.pages.find((item) => item.id === activePage.id)
      const section = page?.structure.find((item) => item.id === sectionId)

      if (!page || !section) {
        return current
      }

      const slotIds = new Set(collectSlotIds(section))

      return {
        ...updatePage(current, activePage.id, (targetPage) => ({
          ...targetPage,
          structure: targetPage.structure.filter((item) => item.id !== sectionId),
          copy: {
            ...targetPage.copy,
            slots: targetPage.copy.slots.filter((entry) => !slotIds.has(entry.slotId))
          },
          story: {
            ...targetPage.story,
            sections: targetPage.story.sections.filter((item) => item.sectionId !== sectionId)
          },
          style: {
            ...targetPage.style,
            sectionModes: (targetPage.style.sectionModes ?? []).filter((item) => item.sectionId !== sectionId)
          }
        })),
        assets: {
          ...current.assets,
          bindings: current.assets.bindings.filter((binding) => !slotIds.has(binding.slotId))
        }
      }
    })

    markDirty("Removed a section.")
  }

  function addSection(template: "hero" | "proof-grid") {
    const bundle = createTemplateSection(template)

    setProject((current) => {
      const firstAsset = current.assets.library[0]
      const mediaSlot = bundle.section.slots.find((slot) => slot.kind === "image")

      return {
        ...updatePage(current, activePage.id, (page) => ({
          ...page,
          structure: [...page.structure, bundle.section],
          copy: {
            ...page.copy,
            slots: [...page.copy.slots, ...bundle.copyEntries]
          },
          story: {
            ...page.story,
            sections: [...page.story.sections, bundle.storySection]
          },
          style: {
            ...page.style,
            sectionModes: [...(page.style.sectionModes ?? []), bundle.styleMode]
          }
        })),
        assets: {
          ...current.assets,
          bindings:
            firstAsset && mediaSlot
              ? [...current.assets.bindings, { slotId: mediaSlot.id, assetId: firstAsset.id, cropMode: "cover" }]
              : current.assets.bindings
        }
      }
    })

    markDirty(`Added a new ${template} section.`)
  }

  function resetFromDisk() {
    startTransition(async () => {
      const response = await fetch(`/api/projects/${projectKey}`, { cache: "no-store" })
      const latestProject = (await response.json()) as ProjectDocument
      setProject(latestProject)
      setSaveState("idle")
      setStatusMessage("Reloaded the latest project from disk.")
    })
  }

  function savePage() {
    setSaveState("saving")
    setStatusMessage("Saving layer changes to disk...")

    startTransition(async () => {
      try {
        const projectResponse = await fetch(`/api/projects/${projectKey}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            assets: project.assets
          })
        })

        if (!projectResponse.ok) {
          throw new Error(`Failed to save project: ${projectResponse.status}`)
        }

        const pageResponse = await fetch(`/api/projects/${projectKey}/pages/${activePage.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            structure: activePage.structure,
            copy: activePage.copy,
            story: activePage.story,
            typeSystem: activePage.typeSystem,
            style: activePage.style
          })
        })

        if (!pageResponse.ok) {
          throw new Error(`Failed to save page: ${pageResponse.status}`)
        }

        setSaveState("saved")
        setStatusMessage("Saved to the Polaris layer files.")
      } catch (error) {
        console.error(error)
        setSaveState("error")
        setStatusMessage("Save failed. The in-memory preview is intact.")
      }
    })
  }

  return (
    <main className="studio-shell">
      <aside className="studio-sidebar">
        <div className="studio-panel">
          <div className="studio-panel-header">
            <div>
              <p className="eyebrow">Polaris</p>
              <h1 className="studio-title">Layered Studio</h1>
            </div>
            <span className={`save-pill save-pill-${saveState}`}>{isPending ? "working" : saveState}</span>
          </div>
          <p className="studio-copy">
            Edit copy, structure, and assets on the left. The live page on the right is rendered from the same
            layered project model that gets saved back to disk.
          </p>
          <div className="studio-actions">
            <button className="primary-button" onClick={savePage} type="button">
              Save Layers
            </button>
            <button className="secondary-button" onClick={resetFromDisk} type="button">
              Reset from Disk
            </button>
          </div>
          <p className="studio-status">{statusMessage}</p>
        </div>

        <div className="studio-panel">
          <p className="panel-label">Page Story</p>
          <label className="field">
            <span>Audience</span>
            <textarea value={activePage.story.audience} onChange={(event) => setStoryField("audience", event.target.value)} />
          </label>
          <label className="field">
            <span>Page Promise</span>
            <textarea value={activePage.story.pagePromise} onChange={(event) => setStoryField("pagePromise", event.target.value)} />
          </label>
        </div>

        <div className="studio-panel">
          <div className="panel-header-inline">
            <p className="panel-label">Section Order</p>
            <span className="panel-muted">{activePage.structure.length} sections</span>
          </div>
          <div className="studio-actions studio-actions-compact">
            <button className="secondary-button" onClick={() => addSection("hero")} type="button">
              Add Hero
            </button>
            <button className="secondary-button" onClick={() => addSection("proof-grid")} type="button">
              Add Proof
            </button>
          </div>
          <div className="section-list">
            {activePage.structure.map((section, index) => (
              <div className="section-item" key={section.id}>
                <div>
                  <strong>{section.type}</strong>
                  <p>{section.componentKey}</p>
                </div>
                <div className="section-controls">
                  <button onClick={() => moveSection(section.id, "up")} disabled={index === 0} type="button">
                    Up
                  </button>
                  <button
                    onClick={() => moveSection(section.id, "down")}
                    disabled={index === activePage.structure.length - 1}
                    type="button"
                  >
                    Down
                  </button>
                  <button onClick={() => duplicateSection(section.id)} type="button">
                    Duplicate
                  </button>
                  <button onClick={() => removeSection(section.id)} type="button">
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="studio-panel">
          <div className="panel-header-inline">
            <p className="panel-label">Assets</p>
            <span className="panel-muted">{assetEditors.length} bindings</span>
          </div>
          <div className="field-grid">
            {assetEditors.map(({ binding, slot, asset }) => (
              <div className="copy-group" key={`${binding.slotId}:${binding.assetId}`}>
                <h2>{slot?.name ?? binding.slotId}</h2>
                <p className="studio-status">Bound to asset {binding.assetId}</p>
                <label className="field">
                  <span>Source</span>
                  <textarea
                    value={asset?.src ?? ""}
                    onChange={(event) => asset && setAssetField(asset.id, "src", event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Alt Text</span>
                  <textarea
                    value={asset?.alt ?? ""}
                    onChange={(event) => asset && setAssetField(asset.id, "alt", event.target.value)}
                  />
                </label>
              </div>
            ))}
          </div>
        </div>

        <div className="studio-panel">
          <div className="panel-header-inline">
            <p className="panel-label">Copy Layer</p>
            <span className="panel-muted">{activePage.copy.slots.length} slot bindings</span>
          </div>
          <div className="field-grid">
            {activePage.structure.map((section) => (
              <div className="copy-group" key={section.id}>
                <h2>{section.type}</h2>
                {section.slots
                  .filter((slot) => slot.kind !== "image" && slot.kind !== "video" && slot.kind !== "logo")
                  .map((slot) => {
                    const entry = activePage.copy.slots.find((copySlot) => copySlot.slotId === slot.id)
                    return (
                      <label className="field" key={slot.id}>
                        <span>
                          {slot.name}
                          {slot.semanticRole ? <em>{slot.semanticRole}</em> : null}
                        </span>
                        <textarea
                          value={typeof entry?.value === "string" ? entry.value : Array.isArray(entry?.value) ? entry.value.join("\n") : ""}
                          onChange={(event) => setCopyEntry(slot.id, event.target.value)}
                        />
                      </label>
                    )
                  })}
              </div>
            ))}
          </div>
        </div>
      </aside>

      <section className="studio-preview">
        <div
          className="page-shell"
          style={
            {
              "--background": ((normalizedPage.theme?.tokens.colors ?? {}) as Record<string, string>).background ?? "#f4f0e8",
              "--foreground": ((normalizedPage.theme?.tokens.colors ?? {}) as Record<string, string>).foreground ?? "#171717",
              "--accent": ((normalizedPage.theme?.tokens.colors ?? {}) as Record<string, string>).accent ?? "#ba4a2f",
              "--display-font":
                ((normalizedPage.theme?.tokens.typography ?? {}) as Record<string, string>).display ?? "Iowan Old Style",
              "--body-font":
                ((normalizedPage.theme?.tokens.typography ?? {}) as Record<string, string>).body ?? "Helvetica Neue",
              "--section-space": `${(((normalizedPage.theme?.tokens.spacing ?? {}) as Record<string, number>).section ?? 96)}px`,
              "--container-space": `${(((normalizedPage.theme?.tokens.spacing ?? {}) as Record<string, number>).container ?? 24)}px`
            } as CSSProperties
          }
        >
          <div className="page-noise" />
          <header className="page-header">
            <div>
              <p className="eyebrow">Rendered Runtime</p>
              <h1 className="page-title">{normalizedPage.name}</h1>
            </div>
            <div className="page-meta">
              <span>Audience: {normalizedPage.audience}</span>
              <span>Promise: {normalizedPage.pagePromise}</span>
            </div>
          </header>
          {normalizedPage.sections.map((section) => (
            <SectionRenderer key={section.id} section={section} />
          ))}
        </div>
      </section>
    </main>
  )
}
