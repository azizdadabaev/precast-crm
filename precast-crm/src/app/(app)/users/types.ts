// Shape returned by GET /api/users — kept here so the page,
// dialogs, and table can share the type without circular imports.
export interface ManagedUser {
  id: string;
  loginName: string | null;
  email: string | null;
  name: string;
  role: string;
  permissions: string[];
  isActive: boolean;
  mustChangePassword: boolean;
  lastLogin: string | null;
  createdAt: string;
  createdById: string | null;
}
