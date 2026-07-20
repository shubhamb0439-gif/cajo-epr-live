import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { query, queryOne, execute, getPool, sql } from '../db';
import {
  ok, created, noContent, badRequest, unauthorized, notFound,
  serverError, corsResponse, parseBody, requireAuth,
  buildInsert, buildUpdate, preprocessBody,
} from '../helpers';
import { v4 as uuidv4 } from 'uuid';

app.http('bomsOptions',       { methods: ['OPTIONS'], authLevel: 'anonymous', route: 'boms/{*rest}',       handler: async () => corsResponse() });
app.http('assembliesOptions', { methods: ['OPTIONS'], authLevel: 'anonymous', route: 'assemblies/{*rest}', handler: async () => corsResponse() });

// ═══════════════════════════════════════════════════════════════════════════
// BOMs
// ═══════════════════════════════════════════════════════════════════════════
app.http('bomsGetAll', {
  methods: ['GET'], authLevel: 'anonymous', route: 'boms',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      // Alias `name` -> `bom_name` and join the finished-product inventory
      // row as `inventory_items` so the frontend (Supabase-style) can use
      // `bom.bom_name` and `bom.inventory_items.item_name` directly.
      const boms = await query(
        `SELECT b.*,
                b.name as bom_name,
                i.item_name  as fp_item_name,
                i.item_id    as fp_item_code,
                i.item_group as fp_item_group
         FROM boms b
         LEFT JOIN inventory_items i ON i.id = b.finished_product_id
         ORDER BY b.name ASC`
      );
      for (const b of boms) {
        b.inventory_items = b.fp_item_name
          ? {
              id:         b.finished_product_id,
              item_name:  b.fp_item_name,
              item_id:    b.fp_item_code,
              item_group: b.fp_item_group,
            }
          : null;
        delete b.fp_item_name;
        delete b.fp_item_code;
        delete b.fp_item_group;
        b.bom_components = await query(
          `SELECT bc.*,
                  bc.inventory_item_id as item_id,
                  bc.quantity_required as quantity,
                  bc.quantity_required as bom_component_quantity,
                  i.item_name,
                  i.item_group,
                  i.item_serial_number_tracked
           FROM bom_components bc
           LEFT JOIN inventory_items i ON i.id = bc.inventory_item_id
           WHERE bc.bom_id = @id`,
          { id: b.id }
        );
        for (const c of b.bom_components) {
          c.inventory_items = c.item_name ? {
            id: c.inventory_item_id,
            item_name: c.item_name,
            item_group: c.item_group,
            item_serial_number_tracked: c.item_serial_number_tracked ?? false,
          } : null;
        }
      }
      return ok(boms);
    } catch (err) { return serverError(err); }
  },
});

// NOTE: specific routes (/boms/components, /boms/components/{id}) MUST be
// declared BEFORE the parametric /boms/{id} update/delete below.
app.http('bomsAddComponent', {
  methods: ['POST'], authLevel: 'anonymous', route: 'boms/components',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      const rawBody = await parseBody(req);
      const pre = preprocessBody('bom_components', rawBody);
      if (pre.error) return badRequest(pre.error);
      const body = pre.body;
      body.id = body.id || uuidv4();
      const { sql: s, params } = buildInsert('bom_components', body);
      await execute(s, params);
      const row = await queryOne('SELECT * FROM bom_components WHERE id = @id', { id: body.id });
      return created(row);
    } catch (err: any) {
      if (err.message?.includes('No valid columns')) return badRequest(err.message);
      return serverError(err);
    }
  },
});

app.http('bomsDeleteComponent', {
  methods: ['DELETE'], authLevel: 'anonymous', route: 'boms/components/{id}',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      await execute('DELETE FROM bom_components WHERE id = @id', { id: req.params.id });
      return noContent();
    } catch (err) { return serverError(err); }
  },
});

app.http('bomsCreate', {
  methods: ['POST'], authLevel: 'anonymous', route: 'boms',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      const rawBody = await parseBody(req);
      const pre = preprocessBody('boms', rawBody);
      if (pre.error) return badRequest(pre.error);
      const body = pre.body;
      body.id = body.id || uuidv4();
      const { sql: s, params } = buildInsert('boms', body);
      await execute(s, params);
      const row = await queryOne('SELECT *, name as bom_name FROM boms WHERE id = @id', { id: body.id });
      return created(row);
    } catch (err: any) {
      if (err.message?.includes('No valid columns')) return badRequest(err.message);
      return serverError(err);
    }
  },
});

app.http('bomsGetById', {
  methods: ['GET'], authLevel: 'anonymous', route: 'boms/{id}',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      const b = await queryOne(
        `SELECT b.*, b.name as bom_name,
                i.id         as fp_id,
                i.item_name  as fp_item_name,
                i.item_id    as fp_item_code,
                i.item_group as fp_item_group
         FROM boms b
         LEFT JOIN inventory_items i ON i.id = b.finished_product_id
         WHERE b.id = @id`,
        { id: req.params.id }
      );
      if (!b) return notFound();
      b.inventory_items = b.fp_id
        ? {
            id:         b.fp_id,
            item_name:  b.fp_item_name,
            item_id:    b.fp_item_code,
            item_group: b.fp_item_group,
          }
        : null;
      delete b.fp_id;
      delete b.fp_item_name;
      delete b.fp_item_code;
      delete b.fp_item_group;
      b.bom_components = await query(
        `SELECT bc.*,
                bc.inventory_item_id as item_id,
                bc.quantity_required as quantity,
                bc.quantity_required as bom_component_quantity,
                i.item_name,
                i.item_group,
                i.item_serial_number_tracked
         FROM bom_components bc
         LEFT JOIN inventory_items i ON i.id = bc.inventory_item_id
         WHERE bc.bom_id = @id`,
        { id: b.id }
      );
      for (const c of b.bom_components) {
        c.inventory_items = c.item_name ? {
          id: c.inventory_item_id,
          item_name: c.item_name,
          item_group: c.item_group,
          item_serial_number_tracked: c.item_serial_number_tracked ?? false,
        } : null;
      }
      return ok(b);
    } catch (err) { return serverError(err); }
  },
});

app.http('bomsUpdate', {
  methods: ['PATCH'], authLevel: 'anonymous', route: 'boms/{id}',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      const id = req.params.id;
      const body = await parseBody(req);
      const { sql: s, params } = buildUpdate('boms', body, id);
      await execute(s, params);
      const row = await queryOne('SELECT *, name as bom_name FROM boms WHERE id = @id', { id });
      return ok(row);
    } catch (err: any) {
      if (err.message?.includes('Nothing to update')) return badRequest(err.message);
      return serverError(err);
    }
  },
});

app.http('bomsDelete', {
  methods: ['DELETE'], authLevel: 'anonymous', route: 'boms/{id}',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      await execute('DELETE FROM bom_components WHERE bom_id = @id', { id: req.params.id });
      await execute('DELETE FROM boms WHERE id = @id', { id: req.params.id });
      return noContent();
    } catch (err) { return serverError(err); }
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// ASSEMBLIES
// Specific routes first: /assemblies/create, /assemblies/files, etc.
// ═══════════════════════════════════════════════════════════════════════════
app.http('assembliesCreate', {
  methods: ['POST'], authLevel: 'anonymous', route: 'assemblies/create',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const payload = requireAuth(req);
      if (!payload) return unauthorized();
      const { bom_id, quantity, po_number } = await parseBody(req);
      if (!bom_id || !quantity) return badRequest('bom_id and quantity required');
      const pool = await getPool();
      const r = pool.request();
      r.input('bom_id', sql.UniqueIdentifier, bom_id);
      r.input('quantity', sql.Decimal(18, 4), quantity);
      r.input('po_number', sql.NVarChar, po_number || null);
      r.input('created_by', sql.UniqueIdentifier, payload.userId);
      r.output('assembly_id', sql.UniqueIdentifier);
      const result = await r.execute('sp_execute_assembly_transaction');
      const assemblyId = result.output.assembly_id;
      return created(await queryOne('SELECT * FROM assemblies WHERE id = @id', { id: assemblyId }));
    } catch (err) { return serverError(err); }
  },
});

app.http('assembliesAddFile', {
  methods: ['POST'], authLevel: 'anonymous', route: 'assemblies/files',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const payload = requireAuth(req);
      if (!payload) return unauthorized();
      const body = await parseBody(req);
      body.id = body.id || uuidv4();
      body.uploaded_by = body.uploaded_by || payload.userId;
      const { sql: s, params } = buildInsert('assembly_files', body);
      await execute(s, params);
      const row = await queryOne('SELECT * FROM assembly_files WHERE id = @id', { id: body.id });
      return created(row);
    } catch (err: any) {
      if (err.message?.includes('No valid columns')) return badRequest(err.message);
      return serverError(err);
    }
  },
});

app.http('assembliesDeleteFile', {
  methods: ['DELETE'], authLevel: 'anonymous', route: 'assemblies/files/{id}',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      await execute('DELETE FROM assembly_files WHERE id = @id', { id: req.params.id });
      return noContent();
    } catch (err) { return serverError(err); }
  },
});

app.http('assembliesReverse', {
  methods: ['POST'], authLevel: 'anonymous', route: 'assemblies/{id}/reverse',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      const pool = await getPool();
      const r = pool.request();
      r.input('assembly_id', sql.UniqueIdentifier, req.params.id);
      await r.execute('sp_reverse_assembly');
      return noContent();
    } catch (err) { return serverError(err); }
  },
});

app.http('assembliesGetFiles', {
  methods: ['GET'], authLevel: 'anonymous', route: 'assemblies/{id}/files',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      const rows = await query(
        'SELECT * FROM assembly_files WHERE assembly_id = @id OR assembly_unit_id = @id ORDER BY created_at DESC',
        { id: req.params.id }
      );
      return ok(rows);
    } catch (err) { return serverError(err); }
  },
});

app.http('assembliesUpdateUnitSerial', {
  methods: ['PATCH'], authLevel: 'anonymous', route: 'assemblies/units/{id}',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      const { assembly_serial_number } = await parseBody(req);
      const unitId = req.params.id;
      await execute(
        'UPDATE assembly_units SET assembly_serial_number = @serial WHERE id = @id',
        { serial: assembly_serial_number ?? null, id: unitId }
      );
      const unit = await queryOne('SELECT * FROM assembly_units WHERE id = @id', { id: unitId });
      if (!unit) return notFound();
      return ok(unit);
    } catch (err) { return serverError(err); }
  },
});

app.http('assembliesUpdateComponentSerial', {
  methods: ['PATCH'], authLevel: 'anonymous', route: 'assemblies/components/{id}',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      const { assembly_item_serial_number } = await parseBody(req);
      const compId = req.params.id;
      await execute(
        'UPDATE assembly_components SET assembly_item_serial_number = @serial WHERE id = @id',
        { serial: assembly_item_serial_number ?? null, id: compId }
      );
      const comp = await queryOne('SELECT * FROM assembly_components WHERE id = @id', { id: compId });
      if (!comp) return notFound();
      return ok(comp);
    } catch (err) { return serverError(err); }
  },
});

// Generic list/getById LAST
app.http('assembliesGetAll', {
  methods: ['GET'], authLevel: 'anonymous', route: 'assemblies',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      const assemblies = await query(
        `SELECT a.*,
                b.name as bom_name,
                b.finished_product_id as fp_id,
                i.item_name as fp_item_name,
                i.item_id as fp_item_code,
                i.item_serial_number_tracked as fp_serial_tracked
         FROM assemblies a
         LEFT JOIN boms b ON b.id = a.bom_id
         LEFT JOIN inventory_items i ON i.id = b.finished_product_id
         ORDER BY a.created_at DESC`
      );
      for (const a of assemblies) {
        a.boms = a.bom_name ? {
          bom_name: a.bom_name,
          bom_item_id: a.fp_id,
          inventory_items: a.fp_id ? {
            id: a.fp_id,
            item_name: a.fp_item_name,
            item_id: a.fp_item_code,
            item_serial_number_tracked: a.fp_serial_tracked ?? false,
          } : null
        } : null;
        delete a.fp_id;
        delete a.fp_item_name;
        delete a.fp_item_code;
        delete a.fp_serial_tracked;
      }
      return ok(assemblies);
    } catch (err) { return serverError(err); }
  },
});

app.http('assembliesGetById', {
  methods: ['GET'], authLevel: 'anonymous', route: 'assemblies/{id}',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      const a = await queryOne(
        `SELECT a.*, b.name as bom_name
         FROM assemblies a
         LEFT JOIN boms b ON b.id = a.bom_id
         WHERE a.id = @id`,
        { id: req.params.id }
      );
      if (!a) return notFound();
      a.assembly_units = await query(
        'SELECT * FROM assembly_units WHERE assembly_id = @id',
        { id: a.id }
      );
      a.assembly_components = await query(
        `SELECT ac.*, i.item_name
         FROM assembly_components ac
         LEFT JOIN inventory_items i ON i.id = ac.inventory_item_id
         WHERE ac.assembly_id = @id`,
        { id: a.id }
      );
      a.boms = a.bom_name ? { bom_name: a.bom_name } : null;
      return ok(a);
    } catch (err) { return serverError(err); }
  },
});