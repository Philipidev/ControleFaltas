import { describe, expect, it } from 'vitest'

import { chaves } from './chaves.ts'

/**
 * Duas queries com formatos diferentes NÃO podem dividir a mesma chave.
 *
 * Isto já aconteceu: `useGrupos` (que devolve a linha de grupos crua) e
 * `useMinhasComunidades` (que devolve `{ grupo, papel, status }`) usavam
 * `['grupos', usuarioId]` as duas. O TanStack Query mantém UMA entrada por
 * chave, então a última tela visitada sobrescrevia o cache da outra: o
 * seletor do ranking lia `.nome` num objeto que só tinha `.grupo`, os chips
 * ficavam sem texto e o ranking travava no esqueleto até recarregar a página.
 *
 * O teste é bobo de propósito — colisão de chave é fácil de introduzir de
 * novo, e o sintoma aparece longe da causa.
 */
describe('chaves — nenhuma colisão entre fábricas diferentes', () => {
  // Argumentos iguais para todas: o objetivo é justamente detectar duas
  // fábricas que produzem a MESMA chave quando alimentadas igual.
  const ID = 'u-1'
  const chamadas: Record<string, readonly unknown[]> = {
    perfil: chaves.perfil(ID),
    configuracoes: chaves.configuracoes(ID),
    disciplinas: chaves.disciplinas(ID),
    catalogo: chaves.catalogo(ID, ID, ID),
    todasDisciplinas: chaves.todasDisciplinas(),
    faltas: chaves.faltas(ID),
    grupos: chaves.grupos(ID),
    ranking: chaves.ranking(ID, ID),
    catalogo_comunidades: chaves.catalogo_comunidades(ID),
    comunidade: chaves.comunidade(ID),
    membros: chaves.membros(ID),
    convites: chaves.convites(ID),
    pendencias: chaves.pendencias(ID),
    minhasComunidades: chaves.minhasComunidades(ID),
    notificacoes: chaves.notificacoes(ID),
    resumoSemanal: chaves.resumoSemanal(ID),
  }

  it('nenhuma fábrica produz a chave de outra', () => {
    const vistas = new Map<string, string>()
    for (const [nome, chave] of Object.entries(chamadas)) {
      const serial = JSON.stringify(chave)
      const anterior = vistas.get(serial)
      expect(anterior, `${nome} colide com ${String(anterior)} em ${serial}`).toBeUndefined()
      vistas.set(serial, nome)
    }
  })

  it('grupos e minhasComunidades não dividem chave — foi exatamente o bug', () => {
    expect(chaves.grupos(ID)).not.toEqual(chaves.minhasComunidades(ID))
  })

  it('as chaves de comunidades ficam sob o mesmo prefixo, para invalidar juntas', () => {
    // useInvalidarComunidades faz invalidateQueries({ queryKey: ['comunidades'] }),
    // que casa por prefixo. Quem sair daqui deixa de ser invalidado.
    for (const nome of [
      'catalogo_comunidades',
      'comunidade',
      'membros',
      'convites',
      'pendencias',
      'minhasComunidades',
    ] as const) {
      expect(chamadas[nome]?.[0], `${nome} fora do prefixo`).toBe('comunidades')
    }
  })

  it('chaves por usuário carregam o id, senão o cache vaza entre contas', () => {
    for (const chave of [
      chaves.perfil(ID),
      chaves.faltas(ID),
      chaves.grupos(ID),
      chaves.minhasComunidades(ID),
      chaves.notificacoes(ID),
    ]) {
      expect(chave).toContain(ID)
    }
  })
})
