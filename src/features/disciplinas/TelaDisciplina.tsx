import { ArrowLeft, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import { Simulador } from './Simulador.tsx'
import { ChipStatus } from '@/components/ChipStatus.tsx'
import { GradeSemanalResumo } from '@/components/GradeSemanalResumo.tsx'
import { Medidor } from '@/components/Medidor.tsx'
import { Botao } from '@/components/ui/Botao.tsx'
import { Cartao } from '@/components/ui/Cartao.tsx'
import { useFaltas } from '@/data/queries.ts'
import { formatarBR, formatarCurto, formatarRelativo } from '@/domain/data.ts'
import { descreverPorTipoDeDia, porTipoDeDia } from '@/domain/diasRestantes.ts'
import {
  DESCRICAO_STATUS,
  formatarHoras,
  formatarPercentual,
  formatarProgressoHoras,
} from '@/domain/risco.ts'
import { useUsuarioId } from '@/features/auth/contexto.ts'
import { usePainel } from '@/features/dashboard/usePainel.ts'
import { FolhaMarcarFalta } from '@/features/faltas/FolhaMarcarFalta.tsx'
import { Erro, Esqueleto, Vazio } from '@/layout/pecas.tsx'

/**
 * §4 e §7.3 — detalhe de uma disciplina: o semáforo com a escala completa,
 * as duas leituras de "quantos dias ainda posso faltar", o simulador e o
 * histórico.
 */
export function TelaDisciplina() {
  const { id = '' } = useParams()
  const usuarioId = useUsuarioId()
  const painel = usePainel(usuarioId)
  const faltas = useFaltas(usuarioId)
  const navegar = useNavigate()
  const [marcando, setMarcando] = useState(false)

  if (painel.erro !== null) return <Erro erro={painel.erro} />
  if (painel.carregando) return <Esqueleto />

  const cartao = painel.cartoes.find((c) => c.disciplina.id === id)
  if (cartao === undefined) {
    return (
      <main className="mx-auto max-w-2xl px-5 pt-24">
        <Vazio
          emoji="🔍"
          titulo="Disciplina não encontrada"
          texto="Ela pode ter sido removida das suas matrículas."
          acao={{ rotulo: 'Voltar ao início', aoClicar: () => void navegar('/') }}
        />
      </main>
    )
  }

  const { disciplina, risco, projecao } = cartao
  const minhas = (faltas.data ?? []).filter((f) => f.disciplinaId === id)
  const porDia = porTipoDeDia(disciplina.grade, risco.horasRestantes)
  const semSaldo = risco.horasRestantes <= 0

  return (
    <>
      <header
        className="area-segura-topo sticky top-0 z-20 border-b border-borda bg-fundo/85 backdrop-blur-xl"
        style={{ ['--cor-materia' as string]: disciplina.cor }}
      >
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-5 py-3">
          <Link
            to="/"
            aria-label="Voltar"
            className="grid size-10 shrink-0 place-items-center rounded-pill bg-superficie-2 text-texto-suave"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-lg font-extrabold text-texto">
            {disciplina.nome}
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-5 pt-5 pb-28 lg:pb-10">
        {/* Semáforo com a escala completa — aqui há espaço para as marcas */}
        <Cartao corMateria={disciplina.cor} className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="figura-hero text-5xl text-texto">
                {formatarPercentual(risco.percentual)}
              </p>
              <p className="mt-1.5 text-sm font-bold text-texto-suave tabular">
                {formatarProgressoHoras(risco.totalFaltado, risco.cargaHorariaTotal)}
              </p>
            </div>
            <ChipStatus status={risco.status} />
          </div>

          <Medidor
            className="mt-5"
            percentual={risco.percentual}
            status={risco.status}
            limites={painel.limites}
            altura="grossa"
            mostrarEscala
            rotulo={`Faltas em ${disciplina.nome}`}
          />

          <p className="mt-5 text-sm font-semibold text-texto-suave">
            {DESCRICAO_STATUS[risco.status]}
          </p>
        </Cartao>

        {/* §4 — as duas leituras de "dias restantes" */}
        <Cartao className="p-5">
          <h2 className="font-extrabold text-texto">Quanto ainda dá para faltar</h2>

          {semSaldo ? (
            <p className="mt-3 rounded-interno bg-vermelho-suave px-3 py-2.5 text-sm font-bold text-vermelho">
              Você já usou todas as {formatarHoras(risco.horasLimite)} permitidas nesta
              disciplina.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              <div className="rounded-interno bg-superficie-2 p-4">
                <p className="text-xs font-bold text-texto-fraco">Pelas próximas aulas</p>
                <p className="mt-1 font-extrabold text-texto">
                  {projecao.aulasQueCabem === 1
                    ? '1 aula'
                    : `${String(projecao.aulasQueCabem)} aulas`}
                  {projecao.ultimaDataSegura !== null && (
                    <span className="font-semibold text-texto-suave">
                      {' '}
                      · até {formatarBR(projecao.ultimaDataSegura)}
                    </span>
                  )}
                </p>
                {projecao.aulas.length > 0 && (
                  <p className="mt-1.5 text-xs font-semibold text-texto-fraco">
                    {projecao.aulas.map((a) => formatarCurto(a.data)).join(' · ')}
                  </p>
                )}
              </div>

              <div className="rounded-interno bg-superficie-2 p-4">
                <p className="text-xs font-bold text-texto-fraco">Por tipo de dia</p>
                <p className="mt-1 font-extrabold text-texto capitalize">
                  {descreverPorTipoDeDia(porDia)}
                </p>
                <p className="mt-1.5 text-xs font-semibold text-texto-fraco">
                  Sobram {formatarHoras(risco.horasRestantes)} de{' '}
                  {formatarHoras(risco.horasLimite)}.
                </p>
              </div>
            </div>
          )}

          <div className="mt-4">
            <p className="mb-2 text-xs font-bold text-texto-fraco">Grade semanal</p>
            <GradeSemanalResumo grade={disciplina.grade} cor={disciplina.cor} />
          </div>
        </Cartao>

        {/* §7.3 */}
        <Simulador disciplina={disciplina} risco={risco} limites={painel.limites} />

        {/* Histórico */}
        <Cartao className="p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-extrabold text-texto">
              Histórico
              <span className="ml-2 text-sm font-semibold text-texto-fraco">
                {minhas.length} {minhas.length === 1 ? 'falta' : 'faltas'}
              </span>
            </h2>
            {risco.qtdJustificadas > 0 && (
              <span className="rounded-pill bg-acento-suave px-2.5 py-1 text-xs font-bold text-acento">
                {risco.qtdJustificadas} com atestado
              </span>
            )}
          </div>

          {minhas.length === 0 ? (
            <p className="mt-4 text-sm font-semibold text-texto-fraco">
              Nenhuma falta registrada. 🎉
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-borda">
              {minhas.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-texto">{formatarBR(f.data)}</p>
                    <p className="text-xs font-semibold text-texto-fraco">
                      {formatarRelativo(f.data, painel.hoje)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {f.justificada && (
                      <span className="rounded-pill bg-verde-suave px-2 py-0.5 text-[0.6875rem] font-bold text-verde">
                        atestado
                      </span>
                    )}
                    <span className="tabular text-sm font-extrabold text-texto-suave">
                      {formatarHoras(f.horasPerdidas)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <Botao
            className="mt-4"
            variante="secundario"
            larguraTotal
            iconeInicio={<Plus className="size-4" />}
            onClick={() => {
              setMarcando(true)
            }}
          >
            Marcar falta nesta disciplina
          </Botao>
        </Cartao>
      </main>

      {marcando && (
        <FolhaMarcarFalta
          cartoes={painel.cartoes}
          limites={painel.limites}
          usuarioId={usuarioId}
          disciplinaInicial={disciplina.id}
          aoFechar={() => {
            setMarcando(false)
          }}
        />
      )}
    </>
  )
}
