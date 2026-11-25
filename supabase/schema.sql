-- NinoNime · skema database (keypass + bot WhatsApp)
-- Jalankan di Supabase → SQL Editor. Aman dijalankan ulang.
-- Admin pertama (setelah akunmu terdaftar di aplikasi):
--   insert into public.nn_admins (user_id) select id from auth.users where email = 'emailkamu@gmail.com';
--
-- Alur:
--   1. Keypass dibuat oleh bot WhatsApp (nn_bot_keypass, otomatis berdasarkan email) atau oleh admin
--      (Akun → Admin → Keypass & bot WhatsApp, atau: select * from public.nn_make_keypass(5, 'catatan');)
--   2. Bot / admin mengirim keypass ke pengguna lewat WhatsApp. Keypass dari bot hanya bisa dipakai akun dengan email itu.
--   3. Pengguna memasukkan keypass sekali (nn_redeem_keypass). Keypass terikat ke akunnya dan tidak bisa dipakai akun lain.
--   4. Akses dicek dengan nn_access(); keypass milik sendiri tampil di halaman Akun.
-- Keypass disimpan apa adanya (bukan hash) karena pemiliknya perlu melihat & menyalinnya lagi di halaman Akun.
-- Hanya pemilik dan admin yang bisa membacanya, dan hanya lewat fungsi di bawah (tabel tertutup dari klien).

begin;

create extension if not exists pgcrypto with schema extensions;

-- admin NinoNime (boleh membuat/mencabut keypass dan kunci bot)
create table if not exists public.nn_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.nn_admins enable row level security;
revoke all on table public.nn_admins from anon, authenticated;
create or replace function public.nn_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.nn_admins a where a.user_id = auth.uid());
$$;
revoke all on function public.nn_is_admin() from public;
grant execute on function public.nn_is_admin() to anon, authenticated;

create table if not exists public.nn_keypass (
  code text primary key,
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete set null,
  redeemed_at timestamptz,
  revoked boolean not null default false,
  constraint nn_keypass_code check (code ~ '^NK-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$'),
  constraint nn_keypass_note check (note is null or char_length(note) <= 80)
);
alter table public.nn_keypass add column if not exists reserved_email text;   -- keypass dari bot: khusus email ini
alter table public.nn_keypass add column if not exists wa text;               -- nomor WhatsApp peminta (bot)
create index if not exists nn_keypass_email_idx on public.nn_keypass (lower(reserved_email)) where reserved_email is not null;
create index if not exists nn_keypass_wa_idx on public.nn_keypass (wa, created_at desc) where wa is not null;
-- satu keypass aktif per akun (keypass yang dicabut tidak menghalangi keypass baru)
create unique index if not exists nn_keypass_user_idx on public.nn_keypass (user_id) where user_id is not null and not revoked;
alter table public.nn_keypass enable row level security;
revoke all on table public.nn_keypass from anon, authenticated;

-- percobaan memasukkan keypass (rem tebak-tebakan: maks 8 percobaan gagal per jam per akun)
create table if not exists public.nn_keypass_tries (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now()
);
create index if not exists nn_keypass_tries_idx on public.nn_keypass_tries (user_id, at desc);
alter table public.nn_keypass_tries enable row level security;
revoke all on table public.nn_keypass_tries from anon, authenticated;

-- status akses akun yang sedang login: { access, code }
create or replace function public.nn_access()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object('access', k.code is not null, 'code', k.code)
  from (select 1) d
  left join public.nn_keypass k on k.user_id = auth.uid() and not k.revoked;
$$;
revoke all on function public.nn_access() from public, anon;
grant execute on function public.nn_access() to authenticated;

-- masukkan keypass (sekali per akun). Keypass salah dikembalikan sebagai { error } (bukan exception)
-- supaya catatan percobaannya tidak ikut dibatalkan.
create or replace function public.nn_redeem_keypass(p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  c text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  mine text;
  n int;
begin
  if uid is null then raise exception 'Masuk dulu untuk memakai keypass.'; end if;
  select code into mine from public.nn_keypass where user_id = uid and not revoked;
  if mine is not null then return json_build_object('access', true, 'code', mine); end if;
  select count(*) into n from public.nn_keypass_tries where user_id = uid and at > now() - interval '1 hour';
  if n >= 8 then raise exception 'Terlalu banyak percobaan. Coba lagi 1 jam lagi.'; end if;
  c := replace(regexp_replace(c, '^NK-?', ''), '-', '');
  if c !~ '^[A-Z2-9]{12}$' then
    insert into public.nn_keypass_tries (user_id) values (uid);
    return json_build_object('access', false, 'error', 'Format keypass tidak dikenal. Contoh: NK-ABCD-EFGH-JKLM');
  end if;
  c := 'NK-' || substr(c, 1, 4) || '-' || substr(c, 5, 4) || '-' || substr(c, 9, 4);
  update public.nn_keypass k set user_id = uid, redeemed_at = now()
    where k.code = c and k.user_id is null and not k.revoked
      and (k.reserved_email is null or lower(k.reserved_email) = (select lower(u.email) from auth.users u where u.id = uid))
    returning k.code into mine;
  if mine is null then
    insert into public.nn_keypass_tries (user_id) values (uid);
    return json_build_object('access', false, 'error', case when exists (select 1 from public.nn_keypass where code = c and user_id is null and not revoked)
      then 'Keypass ini dibuat untuk email akun lain. Masuk dengan email yang kamu kirim ke bot.' else 'Keypass tidak valid atau sudah dipakai akun lain.' end);
  end if;
  delete from public.nn_keypass_tries where user_id = uid;
  return json_build_object('access', true, 'code', mine);
end;
$$;
revoke all on function public.nn_redeem_keypass(text) from public, anon;
grant execute on function public.nn_redeem_keypass(text) to authenticated;

-- pembuat kode acak NK-XXXX-XXXX-XXXX (tanpa huruf/angka yang mirip: I, O, 0, 1)
create or replace function public.nn_keypass_new_code()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  abc constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  j int; s text; b bytea;
begin
  loop
    b := extensions.gen_random_bytes(12); s := '';
    for j in 0 .. 11 loop s := s || substr(abc, (get_byte(b, j) % 32) + 1, 1); end loop;
    s := 'NK-' || substr(s, 1, 4) || '-' || substr(s, 5, 4) || '-' || substr(s, 9, 4);
    exit when not exists (select 1 from public.nn_keypass where code = s);
  end loop;
  return s;
end;
$$;
revoke all on function public.nn_keypass_new_code() from public, anon, authenticated;

-- admin: buat keypass baru (maks 50 sekali buat)
create or replace function public.nn_make_keypass(p_count int default 1, p_note text default null)
returns setof text
language plpgsql
security definer
set search_path = public
as $$
declare i int; s text;
begin
  if not public.nn_is_admin() then raise exception 'Khusus admin.'; end if;
  for i in 1 .. least(greatest(coalesce(p_count, 1), 1), 50) loop
    s := public.nn_keypass_new_code();
    insert into public.nn_keypass (code, note, created_by) values (s, nullif(left(trim(p_note), 80), ''), auth.uid());
    return next s;
  end loop;
end;
$$;
revoke all on function public.nn_make_keypass(int, text) from public, anon;
grant execute on function public.nn_make_keypass(int, text) to authenticated;

-- admin: daftar keypass terbaru beserta pemakainya (di-drop dulu: kolom hasil bisa bertambah)
drop function if exists public.nn_keypass_list(int);
create or replace function public.nn_keypass_list(p_limit int default 100)
returns table (code text, note text, created_at timestamptz, redeemed_at timestamptz, revoked boolean, email text, name text, reserved_email text, wa text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.nn_is_admin() then raise exception 'Khusus admin.'; end if;
  return query
    select k.code, k.note, k.created_at, k.redeemed_at, k.revoked, u.email::text, null::text, k.reserved_email, k.wa
    from public.nn_keypass k
    left join auth.users u on u.id = k.user_id
    order by k.created_at desc
    limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;
revoke all on function public.nn_keypass_list(int) from public, anon;
grant execute on function public.nn_keypass_list(int) to authenticated;

-- admin: cabut / pulihkan keypass (akses akun pemakainya ikut hilang / kembali)
create or replace function public.nn_revoke_keypass(p_code text, p_revoked boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.nn_is_admin() then raise exception 'Khusus admin.'; end if;
  update public.nn_keypass set revoked = coalesce(p_revoked, true) where code = p_code;
end;
$$;
revoke all on function public.nn_revoke_keypass(text, boolean) from public, anon;
grant execute on function public.nn_revoke_keypass(text, boolean) to authenticated;

-- =====================================================================
-- Bot WhatsApp: membuat keypass otomatis berdasarkan email.
-- Bot TIDAK memegang kunci service_role. Bot hanya memakai kunci publik (anon) + "kunci bot" rahasia.
-- Di database hanya tersimpan hash SHA-256 kunci bot; kunci bisa dicabut kapan saja dari panel admin.
-- =====================================================================
create table if not exists public.nn_bot_keys (
  id bigint generated always as identity primary key,
  key_hash text not null unique,
  label text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked boolean not null default false,
  constraint nn_bot_keys_len check (char_length(key_hash) = 64)
);
alter table public.nn_bot_keys enable row level security;
revoke all on table public.nn_bot_keys from anon, authenticated;

-- admin: buat kunci bot baru. Kunci hanya ditampilkan SEKALI (yang disimpan hanya hash-nya).
create or replace function public.nn_make_bot_key(p_label text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare k text;
begin
  if not public.nn_is_admin() then raise exception 'Khusus admin.'; end if;
  k := 'nkbot_' || encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.nn_bot_keys (key_hash, label) values (encode(extensions.digest(k, 'sha256'), 'hex'), nullif(left(trim(p_label), 60), ''));
  return k;
end;
$$;
revoke all on function public.nn_make_bot_key(text) from public, anon;
grant execute on function public.nn_make_bot_key(text) to authenticated;

-- admin: daftar & cabut kunci bot
create or replace function public.nn_list_bot_keys()
returns table (id bigint, label text, created_at timestamptz, last_used_at timestamptz, revoked boolean)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.nn_is_admin() then raise exception 'Khusus admin.'; end if;
  return query select b.id, b.label, b.created_at, b.last_used_at, b.revoked from public.nn_bot_keys b order by b.created_at desc;
end;
$$;
revoke all on function public.nn_list_bot_keys() from public, anon;
grant execute on function public.nn_list_bot_keys() to authenticated;
create or replace function public.nn_revoke_bot_key(p_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.nn_is_admin() then raise exception 'Khusus admin.'; end if;
  update public.nn_bot_keys set revoked = true where id = p_id;
end;
$$;
revoke all on function public.nn_revoke_bot_key(bigint) from public, anon;
grant execute on function public.nn_revoke_bot_key(bigint) to authenticated;

-- dipanggil bot: POST /rest/v1/rpc/nn_bot_keypass { p_key, p_email, p_wa }
-- hasil: { ok, status: baru|sudah_ada|sudah_aktif, code } atau { ok: false, error }
--   sudah_aktif = email itu sudah memakai keypass (kode yang sama dikirim ulang)
--   sudah_ada   = keypass untuk email itu sudah dibuat tapi belum dipakai (kode yang sama dikirim ulang)
-- Batas: maks 3 keypass baru per nomor WhatsApp per 24 jam, dan maks 60 keypass baru per kunci bot per jam.
create or replace function public.nn_bot_keypass(p_key text, p_email text, p_wa text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  bk public.nn_bot_keys;
  e text := lower(trim(coalesce(p_email, '')));
  w text := nullif(regexp_replace(coalesce(p_wa, ''), '[^0-9]', '', 'g'), '');
  uid uuid; c text; n int;
begin
  select * into bk from public.nn_bot_keys
    where key_hash = encode(extensions.digest(coalesce(p_key, ''), 'sha256'), 'hex') and not revoked;
  if bk.id is null then return json_build_object('ok', false, 'error', 'Kunci bot tidak valid.'); end if;
  update public.nn_bot_keys set last_used_at = now() where id = bk.id;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return json_build_object('ok', false, 'error', 'Format email tidak valid.'); end if;
  select u.id into uid from auth.users u where lower(u.email) = e and u.email_confirmed_at is not null limit 1;
  if uid is null then
    return json_build_object('ok', false, 'error', 'Email ini belum terdaftar di NinoNime (atau belum dikonfirmasi). Daftar dulu di aplikasi NinoNime, lalu kirim lagi.');
  end if;
  select code into c from public.nn_keypass where user_id = uid and not revoked;
  if c is not null then return json_build_object('ok', true, 'status', 'sudah_aktif', 'code', c); end if;
  select code into c from public.nn_keypass where lower(reserved_email) = e and user_id is null and not revoked order by created_at desc limit 1;
  if c is not null then return json_build_object('ok', true, 'status', 'sudah_ada', 'code', c); end if;
  if w is not null then
    select count(*) into n from public.nn_keypass where wa = w and created_at > now() - interval '24 hours';
    if n >= 3 then return json_build_object('ok', false, 'error', 'Nomor ini sudah meminta 3 keypass hari ini. Coba lagi besok.'); end if;
  end if;
  select count(*) into n from public.nn_keypass where note = 'bot:' || bk.id and created_at > now() - interval '1 hour';
  if n >= 60 then return json_build_object('ok', false, 'error', 'Bot sedang sibuk. Coba lagi sebentar.'); end if;
  c := public.nn_keypass_new_code();
  insert into public.nn_keypass (code, note, reserved_email, wa) values (c, 'bot:' || bk.id, e, w);
  return json_build_object('ok', true, 'status', 'baru', 'code', c);
end;
$$;
revoke all on function public.nn_bot_keypass(text, text, text) from public;
grant execute on function public.nn_bot_keypass(text, text, text) to anon, authenticated;

grant all on public.nn_keypass, public.nn_keypass_tries , public.nn_bot_keys, public.nn_admins to service_role;

commit;
