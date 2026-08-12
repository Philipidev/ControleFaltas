-- ============================================================================
-- Controle de Faltas — TUDO EM UM
--
-- Cole este arquivo inteiro no SQL Editor do Supabase e rode uma vez só.
-- Gerado a partir de supabase/migrations/0001..0005 + seed.sql — nao edite
-- aqui; edite os arquivos de origem e gere de novo.
--
-- E re-executavel: tipos, tabelas, indices, triggers e policies sao criados
-- de forma idempotente. Se uma rodada falhar no meio, rode de novo.
-- ============================================================================
-- ==========================================================================
-- >>> 0001_schema.sql
-- ==========================================================================

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


-- ==========================================================================
-- >>> 0002_functions_triggers.sql
-- ==========================================================================

-- ============================================================================
-- Controle de Faltas — 0002: funções e triggers
--
-- As três regras centrais da spec moram AQUI, não na UI:
--   §3   as horas da falta vêm da grade semanal, nunca do cliente
--   §7.1 atestado só dentro de 7 dias — expirou, o banco recusa
--   §6   mudança de faixa gera notificação automaticamente
-- A UI só espelha isso para dar feedback bonito; a garantia é o banco.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helpers de autorização
--
-- SECURITY DEFINER é obrigatório aqui: is_admin() é chamada de dentro de uma
-- policy da própria tabela profiles. Uma função INVOKER re-avaliaria a policy
-- ao ler profiles e entraria em recursão infinita (pegadinha clássica do
-- Supabase: "infinite recursion detected in policy").
-- search_path pinado para não permitir shadowing de tabelas.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

create or replace function public.eh_membro_do_grupo(p_grupo_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.grupo_membros gm
    where gm.grupo_id = p_grupo_id and gm.usuario_id = auth.uid()
  );
$$;

-- "essa pessoa está em algum grupo comigo?" — usado na policy de profiles
create or replace function public.compartilha_grupo(p_outro uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.grupo_membros meu
    join public.grupo_membros dele on dele.grupo_id = meu.grupo_id
    where meu.usuario_id = auth.uid()
      and dele.usuario_id = p_outro
  );
$$;

-- ---------------------------------------------------------------------------
-- Cálculo (§8: "derivado, não precisa salvar")
--
-- ATENÇÃO: estas duas são SECURITY DEFINER, logo IGNORAM RLS. Se ficassem
-- executáveis pelo cliente, qualquer um chamaria horas_faltadas(<uuid alheio>)
-- e leria as faltas do colega — exatamente o que a §5 proíbe. Por isso o
-- REVOKE logo abaixo: são de uso interno (triggers e as RPCs de 0004).
-- ---------------------------------------------------------------------------
create or replace function public.horas_faltadas(p_usuario uuid, p_disciplina uuid)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(f.horas_perdidas), 0)::numeric
  from public.faltas f
  where f.usuario_id = p_usuario
    and f.disciplina_id = p_disciplina
    and (
      not f.justificada
      -- §7.1: justificada conta ou não, conforme a regra do curso
      or coalesce(
           (select c.justificada_conta from public.configuracoes c
             where c.usuario_id = p_usuario),
           false)
    );
$$;

-- §4: faixas do semáforo. Padrões da spec (15% / 20% / 25%), mas lidos das
-- configurações porque a própria spec diz "sugestão de faixas".
create or replace function public.status_risco_de(p_usuario uuid, p_percentual numeric)
returns public.status_risco
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    -- adição ao spec: >25% não é "risco", já é reprovação consumada
    when p_percentual > coalesce(c.limite_reprovacao, 0.250) then 'reprovado'::public.status_risco
    when p_percentual > coalesce(c.faixa_amarela,     0.200) then 'vermelho'::public.status_risco
    when p_percentual > coalesce(c.faixa_verde,       0.150) then 'amarelo'::public.status_risco
    else 'verde'::public.status_risco
  end
  from (select 1) _
  left join public.configuracoes c on c.usuario_id = p_usuario;
$$;

revoke execute on function public.horas_faltadas(uuid, uuid)      from public, anon, authenticated;
revoke execute on function public.status_risco_de(uuid, numeric)  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- §3 — REGISTRO DE FALTA
-- "O app automaticamente desconta as horas daquele dia da carga horária
--  (baseado na grade cadastrada). Não precisa digitar quantas horas perdeu."
--
-- O trigger SOBRESCREVE horas_perdidas com o valor da grade. Mesmo que o
-- cliente mande outro número, o banco ignora — é isso que garante que faltar
-- numa segunda de 4h nunca vire "1 falta genérica".
-- ---------------------------------------------------------------------------
create or replace function public.trg_falta_horas()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_horas numeric(4, 2);
  v_nome  text;
  v_dow   smallint;
begin
  -- escape consciente: reposição / aula extra fora da grade
  if new.horas_manuais then
    if new.horas_perdidas is null or new.horas_perdidas <= 0 then
      raise exception 'Informe horas_perdidas ao usar horas_manuais.'
        using errcode = 'P0001';
    end if;
    return new;
  end if;

  v_dow := extract(dow from new.data)::smallint;

  select g.horas into v_horas
  from public.disciplina_grade g
  where g.disciplina_id = new.disciplina_id
    and g.dia_semana = v_dow;

  if v_horas is null then
    select d.nome into v_nome from public.disciplinas d where d.id = new.disciplina_id;
    raise exception
      'A disciplina "%" não tem aula em %. Confira a data ou registre como reposição.',
      coalesce(v_nome, new.disciplina_id::text),
      to_char(new.data, 'DD/MM/YYYY')
      using errcode = 'P0001';
  end if;

  new.horas_perdidas := v_horas;
  return new;
end;
$$;

drop trigger if exists trg_faltas_10_horas on public.faltas;
create trigger trg_faltas_10_horas
  before insert or update of data, disciplina_id, horas_manuais on public.faltas
  for each row execute function public.trg_falta_horas();

-- ---------------------------------------------------------------------------
-- §7.1 — PRAZO DO ATESTADO
-- "Se passou de 7 dias: bloqueia a opção."
-- A UI desabilita o botão; aqui o banco recusa de verdade.
-- Usamos new.data + 7 (e não a coluna gerada) porque colunas GENERATED só são
-- calculadas DEPOIS dos triggers BEFORE.
-- ---------------------------------------------------------------------------
create or replace function public.trg_prazo_atestado()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_virou_justificada boolean;
begin
  v_virou_justificada :=
    new.justificada and (tg_op = 'INSERT' or not old.justificada);

  if v_virou_justificada then
    if current_date > (new.data + 7) then
      raise exception
        'Prazo do atestado expirado: a falta de % só podia ser justificada até %.',
        to_char(new.data,     'DD/MM/YYYY'),
        to_char(new.data + 7, 'DD/MM/YYYY')
        using errcode = 'P0001';
    end if;

    new.data_envio_atestado := coalesce(new.data_envio_atestado, now());
  end if;

  if tg_op = 'UPDATE' and old.justificada and not new.justificada then
    new.data_envio_atestado := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_faltas_20_atestado on public.faltas;
create trigger trg_faltas_20_atestado
  before insert or update on public.faltas
  for each row execute function public.trg_prazo_atestado();

-- ---------------------------------------------------------------------------
-- §6 — ALERTA DE MUDANÇA DE FAIXA
-- "Notificação quando uma disciplina entra em amarelo ou vermelho."
-- Comparamos o status antes e depois desta falta específica: como sabemos
-- exatamente quantas horas ela custou, dá para reconstruir o "antes".
-- ---------------------------------------------------------------------------
create or replace function public.trg_falta_notifica()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_carga    numeric;
  v_nome     text;
  v_depois   numeric;
  v_antes    numeric;
  v_st_antes public.status_risco;
  v_st_dep   public.status_risco;
begin
  select d.carga_horaria_total, d.nome
    into v_carga, v_nome
  from public.disciplinas d
  where d.id = new.disciplina_id;

  if v_carga is null or v_carga <= 0 then
    return new;
  end if;

  v_depois := public.horas_faltadas(new.usuario_id, new.disciplina_id) / v_carga;
  v_antes  := greatest(v_depois - (new.horas_perdidas / v_carga), 0);

  v_st_antes := public.status_risco_de(new.usuario_id, v_antes);
  v_st_dep   := public.status_risco_de(new.usuario_id, v_depois);

  if v_st_dep is distinct from v_st_antes and v_st_dep <> 'verde' then
    insert into public.notificacoes (usuario_id, tipo, titulo, corpo, disciplina_id, dados)
    values (
      new.usuario_id,
      'faixa_alterada',
      case v_st_dep
        when 'amarelo'  then '🟡 ' || v_nome || ' entrou em atenção'
        when 'vermelho' then '🔴 ' || v_nome || ' está em risco de reprovação'
        else                 '⛔ ' || v_nome || ' passou do limite de faltas'
      end,
      'Você já perdeu ' || to_char(v_depois * 100, 'FM990.0') || '% da carga horária ('
        || to_char(public.horas_faltadas(new.usuario_id, new.disciplina_id), 'FM990.0') || 'h de '
        || to_char(v_carga, 'FM990.0') || 'h).',
      new.disciplina_id,
      jsonb_build_object('status', v_st_dep, 'percentual', round(v_depois, 4))
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_faltas_30_notifica on public.faltas;
create trigger trg_faltas_30_notifica
  after insert on public.faltas
  for each row execute function public.trg_falta_notifica();

-- ---------------------------------------------------------------------------
-- Provisionamento de novo usuário: perfil + configurações padrão
-- ---------------------------------------------------------------------------
create or replace function public.trg_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, nome, avatar_url)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'nome'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(coalesce(new.email, 'estudante'), '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  insert into public.configuracoes (usuario_id)
  values (new.id)
  on conflict (usuario_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_auth_novo_usuario on auth.users;
create trigger trg_auth_novo_usuario
  after insert on auth.users
  for each row execute function public.trg_novo_usuario();


-- ==========================================================================
-- >>> 0003_rls.sql
-- ==========================================================================

-- ============================================================================
-- Controle de Faltas — 0003: Row Level Security
--
-- §5: "Privacidade: ninguém vê os números/faltas dos outros, só os próprios."
-- Isso não é uma tela que esconde dados — é a policy de faltas abaixo. Um
-- colega de turma autenticado, batendo direto na API REST com a anon key,
-- recebe ZERO linhas das faltas alheias. O ranking (§5) contorna isso por uma
-- única porta controlada: a RPC SECURITY DEFINER de 0004, que devolve só a
-- colocação e nunca um número.
-- ============================================================================

alter table public.profiles            enable row level security;
alter table public.grupos              enable row level security;
alter table public.grupo_membros       enable row level security;
alter table public.disciplinas         enable row level security;
alter table public.disciplina_grade    enable row level security;
alter table public.matriculas          enable row level security;
alter table public.faltas              enable row level security;
alter table public.configuracoes       enable row level security;
alter table public.notificacoes        enable row level security;
alter table public.historico_semestres enable row level security;

-- Defesa em profundidade: o projeto foi criado com "Automatically expose new
-- tables" ligado, então o papel anon recebeu GRANT por padrão. O RLS já barra,
-- mas visitante não autenticado não tem o que fazer em nenhuma destas tabelas.
revoke all on public.profiles, public.grupos, public.grupo_membros,
              public.matriculas, public.faltas, public.configuracoes,
              public.notificacoes, public.historico_semestres
  from anon;

-- Limpa as policies de public antes de recriar, para este arquivo poder ser
-- re-executado sem erro de "policy já existe". Escopo restrito ao schema
-- public: as policies de storage vivem em 0005 e não são tocadas aqui.
do $$
declare p record;
begin
  for p in
    select policyname, tablename from pg_policies where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- ===========================================================================
-- profiles
-- ===========================================================================
create policy "perfil: leio o meu, o de quem divide grupo comigo, e admin vê todos"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.compartilha_grupo(id) or public.is_admin());

create policy "perfil: só edito o meu"
  on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- Escalada de privilégio: a policy acima deixa o usuário fazer UPDATE na
-- própria linha — inclusive `set role = 'admin'`. Este trigger fecha isso.
create or replace function public.trg_protege_role()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- contexto de servidor (SQL Editor / service_role): sem JWT, liberado.
  -- É por aqui que se promove o primeiro admin do sistema.
  if auth.uid() is null then
    return new;
  end if;

  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Somente um administrador pode alterar o papel de um usuário.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_protege_role on public.profiles;
create trigger trg_profiles_protege_role
  before update on public.profiles
  for each row execute function public.trg_protege_role();

-- ===========================================================================
-- grupos e membros — §5, §7.6
-- Entrar num grupo é feito pela RPC entrar_no_grupo(codigo) de 0004, não por
-- SELECT: assim o código de convite não permite varrer a lista de grupos.
-- ===========================================================================
create policy "grupo: vejo os que participo"
  on public.grupos for select to authenticated
  using (public.eh_membro_do_grupo(id) or public.is_admin());

create policy "grupo: crio grupos meus"
  on public.grupos for insert to authenticated
  with check (criado_por = auth.uid());

create policy "grupo: dono edita"
  on public.grupos for update to authenticated
  using (criado_por = auth.uid() or public.is_admin())
  with check (criado_por = auth.uid() or public.is_admin());

create policy "grupo: dono remove"
  on public.grupos for delete to authenticated
  using (criado_por = auth.uid() or public.is_admin());

create policy "membros: vejo quem está nos meus grupos"
  on public.grupo_membros for select to authenticated
  using (public.eh_membro_do_grupo(grupo_id) or public.is_admin());

create policy "membros: entro por mim mesmo"
  on public.grupo_membros for insert to authenticated
  with check (usuario_id = auth.uid());

create policy "membros: saio do grupo (ou o dono me remove)"
  on public.grupo_membros for delete to authenticated
  using (
    usuario_id = auth.uid()
    or exists (select 1 from public.grupos g
                where g.id = grupo_id and g.criado_por = auth.uid())
    or public.is_admin()
  );

-- ===========================================================================
-- disciplinas — §2
-- Catálogo oficial (personalizada = false): todos leem, só admin escreve.
-- Disciplina avulsa (personalizada = true): só o dono lê e escreve.
-- ===========================================================================
create policy "disciplina: catálogo é público; avulsa é só do dono"
  on public.disciplinas for select to authenticated
  using (personalizada = false or criado_por = auth.uid());

create policy "disciplina: admin cria no catálogo, aluno cria a própria avulsa"
  on public.disciplinas for insert to authenticated
  with check (
    public.is_admin()
    or (personalizada = true and criado_por = auth.uid())
  );

create policy "disciplina: admin edita o catálogo, aluno edita a própria avulsa"
  on public.disciplinas for update to authenticated
  using (
    public.is_admin()
    or (personalizada = true and criado_por = auth.uid())
  )
  with check (
    public.is_admin()
    or (personalizada = true and criado_por = auth.uid())
  );

create policy "disciplina: mesma regra para remover"
  on public.disciplinas for delete to authenticated
  using (
    public.is_admin()
    or (personalizada = true and criado_por = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- disciplina_grade — acompanha a visibilidade da disciplina
-- ---------------------------------------------------------------------------
create policy "grade: leio a grade das disciplinas que enxergo"
  on public.disciplina_grade for select to authenticated
  using (exists (
    select 1 from public.disciplinas d
    where d.id = disciplina_id
      and (d.personalizada = false or d.criado_por = auth.uid())
  ));

create policy "grade: quem pode editar a disciplina edita a grade"
  on public.disciplina_grade for all to authenticated
  using (exists (
    select 1 from public.disciplinas d
    where d.id = disciplina_id
      and (public.is_admin() or (d.personalizada and d.criado_por = auth.uid()))
  ))
  with check (exists (
    select 1 from public.disciplinas d
    where d.id = disciplina_id
      and (public.is_admin() or (d.personalizada and d.criado_por = auth.uid()))
  ));

-- ===========================================================================
-- matriculas — §8 "vínculo usuário-disciplina"
-- ===========================================================================
create policy "matrícula: só as minhas"
  on public.matriculas for all to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

-- ===========================================================================
-- faltas — §5, o núcleo da privacidade
--
-- Não existe policy de leitura por grupo, por turma, por amizade, nem para
-- admin. É deliberado: nem o administrador do app enxerga as faltas de um
-- aluno. Qualquer flexibilização aqui viola a spec.
-- ===========================================================================
create policy "falta: só as minhas, sempre"
  on public.faltas for all to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

-- ===========================================================================
-- configurações, notificações e histórico — estritamente pessoais
-- ===========================================================================
create policy "config: só a minha"
  on public.configuracoes for all to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

create policy "notificação: só as minhas"
  on public.notificacoes for all to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

create policy "histórico: só o meu"
  on public.historico_semestres for all to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());


-- ==========================================================================
-- >>> 0004_ranking.sql
-- ==========================================================================

-- ============================================================================
-- Controle de Faltas — 0004: view derivada + RPCs
--
-- §8 diz que o cálculo é "derivado, não precisa salvar" → view, não coluna.
-- §5 diz que o ranking mostra "apenas a posição de cada um, sem expor
--     porcentagem, faixa de presença ou qualquer número" → RPC fechada.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- v_disciplina_status — §7.2 alimenta o dashboard inteiro
--
-- security_invoker = true faz a view rodar com as permissões de quem consulta,
-- então o RLS de `faltas` continua valendo dentro dela. Resultado: a view já
-- nasce filtrada no usuário logado, sem precisar de WHERE usuario_id.
-- ---------------------------------------------------------------------------
create or replace view public.v_disciplina_status
with (security_invoker = true)
as
select
  m.usuario_id,
  d.id   as disciplina_id,
  d.nome,
  d.cor,
  d.curso,
  d.periodo,
  d.turma,
  d.semestre,
  d.personalizada,
  d.carga_horaria_total,
  m.grupo_id,

  -- §8: total_faltado
  coalesce(f.horas_contadas, 0)                                        as total_faltado,
  coalesce(f.horas_justificadas, 0)                                    as total_justificado,
  coalesce(f.qtd_contadas, 0)::int                                     as qtd_faltas,
  coalesce(f.qtd_justificadas, 0)::int                                 as qtd_justificadas,

  -- §8: percentual
  round(coalesce(f.horas_contadas, 0) / d.carga_horaria_total, 4)      as percentual,

  -- §4: teto de horas e saldo até bater o limite
  round(d.carga_horaria_total * coalesce(cfg.limite_reprovacao, 0.250), 2) as horas_limite,
  greatest(
    round(d.carga_horaria_total * coalesce(cfg.limite_reprovacao, 0.250)
          - coalesce(f.horas_contadas, 0), 2),
    0
  )                                                                    as horas_restantes,

  -- §8: status (semáforo da §4)
  (case
     when coalesce(f.horas_contadas, 0) / d.carga_horaria_total
            > coalesce(cfg.limite_reprovacao, 0.250) then 'reprovado'
     when coalesce(f.horas_contadas, 0) / d.carga_horaria_total
            > coalesce(cfg.faixa_amarela, 0.200)     then 'vermelho'
     when coalesce(f.horas_contadas, 0) / d.carga_horaria_total
            > coalesce(cfg.faixa_verde, 0.150)       then 'amarelo'
     else 'verde'
   end)::public.status_risco                                           as status

from public.matriculas m
join public.disciplinas d
  on d.id = m.disciplina_id
left join public.configuracoes cfg
  on cfg.usuario_id = m.usuario_id
left join lateral (
  select
    sum(fl.horas_perdidas) filter (
      where not fl.justificada or coalesce(cfg.justificada_conta, false)
    )                                                as horas_contadas,
    sum(fl.horas_perdidas) filter (where fl.justificada) as horas_justificadas,
    count(*) filter (
      where not fl.justificada or coalesce(cfg.justificada_conta, false)
    )                                                as qtd_contadas,
    count(*) filter (where fl.justificada)           as qtd_justificadas
  from public.faltas fl
  where fl.usuario_id   = m.usuario_id
    and fl.disciplina_id = m.disciplina_id
) f on true
where m.ativa = true;

comment on view public.v_disciplina_status is
  '§7.2/§8: nome, semáforo, horas perdidas/total e saldo até o limite, por disciplina do usuário logado.';

grant select on public.v_disciplina_status to authenticated;

-- ===========================================================================
-- §5 — RANKING SEM VAZAMENTO
--
-- Se o cliente calculasse o ranking, precisaria receber a porcentagem de todo
-- mundo — e aí a privacidade já teria ido embora antes de a tela renderizar.
-- Então a ordenação acontece dentro do banco, e o que sai pela porta é só a
-- COLOCAÇÃO. Nenhum percentual, nenhuma hora, nenhuma faixa.
--
-- SECURITY DEFINER porque a função precisa ler faltas alheias para ordenar —
-- é a única exceção controlada ao RLS de faltas, e ela não devolve número.
-- ===========================================================================
create or replace function public.get_group_ranking(
  p_grupo_id      uuid,
  p_disciplina_id uuid default null
)
returns table (
  usuario_id uuid,
  nome       text,
  avatar_url text,
  emoji      text,
  posicao    integer,
  eh_voce    boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_membros integer;
begin
  if v_uid is null then
    raise exception 'Não autenticado.' using errcode = '42501';
  end if;

  -- ranking de grupo é só para quem está no grupo
  if not exists (
    select 1 from public.grupo_membros gm
    where gm.grupo_id = p_grupo_id and gm.usuario_id = v_uid
  ) then
    raise exception 'Você não participa deste grupo.' using errcode = '42501';
  end if;

  select count(*) into v_membros
  from public.grupo_membros gm
  where gm.grupo_id = p_grupo_id;

  -- Guarda de privacidade (adição ao spec): com duas pessoas, saber que você
  -- é o "2º" é saber exatamente que o outro tem menos faltas que você. Só há
  -- anonimato de verdade a partir de três.
  if v_membros < 3 then
    return;
  end if;

  return query
  with base as (
    select
      gm.usuario_id                             as uid,
      coalesce(sum(f.horas), 0)                 as horas,
      coalesce(sum(d.carga_horaria_total), 0)   as carga
    from public.grupo_membros gm
    left join public.matriculas m
      on  m.usuario_id = gm.usuario_id
      and m.ativa = true
      and (
            (p_disciplina_id is not null and m.disciplina_id = p_disciplina_id)
         or (p_disciplina_id is null     and m.grupo_id      = p_grupo_id)
      )
    left join public.disciplinas d
      on d.id = m.disciplina_id
    left join lateral (
      select coalesce(sum(fl.horas_perdidas), 0) as horas
      from public.faltas fl
      where fl.usuario_id    = gm.usuario_id
        and fl.disciplina_id = m.disciplina_id
        and (
          not fl.justificada
          or coalesce((select c.justificada_conta
                       from public.configuracoes c
                       where c.usuario_id = gm.usuario_id), false)
        )
    ) f on true
    where gm.grupo_id = p_grupo_id
    group by gm.usuario_id
  )
  select
    p.id,
    p.nome,
    p.avatar_url,
    p.emoji,
    -- RANK() dá empate compartilhado (1, 2, 2, 4). Além de ser o
    -- comportamento correto, empates borram um pouco mais a informação.
    rank() over (
      order by case when b.carga > 0 then b.horas / b.carga else 0 end asc
    )::integer,
    (p.id = v_uid)
  from base b
  join public.profiles p on p.id = b.uid
  order by 5, p.nome;
end;
$$;

comment on function public.get_group_ranking(uuid, uuid) is
  '§5: devolve APENAS a colocação. Não retorne percentual/horas daqui — quebraria a privacidade da spec.';

-- ===========================================================================
-- §6 — RESUMO SEMANAL
-- "quantas faltas na semana, em quais disciplinas"
-- date_trunc('week') no Postgres começa na segunda-feira, que é o que a
-- semana letiva brasileira espera.
-- ===========================================================================
create or replace function public.get_resumo_semanal(p_referencia date default current_date)
returns table (
  inicio_semana date,
  fim_semana    date,
  total_faltas  integer,
  total_horas   numeric,
  disciplinas   jsonb
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with janela as (
    select
      date_trunc('week', p_referencia)::date       as ini,
      date_trunc('week', p_referencia)::date + 6   as fim
  ),
  agrupado as (
    select
      fl.disciplina_id,
      d.nome,
      d.cor,
      count(*)::int          as qtd,
      sum(fl.horas_perdidas) as horas
    from public.faltas fl
    join public.disciplinas d on d.id = fl.disciplina_id
    cross join janela j
    where fl.usuario_id = auth.uid()
      and fl.data between j.ini and j.fim
    group by fl.disciplina_id, d.nome, d.cor
  )
  select
    j.ini,
    j.fim,
    coalesce((select sum(a.qtd)::int from agrupado a), 0),
    coalesce((select sum(a.horas)    from agrupado a), 0)::numeric,
    coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'disciplinaId', a.disciplina_id,
                 'nome',         a.nome,
                 'cor',          a.cor,
                 'faltas',       a.qtd,
                 'horas',        a.horas
               ) order by a.horas desc
             )
      from agrupado a
    ), '[]'::jsonb)
  from janela j;
$$;

-- ===========================================================================
-- Entrar num grupo pelo código de convite (§5, §7.6)
-- Feito por RPC em vez de SELECT em `grupos`: assim o código funciona como
-- convite de verdade e ninguém consegue listar/varrer os grupos existentes.
-- ===========================================================================
create or replace function public.entrar_no_grupo(p_codigo text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_grupo uuid;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado.' using errcode = '42501';
  end if;

  select g.id into v_grupo
  from public.grupos g
  where upper(btrim(g.codigo_convite)) = upper(btrim(p_codigo));

  if v_grupo is null then
    raise exception 'Código de convite inválido.' using errcode = 'P0001';
  end if;

  insert into public.grupo_membros (grupo_id, usuario_id)
  values (v_grupo, auth.uid())
  on conflict (grupo_id, usuario_id) do nothing;

  return v_grupo;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissões: só usuário autenticado, nunca anon
-- ---------------------------------------------------------------------------
revoke execute on function public.get_group_ranking(uuid, uuid) from public, anon;
revoke execute on function public.get_resumo_semanal(date)      from public, anon;
revoke execute on function public.entrar_no_grupo(text)         from public, anon;
revoke execute on function public.is_admin()                    from anon;
revoke execute on function public.eh_membro_do_grupo(uuid)      from anon;
revoke execute on function public.compartilha_grupo(uuid)       from anon;

grant execute on function public.get_group_ranking(uuid, uuid) to authenticated;
grant execute on function public.get_resumo_semanal(date)      to authenticated;
grant execute on function public.entrar_no_grupo(text)         to authenticated;
grant execute on function public.is_admin()                    to authenticated;
grant execute on function public.eh_membro_do_grupo(uuid)      to authenticated;
grant execute on function public.compartilha_grupo(uuid)       to authenticated;


-- ==========================================================================
-- >>> 0005_storage.sql
-- ==========================================================================

-- ============================================================================
-- Controle de Faltas — 0005: Storage dos atestados
--
-- §7.1: "Espaço pra anexar foto/PDF do atestado (registro, não é obrigatório
--        pro cálculo)."
--
-- Bucket PRIVADO. Convenção de caminho: {auth.uid()}/{falta_id}.{ext}
-- As policies conferem a primeira pasta do caminho contra o uid de quem pede,
-- então o atestado de um aluno é ilegível para qualquer outro — inclusive
-- para colegas do mesmo grupo. O acesso na UI é sempre por signed URL de
-- curta duração, nunca por URL pública.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'atestados',
  'atestados',
  false,
  10485760, -- 10 MB: foto de atestado ou PDF cabem com folga
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'application/pdf'
  ]
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- storage.objects já vem com RLS habilitado no Supabase; só faltam as policies.
-- Dropamos pelo nome exato (e não em varredura) para não mexer em policies de
-- outros buckets que possam existir no projeto.
drop policy if exists "atestado: envio apenas para a minha pasta" on storage.objects;
drop policy if exists "atestado: leio apenas os meus"            on storage.objects;
drop policy if exists "atestado: substituo apenas os meus"       on storage.objects;
drop policy if exists "atestado: removo apenas os meus"          on storage.objects;

create policy "atestado: envio apenas para a minha pasta"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'atestados'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "atestado: leio apenas os meus"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'atestados'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "atestado: substituo apenas os meus"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'atestados'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'atestados'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "atestado: removo apenas os meus"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'atestados'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


-- ==========================================================================
-- >>> seed.sql
-- ==========================================================================

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
insert into public.disciplina_grade (disciplina_id, dia_semana, horas) values
  -- Medicina, Família e Comunidade — o caso literal da spec
  ('d15c0000-0000-4000-8000-000000000001', 1, 4),  -- segunda 4h
  ('d15c0000-0000-4000-8000-000000000001', 3, 2),  -- quarta  2h

  -- Bioquímica Médica
  ('d15c0000-0000-4000-8000-000000000002', 2, 4),  -- terça   4h
  ('d15c0000-0000-4000-8000-000000000002', 4, 4),  -- quinta  4h

  -- Anatomia Humana II
  ('d15c0000-0000-4000-8000-000000000003', 1, 2),  -- segunda 2h
  ('d15c0000-0000-4000-8000-000000000003', 3, 4),  -- quarta  4h
  ('d15c0000-0000-4000-8000-000000000003', 5, 4),  -- sexta   4h

  -- Fisiologia Humana
  ('d15c0000-0000-4000-8000-000000000004', 2, 2),  -- terça   2h
  ('d15c0000-0000-4000-8000-000000000004', 4, 2),  -- quinta  2h
  ('d15c0000-0000-4000-8000-000000000004', 5, 2),  -- sexta   2h

  -- Semiologia Médica
  ('d15c0000-0000-4000-8000-000000000005', 3, 4),  -- quarta  4h

  -- Saúde Coletiva
  ('d15c0000-0000-4000-8000-000000000006', 5, 2)   -- sexta   2h
on conflict (disciplina_id, dia_semana) do update set
  horas = excluded.horas;

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
