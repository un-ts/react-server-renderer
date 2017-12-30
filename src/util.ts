export const isJS = (file: string): boolean => /\.js(\?[^.]+)?$/.test(file)

export const isCSS = (file: string): boolean => /\.css(\?[^.]+)?$/.test(file)

export function createPromiseCallback() {
  let resolve
  let reject
  // tslint:disable-next-line variable-name
  const promise: Promise<string> = new Promise((_resolve, _reject) => {
    resolve = _resolve
    reject = _reject
  })
  const cb = (err: Error, res?: string) => {
    if (err) {
      return reject(err)
    }
    resolve(res || '')
  }
  return { promise, cb }
}

export interface UserContext {
  asyncContext?: any
  head?: string
  styles?: string
  getPreloadFiles?: any
  url?: string
  _styles?: any
  _mappedFiles?: any
  _registeredComponents?: Set<any>
  [key: string]: any
}
