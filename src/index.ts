import { createBundleRendererCreator } from './bundle-renderer/create-bundle-renderer'
import { createRenderer } from './create-renderer'

process.env.REACT_ENV = 'server'

export { createRenderer }

export const createBundleRenderer = createBundleRendererCreator(createRenderer)
