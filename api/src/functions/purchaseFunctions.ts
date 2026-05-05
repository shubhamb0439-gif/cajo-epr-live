import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { query, queryOne, execute } from '../db';
import {
  ok, created, noContent, badRequest, unauthorized, notFound,
  serverError, corsResponse, parseBody, requireAuth,
  buildInsert, buildUpdate, preprocessBody,
} from '../helpers';
import { v4 as uuidv4 } from 'uuid';

app.http('purchasesOptions',      { methods: ['OPTIONS'], authLevel: 'anonymous', route: 'purchases/{*rest}',       handler: async () => corsResponse() });
app.http('purchaseOrdersOptions', { methods: ['OPTIONS'], authLevel: 'anonymous', route: 'purchase-orders/{*rest}', handler: async () => corsResponse() });

// ═══════════════════════════════════════════════════════════════════════════
// PURCHASES — specific routes first
// ═══════════════════════════════════════════════════════════════════════════
app.http('purchasesStockByVendor', {
  methods: ['GET'], authLevel: 'anonymous', route: 'purchases/stock-by-vendor',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      const rows = await query(
        `SELECT v.id as vendor_id, v.vendor_name, i.item_name,
                ISNULL(SUM(pi.quantity_received),0) as quantity
         FROM purchase_items pi
         JOIN purchases p ON p.id = pi.purchase_id
         JOIN vendors v   ON v.id = p.vendor_id
         JOIN inventory_items i ON i.id = pi.inventory_item_id
         GROUP BY v.id, v.vendor_name, i.item_name`
      );
      return ok(rows);
    } catch (err) { return serverError(err); }
  },
});

app.http('purchasesReceive', {
  methods: ['POST'], authLevel: 'anonymous', route: 'purchases/{id}/receive',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      const { items } = await parseBody(req);
      for (const item of items || []) {
        await execute(
          'UPDATE purchase_items SET quantity_received = @qty WHERE id = @id',
          { qty: item.quantity_received, id: item.id }
        );
        const pi = await queryOne(
          'SELECT * FROM purchase_items WHERE id = @id',
          { id: item.id }
        );
        if (pi) {
          await execute(
            `UPDATE inventory_items
             SET item_stock_current = item_stock_current + @qty,
                 updated_at = SYSUTCDATETIME()
             WHERE id = @invId`,
            { qty: item.quantity_received, invId: pi.inventory_item_id }
          );
        }
      }
      return noContent();
    } catch (err) { return serverError(err); }
  },
});

// ─── PURCHASES — generic CRUD ───────────────────────────────────────────────
app.http('purchasesGetAll', {
  methods: ['GET'], authLevel: 'anonymous', route: 'purchases',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      // Expose `vendor_id` also as `purchase_vendor_id` and `created_at` as
      // `purchase_date` so the frontend (written against the old Supabase
      // schema) can read either name.
      const purchases = await query(
        `SELECT *, vendor_id as purchase_vendor_id, po_reference as purchase_po_number, created_at as purchase_date FROM purchases ORDER BY created_at DESC`
      );
      for (const p of purchases) {
        const rawItems = await query(
          `SELECT pi.id, pi.purchase_id, pi.inventory_item_id, pi.quantity_ordered as quantity,
                  pi.quantity_received, pi.remaining_quantity, pi.unit_cost, pi.vendor_item_code,
                  pi.lead_time_days as lead_time,
                  i.item_name, i.item_id as item_code, ISNULL(i.item_stock_current, 0) as item_stock_current
           FROM purchase_items pi
           LEFT JOIN inventory_items i ON i.id = pi.inventory_item_id
           WHERE pi.purchase_id = @id`,
          { id: p.id }
        );
        p.purchase_items = rawItems.map((pi: any) => ({
          id:               pi.id,
          item_id:          pi.inventory_item_id,
          vendor_item_code: pi.vendor_item_code,
          quantity:         pi.quantity,
          quantity_received: pi.quantity_received || 0,
          unit_cost:        pi.unit_cost || 0,
          lead_time:        pi.lead_time || 0,
          received:         (pi.quantity_received || 0) >= pi.quantity,
          inventory_items: {
            id:                 pi.inventory_item_id,
            item_id:            pi.item_code || '',
            item_name:          pi.item_name || 'Unknown',
            item_stock_current: pi.item_stock_current || 0,
          },
        }));
        const vendor = await queryOne(
          'SELECT vendor_name FROM vendors WHERE id = @id',
          { id: p.vendor_id }
        );
        p.vendors = vendor;
      }
      return ok(purchases);
    } catch (err) { return serverError(err); }
  },
});

app.http('purchasesCreate', {
  methods: ['POST'], authLevel: 'anonymous', route: 'purchases',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const payload = requireAuth(req);
      if (!payload) return unauthorized();
      const rawBody = await parseBody(req);
      const { items, ...purchaseRaw } = rawBody;
      const pre = preprocessBody('purchases', purchaseRaw);
      if (pre.error) return badRequest(pre.error);
      const purchaseData = pre.body;
      const id = purchaseData.id || uuidv4();
      purchaseData.id = id;
      purchaseData.created_by = purchaseData.created_by || payload.userId;
      const insert = buildInsert('purchases', purchaseData);
      await execute(insert.sql, insert.params);
      if (Array.isArray(items)) {
        for (const raw of items) {
          const item = { ...raw, id: raw.id || uuidv4(), purchase_id: id };
          if (item.quantity !== undefined && item.quantity_ordered === undefined) {
            item.quantity_ordered = item.quantity;
          }
          if (item.quantity_received === undefined) item.quantity_received = 0;
          if (item.remaining_quantity === undefined) {
            item.remaining_quantity = (item.quantity_ordered || 0) - (item.quantity_received || 0);
          }
          const ins = buildInsert('purchase_items', item);
          await execute(ins.sql, ins.params);
        }
      }
      const row = await queryOne('SELECT * FROM purchases WHERE id = @id', { id });
      return created(row);
    } catch (err: any) {
      if (err.message?.includes('No valid columns')) return badRequest(err.message);
      return serverError(err);
    }
  },
});

app.http('purchasesGetById', {
  methods: ['GET'], authLevel: 'anonymous', route: 'purchases/{id}',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      const p = await queryOne('SELECT * FROM purchases WHERE id = @id', { id: req.params.id });
      if (!p) return notFound();
      p.purchase_items = await query('SELECT * FROM purchase_items WHERE purchase_id = @id', { id: p.id });
      return ok(p);
    } catch (err) { return serverError(err); }
  },
});

app.http('purchasesUpdate', {
  methods: ['PATCH'], authLevel: 'anonymous', route: 'purchases/{id}',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      const id = req.params.id;
      const { items, ...body } = await parseBody(req);

      // Update purchase header (po_reference, vendor_id, etc.)
      if (Object.keys(body).length) {
        try {
          const upd = buildUpdate('purchases', body, id);
          await execute(upd.sql, upd.params);
        } catch (e: any) {
          if (!e.message?.includes('Nothing to update')) throw e;
        }
      }

      // Update purchase items
      if (Array.isArray(items)) {
        for (const item of items) {
          if (item.toDelete && item.id) {
            const existing = await queryOne('SELECT * FROM purchase_items WHERE id = @id', { id: item.id });
            if (existing && (existing.quantity_received || 0) > 0) {
              await execute(
                `UPDATE inventory_items SET item_stock_current = item_stock_current - @qty, updated_at = SYSUTCDATETIME() WHERE id = @invId`,
                { qty: existing.quantity_received, invId: existing.inventory_item_id }
              );
            }
            await execute('DELETE FROM purchase_items WHERE id = @id', { id: item.id });

          } else if (item.id) {
            const existing = await queryOne('SELECT * FROM purchase_items WHERE id = @id', { id: item.id });
            if (existing) {
              const diff = (item.quantity_received || 0) - (existing.quantity_received || 0);
              if (diff !== 0) {
                await execute(
                  `UPDATE inventory_items SET item_stock_current = item_stock_current + @diff, updated_at = SYSUTCDATETIME() WHERE id = @invId`,
                  { diff, invId: existing.inventory_item_id }
                );
              }
            }
            await execute(
              `UPDATE purchase_items SET quantity_ordered = @qty, quantity_received = @rcv,
               remaining_quantity = @rem, unit_cost = @cost, vendor_item_code = @vc, lead_time_days = @lt
               WHERE id = @id`,
              {
                qty:  item.quantity           || 0,
                rcv:  item.quantity_received  || 0,
                rem:  Math.max(0, (item.quantity || 0) - (item.quantity_received || 0)),
                cost: item.unit_cost          || 0,
                vc:   item.vendor_item_code   || null,
                lt:   item.lead_time          || 0,
                id:   item.id,
              }
            );

          } else if (item.item_id) {
            const rcv = item.quantity_received || 0;
            const newId = uuidv4();
            await execute(
              `INSERT INTO purchase_items (id, purchase_id, inventory_item_id, quantity_ordered, quantity_received, remaining_quantity, unit_cost, vendor_item_code, lead_time_days)
               VALUES (@id, @pid, @inv, @qty, @rcv, @rem, @cost, @vc, @lt)`,
              {
                id:   newId,
                pid:  id,
                inv:  item.item_id,
                qty:  item.quantity  || 0,
                rcv,
                rem:  Math.max(0, (item.quantity || 0) - rcv),
                cost: item.unit_cost || 0,
                vc:   item.vendor_item_code || null,
                lt:   item.lead_time        || 0,
              }
            );
            if (rcv > 0) {
              await execute(
                `UPDATE inventory_items SET item_stock_current = item_stock_current + @qty, updated_at = SYSUTCDATETIME() WHERE id = @invId`,
                { qty: rcv, invId: item.item_id }
              );
            }
          }
        }

        // Recalculate purchase total from remaining items
        const remaining = await query(
          'SELECT quantity_ordered, unit_cost FROM purchase_items WHERE purchase_id = @id', { id }
        );
        const newTotal = remaining.reduce((s: number, r: any) => s + (r.quantity_ordered || 0) * (r.unit_cost || 0), 0);
        await execute('UPDATE purchases SET total_amount = @total, updated_at = SYSUTCDATETIME() WHERE id = @id', { total: newTotal, id });
      }

      const row = await queryOne('SELECT * FROM purchases WHERE id = @id', { id });
      return ok(row);
    } catch (err: any) {
      return serverError(err);
    }
  },
});

app.http('purchasesDelete', {
  methods: ['DELETE'], authLevel: 'anonymous', route: 'purchases/{id}',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      await execute('DELETE FROM purchase_items WHERE purchase_id = @id', { id: req.params.id });
      await execute('DELETE FROM purchases WHERE id = @id', { id: req.params.id });
      return noContent();
    } catch (err) { return serverError(err); }
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// PURCHASE ORDERS
// ═══════════════════════════════════════════════════════════════════════════
app.http('purchaseOrdersGetAll', {
  methods: ['GET'], authLevel: 'anonymous', route: 'purchase-orders',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      // Join both vendors and customers since a PO may be linked to either.
      const pos = await query(
        `SELECT po.*,
                v.vendor_name,
                c.contact_name    as c_contact_name,
                c.customer_company as c_company,
                c.email           as c_email,
                c.phone           as c_phone
         FROM purchase_orders po
         LEFT JOIN vendors   v ON v.id = po.vendor_id
         LEFT JOIN customers c ON c.id = po.customer_id
         ORDER BY po.created_at DESC`
      );
      for (const po of pos) {
        po.purchase_order_items = await query(
          `SELECT poi.*, i.item_name, b.name as bom_name
           FROM purchase_order_items poi
           LEFT JOIN inventory_items i ON i.id = poi.inventory_item_id
           LEFT JOIN boms b             ON b.id = poi.bom_id
           WHERE poi.purchase_order_id = @id`,
          { id: po.id }
        );
        // Frontend does order.customers.customer_name.toLowerCase() WITHOUT a
        // null guard, so we must always return a non-null `customers` object.
        po.customers = po.customer_id ? {
          customer_name:  po.c_contact_name || po.c_company || 'Unnamed',
          customer_email: po.c_email || '',
          customer_phone: po.c_phone || '',
        } : {
          customer_name:  '',  // empty string is safe for toLowerCase()
          customer_email: '',
          customer_phone: '',
        };
        po.vendors = po.vendor_id ? { vendor_name: po.vendor_name || 'Unnamed' } : null;
        // Clean up the scratch columns
        delete po.c_contact_name;
        delete po.c_company;
        delete po.c_email;
        delete po.c_phone;
        delete po.vendor_name;
      }
      return ok(pos);
    } catch (err) { return serverError(err); }
  },
});

app.http('purchaseOrdersCreate', {
  methods: ['POST'], authLevel: 'anonymous', route: 'purchase-orders',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const payload = requireAuth(req);
      if (!payload) return unauthorized();
      const rawBody = await parseBody(req);
      const { items, ...poRaw } = rawBody;
      const pre = preprocessBody('purchase_orders', poRaw);
      if (pre.error) return badRequest(pre.error);
      const poData = pre.body;
      const id = poData.id || uuidv4();
      poData.id = id;
      poData.created_by = poData.created_by || payload.userId;
      const insert = buildInsert('purchase_orders', poData);
      await execute(insert.sql, insert.params);
      if (Array.isArray(items)) {
        for (const raw of items) {
          const item = { ...raw, id: raw.id || uuidv4(), purchase_order_id: id };
          const ins = buildInsert('purchase_order_items', item);
          await execute(ins.sql, ins.params);
        }
      }
      const row = await queryOne('SELECT * FROM purchase_orders WHERE id = @id', { id });
      return created(row);
    } catch (err: any) {
      if (err.message?.includes('No valid columns')) return badRequest(err.message);
      return serverError(err);
    }
  },
});

app.http('purchaseOrdersGetById', {
  methods: ['GET'], authLevel: 'anonymous', route: 'purchase-orders/{id}',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      const po = await queryOne('SELECT * FROM purchase_orders WHERE id = @id', { id: req.params.id });
      if (!po) return notFound();
      po.purchase_order_items = await query(
        'SELECT * FROM purchase_order_items WHERE purchase_order_id = @id',
        { id: po.id }
      );
      return ok(po);
    } catch (err) { return serverError(err); }
  },
});

app.http('purchaseOrdersUpdate', {
  methods: ['PATCH'], authLevel: 'anonymous', route: 'purchase-orders/{id}',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      const id = req.params.id;
      const { items, ...body } = await parseBody(req);
      if (Object.keys(body).length) {
        const upd = buildUpdate('purchase_orders', body, id);
        await execute(upd.sql, upd.params);
      }
      const row = await queryOne('SELECT * FROM purchase_orders WHERE id = @id', { id });
      return ok(row);
    } catch (err: any) {
      if (err.message?.includes('Nothing to update')) return badRequest(err.message);
      return serverError(err);
    }
  },
});

app.http('purchaseOrdersDelete', {
  methods: ['DELETE'], authLevel: 'anonymous', route: 'purchase-orders/{id}',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      await execute('DELETE FROM purchase_order_items WHERE purchase_order_id = @id', { id: req.params.id });
      await execute('DELETE FROM purchase_orders WHERE id = @id', { id: req.params.id });
      return noContent();
    } catch (err) { return serverError(err); }
  },
});