import {BillIcon} from '@sanity/icons/Bill'
import {HashIcon} from '@sanity/icons/Hash'
import {HeartIcon} from '@sanity/icons/Heart'
import {defineArrayMember, defineField, defineType} from 'sanity'
import {PLEDGE_STATUSES, PROOF_VERDICTS} from './constants'
import {noContactInfo} from './validation'

/** A donor promising some units of one checklist line. Goods or money move off-platform. */
export const pledge = defineType({
  name: 'pledge',
  title: 'Pledge',
  type: 'document',
  icon: HeartIcon,
  fields: [
    defineField({
      name: 'need',
      title: 'Request',
      type: 'reference',
      to: [{type: 'need'}],
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'itemKey',
      title: 'Checklist line key',
      type: 'string',
      description: 'The `_key` of the checklist line in the request.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'quantity',
      type: 'number',
      validation: (rule) => rule.required().integer().min(1),
    }),
    defineField({
      name: 'donorDisplayName',
      title: 'Donor display name',
      type: 'string',
      validation: (rule) => [rule.required().max(40), rule.custom(noContactInfo).warning()],
    }),
    defineField({
      name: 'status',
      type: 'string',
      options: {list: PLEDGE_STATUSES, layout: 'radio'},
      initialValue: 'pledged',
      validation: (rule) => rule.required(),
    }),
    defineField({name: 'pledgedAt', type: 'datetime', readOnly: true}),
    defineField({name: 'isDemo', title: 'Demo data', type: 'boolean', initialValue: false}),
  ],
  orderings: [{title: 'Newest first', name: 'pledgedDesc', by: [{field: 'pledgedAt', direction: 'desc'}]}],
  preview: {
    select: {
      donor: 'donorDisplayName',
      quantity: 'quantity',
      status: 'status',
      needTitle: 'need.title',
      isDemo: 'isDemo',
    },
    prepare: ({donor, quantity, status, needTitle, isDemo}) => ({
      title: `${donor ?? 'Someone'} pledged ${quantity ?? '?'}`,
      subtitle: [isDemo ? 'Demo' : null, needTitle, status].filter(Boolean).join(' · '),
    }),
  },
})

/**
 * A receipt showing a request was fulfilled.
 * OCR runs in the uploader's browser (Tesseract.js); the uploader corrects the lines;
 * Jev picks which checklist item each line bought; code assigns matches, computes coverage and gates.
 *
 * This document is public (the dataset is). The photo and the raw OCR text are NOT stored here:
 * they live in a private `receiptScan` document that only the server (and so the verifier desk) reads.
 */
export const proof = defineType({
  name: 'proof',
  title: 'Proof',
  type: 'document',
  icon: BillIcon,
  fields: [
    defineField({
      name: 'need',
      title: 'Request',
      type: 'reference',
      to: [{type: 'need'}],
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'uploaderDisplayName',
      title: 'Uploaded by (display name)',
      type: 'string',
      readOnly: true,
      validation: (rule) => [rule.max(40), rule.custom(noContactInfo).warning()],
    }),
    defineField({
      name: 'lines',
      title: 'Receipt lines',
      type: 'array',
      of: [defineArrayMember({type: 'receiptLine'})],
      readOnly: true,
      description: "Lines after the uploader's corrections. These, not the raw OCR, are what Jev compares.",
    }),
    defineField({
      name: 'imageSha256',
      title: 'Photo SHA-256',
      type: 'string',
      readOnly: true,
      description: 'Hash of the uploaded photo (computed by the server). The photo itself is private.',
    }),
    defineField({
      name: 'receiptProbability',
      type: 'number',
      readOnly: true,
      description: "Jev's probability that the text is a store receipt at all.",
      validation: (rule) => rule.min(0).max(1),
    }),
    defineField({
      name: 'matches',
      type: 'array',
      of: [defineArrayMember({type: 'proofMatch'})],
      readOnly: true,
    }),
    defineField({
      name: 'coverage',
      type: 'number',
      readOnly: true,
      description: 'Share of checklist lines matched to a receipt line, computed by code.',
      validation: (rule) => rule.min(0).max(1),
    }),
    defineField({
      name: 'verdict',
      type: 'string',
      readOnly: true,
      initialValue: 'pending',
      options: {list: PROOF_VERDICTS},
    }),
    defineField({
      name: 'reasons',
      type: 'array',
      of: [defineArrayMember({type: 'string'})],
      readOnly: true,
      description: 'Why it went to a verifier. Composed by code from the answers and the policy, never by a model.',
    }),
    defineField({name: 'checkedAt', type: 'datetime', readOnly: true}),
    defineField({
      name: 'decision',
      title: 'Jev decision',
      type: 'reference',
      to: [{type: 'decision'}],
      weak: true,
      readOnly: true,
    }),
    defineField({name: 'submittedAt', type: 'datetime', readOnly: true}),
    defineField({name: 'isDemo', title: 'Demo data', type: 'boolean', initialValue: false}),
  ],
  preview: {
    select: {needTitle: 'need.title', verdict: 'verdict', coverage: 'coverage'},
    prepare: ({needTitle, verdict, coverage}) => ({
      title: needTitle ? `Receipt for “${needTitle}”` : 'Receipt',
      subtitle: [verdict, typeof coverage === 'number' ? `${Math.round(coverage * 100)}% covered` : null]
        .filter(Boolean)
        .join(' · '),
    }),
  },
})

/**
 * The private half of a proof: the downscaled photo (a JPEG data URL) and Tesseract's raw text.
 * Stored under a dotted id (`receipt-scan.<id>`), which the public dataset never exposes. A Sanity
 * image asset would not do: asset files are served to anyone with the URL, and asset documents in a
 * public dataset can be listed. Verifiers see the photo on the desk, through the server.
 */
export const receiptScan = defineType({
  name: 'receiptScan',
  title: 'Receipt scan (private)',
  type: 'document',
  icon: BillIcon,
  readOnly: true,
  fields: [
    defineField({name: 'proof', type: 'reference', to: [{type: 'proof'}], weak: true}),
    defineField({name: 'need', title: 'Request', type: 'reference', to: [{type: 'need'}], weak: true}),
    defineField({
      name: 'image',
      title: 'Photo (JPEG data URL)',
      type: 'string',
      hidden: true,
      description: 'Downscaled in the uploader’s browser before upload.',
    }),
    defineField({name: 'imageSha256', title: 'Photo SHA-256', type: 'string'}),
    defineField({
      name: 'ocrText',
      title: 'Raw OCR text',
      type: 'text',
      rows: 8,
      description: "Tesseract.js output from the uploader's browser, before corrections.",
    }),
    defineField({name: 'createdAt', type: 'datetime'}),
  ],
  preview: {
    select: {sha: 'imageSha256', createdAt: 'createdAt'},
    prepare: ({sha, createdAt}) => ({
      title: 'Receipt scan',
      subtitle: [createdAt, typeof sha === 'string' ? `sha256 ${sha.slice(0, 12)}…` : null].filter(Boolean).join(' · '),
    }),
  },
})

/** Issued when a request is fulfilled. Anyone can recompute the hash in their browser. */
export const certificate = defineType({
  name: 'certificate',
  title: 'Certificate',
  type: 'document',
  icon: HashIcon,
  readOnly: true,
  fields: [
    defineField({
      name: 'need',
      title: 'Request',
      type: 'reference',
      to: [{type: 'need'}],
      validation: (rule) => rule.required(),
    }),
    defineField({name: 'proof', title: 'Receipt', type: 'reference', to: [{type: 'proof'}], weak: true}),
    defineField({
      name: 'payload',
      type: 'text',
      rows: 10,
      description: 'Canonical JSON (sorted keys, no whitespace) of what was verified.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'sha256',
      title: 'SHA-256',
      type: 'string',
      description: 'Hex SHA-256 of the payload, recomputable in the browser with Web Crypto.',
      validation: (rule) => rule.required().regex(/^[a-f0-9]{64}$/, {name: 'sha256 hex'}),
    }),
    defineField({name: 'issuedAt', type: 'datetime'}),
  ],
  preview: {
    select: {needTitle: 'need.title', sha256: 'sha256'},
    prepare: ({needTitle, sha256}) => ({
      title: needTitle ?? 'Certificate',
      subtitle: typeof sha256 === 'string' ? `sha256 ${sha256.slice(0, 16)}…` : undefined,
    }),
  },
})
