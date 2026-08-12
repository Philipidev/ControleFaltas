import { hojeISO, somarDias } from '@/domain/data.ts'
import { proximasAulas } from '@/domain/diasRestantes.ts'
import type { DiaSemana, Disciplina, Falta } from '@/domain/tipos.ts'

/**
 * Dados de demonstração — espelho de supabase/seed.sql.
 *
 * Enquanto as chaves do Supabase não estão no .env.local, o app roda com isto
 * e fica navegável de ponta a ponta. Quando as chaves entram, src/data/ troca
 * a fonte e nenhuma tela muda.
 *
 * Duas decisões que parecem detalhe e não são:
 *
 * 1. O semestre começa 11 semanas ANTES de hoje, calculado na hora. Uma data
 *    fixa faria o app abrir num semestre recém-começado, sem aulas passadas
 *    suficientes para nenhuma disciplina sair do verde — e o demo perderia
 *    justamente o que precisa mostrar.
 *
 * 2. As faltas são declaradas por DIA DA SEMANA, não por quantidade solta, e
 *    as datas saem de proximasAulas() sobre a grade real. Escrever uma falta
 *    numa sexta para uma disciplina que só tem aula segunda e quarta é
 *    exatamente o erro que o trigger trg_falta_horas recusa no banco; o dado
 *    de demonstração obedece às mesmas regras do dado de verdade.
 */

export const SEMESTRE = '2026.2'

/**
 * Paleta de identidade das matérias (§7.6, "cores por matéria").
 *
 * Nenhuma delas cai nas faixas do semáforo — nada de verde (~145°), âmbar
 * (~90°) ou vermelho (~28°). O motivo apareceu na primeira renderização: uma
 * disciplina com faixa lateral verde exibindo "Passou do limite" em vermelho
 * lê como contradição. Cor de matéria é identidade; cor de status é estado.
 * Os dois canais não podem usar o mesmo vocabulário.
 */
export const CORES_MATERIA = [
  '#6366f1', // índigo
  '#a855f7', // roxo
  '#ec4899', // rosa
  '#0ea5e9', // azul-céu
  '#14b8a6', // turquesa
  '#78716c', // pedra
] as const

/** Segunda-feira ~11 semanas atrás — um semestre em andamento. */
export function inicioSemestre(hoje: string = hojeISO()): string {
  return somarDias(hoje, -77)
}

interface Molde {
  readonly id: string
  readonly nome: string
  readonly cargaHorariaTotal: number
  readonly cor: string
  readonly grade: Disciplina['grade']
  /** Quantas faltas em cada dia da semana — controla as horas com precisão. */
  readonly faltasPorDia: Partial<Record<DiaSemana, number>>
  /** Quantas das faltas geradas têm atestado (as mais antigas). */
  readonly justificadas?: number
}

const MOLDES: readonly Molde[] = [
  {
    // O exemplo literal da spec: 70h, segunda 4h, quarta 2h.
    // 2 segundas (8h) contam + 1 quarta (2h) justificada → "8h / 70h" = 11,4%
    id: 'mfc',
    nome: 'Medicina, Família e Comunidade',
    cargaHorariaTotal: 70,
    cor: '#6366f1',
    grade: [
      { dia: 1, horas: 4 },
      { dia: 3, horas: 2 },
    ],
    faltasPorDia: { 1: 2, 3: 1 },
    justificadas: 1,
  },
  {
    // 4 × 4h = 16h de 80h = 20,0% → amarelo cravado no topo da faixa
    id: 'bio',
    nome: 'Bioquímica Médica',
    cargaHorariaTotal: 80,
    cor: '#a855f7',
    grade: [
      { dia: 2, horas: 4 },
      { dia: 4, horas: 4 },
    ],
    faltasPorDia: { 2: 3, 4: 1 },
  },
  {
    // 6 quartas (24h) + 1 segunda (2h) = 26h de 120h = 21,7% → vermelho
    id: 'ana',
    nome: 'Anatomia Humana II',
    cargaHorariaTotal: 120,
    cor: '#ec4899',
    grade: [
      { dia: 1, horas: 2 },
      { dia: 3, horas: 4 },
      { dia: 5, horas: 4 },
    ],
    faltasPorDia: { 1: 1, 3: 6 },
  },
  {
    // 5 × 2h = 10h de 90h = 11,1% → verde
    id: 'fis',
    nome: 'Fisiologia Humana',
    cargaHorariaTotal: 90,
    cor: '#0ea5e9',
    grade: [
      { dia: 2, horas: 2 },
      { dia: 4, horas: 2 },
      { dia: 5, horas: 2 },
    ],
    faltasPorDia: { 2: 2, 4: 2, 5: 1 },
  },
  {
    // 4 × 4h = 16h de 60h = 26,7% → passou dos 25%. É o caso que a spec
    // implica mas não nomeia, e a UI precisa parar de oferecer saldo.
    id: 'sem',
    nome: 'Semiologia Médica',
    cargaHorariaTotal: 60,
    cor: '#14b8a6',
    grade: [{ dia: 3, horas: 4 }],
    faltasPorDia: { 3: 4 },
  },
  {
    // 1 × 2h de 40h = 5% → verde folgado
    id: 'sco',
    nome: 'Saúde Coletiva',
    cargaHorariaTotal: 40,
    cor: '#78716c',
    grade: [{ dia: 5, horas: 2 }],
    faltasPorDia: { 5: 1 },
  },
]

export const DISCIPLINAS_DEMO: readonly Disciplina[] = MOLDES.map((m) => ({
  id: m.id,
  nome: m.nome,
  cargaHorariaTotal: m.cargaHorariaTotal,
  cor: m.cor,
  grade: m.grade,
}))

export function faltasDemo(hoje: string = hojeISO()): Falta[] {
  const inicio = inicioSemestre(hoje)
  const faltas: Falta[] = []

  for (const molde of MOLDES) {
    const daDisciplina: Falta[] = []

    for (const [diaTexto, quantidade] of Object.entries(molde.faltasPorDia)) {
      const dia = Number(diaTexto) as DiaSemana
      const horas = molde.grade.find((a) => a.dia === dia)?.horas
      if (horas === undefined) continue

      // Só as aulas daquele dia da semana, do início do semestre até hoje.
      const aulas = proximasAulas(molde.grade, inicio, 200).filter(
        (a) => a.dia === dia && a.data <= hoje,
      )

      for (const aula of aulas.slice(0, quantidade)) {
        daDisciplina.push({
          id: `${molde.id}-${aula.data}`,
          disciplinaId: molde.id,
          data: aula.data,
          horasPerdidas: horas,
          justificada: false,
        })
      }
    }

    daDisciplina.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0))

    // As mais antigas levam atestado — é o padrão realista: quem justifica,
    // justifica na hora, e as recentes ainda estão dentro do prazo de 7 dias.
    const quantasJustificadas = molde.justificadas ?? 0
    faltas.push(
      ...daDisciplina.map((f, i) =>
        i < quantasJustificadas ? { ...f, justificada: true } : f,
      ),
    )
  }

  return faltas
}

/**
 * §5 — colegas de turma para o ranking ficar vivo.
 * Só nome e avatar: os números de cada um nunca saem do servidor.
 */
export const COLEGAS_DEMO = [
  { id: 'u1', nome: 'Você', emoji: '🎓', ehVoce: true },
  { id: 'u2', nome: 'Marina Alves', emoji: '🦉', ehVoce: false },
  { id: 'u3', nome: 'Rafael Nunes', emoji: '🐙', ehVoce: false },
  { id: 'u4', nome: 'Bia Carvalho', emoji: '🦊', ehVoce: false },
  { id: 'u5', nome: 'Téo Menezes', emoji: '🐢', ehVoce: false },
  { id: 'u6', nome: 'Lu Ferreira', emoji: '🦩', ehVoce: false },
] as const
