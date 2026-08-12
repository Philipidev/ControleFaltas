import { ArrowLeft, Loader2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { CartaoComunidade } from './CartaoComunidade.tsx'
import { Botao } from '@/components/ui/Botao.tsx'
import { Cartao } from '@/components/ui/Cartao.tsx'
import { useCatalogo, useCriarComunidade, useSolicitarAcesso } from '@/data/comunidades.ts'
import { usePerfil } from '@/data/queries.ts'
import {
  DESCRICAO_VISIBILIDADE,
  EMOJI_VISIBILIDADE,
  parecidas,
  ROTULO_VISIBILIDADE,
  type Visibilidade,
} from '@/domain/comunidades.ts'
import { useUsuarioId } from '@/features/auth/contexto.ts'
import { cn } from '@/lib/cn.ts'

const EMOJIS = ['🎓', '🩺', '🧬', '⚖️', '💻', '🔬', '📐', '🎨', '🏛️', '🌱'] as const
const VISIBILIDADES: readonly Visibilidade[] = ['fechada', 'publica', 'secreta']

/**
 * Criação de comunidade, com aviso de duplicata enquanto a pessoa digita.
 *
 * O aviso não é enfeite: sem ele o catálogo vira cinco "Medicina 1 UNISA" com
 * oito pessoas cada, e o ranking — que é o motivo de a turma se juntar —
 * perde a graça. Por isso ele aparece ANTES do botão de criar, com a opção de
 * entrar na que já existe.
 */
export function TelaNovaComunidade() {
  const usuarioId = useUsuarioId()
  const perfil = usePerfil(usuarioId)
  const navegar = useNavigate()

  const criar = useCriarComunidade(usuarioId)
  const solicitar = useSolicitarAcesso(usuarioId)

  const [nome, setNome] = useState('')
  const [instituicao, setInstituicao] = useState('')
  const [curso, setCurso] = useState('')
  const [periodo, setPeriodo] = useState('')
  const [turma, setTurma] = useState('')
  const [descricao, setDescricao] = useState('')
  const [emoji, setEmoji] = useState<string>(EMOJIS[0])
  const [visibilidade, setVisibilidade] = useState<Visibilidade>('fechada')
  const [erro, setErro] = useState<string | null>(null)

  // Preenche curso/período com o do perfil na primeira renderização útil.
  const [preencheu, setPreencheu] = useState(false)
  if (!preencheu && perfil.data !== undefined) {
    setCurso(perfil.data.curso ?? '')
    setPeriodo(perfil.data.periodo ?? '')
    setTurma(perfil.data.turma ?? '')
    setPreencheu(true)
  }

  // Busca ampla (termo vazio) e compara no cliente: a lista é pequena e assim
  // o aviso responde a cada tecla sem uma ida ao servidor por caractere.
  const catalogo = useCatalogo('')
  const semelhantes = useMemo(
    () => parecidas(nome, catalogo.data ?? [], 1).slice(0, 3),
    [nome, catalogo.data],
  )

  const valido = nome.trim().length >= 3

  async function enviar() {
    setErro(null)
    try {
      const id = await criar.mutateAsync({
        nome: nome.trim(),
        visibilidade,
        instituicao: instituicao.trim() || null,
        curso: curso.trim() || null,
        periodo: periodo.trim() || null,
        turma: turma.trim() || null,
        descricao: descricao.trim() || null,
        emoji,
      })
      await navegar(`/comunidades/${id}`)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui criar.')
    }
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
          <h1 className="text-lg font-extrabold text-texto">Nova comunidade</h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 pt-5 pb-28 lg:pb-10">
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault()
            void enviar()
          }}
        >
          <Cartao className="space-y-4 p-5">
            <div>
              <label htmlFor="c-nome" className="mb-1.5 block text-sm font-extrabold text-texto">
                Nome
              </label>
              <input
                id="c-nome"
                value={nome}
                onChange={(e) => {
                  setNome(e.target.value)
                }}
                placeholder="Medicina 1º período"
                className="h-12 w-full rounded-controle border-2 border-borda bg-superficie-2 px-4 font-semibold text-texto outline-none placeholder:text-texto-fraco focus:border-acento"
              />
            </div>

            {/* Aviso de duplicata — antes do botão, não depois */}
            {semelhantes.length > 0 && (
              <div className="rounded-interno bg-amarelo-suave p-4">
                <p className="text-sm font-extrabold text-amarelo">
                  {semelhantes.length === 1
                    ? 'Já existe uma parecida'
                    : `Já existem ${String(semelhantes.length)} parecidas`}
                </p>
                <p className="mt-1 text-xs font-semibold text-amarelo">
                  Entrar na que já existe mantém a turma junta — é o que faz o ranking valer.
                </p>
                <div className="mt-3 space-y-2">
                  {semelhantes.map((c) => (
                    <CartaoComunidade
                      key={c.id}
                      dados={c}
                      acao={
                        <Botao
                          tamanho="sm"
                          onClick={() => {
                            solicitar.mutate(
                              { grupoId: c.id },
                              { onSuccess: () => void navegar(`/comunidades/${c.id}`) },
                            )
                          }}
                        >
                          Entrar nesta
                        </Botao>
                      }
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Campo id="c-inst" rotulo="Instituição" valor={instituicao} aoMudar={setInstituicao} dica="UNISA" />
              <Campo id="c-curso" rotulo="Curso" valor={curso} aoMudar={setCurso} dica="Medicina" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Campo id="c-per" rotulo="Período" valor={periodo} aoMudar={setPeriodo} dica="1º período" />
              <Campo id="c-turma" rotulo="Turma" valor={turma} aoMudar={setTurma} dica="A" />
            </div>

            <p className="text-xs font-semibold text-texto-fraco">
              Curso e período não são enfeite: quem entrar tem as disciplinas desse
              curso/período vinculadas automaticamente, e é isso que faz o ranking funcionar.
            </p>

            <div>
              <label htmlFor="c-desc" className="mb-1.5 block text-sm font-extrabold text-texto">
                Descrição
              </label>
              <textarea
                id="c-desc"
                value={descricao}
                onChange={(e) => {
                  setDescricao(e.target.value)
                }}
                rows={2}
                placeholder="Opcional"
                className="w-full rounded-controle border-2 border-borda bg-superficie-2 p-3 font-semibold text-texto outline-none placeholder:text-texto-fraco focus:border-acento"
              />
            </div>
          </Cartao>

          <Cartao className="p-5">
            <fieldset>
              <legend className="mb-2 text-sm font-extrabold text-texto">Ícone</legend>
              <div className="flex flex-wrap gap-2">
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    aria-label={`Ícone ${e}`}
                    aria-pressed={emoji === e}
                    onClick={() => {
                      setEmoji(e)
                    }}
                    className={cn(
                      'grid size-11 place-items-center rounded-interno border-2 text-xl transition-colors',
                      emoji === e ? 'border-acento bg-acento-suave' : 'border-borda',
                    )}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </fieldset>
          </Cartao>

          <Cartao className="p-5">
            <fieldset>
              <legend className="mb-2.5 text-sm font-extrabold text-texto">Quem pode entrar</legend>
              <div className="space-y-2">
                {VISIBILIDADES.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => {
                      setVisibilidade(v)
                    }}
                    aria-pressed={visibilidade === v}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-controle border-2 p-3.5 text-left transition-colors',
                      visibilidade === v ? 'border-acento bg-acento-suave' : 'border-borda',
                    )}
                  >
                    <span aria-hidden="true" className="text-lg">
                      {EMOJI_VISIBILIDADE[v]}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-extrabold text-texto">
                        {ROTULO_VISIBILIDADE[v]}
                      </span>
                      <span className="mt-0.5 block text-xs font-semibold text-texto-suave">
                        {DESCRICAO_VISIBILIDADE[v]}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>
          </Cartao>

          {erro !== null && (
            <p
              role="alert"
              className="rounded-interno bg-vermelho-suave px-3 py-2.5 text-sm font-bold text-vermelho"
            >
              {erro}
            </p>
          )}

          <Botao type="submit" larguraTotal tamanho="lg" disabled={!valido || criar.isPending}>
            {criar.isPending && <Loader2 className="size-5 animate-spin" />}
            Criar e virar dono
          </Botao>
        </form>
      </main>
    </>
  )
}

function Campo({
  id,
  rotulo,
  valor,
  aoMudar,
  dica,
}: {
  id: string
  rotulo: string
  valor: string
  aoMudar: (v: string) => void
  dica?: string
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-extrabold text-texto">
        {rotulo}
      </label>
      <input
        id={id}
        value={valor}
        onChange={(e) => {
          aoMudar(e.target.value)
        }}
        placeholder={dica}
        className="h-12 w-full rounded-controle border-2 border-borda bg-superficie-2 px-4 font-semibold text-texto outline-none placeholder:text-texto-fraco focus:border-acento"
      />
    </div>
  )
}
