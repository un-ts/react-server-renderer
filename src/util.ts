import _ from 'lodash'

import type { File } from './types.js'

export const getFilename = (file: File) =>
  typeof file === 'string' ? file : file.name

export const isJS = (file: File): boolean =>
  /\.js(?:\?[^.]+)?$/.test(getFilename(file))

export const isCSS = (file: File): boolean =>
  /\.css(?:\?[^.]+)?$/.test(getFilename(file))

// eslint-disable-next-line @typescript-eslint/unbound-method
export const isObjectType = _.isPlainObject as <T>(
  value: unknown,
) => value is T & object

export function createPromiseCallback() {
  let resolve: (res: string) => void
  let reject: (err: Error) => void
  const promise = new Promise<string>((_resolve, _reject) => {
    resolve = _resolve
    reject = _reject
  })
  const cb = (err: Error | null, res?: string) => {
    if (err) {
      return reject(err)
    }
    resolve(res || '')
  }
  return { promise, cb }
}
