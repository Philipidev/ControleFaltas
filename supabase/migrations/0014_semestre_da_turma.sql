-- ============================================================================
-- Controle de Faltas — 0014: o semestre é da turma, o arquivo é de cada um
--
-- O rótulo "2026.2" saía do calendário (`semestreAtual()` no cliente: até
-- junho é .1, depois é .2). Isso erra para quem estuda num curso que começa em
-- fevereiro e acaba em dezembro, e — pior — deixa cada membro da mesma turma
-- virar o semestre num dia diferente. Enquanto metade arquivou e metade não, o
-- ranking compara um semestre que acabou com outro que começou.
--
-- Quem sabe quando o semestre acaba é a turma. Então ela passa a dizer, e cada
-- pessoa arquiva o seu quando quiser.
--
-- O que NÃO entra aqui, de propósito: o dono virar o semestre não apaga falta
-- de ninguém. `historico_semestres` continua por usuário, e o arquivamento
-- continua sendo um ato de quem tem os dados. Um botão que apaga o semestre de
-- 40 pessoas não deveria existir na mão de um colega.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- O valor novo do enum fica isolado no topo: `alter type ... add value` tem
-- restrições dentro de transação, e nenhum comando abaixo usa o valor novo em
-- literal — ele só aparece por variável, dentro da função.
-- ---------------------------------------------------------------------------
alter type public.notificacao_tipo add value if not exists 'virada_semestre';

-- ---------------------------------------------------------------------------
-- O calendário da turma
-- ---------------------------------------------------------------------------
alter table public.grupos
  add column if not exists semestre        text,
  add column if not exists fim_do_semestre date;

comment on column public.grupos.semestre is
  'Rótulo do período letivo corrente, ex: 2026.2. NULL = a turma não diz, e cada um usa a data.';
comment on column public.grupos.fim_do_semestre is
  'Último dia letivo. Alimenta a exportação para o calendário e o aviso de virada.';

-- ---------------------------------------------------------------------------
-- Virar o semestre
--
-- RPC, e não UPDATE direto, por causa da segunda metade: avisar os membros.
-- Inserir notificação na caixa de outra pessoa é justamente o que o RLS de
-- `notificacoes` proíbe, e com razão. Aqui a exceção é controlada — só quem
-- administra, só para membros ativos, e a mensagem é fixa.
-- ---------------------------------------------------------------------------
create or replace function public.virar_semestre_da_turma(
  p_grupo_id uuid,
  p_semestre text,
  p_fim      date default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := auth.uid();
  v_grupo    public.grupos%rowtype;
  v_semestre text := nullif(btrim(coalesce(p_semestre, '')), '');
  v_avisados integer;
begin
  if v_uid is null then
    raise exception 'Não autenticado.' using errcode = '42501';
  end if;

  if not public.eh_admin_do_grupo(p_grupo_id) then
    raise exception 'Só quem administra a comunidade define o semestre.' using errcode = '42501';
  end if;

  if v_semestre is null then
    raise exception 'O semestre precisa de um rótulo, como 2026.2.' using errcode = 'P0001';
  end if;

  select * into v_grupo from public.grupos where id = p_grupo_id;

  update public.grupos
     set semestre = v_semestre,
         fim_do_semestre = p_fim
   where id = p_grupo_id;

  -- Só avisa quando o rótulo MUDA. Corrigir a data de fim não é virada de
  -- semestre, e um aviso desses ensina a ignorar os próximos.
  if v_grupo.semestre is distinct from v_semestre then
    insert into public.notificacoes (usuario_id, tipo, titulo, corpo, dados)
    select
      gm.usuario_id,
      'virada_semestre',
      format('%s começou em %s', v_semestre, v_grupo.nome),
      case
        when v_grupo.semestre is null
          then 'Quando terminar o período, arquive suas faltas em Relatórios.'
        else format('Arquive %s em Relatórios para começar o novo com o contador zerado.',
                    v_grupo.semestre)
      end,
      jsonb_build_object('grupoId', p_grupo_id, 'semestre', v_semestre,
                         'anterior', v_grupo.semestre)
    from public.grupo_membros gm
    where gm.grupo_id = p_grupo_id
      and gm.status = 'ativo'
      and gm.usuario_id <> v_uid;

    get diagnostics v_avisados = row_count;
  else
    v_avisados := 0;
  end if;

  return v_avisados;
end;
$$;

comment on function public.virar_semestre_da_turma(uuid, text, date) is
  'Define o semestre da comunidade e avisa os membros ativos. Não apaga dado de ninguém.';

revoke execute on function public.virar_semestre_da_turma(uuid, text, date) from public, anon;
grant execute on function public.virar_semestre_da_turma(uuid, text, date) to authenticated;
