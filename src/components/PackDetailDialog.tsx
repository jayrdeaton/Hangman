import { JSX, useMemo, useState } from 'react'

import { getPuzzleManifest } from '@/utils/puzzleCatalog'

import { DialogShell } from './DialogShell'
import { PackDetailContent } from './PackDetailContent'

export type PackDetailDialogProps = {
  visible: boolean
  onDismiss: () => void
  packKey: string | null
}

export const PackDetailDialog = ({ visible, onDismiss, packKey }: PackDetailDialogProps): JSX.Element => {
  // Keeps showing the last-open pack's title and content while the dialog fades out, instead of
  // going blank the instant the caller clears packKey to dismiss. Updated during render (not an
  // effect) per React's "adjusting state when a prop changes" pattern.
  const [resolvedKey, setResolvedKey] = useState<string | null>(packKey)
  if (packKey && packKey !== resolvedKey) setResolvedKey(packKey)

  const label = useMemo(() => getPuzzleManifest().find((item) => item.key === resolvedKey)?.label ?? '', [resolvedKey])

  return (
    <DialogShell visible={visible} onDismiss={onDismiss} title={label}>
      <PackDetailContent packKey={resolvedKey} />
    </DialogShell>
  )
}
