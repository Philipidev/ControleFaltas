import { describe, expect, it } from 'vitest'

import { acaoDoAlerta, destinoDoAlerta, emojiDoAlerta, textoEm } from './notificacoes.ts'

describe('textoEm — jsonb chega como unknown', () => {
  it('lê a chave quando o objeto é o esperado', () => {
    expect(textoEm({ grupoId: 'abc' }, 'grupoId')).toBe('abc')
  })

  it('devolve null para formatos que jsonb permite mas o código não espera', () => {
    // Todos estes são Json válido e passariam por um `as`.
    expect(textoEm(null, 'grupoId')).toBeNull()
    expect(textoEm([1, 2], 'grupoId')).toBeNull()
    expect(textoEm('texto', 'grupoId')).toBeNull()
    expect(textoEm(42, 'grupoId')).toBeNull()
    expect(textoEm({}, 'grupoId')).toBeNull()
  })

  it('trata número e string vazia como ausência', () => {
    // Um grupoId numérico não formaria uma rota utilizável.
    expect(textoEm({ grupoId: 7 }, 'grupoId')).toBeNull()
    expect(textoEm({ grupoId: '' }, 'grupoId')).toBeNull()
  })
})

describe('destinoDoAlerta — cada alerta resolve o próprio assunto', () => {
  it('os três de comunidade levam à comunidade', () => {
    const dados = { grupoId: 'g-1' }
    expect(destinoDoAlerta('convite_grupo', dados, null)).toBe('/comunidades/g-1')
    expect(destinoDoAlerta('solicitacao_grupo', dados, null)).toBe('/comunidades/g-1')
    expect(destinoDoAlerta('resposta_grupo', dados, null)).toBe('/comunidades/g-1')
  })

  it('sem grupoId no payload, não inventa rota', () => {
    // O risco real: `/comunidades/undefined` renderizando uma tela quebrada.
    expect(destinoDoAlerta('convite_grupo', {}, null)).toBeNull()
    expect(destinoDoAlerta('convite_grupo', null, null)).toBeNull()
  })

  it('faixa e aviso preventivo levam à disciplina que mudou', () => {
    expect(destinoDoAlerta('faixa_alterada', {}, 'd-9')).toBe('/disciplinas/d-9')
    expect(destinoDoAlerta('aviso_preventivo', {}, 'd-9')).toBe('/disciplinas/d-9')
  })

  it('sem disciplina, faixa não leva a lugar nenhum', () => {
    expect(destinoDoAlerta('faixa_alterada', {}, null)).toBeNull()
  })

  it('prazo de atestado ficou inerte: o tipo existe no enum e não leva a lugar nenhum', () => {
    // A 0015 tirou o prazo. Nenhum trigger grava este tipo, e o valor sobrou no
    // enum do banco só porque recriar um enum em uso não valeria a migration.
    expect(destinoDoAlerta('prazo_atestado', {}, null)).toBeNull()
    expect(acaoDoAlerta('prazo_atestado')).toBeNull()
  })

  it('resumo e streak não têm destino: o texto já é a informação inteira', () => {
    expect(destinoDoAlerta('resumo_semanal', {}, null)).toBeNull()
    expect(destinoDoAlerta('streak', {}, 'd-1')).toBeNull()
  })
})

describe('emojiDoAlerta — não duplica o que o título já traz', () => {
  it('título do banco já começa com emoji, então a tela não desenha outro', () => {
    // Exatamente o texto que 0007 grava.
    expect(emojiDoAlerta('solicitacao_grupo', '🙋 Novo pedido para entrar em Medicina')).toBeNull()
    expect(emojiDoAlerta('convite_grupo', '✉️ Convite para Medicina')).toBeNull()
  })

  it('título sem emoji recebe o do tipo', () => {
    expect(emojiDoAlerta('faixa_alterada', 'Semiologia entrou em vermelho')).toBe('📊')
    expect(emojiDoAlerta('streak', 'Duas semanas sem faltar')).toBe('🔥')
  })

  it('número no início não conta como emoji', () => {
    // \p{Emoji} daria true para "3" — os dígitos participam de 3️⃣.
    expect(emojiDoAlerta('resumo_semanal', '3 faltas nesta semana')).toBe('🗓️')
    expect(emojiDoAlerta('resumo_semanal', '#1 da turma')).toBe('🗓️')
  })

  it('espaço antes do emoji não engana a detecção', () => {
    expect(emojiDoAlerta('resposta_grupo', '  🎉 Você entrou em Medicina')).toBeNull()
  })
})

describe('acaoDoAlerta — o rótulo que revela que dá para tocar', () => {
  it('descreve a ação concreta de cada tipo com destino', () => {
    expect(acaoDoAlerta('convite_grupo')).toBe('Responder convite')
    expect(acaoDoAlerta('solicitacao_grupo')).toBe('Ver pedido')
    expect(acaoDoAlerta('virada_semestre')).toBe('Arquivar semestre')
  })

  it('é null exatamente onde destinoDoAlerta também é', () => {
    // Um rótulo de ação sem destino viraria promessa que a tela não cumpre.
    expect(acaoDoAlerta('resumo_semanal')).toBeNull()
    expect(acaoDoAlerta('streak')).toBeNull()
  })
})
