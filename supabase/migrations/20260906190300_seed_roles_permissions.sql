-- ============================================================================
-- Phase 1 — seed: system roles and the permission registry
--
-- Idempotent: every statement is an upsert, so re-running this migration on a
-- fresh environment produces the same result without duplicate-key errors.
--
-- The registry is intentionally seeded with the permissions Phases 1-2 need,
-- plus the module keys later phases will extend. Adding a permission later is
-- a new migration, never a runtime insert (CLAUDE.md §7).
-- ============================================================================

-- ------------------------------------------------------------- system roles

insert into public.roles (key, scope, name_ar, name_en, description_ar, description_en, is_system)
values
  ('super_admin', 'admin',
   'مدير عام', 'Super Admin',
   'صلاحية كاملة على النظام، بما في ذلك إدارة الأدوار والصلاحيات.',
   'Full control of the system, including role and permission management.',
   true),

  ('staff', 'admin',
   'موظف', 'Staff',
   'موظف في الإدارة الخلفية بصلاحيات يحددها المدير العام.',
   'A back-office user whose permissions are assigned by the super admin.',
   true),

  ('agent_owner', 'agent',
   'مسؤول الوكالة', 'Agency Owner',
   'المستخدم الرئيسي لشركة وكيل السفر؛ يدير ملف الشركة ومستخدميها.',
   'The primary user of an agent company; manages the company profile and its sub-users.',
   true),

  ('agent_user', 'agent',
   'مستخدم وكالة', 'Agency User',
   'مستخدم فرعي داخل شركة وكيل السفر بصلاحيات يحددها مسؤول الوكالة.',
   'A sub-user inside an agent company, scoped by the agency owner.',
   true)
on conflict (key) do update
  set name_ar        = excluded.name_ar,
      name_en        = excluded.name_en,
      description_ar = excluded.description_ar,
      description_en = excluded.description_en;

-- ------------------------------------------------------ permission registry

insert into public.permissions (key, module, name_ar, name_en, sort_order)
values
  -- agencies -----------------------------------------------------------------
  ('agencies.view',               'agencies', 'عرض الوكالات',            'View agencies',                10),
  ('agencies.create',             'agencies', 'إضافة وكالة',             'Create an agency',             20),
  ('agencies.update',             'agencies', 'تعديل بيانات الوكالة',    'Edit agency details',          30),
  ('agencies.approve',            'agencies', 'الموافقة على طلبات التسجيل', 'Approve registration requests', 40),
  ('agencies.suspend',            'agencies', 'تعليق وتفعيل الوكالات',   'Suspend / reactivate agencies', 50),
  ('agencies.credit_limit.update','agencies', 'تعديل الحد الائتماني',    'Change the credit limit',      60),

  -- agency-side user management ---------------------------------------------
  ('agency_users.manage',         'agency_users', 'إدارة مستخدمي الوكالة', 'Manage agency sub-users',    10),

  -- back-office staff --------------------------------------------------------
  ('staff.view',                  'staff', 'عرض الموظفين',   'View staff',            10),
  ('staff.create',                'staff', 'إضافة موظف',     'Create a staff account', 20),
  ('staff.update',                'staff', 'تعديل موظف',     'Edit a staff account',   30),

  -- settings -----------------------------------------------------------------
  ('settings.roles.manage',       'settings', 'إدارة الأدوار والصلاحيات', 'Manage roles and permissions', 10),
  ('settings.suppliers.manage',   'settings', 'إدارة مفاتيح الموردين',    'Manage supplier credentials',  20),

  -- audit --------------------------------------------------------------------
  ('audit.view',                  'audit', 'عرض سجل التدقيق', 'View the audit log', 10)
on conflict (key) do update
  set module     = excluded.module,
      name_ar    = excluded.name_ar,
      name_en    = excluded.name_en,
      sort_order = excluded.sort_order;

-- ------------------------------------------------- default grants for `staff`

-- A deliberately read-only starting point. The super_admin widens it from the
-- back-office in Phase 2. Erring towards too little is recoverable in a click;
-- erring towards too much is a security incident.
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
cross join (values ('agencies.view'), ('staff.view')) as p(key)
where r.key = 'staff'
on conflict do nothing;

-- Lets an agency owner manage their own company's sub-users.
insert into public.role_permissions (role_id, permission_key)
select r.id, 'agency_users.manage'
from public.roles r
where r.key = 'agent_owner'
on conflict do nothing;

-- Note: super_admin gets no rows here on purpose. has_permission()
-- short-circuits for it, and a trigger blocks writing grants for it, so an
-- empty grant list must never be read as "has no access" (CLAUDE.md §7).
