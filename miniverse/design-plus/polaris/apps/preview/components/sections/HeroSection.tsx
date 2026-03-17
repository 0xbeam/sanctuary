import type { NormalizedSection } from "@polaris/compiler"
import { getSlotAsset, getSlotValue } from "../../lib/slots"

export function HeroSection({ section }: { section: NormalizedSection }) {
  const eyebrow = getSlotValue(section, "Eyebrow")
  const headline = getSlotValue(section, "Headline")
  const subcopy = getSlotValue(section, "Subcopy")
  const cta = getSlotValue(section, "Primary CTA")
  const media = getSlotAsset(section, "Hero Media")

  return (
    <div className="section-card hero-grid">
      <div className="hero-copy">
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="hero-headline">{headline}</h2>
        <p className="hero-subcopy">{subcopy}</p>
        <div className="hero-actions">
          <button className="primary-button" type="button">
            {cta}
          </button>
          {section.story?.message ? <p className="section-story">{section.story.message}</p> : null}
        </div>
      </div>

      <div className="hero-media">
        {media ? <img alt={media.alt ?? "Section media"} src={media.src} /> : null}
        <div className="hero-media-overlay">
          <strong>{section.story?.intent ?? "Section intent"}</strong>
          <p>{section.componentSource ?? "No registry source mapped yet."}</p>
        </div>
      </div>
    </div>
  )
}

