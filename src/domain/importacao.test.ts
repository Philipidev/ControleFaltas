import { describe, expect, it } from 'vitest'

import { importarCatalogo, MODELO_CSV } from './importacao.ts'

/** §7.6 — importar a grade inteira de uma vez. */

describe('importarCatalogo — o modelo que a gente oferece', () => {
  const r = importarCatalogo(MODELO_CSV)

  it('não gera erro', () => {
    expect(r.erros).toEqual([])
  })

  it('lê as duas disciplinas', () => {
    expect(r.linhas).toHaveLength(2)
  })

  it('lê a grade da primeira como segunda=4h e quarta=2h', () => {
    expect(r.linhas[0]?.grade).toEqual([
      { dia: 1, horas: 4 },
      { dia: 3, horas: 2 },
    ])
    expect(r.linhas[0]?.cargaHorariaTotal).toBe(70)
  })
})

describe('importarCatalogo — separadores', () => {
  const linhas = ['nome;curso;periodo;carga;seg', 'Anatomia;Medicina;1º;120;4']

  it('aceita ponto e vírgula', () => {
    const r = importarCatalogo(linhas.join('\n'))
    expect(r.erros).toEqual([])
    expect(r.linhas[0]?.nome).toBe('Anatomia')
  })

  it('aceita tab, que é o que sai ao colar de uma planilha', () => {
    const r = importarCatalogo(linhas.join('\n').replace(/;/g, '\t'))
    expect(r.erros).toEqual([])
    expect(r.linhas[0]?.nome).toBe('Anatomia')
  })
})

describe('importarCatalogo — cabeçalhos flexíveis', () => {
  it('ignora acento e caixa', () => {
    const r = importarCatalogo(
      ['Disciplina,Curso,Período,Carga Horária,Segunda', 'Ética,Medicina,2º,40,2'].join('\n'),
    )
    expect(r.erros).toEqual([])
    expect(r.linhas[0]?.nome).toBe('Ética')
    expect(r.linhas[0]?.grade).toEqual([{ dia: 1, horas: 2 }])
  })

  it('aceita apelidos comuns de coluna', () => {
    const r = importarCatalogo(['materia,curso,semestre,ch,ter', 'Física,Eng,3º,60,4'].join('\n'))
    expect(r.erros).toEqual([])
    expect(r.linhas[0]?.periodo).toBe('3º')
    expect(r.linhas[0]?.grade).toEqual([{ dia: 2, horas: 4 }])
  })

  it('reclama quando não há coluna de nome', () => {
    const r = importarCatalogo(['curso,carga', 'Medicina,70'].join('\n'))
    expect(r.linhas).toEqual([])
    expect(r.erros[0]?.motivo).toContain('nome')
  })
})

describe('importarCatalogo — números', () => {
  it('aceita vírgula decimal', () => {
    const r = importarCatalogo(['nome,curso,periodo,carga,seg', 'X,C,1º,45,2,5'].join('\n'))
    // '2,5' foi quebrado pela vírgula separadora — este caso vira 2h, e é o
    // comportamento certo: com separador vírgula, decimal com vírgula é
    // ambíguo. Use ; ou tab quando houver meia-hora.
    expect(r.linhas[0]?.grade).toEqual([{ dia: 1, horas: 2 }])
  })

  it('lê meia-hora sem ambiguidade quando o separador é ponto e vírgula', () => {
    const r = importarCatalogo(['nome;curso;periodo;carga;seg', 'X;C;1º;45;2,5'].join('\n'))
    expect(r.linhas[0]?.grade).toEqual([{ dia: 1, horas: 2.5 }])
  })

  it('aceita ponto decimal', () => {
    const r = importarCatalogo(['nome;curso;periodo;carga;seg', 'X;C;1º;45;1.5'].join('\n'))
    expect(r.linhas[0]?.grade).toEqual([{ dia: 1, horas: 1.5 }])
  })
})

describe('importarCatalogo — erros por linha, não por arquivo', () => {
  const csv = [
    'nome,curso,periodo,carga,seg,qua',
    'Boa,Medicina,1º,70,4,2',
    ',Medicina,1º,70,4,',
    'Sem carga,Medicina,1º,0,4,',
    'Sem grade,Medicina,1º,70,,',
    'Outra boa,Medicina,1º,60,,4',
  ].join('\n')

  const r = importarCatalogo(csv)

  it('importa as linhas válidas mesmo com outras quebradas', () => {
    expect(r.linhas.map((l) => l.nome)).toEqual(['Boa', 'Outra boa'])
  })

  it('reporta três erros', () => {
    expect(r.erros).toHaveLength(3)
  })

  it('aponta o número da linha do arquivo', () => {
    expect(r.erros.map((e) => e.linha)).toEqual([3, 4, 5])
  })

  it('explica cada motivo', () => {
    expect(r.erros[0]?.motivo).toContain('nome')
    expect(r.erros[1]?.motivo).toContain('carga')
    expect(r.erros[2]?.motivo).toContain('nenhum dia de aula')
  })
})

describe('importarCatalogo — casos degenerados', () => {
  it('arquivo vazio', () => {
    expect(importarCatalogo('').erros[0]?.motivo).toBe('arquivo vazio')
  })

  it('só cabeçalho não é erro, só não importa nada', () => {
    const r = importarCatalogo('nome,curso,periodo,carga,seg')
    expect(r.linhas).toEqual([])
    expect(r.erros).toEqual([])
  })

  it('ignora linhas em branco no meio', () => {
    const r = importarCatalogo(
      ['nome,curso,periodo,carga,seg', 'A,C,1º,40,2', '', '   ', 'B,C,1º,40,2'].join('\n'),
    )
    expect(r.linhas).toHaveLength(2)
    expect(r.erros).toEqual([])
  })

  it('campos opcionais viram null em vez de string vazia', () => {
    const r = importarCatalogo(
      ['nome,codigo,curso,periodo,turma,carga,seg', 'A,,C,1º,,40,2'].join('\n'),
    )
    expect(r.linhas[0]?.codigo).toBeNull()
    expect(r.linhas[0]?.turma).toBeNull()
  })
})
