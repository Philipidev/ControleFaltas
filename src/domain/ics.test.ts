import { describe, expect, it } from 'vitest'

import { dobrarLinha, escaparTexto, gerarIcs, primeiraOcorrencia } from './ics.ts'

const BASE = {
  inicio: '2026-08-03', // uma segunda-feira
  fim: '2026-12-18',
  horaPadrao: '08:00',
  dominio: 'teste',
}

describe('escaparTexto — o parser quebra sem isto', () => {
  it('escapa vírgula, que é separador de valores no formato', () => {
    // "Medicina, Família e Comunidade" é uma disciplina real do seed.
    expect(escaparTexto('Medicina, Família e Comunidade')).toBe(
      'Medicina\\, Família e Comunidade',
    )
  })

  it('escapa ponto e vírgula e quebra de linha', () => {
    expect(escaparTexto('a;b')).toBe('a\\;b')
    expect(escaparTexto('a\nb')).toBe('a\\nb')
  })

  it('escapa a barra ANTES do resto, senão escapa o próprio escape', () => {
    // Se a vírgula fosse tratada primeiro, o '\' criado por ela viraria '\\'
    // na etapa seguinte e o resultado teria uma barra a mais.
    expect(escaparTexto('a\\,b')).toBe('a\\\\\\,b')
  })
})

describe('dobrarLinha — 75 OCTETOS, não caracteres', () => {
  it('deixa linha curta intacta', () => {
    expect(dobrarLinha('SUMMARY:Fisiologia')).toBe('SUMMARY:Fisiologia')
  })

  it('dobra com espaço no início da continuação', () => {
    const dobrada = dobrarLinha(`SUMMARY:${'a'.repeat(100)}`)
    const partes = dobrada.split('\r\n')
    expect(partes.length).toBeGreaterThan(1)
    expect(partes[1]?.startsWith(' ')).toBe(true)
  })

  it('conta acento como dois octetos', () => {
    // 40 'é' = 80 octetos em UTF-8, mas só 40 caracteres. Uma dobra que
    // contasse caracteres não dobraria nada aqui — e estouraria o limite.
    const linha = `X:${'é'.repeat(40)}`
    const dobrada = dobrarLinha(linha)
    expect(dobrada).toContain('\r\n')
    for (const parte of dobrada.split('\r\n')) {
      expect(new TextEncoder().encode(parte).length).toBeLessThanOrEqual(75)
    }
  })

  it('não parte um emoji ao meio', () => {
    const linha = `X:${'🎓'.repeat(30)}`
    for (const parte of dobrarLinha(linha).split('\r\n')) {
      // Um par substituto partido vira U+FFFD ao decodificar.
      expect(parte).not.toContain('�')
      expect(new TextEncoder().encode(parte).length).toBeLessThanOrEqual(75)
    }
  })
})

describe('primeiraOcorrencia — a série tem de começar no dia certo', () => {
  it('avança da segunda até a quinta', () => {
    // 03/08/2026 é segunda; a quinta seguinte é 06/08.
    expect(primeiraOcorrencia('2026-08-03', 4)).toBe('2026-08-06')
  })

  it('devolve a própria data quando já é o dia certo', () => {
    expect(primeiraOcorrencia('2026-08-03', 1)).toBe('2026-08-03')
  })

  it('vira a semana quando o dia já passou', () => {
    // De quinta (06/08) para terça: só na semana seguinte, 11/08.
    expect(primeiraOcorrencia('2026-08-06', 2)).toBe('2026-08-11')
  })

  it('atravessa a virada de mês', () => {
    // 31/08/2026 é segunda; o domingo seguinte cai em setembro.
    expect(primeiraOcorrencia('2026-08-31', 0)).toBe('2026-09-06')
  })
})

describe('gerarIcs — estrutura do arquivo', () => {
  const aula = {
    disciplinaId: 'd1',
    disciplina: 'Fisiologia Humana',
    dia: 2 as const,
    horas: 2,
    horaInicio: '19:30',
  }

  it('abre e fecha o VCALENDAR e usa CRLF', () => {
    const ics = gerarIcs({ ...BASE, aulas: [aula] })
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true)
    // LF solto (sem CR antes) quebra o parser do iOS.
    expect(/[^\r]\n/.test(ics)).toBe(false)
  })

  it('põe a aula no dia da grade, não no início do semestre', () => {
    const ics = gerarIcs({ ...BASE, aulas: [aula] })
    // 03/08 é segunda; terça é 04/08.
    expect(ics).toContain('DTSTART:20260804T193000')
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20261218T235959Z')
  })

  it('a duração sai das horas da grade', () => {
    expect(gerarIcs({ ...BASE, aulas: [aula] })).toContain('DTEND:20260804T213000')
  })

  it('usa a hora padrão quando a grade não sabe o horário', () => {
    const ics = gerarIcs({ ...BASE, aulas: [{ ...aula, horaInicio: null }] })
    expect(ics).toContain('DTSTART:20260804T080000')
  })

  it('não deixa a aula virar o dia', () => {
    // 23:00 + 4h daria 03:00 do dia seguinte, com DTEND antes do DTSTART.
    const ics = gerarIcs({
      ...BASE,
      aulas: [{ ...aula, horaInicio: '23:00', horas: 4 }],
    })
    expect(ics).toContain('DTEND:20260804T235900')
  })

  it('gera um UID estável por disciplina e dia', () => {
    const ics = gerarIcs({ ...BASE, aulas: [aula] })
    expect(ics).toContain('UID:aula-d1-2@teste')
    // Reimportar o mesmo semestre atualiza em vez de duplicar a série.
    expect(gerarIcs({ ...BASE, aulas: [aula] })).toBe(ics)
  })

  it('escapa o nome da disciplina no SUMMARY', () => {
    const ics = gerarIcs({
      ...BASE,
      aulas: [{ ...aula, disciplina: 'Medicina, Família e Comunidade' }],
    })
    expect(ics).toContain('SUMMARY:Medicina\\, Família e Comunidade')
  })

  it('prazo de atestado vira evento de dia inteiro com DTEND no dia seguinte', () => {
    const ics = gerarIcs({
      ...BASE,
      aulas: [],
      prazos: [{ faltaId: 'f1', disciplina: 'Bioquímica', prazo: '2026-08-18' }],
    })
    expect(ics).toContain('DTSTART;VALUE=DATE:20260818')
    // DTEND é exclusivo: sem o +1 o evento não aparece no dia do vencimento.
    expect(ics).toContain('DTEND;VALUE=DATE:20260819')
  })

  it('um evento por aula da grade', () => {
    const ics = gerarIcs({
      ...BASE,
      aulas: [aula, { ...aula, dia: 4, disciplinaId: 'd1' }],
    })
    expect(ics.match(/BEGIN:VEVENT/g)?.length).toBe(2)
    expect(ics.match(/END:VEVENT/g)?.length).toBe(2)
  })

  it('arquivo sem aula nenhuma ainda é um calendário válido', () => {
    const ics = gerarIcs({ ...BASE, aulas: [] })
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('END:VCALENDAR')
    expect(ics).not.toContain('BEGIN:VEVENT')
  })
})
