-- ============================================================================
-- Controle de Faltas — 0001: tabelas
-- Mapeamento direto da seção 8 da especificação.
-- Os campos "derivados" da spec (total_faltado, percentual, status) NÃO são
-- armazenados: viram a view v_disciplina_status em 0004_ranking.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tipos
-- Envolvidos em DO/exception para o arquivo poder ser re-executado: se uma
-- rodada falhar no meio, `create type` num tipo que já existe abortaria tudo.
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.user_role as enum ('aluno', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.grupo_tipo as enum ('turma', 'amigos');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.status_risco as enum ('verde', 'amarelo', 'vermelho', 'reprovado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.notificacao_tipo as enum (
    'faixa_alterada',    -- §6: disciplina entrou em amarelo/vermelho
    'aviso_preventivo',  -- §6: "se faltar de novo, passa de 25%"
    'resumo_semanal',    -- §6: quantas faltas na semana
    'prazo_atestado',    -- §7.1: prazo de justificativa acabando
    'streak'             -- §7.5: marco de presença
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Helper de auditoria
-- ---------------------------------------------------------------------------
create or replace function public.set_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles — "Usuário: id, nome, grupo/turma" (§8)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                   uuid primary key references auth.users (id) on delete cascade,
  nome                 text not null default '',
  avatar_url           text,
  emoji                text not null default '🎓',
  role                 public.user_role not null default 'aluno',
  curso                text,
  periodo              text,
  turma                text,
  onboarding_concluido boolean not null default false,
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now()
);

drop trigger if exists trg_profiles_atualizado_em on public.profiles;
create trigger trg_profiles_atualizado_em
  before update on public.profiles
  for each row execute function public.set_atualizado_em();

comment on table public.profiles is
  'Perfil do usuário. role=admin libera o back-office de disciplinas (§2).';

-- ---------------------------------------------------------------------------
-- grupos — §5 e §7.6 ("pode ser a turma inteira, não só amigos")
-- ---------------------------------------------------------------------------
create table if not exists public.grupos (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null,
  tipo           public.grupo_tipo not null default 'turma',
  curso          text,
  periodo        text,
  turma          text,
  codigo_convite text not null unique
                   default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
  criado_por     uuid references public.profiles (id) on delete set null,
  criado_em      timestamptz not null default now()
);

create table if not exists public.grupo_membros (
  grupo_id   uuid not null references public.grupos (id) on delete cascade,
  usuario_id uuid not null references public.profiles (id) on delete cascade,
  papel      text not null default 'membro' check (papel in ('membro', 'dono')),
  entrou_em  timestamptz not null default now(),
  primary key (grupo_id, usuario_id)
);

create index if not exists idx_grupo_membros_usuario on public.grupo_membros (usuario_id);

-- ---------------------------------------------------------------------------
-- disciplinas — §2
-- Catálogo oficial mantido pelo admin (personalizada = false) + disciplinas
-- "avulsas" criadas por um aluno e visíveis só para ele (personalizada = true).
-- ---------------------------------------------------------------------------
create table if not exists public.disciplinas (
  id                  uuid primary key default gen_random_uuid(),
  nome                text not null check (length(btrim(nome)) > 0),
  codigo              text,
  curso               text not null,
  periodo             text not null,
  turma               text,
  semestre            text not null,
  carga_horaria_total numeric(6, 2) not null check (carga_horaria_total > 0),
  cor                 text not null default '#6366f1' check (cor ~ '^#[0-9a-fA-F]{6}$'),
  criado_por          uuid references public.profiles (id) on delete set null,
  personalizada       boolean not null default false,
  ativa               boolean not null default true,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now(),

  -- uma disciplina pessoal precisa ter dono, senão ninguém a enxerga
  constraint disciplina_personalizada_tem_dono
    check (not personalizada or criado_por is not null)
);

drop trigger if exists trg_disciplinas_atualizado_em on public.disciplinas;
create trigger trg_disciplinas_atualizado_em
  before update on public.disciplinas
  for each row execute function public.set_atualizado_em();

-- catálogo oficial: o que o aluno navega no onboarding
create index if not exists idx_disciplinas_catalogo
  on public.disciplinas (curso, periodo, turma, semestre)
  where personalizada = false and ativa = true;

create index if not exists idx_disciplinas_criado_por
  on public.disciplinas (criado_por)
  where personalizada = true;

comment on column public.disciplinas.personalizada is
  '§2: se true, é disciplina avulsa do aluno e só ele a vê (garantido por RLS).';

-- ---------------------------------------------------------------------------
-- disciplina_grade — §2: "em quais dias da semana tem aula e quantas horas"
-- É daqui que sai o desconto automático de horas da §3.
-- dia_semana segue a convenção do Postgres EXTRACT(DOW): 0=domingo … 6=sábado.
-- ---------------------------------------------------------------------------
create table if not exists public.disciplina_grade (
  id            uuid primary key default gen_random_uuid(),
  disciplina_id uuid not null references public.disciplinas (id) on delete cascade,
  dia_semana    smallint not null check (dia_semana between 0 and 6),
  horas         numeric(4, 2) not null check (horas > 0),
  unique (disciplina_id, dia_semana)
);

create index if not exists idx_grade_disciplina on public.disciplina_grade (disciplina_id);

comment on table public.disciplina_grade is
  '§2: Segunda=4h, Quarta=2h. dia_semana usa EXTRACT(DOW): 0=dom … 6=sáb.';

-- ---------------------------------------------------------------------------
-- matriculas — "Vínculo usuário-disciplina" (§8)
-- ---------------------------------------------------------------------------
create table if not exists public.matriculas (
  id            uuid primary key default gen_random_uuid(),
  usuario_id    uuid not null references public.profiles (id) on delete cascade,
  disciplina_id uuid not null references public.disciplinas (id) on delete cascade,
  grupo_id      uuid references public.grupos (id) on delete set null,
  ativa         boolean not null default true,
  criado_em     timestamptz not null default now(),
  unique (usuario_id, disciplina_id)
);

create index if not exists idx_matriculas_usuario on public.matriculas (usuario_id) where ativa = true;
create index if not exists idx_matriculas_grupo   on public.matriculas (grupo_id);

comment on column public.matriculas.grupo_id is
  '§5: a disciplina pode ser "compartilhada" com um grupo — é o escopo do ranking.';

-- ---------------------------------------------------------------------------
-- faltas — §3 e §7.1
-- horas_perdidas NÃO é digitado pelo usuário: o trigger em 0002 preenche a
-- partir da grade. prazo_justificativa é o "data + 7 dias" pedido na §8.
-- ---------------------------------------------------------------------------
create table if not exists public.faltas (
  id                  uuid primary key default gen_random_uuid(),
  usuario_id          uuid not null references public.profiles (id) on delete cascade,
  disciplina_id       uuid not null references public.disciplinas (id) on delete cascade,
  data                date not null,
  horas_perdidas      numeric(4, 2) not null check (horas_perdidas > 0),
  justificada         boolean not null default false,
  data_envio_atestado timestamptz,
  anexo_path          text,
  observacao          text,
  -- escape para reposição/aula extra fora da grade (ver "Além da spec" no plano)
  horas_manuais       boolean not null default false,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now(),

  prazo_justificativa date generated always as (data + 7) stored,

  unique (usuario_id, disciplina_id, data)
);

drop trigger if exists trg_faltas_atualizado_em on public.faltas;
create trigger trg_faltas_atualizado_em
  before update on public.faltas
  for each row execute function public.set_atualizado_em();

create index if not exists idx_faltas_usuario_disciplina on public.faltas (usuario_id, disciplina_id);
create index if not exists idx_faltas_usuario_data       on public.faltas (usuario_id, data desc);

comment on column public.faltas.prazo_justificativa is
  '§7.1/§8: data + 7 dias. A faculdade só aceita atestado dentro dessa janela.';

-- ---------------------------------------------------------------------------
-- configuracoes — o que a spec marca como "configurável"
-- §4 ("sugestão de faixas") e §7.1/§7.5 ("depende da regra oficial do curso")
-- ---------------------------------------------------------------------------
create table if not exists public.configuracoes (
  usuario_id                uuid primary key references public.profiles (id) on delete cascade,

  -- §4: reprovado por falta acima de 25%
  limite_reprovacao         numeric(4, 3) not null default 0.250
                              check (limite_reprovacao > 0 and limite_reprovacao <= 1),
  faixa_verde               numeric(4, 3) not null default 0.150,
  faixa_amarela             numeric(4, 3) not null default 0.200,

  -- §7.1: falta justificada não conta, ou conta num contador separado
  justificada_conta         boolean not null default false,
  -- §7.5: atestado pode não quebrar o streak
  justificada_quebra_streak boolean not null default false,

  tema                      text not null default 'fogo',
  modo                      text not null default 'system' check (modo in ('light', 'dark', 'system')),
  densidade                 text not null default 'confortavel'
                              check (densidade in ('compacta', 'confortavel')),
  notificacoes              jsonb not null default
                              '{"faixa":true,"preventivo":true,"resumoSemanal":true,"prazoAtestado":true}'::jsonb,
  atualizado_em             timestamptz not null default now(),

  constraint faixas_ordenadas
    check (faixa_verde < faixa_amarela and faixa_amarela <= limite_reprovacao)
);

drop trigger if exists trg_configuracoes_atualizado_em on public.configuracoes;
create trigger trg_configuracoes_atualizado_em
  before update on public.configuracoes
  for each row execute function public.set_atualizado_em();

-- ---------------------------------------------------------------------------
-- notificacoes — §6
-- ---------------------------------------------------------------------------
create table if not exists public.notificacoes (
  id            uuid primary key default gen_random_uuid(),
  usuario_id    uuid not null references public.profiles (id) on delete cascade,
  tipo          public.notificacao_tipo not null,
  titulo        text not null,
  corpo         text not null default '',
  disciplina_id uuid references public.disciplinas (id) on delete cascade,
  dados         jsonb not null default '{}'::jsonb,
  lida          boolean not null default false,
  criado_em     timestamptz not null default now()
);

create index if not exists idx_notificacoes_caixa
  on public.notificacoes (usuario_id, lida, criado_em desc);

-- ---------------------------------------------------------------------------
-- historico_semestres — §7.6 "reset por semestre: zera os dados mas mantém
-- histórico"
-- ---------------------------------------------------------------------------
create table if not exists public.historico_semestres (
  id           uuid primary key default gen_random_uuid(),
  usuario_id   uuid not null references public.profiles (id) on delete cascade,
  semestre     text not null,
  snapshot     jsonb not null,
  arquivado_em timestamptz not null default now(),
  unique (usuario_id, semestre)
);

comment on column public.historico_semestres.snapshot is
  'Congela disciplinas, matrículas, faltas e percentuais do semestre encerrado.';
