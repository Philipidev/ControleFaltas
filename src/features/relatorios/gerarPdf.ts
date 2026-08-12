import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

import { formatarBR } from '@/domain/data.ts'
import { formatarHoras, formatarPercentual, ROTULO_STATUS } from '@/domain/risco.ts'
import type { Limites } from '@/domain/tipos.ts'
import type { CartaoPainel } from '@/features/dashboard/usePainel.ts'

/**
 * §7.6 — "Exportar relatório: PDF com resumo de frequência por disciplina
 * (útil pra mostrar pra coordenação, se precisar)."
 *
 * Por ser um documento que sai do app e vira prova diante de outra pessoa,
 * três decisões:
 *
 * - Preto e branco com uma coluna de texto para o status. O semáforo colorido
 *   é ótimo na tela e inútil numa impressão em preto e branco ou para quem
 *   não distingue verde de vermelho.
 * - Traz a carga horária e as horas perdidas, não só o percentual: é o número
 *   que a coordenação consegue conferir contra o diário de classe.
 * - Carimba a data de emissão. Um relatório de frequência sem data não diz nada.
 */
export function gerarRelatorioPdf({
  nome,
  curso,
  periodo,
  cartoes,
  limites,
  hoje,
}: {
  nome: string
  curso: string
  periodo: string
  cartoes: readonly CartaoPainel[]
  limites: Limites
  hoje: string
}): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const margem = 48

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text('Relatório de frequência', margem, 60)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(90)
  doc.text(
    [
      nome,
      [curso, periodo].filter((s) => s !== '').join(' · '),
      `Emitido em ${formatarBR(hoje)}`,
    ]
      .filter((s) => s !== '')
      .join('   |   '),
    margem,
    78,
  )

  const totalCarga = cartoes.reduce((s, c) => s + c.disciplina.cargaHorariaTotal, 0)
  const totalFaltado = cartoes.reduce((s, c) => s + c.risco.totalFaltado, 0)
  const geral = totalCarga > 0 ? totalFaltado / totalCarga : 0

  doc.setTextColor(0)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text(
    `Frequência geral: ${formatarPercentual(1 - geral)}   ·   Faltas: ${formatarPercentual(geral)} (${formatarHoras(totalFaltado)} de ${formatarHoras(totalCarga)})`,
    margem,
    104,
  )

  autoTable(doc, {
    startY: 122,
    margin: { left: margem, right: margem },
    // A coluna "Limite" existe porque ele deixou de ser um número só: a turma
    // define o dela e uma disciplina de estágio pode exigir mais. Sem a
    // coluna, "12% de faltas" não diz se está perto ou longe do teto.
    head: [['Disciplina', 'Carga', 'Faltas', 'Justif.', '% faltas', 'Limite', 'Situação']],
    body: cartoes.map((c) => [
      c.disciplina.nome,
      formatarHoras(c.disciplina.cargaHorariaTotal),
      formatarHoras(c.risco.totalFaltado),
      formatarHoras(c.risco.totalJustificado),
      formatarPercentual(c.risco.percentual),
      formatarPercentual(c.limites.limiteReprovacao, 0),
      ROTULO_STATUS[c.risco.status],
    ]),
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 6 },
    headStyles: { fillColor: [30, 30, 35], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [246, 246, 248] },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
    },
  })

  const depoisDaTabela =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 300

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(110)
  // Um critério só, ou vários? Afirmar "acima de 25%" num relatório onde uma
  // das linhas usa 10% seria escrever no rodapé o contrário do que a tabela
  // mostra.
  const limitesDistintos = new Set(cartoes.map((c) => c.limites.limiteReprovacao))
  const criterio =
    limitesDistintos.size <= 1
      ? `Critério: reprovação por frequência acima de ${formatarPercentual(limites.limiteReprovacao, 0)} da carga horária.`
      : 'Critério: o limite de faltas varia por disciplina — veja a coluna "Limite".'

  doc.text(
    [
      criterio,
      `Faixas de alerta: até ${formatarPercentual(limites.faixaVerde, 0)} tranquilo; até ${formatarPercentual(limites.faixaAmarela, 0)} atenção; acima disso, risco.`,
      'Documento gerado pelo próprio estudante a partir dos registros que ele mesmo lançou.',
    ],
    margem,
    depoisDaTabela + 24,
  )

  doc.save(`frequencia-${hoje}.pdf`)
}
