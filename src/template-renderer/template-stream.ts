import { Transform } from 'node:stream'

import serialize from 'serialize-javascript'

import type { ParsedTemplate, UserContext } from '../types.js'

import { TemplateRenderer } from './index.js'

export default class TemplateStream extends Transform {
  declare started: boolean
  declare renderer: TemplateRenderer
  declare template: ParsedTemplate
  declare context: UserContext
  declare inject: boolean

  constructor(
    renderer: TemplateRenderer,
    template: ParsedTemplate,
    context?: UserContext,
  ) {
    super()
    this.started = false
    this.renderer = renderer
    this.template = template
    this.context = context || {}
    this.inject = renderer.inject
  }

  override _transform(
    data: Buffer | string,
    _encoding: string,
    done: () => void,
  ) {
    if (!this.started) {
      this.emit('beforeStart')
      this.start()
    }
    this.push(data)
    done()
  }

  start() {
    this.started = true
    this.push(this.template.head(this.context))

    if (this.inject) {
      // inline server-rendered head meta information
      if (this.context.head) {
        this.push(this.context.head)
      }

      // inline preload/prefetch directives for initial/async chunks
      const links = this.renderer.renderResourceHints(this.context)
      if (links) {
        this.push(links)
      }

      // CSS files and inline server-rendered CSS collected by react-style-loader
      const styles = this.renderer.renderStyles(this.context)
      if (styles) {
        this.push(styles)
      }
    }

    this.push(this.template.neck(this.context))

    if (this.inject) {
      this.push('<div id="app">')
    }
  }

  override _flush(done: () => void) {
    this.emit('beforeEnd', this.started)

    if (!this.started) {
      done()
      return
    }

    if (this.inject) {
      this.push('</div>')

      const { asyncContext } = this.context

      if (asyncContext) {
        this.push(
          `<script>window.ASYNC_COMPONENTS_STATE=${serialize(
            asyncContext.getState(),
          )}</script>`,
        )
      }

      // inline initial store state
      const state = this.renderer.renderState(this.context)
      if (state) {
        this.push(state)
      }

      // embed scripts needed
      const scripts = this.renderer.renderScripts(this.context)
      if (scripts) {
        this.push(scripts)
      }
    }

    this.push(this.template.tail(this.context))
    done()
  }
}
