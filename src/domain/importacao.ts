import { z } from 'zod'

import { NOME_DIA_CURTO, type DiaSemana } from './tipos.ts'

/**
 * §7.6 — "Importar grade horária: cadastrar todas as disciplinas de uma vez
 * (em vez de uma por uma)."
 *
 * Aceita CSV ou colagem de planilha (separado por tab). O parser é permissivo
 * na entrada e rígido na saída: aceita ponto e vírgula, vírgula ou tab como
 * separador, aceita vírgula decimal ("4,5"), ignora acentuação e caixa nos
 * cabeçalhos — e devolve erro por LINHA, com o número da linha, em vez de
 * abortar o arquivo inteiro no primeiro problema.
 *
 * Isso importa porque o caso de uso real é colar uma grade que veio da
 * coordenação em formato imprevisível, no começo do semestre, com pressa.
 */

export interface LinhaImportada {
  readonly linha: number
  readonly nome: string
  readonly codigo: string | null
  readonly curso: string
  readonly periodo: string
  readonly turma: string | null
  readonly cargaHorariaTotal: number
  readonly grade: readonly { dia: DiaSemana; horas: number }[]
}

export interface ErroImportacao {
  readonly linha: number
  readonly motivo: string
  readonly conteudo: string
}

export interface ResultadoImportacao {
  readonly linhas: readonly LinhaImportada[]
  readonly erros: readonly ErroImportacao[]
}

/** Cabeçalhos aceitos, normalizados (sem acento, minúsculo). */
const ALIASES: Readonly<Record<string, string>> = {
  nome: 'nome',
  disciplina: 'nome',
  materia: 'nome',
  codigo: 'codigo',
  sigla: 'codigo',
  curso: 'curso',
  periodo: 'periodo',
  semestre: 'periodo',
  turma: 'turma',
  carga: 'carga',
  cargahoraria: 'carga',
  cargahorariatotal: 'carga',
  ch: 'carga',
  horas: 'carga',
  dom: 'd0',
  domingo: 'd0',
  seg: 'd1',
  segunda: 'd1',
  ter: 'd2',
  terca: 'd2',
  qua: 'd3',
  quarta: 'd3',
  qui: 'd4',
  quinta: 'd4',
  sex: 'd5',
  sexta: 'd5',
  sab: 'd6',
  sabado: 'd6',
}

function normalizar(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function detectarSeparador(cabecalho: string): string {
  if (cabecalho.includes('\t')) return '\t'
  if (cabecalho.includes(';')) return ';'
  return ','
}

/** Aceita "4", "4,5" e "4.5"; string vazia vira 0. */
function paraNumero(bruto: string): number {
  const limpo = bruto.trim().replace(',', '.')
  if (limpo === '') return 0
  const n = Number(limpo)
  return Number.isFinite(n) ? n : Number.NaN
}

const esquemaLinha = z.object({
  nome: z.string().min(1, 'nome vazio'),
  curso: z.string().min(1, 'curso vazio'),
  periodo: z.string().min(1, 'período vazio'),
  carga: z.number().positive('carga horária precisa ser maior que zero'),
})

export function importarCatalogo(texto: string): ResultadoImportacao {
  const linhasBrutas = texto
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== '')

  const primeira = linhasBrutas[0]
  if (primeira === undefined) {
    return { linhas: [], erros: [{ linha: 0, motivo: 'arquivo vazio', conteudo: '' }] }
  }

  const separador = detectarSeparador(primeira)
  const colunas = primeira.split(separador).map((c) => ALIASES[normalizar(c)] ?? '')

  if (!colunas.includes('nome')) {
    return {
      linhas: [],
      erros: [
        {
          linha: 1,
          motivo:
            'não achei a coluna "nome" no cabeçalho. Esperado algo como: nome, curso, periodo, carga, seg, ter, qua, qui, sex',
          conteudo: primeira,
        },
      ],
    }
  }

  const linhas: LinhaImportada[] = []
  const erros: ErroImportacao[] = []

  for (let i = 1; i < linhasBrutas.length; i += 1) {
    const bruta = linhasBrutas[i] ?? ''
    const numeroDaLinha = i + 1
    const celulas = bruta.split(separador)

    const valor = (chave: string): string => {
      const indice = colunas.indexOf(chave)
      return indice === -1 ? '' : (celulas[indice] ?? '').trim()
    }

    const carga = paraNumero(valor('carga'))
    const analise = esquemaLinha.safeParse({
      nome: valor('nome'),
      curso: valor('curso'),
      periodo: valor('periodo'),
      carga,
    })

    if (!analise.success) {
      erros.push({
        linha: numeroDaLinha,
        motivo: analise.error.issues.map((e) => e.message).join('; '),
        conteudo: bruta,
      })
      continue
    }

    const grade: { dia: DiaSemana; horas: number }[] = []
    let gradeInvalida: string | null = null

    for (const dia of [0, 1, 2, 3, 4, 5, 6] as const) {
      const horas = paraNumero(valor(`d${String(dia)}`))
      if (Number.isNaN(horas)) {
        gradeInvalida = `horas inválidas em ${NOME_DIA_CURTO[dia]}`
        break
      }
      if (horas > 0) grade.push({ dia, horas })
    }

    if (gradeInvalida !== null) {
      erros.push({ linha: numeroDaLinha, motivo: gradeInvalida, conteudo: bruta })
      continue
    }

    if (grade.length === 0) {
      erros.push({
        linha: numeroDaLinha,
        motivo: 'nenhum dia de aula — sem grade o app não sabe quantas horas descontar',
        conteudo: bruta,
      })
      continue
    }

    const codigo = valor('codigo')
    const turma = valor('turma')

    linhas.push({
      linha: numeroDaLinha,
      nome: analise.data.nome,
      codigo: codigo === '' ? null : codigo,
      curso: analise.data.curso,
      periodo: analise.data.periodo,
      turma: turma === '' ? null : turma,
      cargaHorariaTotal: analise.data.carga,
      grade,
    })
  }

  return { linhas, erros }
}

/** Modelo para a pessoa copiar e preencher. */
export const MODELO_CSV = [
  'nome,codigo,curso,periodo,turma,carga,seg,ter,qua,qui,sex',
  'Medicina Família e Comunidade,MFC301,Medicina,5º período,A,70,4,,2,,',
  'Bioquímica Médica,BIQ210,Medicina,5º período,A,80,,4,,4,',
].join('\n')
