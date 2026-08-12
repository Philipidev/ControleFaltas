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
