import fs from 'node:fs'
import path from 'node:path'
import { PassThrough } from 'node:stream'

import type { SourceMapConsumer } from 'source-map'

import type {
  Callback,
  RenderBundle,
  RenderOptions,
  Renderer,
  UserContext,
} from '../types.js'
import { createPromiseCallback } from '../util.js'

import { createBundleRunner } from './create-bundle-runner.js'
import {
  createSourceMapConsumers,
  rewriteErrorTrace,
} from './source-map-support.js'

const INVALID_MSG =
  'Invalid server-rendering bundle format. Should be a string ' +
  'or a bundle Object of type:\n\n' +
  `{
  entry: string;
  files: Record<string, string>;
  maps: Record<string, string>;
}\n`

export function createBundleRendererCreator(
  createRenderer: (options?: RenderOptions) => Renderer,
) {
  // eslint-disable-next-line sonarjs/cognitive-complexity
  return function createBundleRenderer(
    bundle: RenderBundle | string,
    rendererOptions: RenderOptions = {},
  ) {
    let files: Record<string, string>
    let entry: string
    let maps: Record<string, Promise<SourceMapConsumer>>

    let { basedir, runInNewContext, template } = rendererOptions

    // load bundle if given filepath
    if (
      typeof bundle === 'string' &&
      /\.js(?:on)?$/.test(bundle) &&
      path.isAbsolute(bundle)
    ) {
      if (fs.existsSync(bundle)) {
        const isJSON = bundle.endsWith('.json')
        basedir = basedir || path.dirname(bundle)
        bundle = fs.readFileSync(bundle, 'utf8')
        if (isJSON) {
          const bundleFile = bundle
          try {
            bundle = JSON.parse(bundle) as RenderBundle | string
          } catch {
            throw new Error(`Invalid JSON bundle file: ${bundleFile}`)
          }
        }
      } else {
        throw new Error(`Cannot locate bundle file: ${bundle}`)
      }
    }

    if (typeof bundle === 'object') {
      entry = bundle.entry
      files = bundle.files
      basedir = basedir || bundle.basedir
      maps = createSourceMapConsumers(bundle.maps)
      if (typeof entry !== 'string' || typeof files !== 'object') {
        throw new TypeError(INVALID_MSG)
      }
    } else if (typeof bundle === 'string') {
      entry = '__react_ssr_bundle__'
      files = { __react_ssr_bundle__: bundle }
      maps = {}
    } else {
      throw new TypeError(INVALID_MSG)
    }

    const renderer = createRenderer(rendererOptions)

    const run = createBundleRunner(entry, files, basedir, runInNewContext)

    return {
      renderToString: (
        context?: Callback<string> | UserContext,
        cb?: Callback<string>,
      ) => {
        if (typeof context === 'function') {
          cb = context
          context = {}
        }

        let promise: Promise<string> | undefined

        if (!cb) {
          ;({ promise, cb } = createPromiseCallback())
        }

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        run(context)
          .catch((err: Error | null) => {
            rewriteErrorTrace(err, maps)
            cb!(err)
          })
          .then(app => {
            if (app) {
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              renderer.renderToString!(
                app,
                context as UserContext,
                (err, res) => {
                  rewriteErrorTrace(err, maps)
                  cb!(err, res)
                },
              )
            }
          })

        return promise
      },

      renderToStream: (context: UserContext = {}) => {
        const res = new PassThrough()
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        run(context)
          .catch((err: Error) => {
            rewriteErrorTrace(err, maps)
            // avoid emitting synchronously before user can
            // attach error listener
            process.nextTick(() => {
              res.emit('error', err)
            })
          })
          .then(app => {
            if (app) {
              const renderStream = renderer.renderToStream(app, context)

              renderStream.on('error', (err: Error) => {
                rewriteErrorTrace(err, maps)
                res.emit('error', err)
              })

              // relay HTMLStream special events
              if (template) {
                renderStream
                  .on('afterRender', () => res.emit('afterRender'))
                  .on('beforeStart', () => res.emit('beforeStart'))
                  .on('beforeEnd', (...args: unknown[]) =>
                    res.emit('beforeEnd', ...args),
                  )
              }

              renderStream.pipe(res)
            }
          })

        return res
      },
    }
  }
}
