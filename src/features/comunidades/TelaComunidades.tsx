import { Check, Loader2, Plus, Search, X } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'

import { CartaoComunidade } from './CartaoComunidade.tsx'
import { Botao } from '@/components/ui/Botao.tsx'
import { Cartao } from '@/components/ui/Cartao.tsx'
import {
  useCatalogo,
  useConvites,
  useMinhasComunidades,
  useResponderConvite,
  useSolicitarAcesso,
} from '@/data/comunidades.ts'
import {
  acaoPara,
  descreverComunidade,
  ordenarCatalogo,
  ROTULO_ACAO,
  ROTULO_PAPEL,
} from '@/domain/comunidades.ts'
import { useUsuarioId } from '@/features/auth/contexto.ts'
import { Cabecalho, Erro, Esqueleto, Vazio } from '@/layout/pecas.tsx'

/**
 * Lista de comunidades.
 *
 * Ordem das seções por urgência, não por importância abstrata: convite é uma
 * pergunta esperando resposta e vem primeiro; depois as minhas, que é o motivo
 * de a pessoa ter aberto a tela; a busca vem por último, porque descobrir
 * comunidade nova é o que se faz uma vez por semestre.
 */
export function TelaComunidades() {
  const usuarioId = useUsuarioId()
  const navegar = useNavigate()

  const convites = useConvites(usuarioId)
  const minhas = useMinhasComunidades(usuarioId)
  const [termo, setTermo] = useState('')
  const catalogo = useCatalogo(termo)

  const responder = useResponderConvite(usuarioId)
  const solicitar = useSolicitarAcesso(usuarioId)
  const [erro, setErro] = useState<string | null>(null)

  if (minhas.error !== null) return <Erro erro={minhas.error} />
  if (minhas.isPending || convites.isPending) return <Esqueleto />

  const listaMinhas = minhas.data
  // convites não tem checagem de erro própria acima, então pode estar no
  // estado de erro (isPending false, data undefined). O ?? cobre isso.
  const listaConvites = convites.data ?? []

  const idsMinhas = new Set(listaMinhas.map((m) => m.grupo.id))
  const idsConvites = new Set(listaConvites.map((c) => c.grupo.id))

  const descobrir = ordenarCatalogo(catalogo.data ?? []).filter(
    (c) => !idsMinhas.has(c.id) && !idsConvites.has(c.id),
  )

  return (
    <>
      <Cabecalho
        titulo="Comunidades"
        subtitulo="Turmas e grupos de amigos"
        acao={
          <button
            type="button"
            onClick={() => void navegar('/comunidades/nova')}
            aria-label="Criar comunidade"
            className="grid size-11 place-items-center rounded-pill bg-acento text-acento-contraste"
          >
            <Plus className="size-5" />
          </button>
        }
      />

      <main className="mx-auto max-w-2xl space-y-6 px-5 pt-5 pb-28 lg:pb-10">
        {erro !== null && (
          <p
            role="alert"
            className="rounded-interno bg-vermelho-suave px-3 py-2.5 text-sm font-bold text-vermelho"
          >
            {erro}
          </p>
        )}

        {/* Convites — o que espera resposta */}
        {listaConvites.length > 0 && (
          <section>
            <h2 className="mb-3 px-1 text-sm font-extrabold text-texto-suave">
              Convites para você ({listaConvites.length})
            </h2>
            <div className="space-y-3">
              {listaConvites.map(({ grupo }) => (
                <Cartao key={grupo.id} className="border-2 border-acento p-4">
                  <div className="flex items-start gap-3.5">
                    <span
                      aria-hidden="true"
                      className="grid size-12 shrink-0 place-items-center rounded-interno bg-acento-suave text-2xl"
                    >
                      {grupo.emoji}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-extrabold text-texto">{grupo.nome}</h3>
                      <p className="mt-0.5 truncate text-xs font-semibold text-texto-suave">
                        {descreverComunidade(grupo)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <Botao
                      tamanho="sm"
                      larguraTotal
                      iconeInicio={<Check className="size-4" />}
                      disabled={responder.isPending}
                      onClick={() => {
                        setErro(null)
                        responder.mutate(
                          { grupoId: grupo.id, aceitar: true },
                          { onError: (e: Error) => { setErro(e.message) } },
                        )
                      }}
                    >
                      Aceitar
                    </Botao>
                    <Botao
                      tamanho="sm"
                      variante="secundario"
                      larguraTotal
                      iconeInicio={<X className="size-4" />}
                      disabled={responder.isPending}
                      onClick={() => {
                        setErro(null)
                        responder.mutate(
                          { grupoId: grupo.id, aceitar: false },
                          { onError: (e: Error) => { setErro(e.message) } },
                        )
                      }}
                    >
                      Recusar
                    </Botao>
                  </div>
                </Cartao>
              ))}
            </div>
          </section>
        )}

        {/* Minhas */}
        <section>
          <h2 className="mb-3 px-1 text-sm font-extrabold text-texto-suave">
            Minhas comunidades ({listaMinhas.length})
          </h2>

          {listaMinhas.length === 0 ? (
            <Vazio
              emoji="👥"
              titulo="Você ainda não está em nenhuma"
              texto="Busque a turma do seu período abaixo, ou crie a sua e convide o pessoal."
              acao={{
                rotulo: 'Criar comunidade',
                aoClicar: () => void navegar('/comunidades/nova'),
              }}
            />
          ) : (
            <div className="space-y-3">
              {listaMinhas.map(({ grupo, papel }) => (
                <CartaoComunidade
                  key={grupo.id}
                  dados={grupo}
                  aoClicar={() => void navegar(`/comunidades/${grupo.id}`)}
                  acao={
                    papel === 'membro' ? undefined : (
                      <span className="rounded-pill bg-acento-suave px-2.5 py-1 text-[0.6875rem] font-bold text-acento">
                        {ROTULO_PAPEL[papel]}
                      </span>
                    )
                  }
                />
              ))}
            </div>
          )}
        </section>

        {/* Descobrir */}
        <section>
          <h2 className="mb-3 px-1 text-sm font-extrabold text-texto-suave">Descobrir</h2>

          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-texto-fraco" />
            <input
              type="search"
              value={termo}
              onChange={(e) => {
                setTermo(e.target.value)
              }}
              placeholder="Medicina 1 UNISA…"
              aria-label="Buscar comunidade"
              className="h-13 w-full rounded-controle border-2 border-borda bg-superficie-2 pr-4 pl-12 font-semibold text-texto outline-none placeholder:text-texto-fraco focus:border-acento"
            />
          </div>

          <div className="mt-3 space-y-3">
            {catalogo.isPending ? (
              <div className="h-24 animate-pulse rounded-card bg-superficie-2" />
            ) : descobrir.length === 0 ? (
              <p className="px-1 py-4 text-center text-sm font-semibold text-texto-fraco">
                {termo === ''
                  ? 'Nenhuma outra comunidade por aqui ainda.'
                  : `Nada encontrado para "${termo}".`}
              </p>
            ) : (
              descobrir.map((c) => {
                const acao = acaoPara(c.visibilidade, c.meu_status)
                return (
                  <CartaoComunidade
                    key={c.id}
                    dados={c}
                    aoClicar={() => void navegar(`/comunidades/${c.id}`)}
                    acao={
                      <Botao
                        tamanho="sm"
                        variante={acao === 'aguardando' ? 'secundario' : 'primario'}
                        disabled={acao === 'aguardando' || solicitar.isPending}
                        onClick={(e) => {
                          e.stopPropagation()
                          setErro(null)
                          solicitar.mutate(
                            { grupoId: c.id },
                            { onError: (err: Error) => { setErro(err.message) } },
                          )
                        }}
                      >
                        {solicitar.isPending && <Loader2 className="size-4 animate-spin" />}
                        {ROTULO_ACAO[acao]}
                      </Botao>
                    }
                  />
                )
              })
            )}
          </div>
        </section>
      </main>
    </>
  )
}
