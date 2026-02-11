-- 1. Add Subscription Columns to Profiles
alter table public.profiles 
add column if not exists stripe_customer_id text,
add column if not exists stripe_subscription_id text,
add column if not exists tier text default 'free', -- 'free', 'plus', 'ultra'
add column if not exists credits_last_reset timestamptz default now(),
add column if not exists daily_credits_limit int default 1;

-- 2. Update existing rows (optional, safe default is already 'free' / 1)
update public.profiles set daily_credits_limit = 1 where tier = 'free';

-- 3. Function to handle Daily Credit Reset (Lazy)
-- This function will be called by your API before checking credits.
-- It checks if the last reset was yesterday (or older), and refills credits if so.
create or replace function public.check_and_reset_credits(user_id uuid)
returns void as $$
declare
  user_profile public.profiles%rowtype;
begin
  select * into user_profile from public.profiles where id = user_id;
  
  -- If last reset was before today (UTC)
  if user_profile.credits_last_reset < current_date::timestamptz then
    update public.profiles
    set 
      credits = user_profile.daily_credits_limit,
      credits_last_reset = now()
    where id = user_id;
  end if;
end;
$$ language plpgsql security definer;
