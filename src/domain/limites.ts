import {
  LIMITES_PADRAO,
  REGRAS_PADRAO,
  type Limites,
  type RegrasFalta,
} from './tipos.ts'

/**
 * De quem é a regra do curso.
 *
 * "Reprova acima de 25%" não é preferência de quem usa o app: é o regimento da
 * faculdade. Enquanto era um controle deslizante pessoal, dava para arrastá-lo
 * até 50% e ficar verde — o app concordava com quem quisesse se enganar. Pior:
 * o ranking comparava colegas sob fórmulas diferentes, porque cada um levava a
 * própria régua para dentro da soma.
 *
 * A regra passa a ser resolvida em cascata, do específico ao geral. Cada nível
 * guarda `null` para dizer "não decido isto, pergunte acima":
 *
 *   disciplina  →  comunidade  →  configuração pessoal  →  padrão (25/15/20)
 *
 * A disciplina é o nível mais específico porque é onde a regra mora na vida
 * real — a frequência mínima é por componente curricular, e estágio costuma
 * ter regra própria. A comunidade é quem preenche na prática: é a turma que
 * conhece o regimento, e quem administra responde por ele.
 *
 * **As faixas de alerta são a exceção.** Verde e amarelo não reprovam
 * ninguém: são o aviso de que a hora está chegando. Quem quer ser avisado
 * antes está ajustando o próprio alarme, e isso continua sendo dele — mas só
 * para BAIXO. Afrouxar o alerta acima do que a turma definiu seria mexer na
 * régua coletiva pela porta dos fundos.
 *
 * Este módulo é a fonte da verdade no cliente; a mesma cascata está em
 * `v_disciplina_status` (migration 0013) para o servidor não discordar.
 */

/** Quem decidiu cada número. É o que deixa a tela dizer "definido pela sua turma". */
export type NivelDaRegra = 'disciplina' | 'comunidade' | 'usuario' | 'padrao'

/** Um nível da cascata. Tudo anulável: `null` é "não decido isto". */
export interface RegraDoNivel {
  readonly limiteReprovacao?: number | null
  readonly faixaVerde?: number | null
  readonly faixaAmarela?: number | null
  readonly justificadaQuebraStreak?: boolean | null
}

export interface Niveis {
  readonly disciplina?: RegraDoNivel | null
  readonly comunidade?: RegraDoNivel | null
  readonly usuario?: RegraDoNivel | null
}

export interface OrigemDaRegra {
  readonly limiteReprovacao: NivelDaRegra
  readonly faixaVerde: NivelDaRegra
  readonly faixaAmarela: NivelDaRegra
}

export interface RegraResolvida {
  readonly limites: Limites
  readonly regras: RegrasFalta
  readonly origem: OrigemDaRegra
  /** A turma fixou o limite: a tela mostra, não deixa editar. */
  readonly limiteTravado: boolean
  /** O teto que a turma impõe ao alerta, quando impõe. */
  readonly tetoDoAlerta: { readonly verde: number | null; readonly amarela: number | null }
}

function primeiro<T>(
  candidatos: readonly (readonly [NivelDaRegra, T | null | undefined])[],
  padrao: T,
): readonly [NivelDaRegra, T] {
  for (const [nivel, valor] of candidatos) {
    if (valor !== null && valor !== undefined) return [nivel, valor]
  }
  return ['padrao', padrao]
}

/**
 * O alerta pessoal só aperta.
 *
 * Sem teto, devolve o que a pessoa escolheu (ou o padrão). Com teto, devolve o
 * menor entre os dois — e a origem conta quem ganhou, porque "15%, seu" e
 * "15%, da turma" dizem coisas diferentes para quem lê a tela.
 */
function alerta(
  pessoal: number | null | undefined,
  teto: number | null | undefined,
  padrao: number,
): readonly [NivelDaRegra, number] {
  if (teto === null || teto === undefined) {
    return pessoal === null || pessoal === undefined ? ['padrao', padrao] : ['usuario', pessoal]
  }
  if (pessoal === null || pessoal === undefined || pessoal >= teto) return ['comunidade', teto]
  return ['usuario', pessoal]
}

export function resolverRegra(niveis: Niveis): RegraResolvida {
  const { disciplina, comunidade, usuario } = niveis

  const [origemLimite, limiteReprovacao] = primeiro(
    [
      ['disciplina', disciplina?.limiteReprovacao],
      ['comunidade', comunidade?.limiteReprovacao],
      ['usuario', usuario?.limiteReprovacao],
    ],
    LIMITES_PADRAO.limiteReprovacao,
  )

  const [origemVerde, verdeBruto] = alerta(
    usuario?.faixaVerde,
    comunidade?.faixaVerde,
    LIMITES_PADRAO.faixaVerde,
  )
  const [origemAmarela, amarelaBruta] = alerta(
    usuario?.faixaAmarela,
    comunidade?.faixaAmarela,
    LIMITES_PADRAO.faixaAmarela,
  )

  /*
   * Coerência entre níveis diferentes.
   *
   * Cada nível é validado sozinho no banco, mas a combinação não: uma
   * disciplina de estágio com limite de 10% herda um alerta amarelo de 20% da
   * configuração pessoal, e o medidor mostraria a faixa de atenção DEPOIS do
   * ponto sem volta. Prender as faixas ao limite não muda quem decide nada —
   * só impede a escala de mentir.
   */
  const faixaAmarela = Math.min(amarelaBruta, limiteReprovacao)
  const faixaVerde = Math.min(verdeBruto, faixaAmarela)

  return {
    limites: { limiteReprovacao, faixaVerde, faixaAmarela },
    regras: {
      // O streak é seu: quantos dias VOCÊ está sem faltar. Nenhuma turma
      // decide se o seu atestado quebra a sua sequência.
      justificadaQuebraStreak:
        usuario?.justificadaQuebraStreak ?? REGRAS_PADRAO.justificadaQuebraStreak,
    },
    origem: {
      limiteReprovacao: origemLimite,
      faixaVerde: origemVerde,
      faixaAmarela: origemAmarela,
    },
    limiteTravado: origemLimite === 'disciplina' || origemLimite === 'comunidade',
    tetoDoAlerta: {
      verde: comunidade?.faixaVerde ?? null,
      amarela: comunidade?.faixaAmarela ?? null,
    },
  }
}

export const ROTULO_NIVEL: Readonly<Record<NivelDaRegra, string>> = {
  disciplina: 'definido para esta disciplina',
  comunidade: 'definido pela sua turma',
  usuario: 'seu',
  padrao: 'padrão',
}

/**
 * O mesmo, para caber no meio de uma frase.
 *
 * "hoje 25% (seu)" é legível para quem escreveu o código e para mais ninguém.
 * Uma usuária de verdade travou na palavra "herdar" e chutou que fosse sobre
 * atestado — sinal de que rótulo curto aqui não economiza nada, só transfere o
 * trabalho de entender para quem está com pressa.
 */
export const FRASE_NIVEL: Readonly<Record<NivelDaRegra, string>> = {
  disciplina: 'definida para esta disciplina',
  comunidade: 'definida pela sua turma',
  usuario: 'que é o seu ajuste em Ajustes',
  padrao: 'o padrão do app',
}
