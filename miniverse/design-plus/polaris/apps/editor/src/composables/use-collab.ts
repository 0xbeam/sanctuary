import { computed, inject, ref, type InjectionKey } from "vue"

import type { EditorStore } from "@/stores/editor"

export interface RemotePeer {
  clientId: number
  name: string
}

export interface CollabState {
  connected: boolean
  roomId: string | null
  peers: RemotePeer[]
  localName: string
}

export interface CollabController {
  state: ReturnType<typeof ref<CollabState>>
  remotePeers: ReturnType<typeof computed<RemotePeer[]>>
  followingPeer: ReturnType<typeof ref<number | null>>
  connect: (_roomId: string) => void
  disconnect: () => void
  setLocalName: (_name: string) => void
  updateCursor: (_x: number, _y: number, _pageId: string) => void
  updateSelection: (_selection: string[]) => void
  followPeer: (_peerId: number | null) => void
}

const createStubCollab = (): CollabController => {
  const state = ref<CollabState>({
    connected: false,
    roomId: null,
    peers: [],
    localName: "Polaris"
  })
  const followingPeer = ref<number | null>(null)

  return {
    state,
    remotePeers: computed(() => state.value.peers),
    followingPeer,
    connect: () => undefined,
    disconnect: () => undefined,
    setLocalName: (name) => {
      state.value = {
        ...state.value,
        localName: name
      }
    },
    updateCursor: () => undefined,
    updateSelection: () => undefined,
    followPeer: (peerId) => {
      followingPeer.value = peerId
    }
  }
}

export const COLLAB_KEY: InjectionKey<CollabController> = Symbol("polaris-collab")

export function useCollab(_store: EditorStore) {
  return createStubCollab()
}

export function useCollabInjected() {
  return inject(COLLAB_KEY, null)
}
