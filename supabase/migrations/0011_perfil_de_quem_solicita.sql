-- ============================================================================
-- Controle de Faltas — 0010: quem administra precisa ver quem bateu na porta
--
-- A 0006 fechou `compartilha_grupo()` em `status = 'ativo'` de propósito: sem
-- isso, bastava solicitar entrada numa turma para ganhar leitura do perfil de
-- todo mundo dela. A decisão está certa e continua de pé.
--
-- Só que a policy de `profiles` é simétrica, e a simetria custou caro: se o
-- solicitante não enxerga o admin, o admin também não enxerga o solicitante.
-- Na prática o painel de aprovação mostrava um pedido sem nome — e §5 manda o
-- admin decidir quem entra, o que ninguém faz às cegas.
--
-- A correção NÃO é afrouxar compartilha_grupo(). É acrescentar um predicado
-- separado e de mão única: quem administra lê o perfil de quem tem pendência
-- naquele grupo. O contrário segue proibido.
--
-- O conjunto exposto é exatamente quem escolheu interagir com o grupo — quem
-- solicitou por conta própria, ou quem o próprio admin convidou. Nada além.
-- ============================================================================

create or replace function public.administra_pendencia_de(p_pessoa uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.grupo_membros pendente
    join public.grupo_membros eu
      on eu.grupo_id = pendente.grupo_id
    where pendente.usuario_id = p_pessoa
      and pendente.status in ('solicitado', 'convidado')
      -- Quem julga precisa ser membro ATIVO e com poder. Sem estas duas
      -- linhas, um convidado que ainda não respondeu poderia ler o perfil de
      -- outro convidado do mesmo grupo.
      and eu.usuario_id = auth.uid()
      and eu.status = 'ativo'
      and eu.papel in ('dono', 'admin')
  );
$$;

comment on function public.administra_pendencia_de(uuid) is
  'Mão única: quem administra o grupo lê o perfil de quem tem pendência nele. '
  'O pendente NÃO ganha nada em troca — compartilha_grupo() segue exigindo ativo.';

-- A policy é recriada inteira porque `alter policy` não aceita adicionar um
-- OR: o `using` é substituído por completo de qualquer forma.
drop policy if exists "perfil: leio o meu, o de quem divide grupo comigo, e admin vê " on public.profiles;
drop policy if exists "perfil: o meu, o de quem divide grupo, e o de quem me pede entrada" on public.profiles;

create policy "perfil: o meu, o de quem divide grupo, e o de quem me pede entrada"
  on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or public.compartilha_grupo(id)
    or public.administra_pendencia_de(id)
    or public.is_admin()
  );

-- Mesma regra da 0009: nasce fechada, e só então recebe o que precisa. A
-- policy roda com os privilégios de quem consulta, então sem este grant toda
-- leitura de profiles quebraria.
revoke all on function public.administra_pendencia_de(uuid) from public, anon, authenticated;
grant execute on function public.administra_pendencia_de(uuid) to authenticated;

select
  p.proname                                                 as funcao,
  has_function_privilege('anon', p.oid, 'EXECUTE')          as anon,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as autenticado
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'administra_pendencia_de';
