import * as canvasKitModule from "../../../../node_modules/canvaskit-wasm/bin/canvaskit.js"

const CanvasKitInit =
  (canvasKitModule as { default?: typeof canvasKitModule }).default ?? canvasKitModule

export default CanvasKitInit
export type * from "canvaskit-wasm"
