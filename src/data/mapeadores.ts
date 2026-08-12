import { ehDiaSemana, type AulaDoDia, type Disciplina, type Falta } from '@/domain/tipos.ts'
import type { LinhaDisciplina, LinhaFalta, LinhaGrade } from '@/types/database.ts'

/**
 * Tradução banco → domínio.
 *
 * O domínio (src/domain) não conhece o Supabase: ele fala em `Disciplina` e
 * `Falta`, não em linhas com snake_case. Esta é a única fronteira onde as
 * duas formas se encontram — se um dia a fonte de dados mudar, é só este
 * arquivo que muda.
 */

export type LinhaDisciplinaComGrade = LinhaDisciplina & {
  disciplina_grade: Pick<LinhaGrade, 'dia_semana' | 'horas'>[]
}

export function paraDisciplina(linha: LinhaDisciplinaComGrade): Disciplina {
  const grade: AulaDoDia[] = []

  for (const g of linha.disciplina_grade) {
    // O banco garante `between 0 and 6` por CHECK, mas o tipo gerado é
    // `number`. Estreitar aqui evita que um dia_semana inválido vindo de uma
    // migração futura silenciosamente vire uma aula fantasma.
    if (ehDiaSemana(g.dia_semana)) {
      grade.push({ dia: g.dia_semana, horas: g.horas })
    }
  }

  grade.sort((a, b) => a.dia - b.dia)

  return {
    id: linha.id,
    nome: linha.nome,
    cargaHorariaTotal: linha.carga_horaria_total,
    cor: linha.cor,
    grade,
  }
}

export function paraFalta(linha: LinhaFalta): Falta {
  return {
    id: linha.id,
    disciplinaId: linha.disciplina_id,
    data: linha.data,
    horasPerdidas: linha.horas_perdidas,
    justificada: linha.justificada,
  }
}

/** Falta com os campos que só a tela de justificativa (§7.1) usa. */
export interface FaltaDetalhada extends Falta {
  readonly prazoJustificativa: string
  readonly dataEnvioAtestado: string | null
  readonly anexoPath: string | null
  readonly observacao: string | null
}

export function paraFaltaDetalhada(linha: LinhaFalta): FaltaDetalhada {
  return {
    ...paraFalta(linha),
    prazoJustificativa: linha.prazo_justificativa,
    dataEnvioAtestado: linha.data_envio_atestado,
    anexoPath: linha.anexo_path,
    observacao: linha.observacao,
  }
}
