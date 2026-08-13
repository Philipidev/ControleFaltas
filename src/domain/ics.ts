/**
 * Geração de iCalendar (RFC 5545) — TypeScript puro, sem React e sem rede.
 *
 * O arquivo .ics é a única ponte que a web tem para o calendário nativo do
 * celular: no iOS abre o "Adicionar tudo ao Calendário", no Android o Google
 * Agenda assume. Não existe API de escrita direta.
 *
 * O formato é chato em três pontos, e os três estão resolvidos aqui:
 *
 * 1. TEXT precisa escapar `\`, `;`, `,` e quebra de linha — nomes de
 *    disciplina com vírgula ("Medicina, Família e Comunidade") quebram o
 *    parser sem isso.
 * 2. Linhas dobram em 75 OCTETOS, não caracteres. "Semiologia Médica" tem
 *    acento, e acento em UTF-8 ocupa dois bytes: contar caractere estoura o
 *    limite em nomes longos.
 * 3. CRLF, não LF. Parte dos parsers (incluindo o do iOS) recusa o arquivo
 *    inteiro com LF.
 */

import { DIAS_ICS, type DiaSemana } from './tipos.ts'

export interface AulaParaExportar {
  readonly disciplinaId: string
  readonly disciplina: string
  readonly dia: DiaSemana
  readonly horas: number
  /** 'HH:MM' ou 'HH:MM:SS'. Null usa `horaPadrao`. */
  readonly horaInicio: string | null
}

export interface OpcoesIcs {
  readonly aulas: readonly AulaParaExportar[]
  /** 'YYYY-MM-DD' — primeira data possível para as aulas. */
  readonly inicio: string
  /** 'YYYY-MM-DD' — fim do semestre; vira o UNTIL da recorrência. */
  readonly fim: string
  /** 'HH:MM' usado quando a grade não sabe o horário. */
  readonly horaPadrao: string
  /** Sufixo dos UIDs. Reimportar com o mesmo valor ATUALIZA em vez de duplicar. */
  readonly dominio?: string
}

// ---------------------------------------------------------------------------
// Escapes e dobra
// ---------------------------------------------------------------------------

/** Escapa um valor TEXT. A ordem importa: a barra tem de vir primeiro. */
export function escaparTexto(valor: string): string {
  return valor
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
}

/**
 * Dobra uma linha em 75 octetos, continuando com espaço no começo da próxima.
 *
 * Conta bytes UTF-8, não caracteres — e nunca parte um caractere no meio, o
 * que produziria bytes inválidos. Emoji ocupa 4 octetos e é o caso que mais
 * facilmente estoura uma dobra ingênua.
 */
export function dobrarLinha(linha: string): string {
  const bytesDe = (s: string): number => new TextEncoder().encode(s).length
  if (bytesDe(linha) <= 75) return linha

  const partes: string[] = []
  let atual = ''
  let limite = 75

  // Itera por code points (o spread respeita pares substitutos), então um
  // emoji nunca é cortado ao meio.
  for (const caractere of linha) {
    if (bytesDe(atual + caractere) > limite) {
      partes.push(atual)
      atual = caractere
      // As linhas seguintes começam com um espaço, que também conta no limite.
      limite = 74
    } else {
      atual += caractere
    }
  }
  partes.push(atual)

  return partes.map((p, i) => (i === 0 ? p : ` ${p}`)).join('\r\n')
}

// ---------------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------------

/** '2026-08-12' → '20260812' */
function dataCompacta(iso: string): string {
  return iso.replace(/-/g, '')
}

/** '08:30' ou '08:30:00' → '083000' */
function horaCompacta(hora: string): string {
  const [h = '0', m = '0', s = '0'] = hora.split(':')
  return `${h.padStart(2, '0')}${m.padStart(2, '0')}${s.padStart(2, '0')}`
}

/**
 * Soma horas a um 'HH:MM' e devolve 'HHMMSS'.
 *
 * Sem data envolvida de propósito: uma aula que passasse da meia-noite viraria
 * outro dia e o DTEND ficaria antes do DTSTART. Aula de faculdade não faz
 * isso, então o limite fica em 23:59:59 em vez de virar o dia silenciosamente.
 */
function somarHoras(hora: string, horas: number): string {
  const [h = '0', m = '0'] = hora.split(':')
  const totalMinutos = Number(h) * 60 + Number(m) + Math.round(horas * 60)
  const limitado = Math.min(totalMinutos, 23 * 60 + 59)
  const hh = Math.floor(limitado / 60)
  const mm = limitado % 60
  return `${String(hh).padStart(2, '0')}${String(mm).padStart(2, '0')}00`
}

/**
 * Primeira ocorrência da aula em ou depois de `inicio`.
 *
 * O DTSTART de um evento semanal precisa cair no dia da semana certo. Se
 * apontasse para `inicio` direto, uma grade de terça começando num domingo
 * geraria a série toda em domingos.
 */
export function primeiraOcorrencia(inicio: string, dia: DiaSemana): string {
  const [ano = '0', mes = '1', d = '1'] = inicio.split('-')
  // Meio-dia local evita que fuso negativo jogue a data para o dia anterior.
  const data = new Date(Number(ano), Number(mes) - 1, Number(d), 12)
  const avanco = (dia - data.getDay() + 7) % 7
  data.setDate(data.getDate() + avanco)
  return `${String(data.getFullYear())}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(
    data.getDate(),
  ).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------

/**
 * Monta o .ics inteiro.
 *
 * Os eventos são "floating time" (sem TZID e sem Z): a aula é às 8h no
 * relógio de quem assiste, e é isso que se quer. Marcar UTC faria o horário
 * escorregar se a pessoa viajasse, e declarar VTIMEZONE completo exigiria
 * embutir as regras de fuso do Brasil no arquivo.
 */
export function gerarIcs(opcoes: OpcoesIcs): string {
  const dominio = opcoes.dominio ?? 'controlefaltas'
  const linhas: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Controle de Faltas//PT-BR//',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escaparTexto('Minhas aulas')}`,
  ]

  // DTSTAMP igual para todos os eventos do arquivo: é o carimbo de quando o
  // arquivo foi gerado, não de cada evento. Vem da data de início para a saída
  // ser determinística — o mesmo semestre gera o mesmo arquivo, e o teste
  // consegue afirmar algo sobre ele.
  const carimbo = `${dataCompacta(opcoes.inicio)}T000000Z`
  const ate = `${dataCompacta(opcoes.fim)}T235959Z`

  for (const aula of opcoes.aulas) {
    const hora = aula.horaInicio ?? opcoes.horaPadrao
    const primeira = primeiraOcorrencia(opcoes.inicio, aula.dia)

    linhas.push(
      'BEGIN:VEVENT',
      // O UID amarra disciplina + dia. Reimportar substitui a série em vez de
      // criar uma segunda cópia por cima da primeira.
      `UID:aula-${aula.disciplinaId}-${String(aula.dia)}@${dominio}`,
      `DTSTAMP:${carimbo}`,
      `DTSTART:${dataCompacta(primeira)}T${horaCompacta(hora)}`,
      `DTEND:${dataCompacta(primeira)}T${somarHoras(hora, aula.horas)}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${DIAS_ICS[aula.dia]};UNTIL=${ate}`,
      dobrarLinha(`SUMMARY:${escaparTexto(aula.disciplina)}`),
      'END:VEVENT',
    )
  }

  linhas.push('END:VCALENDAR')

  // CRLF: com LF puro o iOS recusa o arquivo inteiro.
  return linhas.map(dobrarLinha).join('\r\n') + '\r\n'
}
