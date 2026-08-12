import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

import { ehDiaSemana, type DiaSemana } from './tipos.ts'

/**
 * Datas de aula são DIAS DE CALENDÁRIO, não instantes.
 *
 * Por isso tudo aqui trafega como string 'YYYY-MM-DD' e só vira Date na
 * fronteira. O motivo é concreto: `new Date('2026-08-12')` é interpretado
 * como meia-noite UTC, que em São Paulo (UTC-3) é 11/08 às 21h — e
 * `.getDay()` devolveria terça em vez de quarta. Num app cuja regra central é
 * "quantas horas tem a aula NESTE dia da semana", esse off-by-one silencioso
 * descontaria a carga horária errada.
 *
 * paraData() abaixo constrói a data no fuso local, onde 12/08 é 12/08.
 */

const RE_ISO = /^(\d{4})-(\d{2})-(\d{2})$/

/** Converte 'YYYY-MM-DD' para um Date à meia-noite LOCAL. */
export function paraData(iso: string): Date {
  const m = RE_ISO.exec(iso)
  if (!m) {
    throw new RangeError(`Data inválida: "${iso}". Esperado o formato YYYY-MM-DD.`)
  }

  const ano = Number(m[1])
  const mes = Number(m[2])
  const dia = Number(m[3])
  const d = new Date(ano, mes - 1, dia)

  // O JS "conserta" 2026-02-31 virando 03/03 sem avisar. Round-trip pega isso.
  if (d.getFullYear() !== ano || d.getMonth() !== mes - 1 || d.getDate() !== dia) {
    throw new RangeError(`Data inexistente no calendário: "${iso}".`)
  }

  return d
}

/** Converte um Date para 'YYYY-MM-DD' usando os componentes LOCAIS. */
export function paraISO(d: Date): string {
  const ano = String(d.getFullYear()).padStart(4, '0')
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

export function hojeISO(): string {
  return paraISO(new Date())
}

/**
 * Semestre letivo no formato '2026.2'.
 * Convenção brasileira: janeiro a junho é o primeiro, julho a dezembro o
 * segundo. É o mesmo rótulo usado em disciplinas.semestre.
 */
export function semestreAtual(hoje: string = hojeISO()): string {
  const ano = hoje.slice(0, 4)
  const mes = Number(hoje.slice(5, 7))
  return `${ano}.${mes <= 6 ? '1' : '2'}`
}

export function ehDataValida(iso: string): boolean {
  try {
    paraData(iso)
    return true
  } catch {
    return false
  }
}

/** Dia da semana no mesmo padrão do Postgres: 0=domingo … 6=sábado. */
export function diaDaSemana(iso: string): DiaSemana {
  const dow = paraData(iso).getDay()
  if (!ehDiaSemana(dow)) {
    // getDay() sempre devolve 0..6; isto existe só para estreitar o tipo.
    throw new RangeError(`Dia da semana fora da faixa: ${String(dow)}`)
  }
  return dow
}

export function somarDias(iso: string, dias: number): string {
  const d = paraData(iso)
  // setDate opera em dias de calendário, então atravessa horário de verão
  // sem perder ou ganhar um dia.
  d.setDate(d.getDate() + dias)
  return paraISO(d)
}

/** Dias inteiros de `de` até `ate`. Negativo se `ate` for anterior. */
export function diferencaEmDias(de: string, ate: string): number {
  const a = paraData(de)
  const b = paraData(ate)
  // Normaliza em UTC para que a diferença não seja afetada por DST.
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((ub - ua) / 86_400_000)
}

/** 'YYYY-MM-DD' ordena lexicograficamente, então comparar é trivial. */
export function comparar(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function ehAntesDe(a: string, b: string): boolean {
  return a < b
}

export function ehDepoisDe(a: string, b: string): boolean {
  return a > b
}

/** Segunda-feira da semana — igual ao date_trunc('week') do Postgres. */
export function inicioDaSemana(iso: string): string {
  const dow = diaDaSemana(iso)
  const recuo = dow === 0 ? 6 : dow - 1
  return somarDias(iso, -recuo)
}

/** Domingo da semana. */
export function fimDaSemana(iso: string): string {
  return somarDias(inicioDaSemana(iso), 6)
}

export function primeiroDiaDoMes(iso: string): string {
  const d = paraData(iso)
  return paraISO(new Date(d.getFullYear(), d.getMonth(), 1))
}

export function ultimoDiaDoMes(iso: string): string {
  const d = paraData(iso)
  return paraISO(new Date(d.getFullYear(), d.getMonth() + 1, 0))
}

// ---------------------------------------------------------------------------
// Formatação (pt-BR)
// ---------------------------------------------------------------------------

/** 12/08/2026 */
export function formatarBR(iso: string): string {
  return format(paraData(iso), 'dd/MM/yyyy', { locale: ptBR })
}

/** 12/08 */
export function formatarCurto(iso: string): string {
  return format(paraData(iso), 'dd/MM', { locale: ptBR })
}

/** quarta-feira, 12 de agosto */
export function formatarExtenso(iso: string): string {
  return format(paraData(iso), "EEEE, d 'de' MMMM", { locale: ptBR })
}

/** agosto de 2026 */
export function formatarMesAno(iso: string): string {
  return format(paraData(iso), "MMMM 'de' yyyy", { locale: ptBR })
}

/** "hoje", "ontem", "há 3 dias", "em 5 dias" — para o feed de faltas. */
export function formatarRelativo(iso: string, hoje: string): string {
  const dias = diferencaEmDias(hoje, iso)
  if (dias === 0) return 'hoje'
  if (dias === -1) return 'ontem'
  if (dias === 1) return 'amanhã'
  if (dias < 0) return `há ${String(-dias)} dias`
  return `em ${String(dias)} dias`
}

/**
 * Percorre os dias de `de` até `ate`, inclusive.
 * O teto de segurança evita laço infinito se um intervalo vier invertido.
 */
export function* intervaloDeDias(de: string, ate: string, maximo = 1000): Generator<string> {
  let atual = de
  let contador = 0
  while (atual <= ate && contador < maximo) {
    yield atual
    atual = somarDias(atual, 1)
    contador += 1
  }
}
