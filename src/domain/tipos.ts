/**
 * Tipos do domínio.
 *
 * Deliberadamente separados dos tipos do banco (src/types/database.ts): o
 * domínio é TypeScript puro, sem React e sem rede, e precisa continuar
 * testável se um dia a fonte de dados mudar. src/data/ faz a tradução entre
 * as duas formas.
 */

/** Convenção EXTRACT(DOW) do Postgres — a mesma usada em disciplina_grade. */
export type DiaSemana = 0 | 1 | 2 | 3 | 4 | 5 | 6

export const DIAS_SEMANA: readonly DiaSemana[] = [0, 1, 2, 3, 4, 5, 6]

export const NOME_DIA: Readonly<Record<DiaSemana, string>> = {
  0: 'domingo',
  1: 'segunda',
  2: 'terça',
  3: 'quarta',
  4: 'quinta',
  5: 'sexta',
  6: 'sábado',
}

export const NOME_DIA_CURTO: Readonly<Record<DiaSemana, string>> = {
  0: 'dom',
  1: 'seg',
  2: 'ter',
  3: 'qua',
  4: 'qui',
  5: 'sex',
  6: 'sáb',
}

/** Plural usado em "ainda pode faltar 2 segundas ou 4 quartas" (§4). */
export const NOME_DIA_PLURAL: Readonly<Record<DiaSemana, string>> = {
  0: 'domingos',
  1: 'segundas',
  2: 'terças',
  3: 'quartas',
  4: 'quintas',
  5: 'sextas',
  6: 'sábados',
}

export function ehDiaSemana(valor: number): valor is DiaSemana {
  return Number.isInteger(valor) && valor >= 0 && valor <= 6
}

/** Um dia de aula da grade: "Segunda = 4h" (§2). */
export interface AulaDoDia {
  readonly dia: DiaSemana
  readonly horas: number
}

/** A grade semanal inteira de uma disciplina. */
export type GradeSemanal = readonly AulaDoDia[]

export type Status = 'verde' | 'amarelo' | 'vermelho' | 'reprovado'

/**
 * Faixas do semáforo (§4).
 *
 * A spec chama a tabela de "sugestão de faixas" e diz que a regra de faltas
 * justificadas "depende da regra oficial do curso" — por isso tudo isto é
 * configurável, com os valores da spec como padrão.
 */
export interface Limites {
  /** Acima disto é reprovação por falta. Padrão da spec: 25%. */
  readonly limiteReprovacao: number
  /** Até aqui, verde. Padrão: 15%. */
  readonly faixaVerde: number
  /** Até aqui, amarelo; acima, vermelho. Padrão: 20%. */
  readonly faixaAmarela: number
}

export const LIMITES_PADRAO: Limites = {
  limiteReprovacao: 0.25,
  faixaVerde: 0.15,
  faixaAmarela: 0.2,
}

/** Regras que a spec marca como decisão do curso (§7.1, §7.5). */
export interface RegrasFalta {
  /** §7.1: falta justificada desconta da carga horária? */
  readonly justificadaConta: boolean
  /** §7.5: atestado zera o streak de presença? */
  readonly justificadaQuebraStreak: boolean
}

export const REGRAS_PADRAO: RegrasFalta = {
  justificadaConta: false,
  justificadaQuebraStreak: false,
}

export interface Disciplina {
  readonly id: string
  readonly nome: string
  readonly cargaHorariaTotal: number
  readonly cor: string
  readonly grade: GradeSemanal
}

export interface Falta {
  readonly id: string
  readonly disciplinaId: string
  /** Data no formato 'YYYY-MM-DD'. Nunca um Date — ver domain/data.ts. */
  readonly data: string
  readonly horasPerdidas: number
  readonly justificada: boolean
}

/**
 * Comparação com folga para ponto flutuante.
 *
 * Cargas horárias reais são inteiros ou meias-horas, então na prática as
 * contas fecham exatas. Mas os limites vêm do Postgres como numeric e viram
 * double no caminho: sem essa folga, uma disciplina exatamente em 15,0% podia
 * cair no amarelo por um erro na 16ª casa decimal. Na dúvida, a faixa mais
 * segura ganha.
 */
const EPSILON = 1e-9

export function ultrapassa(valor: number, limite: number): boolean {
  return valor - limite > EPSILON
}
