import {DocumentTextIcon} from '@sanity/icons/DocumentText'
import {defineArrayMember, defineField, defineType} from 'sanity'
import {LANGUAGES, NEED_STAGES, URGENCY_LEVELS} from './constants'
import {noContactInfo} from './validation'

/**
 * A neighbor asking for help.
 *
 * The trust gate is Sanity's draft/published model: a request is created as a draft
 * (`drafts.<id>`, invisible to the public dataset) and is published only by the Vouch lifecycle,
 * after Jev's triage passes the policy thresholds or a volunteer verifier approves it.
 * Published means verified. The Studio cannot publish requests by hand (see sanity.config.ts).
 */
export const need = defineType({
  name: 'need',
  title: 'Request',
  type: 'document',
  icon: DocumentTextIcon,
  groups: [
    {name: 'request', title: 'Request', default: true},
    {name: 'checklist', title: 'Checklist'},
    {name: 'lifecycle', title: 'Lifecycle'},
  ],
  fields: [
    defineField({
      name: 'title',
      type: 'string',
      group: 'request',
      readOnly: true,
      description: "Short headline in the requester's own words. Only the requester can change it.",
      validation: (rule) => [rule.required().max(80), rule.custom(noContactInfo).warning()],
    }),
    defineField({
      name: 'story',
      type: 'text',
      rows: 6,
      group: 'request',
      readOnly: true,
      description:
        "The requester's own words, stored verbatim. Vouch never rewrites, translates or summarizes them. Only the requester can change them.",
      validation: (rule) => [rule.required().min(20).max(2000), rule.custom(noContactInfo).warning()],
    }),
    defineField({
      name: 'language',
      type: 'string',
      group: 'request',
      options: {list: LANGUAGES},
      initialValue: 'en',
      description: 'Language the request was written or spoken in. Non-English requests go to a bilingual verifier.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'displayName',
      title: 'Display name',
      type: 'string',
      group: 'request',
      readOnly: true,
      description: 'First name or nickname only. No surnames, phone numbers or addresses.',
      validation: (rule) => [rule.required().max(40), rule.custom(noContactInfo).warning()],
    }),
    defineField({
      name: 'city',
      type: 'string',
      group: 'request',
      validation: (rule) => rule.required().max(60),
    }),
    defineField({
      name: 'country',
      type: 'string',
      group: 'request',
      validation: (rule) => rule.required().max(60),
    }),
    defineField({
      name: 'location',
      type: 'geopoint',
      group: 'request',
      description: 'Approximate city-level point for the map. Never a home address.',
    }),
    defineField({
      name: 'category',
      type: 'reference',
      to: [{type: 'category'}],
      group: 'checklist',
      description: 'Chosen by Jev during triage, or by a verifier.',
    }),
    defineField({
      name: 'urgency',
      type: 'number',
      group: 'checklist',
      options: {list: URGENCY_LEVELS, layout: 'radio', direction: 'horizontal'},
      description: 'Scored by Jev during triage against the level texts in the Policy document.',
      validation: (rule) => rule.integer().min(0).max(3),
    }),
    defineField({
      name: 'items',
      title: 'Checklist',
      type: 'array',
      group: 'checklist',
      of: [defineArrayMember({type: 'needItem'})],
      description: 'Picked from the supply catalog. Donors pledge against these lines.',
      validation: (rule) => rule.max(12),
    }),
    defineField({
      name: 'stage',
      type: 'string',
      group: 'lifecycle',
      readOnly: true,
      initialValue: 'intake',
      options: {list: NEED_STAGES},
      description: 'Set by the lifecycle on the server. Not edited by hand.',
      validation: (rule) => rule.required(),
    }),
    defineField({name: 'triage', type: 'triageSummary', group: 'lifecycle'}),
    defineField({name: 'submittedAt', type: 'datetime', group: 'lifecycle', readOnly: true}),
    defineField({
      name: 'publishedAt',
      title: 'Verified and published at',
      type: 'datetime',
      group: 'lifecycle',
      readOnly: true,
    }),
    defineField({name: 'fulfilledAt', type: 'datetime', group: 'lifecycle', readOnly: true}),
    defineField({
      name: 'isDemo',
      title: 'Demo data',
      type: 'boolean',
      group: 'lifecycle',
      initialValue: false,
      description:
        'A sample request written by the Vouch team for the demo, not a real person. Shown with a "Demo" label.',
    }),
  ],
  orderings: [
    {title: 'Newest first', name: 'submittedDesc', by: [{field: 'submittedAt', direction: 'desc'}]},
    {
      title: 'Most urgent first',
      name: 'urgencyDesc',
      by: [
        {field: 'urgency', direction: 'desc'},
        {field: 'submittedAt', direction: 'asc'},
      ],
    },
  ],
  preview: {
    select: {
      title: 'title',
      displayName: 'displayName',
      city: 'city',
      stage: 'stage',
      isDemo: 'isDemo',
    },
    prepare: ({title, displayName, city, stage, isDemo}) => ({
      title: title ?? 'Untitled request',
      subtitle: [isDemo ? 'Demo' : null, displayName, city, stage].filter(Boolean).join(' · '),
    }),
  },
})
