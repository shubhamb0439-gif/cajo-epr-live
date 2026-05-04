import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { query, queryOne, execute } from '../db';
import {
  ok, created, noContent, badRequest, unauthorized, notFound,
  serverError, corsResponse, parseBody, requireAuth,
  buildInsert, buildUpdate, preprocessBody,
} from '../helpers';
import { v4 as uuidv4 } from 'uuid';

/**
 * Build a CRUD set of routes for a simple table. Every write now goes
 * through `buildInsert` / `buildUpdate` with the allow-list in helpers.ts,
 * so stray keys from the frontend no longer blow up the INSERT.
 *
 * `responseTransform` optionally rewrites each DB row before sending it
 * back to the client. Used for leads/prospects where the frontend expects
 * legacy column names (lead_name, prospect_email, etc.).
 */
function makeCrud(
  name: string,
  table: string,
  orderBy = 'created_at DESC',
  responseTransform?: (row: any) => any,
  preDeleteHook?: (id: string) => Promise<void>
) {
  const route = name;
  const xform = responseTransform || ((r: any) => r);
  const xformList = (rows: any[]) => rows.map(xform);

  app.http(`${name}Options`, {
    methods: ['OPTIONS'], authLevel: 'anonymous', route: `${route}/{*rest}`,
    handler: async () => corsResponse(),
  });

  app.http(`${name}GetAll`, {
    methods: ['GET'], authLevel: 'anonymous', route,
    handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
      try {
        if (!requireAuth(req)) return unauthorized();
        const rows = await query(`SELECT * FROM ${table} ORDER BY ${orderBy}`);
        return ok(xformList(rows));
      } catch (err) { return serverError(err); }
    },
  });

  app.http(`${name}GetById`, {
    methods: ['GET'], authLevel: 'anonymous', route: `${route}/{id}`,
    handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
      try {
        if (!requireAuth(req)) return unauthorized();
        const row = await queryOne(`SELECT * FROM ${table} WHERE id = @id`, { id: req.params.id });
        if (!row) return notFound();
        return ok(xform(row));
      } catch (err) { return serverError(err); }
    },
  });

  app.http(`${name}Create`, {
    methods: ['POST'], authLevel: 'anonymous', route,
    handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
      try {
        if (!requireAuth(req)) return unauthorized();
        const rawBody = await parseBody(req);
        const pre = preprocessBody(table, rawBody);
        if (pre.error) return badRequest(pre.error);
        const body = pre.body;
        body.id = body.id || uuidv4();
        // assigned_to FK references users.id. The frontend sends auth_user_id,
        // so look up the real users.id and store that instead.
        if (body.assigned_to) {
          const u = await queryOne(
            'SELECT id FROM users WHERE auth_user_id = @id OR id = @id',
            { id: body.assigned_to }
          );
          body.assigned_to = u ? u.id : null;
        }
        const { sql, params } = buildInsert(table, body);
        await execute(sql, params);
        const row = await queryOne(`SELECT * FROM ${table} WHERE id = @id`, { id: body.id });
        return created(xform(row));
      } catch (err: any) {
        if (err.message?.includes('No valid columns')) return badRequest(err.message);
        return serverError(err);
      }
    },
  });

  app.http(`${name}Update`, {
    methods: ['PATCH'], authLevel: 'anonymous', route: `${route}/{id}`,
    handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
      try {
        if (!requireAuth(req)) return unauthorized();
        const id = req.params.id;
        const rawBody = await parseBody(req);
        const pre = preprocessBody(table, rawBody);
        if (pre.error) return badRequest(pre.error);
        const body = pre.body;
        if (body.assigned_to) {
          const u = await queryOne(
            'SELECT id FROM users WHERE auth_user_id = @id OR id = @id',
            { id: body.assigned_to }
          );
          body.assigned_to = u ? u.id : null;
        }
        const { sql, params } = buildUpdate(table, body, id);
        await execute(sql, params);
        const row = await queryOne(`SELECT * FROM ${table} WHERE id = @id`, { id });
        return ok(xform(row));
      } catch (err: any) {
        if (err.message?.includes('Nothing to update')) return badRequest(err.message);
        return serverError(err);
      }
    },
  });

  app.http(`${name}Delete`, {
    methods: ['DELETE'], authLevel: 'anonymous', route: `${route}/{id}`,
    handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
      try {
        if (!requireAuth(req)) return unauthorized();
        if (preDeleteHook) await preDeleteHook(req.params.id);
        await execute(`DELETE FROM ${table} WHERE id = @id`, { id: req.params.id });
        return noContent();
      } catch (err) { return serverError(err); }
    },
  });
}

// Response transforms: rewrite DB columns back to legacy frontend names.
// Each also guarantees primary "name" and "status" fields are non-null
// strings so the frontend's capitalize() / toLowerCase() calls don't crash.
const leadResponse = (r: any) => {
  if (!r) return r;
  const name = r.contact_name || r.company_name || 'Unnamed';
  return {
    ...r,
    lead_name:     name,
    lead_email:    r.email ?? '',
    lead_phone:    r.phone ?? '',
    lead_company:  r.company_name ?? '',
    lead_position: r.industry ?? '',
    lead_status:   r.status || 'new',
    lead_source:   r.source ?? '',
    lead_notes:    r.notes ?? '',
  };
};
const prospectResponse = (r: any) => {
  if (!r) return r;
  const name = r.contact_name || r.company_name || 'Unnamed';
  return {
    ...r,
    prospect_name:    name,
    prospect_email:   r.email ?? '',
    prospect_phone:   r.phone ?? '',
    prospect_company: r.company_name ?? '',
    prospect_status:  r.status || 'new',
    prospect_source:  r.source ?? '',
    prospect_value:   r.value ?? null,
    prospect_notes:   r.notes ?? '',
  };
};
// Customers page reads customer_name, customer_email, etc. but the DB has
// contact_name, email, customer_company. Alias them on the way out, and
// guarantee every field is a non-null string so the frontend's
// .toLowerCase() and .charAt(0) calls don't crash the page.
const customerResponse = (r: any) => {
  if (!r) return r;
  const name = r.contact_name || r.customer_company || 'Unnamed';
  return {
    ...r,
    customer_name:     name,
    customer_email:    r.email ?? '',
    customer_phone:    r.phone ?? '',
    customer_company:  r.customer_company ?? '',
    customer_position: '',
    customer_status:   r.status || 'active',
    customer_source:   r.source ?? '',
    customer_value:    r.value ?? null,
    customer_notes:    r.notes ?? '',
  };
};

// Register generic CRUD for simple tables.
makeCrud('users',     'users',     'name ASC');
makeCrud('vendors',   'vendors',   'vendor_name ASC');
makeCrud('customers', 'customers', 'customer_company ASC', customerResponse);
makeCrud('leads',     'leads',     'created_at DESC', leadResponse,
  async (id) => { await execute('UPDATE prospects SET lead_id = NULL WHERE lead_id = @id', { id }); }
);
makeCrud('prospects', 'prospects', 'created_at DESC', prospectResponse);
makeCrud('devices',   'devices',   'created_at DESC');

// ─── USERS extra endpoints ──────────────────────────────────────────────────
app.http('usersByAuthId', {
  methods: ['GET'], authLevel: 'anonymous', route: 'users/by-auth/{authUserId}',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      const row = await queryOne(
        'SELECT * FROM users WHERE auth_user_id = @authUserId',
        { authUserId: req.params.authUserId }
      );
      if (!row) return notFound();
      return ok(row);
    } catch (err) { return serverError(err); }
  },
});

app.http('usersUpdateProfile', {
  methods: ['PATCH'], authLevel: 'anonymous', route: 'users/{id}/profile',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      const id = req.params.id;
      const body = await parseBody(req);
      // Only name / profile_picture_url / email are editable via profile route
      const profileOnly: Record<string, any> = {};
      if (body.name !== undefined)                profileOnly.name = body.name;
      if (body.profile_picture_url !== undefined) profileOnly.profile_picture_url = body.profile_picture_url;
      if (body.email !== undefined)               profileOnly.email = body.email;
      if (Object.keys(profileOnly).length === 0) return badRequest('Nothing to update');
      const { sql, params } = buildUpdate('users', profileOnly, id);
      await execute(sql, params);
      const row = await queryOne('SELECT * FROM users WHERE id = @id', { id });
      return ok(row);
    } catch (err) { return serverError(err); }
  },
});

// ─── DEVICES extra endpoints ────────────────────────────────────────────────
app.http('devicesByCustomer', {
  methods: ['GET'], authLevel: 'anonymous', route: 'devices/customer/{customerId}',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      const rows = await query(
        'SELECT * FROM devices WHERE customer_id = @customerId ORDER BY created_at DESC',
        { customerId: req.params.customerId }
      );
      return ok(rows);
    } catch (err) { return serverError(err); }
  },
});

app.http('devicesUpdateStatus', {
  methods: ['PATCH'], authLevel: 'anonymous', route: 'devices/{id}/status',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      const { status, note } = await parseBody(req);
      if (!status) return badRequest('status is required');
      await execute(
        'UPDATE devices SET status = @status, notes = @note, updated_at = SYSUTCDATETIME() WHERE id = @id',
        { status, note: note || null, id: req.params.id }
      );
      const row = await queryOne('SELECT * FROM devices WHERE id = @id', { id: req.params.id });
      return ok(row);
    } catch (err) { return serverError(err); }
  },
});

app.http('deviceIssueTypes', {
  methods: ['GET'], authLevel: 'anonymous', route: 'devices/issue-types',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      const rows = await query('SELECT * FROM device_issue_types ORDER BY name ASC');
      return ok(rows);
    } catch (err) { return serverError(err); }
  },
});