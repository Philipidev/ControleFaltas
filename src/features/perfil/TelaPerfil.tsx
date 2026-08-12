import { Check, LogOut, Loader2, Shield } from 'lucide-react'
import { useState } from 'react'

import { Botao } from '@/components/ui/Botao.tsx'
import { Cartao } from '@/components/ui/Cartao.tsx'
import { usePerfil, useSalvarPerfil } from '@/data/queries.ts'
import { useSessao, useUsuarioId } from '@/features/auth/contexto.ts'
import { BotaoInstalar } from '@/features/pwa/BotaoInstalar.tsx'
import { Cabecalho, Erro, Esqueleto } from '@/layout/pecas.tsx'
import { cn } from '@/lib/cn.ts'

/** Os mesmos do seletor de comunidade, para o app ter um vocabulário só. */
const EMOJIS = [
  '🎓', '🩺', '🧬', '⚖️', '💻', '🔬',
  '📐', '🎨', '🏛️', '🌱', '🦉', '🐙',
  '🦊', '🐢', '🦩', '🐝', '🦅', '🐳',
] as const

/**
 * Perfil — quem eu sou dentro do app.
 *
 * Curso, período e turma não são enfeite de cadastro: são eles que decidem
 * quais disciplinas o catálogo oferece (§2) e o que já vem preenchido ao
 * criar uma comunidade. Por isso ficam aqui, editáveis, e não escondidos num
 * onboarding que roda uma vez só.
 *
 * O botão de sair também mora aqui. Antes ele só existia no fim de Ajustes —
 * é o lugar onde ninguém procura por ele.
 */
export function TelaPerfil() {
  const usuarioId = useUsuarioId()
  const { sessao, sair } = useSessao()
  const perfil = usePerfil(usuarioId)
  const salvar = useSalvarPerfil(usuarioId)

  if (perfil.error !== null) return <Erro erro={perfil.error} />
  if (perfil.isPending) return <Esqueleto />

  return (
    <>
      <Cabecalho titulo="Perfil" subtitulo={sessao?.user.email ?? ''} />
      <main className="mx-auto max-w-2xl space-y-4 px-5 pt-5 pb-28 lg:pb-10">
        <Formulario
          key={perfil.dataUpdatedAt}
          inicial={perfil.data}
          email={sessao?.user.email ?? ''}
          ehAdmin={perfil.data.role === 'admin'}
          salvando={salvar.isPending}
          erro={salvar.error}
          aoSalvar={(novo) => {
            salvar.mutate(novo)
          }}
        />

        {/* Some sozinho quando já está instalado — quem chegou aqui pelo app
            na tela de início não precisa ver um convite para instalá-lo. */}
        <BotaoInstalar />

        <div>
          <Botao
            variante="secundario"
            larguraTotal
            iconeInicio={<LogOut className="size-4" />}
            onClick={() => void sair()}
          >
            Sair da conta
          </Botao>
          <p className="mt-2 px-1 text-center text-xs font-semibold text-texto-fraco">
            Suas faltas continuam salvas. Entrar de novo com {sessao?.user.email ?? 'este e-mail'}{' '}
            traz tudo de volta.
          </p>
        </div>
      </main>
    </>
  )
}

interface Editavel {
  readonly nome: string
  readonly emoji: string
  readonly curso: string | null
  readonly periodo: string | null
  readonly turma: string | null
}

/**
 * O formulário é um componente à parte com `key={dataUpdatedAt}` no pai: assim
 * ele remonta quando o servidor devolve dados novos, em vez de o estado local
 * ficar preso ao primeiro valor carregado. Sem isso, salvar em outra aba
 * deixaria este formulário mostrando o texto antigo para sempre.
 */
function Formulario({
  inicial,
  email,
  ehAdmin,
  salvando,
  erro,
  aoSalvar,
}: {
  inicial: Editavel
  email: string
  ehAdmin: boolean
  salvando: boolean
  erro: Error | null
  aoSalvar: (novo: Editavel) => void
}) {
  const [nome, setNome] = useState(inicial.nome)
  const [emoji, setEmoji] = useState(inicial.emoji)
  const [curso, setCurso] = useState(inicial.curso ?? '')
  const [periodo, setPeriodo] = useState(inicial.periodo ?? '')
  const [turma, setTurma] = useState(inicial.turma ?? '')

  const mudou =
    nome !== inicial.nome ||
    emoji !== inicial.emoji ||
    curso !== (inicial.curso ?? '') ||
    periodo !== (inicial.periodo ?? '') ||
    turma !== (inicial.turma ?? '')

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        aoSalvar({ nome, emoji, curso, periodo, turma })
      }}
    >
      <Cartao className="p-5">
        <div className="flex items-center gap-4">
          <span aria-hidden="true" className="grid size-16 shrink-0 place-items-center rounded-pill bg-superficie-2 text-4xl">
            {emoji}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-extrabold text-texto">
              {nome.trim() === '' ? 'Sem nome' : nome}
            </p>
            <p className="truncate text-sm font-semibold text-texto-suave">{email}</p>
            {ehAdmin && (
              <p className="mt-1 flex items-center gap-1 text-xs font-bold text-acento">
                <Shield className="size-3.5" />
                Administra o catálogo
              </p>
            )}
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <Campo id="p-nome" rotulo="Nome" valor={nome} aoMudar={setNome} dica="Como a turma te chama" />

          <div>
            <span className="mb-1.5 block text-sm font-extrabold text-texto">Ícone</span>
            <div className="flex flex-wrap gap-2">
              {/* O emoji atual entra na frente quando não é um dos oferecidos
                  — o seed usa outros, e sem isto o perfil mostrava um avatar
                  que nenhum botão da grade aparecia selecionado, como se o
                  valor salvo não existisse. */}
              {[...(EMOJIS.includes(emoji as (typeof EMOJIS)[number]) ? [] : [emoji]), ...EMOJIS].map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => {
                    setEmoji(e)
                  }}
                  aria-label={`Usar ${e}`}
                  aria-pressed={e === emoji}
                  className={cn(
                    'grid size-11 place-items-center rounded-pill border-2 text-xl transition-colors',
                    e === emoji ? 'border-acento bg-acento-suave' : 'border-borda',
                  )}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Campo id="p-curso" rotulo="Curso" valor={curso} aoMudar={setCurso} dica="Medicina" />
            <Campo id="p-per" rotulo="Período" valor={periodo} aoMudar={setPeriodo} dica="5º período" />
          </div>
          <Campo id="p-turma" rotulo="Turma" valor={turma} aoMudar={setTurma} dica="A" />

          <p className="text-xs font-semibold text-texto-suave">
            Curso e período decidem quais disciplinas o catálogo te oferece e já vêm preenchidos
            quando você cria uma turma.
          </p>
        </div>

        {erro !== null && (
          <p role="alert" className="mt-3 rounded-interno bg-vermelho-suave px-3 py-2.5 text-sm font-bold text-vermelho">
            {erro.message}
          </p>
        )}

        <Botao
          type="submit"
          className="mt-5"
          larguraTotal
          disabled={!mudou || salvando || nome.trim() === ''}
          iconeInicio={salvando ? undefined : <Check className="size-4" />}
        >
          {salvando && <Loader2 className="size-4 animate-spin" />}
          {mudou ? 'Salvar' : 'Tudo salvo'}
        </Botao>
      </Cartao>
    </form>
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
