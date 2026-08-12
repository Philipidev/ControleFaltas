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
 * **Dentro da faixa não dá para desenhar.** Foi testado no aparelho: com a
 * barra empurrada para lá, o print mostra a tinta sumindo no meio dos ícones,
 * na linha de 911,5pt. A superfície acaba nos 912 mesmo — os 44px restantes
 * são pintados pelo iOS com a cor de fundo da página, e o app não os alcança.
 *
 * Então o que a medida serve para corrigir é o recuo: `.barra-inferior`
 * desconta a faixa do `safe-area-inset-bottom`, porque com ela no meio o
 * indicador de gesto não encosta na barra e reservar 34px para ele é jogar
 * fora o pouco que sobrou.
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
 *
 * Medir uma vez só não serve, e isso custou um deploy: no boot o iOS reporta
 * `innerHeight` de 894 (o viewport pequeno) e só depois assenta em 912. A
 * primeira leitura deu uma faixa de 62px em vez de 44 e ficou lá, porque
 * nenhum `resize` veio corrigir. Daí a insistência: quadro seguinte, `load`,
 * e todo evento que mexe no viewport.
 */
export function observarFaixaFantasma(): void {
  aplicar()
  requestAnimationFrame(aplicar)
  window.addEventListener('load', aplicar)
  window.addEventListener('resize', aplicar)
  window.addEventListener('orientationchange', aplicar)
  // Quem realmente muda quando o WebKit assenta o viewport: no iOS o
  // `resize` da janela nem sempre acompanha.
  window.visualViewport?.addEventListener('resize', aplicar)
}
