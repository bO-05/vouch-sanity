// @sanity/icons v5: import each icon from its own subpath (the root entry no longer exports them).
import {ActivityIcon} from '@sanity/icons/Activity'
import {BulbOutlineIcon} from '@sanity/icons/BulbOutline'
import {CheckmarkCircleIcon} from '@sanity/icons/CheckmarkCircle'
import {ClockIcon} from '@sanity/icons/Clock'
import {CloseCircleIcon} from '@sanity/icons/CloseCircle'
import {ControlsIcon} from '@sanity/icons/Controls'
import {DocumentsIcon} from '@sanity/icons/Documents'
import {InboxIcon} from '@sanity/icons/Inbox'
import {PackageIcon} from '@sanity/icons/Package'
import type {StructureBuilder, StructureResolver} from 'sanity/structure'
import {API_VERSION, DECISION_KINDS} from './schemaTypes/constants'

/** A list of requests in the given lifecycle stages (drafts and published alike). */
function needsInStages(S: StructureBuilder, title: string, stages: string[]) {
  return S.documentList()
    .title(title)
    .schemaType('need')
    .apiVersion(API_VERSION)
    .filter('_type == "need" && stage in $stages')
    .params({stages})
    .defaultOrdering([{field: 'submittedAt', direction: 'asc'}])
}

export const structure: StructureResolver = (S) =>
  S.list()
    .title('Vouch')
    .items([
      S.listItem()
        .id('review-inbox')
        .title('Review inbox')
        .icon(InboxIcon)
        .child(needsInStages(S, 'Waiting for a verifier', ['review', 'proof_review'])),
      S.listItem()
        .id('live')
        .title('Live requests')
        .icon(ActivityIcon)
        .child(needsInStages(S, 'Live: collecting pledges or proof', ['open', 'proof_check'])),
      S.listItem()
        .id('fulfilled')
        .title('Fulfilled')
        .icon(CheckmarkCircleIcon)
        .child(needsInStages(S, 'Fulfilled', ['fulfilled'])),
      S.listItem()
        .id('not-live')
        .title('Sent back and rejected')
        .icon(CloseCircleIcon)
        .child(needsInStages(S, 'Sent back and rejected', ['sent_back', 'rejected'])),
      S.listItem()
        .id('intake')
        .title('Intake and triage')
        .icon(ClockIcon)
        .child(needsInStages(S, 'Not decided yet', ['intake', 'triage'])),
      S.documentTypeListItem('need').title('All requests').icon(DocumentsIcon),
      S.divider(),
      S.documentTypeListItem('pledge').title('Pledges'),
      S.documentTypeListItem('proof').title('Proofs'),
      S.documentTypeListItem('certificate').title('Certificates'),
      S.divider(),
      S.listItem()
        .id('decisions')
        .title('Jev decisions')
        .icon(BulbOutlineIcon)
        .child(
          S.list()
            .title('Jev decisions')
            .items([
              S.listItem()
                .id('decisions-all')
                .title('All decisions')
                .child(
                  S.documentTypeList('decision')
                    .title('All decisions')
                    .defaultOrdering([{field: 'createdAt', direction: 'desc'}]),
                ),
              S.divider(),
              ...DECISION_KINDS.map((kind) =>
                S.listItem()
                  .id(`decisions-${kind.value}`)
                  .title(kind.title)
                  .child(
                    S.documentList()
                      .title(kind.title)
                      .schemaType('decision')
                      .apiVersion(API_VERSION)
                      .filter('_type == "decision" && kind == $kind')
                      .params({kind: kind.value})
                      .defaultOrdering([{field: 'createdAt', direction: 'desc'}]),
                  ),
              ),
            ]),
        ),
      S.documentTypeListItem('review').title('Human reviews'),
      S.divider(),
      S.listItem()
        .id('catalog')
        .title('Catalog')
        .icon(PackageIcon)
        .child(
          S.list()
            .title('Catalog')
            .items([
              S.documentTypeListItem('category').title('Categories'),
              S.documentTypeListItem('supplyItem').title('Supply items'),
            ]),
        ),
      S.listItem()
        .id('policy')
        .title('Policy')
        .icon(ControlsIcon)
        .child(S.document().schemaType('policy').documentId('policy').title('Policy')),
    ])
