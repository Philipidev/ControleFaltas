import { LogOut } from 'lucide-react'

import { ResetSemestre } from './ResetSemestre.tsx'
import { SeletorTema } from '@/components/SeletorTema.tsx'
import { Botao } from '@/components/ui/Botao.tsx'
import { Cartao } from '@/components/ui/Cartao.tsx'
import { useConfiguracoes, usePerfil, useSalvarConfiguracoes } from '@/data/queries.ts'
import { formatarPercentual } from '@/domain/risco.ts'
import { useSessao, useUsuarioId } from '@/features/auth/contexto.ts'
import { Cabecalho, Esqueleto } from '@/layout/pecas.tsx'
import { useTema } from '@/theme/contexto.ts'

/**
 * §4, §7.1, §7.5 — o que a spec marca como configurável.
 *
 * As faixas do semáforo entram aqui porque a própria spec chama a tabela de
 * "sugestão de faixas"; a regra de faltas justificadas entra porque ela diz
 * que isso "depende da regra oficial do curso".
 */
export function TelaConfiguracoes() {
  const usuarioId = useUsuarioId()
  const { sair } = useSessao()
  const perfil = usePerfil(usuarioId)
  const config = useConfiguracoes(usuarioId)
  const salvar = useSalvarConfiguracoes(usuarioId)
  const { densidade, definirDensidade } = useTema()

  if (config.isPending || perfil.isPending) return <Esqueleto />

  const c = config.data

  return (
    <>
      <Cabecalho titulo="Ajustes" subtitulo={perfil.data?.nome ?? ''} />

      <main className="mx-auto max-w-2xl space-y-5 px-5 pt-5 pb-28 lg:pb-10">
        <Cartao className="p-5">
          <SeletorTema />

          <fieldset className="mt-5 border-t border-borda pt-5">
            <legend className="sr-only">Densidade</legend>
            <p className="mb-2.5 text-sm font-extrabold text-texto">Espaçamento</p>
            <div className="flex gap-2">
              {(['confortavel', 'compacta'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    definirDensidade(d)
                  }}
                  aria-pressed={densidade === d}
                  className={`flex-1 rounded-controle border-2 py-2.5 text-xs font-bold transition-colors ${
                    densidade === d
                      ? 'border-acento bg-acento-suave text-acento'
                      : 'border-borda text-texto-suave'
                  }`}
                >
                  {d === 'confortavel' ? 'Confortável' : 'Compacto'}
                </button>
              ))}
            </div>
          </fieldset>
        </Cartao>

        {c !== undefined && (
          <>
            <Cartao className="p-5">
              <h2 className="font-extrabold text-texto">Regra do curso</h2>
              <p className="mt-1 text-xs font-semibold text-texto-suave">
                A spec chama as faixas de "sugestão" e diz que a regra de atestado depende do
                curso — então as duas são suas.
              </p>

              <div className="mt-4 space-y-4">
                <Faixa
                  rotulo="Reprova por falta acima de"
                  valor={c.limite_reprovacao}
                  min={0.1}
                  max={0.5}
                  aoMudar={(v) => {
                    salvar.mutate({ limite_reprovacao: v })
                  }}
                />
                <Faixa
                  rotulo="Verde até"
                  valor={c.faixa_verde}
                  min={0.02}
                  max={c.faixa_amarela - 0.01}
                  aoMudar={(v) => {
                    salvar.mutate({ faixa_verde: v })
                  }}
                />
                <Faixa
                  rotulo="Amarelo até"
                  valor={c.faixa_amarela}
                  min={c.faixa_verde + 0.01}
                  max={c.limite_reprovacao}
                  aoMudar={(v) => {
                    salvar.mutate({ faixa_amarela: v })
                  }}
                />
              </div>
            </Cartao>

            <Cartao className="divide-y divide-borda">
              <Interruptor
                titulo="Falta justificada desconta da carga"
                descricao="Com isto desligado, o atestado tira a falta do cálculo de risco mas ela continua no contador de justificadas."
                ligado={c.justificada_conta}
                aoMudar={(v) => {
                  salvar.mutate({ justificada_conta: v })
                }}
              />
              <Interruptor
                titulo="Atestado quebra o streak"
                descricao="Se ligado, uma falta justificada também zera a sequência de presença."
                ligado={c.justificada_quebra_streak}
                aoMudar={(v) => {
                  salvar.mutate({ justificada_quebra_streak: v })
                }}
              />
            </Cartao>
          </>
        )}

        <ResetSemestre />

        <Botao
          variante="secundario"
          larguraTotal
          iconeInicio={<LogOut className="size-4" />}
          onClick={() => void sair()}
        >
          Sair da conta
        </Botao>
      </main>
    </>
  )
}

function Faixa({
  rotulo,
  valor,
  min,
  max,
  aoMudar,
}: {
  rotulo: string
  valor: number
  min: number
  max: number
  aoMudar: (v: number) => void
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between text-sm font-bold text-texto">
        {rotulo}
        <output className="tabular text-acento">{formatarPercentual(valor, 0)}</output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={0.01}
        value={valor}
        onChange={(e) => {
          aoMudar(Number(e.target.value))
        }}
        className="mt-2 w-full accent-[var(--c-acento)]"
      />
    </label>
  )
}

function Interruptor({
  titulo,
  descricao,
  ligado,
  aoMudar,
}: {
  titulo: string
  descricao: string
  ligado: boolean
  aoMudar: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      onClick={() => {
        aoMudar(!ligado)
      }}
      className="flex w-full items-start gap-4 p-5 text-left"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-extrabold text-texto">{titulo}</span>
        <span className="mt-1 block text-xs font-semibold text-texto-suave">{descricao}</span>
      </span>
      <span
        aria-hidden="true"
        className={`mt-0.5 grid h-7 w-12 shrink-0 items-center rounded-pill p-1 transition-colors ${
          ligado ? 'bg-acento' : 'bg-superficie-2 border border-borda'
        }`}
      >
        <span
          className={`size-5 rounded-full bg-superficie shadow-card transition-transform ${
            ligado ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </span>
    </button>
  )
}
