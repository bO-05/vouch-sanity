import {ControlsIcon} from '@sanity/icons/Controls'
import {defineArrayMember, defineField, defineType} from 'sanity'

/**
 * Singleton (_id "policy"). Rules the server reads at runtime: thresholds, urgency wording,
 * flag questions and emergency resources. Edit and publish here; no redeploy needed.
 * Code owns the math; this document owns the numbers and the words Jev is asked about.
 */
export const policy = defineType({
  name: 'policy',
  title: 'Policy',
  type: 'document',
  icon: ControlsIcon,
  fields: [
    defineField({
      name: 'thresholds',
      type: 'policyThresholds',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'urgencyLevels',
      title: 'Urgency levels',
      type: 'array',
      of: [defineArrayMember({type: 'string'})],
      description:
        "Exactly four levels, least to most urgent (0-3). Sent verbatim to Jev as the levels of its urgency score.",
      validation: (rule) => rule.required().length(4),
    }),
    defineField({
      name: 'flagQuestions',
      title: 'Flag questions',
      type: 'array',
      of: [defineArrayMember({type: 'flagQuestion'})],
      description:
        'Yes/no questions Jev answers about every request. Any enabled flag at or above the threshold routes the request to a human.',
    }),
    defineField({
      name: 'emergencyResources',
      title: 'Emergency resources',
      type: 'text',
      rows: 6,
      description: 'Shown right away when an emergency flag fires.',
      validation: (rule) => rule.required(),
    }),
  ],
  preview: {prepare: () => ({title: 'Policy'})},
})
