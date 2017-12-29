// tslint:disable no-unused-variable
import { PassThrough } from 'stream'

import {
  RenderBundle,
  createBundleRendererCreator,
} from './bundle-renderer/create-bundle-renderer'
import { createRenderer } from './create-renderer'
import { TemplateRendererOptions } from './template-renderer'
import { UserContext } from './util'

process.env.REACT_ENV = 'server'

export { createRenderer }

export const createBundleRenderer = createBundleRendererCreator(createRenderer)
