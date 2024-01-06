import NativeModule, { createRequire } from 'node:module'
import path from 'node:path'
import { type Context, Script } from 'node:vm'

import type { ReactElement } from 'react'
import _resolve from 'resolve'

import type { EvaluateModule, Module, UserContext } from '../types.js'
import { isObjectType } from '../util.js'

function createSandbox(context?: object) {
  const sandbox = {
    Buffer,
    console,
    process,
    setTimeout,
    setInterval,
    setImmediate,
    clearTimeout,
    clearInterval,
    clearImmediate,
    __REACT_SSR_CONTEXT__: context,
  }
  // @ts-expect-error -- intended
  sandbox.global = sandbox
  return sandbox
}

export type Sandbox = ReturnType<typeof createSandbox>

// hack to bypass syntax error for commonjs
const getImportMetaUrl = () => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    return new Function('return import.meta.url')() as string
  } catch {
    // if `--experimental-vm-modules` is not enabled, the following error would be thrown:
    // `SyntaxError: Cannot use 'import.meta' outside a module`,
    // then we fallback to `process.cwd()` resolution which could fail actually,
    // but we're only trying to resolve `prettier` and `eslint-plugin-prettier` dependencies,
    // it would be fine enough
    return path.resolve(process.cwd(), '__test__.js')
  }
}

const cjsRequire =
  typeof require === 'undefined' ? createRequire(getImportMetaUrl()) : require

function compileModule(
  files: Record<string, string>,
  basedir?: string,
  runInNewContext?: boolean | 'once',
) {
  const compiledScripts: Partial<Record<string, Script>> = {}
  const resolvedModules: Record<string, string> = {}

  function getCompiledScript(filename: string) {
    if (compiledScripts[filename]) {
      return compiledScripts[filename]!
    }
    const code = files[filename]
    const wrapper = NativeModule.wrap(code)
    const script = new Script(wrapper, {
      filename,
      // @ts-expect-error -- compatibility
      displayErrors: true,
    })
    compiledScripts[filename] = script
    return script
  }

  function evaluateModule(
    filename: string,
    sandbox: Context,
    evaluatedFiles: Partial<Record<string, EvaluateModule>> = {},
  ) {
    if (evaluatedFiles[filename]) {
      return evaluatedFiles[filename]!
    }

    const script = getCompiledScript(filename)
    const compiledWrapper = (
      runInNewContext === false
        ? script.runInThisContext()
        : script.runInNewContext(sandbox)
    ) as (
      exports: object,
      require: (file: string) => unknown,
      module: Module,
    ) => void
    const m: Module<EvaluateModule> = {
      exports: {},
    }
    const r = <T>(file: string): T => {
      file = path.posix.join('.', file)
      if (files[file]) {
        return evaluateModule(file, sandbox, evaluatedFiles) as T
      }

      if (basedir) {
        return cjsRequire(
          resolvedModules[file] ||
            (resolvedModules[file] = _resolve.sync(file, { basedir })),
        ) as T
      }

      return cjsRequire(file) as T
    }

    compiledWrapper.call(m.exports, m.exports, r, m)

    const res = (('default' in m.exports &&
      // type-coverage:ignore-next-line -- FIXME: https://github.com/plantain-00/type-coverage/issues/133
      Object.prototype.hasOwnProperty.call(m.exports, 'default') &&
      m.exports.default) ||
      m.exports) as EvaluateModule
    evaluatedFiles[filename] = res

    return res
  }

  return evaluateModule
}

function deepClone<T>(val: T): T {
  if (isObjectType<T>(val)) {
    const res = {} as T
    for (const key in val) {
      res[key] = deepClone(val[key])
    }
    return res
  }

  if (Array.isArray(val)) {
    return [...val] as T
  }

  return val
}

// eslint-disable-next-line sonarjs/cognitive-complexity
export function createBundleRunner(
  entry: string,
  files: Record<string, string>,
  basedir?: string,
  runInNewContext?: boolean | 'once',
) {
  const evaluate = compileModule(files, basedir, runInNewContext)
  if (runInNewContext !== false && runInNewContext !== 'once') {
    // new context mode: creates a fresh context and re-evaluate the bundle
    // on each render. Ensures entire application state is fresh for each
    // render, but incurs extra evaluation cost.
    return (userContext: UserContext = {}) =>
      new Promise<ReactElement>(resolve => {
        userContext._registeredComponents = new Set()
        const res = evaluate(entry, createSandbox(userContext))
        resolve(typeof res === 'function' ? res(userContext) : res)
      })
  }
  // direct mode: instead of re-evaluating the whole bundle on
  // each render, it simply calls the exported function. This avoids the
  // module evaluation costs but requires the source code to be structured
  // slightly differently.
  let runner: ((userContext: UserContext) => ReactElement) | undefined // lazy creation so that errors can be caught by user
  let initialContext: {
    _styles?: Record<string, string>
    _renderStyles?: (styles: Record<string, string>) => string
  }
  return (userContext: UserContext = {}) =>
    new Promise<ReactElement>(resolve => {
      if (!runner) {
        const sandbox = (
          runInNewContext === 'once' ? createSandbox() : global
        ) as Sandbox
        // the initial context is only used for collecting possible non-component
        // styles injected by react-style-loader.
        initialContext = sandbox.__REACT_SSR_CONTEXT__ = {}
        const module = evaluate(entry, sandbox)
        // On subsequent renders, __REACT_SSR_CONTEXT__ will not be available
        // to prevent cross-request pollution.
        delete sandbox.__REACT_SSR_CONTEXT__
        if (typeof module !== 'function') {
          throw new TypeError(
            'bundle export should be a function when using ' +
              '{ runInNewContext: false }.',
          )
        }
        runner = module
      }

      userContext._registeredComponents = new Set()

      // react-style-loader styles imported outside of component lifecycle hooks
      if (initialContext._styles) {
        userContext._styles = deepClone(initialContext._styles)
        // #6353 ensure "styles" is exposed even if no styles are injected
        // in component lifecycles.
        // the renderStyles fn is exposed by react-style-loader >= 3.0.3
        const renderStyles = initialContext._renderStyles
        if (renderStyles) {
          Object.defineProperty(userContext, 'styles', {
            enumerable: true,
            get() {
              return renderStyles(userContext._styles!)
            },
          })
        }
      }

      resolve(runner(userContext))
    })
}
