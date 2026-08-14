import { CalendarPlus } from 'lucide-react'
import { useState } from 'react'

import { FolhaExportarCalendario } from './FolhaExportarCalendario.tsx'
import { CalendarioMes } from '@/components/CalendarioMes.tsx'
import { Cartao } from '@/components/ui/Cartao.tsx'
import { useFaltas } from '@/data/queries.ts'
import { formatarBR, hojeISO, primeiroDiaDoMes } from '@/domain/data.ts'
import { formatarHoras } from '@/domain/risco.ts'
import { useUsuarioId } from '@/features/auth/contexto.ts'
import { usePainel } from '@/features/dashboard/usePainel.ts'
import { FolhaMarcarFalta } from '@/features/faltas/FolhaMarcarFalta.tsx'
import { Cabecalho, Erro, Esqueleto, Vazio } from '@/layout/pecas.tsx'

/** §7.6 — calendário visual do mês, com as faltas coloridas por matéria. */
export function TelaCalendario() {
  const usuarioId = useUsuarioId()
  const painel = usePainel(usuarioId)
  const faltas = useFaltas(usuarioId)
  const hoje = hojeISO()

  const [mes, setMes] = useState(() => primeiroDiaDoMes(hoje))
  const [diaEscolhido, setDiaEscolhido] = useState<string | null>(null)
  const [exportando, setExportando] = useState(false)

  if (painel.erro !== null) return <Erro erro={painel.erro} />
  if (painel.carregando) return <Esqueleto />

  const disciplinas = painel.cartoes.map((c) => c.disciplina)
  const lista = faltas.data ?? []

  if (disciplinas.length === 0) {
    return (
      <>
        <Cabecalho titulo="Calendário" />
        <main className="mx-auto max-w-2xl px-5 pt-5 pb-28">
          <Vazio
            emoji="🗓️"
            titulo="Nada para mostrar ainda"
            texto="Escolha suas disciplinas para o calendário saber quais dias têm aula."
          />
        </main>
      </>
    )
  }

  const doDia = diaEscolhido === null ? [] : lista.filter((f) => f.data === diaEscolhido)

  return (
    <>
      <Cabecalho
        titulo="Calendário"
        subtitulo="Toque num dia para marcar falta"
        acao={
          <button
            type="button"
            onClick={() => {
              setExportando(true)
            }}
            aria-label="Adicionar ao calendário do celular"
            title="Adicionar ao calendário do celular"
            className="grid size-9 place-items-center rounded-pill bg-superficie-2 text-texto-suave"
          >
            <CalendarPlus className="size-5" />
          </button>
        }
      />

      <main className="mx-auto max-w-2xl space-y-4 px-5 pt-5 pb-28 lg:pb-10">
        <Cartao className="p-4">
          <CalendarioMes
            mesDe={mes}
            disciplinas={disciplinas}
            faltas={lista}
            hoje={hoje}
            aoMudarMes={setMes}
            aoTocarDia={setDiaEscolhido}
          />
        </Cartao>

        {/* Legenda: identidade nunca só por cor — o nome vem junto */}
        <Cartao className="p-4">
          <p className="mb-2.5 text-xs font-bold text-texto-fraco">Matérias</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-2">
            {disciplinas.map((d) => (
              <li key={d.id} className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: d.cor }}
                />
                <span className="text-xs font-bold text-texto-suave">{d.nome}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-texto-fraco">
            <span aria-hidden="true" className="size-2.5 rounded-full bg-texto-fraco opacity-45" />
            Ponto esmaecido = falta com atestado
          </p>
        </Cartao>
      </main>

      {/* Tocar num dia abre a folha já com a data preenchida. Se o dia já tem
          faltas, mostramos quais antes de oferecer marcar outra. */}
      {diaEscolhido !== null && doDia.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label="Fechar"
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => {
              setDiaEscolhido(null)
            }}
          />
          <div className="area-segura-base relative w-full max-w-md rounded-t-card bg-superficie p-6 shadow-flutuante sm:rounded-card">
            <h2 className="font-extrabold text-texto">{formatarBR(diaEscolhido)}</h2>
            <ul className="mt-4 divide-y divide-borda">
              {doDia.map((f) => {
                const d = disciplinas.find((x) => x.id === f.disciplinaId)
                return (
                  <li key={f.id} className="flex items-center gap-3 py-3">
                    <span
                      aria-hidden="true"
                      className="size-3 shrink-0 rounded-full"
                      style={{ backgroundColor: d?.cor ?? 'var(--c-texto-fraco)' }}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-texto">
                      {d?.nome ?? 'Disciplina removida'}
                    </span>
                    {/* Acento, não verde: ver a mesma etiqueta em TelaDisciplina. */}
                    {f.justificada && (
                      <span className="rounded-pill bg-acento-suave px-2 py-0.5 text-[0.6875rem] font-bold text-acento">
                        atestado
                      </span>
                    )}
                    <span className="tabular text-sm font-extrabold text-texto-suave">
                      {formatarHoras(f.horasPerdidas)}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      )}

      {diaEscolhido !== null && doDia.length === 0 && (
        <FolhaMarcarFalta
          cartoes={painel.cartoes}
          usuarioId={usuarioId}
          dataInicial={diaEscolhido}
          aoFechar={() => {
            setDiaEscolhido(null)
          }}
        />
      )}

      {exportando && (
        <FolhaExportarCalendario
          disciplinas={disciplinas}
          aoFechar={() => {
            setExportando(false)
          }}
        />
      )}
    </>
  )
}
