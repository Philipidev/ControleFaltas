import { ChevronRight, CircleHelp, LogOut } from 'lucide-react'
import type { CSSProperties } from 'react'
import { Link } from 'react-router'

import { DiagnosticoViewport } from './DiagnosticoViewport.tsx'
import { SeletorTema } from '@/components/SeletorTema.tsx'
import { Botao } from '@/components/ui/Botao.tsx'
import { Cartao } from '@/components/ui/Cartao.tsx'
import { useConfiguracoes, usePerfil, useSalvarConfiguracoes } from '@/data/queries.ts'
import { useContextoDaRegra } from '@/data/regra.ts'
import { ROTULO_NIVEL } from '@/domain/limites.ts'
import { formatarPercentual } from '@/domain/risco.ts'
import { useSessao, useUsuarioId } from '@/features/auth/contexto.ts'
import { Cabecalho, Esqueleto } from '@/layout/pecas.tsx'
import { useTema } from '@/theme/contexto.ts'

/**
 * §4 e §7.5 — o que sobrou de configurável.
 *
 * As faixas do semáforo entram aqui porque a própria spec chama a tabela de
 * "sugestão de faixas". A §7.1 tinha um interruptor nesta tela — "falta
 * justificada desconta da carga" —, e ele foi embora com a 0015: o atestado
 * não desconta, e não há o que ajustar. O que ficou da §7.5 é o streak, que é
 * pessoal por definição.
 */
export function TelaConfiguracoes() {
  const usuarioId = useUsuarioId()
  const { sair } = useSessao()
  const perfil = usePerfil(usuarioId)
  const config = useConfiguracoes(usuarioId)
  const salvar = useSalvarConfiguracoes(usuarioId)
  const contexto = useContextoDaRegra(usuarioId)
  const { densidade, definirDensidade } = useTema()

  if (config.isPending || perfil.isPending || contexto.carregando) return <Esqueleto />

  const c = config.data
  const regra = contexto.geral
  const daTurma = regra.limiteTravado
  const nomeDaTurma = contexto.nomeDaTurma(null)

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
                {daTurma
                  ? `Quem administra ${nomeDaTurma ?? 'a sua turma'} respondeu por ela. Aqui você só vê.`
                  : 'Enquanto a sua turma não define, vale o que você ajustar aqui.'}
              </p>

              <div className="mt-4 space-y-4">
                {regra.limiteTravado ? (
                  <Definido
                    rotulo="Reprova por falta acima de"
                    valor={regra.limites.limiteReprovacao}
                    origem={ROTULO_NIVEL[regra.origem.limiteReprovacao]}
                  />
                ) : (
                  <Faixa
                    rotulo="Reprova por falta acima de"
                    valor={c.limite_reprovacao}
                    min={0.1}
                    max={0.5}
                    aoMudar={(v) => {
                      salvar.mutate({ limite_reprovacao: v })
                    }}
                  />
                )}

                {/*
                  Alerta é de quem olha, e o controle continua aqui mesmo com a
                  turma definindo — só que o teto vira o dela. Quem quer ser
                  avisado antes desce o controle; para cima, não passa.
                */}
                <Faixa
                  rotulo="Verde até"
                  valor={Math.min(c.faixa_verde, regra.limites.faixaVerde)}
                  min={0.02}
                  max={Math.min(c.faixa_amarela - 0.01, regra.tetoDoAlerta.verde ?? 1)}
                  aoMudar={(v) => {
                    salvar.mutate({ faixa_verde: v })
                  }}
                  nota={
                    regra.tetoDoAlerta.verde === null
                      ? undefined
                      : `Sua turma avisa em ${formatarPercentual(regra.tetoDoAlerta.verde, 0)}. Dá para ser avisado antes, não depois.`
                  }
                />
                <Faixa
                  rotulo="Amarelo até"
                  valor={Math.min(c.faixa_amarela, regra.limites.faixaAmarela)}
                  min={c.faixa_verde + 0.01}
                  max={Math.min(
                    regra.limites.limiteReprovacao,
                    regra.tetoDoAlerta.amarela ?? 1,
                  )}
                  aoMudar={(v) => {
                    salvar.mutate({ faixa_amarela: v })
                  }}
                />
              </div>
            </Cartao>

            {/*
              Sobrou um interruptor sobre atestado, e é de propósito: ele fala
              da SUA sequência, não do limite da turma. O outro que morava aqui
              — "falta justificada desconta da carga" — decidia se o atestado
              saía do cálculo de risco, e virou resposta fixa: não sai.
            */}
            <Cartao>
              <Interruptor
                titulo="Atestado quebra o streak"
                descricao="Se ligado, uma falta com atestado também zera a sequência de presença. É a sua sequência: nenhuma turma decide por você."
                ligado={c.justificada_quebra_streak}
                aoMudar={(v) => {
                  salvar.mutate({ justificada_quebra_streak: v })
                }}
              />
            </Cartao>
          </>
        )}

        {/* Antes do diagnóstico e do sair: quem abre Ajustes procurando "como
            isso funciona" precisa achar antes de desistir. */}
        <Link
          to="/ajuda"
          className="flex items-center gap-3 rounded-card border border-borda bg-superficie p-5 shadow-card transition-colors hover:border-acento"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-pill bg-acento-suave">
            <CircleHelp className="size-5 text-acento" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-extrabold text-texto">Como funciona</span>
            <span className="block text-xs font-semibold text-texto-suave">
              O manual: como a falta é contada, de onde vem o limite, o que a turma decide e
              quem enxerga os seus números.
            </span>
          </span>
          <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-texto-fraco" />
        </Link>

        <DiagnosticoViewport />

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

/**
 * Um número que veio de cima na cascata.
 *
 * Some o controle e aparece quem decidiu. Deixar o controle desabilitado seria
 * pior: um controle cinza convida a arrastar e não explica por que não anda.
 */
function Definido({
  rotulo,
  valor,
  texto,
  origem,
}: {
  rotulo: string
  valor?: number
  texto?: string
  origem: string
}) {
  return (
    <div>
      <p className="flex items-baseline justify-between gap-3 text-sm font-bold text-texto">
        {rotulo}
        <output className="tabular shrink-0 font-extrabold text-acento">
          {valor === undefined ? texto : formatarPercentual(valor, 0)}
        </output>
      </p>
      <p className="mt-1 text-xs font-semibold text-texto-fraco">{origem}</p>
    </div>
  )
}

function Faixa({
  rotulo,
  valor,
  min,
  max,
  aoMudar,
  nota,
}: {
  rotulo: string
  valor: number
  min: number
  max: number
  aoMudar: (v: number) => void
  nota?: string | undefined
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between text-sm font-bold text-texto">
        {rotulo}
        <output className="tabular text-acento">{formatarPercentual(valor, 0)}</output>
      </span>
      {nota !== undefined && (
        <span className="mt-0.5 block text-xs font-semibold text-texto-fraco">{nota}</span>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={0.01}
        value={valor}
        onChange={(e) => {
          aoMudar(Number(e.target.value))
        }}
        // --preenchido diz ao CSS onde termina a parte percorrida. Sem isto o
        // gradiente não teria como saber a posição — o valor só existe aqui.
        style={{ '--preenchido': `${String(((valor - min) / (max - min)) * 100)}%` } as CSSProperties}
        className="controle-faixa mt-2"
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
