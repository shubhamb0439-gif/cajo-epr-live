import sql from 'mssql';

let pool: sql.ConnectionPool | null = null;

export async function getPool(): Promise<sql.ConnectionPool> {
  if (!pool) {
    pool = await sql.connect(process.env.AZURE_SQL_CONNECTION_STRING!);
  }
  return pool;
}

export async function query<T = any>(queryStr: string, params?: Record<string, any>): Promise<T[]> {
  const p = await getPool();
  const req = p.request();
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      req.input(key, value);
    }
  }
  const result = await req.query(queryStr);
  return result.recordset as T[];
}

export async function queryOne<T = any>(queryStr: string, params?: Record<string, any>): Promise<T | null> {
  const rows = await query<T>(queryStr, params);
  return rows[0] ?? null;
}

export async function execute(queryStr: string, params?: Record<string, any>): Promise<sql.IResult<any>> {
  const p = await getPool();
  const req = p.request();
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      req.input(key, value);
    }
  }
  return req.query(queryStr);
}

export { sql };