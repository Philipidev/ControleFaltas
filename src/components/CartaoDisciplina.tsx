import { motion } from 'motion/react'

import { ChipStatus } from './ChipStatus.tsx'
import { Medidor } from './Medidor.tsx'
import { Cartao } from './ui/Cartao.tsx'
import { formatarCurto } from '@/domain/data.ts'
import {
  descreverPorTipoDeDia,
  descreverProjecao,
  porTipoDeDia,
  type ProjecaoAulas,
} from '@/domain/diasRestantes.ts'
import { formatarPercentual, formatarProgressoHoras, type ResumoRisco } from '@/domain/risco.ts'
import type { Disciplina, Limites } from '@/domain/tipos.ts'

/**
 * §7.2 — o card do dashboard, com exatamente o que a spec lista:
 * nome · semáforo · horas perdidas/total · quantos dias ainda pode faltar.
 */

interface Props {
  readonly disciplina: Disciplina
  readonly risco: ResumoRisco
  readonly projecao: ProjecaoAulas
  readonly limites: Limites
  readonly onAbrir?: () => void
  readonly onMarcarFalta?: () => void
}

export function CartaoDisciplina({
  disciplina,
  risco,
  projecao,
  limites,
  onAbrir,
  onMarcarFalta,
}: Props) {
  const porDia = porTipoDeDia(disciplina.grade, risco.horasRestantes)
  const acabou = risco.horasRestantes <= 0

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 26 }}
    >
      <Cartao corMateria={disciplina.cor} className="transition-shadow hover:shadow-flutuante">
        <button
          type="button"
          onClick={onAbrir}
          className="w-full cursor-pointer p-5 text-left"
        >
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-lg leading-tight font-extrabold text-texto">
              {disciplina.nome}
            </h3>
            <ChipStatus status={risco.status} tamanho="sm" />
          </div>

          {/* O número que o card lidera. Figuras proporcionais, mesma fonte
              de todo o resto. */}
          <div className="mt-4 flex items-baseline gap-2.5">
            <span className="figura-hero text-4xl text-texto">
              {formatarPercentual(risco.percentual)}
            </span>
            <span className="text-sm font-semibold text-texto-suave tabular">
              {formatarProgressoHoras(risco.totalFaltado, risco.cargaHorariaTotal)}
            </span>
          </div>

          <Medidor
            className="mt-3"
            percentual={risco.percentual}
            status={risco.status}
            limites={limites}
            rotulo={`Faltas em ${disciplina.nome}`}
          />

          {/* §4 — as duas leituras de "quantos dias ainda posso faltar" */}
          <div className="mt-4 space-y-1">
            <p
              className={`text-sm font-bold ${acabou ? 'text-vermelho' : 'text-texto'}`}
            >
              {descreverProjecao(projecao)}
              {projecao.ultimaDataSegura !== null && !acabou && (
                <span className="font-semibold text-texto-suave">
                  {' '}
                  · até {formatarCurto(projecao.ultimaDataSegura)}
                </span>
              )}
            </p>
            {!acabou && (
              <p className="text-xs font-semibold text-texto-fraco">
                ou {descreverPorTipoDeDia(porDia)}
              </p>
            )}
          </div>

          {/* §6 — aviso preventivo, na hora em que ele importa */}
          {projecao.proximaAulaEstoura && projecao.proximaAula !== null && (
            <p className="mt-3 rounded-interno bg-vermelho-suave px-3 py-2 text-xs font-bold text-vermelho">
              ⚠️ Faltar na próxima aula ({formatarCurto(projecao.proximaAula.data)}) já
              passa do limite.
            </p>
          )}
        </button>

        {onMarcarFalta !== undefined && (
          <div className="border-t border-borda px-5 py-3">
            <button
              type="button"
              onClick={onMarcarFalta}
              className="w-full rounded-controle py-2 text-sm font-extrabold text-acento transition-colors hover:bg-acento-suave"
            >
              Marcar falta
            </button>
          </div>
        )}
      </Cartao>
    </motion.div>
  )
}
