import hash from 'hash-sum'
import uniq from 'lodash.uniq'
import { isCSS, isJS, onEmit } from './util'

export class ReactSSRClientPlugin {
  options: {
    filename?: string
  }

  constructor(options = {}) {
    this.options = Object.assign(
      {
        filename: 'react-ssr-client-manifest.json',
      },
      options,
    )
  }

  apply(compiler) {
    onEmit(compiler, 'react-client-plugin', (compilation, cb) => {
      const stats = compilation.getStats().toJson()

      const allFiles = uniq<string>(stats.assets.map(a => a.name))

      const initialFiles = uniq(
        Object.keys(stats.entrypoints)
          .map(name => stats.entrypoints[name].assets)
          .reduce((assets, all) => all.concat(assets), [])
          .filter(file => isJS(file) || isCSS(file)),
      )

      const asyncFiles = allFiles
        .filter(file => isJS(file) || isCSS(file))
        .filter(file => initialFiles.indexOf(file) < 0)

      const manifest = {
        publicPath: stats.publicPath,
        all: allFiles,
        initial: initialFiles,
        async: asyncFiles,
        modules: {
          /* [identifier: string]: Array<index: number> */
        },
      }

      const assetModules = stats.modules.filter(m => m.assets.length)
      const fileToIndex = file => manifest.all.indexOf(file)
      stats.modules.forEach(m => {
        // ignore modules duplicated in multiple chunks
        if (m.chunks.length === 1) {
          const cid = m.chunks[0]
          const chunk = stats.chunks.find(c => c.id === cid)
          if (!chunk || !chunk.files) {
            return
          }
          const id = m.identifier.replace(/\s\w+$/, '') // remove appended hash
          const files = (manifest.modules[hash(id)] = chunk.files.map(
            fileToIndex,
          ))
          // find all asset modules associated with the same chunk
          assetModules.forEach(module => {
            if (module.chunks.some(chunkId => chunkId === cid)) {
              files.push.apply(files, module.assets.map(fileToIndex))
            }
          })
        }
      })

      // const debug = (file, obj) => {
      //   require('fs').writeFileSync(__dirname + '/' + file, JSON.stringify(obj, null, 2))
      // }
      // debug('stats.json', stats)
      // debug('client-manifest.json', manifest)

      const json = JSON.stringify(manifest, null, 2)
      compilation.assets[this.options.filename] = {
        source: () => json,
        size: () => json.length,
      }
      cb()
    })
  }
}
