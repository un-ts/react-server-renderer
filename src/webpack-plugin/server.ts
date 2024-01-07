import type { Compiler, WebpackPluginInstance, sources } from 'webpack'

import { isJS, onEmit, validate } from './util.js'

export class ReactSSRServerPlugin implements WebpackPluginInstance {
  options: {
    filename?: string
  }

  constructor(options = {}) {
    this.options = {
      filename: 'react-ssr-server-bundle.json',
      ...options,
    }
  }

  apply(compiler: Compiler) {
    validate(compiler)

    onEmit(compiler, 'react-server-plugin', (compilation, cb) => {
      const stats = compilation.getStats().toJson()
      const entryName = Object.keys(stats.entrypoints!)[0]
      const entryInfo = stats.entrypoints?.[entryName]

      if (!entryInfo) {
        // #5553
        return cb()
      }

      const entryAssets = entryInfo.assets!.filter(isJS)

      if (entryAssets.length > 1) {
        throw new Error(
          `Server-side bundle should have one single entry file. ` +
            `Avoid using CommonsChunkPlugin in the server config.`,
        )
      }

      const entry = entryAssets[0]
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!entry) {
        throw new Error(
          `Entry "${entryName}" not found. Did you specify the correct entry option?`,
        )
      }

      const bundle = {
        entry: typeof entry === 'string' ? entry : entry.name,
        files: {} as Record<string, Buffer | string>,
        maps: {} as Record<string, unknown>,
      }

      if (stats.assets)
        for (const asset of stats.assets) {
          if (asset.name.endsWith('.js')) {
            bundle.files[asset.name] = compilation.assets[asset.name].source()
          } else if (asset.name.endsWith('.js.map')) {
            bundle.maps[asset.name.replace(/\.map$/, '')] = JSON.parse(
              compilation.assets[asset.name].source().toString(),
            )
          }
          // do not emit anything else for server
          delete compilation.assets[asset.name]
        }

      const json = JSON.stringify(bundle, null, 2)
      const filename = this.options.filename

      compilation.assets[filename!] = {
        source: () => json,
        size: () => json.length,
      } as sources.Source

      cb()
    })
  }
}
