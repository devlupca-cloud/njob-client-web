import { MessageCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

// Placeholder do painel direito quando nenhuma conversa está selecionada
// (só aparece no desktop; no mobile o painel direito fica oculto sem seleção).
export default function ChatEmpty() {
  const { t } = useTranslation()
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8 bg-[hsl(var(--card)/0.3)]">
      <div className="w-16 h-16 rounded-full bg-[hsl(var(--card))] flex items-center justify-center">
        <MessageCircle className="w-8 h-8 text-[hsl(var(--muted-foreground))]" />
      </div>
      <p className="text-sm text-[hsl(var(--muted-foreground))] max-w-xs">
        {t('chat.selectConversation')}
      </p>
    </div>
  )
}
