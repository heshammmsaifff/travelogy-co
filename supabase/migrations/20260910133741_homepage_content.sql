-- ============================================================================
-- Homepage content management
--
-- Singleton row holding the editable content for the public homepage:
-- hero section, features list, how-it-works steps, and bottom CTA.
-- Seeded with initial bilingual copy.
-- ============================================================================

create table if not exists public.homepage_content (
  id                    boolean primary key default true,

  -- Hero Section
  hero_eyebrow_ar       text not null default 'منصة سفر للشركات',
  hero_eyebrow_en       text not null default 'B2B travel platform',
  hero_title_ar         text not null default 'مخزون فندقي تقدر وكالتك تبيعه فعلًا',
  hero_title_en         text not null default 'Hotel inventory your agency can actually sell',
  hero_subtitle_ar      text not null default 'ابحث في الأسعار المتعاقد عليها، احجز عرض السعر لعميلك، واحجز على حسابك الائتماني — كل ده من مكان واحد، بالعربي أو بالإنجليزي.',
  hero_subtitle_en      text not null default 'Search contracted rates, hold them in a quotation for your customer, and book against your own credit account — in one place, in Arabic or English.',

  -- Features Section
  features_title_ar     text not null default 'مبنية على طريقة عمل الوكالات',
  features_title_en     text not null default 'Built for the way agencies work',
  features_subtitle_ar  text not null default 'ليست موقع حجز للأفراد مضاف إليه تسجيل دخول.',
  features_subtitle_en  text not null default 'Not a consumer booking site with a login bolted on.',
  features              jsonb not null default '[
    {
      "key": "inventory",
      "title_ar": "بحث واحد لكل الموردين",
      "title_en": "One search, every supplier",
      "body_ar": "فنادقنا المتعاقد عليها والموردون الخارجيون يجيبون على نفس البحث ويرجعون نفس الشكل. لن تحتاج أبدًا أن تسأل من أين جاءت الغرفة.",
      "body_en": "Our own contracted hotels and external suppliers answer the same search and return the same shape. You never have to ask where a room came from."
    },
    {
      "key": "credit",
      "title_ar": "حساب ائتماني خاص بك",
      "title_en": "Your own credit account",
      "body_ar": "احجز في حدود ائتمان نتفق عليه معك وسدّد على كشف حساب. لا بطاقات، ولا مدفوعات إلكترونية، ولا مفاجآت.",
      "body_en": "Book against a credit limit we agree with you and settle on a statement of account. No cards, no online payments, no surprises."
    },
    {
      "key": "quotations",
      "title_ar": "عروض أسعار ثابتة",
      "title_en": "Quotations that hold still",
      "body_ar": "احفظ العروض التي تريد تقديمها. السعر الذي عرضته هو السعر الذي تراه عند فتحه مرة أخرى، ومعه وقت تسجيله.",
      "body_en": "Save the offers you want to propose. The price you quoted is the price you see when you reopen it, with the time it was captured shown alongside."
    },
    {
      "key": "team",
      "title_ar": "فريقك وقواعدك",
      "title_en": "Your team, your rules",
      "body_ar": "أضف مستخدمين تابعين لك وحدد ما يستطيع كل منهم عمله. حجوزاتك وأسعارك لا تظهر لأي وكالة أخرى أبدًا.",
      "body_en": "Add your own sub-users and decide what each of them may do. Your bookings and your prices are never visible to another agency."
    }
  ]'::jsonb,

  -- How It Works Section
  how_title_ar          text not null default 'كيف تعمل',
  how_title_en          text not null default 'How it works',
  how_steps             jsonb not null default '[
    {
      "step": "step1",
      "title_ar": "قدّم طلبك",
      "title_en": "Apply",
      "body_ar": "أرسل بيانات شركتك. نراجع كل طلب يدويًا.",
      "body_en": "Send your company details. We review every application by hand."
    },
    {
      "step": "step2",
      "title_ar": "احصل على الموافقة",
      "title_en": "Get approved",
      "body_ar": "نحدد حدك الائتماني ونفعّل حسابك.",
      "body_en": "We set your credit limit and activate your account."
    },
    {
      "step": "step3",
      "title_ar": "ابحث واعرض",
      "title_en": "Search and quote",
      "body_ar": "اعثر على الإتاحة، احفظ عرض سعر، وشارك السعر مع عميلك.",
      "body_en": "Find availability, save a quotation, share the price with your customer."
    },
    {
      "step": "step4",
      "title_ar": "احجز وسدّد",
      "title_en": "Book and settle",
      "body_ar": "أكّد الحجز على حسابك الائتماني وسدّد على كشف حسابك.",
      "body_en": "Confirm the booking against your credit and settle on your statement."
    }
  ]'::jsonb,

  -- Bottom CTA Section
  cta_title_ar          text not null default 'مستعد تبدأ البيع؟',
  cta_title_en          text not null default 'Ready to start selling?',
  cta_body_ar           text not null default 'التسجيل يستغرق دقائق. الموافقة يدوية، فأنت تتعامل مع أشخاص لا مع نموذج.',
  cta_body_en           text not null default 'Registration takes a few minutes. Approval is manual, so you deal with people rather than a form.',
  cta_button_ar         text not null default 'انضم كشريك',
  cta_button_en         text not null default 'Become a partner',

  updated_at            timestamptz not null default now(),
  updated_by            uuid references public.profiles (id) on delete set null,

  constraint homepage_content_singleton check (id)
);

comment on table public.homepage_content is
  'Singleton row holding editable homepage content in Arabic and English.';

create or replace trigger homepage_content_set_updated_at
  before update on public.homepage_content
  for each row execute function public.set_updated_at();

insert into public.homepage_content (id) values (true) on conflict (id) do nothing;

alter table public.homepage_content enable row level security;

drop policy if exists homepage_content_public_read on public.homepage_content;
create policy homepage_content_public_read
  on public.homepage_content for select
  to anon, authenticated
  using (true);

drop policy if exists homepage_content_manager_write on public.homepage_content;
create policy homepage_content_manager_write
  on public.homepage_content for all
  to authenticated
  using (public.authorize('cms.content.publish'))
  with check (public.authorize('cms.content.publish'));
