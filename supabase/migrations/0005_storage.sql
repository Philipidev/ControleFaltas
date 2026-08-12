-- ============================================================================
-- Controle de Faltas — 0005: Storage dos atestados
--
-- §7.1: "Espaço pra anexar foto/PDF do atestado (registro, não é obrigatório
--        pro cálculo)."
--
-- Bucket PRIVADO. Convenção de caminho: {auth.uid()}/{falta_id}.{ext}
-- As policies conferem a primeira pasta do caminho contra o uid de quem pede,
-- então o atestado de um aluno é ilegível para qualquer outro — inclusive
-- para colegas do mesmo grupo. O acesso na UI é sempre por signed URL de
-- curta duração, nunca por URL pública.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'atestados',
  'atestados',
  false,
  10485760, -- 10 MB: foto de atestado ou PDF cabem com folga
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'application/pdf'
  ]
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- storage.objects já vem com RLS habilitado no Supabase; só faltam as policies.
-- Dropamos pelo nome exato (e não em varredura) para não mexer em policies de
-- outros buckets que possam existir no projeto.
drop policy if exists "atestado: envio apenas para a minha pasta" on storage.objects;
drop policy if exists "atestado: leio apenas os meus"            on storage.objects;
drop policy if exists "atestado: substituo apenas os meus"       on storage.objects;
drop policy if exists "atestado: removo apenas os meus"          on storage.objects;

create policy "atestado: envio apenas para a minha pasta"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'atestados'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "atestado: leio apenas os meus"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'atestados'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "atestado: substituo apenas os meus"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'atestados'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'atestados'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "atestado: removo apenas os meus"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'atestados'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
