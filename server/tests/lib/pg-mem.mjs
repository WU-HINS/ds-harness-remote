import { newDb, DataType } from 'pg-mem'

/** pg-mem lacks PostgreSQL advisory locks; the lease logic is exercised on real PG. */
export function newTestDb(options = { autoCreateForeignKeyIndices: true }) {
  const db = newDb(options)
  db.public.registerFunction({ name: 'hashtext', args: [DataType.text], returns: DataType.integer, implementation: () => 1 })
  db.public.registerFunction({ name: 'pg_try_advisory_lock', args: [DataType.integer], returns: DataType.bool, implementation: () => true })
  db.public.registerFunction({ name: 'pg_advisory_lock', args: [DataType.integer], returns: DataType.bool, implementation: () => true })
  db.public.registerFunction({ name: 'pg_advisory_unlock', args: [DataType.integer], returns: DataType.bool, implementation: () => true })
  return db
}
