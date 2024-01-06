import path from 'node:path'

import serialize from 'serialize-javascript'

import type {
  ClientManifest,
  Resource,
  TemplateRendererOptions,
  AsyncFileMapper,
  ParsedTemplate,
  UserContext,
} from '../types.js'
import { isCSS, isJS } from '../util.js'

import { createMapper } from './create-async-file-mapper.js'
import { parseTemplate } from './parse-template.js'
import TemplateStream from './template-stream.js'

export class TemplateRenderer {
  options: TemplateRendererOptions
  inject: boolean
  parsedTemplate: ParsedTemplate | null
  publicPath?: string
  clientManifest?: ClientManifest
  preloadFiles?: Resource[]
  prefetchFiles?: Resource[]
  mapFiles?: AsyncFileMapper

  constructor(options: TemplateRendererOptions) {
    this.options = options
    this.inject = options.inject !== false
    // if no template option is provided, the renderer is created
    // as a utility object for rendering assets like preload links and scripts.
    this.parsedTemplate = options.template
      ? parseTemplate(options.template)
      : null

    // extra functionality with client manifest
    if (options.clientManifest) {
      const clientManifest = (this.clientManifest = options.clientManifest)
      this.publicPath = clientManifest.publicPath.replace(/\/$/, '')
      // preload/prefetch directives
      this.preloadFiles = (clientManifest.initial || []).map(normalizeFile)
      this.prefetchFiles = (clientManifest.async || []).map(normalizeFile)
      // initial async chunk mapping
      this.mapFiles = createMapper(clientManifest)
    }
  }

  bindRenderFns(context: UserContext) {
    for (const type of [
      'ResourceHints',
      'State',
      'Scripts',
      'Styles',
    ] as const) {
      context[`render${type}`] = this[`render${type}`].bind(this, context)
    }
    // also expose getPreloadFiles, useful for HTTP/2 push
    context.getPreloadFiles = this.getPreloadFiles.bind(this, context)
  }

  // render synchronously given rendered app content and render context
  renderSync(content: string, context: UserContext = {}) {
    const template = this.parsedTemplate
    if (!template) {
      throw new Error('renderSync cannot be called without a template.')
    }

    content = `<div id="app">${content}</div>`

    if (this.inject) {
      const { asyncContext, head } = context

      if (asyncContext) {
        content += `<script>window.ASYNC_COMPONENTS_STATE=${serialize(
          asyncContext.getState(),
        )}</script>`
      }

      return (
        template.head(context) +
        (head || '') +
        this.renderResourceHints(context) +
        this.renderStyles(context) +
        template.neck(context) +
        content +
        this.renderState(context) +
        this.renderScripts(context) +
        template.tail(context)
      )
    }
    return (
      template.head(context) +
      template.neck(context) +
      content +
      template.tail(context)
    )
  }

  renderStyles(context: { styles?: string }): string {
    const cssFiles = this.clientManifest
      ? this.clientManifest.all.filter(isCSS)
      : []
    return (
      // render links for css files
      (cssFiles.length > 0
        ? cssFiles
            .map(
              file =>
                `<link rel="stylesheet" href="${this.publicPath}/${file}">`,
            )
            .join('')
        : '') +
      // context.styles is a getter exposed by react-style-loader which contains
      // the inline component styles collected during SSR
      (context.styles || '')
    )
  }

  renderResourceHints(context: UserContext): string {
    return this.renderPreloadLinks(context) + this.renderPrefetchLinks(context)
  }

  getPreloadFiles(context: UserContext): Resource[] {
    const usedAsyncFiles = this.getUsedAsyncFiles(context)
    if (this.preloadFiles || usedAsyncFiles) {
      return [...(this.preloadFiles || []), ...(usedAsyncFiles || [])]
    }
    return []
  }

  renderPreloadLinks(context: UserContext): string {
    const files = this.getPreloadFiles(context)
    const shouldPreload = this.options.shouldPreload
    if (files.length > 0) {
      return files
        .map(({ file, extension, fileWithoutQuery, asType }) => {
          let extra = ''
          // by default, we only preload scripts or css
          if (!shouldPreload && asType !== 'script' && asType !== 'style') {
            return ''
          }
          // user wants to explicitly control what to preload
          if (shouldPreload && !shouldPreload(fileWithoutQuery, asType)) {
            return ''
          }
          if (asType === 'font') {
            extra = ` type="font/${extension}" crossorigin`
          }
          return `<link rel="preload" href="${this.publicPath}/${file}"${
            asType === '' ? '' : ` as="${asType}"`
          }${extra}>`
        })
        .join('')
    }
    return ''
  }

  renderPrefetchLinks(context: UserContext): string {
    const shouldPrefetch = this.options.shouldPrefetch
    if (this.prefetchFiles) {
      const usedAsyncFiles = this.getUsedAsyncFiles(context)
      const alreadyRendered = (file: string) => {
        return usedAsyncFiles && usedAsyncFiles.some(f => f.file === file)
      }
      return this.prefetchFiles
        .map(({ file, fileWithoutQuery, asType }) => {
          if (shouldPrefetch && !shouldPrefetch(fileWithoutQuery, asType)) {
            return ''
          }
          if (alreadyRendered(file)) {
            return ''
          }
          return `<link rel="prefetch" href="${this.publicPath}/${file}">`
        })
        .join('')
    }
    return ''
  }

  renderState(
    context: UserContext,
    options?: { contextKey?: string; windowKey?: string },
  ): string {
    const { contextKey = 'state', windowKey = '__INITIAL_STATE__' } =
      options || {}
    const state = serialize(context[contextKey], { isJSON: true })
    const autoRemove =
      process.env.NODE_ENV === 'production'
        ? ';(function(){var s;(s=document.currentScript||document.scripts[document.scripts.length-1]).parentNode.removeChild(s);}());'
        : ''
    return context[contextKey]
      ? `<script>window.${windowKey}=${state}${autoRemove}</script>`
      : ''
  }

  renderScripts(context: UserContext): string {
    if (this.clientManifest) {
      const initial = this.preloadFiles || []
      const async = this.getUsedAsyncFiles(context)
      const needed = [initial[0], ...(async || []), ...initial.slice(1)]
      return needed
        .filter(({ file }) => isJS(file))
        .map(({ file }) => {
          return `<script src="${this.publicPath}/${file}" defer></script>`
        })
        .join('')
    }
    return ''
  }

  getUsedAsyncFiles(context: UserContext) {
    if (
      !context._mappedFiles &&
      context._registeredComponents &&
      this.mapFiles
    ) {
      const registered = [...context._registeredComponents]
      context._mappedFiles = this.mapFiles(registered).map(normalizeFile)
    }
    return context._mappedFiles
  }

  // create a transform stream
  createStream(context?: UserContext): TemplateStream {
    if (!this.parsedTemplate) {
      throw new Error('createStream cannot be called without a template.')
    }
    return new TemplateStream(this, this.parsedTemplate, context)
  }
}

function normalizeFile(file: string): Resource {
  const withoutQuery = file.replace(/\?.*/, '')
  const extension = path.extname(withoutQuery).slice(1)
  return {
    file,
    extension,
    fileWithoutQuery: withoutQuery,
    asType: getPreloadType(extension),
  }
}

function getPreloadType(ext: string): string {
  if (ext === 'js') {
    return 'script'
  }
  if (ext === 'css') {
    return 'style'
  }
  if (/jpe?g|png|svg|gif|webp|ico/.test(ext)) {
    return 'image'
  }
  if (/woff2?|ttf|otf|eot/.test(ext)) {
    return 'font'
  }
  // not exhausting all possibilities here, but above covers common cases
  return ''
}
