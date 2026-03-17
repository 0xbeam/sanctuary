<script setup lang="ts">
import { computed } from "vue"

import { usePolarisSession } from "@/polaris/session"
import { useEditorStore } from "@/stores/editor"

const store = useEditorStore()

const currentPageName = computed(() => usePolarisSession.activePage.value?.name ?? "Untitled page")
</script>

<template>
  <div class="shrink-0 border-b border-border">
    <div class="flex items-center gap-2 px-3 py-2">
      <div class="flex size-8 items-center justify-center rounded-xl border border-border bg-hover text-surface">
        <icon-lucide-pencil-ruler class="size-4" />
      </div>
      <div class="min-w-0 flex-1">
        <p class="truncate text-xs font-semibold text-surface">{{ store.state.documentName }}</p>
        <p class="truncate text-[11px] text-muted">{{ currentPageName }}</p>
      </div>
      <button
        class="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-hover hover:text-surface"
        title="Toggle UI"
        @click="store.state.showUI = !store.state.showUI"
      >
        <icon-lucide-sidebar class="size-4" />
      </button>
    </div>
  </div>
</template>
