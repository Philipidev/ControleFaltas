/**
 * Instalar o app na tela de início — o que cada sistema permite.
 *
 * Android e desktop (Chrome/Edge): existe API. O navegador dispara
 * `beforeinstallprompt`, a gente guarda o evento e chama `prompt()` no clique.
 * Um toque e acabou.
 *
 * iOS: **não existe API nenhuma.** Nem `beforeinstallprompt`, nem equivalente.
 * O único caminho é Compartilhar → "Adicionar à Tela de Início", feito à mão
 * pela pessoa. Então lá o botão não instala: ele ensina. Fingir um botão de
 * instalar que não instala seria pior que não ter botão.
 *
 * E em iOS o "Adicionar à Tela de Início" que gera app de verdade é o do
 * **Safari**. No Chrome ou Firefox do iPhone a opção existe mas cria um atalho
 * do próprio navegador, sem tela cheia e sem ícone certo — por isso esse caso
 * tem instrução própria.
 */

import { useSyncExternalStore } from 'react'

/** Não existe no lib.dom porque não é padrão — só Chromium implementa. */
interface EventoDeInstalacao extends Event {
  readonly platforms: readonly string[]
  prompt: () => Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type EstadoInstalacao =
  /** Já está na tela de início: não há o que oferecer. */
  | 'instalado'
  /** Chromium guardou o convite: dá para instalar num toque. */
  | 'pronto'
  /** iOS no Safari: só instruções. */
  | 'ios-safari'
  /** iOS fora do Safari: precisa abrir no Safari antes. */
  | 'ios-outro-navegador'
  /** Navegador sem suporte, ou o convite ainda não chegou. */
  | 'indisponivel'

// ---------------------------------------------------------------------------
// Detecção
// ---------------------------------------------------------------------------

/** O que o navegador informa, isolado para o teste poder fabricar cenários. */
export interface Ambiente {
  readonly userAgent: string
  readonly maxTouchPoints: number
  /** display-mode standalone OU navigator.standalone do Safari. */
  readonly emTelaCheia: boolean
  /** O Chromium já ofereceu o convite de instalação. */
  readonly temConvite: boolean
}

/**
 * A decisão inteira, sem tocar em `window`.
 *
 * Separada porque é a parte que erra: a diferença entre iPad e Mac, e entre
 * Safari e Chrome do iPhone, mora em detalhes de user agent que não dá para
 * conferir de um computador com Windows. Como função pura, o teste fabrica
 * cada aparelho e a regra fica verificável.
 */
export function classificar(a: Ambiente): EstadoInstalacao {
  if (a.emTelaCheia) return 'instalado'
  // O convite vem antes da checagem de iOS porque só o Chromium o emite, e
  // ter o convite é prova de que a instalação com um toque existe.
  if (a.temConvite) return 'pronto'

  const ehIPhone = /iPad|iPhone|iPod/.test(a.userAgent)
  // iPadOS 13+ se apresenta como Macintosh. O toque é o que o denuncia — um
  // Mac de verdade reporta maxTouchPoints 0.
  const ehIPadDisfarcado = a.userAgent.includes('Macintosh') && a.maxTouchPoints > 1
  if (!ehIPhone && !ehIPadDisfarcado) return 'indisponivel'

  // Todo navegador no iOS roda WebKit e escreve "Safari" no UA; o que
  // distingue são os sufixos que cada um acrescenta.
  const ehOutroNavegador = /CriOS|FxiOS|EdgiOS|OPiOS/.test(a.userAgent)
  return ehOutroNavegador ? 'ios-outro-navegador' : 'ios-safari'
}

function lerAmbiente(temConvite: boolean): Ambiente {
  return {
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    emTelaCheia:
      window.matchMedia('(display-mode: standalone)').matches ||
      // Só o Safari do iOS usa navigator.standalone, e ele não é padrão.
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
    temConvite,
  }
}

// ---------------------------------------------------------------------------
// Captura do convite do Chromium
// ---------------------------------------------------------------------------

let convite: EventoDeInstalacao | null = null
let instalado = false
const ouvintes = new Set<() => void>()

function avisar(): void {
  for (const o of ouvintes) o()
}

/**
 * Registrado no import, e não dentro de um componente.
 *
 * `beforeinstallprompt` dispara cedo — muitas vezes antes do React montar. Um
 * listener criado em `useEffect` chegaria depois da festa, e o botão nunca
 * apareceria no Android.
 */
export function observarInstalacao(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Sem isto o Chrome mostra a própria barra de instalação, competindo com
    // o botão do app.
    e.preventDefault()
    convite = e as EventoDeInstalacao
    avisar()
  })

  window.addEventListener('appinstalled', () => {
    instalado = true
    convite = null
    avisar()
  })
}

function inscrever(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte)
  return () => ouvintes.delete(ouvinte)
}

function lerEstado(): EstadoInstalacao {
  if (instalado) return 'instalado'
  return classificar(lerAmbiente(convite !== null))
}

export function useEstadoInstalacao(): EstadoInstalacao {
  // O terceiro argumento é o snapshot do servidor. O build é estático e não
  // há SSR, mas useSyncExternalStore o exige quando o app é hidratado.
  return useSyncExternalStore(inscrever, lerEstado, () => 'indisponivel' as const)
}

/**
 * Dispara o convite do Chromium.
 *
 * Devolve o que a pessoa escolheu. O convite é de uso único: depois de
 * `prompt()` o navegador não reaproveita o mesmo evento, então ele é
 * descartado aqui — se ela recusar, só volta a aparecer numa visita futura,
 * quando o Chrome resolver disparar de novo.
 */
export async function pedirInstalacao(): Promise<'aceito' | 'recusado' | 'indisponivel'> {
  if (convite === null) return 'indisponivel'
  const evento = convite
  convite = null
  avisar()

  await evento.prompt()
  const { outcome } = await evento.userChoice
  return outcome === 'accepted' ? 'aceito' : 'recusado'
}
