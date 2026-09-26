import {visionTool} from '@sanity/vision'
import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {schemaTypes} from './schemaTypes'
import {API_VERSION} from './schemaTypes/constants'
import {structure} from './structure'

/**
 * Created only by the Vouch server (intake, lifecycle, pledges, Jev calls), never by hand here.
 * Requests come in through the app so every one of them goes through triage.
 */
const SERVER_CREATED_TYPES = new Set([
  'need',
  'pledge',
  'proof',
  'certificate',
  'decision',
  'review',
  'policy',
])

export default defineConfig({
  name: 'default',
  title: 'Vouch',

  projectId: 'o8hcpsct',
  dataset: 'production',

  plugins: [structureTool({structure}), visionTool({defaultApiVersion: API_VERSION})],

  schema: {
    types: schemaTypes,
    templates: (templates) =>
      templates.filter(({schemaType}) => !SERVER_CREATED_TYPES.has(schemaType)),
  },

  document: {
    actions: (actions, {schemaType}) => {
      // Policy is a singleton: edit and publish it, but never delete or duplicate it.
      if (schemaType === 'policy') {
        return actions.filter(
          ({action}) => action === 'publish' || action === 'discardChanges' || action === 'restore',
        )
      }
      // Publishing a request means "verified". Only the lifecycle (server) may do that,
      // after Jev's triage passes the policy thresholds or a volunteer verifier approves.
      if (schemaType === 'need') {
        return actions.filter(
          ({action}) =>
            action !== 'publish' &&
            action !== 'unpublish' &&
            action !== 'duplicate' &&
            action !== 'schedule',
        )
      }
      return actions.filter(({action}) => action !== 'duplicate')
    },
  },
})
