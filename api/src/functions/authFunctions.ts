import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { signIn, refreshSession, hashPassword, comparePassword, getTokenFromRequest } from '../auth';
import { queryOne, execute } from '../db';
import { ok, badRequest, unauthorized, serverError, corsResponse, parseBody, created } from '../helpers';
import { v4 as uuidv4 } from 'uuid';

app.http('authOptions', { methods: ['OPTIONS'], authLevel: 'anonymous', route: 'auth/{*action}', handler: async () => corsResponse() });

app.http('authSignIn', {
  methods: ['POST'], authLevel: 'anonymous', route: 'auth/sign-in',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const { email, password } = await parseBody(req);
      if (!email || !password) return badRequest('Email and password required');
      const result = await signIn(email, password);
      if ((result as any).error) return unauthorized((result as any).error);
      return ok(result);
    } catch (err) { return serverError(err); }
  },
});

app.http('authSignUp', {
  methods: ['POST'], authLevel: 'anonymous', route: 'auth/sign-up',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const { email, password, name } = await parseBody(req);
      if (!email || !password || !name) return badRequest('Email, password and name required');
      const existing = await queryOne('SELECT id FROM users WHERE email = @email', { email: email.toLowerCase() });
      if (existing) return badRequest('Email already registered');
      const hash = await hashPassword(password);
      const id = uuidv4(); const authUserId = uuidv4();
      await execute(`INSERT INTO users (id,auth_user_id,email,name,password_hash,role,user_rights,enabled) VALUES (@id,@authUserId,@email,@name,@hash,'user','read_write',0)`,
        { id, authUserId, email: email.toLowerCase(), name, hash });
      return created({ message: 'Account created. Awaiting administrator approval.' });
    } catch (err) { return serverError(err); }
  },
});

app.http('authSignOut', {
  methods: ['POST'], authLevel: 'anonymous', route: 'auth/sign-out',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const payload = getTokenFromRequest(req);
      if (payload) await execute('UPDATE users SET refresh_token = NULL WHERE id = @id', { id: payload.userId });
      return ok({ message: 'Signed out' });
    } catch (err) { return serverError(err); }
  },
});

app.http('authRefresh', {
  methods: ['POST'], authLevel: 'anonymous', route: 'auth/refresh',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const { refresh_token } = await parseBody(req);
      if (!refresh_token) return badRequest('Refresh token required');
      const result = await refreshSession(refresh_token);
      if ((result as any).error) return unauthorized((result as any).error);
      return ok(result);
    } catch (err) { return serverError(err); }
  },
});

app.http('authChangePassword', {
  methods: ['POST'], authLevel: 'anonymous', route: 'auth/change-password',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const payload = getTokenFromRequest(req);
      if (!payload) return unauthorized();
      const { currentPassword, newPassword } = await parseBody(req);
      const user = await queryOne('SELECT * FROM users WHERE id = @id', { id: payload.userId });
      if (!user) return unauthorized();
      const valid = await comparePassword(currentPassword, user.password_hash);
      if (!valid) return badRequest('Current password is incorrect');
      const newHash = await hashPassword(newPassword);
      await execute('UPDATE users SET password_hash = @hash, updated_at = SYSUTCDATETIME() WHERE id = @id', { hash: newHash, id: payload.userId });
      return ok({ message: 'Password changed successfully' });
    } catch (err) { return serverError(err); }
  },
});

app.http('authUpdateProfile', {
  methods: ['PATCH'], authLevel: 'anonymous', route: 'auth/profile',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const payload = getTokenFromRequest(req);
      if (!payload) return unauthorized();
      const updates = await parseBody(req);
      const allowed = ['name', 'profile_picture_url'];
      const sets = allowed.filter(k => updates[k] !== undefined).map(k => `${k} = @${k}`).join(', ');
      if (!sets) return badRequest('Nothing to update');
      const params: any = { id: payload.userId };
      allowed.forEach(k => { if (updates[k] !== undefined) params[k] = updates[k]; });
      await execute(`UPDATE users SET ${sets}, updated_at = SYSUTCDATETIME() WHERE id = @id`, params);
      const user = await queryOne('SELECT * FROM users WHERE id = @id', { id: payload.userId });
      const { password_hash, refresh_token, ...safeUser } = user;
      return ok(safeUser);
    } catch (err) { return serverError(err); }
  },
});
