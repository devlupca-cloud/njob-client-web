import { Camera, Image as ImageIcon, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface PhotoSourceSheetProps {
  /** When true, the bottom-sheet chooser is shown. */
  open: boolean
  onClose: () => void
  /** Called with the picked files (camera always yields one; gallery may yield many when `multiple`). */
  onPick: (files: File[]) => void
  /** Defaults to images only. */
  accept?: string
  /** Allow selecting multiple files from the gallery. Camera always captures a single photo. */
  multiple?: boolean
  /** Hint for which camera to open: 'user' (front, good for selfies/avatars) or 'environment' (rear). */
  capture?: 'user' | 'environment'
}

/**
 * Bottom-sheet that lets the user choose between taking a photo with the camera
 * or picking from the gallery. A plain `<input type="file" accept="image/*">`
 * opens straight into the gallery on many Android devices (no camera option),
 * so we render two inputs: one with `capture` (camera) and one without (gallery).
 * Works on both Android and iOS.
 */
export default function PhotoSourceSheet({
  open,
  onClose,
  onPick,
  accept = 'image/*',
  multiple = false,
  capture = 'environment',
}: PhotoSourceSheetProps) {
  const { t } = useTranslation()

  if (!open) return null

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return
    onPick(files)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md rounded-t-2xl p-6 pb-10 bg-[hsl(var(--card))] border-t border-[hsl(var(--border))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-base font-semibold text-[hsl(var(--foreground))]">
            {t('common.photoSource.title')}
          </h3>
          <button
            onClick={onClose}
            className="text-[hsl(var(--muted-foreground))]"
            aria-label={t('common.photoSource.close')}
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <label className="block w-full cursor-pointer">
            <input
              type="file"
              accept={accept}
              capture={capture}
              className="hidden"
              onChange={handleChange}
            />
            <div className="w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-medium transition-opacity hover:opacity-90 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]">
              <Camera className="w-4 h-4" />
              {t('common.photoSource.takePhoto')}
            </div>
          </label>

          <label className="block w-full cursor-pointer">
            <input
              type="file"
              accept={accept}
              multiple={multiple}
              className="hidden"
              onChange={handleChange}
            />
            <div className="w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-medium transition-opacity hover:opacity-90 border border-[hsl(var(--border))] text-[hsl(var(--foreground))]">
              <ImageIcon className="w-4 h-4" />
              {t('common.photoSource.chooseFromGallery')}
            </div>
          </label>
        </div>
      </div>
    </div>
  )
}
