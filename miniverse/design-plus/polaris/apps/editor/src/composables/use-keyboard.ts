import { useEventListener } from "@vueuse/core"

import { usePolarisSession } from "@/polaris/session"
import { TOOL_SHORTCUTS, useEditorStore } from "@/stores/editor"

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  )
}

export function useKeyboard() {
  const store = useEditorStore()

  useEventListener(window, "keydown", (event: KeyboardEvent) => {
    if (isEditableTarget(event.target)) {
      return
    }

    const isMod = event.metaKey || event.ctrlKey
    const key = event.key.toLowerCase()

    if (isMod && key === "\\") {
      event.preventDefault()
      store.state.showUI = !store.state.showUI
      return
    }

    if (isMod && key === "d") {
      event.preventDefault()
      usePolarisSession.duplicateSelection(store)
      return
    }

    if (!isMod && (key === "backspace" || key === "delete")) {
      event.preventDefault()
      usePolarisSession.deleteSelection(store)
      return
    }

    const nextTool = TOOL_SHORTCUTS[key]
    if (nextTool && !event.shiftKey && !event.altKey) {
      event.preventDefault()
      store.setTool(nextTool)
    }
  })
}
