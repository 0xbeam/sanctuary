import type { NormalizedSection } from "@polaris/compiler"
import { getSlotsByRole, getSlotValue } from "../../lib/slots"

export function ProofStatsSection({ section }: { section: NormalizedSection }) {
  const claim = getSlotValue(section, "Proof Claim")
  const statSlots = getSlotsByRole(section, "proof_stat")

  return (
    <div className="section-card proof-grid">
      <div>
        <p className="eyebrow">Proof</p>
        <h2 className="proof-claim">{claim}</h2>
        {section.story?.message ? <p className="section-story">{section.story.message}</p> : null}
      </div>
      <div className="proof-stats">
        {statSlots.map((slot) => (
          <article className="proof-stat" key={slot.id}>
            <strong>{slot.value}</strong>
            <span>{slot.name}</span>
          </article>
        ))}
      </div>
    </div>
  )
}

