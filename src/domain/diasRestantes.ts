import { diaDaSemana, somarDias } from './data.ts'
import {
  NOME_DIA,
  NOME_DIA_PLURAL,
  ultrapassa,
  type DiaSemana,
  type GradeSemanal,
} from './tipos.ts'

/**
 * §4 — "Você ainda pode faltar X dias nesta disciplina".
 *
 * A spec é explícita sobre a dificuldade: como cada dia da semana pode ter
 * carga diferente (segunda = 4h, quarta = 2h), não existe UM número de dias.
 * Ela sugere as duas saídas, e implementamos as duas porque respondem a
 * perguntas diferentes:
 *
 *   porTipoDeDia()   → "ainda pode faltar 2 segundas OU 4 quartas"
 *                      Bom para planejar o semestre.
 *
 *   projetarAulas()  → "ainda pode faltar 3 aulas, até 14/out"
 *                      Percorre o calendário real a partir de hoje, gastando
 *                      as horas de cada aula prevista. É o número que responde
 *                      "posso faltar amanhã?", então é ele que vai no card.
 */

export interface FaltasPorTipoDeDia {
  readonly dia: DiaSemana
  readonly horas: number
  /** Quantas faltas inteiras desse dia cabem no saldo. */
  readonly quantas: number
}

/** Para cada dia da grade, quantas faltas daquele dia ainda cabem. */
export function porTipoDeDia(
  grade: GradeSemanal,
  horasRestantes: number,
): FaltasPorTipoDeDia[] {
  return grade
    .filter((aula) => aula.horas > 0)
    .map((aula) => ({
      dia: aula.dia,
      horas: aula.horas,
      quantas: Math.max(Math.floor(horasRestantes / aula.horas), 0),
    }))
    .sort((a, b) => a.dia - b.dia)
}

/** "2 segundas ou 4 quartas" — o formato sugerido pela própria spec. */
export function descreverPorTipoDeDia(itens: readonly FaltasPorTipoDeDia[]): string {
  const comSaldo = itens.filter((i) => i.quantas > 0)
  if (comSaldo.length === 0) return 'nenhuma falta a mais'

  return comSaldo
    .map((i) => {
      const nome = i.quantas === 1 ? NOME_DIA[i.dia] : NOME_DIA_PLURAL[i.dia]
      return `${String(i.quantas)} ${nome}`
    })
    .join(' ou ')
}

export interface AulaPrevista {
  readonly data: string
  readonly dia: DiaSemana
  readonly horas: number
}

/**
 * As próximas `quantidade` aulas da disciplina a partir de `aPartirDe`
 * (inclusive), segundo a grade semanal.
 */
export function proximasAulas(
  grade: GradeSemanal,
  aPartirDe: string,
  quantidade: number,
): AulaPrevista[] {
  const horasPorDia = new Map<DiaSemana, number>(
    grade.filter((a) => a.horas > 0).map((a) => [a.dia, a.horas]),
  )
  if (horasPorDia.size === 0 || quantidade <= 0) return []

  const encontradas: AulaPrevista[] = []
  let data = aPartirDe

  // Uma grade com pelo menos um dia garante uma aula por semana, então 400
  // dias varridos cobrem qualquer pedido razoável. O teto existe só para o
  // laço não virar infinito diante de uma grade estranha.
  for (let i = 0; i < 400 && encontradas.length < quantidade; i += 1) {
    const dia = diaDaSemana(data)
    const horas = horasPorDia.get(dia)
    if (horas !== undefined) {
      encontradas.push({ data, dia, horas })
    }
    data = somarDias(data, 1)
  }

  return encontradas
}

export interface ProjecaoAulas {
  /** Quantas das próximas aulas cabem no saldo, em ordem de calendário. */
  readonly aulasQueCabem: number
  /** Data da última aula que ainda cabe no saldo. */
  readonly ultimaDataSegura: string | null
  /** Próxima aula prevista a partir de hoje (inclusive). */
  readonly proximaAula: AulaPrevista | null
  /**
   * §6 — aviso preventivo: faltar na próxima aula já estoura o limite?
   * É o gatilho de "se você faltar de novo nesta disciplina, vai passar de 25%".
   */
  readonly proximaAulaEstoura: boolean
  /** As aulas percorridas que cabem, para a UI listar as datas. */
  readonly aulas: readonly AulaPrevista[]
}

/**
 * Distribui o saldo de horas nas próximas aulas reais do calendário,
 * contando quantos dias inteiros de falta ainda cabem — exatamente o
 * procedimento descrito na §4.
 */
export function projetarAulas(
  grade: GradeSemanal,
  horasRestantes: number,
  hoje: string,
  maximoDeAulas = 60,
): ProjecaoAulas {
  const previstas = proximasAulas(grade, hoje, maximoDeAulas)
  const primeira = previstas[0] ?? null

  const cabem: AulaPrevista[] = []
  let saldo = horasRestantes

  for (const aula of previstas) {
    // não cabe: a aula custa mais horas do que sobrou
    if (ultrapassa(aula.horas, saldo)) break
    saldo -= aula.horas
    cabem.push(aula)
  }

  const ultima = cabem.at(-1) ?? null

  return {
    aulasQueCabem: cabem.length,
    ultimaDataSegura: ultima?.data ?? null,
    proximaAula: primeira,
    proximaAulaEstoura: primeira !== null && ultrapassa(primeira.horas, horasRestantes),
    aulas: cabem,
  }
}

/**
 * Texto curto do card do dashboard (§7.2).
 * Ex.: "Ainda pode faltar 3 aulas" / "Não pode mais faltar".
 */
export function descreverProjecao(projecao: ProjecaoAulas): string {
  if (projecao.aulasQueCabem === 0) return 'Não pode mais faltar'
  if (projecao.aulasQueCabem === 1) return 'Ainda pode faltar 1 aula'
  return `Ainda pode faltar ${String(projecao.aulasQueCabem)} aulas`
}
