-- Migration 001: Usage Metering Schema
-- Applied via: supabase db push (NOT docker-entrypoint-initdb.d)
-- Phase 0: single-tenant. Sprint 1 adds RLS and multi-tenant isolation.

-- ── ORGANISATIONS (tenants) ───────────────────────────────────────
create table if not exists organisations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz default now()
);

-- Insert default Phase 0 org so metering can reference it
insert into organisations (id, name)
values ('00000000-0000-0000-0000-000000000001', 'default')
on conflict do nothing;

-- ── EVERY LLM CALL ───────────────────────────────────────────────
create table if not exists token_events (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid references organisations(id),
  agent_id      text not null,
  agent_name    text not null,
  model         text not null,
  tokens_in     integer not null,
  tokens_out    integer not null,
  cost_usd_est  numeric(10,6) not null,
  task_id       text,
  created_at    timestamptz default now()
);

-- ── SEAT CHANGES (join / leave) ───────────────────────────────────
create table if not exists seat_events (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid references organisations(id),
  user_id     text not null,
  event_type  text check (event_type in ('invite_accepted','seat_removed')),
  created_at  timestamptz default now()
);

-- ── AGENT TASK RUNS ───────────────────────────────────────────────
create table if not exists agent_run_logs (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid references organisations(id),
  agent_id     text not null,
  agent_name   text not null,
  task_id      text not null,
  story_id     text,
  started_at   timestamptz not null,
  ended_at     timestamptz,
  exit_code    integer,
  tokens_total integer default 0,
  cost_usd_est numeric(10,6) default 0,
  status       text check (status in ('running','complete','failed','rejected')) default 'running',
  created_at   timestamptz default now()
);

-- ── CONVENIENCE VIEWS ─────────────────────────────────────────────
create or replace view daily_token_summary as
  select
    org_id,
    date_trunc('day', created_at) as day,
    sum(tokens_in + tokens_out)   as total_tokens,
    sum(cost_usd_est)             as total_cost_usd,
    count(*)                      as call_count
  from token_events
  group by org_id, day;

create or replace view active_seats as
  select org_id, count(distinct user_id) as seat_count
  from seat_events
  where event_type = 'invite_accepted'
    and user_id not in (
      select user_id from seat_events where event_type = 'seat_removed'
    )
  group by org_id;

-- ── INDEXES ───────────────────────────────────────────────────────
create index if not exists idx_token_events_org_ts
  on token_events (org_id, created_at desc);

create index if not exists idx_agent_run_logs_org_ts
  on agent_run_logs (org_id, started_at desc);
