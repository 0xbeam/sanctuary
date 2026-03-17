<script setup lang="ts">
import { onMounted, provide, watch } from "vue"
import { useEventListener } from "@vueuse/core"
import { useHead } from "@unhead/vue"
import { SplitterGroup, SplitterPanel, SplitterResizeHandle } from "reka-ui"

import EditorCanvas from "@/components/EditorCanvas.vue"
import LayersPanel from "@/components/LayersPanel.vue"
import PolarisSidebar from "@/components/PolarisSidebar.vue"
import TabBar from "@/components/TabBar.vue"
import Toolbar from "@/components/Toolbar.vue"
import { useCollab, COLLAB_KEY } from "@/composables/use-collab"
import { useKeyboard } from "@/composables/use-keyboard"
import { useMenu } from "@/composables/use-menu"
import { usePolarisSession } from "@/polaris/session"
import { createTab } from "@/stores/tabs"
import { useEditorStore } from "@/stores/editor"

const firstTab = createTab()
const store = useEditorStore()
const collab = useCollab(firstTab.store)

provide(COLLAB_KEY, collab)
useKeyboard()
useMenu()

onMounted(async () => {
  await usePolarisSession.load(firstTab.store)
})

watch(
  () => store.state.selectionVersion,
  () => {
    usePolarisSession.syncSelection(store)
  },
  { immediate: true }
)

watch(
  () => store.state.currentPageId,
  () => {
    usePolarisSession.syncSelection(store)
  },
  { immediate: true }
)

useEventListener(window, "keydown", (event: KeyboardEvent) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
    event.preventDefault()
    void usePolarisSession.save(store)
  }
})

useHead({ title: "Editor" })
</script>

<template>
  <div data-test-id="editor-root" class="flex h-screen w-screen flex-col">
    <TabBar />
    <SplitterGroup direction="horizontal" class="flex-1 overflow-hidden" auto-save-id="polaris-layout">
      <SplitterPanel :default-size="18" :min-size="12" :max-size="26" class="flex">
        <LayersPanel />
      </SplitterPanel>
      <SplitterResizeHandle class="group relative z-10 -mx-1 w-2 cursor-col-resize">
        <div class="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border" />
      </SplitterResizeHandle>
      <SplitterPanel :default-size="52" :min-size="28" class="flex">
        <div class="relative flex min-w-0 flex-1">
          <EditorCanvas />
          <Toolbar />
        </div>
      </SplitterPanel>
      <SplitterResizeHandle class="group relative z-10 -mx-1 w-2 cursor-col-resize">
        <div class="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border" />
      </SplitterResizeHandle>
      <SplitterPanel :default-size="30" :min-size="22" :max-size="40" class="flex min-w-0">
        <PolarisSidebar />
      </SplitterPanel>
    </SplitterGroup>
  </div>
</template>
