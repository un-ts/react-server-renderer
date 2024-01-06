import {
  type RawSourceMap,
  SourceMapConsumer,
  type RawIndexMap,
} from 'source-map'

const filenameRE = /\(([^)]+\.js):(\d+):(\d+)\)$/

export function createSourceMapConsumers(
  rawMaps: Record<string, RawIndexMap | RawSourceMap>,
) {
  const maps: Record<string, Promise<SourceMapConsumer>> = {}
  for (const file of Object.keys(rawMaps)) {
    maps[file] = new SourceMapConsumer(rawMaps[file])
  }
  return maps
}

export function rewriteErrorTrace(
  err: Error | null,
  mapConsumers: Record<string, Promise<SourceMapConsumer>>,
) {
  if (err && typeof err.stack === 'string') {
    err.stack = err.stack
      .split('\n')
      .map(line => rewriteTraceLine(line, mapConsumers))
      .join('\n')
  }
}

async function rewriteTraceLine(
  trace: string,
  mapConsumers: Record<string, Promise<SourceMapConsumer>>,
) {
  const m = trace.match(filenameRE)
  const map = m && (await mapConsumers[m[1]])
  if (m != null && map) {
    const originalPosition = map.originalPositionFor({
      line: Number(m[2]),
      column: Number(m[3]),
    })
    if (originalPosition.source != null) {
      const { source, line, column } = originalPosition
      const mappedPosition = `(${source.replace(/^webpack:\/{3}/, '')}:${String(
        line,
      )}:${String(column)})`
      return trace.replace(filenameRE, mappedPosition)
    }
  }

  return trace
}
