import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { query, queryOne, execute } from '../db';
import {
  ok, created, noContent, badRequest, unauthorized, forbidden,
  serverError, corsResponse, parseBody, requireAuth,
  buildInsert, buildUpdate,
} from '../helpers';
import { v4 as uuidv4 } from 'uuid';

app.http('miscOptions', { methods: ['OPTIONS'], authLevel: 'anonymous', route: '{*rest}', handler: async () => corsResponse() });

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVITY LOGS
// ═══════════════════════════════════════════════════════════════════════════
app.http('activityLogsGetAll', {
  methods: ['GET'], authLevel: 'anonymous', route: 'activity-logs',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      const limit = Math.max(1, Math.min(500, parseInt(req.query.get('limit') || '100', 10) || 100));
      return ok(await query(
        `SELECT TOP ${limit} al.*, u.name as user_name
         FROM activity_logs al
         LEFT JOIN users u ON u.id = al.user_id
         ORDER BY al.created_at DESC`
      ));
    } catch (err) { return serverError(err); }
  },
});

app.http('activityLogsCreate', {
  methods: ['POST'], authLevel: 'anonymous', route: 'activity-logs',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const payload = requireAuth(req);
      if (!payload) return unauthorized();
      const { action, details } = await parseBody(req);
      if (!action) return badRequest('action required');
      const id = uuidv4();
      await execute(
        'INSERT INTO activity_logs (id, user_id, action, details) VALUES (@id, @userId, @action, @details)',
        { id, userId: payload.userId, action, details: details ? JSON.stringify(details) : null }
      );
      return created({ id });
    } catch (err) { return serverError(err); }
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// EXCHANGE RATES
// ═══════════════════════════════════════════════════════════════════════════
app.http('exchangeRatesGetAll', {
  methods: ['GET'], authLevel: 'anonymous', route: 'exchange-rates',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      return ok(await query('SELECT * FROM foreign_exchange_rates ORDER BY currency_code ASC'));
    } catch (err) { return serverError(err); }
  },
});

app.http('exchangeRatesGetByCode', {
  methods: ['GET'], authLevel: 'anonymous', route: 'exchange-rates/{code}',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      const row = await queryOne(
        'SELECT * FROM foreign_exchange_rates WHERE currency_code = @code',
        { code: req.params.code }
      );
      return ok(row);
    } catch (err) { return serverError(err); }
  },
});

app.http('exchangeRatesUpdate', {
  methods: ['PATCH'], authLevel: 'anonymous', route: 'exchange-rates/{code}',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const payload = requireAuth(req);
      if (!payload) return unauthorized();
      const { inr_per_unit } = await parseBody(req);
      if (inr_per_unit === undefined || inr_per_unit === null) return badRequest('inr_per_unit required');
      // If the row doesn't exist yet, create it with a sensible currency_name
      const existing = await queryOne(
        'SELECT id FROM foreign_exchange_rates WHERE currency_code = @code',
        { code: req.params.code }
      );
      if (!existing) {
        await execute(
          `INSERT INTO foreign_exchange_rates (id, currency_code, currency_name, inr_per_unit, updated_by)
           VALUES (@id, @code, @code, @rate, @updatedBy)`,
          { id: uuidv4(), code: req.params.code, rate: inr_per_unit, updatedBy: payload.userId }
        );
      } else {
        await execute(
          `UPDATE foreign_exchange_rates
           SET inr_per_unit = @rate, updated_by = @updatedBy, updated_at = SYSUTCDATETIME()
           WHERE currency_code = @code`,
          { rate: inr_per_unit, updatedBy: payload.userId, code: req.params.code }
        );
      }
      return ok(await queryOne(
        'SELECT * FROM foreign_exchange_rates WHERE currency_code = @code',
        { code: req.params.code }
      ));
    } catch (err) { return serverError(err); }
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// DROPDOWNS
// ═══════════════════════════════════════════════════════════════════════════
app.http('dropdownsGetTypes', {
  methods: ['GET'], authLevel: 'anonymous', route: 'dropdowns/types',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      // `dropdown_types` table doesn't exist in the schema; return the
      // distinct drop_type values actually in use plus a known canonical list.
      const known = ['item_group','item_class','vendor_group','vendor_currency','lead_status','lead_source'];
      const used = await query<{type_name:string}>(
        'SELECT DISTINCT drop_type as type_name FROM dropdown_values'
      );
      const set = new Set([...known, ...used.map(r => r.type_name)]);
      return ok(Array.from(set).map(name => ({ id: name, type_name: name })));
    } catch (err) { return serverError(err); }
  },
});

// GET /dropdowns/values — no typeId → return ALL values, so the frontend's
// current call with an empty string (`getValues('')`) works. Declared BEFORE
// the parametric /dropdowns/values/{typeId} handler so it actually matches.
app.http('dropdownsGetAllValues', {
  methods: ['GET'], authLevel: 'anonymous', route: 'dropdowns/values',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      return ok(await query(
        'SELECT * FROM dropdown_values ORDER BY drop_type, sort_order ASC, drop_value ASC'
      ));
    } catch (err) { return serverError(err); }
  },
});

app.http('dropdownsGetValues', {
  methods: ['GET'], authLevel: 'anonymous', route: 'dropdowns/values/{typeId}',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      // Empty typeId? Treat like getAll.
      if (!req.params.typeId) {
        return ok(await query('SELECT * FROM dropdown_values ORDER BY drop_type, sort_order ASC'));
      }
      return ok(await query(
        `SELECT * FROM dropdown_values
         WHERE drop_type = @typeId
         ORDER BY sort_order ASC, drop_value ASC`,
        { typeId: req.params.typeId }
      ));
    } catch (err) { return serverError(err); }
  },
});

app.http('dropdownsAddValue', {
  methods: ['POST'], authLevel: 'anonymous', route: 'dropdowns/values',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      const body = await parseBody(req);
      const id = body.id || uuidv4();
      const drop_type = body.drop_type;
      const drop_value = body.drop_value;
      if (!drop_type)  return badRequest('drop_type required');
      if (!drop_value) return badRequest('drop_value required');

      // sort_order is NOT NULL. Compute max+1 if not provided.
      let sort_order: number;
      if (typeof body.sort_order === 'number') {
        sort_order = body.sort_order;
      } else {
        const maxRow = await queryOne<{max_order:number|null}>(
          'SELECT MAX(sort_order) as max_order FROM dropdown_values WHERE drop_type = @drop_type',
          { drop_type }
        );
        sort_order = (maxRow?.max_order ?? 0) + 1;
      }

      await execute(
        `INSERT INTO dropdown_values (id, drop_type, drop_value, sort_order)
         VALUES (@id, @drop_type, @drop_value, @sort_order)`,
        { id, drop_type, drop_value, sort_order }
      );
      return created(await queryOne('SELECT * FROM dropdown_values WHERE id = @id', { id }));
    } catch (err) { return serverError(err); }
  },
});

app.http('dropdownsDeleteValue', {
  methods: ['DELETE'], authLevel: 'anonymous', route: 'dropdowns/values/{id}',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      await execute('DELETE FROM dropdown_values WHERE id = @id', { id: req.params.id });
      return noContent();
    } catch (err) { return serverError(err); }
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// SYSTEM REQUESTS — specific route first
// ═══════════════════════════════════════════════════════════════════════════

// Parse our synthesized title ("[BUG] location" / "[FEATURE] location") back
// into the `type` + `location` fields the frontend expects to read.
function decorateSystemRequest(r: any) {
  if (!r) return r;
  const title: string = r.title || '';
  let type: 'bug' | 'feature' = 'bug';
  let location = '';
  if (title.startsWith('[FEATURE]')) {
    type = 'feature';
    location = title.slice('[FEATURE]'.length).trim();
  } else if (title.startsWith('[BUG]')) {
    type = 'bug';
    location = title.slice('[BUG]'.length).trim();
  } else {
    location = title;
  }
  return { ...r, type, location };
}

app.http('systemRequestsMine', {
  methods: ['GET'], authLevel: 'anonymous', route: 'system-requests/mine',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const payload = requireAuth(req);
      if (!payload) return unauthorized();
      const rows = await query(
        'SELECT * FROM system_requests WHERE user_id = @uid ORDER BY created_at DESC',
        { uid: payload.userId }
      );
      return ok(rows.map(decorateSystemRequest));
    } catch (err) { return serverError(err); }
  },
});

app.http('systemRequestsGetAll', {
  methods: ['GET'], authLevel: 'anonymous', route: 'system-requests',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      const rows = await query(
        `SELECT sr.*, u.name as user_name
         FROM system_requests sr
         LEFT JOIN users u ON u.id = sr.user_id
         ORDER BY sr.created_at DESC`
      );
      return ok(rows.map(decorateSystemRequest));
    } catch (err) { return serverError(err); }
  },
});

app.http('systemRequestsCreate', {
  methods: ['POST'], authLevel: 'anonymous', route: 'system-requests',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const payload = requireAuth(req);
      if (!payload) return unauthorized();
      const raw = await parseBody(req);

      // Frontend sends { type: 'bug'|'feature', location, description,
      //                  created_by, status }
      // DB needs      { user_id, title (NOT NULL), description, status,
      //                 priority }
      //
      // Translate the frontend-oriented fields into the DB shape:
      //   - title = "[BUG] <location>" or "[FEATURE] <location>"
      //   - description = frontend description (unchanged)
      //   - user_id = authenticated user (overrides whatever created_by said)
      const type = String(raw.type || 'bug').toLowerCase();
      const location = String(raw.location || '').trim();
      const description = String(raw.description || '').trim();

      if (!description) return badRequest('Description is required');

      const prefix = type === 'feature' ? '[FEATURE]' : '[BUG]';
      const title = location ? `${prefix} ${location}` : prefix;

      const body: Record<string, any> = {
        id: raw.id || uuidv4(),
        user_id: payload.userId,
        title,
        description,
        status: raw.status || 'New',
        priority: raw.priority || 'medium',
      };

      const { sql: s, params } = buildInsert('system_requests', body);
      await execute(s, params);
      return created(await queryOne('SELECT * FROM system_requests WHERE id = @id', { id: body.id }));
    } catch (err: any) {
      if (err.message?.includes('No valid columns')) return badRequest(err.message);
      return serverError(err);
    }
  },
});

app.http('systemRequestsUpdate', {
  methods: ['PATCH'], authLevel: 'anonymous', route: 'system-requests/{id}',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      const id = req.params.id;
      const body = await parseBody(req);
      const { sql: s, params } = buildUpdate('system_requests', body, id);
      await execute(s, params);
      return ok(await queryOne('SELECT * FROM system_requests WHERE id = @id', { id }));
    } catch (err: any) {
      if (err.message?.includes('Nothing to update')) return badRequest(err.message);
      return serverError(err);
    }
  },
});

app.http('systemRequestsDelete', {
  methods: ['DELETE'], authLevel: 'anonymous', route: 'system-requests/{id}',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      await execute('DELETE FROM system_requests WHERE id = @id', { id: req.params.id });
      return noContent();
    } catch (err) { return serverError(err); }
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// REPORTS
// ═══════════════════════════════════════════════════════════════════════════
app.http('reportsSummary', {
  methods: ['GET'], authLevel: 'anonymous', route: 'reports/summary',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      const [inv]    = await query('SELECT ISNULL(SUM(item_stock_current * item_cost_average),0) as total_inventory_value FROM inventory_items');
      const [sales]  = await query('SELECT ISNULL(SUM(total_amount),0) as total_sales FROM sales');
      const [purch]  = await query('SELECT ISNULL(SUM(total_amount),0) as total_purchases FROM purchases');
      const [tix]    = await query("SELECT COUNT(*) as open_tickets FROM tickets WHERE status = 'open'");
      const [asm]    = await query(`SELECT COUNT(*) as assemblies_this_month FROM assemblies
                                    WHERE MONTH(created_at) = MONTH(GETDATE())
                                      AND YEAR(created_at)  = YEAR(GETDATE())`);
      return ok({
        total_inventory_value: inv?.total_inventory_value ?? 0,
        total_sales:           sales?.total_sales ?? 0,
        total_purchases:       purch?.total_purchases ?? 0,
        open_tickets:          tix?.open_tickets ?? 0,
        assemblies_this_month: asm?.assemblies_this_month ?? 0,
      });
    } catch (err) { return serverError(err); }
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// BULK UPLOAD — admin/manager only, uses allow-list
// ═══════════════════════════════════════════════════════════════════════════
app.http('bulkInventory', {
  methods: ['POST'], authLevel: 'anonymous', route: 'bulk/inventory',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const payload = requireAuth(req);
      if (!payload) return unauthorized();
      if (payload.role !== 'admin' && payload.role !== 'manager') {
        return forbidden('Admin or manager role required');
      }
      const { items } = await parseBody(req);
      if (!Array.isArray(items)) return badRequest('items must be an array');
      let inserted = 0;
      const errors: string[] = [];
      for (const item of items) {
        try {
          item.id = item.id || uuidv4();
          const { sql: s, params } = buildInsert('inventory_items', item);
          await execute(s, params);
          inserted++;
        } catch (e: any) {
          errors.push(e.message);
        }
      }
      return ok({ inserted, errors });
    } catch (err) { return serverError(err); }
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN — strictly admin-only
// ═══════════════════════════════════════════════════════════════════════════
app.http('adminReset', {
  methods: ['POST'], authLevel: 'anonymous', route: 'admin/reset',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const payload = requireAuth(req);
      if (!payload) return unauthorized();
      if (payload.role !== 'admin') return forbidden('Admin access required');
      const tables = [
        'ticket_messages','tickets','delivery_items','deliveries',
        'sale_items','sales','purchase_order_items','purchase_orders',
        'assembly_components','assembly_units','assemblies',
        'bom_components','boms','purchase_items','purchases',
        'devices','messages','activity_logs','leads','prospects',
      ];
      for (const t of tables) {
        await execute(`DELETE FROM ${t}`);
      }
      return ok({ message: 'Database reset complete' });
    } catch (err) { return serverError(err); }
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// QR CODE (stub)
// ═══════════════════════════════════════════════════════════════════════════
app.http('qrSendEmail', {
  methods: ['POST'], authLevel: 'anonymous', route: 'qr/send-email',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      return ok({ message: 'QR code email queued' });
    } catch (err) { return serverError(err); }
  },
});