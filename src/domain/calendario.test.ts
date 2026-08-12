import { describe, expect, it } from 'vitest'

import { montarMes } from './calendario.ts'
import { diaDaSemana } from './data.ts'
import type { Disciplina, Falta } from './tipos.ts'

/** §7.6 — grade do mês para o calendário visual. */

const MFC: Disciplina = {
  id: 'mfc',
  nome: 'Medicina, Família e Comunidade',
  cargaHorariaTotal: 70,
  cor: '#6366f1',
  grade: [
    { dia: 1, horas: 4 },
    { dia: 3, horas: 2 },
  ],
}

function falta(data: string, disciplinaId = 'mfc', justificada = false): Falta {
  return { id: `${disciplinaId}-${data}`, disciplinaId, data, horasPerdidas: 4, justificada }
}

// Agosto de 2026 começa num sábado e termina numa segunda.
const AGOSTO = '2026-08-01'

describe('montarMes — a grade sempre fecha em semanas inteiras', () => {
  const dias = montarMes(AGOSTO, [MFC], [], '2026-08-12')

  it('devolve um múltiplo de 7', () => {
    expect(dias.length % 7).toBe(0)
  })

  it('começa numa segunda-feira', () => {
    expect(diaDaSemana(dias[0]?.data ?? '')).toBe(1)
  })

  it('termina num domingo', () => {
    expect(diaDaSemana(dias.at(-1)?.data ?? '')).toBe(0)
  })

  it('contém todos os dias do mês', () => {
    const doMes = dias.filter((d) => d.doMes)
    expect(doMes).toHaveLength(31)
    expect(doMes[0]?.data).toBe('2026-08-01')
    expect(doMes.at(-1)?.data).toBe('2026-08-31')
  })

  it('marca os dias de fora do mês', () => {
    // 01/08/2026 é sábado, então a grade começa na segunda anterior (27/07)
    expect(dias[0]?.data).toBe('2026-07-27')
    expect(dias[0]?.doMes).toBe(false)
  })
})

describe('montarMes — fevereiro e ano bissexto', () => {
  it('fevereiro comum tem 28 dias no mês', () => {
    const dias = montarMes('2026-02-01', [MFC], [], '2026-02-10')
    expect(dias.filter((d) => d.doMes)).toHaveLength(28)
    expect(dias.length % 7).toBe(0)
  })

  it('fevereiro bissexto tem 29', () => {
    const dias = montarMes('2028-02-01', [MFC], [], '2028-02-10')
    expect(dias.filter((d) => d.doMes)).toHaveLength(29)
    expect(dias.length % 7).toBe(0)
  })
})

describe('montarMes — dias com aula', () => {
  const dias = montarMes(AGOSTO, [MFC], [], '2026-08-12')
  const porData = new Map(dias.map((d) => [d.data, d]))

  it('marca segunda e quarta como dias de aula', () => {
    expect(porData.get('2026-08-10')?.temAula).toBe(true) // segunda
    expect(porData.get('2026-08-12')?.temAula).toBe(true) // quarta
  })

  it('não marca os dias sem aula na grade', () => {
    expect(porData.get('2026-08-11')?.temAula).toBe(false) // terça
    expect(porData.get('2026-08-14')?.temAula).toBe(false) // sexta
  })

  it('junta os dias de aula de todas as disciplinas', () => {
    const bio: Disciplina = {
      ...MFC,
      id: 'bio',
      nome: 'Bioquímica',
      grade: [{ dia: 2, horas: 4 }],
    }
    const comDuas = montarMes(AGOSTO, [MFC, bio], [], '2026-08-12')
    const terca = comDuas.find((d) => d.data === '2026-08-11')
    expect(terca?.temAula).toBe(true)
  })
})

describe('montarMes — faltas agrupadas por dia', () => {
  const bio: Disciplina = { ...MFC, id: 'bio', nome: 'Bioquímica', cor: '#a855f7' }
  const faltas = [
    falta('2026-08-10'),
    falta('2026-08-10', 'bio'),
    falta('2026-08-12', 'mfc', true),
  ]
  const dias = montarMes(AGOSTO, [MFC, bio], faltas, '2026-08-12')
  const porData = new Map(dias.map((d) => [d.data, d]))

  it('coloca as duas faltas no mesmo dia', () => {
    expect(porData.get('2026-08-10')?.faltas).toHaveLength(2)
  })

  it('leva a disciplina junto, para a cor da matéria', () => {
    const cores = porData.get('2026-08-10')?.faltas.map((f) => f.disciplina?.cor)
    expect(cores).toEqual(['#6366f1', '#a855f7'])
  })

  it('preserva a marca de justificada', () => {
    expect(porData.get('2026-08-12')?.faltas[0]?.falta.justificada).toBe(true)
  })

  it('dias sem falta ficam com lista vazia', () => {
    expect(porData.get('2026-08-11')?.faltas).toEqual([])
  })

  it('não quebra se a disciplina sumiu do catálogo', () => {
    const orfa = montarMes(AGOSTO, [], [falta('2026-08-10')], '2026-08-12')
    const dia = orfa.find((d) => d.data === '2026-08-10')
    expect(dia?.faltas).toHaveLength(1)
    expect(dia?.faltas[0]?.disciplina).toBeUndefined()
  })
})

describe('montarMes — hoje', () => {
  it('marca exatamente um dia como hoje', () => {
    const dias = montarMes(AGOSTO, [MFC], [], '2026-08-12')
    expect(dias.filter((d) => d.ehHoje)).toHaveLength(1)
  })

  it('não marca nenhum quando hoje está fora da janela', () => {
    const dias = montarMes(AGOSTO, [MFC], [], '2026-12-25')
    expect(dias.filter((d) => d.ehHoje)).toHaveLength(0)
  })
})
