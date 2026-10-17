-- OPTIONAL: Promote exactly one EXISTING Auth account after Parts 1 and 2.
-- Replace the email below with the account you use for IT administration.
-- On a fresh project with no Auth users, use the application's first-account setup instead.
begin;
do $partcast_super_admin$
declare
  login_email text := 'REPLACE_WITH_YOUR_LOGIN_EMAIL';
  account_id uuid;
  matching_accounts integer;
begin
  login_email := lower(trim(login_email));
  if login_email='replace_with_your_login_email' or login_email not like '%@%.%' then
    raise exception 'Replace REPLACE_WITH_YOUR_LOGIN_EMAIL with the existing IT administrator account email before running this file.';
  end if;
  select count(*) into matching_accounts from auth.users where lower(email)=login_email;
  if matching_accounts=0 then
    raise exception 'No Auth account exists for %. Create the intended account in Supabase Authentication > Users first, then rerun with its exact email.',login_email;
  elsif matching_accounts<>1 then
    raise exception 'More than one Auth account uses %. No account was promoted. Resolve the duplicate accounts first.',login_email;
  end if;
  select id into account_id from auth.users where lower(email)=login_email;
  insert into public.profiles(id,full_name)
  select id,coalesce(raw_user_meta_data->>'full_name','') from auth.users where id=account_id
  on conflict(id) do nothing;
  update public.profiles set role='super_admin',active=true where id=account_id;
  raise notice 'Activated Super Admin for %. Other accounts were not changed.',login_email;
end $partcast_super_admin$;
commit;
