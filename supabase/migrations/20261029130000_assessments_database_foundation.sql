create type public.assessment_version_status as enum ('draft', 'published', 'retired');
create type public.assessment_attempt_status as enum ('in_progress', 'submitted');
create type public.assessment_schedule_source as enum ('system_default', 'counselor_preference', 'case_override', 'manual');

create table public.assessment_definitions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug = lower(btrim(slug)) and slug ~ '^[a-z0-9_]+$'),
  title text not null check (btrim(title) <> ''),
  description text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function private.assessment_guard_definition_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.slug is distinct from old.slug and exists (
    select 1 from public.assessment_versions version where version.assessment_id = old.id
  ) then raise exception 'Assessment identity cannot change after versioning begins'; end if;
  return new;
end;
$$;
create trigger assessment_definition_identity_immutable before update on public.assessment_definitions
for each row execute function private.assessment_guard_definition_identity();

create table public.assessment_versions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessment_definitions(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  status public.assessment_version_status not null default 'draft',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  constraint assessment_versions_number_unique unique (assessment_id, version_number),
  constraint assessment_versions_publish_shape check ((status = 'draft') = (published_at is null))
);

create table public.assessment_categories (
  id uuid primary key default gen_random_uuid(),
  assessment_version_id uuid not null references public.assessment_versions(id) on delete restrict,
  category_key text not null check (category_key = lower(btrim(category_key)) and category_key ~ '^[a-z0-9_]+$'),
  label text not null check (btrim(label) <> ''),
  position integer not null check (position >= 0),
  constraint assessment_categories_version_key_unique unique (assessment_version_id, category_key),
  constraint assessment_categories_version_position_unique unique (assessment_version_id, position),
  constraint assessment_categories_id_version_unique unique (id, assessment_version_id)
);

create table public.assessment_questions (
  id uuid primary key default gen_random_uuid(),
  assessment_version_id uuid not null references public.assessment_versions(id) on delete restrict,
  position integer not null check (position >= 0),
  prompt text not null check (btrim(prompt) <> ''),
  constraint assessment_questions_version_position_unique unique (assessment_version_id, position),
  constraint assessment_questions_id_version_unique unique (id, assessment_version_id)
);

create table public.assessment_choices (
  id uuid primary key default gen_random_uuid(),
  assessment_version_id uuid not null,
  question_id uuid not null,
  position integer not null check (position >= 0),
  label text not null check (btrim(label) <> ''),
  constraint assessment_choices_question_position_unique unique (question_id, position),
  constraint assessment_choices_id_question_unique unique (id, question_id),
  constraint assessment_choices_id_version_unique unique (id, assessment_version_id),
  constraint assessment_choices_question_version_fk foreign key (question_id, assessment_version_id)
    references public.assessment_questions(id, assessment_version_id) on delete restrict
);

-- Scoring keys are deliberately separated from display choices so authenticated participants
-- can read question/choice wording without learning the answer-to-category mapping.
create table public.assessment_choice_scores (
  choice_id uuid primary key references public.assessment_choices(id) on delete restrict,
  assessment_version_id uuid not null,
  category_id uuid not null,
  constraint assessment_choice_scores_category_version_fk foreign key (category_id, assessment_version_id)
    references public.assessment_categories(id, assessment_version_id) on delete restrict,
  constraint assessment_choice_scores_choice_version_fk foreign key (choice_id, assessment_version_id)
    references public.assessment_choices(id, assessment_version_id) on delete restrict
);

create table public.assessment_system_defaults (
  assessment_id uuid primary key references public.assessment_definitions(id) on delete restrict,
  session_id uuid not null references public.sessions(id) on delete restrict,
  updated_at timestamptz not null default now()
);

create table public.assessment_counselor_preferences (
  assessment_id uuid not null references public.assessment_definitions(id) on delete restrict,
  counselor_profile_id uuid not null references public.profiles(id) on delete restrict,
  session_id uuid not null references public.sessions(id) on delete restrict,
  updated_at timestamptz not null default now(),
  primary key (assessment_id, counselor_profile_id)
);

create table public.assessment_case_overrides (
  assessment_id uuid not null references public.assessment_definitions(id) on delete restrict,
  counseling_case_id uuid not null references public.counseling_cases(id) on delete restrict,
  session_id uuid not null references public.sessions(id) on delete restrict,
  configured_by uuid not null references public.profiles(id) on delete restrict,
  configured_at timestamptz not null default now(),
  primary key (assessment_id, counseling_case_id)
);

create table public.assessment_case_schedules (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessment_definitions(id) on delete restrict,
  counseling_case_id uuid not null references public.counseling_cases(id) on delete restrict,
  assessment_version_id uuid not null references public.assessment_versions(id) on delete restrict,
  session_id uuid not null references public.sessions(id) on delete restrict,
  case_session_id uuid references public.case_sessions(id) on delete restrict,
  schedule_source public.assessment_schedule_source not null,
  required_for_progression boolean not null default true,
  configured_by uuid not null references public.profiles(id) on delete restrict,
  configured_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assessment_case_schedules_case_assessment_unique unique (counseling_case_id, assessment_id),
  constraint assessment_case_schedules_id_case_unique unique (id, counseling_case_id),
  constraint assessment_case_schedules_session_pair_unique unique (id, session_id)
);
create index assessment_case_schedules_case_idx on public.assessment_case_schedules(counseling_case_id, session_id);

create table public.assessment_participant_assignments (
  id uuid primary key default gen_random_uuid(),
  assessment_schedule_id uuid not null,
  counseling_case_id uuid not null references public.counseling_cases(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  constraint assessment_participant_assignments_schedule_case_fk foreign key (assessment_schedule_id, counseling_case_id)
    references public.assessment_case_schedules(id, counseling_case_id) on delete restrict,
  constraint assessment_participant_assignments_schedule_profile_unique unique (assessment_schedule_id, profile_id),
  constraint assessment_participant_assignments_id_profile_unique unique (id, profile_id)
);
create index assessment_participant_assignments_profile_idx on public.assessment_participant_assignments(profile_id, assigned_at desc);

create table public.assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  participant_assignment_id uuid not null,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  attempt_number integer not null check (attempt_number > 0),
  status public.assessment_attempt_status not null default 'in_progress',
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  constraint assessment_attempts_assignment_profile_fk foreign key (participant_assignment_id, profile_id)
    references public.assessment_participant_assignments(id, profile_id) on delete restrict,
  constraint assessment_attempts_number_unique unique (participant_assignment_id, attempt_number),
  constraint assessment_attempts_submit_shape check ((status = 'submitted') = (submitted_at is not null)),
  constraint assessment_attempts_id_profile_unique unique (id, profile_id)
);
create unique index assessment_attempts_one_initial_idx on public.assessment_attempts(participant_assignment_id) where attempt_number = 1;
create index assessment_attempts_assignment_submitted_idx on public.assessment_attempts(participant_assignment_id, submitted_at desc);

create or replace function private.assessment_guard_submitted_attempt()
returns trigger language plpgsql security definer set search_path = '' as $$
declare attempt_status public.assessment_attempt_status;
begin
  if tg_op = 'DELETE' then attempt_status := old.status; else attempt_status := old.status; end if;
  if attempt_status = 'submitted' then raise exception 'Submitted Assessment attempts are immutable'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger assessment_attempts_submitted_immutable before update or delete on public.assessment_attempts
for each row execute function private.assessment_guard_submitted_attempt();

create table public.assessment_responses (
  attempt_id uuid not null,
  profile_id uuid not null,
  question_id uuid not null references public.assessment_questions(id) on delete restrict,
  choice_id uuid not null,
  updated_at timestamptz not null default now(),
  primary key (attempt_id, question_id),
  constraint assessment_responses_attempt_profile_fk foreign key (attempt_id, profile_id)
    references public.assessment_attempts(id, profile_id) on delete restrict,
  constraint assessment_responses_choice_question_fk foreign key (choice_id, question_id)
    references public.assessment_choices(id, question_id) on delete restrict
);

create table public.assessment_attempt_scores (
  attempt_id uuid not null references public.assessment_attempts(id) on delete restrict,
  assessment_version_id uuid not null,
  category_id uuid not null,
  score integer not null check (score between 0 and 30),
  rank integer not null check (rank between 1 and 5),
  is_primary boolean not null,
  primary key (attempt_id, category_id),
  constraint assessment_attempt_scores_category_version_fk foreign key (category_id, assessment_version_id)
    references public.assessment_categories(id, assessment_version_id) on delete restrict,
  constraint assessment_attempt_scores_rank_unique unique (attempt_id, rank)
);
create index assessment_attempt_scores_attempt_idx on public.assessment_attempt_scores(attempt_id);

create or replace function private.assessment_can_manage_catalog()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and private.current_user_has_role(array['super_admin', 'admin', 'author']::public.app_role[]);
$$;

create or replace function private.assessment_can_manage_case(target_case_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.counseling_cases counseling_case
    where counseling_case.id = target_case_id
      and (
        private.current_user_has_role(array['super_admin', 'admin']::public.app_role[])
        or (
          counseling_case.closed_at is null
          and private.current_user_has_role(array['counselor']::public.app_role[])
          and exists (
            select 1 from public.case_assignments assignment
            join public.groups counselor_team on counselor_team.id = assignment.assigned_group_id and counselor_team.group_type = 'counselor_team'
            join public.group_members member on member.group_id = counselor_team.id and member.profile_id = auth.uid() and member.ended_at is null
            where assignment.counseling_case_id = counseling_case.id
              and assignment.assignment_type = 'counselor'
              and assignment.ended_at is null
          )
        )
      )
  );
$$;

create or replace function private.assessment_can_read_case(target_case_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    private.current_user_has_role(array['super_admin', 'admin']::public.app_role[])
    or private.current_user_can_access_case(target_case_id)
  );
$$;

create or replace function private.assessment_user_owns_attempt(target_attempt_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.assessment_attempts attempt
    where attempt.id = target_attempt_id and attempt.profile_id = auth.uid()
  );
$$;

create or replace function private.assessment_user_can_read_version(target_version_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    private.assessment_can_manage_catalog()
    or exists (
      select 1 from public.assessment_case_schedules schedule
      join public.assessment_participant_assignments assignment on assignment.assessment_schedule_id = schedule.id
      where schedule.assessment_version_id = target_version_id
        and schedule.case_session_id is not null
        and (
          assignment.profile_id = auth.uid()
          or (private.current_user_has_role(array['counselor']::public.app_role[]) and private.assessment_can_manage_case(schedule.counseling_case_id))
        )
    )
  );
$$;

create or replace function private.assessment_attempt_case_id(target_attempt_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select schedule.counseling_case_id
  from public.assessment_attempts attempt
  join public.assessment_participant_assignments participant_assignment on participant_assignment.id = attempt.participant_assignment_id
  join public.assessment_case_schedules schedule on schedule.id = participant_assignment.assessment_schedule_id
  where attempt.id = target_attempt_id;
$$;

create or replace function private.assessment_guard_published_content()
returns trigger language plpgsql security definer set search_path = '' as $$
declare version_id uuid; version_status public.assessment_version_status; old_version_status public.assessment_version_status;
begin
  if tg_table_name = 'assessment_versions' then
    if tg_op = 'DELETE' then version_id := old.id; else version_id := new.id; end if;
  elsif tg_table_name = 'assessment_categories' then
    if tg_op = 'DELETE' then version_id := old.assessment_version_id; else version_id := new.assessment_version_id; end if;
  elsif tg_table_name = 'assessment_questions' then
    if tg_op = 'DELETE' then version_id := old.assessment_version_id; else version_id := new.assessment_version_id; end if;
  elsif tg_table_name = 'assessment_choices' or tg_table_name = 'assessment_choice_scores' then
    if tg_op = 'DELETE' then version_id := old.assessment_version_id; else version_id := new.assessment_version_id; end if;
  end if;
  if tg_op = 'UPDATE' and tg_table_name <> 'assessment_versions' then
    if tg_table_name = 'assessment_categories' then select status into old_version_status from public.assessment_versions where id = old.assessment_version_id;
    elsif tg_table_name = 'assessment_questions' then select status into old_version_status from public.assessment_versions where id = old.assessment_version_id;
    elsif tg_table_name = 'assessment_choices' or tg_table_name = 'assessment_choice_scores' then select status into old_version_status from public.assessment_versions where id = old.assessment_version_id;
    end if;
  end if;
  select status into version_status from public.assessment_versions where id = version_id;
  if version_status in ('published', 'retired') or old_version_status in ('published', 'retired') then
    if tg_table_name = 'assessment_versions' and tg_op = 'UPDATE'
      and old.assessment_id = new.assessment_id
      and old.version_number = new.version_number
      and old.created_by is not distinct from new.created_by
      and old.created_at = new.created_at
      and old.published_at = new.published_at
      and old.status = 'published' and new.status = 'retired' then
      return new;
    end if;
    raise exception 'Published Assessment versions are immutable';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger assessment_versions_immutable before update or delete on public.assessment_versions
for each row execute function private.assessment_guard_published_content();
create trigger assessment_categories_immutable before insert or update or delete on public.assessment_categories
for each row execute function private.assessment_guard_published_content();
create trigger assessment_questions_immutable before insert or update or delete on public.assessment_questions
for each row execute function private.assessment_guard_published_content();
create trigger assessment_choices_immutable before insert or update or delete on public.assessment_choices
for each row execute function private.assessment_guard_published_content();
create trigger assessment_choice_scores_immutable before insert or update or delete on public.assessment_choice_scores
for each row execute function private.assessment_guard_published_content();

create or replace function private.assessment_guard_response_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare attempt_id_value uuid; attempt_status public.assessment_attempt_status; old_attempt_status public.assessment_attempt_status;
begin
  attempt_id_value := case when tg_op = 'DELETE' then old.attempt_id else new.attempt_id end;
  select status into attempt_status from public.assessment_attempts where id = attempt_id_value;
  if tg_op = 'UPDATE' then select status into old_attempt_status from public.assessment_attempts where id = old.attempt_id; end if;
  if attempt_status = 'submitted' or old_attempt_status = 'submitted' then raise exception 'Submitted Assessment responses are immutable'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger assessment_responses_submitted_immutable before insert or update or delete on public.assessment_responses
for each row execute function private.assessment_guard_response_mutation();

create or replace function private.assessment_guard_score_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare attempt_id_value uuid; attempt_status public.assessment_attempt_status; old_attempt_status public.assessment_attempt_status;
begin
  attempt_id_value := case when tg_op = 'DELETE' then old.attempt_id else new.attempt_id end;
  select status into attempt_status from public.assessment_attempts where id = attempt_id_value;
  if tg_op = 'UPDATE' then select status into old_attempt_status from public.assessment_attempts where id = old.attempt_id; end if;
  if attempt_status = 'submitted' or old_attempt_status = 'submitted' then raise exception 'Submitted Assessment results are immutable'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger assessment_attempt_scores_submitted_immutable before insert or update or delete on public.assessment_attempt_scores
for each row execute function private.assessment_guard_score_mutation();

create or replace function public.publish_assessment_version(target_version_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  version_row public.assessment_versions%rowtype;
  assessment_slug text;
  question_count integer;
  invalid_choice_count integer;
  category_count integer;
  max_category_score integer;
begin
  if not private.assessment_can_manage_catalog() then raise exception 'Not authorized'; end if;
  select definition.slug into assessment_slug
  from public.assessment_versions version
  join public.assessment_definitions definition on definition.id = version.assessment_id
  where version.id = target_version_id;
  select * into version_row
  from public.assessment_versions version
  where version.id = target_version_id for update;
  if not found or version_row.status <> 'draft' then raise exception 'Only a Draft Assessment version can be published'; end if;

  select count(*)::integer into question_count from public.assessment_questions where assessment_version_id = target_version_id;
  if question_count = 0 then raise exception 'Assessment must include at least one question'; end if;
  select count(*)::integer into invalid_choice_count
  from public.assessment_questions question
  where question.assessment_version_id = target_version_id
    and (select count(*) from public.assessment_choices choice where choice.question_id = question.id) <> 2;
  if invalid_choice_count > 0 then raise exception 'Every paired-choice question must have exactly two choices'; end if;
  if exists (
    select 1 from public.assessment_choices choice
    left join public.assessment_choice_scores score on score.choice_id = choice.id
    where choice.assessment_version_id = target_version_id and score.choice_id is null
  ) then raise exception 'Every choice must have a scoring category'; end if;

  if assessment_slug = 'love_languages' then
    if question_count <> 30 then raise exception 'Love Languages requires exactly 30 questions'; end if;
    select count(*)::integer into category_count from public.assessment_categories where assessment_version_id = target_version_id;
    if category_count <> 5 or exists (
      select 1 from unnest(array['words_of_affirmation','quality_time','receiving_gifts','acts_of_service','physical_touch']) required(category_key)
      where not exists (select 1 from public.assessment_categories category where category.assessment_version_id = target_version_id and category.category_key = required.category_key)
    ) then raise exception 'Love Languages requires the five approved scoring categories'; end if;
    select coalesce(max(possible.score), 0)::integer into max_category_score
    from (
      select category.id, count(distinct question.id)::integer as score
      from public.assessment_categories category
      left join public.assessment_choice_scores choice_score on choice_score.category_id = category.id
      left join public.assessment_choices choice on choice.id = choice_score.choice_id
      left join public.assessment_questions question on question.id = choice.question_id
      where category.assessment_version_id = target_version_id
      group by category.id
    ) possible;
    if max_category_score > 12 then raise exception 'Love Languages category maximum cannot exceed 12'; end if;
  end if;

  update public.assessment_versions set status = 'published', published_at = now() where id = target_version_id;
end;
$$;

create or replace function public.set_assessment_counselor_preference(target_assessment_id uuid, target_session_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.current_user_has_role(array['counselor']::public.app_role[]) then raise exception 'Only a Counselor may set a personal Assessment preference'; end if;
  if not exists (select 1 from public.sessions where id = target_session_id and status = 'published') then raise exception 'Select a published Session'; end if;
  if not exists (select 1 from public.assessment_definitions where id = target_assessment_id) then raise exception 'Assessment is unavailable'; end if;
  insert into public.assessment_counselor_preferences(assessment_id, counselor_profile_id, session_id)
  values (target_assessment_id, auth.uid(), target_session_id)
  on conflict (assessment_id, counselor_profile_id) do update set session_id = excluded.session_id, updated_at = now();
end;
$$;

create or replace function private.activate_case_assessment_schedule(target_schedule_id uuid, target_case_session_id uuid, actor_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  schedule_row public.assessment_case_schedules%rowtype;
  couple_group_id uuid;
  active_member_count integer;
begin
  select * into schedule_row from public.assessment_case_schedules where id = target_schedule_id for update;
  if not found then raise exception 'Assessment schedule is unavailable'; end if;
  if not exists (
    select 1 from public.case_sessions case_session
    where case_session.id = target_case_session_id
      and case_session.counseling_case_id = schedule_row.counseling_case_id
      and case_session.session_id = schedule_row.session_id
      and case_session.status = 'active'
  ) then raise exception 'Assessment Session is not active for this Case'; end if;
  select counseling_case.couple_group_id into couple_group_id from public.counseling_cases counseling_case where counseling_case.id = schedule_row.counseling_case_id;
  select count(*)::integer into active_member_count
  from public.group_members member
  join public.groups couple_group on couple_group.id = member.group_id and couple_group.group_type = 'couple'
  where member.group_id = couple_group_id and member.ended_at is null;
  if active_member_count <> 2 then raise exception 'An Assessment requires exactly two active Couple members'; end if;

  update public.assessment_case_schedules set case_session_id = target_case_session_id, updated_at = now() where id = target_schedule_id;
  insert into public.assessment_participant_assignments(assessment_schedule_id, counseling_case_id, profile_id)
  select target_schedule_id, schedule_row.counseling_case_id, member.profile_id
  from public.group_members member
  where member.group_id = couple_group_id and member.ended_at is null
  on conflict (assessment_schedule_id, profile_id) do nothing;
end;
$$;

create or replace function public.configure_case_assessment_schedule(
  target_case_id uuid,
  target_assessment_id uuid,
  target_version_id uuid,
  target_session_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  selected_session_id uuid;
  selected_source public.assessment_schedule_source;
  case_override_session_id uuid;
  schedule_id uuid;
  active_case_session_id uuid;
  existing_version_id uuid;
begin
  if actor is null or not private.assessment_can_manage_case(target_case_id) then raise exception 'Not authorized'; end if;
  if not exists (select 1 from public.assessment_versions where id = target_version_id and assessment_id = target_assessment_id and status = 'published') then raise exception 'Select a published Assessment version'; end if;

  if target_session_id is not null then
    if not exists (select 1 from public.sessions where id = target_session_id and status = 'published') then raise exception 'Select a published Session'; end if;
    selected_session_id := target_session_id;
    selected_source := 'case_override';
    insert into public.assessment_case_overrides(assessment_id, counseling_case_id, session_id, configured_by)
    values(target_assessment_id, target_case_id, target_session_id, actor)
    on conflict (assessment_id, counseling_case_id) do update set session_id = excluded.session_id, configured_by = excluded.configured_by, configured_at = now();
  else
    select session_id into case_override_session_id from public.assessment_case_overrides
    where assessment_id = target_assessment_id and counseling_case_id = target_case_id;
    if case_override_session_id is not null then
      selected_session_id := case_override_session_id;
      selected_source := 'case_override';
    elsif private.current_user_has_role(array['counselor']::public.app_role[]) then
      select preference.session_id into selected_session_id from public.assessment_counselor_preferences preference
      where preference.assessment_id = target_assessment_id and preference.counselor_profile_id = actor;
      if selected_session_id is not null then selected_source := 'counselor_preference'; end if;
    end if;
    if selected_session_id is null then
      select default_setting.session_id into selected_session_id from public.assessment_system_defaults default_setting where default_setting.assessment_id = target_assessment_id;
      selected_source := 'system_default';
    end if;
  end if;
  if selected_session_id is null or not exists (select 1 from public.sessions where id = selected_session_id and status = 'published') then raise exception 'Assessment Session default is unavailable'; end if;

  select id into active_case_session_id from public.case_sessions
  where counseling_case_id = target_case_id and session_id = selected_session_id and status = 'active';
  if exists (select 1 from public.case_sessions where counseling_case_id = target_case_id and session_id = selected_session_id and status = 'completed') and active_case_session_id is null then
    raise exception 'Assessment cannot be assigned to a completed Session';
  end if;

  select id, assessment_version_id into schedule_id, existing_version_id
  from public.assessment_case_schedules where counseling_case_id = target_case_id and assessment_id = target_assessment_id for update;
  if schedule_id is not null and existing_version_id <> target_version_id and exists (
    select 1 from public.assessment_participant_assignments participant_assignment
    join public.assessment_attempts attempt on attempt.participant_assignment_id = participant_assignment.id
    where participant_assignment.assessment_schedule_id = schedule_id
  ) then raise exception 'Assessment version cannot change after participant attempts begin'; end if;

  insert into public.assessment_case_schedules(assessment_id, counseling_case_id, assessment_version_id, session_id, case_session_id, schedule_source, configured_by)
  values(target_assessment_id, target_case_id, target_version_id, selected_session_id, active_case_session_id, selected_source, actor)
  on conflict (counseling_case_id, assessment_id) do update set
    assessment_version_id = excluded.assessment_version_id,
    session_id = excluded.session_id,
    case_session_id = excluded.case_session_id,
    schedule_source = excluded.schedule_source,
    configured_by = excluded.configured_by,
    updated_at = now()
  returning id into schedule_id;

  if active_case_session_id is not null then perform private.activate_case_assessment_schedule(schedule_id, active_case_session_id, actor); end if;
  return schedule_id;
end;
$$;

create or replace function public.start_assessment_attempt(target_participant_assignment_id uuid, voluntary_retake boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  assignment_row public.assessment_participant_assignments%rowtype;
  next_attempt_number integer;
  attempt_id uuid;
begin
  if actor is null then raise exception 'Not authorized'; end if;
  select * into assignment_row from public.assessment_participant_assignments where id = target_participant_assignment_id and profile_id = actor for update;
  if not found then raise exception 'Not authorized'; end if;
  if not exists (
    select 1 from public.assessment_case_schedules schedule
    where schedule.id = assignment_row.assessment_schedule_id and schedule.case_session_id is not null
  ) then raise exception 'Assessment is not active yet'; end if;
  if voluntary_retake then
    if not exists (select 1 from public.assessment_attempts where participant_assignment_id = assignment_row.id and attempt_number = 1 and status = 'submitted') then
      raise exception 'Complete the initial Assessment before starting a retake';
    end if;
    select coalesce(max(attempt_number), 1) + 1 into next_attempt_number from public.assessment_attempts where participant_assignment_id = assignment_row.id;
  else
    next_attempt_number := 1;
  end if;
  insert into public.assessment_attempts(participant_assignment_id, profile_id, attempt_number)
  values(assignment_row.id, actor, next_attempt_number)
  on conflict (participant_assignment_id, attempt_number) do nothing
  returning id into attempt_id;
  if attempt_id is null and not voluntary_retake then
    select id into attempt_id from public.assessment_attempts where participant_assignment_id = assignment_row.id and attempt_number = 1;
  end if;
  return attempt_id;
end;
$$;

create or replace function public.save_assessment_response(target_attempt_id uuid, target_question_id uuid, target_choice_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); attempt_row public.assessment_attempts%rowtype; schedule_id uuid; version_id uuid;
begin
  if actor is null then raise exception 'Not authorized'; end if;
  select * into attempt_row from public.assessment_attempts where id = target_attempt_id and profile_id = actor for update;
  if not found then raise exception 'Not authorized'; end if;
  if attempt_row.status <> 'in_progress' then raise exception 'Submitted Assessment responses are read-only'; end if;
  select participant_assignment.assessment_schedule_id, schedule.assessment_version_id into schedule_id, version_id
  from public.assessment_participant_assignments participant_assignment
  join public.assessment_case_schedules schedule on schedule.id = participant_assignment.assessment_schedule_id
  where participant_assignment.id = attempt_row.participant_assignment_id and schedule.case_session_id is not null;
  if schedule_id is null then raise exception 'Assessment is not active yet'; end if;
  if not exists (
    select 1 from public.assessment_questions question
    join public.assessment_choices choice on choice.question_id = question.id
    where question.id = target_question_id and question.assessment_version_id = version_id
      and choice.id = target_choice_id
  ) then raise exception 'Select one of the available answers'; end if;
  insert into public.assessment_responses(attempt_id, profile_id, question_id, choice_id)
  values(target_attempt_id, actor, target_question_id, target_choice_id)
  on conflict (attempt_id, question_id) do update set choice_id = excluded.choice_id, updated_at = now();
end;
$$;

create or replace function public.submit_assessment_attempt(target_attempt_id uuid)
returns table(category_key text, category_label text, score integer, rank integer, is_primary boolean)
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  attempt_row public.assessment_attempts%rowtype;
  version_id uuid;
  expected_question_count integer;
  response_count integer;
  max_score integer;
begin
  if actor is null then raise exception 'Not authorized'; end if;
  select * into attempt_row from public.assessment_attempts where id = target_attempt_id and profile_id = actor for update;
  if not found then raise exception 'Not authorized'; end if;
  if attempt_row.status = 'submitted' then
    return query select category.category_key, category.label, result.score, result.rank, result.is_primary
      from public.assessment_attempt_scores result
      join public.assessment_categories category on category.id = result.category_id
      where result.attempt_id = target_attempt_id order by result.rank, category.position;
    return;
  end if;
  select schedule.assessment_version_id into version_id
  from public.assessment_participant_assignments participant_assignment
  join public.assessment_case_schedules schedule on schedule.id = participant_assignment.assessment_schedule_id
  where participant_assignment.id = attempt_row.participant_assignment_id and schedule.case_session_id is not null;
  if version_id is null then raise exception 'Assessment is not active yet'; end if;
  select count(*)::integer into expected_question_count from public.assessment_questions where assessment_version_id = version_id;
  select count(*)::integer into response_count
  from public.assessment_responses response
  join public.assessment_questions question on question.id = response.question_id and question.assessment_version_id = version_id
  where response.attempt_id = target_attempt_id and response.profile_id = actor;
  if expected_question_count = 0 or response_count <> expected_question_count then raise exception 'Answer every question before submitting'; end if;
  if exists (
    select 1 from public.assessment_questions question
    where question.assessment_version_id = version_id
      and not exists (select 1 from public.assessment_responses response where response.attempt_id = target_attempt_id and response.question_id = question.id and response.profile_id = actor)
  ) then raise exception 'Answer every question before submitting'; end if;

  insert into public.assessment_attempt_scores(attempt_id, assessment_version_id, category_id, score, rank, is_primary)
  with category_scores as (
    select category.id as category_id, category.category_key, category.position,
      count(response.choice_id) filter (where choice_score.choice_id is not null)::integer as score
    from public.assessment_categories category
    left join public.assessment_choice_scores choice_score on choice_score.category_id = category.id
    left join public.assessment_responses response on response.attempt_id = target_attempt_id and response.choice_id = choice_score.choice_id and response.profile_id = actor
    where category.assessment_version_id = version_id
    group by category.id, category.category_key, category.position
  ), ranked as (
    select category_id, score,
      dense_rank() over (order by score desc, position) as rank,
      max(score) over () as max_score
    from category_scores
  )
  select target_attempt_id, version_id, category_id, score, rank, score = max_score from ranked;

  select coalesce(sum(score), 0)::integer, coalesce(max(score), 0)::integer into response_count, max_score
  from public.assessment_attempt_scores where attempt_id = target_attempt_id;
  if response_count <> expected_question_count then raise exception 'Assessment scoring did not produce the expected total'; end if;
  if (select count(*) from public.assessment_attempt_scores where attempt_id = target_attempt_id) <> 5
    or (select count(*) from public.assessment_attempt_scores where attempt_id = target_attempt_id and score > 12) > 0
    then raise exception 'Assessment scoring results are invalid'; end if;

  update public.assessment_attempts set status = 'submitted', submitted_at = now() where id = target_attempt_id;
  return query select category.category_key, category.label, result.score, result.rank, result.is_primary
    from public.assessment_attempt_scores result
    join public.assessment_categories category on category.id = result.category_id
    where result.attempt_id = target_attempt_id order by result.rank, category.position;
end;
$$;

create or replace function public.get_partner_assessment_score_history(target_schedule_id uuid)
returns table(attempt_number integer, submitted_at timestamptz, category_key text, category_label text, score integer, rank integer, is_primary boolean)
language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := auth.uid(); own_assignment_id uuid; partner_assignment_id uuid; target_case_id uuid;
begin
  if actor is null or not private.current_user_has_role(array['couple']::public.app_role[]) then raise exception 'Not authorized'; end if;
  select schedule.counseling_case_id, own_assignment.id into target_case_id, own_assignment_id
  from public.assessment_case_schedules schedule
  join public.assessment_participant_assignments own_assignment on own_assignment.assessment_schedule_id = schedule.id and own_assignment.profile_id = actor
  where schedule.id = target_schedule_id and schedule.case_session_id is not null;
  if own_assignment_id is null then raise exception 'Not authorized'; end if;
  select other_assignment.id into partner_assignment_id
  from public.assessment_participant_assignments other_assignment
  where other_assignment.assessment_schedule_id = target_schedule_id and other_assignment.profile_id <> actor;
  if partner_assignment_id is null or not exists (
    select 1 from public.assessment_attempts own_initial where own_initial.participant_assignment_id = own_assignment_id and own_initial.attempt_number = 1 and own_initial.status = 'submitted'
  ) or not exists (
    select 1 from public.assessment_attempts partner_initial where partner_initial.participant_assignment_id = partner_assignment_id and partner_initial.attempt_number = 1 and partner_initial.status = 'submitted'
  ) then raise exception 'Partner results are available after both initial Assessments are submitted'; end if;
  return query
    with latest as (
      select attempt.id, attempt.attempt_number, attempt.submitted_at
      from public.assessment_attempts attempt
      where attempt.participant_assignment_id = partner_assignment_id and attempt.status = 'submitted'
      order by attempt.attempt_number desc
      limit 5
    )
    select latest.attempt_number, latest.submitted_at, category.category_key, category.label,
      result.score, result.rank, result.is_primary
    from latest
    join public.assessment_attempt_scores result on result.attempt_id = latest.id
    join public.assessment_categories category on category.id = result.category_id
    order by latest.attempt_number desc, result.rank, category.position;
end;
$$;

insert into public.assessment_definitions(slug, title, description)
values ('love_languages', 'Love Languages', 'Paired-choice assessment. Questionnaire wording requires approved publication rights.')
on conflict (slug) do nothing;

insert into public.assessment_versions(assessment_id, version_number, status)
select definition.id, 1, 'draft'
from public.assessment_definitions definition
where definition.slug = 'love_languages'
  and not exists (select 1 from public.assessment_versions version where version.assessment_id = definition.id and version.version_number = 1);

insert into public.assessment_categories(assessment_version_id, category_key, label, position)
select version.id, category.category_key, category.label, category.position
from public.assessment_versions version
join public.assessment_definitions definition on definition.id = version.assessment_id and definition.slug = 'love_languages'
cross join (values
  ('words_of_affirmation', 'Words of Affirmation', 0),
  ('quality_time', 'Quality Time', 1),
  ('receiving_gifts', 'Receiving Gifts', 2),
  ('acts_of_service', 'Acts of Service', 3),
  ('physical_touch', 'Physical Touch', 4)
) as category(category_key, label, position)
where version.version_number = 1 and version.status = 'draft'
  and not exists (select 1 from public.assessment_categories existing where existing.assessment_version_id = version.id and existing.category_key = category.category_key);

insert into public.assessment_system_defaults(assessment_id, session_id)
select definition.id, session.id
from public.assessment_definitions definition
cross join lateral (select id from public.sessions where sequence_number = 1 and status = 'published' order by id limit 1) session
where definition.slug = 'love_languages'
on conflict (assessment_id) do update set session_id = excluded.session_id, updated_at = now();

alter table public.assessment_definitions enable row level security;
alter table public.assessment_versions enable row level security;
alter table public.assessment_categories enable row level security;
alter table public.assessment_questions enable row level security;
alter table public.assessment_choices enable row level security;
alter table public.assessment_choice_scores enable row level security;
alter table public.assessment_system_defaults enable row level security;
alter table public.assessment_counselor_preferences enable row level security;
alter table public.assessment_case_overrides enable row level security;
alter table public.assessment_case_schedules enable row level security;
alter table public.assessment_participant_assignments enable row level security;
alter table public.assessment_attempts enable row level security;
alter table public.assessment_responses enable row level security;
alter table public.assessment_attempt_scores enable row level security;

revoke all on public.assessment_definitions, public.assessment_versions, public.assessment_categories,
  public.assessment_questions, public.assessment_choices, public.assessment_choice_scores,
  public.assessment_system_defaults, public.assessment_counselor_preferences,
  public.assessment_case_overrides, public.assessment_case_schedules,
  public.assessment_participant_assignments, public.assessment_attempts,
  public.assessment_responses, public.assessment_attempt_scores from public, anon, authenticated;
grant select, insert, update, delete on public.assessment_definitions, public.assessment_versions,
  public.assessment_categories, public.assessment_questions, public.assessment_choices,
  public.assessment_choice_scores to authenticated;
grant select on public.assessment_system_defaults, public.assessment_counselor_preferences,
  public.assessment_case_overrides, public.assessment_case_schedules,
  public.assessment_participant_assignments, public.assessment_attempts,
  public.assessment_responses, public.assessment_attempt_scores to authenticated;

create policy assessment_definitions_read_authorized on public.assessment_definitions for select to authenticated
using (private.assessment_can_manage_catalog() or exists (
  select 1 from public.assessment_case_schedules schedule
  where schedule.assessment_id = assessment_definitions.id and private.assessment_can_read_case(schedule.counseling_case_id)
));
create policy assessment_definitions_catalog_write on public.assessment_definitions for all to authenticated
using (private.assessment_can_manage_catalog()) with check (private.assessment_can_manage_catalog());

create policy assessment_versions_read_authorized on public.assessment_versions for select to authenticated
using (private.assessment_user_can_read_version(id));
create policy assessment_versions_catalog_write on public.assessment_versions for all to authenticated
using (private.assessment_can_manage_catalog() and status = 'draft')
with check (private.assessment_can_manage_catalog() and status = 'draft');

create policy assessment_categories_read_authorized on public.assessment_categories for select to authenticated
using (private.assessment_user_can_read_version(assessment_version_id));
create policy assessment_categories_catalog_write on public.assessment_categories for all to authenticated
using (private.assessment_can_manage_catalog() and exists (select 1 from public.assessment_versions version where version.id = assessment_version_id and version.status = 'draft'))
with check (private.assessment_can_manage_catalog() and exists (select 1 from public.assessment_versions version where version.id = assessment_version_id and version.status = 'draft'));

create policy assessment_questions_read_authorized on public.assessment_questions for select to authenticated
using (private.assessment_user_can_read_version(assessment_version_id));
create policy assessment_questions_catalog_write on public.assessment_questions for all to authenticated
using (private.assessment_can_manage_catalog() and exists (select 1 from public.assessment_versions version where version.id = assessment_version_id and version.status = 'draft'))
with check (private.assessment_can_manage_catalog() and exists (select 1 from public.assessment_versions version where version.id = assessment_version_id and version.status = 'draft'));

create policy assessment_choices_read_authorized on public.assessment_choices for select to authenticated
using (private.assessment_user_can_read_version(assessment_version_id));
create policy assessment_choices_catalog_write on public.assessment_choices for all to authenticated
using (private.assessment_can_manage_catalog() and exists (select 1 from public.assessment_versions version where version.id = assessment_version_id and version.status = 'draft'))
with check (private.assessment_can_manage_catalog() and exists (select 1 from public.assessment_versions version where version.id = assessment_version_id and version.status = 'draft'));

create policy assessment_choice_scores_catalog_read on public.assessment_choice_scores for select to authenticated
using (private.assessment_can_manage_catalog());
create policy assessment_choice_scores_catalog_write on public.assessment_choice_scores for all to authenticated
using (private.assessment_can_manage_catalog() and exists (select 1 from public.assessment_versions version where version.id = assessment_version_id and version.status = 'draft'))
with check (private.assessment_can_manage_catalog() and exists (select 1 from public.assessment_versions version where version.id = assessment_version_id and version.status = 'draft'));

create policy assessment_system_defaults_admin_read on public.assessment_system_defaults for select to authenticated
using (private.current_user_has_role(array['super_admin', 'admin']::public.app_role[]));
create policy assessment_counselor_preferences_own_read on public.assessment_counselor_preferences for select to authenticated
using (counselor_profile_id = auth.uid() and private.current_user_has_role(array['counselor']::public.app_role[]));
create policy assessment_case_overrides_authorized_read on public.assessment_case_overrides for select to authenticated
using (private.assessment_can_read_case(counseling_case_id));
create policy assessment_case_schedules_authorized_read on public.assessment_case_schedules for select to authenticated
using (private.assessment_can_read_case(counseling_case_id));
create policy assessment_participant_assignments_owner_or_counselor_read on public.assessment_participant_assignments for select to authenticated
using (profile_id = auth.uid() or (private.current_user_has_role(array['counselor']::public.app_role[]) and private.assessment_can_manage_case(counseling_case_id)));
create policy assessment_attempts_owner_or_counselor_read on public.assessment_attempts for select to authenticated
using (profile_id = auth.uid() or (private.current_user_has_role(array['counselor']::public.app_role[]) and private.assessment_can_manage_case(private.assessment_attempt_case_id(id))));
create policy assessment_responses_owner_read on public.assessment_responses for select to authenticated
using (profile_id = auth.uid());
create policy assessment_attempt_scores_owner_or_counselor_read on public.assessment_attempt_scores for select to authenticated
using (private.assessment_user_owns_attempt(attempt_id) or (
  private.current_user_has_role(array['counselor']::public.app_role[])
  and private.assessment_can_manage_case(private.assessment_attempt_case_id(attempt_id))
));

revoke all on function private.assessment_can_manage_catalog(), private.assessment_can_manage_case(uuid),
  private.assessment_can_read_case(uuid), private.assessment_user_owns_attempt(uuid),
  private.assessment_user_can_read_version(uuid), private.assessment_attempt_case_id(uuid),
  private.assessment_guard_definition_identity(), private.assessment_guard_published_content(),
  private.assessment_guard_submitted_attempt(), private.assessment_guard_response_mutation(),
  private.assessment_guard_score_mutation(), private.activate_case_assessment_schedule(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.assessment_can_manage_catalog(), private.assessment_can_manage_case(uuid),
  private.assessment_can_read_case(uuid), private.assessment_user_owns_attempt(uuid),
  private.assessment_user_can_read_version(uuid), private.assessment_attempt_case_id(uuid)
  to authenticated;
revoke all on function public.publish_assessment_version(uuid), public.set_assessment_counselor_preference(uuid, uuid),
  public.configure_case_assessment_schedule(uuid, uuid, uuid, uuid), public.start_assessment_attempt(uuid, boolean),
  public.save_assessment_response(uuid, uuid, uuid), public.submit_assessment_attempt(uuid),
  public.get_partner_assessment_score_history(uuid) from public, anon;
grant execute on function public.publish_assessment_version(uuid), public.set_assessment_counselor_preference(uuid, uuid),
  public.configure_case_assessment_schedule(uuid, uuid, uuid, uuid), public.start_assessment_attempt(uuid, boolean),
  public.save_assessment_response(uuid, uuid, uuid), public.submit_assessment_attempt(uuid),
  public.get_partner_assessment_score_history(uuid) to authenticated;

comment on table public.assessment_choice_scores is 'Scoring mapping is not participant-readable; use server-authorized assessment RPCs.';
comment on table public.assessment_case_schedules is 'Persisted Case target and pinned Assessment version; preference changes do not rewrite existing schedules.';
comment on table public.assessment_attempt_scores is 'Server-calculated, immutable submitted Assessment result history.';
