'use client'

import {useState} from 'react'
import {inputClass, secondaryButton} from '@/components/form'
import type {CatalogItem} from '@/lib/catalog-match'
import {MAX_CHECKLIST_LINES} from '@/lib/catalog-match'

/**
 * Checklist lines picked from the supply catalog: quantities up to the item's household maximum,
 * remove, and add from the catalog grouped by category. Used by the ask form and the resubmit form.
 */

export type EditorLine = {supplyItemId: string; quantity: number}

export function ChecklistEditor<L extends EditorLine>({
  id,
  catalog,
  categoryOrder,
  lines,
  onChange,
  newLine,
  describe,
}: {
  id: string
  catalog: CatalogItem[]
  categoryOrder: string[]
  lines: L[]
  onChange: (update: (current: L[]) => L[]) => void
  newLine: (supplyItemId: string) => L
  /** One line of provenance under an item (e.g. "Matched by Jev from your words"). */
  describe?: (line: L, item: CatalogItem) => string
}) {
  const [addChoice, setAddChoice] = useState('')
  const byId = new Map(catalog.map((item) => [item._id, item]))
  const available = catalog.filter((item) => !lines.some((line) => line.supplyItemId === item._id))
  const groups = categoryOrder
    .map((category) => ({category, items: available.filter((item) => item.category === category)}))
    .filter((group) => group.items.length > 0)
  const selectedAdd = available.find((item) => item._id === addChoice) ?? null

  return (
    <div className="flex flex-col gap-5">
      {lines.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {lines.map((line) => {
            const item = byId.get(line.supplyItemId)
            if (!item) return null
            return (
              <li key={line.supplyItemId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {item.name} <span className="text-sm font-normal text-muted">({item.unit})</span>
                  </p>
                  {describe ? <p className="text-xs text-muted">{describe(line, item)}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  <label className="sr-only" htmlFor={`${id}-qty-${line.supplyItemId}`}>
                    How many {item.name}
                  </label>
                  <select
                    id={`${id}-qty-${line.supplyItemId}`}
                    value={Math.min(line.quantity, item.maxPerHousehold)}
                    onChange={(event) =>
                      onChange((current) =>
                        current.map((l) => (l.supplyItemId === line.supplyItemId ? {...l, quantity: Number(event.target.value)} : l)),
                      )
                    }
                    className="rounded-xl border border-border bg-surface-2 px-2 py-1.5 text-sm"
                  >
                    {Array.from({length: item.maxPerHousehold}, (_, index) => index + 1).map((count) => (
                      <option key={count} value={count}>
                        {count}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => onChange((current) => current.filter((l) => l.supplyItemId !== line.supplyItemId))}
                    className="rounded-lg px-2 py-1 text-sm text-muted hover:text-danger"
                    aria-label={`Remove ${item.name}`}
                  >
                    Remove
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}

      {lines.length < MAX_CHECKLIST_LINES ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-add`} className="text-sm font-medium">
            Add an item from the catalog
          </label>
          <div className="flex flex-wrap gap-2">
            <select
              id={`${id}-add`}
              value={selectedAdd?._id ?? ''}
              onChange={(event) => setAddChoice(event.target.value)}
              className={`${inputClass} min-w-0 flex-1`}
            >
              <option value="">Choose an item…</option>
              {groups.map((group) => (
                <optgroup key={group.category} label={group.category}>
                  {group.items.map((item) => (
                    <option key={item._id} value={item._id}>
                      {item.name} ({item.unit})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <button
              type="button"
              disabled={!selectedAdd}
              onClick={() => {
                if (!selectedAdd) return
                onChange((current) => [...current, newLine(selectedAdd._id)])
                setAddChoice('')
              }}
              className={secondaryButton}
            >
              Add
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted">A checklist can have up to {MAX_CHECKLIST_LINES} items.</p>
      )}
    </div>
  )
}
