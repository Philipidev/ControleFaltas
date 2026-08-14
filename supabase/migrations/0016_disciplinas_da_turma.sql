-- ============================================================================
-- Controle de Faltas — 0016: quem administra a turma cadastra as disciplinas
--
-- A §2 supunha dois papéis: uma coordenação mantém o catálogo oficial e os
-- alunos escolhem dele. Na prática quem instala este app é um estudante que
-- cria a própria turma — e descobria que não podia cadastrar as disciplinas
-- dela. O RLS da 0003 só conhecia dois casos:
--
--   personalizada = false  → catálogo, escrita só de is_admin()
--   personalizada = true   → avulsa, só do dono, e nunca entra no ranking
--
-- Ser dono da comunidade não é ser admin do app: `grupo_membros.papel` governa
-- a comunidade, `profiles.role` governa o catálogo. Sem um terceiro caso, a
-- única saída era o estudante se promover a admin do app inteiro para cadastrar
-- as três matérias da própria turma.
--
-- O terceiro caso é `disciplinas.grupo_id`:
--
--   personalizada = false, grupo_id null      → catálogo oficial, como sempre
--   personalizada = false, grupo_id preenchido → da turma: membro ativo lê,
--                                                dono/admin dela escreve
--   personalizada = true                       → avulsa, como sempre
--
-- Elas são catálogo de verdade, não avulsas: entram no ranking, aceitam a
-- regra do curso da comunidade e são as mesmas para todo mundo da turma. O que
-- muda é só quem tem a chave.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A coluna
--
-- `on delete set null` e não cascade: apagar uma comunidade não pode apagar
-- disciplina de ninguém, porque isso levaria junto as matrículas e as FALTAS
-- de cada membro por cascade. Sem a turma, a disciplina vira uma linha de
-- catálogo sem dono — o histórico de quem cursou continua de pé.
-- ---------------------------------------------------------------------------
alter table public.disciplinas
  add column if not exists grupo_id uuid references public.grupos (id) on delete set null;

create index if not exists idx_disciplinas_grupo on public.disciplinas (grupo_id)
  where grupo_id is not null;

comment on column public.disciplinas.grupo_id is
  '0016: a comunidade que responde por esta disciplina. NULL = catálogo oficial do app (só is_admin escreve).';

-- Avulsa é de uma pessoa; da turma é de um grupo. As duas coisas ao mesmo
-- tempo não querem dizer nada, e deixar passar criaria uma disciplina que o
-- ranking conta e a policy de leitura trata como privada.
alter table public.disciplinas drop constraint if exists disciplina_avulsa_sem_grupo;
alter table public.disciplinas
  add constraint disciplina_avulsa_sem_grupo
  check (not (personalizada and grupo_id is not null));

-- ---------------------------------------------------------------------------
-- disciplinas — as quatro policies da 0003, agora com o terceiro caso
--
-- `eh_membro_do_grupo` e `eh_admin_do_grupo` (0006) já filtram status='ativo',
-- então quem só pediu para entrar não lê nem escreve. Com grupo_id nulo as duas
-- devolvem false, e os casos antigos caem exatamente onde caíam antes.
-- ---------------------------------------------------------------------------
drop policy if exists "disciplina: catálogo é público; avulsa é só do dono" on public.disciplinas;
drop policy if exists "disciplina: admin cria no catálogo, aluno cria a própria avulsa" on public.disciplinas;
drop policy if exists "disciplina: admin edita o catálogo, aluno edita a própria avulsa" on public.disciplinas;
drop policy if exists "disciplina: mesma regra para remover" on public.disciplinas;

create policy "disciplina: catálogo público, da turma para membros, avulsa do dono"
  on public.disciplinas for select to authenticated
  using (
    criado_por = auth.uid()
    or (personalizada = false and grupo_id is null)
    or (personalizada = false and public.eh_membro_do_grupo(grupo_id))
  );

create policy "disciplina: admin no catálogo, turma na dela, aluno na avulsa"
  on public.disciplinas for insert to authenticated
  with check (
    public.is_admin()
    or (personalizada = true and criado_por = auth.uid())
    or (personalizada = false and public.eh_admin_do_grupo(grupo_id))
  );

create policy "disciplina: quem cria é quem edita"
  on public.disciplinas for update to authenticated
  using (
    public.is_admin()
    or (personalizada = true and criado_por = auth.uid())
    or (personalizada = false and public.eh_admin_do_grupo(grupo_id))
  )
  with check (
    public.is_admin()
    or (personalizada = true and criado_por = auth.uid())
    or (personalizada = false and public.eh_admin_do_grupo(grupo_id))
  );

create policy "disciplina: mesma regra para remover"
  on public.disciplinas for delete to authenticated
  using (
    public.is_admin()
    or (personalizada = true and criado_por = auth.uid())
    or (personalizada = false and public.eh_admin_do_grupo(grupo_id))
  );

-- ---------------------------------------------------------------------------
-- disciplina_grade — acompanha a visibilidade e a escrita da disciplina
--
-- A grade é o preço da falta (§3). Se ela ficasse editável por quem não edita
-- a disciplina, dava para mudar quanto a falta do colega custa.
-- ---------------------------------------------------------------------------
drop policy if exists "grade: leio a grade das disciplinas que enxergo" on public.disciplina_grade;
drop policy if exists "grade: quem pode editar a disciplina edita a grade" on public.disciplina_grade;

create policy "grade: leio a grade das disciplinas que enxergo"
  on public.disciplina_grade for select to authenticated
  using (exists (
    select 1 from public.disciplinas d
    where d.id = disciplina_id
      and (
        d.criado_por = auth.uid()
        or (d.personalizada = false and d.grupo_id is null)
        or (d.personalizada = false and public.eh_membro_do_grupo(d.grupo_id))
      )
  ));

create policy "grade: quem pode editar a disciplina edita a grade"
  on public.disciplina_grade for all to authenticated
  using (exists (
    select 1 from public.disciplinas d
    where d.id = disciplina_id
      and (
        public.is_admin()
        or (d.personalizada and d.criado_por = auth.uid())
        or (d.personalizada = false and public.eh_admin_do_grupo(d.grupo_id))
      )
  ))
  with check (exists (
    select 1 from public.disciplinas d
    where d.id = disciplina_id
      and (
        public.is_admin()
        or (d.personalizada and d.criado_por = auth.uid())
        or (d.personalizada = false and public.eh_admin_do_grupo(d.grupo_id))
      )
  ));

-- ---------------------------------------------------------------------------
-- vincular_disciplinas_ao_grupo — agora alcança as disciplinas da própria turma
--
-- A versão da 0007 casava por curso + período + turma, que é o que dá para
-- fazer com o catálogo oficial. Uma disciplina que JÁ declara `grupo_id` não
-- precisa ser adivinhada: ela diz de quem é.
--
-- O `return 0` para comunidade sem curso/período continua, mas só depois de
-- vincular o que é explicitamente dela — um grupo de amigos não tem catálogo a
-- casar, e ainda assim pode ter disciplina própria.
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

  update public.matriculas m
     set grupo_id = p_grupo_id
    from public.disciplinas d
   where d.id = m.disciplina_id
     and m.usuario_id = v_uid
     and m.ativa = true
     and d.personalizada = false
     and (
       -- da própria turma: não há o que adivinhar
       d.grupo_id = p_grupo_id
       -- ou do catálogo oficial, casando curso/período/turma como na 0007
       or (
         d.grupo_id is null
         and v_grupo.curso is not null
         and v_grupo.periodo is not null
         and d.curso = v_grupo.curso
         and d.periodo = v_grupo.periodo
         and (v_grupo.turma is null or d.turma is null or d.turma = v_grupo.turma)
       )
     );

  get diagnostics v_qtd = row_count;
  return v_qtd;
end;
$$;

comment on function public.vincular_disciplinas_ao_grupo(uuid) is
  'Liga as minhas matrículas a esta comunidade: as disciplinas dela, e as do catálogo oficial que casam curso/período/turma.';
