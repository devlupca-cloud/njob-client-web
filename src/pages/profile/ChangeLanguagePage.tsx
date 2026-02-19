import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Check } from 'lucide-react'

interface Language {
  code: string
  label: string
  nativeLabel: string
  flag: string
}

const languages: Language[] = [
  {
    code: 'pt-BR',
    label: 'Português (BR)',
    nativeLabel: 'Português do Brasil',
    flag: '🇧🇷',
  },
  {
    code: 'en',
    label: 'English',
    nativeLabel: 'English',
    flag: '🇺🇸',
  },
  {
    code: 'es',
    label: 'Español',
    nativeLabel: 'Español',
    flag: '🇪🇸',
  },
]

const STORAGE_KEY = 'njob-language'

export default function ChangeLanguagePage() {
  const navigate = useNavigate()
  const [selected, setSelected] = useState<string>(
    () => localStorage.getItem(STORAGE_KEY) ?? 'pt-BR'
  )
  const [saved, setSaved] = useState(false)

  const handleSelect = (code: string) => {
    setSelected(code)
    setSaved(false)
  }

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, selected)
    setSaved(true)
    setTimeout(() => {
      navigate(-1)
    }, 800)
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[hsl(var(--background))] border-b border-[hsl(var(--border))]">
        <div className="relative flex items-center justify-center h-14 px-4">
          <button
            onClick={() => navigate(-1)}
            className="absolute left-4 flex items-center justify-center w-8 h-8 rounded-full hover:bg-[hsl(var(--card))] transition-colors"
            aria-label="Voltar"
          >
            <ArrowLeft className="w-5 h-5 text-[hsl(var(--foreground))]" />
          </button>
          <h1 className="text-base font-semibold text-[hsl(var(--foreground))]">Idioma</h1>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="px-4 pt-8 flex flex-col gap-6">
        {/* Descrição */}
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Selecione o idioma de sua preferência.
        </p>

        {/* Lista de idiomas */}
        <div className="bg-[hsl(var(--card))] rounded-2xl overflow-hidden border border-[hsl(var(--border))]">
          {languages.map(({ code, label, nativeLabel, flag }, index) => {
            const isSelected = selected === code
            return (
              <div key={code}>
                <button
                  onClick={() => handleSelect(code)}
                  className={`w-full flex items-center gap-3 px-4 h-16 text-left transition-colors
                    ${isSelected
                      ? 'bg-[hsl(var(--primary)/0.08)]'
                      : 'hover:bg-[hsl(var(--primary)/0.05)] active:bg-[hsl(var(--primary)/0.1)]'
                    }`}
                >
                  {/* Flag */}
                  <span className="text-2xl leading-none">{flag}</span>

                  {/* Labels */}
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${isSelected ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--foreground))]'}`}>
                      {label}
                    </p>
                    {nativeLabel !== label && (
                      <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                        {nativeLabel}
                      </p>
                    )}
                  </div>

                  {/* Check icon */}
                  {isSelected && (
                    <div className="w-6 h-6 rounded-full bg-[hsl(var(--primary))] flex items-center justify-center shrink-0">
                      <Check className="w-3.5 h-3.5 text-[hsl(var(--primary-foreground))]" strokeWidth={3} />
                    </div>
                  )}
                </button>
                {index < languages.length - 1 && (
                  <div className="h-px bg-[hsl(var(--border))] ml-14" />
                )}
              </div>
            )
          })}
        </div>

        {/* Botão salvar */}
        <button
          onClick={handleSave}
          disabled={saved}
          className="w-full h-12 rounded-xl font-semibold text-sm transition-all duration-200
            bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]
            hover:bg-[hsl(var(--primary)/0.9)] active:scale-[0.98]
            disabled:opacity-70 disabled:cursor-not-allowed disabled:active:scale-100
            flex items-center justify-center gap-2
            shadow-[0_0_24px_hsl(var(--primary)/0.3)]"
        >
          {saved ? (
            <>
              <Check className="w-4 h-4" />
              Salvo!
            </>
          ) : (
            'Salvar preferência'
          )}
        </button>
      </div>
    </div>
  )
}
