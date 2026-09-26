import {PackageIcon} from '@sanity/icons/Package'
import {TagIcon} from '@sanity/icons/Tag'
import {defineArrayMember, defineField, defineType} from 'sanity'

/** A kind of help Vouch supports. The description is Jev's option text during triage. */
export const category = defineType({
  name: 'category',
  title: 'Category',
  type: 'document',
  icon: TagIcon,
  fields: [
    defineField({name: 'title', type: 'string', validation: (rule) => rule.required().max(60)}),
    defineField({
      name: 'slug',
      type: 'slug',
      options: {source: 'title', maxLength: 40},
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'description',
      type: 'text',
      rows: 3,
      description:
        "Used verbatim as this option's text in Jev's category question. Editing it changes how requests are classified.",
      validation: (rule) => rule.required().min(20).max(300),
    }),
    defineField({
      name: 'order',
      type: 'number',
      description: 'Sort order in lists.',
      validation: (rule) => rule.integer().min(0),
    }),
  ],
  orderings: [{title: 'Sort order', name: 'orderAsc', by: [{field: 'order', direction: 'asc'}]}],
  preview: {select: {title: 'title', subtitle: 'description'}},
})

/** Something a household can ask for. Requests pick from this catalog; Jev never invents items. */
export const supplyItem = defineType({
  name: 'supplyItem',
  title: 'Supply item',
  type: 'document',
  icon: PackageIcon,
  fields: [
    defineField({name: 'name', type: 'string', validation: (rule) => rule.required().max(60)}),
    defineField({
      name: 'synonyms',
      type: 'array',
      of: [defineArrayMember({type: 'string'})],
      options: {layout: 'tags'},
      description:
        "Other words people use for it (\"nappies\", \"plasters\"). Included in Jev's catalog-match question.",
    }),
    defineField({
      name: 'category',
      type: 'reference',
      to: [{type: 'category'}],
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'unit',
      type: 'string',
      description: 'What one unit is, e.g. "5 lb bag" or "pack of 40".',
      validation: (rule) => rule.required().max(40),
    }),
    defineField({
      name: 'unitPrice',
      title: 'Estimated unit price (USD)',
      type: 'number',
      description:
        'Rough US retail estimate. Only used to show an approximate total; money never moves through Vouch.',
      validation: (rule) => rule.required().min(0).precision(2),
    }),
    defineField({
      name: 'maxPerHousehold',
      title: 'Max per household',
      type: 'number',
      description: 'The server caps requested quantities at this number.',
      validation: (rule) => rule.required().integer().min(1).max(50),
    }),
    defineField({
      name: 'active',
      type: 'boolean',
      initialValue: true,
      description: 'Inactive items are not offered to requesters or to Jev.',
    }),
  ],
  orderings: [{title: 'Name', name: 'nameAsc', by: [{field: 'name', direction: 'asc'}]}],
  preview: {
    select: {
      name: 'name',
      unit: 'unit',
      price: 'unitPrice',
      category: 'category.title',
      active: 'active',
    },
    prepare: ({name, unit, price, category, active}) => ({
      title: active === false ? `${name} (inactive)` : name,
      subtitle: [category, unit, typeof price === 'number' ? `~$${price.toFixed(2)}` : null]
        .filter(Boolean)
        .join(' · '),
    }),
  },
})
