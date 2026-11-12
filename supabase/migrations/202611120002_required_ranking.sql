-- Aplicar DEPOIS da migração 202611120001. Não execute a primeira novamente.
begin;
alter table public.profiles alter column listed set default true;
update public.profiles set listed=true where not listed;
alter table public.profiles add constraint profiles_ranking_required check (listed=true);
commit;
