import { fimDaSemana, formatarCurto, inicioDaSemana } from './data.ts'
import { formatarHoras } from './risco.ts'
import type { Disciplina, Falta } from './tipos.ts'

/**
 * §6 — Resumo semanal: "quantas faltas na semana, em quais disciplinas".
 *
 * A semana começa na segunda, igual ao date_trunc('week') do Postgres usado
 * na RPC get_resumo_semanal — assim o número calculado no cliente e o do
 * servidor batem.
 */

export interface FaltaNaSemana {
  readonly disciplinaId: string
  readonly nome: string
  readonly cor: string
  readonly faltas: number
  readonly horas: number
}

export interface ResumoDaSemana {
  readonly inicio: string
  readonly fim: string
  readonly totalFaltas: number
  readonly totalHoras: number
  readonly porDisciplina: readonly FaltaNaSemana[]
  readonly mensagem: string
}

export function resumoDaSemana(
  faltas: readonly Falta[],
  disciplinas: readonly Disciplina[],
  referencia: string,
): ResumoDaSemana {
  const inicio = inicioDaSemana(referencia)
  const fim = fimDaSemana(referencia)

  const daSemana = faltas.filter((f) => f.data >= inicio && f.data <= fim)
  const porId = new Map<string, Disciplina>(disciplinas.map((d) => [d.id, d]))
  const agrupado = new Map<string, { faltas: number; horas: number }>()

  for (const f of daSemana) {
    const atual = agrupado.get(f.disciplinaId) ?? { faltas: 0, horas: 0 }
    agrupado.set(f.disciplinaId, {
      faltas: atual.faltas + 1,
      horas: atual.horas + f.horasPerdidas,
    })
  }

  const porDisciplina: FaltaNaSemana[] = [...agrupado.entries()]
    .map(([disciplinaId, dados]) => {
      const disciplina = porId.get(disciplinaId)
      return {
        disciplinaId,
        nome: disciplina?.nome ?? 'Disciplina removida',
        cor: disciplina?.cor ?? '#94a3b8',
        faltas: dados.faltas,
        horas: dados.horas,
      }
    })
    .sort((a, b) => b.horas - a.horas)

  const totalFaltas = daSemana.length
  const totalHoras = daSemana.reduce((s, f) => s + f.horasPerdidas, 0)

  return {
    inicio,
    fim,
    totalFaltas,
    totalHoras,
    porDisciplina,
    mensagem: montarMensagem(inicio, fim, totalFaltas, totalHoras, porDisciplina),
  }
}

function montarMensagem(
  inicio: string,
  fim: string,
  totalFaltas: number,
  totalHoras: number,
  porDisciplina: readonly FaltaNaSemana[],
): string {
  const periodo = `${formatarCurto(inicio)} a ${formatarCurto(fim)}`

  if (totalFaltas === 0) {
    return `Semana de ${periodo}: nenhuma falta. 🎉`
  }

  const quantidade =
    totalFaltas === 1 ? '1 falta' : `${String(totalFaltas)} faltas`
  const materias =
    porDisciplina.length === 1
      ? porDisciplina[0]?.nome ?? ''
      : `${String(porDisciplina.length)} disciplinas`

  return `Semana de ${periodo}: ${quantidade} (${formatarHoras(totalHoras)}) em ${materias}.`
}
