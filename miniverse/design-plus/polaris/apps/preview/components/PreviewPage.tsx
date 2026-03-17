"use client"

import type { NormalizedPage } from "@polaris/compiler"
import { useEffect, useMemo, useState, type CSSProperties } from "react"
import { SectionRenderer } from "./SectionRenderer"

interface PreviewPageProps {
  page: NormalizedPage
}

interface PreviewSelectionMessage {
  type: "polaris-preview-selection"
  sectionId?: string
}

export function PreviewPage({ page }: PreviewPageProps) {
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null)

  useEffect(() => {
    function handleMessage(event: MessageEvent<PreviewSelectionMessage>) {
      if (event.data?.type !== "polaris-preview-selection") {
        return
      }

      setSelectedSectionId(event.data.sectionId ?? null)
    }

    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [])

  const themeVars = useMemo(
    () =>
      ({
        "--background": (page.theme?.tokens.colors as { background?: string } | undefined)?.background ?? "#f5f1e8",
        "--foreground": (page.theme?.tokens.colors as { foreground?: string } | undefined)?.foreground ?? "#151515",
        "--accent": (page.theme?.tokens.colors as { accent?: string } | undefined)?.accent ?? "#b8432f",
        "--display-font":
          (page.theme?.tokens.typography as { display?: string } | undefined)?.display ?? "Iowan Old Style",
        "--body-font":
          (page.theme?.tokens.typography as { body?: string } | undefined)?.body ?? "Helvetica Neue"
      }) as CSSProperties,
    [page.theme]
  )

  return (
    <main className="page-shell" style={themeVars}>
      <div className="page-noise" />
      <header className="page-header">
        <div>
          <p className="eyebrow">Polaris Preview</p>
          <h1 className="page-title">{page.pagePromise}</h1>
        </div>
        <div className="page-meta">
          <span className="section-chip">Audience: {page.audience}</span>
          <span className="section-chip">{page.sections.length} sections</span>
          {page.theme ? <span className="section-chip">Theme: {page.theme.name}</span> : null}
        </div>
      </header>

      <div className="page-stack">
        {page.sections.map((section) => (
          <div
            className={selectedSectionId === section.id ? "preview-focus section-focus" : "preview-focus"}
            data-section-id={section.id}
            key={section.id}
          >
            <SectionRenderer section={section} />
          </div>
        ))}
      </div>
    </main>
  )
}
