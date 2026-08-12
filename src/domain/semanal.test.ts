import { describe, expect, it } from 'vitest'

import { resumoDaSemana } from './semanal.ts'
import type { Disciplina, Falta } from './tipos.ts'

/** §6 — "Resumo semanal: quantas faltas na semana, em quais disciplinas". */

const DISCIPLINAS: Disciplina[] = [
  {
    id: 'mfc',
    nome: 'Medicina, Família e Comunidade',
    cargaHorariaTotal: 70,
    cor: '#f97316',
    grade: [
      { dia: 1, horas: 4 },
      { dia: 3, horas: 2 },
    ],
  },
  {
    id: 'bio',
    nome: 'Bioquímica Médica',
    cargaHorariaTotal: 80,
    cor: '#8b5cf6',
    grade: [
      { dia: 2, horas: 4 },
      { dia: 4, horas: 4 },
    ],
  },
]

function falta(disciplinaId: string, data: string, horas: number): Falta {
  return { id: `${disciplinaId}-${data}`, disciplinaId, data, horasPerdidas: horas, justificada: false }
}

// Quarta-feira. A semana correspondente vai de 10/08 (seg) a 16/08 (dom).
const REFERENCIA = '2026-08-12'

describe('resumoDaSemana — janela', () => {
  it('vai de segunda a domingo, igual ao date_trunc do Postgres', () => {
    const r = resumoDaSemana([], DISCIPLINAS, REFERENCIA)
    expect(r.inicio).toBe('2026-08-10')
    expect(r.fim).toBe('2026-08-16')
  })

  it('ignora faltas de fora da semana', () => {
    const faltas = [
      falta('mfc', '2026-08-09', 4), // domingo anterior
      falta('mfc', '2026-08-10', 4), // dentro
      falta('mfc', '2026-08-17', 4), // segunda seguinte
    ]
    const r = resumoDaSemana(faltas, DISCIPLINAS, REFERENCIA)
    expect(r.totalFaltas).toBe(1)
  })

  it('inclui as duas pontas da semana', () => {
    const faltas = [falta('mfc', '2026-08-10', 4), falta('bio', '2026-08-16', 4)]
    expect(resumoDaSemana(faltas, DISCIPLINAS, REFERENCIA).totalFaltas).toBe(2)
  })
})

describe('resumoDaSemana — agregação', () => {
  const faltas = [
    falta('mfc', '2026-08-10', 4),
    falta('mfc', '2026-08-12', 2),
    falta('bio', '2026-08-11', 4),
  ]
  const r = resumoDaSemana(faltas, DISCIPLINAS, REFERENCIA)

  it('conta as faltas e soma as horas', () => {
    expect(r.totalFaltas).toBe(3)
    expect(r.totalHoras).toBe(10)
  })

  it('agrupa por disciplina', () => {
    expect(r.porDisciplina).toHaveLength(2)
    expect(r.porDisciplina[0]).toMatchObject({
      disciplinaId: 'mfc',
      nome: 'Medicina, Família e Comunidade',
      faltas: 2,
      horas: 6,
    })
  })

  it('ordena da disciplina mais atingida para a menos', () => {
    expect(r.porDisciplina.map((d) => d.disciplinaId)).toEqual(['mfc', 'bio'])
  })

  it('leva a cor da disciplina junto, para o gráfico', () => {
    expect(r.porDisciplina[0]?.cor).toBe('#f97316')
  })
})

describe('resumoDaSemana — mensagem para a notificação', () => {
  it('comemora a semana limpa', () => {
    expect(resumoDaSemana([], DISCIPLINAS, REFERENCIA).mensagem).toBe(
      'Semana de 10/08 a 16/08: nenhuma falta. 🎉',
    )
  })

  it('usa o singular para uma falta só e nomeia a disciplina', () => {
    const r = resumoDaSemana([falta('mfc', '2026-08-10', 4)], DISCIPLINAS, REFERENCIA)
    expect(r.mensagem).toBe(
      'Semana de 10/08 a 16/08: 1 falta (4h) em Medicina, Família e Comunidade.',
    )
  })

  it('resume quando são várias disciplinas', () => {
    const r = resumoDaSemana(
      [falta('mfc', '2026-08-10', 4), falta('bio', '2026-08-11', 4)],
      DISCIPLINAS,
      REFERENCIA,
    )
    expect(r.mensagem).toBe('Semana de 10/08 a 16/08: 2 faltas (8h) em 2 disciplinas.')
  })
})

describe('resumoDaSemana — disciplina que sumiu do catálogo', () => {
  it('não quebra e sinaliza na UI', () => {
    const r = resumoDaSemana([falta('fantasma', '2026-08-10', 4)], DISCIPLINAS, REFERENCIA)
    expect(r.porDisciplina[0]?.nome).toBe('Disciplina removida')
    expect(r.totalFaltas).toBe(1)
  })
})
