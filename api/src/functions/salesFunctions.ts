import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { query, queryOne, execute } from '../db';
import {
  ok, created, noContent, badRequest, unauthorized, notFound,
  serverError, corsResponse, parseBody, requireAuth,
  buildInsert, buildUpdate,
} from '../helpers';
import { v4 as uuidv4 } from 'uuid';

app.http('salesOptions',      { methods: ['OPTIONS'], authLevel: 'anonymous', route: 'sales/{*rest}',      handler: async () => corsResponse() });
app.http('deliveriesOptions', { methods: ['OPTIONS'], authLevel: 'anonymous', route: 'deliveries/{*rest}', handler: async () => corsResponse() });

// ═══════════════════════════════════════════════════════════════════════════
// SALES — specific routes first
// ═══════════════════════════════════════════════════════════════════════════
app.http('salesOverview', {
  methods: ['GET'], authLevel: 'anonymous', route: 'sales/overview',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      const [totals] = await query(
        'SELECT COUNT(*) as total_orders, ISNULL(SUM(total_amount),0) as total_revenue FROM sales'
      );
      const monthly = await query(
        `SELECT FORMAT(created_at,'yyyy-MM') as month,
                ISNULL(SUM(total_amount),0) as revenue
         FROM sales
         GROUP BY FORMAT(created_at,'yyyy-MM')
         ORDER BY month DESC`
      );
      const top = await query(
        `SELECT i.item_name as name,
                ISNULL(SUM(si.quantity),0) as quantity,
                ISNULL(SUM(si.quantity * si.unit_price),0) as revenue
         FROM sale_items si
         JOIN inventory_items i ON i.id = si.inventory_item_id
         GROUP BY i.item_name
         ORDER BY revenue DESC`
      );
      return ok({
        total_revenue: totals?.total_revenue ?? 0,
        total_orders:  totals?.total_orders ?? 0,
        monthly_revenue: monthly,
        top_products:    top,
      });
    } catch (err) { return serverError(err); }
  },
});

app.http('salesGetByCustomer', {
  methods: ['GET'], authLevel: 'anonymous', route: 'sales/customer/{customerId}',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      const sales = await query(
        'SELECT * FROM sales WHERE customer_id = @customerId ORDER BY created_at DESC',
        { customerId: req.params.customerId }
      );
      for (const s of sales) {
        s.sale_items = await query('SELECT * FROM sale_items WHERE sale_id = @id', { id: s.id });
      }
      return ok(sales);
    } catch (err) { return serverError(err); }
  },
});

// ─── SALES — generic CRUD ────────────────────────────────────────────────────
app.http('salesGetAll', {
  methods: ['GET'], authLevel: 'anonymous', route: 'sales',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      // Return DB column `customer_company` aliased as `customer_name`
      // so the frontend that still expects `customer_name` keeps working.
      const sales = await query(
        `SELECT s.*, c.customer_company as customer_name
         FROM sales s
         LEFT JOIN customers c ON c.id = s.customer_id
         ORDER BY s.created_at DESC`
      );
      for (const s of sales) {
        s.sale_items = await query(
          `SELECT si.*, i.item_name
           FROM sale_items si
           LEFT JOIN inventory_items i ON i.id = si.inventory_item_id
           WHERE si.sale_id = @id`,
          { id: s.id }
        );
        s.customers = s.customer_name ? { customer_name: s.customer_name } : null;
      }
      return ok(sales);
    } catch (err) { return serverError(err); }
  },
});

app.http('salesCreate', {
  methods: ['POST'], authLevel: 'anonymous', route: 'sales',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const payload = requireAuth(req);
      if (!payload) return unauthorized();
      const { items, ...saleData } = await parseBody(req);

      const id = saleData.id || uuidv4();
      saleData.id = id;
      saleData.created_by = saleData.created_by || payload.userId;

      const insert = buildInsert('sales', saleData);
      await execute(insert.sql, insert.params);

      if (Array.isArray(items)) {
        for (const raw of items) {
          const item = { ...raw, id: raw.id || uuidv4(), sale_id: id };
          const ins = buildInsert('sale_items', item);
          await execute(ins.sql, ins.params);
        }
      }
      const row = await queryOne('SELECT * FROM sales WHERE id = @id', { id });
      return created(row);
    } catch (err: any) {
      if (err.message?.includes('No valid columns')) return badRequest(err.message);
      return serverError(err);
    }
  },
});

app.http('salesGetById', {
  methods: ['GET'], authLevel: 'anonymous', route: 'sales/{id}',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      const sale = await queryOne('SELECT * FROM sales WHERE id = @id', { id: req.params.id });
      if (!sale) return notFound();
      sale.sale_items = await query('SELECT * FROM sale_items WHERE sale_id = @id', { id: sale.id });
      return ok(sale);
    } catch (err) { return serverError(err); }
  },
});

app.http('salesUpdate', {
  methods: ['PATCH'], authLevel: 'anonymous', route: 'sales/{id}',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      const id = req.params.id;
      const { items, ...body } = await parseBody(req);
      if (Object.keys(body).length) {
        const upd = buildUpdate('sales', body, id);
        await execute(upd.sql, upd.params);
      }
      const row = await queryOne('SELECT * FROM sales WHERE id = @id', { id });
      return ok(row);
    } catch (err: any) {
      if (err.message?.includes('Nothing to update')) return badRequest(err.message);
      return serverError(err);
    }
  },
});

app.http('salesDelete', {
  methods: ['DELETE'], authLevel: 'anonymous', route: 'sales/{id}',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      await execute('DELETE FROM sale_items WHERE sale_id = @id', { id: req.params.id });
      await execute('DELETE FROM sales WHERE id = @id', { id: req.params.id });
      return noContent();
    } catch (err) { return serverError(err); }
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// DELIVERIES — specific routes first
// ═══════════════════════════════════════════════════════════════════════════
app.http('deliveriesBySale', {
  methods: ['GET'], authLevel: 'anonymous', route: 'deliveries/sale/{saleId}',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      const rows = await query(
        'SELECT * FROM deliveries WHERE sale_id = @saleId ORDER BY created_at DESC',
        { saleId: req.params.saleId }
      );
      return ok(rows);
    } catch (err) { return serverError(err); }
  },
});

app.http('deliveriesFulfill', {
  methods: ['POST'], authLevel: 'anonymous', route: 'deliveries/{id}/fulfill',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      const { items } = await parseBody(req);
      for (const item of items || []) {
        await execute(
          'UPDATE inventory_items SET item_stock_current = item_stock_current - @qty WHERE id = @id',
          { qty: item.quantity, id: item.item_id }
        );
      }
      await execute(
        `UPDATE deliveries
         SET status = 'delivered', delivery_date = CAST(SYSUTCDATETIME() AS date), updated_at = SYSUTCDATETIME()
         WHERE id = @id`,
        { id: req.params.id }
      );
      return noContent();
    } catch (err) { return serverError(err); }
  },
});

app.http('deliveriesGetAll', {
  methods: ['GET'], authLevel: 'anonymous', route: 'deliveries',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      const deliveries = await query(
        `SELECT d.*, s.order_number as sale_number
         FROM deliveries d
         LEFT JOIN sales s ON s.id = d.sale_id
         ORDER BY d.created_at DESC`
      );
      for (const d of deliveries) {
        d.delivery_items = await query('SELECT * FROM delivery_items WHERE delivery_id = @id', { id: d.id });
        d.sales = d.sale_number ? { sale_number: d.sale_number } : null;
      }
      return ok(deliveries);
    } catch (err) { return serverError(err); }
  },
});

app.http('deliveriesCreate', {
  methods: ['POST'], authLevel: 'anonymous', route: 'deliveries',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const payload = requireAuth(req);
      if (!payload) return unauthorized();
      const { items, ...data } = await parseBody(req);
      const id = data.id || uuidv4();
      data.id = id;
      data.created_by = data.created_by || payload.userId;
      const insert = buildInsert('deliveries', data);
      await execute(insert.sql, insert.params);
      if (Array.isArray(items)) {
        for (const raw of items) {
          const item = { ...raw, id: raw.id || uuidv4(), delivery_id: id };
          const ins = buildInsert('delivery_items', item);
          await execute(ins.sql, ins.params);
        }
      }
      const row = await queryOne('SELECT * FROM deliveries WHERE id = @id', { id });
      return created(row);
    } catch (err: any) {
      if (err.message?.includes('No valid columns')) return badRequest(err.message);
      return serverError(err);
    }
  },
});

app.http('deliveriesGetById', {
  methods: ['GET'], authLevel: 'anonymous', route: 'deliveries/{id}',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      const d = await queryOne('SELECT * FROM deliveries WHERE id = @id', { id: req.params.id });
      if (!d) return notFound();
      d.delivery_items = await query('SELECT * FROM delivery_items WHERE delivery_id = @id', { id: d.id });
      return ok(d);
    } catch (err) { return serverError(err); }
  },
});

app.http('deliveriesUpdate', {
  methods: ['PATCH'], authLevel: 'anonymous', route: 'deliveries/{id}',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      const id = req.params.id;
      const body = await parseBody(req);
      const upd = buildUpdate('deliveries', body, id);
      await execute(upd.sql, upd.params);
      const row = await queryOne('SELECT * FROM deliveries WHERE id = @id', { id });
      return ok(row);
    } catch (err: any) {
      if (err.message?.includes('Nothing to update')) return badRequest(err.message);
      return serverError(err);
    }
  },
});

app.http('deliveriesDelete', {
  methods: ['DELETE'], authLevel: 'anonymous', route: 'deliveries/{id}',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      await execute('DELETE FROM delivery_items WHERE delivery_id = @id', { id: req.params.id });
      await execute('DELETE FROM deliveries WHERE id = @id', { id: req.params.id });
      return noContent();
    } catch (err) { return serverError(err); }
  },
});