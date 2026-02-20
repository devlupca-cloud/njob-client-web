import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  User,
  FileSignature,
  CreditCard,
  Tag,
  DollarSign,
  ShoppingBag,
  ChevronRight,
  LogOut,
  Camera,
  Loader2,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useAuth } from '@/hooks/useAuth'

interface NavSection {
  icon: React.ElementType
  label: string
  path: string
  danger?: boolean
}

const sections: NavSection[] = [
  { icon: User, label: 'Informações pessoais', path: '/profile/info' },
  { icon: FileSignature, label: 'Assinatura', path: '/subscription' },
  { icon: CreditCard, label: 'Pagamentos', path: '/payments/cards' },
  { icon: Tag, label: 'Cupons', path: '/coupons' },
  { icon: DollarSign, label: 'Financeiro', path: '/financial' },
  { icon: ShoppingBag, label: 'Compras', path: '/purchases' },
]

export default function ProfilePage() {
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const { profile, user, setProfile } = useAuthStore()
  const [uploading, setUploading] = useState(false)
  const [avatarError, setAvatarError] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Busca dados atualizados do perfil ao montar
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
      console.error('Erro ao fazer upload do avatar:', err)
    } finally {
      setUploading(false)
      // Reset input para permitir re-upload do mesmo arquivo
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleLogout = async () => {
    try {
      await signOut()
      navigate('/login', { replace: true })
    } catch (err) {
      console.error('Erro ao fazer logout:', err)
    }
  }

  const displayName = profile?.full_name ?? user?.email?.split('@')[0] ?? 'Usuário'
  const username = profile?.username ? `@${profile.username}` : user?.email ?? ''
  const avatarUrl = !avatarError && profile?.avatar_url ? profile.avatar_url : null

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] pb-20 max-w-2xl mx-auto w-full">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[hsl(var(--background))] border-b border-[hsl(var(--border))]">
        <div className="flex items-center justify-center h-14 px-4">
          <h1 className="text-base font-semibold text-[hsl(var(--foreground))]">Perfil</h1>
        </div>
      </div>

      <div className="px-4 pt-8 pb-4 flex flex-col items-center gap-3">
        {/* Avatar */}
        <div className="relative">
          <button
            onClick={handleAvatarClick}
            disabled={uploading}
            className="relative w-24 h-24 rounded-full overflow-hidden bg-[hsl(var(--card))] border-2 border-[hsl(var(--border))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))] focus:ring-offset-2 focus:ring-offset-[hsl(var(--background))]"
            aria-label="Alterar foto de perfil"
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

            {/* Overlay de upload */}
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
              {uploading ? (
                <Loader2 className="w-6 h-6 text-white animate-spin" />
              ) : (
                <Camera className="w-6 h-6 text-white" />
              )}
            </div>
          </button>

          {/* Indicador de edição */}
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

        {/* Nome e username */}
        <div className="text-center">
          <h2 className="text-xl font-bold text-[hsl(var(--foreground))]">{displayName}</h2>
          {username && (
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">{username}</p>
          )}
        </div>
      </div>

      {/* Seções de navegação */}
      <div className="px-4 mt-4">
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

      {/* Botão de logout */}
      <div className="px-4 mt-4">
        <div className="bg-[hsl(var(--card))] rounded-2xl overflow-hidden border border-[hsl(var(--border))]">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 h-14 text-left hover:bg-red-500/5 active:bg-red-500/10 transition-colors"
          >
            <LogOut className="w-5 h-5 text-red-500 shrink-0" />
            <span className="flex-1 text-sm text-red-500 font-medium">Sair da conta</span>
          </button>
        </div>
      </div>
    </div>
  )
}
