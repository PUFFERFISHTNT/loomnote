/**
 * A read-only view of one note's folder, for the renderer.
 *
 * Notes embed figures with ordinary relative Markdown — `![](source/pages/p012.png)`
 * — because that is what makes the note portable: the same file renders in any
 * editor, and the images travel with it. The renderer cannot load those paths
 * itself (it lives on a different origin and has no filesystem access), so it
 * asks for them through a private scheme instead. The handler serves anything
 * inside the note's own folder and refuses everything else, which is what keeps
 * a model-written path from becoming a way to read the disk.
 *
 * @module
 */

import { protocol, net } from 'electron'
import { pathToFileURL } from 'node:url'
import type { NoteWorkspace } from './workspace.js'

/** Scheme the renderer uses for note-relative assets. */
export const WORKSPACE_SCHEME = 'loomnote-asset'

/** URL shape: `loomnote-asset://note/<noteId>/<note-relative path>`. */
export const WORKSPACE_HOST = 'note'

/**
 * Declare the scheme. Must run before `app.whenReady()`; a scheme that is not
 * registered as standard and secure is treated as opaque, and `fetch` on it
 * fails.
 */
export function registerWorkspaceScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: WORKSPACE_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, bypassCSP: false }
    }
  ])
}

/**
 * Build the URL the renderer should use for a note-relative asset.
 * @param noteId - owning note.
 * @param relPath - path inside the note folder, using `/` separators.
 */
export function assetUrl(noteId: string, relPath: string): string {
  const clean = relPath.replace(/^\.?\//, '').split(/[\\/]/).filter((part) => part && part !== '.').join('/')
  return `${WORKSPACE_SCHEME}://${WORKSPACE_HOST}/${encodeURIComponent(noteId)}/${clean.split('/').map(encodeURIComponent).join('/')}`
}

/**
 * Install the handler. Must run after the app is ready.
 * @param workspace - resolves note-relative paths against each note's folder.
 */
export function installWorkspaceProtocol(workspace: NoteWorkspace): void {
  protocol.handle(WORKSPACE_SCHEME, async (request) => {
    let url: URL
    try {
      url = new URL(request.url)
    } catch {
      return new Response('bad request', { status: 400 })
    }
    if (url.hostname !== WORKSPACE_HOST) return new Response('not found', { status: 404 })

    const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
    const noteId = segments.shift()
    if (!noteId || segments.length === 0) return new Response('not found', { status: 404 })

    const resolved = workspace.resolveAsset(noteId, segments.join('/'))
    if (!resolved) return new Response('forbidden', { status: 403 })
    try {
      return await net.fetch(pathToFileURL(resolved).toString())
    } catch {
      return new Response('not found', { status: 404 })
    }
  })
}
