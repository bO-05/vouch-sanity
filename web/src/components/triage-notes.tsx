/** Emergency resources and triage reasons, shown to requesters. Text comes from the policy and code. */

export function EmergencyResources({text}: {text: string}) {
  return (
    <div role="alert" className="rounded-2xl border border-danger/60 bg-danger/10 p-5">
      <p className="text-base font-semibold text-danger">If anyone is in danger right now</p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{text}</p>
    </div>
  )
}

export function ReasonList({reasons, title = 'Why a volunteer checks it first'}: {reasons: string[]; title?: string}) {
  if (reasons.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{title}</p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
        {reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
      <p className="text-xs text-muted">
        Written by Vouch&apos;s code (from Jev&apos;s typed answers and the policy&apos;s thresholds), never by a model: Jev
        itself can&apos;t write a sentence.
      </p>
    </div>
  )
}
