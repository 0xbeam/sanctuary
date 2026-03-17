<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from "reka-ui"

import { usePolarisSession } from "@/polaris/session"
import { useEditorStore } from "@/stores/editor"

const store = useEditorStore()
const previewFrame = ref<HTMLIFrameElement | null>(null)
const activeTab = ref("selection")

const saveClass = computed(() => `polaris-save-pill polaris-save-${usePolarisSession.saveState.value}`)
const previewSrc = computed(() => {
  if (!usePolarisSession.projectId.value || !usePolarisSession.activePageId.value) {
    return "http://127.0.0.1:3200/"
  }

  return `http://127.0.0.1:3200/?project=${usePolarisSession.projectId.value}&page=${usePolarisSession.activePageId.value}&rev=${usePolarisSession.previewRevision.value}`
})

watch(
  () => usePolarisSession.resolvedSelection.value?.sectionId ?? null,
  (sectionId) => {
    previewFrame.value?.contentWindow?.postMessage(
      {
        type: "polaris-preview-selection",
        sectionId
      },
      "http://127.0.0.1:3200"
    )
  }
)

function handlePreviewLoad() {
  previewFrame.value?.contentWindow?.postMessage(
    {
      type: "polaris-preview-selection",
      sectionId: usePolarisSession.resolvedSelection.value?.sectionId ?? null
    },
    "http://127.0.0.1:3200"
  )
}
</script>

<template>
  <aside class="flex min-h-0 min-w-0 flex-1 flex-col border-l border-border bg-panel">
    <div class="flex items-center gap-2 border-b border-border px-3 py-2">
      <div class="min-w-0 flex-1">
        <p class="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">Polaris</p>
        <p class="truncate text-xs text-surface">{{ usePolarisSession.statusMessage.value }}</p>
      </div>
      <span :class="saveClass">{{ usePolarisSession.saveState.value }}</span>
      <button class="polaris-button polaris-button-primary" @click="usePolarisSession.save(store)">
        Save
      </button>
    </div>

    <TabsRoot v-model="activeTab" class="flex min-h-0 flex-1 flex-col">
      <TabsList class="flex shrink-0 items-center gap-1 border-b border-border px-2 py-2">
        <TabsTrigger value="selection" class="polaris-tab-trigger">Selection</TabsTrigger>
        <TabsTrigger value="copy" class="polaris-tab-trigger">Copy</TabsTrigger>
        <TabsTrigger value="assets" class="polaris-tab-trigger">Assets</TabsTrigger>
        <TabsTrigger value="story" class="polaris-tab-trigger">Story</TabsTrigger>
      </TabsList>

      <TabsContent value="selection" class="polaris-tab-panel" :force-mount="true" :hidden="activeTab !== 'selection'">
        <section class="polaris-panel-block">
          <p class="polaris-label">Canvas Selection</p>
          <div v-if="usePolarisSession.resolvedSelection.value" class="grid gap-2">
            <div class="polaris-selection-card">
              <strong>{{ usePolarisSession.selectedSection.value?.type ?? "Section" }}</strong>
              <span>{{ usePolarisSession.resolvedSelection.value?.kind }}</span>
              <p>Node: {{ usePolarisSession.resolvedSelection.value?.nodeId }}</p>
              <p>Section: {{ usePolarisSession.resolvedSelection.value?.sectionId }}</p>
              <p v-if="usePolarisSession.selectedSlot.value">Slot: {{ usePolarisSession.selectedSlot.value?.name }}</p>
            </div>

            <div v-if="usePolarisSession.selectedSection.value" class="flex flex-wrap gap-2">
              <button class="polaris-button" @click="usePolarisSession.moveSelectedSection(store, 'up')">Move Up</button>
              <button class="polaris-button" @click="usePolarisSession.moveSelectedSection(store, 'down')">Move Down</button>
              <button class="polaris-button" @click="usePolarisSession.duplicateSelectedSection(store)">Duplicate</button>
              <button class="polaris-button polaris-button-danger" @click="usePolarisSession.removeSelectedSection(store)">Remove</button>
            </div>
          </div>
          <p v-else class="text-xs text-muted">Select a mapped section or slot on the canvas to edit Polaris layers.</p>
        </section>
      </TabsContent>

      <TabsContent value="copy" class="polaris-tab-panel" :force-mount="true" :hidden="activeTab !== 'copy'">
        <section class="polaris-panel-block">
          <p class="polaris-label">Copy Layer</p>
          <template v-if="usePolarisSession.selectedSlot.value">
            <p class="mb-2 text-xs text-muted">{{ usePolarisSession.selectedSlot.value.name }}</p>
            <textarea
              class="polaris-textarea"
              :value="usePolarisSession.selectedCopy.value"
              @input="usePolarisSession.updateCopy(($event.target as HTMLTextAreaElement).value)"
            />
          </template>
          <p v-else class="text-xs text-muted">Select a mapped text or button slot to edit copy.</p>
        </section>
      </TabsContent>

      <TabsContent value="assets" class="polaris-tab-panel" :force-mount="true" :hidden="activeTab !== 'assets'">
        <section class="polaris-panel-block">
          <p class="polaris-label">Asset Layer</p>
          <template v-if="usePolarisSession.selectedAsset.value?.asset">
            <label class="polaris-field">
              <span>Source</span>
              <input
                class="polaris-input"
                :value="usePolarisSession.selectedAsset.value.asset.src"
                @input="usePolarisSession.updateAssetField('src', ($event.target as HTMLInputElement).value)"
              />
            </label>
            <label class="polaris-field">
              <span>Alt Text</span>
              <textarea
                class="polaris-textarea"
                :value="usePolarisSession.selectedAsset.value.asset.alt ?? ''"
                @input="usePolarisSession.updateAssetField('alt', ($event.target as HTMLTextAreaElement).value)"
              />
            </label>
          </template>
          <p v-else class="text-xs text-muted">Select an image slot on the canvas to edit its bound asset.</p>
        </section>
      </TabsContent>

      <TabsContent value="story" class="polaris-tab-panel" :force-mount="true" :hidden="activeTab !== 'story'">
        <section class="polaris-panel-block">
          <p class="polaris-label">Story Layer</p>
          <template v-if="usePolarisSession.selectedSection.value">
            <label class="polaris-field">
              <span>Intent</span>
              <textarea
                class="polaris-textarea"
                :value="usePolarisSession.selectedStory.value?.intent ?? ''"
                @input="usePolarisSession.updateStoryField('intent', ($event.target as HTMLTextAreaElement).value)"
              />
            </label>
            <label class="polaris-field">
              <span>Message</span>
              <textarea
                class="polaris-textarea"
                :value="usePolarisSession.selectedStory.value?.message ?? ''"
                @input="usePolarisSession.updateStoryField('message', ($event.target as HTMLTextAreaElement).value)"
              />
            </label>
          </template>
          <p v-else class="text-xs text-muted">Select a section frame to edit story intent and messaging.</p>
        </section>
      </TabsContent>
    </TabsRoot>

    <div class="flex min-h-0 shrink-0 flex-col border-t border-border" style="height: 44%">
      <div class="flex items-center justify-between border-b border-border px-3 py-2">
        <p class="text-xs text-muted">Live runtime preview</p>
        <a class="text-xs text-surface underline decoration-border underline-offset-4" :href="previewSrc" target="_blank" rel="noreferrer">
          Open
        </a>
      </div>
      <iframe
        ref="previewFrame"
        class="min-h-0 flex-1 border-0 bg-white"
        :src="previewSrc"
        title="Polaris Preview"
        @load="handlePreviewLoad"
      />
    </div>
  </aside>
</template>
