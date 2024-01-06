import { ReactElement } from 'react'
// eslint-disable-next-line sonar/deprecation -- compatibility
import { renderToNodeStream, renderToString } from 'react-dom/server'

import { TemplateRenderer } from './template-renderer/index.js'
import type {
  Callback,
  Renderer,
  TemplateRendererOptions,
  UserContext,
} from './types.js'
import { createPromiseCallback } from './util.js'

export function createRenderer(
  options: TemplateRendererOptions = {},
): Renderer {
  const templateRenderer = new TemplateRenderer(options)

  return {
    renderToString(
      component: ReactElement,
      context?: UserContext,
      cb?: Callback<string>,
    ): Promise<string> {
      if (typeof context === 'function') {
        cb = context
        context = {}
      }
      if (context) {
        templateRenderer.bindRenderFns(context)
      }

      // no callback, return Promise
      let promise!: Promise<string>

      if (!cb) {
        ;({ promise, cb } = createPromiseCallback())
      }

      let result: string

      try {
        result = renderToString(component)

        if (options.template) {
          result = templateRenderer.renderSync(result, context)
        }
        cb(null, result)
      } catch (err) {
        // eslint-disable-next-line n/no-callback-literal -- FIXME: https://github.com/eslint-community/eslint-plugin-n/issues/162
        cb(err as Error)
      }

      return promise
    },

    renderToStream(
      component: ReactElement,
      context: UserContext,
    ): NodeJS.ReadableStream {
      // eslint-disable-next-line sonar/deprecation -- compatibility
      const renderStream = renderToNodeStream(component)

      process.nextTick(() => renderStream.emit('afterRender'))

      if (!options.template) {
        return renderStream
      }

      templateRenderer.bindRenderFns(context)

      const templateStream = templateRenderer.createStream(context)

      renderStream
        .on('afterRender', () => templateStream.emit('afterRender'))
        .on('error', (err: unknown) => templateStream.emit('error', err))
        .pipe(templateStream)

      return templateStream
    },
  }
}
