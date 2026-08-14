import {
  LIMITES_PADRAO,
  ultrapassa,
  type Falta,
  type Limites,
  type Status,
} from './tipos.ts'

/**
 * §4 — Cálculo de risco (semáforo).
 *
 * Regra da faculdade: reprovado por falta acima de 25% da carga horária.
 * Faixas da spec:
 *
 *   verde     até 15%          tranquilo
 *   amarelo   de 15% a 20%     atenção, se aproximando do limite
 *   vermelho  acima de 20%     risco de reprovação por falta
 *
 * O quarto estado, 'reprovado' (acima de 25%), é adição nossa: a tabela da
 * spec para em "risco", mas a regra dos 25% implica um ponto sem volta, e a
 * UI precisa parar de sugerir "você ainda pode faltar X" quando não pode mais.
 */

export interface ResumoRisco {
  /** Horas que contam para o cálculo — todas elas, com atestado ou sem. */
  readonly totalFaltado: number
  /**
   * Quanto do total acima você tem atestado para justificar. É um subconjunto
   * de `totalFaltado`, não uma parcela descontada dele (§7.1).
   */
  readonly totalJustificado: number
  /** Todas as faltas do período. */
  readonly qtdFaltas: number
  /** Quantas delas têm atestado. Subconjunto de `qtdFaltas`. */
  readonly qtdJustificadas: number
  readonly cargaHorariaTotal: number
  /** 0..1. Multiplique por 100 para exibir. */
  readonly percentual: number
  readonly status: Status
  /** Teto absoluto de horas: 25% da carga. */
  readonly horasLimite: number
  /** Quanto ainda dá para perder antes de reprovar. Nunca negativo. */
  readonly horasRestantes: number
  /**
   * Fração do "orçamento de faltas" já gasta (0..1+). É o número certo para
   * uma barra de progresso: 100% aqui = reprovado, enquanto 100% do
   * percentual bruto significaria ter faltado o semestre inteiro.
   */
  readonly consumoDoLimite: number
  readonly ultrapassouLimite: boolean
}

export function statusPara(percentual: number, limites: Limites = LIMITES_PADRAO): Status {
  if (ultrapassa(percentual, limites.limiteReprovacao)) return 'reprovado'
  if (ultrapassa(percentual, limites.faixaAmarela)) return 'vermelho'
  if (ultrapassa(percentual, limites.faixaVerde)) return 'amarelo'
  return 'verde'
}

/**
 * §7.1 — quais horas entram na conta: todas.
 *
 * Já houve uma chave aqui, e ela decidia se o atestado tirava a falta do
 * cálculo. Ela saiu porque a resposta certa depende do regimento de cada
 * faculdade, e na maioria delas o atestado comum NÃO abona frequência — só o
 * regime de exercícios domiciliares faz isso. Um app que descontasse por
 * padrão mostraria verde para quem a secretaria vê em vermelho, e errar para
 * esse lado é o único erro que custa o semestre.
 *
 * O atestado continua registrado: `totalJustificado` e `qtdJustificadas`
 * existem para isso. Ele é o seu comprovante de que o papel existe, não um
 * desconto.
 */
export function horasQueContam(faltas: readonly Falta[]): number {
  return faltas.reduce((soma, f) => soma + f.horasPerdidas, 0)
}

export function calcularRisco(
  cargaHorariaTotal: number,
  faltas: readonly Falta[],
  limites: Limites = LIMITES_PADRAO,
): ResumoRisco {
  const totalFaltado = horasQueContam(faltas)
  const justificadas = faltas.filter((f) => f.justificada)
  const totalJustificado = justificadas.reduce((s, f) => s + f.horasPerdidas, 0)

  // Carga zero não deveria existir (o banco tem CHECK > 0), mas se chegar
  // aqui é melhor devolver "verde" do que Infinity na tela.
  const cargaValida = cargaHorariaTotal > 0
  const percentual = cargaValida ? totalFaltado / cargaHorariaTotal : 0
  const horasLimite = cargaValida ? cargaHorariaTotal * limites.limiteReprovacao : 0
  const horasRestantes = Math.max(horasLimite - totalFaltado, 0)

  return {
    totalFaltado,
    totalJustificado,
    qtdFaltas: faltas.length,
    qtdJustificadas: justificadas.length,
    cargaHorariaTotal,
    percentual,
    status: statusPara(percentual, limites),
    horasLimite,
    horasRestantes,
    consumoDoLimite: horasLimite > 0 ? totalFaltado / horasLimite : 0,
    ultrapassouLimite: ultrapassa(percentual, limites.limiteReprovacao),
  }
}

// ---------------------------------------------------------------------------
// Apresentação — os rótulos vêm da tabela da §4
// ---------------------------------------------------------------------------

export const ROTULO_STATUS: Readonly<Record<Status, string>> = {
  verde: 'Tranquilo',
  amarelo: 'Atenção',
  vermelho: 'Risco de reprovação',
  reprovado: 'Passou do limite',
}

export const DESCRICAO_STATUS: Readonly<Record<Status, string>> = {
  verde: 'Você está com folga nesta disciplina.',
  amarelo: 'Você está se aproximando do limite de faltas.',
  vermelho: 'Mais algumas faltas e você reprova por frequência.',
  reprovado: 'Você ultrapassou o limite de faltas desta disciplina.',
}

export const EMOJI_STATUS: Readonly<Record<Status, string>> = {
  verde: '🟢',
  amarelo: '🟡',
  vermelho: '🔴',
  reprovado: '⛔',
}

/** Do mais grave para o mais tranquilo — usado na ordenação por risco (§7.2). */
export const PESO_STATUS: Readonly<Record<Status, number>> = {
  reprovado: 3,
  vermelho: 2,
  amarelo: 1,
  verde: 0,
}

/** 0.1142857 → "11,4%" */
export function formatarPercentual(valor: number, casas = 1): string {
  return `${(valor * 100).toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  })}%`
}

/** 8 → "8h"; 2.5 → "2,5h" */
export function formatarHoras(horas: number): string {
  const arredondado = Math.round(horas * 100) / 100
  return `${arredondado.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}h`
}

// ---------------------------------------------------------------------------
// Horas decimais ↔ hora e minuto
//
// O banco guarda `horas` como decimal, e é assim que a §3 desconta. Mas
// ninguém sabe de cabeça que uma aula de 4h10 são 4,17 — e quem digitasse
// "4,1" perderia seis minutos por aula sem nunca ser avisado. O formulário
// pergunta em hora e minuto; a conversão mora aqui, com teste.
//
// `numeric(4,2)` dá duas casas, o que arredonda 4h10 (4,1666…) para 4,17 —
// 12 centésimos de minuto por aula. A volta é estável: 4,17 × 60 = 250,2, que
// arredonda de novo para 250 minutos, exatamente 4h10.
// ---------------------------------------------------------------------------

export function emHoraMinuto(horas: number): { readonly h: number; readonly min: number } {
  const totalMinutos = Math.max(0, Math.round(horas * 60))
  return { h: Math.floor(totalMinutos / 60), min: totalMinutos % 60 }
}

export function deHoraMinuto(h: number, min: number): number {
  const seguro = (v: number): number => (Number.isFinite(v) ? Math.max(0, v) : 0)
  return Math.round((seguro(h) + seguro(min) / 60) * 100) / 100
}

/** 4.17 → "4h10"; 2 → "2h"; 0.83 → "50min" */
export function formatarHoraMinuto(horas: number): string {
  const { h, min } = emHoraMinuto(horas)
  if (h === 0) return `${String(min)}min`
  if (min === 0) return `${String(h)}h`
  return `${String(h)}h${String(min).padStart(2, '0')}`
}

/** "8h / 70h" — o formato pedido literalmente na §7.2. */
export function formatarProgressoHoras(faltado: number, total: number): string {
  return `${formatarHoras(faltado)} / ${formatarHoras(total)}`
}
