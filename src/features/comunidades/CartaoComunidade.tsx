import { Users } from 'lucide-react'

import { Cartao } from '@/components/ui/Cartao.tsx'
import {
  descreverComunidade,
  descreverMembros,
  EMOJI_VISIBILIDADE,
  ROTULO_VISIBILIDADE,
  type Visibilidade,
} from '@/domain/comunidades.ts'
import { cn } from '@/lib/cn.ts'

/** Cartão de comunidade usado na lista, na busca e no aviso de duplicata. */

export interface DadosComunidade {
  readonly nome: string
  readonly emoji: string
  readonly instituicao?: string | null
  readonly curso?: string | null
  readonly periodo?: string | null
  readonly turma?: string | null
  readonly visibilidade: Visibilidade
  readonly membros?: number
}

export function CartaoComunidade({
  dados,
  aoClicar,
  acao,
  destaque = false,
  className,
}: {
  dados: DadosComunidade
  aoClicar?: () => void
  acao?: React.ReactNode
  destaque?: boolean
  className?: string
}) {
  const identificacao = descreverComunidade(dados)

  const conteudo = (
    <div className="flex items-start gap-3.5">
      <span
        aria-hidden="true"
        className="grid size-12 shrink-0 place-items-center rounded-interno bg-superficie-2 text-2xl"
      >
        {dados.emoji}
      </span>

      <div className="min-w-0 flex-1">
        <h3 className="truncate font-extrabold text-texto">{dados.nome}</h3>

        {identificacao !== '' && (
          <p className="mt-0.5 truncate text-xs font-semibold text-texto-suave">
            {identificacao}
          </p>
        )}

        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.6875rem] font-bold text-texto-fraco">
          {dados.membros !== undefined && (
            <span className="flex items-center gap-1">
              <Users className="size-3.5" />
              {descreverMembros(dados.membros)}
            </span>
          )}
          <span className="flex items-center gap-1">
            <span aria-hidden="true">{EMOJI_VISIBILIDADE[dados.visibilidade]}</span>
            {ROTULO_VISIBILIDADE[dados.visibilidade]}
          </span>
        </p>
      </div>

      {acao !== undefined && <div className="shrink-0 self-center">{acao}</div>}
    </div>
  )

  return (
    <Cartao className={cn(destaque && 'border-2 border-acento', className)}>
      {aoClicar === undefined ? (
        <div className="p-4">{conteudo}</div>
      ) : (
        <button type="button" onClick={aoClicar} className="w-full p-4 text-left">
          {conteudo}
        </button>
      )}
    </Cartao>
  )
}
