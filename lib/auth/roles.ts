// STUB: the real role layer needs drizzle/schema.ts and docs/DATABASE_SCHEMA.md, which are not in
// the export. Until then no one resolves as Owner/Admin. Replace with tenant-scoped queries.
export async function isPlatformOwner(_userId: string): Promise<boolean> {
  return false;
}

export async function isPlatformAdmin(_userId: string): Promise<boolean> {
  return false;
}
