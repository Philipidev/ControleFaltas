-- ============================================================================
-- Controle de Faltas — seed do catálogo oficial (§2)
--
-- Isto é o que "o administrador do app" cadastra: nome, curso/período/turma,
-- carga horária total e a grade semanal de cada disciplina. O aluno, no
-- onboarding, apenas SELECIONA daqui — nunca digita carga nem grade.
--
-- Rodar no SQL Editor do Supabase depois das migrations 0001..0005.
-- Idempotente: UUIDs fixos + ON CONFLICT, pode rodar de novo sem duplicar.
--
-- Convenção de dia_semana (EXTRACT(DOW) do Postgres):
--   0=domingo  1=segunda  2=terça  3=quarta  4=quinta  5=sexta  6=sábado
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Disciplinas (Medicina · 5º período · Turma A · 2026.2)
-- A primeira é exatamente o exemplo da spec: 70h, Segunda=4h e Quarta=2h.
-- ---------------------------------------------------------------------------
insert into public.disciplinas
  (id, nome, codigo, curso, periodo, turma, semestre, carga_horaria_total, cor, personalizada, ativa)
values
  ('d15c0000-0000-4000-8000-000000000001', 'Medicina, Família e Comunidade', 'MFC301',
   'Medicina', '5º período', 'A', '2026.2',  70, '#6366f1', false, true),

  ('d15c0000-0000-4000-8000-000000000002', 'Bioquímica Médica',              'BIQ210',
   'Medicina', '5º período', 'A', '2026.2',  80, '#a855f7', false, true),

  ('d15c0000-0000-4000-8000-000000000003', 'Anatomia Humana II',             'ANA202',
   'Medicina', '5º período', 'A', '2026.2', 120, '#ec4899', false, true),

  ('d15c0000-0000-4000-8000-000000000004', 'Fisiologia Humana',              'FIS205',
   'Medicina', '5º período', 'A', '2026.2',  90, '#0ea5e9', false, true),

  ('d15c0000-0000-4000-8000-000000000005', 'Semiologia Médica',              'SEM310',
   'Medicina', '5º período', 'A', '2026.2',  60, '#14b8a6', false, true),

  ('d15c0000-0000-4000-8000-000000000006', 'Saúde Coletiva',                 'SCO120',
   'Medicina', '5º período', 'A', '2026.2',  40, '#78716c', false, true)
on conflict (id) do update set
  nome                = excluded.nome,
  codigo              = excluded.codigo,
  curso               = excluded.curso,
  periodo             = excluded.periodo,
  turma               = excluded.turma,
  semestre            = excluded.semestre,
  carga_horaria_total = excluded.carga_horaria_total,
  cor                 = excluded.cor;

-- ---------------------------------------------------------------------------
-- Grade semanal — "o app já sabe que faltar numa segunda custa 4h" (§2/§3)
-- ---------------------------------------------------------------------------
-- hora_inicio (0012) não entra em cálculo nenhum: a §3 desconta por `horas`.
-- Está aqui para a exportação ao calendário do celular marcar a aula na hora
-- certa, e uma delas fica NULL de propósito — é assim que se vê, no demo, o
-- aviso de "sem horário cadastrado, vai usar o padrão".
insert into public.disciplina_grade (disciplina_id, dia_semana, horas, hora_inicio) values
  -- Medicina, Família e Comunidade — o caso literal da spec
  ('d15c0000-0000-4000-8000-000000000001', 1, 4, '08:00'),  -- segunda 4h
  ('d15c0000-0000-4000-8000-000000000001', 3, 2, '10:00'),  -- quarta  2h

  -- Bioquímica Médica
  ('d15c0000-0000-4000-8000-000000000002', 2, 4, '08:00'),  -- terça   4h
  ('d15c0000-0000-4000-8000-000000000002', 4, 4, '08:00'),  -- quinta  4h

  -- Anatomia Humana II
  ('d15c0000-0000-4000-8000-000000000003', 1, 2, '14:00'),  -- segunda 2h
  ('d15c0000-0000-4000-8000-000000000003', 3, 4, '14:00'),  -- quarta  4h
  ('d15c0000-0000-4000-8000-000000000003', 5, 4, '14:00'),  -- sexta   4h

  -- Fisiologia Humana
  ('d15c0000-0000-4000-8000-000000000004', 2, 2, '19:00'),  -- terça   2h
  ('d15c0000-0000-4000-8000-000000000004', 4, 2, '19:00'),  -- quinta  2h
  ('d15c0000-0000-4000-8000-000000000004', 5, 2, '19:00'),  -- sexta   2h

  -- Semiologia Médica
  ('d15c0000-0000-4000-8000-000000000005', 3, 4, '16:00'),  -- quarta  4h

  -- Saúde Coletiva — sem horário, de propósito
  ('d15c0000-0000-4000-8000-000000000006', 5, 2, null)      -- sexta   2h
on conflict (disciplina_id, dia_semana) do update set
  horas       = excluded.horas,
  hora_inicio = excluded.hora_inicio;

-- ---------------------------------------------------------------------------
-- Grupo da turma (§5, §7.6 "pode ser a turma inteira")
-- criado_por fica nulo: é um grupo institucional, não de um aluno.
-- ---------------------------------------------------------------------------
insert into public.grupos (id, nome, tipo, curso, periodo, turma, codigo_convite)
values (
  '9a0b0000-0000-4000-8000-00000000000a',
  'Medicina 5º período — Turma A',
  'turma',
  'Medicina',
  '5º período',
  'A',
  'MED5A'
)
on conflict (id) do update set
  nome           = excluded.nome,
  codigo_convite = excluded.codigo_convite;

-- ---------------------------------------------------------------------------
-- Conferência rápida
-- ---------------------------------------------------------------------------
select
  d.nome,
  d.carga_horaria_total as carga,
  string_agg(
    (array['dom','seg','ter','qua','qui','sex','sáb'])[g.dia_semana + 1]
      || '=' || trim(to_char(g.horas, 'FM990.9')) || 'h',
    ', ' order by g.dia_semana
  ) as grade,
  round(d.carga_horaria_total * 0.25, 1) as horas_ate_reprovar
from public.disciplinas d
join public.disciplina_grade g on g.disciplina_id = d.id
where d.semestre = '2026.2' and not d.personalizada
group by d.id, d.nome, d.carga_horaria_total
order by d.nome;
