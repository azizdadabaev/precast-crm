// Central permission system.
//
// Source of truth: User.permissions (a string[] from PostgreSQL text[]).
// Roles are TEMPLATES used to pre-fill the permissions checklist when
// adding a user. After creation, role is metadata only — modifying a
// role template does NOT update existing users.
//
// To add a new permission:
//   1. Append it to ACTIONS below.
//   2. Add it to PERMISSION_GROUPS in the right group.
//   3. Add a bilingual entry in ACTION_LABELS.
//   4. Add it to the appropriate ROLE_TEMPLATES (or leave out for opt-in).
//   5. Wrap the relevant API route / page check with that permission.

export const ACTIONS = [
  // User management
  "user.view",
  "user.create",
  "user.edit",
  "user.editPermissions",
  "user.disable",

  // Calculator and orders
  "calculator.use",
  "order.view",
  "order.viewAll", // see ALL orders, not just own
  "order.create",
  "order.edit",
  "order.cancel",
  "order.exportBackup", // owner-only · download Excel snapshot of all orders
  "project.delete", // owner-only · bulk-delete draft projects
  "audit.view", // owner-only · view system-wide audit log
  "pricing.edit", // owner-only · edit m² + extra-beam tier prices
  "comment.moderate", // ADMIN/OWNER · delete any user's comment on orders/drafts

  // Clients
  "client.view",
  "client.viewAll",
  "client.create",
  "client.edit",
  "client.export", // export contacts list

  // Payments
  "payment.view",
  "payment.record",
  "payment.confirm", // approve driver-collected payments

  // Dispatches & drivers
  "dispatch.view",
  "dispatch.create",
  "driver.view",
  "driver.manage",

  // Discrepancies
  "discrepancy.view",
  "discrepancy.resolve",

  // Inventory
  "inventory.view",
  "inventory.manage",

  // Dashboard
  "dashboard.view", // financial KPIs
  "dashboard.viewBasic", // operational KPIs only

  // Sandbox / experimental
  "sandbox.access",
  // Sends rooms to the owner's Blender PC via the ws-bridge service.
  // Generates a PDF drawing attached to the order/project.
  "blender.bridge",

  // Reports
  "report.view",
  "report.export",

  // Telegram inbox (owner-only)
  "inbox.access", // owner-only · read & reply to Telegram conversations
] as const;

export type Action = (typeof ACTIONS)[number];

export const PERMISSION_GROUPS: Array<{
  key: string;
  label: string;
  actions: Action[];
}> = [
  {
    key: "users",
    label: "Фойдаланувчилар · Users",
    actions: [
      "user.view",
      "user.create",
      "user.edit",
      "user.editPermissions",
      "user.disable",
    ],
  },
  {
    key: "calculator",
    label: "Калькулятор · Calculator & Orders",
    actions: [
      "calculator.use",
      "order.view",
      "order.viewAll",
      "order.create",
      "order.edit",
      "order.cancel",
      "order.exportBackup",
      "project.delete",
      "audit.view",
      "pricing.edit",
      "comment.moderate",
    ],
  },
  {
    key: "clients",
    label: "Мижозлар · Clients",
    actions: [
      "client.view",
      "client.viewAll",
      "client.create",
      "client.edit",
      "client.export",
    ],
  },
  {
    key: "payments",
    label: "Тўловлар · Payments",
    actions: ["payment.view", "payment.record", "payment.confirm"],
  },
  {
    key: "dispatch",
    label: "Етказиб бериш · Dispatch & Drivers",
    actions: [
      "dispatch.view",
      "dispatch.create",
      "driver.view",
      "driver.manage",
    ],
  },
  {
    key: "discrepancies",
    label: "Тафовутлар · Discrepancies",
    actions: ["discrepancy.view", "discrepancy.resolve"],
  },
  {
    key: "inventory",
    label: "Омбор · Inventory",
    actions: ["inventory.view", "inventory.manage"],
  },
  {
    key: "dashboard",
    label: "Бошқарув · Dashboard & Reports",
    actions: [
      "dashboard.view",
      "dashboard.viewBasic",
      "report.view",
      "report.export",
    ],
  },
  {
    key: "sandbox",
    label: "Тажриба · Sandbox",
    actions: ["sandbox.access", "blender.bridge"],
  },
  {
    key: "inbox",
    label: "Хабарлар · Inbox",
    actions: ["inbox.access"],
  },
];

export const ACTION_LABELS: Record<Action, string> = {
  "user.view": "Фойдаланувчиларни кўриш · View users",
  "user.create": "Янги фойдаланувчи қўшиш · Create users",
  "user.edit": "Фойдаланувчиларни таҳрирлаш · Edit users",
  "user.editPermissions": "Рухсатларни ўзгартириш · Edit user permissions",
  "user.disable": "Фойдаланувчини ўчириш · Disable users",
  "calculator.use": "Калькулятордан фойдаланиш · Use calculator",
  "order.view": "Буюртмаларни кўриш · View orders",
  "order.viewAll": "Барча буюртмаларни кўриш · View ALL orders (not just own)",
  "order.create": "Янги буюртма яратиш · Create orders",
  "order.edit": "Буюртмаларни таҳрирлаш · Edit orders",
  "order.cancel": "Буюртмани бекор қилиш · Cancel orders",
  "order.exportBackup": "Буюртмалар захираси (Excel) · Export orders backup (Excel)",
  "project.delete": "Сақланган лойиҳаларни ўчириш · Delete saved projects",
  "audit.view": "Журнал · View audit log",
  "pricing.edit": "Нархларни таҳрирлаш · Edit pricing tiers",
  "comment.moderate": "Бошқалар изоҳини ўчириш · Moderate others' comments",
  "client.view": "Мижозларни кўриш · View clients",
  "client.viewAll": "Барча мижозларни кўриш · View all clients",
  "client.create": "Янги мижоз қўшиш · Add clients",
  "client.edit": "Мижозларни таҳрирлаш · Edit clients",
  "client.export": "Мижозлар рўйхатини экспорт · Export client list",
  "payment.view": "Тўловларни кўриш · View payments",
  "payment.record": "Тўловни киритиш · Record payments",
  "payment.confirm": "Тўловни тасдиқлаш · Confirm payments",
  "dispatch.view": "Етказиб беришларни кўриш · View dispatches",
  "dispatch.create": "Етказиб бериш режалаштириш · Schedule dispatches",
  "driver.view": "Ҳайдовчиларни кўриш · View drivers",
  "driver.manage": "Ҳайдовчиларни бошқариш · Manage drivers",
  "discrepancy.view": "Тафовутларни кўриш · View discrepancies",
  "discrepancy.resolve": "Тафовутларни ҳал қилиш · Resolve discrepancies",
  "inventory.view": "Омборни кўриш · View inventory",
  "inventory.manage": "Омборни бошқариш · Manage inventory",
  "dashboard.view": "Молиявий бошқарув · Financial dashboard",
  "dashboard.viewBasic": "Оддий бошқарув · Basic dashboard",
  "sandbox.access": "Тажриба зонаси · Sandbox access",
  "blender.bridge": "Blender чизмаси · Generate Blender drawing",
  "report.view": "Ҳисоботларни кўриш · View reports",
  "report.export": "Ҳисоботларни экспорт · Export reports",
  "inbox.access": "Telegram хабарлари · Telegram inbox (owner-only)",
};

// Role templates. When adding a user with role X, these permissions
// pre-fill the checklist. After creation, modifying these does NOT
// update existing users — each user's permissions array is independent.
export const ROLE_TEMPLATES: Record<string, Action[]> = {
  OWNER: [
    "user.view",
    "user.create",
    "user.edit",
    "user.editPermissions",
    "user.disable",
    "calculator.use",
    "order.view",
    "order.viewAll",
    "order.create",
    "order.edit",
    "order.cancel",
    "order.exportBackup",
    "project.delete",
    "audit.view",
    "pricing.edit",
    "comment.moderate",
    "client.view",
    "client.viewAll",
    "client.create",
    "client.edit",
    "client.export",
    "payment.view",
    "payment.record",
    "payment.confirm",
    "dispatch.view",
    "dispatch.create",
    "driver.view",
    "driver.manage",
    "discrepancy.view",
    "discrepancy.resolve",
    "inventory.view",
    "inventory.manage",
    "dashboard.view",
    "dashboard.viewBasic",
    "sandbox.access",
    "blender.bridge",
    "inbox.access",
    "report.view",
    "report.export",
  ],

  ADMIN: [
    "user.view",
    "user.create",
    "user.edit",
    // NOT user.disable, NOT user.editPermissions — owner only
    "calculator.use",
    "order.view",
    "order.viewAll",
    "order.create",
    "order.edit",
    "order.cancel",
    "comment.moderate",
    "client.view",
    "client.viewAll",
    "client.create",
    "client.edit",
    "client.export",
    "payment.view",
    "payment.record",
    "payment.confirm",
    "dispatch.view",
    "dispatch.create",
    "driver.view",
    "driver.manage",
    "discrepancy.view",
    "discrepancy.resolve",
    "inventory.view",
    "inventory.manage",
    "dashboard.view",
    "dashboard.viewBasic",
    "sandbox.access",
    "blender.bridge",
    "report.view",
    "report.export",
  ],

  SALES: [
    "calculator.use",
    "order.view",
    "order.create",
    "order.edit",
    // NOT order.cancel, NOT order.viewAll
    "client.view",
    "client.viewAll",
    "client.create",
    "client.edit",
    // NOT client.export
    "payment.view",
    "payment.record",
    // NOT payment.confirm
    "dashboard.viewBasic",
    // NOT dashboard.view (financial)
    "blender.bridge",
  ],

  INVENTORY: [
    "order.view",
    "client.view",
    "inventory.view",
    "inventory.manage",
    "dispatch.view",
    "dashboard.viewBasic",
  ],

  // Drivers see the orders queue so they know what's outstanding on
  // their route. They can't create or edit — order.view is read-only.
  DRIVER: ["order.view", "dispatch.view", "payment.record"],

  ACCOUNTANT: [
    "order.view",
    "order.viewAll",
    "client.view",
    "client.viewAll",
    "payment.view",
    "discrepancy.view",
    "dashboard.view",
    "blender.bridge",
    "report.view",
    "report.export",
  ],

  CUSTOM: [],
};

// Subject of permission checks. Anything that satisfies this shape
// can be passed into can() / canAll() / canAny() / homeForUser() —
// JWT payloads, DB rows, and partial mocks all work.
export interface PermissionSubject {
  permissions: string[];
  isActive: boolean;
}

export function getDefaultPermissionsForRole(role: string): Action[] {
  return [...(ROLE_TEMPLATES[role] ?? [])];
}

export function can(
  user: PermissionSubject | null | undefined,
  action: Action,
): boolean {
  if (!user || !user.isActive) return false;
  return user.permissions.includes(action);
}

export function canAll(
  user: PermissionSubject | null | undefined,
  actions: Action[],
): boolean {
  return actions.every((action) => can(user, action));
}

export function canAny(
  user: PermissionSubject | null | undefined,
  actions: Action[],
): boolean {
  return actions.some((action) => can(user, action));
}

// Decide where to redirect a user after login or after a failed
// permission check. /orders is the default landing for everyone who
// can see it — operators across all roles spend the day on this page,
// so dropping people there on login matches the actual workflow. We
// fall through to dashboard / calculator / inventory / dispatch only
// when the user doesn't have order.view (e.g. a CUSTOM-role user
// whose operator un-ticked it). /profile is the universal fallback.
export function homeForUser(user: PermissionSubject): string {
  if (can(user, "order.view")) return "/orders";
  if (can(user, "dashboard.view") || can(user, "dashboard.viewBasic")) {
    return "/dashboard";
  }
  if (can(user, "calculator.use")) return "/calculations";
  if (can(user, "inventory.view")) return "/inventory";
  if (can(user, "dispatch.view")) return "/dispatches";
  return "/profile";
}

export function roleDisplayLabel(role: string): string {
  switch (role) {
    case "OWNER":
      return "Эгаси · Owner";
    case "ADMIN":
      return "Администратор · Admin";
    case "SALES":
      return "Сотув · Sales";
    case "INVENTORY":
      return "Омбор · Inventory";
    case "DRIVER":
      return "Ҳайдовчи · Driver";
    case "ACCOUNTANT":
      return "Бухгалтер · Accountant";
    case "CUSTOM":
      return "Махсус · Custom";
    default:
      return role;
  }
}

// True if the user's permissions differ from their role's template.
// Used to show a "Custom" badge in the user list so operators can see
// at a glance which users have non-standard access.
export function isUserCustomized(user: {
  role: string;
  permissions: string[];
}): boolean {
  const template = ROLE_TEMPLATES[user.role] ?? [];
  if (template.length !== user.permissions.length) return true;
  const set = new Set(user.permissions);
  return !template.every((p) => set.has(p));
}
