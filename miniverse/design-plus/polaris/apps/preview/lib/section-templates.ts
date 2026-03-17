import type { CopyEntry, PageDocument, SectionMode, SectionNode, StorySection } from "@polaris/compiler"

type TemplateType = "hero" | "proof-grid"

function slug(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")
}

function uniqueId(prefix: string): string {
  return `${slug(prefix)}_${Math.random().toString(36).slice(2, 8)}`
}

function cloneSectionNode(section: SectionNode, slotMap: Map<string, string>): SectionNode {
  const nextSectionId = uniqueId(section.type)

  return {
    ...section,
    id: nextSectionId,
    slots: section.slots.map((slot) => {
      const nextSlotId = uniqueId(slot.name)
      slotMap.set(slot.id, nextSlotId)
      return {
        ...slot,
        id: nextSlotId
      }
    }),
    children: (section.children ?? []).map((child) => cloneSectionNode(child, slotMap))
  }
}

export function duplicateSection(page: PageDocument, sectionId: string) {
  const originalSection = page.structure.find((section) => section.id === sectionId)

  if (!originalSection) {
    return null
  }

  const slotMap = new Map<string, string>()
  const nextSection = cloneSectionNode(originalSection, slotMap)
  const nextCopyEntries: CopyEntry[] = page.copy.slots
    .filter((entry) => slotMap.has(entry.slotId))
    .map((entry) => ({
      slotId: slotMap.get(entry.slotId)!,
      value: Array.isArray(entry.value) ? [...entry.value] : entry.value
    }))

  const originalStory = page.story.sections.find((section) => section.sectionId === sectionId)
  const originalStyleMode = page.style.sectionModes?.find((mode) => mode.sectionId === sectionId)

  return {
    section: nextSection,
    copyEntries: nextCopyEntries,
    slotIdMap: slotMap,
    storySection: originalStory
      ? {
          ...originalStory,
          sectionId: nextSection.id
        }
      : undefined,
    styleMode: originalStyleMode
      ? {
          ...originalStyleMode,
          sectionId: nextSection.id
        }
      : undefined
  }
}

export function createTemplateSection(template: TemplateType): {
  section: SectionNode
  copyEntries: CopyEntry[]
  storySection: StorySection
  styleMode: SectionMode
} {
  if (template === "hero") {
    const sectionId = uniqueId("section_hero")
    const eyebrowId = uniqueId("slot_hero_eyebrow")
    const headlineId = uniqueId("slot_hero_headline")
    const subcopyId = uniqueId("slot_hero_subcopy")
    const ctaId = uniqueId("slot_hero_cta")
    const mediaId = uniqueId("slot_hero_media")

    return {
      section: {
        id: sectionId,
        type: "hero",
        componentKey: "marketing.hero.centered",
        variant: "editorial",
        slots: [
          { id: eyebrowId, name: "Eyebrow", kind: "text", semanticRole: "hero_eyebrow" },
          { id: headlineId, name: "Headline", kind: "text", semanticRole: "hero_headline" },
          { id: subcopyId, name: "Subcopy", kind: "rich-text", semanticRole: "hero_subcopy" },
          { id: mediaId, name: "Hero Media", kind: "image" },
          { id: ctaId, name: "Primary CTA", kind: "button", semanticRole: "cta_label" }
        ],
        layout: {
          widthMode: "container",
          columns: 12,
          gap: 24
        }
      },
      copyEntries: [
        { slotId: eyebrowId, value: "NEW" },
        { slotId: headlineId, value: "A new hero section is ready to shape" },
        { slotId: subcopyId, value: "Use this as a starting point, then rewrite the copy in the left panel." },
        { slotId: ctaId, value: "Edit this CTA" }
      ],
      storySection: {
        sectionId,
        intent: "Introduce a fresh section at the top of the story",
        message: "New sections should arrive with copy and narrative defaults."
      },
      styleMode: {
        sectionId,
        mode: "spotlight"
      }
    }
  }

  const sectionId = uniqueId("section_proof")
  const claimId = uniqueId("slot_proof_claim")
  const statOneId = uniqueId("slot_proof_stat_1")
  const statTwoId = uniqueId("slot_proof_stat_2")

  return {
    section: {
      id: sectionId,
      type: "proof-grid",
      componentKey: "marketing.proof.stats",
      slots: [
        { id: claimId, name: "Proof Claim", kind: "text", semanticRole: "section_claim" },
        { id: statOneId, name: "Proof Stat 1", kind: "text", semanticRole: "proof_stat" },
        { id: statTwoId, name: "Proof Stat 2", kind: "text", semanticRole: "proof_stat" }
      ],
      layout: {
        widthMode: "container",
        columns: 12,
        gap: 20
      }
    },
    copyEntries: [
      { slotId: claimId, value: "Add new proof without rebuilding the page." },
      { slotId: statOneId, value: "Fast duplication" },
      { slotId: statTwoId, value: "Structured layers" }
    ],
    storySection: {
      sectionId,
      intent: "Support the narrative with more evidence",
      message: "New proof sections should slot into the existing story rhythm.",
      proofType: "stats"
    },
    styleMode: {
      sectionId,
      mode: "quiet-proof"
    }
  }
}
