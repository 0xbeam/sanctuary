import type { NormalizedSection } from "@polaris/compiler"

export function FallbackSection({ section }: { section: NormalizedSection }) {
  return (
    <div className="section-card fallback-card">
      <h2>{section.type}</h2>
      <p className="section-story">{section.story?.intent ?? "No specialized renderer yet."}</p>
      <div className="slot-list">
        {section.slots.map((slot) => (
          <div className="slot-item" key={slot.id}>
            <span className="slot-label">{slot.name}</span>
            <span>{Array.isArray(slot.value) ? slot.value.join(", ") : slot.value ?? "Empty"}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

