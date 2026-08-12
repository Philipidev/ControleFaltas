import { ArrowLeft, Check, Copy, Loader2, LogOut, Mail, Shield, UserMinus, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import { RegraDaComunidade } from './RegraDaComunidade.tsx'
import { SemestreDaTurma } from './SemestreDaTurma.tsx'
import { Botao } from '@/components/ui/Botao.tsx'
import { Cartao } from '@/components/ui/Cartao.tsx'
import {
  useComunidade,
  useConvidar,
  useDefinirPapel,
  useMembros,
  useRemoverMembro,
  useResponderConvite,
  useResponderSolicitacao,
  useSolicitarAcesso,
  useTransferirPropriedade,
  type MembroDaComunidade,
} from '@/data/comunidades.ts'
import {
  acaoPara,
  descreverComunidade,
  descreverMembros,
  DESCRICAO_VISIBILIDADE,
  emailValido,
  poderesDe,
  ROTULO_PAPEL,
} from '@/domain/comunidades.ts'
import { useUsuarioId } from '@/features/auth/contexto.ts'
import { cn } from '@/lib/cn.ts'
import { Erro, Esqueleto, Vazio } from '@/layout/pecas.tsx'

export function TelaComunidade() {
  const { id = '' } = useParams()
  const usuarioId = useUsuarioId()
  const navegar = useNavigate()

  const comunidade = useComunidade(id)
  const membros = useMembros(id)
  const [erro, setErro] = useState<string | null>(null)

  const solicitar = useSolicitarAcesso(usuarioId)
  const responderConvite = useResponderConvite(usuarioId)
  const remover = useRemoverMembro(usuarioId)

  // Os dois erros são checados, e em `if`s separados. Se o de membros passasse
  // batido, `membros.data` ficaria undefined, a lista viraria [] e a tela
  // concluiria que não sou membro — oferecendo "Pedir para entrar" ao dono da
  // comunidade. Erro engolido vira mentira na interface.
  //
  // Separados porque `a.error ?? b.error` destrói o estreitamento: o tipo de
  // useQuery é união discriminada por `error`, e o TypeScript só a resolve
  // quando o teste cita a query diretamente.
  if (comunidade.error !== null) return <Erro erro={comunidade.error} />
  if (membros.error !== null) return <Erro erro={membros.error} />
  if (comunidade.isPending || membros.isPending) return <Esqueleto />

  const g = comunidade.data
  const lista = membros.data
  const eu = lista.find((m) => m.usuarioId === usuarioId) ?? null
  const poderes = poderesDe(eu?.papel ?? null, eu?.status ?? null)

  const ativos = lista.filter((m) => m.status === 'ativo')
  const solicitantes = lista.filter((m) => m.status === 'solicitado')
  const convidados = lista.filter((m) => m.status === 'convidado')
  const acao = acaoPara(g.visibilidade, eu?.status ?? null)

  function reportar(e: Error) {
    setErro(e.message)
  }

  return (
    <>
      <header className="area-segura-topo sticky top-0 z-20 border-b border-borda bg-fundo/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-5 py-3">
          <Link
            to="/comunidades"
            aria-label="Voltar"
            className="grid size-10 shrink-0 place-items-center rounded-pill bg-superficie-2 text-texto-suave"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-lg font-extrabold text-texto">{g.nome}</h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-5 pt-5 pb-28 lg:pb-10">
        {erro !== null && (
          <p
            role="alert"
            className="rounded-interno bg-vermelho-suave px-3 py-2.5 text-sm font-bold text-vermelho"
          >
            {erro}
          </p>
        )}

        {/* Identidade */}
        <Cartao className="p-5 text-center">
          <span aria-hidden="true" className="text-5xl">
            {g.emoji}
          </span>
          <h2 className="mt-3 text-xl font-extrabold text-texto">{g.nome}</h2>
          {descreverComunidade(g) !== '' && (
            <p className="mt-1 text-sm font-semibold text-texto-suave">
              {descreverComunidade(g)}
            </p>
          )}
          {g.descricao !== null && (
            <p className="mt-3 text-sm font-medium text-texto-suave">{g.descricao}</p>
          )}
          <p className="mt-3 text-xs font-bold text-texto-fraco">
            {descreverMembros(ativos.length)} ·{' '}
            {DESCRICAO_VISIBILIDADE[g.visibilidade]}
          </p>

          {/* Ação conforme meu vínculo */}
          {acao === 'responder-convite' && (
            <div className="mt-5 flex gap-2">
              <Botao
                larguraTotal
                iconeInicio={<Check className="size-4" />}
                disabled={responderConvite.isPending}
                onClick={() => {
                  setErro(null)
                  responderConvite.mutate(
                    { grupoId: id, aceitar: true },
                    { onError: reportar },
                  )
                }}
              >
                Aceitar convite
              </Botao>
              <Botao
                variante="secundario"
                larguraTotal
                disabled={responderConvite.isPending}
                onClick={() => {
                  setErro(null)
                  responderConvite.mutate(
                    { grupoId: id, aceitar: false },
                    { onError: reportar, onSuccess: () => void navegar('/comunidades') },
                  )
                }}
              >
                Recusar
              </Botao>
            </div>
          )}

          {(acao === 'entrar' || acao === 'solicitar' || acao === 'pedir-de-novo') && (
            <Botao
              className="mt-5"
              larguraTotal
              disabled={solicitar.isPending}
              onClick={() => {
                setErro(null)
                solicitar.mutate({ grupoId: id }, { onError: reportar })
              }}
            >
              {solicitar.isPending && <Loader2 className="size-4 animate-spin" />}
              {acao === 'entrar' ? 'Entrar na comunidade' : 'Pedir para entrar'}
            </Botao>
          )}

          {acao === 'aguardando' && (
            <p className="mt-5 rounded-interno bg-amarelo-suave px-3 py-2.5 text-sm font-bold text-amarelo">
              Seu pedido está esperando aprovação de quem administra.
            </p>
          )}
        </Cartao>

        {/* Painel de quem administra */}
        {poderes.podeAprovar && (
          <>
            {solicitantes.length > 0 && (
              <Cartao className="p-5">
                <h2 className="font-extrabold text-texto">
                  Pedidos para entrar ({solicitantes.length})
                </h2>
                <ul className="mt-3 space-y-3">
                  {solicitantes.map((m) => (
                    <li key={m.usuarioId} className="rounded-interno bg-superficie-2 p-3.5">
                      <div className="flex items-center gap-3">
                        <span aria-hidden="true" className="text-xl">
                          {m.emoji}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-bold text-texto">
                          {m.nome}
                        </span>
                      </div>
                      {m.mensagem !== null && (
                        <p className="mt-2 text-xs font-medium text-texto-suave italic">
                          “{m.mensagem}”
                        </p>
                      )}
                      <BotoesResposta
                        grupoId={id}
                        alvoId={m.usuarioId}
                        usuarioId={usuarioId}
                        aoFalhar={reportar}
                      />
                    </li>
                  ))}
                </ul>
              </Cartao>
            )}

            <FormularioConvite grupoId={id} usuarioId={usuarioId} />

            {convidados.length > 0 && (
              <Cartao className="p-5">
                <h2 className="font-extrabold text-texto">
                  Convites enviados ({convidados.length})
                </h2>
                <ul className="mt-3 space-y-1.5">
                  {convidados.map((m) => (
                    <li
                      key={m.usuarioId}
                      className="flex items-center gap-2 text-sm font-semibold text-texto-suave"
                    >
                      <span aria-hidden="true">{m.emoji}</span>
                      {m.nome}
                      <span className="ml-auto text-xs font-bold text-texto-fraco">
                        aguardando resposta
                      </span>
                    </li>
                  ))}
                </ul>
              </Cartao>
            )}
          </>
        )}

        {/* A regra do curso e o calendário: quem administra define, todo mundo lê. */}
        {eu?.status === 'ativo' && (
          <>
            <RegraDaComunidade grupo={g} podeEditar={poderes.podeEditar} usuarioId={usuarioId} />
            <SemestreDaTurma grupo={g} podeEditar={poderes.podeEditar} usuarioId={usuarioId} />
          </>
        )}

        {/* Membros */}
        {eu?.status === 'ativo' ? (
          <Cartao className="p-5">
            <h2 className="font-extrabold text-texto">Membros ({ativos.length})</h2>
            <ul className="mt-3 divide-y divide-borda">
              {ativos.map((m) => (
                <LinhaMembro
                  key={m.usuarioId}
                  membro={m}
                  souEu={m.usuarioId === usuarioId}
                  grupoId={id}
                  usuarioId={usuarioId}
                  poderes={poderes}
                  aoFalhar={reportar}
                />
              ))}
            </ul>
          </Cartao>
        ) : (
          <Vazio
            emoji="🔒"
            titulo="Membros são visíveis para quem participa"
            texto="Entre na comunidade para ver quem está nela."
          />
        )}

        {/* Código de convite */}
        {eu?.status === 'ativo' && (
          <Cartao className="flex items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-texto-fraco">Código de convite</p>
              <p className="tabular text-lg font-extrabold text-texto">{g.codigo_convite}</p>
            </div>
            <button
              type="button"
              aria-label="Copiar código"
              onClick={() => {
                void navigator.clipboard.writeText(g.codigo_convite)
              }}
              className="grid size-10 shrink-0 place-items-center rounded-pill bg-superficie-2 text-texto-suave"
            >
              <Copy className="size-4" />
            </button>
          </Cartao>
        )}

        {/* Sair */}
        {eu?.status === 'ativo' && (
          <div>
            <Botao
              variante="secundario"
              larguraTotal
              iconeInicio={<LogOut className="size-4" />}
              disabled={!poderes.podeSair || remover.isPending}
              onClick={() => {
                setErro(null)
                remover.mutate(
                  { grupoId: id },
                  { onError: reportar, onSuccess: () => void navegar('/comunidades') },
                )
              }}
            >
              Sair da comunidade
            </Botao>
            {!poderes.podeSair && (
              <p className="mt-2 px-1 text-center text-xs font-semibold text-texto-fraco">
                Você é o dono. Passe a comunidade para outra pessoa antes de sair — sem dono,
                ninguém aprova pedidos nem convida.
              </p>
            )}
          </div>
        )}
      </main>
    </>
  )
}

function BotoesResposta({
  grupoId,
  alvoId,
  usuarioId,
  aoFalhar,
}: {
  grupoId: string
  alvoId: string
  usuarioId: string
  aoFalhar: (e: Error) => void
}) {
  const responder = useResponderSolicitacao(usuarioId)

  return (
    <div className="mt-3 flex gap-2">
      <Botao
        tamanho="sm"
        larguraTotal
        iconeInicio={<Check className="size-4" />}
        disabled={responder.isPending}
        onClick={() => {
          responder.mutate({ grupoId, alvoId, aprovar: true }, { onError: aoFalhar })
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
          responder.mutate({ grupoId, alvoId, aprovar: false }, { onError: aoFalhar })
        }}
      >
        Recusar
      </Botao>
    </div>
  )
}

function FormularioConvite({ grupoId, usuarioId }: { grupoId: string; usuarioId: string }) {
  const convidar = useConvidar(usuarioId)
  const [email, setEmail] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  return (
    <Cartao className="p-5">
      <h2 className="flex items-center gap-2 font-extrabold text-texto">
        <Mail className="size-5 text-acento" />
        Convidar por e-mail
      </h2>
      <p className="mt-1 text-xs font-semibold text-texto-suave">
        Se a pessoa ainda não tiver conta, o convite fica guardado e aparece para ela assim que
        se cadastrar.
      </p>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          setErro(null)
          setAviso(null)
          convidar.mutate(
            { grupoId, email },
            {
              onSuccess: (resultado) => {
                setEmail('')
                setAviso(
                  resultado === 'ja_membro'
                    ? 'Essa pessoa já está na comunidade.'
                    : // Mensagem idêntica exista ou não a conta: senão o
                      // formulário viraria um confirmador de e-mails.
                      'Convite enviado.',
                )
              },
              onError: (e2: Error) => {
                setErro(e2.message)
              },
            },
          )
        }}
      >
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
          }}
          placeholder="colega@email.com"
          aria-label="E-mail de quem convidar"
          className="h-12 min-w-0 flex-1 rounded-controle border-2 border-borda bg-superficie-2 px-4 font-semibold text-texto outline-none placeholder:text-texto-fraco focus:border-acento"
        />
        <Botao type="submit" disabled={!emailValido(email) || convidar.isPending}>
          {convidar.isPending && <Loader2 className="size-4 animate-spin" />}
          Convidar
        </Botao>
      </form>

      {aviso !== null && (
        <p role="status" className="mt-2 text-sm font-bold text-verde">
          {aviso}
        </p>
      )}
      {erro !== null && (
        <p role="alert" className="mt-2 text-sm font-bold text-vermelho">
          {erro}
        </p>
      )}
    </Cartao>
  )
}

function LinhaMembro({
  membro,
  souEu,
  grupoId,
  usuarioId,
  poderes,
  aoFalhar,
}: {
  membro: MembroDaComunidade
  souEu: boolean
  grupoId: string
  usuarioId: string
  poderes: ReturnType<typeof poderesDe>
  aoFalhar: (e: Error) => void
}) {
  const definirPapel = useDefinirPapel(usuarioId)
  const remover = useRemoverMembro(usuarioId)
  const transferir = useTransferirPropriedade(usuarioId)

  const ehDono = membro.papel === 'dono'

  return (
    <li className="flex items-center gap-3 py-3">
      <span aria-hidden="true" className="text-xl">
        {membro.emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold text-texto">
          {membro.nome}
          {souEu && <span className="ml-1.5 text-xs font-semibold text-texto-fraco">(você)</span>}
        </span>
        {membro.papel !== 'membro' && (
          <span className="text-xs font-bold text-acento">{ROTULO_PAPEL[membro.papel]}</span>
        )}
      </span>

      {poderes.podeDefinirAdmins && !ehDono && !souEu && (
        <button
          type="button"
          aria-label={membro.papel === 'admin' ? 'Tirar admin' : 'Tornar admin'}
          title={membro.papel === 'admin' ? 'Tirar admin' : 'Tornar admin'}
          onClick={() => {
            definirPapel.mutate(
              { grupoId, alvoId: membro.usuarioId, admin: membro.papel !== 'admin' },
              { onError: aoFalhar },
            )
          }}
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-pill transition-colors',
            membro.papel === 'admin'
              ? 'bg-acento-suave text-acento'
              : 'text-texto-fraco hover:bg-superficie-2',
          )}
        >
          <Shield className="size-4" />
        </button>
      )}

      {poderes.podeTransferir && !ehDono && !souEu && (
        <button
          type="button"
          aria-label={`Passar a comunidade para ${membro.nome}`}
          title="Passar a comunidade para esta pessoa"
          onClick={() => {
            transferir.mutate(
              { grupoId, novoDono: membro.usuarioId },
              { onError: aoFalhar },
            )
          }}
          className="grid size-9 shrink-0 place-items-center rounded-pill text-texto-fraco transition-colors hover:bg-acento-suave hover:text-acento"
        >
          👑
        </button>
      )}

      {poderes.podeRemoverOutros && !ehDono && !souEu && (
        <button
          type="button"
          aria-label={`Remover ${membro.nome}`}
          onClick={() => {
            remover.mutate({ grupoId, alvoId: membro.usuarioId }, { onError: aoFalhar })
          }}
          className="grid size-9 shrink-0 place-items-center rounded-pill text-texto-fraco transition-colors hover:bg-vermelho-suave hover:text-vermelho"
        >
          <UserMinus className="size-4" />
        </button>
      )}
    </li>
  )
}
