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
