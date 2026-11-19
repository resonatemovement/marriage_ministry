-- Read-only, transaction-scoped post-migration contract verifier. This can run
-- against DEV after the forward migration; it creates no records and sends no email.
begin;
do $verify$
declare function_definition text;
begin
  assert to_regclass('public.homework_completion_notification_deliveries') is not null,
    'Recipient delivery table is missing';
  assert exists(select 1 from pg_constraint where conrelid='public.homework_completion_notification_deliveries'::regclass
    and conname='homework_completion_delivery_per_recipient'),
    'Recipient-level notification uniqueness is missing';
  assert has_table_privilege('authenticated','public.homework_completion_notification_deliveries','select') is false,
    'Authenticated users can directly read recipient delivery rows';
  assert has_table_privilege('service_role','public.homework_completion_notification_deliveries','select') is false,
    'Worker role can directly read private recipient delivery rows';
  assert has_function_privilege('service_role','public.claim_due_homework_completion_recipient_deliveries(integer)','execute'),
    'Service worker cannot claim recipient deliveries';
  assert has_function_privilege('service_role','public.get_homework_completion_recipient_delivery_context(uuid,uuid,uuid)','execute'),
    'Service worker cannot read claimed recipient context';
  assert has_function_privilege('authenticated','public.list_homework_completion_recipient_delivery_alerts(integer)','execute'),
    'Authenticated Admin RPC cannot list recipient alerts';
  assert has_function_privilege('service_role','public.prepare_homework_completion_recipient_payload(uuid,uuid,uuid,jsonb)','execute'),
    'Service worker cannot freeze recipient payloads';
  assert has_function_privilege('service_role','public.authorize_homework_completion_recipient_delivery(uuid,uuid,uuid)','execute'),
    'Service worker cannot authorize recipient delivery';
  assert has_function_privilege('service_role','public.finish_homework_completion_recipient_attempt(uuid,uuid,uuid,text,text,text)','execute'),
    'Service worker cannot finalize recipient attempts';
  assert has_function_privilege('service_role','public.reconcile_homework_completion_recipient_attempt(uuid,text,text,text,text)','execute'),
    'Service worker cannot reconcile recipient evidence';
  assert has_function_privilege('service_role','public.verify_homework_completion_notification_webhook(uuid,uuid,uuid,text,text[])','execute'),
    'Service worker cannot verify delivery-scoped webhook events';
  assert not has_function_privilege('service_role','public.verify_homework_completion_notification_webhook(uuid,uuid,text,text[])','execute'),
    'Legacy webhook verifier remains executable without an explicit delivery identifier';
  assert not has_function_privilege('authenticated','public.claim_due_homework_completion_recipient_deliveries(integer)','execute'),
    'Authenticated users can claim recipient deliveries';
  assert not has_function_privilege('anon','public.list_homework_completion_recipient_delivery_alerts(integer)','execute'),
    'Anonymous users can read recipient alert details';
  assert not has_function_privilege('service_role','public.claim_due_homework_completion_notifications(integer)','execute'),
    'Legacy cycle-level worker claim remains executable';
  assert not has_function_privilege('authenticated','public.request_homework_completion_notification_recovery(uuid)','execute'),
    'Legacy cycle-level Admin recovery remains executable';
  assert not has_function_privilege('service_role','public.reconcile_homework_completion_notification_attempt_cycle_legacy(uuid,text,text,text,text)','execute'),
    'Legacy reconciler can be invoked without recipient dispatch';
  select pg_get_functiondef('private.enqueue_homework_completion_notification(uuid)'::regprocedure) into function_definition;
  assert position('between 1 and 2' in function_definition)>0,
    'Completion enqueue does not support one or two eligible recipients';
  assert position('for update' in function_definition)>0,
    'Completion enqueue no longer uses session locking';
  select pg_get_functiondef('public.finish_homework_completion_recipient_attempt(uuid,uuid,uuid,text,text,text)'::regprocedure)
    into function_definition;
  assert position('provider_outcome_after_cancellation' in function_definition)>0,
    'In-flight outcomes are not preserved after cancellation';
  assert position('private.homework_completion_notification_retry_delay' in function_definition)>0,
    'Recipient retry schedule is not used';
end;
$verify$;
rollback;
