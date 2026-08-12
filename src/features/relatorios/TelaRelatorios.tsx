import { Archive, Download, FileText } from 'lucide-react'
import { useState } from 'react'

import { ChipStatus } from '@/components/ChipStatus.tsx'
import { Medidor } from '@/components/Medidor.tsx'
import { Botao } from '@/components/ui/Botao.tsx'
import { Cartao } from '@/components/ui/Cartao.tsx'
import { useFaltas, usePerfil } from '@/data/queries.ts'
import { formatarHoras, formatarPercentual } from '@/domain/risco.ts'
import { useUsuarioId } from '@/features/auth/contexto.ts'
import { usePainel } from '@/features/dashboard/usePainel.ts'
import { Cabecalho, Erro, Esqueleto, Vazio } from '@/layout/pecas.tsx'

/**
 * §7.6 — exportar relatório e fazer backup dos dados.
 *
 * O reset de semestre não apaga: arquiva. "Zera os dados mas mantém histórico"
 * só faz sentido se o histórico continuar recuperável, então o backup em JSON
 * vem antes do botão de zerar, e não depois.
 */
export function TelaRelatorios() {
  const usuarioId = useUsuarioId()
  const painel = usePainel(usuarioId)
  const perfil = usePerfil(usuarioId)
  const faltas = useFaltas(usuarioId)
  const [gerando, setGerando] = useState(false)

  if (painel.erro !== null) return <Erro erro={painel.erro} />
  if (painel.carregando) return <Esqueleto />

  if (painel.cartoes.length === 0) {
    return (
      <>
        <Cabecalho titulo="Relatórios" />
        <main className="mx-auto max-w-2xl px-5 pt-5 pb-28">
          <Vazio
            emoji="📄"
            titulo="Nada para relatar ainda"
            texto="Escolha suas disciplinas e registre as faltas para gerar o relatório."
          />
        </main>
      </>
    )
  }

  async function baixarPdf() {
    setGerando(true)
    try {
      // Import dinâmico: jsPDF + autotable pesam ~350 KB e só servem a este
      // clique. Carregá-los no bundle inicial faria todo mundo pagar por um
      // recurso que a maioria usa uma vez por semestre.
      const { gerarRelatorioPdf } = await import('./gerarPdf.ts')
      gerarRelatorioPdf({
        nome: perfil.data?.nome ?? 'Estudante',
        curso: perfil.data?.curso ?? '',
        periodo: perfil.data?.periodo ?? '',
        cartoes: painel.cartoes,
        limites: painel.limites,
        hoje: painel.hoje,
      })
    } finally {
      setGerando(false)
    }
  }

  function baixarBackup() {
    const dados = {
      exportadoEm: new Date().toISOString(),
      perfil: {
        nome: perfil.data?.nome,
        curso: perfil.data?.curso,
        periodo: perfil.data?.periodo,
        turma: perfil.data?.turma,
      },
      disciplinas: painel.cartoes.map((c) => ({
        id: c.disciplina.id,
        nome: c.disciplina.nome,
        cargaHorariaTotal: c.disciplina.cargaHorariaTotal,
        grade: c.disciplina.grade,
        totalFaltado: c.risco.totalFaltado,
        percentual: c.risco.percentual,
        status: c.risco.status,
      })),
      faltas: faltas.data ?? [],
    }

    const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `controle-faltas-${painel.hoje}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const totalCarga = painel.cartoes.reduce((s, c) => s + c.disciplina.cargaHorariaTotal, 0)

  return (
    <>
      <Cabecalho titulo="Relatórios" subtitulo="Frequência do semestre" />

      <main className="mx-auto max-w-2xl space-y-4 px-5 pt-5 pb-28 lg:pb-10">
        <Cartao className="p-5">
          <p className="text-xs font-bold text-texto-fraco">Frequência geral</p>
          <p className="figura-hero mt-1.5 text-4xl text-texto">
            {formatarPercentual(1 - painel.geral.percentual)}
          </p>
          <p className="mt-1 text-sm font-semibold text-texto-suave">
            {formatarHoras(painel.geral.totalFaltado)} perdidas de{' '}
            {formatarHoras(totalCarga)} no semestre
          </p>
        </Cartao>

        <Cartao className="p-5">
          <h2 className="mb-4 font-extrabold text-texto">Por disciplina</h2>
          <ul className="space-y-4">
            {painel.cartoes.map((c) => (
              <li key={c.disciplina.id}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-texto">
                    {c.disciplina.nome}
                  </span>
                  <span className="tabular shrink-0 text-sm font-extrabold text-texto">
                    {formatarPercentual(c.risco.percentual)}
                  </span>
                  <ChipStatus status={c.risco.status} tamanho="sm" />
                </div>
                <Medidor
                  className="mt-2"
                  percentual={c.risco.percentual}
                  status={c.risco.status}
                  limites={painel.limites}
                  altura="fina"
                  rotulo={`Faltas em ${c.disciplina.nome}`}
                />
                <p className="mt-1 text-xs font-semibold text-texto-fraco tabular">
                  {formatarHoras(c.risco.totalFaltado)} de{' '}
                  {formatarHoras(c.disciplina.cargaHorariaTotal)}
                  {c.risco.totalJustificado > 0 &&
                    ` · ${formatarHoras(c.risco.totalJustificado)} justificadas`}
                </p>
              </li>
            ))}
          </ul>
        </Cartao>

        <div className="space-y-3">
          <Botao
            larguraTotal
            tamanho="lg"
            iconeInicio={<FileText className="size-5" />}
            onClick={() => void baixarPdf()}
            disabled={gerando}
          >
            {gerando ? 'Gerando…' : 'Exportar PDF de frequência'}
          </Botao>

          <Botao
            variante="secundario"
            larguraTotal
            iconeInicio={<Download className="size-4" />}
            onClick={baixarBackup}
          >
            Baixar backup dos meus dados (JSON)
          </Botao>
        </div>

        <Cartao className="flex gap-3 p-4">
          <Archive className="size-5 shrink-0 text-texto-fraco" />
          <p className="text-xs font-semibold text-texto-suave">
            O PDF sai em preto e branco com a situação escrita por extenso — o semáforo
            colorido é ótimo na tela e inútil numa impressão. Ele traz carga horária e horas
            perdidas, os números que a coordenação consegue conferir contra o diário.
          </p>
        </Cartao>
      </main>
    </>
  )
}
