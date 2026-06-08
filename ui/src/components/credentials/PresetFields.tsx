/**
 * Reusable preset-enumeration form controls, shared by the AI Provider
 * credential vault and the per-workspace AI config modal.
 *
 * - EndpointField: a region/endpoint <select> built from a preset's enumerated
 *   endpoints, PLUS a "Custom…" escape that never loses a stored non-listed URL
 *   (a bare <select> would silently overwrite a custom endpoint with the first
 *   option on save). When the preset has no endpoints, it degrades to free text.
 * - ModelCombobox: an <input> backed by a <datalist> of suggested models. The
 *   suggestions curb typos (minimax-m3 vs MiniMax-M3) for known vendors while
 *   still allowing a free-typed model id (no version-lock) — and for custom /
 *   unrecognized providers it's just a plain input.
 */

import { useId, useState } from 'react'
import { inputClass } from '../form'
import type { LabeledOption } from '../../lib/presetHelpers'

const CUSTOM = '__custom__'

export function EndpointField({ value, endpoints, onChange, placeholder }: {
  value: string
  endpoints: LabeledOption[]
  onChange: (v: string) => void
  placeholder?: string
}) {
  const hasRegions = endpoints.length > 0
  const known = endpoints.some((e) => e.id === value)
  // Start in custom mode if the stored value is a non-listed, non-empty URL —
  // so editing a credential with a proxy/self-host endpoint keeps it.
  const [custom, setCustom] = useState(hasRegions && !known && value.trim() !== '')
  const showCustom = custom || (!known && value.trim() !== '')
  // The URL box is editable only when there's no region list, or the user chose
  // Custom. Otherwise it shows the resolved URL read-only (but selectable, so
  // the user can see + copy exactly where requests go).
  const editable = !hasRegions || showCustom

  return (
    <div className="space-y-2">
      {hasRegions && (
        <select
          className={inputClass}
          value={showCustom ? CUSTOM : value}
          onChange={(e) => {
            if (e.target.value === CUSTOM) {
              setCustom(true) // keep current value so the box is pre-filled
            } else {
              setCustom(false)
              onChange(e.target.value)
            }
          }}
        >
          {endpoints.map((e) => (
            <option key={e.id} value={e.id}>{e.label}</option>
          ))}
          <option value={CUSTOM}>Custom…</option>
        </select>
      )}
      <input
        className={`${inputClass} font-mono text-[12px]${editable ? '' : ' text-text-muted bg-bg-secondary/40 cursor-default'}`}
        value={value}
        readOnly={!editable}
        onChange={(e) => { if (editable) onChange(e.target.value) }}
        placeholder={editable ? (placeholder ?? 'https://… (leave empty for the official endpoint)') : undefined}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
      />
    </div>
  )
}

export function ModelCombobox({ value, suggestions, onChange, placeholder }: {
  value: string
  suggestions: LabeledOption[]
  onChange: (v: string) => void
  placeholder?: string
}) {
  const listId = useId()
  return (
    <>
      <input
        className={inputClass}
        list={suggestions.length > 0 ? listId : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? 'model id'}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
      />
      {suggestions.length > 0 && (
        <datalist id={listId}>
          {/* Chromium shows the option value (the model id), which is the
              human-meaningful string here; the label is a hint where supported. */}
          {suggestions.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </datalist>
      )}
    </>
  )
}
