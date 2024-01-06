/**
 * Creates a mapper that maps components used during a server-side render
 * to async chunk files in the client-side build, so that we can inline them
 * directly in the rendered HTML to avoid waterfall requests.
 */

import type { AsyncFileMapper, ClientManifest } from '../types.js'

export function createMapper(clientManifest: ClientManifest): AsyncFileMapper {
  const map = createMap(clientManifest)
  // map server-side moduleIds to client-side files
  return function mapper(moduleIds: string[]): string[] {
    const res = new Set<string>()
    for (const moduleId of moduleIds) {
      const mapped = map.get(moduleId)
      if (mapped) {
        for (const item of mapped) {
          res.add(item)
        }
      }
    }
    return [...res]
  }
}

function createMap(clientManifest: ClientManifest) {
  const map = new Map<string, string[]>()
  for (const id of Object.keys(clientManifest.modules)) {
    map.set(id, mapIdToFile(id, clientManifest))
  }
  return map
}

function mapIdToFile(id: string, clientManifest: ClientManifest) {
  const files = []
  const fileIndices = clientManifest.modules[id]
  if (fileIndices) {
    for (const index of fileIndices) {
      const file = clientManifest.all[index]
      // only include async files or non-js assets
      if (clientManifest.async?.includes(file) || !/\.js(?:$|\?)/.test(file)) {
        files.push(file)
      }
    }
  }
  return files
}
