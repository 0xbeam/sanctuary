export interface RegistrySlot {
  name: string
  kind: string
  semanticRole?: string
}

export interface RegistryComponent {
  key: string
  source: string
  propsSchema?: string
  slots: RegistrySlot[]
}

export interface ComponentRegistry {
  components: RegistryComponent[]
}

export function indexRegistry(registry: ComponentRegistry): Map<string, RegistryComponent> {
  return new Map(registry.components.map((component) => [component.key, component]))
}

export function resolveComponent(
  registry: ComponentRegistry,
  componentKey: string
): RegistryComponent | undefined {
  return indexRegistry(registry).get(componentKey)
}

