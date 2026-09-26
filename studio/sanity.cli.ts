import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  api: {
    projectId: 'o8hcpsct',
    dataset: 'production'
  },
  studioHost: 'vouch-aid',
  deployment: {
    appId: 'h4u1z9yazx543zhzvdop7hjd',
    /**
     * Enable auto-updates for studios.
     * Learn more at https://www.sanity.io/docs/studio/latest-version-of-sanity#k47faf43faf56
     */
    autoUpdates: false,
  },
})
