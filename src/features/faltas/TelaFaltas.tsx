import { FileCheck2, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'

import { Botao } from '@/components/ui/Botao.tsx'
import { Cartao } from '@/components/ui/Cartao.tsx'
import { useFaltas, useJustificarFalta, useRemoverFalta } from '@/data/queries.ts'
import type { FaltaDetalhada } from '@/data/mapeadores.ts'
import { formatarBR, formatarRelativo } from '@/domain/data.ts'
import { formatarHoras } from '@/domain/risco.ts'
import type { Disciplina } from '@/domain/tipos.ts'
import { useUsuarioId } from '@/features/auth/contexto.ts'
import { usePainel } from '@/features/dashboard/usePainel.ts'
import { FolhaMarcarFalta } from '@/features/faltas/FolhaMarcarFalta.tsx'
import { cn } from '@/lib/cn.ts'
import { Cabecalho, Erro, Esqueleto, Vazio } from '@/layout/pecas.tsx'

/**
 * §3 e §7.1 — histórico de faltas.
 *
 * O atestado aqui é um estado só, que liga e desliga. Já houve três: prazo
 * correndo, prazo vencido e justificada, mais dois botões que se excluíam na
 * ordem errada — "Justificar" tirava o "Anexar" da tela, e o arquivo anexado
 * só aparecia depois de justificar. Sem prazo e sem anexo, sobra o que a
 * pergunta sempre foi: você tem atestado para esta falta?
 */
export function TelaFaltas({ abrirNova = false }: { abrirNova?: boolean }) {
  const usuarioId = useUsuarioId()
  const painel = usePainel(usuarioId)
  const faltas = useFaltas(usuarioId)
  const navegar = useNavigate()
  const [filtro, setFiltro] = useState<string | null>(null)
  // §7.4 — o atalho do ícone (segurar → "Marcar falta") entra por /faltas/nova
  // e cai aqui com a folha já aberta. Antes o atalho apontava para uma rota
  // que não existia e caía no redirect para a home: o botão "Marcar falta" da
  // tela de início do celular não marcava falta nenhuma.
  const [marcando, setMarcando] = useState(abrirNova)

  /** Fechar a folha volta a URL para /faltas — a rota /nova é só a entrada. */
  function fecharFolha() {
    setMarcando(false)
    if (abrirNova) void navegar('/faltas', { replace: true })
  }

  if (painel.erro !== null) return <Erro erro={painel.erro} />
  if (painel.carregando || faltas.isPending) return <Esqueleto />

  const disciplinas = painel.cartoes.map((c) => c.disciplina)
  const lista = (faltas.data ?? []).filter(
    (f) => filtro === null || f.disciplinaId === filtro,
  )

  return (
    <>
      <Cabecalho
        titulo="Faltas"
        subtitulo={`${String(faltas.data?.length ?? 0)} no semestre`}
        acao={
          disciplinas.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                setMarcando(true)
              }}
              aria-label="Marcar falta"
              className="grid size-11 place-items-center rounded-pill bg-acento text-acento-contraste"
            >
              <Plus className="size-5" />
            </button>
          ) : undefined
        }
      />

      <main className="mx-auto max-w-2xl space-y-4 px-5 pt-5 pb-28 lg:pb-10">
        {disciplinas.length > 1 && (
          <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
            <Pilula ativo={filtro === null} aoClicar={() => { setFiltro(null) }}>
              Todas
            </Pilula>
            {disciplinas.map((d) => (
              <Pilula
                key={d.id}
                ativo={filtro === d.id}
                cor={d.cor}
                aoClicar={() => {
                  setFiltro(d.id)
                }}
              >
                {d.nome}
              </Pilula>
            ))}
          </div>
        )}

        {lista.length === 0 ? (
          <Vazio
            emoji="🎉"
            titulo={filtro === null ? 'Nenhuma falta registrada' : 'Nenhuma falta aqui'}
            texto={
              filtro === null
                ? 'Quando faltar, registre aqui — o app desconta as horas certas da grade.'
                : 'Nesta disciplina você não faltou nenhuma vez.'
            }
          />
        ) : (
          <ul className="space-y-3">
            {lista.map((f) => (
              <ItemFalta
                key={f.id}
                falta={f}
                disciplina={disciplinas.find((d) => d.id === f.disciplinaId)}
                hoje={painel.hoje}
                usuarioId={usuarioId}
              />
            ))}
          </ul>
        )}
      </main>

      {marcando && (
        <FolhaMarcarFalta
          cartoes={painel.cartoes}
          usuarioId={usuarioId}
          aoFechar={fecharFolha}
        />
      )}
    </>
  )
}

function Pilula({
  children,
  ativo,
  cor,
  aoClicar,
}: {
  children: React.ReactNode
  ativo: boolean
  cor?: string
  aoClicar: () => void
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      aria-pressed={ativo}
      className={cn(
        'flex shrink-0 items-center gap-1.5 rounded-pill border-2 px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-colors',
        ativo ? 'border-acento bg-acento-suave text-acento' : 'border-borda text-texto-suave',
      )}
    >
      {cor !== undefined && (
        <span
          aria-hidden="true"
          className="size-2 rounded-full"
          style={{ backgroundColor: cor }}
        />
      )}
      {children}
    </button>
  )
}

function ItemFalta({
  falta,
  disciplina,
  hoje,
  usuarioId,
}: {
  falta: FaltaDetalhada
  disciplina: Disciplina | undefined
  hoje: string
  usuarioId: string
}) {
  const justificar = useJustificarFalta(usuarioId)
  const remover = useRemoverFalta(usuarioId)
  const [erro, setErro] = useState<string | null>(null)

  return (
    <li>
      <Cartao corMateria={disciplina?.cor} className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-extrabold text-texto">
              {disciplina?.nome ?? 'Disciplina removida'}
            </p>
            <p className="mt-0.5 text-xs font-semibold text-texto-suave">
              {formatarBR(falta.data)} · {formatarRelativo(falta.data, hoje)} ·{' '}
              <span className="tabular">{formatarHoras(falta.horasPerdidas)}</span>
            </p>
          </div>

          <button
            type="button"
            aria-label="Apagar falta"
            onClick={() => {
              remover.mutate(falta.id)
            }}
            className="grid size-9 shrink-0 place-items-center rounded-pill text-texto-fraco transition-colors hover:bg-vermelho-suave hover:text-vermelho"
          >
            <Trash2 className="size-4" />
          </button>
        </div>

        {/* §7.1 — tenho atestado: anotação, não desconto */}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-borda pt-3">
          {falta.justificada ? (
            <>
              <span className="flex items-center gap-1.5 rounded-pill bg-acento-suave px-2.5 py-1 text-xs font-bold text-acento">
                <FileCheck2 className="size-3.5" />
                Com atestado
              </span>
              <button
                type="button"
                onClick={() => {
                  justificar.mutate({ faltaId: falta.id, justificada: false })
                }}
                className="ml-auto text-xs font-bold text-texto-fraco underline"
              >
                desfazer
              </button>
            </>
          ) : (
            <Botao
              tamanho="sm"
              variante="secundario"
              onClick={() => {
                setErro(null)
                justificar.mutate(
                  { faltaId: falta.id, justificada: true },
                  {
                    onError: (e: Error) => {
                      setErro(e.message)
                    },
                  },
                )
              }}
              disabled={justificar.isPending}
            >
              Marcar com atestado
            </Botao>
          )}

          {erro !== null && (
            <p role="alert" className="w-full text-xs font-bold text-vermelho">
              {erro}
            </p>
          )}
        </div>
      </Cartao>
    </li>
  )
}
