import { Loader2, ScrollText } from 'lucide-react'
import { useState } from 'react'

import { Botao } from '@/components/ui/Botao.tsx'
import { Cartao } from '@/components/ui/Cartao.tsx'
import { useSalvarRegraDaComunidade, type RegraDaTurma } from '@/data/comunidades.ts'
import { formatarPercentual } from '@/domain/risco.ts'
import { cn } from '@/lib/cn.ts'
import type { LinhaGrupo } from '@/types/database.ts'

/**
 * A regra do curso, no lugar onde ela é de alguém.
 *
 * O limite de faltas vem do regimento da faculdade, não do gosto de quem usa o
 * app — e é a turma que conhece o regimento. Definido aqui, vale para todas as
 * disciplinas vinculadas a esta comunidade e para todo mundo que está sendo
 * comparado no ranking. Quem não administra, lê.
 *
 * Em branco não é "sem regra": é "cada um com a sua", que é como o app
 * funcionava antes desta tela existir.
 */

function paraPorcento(valor: number | null): string {
  return valor === null ? '' : String(Math.round(valor * 100))
}

function paraFracao(texto: string): number | null {
  const limpo = texto.trim()
  if (limpo === '') return null
  return Math.min(Math.max(Number(limpo), 1), 100) / 100
}

export function RegraDaComunidade({
  grupo,
  podeEditar,
  usuarioId,
}: {
  grupo: LinhaGrupo
  podeEditar: boolean
  usuarioId: string
}) {
  const salvar = useSalvarRegraDaComunidade(usuarioId)
  const [editando, setEditando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const [limite, setLimite] = useState(paraPorcento(grupo.limite_reprovacao))
  const [verde, setVerde] = useState(paraPorcento(grupo.faixa_verde))
  const [amarela, setAmarela] = useState(paraPorcento(grupo.faixa_amarela))

  const definiuAlgo =
    grupo.limite_reprovacao !== null ||
    grupo.faixa_verde !== null ||
    grupo.faixa_amarela !== null

  // Sem regra e sem poder de definir, o cartão não tem o que dizer.
  if (!definiuAlgo && !podeEditar) return null

  function enviar() {
    setErro(null)
    const regra: RegraDaTurma = {
      limite_reprovacao: paraFracao(limite),
      faixa_verde: paraFracao(verde),
      faixa_amarela: paraFracao(amarela),
    }

    // As mesmas ordens que o CHECK do banco exige, ditas antes para a pessoa
    // não receber um erro de constraint em inglês.
    if (
      regra.faixa_verde !== null &&
      regra.faixa_amarela !== null &&
      regra.faixa_verde >= regra.faixa_amarela
    ) {
      setErro('O verde tem que terminar antes do amarelo.')
      return
    }
    if (
      regra.faixa_amarela !== null &&
      regra.limite_reprovacao !== null &&
      regra.faixa_amarela > regra.limite_reprovacao
    ) {
      setErro('O amarelo não pode passar do limite de reprovação.')
      return
    }

    salvar.mutate(
      { grupoId: grupo.id, regra },
      {
        onSuccess: () => {
          setEditando(false)
        },
        onError: (e: Error) => {
          setErro(e.message)
        },
      },
    )
  }

  return (
    <Cartao className="p-5">
      <h2 className="flex items-center gap-2 font-extrabold text-texto">
        <ScrollText className="size-5 text-texto-suave" />
        Regra do curso
      </h2>
      <p className="mt-1.5 text-xs font-semibold text-texto-suave">
        Vale para todas as disciplinas desta turma e para o ranking. Em branco, cada um usa a
        configuração dele.
      </p>

      {!editando && (
        <dl className="mt-4 space-y-1.5 text-sm">
          <Linha
            termo="Reprova por falta acima de"
            valor={
              grupo.limite_reprovacao === null
                ? 'não definido'
                : formatarPercentual(grupo.limite_reprovacao, 0)
            }
          />
          <Linha
            termo="Alerta amarelo a partir de"
            valor={
              grupo.faixa_verde === null ? 'não definido' : formatarPercentual(grupo.faixa_verde, 0)
            }
          />
          <Linha
            termo="Alerta vermelho a partir de"
            valor={
              grupo.faixa_amarela === null
                ? 'não definido'
                : formatarPercentual(grupo.faixa_amarela, 0)
            }
          />
        </dl>
      )}

      {editando && (
        <div className="mt-4 space-y-3">
          <Porcento id="r-limite" rotulo="Reprova por falta acima de" valor={limite} aoMudar={setLimite} />
          <Porcento id="r-verde" rotulo="Alerta amarelo a partir de" valor={verde} aoMudar={setVerde} />
          <Porcento
            id="r-amarela"
            rotulo="Alerta vermelho a partir de"
            valor={amarela}
            aoMudar={setAmarela}
          />
        </div>
      )}

      {erro !== null && (
        <p
          role="alert"
          className="mt-3 rounded-interno bg-vermelho-suave px-3 py-2.5 text-sm font-bold text-vermelho"
        >
          {erro}
        </p>
      )}

      {podeEditar && (
        <div className="mt-4 flex gap-2">
          {editando ? (
            <>
              <Botao tamanho="sm" onClick={enviar} disabled={salvar.isPending}>
                {salvar.isPending && <Loader2 className="size-4 animate-spin" />}
                Salvar para a turma
              </Botao>
              <Botao
                tamanho="sm"
                variante="fantasma"
                onClick={() => {
                  setEditando(false)
                  setErro(null)
                }}
              >
                Cancelar
              </Botao>
            </>
          ) : (
            <Botao
              tamanho="sm"
              variante="secundario"
              onClick={() => {
                setEditando(true)
              }}
            >
              {definiuAlgo ? 'Mudar a regra' : 'Definir a regra'}
            </Botao>
          )}
        </div>
      )}
    </Cartao>
  )
}

function Linha({ termo, valor }: { termo: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="font-semibold text-texto-suave">{termo}</dt>
      <dd
        className={cn(
          'tabular shrink-0 font-extrabold',
          valor === 'não definido' ? 'text-texto-fraco' : 'text-texto',
        )}
      >
        {valor}
      </dd>
    </div>
  )
}

function Porcento({
  id,
  rotulo,
  valor,
  aoMudar,
}: {
  id: string
  rotulo: string
  valor: string
  aoMudar: (v: string) => void
}) {
  return (
    <label htmlFor={id} className="flex items-center justify-between gap-3">
      <span className="text-sm font-bold text-texto">{rotulo}</span>
      <span className="flex shrink-0 items-center gap-1.5">
        <input
          id={id}
          type="number"
          min={1}
          max={100}
          step={1}
          value={valor}
          placeholder="—"
          onChange={(e) => {
            aoMudar(e.target.value)
          }}
          className="tabular h-11 w-20 rounded-controle border-2 border-borda bg-superficie-2 px-3 text-center font-extrabold text-texto outline-none placeholder:text-texto-fraco focus:border-acento"
        />
        <span className="text-sm font-bold text-texto-suave">%</span>
      </span>
    </label>
  )
}
