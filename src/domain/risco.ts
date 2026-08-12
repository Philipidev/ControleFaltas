import {
  LIMITES_PADRAO,
  REGRAS_PADRAO,
  ultrapassa,
  type Falta,
  type Limites,
  type RegrasFalta,
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
  /** Horas que efetivamente contam para o cálculo. */
  readonly totalFaltado: number
  /** Horas de faltas justificadas (contadas à parte — §7.1). */
  readonly totalJustificado: number
  readonly qtdFaltas: number
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
 * §7.1 — quais horas entram na conta.
 * Com `justificadaConta: false` (padrão), o atestado tira a falta do cálculo
 * de risco mas ela continua registrada no contador separado.
 */
export function horasQueContam(
  faltas: readonly Falta[],
  regras: RegrasFalta = REGRAS_PADRAO,
): number {
  return faltas.reduce(
    (soma, f) => (f.justificada && !regras.justificadaConta ? soma : soma + f.horasPerdidas),
    0,
  )
}

export function calcularRisco(
  cargaHorariaTotal: number,
  faltas: readonly Falta[],
  limites: Limites = LIMITES_PADRAO,
  regras: RegrasFalta = REGRAS_PADRAO,
): ResumoRisco {
  const totalFaltado = horasQueContam(faltas, regras)
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
    qtdFaltas: faltas.length - justificadas.length,
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

/** "8h / 70h" — o formato pedido literalmente na §7.2. */
export function formatarProgressoHoras(faltado: number, total: number): string {
  return `${formatarHoras(faltado)} / ${formatarHoras(total)}`
}
