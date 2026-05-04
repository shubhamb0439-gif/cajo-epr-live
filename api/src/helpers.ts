import { HttpRequest, HttpResponseInit } from '@azure/functions';
import { getTokenFromRequest, TokenPayload } from './auth';

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*')
  .split(',').map(s => s.trim()).filter(Boolean);

function resolveOrigin(req?: HttpRequest): string {
  if (ALLOWED_ORIGINS.length === 1 && ALLOWED_ORIGINS[0] === '*') return '*';
  const reqOrigin =
    (req?.headers && typeof (req.headers as any).get === 'function'
      ? (req.headers as any).get('origin')
      : (req?.headers as any)?.origin) || '';
  return ALLOWED_ORIGINS.includes(reqOrigin) ? reqOrigin : ALLOWED_ORIGINS[0];
}

export function corsHeaders(req?: HttpRequest): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': resolveOrigin(req),
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-functions-key',
    'Vary': 'Origin',
  };
}
export function corsResponse(req?: HttpRequest): HttpResponseInit { return { status: 204, headers: corsHeaders(req) }; }
export function ok(data: any, req?: HttpRequest): HttpResponseInit { return { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders(req) }, body: JSON.stringify(data) }; }
export function created(data: any, req?: HttpRequest): HttpResponseInit { return { status: 201, headers: { 'Content-Type': 'application/json', ...corsHeaders(req) }, body: JSON.stringify(data) }; }
export function noContent(req?: HttpRequest): HttpResponseInit { return { status: 204, headers: corsHeaders(req) }; }
export function badRequest(message: string, req?: HttpRequest): HttpResponseInit { return { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders(req) }, body: JSON.stringify({ message }) }; }
export function unauthorized(message = 'Unauthorized', req?: HttpRequest): HttpResponseInit { return { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders(req) }, body: JSON.stringify({ message }) }; }
export function forbidden(message = 'Forbidden', req?: HttpRequest): HttpResponseInit { return { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders(req) }, body: JSON.stringify({ message }) }; }
export function notFound(message = 'Not found', req?: HttpRequest): HttpResponseInit { return { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders(req) }, body: JSON.stringify({ message }) }; }
export function serverError(err: any, req?: HttpRequest): HttpResponseInit { console.error(err); return { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders(req) }, body: JSON.stringify({ message: 'Internal server error', detail: String(err) }) }; }

export function requireAuth(req: HttpRequest): TokenPayload | null {
  return getTokenFromRequest(req);
}

export async function parseBody(req: HttpRequest): Promise<any> {
  try {
    const text = await req.text();
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SCHEMA ALLOW-LISTS
//
// Every write handler must pass the request body through `sanitizeInsert`
// or `sanitizeUpdate` before building SQL. Unknown columns are silently
// dropped; known aliases are rewritten to the real DB column name.
// ═══════════════════════════════════════════════════════════════════════════

export interface TableSchema {
  /** Columns that can actually be written (i.e. exist in the DB). */
  columns: string[];
  /** Frontend-name -> DB-name mapping for legacy/mismatched field names. */
  aliases?: Record<string, string>;
  /** Columns to drop at the allow-list stage even if the frontend sends them
   *  (e.g. audit columns the DB manages itself). */
  readonly?: string[];
}

// Per-table schemas. Derived from INFORMATION_SCHEMA.COLUMNS on 2026-04.
// Only include columns the app should ever write; computed/default columns
// like `id`, `created_at`, `updated_at` are handled by SQL Server defaults.
export const SCHEMAS: Record<string, TableSchema> = {
  users: {
    columns: ['id','auth_user_id','email','name','role','user_rights','enabled','profile_picture_url','customer_id','password_hash'],
    readonly: ['created_at','updated_at','refresh_token','last_sign_in'],
  },
  vendors: {
    columns: ['id','vendor_name','email','phone','address','contact_name','rating','rating_count','rating_average','notes','vendor_group','vendor_currency','created_by','updated_by'],
    readonly: ['created_at','updated_at'],
  },
  customers: {
    columns: ['id','customer_company','contact_name','email','phone','address','notes','status'],
    aliases: {
      customer_name:   'contact_name',
      customer_email:  'email',
      customer_phone:  'phone',
      customer_notes:  'notes',
      customer_status: 'status',
      // customer_position, customer_source, customer_value,
      // assigned_to don't exist as columns -> silently dropped
    },
    readonly: ['created_at','updated_at','customer_position','customer_source','customer_value','assigned_to'],
  },
  leads: {
    columns: ['id','company_name','contact_name','email','phone','source','status','industry','notes','assigned_to'],
    // Frontend uses lead_* prefixed field names (legacy Supabase schema).
    // lead_name -> contact_name (person), lead_company -> company_name (which is NOT NULL).
    // lead_position maps to industry for now (closest column we have), and
    // lead_value has no home in this table -> dropped.
    aliases: {
      lead_name: 'contact_name',
      lead_email: 'email',
      lead_phone: 'phone',
      lead_company: 'company_name',
      lead_position: 'industry',
      lead_status: 'status',
      lead_source: 'source',
      lead_notes: 'notes',
    },
    readonly: ['created_at','updated_at','lead_value'],
  },
  prospects: {
    columns: ['id','company_name','contact_name','email','phone','status','notes','lead_id','assigned_to'],
    aliases: {
      prospect_name: 'contact_name',
      prospect_email: 'email',
      prospect_phone: 'phone',
      prospect_company: 'company_name',
      prospect_status: 'status',
      prospect_notes: 'notes',
      // prospect_position, prospect_source, prospect_value have no column -> dropped
    },
    readonly: ['created_at','updated_at','prospect_position','prospect_source','prospect_value'],
  },
  devices: {
    columns: ['id','name','serial_number','model','customer_id','status','last_seen','uptime_seconds','notes'],
    aliases: { device_serial_number: 'serial_number', device_name: 'name', device_model: 'model', status_note: 'notes' },
    readonly: ['created_at','updated_at'],
  },
  inventory_items: {
    columns: ['id','item_name','description','item_id','item_group','item_unit','item_stock_current','item_stock_reorder','item_cost_average','item_stock_sold','is_finished_product','vendor_id','item_display_name','item_class','item_stock_min','item_stock_max','item_cost_min','item_cost_max','item_serial_number_tracked','item_lead_time_average','created_by','updated_by'],
    readonly: ['created_at','updated_at'],
  },
  boms: {
    columns: ['id','name','description','finished_product_id','output_quantity'],
    // Frontend sends bom_name and bom_item_id; map both.
    aliases: { bom_name: 'name', bom_description: 'description', bom_item_id: 'finished_product_id' },
    // `created_by` is on the frontend body but has no column here.
    readonly: ['created_at','updated_at','created_by'],
  },
  bom_components: {
    columns: ['id','bom_id','inventory_item_id','quantity_required'],
    // Frontend sends `quantity` and `item_id` OR the longer `bom_component_*` forms.
    aliases: {
      quantity: 'quantity_required',
      item_id: 'inventory_item_id',
      bom_component_quantity: 'quantity_required',
      bom_component_item_id: 'inventory_item_id',
    },
    readonly: ['created_at','created_by'],
  },
  sales: {
    columns: ['id','customer_id','order_number','status','total_amount','discount','tax','notes','created_by'],
    aliases: { sale_number: 'order_number' },
    readonly: ['created_at','updated_at','sale_date'],
  },
  sale_items: {
    columns: ['id','sale_id','inventory_item_id','assembly_unit_id','quantity','unit_price'],
    // Frontend sends `item_id` meaning the inventory item id.
    aliases: { item_id: 'inventory_item_id' },
    readonly: ['created_at'],
  },
  deliveries: {
    columns: ['id','sale_id','status','delivery_date','tracking_number','notes','created_by'],
    aliases: { delivered_date: 'delivery_date' },
    readonly: ['created_at','updated_at','delivered'],
  },
  delivery_items: {
    columns: ['id','delivery_id','sale_item_id','quantity_delivered'],
    aliases: { quantity: 'quantity_delivered', item_id: 'sale_item_id' },
    readonly: ['created_at'],
  },
  purchases: {
    columns: ['id','vendor_id','po_reference','status','notes','total_amount','created_by'],
    // Frontend sends `purchase_vendor_id`, `purchase_po_number`, `purchase_date`.
    aliases: {
      purchase_vendor_id: 'vendor_id',
      purchase_po_number: 'po_reference',
    },
    // `purchase_date` is not stored — `created_at` serves as the date.
    readonly: ['created_at','updated_at','purchase_date'],
  },
  purchase_items: {
    columns: ['id','purchase_id','inventory_item_id','quantity_ordered','quantity_received','remaining_quantity','unit_cost','vendor_item_code','lead_time_days'],
    // Frontend sends `item_id` (inventory item id), `quantity`, `lead_time`.
    aliases: {
      item_id: 'inventory_item_id',
      quantity: 'quantity_ordered',
      lead_time: 'lead_time_days',
    },
    readonly: ['created_at'],
  },
  purchase_orders: {
    columns: ['id','po_number','vendor_id','customer_id','status','expected_date','delivery_date','payment_terms','po_value','notes','total_amount','created_by'],
    readonly: ['created_at','updated_at'],
  },
  purchase_order_items: {
    columns: ['id','purchase_order_id','inventory_item_id','bom_id','quantity','unit_cost','unit_price'],
    aliases: { item_id: 'inventory_item_id' },
    readonly: ['created_at'],
  },
  tickets: {
    columns: ['id','title','description','status','priority','device_id','customer_id','created_by','assigned_to','issue_type_id','closed_at'],
    readonly: ['created_at','updated_at'],
  },
  ticket_messages: {
    columns: ['id','ticket_id','user_id','content'],
    aliases: { sender_id: 'user_id' },
    readonly: ['created_at'],
  },
  messages: {
    columns: ['id','sender_id','recipient_id','content','media_url','is_read'],
    readonly: ['created_at'],
  },
  system_requests: {
    columns: ['id','user_id','title','description','status','priority','admin_notes'],
    readonly: ['created_at','updated_at'],
  },
  dropdown_values: {
    columns: ['id','drop_type','drop_value','sort_order'],
    readonly: ['created_at'],
  },
  assembly_files: {
    columns: ['id','assembly_id','file_name','file_url','file_size','file_type','uploaded_by'],
    readonly: ['created_at'],
  },
  foreign_exchange_rates: {
    columns: ['id','currency_code','currency_name','inr_per_unit','updated_by'],
    readonly: ['updated_at'],
  },
};

/**
 * Take a raw request body, map alias keys to DB column names, and drop
 * anything that isn't in the allow-list. Returns a safe object to use as
 * SQL parameters.
 */
export function sanitize(table: string, body: Record<string, any>, forUpdate = false): Record<string, any> {
  const schema = SCHEMAS[table];
  if (!schema) throw new Error(`No schema registered for table '${table}'`);

  const result: Record<string, any> = {};
  const allowed = new Set(schema.columns);
  const aliases = schema.aliases || {};

  for (const [key, value] of Object.entries(body)) {
    if (value === undefined) continue;
    const dbCol = aliases[key] || key;
    if (forUpdate && dbCol === 'id') continue;          // never update id
    if (allowed.has(dbCol)) result[dbCol] = value;
    // else silently drop
  }
  return result;
}

/**
 * Build an INSERT statement and its parameter map from a sanitized body.
 * Throws if nothing is left after sanitization.
 */
export function buildInsert(
  table: string,
  body: Record<string, any>
): { sql: string; params: Record<string, any> } {
  const safe = sanitize(table, body, false);
  const cols = Object.keys(safe);
  if (cols.length === 0) throw new Error(`No valid columns provided for ${table}`);
  return {
    sql: `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(c => `@${c}`).join(', ')})`,
    params: safe,
  };
}

/**
 * Build an UPDATE statement for a given row id. Uses @id for the WHERE.
 * Throws if nothing would be updated.
 */
export function buildUpdate(
  table: string,
  body: Record<string, any>,
  id: string
): { sql: string; params: Record<string, any> } {
  const safe = sanitize(table, body, true);
  const cols = Object.keys(safe);
  if (cols.length === 0) throw new Error(`Nothing to update for ${table}`);
  const sets = cols.map(c => `${c} = @${c}`).join(', ');
  const hasUpdatedAt = SCHEMAS[table].readonly?.includes('updated_at');
  const setUpdatedAt = hasUpdatedAt ? ', updated_at = SYSUTCDATETIME()' : '';
  return {
    sql: `UPDATE ${table} SET ${sets}${setUpdatedAt} WHERE id = @id`,
    params: { ...safe, id },
  };
}

/**
 * Per-table preprocessing for legacy frontend quirks.
 *
 * - Normalizes empty-string values to null so GUID columns don't receive ''
 * - Fills in NOT-NULL columns from related fields (e.g. leads.company_name
 *   from lead_name when the frontend didn't provide a company)
 * - Returns a friendly error for missing required fields so the user sees a
 *   400 "Vendor is required" instead of a 500 SQL constraint error
 */
export function preprocessBody(
  table: string,
  body: Record<string, any>
): { body: Record<string, any>; error?: string } {
  const b = { ...body };

  // Normalize empty strings to null. Stops '' from being sent as a GUID.
  for (const k of Object.keys(b)) {
    if (typeof b[k] === 'string' && b[k].trim() === '') b[k] = null;
  }

  // For leads/prospects, assigned_to is an FK to users.id. If the frontend
  // somehow sends a string that isn't a valid GUID (or empty), null it out
  // so the INSERT doesn't fail the FK constraint.
  if ((table === 'leads' || table === 'prospects') && b.assigned_to) {
    const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!GUID_RE.test(String(b.assigned_to))) {
      b.assigned_to = null;
    }
  }

  if (table === 'leads' || table === 'prospects') {
    const companyKey = table === 'leads' ? 'lead_company' : 'prospect_company';
    const nameKey    = table === 'leads' ? 'lead_name'    : 'prospect_name';
    if (b[companyKey] === null || b[companyKey] === undefined) {
      b[companyKey] = b[nameKey] || 'Unknown';
    }
    if (!b[nameKey] && !b[companyKey]) {
      return { body: b, error: `${table === 'leads' ? 'Lead' : 'Prospect'} name or company is required` };
    }
  }

  if (table === 'customers') {
    // customer_company is NOT NULL in the DB. If the frontend left it blank,
    // fall back to customer_name (the contact name).
    if (!b.customer_company) {
      b.customer_company = b.customer_name || 'Unknown';
    }
    if (!b.customer_name && !b.customer_company) {
      return { body: b, error: 'Customer name or company is required' };
    }
  }

  if (table === 'purchases') {
    if (!b.purchase_vendor_id && !b.vendor_id) {
      return { body: b, error: 'Vendor is required. Please select a vendor before creating a purchase.' };
    }
  }

  if (table === 'purchase_orders') {
    // A PO needs either a vendor (you buying) OR a customer (customer buying from you).
    if (!b.vendor_id && !b.customer_id) {
      return { body: b, error: 'Either a vendor or a customer is required for a purchase order' };
    }
    if (!b.po_number) {
      return { body: b, error: 'PO number is required' };
    }
  }

  if (table === 'boms') {
    if (!b.bom_item_id && !b.finished_product_id) {
      return { body: b, error: 'Finished Good is required. Make sure to create a Component/Product inventory item first, then select it from the dropdown.' };
    }
    if (!b.bom_name && !b.name) {
      return { body: b, error: 'BOM name is required' };
    }
  }

  if (table === 'bom_components') {
    if (!b.bom_component_item_id && !b.item_id && !b.inventory_item_id) {
      return { body: b, error: 'Component item is required' };
    }
    if (!b.bom_id) {
      return { body: b, error: 'BOM id is required' };
    }
  }

  if (table === 'sales' && !b.customer_id) {
    return { body: b, error: 'Customer is required for a sale' };
  }

  if (table === 'deliveries' && !b.sale_id) {
    return { body: b, error: 'Sale id is required for a delivery' };
  }

  if (table === 'tickets' && !b.title) {
    return { body: b, error: 'Ticket title is required' };
  }

  return { body: b };
}