/**
 * A faixa que o iOS reserva embaixo do app e não usa.
 *
 * No iPhone com o app na tela de início, o WebKit reporta um viewport MENOR
 * que a tela: `innerHeight` de 912px numa tela de 956px. Os 44px que sobram
 * não recebem barra nenhuma do sistema — ficam pintados com a cor de fundo da
 * página, como se o Safari ainda guardasse lugar para a barra de URL que o
 * modo aplicativo não tem. `100vh` devolve os 956 da tela inteira, e `100dvh`,
 * os 912 do viewport: é a divergência que denuncia a faixa.
 *
 * A consequência é que `position: fixed; bottom: 0` — que é o fim do viewport,
 * não a borda do aparelho — para 44px acima do vidro. A barra de menu fica
 * boiando. E ainda leva por cima o `safe-area-inset-bottom` de 34px, que é
 * recuo para um indicador de gesto que, com a faixa no meio, nem chega a
 * encostar na barra.
 *
 * Aqui a faixa é apenas MEDIDA e publicada como `--faixa-fantasma`. O que
 * fazer com ela é decisão do CSS (`.barra-inferior` em `styles/index.css`),
 * porque depende de uma coisa que só o aparelho responde: se o WebKit
 * realmente desenha dentro da faixa ou se ela está fora da superfície. Daí o
 * seletor de modo no Diagnóstico do aparelho.
 */

/** O que o aparelho informa, isolado para o teste poder fabricar cenários. */
export interface MedidasDaTela {
  /** `screen.height` — a tela física, em px de CSS. */
  readonly alturaDaTela: number
  /** `innerHeight` — o que o WebKit entrega para o layout. */
  readonly alturaDoViewport: number
  /** `navigator.standalone`: só o Safari do iOS o define, e só ele tem o bug. */
  readonly ehAppDoIos: boolean
}

/**
 * Acima disto a diferença não é a faixa: é outra coisa.
 *
 * Em paisagem o iOS mantém `screen.height` em retrato, e a subtração passa de
 * 500px; num iPad em Split View a janela é uma fração da tela. Nos dois casos
 * descontar a diferença do recuo seria absurdo. A faixa real observada é de
 * dezenas de px — 120 deixa folga para variações de aparelho sem deixar
 * passar um cenário desses.
 */
const LIMITE = 120

/**
 * A faixa em px, ou 0 quando não há o que compensar.
 *
 * Função pura porque é a parte que erra, e é impossível conferir de um
 * computador com Windows: cada combinação de aparelho, orientação e versão do
 * iOS produz um trio de números diferente.
 */
export function medirFaixaFantasma(m: MedidasDaTela): number {
  if (!m.ehAppDoIos) return 0
  const faixa = Math.round(m.alturaDaTela - m.alturaDoViewport)
  if (!Number.isFinite(faixa) || faixa <= 0 || faixa > LIMITE) return 0
  return faixa
}

// ---------------------------------------------------------------------------
// Modo da barra — o experimento que só o aparelho decide
// ---------------------------------------------------------------------------

/**
 * - `rasa`: desconta a faixa do recuo do indicador de gesto. Seguro em
 *   qualquer hipótese, porque só encolhe um espaço vazio.
 * - `puxada`: joga a barra para dentro da faixa, até a borda física. É o
 *   resultado certo SE o WebKit desenhar lá — e é isso que o teste no
 *   aparelho responde.
 * - `normal`: o comportamento antigo, para comparar lado a lado.
 */
export type ModoDaBarra = 'normal' | 'rasa' | 'puxada'

export const MODOS_DA_BARRA: readonly ModoDaBarra[] = ['normal', 'rasa', 'puxada']

const CHAVE = 'cf:barra'

/** `rasa` é o padrão: melhora os dois cenários e não pode cortar nada. */
export function lerModoDaBarra(): ModoDaBarra {
  try {
    const salvo = localStorage.getItem(CHAVE)
    if (salvo !== null && (MODOS_DA_BARRA as readonly string[]).includes(salvo)) {
      return salvo as ModoDaBarra
    }
  } catch {
    /* localStorage bloqueado: fica no padrão */
  }
  return 'rasa'
}

export function definirModoDaBarra(modo: ModoDaBarra): void {
  document.documentElement.dataset.barra = modo
  try {
    localStorage.setItem(CHAVE, modo)
  } catch {
    /* modo anônimo com storage bloqueado: vale só nesta sessão */
  }
}

function aplicar(): void {
  const faixa = medirFaixaFantasma({
    alturaDaTela: window.screen.height,
    alturaDoViewport: window.innerHeight,
    ehAppDoIos: (navigator as Navigator & { standalone?: boolean }).standalone === true,
  })
  document.documentElement.style.setProperty('--faixa-fantasma', `${String(faixa)}px`)
}

/**
 * Chamado no `main.tsx`, antes do render: a barra é uma das primeiras coisas
 * pintadas, e ler a faixa depois faria o menu saltar no primeiro frame.
 */
export function observarFaixaFantasma(): void {
  document.documentElement.dataset.barra = lerModoDaBarra()
  aplicar()
  // `orientationchange` dispara antes de o viewport assentar; o `resize` que
  // vem logo atrás é quem traz o número certo. Os dois ficam por segurança.
  window.addEventListener('resize', aplicar)
  window.addEventListener('orientationchange', aplicar)
}
