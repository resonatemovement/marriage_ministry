alter table public.notification_webhook_events
  drop constraint notification_webhook_events_delivery_id_fkey,
  add constraint notification_webhook_events_delivery_id_fkey
    foreign key (delivery_id) references public.notification_deliveries(id) on delete cascade;
