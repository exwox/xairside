import { prisma } from '@/lib/db';
import { normalizeRolePageAccess, type RolePageAccess } from '@/lib/page-access';

const CONFIG_KEY = 'rolePageAccessV1';

export async function getRolePageAccess(): Promise<RolePageAccess> {
  const row = await prisma.appConfig.findUnique({ where: { key: CONFIG_KEY } });
  if (!row) return normalizeRolePageAccess();
  try {
    return normalizeRolePageAccess(JSON.parse(row.value));
  } catch {
    return normalizeRolePageAccess();
  }
}

export async function saveRolePageAccess(value: RolePageAccess): Promise<void> {
  await prisma.appConfig.upsert({
    where: { key: CONFIG_KEY },
    update: { value: JSON.stringify(value) },
    create: { key: CONFIG_KEY, value: JSON.stringify(value) },
  });
}
