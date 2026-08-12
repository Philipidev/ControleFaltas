import { motion } from 'motion/react'

import { FUNDO_SUAVE, PREENCHIMENTO } from './statusVisual.ts'
import { formatarPercentual } from '@/domain/risco.ts'
import { LIMITES_PADRAO, type Limites, type Status } from '@/domain/tipos.ts'
import { cn } from '@/lib/cn.ts'

/**
 * §4 — o semáforo como MEDIDOR, não como rosca.
 *
 * "8h de um teto de 17,5h" é uma razão contra um limite, e a forma certa para
 * isso é um medidor linear. Um arco ou donut de duas fatias mostraria o mesmo
 * dado com menos precisão de leitura e, principalmente, não teria onde marcar
 * as faixas de 15% e 20% — que é justamente o que a pessoa precisa enxergar
 * ("já passei do amarelo?").
 *
 * ESCALA: o eixo vai de 0 até o limite de reprovação (25%), não até 100% da
 * carga horária. Esticar até 100% jogaria três quartos da barra numa região
 * que ninguém alcança e comprimiria toda a decisão nos primeiros 25%. Os
 * rótulos continuam falando em percentual da carga (15%, 20%, 25%), que é a
 * linguagem da spec e a que o aluno usa.
 *
 * COR: preenchimento na cor do status, trilha num passo mais claro da MESMA
 * rampa — assim o estado se lê na barra inteira, não só na parte preenchida.
 * As marcas de faixa são vãos de 2px na cor da superfície: separam sem somar
 * tinta, e funcionam tanto sobre a trilha quanto sobre o preenchimento.
 */

interface Props {
  /** Fração da carga horária já perdida (0..1). */
  readonly percentual: number
  readonly status: Status
  readonly limites?: Limites
  readonly mostrarEscala?: boolean
  readonly altura?: 'fina' | 'media' | 'grossa'
  readonly className?: string
  /** Rótulo acessível — o que este medidor está medindo. */
  readonly rotulo: string
}

const ALTURAS = {
  fina: 'h-2.5',
  media: 'h-3.5',
  grossa: 'h-5',
} as const

export function Medidor({
  percentual,
  status,
  limites = LIMITES_PADRAO,
  mostrarEscala = false,
  altura = 'media',
  className,
  rotulo,
}: Props) {
  const limite = limites.limiteReprovacao
  const posicao = limite > 0 ? percentual / limite : 0
  const preenchido = Math.min(Math.max(posicao, 0), 1)
  const estourou = posicao > 1

  const marcas = [
    { fracao: limites.faixaVerde / limite, rotulo: formatarPercentual(limites.faixaVerde, 0) },
    { fracao: limites.faixaAmarela / limite, rotulo: formatarPercentual(limites.faixaAmarela, 0) },
  ].filter((m) => m.fracao > 0 && m.fracao < 1)

  return (
    <div className={cn('w-full', className)}>
      <div
        role="meter"
        aria-label={rotulo}
        aria-valuenow={Math.round(percentual * 1000) / 10}
        aria-valuemin={0}
        aria-valuemax={Math.round(limite * 1000) / 10}
        aria-valuetext={`${formatarPercentual(percentual)} de um limite de ${formatarPercentual(limite, 0)}`}
        className={cn(
          'relative w-full overflow-hidden rounded-pill',
          FUNDO_SUAVE[status],
          ALTURAS[altura],
        )}
      >
        <motion.div
          className={cn(
            'absolute inset-y-0 left-0',
            PREENCHIMENTO[status],
            // Ponta arredondada de 4px, quadrada na base — a barra cresce de
            // uma linha de base só. Quando estoura o limite a ponta fica
            // quadrada: sinaliza que o valor continua para além da barra.
            estourou ? 'rounded-none' : 'rounded-r-[4px]',
          )}
          initial={false}
          animate={{ width: `${String(preenchido * 100)}%` }}
          transition={{ type: 'spring', stiffness: 220, damping: 30 }}
        />

        {/* Marcas de faixa: vãos de 2px na cor da superfície, atravessando a
            barra inteira. Sem contorno, sem tinta extra. */}
        {marcas.map((marca) => (
          <span
            key={marca.rotulo}
            aria-hidden="true"
            className="absolute inset-y-0 w-[2px] bg-superficie"
            style={{ left: `${String(marca.fracao * 100)}%` }}
          />
        ))}
      </div>

      {mostrarEscala && (
        <div className="relative mt-1.5 h-4 text-[0.6875rem] font-semibold text-texto-fraco">
          <span className="absolute left-0 tabular">0%</span>
          {marcas.map((marca) => (
            <span
              key={marca.rotulo}
              className="absolute -translate-x-1/2 tabular"
              style={{ left: `${String(marca.fracao * 100)}%` }}
            >
              {marca.rotulo}
            </span>
          ))}
          <span className="absolute right-0 tabular">{formatarPercentual(limite, 0)}</span>
        </div>
      )}
    </div>
  )
}
