import {
  LuBuilding2,
  LuCirclePlus,
  LuCode,
  LuCrown,
  LuFileText,
  LuHistory,
  LuHotel,
  LuKey,
  LuLock,
  LuPen,
  LuShield,
  LuTrash2,
  LuUserCheck,
  LuWallet,
} from "react-icons/lu";
import type { IconType } from "react-icons";
import { Badge, type BadgeProps } from "@/shared/ui/badge";
import type { Locale } from "@/shared/i18n/config";

export type BadgeTone = NonNullable<BadgeProps["tone"]>;

// Human-friendly status definitions with localized labels and visual badge tones
const STATUS_MAP: Record<
  string,
  { ar: string; en: string; tone: BadgeTone }
> = {
  active: { ar: "نشط", en: "Active", tone: "success" },
  pending: { ar: "قيد المراجعة", en: "Pending", tone: "warning" },
  suspended: { ar: "موقوف", en: "Suspended", tone: "danger" },
  rejected: { ar: "مرفوض", en: "Rejected", tone: "danger" },
  draft: { ar: "مسودة", en: "Draft", tone: "neutral" },
  published: { ar: "منشور", en: "Published", tone: "success" },
};

// Human-friendly role definitions with localized labels
const ROLE_MAP: Record<string, { ar: string; en: string }> = {
  super_admin: { ar: "مسؤول نظام رئيسي", en: "Super Admin" },
  admin: { ar: "مدير نظام", en: "Administrator" },
  staff: { ar: "موظف عمليات", en: "Staff Operations" },
  agent_owner: { ar: "مدير / مالك الوكالة", en: "Agency Owner" },
  agent_staff: { ar: "موظف وكالة", en: "Agency Staff" },
  driver: { ar: "سائق معتمد", en: "Verified Driver" },
};

export interface AuditActionMeta {
  title: { ar: string; en: string };
  tone: BadgeTone;
  icon: IconType;
}

const ACTION_METAS: Record<string, AuditActionMeta> = {
  "profile.status_changed": {
    title: { ar: "تغيير حالة الحساب", en: "Account Status Changed" },
    tone: "brand",
    icon: LuUserCheck,
  },
  "profile.role_changed": {
    title: { ar: "تغيير الدور الوظيفي", en: "User Role Changed" },
    tone: "warning",
    icon: LuShield,
  },
  "agency.status_changed": {
    title: { ar: "تحديث حالة الوكالة", en: "Agency Status Changed" },
    tone: "brand",
    icon: LuBuilding2,
  },
  "agency.credit_limit_changed": {
    title: { ar: "تعديل الحد الائتماني", en: "Credit Limit Updated" },
    tone: "warning",
    icon: LuWallet,
  },
  "role.created": {
    title: { ar: "إنشاء دور وظيفي", en: "Role Created" },
    tone: "success",
    icon: LuCirclePlus,
  },
  "role.updated": {
    title: { ar: "تعديل مسمى الدور", en: "Role Updated" },
    tone: "brand",
    icon: LuPen,
  },
  "role.deleted": {
    title: { ar: "حذف دور وظيفي", en: "Role Deleted" },
    tone: "danger",
    icon: LuTrash2,
  },
  "permission.granted": {
    title: { ar: "منح صلاحية", en: "Permission Granted" },
    tone: "success",
    icon: LuKey,
  },
  "permission.revoked": {
    title: { ar: "سحب صلاحية", en: "Permission Revoked" },
    tone: "neutral",
    icon: LuLock,
  },
  "hotel.status_changed": {
    title: { ar: "تغيير حالة فندق", en: "Hotel Status Changed" },
    tone: "brand",
    icon: LuHotel,
  },
  "rate.created": {
    title: { ar: "إضافة تسعيرة غرفة", en: "Room Rate Added" },
    tone: "success",
    icon: LuWallet,
  },
  "rate.updated": {
    title: { ar: "تعديل تسعيرة غرفة", en: "Room Rate Updated" },
    tone: "brand",
    icon: LuWallet,
  },
  "content.updated": {
    title: { ar: "تحديث محتوى الموقع", en: "Content Updated" },
    tone: "brand",
    icon: LuFileText,
  },
  "content_page.updated": {
    title: { ar: "تحديث صفحة في الموقع", en: "Page Content Updated" },
    tone: "brand",
    icon: LuFileText,
  },
  bootstrap_super_admin: {
    title: { ar: "تهيئة مسؤول النظام", en: "Super Admin Initialized" },
    tone: "danger",
    icon: LuCrown,
  },
};

function formatCurrency(amount: unknown, currency = "USD") {
  const num = typeof amount === "number" ? amount : Number(amount) || 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(num);
}

/**
 * Renders the human-friendly action badge with semantic icon & tone.
 */
export function AuditActionBadge({
  action,
  locale,
}: {
  action: string;
  locale: Locale;
}) {
  const meta = ACTION_METAS[action] ?? {
    title: { ar: action, en: action },
    tone: "neutral" as BadgeTone,
    icon: LuHistory,
  };

  const Icon = meta.icon;
  const label = meta.title[locale] ?? meta.title.en;

  return (
    <Badge tone={meta.tone} className="inline-flex items-center gap-1.5 py-1 px-2.5 font-medium whitespace-nowrap">
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span>{label}</span>
    </Badge>
  );
}

/**
 * Renders the human-readable explanation of changes with clear visual badges,
 * along with a collapsible technical JSON drawer.
 */
export function AuditRowDetails({
  action,
  changes,
  locale,
}: {
  action: string;
  changes: unknown;
  locale: Locale;
}) {
  const isAr = locale === "ar";
  const payload =
    changes && typeof changes === "object"
      ? (changes as Record<string, unknown>)
      : null;

  const renderHumanSummary = () => {
    if (!payload) {
      return <span className="text-sm text-ink-muted">—</span>;
    }

    // 1. Profile status changed
    if (action === "profile.status_changed") {
      const email = String(payload.email || "");
      const fromKey = String(payload.from || "");
      const toKey = String(payload.to || "");
      const fromMeta = STATUS_MAP[fromKey];
      const toMeta = STATUS_MAP[toKey];

      return (
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink">
          {email ? (
            <span className="font-semibold text-ink" dir="ltr">
              {email}
            </span>
          ) : null}
          <span className="text-xs text-ink-muted">
            {isAr ? "تغيّرت الحالة:" : "Status:"}
          </span>
          <Badge tone={fromMeta?.tone ?? "neutral"}>
            {fromMeta?.[locale] ?? fromKey}
          </Badge>
          <span className="text-ink-subtle text-xs">➔</span>
          <Badge tone={toMeta?.tone ?? "success"}>
            {toMeta?.[locale] ?? toKey}
          </Badge>
        </div>
      );
    }

    // 2. Profile role changed
    if (action === "profile.role_changed") {
      const email = String(payload.email || "");
      const fromRole = String(payload.from || "");
      const toRole = String(payload.to || "");
      const fromLabel = ROLE_MAP[fromRole]?.[locale] ?? fromRole;
      const toLabel = ROLE_MAP[toRole]?.[locale] ?? toRole;

      return (
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink">
          {email ? (
            <span className="font-semibold text-ink" dir="ltr">
              {email}
            </span>
          ) : null}
          <span className="text-xs text-ink-muted">
            {isAr ? "تغيّر الدور من:" : "Role changed from:"}
          </span>
          <Badge tone="neutral">
            {fromLabel}
          </Badge>
          <span className="text-ink-subtle text-xs">➔</span>
          <Badge tone="warning">
            {toLabel}
          </Badge>
        </div>
      );
    }

    // 3. Agency status changed
    if (action === "agency.status_changed") {
      const name = String(payload.name || payload.code || "");
      const fromKey = String(payload.from || "");
      const toKey = String(payload.to || "");
      const fromMeta = STATUS_MAP[fromKey];
      const toMeta = STATUS_MAP[toKey];

      return (
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink">
          <span className="font-semibold text-ink">
            {name}
          </span>
          <span className="text-xs text-ink-muted">
            {isAr ? "الحالة:" : "Status:"}
          </span>
          <Badge tone={fromMeta?.tone ?? "neutral"}>
            {fromMeta?.[locale] ?? fromKey}
          </Badge>
          <span className="text-ink-subtle text-xs">➔</span>
          <Badge tone={toMeta?.tone ?? "success"}>
            {toMeta?.[locale] ?? toKey}
          </Badge>
        </div>
      );
    }

    // 4. Agency credit limit changed
    if (action === "agency.credit_limit_changed") {
      const code = String(payload.code || "");
      const fromAmount = payload.from;
      const toAmount = payload.to;

      return (
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink">
          {code ? (
            <span className="font-semibold text-ink">
              {code}
            </span>
          ) : null}
          <span className="text-xs text-ink-muted">
            {isAr ? "الحد الائتماني:" : "Credit Limit:"}
          </span>
          <span className="font-mono text-xs text-ink-muted line-through" dir="ltr">
            {formatCurrency(fromAmount)}
          </span>
          <span className="text-ink-subtle text-xs">➔</span>
          <span className="font-mono text-xs font-bold text-success-700" dir="ltr">
            {formatCurrency(toAmount)}
          </span>
        </div>
      );
    }

    // 5. Role created / updated / deleted
    if (action === "role.created" || action === "role.deleted" || action === "role.updated") {
      const roleName = String(payload.name_en || payload.key || "");
      const scope = String(payload.scope || "");
      const scopeLabel =
        scope === "admin"
          ? (isAr ? "الإدارة" : "Admin")
          : scope === "agent"
            ? (isAr ? "الوكلاء" : "Agent")
            : scope;

      if (action === "role.updated") {
        return (
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink">
            <span className="text-xs text-ink-muted">{isAr ? "تعديل المسمى:" : "Renamed:"}</span>
            <span className="line-through text-xs text-ink-muted">{String(payload.from || "")}</span>
            <span className="text-ink-subtle text-xs">➔</span>
            <span className="font-semibold text-ink">{String(payload.to || "")}</span>
          </div>
        );
      }

      return (
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink">
          <span className="font-semibold text-ink">{roleName}</span>
          {scope ? (
            <Badge tone="neutral">
              {scopeLabel}
            </Badge>
          ) : null}
        </div>
      );
    }

    // 6. Permission granted / revoked
    if (action === "permission.granted" || action === "permission.revoked") {
      const roleKey = String(payload.role || "");
      const perm = String(payload.permission || "");
      const roleLabel = ROLE_MAP[roleKey]?.[locale] ?? roleKey;

      return (
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink">
          <span className="text-xs text-ink-muted">{isAr ? "الدور:" : "Role:"}</span>
          <Badge tone="brand">
            {roleLabel}
          </Badge>
          <span className="text-xs text-ink-muted">{isAr ? "الصلاحية:" : "Permission:"}</span>
          <code className="rounded bg-surface-sunken px-2 py-0.5 text-xs font-mono border border-border text-ink" dir="ltr">
            {perm}
          </code>
        </div>
      );
    }

    // 7. Bootstrap super admin
    if (action === "bootstrap_super_admin") {
      return (
        <span className="text-sm font-medium text-ink">
          {isAr
            ? "تم تعيين وتفعيل الحساب كمسؤول نظام رئيسي (Super Admin)"
            : "Account initialized as Platform Super Administrator"}
        </span>
      );
    }

    // Generic fallback for any other payload
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm text-ink">
        {Object.entries(payload).map(([k, v]) => (
          <span key={k} className="inline-flex items-center gap-1 rounded bg-canvas px-2 py-0.5 text-xs">
            <span className="text-ink-muted">{k}:</span>
            <span className="font-medium text-ink">{String(v)}</span>
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-1.5 py-1">
      {/* High-level human readable representation */}
      <div>{renderHumanSummary()}</div>

      {/* Collapsible raw data for developers and auditors */}
      {payload ? (
        <details className="group">
          <summary className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-ink-subtle transition-colors hover:text-ink select-none">
            <LuCode className="size-3" aria-hidden />
            <span>{isAr ? "عرض البيانات الأصلية (JSON)" : "View raw data (JSON)"}</span>
          </summary>
          <div className="mt-2 overflow-hidden rounded-md border border-border bg-[#042029] p-2.5 text-start shadow-inner" dir="ltr">
            <pre className="overflow-x-auto text-[11px] leading-tight font-mono text-emerald-300">
              {JSON.stringify(payload, null, 2)}
            </pre>
          </div>
        </details>
      ) : null}
    </div>
  );
}
