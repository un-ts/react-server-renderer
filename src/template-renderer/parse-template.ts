import _ from 'lodash'

import type { ParsedTemplate } from '../types.js'

const compileOptions = {
  // eslint-disable-next-line regexp/strict, regexp/match-any
  escape: /{{([^{][\S\s]+?[^}])}}/g,
  // eslint-disable-next-line regexp/strict, regexp/match-any
  interpolate: /{{{([\S\s]+?)}}}/g,
}

export function parseTemplate(
  template: string,
  contentPlaceholder: string = '<div id="app"></div>',
): ParsedTemplate {
  if (typeof template === 'object') {
    return template
  }

  let i = template.indexOf('</head>')
  const j = template.indexOf(contentPlaceholder)

  if (j < 0) {
    throw new Error(`Content placeholder not found in template.`)
  }

  if (i < 0) {
    i = template.indexOf('<body>')
    if (i < 0) {
      i = j
    }
  }

  return {
    head: _.template(template.slice(0, i), compileOptions),
    neck: _.template(template.slice(i, j), compileOptions),
    tail: _.template(
      template.slice(j + contentPlaceholder.length),
      compileOptions,
    ),
  }
}
