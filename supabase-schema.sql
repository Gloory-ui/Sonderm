-- Таблица пользователей
create table if not exists public.users (
  id bigserial primary key,
  username text not null unique,
  avatar text default null,
  status text default 'offline',
  created_at timestamptz not null default now()
);

-- Таблица сообщений
create table if not exists public.messages (
  id bigserial primary key,
  user_id bigint not null references public.users(id) on delete cascade,
  text text not null,
  image text default null,
  created_at timestamptz not null default now()
);

-- Индексы для быстрого чтения
create index if not exists idx_messages_created_at on public.messages(created_at);
create index if not exists idx_messages_user_id on public.messages(user_id);

-- === RLS ПОЛИТИКИ (важно!) ===

-- Включаем RLS
alter table public.users enable row level security;
alter table public.messages enable row level security;

-- Политики для users: все могут читать и создавать
create policy "Allow public read access" on public.users
  for select using (true);

create policy "Allow public insert access" on public.users
  for insert with check (true);

create policy "Allow public update access" on public.users
  for update using (true);

-- Политики для messages: все могут читать и создавать
create policy "Allow public read access" on public.messages
  for select using (true);

create policy "Allow public insert access" on public.messages
  for insert with check (true);

create policy "Allow public delete access" on public.messages
  for delete using (true);