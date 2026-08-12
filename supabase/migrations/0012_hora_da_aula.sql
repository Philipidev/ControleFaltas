-- ============================================================================
-- Controle de Faltas — 0012: a que horas é a aula
--
-- A grade sabe QUE DIA tem aula e QUANTAS HORAS vale — é disso que a §3 tira o
-- desconto, e para isso bastava. Só que exportar a grade para o calendário do
-- celular pede uma informação que nunca foi guardada: o horário.
--
-- Sem ela, ou o evento vira "dia inteiro" (e aí o calendário do aluno fica
-- inútil, seis disciplinas empilhadas no topo de cada dia), ou o app chuta um
-- horário igual para todas — que é pior, porque parece certo e está errado.
--
-- Nullable de propósito: as disciplinas que já existem continuam válidas sem
-- horário, e a exportação pede um padrão para elas. Tornar NOT NULL exigiria
-- inventar um valor para dados que ninguém preencheu.
-- ============================================================================

alter table public.disciplina_grade
  add column if not exists hora_inicio time;

comment on column public.disciplina_grade.hora_inicio is
  'Horário de início da aula nesse dia. Null = desconhecido; a exportação '
  'para .ics pergunta um padrão. Não participa do cálculo de faltas.';

-- A duração do evento sai de `horas`, que já existe. Guardar hora_fim seria
-- uma segunda fonte de verdade para a mesma coisa, e as duas divergiriam.
