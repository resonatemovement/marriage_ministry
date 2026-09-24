-- Require a real host after the scheme, not merely any non-space suffix such
-- as "https://:" or "https://?". Keep common DNS and bracketed-IP URLs.
create or replace function private.validate_homework_version_block()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  version_homework uuid;
  block_homework uuid;
begin
  select homework_id into version_homework
  from public.homework_versions where id = new.homework_version_id;
  select homework_id into block_homework
  from public.homework_blocks where id = new.homework_block_id;
  if version_homework is null or version_homework <> block_homework then
    raise exception 'Homework block belongs to another Homework';
  end if;
  if new.block_type in ('rich_text', 'long_answer')
     and not private.homework_json_has_meaningful_text(new.rich_text_content) then
    raise exception 'Rich text content must be meaningful';
  end if;
  if new.block_type = 'video_link' and new.url !~* '^https?://(\[[0-9a-f:.]+\]|[[:alnum:]]+(-[[:alnum:]]+)*(\.[[:alnum:]]+(-[[:alnum:]]+)*)*\.?)(:[0-9]{1,5})?([/?#][^[:space:]]*)?$' then
    raise exception 'Video link must be a valid http or https URL with a host';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_homework_version_block() from public, anon, authenticated;
