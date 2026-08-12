-- ============================================================================
-- Controle de Faltas — 0013: a regra do curso desce por níveis
--
-- Até aqui, "reprova acima de 25%" e "atestado desconta da carga" eram
-- configuração PESSOAL. Duas consequências:
--
--   1. Cada um decidia a própria régua. A regra vem do regimento do curso, e
--      um controle deslizante que vai a 50% deixa o app concordar com quem
--      quiser se enganar.
--   2. O ranking comparava gente sob fórmulas diferentes: get_group_ranking
--      lia o `justificada_conta` DE CADA MEMBRO ao somar as horas. Quem ligava
--      a opção era ordenado por uma conta; quem não ligava, por outra.
--
-- A partir daqui a regra é resolvida em cascata, do específico ao geral, com
-- cada nível guardando NULL para dizer "não decido isto, pergunte acima":
--
--   disciplina  →  comunidade  →  configuração pessoal  →  padrão (25/15/20)
--
-- As faixas de alerta (verde/amarelo) são o único ajuste que continua pessoal,
-- e só para BAIXO: querer ser avisado antes é meta de quem usa; querer ser
-- avisado depois é mexer na régua da turma.
--
-- O elo entre disciplina e comunidade é `matriculas.grupo_id`, que existia
-- desde a 0001 e nunca era preenchido: a RPC que o preenche
-- (vincular_disciplinas_ao_grupo, 0007) jamais foi chamada pelo app. Por isso
-- o ranking geral somava carga zero e empatava a turma inteira em 1º lugar.
-- Esta migration faz o backfill e o cliente passa a chamá-la.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Chave de comparação acadêmica
--
-- "5º Período", "5º  período" e "5o periodo" são a mesma coisa para um
-- humano, e o casamento entre disciplina e comunidade não pode falhar por
-- causa disso — falhar aqui deixa a pessoa fora do ranking sem explicação.
-- Devolve NULL para vazio, e não string vazia, para que dois campos em branco
-- NÃO casem entre si.
-- ---------------------------------------------------------------------------
create or replace function public.chave_academica(p_texto text)
returns text
language sql
immutable
as $$
  select nullif(btrim(regexp_replace(public.normalizar_busca(p_texto), '\s+', ' ', 'g')), '');
$$;

comment on function public.chave_academica(text) is
  'Normaliza curso/período/turma para comparação. Espelha chave() em src/domain/comunidades.ts.';

-- ---------------------------------------------------------------------------
-- Nível 1: a disciplina
--
-- É onde a regra mora na vida real — a frequência mínima é por componente
-- curricular, e estágio costuma ter regra própria. Anulável porque a esmagadora
-- maioria das disciplinas segue a regra da turma e não precisa repeti-la.
-- Faixa de alerta não entra aqui: alerta é de quem olha, não da matéria.
-- ---------------------------------------------------------------------------
alter table public.disciplinas
  add column if not exists limite_reprovacao numeric(4, 3),
  add column if not exists justificada_conta boolean;

alter table public.disciplinas drop constraint if exists disciplina_limite_valido;
alter table public.disciplinas
  add constraint disciplina_limite_valido
  check (limite_reprovacao is null or (limite_reprovacao > 0 and limite_reprovacao <= 1));

comment on column public.disciplinas.limite_reprovacao is
  'NULL = herda da comunidade. Preenchido só quando esta disciplina foge da regra geral.';

-- ---------------------------------------------------------------------------
-- Nível 2: a comunidade
--
-- Quem administra a turma responde pelo regimento. Sem RPC nova: a policy
-- "comunidade: dono e admin editam" da 0006 já governa o UPDATE em grupos, e
-- ela usa eh_admin_do_grupo() — membro comum não passa.
-- ---------------------------------------------------------------------------
alter table public.grupos
  add column if not exists limite_reprovacao numeric(4, 3),
  add column if not exists faixa_verde       numeric(4, 3),
  add column if not exists faixa_amarela     numeric(4, 3),
  add column if not exists justificada_conta boolean;

alter table public.grupos drop constraint if exists grupo_regra_valida;
alter table public.grupos
  add constraint grupo_regra_valida
  check (
    (limite_reprovacao is null or (limite_reprovacao > 0 and limite_reprovacao <= 1))
    and (faixa_verde   is null or (faixa_verde   > 0 and faixa_verde   <= 1))
    and (faixa_amarela is null or (faixa_amarela > 0 and faixa_amarela <= 1))
    -- A ordem só é exigível entre os que existem: uma turma pode definir só o
    -- limite e deixar as faixas para cada um.
    and (faixa_verde is null or faixa_amarela is null or faixa_verde < faixa_amarela)
    and (faixa_amarela is null or limite_reprovacao is null or faixa_amarela <= limite_reprovacao)
  );

comment on column public.grupos.limite_reprovacao is
  'A regra do curso, para todas as disciplinas vinculadas a esta comunidade. NULL = não decide.';

-- ---------------------------------------------------------------------------
-- O elo, agora tolerante a acento e caixa
--
-- Mesma função da 0007, com uma diferença: compara por chave_academica em vez
-- de igualdade crua. Um catálogo com "Medicina" e uma comunidade com
-- "medicina" deixavam de casar, e o sintoma — ranking vazio — não aponta para
-- a causa.
-- ---------------------------------------------------------------------------
create or replace function public.vincular_disciplinas_ao_grupo(p_grupo_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_grupo public.grupos%rowtype;
  v_qtd   integer;
begin
  if not exists (
    select 1 from public.grupo_membros
    where grupo_id = p_grupo_id and usuario_id = v_uid and status = 'ativo'
  ) then
    raise exception 'Você não participa desta comunidade.' using errcode = '42501';
  end if;

  select * into v_grupo from public.grupos where id = p_grupo_id;

  -- Sem curso/período a comunidade é um grupo de amigos: não há catálogo a
  -- casar, e as matrículas ficam como estão.
  if public.chave_academica(v_grupo.curso) is null
     or public.chave_academica(v_grupo.periodo) is null then
    return 0;
  end if;

  update public.matriculas m
     set grupo_id = p_grupo_id
    from public.disciplinas d
   where d.id = m.disciplina_id
     and m.usuario_id = v_uid
     and m.ativa = true
     -- Disciplina pessoal nunca entra: ela é só sua, e somá-la ao ranking
     -- compararia gente que cursa coisas diferentes.
     and d.personalizada = false
     and public.chave_academica(d.curso)   = public.chave_academica(v_grupo.curso)
     and public.chave_academica(d.periodo) = public.chave_academica(v_grupo.periodo)
     and (
       public.chave_academica(v_grupo.turma) is null
       or public.chave_academica(d.turma) is null
       or public.chave_academica(d.turma) = public.chave_academica(v_grupo.turma)
     );

  get diagnostics v_qtd = row_count;
  return v_qtd;
end;
$$;

-- ---------------------------------------------------------------------------
-- Backfill: quem já estava em turma continua sem vínculo até hoje
--
-- Vincula só quando UMA comunidade casa. Com duas, o certo é perguntar — e a
-- tela de disciplinas pergunta. Chutar aqui colocaria a pessoa num ranking de
-- desconhecidos e faria a disciplina herdar a regra de outro curso.
-- ---------------------------------------------------------------------------
with alvo as (
  select
    m.usuario_id,
    m.disciplina_id,
    (array_agg(g.id))[1] as grupo_id,
    count(*)             as quantas
  from public.matriculas m
  join public.disciplinas d
    on d.id = m.disciplina_id and d.personalizada = false
  join public.grupo_membros gm
    on gm.usuario_id = m.usuario_id and gm.status = 'ativo'
  join public.grupos g
    on g.id = gm.grupo_id and g.tipo <> 'amigos'
  where m.grupo_id is null
    and m.ativa = true
    and public.chave_academica(g.curso)   = public.chave_academica(d.curso)
    and public.chave_academica(g.periodo) = public.chave_academica(d.periodo)
    and (
      public.chave_academica(g.turma) is null
      or public.chave_academica(d.turma) is null
      or public.chave_academica(g.turma) = public.chave_academica(d.turma)
    )
  group by m.usuario_id, m.disciplina_id
)
update public.matriculas m
   set grupo_id = a.grupo_id
  from alvo a
 where a.usuario_id    = m.usuario_id
   and a.disciplina_id = m.disciplina_id
   and a.quantas = 1
   and m.grupo_id is null;

-- ---------------------------------------------------------------------------
-- v_disciplina_status — a mesma cascata que o cliente aplica
--
-- O app calcula em src/domain (offline, fonte única da matemática), mas quando
-- servidor e cliente discordam sobre a REGRA o número muda de lugar sem
-- explicação. Aqui a cascata é replicada campo a campo.
--
-- A turma que governa é a da matrícula. Quando a matrícula não tem turma —
-- disciplina pessoal, ou vínculo ainda não feito — vale a única turma ativa do
-- aluno; com duas, nenhuma, e cai no nível pessoal.
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

  coalesce(f.horas_contadas, 0)                                        as total_faltado,
  coalesce(f.horas_justificadas, 0)                                    as total_justificado,
  coalesce(f.qtd_contadas, 0)::int                                     as qtd_faltas,
  coalesce(f.qtd_justificadas, 0)::int                                 as qtd_justificadas,

  round(coalesce(f.horas_contadas, 0) / d.carga_horaria_total, 4)      as percentual,

  round(d.carga_horaria_total * r.limite_reprovacao, 2)                as horas_limite,
  greatest(
    round(d.carga_horaria_total * r.limite_reprovacao - coalesce(f.horas_contadas, 0), 2),
    0
  )                                                                    as horas_restantes,

  (case
     when coalesce(f.horas_contadas, 0) / d.carga_horaria_total
            > r.limite_reprovacao then 'reprovado'
     when coalesce(f.horas_contadas, 0) / d.carga_horaria_total
            > r.faixa_amarela     then 'vermelho'
     when coalesce(f.horas_contadas, 0) / d.carga_horaria_total
            > r.faixa_verde       then 'amarelo'
     else 'verde'
   end)::public.status_risco                                           as status,

  -- De onde veio o limite. A interface escreve "definido pela sua turma" em
  -- vez de mostrar um número sem dono.
  (case
     when d.limite_reprovacao  is not null then 'disciplina'
     when gr.limite_reprovacao is not null then 'comunidade'
     when cfg.limite_reprovacao is not null then 'usuario'
     else 'padrao'
   end)                                                                as origem_do_limite

from public.matriculas m
join public.disciplinas d on d.id = m.disciplina_id
join public.profiles p    on p.id = m.usuario_id
left join public.configuracoes cfg on cfg.usuario_id = m.usuario_id

-- A única turma ativa do aluno, quando existe exatamente uma.
left join lateral (
  select case when count(*) = 1 then (array_agg(g.id))[1] end as id
  from public.grupo_membros gm
  join public.grupos g on g.id = gm.grupo_id
  where gm.usuario_id = m.usuario_id
    and gm.status = 'ativo'
    and g.tipo <> 'amigos'
    and public.chave_academica(g.curso)   = public.chave_academica(p.curso)
    and public.chave_academica(g.periodo) = public.chave_academica(p.periodo)
    and (
      public.chave_academica(g.turma) is null
      or public.chave_academica(p.turma) is null
      or public.chave_academica(g.turma) = public.chave_academica(p.turma)
    )
) turma_unica on true
left join public.grupos gr on gr.id = coalesce(m.grupo_id, turma_unica.id)

left join lateral (
  select
    coalesce(d.limite_reprovacao, gr.limite_reprovacao, cfg.limite_reprovacao, 0.250)
      as limite_reprovacao,
    coalesce(d.justificada_conta, gr.justificada_conta, cfg.justificada_conta, false)
      as justificada_conta,
    -- Alerta pessoal só aperta, nunca afrouxa: com a turma definindo, o valor
    -- de quem usa entra por LEAST.
    case when gr.faixa_verde is not null
         then least(coalesce(cfg.faixa_verde, gr.faixa_verde), gr.faixa_verde)
         else coalesce(cfg.faixa_verde, 0.150) end                     as faixa_verde,
    case when gr.faixa_amarela is not null
         then least(coalesce(cfg.faixa_amarela, gr.faixa_amarela), gr.faixa_amarela)
         else coalesce(cfg.faixa_amarela, 0.200) end                   as faixa_amarela
) r on true

left join lateral (
  select
    sum(fl.horas_perdidas) filter (
      where not fl.justificada or r.justificada_conta
    )                                                    as horas_contadas,
    sum(fl.horas_perdidas) filter (where fl.justificada)  as horas_justificadas,
    count(*) filter (
      where not fl.justificada or r.justificada_conta
    )                                                    as qtd_contadas,
    count(*) filter (where fl.justificada)               as qtd_justificadas
  from public.faltas fl
  where fl.usuario_id    = m.usuario_id
    and fl.disciplina_id = m.disciplina_id
) f on true
where m.ativa = true;

comment on view public.v_disciplina_status is
  '§7.2/§8: semáforo por disciplina, com a regra resolvida em cascata (disciplina → comunidade → pessoal → padrão).';

grant select on public.v_disciplina_status to authenticated;

-- ===========================================================================
-- §5 — RANKING: uma regra só para a comparação inteira
--
-- A ordenação usava o `justificada_conta` de cada membro. Duas pessoas com o
-- mesmo histórico de faltas trocavam de lugar por causa de uma configuração
-- que só uma delas tinha mexido — e ninguém tinha como perceber, porque a
-- função devolve só a colocação.
--
-- Agora a regra vem da DISCIPLINA e, na falta dela, da COMUNIDADE: valores
-- iguais para todo mundo que está sendo comparado. `configuracoes` não entra
-- aqui de propósito.
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
  v_uid       uuid := auth.uid();
  v_membros   integer;
  v_do_grupo  boolean;
begin
  if v_uid is null then
    raise exception 'Não autenticado.' using errcode = '42501';
  end if;

  -- Só quem é membro ATIVO. Um solicitante não lê o ranking da turma.
  if not exists (
    select 1 from public.grupo_membros gm
    where gm.grupo_id = p_grupo_id
      and gm.usuario_id = v_uid
      and gm.status = 'ativo'
  ) then
    raise exception 'Você não participa deste grupo.' using errcode = '42501';
  end if;

  -- Conta só os ativos: senão bastaria convidar um fantasma para um grupo de
  -- duas pessoas destravar a comparação.
  select count(*) into v_membros
  from public.grupo_membros gm
  where gm.grupo_id = p_grupo_id
    and gm.status = 'ativo';

  -- Guarda de privacidade: com duas pessoas, saber que você é o "2º" é saber
  -- exatamente que a outra faltou menos. Só há anonimato a partir de três.
  if v_membros < 3 then
    return;
  end if;

  select coalesce(g.justificada_conta, false) into v_do_grupo
  from public.grupos g where g.id = p_grupo_id;

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
          -- A mesma regra para todos os comparados: a da disciplina, ou a da
          -- turma. Nunca a configuração pessoal de cada um.
          or coalesce(d.justificada_conta, v_do_grupo)
        )
    ) f on true
    where gm.grupo_id = p_grupo_id
      and gm.status = 'ativo'
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
  '§5: devolve APENAS a colocação, e ordena todos sob a mesma regra (disciplina → comunidade).';

-- ---------------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------------
revoke execute on function public.chave_academica(text) from anon;
grant execute on function public.chave_academica(text) to authenticated;
grant execute on function public.get_group_ranking(uuid, uuid) to authenticated;
grant execute on function public.vincular_disciplinas_ao_grupo(uuid) to authenticated;
