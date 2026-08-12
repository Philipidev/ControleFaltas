import { describe, expect, it } from 'vitest'

import {
  acaoPara,
  administra,
  candidatasDeTurma,
  descreverComunidade,
  descreverMembros,
  emailValido,
  normalizarBusca,
  normalizarEmail,
  ordenarCatalogo,
  parecidas,
  poderesDe,
  turmaDoAluno,
  type StatusMembro,
  type TurmaCandidata,
} from './comunidades.ts'

describe('poderesDe — status manda mais que papel', () => {
  it('dono ativo pode tudo, menos sair sem transferir', () => {
    const p = poderesDe('dono', 'ativo')
    expect(p.podeAprovar).toBe(true)
    expect(p.podeDefinirAdmins).toBe(true)
    expect(p.podeApagar).toBe(true)
    // Se pudesse sair, a comunidade ficaria sem quem a administre
    expect(p.podeSair).toBe(false)
  })

  it('admin ativo aprova e convida, mas não define outros admins', () => {
    const p = poderesDe('admin', 'ativo')
    expect(p.podeAprovar).toBe(true)
    expect(p.podeConvidar).toBe(true)
    expect(p.podeDefinirAdmins).toBe(false)
    expect(p.podeApagar).toBe(false)
    expect(p.podeSair).toBe(true)
  })

  it('membro comum só sai', () => {
    const p = poderesDe('membro', 'ativo')
    expect(p.podeAprovar).toBe(false)
    expect(p.podeConvidar).toBe(false)
    expect(p.podeSair).toBe(true)
  })

  it.each(['convidado', 'solicitado', 'recusado'] as const)(
    'quem está %s não tem poder nenhum, mesmo marcado como admin',
    (status) => {
      const p = poderesDe('admin', status)
      expect(Object.values(p).every((v) => v === false)).toBe(true)
    },
  )

  it('sem vínculo nenhum, nada', () => {
    expect(Object.values(poderesDe(null, null)).every((v) => v === false)).toBe(true)
  })

  it('administra() é atalho de podeAprovar', () => {
    expect(administra('dono', 'ativo')).toBe(true)
    expect(administra('admin', 'ativo')).toBe(true)
    expect(administra('membro', 'ativo')).toBe(false)
    expect(administra('admin', 'convidado')).toBe(false)
  })
})

describe('acaoPara — o que a tela oferece', () => {
  it('membro ativo abre, qualquer que seja a visibilidade', () => {
    expect(acaoPara('publica', 'ativo')).toBe('abrir')
    expect(acaoPara('fechada', 'ativo')).toBe('abrir')
    expect(acaoPara('secreta', 'ativo')).toBe('abrir')
  })

  it('convite pendente vira resposta, mesmo em comunidade secreta', () => {
    expect(acaoPara('secreta', 'convidado')).toBe('responder-convite')
  })

  it('quem já pediu, espera', () => {
    expect(acaoPara('fechada', 'solicitado')).toBe('aguardando')
  })

  it('pública entra na hora; fechada pede aprovação', () => {
    expect(acaoPara('publica', null)).toBe('entrar')
    expect(acaoPara('fechada', null)).toBe('solicitar')
  })

  it('secreta sem vínculo só por código', () => {
    expect(acaoPara('secreta', null)).toBe('so-por-codigo')
  })

  it('quem foi recusado pode tentar de novo', () => {
    expect(acaoPara('fechada', 'recusado')).toBe('pedir-de-novo')
  })
})

describe('e-mail', () => {
  it('normaliza caixa e espaços', () => {
    expect(normalizarEmail('  Maria@Exemplo.COM ')).toBe('maria@exemplo.com')
  })

  it.each(['a@b.com', 'maria.silva@unisa.edu.br', 'x+y@z.co'])('aceita %s', (e) => {
    expect(emailValido(e)).toBe(true)
  })

  it.each(['', 'semarroba', 'a@b', 'a@@b.com', 'com espaco@b.com', '@b.com'])(
    'recusa %s',
    (e) => {
      expect(emailValido(e)).toBe(false)
    },
  )
})

describe('normalizarBusca — acentos e ordinais', () => {
  it('tira acento', () => {
    expect(normalizarBusca('Medicina 1º Período')).toBe('medicina 1  periodo')
  })

  it('casa o que a pessoa digita com o que está guardado', () => {
    expect(normalizarBusca('periodo')).toBe('periodo')
    expect(normalizarBusca('Período')).toBe('periodo')
  })
})

describe('parecidas — o aviso de duplicata', () => {
  const catalogo = [
    { nome: 'Medicina 1º período', instituicao: 'UNISA', curso: 'Medicina', periodo: '1º' },
    { nome: 'Medicina 2º período', instituicao: 'UNISA', curso: 'Medicina', periodo: '2º' },
    { nome: 'Enfermagem 1º período', instituicao: 'USP', curso: 'Enfermagem', periodo: '1º' },
  ]

  it('encontra a duplicata mesmo escrita diferente', () => {
    const r = parecidas('medicina 1 unisa', catalogo)
    expect(r).toHaveLength(1)
    expect(r[0]?.nome).toBe('Medicina 1º período')
  })

  it('acha as duas de Medicina quando o termo é genérico', () => {
    expect(parecidas('medicina', catalogo)).toHaveLength(2)
  })

  it('exige TODAS as palavras', () => {
    expect(parecidas('medicina usp', catalogo)).toHaveLength(0)
  })

  it('ignora acento e ordinal', () => {
    expect(parecidas('Medicina 2º Período', catalogo)).toHaveLength(1)
  })

  it('ignora palavra de uma letra, que casaria com tudo', () => {
    expect(parecidas('a', catalogo)).toHaveLength(0)
  })

  it('nome vazio não sugere nada', () => {
    expect(parecidas('', catalogo)).toHaveLength(0)
    expect(parecidas('   ', catalogo)).toHaveLength(0)
  })
})

describe('ordenarCatalogo', () => {
  const item = (nome: string, membros: number, meu_status: StatusMembro | null) => ({
    nome,
    membros,
    meu_status,
  })

  it('convite pendente vem antes de tudo', () => {
    // Uma ordem só por tamanho enterraria o convite lá embaixo
    const r = ordenarCatalogo([
      item('Gigante', 500, null),
      item('Convite', 3, 'convidado'),
      item('Minha', 40, 'ativo'),
    ])
    expect(r.map((i) => i.nome)).toEqual(['Convite', 'Minha', 'Gigante'])
  })

  it('depois as minhas, depois as maiores', () => {
    const r = ordenarCatalogo([
      item('Pequena', 2, null),
      item('Grande', 90, null),
      item('Minha', 5, 'ativo'),
    ])
    expect(r.map((i) => i.nome)).toEqual(['Minha', 'Grande', 'Pequena'])
  })

  it('empate no tamanho desempata por nome', () => {
    const r = ordenarCatalogo([item('Zebra', 10, null), item('Alfa', 10, null)])
    expect(r.map((i) => i.nome)).toEqual(['Alfa', 'Zebra'])
  })

  it('não muta o original', () => {
    const original = [item('B', 1, null), item('A', 9, null)]
    const copia = [...original]
    ordenarCatalogo(original)
    expect(original).toEqual(copia)
  })
})

describe('textos', () => {
  it('descreve a quantidade de membros', () => {
    expect(descreverMembros(0)).toBe('ainda sem membros')
    expect(descreverMembros(1)).toBe('1 membro')
    expect(descreverMembros(34)).toBe('34 membros')
  })

  it('monta a linha de identificação', () => {
    expect(
      descreverComunidade({
        nome: 'x',
        instituicao: 'UNISA',
        curso: 'Medicina',
        periodo: '5º período',
        turma: 'A',
      }),
    ).toBe('UNISA · Medicina · 5º período · Turma A')
  })

  it('pula os campos vazios', () => {
    expect(descreverComunidade({ nome: 'x', instituicao: 'UNISA', curso: null })).toBe('UNISA')
    expect(descreverComunidade({ nome: 'x' })).toBe('')
  })
})

describe('turmaDoAluno — na dúvida, ninguém', () => {
  function turma(parcial: Partial<TurmaCandidata> & { id: string }): TurmaCandidata {
    return {
      tipo: 'turma',
      curso: 'Medicina',
      periodo: '5º período',
      turma: null,
      ...parcial,
    }
  }

  const eu = { curso: 'Medicina', periodo: '5º período', turma: 'A' }

  it('vincula quando só uma comunidade casa', () => {
    expect(turmaDoAluno([turma({ id: 'g1' })], eu)).toBe('g1')
  })

  it('ignora acento, caixa e espaço sobrando', () => {
    const g = turma({ id: 'g1', curso: 'MEDICINA', periodo: '5º  Período' })
    expect(turmaDoAluno([g], eu)).toBe('g1')
  })

  it('não vincula a roda de amigos, mesmo com curso e período iguais', () => {
    expect(turmaDoAluno([turma({ id: 'g1', tipo: 'amigos' })], eu)).toBeNull()
  })

  it('recusa quando o período difere', () => {
    expect(turmaDoAluno([turma({ id: 'g1', periodo: '4º período' })], eu)).toBeNull()
  })

  it('a comunidade do período inteiro serve a quem tem turma', () => {
    expect(turmaDoAluno([turma({ id: 'g1', turma: null })], eu)).toBe('g1')
  })

  it('escolhe a turma certa quando as duas declaram turma', () => {
    const a = turma({ id: 'gA', turma: 'A' })
    const b = turma({ id: 'gB', turma: 'B' })
    expect(turmaDoAluno([a, b], eu)).toBe('gA')
  })

  it('desiste quando duas casam e o perfil não diz a turma', () => {
    const a = turma({ id: 'gA', turma: 'A' })
    const b = turma({ id: 'gB', turma: 'B' })
    // Chutar aqui jogaria a pessoa no ranking de gente que ela não conhece.
    expect(turmaDoAluno([a, b], { ...eu, turma: null })).toBeNull()
    // ...mas a interface tem as duas para perguntar.
    expect(candidatasDeTurma([a, b], { ...eu, turma: null })).toHaveLength(2)
  })

  it('desiste quando o perfil não tem curso ou período', () => {
    expect(turmaDoAluno([turma({ id: 'g1' })], { curso: null, periodo: null, turma: null })).toBeNull()
    expect(turmaDoAluno([turma({ id: 'g1' })], { ...eu, curso: '  ' })).toBeNull()
  })

  it('sem comunidade nenhuma, devolve null e não estoura', () => {
    expect(turmaDoAluno([], eu)).toBeNull()
  })
})
