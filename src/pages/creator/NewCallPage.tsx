// @deprecated Agenda fixa substituída pelo fluxo "Online + Solicitação" (20/04/2026).
// O agendamento prévio de videochamada não existe mais — o BookingCallModal no
// perfil do creator cuida de todo o fluxo. A rota /calls/new é mantida apenas
// para não quebrar links antigos; redireciona direto para a home.
import { Navigate } from 'react-router-dom'

export default function NewCallPage() {
  return <Navigate to="/home" replace />
}
