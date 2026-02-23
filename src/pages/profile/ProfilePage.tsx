import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  User,
  Tag,
  ChevronRight,
  LogOut,
  Camera,
  Loader2,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useAuth } from '@/hooks/useAuth'
import { useTranslation } from 'react-i18next'

interface NavSection {
  icon: React.ElementType
  label: string
  path: string
  danger?: boolean
}

export default function ProfilePage() {
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const { profile, user, setProfile } = useAuthStore()
  const { t } = useTranslation()
  const [uploading, setUploading] = useState(false)
  const [avatarError, setAvatarError] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const sections: NavSection[] = [
    { icon: User, label: t('profile.personalInfo'), path: '/profile/info' },
    { icon: Tag, label: t('profile.coupons'), path: '/coupons' },
  ]

  useEffect(() => {
    if (!user?.id) return
    supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data) setProfile(data)
      })
  }, [user?.id])

  const handleAvatarClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user?.id) return

    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const filePath = `avatars/${user.id}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true })

      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath)

      const avatar_url = urlData.publicUrl

      await supabase
        .from('profiles')
        .update({ avatar_url })
        .eq('id', user.id)

      setProfile({ ...profile!, avatar_url })
      setAvatarError(false)
    } catch (err) {
      console.error(t('profile.avatarError'), err)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleLogout = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  const displayName = profile?.full_name ?? user?.email?.split('@')[0] ?? t('common.user')
  const username = profile?.username ? `@${profile.username}` : user?.email ?? ''
  const avatarUrl = !avatarError && profile?.avatar_url ? profile.avatar_url : null

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[hsl(var(--background))] border-b border-[hsl(var(--border))]">
        <div className="flex items-center justify-center h-14 px-4 max-w-2xl mx-auto">
          <h1 className="text-base font-semibold text-[hsl(var(--foreground))]">{t('profile.title')}</h1>
        </div>
      </div>

      <div className="px-4 pt-8 pb-4 flex flex-col items-center gap-3 max-w-2xl mx-auto">
        {/* Avatar */}
        <div className="relative">
          <button
            onClick={handleAvatarClick}
            disabled={uploading}
            className="relative w-24 h-24 rounded-full overflow-hidden bg-[hsl(var(--card))] border-2 border-[hsl(var(--border))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))] focus:ring-offset-2 focus:ring-offset-[hsl(var(--background))]"
            aria-label={t('profile.changeAvatar')}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName}
                className="w-full h-full object-cover"
                onError={() => setAvatarError(true)}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-[hsl(var(--primary)/0.15)]">
                <User className="w-10 h-10 text-[hsl(var(--primary))]" />
              </div>
            )}

            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
              {uploading ? (
                <Loader2 className="w-6 h-6 text-white animate-spin" />
              ) : (
                <Camera className="w-6 h-6 text-white" />
              )}
            </div>
          </button>

          <button
            onClick={handleAvatarClick}
            disabled={uploading}
            className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-[hsl(var(--primary))] flex items-center justify-center border-2 border-[hsl(var(--background))] shadow-md"
            aria-hidden="true"
            tabIndex={-1}
          >
            <Camera className="w-3.5 h-3.5 text-[hsl(var(--primary-foreground))]" />
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* Name and username */}
        <div className="text-center">
          <h2 className="text-xl font-bold text-[hsl(var(--foreground))]">{displayName}</h2>
          {username && (
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">{username}</p>
          )}
        </div>
      </div>

      {/* Navigation sections */}
      <div className="px-4 mt-4 max-w-2xl mx-auto">
        <div className="bg-[hsl(var(--card))] rounded-2xl overflow-hidden border border-[hsl(var(--border))]">
          {sections.map(({ icon: Icon, label, path }, index) => (
            <div key={path}>
              <button
                onClick={() => navigate(path)}
                className="w-full flex items-center gap-3 px-4 h-14 text-left hover:bg-[hsl(var(--primary)/0.05)] active:bg-[hsl(var(--primary)/0.1)] transition-colors"
              >
                <Icon className="w-5 h-5 text-[hsl(var(--primary))] shrink-0" />
                <span className="flex-1 text-sm text-[hsl(var(--foreground))]">{label}</span>
                <ChevronRight className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
              </button>
              {index < sections.length - 1 && (
                <div className="h-px bg-[hsl(var(--border))] ml-12" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Logout button */}
      <div className="px-4 mt-4 max-w-2xl mx-auto">
        <div className="bg-[hsl(var(--card))] rounded-2xl overflow-hidden border border-[hsl(var(--border))]">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 h-14 text-left hover:bg-red-500/5 active:bg-red-500/10 transition-colors"
          >
            <LogOut className="w-5 h-5 text-red-500 shrink-0" />
            <span className="flex-1 text-sm text-red-500 font-medium">{t('profile.logout')}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
