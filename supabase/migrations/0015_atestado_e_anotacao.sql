-- ============================================================================
-- Controle de Faltas — 0015: atestado vira anotação
--
-- Três decisões, e as três apagam mais do que criam:
--
--   1. A falta com atestado CONTA para o limite, sempre. `justificada_conta`
--      sai de disciplinas, grupos e configuracoes. O motivo é que a resposta
--      certa depende do regimento de cada faculdade, e na maioria delas o
--      atestado comum não abona frequência — só o regime de exercícios
--      domiciliares faz isso. Descontar por padrão mostraria verde para quem a
--      secretaria vê em vermelho, e é o único erro aqui que custa o semestre.
--      A marcação continua existindo: é o registro de que o papel existe.
--
--   2. Não há mais prazo de 7 dias para marcar. O prazo é da secretaria, não
--      do app; travar o registro só impedia a pessoa de anotar a verdade.
--      Saem o trigger, a coluna gerada e o carimbo.
--
--   3. Não há mais anexo de arquivo. Saem `anexo_path`, o bucket e as quatro
--      policies de storage — a §7.1 dizia "registro, não é obrigatório pro
--      cálculo", e na prática o anexo sumia da tela depois de enviado.
--
-- ORDEM IMPORTA: a view depende de `configuracoes.justificada_conta`, então
-- ela é substituída ANTES do drop. Fazer o contrário derruba a view junto.
--
-- O valor 'prazo_atestado' continua no enum `tipo_notificacao`: nenhum trigger
-- jamais o gravou, e recriar um tipo enum em uso para apagar um valor morto
-- custaria mais do que deixá-lo inerte. O cliente já não o roteia.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. horas_faltadas() — some o filtro de justificada
--
-- Obrigatório, não cosmético: ela lê `configuracoes.justificada_conta` e
-- quebraria no drop lá embaixo. É chamada pelo trigger de notificação de faixa
-- (0002), que desde a 0013 vinha calculando sob a chave PESSOAL enquanto a
-- view usava a cascata — duas respostas para a mesma pergunta. Agora há uma.
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
    and f.disciplina_id = p_disciplina;
$$;

revoke execute on function public.horas_faltadas(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. v_disciplina_status — mesma cascata, menos um campo
--
-- As colunas de saída não mudam de nome, tipo nem ordem, então `create or
-- replace` basta. `total_justificado` e `qtd_justificadas` continuam: viraram
-- o contador da anotação, um subconjunto de `total_faltado`/`qtd_faltas` em
-- vez de uma parcela descontada deles.
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
    -- Alerta pessoal só aperta, nunca afrouxa: com a turma definindo, o valor
    -- de quem usa entra por LEAST.
    case when gr.faixa_verde is not null
         then least(coalesce(cfg.faixa_verde, gr.faixa_verde), gr.faixa_verde)
         else coalesce(cfg.faixa_verde, 0.150) end                     as faixa_verde,
    case when gr.faixa_amarela is not null
         then least(coalesce(cfg.faixa_amarela, gr.faixa_amarela), gr.faixa_amarela)
         else coalesce(cfg.faixa_amarela, 0.200) end                   as faixa_amarela
) r on true

-- "contadas" agora é todo mundo: com atestado ou sem, a hora perdida conta.
-- O filtro de justificada sobrou só para o contador da anotação.
left join lateral (
  select
    sum(fl.horas_perdidas)                                as horas_contadas,
    sum(fl.horas_perdidas) filter (where fl.justificada)  as horas_justificadas,
    count(*)                                              as qtd_contadas,
    count(*) filter (where fl.justificada)                as qtd_justificadas
  from public.faltas fl
  where fl.usuario_id    = m.usuario_id
    and fl.disciplina_id = m.disciplina_id
) f on true
where m.ativa = true;

comment on view public.v_disciplina_status is
  '§7.2/§8: semáforo por disciplina. O limite vem da cascata (disciplina → comunidade → pessoal → padrão); a falta com atestado conta igual.';

grant select on public.v_disciplina_status to authenticated;

-- ---------------------------------------------------------------------------
-- 3. get_group_ranking — uma fórmula só, agora sem cláusula nenhuma
--
-- A 0013 já tinha tirado a configuração pessoal daqui para que duas pessoas
-- com o mesmo histórico não trocassem de lugar por uma chave que só uma delas
-- viu. Sem `justificada_conta`, não sobra chave alguma: todo mundo é somado
-- pela mesma soma.
-- ---------------------------------------------------------------------------
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
  '§5: devolve APENAS a colocação, e soma todo mundo pela mesma fórmula.';

grant execute on function public.get_group_ranking(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. O prazo de 7 dias sai inteiro
--
-- O trigger fazia duas coisas: recusar depois do prazo e carimbar
-- `data_envio_atestado`. Sem prazo e sem carimbo (a coluna também sai, ninguém
-- a lia), não sobra trabalho para ele.
-- ---------------------------------------------------------------------------
drop trigger if exists trg_faltas_20_atestado on public.faltas;
drop function if exists public.trg_prazo_atestado();

-- ---------------------------------------------------------------------------
-- 5. As colunas
-- ---------------------------------------------------------------------------
alter table public.disciplinas   drop column if exists justificada_conta;
alter table public.grupos        drop column if exists justificada_conta;
alter table public.configuracoes drop column if exists justificada_conta;

alter table public.faltas drop column if exists prazo_justificativa;
alter table public.faltas drop column if exists data_envio_atestado;
alter table public.faltas drop column if exists anexo_path;

-- `disciplina_limite_valido` e `grupo_regra_valida` (0013) não mencionam
-- justificada_conta — só os numéricos —, então continuam válidos como estão.

-- ---------------------------------------------------------------------------
-- 6. O storage dos atestados
--
-- Desfaz a 0005 inteira. O arquivo dela fica no histórico — migration aplicada
-- não se edita —, mas o bucket e as policies deixam de existir. Os objetos
-- precisam sair antes: `storage.buckets` tem FK vinda de `storage.objects`.
-- ---------------------------------------------------------------------------
drop policy if exists "atestado: envio apenas para a minha pasta" on storage.objects;
drop policy if exists "atestado: leio apenas os meus"            on storage.objects;
drop policy if exists "atestado: substituo apenas os meus"       on storage.objects;
drop policy if exists "atestado: removo apenas os meus"          on storage.objects;

delete from storage.objects where bucket_id = 'atestados';
delete from storage.buckets where id        = 'atestados';
