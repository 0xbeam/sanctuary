import type { NormalizedSection } from "@polaris/compiler"
import { HeroSection } from "./sections/HeroSection"
import { ProofStatsSection } from "./sections/ProofStatsSection"
import { FallbackSection } from "./sections/FallbackSection"

export function SectionRenderer({ section }: { section: NormalizedSection }) {
  const content = (() => {
    switch (section.type) {
      case "hero":
        return <HeroSection section={section} />
      case "proof-grid":
        return <ProofStatsSection section={section} />
      default:
        return <FallbackSection section={section} />
    }
  })()

  return (
    <section className="section-shell">
      <div className="section-meta">
        <span className="section-chip">{section.type}</span>
        <span className="section-chip">{section.componentKey}</span>
        {section.styleMode ? <span className="section-chip">mode: {section.styleMode}</span> : null}
        {section.motions.map((motion) => (
          <span className="section-chip" key={`${section.id}:${motion.preset}`}>
            motion: {motion.preset}
          </span>
        ))}
      </div>
      {content}
    </section>
  )
}

