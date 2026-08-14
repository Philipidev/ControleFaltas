import { useMemo } from 'react'

import { useConfiguracoes, useFaltas, useMinhasDisciplinas } from '@/data/queries.ts'
import { useContextoDaRegra } from '@/data/regra.ts'
import { hojeISO, semestreAtual } from '@/domain/data.ts'
import { projetarAulas, type ProjecaoAulas } from '@/domain/diasRestantes.ts'
import { resolverRegra, type RegraResolvida } from '@/domain/limites.ts'
import { ordenarPorRisco } from '@/domain/ordenacao.ts'
import { calcularRisco, type ResumoRisco } from '@/domain/risco.ts'
import { resumoDaSemana, type ResumoDaSemana } from '@/domain/semanal.ts'
import { calcularStreak, type Streak } from '@/domain/streak.ts'
import type { Disciplina, Limites, Status } from '@/domain/tipos.ts'

/**
 * Junta os dados do Supabase com os cálculos do domínio.
 *
 * É aqui que a §4 vira tela: para cada disciplina matriculada, o risco e a
 * projeção de dias restantes saem de src/domain, que é código testado e roda
 * sem rede. As telas só recebem o resultado pronto.
 */

export interface CartaoPainel {
  readonly disciplina: Disciplina
  readonly risco: ResumoRisco
  readonly projecao: ProjecaoAulas
  readonly grupoId: string | null
  /**
   * A regra resolvida DESTA disciplina, com a origem de cada número.
   *
   * Deixou de ser uma só para o painel inteiro: a turma pode definir 20%
   * enquanto o estágio exige 10% e a optativa avulsa continua no seu ajuste
   * pessoal. Quem desenha um medidor precisa da faixa certa, não da média.
   */
  readonly regra: RegraResolvida
  readonly limites: Limites
  /** O período letivo desta matrícula, ex: '2026.2'. */
  readonly semestre: string
  // campos planos que os comparadores de ordenacao.ts consomem
  readonly status: Status
  readonly percentual: number
  readonly nome: string
  readonly horasRestantes: number
  readonly cargaHorariaTotal: number
}

export interface Painel {
  readonly carregando: boolean
  readonly erro: Error | null
  readonly cartoes: readonly CartaoPainel[]
  /**
   * A regra que vale sem disciplina em jogo: a turma do aluno sobre a
   * configuração pessoal. É o que a tela de Ajustes edita e o que serve de
   * referência a quem ainda não tem matrícula — cada disciplina pode ter a
   * sua, em `cartao.regra`.
   */
  readonly regra: RegraResolvida
  readonly limites: Limites
  /**
   * O período letivo em curso: o das matrículas, ou o que a turma anunciou
   * para quem ainda não tem nenhuma. É o que a virada de semestre arquiva.
   */
  readonly semestre: string
  readonly streak: Streak
  readonly semana: ResumoDaSemana
  readonly geral: {
    readonly percentual: number
    readonly totalFaltado: number
    readonly emAtencao: number
    readonly total: number
  }
  readonly hoje: string
}

export function usePainel(usuarioId: string): Painel {
  const disciplinas = useMinhasDisciplinas(usuarioId)
  const faltas = useFaltas(usuarioId)
  const config = useConfiguracoes(usuarioId)
  const contexto = useContextoDaRegra(usuarioId)

  const hoje = hojeISO()

  return useMemo(() => {
    const listaDisciplinas = disciplinas.data ?? []
    const listaFaltas = faltas.data ?? []

    const cartoes: CartaoPainel[] = listaDisciplinas.map((m) => {
      const { disciplina, grupoId } = m
      const dela = listaFaltas.filter((f) => f.disciplinaId === disciplina.id)
      const regra = resolverRegra({
        disciplina: m.regra,
        comunidade: contexto.comunidadeDe(grupoId),
        usuario: contexto.usuario,
      })
      const risco = calcularRisco(disciplina.cargaHorariaTotal, dela, regra.limites)

      return {
        disciplina,
        risco,
        projecao: projetarAulas(disciplina.grade, risco.horasRestantes, hoje),
        grupoId,
        regra,
        limites: regra.limites,
        semestre: m.semestre,
        status: risco.status,
        percentual: risco.percentual,
        nome: disciplina.nome,
        horasRestantes: risco.horasRestantes,
        cargaHorariaTotal: disciplina.cargaHorariaTotal,
      }
    })

    const totalFaltado = cartoes.reduce((s, c) => s + c.risco.totalFaltado, 0)
    const totalCarga = cartoes.reduce((s, c) => s + c.disciplina.cargaHorariaTotal, 0)

    return {
      carregando:
        disciplinas.isPending || faltas.isPending || config.isPending || contexto.carregando,
      erro: disciplinas.error ?? faltas.error ?? config.error,
      // §7.2: as mais vermelhas primeiro, para chamar atenção
      cartoes: ordenarPorRisco(cartoes),
      regra: contexto.geral,
      limites: contexto.geral.limites,
      semestre: cartoes[0]?.semestre ?? contexto.turma?.semestre ?? semestreAtual(),
      streak: calcularStreak(listaFaltas, hoje, contexto.geral.regras),
      semana: resumoDaSemana(
        listaFaltas,
        listaDisciplinas.map((d) => d.disciplina),
        hoje,
      ),
      geral: {
        percentual: totalCarga > 0 ? totalFaltado / totalCarga : 0,
        totalFaltado,
        emAtencao: cartoes.filter((c) => c.risco.status !== 'verde').length,
        total: cartoes.length,
      },
      hoje,
    }
  }, [disciplinas, faltas, config, contexto, hoje])
}
