import { useMemo } from 'react'

import { useMinhasComunidades } from './comunidades.ts'
import { nivelDaComunidade, nivelDoUsuario, useConfiguracoes, usePerfil } from './queries.ts'
import { turmaDoAluno } from '@/domain/comunidades.ts'
import { resolverRegra, type RegraDoNivel, type RegraResolvida } from '@/domain/limites.ts'
import type { LinhaGrupo } from '@/types/database.ts'

/**
 * Os ingredientes da cascata da regra do curso, montados uma vez só.
 *
 * `domain/limites.ts` decide a regra; aqui é onde os níveis são buscados e
 * casados. Fica fora de `usePainel` porque a tela de Ajustes precisa dos
 * mesmos números sem carregar faltas e disciplinas — e duas montagens
 * separadas divergiriam no primeiro ajuste.
 */

export interface ContextoDaRegra {
  readonly carregando: boolean
  /** Minhas comunidades ativas, que são os níveis "comunidade" possíveis. */
  readonly grupos: readonly LinhaGrupo[]
  /**
   * A turma que responde pelas disciplinas sem vínculo explícito — inclusive
   * as avulsas. A regra da faculdade não deixa de valer porque a optativa está
   * fora do catálogo. Com duas turmas candidatas, `null`: ver `turmaDoAluno`.
   */
  readonly turmaPadrao: string | null
  readonly usuario: RegraDoNivel
  /**
   * A comunidade que responde por quem não tem vínculo explícito, inteira —
   * é dela que saem o semestre e a data de fim do período letivo.
   */
  readonly turma: LinhaGrupo | null
  /** A regra sem disciplina em jogo: a turma sobre a configuração pessoal. */
  readonly geral: RegraResolvida
  /** O nível "comunidade" de uma matrícula, a partir do grupo dela. */
  readonly comunidadeDe: (grupoId: string | null) => RegraDoNivel
  /** Quem definiu, para a tela poder citar pelo nome. */
  readonly nomeDaTurma: (grupoId: string | null) => string | null
}

export function useContextoDaRegra(usuarioId: string): ContextoDaRegra {
  const config = useConfiguracoes(usuarioId)
  const comunidades = useMinhasComunidades(usuarioId)
  const perfil = usePerfil(usuarioId)

  return useMemo(() => {
    const grupos = (comunidades.data ?? []).map((c) => c.grupo)
    const porId = new Map(grupos.map((g) => [g.id, g]))
    const turmaPadrao = turmaDoAluno(grupos, {
      curso: perfil.data?.curso ?? null,
      periodo: perfil.data?.periodo ?? null,
      turma: perfil.data?.turma ?? null,
    })
    const usuario = nivelDoUsuario(config.data)
    const doGrupo = (grupoId: string | null): LinhaGrupo | undefined =>
      porId.get(grupoId ?? turmaPadrao ?? '')

    return {
      carregando: config.isPending || comunidades.isPending || perfil.isPending,
      grupos,
      turmaPadrao,
      usuario,
      turma: doGrupo(null) ?? null,
      geral: resolverRegra({ comunidade: nivelDaComunidade(doGrupo(null)), usuario }),
      comunidadeDe: (grupoId) => nivelDaComunidade(doGrupo(grupoId)),
      nomeDaTurma: (grupoId) => doGrupo(grupoId)?.nome ?? null,
    }
  }, [config.data, config.isPending, comunidades.data, comunidades.isPending, perfil.data, perfil.isPending])
}
