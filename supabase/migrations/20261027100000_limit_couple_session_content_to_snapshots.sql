-- Couple Session views read immutable case-session snapshots. Do not expose
-- mutable Session Builder content or Resources that were not assigned.
drop policy if exists session_material_blocks_couple_current_read
  on public.session_material_blocks;

drop policy if exists resources_couple_current_session_read
  on public.resources;
