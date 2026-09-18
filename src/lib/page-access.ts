export const PAGE_DEFINITIONS = [
  { key: 'dashboard', label: 'Dashboard', path: '/' },
  { key: 'inspections', label: 'Inspeksi', path: '/inspeksi' },
  { key: 'damages', label: 'Kerusakan', path: '/kerusakan' },
  { key: 'markings', label: 'Marka', path: '/marka' },
  { key: 'pci', label: 'PCI', path: '/pci' },
  { key: 'admin', label: 'Admin Panel', path: '/admin' },
  { key: 'users', label: 'Pengelolaan Akun', path: '/admin/users' },
  { key: 'airports', label: 'Pengelolaan Bandara', path: '/admin/airports' },
  { key: 'dvFlexible', label: 'Kurva DV Fleksibel', path: '/admin/kurva-dv-fleksibel' },
  { key: 'dvRigid', label: 'Kurva DV Rigit', path: '/admin/kurva-dv-rigit' },
  { key: 'cdvFlexible', label: 'Kurva CDV Fleksibel', path: '/admin/kurva-cdv-fleksibel' },
  { key: 'cdvRigid', label: 'Kurva CDV Rigit', path: '/admin/kurva-cdv-rigit' },
] as const;

export type PageKey = (typeof PAGE_DEFINITIONS)[number]['key'];
export type UserRole = 'SUPADMIN' | 'ADMIN' | 'USER' | 'VIEWER';
export const PAGE_KEYS = PAGE_DEFINITIONS.map((page) => page.key);
export const ROLES: UserRole[] = ['SUPADMIN', 'ADMIN', 'USER', 'VIEWER'];
export type RolePageAccess = Record<UserRole, Record<PageKey, boolean>>;

const WORK_PAGES: PageKey[] = ['dashboard', 'inspections', 'damages', 'markings', 'pci'];
const ADMIN_PAGES: PageKey[] = ['admin', 'users', 'dvFlexible', 'dvRigid', 'cdvFlexible', 'cdvRigid'];

export function canRoleUsePage(role: UserRole, page: PageKey): boolean {
  if (role === 'SUPADMIN') return true;
  if (role === 'ADMIN') return WORK_PAGES.includes(page) || ADMIN_PAGES.includes(page);
  if (role === 'USER') return WORK_PAGES.includes(page);
  return page === 'dashboard';
}

export function normalizeRolePageAccess(value?: unknown): RolePageAccess {
  const input = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
  const access = {} as RolePageAccess;
  for (const role of ROLES) {
    const roleInput = input[role] && typeof input[role] === 'object' && !Array.isArray(input[role])
      ? input[role] as Record<string, unknown> : {};
    const row = {} as Record<PageKey, boolean>;
    for (const page of PAGE_KEYS) {
      const defaultAllowed = canRoleUsePage(role, page)
        && !(role === 'ADMIN' && ['dvFlexible', 'dvRigid', 'cdvFlexible', 'cdvRigid'].includes(page));
      row[page] = role === 'SUPADMIN' || page === 'dashboard' ? true
        : !canRoleUsePage(role, page) ? false
        : typeof roleInput[page] === 'boolean' ? roleInput[page] as boolean : defaultAllowed;
    }
    if (!row.admin) {
      for (const page of ['users', 'airports', 'dvFlexible', 'dvRigid', 'cdvFlexible', 'cdvRigid'] as PageKey[]) {
        row[page] = false;
      }
    }
    access[role] = row;
  }
  return access;
}

export function isPageAllowed(access: RolePageAccess, role: UserRole, page: PageKey): boolean {
  if (!access[role]?.[page]) return false;
  if (['users', 'airports', 'dvFlexible', 'dvRigid', 'cdvFlexible', 'cdvRigid'].includes(page)) {
    return access[role].admin;
  }
  return true;
}

export function pageKeyForPath(pathname: string): PageKey | null {
  if (pathname === '/') return 'dashboard';
  const match = [...PAGE_DEFINITIONS].sort((a, b) => b.path.length - a.path.length)
    .find((page) => page.path !== '/' && (pathname === page.path || pathname.startsWith(`${page.path}/`)));
  return match?.key ?? null;
}

/** Page setting that further restricts API calls. Existing role checks still apply. */
export function pageForApiRequest(pathname: string, method: string): PageKey | null {
  if (pathname.startsWith('/api/users')) return 'users';
  if (pathname.startsWith('/api/backup') || pathname.startsWith('/api/restore')) return 'admin';
  if (pathname.startsWith('/api/inspections') || pathname === '/api/inspection-items') return 'inspections';
  if (pathname.startsWith('/api/damages') || pathname === '/api/upload') return method === 'GET' ? null : 'damages';
  if (pathname.startsWith('/api/markings')) return method === 'GET' ? null : 'markings';
  if (pathname.startsWith('/api/pci/sections') || pathname === '/api/pci/surveys') return method === 'GET' ? null : 'pci';
  if (method !== 'GET' && method !== 'HEAD'
    && (pathname.startsWith('/api/facilities') || pathname.startsWith('/api/map-layers') || pathname === '/api/config')) return 'admin';
  return null;
}
