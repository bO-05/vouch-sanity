'use client'

import Link from 'next/link'
import {useEffect, useId, useState} from 'react'
import {Field, inputClass, primaryButton, secondaryButton} from '@/components/form'
import {LifecycleSteps} from '@/components/lifecycle-steps'
import {receiptLineLooksLikeContactInfo} from '@/lib/contact'
import {isQuantityLine, lastAmount, MAX_LINE_LENGTH, MAX_RECEIPT_LINES, ocrAnchors, readQuantity, splitOcrText} from '@/lib/proof-match'
import type {ProofStatus} from '@/lib/proofs'
import {PLEDGEABLE_STAGE, PROOF_VERDICT_LABELS, STAGE_LABELS} from '@/lib/vocab'
import {proofStatusAction, submitProofAction} from './actions'

export type ProofChecklistItem = {key: string; name: string; unit: string | null; quantity: number}

/** Made-up receipts for the demo (public/samples/, rendered by scripts/make-sample-receipts.ts). */
const SAMPLES = [
  {file: 'receipt-groceries.png', label: 'Groceries', covers: 'rice, beans, milk, pasta, peanut butter, oil, eggs'},
  {
    file: 'receipt-pharmacy.png',
    label: 'Pharmacy',
    covers: 'formula, diapers, wipes, thermometer, fever reducer, plasters, pads, tampons, toothpaste, toothbrushes, shampoo, soap',
  },
  {file: 'receipt-household.png', label: 'Household', covers: 'detergent, cleaner, trash bags, soap, blankets, socks, gloves, school supplies'},
  {file: 'receipt-electronics.png', label: 'Electronics', covers: 'nothing on any checklist (to see a verifier step in)'},
]

const MAX_DATA_URL = 1_100_000
const POLL_MS = 1_500
const POLL_FOR_MS = 120_000

type Phase = 'pick' | 'reading' | 'edit' | 'submitting' | 'checking'
type Scan = {ocrText: string; jpeg: string}

function canvasOf(bitmap: ImageBitmap, longSide: number, maxScale: number) {
  const scale = Math.min(maxScale, longSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('this browser cannot process images')
  context.fillStyle = '#ffffff' // transparent PNGs would otherwise turn black in a JPEG
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return {canvas, context}
}

/** The copy that is uploaded: a JPEG small enough for the request, nothing else from the file. */
function jpegOf(bitmap: ImageBitmap): string {
  for (const [side, quality] of [
    [1400, 0.75],
    [1200, 0.6],
    [1000, 0.5],
  ] as const) {
    const url = canvasOf(bitmap, side, 1).canvas.toDataURL('image/jpeg', quality)
    if (url.length <= MAX_DATA_URL) return url
  }
  throw new Error('the photo is too large even after shrinking it')
}

/** The copy Tesseract reads: larger, in grayscale. */
function ocrCanvasOf(bitmap: ImageBitmap): HTMLCanvasElement {
  const {canvas, context} = canvasOf(bitmap, 2000, 2)
  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  const pixels = image.data
  for (let i = 0; i < pixels.length; i += 4) {
    const y = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]
    pixels[i] = pixels[i + 1] = pixels[i + 2] = y
  }
  context.putImageData(image, 0, 0)
  return canvas
}

async function recognize(canvas: HTMLCanvasElement, onProgress: (progress: number, status: string) => void): Promise<string> {
  const {createWorker, PSM} = await import('tesseract.js')
  const worker = await createWorker('eng', 1, {logger: (message) => onProgress(message.progress, message.status)})
  try {
    // One block of text: keeps a product and its price on the same line.
    await worker.setParameters({tessedit_pageseg_mode: PSM.SINGLE_BLOCK})
    const {data} = await worker.recognize(canvas)
    return data.text
  } finally {
    await worker.terminate()
  }
}

function isMoving(status: ProofStatus | null): boolean {
  if (!status) return true
  if (!status.ok) return false
  if (status.verdict === 'pending') return true
  const lifecycle = status.lifecycle
  return Boolean(lifecycle && !lifecycle.failed.length && (lifecycle.pending.length > 0 || ['proof_check', 'certifying'].includes(lifecycle.stage)))
}

export function ProofUploader({
  needId,
  items,
  stage,
  minSimilarity,
}: {
  needId: string
  items: ProofChecklistItem[]
  /** The request's current stage (refreshed live). Only `open` accepts a receipt. */
  stage: string
  minSimilarity: number | null
}) {
  const id = useId()
  const [phase, setPhase] = useState<Phase>('pick')
  const [progress, setProgress] = useState({value: 0, status: ''})
  const [scan, setScan] = useState<Scan | null>(null)
  const [lines, setLines] = useState<string[]>([])
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [proofId, setProofId] = useState<string | null>(null)
  const [status, setStatus] = useState<ProofStatus | null>(null)

  useEffect(() => {
    if (!proofId) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const started = Date.now()
    const tick = async () => {
      try {
        const next = await proofStatusAction({needId, proofId})
        if (cancelled) return
        setStatus(next)
        if (isMoving(next) && Date.now() - started < POLL_FOR_MS) timer = setTimeout(tick, POLL_MS)
      } catch {
        if (!cancelled) timer = setTimeout(tick, POLL_MS * 2)
      }
    }
    void tick()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [needId, proofId])

  async function read(image: Blob) {
    setError(null)
    setPhase('reading')
    setProgress({value: 0, status: 'preparing the photo'})
    try {
      const bitmap = await createImageBitmap(image)
      const jpeg = jpegOf(bitmap)
      const canvas = ocrCanvasOf(bitmap)
      bitmap.close()
      const text = await recognize(canvas, (value, status) => setProgress({value, status}))
      const found = splitOcrText(text)
      if (found.length === 0) throw new Error('no text was found. Try a sharper, well-lit photo of the whole receipt')
      setScan({ocrText: text, jpeg})
      setLines(found.map((line) => line.text))
      setPhase('edit')
    } catch (problem) {
      setError(`Couldn't read the receipt: ${problem instanceof Error ? problem.message : 'unknown error'}.`)
      setPhase('pick')
    }
  }

  async function readSample(file: string) {
    try {
      const response = await fetch(`/samples/${file}`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      await read(await response.blob())
    } catch (problem) {
      setError(`Couldn't load the sample: ${problem instanceof Error ? problem.message : 'unknown error'}.`)
      setPhase('pick')
    }
  }

  async function submit() {
    if (!scan) return
    setError(null)
    setPhase('submitting')
    try {
      const result = await submitProofAction({needId, uploaderDisplayName: name, lines, ocrText: scan.ocrText, image: scan.jpeg})
      if (!result.ok) {
        setError(result.message)
        setPhase('edit')
        return
      }
      setProofId(result.proofId)
      setPhase('checking')
    } catch (problem) {
      setError(`The server couldn't be reached: ${problem instanceof Error ? problem.message : 'unknown error'}.`)
      setPhase('edit')
    }
  }

  const checklist = (
    <section className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-5 text-sm">
      <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted">The checklist</h2>
      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <li key={item.key}>
            {item.quantity} × {item.name}
            {item.unit ? <span className="text-muted"> ({item.unit})</span> : null}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">
        One receipt should show the whole checklist. Jev checks which item each line bought; Vouch&apos;s code counts how many, from
        what the receipt prints (“3 @ 18.99”, “3 x 18.99”, “QTY 3”). A line without a quantity counts as one. Anything short goes to
        a volunteer.
      </p>
    </section>
  )

  const errorBox = error ? (
    <p role="alert" className="rounded-xl border border-danger/40 px-3 py-2 text-sm text-danger">
      {error}
    </p>
  ) : null

  if (phase === 'checking') {
    return <CheckProgress needId={needId} status={status} />
  }

  const closed = stage !== PLEDGEABLE_STAGE
  if (closed && phase === 'pick') {
    return (
      <p className="rounded-2xl border border-border bg-surface p-5 text-sm text-muted">
        This request isn&apos;t waiting for a receipt right now ({STAGE_LABELS[stage] ?? stage}).{' '}
        <Link href={`/requests/${needId}`} className="text-amber hover:underline">
          See its page
        </Link>
        .
      </p>
    )
  }

  if (phase === 'pick' || phase === 'reading') {
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-5 sm:p-6">
          <Field
            id={`${id}-photo`}
            label="Photo of the receipt"
            hint="Take a photo or pick one you already have. Cover card numbers and anything personal first. The photo is only shown to volunteer verifiers, never on the public page."
          >
            {/* No `capture`: on phones it forces the camera and hides the photo library. */}
            <input
              id={`${id}-photo`}
              type="file"
              accept="image/*"
              disabled={phase === 'reading'}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void read(file)
              }}
              className="w-full max-w-full text-sm file:mr-3 file:rounded-xl file:border file:border-border file:bg-surface-2 file:px-3 file:py-2 file:text-sm file:text-foreground"
            />
          </Field>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">No receipt at hand? Try a sample</p>
            <ul className="flex flex-col gap-2">
              {SAMPLES.map((sample) => (
                <li key={sample.file} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <button type="button" disabled={phase === 'reading'} onClick={() => void readSample(sample.file)} className={secondaryButton}>
                    Use the {sample.label.toLowerCase()} receipt
                  </button>
                  <a href={`/samples/${sample.file}`} target="_blank" rel="noreferrer" className="text-xs text-muted hover:text-amber">
                    view it
                  </a>
                  <span className="text-xs text-muted">covers {sample.covers}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted">Sample receipts are made up for the demo.</p>
          </div>
          {phase === 'reading' ? (
            <div aria-live="polite" className="flex flex-col gap-2 text-sm">
              <p>
                Reading the receipt in your browser… <span className="text-muted">({progress.status || 'starting'})</span>
              </p>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-amber transition-[width]" style={{width: `${Math.round(progress.value * 100)}%`}} />
              </div>
              <p className="text-xs text-muted">The first time, Tesseract downloads its English model (a few MB).</p>
            </div>
          ) : null}
          {errorBox}
        </section>
        {checklist}
      </div>
    )
  }

  // Editing the lines Tesseract read.
  const anchors = scan ? ocrAnchors(lines.map((text) => ({text, amount: null})), scan.ocrText) : []
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 sm:p-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Check the lines</h2>
          <p className="text-sm text-muted">
            Fix letters Tesseract misread and delete lines you don&apos;t want to share. Don&apos;t rewrite products: Jev only
            sees this text, so a line that no longer looks like the photo goes to a volunteer, who compares it with the photo.
          </p>
        </div>
        <ol className="flex flex-col gap-2">
          {lines.map((line, index) => {
            const anchor = anchors[index]
            const changed = minSimilarity !== null && (anchor?.similarity ?? 0) < minSimilarity
            const contact = receiptLineLooksLikeContactInfo(line)
            // The same quantity reading the server does (a quantity-only line uses the total of the line above).
            const quantityOnly = isQuantityLine(line)
            const reading = readQuantity(line, quantityOnly && index > 0 ? lastAmount(lines[index - 1]) : null)
            const quantityNote = !reading
              ? null
              : (anchor?.quantity ?? null) !== reading.quantity
                ? {warn: true, text: `Quantity ${reading.quantity} isn't what was read in the photo (${anchor?.quantity ?? 'none'}): it counts as one, and a volunteer will compare it.`}
                : reading.arithmetic === 'does_not_add_up'
                  ? {warn: true, text: `${reading.quantity} × ${reading.unitPrice} isn't the total ${reading.total}: it counts as one, and a volunteer will check it.`}
                  : reading.noisy && reading.arithmetic !== 'adds_up'
                    ? {warn: true, text: `This looks like quantity ${reading.quantity}, but it isn't printed clearly: fix the line, or it counts as one.`}
                    : {
                        warn: false,
                        text: `Quantity ${reading.quantity}${quantityOnly ? ' for the line above' : ''}${
                          reading.arithmetic === 'adds_up' ? `: ${reading.quantity} × ${reading.unitPrice} = ${reading.total}` : ''
                        }.`,
                      }
            return (
              <li key={index} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="w-6 shrink-0 text-right font-mono text-xs text-muted">{index + 1}</span>
                  <input
                    aria-label={`Receipt line ${index + 1}`}
                    value={line}
                    maxLength={MAX_LINE_LENGTH}
                    onChange={(event) => setLines((current) => current.map((value, i) => (i === index ? event.target.value : value)))}
                    className={`${inputClass} font-mono`}
                  />
                  <button
                    type="button"
                    onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
                    className="shrink-0 rounded-lg px-2 py-1 text-xs text-muted hover:text-danger"
                    aria-label={`Delete line ${index + 1}`}
                  >
                    Delete
                  </button>
                </div>
                {contact ? (
                  <p className="pl-8 text-xs text-danger">Looks like a phone, card or transaction number: delete or edit it.</p>
                ) : changed ? (
                  <p className="pl-8 text-xs text-amber">Changed from what was read in the photo: a volunteer will compare it.</p>
                ) : quantityNote ? (
                  <p className={`pl-8 text-xs ${quantityNote.warn ? 'text-amber' : 'text-muted'}`}>{quantityNote.text}</p>
                ) : null}
              </li>
            )
          })}
        </ol>
        {lines.length < MAX_RECEIPT_LINES ? (
          <button type="button" onClick={() => setLines((current) => [...current, ''])} className={`${secondaryButton} self-start`}>
            Add a line
          </button>
        ) : null}
        <Field id={`${id}-name`} label="Your display name" hint="Shown publicly with the receipt. A first name or nickname, no contact details.">
          <input
            id={`${id}-name`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={40}
            autoComplete="nickname"
            className={inputClass}
          />
        </Field>
        {closed && phase === 'edit' ? (
          <p className="rounded-xl border border-danger/40 px-3 py-2 text-sm text-danger">
            Meanwhile this request stopped waiting for a receipt ({STAGE_LABELS[stage] ?? stage}), so it can&apos;t be submitted.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void submit()} disabled={phase === 'submitting' || !name.trim() || (closed && phase === 'edit')} className={primaryButton}>
            {phase === 'submitting' ? 'Submitting…' : 'Submit the receipt'}
          </button>
          <button
            type="button"
            disabled={phase === 'submitting'}
            onClick={() => {
              setScan(null)
              setLines([])
              setPhase('pick')
            }}
            className={secondaryButton}
          >
            Use another photo
          </button>
        </div>
        {errorBox}
      </section>
      <aside className="flex flex-col gap-4">
        {scan ? (
          <figure className="overflow-hidden rounded-2xl border border-border bg-surface">
            {/* eslint-disable-next-line @next/next/no-img-element -- a local data URL, not an optimizable remote image */}
            <img src={scan.jpeg} alt="The receipt photo that was read" className="max-h-[32rem] w-full object-contain" />
            <figcaption className="p-3 text-xs text-muted">What will be uploaded (downscaled). Only verifiers see it.</figcaption>
          </figure>
        ) : null}
        {checklist}
      </aside>
    </div>
  )
}

function CheckProgress({needId, status}: {needId: string; status: ProofStatus | null}) {
  if (status && !status.ok) {
    return (
      <p role="alert" className="rounded-2xl border border-danger/40 bg-surface p-5 text-sm text-danger">
        {status.message}
      </p>
    )
  }
  const moving = isMoving(status)
  const fulfilled = status?.ok && status.needStage === 'fulfilled' && status.certificateId
  return (
    <section aria-live="polite" className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 sm:p-6">
      <h2 className="text-lg font-semibold">
        {!status?.ok || moving
          ? 'Jev is checking the receipt…'
          : fulfilled
            ? 'Verified: the request is fulfilled'
            : (PROOF_VERDICT_LABELS[status.verdict] ?? status.verdict)}
      </h2>
      {status?.ok && status.matched.length > 0 ? (
        <ul className="flex flex-col gap-1 text-sm">
          {status.matched.map((match) => (
            <li key={`${match.item}-${match.line}`}>
              <span className="font-medium">{match.item}</span> ← <span className="font-mono text-xs">{match.line}</span>
              {match.quantity !== null ? (
                <span>
                  {' '}
                  · {match.quantity} {match.quantity === 1 ? 'unit' : 'units'}
                  {match.quantityText ? (
                    <span className="text-muted">
                      {' '}
                      (from <span className="font-mono text-xs">{match.quantityText}</span>)
                    </span>
                  ) : null}
                </span>
              ) : null}{' '}
              <span className="text-muted">(p = {match.probability.toFixed(2)})</span>
            </li>
          ))}
        </ul>
      ) : null}
      {status?.ok && status.quantities ? (
        <p className="text-sm text-muted">
          The receipt shows{' '}
          {status.quantities.map((entry) => `${Math.min(entry.shown, entry.needed)} of ${entry.needed} ${entry.item}`).join(', ')}.
        </p>
      ) : null}
      {status?.ok && status.reasons.length > 0 ? (
        <div className="flex flex-col gap-1 text-sm">
          <p className="font-medium">Why a volunteer verifier checks it</p>
          <ul className="list-disc pl-5 text-muted">
            {status.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {status?.ok && status.lifecycle ? <LifecycleSteps lifecycle={status.lifecycle} compact /> : null}
      <div className="flex flex-wrap gap-3 text-sm">
        {fulfilled ? (
          <Link href={`/certificates/${status.certificateId}`} className={primaryButton}>
            See the certificate
          </Link>
        ) : null}
        <Link href={`/requests/${needId}`} className={secondaryButton}>
          Back to the request
        </Link>
      </div>
    </section>
  )
}
