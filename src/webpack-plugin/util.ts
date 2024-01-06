import chalk from 'chalk'
import type { InnerCallback } from 'tapable'
import type { Compilation, Compiler } from 'webpack'

const { red, yellow } = chalk

const prefix = `[react-server-renderer-webpack-plugin]`
export const warn = (msg: string) => console.error(red(`${prefix} ${msg}\n`))
export const tip = (msg: string) => console.log(yellow(`${prefix} ${msg}\n`))

export const validate = (compiler: Compiler) => {
  if (compiler.options.target !== 'node') {
    warn('webpack config `target` should be "node".')
  }

  if (
    // @ts-expect-error -- compatibility
    compiler.options.output.libraryTarget !== 'commonjs2'
  ) {
    warn('webpack config `output.libraryTarget` should be "commonjs2".')
  }

  if (!compiler.options.externals) {
    tip(
      'It is recommended to externalize dependencies in the server build for ' +
        'better build performance.',
    )
  }
}

export const onEmit = (
  compiler: Compiler,
  name: string,
  hook: (
    compilation: Compilation,
    callback: InnerCallback<Error, void>,
  ) => void,
) => {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (compiler.hooks) {
    // Webpack >= 4.0.0
    compiler.hooks.emit.tapAsync(name, hook)
  } else {
    // Webpack < 4.0.0
    // @ts-expect-error -- compatibility
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    compiler.plugin('emit', hook)
  }
}

export { isCSS, isJS } from '../util.js'
