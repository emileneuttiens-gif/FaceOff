-- FaceOff: spellogica (kamers, rondes, raden). Draait als migratie in Supabase.
create extension if not exists unaccent with schema extensions;
create extension if not exists fuzzystrmatch with schema extensions;

create table public.rooms (
  code text primary key,
  status text not null default 'lobby',            -- lobby | playing | reveal | finished
  host_name text not null,
  guest_name text,
  host_score int not null default 0,
  guest_score int not null default 0,
  mode jsonb not null default '{"type":"bekend"}',
  mode_label text not null default 'Bekende spelers',
  total_rounds int not null default 10,
  round int not null default 0,
  photo_url text,
  photo_credit text,
  hints jsonb,
  round_start timestamptz,
  round_deadline timestamptz,
  reveal_name text,
  reveal_photo text,
  round_winner int,
  round_points int,
  next_at timestamptz,
  last_wrong jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create table public.room_players (
  code text references public.rooms(code) on delete cascade,
  slot int not null,
  token uuid not null,
  primary key (code, slot)
);
create table public.room_rounds (
  code text references public.rooms(code) on delete cascade,
  round int not null,
  player_id bigint not null references public.players(id),
  primary key (code, round)
);
alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.room_rounds enable row level security;
create policy "rooms are readable" on public.rooms for select to anon, authenticated using (true);
alter publication supabase_realtime add table public.rooms;

-- naam normaliseren: kleine letters, geen accenten, enkel letters en spaties
create or replace function public.fo_norm(t text) returns text language sql immutable set search_path = public, extensions as $$
  select trim(regexp_replace(lower(extensions.unaccent(coalesce(t,''))), '[^a-z ]+', '', 'g'))
$$;

create or replace function public.fo_name_matches(guess text, real_name text) returns boolean language plpgsql immutable set search_path = public, extensions as $$
declare g text := fo_norm(guess); n text := fo_norm(regexp_replace(real_name, '\s*\(.*\)$', '')); parts text[]; last text; first text;
begin
  if length(g) < 2 then return false; end if;
  if g = n then return true; end if;
  parts := string_to_array(n, ' ');
  last := parts[array_length(parts,1)];
  first := parts[1];
  if length(last) >= 4 and g = last then return true; end if;                                   -- achternaam: "mbappe"
  if array_length(parts,1) > 2 and g = array_to_string(parts[2:], ' ') then return true; end if; -- "de bruyne", "van dijk"
  if array_length(parts,1) = 1 and g = first then return true; end if;                          -- Neymar, Rodrygo
  if length(n) >= 8 and extensions.levenshtein(g, n) <= 2 then return true; end if;              -- kleine tikfouten
  if length(n) >= 5 and length(n) < 8 and extensions.levenshtein(g, n) <= 1 then return true; end if;
  if length(last) >= 6 and extensions.levenshtein(g, last) <= 1 then return true; end if;
  return false;
end $$;

-- spelers per spelmodus
create or replace function public.fo_pool(m jsonb) returns setof public.players language sql stable set search_path = public as $$
  select * from players p where p.active and p.photo_url is not null and
    case coalesce(m->>'type','bekend')
      when 'bekend' then p.popularity >= 40 and p.gender = 'man'
      when 'alles' then p.gender = 'man'
      when 'league' then p.league = m->>'value'
      when 'club' then p.current_club_wikidata = m->>'value'
      when 'country' then p.national_team = m->>'value' and p.gender = 'man'
      when 'legend' then p.current_club is null and p.popularity >= 40 and coalesce(p.birth_year, 1900) < 1988 and p.gender = 'man'
      when 'vrouwen' then p.gender = 'vrouw'
      else p.popularity >= 40
    end
$$;

create or replace function public.fo_mode_label(m jsonb) returns text language sql stable set search_path = public as $$
  select case coalesce(m->>'type','bekend')
    when 'bekend' then 'Bekende spelers'
    when 'alles' then 'Alle spelers'
    when 'league' then m->>'value'
    when 'club' then coalesce((select current_club from players where current_club_wikidata = m->>'value' limit 1), 'Club')
    when 'country' then m->>'value'
    when 'legend' then 'Legendes'
    when 'vrouwen' then 'Vrouwenvoetbal'
    else 'Bekende spelers' end
$$;

create or replace function public.fo_slot(p_code text, p_token uuid) returns int language sql stable security definer set search_path = public as $$
  select slot from room_players where code = upper(p_code) and token = p_token
$$;

create or replace function public.fo_room_json(p_code text) returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(r) || jsonb_build_object('server_now', now()) from rooms r where code = upper(p_code)
$$;

-- volgende ronde (intern)
create or replace function public.fo_next_round(p_code text) returns void language plpgsql security definer set search_path = public as $$
declare r rooms; pl players; h jsonb;
begin
  select * into r from rooms where code = p_code for update;
  if r.round >= r.total_rounds then
    update rooms set status = 'finished', next_at = null, updated_at = now() where code = p_code;
    return;
  end if;
  select * into pl from fo_pool(r.mode) p
   where p.id not in (select player_id from room_rounds where code = p_code)
   order by random() limit 1;
  if pl.id is null then
    update rooms set status = 'finished', next_at = null, updated_at = now() where code = p_code;
    return;
  end if;
  insert into room_rounds(code, round, player_id) values (p_code, r.round + 1, pl.id);
  h := jsonb_build_object(
    'land', pl.national_team,
    'positie', coalesce(pl.position_detail, pl.position),
    'club', case when r.mode->>'type' = 'club' then null else pl.current_club end,
    'initialen', (select string_agg(left(w,1) || '.', ' ') from unnest(string_to_array(regexp_replace(pl.name, '\s*\(.*\)$', ''), ' ')) w)
  );
  update rooms set status = 'playing', round = r.round + 1,
    photo_url = pl.photo_url,
    photo_credit = coalesce(nullif(pl.photo_author,''), 'Onbekend') || coalesce(' · ' || pl.photo_license, ''),
    hints = h,
    round_start = now() + interval '4 seconds',
    round_deadline = now() + interval '34 seconds',
    reveal_name = null, reveal_photo = null, round_winner = null, round_points = null,
    next_at = null, last_wrong = null, updated_at = now()
  where code = p_code;
end $$;

create or replace function public.create_room(p_name text, p_token uuid, p_mode jsonb default '{"type":"bekend"}', p_rounds int default 10)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c text; alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; i int;
begin
  -- oude kamers opruimen
  delete from rooms where created_at < now() - interval '1 day';
  loop
    c := '';
    for i in 1..4 loop c := c || substr(alphabet, 1 + floor(random()*length(alphabet))::int, 1); end loop;
    exit when not exists (select 1 from rooms where code = c);
  end loop;
  insert into rooms(code, host_name, mode, mode_label, total_rounds)
  values (c, left(coalesce(nullif(trim(p_name),''),'Speler 1'), 20), p_mode, fo_mode_label(p_mode), greatest(3, least(coalesce(p_rounds,10), 30)));
  insert into room_players(code, slot, token) values (c, 1, p_token);
  return fo_room_json(c) || jsonb_build_object('slot', 1);
end $$;

create or replace function public.join_room(p_code text, p_name text, p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r rooms; s int;
begin
  select * into r from rooms where code = upper(p_code) for update;
  if r.code is null then raise exception 'Kamer niet gevonden'; end if;
  s := fo_slot(r.code, p_token);
  if s is not null then return fo_room_json(r.code) || jsonb_build_object('slot', s); end if;
  if exists (select 1 from room_players where code = r.code and slot = 2) then raise exception 'Deze kamer is al vol'; end if;
  if r.status <> 'lobby' then raise exception 'Het spel is al begonnen'; end if;
  insert into room_players(code, slot, token) values (r.code, 2, p_token);
  update rooms set guest_name = left(coalesce(nullif(trim(p_name),''),'Speler 2'), 20), updated_at = now() where code = r.code;
  return fo_room_json(r.code) || jsonb_build_object('slot', 2);
end $$;

create or replace function public.set_mode(p_code text, p_token uuid, p_mode jsonb, p_rounds int)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if fo_slot(p_code, p_token) is distinct from 1 then raise exception 'Alleen de host kan de modus kiezen'; end if;
  update rooms set mode = p_mode, mode_label = fo_mode_label(p_mode), total_rounds = greatest(3, least(coalesce(p_rounds,10), 30)), updated_at = now()
   where code = upper(p_code) and status in ('lobby','finished');
  return fo_room_json(p_code);
end $$;

create or replace function public.start_game(p_code text, p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c text := upper(p_code);
begin
  if fo_slot(c, p_token) is distinct from 1 then raise exception 'Alleen de host kan starten'; end if;
  if not exists (select 1 from fo_pool((select mode from rooms where code = c))) then raise exception 'Geen spelers in deze modus'; end if;
  delete from room_rounds where code = c;
  update rooms set round = 0, host_score = 0, guest_score = 0, status = 'playing', updated_at = now() where code = c;
  perform fo_next_round(c);
  return fo_room_json(c);
end $$;

create or replace function public.submit_guess(p_code text, p_token uuid, p_guess text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c text := upper(p_code); s int; r rooms; pl players; pts int; secs numeric;
begin
  s := fo_slot(c, p_token);
  if s is null then raise exception 'Je zit niet in deze kamer'; end if;
  select * into r from rooms where code = c for update;
  if r.status <> 'playing' or now() < r.round_start or now() > r.round_deadline then
    return jsonb_build_object('correct', false, 'reason', 'closed');
  end if;
  select p.* into pl from room_rounds rr join players p on p.id = rr.player_id where rr.code = c and rr.round = r.round;
  if fo_name_matches(p_guess, pl.name) then
    secs := extract(epoch from now() - r.round_start);
    pts := 100 + greatest(0, 100 - floor(secs * 4))::int;   -- 100 basis + snelheidsbonus tot 100
    update rooms set status = 'reveal', round_winner = s, round_points = pts,
      host_score = host_score + case when s = 1 then pts else 0 end,
      guest_score = guest_score + case when s = 2 then pts else 0 end,
      reveal_name = regexp_replace(pl.name, '\s*\(.*\)$', ''), reveal_photo = pl.photo_url,
      next_at = now() + interval '4 seconds', updated_at = now()
    where code = c;
    return jsonb_build_object('correct', true, 'points', pts);
  else
    update rooms set last_wrong = jsonb_build_object('slot', s, 'at', now()), updated_at = now() where code = c;
    return jsonb_build_object('correct', false, 'reason', 'wrong');
  end if;
end $$;

-- door beide spelers elke seconde aangeroepen; de server beslist
create or replace function public.tick(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c text := upper(p_code); r rooms; pl players;
begin
  select * into r from rooms where code = c for update skip locked;
  if r.code is null then return fo_room_json(c); end if;
  if r.status = 'playing' and now() > r.round_deadline then
    select p.* into pl from room_rounds rr join players p on p.id = rr.player_id where rr.code = c and rr.round = r.round;
    update rooms set status = 'reveal', round_winner = null, round_points = 0,
      reveal_name = regexp_replace(pl.name, '\s*\(.*\)$', ''), reveal_photo = pl.photo_url,
      next_at = now() + interval '4 seconds', updated_at = now() where code = c;
  elsif r.status = 'reveal' and now() >= r.next_at then
    perform fo_next_round(c);
  end if;
  return fo_room_json(c);
end $$;

-- solo: ronde opgeven
create or replace function public.skip_round(p_code text, p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if fo_slot(p_code, p_token) is null then raise exception 'Je zit niet in deze kamer'; end if;
  if exists (select 1 from room_players where code = upper(p_code) and slot = 2) then return fo_room_json(p_code); end if;
  update rooms set round_deadline = now() - interval '1 second' where code = upper(p_code) and status = 'playing';
  return tick(p_code);
end $$;

create or replace function public.back_to_lobby(p_code text, p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if fo_slot(p_code, p_token) is distinct from 1 then raise exception 'Alleen de host'; end if;
  update rooms set status = 'lobby', round = 0, host_score = 0, guest_score = 0, photo_url = null, hints = null, reveal_name = null, updated_at = now() where code = upper(p_code);
  return fo_room_json(p_code);
end $$;

create or replace function public.mode_options() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'counts', jsonb_build_object(
      'bekend', (select count(*) from fo_pool('{"type":"bekend"}')),
      'alles', (select count(*) from fo_pool('{"type":"alles"}')),
      'legend', (select count(*) from fo_pool('{"type":"legend"}')),
      'vrouwen', (select count(*) from fo_pool('{"type":"vrouwen"}'))),
    'leagues', (select jsonb_agg(x order by x.n desc) from (
        select league as name, count(*) n,
          (select jsonb_agg(jsonb_build_object('id', cid, 'name', cname, 'n', cn) order by cname) from (
             select current_club_wikidata cid, min(current_club) cname, count(*) cn from players p2
             where p2.league = p.league and p2.active and p2.club_source = 'wikipedia-selectie-2026' group by current_club_wikidata having count(*) >= 5) cl) clubs
        from players p where league is not null and active and club_source = 'wikipedia-selectie-2026' group by league having count(*) >= 20) x),
    'countries', (select jsonb_agg(x order by x.n desc) from (
        select national_team as name, count(*) n from players where national_team is not null and active and gender = 'man' group by national_team having count(*) >= 10) x)
  )
$$;

create or replace function public.pool_names(p_mode jsonb) returns text[] language sql stable security definer set search_path = public as $$
  select array_agg(distinct regexp_replace(name, '\s*\(.*\)$', '')) from fo_pool(p_mode)
$$;

create or replace function public.intro_faces() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_agg(jsonb_build_object('name', name, 'photo', photo_url, 'club', current_club)) from (
    select name, photo_url, current_club from players
    where active and gender = 'man' and popularity >= 60 and birth_year >= 1995 and club_source = 'wikipedia-selectie-2026'
    order by random() limit 14) x
$$;

-- rechten: enkel de publieke spelfuncties zijn aanroepbaar vanuit de browser
revoke execute on function public.fo_next_round(text) from public, anon, authenticated;
revoke execute on function public.fo_slot(text, uuid) from public, anon, authenticated;
grant execute on function public.create_room(text, uuid, jsonb, int), public.join_room(text, text, uuid), public.set_mode(text, uuid, jsonb, int),
  public.start_game(text, uuid), public.submit_guess(text, uuid, text), public.tick(text), public.skip_round(text, uuid),
  public.back_to_lobby(text, uuid), public.mode_options(), public.pool_names(jsonb), public.intro_faces() to anon, authenticated;

-- spel verlaten (toegevoegd)
alter table public.rooms add column if not exists left_slot int;
create or replace function public.leave_room(p_code text, p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s int;
begin
  s := fo_slot(p_code, p_token);
  if s is null then return null; end if;
  update rooms set status = case when status in ('playing','reveal') then 'finished' else status end,
    left_slot = s, next_at = null, updated_at = now()
  where code = upper(p_code);
  return fo_room_json(p_code);
end $$;
grant execute on function public.leave_room(text, uuid) to anon, authenticated;

-- reeks-vermenigvuldiger (x1, x2, x3 max): zie migratie streak_multiplier
alter table public.rooms add column if not exists host_streak int not null default 0;
alter table public.rooms add column if not exists guest_streak int not null default 0;
alter table public.rooms add column if not exists round_mult int;
