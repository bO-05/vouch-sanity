import 'server-only'

import {createHash, randomUUID} from 'node:crypto'
import {cleanDisplayName, looksLikeContactInfo, receiptLineLooksLikeContactInfo} from '@/lib/contact'
import {isPublicDocumentId} from '@/lib/ids'
import {errorMessage, isConflict, isRecord} from '@/lib/intake-context'
import {advanceLater} from '@/lib/lifecycle/advance'
import {fireLifecycle, readLifecycle, viewLifecycle, type LifecycleView} from '@/lib/lifecycle/engine'
import {
  certificateIdFor,
  MAX_OCR_TEXT_LENGTH,
  MAX_RECEIPT_LINES,
  ocrAnchors,
  readAmount,
  receiptScanId,
  tidyLineText,
} from '@/lib/proof-match'
import {getWriteClient} from '@/lib/sanity/write-client'
import {STAGE_LABELS} from '@/lib/vocab'
import {ACTIONS} from '@/workflows/need-lifecycle'

/**
 * Receipts: someone who bought the checklist uploads a photo of the receipt.
 *
 * The browser reads the photo with Tesseract.js and the uploader corrects the lines. This is the
 * only place a proof is created. Code validates everything (a Server Action is a public endpoint),
 * then ONE transaction creates the public proof (corrected lines), its private scan (photo + raw OCR)
 * and moves the request out of `open` (guarded by its revision, so it can't race a pledge). Then the
 * lifecycle takes over: `submit-proof` → Jev's proof match → a certificate, or a verifier.
 */

const TIMEOUT_MS = 15_000
const MAX_IMAGE_BYTES = 900_000
const MAX_NAME = 40
const JPEG_DATA_URL = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/
const PROOF_ID = /^proof-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export type SubmitProofResult = {ok: true; proofId: string} | {ok: false; message: string}

const fail = (message: string): SubmitProofResult => ({ok: false, message})

export async function submitProof(raw: unknown): Promise<SubmitProofResult> {
  const input = isRecord(raw) ? raw : {}
  const needId = input.needId
  if (!isPublicDocumentId(needId) || !needId.startsWith('need-')) return fail('Unknown request.')

  const name = typeof input.uploaderDisplayName === 'string' ? cleanDisplayName(input.uploaderDisplayName) : ''
  if (!name) return fail('Add your display name (a first name or nickname).')
  if (name.length > MAX_NAME) return fail(`Keep the display name under ${MAX_NAME} characters.`)
  if (looksLikeContactInfo(name)) return fail('That looks like contact details. Use a first name or nickname.')

  const rawLines = Array.isArray(input.lines) ? input.lines : []
  if (rawLines.length > MAX_RECEIPT_LINES) return fail(`Keep it to ${MAX_RECEIPT_LINES} lines: delete the ones that aren't products.`)
  const lines = rawLines.map((line) => (typeof line === 'string' ? tidyLineText(line) : '')).filter(Boolean)
  if (lines.length === 0) return fail('Add at least one receipt line.')
  const contact = lines.findIndex((line) => receiptLineLooksLikeContactInfo(line))
  if (contact >= 0) {
    return fail(
      `Line ${contact + 1} (“${lines[contact]}”) looks like contact details or a long number (a phone number, email, link, card or transaction number). Delete or edit that line: Vouch never stores contact details.`,
    )
  }

  const ocrText = typeof input.ocrText === 'string' ? input.ocrText.slice(0, MAX_OCR_TEXT_LENGTH) : ''
  if (!ocrText.trim()) return fail('Read the receipt from a photo on this page first.')
  const image = typeof input.image === 'string' ? JPEG_DATA_URL.exec(input.image) : null
  if (!image) return fail('Attach the photo of the receipt (the page prepares it for you).')
  const bytes = Buffer.from(image[1], 'base64')
  if (bytes.length < 1_000 || bytes.length > MAX_IMAGE_BYTES) return fail('The photo is too small or too large. Try another photo.')
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return fail('The photo is not a JPEG image.')

  let client: ReturnType<typeof getWriteClient>
  try {
    client = getWriteClient()
  } catch (error) {
    return fail(`Receipts can't be uploaded right now: ${errorMessage(error)}`)
  }

  const need = await client
    .fetch<{_id: string; _rev: string; stage: string | null; itemCount: number | null} | null>(
      `*[_type == "need" && _id == $id][0]{_id, _rev, stage, "itemCount": count(items)}`,
      {id: needId},
      {tag: 'vouch.proof.read', timeout: TIMEOUT_MS},
    )
    .catch(() => undefined)
  if (need === undefined) return fail("Couldn't read the request from Sanity. Please try again.")
  if (!need) return fail('This request is not public. Receipts can only be uploaded for verified requests.')
  if (need.stage !== 'open') {
    return fail(`This request isn't waiting for a receipt right now (${STAGE_LABELS[need.stage ?? ''] ?? need.stage}).`)
  }
  if (!need.itemCount) return fail('This request has no checklist to compare a receipt with.')
  const instance = await readLifecycle(needId).catch(() => null)
  if (!instance || instance.currentStage !== 'open') {
    return fail("Vouch's lifecycle for this request isn't waiting for a receipt right now, so nothing was saved.")
  }

  // How each corrected line relates to the photo: similarity, the OCR line and the quantity read there.
  // Stored on the (public) proof so the gate can check quantities; the OCR text itself stays private.
  const anchors = ocrAnchors(lines.map((text) => ({text, amount: null})), ocrText)
  const proofId = `proof-${randomUUID()}`
  const scanId = receiptScanId(proofId)
  const imageSha256 = createHash('sha256').update(bytes).digest('hex')
  const now = new Date().toISOString()

  try {
    await client
      .transaction()
      .create({
        _id: proofId,
        _type: 'proof',
        need: {_type: 'reference', _ref: needId},
        uploaderDisplayName: name,
        lines: lines.map((text, index) => {
          const amount = readAmount(text)
          return {
            _key: `l${index + 1}`,
            _type: 'receiptLine',
            text,
            ...(amount !== null ? {amount} : {}),
            ocrSimilarity: Math.round(anchors[index].similarity * 1000) / 1000,
            ...(anchors[index].ocrLine !== null ? {ocrLine: anchors[index].ocrLine} : {}),
            ...(anchors[index].quantity !== null ? {ocrQuantity: anchors[index].quantity} : {}),
          }
        }),
        imageSha256,
        verdict: 'pending',
        submittedAt: now,
        isDemo: false,
      })
      .create({
        _id: scanId,
        _type: 'receiptScan',
        proof: {_type: 'reference', _ref: proofId, _weak: true},
        need: {_type: 'reference', _ref: needId, _weak: true},
        image: input.image as string,
        imageSha256,
        ocrText,
        createdAt: now,
      })
      .patch(needId, (patch) => patch.ifRevisionId(need._rev).set({stage: 'proof_check'}))
      .commit({visibility: 'sync', tag: 'vouch.proof.submit', timeout: TIMEOUT_MS})
  } catch (error) {
    return fail(
      isConflict(error)
        ? 'The request changed while you were uploading (someone may have just pledged). Please submit again.'
        : `Sanity didn't accept the receipt, so nothing was saved: ${errorMessage(error)}`,
    )
  }

  try {
    await fireLifecycle(needId, ACTIONS.open.activity, ACTIONS.open.submitProof, {proofId})
  } catch (error) {
    // Undo, so the request page tells the truth: nothing is being checked.
    await client
      .transaction()
      .delete(proofId)
      .delete(scanId)
      .patch(needId, (patch) => patch.set({stage: 'open'}))
      .commit({visibility: 'sync', tag: 'vouch.proof.undo'})
      .catch(() => {})
    return fail(`The receipt couldn't be handed to the lifecycle (${errorMessage(error)}), so nothing was saved. Please try again.`)
  }

  // Jev's proof match, the gate and (maybe) the certificate run after this response.
  advanceLater(needId, 'drain')
  return {ok: true, proofId}
}

export type ProofStatus =
  | {
      ok: true
      verdict: string
      reasons: string[]
      coverage: number | null
      matched: Array<{item: string; line: string; probability: number; quantity: number | null; quantityText: string | null}>
      /** Units the receipt shows per checklist line (null for receipts checked before quantities were read). */
      quantities: Array<{item: string; needed: number; shown: number}> | null
      needStage: string | null
      lifecycle: LifecycleView | null
      certificateId: string | null
    }
  | {ok: false; message: string}

type StatusRow = {
  proof: {
    verdict: string | null
    reasons: string[] | null
    coverage: number | null
    lines: Array<{text: string}> | null
    matches: Array<{lineIndex: number; itemKey: string; probability: number; quantity: number | null; quantityLine: number | null}> | null
    quantities: Array<{itemKey: string; needed: number; shown: number}> | null
  } | null
  need: {stage: string | null; items: Array<{_key: string; name: string | null}> | null} | null
  certificate: string | null
}

/** Public facts about one receipt, for the uploader watching the check. */
export async function readProofStatus(raw: unknown): Promise<ProofStatus> {
  const input = isRecord(raw) ? raw : {}
  const {needId, proofId} = input
  if (!isPublicDocumentId(needId) || typeof proofId !== 'string' || !PROOF_ID.test(proofId)) {
    return {ok: false, message: 'Unknown receipt.'}
  }
  try {
    const [row, instance] = await Promise.all([
      getWriteClient().fetch<StatusRow>(
        `{
          "proof": *[_type == "proof" && _id == $proofId && need._ref == $needId][0]{
            verdict, reasons, coverage, lines[]{text}, matches[]{lineIndex, itemKey, probability, quantity, quantityLine},
            quantities[]{itemKey, needed, shown}
          },
          "need": *[_type == "need" && _id == $needId][0]{stage, "items": items[]{_key, "name": supplyItem->name}},
          "certificate": *[_type == "certificate" && _id == $certificateId][0]._id
        }`,
        {needId, proofId, certificateId: certificateIdFor(needId)},
        {tag: 'vouch.proof.status', timeout: TIMEOUT_MS},
      ),
      readLifecycle(needId),
    ])
    if (!row.proof) return {ok: false, message: 'This receipt was not found.'}
    const names = new Map((row.need?.items ?? []).map((item) => [item._key, item.name ?? 'Unknown item']))
    const lines = row.proof.lines ?? []
    return {
      ok: true,
      verdict: row.proof.verdict ?? 'pending',
      reasons: row.proof.reasons ?? [],
      coverage: row.proof.coverage,
      matched: (row.proof.matches ?? []).map((match) => ({
        item: names.get(match.itemKey) ?? 'Unknown item',
        line: lines[match.lineIndex]?.text ?? '',
        probability: match.probability,
        quantity: typeof match.quantity === 'number' ? match.quantity : null,
        quantityText:
          typeof match.quantityLine === 'number' && match.quantityLine !== match.lineIndex ? (lines[match.quantityLine]?.text ?? null) : null,
      })),
      quantities: row.proof.quantities
        ? row.proof.quantities.map((entry) => ({item: names.get(entry.itemKey) ?? 'Unknown item', needed: entry.needed, shown: entry.shown}))
        : null,
      needStage: row.need?.stage ?? null,
      lifecycle: instance ? viewLifecycle(instance) : null,
      certificateId: row.certificate,
    }
  } catch (error) {
    return {ok: false, message: `Couldn't read the receipt's status: ${errorMessage(error)}`}
  }
}
