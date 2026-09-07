-- ============================================================================
-- Phase 3a — RLS, permissions and reference data for the hotel module
--
-- ── A deliberate decision about agent access ────────────────────────────────
-- Agents get NO direct read on any table in this file, not even active hotels.
--
-- The reason is `rates`: those are contracted net prices, and the difference
-- between them and what an agent is quoted is the client's margin. A SELECT
-- policy that let agents read `rates` would expose it, and no amount of
-- careful querying in the app would put that back — RLS is what the PostgREST
-- endpoint enforces, and agents hold a real token against it.
--
-- Phase 3c gives agents availability and pricing through a function that
-- applies markup and returns sell prices only. Until that exists, the honest
-- position is that this data is back-office-only.
-- ============================================================================

-- ---------------------------------------------------------- new permissions

insert into public.permissions (key, module, name_ar, name_en, sort_order)
values
  ('hotels.view',             'hotels', 'عرض الفنادق',              'View hotels',                 10),
  ('hotels.create',           'hotels', 'إضافة فندق',               'Create a hotel',              20),
  ('hotels.update',           'hotels', 'تعديل بيانات الفندق',      'Edit hotel details',          30),
  ('hotels.publish',          'hotels', 'نشر وإيقاف الفنادق',       'Publish / withdraw hotels',   40),
  ('hotels.rooms.manage',     'hotels', 'إدارة أنواع الغرف',        'Manage room types',           50),
  ('hotels.media.manage',     'hotels', 'إدارة صور الفندق',         'Manage hotel images',         60),
  ('hotels.rates.view',       'hotels', 'عرض أسعار العقود',         'View contract rates',         70),
  ('hotels.rates.update',     'hotels', 'تعديل أسعار العقود',       'Edit contract rates',         80),
  ('hotels.inventory.manage', 'hotels', 'إدارة الإتاحة والتخصيص',   'Manage allocation & availability', 90),
  ('hotels.offers.manage',    'hotels', 'إدارة العروض',             'Manage offers',              100)
on conflict (key) do update
  set module = excluded.module, name_ar = excluded.name_ar,
      name_en = excluded.name_en, sort_order = excluded.sort_order;

-- ------------------------------------------------------------- meal plans

insert into public.meal_plans (key, name_ar, name_en, description_ar, description_en, sort_order)
values
  ('RO', 'بدون وجبات',      'Room Only',      'الإقامة فقط بدون أي وجبات.',            'Accommodation only, no meals included.',        10),
  ('BB', 'إفطار',           'Bed & Breakfast','الإقامة مع وجبة الإفطار.',              'Accommodation including breakfast.',            20),
  ('HB', 'نصف إقامة',       'Half Board',     'الإفطار ووجبة رئيسية واحدة.',           'Breakfast plus one main meal.',                 30),
  ('FB', 'إقامة كاملة',     'Full Board',     'الإفطار والغداء والعشاء.',              'Breakfast, lunch and dinner.',                  40),
  ('AI', 'شامل كليًا',      'All Inclusive',  'جميع الوجبات والمشروبات المحددة.',      'All meals and selected drinks included.',       50),
  ('UAI','شامل فاخر',       'Ultra All Inclusive', 'جميع الوجبات والمشروبات وخدمات إضافية.', 'All meals, drinks and additional services.', 60)
on conflict (key) do update
  set name_ar = excluded.name_ar, name_en = excluded.name_en,
      description_ar = excluded.description_ar, description_en = excluded.description_en;

-- -------------------------------------------------------------- amenities

insert into public.amenities (key, category, name_ar, name_en, icon, sort_order)
values
  ('wifi',           'general',  'واي فاي مجاني',      'Free WiFi',            'LuWifi',        10),
  ('parking',        'general',  'موقف سيارات',        'Parking',              'LuCircleParking', 20),
  ('air_conditioning','general', 'تكييف',              'Air conditioning',     'LuSnowflake',   30),
  ('elevator',       'general',  'مصعد',               'Lift',                 'LuChevronsUpDown', 40),
  ('front_desk_24h', 'general',  'استقبال ٢٤ ساعة',    '24-hour front desk',   'LuClock',       50),
  ('family_rooms',   'general',  'غرف عائلية',         'Family rooms',         'LuUsers',       60),

  ('pool',           'leisure',  'حمام سباحة',         'Swimming pool',        'LuWaves',       10),
  ('beach_access',   'leisure',  'شاطئ خاص',           'Private beach',        'LuUmbrella',    20),
  ('spa',            'leisure',  'سبا',                'Spa',                  'LuFlower2',     30),
  ('gym',            'leisure',  'صالة رياضية',        'Fitness centre',       'LuDumbbell',    40),
  ('kids_club',      'leisure',  'نادي أطفال',         'Kids club',            'LuBaby',        50),

  ('restaurant',     'dining',   'مطعم',               'Restaurant',           'LuUtensils',    10),
  ('bar',            'dining',   'بار',                'Bar',                  'LuWine',        20),
  ('room_service',   'dining',   'خدمة الغرف',         'Room service',         'LuConciergeBell', 30),

  ('airport_shuttle','services', 'خدمة نقل المطار',    'Airport shuttle',      'LuPlane',       10),
  ('laundry',        'services', 'غسيل ملابس',         'Laundry',              'LuShirt',       20),
  ('meeting_rooms',  'services', 'قاعات اجتماعات',     'Meeting rooms',        'LuPresentation', 30),
  ('wheelchair',     'services', 'مهيأ لذوي الاحتياجات','Wheelchair accessible','LuAccessibility', 40)
on conflict (key) do update
  set category = excluded.category, name_ar = excluded.name_ar,
      name_en = excluded.name_en, icon = excluded.icon, sort_order = excluded.sort_order;

-- ============================================================================
-- RLS policies
--
-- Reference tables (amenities, meal_plans) are readable by any signed-in user:
-- they are labels, they will be needed by the agent-facing search in 3c, and
-- they carry nothing commercial. They have no write policy at all, so they can
-- only be extended by migration.
--
-- Everything else is gated on a hotels.* permission.
-- ============================================================================

create policy amenities_select_authenticated
  on public.amenities for select to authenticated using (true);

create policy meal_plans_select_authenticated
  on public.meal_plans for select to authenticated using (true);

-- ------------------------------------------------------------------ hotels

create policy hotels_select
  on public.hotels for select to authenticated
  using (public.authorize('hotels.view'));

create policy hotels_insert
  on public.hotels for insert to authenticated
  with check (public.authorize('hotels.create'));

create policy hotels_update
  on public.hotels for update to authenticated
  using (public.authorize('hotels.update'))
  with check (public.authorize('hotels.update'));

-- No delete policy: a hotel with booking history must never disappear. It is
-- set to `inactive` instead (same reasoning as agencies in Phase 1).

-- --------------------------------------------------------- hotel_amenities

create policy hotel_amenities_select
  on public.hotel_amenities for select to authenticated
  using (public.authorize('hotels.view'));

create policy hotel_amenities_insert
  on public.hotel_amenities for insert to authenticated
  with check (public.authorize('hotels.update'));

create policy hotel_amenities_delete
  on public.hotel_amenities for delete to authenticated
  using (public.authorize('hotels.update'));

-- -------------------------------------------------------------- room_types

create policy room_types_select
  on public.room_types for select to authenticated
  using (public.authorize('hotels.view'));

create policy room_types_insert
  on public.room_types for insert to authenticated
  with check (public.authorize('hotels.rooms.manage'));

create policy room_types_update
  on public.room_types for update to authenticated
  using (public.authorize('hotels.rooms.manage'))
  with check (public.authorize('hotels.rooms.manage'));

create policy room_types_delete
  on public.room_types for delete to authenticated
  using (public.authorize('hotels.rooms.manage'));

-- ------------------------------------------------------------ hotel_images

create policy hotel_images_select
  on public.hotel_images for select to authenticated
  using (public.authorize('hotels.view'));

create policy hotel_images_insert
  on public.hotel_images for insert to authenticated
  with check (public.authorize('hotels.media.manage'));

create policy hotel_images_update
  on public.hotel_images for update to authenticated
  using (public.authorize('hotels.media.manage'))
  with check (public.authorize('hotels.media.manage'));

create policy hotel_images_delete
  on public.hotel_images for delete to authenticated
  using (public.authorize('hotels.media.manage'));

-- --------------------------------------------------- cancellation policies

create policy cancellation_policies_select
  on public.cancellation_policies for select to authenticated
  using (public.authorize('hotels.view'));

create policy cancellation_policies_write
  on public.cancellation_policies for all to authenticated
  using (public.authorize('hotels.rates.update'))
  with check (public.authorize('hotels.rates.update'));

create policy cancellation_rules_select
  on public.cancellation_rules for select to authenticated
  using (public.authorize('hotels.view'));

create policy cancellation_rules_write
  on public.cancellation_rules for all to authenticated
  using (public.authorize('hotels.rates.update'))
  with check (public.authorize('hotels.rates.update'));

-- -------------------------------------------------------------- rate plans

-- Note the separate view permission: a reservations officer may need to read
-- contracted rates without being able to change them.
create policy rate_plans_select
  on public.rate_plans for select to authenticated
  using (public.authorize('hotels.rates.view'));

create policy rate_plans_write
  on public.rate_plans for all to authenticated
  using (public.authorize('hotels.rates.update'))
  with check (public.authorize('hotels.rates.update'));

create policy rates_select
  on public.rates for select to authenticated
  using (public.authorize('hotels.rates.view'));

create policy rates_write
  on public.rates for all to authenticated
  using (public.authorize('hotels.rates.update'))
  with check (public.authorize('hotels.rates.update'));

-- ----------------------------------------------------------- child policies

create policy child_policies_select
  on public.child_policies for select to authenticated
  using (public.authorize('hotels.view'));

create policy child_policies_write
  on public.child_policies for all to authenticated
  using (public.authorize('hotels.rates.update'))
  with check (public.authorize('hotels.rates.update'));

-- ------------------------------------------------------------------ offers

create policy offers_select
  on public.offers for select to authenticated
  using (public.authorize('hotels.view'));

create policy offers_write
  on public.offers for all to authenticated
  using (public.authorize('hotels.offers.manage'))
  with check (public.authorize('hotels.offers.manage'));

create policy offer_rate_plans_select
  on public.offer_rate_plans for select to authenticated
  using (public.authorize('hotels.view'));

create policy offer_rate_plans_write
  on public.offer_rate_plans for all to authenticated
  using (public.authorize('hotels.offers.manage'))
  with check (public.authorize('hotels.offers.manage'));

create policy offer_room_types_select
  on public.offer_room_types for select to authenticated
  using (public.authorize('hotels.view'));

create policy offer_room_types_write
  on public.offer_room_types for all to authenticated
  using (public.authorize('hotels.offers.manage'))
  with check (public.authorize('hotels.offers.manage'));

-- ------------------------------------------------------------- allocations

create policy allocations_select
  on public.allocations for select to authenticated
  using (public.authorize('hotels.view'));

create policy allocations_write
  on public.allocations for all to authenticated
  using (public.authorize('hotels.inventory.manage'))
  with check (public.authorize('hotels.inventory.manage'));

-- ============================================================================
-- Audit
--
-- Rates and allocation are money and availability. A change to either alters
-- what an agent is charged or what can be sold, so both are recorded for the
-- same reason permission changes are (§7 rule 4).
-- ============================================================================

create or replace function public.audit_rate_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit('rate.created', 'rate', new.id::text,
      jsonb_build_object('plan', new.rate_plan_id, 'room', new.room_type_id,
                         'period', new.stay_period::text, 'price', new.price_per_night));
  elsif tg_op = 'DELETE' then
    perform public.write_audit('rate.deleted', 'rate', old.id::text,
      jsonb_build_object('period', old.stay_period::text, 'price', old.price_per_night));
  elsif new.price_per_night is distinct from old.price_per_night
     or new.is_closed is distinct from old.is_closed
     or new.stay_period is distinct from old.stay_period then
    perform public.write_audit('rate.updated', 'rate', new.id::text,
      jsonb_build_object('from', old.price_per_night, 'to', new.price_per_night,
                         'period', new.stay_period::text, 'closed', new.is_closed));
  end if;
  return coalesce(new, old);
end;
$$;

revoke all on function public.audit_rate_change() from public, anon, authenticated;

create trigger rates_audit
  after insert or update or delete on public.rates
  for each row execute function public.audit_rate_change();

create or replace function public.audit_hotel_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from old.status then
    perform public.write_audit('hotel.status_changed', 'hotel', new.id::text,
      jsonb_build_object('code', new.code, 'name', new.name_en,
                         'from', old.status, 'to', new.status));
  end if;
  return new;
end;
$$;

revoke all on function public.audit_hotel_status_change() from public, anon, authenticated;

create trigger hotels_audit
  after update on public.hotels
  for each row execute function public.audit_hotel_status_change();
