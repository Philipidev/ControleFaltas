-- ============================================================================
-- Controle de Faltas — 0006: comunidades
--
-- Transforma os grupos-esqueleto num catálogo de comunidades: qualquer pessoa
-- cria a sua e vira dona, os outros solicitam acesso ou são convidados, e o
-- convidado aceita ou recusa depois.
--
-- ─────────────────────────────────────────────────────────────────────────
-- O QUE NÃO PODE SAIR ERRADO AQUI
--
-- Ao existir membro PENDENTE, quatro funções que hoje perguntam "essa pessoa
-- está no grupo?" passariam a responder "sim" para quem só bateu na porta:
--
--   compartilha_grupo()      → libera o SELECT em profiles. Sem o filtro,
--                              qualquer um solicita acesso a uma comunidade
--                              pública e passa a ler nome, curso, período e
--                              turma de todos os membros, sem ser aprovado.
--   eh_membro_do_grupo()     → libera ver o grupo e a lista de membros.
--   get_group_ranking()      → libera ler o ranking da turma.
--   a guarda de "≥ 3 membros" → dois amigos mais um convite fantasma
--                              destravariam a comparação que existe
--                              justamente para impedir grupo de duas pessoas.
--
-- As quatro são reescritas abaixo filtrando status = 'ativo', e cada uma tem
-- um ataque correspondente em scripts/test-rls.ts.
-- ─────────────────────────────────────────────────────────────────────────
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Valores novos no enum de notificação.
--
-- Ficam no topo, isolados, de propósito: `alter type ... add value` tem
-- restrições dentro de transação. Nenhum INSERT desta migration usa os valores
-- novos, então não há uso no mesmo bloco. Se o SQL Editor reclamar, rode
-- apenas estas três linhas primeiro e depois o resto do arquivo.
-- ---------------------------------------------------------------------------
alter type public.notificacao_tipo add value if not exists 'convite_grupo';
alter type public.notificacao_tipo add value if not exists 'solicitacao_grupo';
alter type public.notificacao_tipo add value if not exists 'resposta_grupo';

-- ---------------------------------------------------------------------------
-- Normalização de busca: "medicina periodo 1 unisa" precisa casar com
-- "Medicina 1º Período · UNISA", tanto na busca do catálogo quanto no aviso
-- de duplicata na hora de criar.
--
-- Feito à mão em vez de pg_trgm de propósito. A extensão daria tolerância a
-- erro de digitação, mas exigiria que toda função SECURITY DEFINER incluísse
-- `extensions` no search_path pinado — e esquecer isso quebra em RUNTIME, não
-- no deploy. Nesta escala (dezenas de comunidades por instituição), casar
-- todas as palavras do termo resolve igual e não depende de nada.
-- ---------------------------------------------------------------------------
create or replace function public.normalizar_busca(p_texto text)
returns text
language sql
immutable
as $$
  select lower(translate(
    coalesce(p_texto, ''),
    'áàâãäéèêëíìîïóòôõöúùûüñçºª',
    'aaaaaeeeeiiiiooooouuuunc  '
  ));
$$;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.status_membro as enum ('ativo', 'convidado', 'solicitado', 'recusado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.visibilidade_grupo as enum ('publica', 'fechada', 'secreta');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- grupos — vira "comunidade"
-- ---------------------------------------------------------------------------
alter table public.grupos
  add column if not exists visibilidade public.visibilidade_grupo not null default 'fechada',
  add column if not exists instituicao  text,
  add column if not exists descricao    text,
  add column if not exists emoji        text not null default '🎓',
  add column if not exists arquivada    boolean not null default false;

comment on column public.grupos.visibilidade is
  'publica: entra na hora · fechada: precisa de aprovação · secreta: só por código de convite.';

-- Índice do catálogo: a busca filtra por visibilidade e não-arquivada antes de
-- comparar texto. O casamento por palavra usa LIKE com curinga à esquerda, que
-- índice nenhum acelera — e criar um que não é usado custa escrita a cada
-- update sem devolver nada. Nesta escala a varredura é instantânea.
create index if not exists idx_grupos_catalogo
  on public.grupos (visibilidade)
  where arquivada = false;

-- ---------------------------------------------------------------------------
-- grupo_membros — ganha estado
-- ---------------------------------------------------------------------------
alter table public.grupo_membros
  add column if not exists status        public.status_membro not null default 'ativo',
  add column if not exists convidado_por uuid references public.profiles (id) on delete set null,
  add column if not exists mensagem      text,
  add column if not exists respondido_em timestamptz;

-- O papel ganha 'admin'. Drop + add para o arquivo continuar re-executável.
alter table public.grupo_membros drop constraint if exists grupo_membros_papel_check;
alter table public.grupo_membros
  add constraint grupo_membros_papel_check check (papel in ('dono', 'admin', 'membro'));

comment on column public.grupo_membros.status is
  'ativo é o único que conta como membro. Ver o cabeçalho desta migration.';

-- Índice parcial: é a consulta do badge de pendências, que roda a cada
-- navegação. Parcial porque a esmagadora maioria das linhas é 'ativo'.
create index if not exists idx_grupo_membros_pendentes
  on public.grupo_membros (usuario_id)
  where status <> 'ativo';

create index if not exists idx_grupo_membros_grupo_status
  on public.grupo_membros (grupo_id, status);

-- Todo grupo existente precisa de um dono. Os grupos semeados foram criados
-- com criado_por nulo (institucionais); os demais promovem o criador.
update public.grupo_membros gm
   set papel = 'dono'
  from public.grupos g
 where g.id = gm.grupo_id
   and g.criado_por = gm.usuario_id
   and gm.papel <> 'dono';

-- ---------------------------------------------------------------------------
-- grupo_convites_email — convidar quem ainda não tem conta
--
-- Guardar o convite pelo e-mail (e não pelo id do usuário) é o que permite
-- convidar a turma inteira antes de metade instalar o app. E é o que deixa
-- convidar_para_grupo() responder a mesma coisa exista ou não a conta —
-- fechando o uso do formulário como confirmador de e-mails cadastrados.
-- ---------------------------------------------------------------------------
create table if not exists public.grupo_convites_email (
  id            uuid primary key default gen_random_uuid(),
  grupo_id      uuid not null references public.grupos (id) on delete cascade,
  email         text not null check (position('@' in email) > 1),
  convidado_por uuid references public.profiles (id) on delete set null,
  criado_em     timestamptz not null default now(),
  unique (grupo_id, email)
);

create index if not exists idx_convites_email on public.grupo_convites_email (email);

-- ============================================================================
-- As quatro funções de membresia — agora com filtro de status
-- ============================================================================

-- Mantém o nome: mudar só o corpo deixa o raio de impacto pequeno, porque ela
-- é referenciada nas policies de grupos e grupo_membros.
create or replace function public.eh_membro_do_grupo(p_grupo_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.grupo_membros gm
    where gm.grupo_id = p_grupo_id
      and gm.usuario_id = auth.uid()
      and gm.status = 'ativo'
  );
$$;

/**
 * Esta é a mais perigosa das quatro: é ela que libera o SELECT em profiles.
 * As DUAS pontas precisam estar ativas — se só a minha estivesse, eu leria os
 * perfis de um grupo em que ainda sou apenas solicitante.
 */
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
      and meu.status = 'ativo'
      and dele.status = 'ativo'
  );
$$;

/** Dono ou admin da comunidade — quem aprova, convida e remove. */
create or replace function public.eh_admin_do_grupo(p_grupo_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.grupo_membros gm
    where gm.grupo_id = p_grupo_id
      and gm.usuario_id = auth.uid()
      and gm.status = 'ativo'
      and gm.papel in ('dono', 'admin')
  );
$$;

revoke execute on function public.eh_admin_do_grupo(uuid) from anon;
grant  execute on function public.eh_admin_do_grupo(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- get_group_ranking — os outros dois pontos: a validação de acesso e a
-- contagem da guarda de privacidade.
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
        and (
          not fl.justificada
          or coalesce((select c.justificada_conta
                       from public.configuracoes c
                       where c.usuario_id = gm.usuario_id), false)
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
    rank() over (
      order by case when b.carga > 0 then b.horas / b.carga else 0 end asc
    )::integer,
    (p.id = v_uid)
  from base b
  join public.profiles p on p.id = b.uid
  order by 5, p.nome;
end;
$$;

revoke execute on function public.get_group_ranking(uuid, uuid) from public, anon;
grant  execute on function public.get_group_ranking(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Provisionamento de novo usuário — agora também resgata convites por e-mail
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

  -- Convites feitos antes desta conta existir viram convites de verdade.
  -- Quem foi convidado ontem abre o app hoje com o convite esperando.
  insert into public.grupo_membros (grupo_id, usuario_id, papel, status, convidado_por)
  select ce.grupo_id, new.id, 'membro', 'convidado', ce.convidado_por
  from public.grupo_convites_email ce
  where lower(btrim(ce.email)) = lower(btrim(coalesce(new.email, '')))
  on conflict (grupo_id, usuario_id) do nothing;

  delete from public.grupo_convites_email ce
  where lower(btrim(ce.email)) = lower(btrim(coalesce(new.email, '')));

  return new;
end;
$$;

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.grupo_convites_email enable row level security;
revoke all on public.grupo_convites_email from anon;

drop policy if exists "grupo: vejo os que participo"                    on public.grupos;
drop policy if exists "grupo: crio grupos meus"                         on public.grupos;
drop policy if exists "grupo: dono edita"                               on public.grupos;
drop policy if exists "grupo: dono remove"                              on public.grupos;
drop policy if exists "membros: vejo quem está nos meus grupos"         on public.grupo_membros;
drop policy if exists "membros: entro por mim mesmo"                    on public.grupo_membros;
drop policy if exists "membros: saio do grupo (ou o dono me remove)"    on public.grupo_membros;
drop policy if exists "convites: só admin do grupo"                     on public.grupo_convites_email;

-- ---- grupos -----------------------------------------------------------------
-- O catálogo é público, mas 'secreta' nunca aparece: ela só existe para quem
-- tem o código de convite.
create policy "comunidade: vejo as do catálogo e as que participo"
  on public.grupos for select to authenticated
  using (
    (visibilidade in ('publica', 'fechada') and arquivada = false)
    or public.eh_membro_do_grupo(id)
    or public.is_admin()
  );

create policy "comunidade: qualquer um cria a sua"
  on public.grupos for insert to authenticated
  with check (criado_por = auth.uid());

create policy "comunidade: dono e admin editam"
  on public.grupos for update to authenticated
  using (public.eh_admin_do_grupo(id) or public.is_admin())
  with check (public.eh_admin_do_grupo(id) or public.is_admin());

create policy "comunidade: só o dono remove"
  on public.grupos for delete to authenticated
  using (criado_por = auth.uid() or public.is_admin());

-- ---- grupo_membros ----------------------------------------------------------
-- Membro ativo vê a lista. Quem está pendente vê SÓ a própria linha — precisa
-- disso para saber que tem convite, mas não pode ver quem mais está lá.
create policy "membros: ativo vê a lista, pendente vê só a si"
  on public.grupo_membros for select to authenticated
  using (
    usuario_id = auth.uid()
    or public.eh_membro_do_grupo(grupo_id)
    or public.eh_admin_do_grupo(grupo_id)
    or public.is_admin()
  );

-- INSERT e UPDATE ficam FECHADOS para o cliente. Toda transição de status
-- passa pelas RPCs de 0007, que é onde as regras de quem-pode-o-quê vivem.
-- Sem isso, qualquer um se inseriria como 'ativo' em qualquer comunidade.

create policy "membros: saio quando quiser; admin remove"
  on public.grupo_membros for delete to authenticated
  using (
    usuario_id = auth.uid()
    or public.eh_admin_do_grupo(grupo_id)
    or public.is_admin()
  );

-- ---- grupo_convites_email ---------------------------------------------------
create policy "convites por e-mail: só admin do grupo lê"
  on public.grupo_convites_email for select to authenticated
  using (public.eh_admin_do_grupo(grupo_id) or public.is_admin());
