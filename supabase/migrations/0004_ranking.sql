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
