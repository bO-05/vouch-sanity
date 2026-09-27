import 'server-only'

import {createHash} from 'node:crypto'
import {errorMessage} from '@/lib/intake-context'
import {askJev} from '@/lib/jev'
import {
  buildProofQuestions,
  canonicalJson,
  certificateIdFor,
  gateProof,
  proofDecisionOutcome,
  proofState,
  type CheckedReceiptLine,
  type ProofChecklistLine,
  type ProofVerdict,
} from '@/lib/proof-match'
import {POLICY_QUERY} from '@/lib/queries'
import {getWriteClient} from '@/lib/sanity/write-client'
import {parsePolicy} from '@/lib/triage'
import {reviewDocId} from './publish-step'

/**
 * The receipt half of the lifecycle: `jev-proof` (Jev + the gate in code), `issue-certificate`
 * (canonical payload + SHA-256) and the verifier's accept / decline records. Handlers may run more
 * than once for one queued effect (at-least-once delivery), so each is idempotent. Any failure makes
 * the engine route to a verifier; nothing is ever marked verified without a verdict.
 */

const TIMEOUT_MS = 15_000

type NeedForProof = {
  _id: string
  items: Array<{
    _key: string
    quantity: number | null
    supplyId: string | null
    name: string | null
    unit: string | null
    synonyms: string[] | null
  }> | null
}

type ProofForMatch = {
  _id: string
  _rev: string
  needId: string | null
  verdict: string | null
  decisionId: string | null
  lines: Array<{text: string; amount: number | null; ocrSimilarity: number | null}> | null
}

const NEED_FOR_PROOF = `*[_type == "need" && _id == $id][0]{
  _id,
  "items": items[]{_key, quantity, "supplyId": supplyItem._ref, "name": supplyItem->name, "unit": supplyItem->unit, "synonyms": supplyItem->synonyms}
}`

const PROOF_FOR_MATCH = `*[_type == "proof" && _id == $id][0]{
  _id, _rev, "needId": need._ref, verdict, "decisionId": decision._ref, lines[]{text, amount, ocrSimilarity}
}`

function checklistFor(need: NeedForProof): ProofChecklistLine[] {
  const used = new Set<string>()
  return (need.items ?? []).map((item) => {
    let option = item.supplyId ? item.supplyId.replace(/^supply-/, '') : `line-${item._key}`
    if (used.has(option)) option = `${option}-${item._key}`
    used.add(option)
    return {
      key: item._key,
      option,
      name: item.name ?? 'an item that is no longer in the catalog',
      unit: item.unit,
      synonyms: item.synonyms ?? [],
      quantity: item.quantity ?? 1,
    }
  })
}

export type ProofStepResult = {verdict: 'auto_verified' | 'needs_review'}

/** The `jev-proof` effect. */
export async function runProofMatch(needId: string, proofId: string): Promise<ProofStepResult> {
  const client = getWriteClient()
  const [need, proof, rawPolicy] = await Promise.all([
    client.fetch<NeedForProof | null>(NEED_FOR_PROOF, {id: needId}, {tag: 'vouch.lifecycle.proof.read', timeout: TIMEOUT_MS}),
    client.fetch<ProofForMatch | null>(PROOF_FOR_MATCH, {id: proofId}, {tag: 'vouch.lifecycle.proof.read', timeout: TIMEOUT_MS}),
    client.fetch<unknown>(POLICY_QUERY, {}, {tag: 'vouch.lifecycle.proof.read', timeout: TIMEOUT_MS}),
  ])
  if (!proof || proof.needId !== needId) throw new Error(`There is no receipt ${proofId} for ${needId}.`)
  // At-least-once delivery: an earlier run of this effect already decided and recorded its Jev call.
  if ((proof.verdict === 'auto_verified' || proof.verdict === 'needs_review') && proof.decisionId) {
    return {verdict: proof.verdict}
  }
  if (!need) throw new Error(`The request ${needId} is not published.`)

  const write = async (verdict: ProofVerdict | null, reasons: string[], decisionId: string | null): Promise<ProofStepResult> => {
    const outcome = verdict?.verdict ?? 'needs_review'
    let transaction = client.transaction().patch(proofId, (patch) =>
      patch.ifRevisionId(proof._rev).set({
        verdict: outcome,
        reasons,
        ...(verdict
          ? {
              coverage: verdict.coverage,
              matches: verdict.matches.map((match) => ({_key: `m${match.lineIndex}-${match.itemKey}`, _type: 'proofMatch', ...match})),
              ...(verdict.receiptProbability !== null ? {receiptProbability: verdict.receiptProbability} : {}),
            }
          : {}),
        ...(decisionId ? {decision: {_type: 'reference', _ref: decisionId, _weak: true}} : {}),
        checkedAt: new Date().toISOString(),
      }),
    )
    // The request's `stage` mirrors the lifecycle for feed queries and the Studio.
    if (outcome === 'needs_review') transaction = transaction.patch(needId, (patch) => patch.set({stage: 'proof_review'}))
    await transaction.commit({visibility: 'async', tag: 'vouch.lifecycle.proof', timeout: TIMEOUT_MS})
    return {verdict: outcome}
  }

  const policy = parsePolicy(rawPolicy)
  if (!policy.ok) {
    return write(null, [`Vouch's policy document is incomplete (${policy.problem}), so a volunteer verifier will check the receipt.`], null)
  }
  const checklist = checklistFor(need)
  const lines: CheckedReceiptLine[] = (proof.lines ?? []).map((line) => ({
    text: line.text,
    amount: typeof line.amount === 'number' ? line.amount : null,
    ocrSimilarity: typeof line.ocrSimilarity === 'number' ? line.ocrSimilarity : 0,
  }))
  if (lines.length === 0) return write(null, ['The receipt has no lines to check, so a volunteer verifier will look at the photo.'], null)

  const thresholds = policy.policy.thresholds
  const result = await askJev({
    kind: 'proof_match',
    subjectId: needId,
    state: proofState(lines, checklist),
    questions: buildProofQuestions(lines, checklist),
    decide: (answers) => proofDecisionOutcome(gateProof(answers, lines, checklist, thresholds)),
  })
  if (!result.ok) {
    return write(
      null,
      [`Jev couldn't check the receipt (${result.error}). A volunteer verifier will check it instead; nothing was decided automatically.`],
      result.decisionId,
    )
  }
  const verdict = gateProof(result.answers, lines, checklist, thresholds)
  return write(verdict, verdict.reasons, result.decisionId)
}

type CertificateSource = {
  need: {
    _id: string
    title: string
    city: string
    country: string
    publishedAt: string | null
    items: Array<{_key: string; quantity: number; name: string | null; unit: string | null}> | null
    pledges: Array<{donorDisplayName: string; itemKey: string; quantity: number}>
  } | null
  proof: {
    _id: string
    needId: string | null
    verdict: string | null
    coverage: number | null
    uploaderDisplayName: string | null
    submittedAt: string | null
    imageSha256: string | null
    lines: Array<{text: string}> | null
    matches: Array<{lineIndex: number; itemKey: string; probability: number}> | null
    decision: {_id: string; model: string | null} | null
  } | null
  review: {reviewerName: string; createdAt: string | null} | null
}

const CERTIFICATE_SOURCE = `{
  "need": *[_type == "need" && _id == $needId][0]{
    _id, title, city, country, publishedAt,
    "items": items[]{_key, quantity, "name": supplyItem->name, "unit": supplyItem->unit},
    "pledges": *[_type == "pledge" && need._ref == ^._id && status != "cancelled"] | order(pledgedAt asc){donorDisplayName, itemKey, quantity}
  },
  "proof": *[_type == "proof" && _id == $proofId][0]{
    _id, "needId": need._ref, verdict, coverage, uploaderDisplayName, submittedAt, imageSha256,
    lines[]{text}, matches[]{lineIndex, itemKey, probability}, "decision": decision->{_id, model}
  },
  "review": *[_type == "review" && proof._ref == $proofId && action == "approve"] | order(createdAt desc)[0]{reviewerName, createdAt}
}`

/** The `issue-certificate` effect: what was verified, as canonical JSON, and its SHA-256. */
export async function issueCertificate(needId: string, proofId: string): Promise<{certificateId: string}> {
  const client = getWriteClient()
  const certificateId = certificateIdFor(needId)
  const now = new Date().toISOString()

  const existing = await client.getDocument<{_id: string}>(certificateId)
  if (existing) {
    // At-least-once delivery: the certificate exists, so make sure the request says fulfilled too.
    await client
      .patch(needId)
      .setIfMissing({fulfilledAt: now})
      .set({stage: 'fulfilled'})
      .commit({visibility: 'async', tag: 'vouch.lifecycle.certificate', timeout: TIMEOUT_MS})
    return {certificateId}
  }

  const source = await client.fetch<CertificateSource>(CERTIFICATE_SOURCE, {needId, proofId}, {
    tag: 'vouch.lifecycle.certificate.read',
    timeout: TIMEOUT_MS,
  })
  const {need, proof, review} = source
  if (!need) throw new Error(`The request ${needId} is not published.`)
  if (!proof || proof.needId !== needId) throw new Error(`There is no receipt ${proofId} for ${needId}.`)
  if (proof.verdict !== 'auto_verified' && proof.verdict !== 'verified') {
    throw new Error(`The receipt is not verified (its verdict is "${proof.verdict ?? 'none'}"), so no certificate was issued.`)
  }
  if (proof.verdict === 'verified' && !review) throw new Error('The receipt says a volunteer accepted it, but no review was found.')

  const items = need.items ?? []
  const itemName = new Map(items.map((item) => [item._key, item.name ?? 'Unknown item']))
  const lines = proof.lines ?? []
  const payload = {
    vouch: 'fulfilment-certificate/1',
    request: {id: need._id, title: need.title, city: need.city, country: need.country, verifiedAt: need.publishedAt},
    checklist: items.map((item) => ({key: item._key, item: item.name ?? 'Unknown item', unit: item.unit, quantity: item.quantity})),
    pledges: need.pledges.map((pledge) => ({
      donor: pledge.donorDisplayName,
      item: itemName.get(pledge.itemKey) ?? pledge.itemKey,
      quantity: pledge.quantity,
    })),
    receipt: {
      id: proof._id,
      uploadedBy: proof.uploaderDisplayName,
      submittedAt: proof.submittedAt,
      photoSha256: proof.imageSha256,
      coverage: proof.coverage,
      matches: (proof.matches ?? []).map((match) => ({
        checklistKey: match.itemKey,
        item: itemName.get(match.itemKey) ?? match.itemKey,
        receiptLine: lines[match.lineIndex]?.text ?? null,
        probability: match.probability,
      })),
    },
    verifiedBy:
      proof.verdict === 'auto_verified'
        ? {kind: 'jev_and_policy', jevDecision: proof.decision?._id ?? null, model: proof.decision?.model ?? null}
        : {kind: 'volunteer', reviewer: review?.reviewerName ?? null, jevDecision: proof.decision?._id ?? null},
    issuedAt: now,
  }
  const text = canonicalJson(payload)
  const sha256 = createHash('sha256').update(text, 'utf8').digest('hex')

  try {
    await client
      .transaction()
      .createIfNotExists({
        _id: certificateId,
        _type: 'certificate',
        need: {_type: 'reference', _ref: needId},
        proof: {_type: 'reference', _ref: proofId, _weak: true},
        payload: text,
        sha256,
        issuedAt: now,
      })
      .patch(needId, (patch) => patch.set({stage: 'fulfilled', fulfilledAt: now}))
      .commit({visibility: 'async', tag: 'vouch.lifecycle.certificate', timeout: TIMEOUT_MS})
  } catch (error) {
    throw new Error(`Sanity didn't accept the certificate: ${errorMessage(error)}`)
  }
  return {certificateId}
}

export type RecordProofReviewInput = {
  needId: string
  proofId: string
  /** approve = the receipt is accepted; reject = declined (the request collects pledges again). */
  action: 'approve' | 'reject'
  reviewer: string
  note: string | null
  effectKey: string
}

/** A verifier's receipt decision: the review, the proof's verdict and (on decline) the request's stage. */
export async function recordProofReview(input: RecordProofReviewInput): Promise<void> {
  const client = getWriteClient()
  let transaction = client
    .transaction()
    .createIfNotExists({
      _id: reviewDocId(input.effectKey),
      _type: 'review',
      subject: {_type: 'reference', _ref: input.needId, _weak: true},
      proof: {_type: 'reference', _ref: input.proofId, _weak: true},
      action: input.action,
      ...(input.note ? {note: input.note} : {}),
      reviewerName: input.reviewer,
      createdAt: new Date().toISOString(),
    })
    .patch(input.proofId, (patch) => patch.set({verdict: input.action === 'approve' ? 'verified' : 'rejected'}))
  if (input.action === 'reject') transaction = transaction.patch(input.needId, (patch) => patch.set({stage: 'open'}))
  await transaction.commit({visibility: 'async', tag: 'vouch.lifecycle.proof-review', timeout: TIMEOUT_MS})
}
