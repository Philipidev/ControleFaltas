-- ============================================================================
-- Controle de Faltas — 0007: RPCs das comunidades
--
-- Toda transição de status passa por aqui. O RLS de 0006 fecha INSERT e UPDATE
-- em grupo_membros para o cliente de propósito: se a tabela fosse gravável
-- direto, qualquer pessoa se inseriria como 'ativo' em qualquer comunidade e
-- todo o resto (ranking, leitura de perfis) cairia junto. Estas funções são a
-- única porta, e cada uma checa quem pode o quê.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Criar comunidade
-- Grupo e linha de dono na MESMA transação: em duas chamadas separadas do
-- cliente, uma falha na segunda deixaria uma comunidade sem dono — visível no
-- catálogo e impossível de administrar.
-- ---------------------------------------------------------------------------
create or replace function public.criar_comunidade(
  p_nome         text,
  p_visibilidade public.visibilidade_grupo default 'fechada',
  p_instituicao  text default null,
  p_curso        text default null,
  p_periodo      text default null,
  p_turma        text default null,
  p_descricao    text default null,
  p_emoji        text default '🎓'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_grupo uuid;
begin
  if v_uid is null then
    raise exception 'Não autenticado.' using errcode = '42501';
  end if;

  if btrim(coalesce(p_nome, '')) = '' then
    raise exception 'A comunidade precisa de um nome.' using errcode = 'P0001';
  end if;

  insert into public.grupos
    (nome, tipo, visibilidade, instituicao, curso, periodo, turma, descricao, emoji, criado_por)
  values
    (btrim(p_nome), 'turma', p_visibilidade, nullif(btrim(coalesce(p_instituicao, '')), ''),
     nullif(btrim(coalesce(p_curso, '')), ''), nullif(btrim(coalesce(p_periodo, '')), ''),
     nullif(btrim(coalesce(p_turma, '')), ''), nullif(btrim(coalesce(p_descricao, '')), ''),
     coalesce(nullif(btrim(coalesce(p_emoji, '')), ''), '🎓'), v_uid)
  returning id into v_grupo;

  insert into public.grupo_membros (grupo_id, usuario_id, papel, status)
  values (v_grupo, v_uid, 'dono', 'ativo');

  return v_grupo;
end;
$$;

-- ---------------------------------------------------------------------------
-- Catálogo de comunidades
--
-- Devolve nome, instituição, quantidade de membros e o MEU status. Nada
-- derivado de faltas sai daqui — a contagem de membros não diz nada sobre
-- frequência de ninguém.
--
-- 'secreta' nunca aparece: ela existe só para quem tem o código de convite.
-- ---------------------------------------------------------------------------
create or replace function public.buscar_comunidades(
  p_termo  text default '',
  p_limite integer default 30
)
returns table (
  id           uuid,
  nome         text,
  emoji        text,
  instituicao  text,
  curso        text,
  periodo      text,
  turma        text,
  descricao    text,
  visibilidade public.visibilidade_grupo,
  membros      integer,
  meu_status   public.status_membro,
  meu_papel    text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with candidatas as (
    select
      g.*,
      public.normalizar_busca(
        coalesce(g.nome, '') || ' ' || coalesce(g.instituicao, '') || ' ' ||
        coalesce(g.curso, '') || ' ' || coalesce(g.periodo, '') || ' ' ||
        coalesce(g.turma, '')
      ) as texto
    from public.grupos g
    where g.arquivada = false
      and g.visibilidade in ('publica', 'fechada')
  ),
  termos as (
    select btrim(palavra) as palavra
    from unnest(string_to_array(public.normalizar_busca(p_termo), ' ')) as palavra
    where btrim(palavra) <> ''
  )
  select
    c.id,
    c.nome,
    c.emoji,
    c.instituicao,
    c.curso,
    c.periodo,
    c.turma,
    c.descricao,
    c.visibilidade,
    (select count(*)::integer from public.grupo_membros gm
      where gm.grupo_id = c.id and gm.status = 'ativo'),
    (select gm.status from public.grupo_membros gm
      where gm.grupo_id = c.id and gm.usuario_id = auth.uid()),
    (select gm.papel from public.grupo_membros gm
      where gm.grupo_id = c.id and gm.usuario_id = auth.uid())
  from candidatas c
  -- "nenhum termo deixou de casar" = todos casaram. Com termo vazio a
  -- subconsulta não tem linhas, então a condição é verdadeira e volta tudo.
  where not exists (
    select 1 from termos t where c.texto not like '%' || t.palavra || '%'
  )
  order by
    (select count(*) from public.grupo_membros gm
      where gm.grupo_id = c.id and gm.status = 'ativo') desc,
    c.nome
  limit greatest(least(p_limite, 100), 1);
$$;

-- ---------------------------------------------------------------------------
-- Solicitar acesso
-- Em comunidade pública entra na hora; em fechada entra na fila do admin.
-- ---------------------------------------------------------------------------
create or replace function public.solicitar_acesso(
  p_grupo_id uuid,
  p_mensagem text default null
)
returns public.status_membro
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_grupo  public.grupos%rowtype;
  v_atual  public.status_membro;
  v_novo   public.status_membro;
begin
  if v_uid is null then
    raise exception 'Não autenticado.' using errcode = '42501';
  end if;

  select * into v_grupo from public.grupos where id = p_grupo_id;
  if not found or v_grupo.arquivada then
    raise exception 'Comunidade não encontrada.' using errcode = 'P0001';
  end if;

  if v_grupo.visibilidade = 'secreta' then
    raise exception 'Esta comunidade é secreta — entre pelo código de convite.'
      using errcode = '42501';
  end if;

  select status into v_atual
  from public.grupo_membros
  where grupo_id = p_grupo_id and usuario_id = v_uid;

  if v_atual = 'ativo' then
    return 'ativo';
  end if;

  -- Um convite pendente vira entrada direta: quem foi convidado e resolveu
  -- pedir para entrar já tinha autorização do admin.
  v_novo := case
    when v_grupo.visibilidade = 'publica' then 'ativo'
    when v_atual = 'convidado' then 'ativo'
    else 'solicitado'
  end;

  insert into public.grupo_membros (grupo_id, usuario_id, papel, status, mensagem)
  values (p_grupo_id, v_uid, 'membro', v_novo, nullif(btrim(coalesce(p_mensagem, '')), ''))
  on conflict (grupo_id, usuario_id) do update
    set status        = excluded.status,
        mensagem      = excluded.mensagem,
        respondido_em = case when excluded.status = 'ativo' then now() else null end;

  if v_novo = 'ativo' then
    perform public.vincular_disciplinas_ao_grupo(p_grupo_id);
  else
    -- Avisa quem pode aprovar. Sem isso a solicitação some no silêncio.
    insert into public.notificacoes (usuario_id, tipo, titulo, corpo, dados)
    select
      gm.usuario_id,
      'solicitacao_grupo',
      '🙋 Novo pedido para entrar em ' || v_grupo.nome,
      coalesce((select p.nome from public.profiles p where p.id = v_uid), 'Alguém')
        || ' quer participar da comunidade.',
      jsonb_build_object('grupoId', p_grupo_id, 'usuarioId', v_uid)
    from public.grupo_membros gm
    where gm.grupo_id = p_grupo_id
      and gm.status = 'ativo'
      and gm.papel in ('dono', 'admin');
  end if;

  return v_novo;
end;
$$;

-- ---------------------------------------------------------------------------
-- Aprovar ou recusar solicitação (dono/admin)
-- ---------------------------------------------------------------------------
create or replace function public.responder_solicitacao(
  p_grupo_id   uuid,
  p_usuario_id uuid,
  p_aprovar    boolean
)
returns public.status_membro
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_nome_grupo text;
  v_novo       public.status_membro;
begin
  if not public.eh_admin_do_grupo(p_grupo_id) then
    raise exception 'Só quem administra a comunidade pode responder solicitações.'
      using errcode = '42501';
  end if;

  select nome into v_nome_grupo from public.grupos where id = p_grupo_id;
  v_novo := case when p_aprovar then 'ativo' else 'recusado' end;

  update public.grupo_membros
     set status = v_novo, respondido_em = now()
   where grupo_id = p_grupo_id
     and usuario_id = p_usuario_id
     and status = 'solicitado';

  if not found then
    raise exception 'Não há solicitação pendente desta pessoa.' using errcode = 'P0001';
  end if;

  insert into public.notificacoes (usuario_id, tipo, titulo, corpo, dados)
  values (
    p_usuario_id,
    'resposta_grupo',
    case when p_aprovar
      then '🎉 Você entrou em ' || coalesce(v_nome_grupo, 'uma comunidade')
      else 'Pedido não aceito em ' || coalesce(v_nome_grupo, 'uma comunidade') end,
    case when p_aprovar
      then 'Agora você aparece no ranking da turma.'
      else 'Você pode pedir de novo mais tarde.' end,
    jsonb_build_object('grupoId', p_grupo_id)
  );

  return v_novo;
end;
$$;

-- ---------------------------------------------------------------------------
-- Convidar por e-mail (dono/admin)
--
-- RESPOSTA UNIFORME: 'convidado' tanto para e-mail com conta quanto para
-- e-mail sem conta. Se respondesse coisas diferentes, o formulário viraria um
-- confirmador de quais e-mails têm conta no app — qualquer um criaria uma
-- comunidade só para testar endereços. O único retorno diferente é
-- 'ja_membro', e esse não vaza nada: o admin já vê a lista de membros.
-- ---------------------------------------------------------------------------
create or replace function public.convidar_para_grupo(
  p_grupo_id uuid,
  p_email    text
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid        uuid := auth.uid();
  v_email      text := lower(btrim(coalesce(p_email, '')));
  v_alvo       uuid;
  v_status     public.status_membro;
  v_nome_grupo text;
begin
  if not public.eh_admin_do_grupo(p_grupo_id) then
    raise exception 'Só quem administra a comunidade pode convidar.' using errcode = '42501';
  end if;

  if position('@' in v_email) < 2 then
    raise exception 'E-mail inválido.' using errcode = 'P0001';
  end if;

  select nome into v_nome_grupo from public.grupos where id = p_grupo_id;
  select id into v_alvo from auth.users where lower(email) = v_email limit 1;

  if v_alvo is null then
    insert into public.grupo_convites_email (grupo_id, email, convidado_por)
    values (p_grupo_id, v_email, v_uid)
    on conflict (grupo_id, email) do nothing;
    return 'convidado';
  end if;

  select status into v_status
  from public.grupo_membros
  where grupo_id = p_grupo_id and usuario_id = v_alvo;

  if v_status = 'ativo' then
    return 'ja_membro';
  end if;

  insert into public.grupo_membros (grupo_id, usuario_id, papel, status, convidado_por)
  values (p_grupo_id, v_alvo, 'membro', 'convidado', v_uid)
  on conflict (grupo_id, usuario_id) do update
    set status = 'convidado', convidado_por = v_uid, respondido_em = null;

  insert into public.notificacoes (usuario_id, tipo, titulo, corpo, dados)
  values (
    v_alvo,
    'convite_grupo',
    '✉️ Convite para ' || coalesce(v_nome_grupo, 'uma comunidade'),
    coalesce((select p.nome from public.profiles p where p.id = v_uid), 'Alguém')
      || ' convidou você. Aceite ou recuse quando quiser.',
    jsonb_build_object('grupoId', p_grupo_id)
  );

  return 'convidado';
end;
$$;

-- ---------------------------------------------------------------------------
-- Aceitar ou recusar convite (o próprio convidado)
-- ---------------------------------------------------------------------------
create or replace function public.responder_convite(
  p_grupo_id uuid,
  p_aceitar  boolean
)
returns public.status_membro
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_novo public.status_membro;
begin
  if v_uid is null then
    raise exception 'Não autenticado.' using errcode = '42501';
  end if;

  v_novo := case when p_aceitar then 'ativo' else 'recusado' end;

  update public.grupo_membros
     set status = v_novo, respondido_em = now()
   where grupo_id = p_grupo_id
     and usuario_id = v_uid
     and status = 'convidado';

  if not found then
    raise exception 'Você não tem convite pendente nesta comunidade.' using errcode = 'P0001';
  end if;

  if p_aceitar then
    perform public.vincular_disciplinas_ao_grupo(p_grupo_id);
  end if;

  return v_novo;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sair / remover membro
-- O dono não sai sem transferir: senão a comunidade fica sem quem aprove
-- solicitações, convide ou edite — visível no catálogo e abandonada.
-- ---------------------------------------------------------------------------
create or replace function public.remover_membro(
  p_grupo_id   uuid,
  p_usuario_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_alvo  uuid := coalesce(p_usuario_id, auth.uid());
  v_papel text;
begin
  if v_uid is null then
    raise exception 'Não autenticado.' using errcode = '42501';
  end if;

  if v_alvo <> v_uid and not public.eh_admin_do_grupo(p_grupo_id) then
    raise exception 'Só quem administra a comunidade pode remover outra pessoa.'
      using errcode = '42501';
  end if;

  select papel into v_papel
  from public.grupo_membros
  where grupo_id = p_grupo_id and usuario_id = v_alvo;

  if v_papel = 'dono' then
    raise exception 'Transfira a comunidade para outra pessoa antes de sair.'
      using errcode = 'P0001';
  end if;

  delete from public.grupo_membros
  where grupo_id = p_grupo_id and usuario_id = v_alvo;

  -- As matrículas ficam, só deixam de apontar para este grupo.
  update public.matriculas
     set grupo_id = null
   where usuario_id = v_alvo and grupo_id = p_grupo_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Transferir a propriedade (só o dono)
-- ---------------------------------------------------------------------------
create or replace function public.transferir_propriedade(
  p_grupo_id  uuid,
  p_novo_dono uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not exists (
    select 1 from public.grupo_membros
    where grupo_id = p_grupo_id and usuario_id = v_uid
      and papel = 'dono' and status = 'ativo'
  ) then
    raise exception 'Só o dono pode transferir a comunidade.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.grupo_membros
    where grupo_id = p_grupo_id and usuario_id = p_novo_dono and status = 'ativo'
  ) then
    raise exception 'A pessoa precisa ser membro ativo da comunidade.' using errcode = 'P0001';
  end if;

  update public.grupo_membros set papel = 'admin'
   where grupo_id = p_grupo_id and usuario_id = v_uid;

  update public.grupo_membros set papel = 'dono'
   where grupo_id = p_grupo_id and usuario_id = p_novo_dono;

  -- criado_por é o que a policy de DELETE usa; sem isto o dono antigo
  -- continuaria podendo apagar a comunidade.
  update public.grupos set criado_por = p_novo_dono where id = p_grupo_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Promover / rebaixar admin (só o dono)
-- ---------------------------------------------------------------------------
create or replace function public.definir_papel(
  p_grupo_id   uuid,
  p_usuario_id uuid,
  p_admin      boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.grupo_membros
    where grupo_id = p_grupo_id and usuario_id = auth.uid()
      and papel = 'dono' and status = 'ativo'
  ) then
    raise exception 'Só o dono pode definir administradores.' using errcode = '42501';
  end if;

  update public.grupo_membros
     set papel = case when p_admin then 'admin' else 'membro' end
   where grupo_id = p_grupo_id
     and usuario_id = p_usuario_id
     and status = 'ativo'
     and papel <> 'dono';
end;
$$;

-- ---------------------------------------------------------------------------
-- O elo que faz o ranking funcionar
--
-- O ranking compara pessoas via matriculas.grupo_id. Entrar numa comunidade
-- não preenche esse campo sozinho — sem isto, alguém entra na turma e vê um
-- ranking vazio, e o recurso parece quebrado.
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
  if v_grupo.curso is null or v_grupo.periodo is null then
    return 0;
  end if;

  update public.matriculas m
     set grupo_id = p_grupo_id
    from public.disciplinas d
   where d.id = m.disciplina_id
     and m.usuario_id = v_uid
     and m.ativa = true
     and d.personalizada = false
     and d.curso = v_grupo.curso
     and d.periodo = v_grupo.periodo
     and (v_grupo.turma is null or d.turma is null or d.turma = v_grupo.turma);

  get diagnostics v_qtd = row_count;
  return v_qtd;
end;
$$;

-- ---------------------------------------------------------------------------
-- Badge do menu: quantos convites tenho e quantas solicitações preciso responder
-- ---------------------------------------------------------------------------
create or replace function public.contar_pendencias()
returns table (convites integer, solicitacoes integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    (select count(*)::integer from public.grupo_membros gm
      where gm.usuario_id = auth.uid() and gm.status = 'convidado'),
    (select count(*)::integer
       from public.grupo_membros pedido
       join public.grupo_membros eu
         on eu.grupo_id = pedido.grupo_id
        and eu.usuario_id = auth.uid()
        and eu.status = 'ativo'
        and eu.papel in ('dono', 'admin')
      where pedido.status = 'solicitado');
$$;

-- ---------------------------------------------------------------------------
-- Permissões: autenticado sim, anon nunca
-- ---------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'criar_comunidade(text, public.visibilidade_grupo, text, text, text, text, text, text)',
    'buscar_comunidades(text, integer)',
    'solicitar_acesso(uuid, text)',
    'responder_solicitacao(uuid, uuid, boolean)',
    'convidar_para_grupo(uuid, text)',
    'responder_convite(uuid, boolean)',
    'remover_membro(uuid, uuid)',
    'transferir_propriedade(uuid, uuid)',
    'definir_papel(uuid, uuid, boolean)',
    'vincular_disciplinas_ao_grupo(uuid)',
    'contar_pendencias()'
  ]
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
