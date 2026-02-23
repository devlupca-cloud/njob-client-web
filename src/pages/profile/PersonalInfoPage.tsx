import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ChevronRight, User, Mail, Lock, Globe } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useTranslation } from 'react-i18next'

interface InfoItem {
  icon: React.ElementType
  label: string
  getValue: (profile: ReturnType<typeof useAuthStore.getState>['profile'], email?: string | null) => string
  path: string
}

export default function PersonalInfoPage() {
  const navigate = useNavigate()
  const { profile, user } = useAuthStore()
  const { t } = useTranslation()
  const userEmail = user?.email

  const infoItems: InfoItem[] = [
    {
      icon: User,
      label: t('profile.personalInfoPage.name'),
      getValue: (p) => p?.full_name ?? '-',
      path: '/profile/info/name',
    },
    {
      icon: Mail,
      label: t('profile.personalInfoPage.email'),
      getValue: (_p, email) => email ?? '-',
      path: '/profile/info/email',
    },
    {
      icon: Lock,
      label: t('profile.personalInfoPage.password'),
      getValue: () => '••••••••',
      path: '/profile/info/password',
    },
    {
      icon: Globe,
      label: t('profile.personalInfoPage.language'),
      getValue: () => {
        const lang = localStorage.getItem('njob-language') ?? 'pt-BR'
        const labels: Record<string, string> = {
          'pt-BR': 'Português (BR)',
          'en': 'English',
          'es': 'Español',
        }
        return labels[lang] ?? 'Português (BR)'
      },
      path: '/profile/info/language',
    },
  ]

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[hsl(var(--background))] border-b border-[hsl(var(--border))]">
        <div className="relative flex items-center justify-center h-14 px-4 max-w-2xl mx-auto">
          <button
            onClick={() => navigate(-1)}
            className="absolute left-4 flex items-center justify-center w-8 h-8 rounded-full hover:bg-[hsl(var(--card))] transition-colors"
            aria-label={t('common.back')}
          >
            <ArrowLeft className="w-5 h-5 text-[hsl(var(--foreground))]" />
          </button>
          <h1 className="text-base font-semibold text-[hsl(var(--foreground))]">
            {t('profile.personalInfoPage.title')}
          </h1>
        </div>
      </div>

      {/* Avatar and name */}
      <div className="px-4 pt-6 pb-4 flex flex-col items-center gap-2 max-w-2xl mx-auto">
        <div className="w-20 h-20 rounded-full overflow-hidden bg-[hsl(var(--card))] border-2 border-[hsl(var(--border))]">
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={profile.full_name ?? 'Avatar'}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-[hsl(var(--primary)/0.15)]">
              <User className="w-8 h-8 text-[hsl(var(--primary))]" />
            </div>
          )}
        </div>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          {profile?.full_name ?? userEmail ?? t('common.user')}
        </p>
      </div>

      {/* Info list */}
      <div className="px-4 mt-2 max-w-2xl mx-auto">
        <div className="bg-[hsl(var(--card))] rounded-2xl overflow-hidden border border-[hsl(var(--border))]">
          {infoItems.map(({ icon: Icon, label, getValue, path }, index) => {
            const value = getValue(profile, userEmail)
            return (
              <div key={path}>
                <button
                  onClick={() => navigate(path)}
                  className="w-full flex items-center gap-3 px-4 h-14 text-left hover:bg-[hsl(var(--primary)/0.05)] active:bg-[hsl(var(--primary)/0.1)] transition-colors"
                >
                  <Icon className="w-5 h-5 text-[hsl(var(--primary))] shrink-0" />
                  <span className="flex-1 text-sm font-medium text-[hsl(var(--foreground))]">
                    {label}
                  </span>
                  <span className="text-sm text-[hsl(var(--muted-foreground))] mr-1 max-w-[140px] truncate">
                    {value}
                  </span>
                  <ChevronRight className="w-4 h-4 text-[hsl(var(--muted-foreground))] shrink-0" />
                </button>
                {index < infoItems.length - 1 && (
                  <div className="h-px bg-[hsl(var(--border))] ml-12" />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
