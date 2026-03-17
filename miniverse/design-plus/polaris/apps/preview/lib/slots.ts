import type { AssetRef, NormalizedSection, NormalizedSlot } from "@polaris/compiler"

export function findSlot(section: NormalizedSection, slotName: string): NormalizedSlot | undefined {
  return section.slots.find((slot) => slot.name === slotName)
}

export function getSlotValue(section: NormalizedSection, slotName: string): string {
  const slot = findSlot(section, slotName)

  if (!slot?.value) {
    return ""
  }

  return Array.isArray(slot.value) ? slot.value.join(" ") : slot.value
}

export function getSlotAsset(section: NormalizedSection, slotName: string): AssetRef | undefined {
  return findSlot(section, slotName)?.asset
}

export function getSlotsByRole(section: NormalizedSection, semanticRole: string): NormalizedSlot[] {
  return section.slots.filter((slot) => slot.semanticRole === semanticRole)
}

