/**
 * `@loomnote/harness` — LoomNote's agent layer, built on the DeepSeek Harness
 * runtime.
 *
 * The app does not reimplement an agent loop. It composes a DeepSeek Harness
 * profile, drives it over the runtime's published SDK protocol, and translates
 * the durable session log into the product's own event vocabulary. Everything
 * above this package — the Electron main process, the renderer, the note
 * workspace — speaks only `HarnessEvent`.
 *
 * @module
 */

export * from './types.js'
export * from './jsonrpc.js'
export * from './node-runtime.js'
export * from './stream-replay.js'
export * from './events.js'
export * from './ask.js'
export * from './profile.js'
export * from './session.js'
