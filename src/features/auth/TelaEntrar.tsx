import { Loader2 } from 'lucide-react'
import { useState } from 'react'

import { Botao } from '@/components/ui/Botao.tsx'
import { BotaoInstalar } from '@/features/pwa/BotaoInstalar.tsx'
import { mensagemDeErro, supabase } from '@/lib/supabase.ts'

type Modo = 'entrar' | 'criar'

export function TelaEntrar() {
  const [modo, setModo] = useState<Modo>('entrar')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [nome, setNome] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  async function enviar() {
    setErro(null)
    setAviso(null)
    setEnviando(true)

    try {
      if (modo === 'entrar') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
        if (error !== null) throw error
        // O SessaoProvider escuta onAuthStateChange e troca a rota sozinho.
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: senha,
          // O trigger trg_novo_usuario lê daqui para preencher profiles.nome
          options: { data: { nome } },
        })
        if (error !== null) throw error
        if (data.session === null) {
          setAviso('Conta criada. Confirme o e-mail que enviamos para entrar.')
        }
      }
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-fundo px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid size-16 place-items-center rounded-card bg-acento shadow-[0_5px_0_0_var(--c-acento-labio)]">
            <span className="text-3xl" aria-hidden="true">
              📋
            </span>
          </div>
          <h1 className="text-2xl font-extrabold text-texto">Controle de Faltas</h1>
          <p className="mt-1.5 text-sm font-semibold text-texto-suave">
            Cada falta desconta as horas daquela aula. Sem chute.
          </p>
        </div>

        <div className="cartao p-6">
          <div className="mb-5 flex rounded-controle bg-superficie-2 p-1">
            {(['entrar', 'criar'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setModo(m)
                  setErro(null)
                  setAviso(null)
                }}
                aria-pressed={modo === m}
                className={`flex-1 rounded-[calc(var(--raio-controle)-0.25rem)] py-2.5 text-sm font-extrabold transition-colors ${
                  modo === m
                    ? 'bg-superficie text-texto shadow-card'
                    : 'text-texto-suave hover:text-texto'
                }`}
              >
                {m === 'entrar' ? 'Entrar' : 'Criar conta'}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              void enviar()
            }}
            className="space-y-4"
          >
            {modo === 'criar' && (
              <Campo
                id="nome"
                rotulo="Seu nome"
                tipo="text"
                valor={nome}
                onChange={setNome}
                autoComplete="name"
                obrigatorio
              />
            )}

            <Campo
              id="email"
              rotulo="E-mail"
              tipo="email"
              valor={email}
              onChange={setEmail}
              autoComplete="email"
              obrigatorio
            />

            <Campo
              id="senha"
              rotulo="Senha"
              tipo="password"
              valor={senha}
              onChange={setSenha}
              autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
              obrigatorio
              dica={modo === 'criar' ? 'Mínimo de 6 caracteres.' : undefined}
            />

            {erro !== null && (
              <p
                role="alert"
                className="rounded-interno bg-vermelho-suave px-3 py-2.5 text-sm font-bold text-vermelho"
              >
                {erro}
              </p>
            )}

            {aviso !== null && (
              <p
                role="status"
                className="rounded-interno bg-acento-suave px-3 py-2.5 text-sm font-bold text-acento"
              >
                {aviso}
              </p>
            )}

            <Botao type="submit" larguraTotal tamanho="lg" disabled={enviando}>
              {enviando && <Loader2 className="size-5 animate-spin" />}
              {modo === 'entrar' ? 'Entrar' : 'Criar conta'}
            </Botao>
          </form>
        </div>

        {/* Discreto: quem chega aqui veio para entrar, não para instalar. O
            componente some sozinho se já estiver instalado ou se o navegador
            não tiver caminho de instalação. */}
        <BotaoInstalar variante="discreto" className="mt-5 w-full" />

        <p className="mt-5 text-center text-xs font-semibold text-texto-fraco">
          Suas faltas são só suas. Nem a coordenação, nem os colegas, nem o administrador
          do app conseguem lê-las.
        </p>
      </div>
    </div>
  )
}

function Campo({
  id,
  rotulo,
  tipo,
  valor,
  onChange,
  autoComplete,
  obrigatorio,
  dica,
}: {
  id: string
  rotulo: string
  tipo: 'text' | 'email' | 'password'
  valor: string
  onChange: (v: string) => void
  autoComplete: string
  obrigatorio?: boolean
  // `| undefined` explícito: com exactOptionalPropertyTypes, passar
  // dica={undefined} não é o mesmo que omitir a prop.
  dica?: string | undefined
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-extrabold text-texto">
        {rotulo}
      </label>
      <input
        id={id}
        type={tipo}
        value={valor}
        onChange={(e) => {
          onChange(e.target.value)
        }}
        autoComplete={autoComplete}
        required={obrigatorio ?? false}
        className="h-13 w-full rounded-controle border-2 border-borda bg-superficie-2 px-4 font-semibold text-texto outline-none transition-colors placeholder:text-texto-fraco focus:border-acento"
      />
      {dica !== undefined && (
        <p className="mt-1.5 text-xs font-semibold text-texto-fraco">{dica}</p>
      )}
    </div>
  )
}
