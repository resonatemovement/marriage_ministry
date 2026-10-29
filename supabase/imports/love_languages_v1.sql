-- Repeatable DEV content import for the existing Love Languages Draft v1.
-- Source: user-provided "love languages quiz.pdf". The PDF itself is not stored in the app.
-- Run only against the approved Supabase project with `supabase db query --linked --project-ref <DEV_REF> --file supabase/imports/love_languages_v1.sql`.
-- This script uses the existing authenticated catalog policy and publishing RPC. It never edits a published version.

begin;

create temporary table _love_language_choice_seed (
  question_position integer not null,
  choice_position integer not null,
  label text not null,
  category_key text not null,
  primary key (question_position, choice_position)
) on commit drop;

insert into _love_language_choice_seed (question_position, choice_position, label, category_key) values
  (0, 0, 'I receive a loving note/text/email for no special reason from my loved one.', 'words_of_affirmation'),
  (0, 1, 'my partner and I hug.', 'physical_touch'),
  (1, 0, 'I can spend alone time with my partner - just the two of us.', 'quality_time'),
  (1, 1, 'my partner does something practical to help me out.', 'acts_of_service'),
  (2, 0, 'my partner gives me a little gift as a token of our love for each other.', 'receiving_gifts'),
  (2, 1, 'I get to spend uninterrupted leisure time with my partner.', 'quality_time'),
  (3, 0, 'my partner unexpectedly does something for me like filling my car or doing the laundry.', 'acts_of_service'),
  (3, 1, 'my partner and I touch.', 'physical_touch'),
  (4, 0, 'my partner puts his/her arm around me when we’re in public.', 'physical_touch'),
  (4, 1, 'my partner surprises me with a gift.', 'receiving_gifts'),
  (5, 0, 'I’m around my partner, even if we’re not really doing anything.', 'quality_time'),
  (5, 1, 'I hold hands with my partner.', 'physical_touch'),
  (6, 0, 'my partner gives me a gift.', 'receiving_gifts'),
  (6, 1, 'I hear “I love you” from my partner.', 'words_of_affirmation'),
  (7, 0, 'I sit close to my partner.', 'physical_touch'),
  (7, 1, 'I am complimented by my loved one for no apparent reason.', 'words_of_affirmation'),
  (8, 0, 'I get the chance to just “hang out” with my partner.', 'quality_time'),
  (8, 1, 'I unexpectedly get small gifts from my partner.', 'receiving_gifts'),
  (9, 0, 'I hear my partner tell me, “I’m proud of you.”', 'words_of_affirmation'),
  (9, 1, 'my partner helps me with a task.', 'acts_of_service'),
  (10, 0, 'I get to do things with my partner.', 'quality_time'),
  (10, 1, 'I hear supportive words from my partner.', 'words_of_affirmation'),
  (11, 0, 'my partner does things for me instead of just talking about doing nice things.', 'acts_of_service'),
  (11, 1, 'I feel connected to my partner through a hug.', 'physical_touch'),
  (12, 0, 'I hear praise from my partner.', 'words_of_affirmation'),
  (12, 1, 'my partner gives me something that shows he/she was really thinking about me.', 'receiving_gifts'),
  (13, 0, 'I’m able to just be around my partner.', 'quality_time'),
  (13, 1, 'I get a back rub or massage from my partner.', 'physical_touch'),
  (14, 0, 'my partner reacts positively to something I’ve accomplished.', 'words_of_affirmation'),
  (14, 1, 'my partner does something for me that I know they don’t particularly enjoy.', 'acts_of_service'),
  (15, 0, 'my partner and I kiss frequently.', 'physical_touch'),
  (15, 1, 'I sense my partner is showing interest in the things I care about.', 'quality_time'),
  (16, 0, 'my partner works on special projects with me that I have to complete.', 'acts_of_service'),
  (16, 1, 'my partner gives me an exciting gift.', 'receiving_gifts'),
  (17, 0, 'I’m complimented by my partner on my appearance.', 'words_of_affirmation'),
  (17, 1, 'my partner takes the time to listen to me and really understand my feelings.', 'quality_time'),
  (18, 0, 'my partner and I share non-sexual touch in public.', 'physical_touch'),
  (18, 1, 'my partner offers to run errands for me.', 'acts_of_service'),
  (19, 0, 'my partner does a bit more than his/her normal share of the responsibilities we share (around the house, work-related, etc).', 'acts_of_service'),
  (19, 1, 'I get a gift that I know my partner put thought into choosing.', 'receiving_gifts'),
  (20, 0, 'my partner doesn’t check his/her phone while we’re talking.', 'quality_time'),
  (20, 1, 'my partner goes out of their way to do something that relieves pressure on me.', 'acts_of_service'),
  (21, 0, 'I can look forward to a holiday because of a gift I anticipate receiving.', 'receiving_gifts'),
  (21, 1, 'I hear the words, “I appreciate you” from my partner.', 'words_of_affirmation'),
  (22, 0, 'my partner brings me a little gift after he/she has been traveling without me.', 'receiving_gifts'),
  (22, 1, 'my partner takes care of something I’m responsible to do but I feel too stressed to do at the time.', 'acts_of_service'),
  (23, 0, 'my partner doesn’t interrupt me while I’m talking.', 'quality_time'),
  (23, 1, 'gift giving is an important part of our relationship.', 'receiving_gifts'),
  (24, 0, 'my partner helps me out when he/she knows I’m already tired.', 'acts_of_service'),
  (24, 1, 'I get to go somewhere while spending time with my partner.', 'quality_time'),
  (25, 0, 'my partner and I are physically intimate.', 'physical_touch'),
  (25, 1, 'my partner gives me a little gift that he/she picked up in the course of their normal day.', 'receiving_gifts'),
  (26, 0, 'my partner says something encouraging to me.', 'words_of_affirmation'),
  (26, 1, 'I get to spend time in a shared activity or hobby with my partner.', 'quality_time'),
  (27, 0, 'my partner surprises me with a small token of their appreciation.', 'receiving_gifts'),
  (27, 1, 'my partner and I touch a lot during the normal course of the day.', 'physical_touch'),
  (28, 0, 'my partner helps me out - especially if I know they’re already busy.', 'acts_of_service'),
  (28, 1, 'I hear my partner specifically tell me, “I appreciate you.”', 'words_of_affirmation'),
  (29, 0, 'my partner and I embrace after we’ve been apart for a while.', 'physical_touch'),
  (29, 1, 'I hear my partner say how much I mean to him/her.', 'words_of_affirmation');

grant select on _love_language_choice_seed to authenticated;

do $$
begin
  perform set_config(
    'request.jwt.claim.sub',
    (
      select profile.id::text
      from public.profiles profile
      join public.profile_roles role_map on role_map.profile_id = profile.id
      where profile.status = 'active' and role_map.role in ('admin', 'super_admin')
      order by case role_map.role when 'admin' then 0 else 1 end, profile.id
      limit 1
    ),
    true
  );
end;
$$;
set local role authenticated;

do $$
declare
  target_version_id uuid;
  target_status public.assessment_version_status;
  question_total integer;
  choice_total integer;
  score_total integer;
  category_maximum integer;
begin
  if auth.uid() is null or not private.assessment_can_manage_catalog() then
    raise exception 'An active Admin or Super Admin is required to import Love Languages';
  end if;

  select version.id, version.status into target_version_id, target_status
  from public.assessment_versions version
  join public.assessment_definitions definition on definition.id = version.assessment_id
  where definition.slug = 'love_languages' and version.version_number = 1;

  if target_version_id is null then raise exception 'Existing Love Languages v1 was not found'; end if;

  if (select count(*) from public.assessment_categories where assessment_version_id = target_version_id) <> 5
    or exists (
      select 1 from (values
        ('words_of_affirmation', 'Words of Affirmation', 0),
        ('quality_time', 'Quality Time', 1),
        ('receiving_gifts', 'Receiving Gifts', 2),
        ('acts_of_service', 'Acts of Service', 3),
        ('physical_touch', 'Physical Touch', 4)
      ) expected(category_key, label, position)
      where not exists (
        select 1 from public.assessment_categories category
        where category.assessment_version_id = target_version_id
          and category.category_key = expected.category_key
          and category.label = expected.label
          and category.position = expected.position
      )
    ) then raise exception 'Love Languages v1 category catalog does not match the approved scoring keys'; end if;

  select count(*)::integer into question_total from public.assessment_questions where assessment_version_id = target_version_id;
  select count(*)::integer into choice_total from public.assessment_choices where assessment_version_id = target_version_id;
  select count(*)::integer into score_total from public.assessment_choice_scores where assessment_version_id = target_version_id;

  if target_status = 'published' then
    if question_total <> 30 or choice_total <> 60 or score_total <> 60
      or exists (
        select 1 from generate_series(0, 29) as generated(question_position)
        left join public.assessment_questions question
          on question.assessment_version_id = target_version_id and question.position = generated.question_position
        where question.id is null or question.prompt <> 'It’s more meaningful to me when…'
      )
      or exists (
        select 1
        from _love_language_choice_seed expected
        left join public.assessment_questions question
          on question.assessment_version_id = target_version_id and question.position = expected.question_position
        left join public.assessment_choices choice
          on choice.assessment_version_id = target_version_id
          and choice.question_id = question.id and choice.position = expected.choice_position
        left join public.assessment_categories category
          on category.assessment_version_id = target_version_id and category.category_key = expected.category_key
        left join public.assessment_choice_scores score
          on score.assessment_version_id = target_version_id
          and score.choice_id = choice.id and score.category_id = category.id
        where choice.id is null or choice.label <> expected.label or score.choice_id is null
      ) then raise exception 'Published Love Languages v1 exists but does not match this import'; end if;
    raise notice 'Love Languages v1 is already published and matches this import; no changes made';
    return;
  end if;

  if target_status <> 'draft' then raise exception 'Love Languages v1 is not a Draft'; end if;
  -- Drafts are writable under the catalog policy, so serialize only the import path.
  select version.status into target_status
  from public.assessment_versions version
  where version.id = target_version_id
  for update;
  if target_status <> 'draft' then raise exception 'Love Languages v1 changed while the import was waiting'; end if;
  if question_total <> 0 or choice_total <> 0 or score_total <> 0 then
    raise exception 'Love Languages v1 Draft is not empty; refusing to overwrite existing content';
  end if;

  insert into public.assessment_questions (assessment_version_id, position, prompt)
  select target_version_id, position, 'It’s more meaningful to me when…'
  from generate_series(0, 29) position;

  insert into public.assessment_choices (assessment_version_id, question_id, position, label)
  select target_version_id, question.id, expected.choice_position, expected.label
  from _love_language_choice_seed expected
  join public.assessment_questions question
    on question.assessment_version_id = target_version_id
    and question.position = expected.question_position;

  insert into public.assessment_choice_scores (choice_id, assessment_version_id, category_id)
  select choice.id, target_version_id, category.id
  from _love_language_choice_seed expected
  join public.assessment_questions question
    on question.assessment_version_id = target_version_id
    and question.position = expected.question_position
  join public.assessment_choices choice
    on choice.assessment_version_id = target_version_id
    and choice.question_id = question.id
    and choice.position = expected.choice_position
    and choice.label = expected.label
  join public.assessment_categories category
    on category.assessment_version_id = target_version_id
    and category.category_key = expected.category_key;

  select count(*)::integer into question_total from public.assessment_questions where assessment_version_id = target_version_id;
  select count(*)::integer into choice_total from public.assessment_choices where assessment_version_id = target_version_id;
  select count(*)::integer into score_total from public.assessment_choice_scores where assessment_version_id = target_version_id;
  select max(possible_points)::integer into category_maximum
  from (
    select category.id, count(distinct question.id)::integer as possible_points
    from public.assessment_categories category
    join public.assessment_choice_scores score on score.category_id = category.id
    join public.assessment_choices choice on choice.id = score.choice_id
    join public.assessment_questions question on question.id = choice.question_id
    where category.assessment_version_id = target_version_id
    group by category.id
  ) category_totals;

  if question_total <> 30 or choice_total <> 60 or score_total <> 60 or category_maximum <> 12
    or exists (
      select 1 from generate_series(0, 29) as generated(question_position)
      left join public.assessment_questions question
        on question.assessment_version_id = target_version_id and question.position = generated.question_position
      where question.id is null or question.prompt <> 'It’s more meaningful to me when…'
    )
    or exists (
      select 1
      from _love_language_choice_seed expected
      left join public.assessment_questions question
        on question.assessment_version_id = target_version_id and question.position = expected.question_position
      left join public.assessment_choices choice
        on choice.assessment_version_id = target_version_id
        and choice.question_id = question.id and choice.position = expected.choice_position
      left join public.assessment_categories category
        on category.assessment_version_id = target_version_id and category.category_key = expected.category_key
      left join public.assessment_choice_scores score
        on score.assessment_version_id = target_version_id
        and score.choice_id = choice.id and score.category_id = category.id
      where choice.id is null or choice.label <> expected.label or score.choice_id is null
    ) then raise exception 'Imported Love Languages content failed its exact-content or scoring validation'; end if;

  perform public.publish_assessment_version(target_version_id);

  if not exists (
    select 1 from public.assessment_versions
    where id = target_version_id and status = 'published' and published_at is not null
  ) then raise exception 'Authorized publishing contract did not publish Love Languages v1'; end if;
end;
$$;

commit;
