import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { query, queryOne, execute, getPool, sql } from '../db';
import {
  ok, created, noContent, badRequest, unauthorized, notFound,
  serverError, corsResponse, parseBody, requireAuth,
  buildInsert, buildUpdate,
} from '../helpers';
import { v4 as uuidv4 } from 'uuid';

app.http('ticketsOptions',  { methods: ['OPTIONS'], authLevel: 'anonymous', route: 'tickets/{*rest}',  handler: async () => corsResponse() });
app.http('messagesOptions', { methods: ['OPTIONS'], authLevel: 'anonymous', route: 'messages/{*rest}', handler: async () => corsResponse() });

// ═══════════════════════════════════════════════════════════════════════════
// GUID-safe query helpers. The `mssql` driver otherwise sends JS strings as
// nvarchar, and SQL Server's implicit nvarchar->uniqueidentifier conversion
// has been throwing 500s on the /messages/* endpoints.
// ═══════════════════════════════════════════════════════════════════════════
async function queryWithGuid<T = any>(qs: string, guid: Record<string,string>, other: Record<string,any> = {}): Promise<T[]> {
  const p = await getPool();
  const r = p.request();
  for (const [k,v] of Object.entries(guid))  r.input(k, sql.UniqueIdentifier, v);
  for (const [k,v] of Object.entries(other)) r.input(k, v);
  return (await r.query(qs)).recordset as T[];
}
async function queryOneWithGuid<T = any>(qs: string, guid: Record<string,string>, other: Record<string,any> = {}): Promise<T|null> {
  const rs = await queryWithGuid<T>(qs, guid, other);
  return rs[0] ?? null;
}
async function executeWithGuid(qs: string, guid: Record<string,string>, other: Record<string,any> = {}): Promise<void> {
  const p = await getPool();
  const r = p.request();
  for (const [k,v] of Object.entries(guid))  r.input(k, sql.UniqueIdentifier, v);
  for (const [k,v] of Object.entries(other)) r.input(k, v);
  await r.query(qs);
}

// ═══════════════════════════════════════════════════════════════════════════
// TICKETS — specific routes first
// ═══════════════════════════════════════════════════════════════════════════
app.http('ticketsByDevice', {
  methods: ['GET'], authLevel: 'anonymous', route: 'tickets/device/{deviceId}',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      return ok(await queryWithGuid(
        'SELECT * FROM tickets WHERE device_id = @deviceId ORDER BY created_at DESC',
        { deviceId: req.params.deviceId }
      ));
    } catch (err) { return serverError(err); }
  },
});

app.http('ticketsByCustomer', {
  methods: ['GET'], authLevel: 'anonymous', route: 'tickets/customer/{customerId}',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      return ok(await queryWithGuid(
        'SELECT * FROM tickets WHERE customer_id = @customerId ORDER BY created_at DESC',
        { customerId: req.params.customerId }
      ));
    } catch (err) { return serverError(err); }
  },
});

app.http('ticketsGetMessages', {
  methods: ['GET'], authLevel: 'anonymous', route: 'tickets/{ticketId}/messages',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      return ok(await queryWithGuid(
        `SELECT tm.*, u.name as sender_name
         FROM ticket_messages tm
         LEFT JOIN users u ON u.id = tm.user_id
         WHERE tm.ticket_id = @ticketId
         ORDER BY tm.created_at ASC`,
        { ticketId: req.params.ticketId }
      ));
    } catch (err) { return serverError(err); }
  },
});

app.http('ticketsSendMessage', {
  methods: ['POST'], authLevel: 'anonymous', route: 'tickets/{ticketId}/messages',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const payload = requireAuth(req);
      if (!payload) return unauthorized();
      const { content } = await parseBody(req);
      if (!content) return badRequest('content required');
      const id = uuidv4();
      await executeWithGuid(
        `INSERT INTO ticket_messages (id, ticket_id, user_id, content)
         VALUES (@id, @ticketId, @userId, @content)`,
        { id, ticketId: req.params.ticketId, userId: payload.userId },
        { content }
      );
      return created(await queryOneWithGuid(
        'SELECT * FROM ticket_messages WHERE id = @id',
        { id }
      ));
    } catch (err) { return serverError(err); }
  },
});

app.http('ticketsClose', {
  methods: ['PATCH'], authLevel: 'anonymous', route: 'tickets/{id}/close',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      await executeWithGuid(
        `UPDATE tickets SET status = 'closed', closed_at = SYSUTCDATETIME(),
         updated_at = SYSUTCDATETIME() WHERE id = @id`,
        { id: req.params.id }
      );
      return ok(await queryOneWithGuid(
        'SELECT * FROM tickets WHERE id = @id',
        { id: req.params.id }
      ));
    } catch (err) { return serverError(err); }
  },
});

// ─── TICKETS — generic CRUD ─────────────────────────────────────────────────
app.http('ticketsGetAll', {
  methods: ['GET'], authLevel: 'anonymous', route: 'tickets',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      return ok(await query(
        `SELECT t.*, d.serial_number as device_serial_number, c.customer_company as customer_name
         FROM tickets t
         LEFT JOIN devices d   ON d.id = t.device_id
         LEFT JOIN customers c ON c.id = t.customer_id
         ORDER BY t.created_at DESC`
      ));
    } catch (err) { return serverError(err); }
  },
});

app.http('ticketsCreate', {
  methods: ['POST'], authLevel: 'anonymous', route: 'tickets',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const payload = requireAuth(req);
      if (!payload) return unauthorized();
      const body = await parseBody(req);
      body.id = body.id || uuidv4();
      body.created_by = body.created_by || payload.userId;
      const { sql: s, params } = buildInsert('tickets', body);
      await execute(s, params);
      const row = await queryOne('SELECT * FROM tickets WHERE id = @id', { id: body.id });
      return created(row);
    } catch (err: any) {
      if (err.message?.includes('No valid columns')) return badRequest(err.message);
      return serverError(err);
    }
  },
});

app.http('ticketsGetById', {
  methods: ['GET'], authLevel: 'anonymous', route: 'tickets/{id}',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      const row = await queryOneWithGuid('SELECT * FROM tickets WHERE id = @id', { id: req.params.id });
      if (!row) return notFound();
      return ok(row);
    } catch (err) { return serverError(err); }
  },
});

app.http('ticketsUpdate', {
  methods: ['PATCH'], authLevel: 'anonymous', route: 'tickets/{id}',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      const id = req.params.id;
      const body = await parseBody(req);
      const { sql: s, params } = buildUpdate('tickets', body, id);
      await execute(s, params);
      const row = await queryOne('SELECT * FROM tickets WHERE id = @id', { id });
      return ok(row);
    } catch (err: any) {
      if (err.message?.includes('Nothing to update')) return badRequest(err.message);
      return serverError(err);
    }
  },
});

app.http('ticketsDelete', {
  methods: ['DELETE'], authLevel: 'anonymous', route: 'tickets/{id}',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      await executeWithGuid('DELETE FROM ticket_messages WHERE ticket_id = @id', { id: req.params.id });
      await executeWithGuid('DELETE FROM tickets WHERE id = @id', { id: req.params.id });
      return noContent();
    } catch (err) { return serverError(err); }
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGES — specific routes FIRST, parametric routes LAST
// ═══════════════════════════════════════════════════════════════════════════
app.http('messagesGetConversations', {
  methods: ['GET'], authLevel: 'anonymous', route: 'messages/conversations',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const payload = requireAuth(req);
      if (!payload) return unauthorized();
      const msgs = await queryWithGuid<{ other_user_id: string }>(
        `SELECT DISTINCT
           CASE WHEN sender_id = @uid THEN recipient_id ELSE sender_id END as other_user_id
         FROM messages
         WHERE sender_id = @uid OR recipient_id = @uid`,
        { uid: payload.userId }
      );
      const result = [];
      for (const m of msgs) {
        const user = await queryOneWithGuid(
          'SELECT id, name, email, profile_picture_url FROM users WHERE id = @id',
          { id: m.other_user_id }
        );
        const lastMsg = await queryOneWithGuid(
          `SELECT TOP 1 * FROM messages
           WHERE (sender_id = @uid AND recipient_id = @oid)
              OR (sender_id = @oid AND recipient_id = @uid)
           ORDER BY created_at DESC`,
          { uid: payload.userId, oid: m.other_user_id }
        );
        const unread = await queryOneWithGuid<{cnt:number}>(
          `SELECT COUNT(*) as cnt FROM messages
           WHERE sender_id = @oid AND recipient_id = @uid AND is_read = 0`,
          { oid: m.other_user_id, uid: payload.userId }
        );
        result.push({ user, lastMessage: lastMsg, unreadCount: unread?.cnt || 0 });
      }
      return ok(result);
    } catch (err) { return serverError(err); }
  },
});

app.http('messagesUnreadCount', {
  methods: ['GET'], authLevel: 'anonymous', route: 'messages/unread-count',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const payload = requireAuth(req);
      if (!payload) return unauthorized();
      const row = await queryOneWithGuid<{count:number}>(
        'SELECT COUNT(*) as count FROM messages WHERE recipient_id = @uid AND is_read = 0',
        { uid: payload.userId }
      );
      return ok({ count: row?.count || 0 });
    } catch (err) { return serverError(err); }
  },
});

app.http('messagesMarkRead', {
  methods: ['POST'], authLevel: 'anonymous', route: 'messages/read',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      const { messageIds } = await parseBody(req);
      for (const mid of (messageIds || [])) {
        await executeWithGuid('UPDATE messages SET is_read = 1 WHERE id = @id', { id: mid });
      }
      return noContent();
    } catch (err) { return serverError(err); }
  },
});

app.http('messagesSend', {
  methods: ['POST'], authLevel: 'anonymous', route: 'messages',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const payload = requireAuth(req);
      if (!payload) return unauthorized();
      const { recipient_id, content, media_url } = await parseBody(req);
      if (!recipient_id) return badRequest('recipient_id required');
      if (!content)      return badRequest('content required');
      const id = uuidv4();
      await executeWithGuid(
        `INSERT INTO messages (id, sender_id, recipient_id, content, media_url)
         VALUES (@id, @senderId, @recipientId, @content, @mediaUrl)`,
        { id, senderId: payload.userId, recipientId: recipient_id },
        { content, mediaUrl: media_url || null }
      );
      return created(await queryOneWithGuid('SELECT * FROM messages WHERE id = @id', { id }));
    } catch (err) { return serverError(err); }
  },
});

// Parametric routes LAST
app.http('messagesGetThread', {
  methods: ['GET'], authLevel: 'anonymous', route: 'messages/{userId}',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const payload = requireAuth(req);
      if (!payload) return unauthorized();
      const rows = await queryWithGuid(
        `SELECT * FROM messages
         WHERE (sender_id = @uid AND recipient_id = @oid)
            OR (sender_id = @oid AND recipient_id = @uid)
         ORDER BY created_at ASC`,
        { uid: payload.userId, oid: req.params.userId }
      );
      return ok(rows);
    } catch (err) { return serverError(err); }
  },
});

app.http('messagesDelete', {
  methods: ['DELETE'], authLevel: 'anonymous', route: 'messages/{id}',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      if (!requireAuth(req)) return unauthorized();
      await executeWithGuid('DELETE FROM messages WHERE id = @id', { id: req.params.id });
      return noContent();
    } catch (err) { return serverError(err); }
  },
});