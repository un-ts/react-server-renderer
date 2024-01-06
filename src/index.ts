import { createBundleRendererCreator } from './bundle-renderer/create-bundle-renderer.js'
import { createRenderer } from './create-renderer.js'

process.env.REACT_ENV = 'server'

export const createBundleRenderer = createBundleRendererCreator(createRenderer)

export { createRenderer } from './create-renderer.js'
export type * from './types.js'
