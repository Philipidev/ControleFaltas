import { Archive, Loader2 } from 'lucide-react'
import { useState } from 'react'

import { Botao } from '@/components/ui/Botao.tsx'
import { Cartao } from '@/components/ui/Cartao.tsx'
import { useArquivarSemestre, useHistoricoSemestres } from '@/data/queries.ts'
import { formatarBR, semestreAtual } from '@/domain/data.ts'
import { formatarHoras, formatarPercentual } from '@/domain/risco.ts'
import { useUsuarioId } from '@/features/auth/contexto.ts'
import { usePainel } from '@/features/dashboard/usePainel.ts'
import type { Json } from '@/types/database.ts'

/**
 * §7.6 — "Reset por semestre: ao trocar de período, zera os dados mas mantém
 * histórico."
 *
 * A confirmação exige digitar o nome do semestre. É uma ação irreversível
 * sobre dados que a pessoa levou meses acumulando — um "tem certeza?" com dois
 * botões é fácil demais de tocar por engano no celular.
 */
export function ResetSemestre() {
  const usuarioId = useUsuarioId()
  const painel = usePainel(usuarioId)
  const historico = useHistoricoSemestres(usuarioId)
  const arquivar = useArquivarSemestre(usuarioId)

  const semestre = semestreAtual()
  const [confirmacao, setConfirmacao] = useState('')
  const [aberto, setAberto] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const podeArquivar = confirmacao.trim() === semestre && painel.cartoes.length > 0

  async function executar() {
    setErro(null)
    const snapshot: Json = {
      semestre,
      arquivadoEm: new Date().toISOString(),
      geral: {
        percentual: painel.geral.percentual,
        totalFaltado: painel.geral.totalFaltado,
      },
      disciplinas: painel.cartoes.map((c) => ({
        nome: c.disciplina.nome,
        cargaHorariaTotal: c.disciplina.cargaHorariaTotal,
        totalFaltado: c.risco.totalFaltado,
        totalJustificado: c.risco.totalJustificado,
        qtdFaltas: c.risco.qtdFaltas,
        percentual: c.risco.percentual,
        status: c.risco.status,
      })),
    }

    try {
      await arquivar.mutateAsync({ semestre, snapshot })
      setAberto(false)
      setConfirmacao('')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui arquivar.')
    }
  }

  return (
    <Cartao className="p-5">
      <h2 className="flex items-center gap-2 font-extrabold text-texto">
        <Archive className="size-5 text-texto-suave" />
        Virada de semestre
      </h2>
      <p className="mt-1.5 text-xs font-semibold text-texto-suave">
        Arquiva as faltas de {semestre} num histórico consultável e zera o contador para o
        próximo período. As disciplinas ficam inativas, não são apagadas.
      </p>

      {historico.data !== undefined && historico.data.length > 0 && (
        <ul className="mt-4 space-y-2">
          {historico.data.map((h) => {
            const dados = h.snapshot as {
              geral?: { percentual?: number; totalFaltado?: number }
              disciplinas?: unknown[]
            }
            return (
              <li key={h.id} className="rounded-interno bg-superficie-2 px-3 py-2.5">
                <p className="text-sm font-extrabold text-texto">{h.semestre}</p>
                <p className="text-xs font-semibold text-texto-suave">
                  {(dados.disciplinas ?? []).length} disciplinas ·{' '}
                  {formatarPercentual(dados.geral?.percentual ?? 0)} de faltas ·{' '}
                  {formatarHoras(dados.geral?.totalFaltado ?? 0)} · arquivado em{' '}
                  {formatarBR(h.arquivado_em.slice(0, 10))}
                </p>
              </li>
            )
          })}
        </ul>
      )}

      {!aberto ? (
        <Botao
          className="mt-4"
          variante="secundario"
          larguraTotal
          onClick={() => {
            setAberto(true)
          }}
          disabled={painel.cartoes.length === 0}
        >
          Arquivar {semestre} e começar o próximo
        </Botao>
      ) : (
        <div className="mt-4 rounded-interno bg-vermelho-suave p-4">
          <p className="text-sm font-extrabold text-vermelho">
            Isto apaga as faltas de {semestre}.
          </p>
          <p className="mt-1 text-xs font-semibold text-vermelho">
            O resumo por disciplina fica salvo no histórico acima, mas as faltas individuais
            (datas e atestados) não voltam. Baixe o backup em Relatórios antes, se quiser
            guardá-las.
          </p>

          <label
            htmlFor="confirmar-semestre"
            className="mt-3 block text-xs font-bold text-vermelho"
          >
            Digite <strong>{semestre}</strong> para confirmar
          </label>
          <input
            id="confirmar-semestre"
            value={confirmacao}
            onChange={(e) => {
              setConfirmacao(e.target.value)
            }}
            placeholder={semestre}
            className="mt-1.5 h-11 w-full rounded-controle border-2 border-vermelho bg-superficie px-3 font-semibold text-texto outline-none"
          />

          {erro !== null && (
            <p role="alert" className="mt-2 text-xs font-bold text-vermelho">
              {erro}
            </p>
          )}

          <div className="mt-3 flex gap-2">
            <Botao
              tamanho="sm"
              variante="perigo"
              onClick={() => void executar()}
              disabled={!podeArquivar || arquivar.isPending}
            >
              {arquivar.isPending && <Loader2 className="size-4 animate-spin" />}
              Arquivar e zerar
            </Botao>
            <Botao
              tamanho="sm"
              variante="fantasma"
              onClick={() => {
                setAberto(false)
                setConfirmacao('')
                setErro(null)
              }}
            >
              Cancelar
            </Botao>
          </div>
        </div>
      )}
    </Cartao>
  )
}
