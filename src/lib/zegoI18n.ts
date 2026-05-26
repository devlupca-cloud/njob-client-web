// O ZegoCloud UIKit só vem em en/zh. Traduzimos os textos visíveis via
// MutationObserver (troca o textContent de nós-folha que batem no dicionário).
// Usado nas salas do client (live do espectador e videochamada).

const ZEGO_TRANSLATIONS: Record<string, Record<string, string>> = {
  pt: {
    'Go Live': 'Iniciar Live',
    'Start': 'Iniciar',
    'Start Live': 'Iniciar Live',
    'End': 'Finalizar',
    'End Live': 'Finalizar Live',
    'Stop': 'Finalizar',
    'Stop broadcast': 'Finalizar transmissão',
    'Are you sure to stop broadcasting?': 'Tem certeza que deseja finalizar a transmissão?',
    'The Live has not started yet': 'A live ainda não começou',
    'The live has not started yet': 'A live ainda não começou',
    'Waiting for the host to start': 'Aguardando o apresentador iniciar',
    'The Live has ended': 'A live foi encerrada',
    'The live has ended': 'A live foi encerrada',
    'No host is online': 'O apresentador não está online',
    'Leave': 'Sair',
    'Leave the room': 'Sair da sala',
    'Leave Room': 'Sair da sala',
    'Are you sure to leave the room?': 'Tem certeza que deseja sair da sala?',
    'The host has left the room': 'O apresentador saiu da sala',
    'You are the host': 'Você é o apresentador',
    'No one else is here': 'Ninguém mais está aqui',
    'The call has ended': 'A chamada foi encerrada',
    'Cancel': 'Cancelar',
    'Confirm': 'Confirmar',
    'OK': 'OK',
    'Done': 'Concluído',
    'Retry': 'Tentar novamente',
    'Settings': 'Configurações',
    'Camera': 'Câmera',
    'Microphone': 'Microfone',
    'Speaker': 'Alto-falante',
    'Members': 'Participantes',
    'Member': 'Participante',
    'Host': 'Apresentador',
    'Audience': 'Espectador',
    'Connecting': 'Conectando',
    'Connecting...': 'Conectando...',
    'Reconnecting': 'Reconectando',
    'Reconnecting...': 'Reconectando...',
    'Disconnected': 'Desconectado',
  },
  es: {
    'Go Live': 'Iniciar Live',
    'Start': 'Iniciar',
    'Start Live': 'Iniciar Live',
    'End': 'Finalizar',
    'Stop': 'Finalizar',
    'Stop broadcast': 'Finalizar transmisión',
    'Are you sure to stop broadcasting?': '¿Seguro que deseas finalizar la transmisión?',
    'The Live has not started yet': 'La transmisión aún no ha comenzado',
    'The live has not started yet': 'La transmisión aún no ha comenzado',
    'The Live has ended': 'La transmisión ha finalizado',
    'Leave': 'Salir',
    'Leave the room': 'Salir de la sala',
    'Leave Room': 'Salir de la sala',
    'Are you sure to leave the room?': '¿Seguro que deseas salir de la sala?',
    'The host has left the room': 'El presentador salió de la sala',
    'You are the host': 'Eres el presentador',
    'No one else is here': 'No hay nadie más aquí',
    'Cancel': 'Cancelar',
    'Confirm': 'Confirmar',
    'OK': 'OK',
    'Settings': 'Configuración',
    'Camera': 'Cámara',
    'Microphone': 'Micrófono',
    'Speaker': 'Altavoz',
    'Members': 'Participantes',
    'Host': 'Presentador',
    'Audience': 'Espectador',
    'Connecting': 'Conectando',
    'Reconnecting': 'Reconectando',
  },
}

/**
 * Observa o container do ZegoCloud e traduz os textos. `language` aceita o
 * código do i18next (pt-BR, en, es) e é normalizado. Retorna cleanup.
 */
export function observeZegoTranslation(
  container: HTMLElement,
  language: string,
): () => void {
  const lang = language.toLowerCase().startsWith('pt')
    ? 'pt'
    : language.toLowerCase().startsWith('es')
      ? 'es'
      : null
  if (!lang) return () => {}
  const dict = ZEGO_TRANSLATIONS[lang]
  if (!dict) return () => {}

  const translateNode = () => {
    const els = container.querySelectorAll(
      'button, [role="button"], div, span, p, h1, h2, h3, label',
    )
    els.forEach((el) => {
      if (el.children.length > 0) return // só nós-folha
      const text = el.textContent?.trim()
      if (text && dict[text]) el.textContent = dict[text]
    })
  }

  const observer = new MutationObserver(translateNode)
  observer.observe(container, {
    childList: true,
    subtree: true,
    characterData: true,
  })
  translateNode()

  return () => observer.disconnect()
}
