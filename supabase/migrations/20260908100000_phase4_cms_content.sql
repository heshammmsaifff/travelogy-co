-- ============================================================================
-- Phase 4 — public site content: banners and static pages
--
-- The marketing pages are built in this phase, but the CMS *editor* is Phase 6
-- (CLAUDE.md §13). Putting the content in tables now rather than hardcoding it
-- means Phase 6 only has to add an admin screen — the public pages will not be
-- rebuilt. The default copy is seeded here so the pages are genuinely complete
-- and bilingual today rather than shipping empty (§2.3).
--
-- Both tables are readable by ANONYMOUS visitors, which is the one place in
-- this schema where that is correct: they are the public website.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. The missing CMS permission
--
-- `cms.content.publish` is named in §7 and is already enforced by
-- /api/media/signature for the `banners` folder — but it was never seeded into
-- the registry. Since §7 forbids granting a permission that does not exist,
-- no role could hold it, so banner uploads were reachable only by super_admin
-- (which short-circuits every check). This closes that gap before the first
-- banner exists.
-- ----------------------------------------------------------------------------

insert into public.permissions (key, module, name_ar, name_en, description_ar, description_en)
values (
  'cms.content.publish',
  'cms',
  'نشر محتوى الموقع',
  'Publish site content',
  'إضافة وتعديل بانرات الصفحة الرئيسية وصفحات المحتوى الثابتة.',
  'Add and edit homepage banners and static content pages.'
)
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- 1. Homepage banners
-- ----------------------------------------------------------------------------

create table public.banners (
  id            uuid primary key default gen_random_uuid(),

  title_ar      text not null check (length(btrim(title_ar)) between 2 and 200),
  title_en      text not null check (length(btrim(title_en)) between 2 and 200),
  subtitle_ar   text,
  subtitle_en   text,

  -- Cloudinary public_id, uploaded through the signed route (§8). The delivery
  -- transformation is applied when rendering, so only the id is stored.
  image_public_id text,

  -- Optional call to action. Both halves must be present or neither, so a
  -- button never renders with a label and no destination.
  cta_label_ar  text,
  cta_label_en  text,
  cta_href      text,

  sort_order    integer not null default 0,
  is_active     boolean not null default true,

  -- Optional scheduling window. NULL on either side means "no bound".
  starts_at     timestamptz,
  ends_at       timestamptz,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.profiles (id) on delete set null,

  constraint banners_cta_complete check (
    (cta_href is null and cta_label_ar is null and cta_label_en is null)
    or (cta_href is not null and cta_label_ar is not null and cta_label_en is not null)
  ),
  -- An end before its start would silently hide the banner forever.
  constraint banners_window_ordered check (ends_at is null or starts_at is null or ends_at > starts_at)
);

comment on table public.banners is
  'Homepage marketing banners. Rendered by the public site in Phase 4; edited from the back-office in Phase 6.';

create index banners_active_idx on public.banners (is_active, sort_order);

create trigger banners_set_updated_at
  before update on public.banners
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 2. Static content pages (about / privacy / terms)
--
-- `body_*` holds Markdown-ish plain text rendered as paragraphs. Deliberately
-- NOT raw HTML: a CMS field that accepts HTML and is rendered unescaped is an
-- XSS hole, and Phase 6 will let a non-developer type into this field.
-- ----------------------------------------------------------------------------

create table public.content_pages (
  slug          text primary key check (slug in ('about', 'privacy', 'terms')),

  title_ar      text not null,
  title_en      text not null,
  body_ar       text not null,
  body_en       text not null,

  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.profiles (id) on delete set null
);

comment on table public.content_pages is
  'Static public pages. The slug set is fixed by CHECK: these pages are linked from the footer, so an arbitrary new slug would be unreachable and a renamed one would 404.';

comment on column public.content_pages.body_ar is
  'Plain text, rendered as paragraphs. Never interpolated as HTML.';

create trigger content_pages_set_updated_at
  before update on public.content_pages
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3. RLS
-- ----------------------------------------------------------------------------

alter table public.banners        enable row level security;
alter table public.content_pages  enable row level security;

-- Public read. `to anon, authenticated` is intentional — this is the website.
-- Only currently-live banners are exposed, so a scheduled or disabled one is
-- not readable through the API before it is meant to be seen.
create policy banners_public_read
  on public.banners for select
  to anon, authenticated
  using (
    is_active
    and (starts_at is null or starts_at <= now())
    and (ends_at   is null or ends_at   >  now())
  );

-- Staff who can publish content also need to see the ones that are off.
create policy banners_manager_read
  on public.banners for select
  to authenticated
  using (public.has_permission(auth.uid(), 'cms.content.publish'));

create policy banners_write
  on public.banners for insert
  to authenticated
  with check (public.has_permission(auth.uid(), 'cms.content.publish'));

create policy banners_update
  on public.banners for update
  to authenticated
  using (public.has_permission(auth.uid(), 'cms.content.publish'))
  with check (public.has_permission(auth.uid(), 'cms.content.publish'));

create policy banners_delete
  on public.banners for delete
  to authenticated
  using (public.has_permission(auth.uid(), 'cms.content.publish'));

create policy content_pages_public_read
  on public.content_pages for select
  to anon, authenticated
  using (true);

create policy content_pages_update
  on public.content_pages for update
  to authenticated
  using (public.has_permission(auth.uid(), 'cms.content.publish'))
  with check (public.has_permission(auth.uid(), 'cms.content.publish'));

-- No INSERT or DELETE policy: the slug set is fixed by the CHECK above, so the
-- three rows seeded below are the only ones that should ever exist.

-- ----------------------------------------------------------------------------
-- 4. Audit
-- ----------------------------------------------------------------------------

create or replace function public.audit_content_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.write_audit(
    lower(tg_op),
    tg_table_name,
    coalesce(new.id::text, old.id::text),
    jsonb_build_object('table', tg_table_name)
  );
  return coalesce(new, old);
end;
$$;

create or replace function public.audit_content_page_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.write_audit('update', 'content_pages', new.slug, null);
  return new;
end;
$$;

revoke all on function public.audit_content_change()      from public, anon, authenticated;
revoke all on function public.audit_content_page_change() from public, anon, authenticated;

create trigger banners_audit
  after insert or update or delete on public.banners
  for each row execute function public.audit_content_change();

create trigger content_pages_audit
  after update on public.content_pages
  for each row execute function public.audit_content_page_change();

-- ----------------------------------------------------------------------------
-- 5. Default copy
--
-- Real content, not lorem ipsum: these pages are linked from every public
-- footer from this phase onward, and a placeholder privacy policy on a live
-- site is worse than none.
-- ----------------------------------------------------------------------------

insert into public.content_pages (slug, title_ar, title_en, body_ar, body_en) values
(
  'about',
  'من نحن',
  'About us',
  'لاست لاين ترافل منصة حجوزات سياحية موجهة لوكلاء السفر والشركات، تتيح لهم البحث في المخزون الفندقي المتعاقد عليه والحجز لعملائهم وإدارة عروض الأسعار والحساب الائتماني من مكان واحد.

نعمل مع الفنادق مباشرة ومع موردين خارجيين، ونقدم للوكيل واجهة واحدة بغض النظر عن مصدر الغرفة. كل وكيل يحصل على حساب مستقل بحد ائتماني وكشف حساب وصلاحيات يديرها بنفسه لفريقه.

المنصة ثنائية اللغة بالكامل — عربي وإنجليزي — وتدعم الاتجاهين من اليوم الأول.',
  'Last Line Travel is a B2B booking platform for travel agents and corporate partners. It lets them search contracted hotel inventory, book on behalf of their own customers, and manage quotations and their credit account in one place.

We work directly with hotels and with external suppliers, and present the agent a single interface regardless of where a room comes from. Every agent gets their own account with a credit limit, a statement of account, and permissions they manage for their own team.

The platform is fully bilingual — Arabic and English — with both text directions supported from day one.'
),
(
  'privacy',
  'سياسة الخصوصية',
  'Privacy policy',
  'نجمع البيانات اللازمة لتشغيل الخدمة فقط: بيانات شركتك ووسائل التواصل معها، بيانات مستخدمي حسابك، وتفاصيل الحجوزات التي تجريها نيابة عن عملائك.

بيانات المسافرين التي تدخلها تُستخدم لتنفيذ الحجز ولإصدار قسائم الإقامة والفواتير، وتُشارك مع الفندق أو المورد المعني بالحجز فقط. لا نبيع بياناتك ولا بيانات عملائك لأي طرف ثالث.

كلمات المرور لا تُخزَّن لدينا بصورة قابلة للقراءة. الوصول إلى بيانات شركتك محكوم بصلاحيات على مستوى قاعدة البيانات، فلا يستطيع وكيل آخر رؤية حجوزاتك أو أسعارك.

لطلب نسخة من بياناتك أو حذف حسابك، تواصل معنا عبر بيانات الاتصال الموضحة في الموقع.',
  'We collect only the data needed to run the service: your company details and contact information, the users on your account, and the bookings you make on behalf of your customers.

Traveller details you enter are used to fulfil the booking and to issue vouchers and invoices, and are shared only with the hotel or supplier concerned. We do not sell your data or your customers'' data to any third party.

Passwords are never stored in a readable form. Access to your company''s data is enforced at the database level, so another agent cannot see your bookings or your prices.

To request a copy of your data or to close your account, contact us using the details shown on this site.'
),
(
  'terms',
  'الشروط والأحكام',
  'Terms and conditions',
  'استخدام المنصة متاح للوكلاء المسجلين الذين تمت الموافقة على حساباتهم. الحساب شخصي للشركة المسجلة، والوكيل مسؤول عن كل ما يتم من خلال مستخدمي حسابه.

الأسعار المعروضة هي أسعار بيع للوكيل وتشمل هامش الربح المتفق عليه. الأسعار وتوافر الغرف قابلان للتغير حتى لحظة تأكيد الحجز، والتأكيد النهائي هو ما يصدر عن المنصة بعد إتمام الحجز.

الحجز والإلغاء يخضعان لسياسة الإلغاء المرفقة بكل سعر. تسري رسوم الإلغاء المتأخر كما هي موضحة وقت الحجز.

التعامل المالي يتم عبر حساب ائتماني تديره إدارة المنصة، ويُسجَّل كل دفع في كشف حساب الوكيل. لا تتم أي مدفوعات إلكترونية عبر المنصة.

يحق لإدارة المنصة إيقاف أي حساب يخالف هذه الشروط، مع الاحتفاظ بسجل الحجوزات القائمة.',
  'The platform is available to registered agents whose accounts have been approved. An account belongs to the registered company, and the agent is responsible for everything done through the users on their account.

Prices shown are sell prices to the agent and include the agreed margin. Prices and availability may change until a booking is confirmed; the confirmation issued by the platform after booking is the binding one.

Bookings and cancellations are governed by the cancellation policy attached to each rate. Late-cancellation charges apply as stated at the time of booking.

Settlement is through a credit account managed by the platform administration, and every payment is recorded on the agent''s statement of account. No online payments are processed through the platform.

The administration may suspend an account that breaches these terms, while preserving the record of existing bookings.'
);
