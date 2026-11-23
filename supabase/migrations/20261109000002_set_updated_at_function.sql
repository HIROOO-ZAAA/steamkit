-- Create set_updated_at trigger function
-- Standard function to auto-update updated_at timestamp on row updates

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  new.updated_at = now();
  return new;
end
$function$;

revoke all on function public.set_updated_at() from public;
grant execute on function public.set_updated_at() to service_role;

-- Notify PostgREST
notify pgrst, 'reload schema';
