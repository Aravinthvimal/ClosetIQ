-- Apply once to an existing ClosetIQ Supabase database.
alter table items drop constraint if exists items_category_check;
alter table items add constraint items_category_check
  check (category in ('shirt','tshirt','dress','pants','shoes','watch','accessory'));
