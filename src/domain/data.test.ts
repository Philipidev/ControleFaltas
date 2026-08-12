import { describe, expect, it } from 'vitest'

import {
  comparar,
  diaDaSemana,
  diferencaEmDias,
  ehDataValida,
  fimDaSemana,
  formatarBR,
  formatarRelativo,
  inicioDaSemana,
  intervaloDeDias,
  paraData,
  paraISO,
  proximoSemestre,
  somarDias,
  turmaJaVirou,
  ultimoDiaDoMes,
} from './data.ts'

describe('paraData — o bug de fuso que arruinaria o desconto de horas', () => {
  /**
   * `new Date('2026-08-12')` é meia-noite UTC, que em São Paulo (UTC-3) cai em
   * 11/08 às 21h — e getDay() devolveria terça em vez de quarta. Numa
   * disciplina com "quarta = 2h", isso descontaria a carga errada (ou recusaria
   * a falta dizendo que não há aula). Por isso construímos a data em horário
   * local.
   */
  it('interpreta a data no fuso local, não em UTC', () => {
    const d = paraData('2026-08-12')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(7) // agosto
    expect(d.getDate()).toBe(12)
    expect(d.getHours()).toBe(0)
  })

  it('12/08/2026 é quarta-feira', () => {
    expect(diaDaSemana('2026-08-12')).toBe(3)
  })

  it('faz o round-trip sem perder o dia', () => {
    for (const iso of ['2026-01-01', '2026-02-28', '2026-08-12', '2026-12-31']) {
      expect(paraISO(paraData(iso))).toBe(iso)
    }
  })

  it('recusa formato inválido', () => {
    expect(() => paraData('12/08/2026')).toThrow(RangeError)
    expect(() => paraData('2026-8-12')).toThrow(RangeError)
    expect(() => paraData('')).toThrow(RangeError)
  })

  it('recusa data que não existe em vez de "consertar" em silêncio', () => {
    // O JS transformaria 31/02 em 03/03 sem avisar
    expect(() => paraData('2026-02-31')).toThrow(RangeError)
    expect(() => paraData('2026-13-01')).toThrow(RangeError)
    expect(ehDataValida('2026-02-31')).toBe(false)
    expect(ehDataValida('2026-02-28')).toBe(true)
  })
})

describe('diaDaSemana — convenção do Postgres (0=domingo)', () => {
  it.each([
    ['2026-08-09', 0, 'domingo'],
    ['2026-08-10', 1, 'segunda'],
    ['2026-08-11', 2, 'terça'],
    ['2026-08-12', 3, 'quarta'],
    ['2026-08-13', 4, 'quinta'],
    ['2026-08-14', 5, 'sexta'],
    ['2026-08-15', 6, 'sábado'],
  ])('%s é %d (%s)', (iso, esperado) => {
    expect(diaDaSemana(iso)).toBe(esperado)
  })
})

describe('somarDias', () => {
  it('soma dentro do mês', () => {
    expect(somarDias('2026-08-10', 5)).toBe('2026-08-15')
  })

  it('atravessa o fim do mês', () => {
    expect(somarDias('2026-08-28', 7)).toBe('2026-09-04')
  })

  it('atravessa o fim do ano', () => {
    expect(somarDias('2026-12-30', 7)).toBe('2027-01-06')
  })

  it('subtrai', () => {
    expect(somarDias('2026-09-01', -1)).toBe('2026-08-31')
  })

  it('lida com ano bissexto', () => {
    expect(somarDias('2028-02-28', 1)).toBe('2028-02-29')
    expect(somarDias('2026-02-28', 1)).toBe('2026-03-01')
  })

  it('atravessa a virada do horário de verão sem pular dia', () => {
    // Mesmo em fusos com DST, setDate opera em dias de calendário.
    for (let i = 0; i < 400; i += 1) {
      const antes = somarDias('2026-01-01', i)
      const depois = somarDias('2026-01-01', i + 1)
      expect(diferencaEmDias(antes, depois)).toBe(1)
    }
  })
})

describe('diferencaEmDias', () => {
  it('conta dias inteiros', () => {
    expect(diferencaEmDias('2026-08-03', '2026-08-10')).toBe(7)
  })

  it('é negativa quando a segunda data é anterior', () => {
    expect(diferencaEmDias('2026-08-10', '2026-08-03')).toBe(-7)
  })

  it('é zero no mesmo dia', () => {
    expect(diferencaEmDias('2026-08-10', '2026-08-10')).toBe(0)
  })
})

describe('semana — segunda a domingo, igual ao date_trunc do Postgres', () => {
  it.each(['2026-08-10', '2026-08-12', '2026-08-16'])(
    'a semana de %s começa em 10/08 e termina em 16/08',
    (iso) => {
      expect(inicioDaSemana(iso)).toBe('2026-08-10')
      expect(fimDaSemana(iso)).toBe('2026-08-16')
    },
  )

  it('domingo pertence à semana que começou na segunda anterior', () => {
    expect(inicioDaSemana('2026-08-16')).toBe('2026-08-10')
  })
})

describe('ultimoDiaDoMes', () => {
  it.each([
    ['2026-08-01', '2026-08-31'],
    ['2026-02-10', '2026-02-28'],
    ['2028-02-10', '2028-02-29'],
    ['2026-04-15', '2026-04-30'],
  ])('%s → %s', (entrada, esperado) => {
    expect(ultimoDiaDoMes(entrada)).toBe(esperado)
  })
})

describe('comparar — strings ISO ordenam sozinhas', () => {
  it('ordena cronologicamente', () => {
    const datas = ['2026-12-01', '2026-01-15', '2026-08-12']
    expect([...datas].sort(comparar)).toEqual(['2026-01-15', '2026-08-12', '2026-12-01'])
  })
})

describe('formatação pt-BR', () => {
  it('formata como dd/MM/yyyy', () => {
    expect(formatarBR('2026-08-12')).toBe('12/08/2026')
  })

  it('descreve datas próximas em linguagem natural', () => {
    expect(formatarRelativo('2026-08-12', '2026-08-12')).toBe('hoje')
    expect(formatarRelativo('2026-08-11', '2026-08-12')).toBe('ontem')
    expect(formatarRelativo('2026-08-13', '2026-08-12')).toBe('amanhã')
    expect(formatarRelativo('2026-08-09', '2026-08-12')).toBe('há 3 dias')
    expect(formatarRelativo('2026-08-17', '2026-08-12')).toBe('em 5 dias')
  })
})

describe('intervaloDeDias', () => {
  it('inclui as duas pontas', () => {
    expect([...intervaloDeDias('2026-08-10', '2026-08-13')]).toEqual([
      '2026-08-10',
      '2026-08-11',
      '2026-08-12',
      '2026-08-13',
    ])
  })

  it('devolve um único dia quando as pontas coincidem', () => {
    expect([...intervaloDeDias('2026-08-10', '2026-08-10')]).toEqual(['2026-08-10'])
  })

  it('não trava com intervalo invertido', () => {
    expect([...intervaloDeDias('2026-08-13', '2026-08-10')]).toEqual([])
  })
})

describe('proximoSemestre', () => {
  it('avança dentro do ano e vira o ano no segundo', () => {
    expect(proximoSemestre('2026.1')).toBe('2026.2')
    expect(proximoSemestre('2026.2')).toBe('2027.1')
  })

  it('rótulo fora do formato volta igual, sem inventar', () => {
    expect(proximoSemestre('Módulo IV')).toBe('Módulo IV')
    expect(proximoSemestre('2026.3')).toBe('2026.3')
  })
})

describe('turmaJaVirou', () => {
  it('avisa quem ficou para trás', () => {
    expect(turmaJaVirou('2027.1', ['2026.2', '2026.2'])).toBe(true)
  })

  it('não avisa quem já está no semestre da turma', () => {
    expect(turmaJaVirou('2026.2', ['2026.2'])).toBe(false)
  })

  it('nem quem, por algum motivo, está adiante', () => {
    expect(turmaJaVirou('2026.1', ['2026.2'])).toBe(false)
  })

  it('turma que não diz o semestre não avisa nada', () => {
    expect(turmaJaVirou(null, ['2026.1'])).toBe(false)
  })

  it('rótulo fora do formato não decide — avisar errado ensina a ignorar', () => {
    expect(turmaJaVirou('Módulo V', ['2026.1'])).toBe(false)
    expect(turmaJaVirou('2027.1', ['Módulo IV'])).toBe(false)
  })

  it('sem disciplina nenhuma, não há o que arquivar', () => {
    expect(turmaJaVirou('2027.1', [])).toBe(false)
  })
})
