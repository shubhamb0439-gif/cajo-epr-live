import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { query, queryOne, execute } from '../db';
import {
  ok, created, noContent, badRequest, unauthorized, notFound,
  serverError, corsResponse, parseBody, requireAuth,
  buildInsert, buildUpdate,
} from '../helpers';
import { v4 as uuidv4 } from 'uuid';

app.http('inventoryOptions', {
  methods: ['OPTIONS'], authLevel: 'anonymous', route: 'inventory/{*rest}',
  handler: async () => corsResponse(),
});

app.http('inventoryGetAll', {
  methods: ['GET'], authLevel: 'anonymous', route: 'inventory',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      return ok(await query('SELECT * FROM inventory_items ORDER BY item_name ASC'));
    } catch (err) { return serverError(err); }
  },
});

app.http('inventoryGetById', {
  methods: ['GET'], authLevel: 'anonymous', route: 'inventory/{id}',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      const row = await queryOne('SELECT * FROM inventory_items WHERE id = @id', { id: req.params.id });
      if (!row) return notFound();
      return ok(row);
    } catch (err) { return serverError(err); }
  },
});

app.http('inventoryCreate', {
  methods: ['POST'], authLevel: 'anonymous', route: 'inventory',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const payload = requireAuth(req);
      if (!payload) return unauthorized();
      const body = await parseBody(req);
      body.id = body.id || uuidv4();
      body.created_by = body.created_by || payload.userId;
      const { sql, params } = buildInsert('inventory_items', body);
      await execute(sql, params);
      const row = await queryOne('SELECT * FROM inventory_items WHERE id = @id', { id: body.id });
      return created(row);
    } catch (err: any) {
      if (err.message?.includes('No valid columns')) return badRequest(err.message);
      return serverError(err);
    }
  },
});

app.http('inventoryUpdate', {
  methods: ['PATCH'], authLevel: 'anonymous', route: 'inventory/{id}',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const payload = requireAuth(req);
      if (!payload) return unauthorized();
      const id = req.params.id;
      const body = await parseBody(req);
      body.updated_by = payload.userId;
      const { sql, params } = buildUpdate('inventory_items', body, id);
      await execute(sql, params);
      const row = await queryOne('SELECT * FROM inventory_items WHERE id = @id', { id });
      return ok(row);
    } catch (err: any) {
      if (err.message?.includes('Nothing to update')) return badRequest(err.message);
      return serverError(err);
    }
  },
});

app.http('inventoryDelete', {
  methods: ['DELETE'], authLevel: 'anonymous', route: 'inventory/{id}',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      await execute('DELETE FROM inventory_items WHERE id = @id', { id: req.params.id });
      return noContent();
    } catch (err) { return serverError(err); }
  },
});