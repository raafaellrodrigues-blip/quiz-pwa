-- RaciocineIA v1. Apply once through Supabase SQL Editor or supabase db push.
begin;
revoke create on schema public from public,anon,authenticated;
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
create table public.profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 public_name text not null check(char_length(public_name) between 3 and 30),
 listed boolean not null default false, preferences jsonb not null default '{}', created_at timestamptz not null default now()
);
create unique index profiles_name_unique on public.profiles(lower(public_name));
create function public.new_profile() returns trigger language plpgsql security definer set search_path=public,extensions as $$
begin insert into profiles(user_id,public_name) values(new.id,'Jogador_'||left(replace(new.id::text,'-',''),20)); return new; end $$;
create trigger create_profile after insert on auth.users for each row execute function public.new_profile();
insert into profiles(user_id,public_name) select id,'Jogador_'||left(replace(id::text,'-',''),20) from auth.users on conflict do nothing;
create table questions (
 id uuid primary key default gen_random_uuid(), topic text not null, difficulty text not null check(difficulty in ('facil','medio','dificil')),
 question text not null check(char_length(trim(question)) between 1 and 5000), options jsonb not null,
 correct integer not null check(correct between 0 and 3), explanation text not null check(char_length(trim(explanation)) between 1 and 10000),
 source text not null, status text not null default 'validated' check(status in ('validated','reviewed','candidate','disabled')),
 normalized text not null, canonical_hash text not null unique, signature text not null unique,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(jsonb_typeof(options)='array' and jsonb_array_length(options)=4)
);
-- Recompute identity inside the DB as well, including direct imports/updates.
create function question_identity() returns trigger language plpgsql set search_path=public,extensions as $$
declare option_count integer; normalized_options text[]; answer_text text;
begin
 if exists(select 1 from jsonb_array_elements(new.options) v where jsonb_typeof(v)<>'string' or length(trim(v#>>'{}'))=0 or length(v#>>'{}')>2000) then raise exception 'Invalid options';end if;
 select count(distinct lower(trim(v))),array_agg(lower(trim(v)) order by lower(trim(v))) into option_count,normalized_options from jsonb_array_elements_text(new.options) v;
 if option_count<>4 then raise exception 'Options must be distinct'; end if;
 if not exists(select 1 from jsonb_array_elements_text(new.options) v where v !~* '^\s*[a-d][.):]?\s*$') then raise exception 'Placeholder options';end if;
 new.normalized=trim(regexp_replace(lower(translate(regexp_replace(normalize(new.question,NFKD),U&'[\0300-\036f]','','g'),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc')),'[^a-z0-9]+',' ','g'));
 new.canonical_hash=encode(digest(new.normalized,'sha256'),'hex');
 answer_text=lower(trim(new.options->>new.correct));
 new.signature=encode(digest(lower(new.topic)||'|'||new.normalized||'|'||array_to_string(normalized_options,'|')||'|'||answer_text,'sha256'),'hex');
 if new.status='validated' and exists(select 1 from questions q where q.id<>new.id and q.topic=new.topic and q.canonical_hash<>new.canonical_hash and similarity(q.normalized,new.normalized)>0.85) then new.status='candidate';end if;
 new.updated_at=now(); return new;
end $$;
create trigger normalize_question before insert or update on questions for each row execute function question_identity();
create index questions_select on questions(topic,difficulty,status);
create index questions_similarity on questions using gin(normalized gin_trgm_ops);
create table game_sessions (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 topic text not null,mode text not null check(mode in ('estudo','rapido','desafio')), questions jsonb not null default '[]',
 answers jsonb not null default '[]', presented_index integer not null default 0, verified boolean not null default false, score integer not null default 0,
 correct integer not null default 0, xp integer not null default 0, max_combo integer not null default 0,
 started_at timestamptz not null default now(), last_answer_at timestamptz not null default now(), completed_at timestamptz
);
create index games_user on game_sessions(user_id,completed_at desc);
create index games_rank on game_sessions(completed_at,score desc) where verified and completed_at is not null;
create table question_attempts (
 game_id uuid references game_sessions(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade,
 question_id uuid references questions(id) on delete restrict, position integer not null, answer integer not null check(answer between -1 and 3),
 correct boolean not null, elapsed_ms integer not null, created_at timestamptz not null default now(), primary key(game_id,position)
);
create table question_usage(user_id uuid references auth.users(id) on delete cascade,question_id uuid references questions(id) on delete restrict,
 shown_at timestamptz not null default now(),primary key(user_id,question_id));
create table user_progress(user_id uuid primary key references auth.users(id) on delete cascade,local_import jsonb, imported_at timestamptz);
create table user_achievements(user_id uuid references auth.users(id) on delete cascade,badge text not null,unlocked_at timestamptz not null default now(),primary key(user_id,badge));
create table generation_runs(id uuid primary key default gen_random_uuid(),topic text not null,difficulty text not null,started_at timestamptz not null default now(),finished_at timestamptz,report jsonb);
create unique index generation_lock on generation_runs(topic,difficulty) where finished_at is null;
create table generation_budget(day date primary key,used integer not null default 0);
create function game_rules() returns jsonb language sql immutable as $$ select '{"POINTS":{"easy":10,"medium":15,"hard":25},"COMBO_BONUS":5,"XP_PER_CORRECT":20,"XP_PER_GAME":10}'::jsonb $$;
create function reserve_generation(p_limit integer) returns boolean language plpgsql set search_path=public,extensions as $$
declare n integer;begin
 insert into generation_budget(day,used) values(current_date,1) on conflict(day) do update set used=generation_budget.used+1 where generation_budget.used<p_limit returning used into n;
 return n is not null;
end $$;
create function start_game(p_user uuid,p_topic text,p_difficulty text,p_mode text) returns jsonb language plpgsql set search_path=public,extensions as $$
declare qs jsonb; gid uuid;begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if (select count(*) from game_sessions where user_id=p_user and started_at>now()-interval '1 hour')>=20 then raise exception 'Limite de 20 partidas por hora';end if;
 select jsonb_agg(to_jsonb(q)) into qs from (
 select q.* from questions q left join question_usage u on u.question_id=q.id and u.user_id=p_user
 where q.status in ('validated','reviewed') and (p_topic='Aleatório' or q.topic=p_topic) and (p_difficulty='misto' or q.difficulty=p_difficulty)
 order by u.shown_at nulls first,random() limit 10) q;
 if coalesce(jsonb_array_length(qs),0)<10 then return jsonb_build_object('available',false,'reason','Estoque insuficiente para partida online. Use a prática local ou abasteça o banco.');end if;
 insert into game_sessions(user_id,topic,mode,questions,verified) values(p_user,p_topic,p_mode,qs,true) returning id into gid;
 insert into question_usage(user_id,question_id) select p_user,(v->>'id')::uuid from jsonb_array_elements(qs)v on conflict(user_id,question_id) do update set shown_at=now();
 return jsonb_build_object('available',true,'id',gid,'questions',(select jsonb_agg(jsonb_build_object('id',v->>'id','question',v->>'question','options',v->'options','category',v->>'topic','difficulty',case v->>'difficulty' when 'facil' then 'Fácil' when 'dificil' then 'Difícil' else 'Médio' end)) from jsonb_array_elements(qs)v));
end $$;
create function present_game(p_user uuid,p_game uuid,p_index integer) returns void language plpgsql set search_path=public,extensions as $$
declare g game_sessions;begin
 select * into g from game_sessions where id=p_game and user_id=p_user and verified for update;
 if not found or g.completed_at is not null or p_index<>jsonb_array_length(g.answers) then raise exception 'Partida indisponível';end if;
 if g.presented_index<p_index then update game_sessions set presented_index=p_index,last_answer_at=now() where id=p_game;end if;
end $$;
create function answer_game(p_user uuid,p_game uuid,p_index integer,p_answer integer) returns jsonb language plpgsql set search_path=public,extensions as $$
declare g game_sessions; q jsonb; a jsonb; result jsonb; n integer; pts integer=0; hits integer=0; combo integer=0; maxc integer=0; elapsed integer; chosen integer; badge_record record;rules jsonb=game_rules();
begin
 select * into g from game_sessions where id=p_game and user_id=p_user and verified for update;
 if not found then raise exception 'Partida não encontrada';end if;
 if p_index<jsonb_array_length(g.answers) then return g.answers->p_index;end if;
 if g.completed_at is not null or p_index<>jsonb_array_length(g.answers) or g.presented_index<>p_index or g.started_at<now()-interval '24 hours' then raise exception 'Partida expirada ou resposta fora de ordem';end if;
 q=g.questions->p_index;
 elapsed=least(86400000,extract(epoch from now()-g.last_answer_at)*1000)::integer;
 chosen=p_answer;
 if g.mode<>'estudo' and elapsed>(case when g.mode='desafio' then 15 else 30 end)*1000+5000 then chosen=-1;end if;
 result=jsonb_build_object('correct',(q->>'correct')::integer,'explanation',q->>'explanation','answer',chosen);
 a=g.answers||jsonb_build_array(result);
 insert into question_attempts(game_id,user_id,question_id,position,answer,correct,elapsed_ms) values(g.id,p_user,(q->>'id')::uuid,p_index,chosen,chosen=(q->>'correct')::integer,elapsed);
 for n in 0..jsonb_array_length(a)-1 loop
 if (a->n->>'answer')::integer=(g.questions->n->>'correct')::integer then
 hits=hits+1;combo=combo+1;maxc=greatest(maxc,combo);
 pts=pts+(case g.questions->n->>'difficulty' when 'facil' then (rules->'POINTS'->>'easy')::integer when 'dificil' then (rules->'POINTS'->>'hard')::integer else (rules->'POINTS'->>'medium')::integer end)+(combo-1)*(rules->>'COMBO_BONUS')::integer;
 else combo=0;end if;end loop;
 update game_sessions set answers=a,score=pts,correct=hits,max_combo=maxc,xp=hits*(rules->>'XP_PER_CORRECT')::integer+case when jsonb_array_length(a)=10 then (rules->>'XP_PER_GAME')::integer else 0 end,last_answer_at=now(),completed_at=case when jsonb_array_length(a)=10 then now() else null end where id=g.id;
 if jsonb_array_length(a)=10 then
 if hits=10 then insert into user_achievements values(p_user,'perfecto',now()) on conflict do nothing;end if;
 for badge_record in select * from (values
 ('medico',array['Medicina','Enfermagem','Fisioterapia'],7),('tecno',array['Programação','Tecnologia da Informação','Redes de Computadores'],7),
 ('juridico',array['Direito','Concursos Públicos'],7),('cientista',array['Física','Química','Biologia'],7),('humanista',array['História','Geografia','Filosofia'],7),
 ('matematico',array['Matemática','Raciocínio Lógico'],7),('poliglota',array['Inglês','Espanhol','Português'],7),('enem_ace',array['ENEM','Vestibulares'],8)) as b(id,topics,threshold)
 loop if g.topic=any(badge_record.topics) and hits>=badge_record.threshold then insert into user_achievements values(p_user,badge_record.id,now()) on conflict do nothing;end if;end loop;
 end if;
 return result;
end $$;
create function import_local(p_user uuid,p_data jsonb) returns void language sql set search_path=public,extensions as $$
 insert into user_progress(user_id,local_import,imported_at) values(p_user,p_data,now()) on conflict(user_id) do nothing;
$$;
create function save_practice(p_user uuid,p_id uuid,p_topic text,p_mode text,p_correct integer,p_score integer,p_date timestamptz) returns void language sql set search_path=public,extensions as $$
 insert into game_sessions(id,user_id,topic,mode,correct,score,xp,completed_at) values(p_id,p_user,p_topic,p_mode,p_correct,p_score,p_correct*(game_rules()->>'XP_PER_CORRECT')::integer+(game_rules()->>'XP_PER_GAME')::integer,least(now(),p_date)) on conflict(id) do nothing;
$$;
create function progress_snapshot(p_user uuid) returns jsonb language plpgsql set search_path=public,extensions as $$
declare base jsonb; s jsonb; h jsonb; badges jsonb; streak integer=0; d date; expected date;begin
 select local_import into base from user_progress where user_id=p_user;
 base=coalesce(base,'{}');
 select jsonb_build_object('totalGames',count(*)+coalesce((base->'stats'->>'totalGames')::integer,0),'totalCorrect',coalesce(sum(correct),0)+coalesce((base->'stats'->>'totalCorrect')::integer,0),
 'totalAnswered',count(*)*10+coalesce((base->'stats'->>'totalAnswered')::integer,0),'bestScore',greatest(coalesce(max(score),0),coalesce((base->'stats'->>'bestScore')::integer,0)),
 'totalXP',coalesce(sum(xp),0)+coalesce((base->'stats'->>'totalXP')::integer,0)) into s from game_sessions where user_id=p_user and completed_at is not null;
 select coalesce(jsonb_agg(v order by ts desc),'[]') into h from (
 select jsonb_build_object('date',to_char(completed_at at time zone 'America/Sao_Paulo','DD/MM/YYYY'),'tema',topic,'mode',mode,'correct',correct,'total',10,'score',score,'pct',correct*10) v,completed_at ts from game_sessions where user_id=p_user and completed_at is not null order by completed_at desc limit 50) x;
 h=(select coalesce(jsonb_agg(v),'[]') from (select v from jsonb_array_elements(h||coalesce(base->'history','[]'))v limit 50)z);
 insert into user_achievements(user_id,badge)
 select p_user,b.id from game_sessions g cross join (values
 ('medico',array['Medicina','Enfermagem','Fisioterapia'],7),('tecno',array['Programação','Tecnologia da Informação','Redes de Computadores'],7),
 ('juridico',array['Direito','Concursos Públicos'],7),('cientista',array['Física','Química','Biologia'],7),('humanista',array['História','Geografia','Filosofia'],7),
 ('matematico',array['Matemática','Raciocínio Lógico'],7),('poliglota',array['Inglês','Espanhol','Português'],7),('enem_ace',array['ENEM','Vestibulares'],8),('perfecto',array[]::text[],10))b(id,topics,threshold)
 where g.user_id=p_user and g.completed_at is not null and g.correct>=b.threshold and (b.id='perfecto' or g.topic=any(b.topics)) on conflict do nothing;
 select coalesce(jsonb_agg(distinct badge),'[]') into badges from (select badge from user_achievements where user_id=p_user union select jsonb_array_elements_text(coalesce(base->'badges','[]'))) b;
 expected=(now() at time zone 'America/Sao_Paulo')::date;
 for d in select distinct study_day from (
 select (completed_at at time zone 'America/Sao_Paulo')::date as study_day from game_sessions where user_id=p_user and completed_at is not null
 union select (base->'streak'->>'lastDate')::date-n from generate_series(0,least(36500,coalesce((base->'streak'->>'streak')::integer,0))-1)n where base->'streak'->>'lastDate' is not null
 ) days order by study_day desc loop
 if streak=0 and d=expected-1 then expected=expected-1;end if;
 exit when d<>expected; streak=streak+1;expected=expected-1;end loop;
 if streak>=7 then badges=badges||'"streak7"'::jsonb;end if;
 return jsonb_build_object('stats',s,'history',h,'badges',badges,'streak',jsonb_build_object('streak',streak,'lastDate',null),'imported',base<>'{}','profile',(select to_jsonb(p) from profiles p where user_id=p_user));
end $$;
create function public_ranking(p_week boolean default false,p_offset integer default 0) returns table("position" bigint,public_name text,score bigint,games bigint) language sql set search_path=public,extensions as $$
 with results as(select p.public_name,sum(g.score) score,count(*) games,min(g.completed_at) first_at from game_sessions g join profiles p using(user_id)
 where p.listed and g.verified and g.completed_at is not null and (not p_week or g.completed_at>=date_trunc('week',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo') group by p.user_id,p.public_name)
 select row_number() over(order by score desc,games asc,first_at,public_name),public_name,score,games from results order by score desc,games asc,first_at,public_name limit 20 offset greatest(0,p_offset);
$$;
create function practice_questions(p_topics text[],p_difficulty text,p_count integer) returns setof questions language sql set search_path=public,extensions as $$
 select * from questions where topic=any(p_topics) and status in ('validated','reviewed') and (p_difficulty='misto' or difficulty=p_difficulty) order by random() limit least(20,greatest(1,p_count));
$$;
create function question_inventory() returns table(topic text,difficulty text,status text,quantity bigint) language sql set search_path=public,extensions as $$ select topic,difficulty,status,count(*) from questions group by topic,difficulty,status $$;
-- RLS: private records readable by their owner; all score mutations only via server.
do $$ declare t text;begin
 foreach t in array array['profiles','questions','game_sessions','question_attempts','question_usage','user_progress','user_achievements','generation_runs','generation_budget'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
 foreach t in array array['profiles','game_sessions','question_attempts','question_usage','user_progress','user_achievements'] loop
 -- Do not expose answer snapshots in active games via direct browser queries.
 if t<>'game_sessions' then
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy owner_read on public.%I for select to authenticated using (auth.uid()=user_id)',t);
 end if;
 end loop;
end $$;
-- Remove default public execution privileges, including trigger functions.
do $$ declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('practice_questions','game_rules','present_game','question_inventory','new_profile','question_identity','reserve_generation','start_game','answer_game','import_local','save_practice','progress_snapshot','public_ranking') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
commit;
