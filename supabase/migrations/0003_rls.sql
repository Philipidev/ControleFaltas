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
