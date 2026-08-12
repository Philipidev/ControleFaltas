import { useMemo } from 'react'

import {
  limitesDe,
  regrasDe,
  useConfiguracoes,
  useFaltas,
  useMinhasDisciplinas,
} from '@/data/queries.ts'
import { hojeISO } from '@/domain/data.ts'
import { projetarAulas, type ProjecaoAulas } from '@/domain/diasRestantes.ts'
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
  readonly limites: Limites
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

  const hoje = hojeISO()

  return useMemo(() => {
    const limites = limitesDe(config.data)
    const regras = regrasDe(config.data)
    const listaDisciplinas = disciplinas.data ?? []
    const listaFaltas = faltas.data ?? []

    const cartoes: CartaoPainel[] = listaDisciplinas.map(({ disciplina, grupoId }) => {
      const dela = listaFaltas.filter((f) => f.disciplinaId === disciplina.id)
      const risco = calcularRisco(disciplina.cargaHorariaTotal, dela, limites, regras)

      return {
        disciplina,
        risco,
        projecao: projetarAulas(disciplina.grade, risco.horasRestantes, hoje),
        grupoId,
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
      carregando: disciplinas.isPending || faltas.isPending || config.isPending,
      erro: disciplinas.error ?? faltas.error ?? config.error,
      // §7.2: as mais vermelhas primeiro, para chamar atenção
      cartoes: ordenarPorRisco(cartoes),
      limites,
      streak: calcularStreak(listaFaltas, hoje, regras),
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
  }, [disciplinas, faltas, config, hoje])
}
