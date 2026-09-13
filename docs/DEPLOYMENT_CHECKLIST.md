# Travelogy B2B Hub — Production Deployment & Launch Checklist
## قائمة التحقق والجاهزية لإطلاق المنصة في بيئة الإنتاج

---

## 1. إعدادات بيئة الإنتاج لقاعدة البيانات (Supabase Production Setup)
- [x] تطبيق كافة ملفات الترحيل البرمجية عبر `npx supabase db push`.
- [x] التأكد من تفعيل سياسات الأمان على مستوى الصف (RLS) لجميع الجداول (25+ جدولاً).
- [x] التأكد من حظر قراءة الأسعار الصافية (`rates`, `booking_costs`) عن أدوار الوكلاء والمستخدمين غير المصرح لهم.
- [ ] **إعداد SMTP مخصص في لوحة تحكم Supabase**:
  - الانتقال إلى: `Project Settings` -> `Authentication` -> `SMTP Settings`.
  - تفعيل `Enable Custom SMTP`.
  - إدخال بيانات مزود البريد (مثل: SendGrid, Resend, Amazon SES, أو Google Workspace SMTP).
  - هذا الإجراء إلزامي لضمان إرسال رسائل استعادة كلمة المرور وتأكيد الحساب بدون التقيد بحدود Supabase الافتراضية (3 رسائل/ساعة).

---

## 2. متغيرات البيئة (Environment Variables Reference)
يجب التأكد من وجود المتغيرات التالية في لوحة تحكم الاستضافة (Vercel / Cloudflare / Node Server):

```env
# 1. Supabase Connection
NEXT_PUBLIC_SUPABASE_URL=https://[project-id].supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_[key]
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...

# 2. Site URL & Localization
NEXT_PUBLIC_SITE_URL=https://travelogy.co
NODE_ENV=production

# 3. Cloudinary Media Storage (Hotels & Banners)
CLOUDINARY_CLOUD_NAME=[cloud_name]
CLOUDINARY_API_KEY=[api_key]
CLOUDINARY_API_SECRET=[api_secret]

```

> **مفاتيح الموردين الخارجيين ليست متغيرات بيئة.** يدخلها الـ super_admin من لوحة التحكم
> (الإعدادات ← الموردون) وتُخزَّن مشفّرة في Supabase Vault (CLAUDE.md §9). لا تضف
> `HOTELBEDS_*` أو ما يشابهها إلى الاستضافة.
>
> **البريد الإلكتروني:** رسائل التسجيل واستعادة كلمة المرور تمر عبر SMTP المخصص في Supabase (البند 1).
> إرسال القسائم بالبريد لم يُبنَ بعد (مرحلة 11).

---

## 3. نشر تطبيق الواجهة الأمامية (Vercel / Hosting Deployment)
1. **ربط المستودع بـ Vercel**:
   - إعداد إطار العمل تلقائياً: Next.js.
   - التحقق من تفعيل خيار `Node.js 20.x` أو أحدث.
2. **إضافة النطاق المخصص (Custom Domain)**:
   - إضافة `travelogy.co` و `www.travelogy.co`.
   - ضبط سجلات DNS (A Record و CNAME) وتأكيد إصدار شهادة SSL المجانية تلقائياً.
3. **التحقق من ترويسات الأمان**:
   - يقوم ملف `next.config.ts` بحقن ترويسات `HSTS`, `X-Frame-Options`, `X-Content-Type-Options`, و `CSP` تلقائياً.

---

## 4. الفحوصات الختامية بعد الإطلاق (Post-Launch Smoke Tests)
- [ ] **فحص سلامة النظام**: زيارة `https://travelogy.co/api/health` والتأكد من إرجاع `{"status": "healthy"}`.
- [ ] **فحص ملفات السيو**: زيارة `https://travelogy.co/robots.txt` و `https://travelogy.co/sitemap.xml`.
- [ ] **فحص صفحة 404 المخصصة**: زيارة مسار غير موجود والتأكد من ظهور الصفحة المصممة ثنائية اللغة.
- [ ] **تسجيل وكالة تجريبية جديدة**: إجراء دورة كاملة (تسجيل -> موافقة الإدارة -> تحديد الائتمان -> تسجيل دخول الوكيل).
- [ ] **إجراء بحث وحجز فندقي تجريبي**: التأكد من خصم الرصيد في كشف الحساب وإصدار قسيمة السفر والفاتورة بدقة.
- [ ] **اختبار B2B REST API**: إجراء طلب curl لمواصفة OpenAPI والبحث باستخدام مفتاح API تم توليده من بوابة المطورين.
