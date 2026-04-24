import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, execute } from './db';

const JWT_SECRET = process.env.JWT_SECRET || 'cajo-erp-super-secret-jwt-key-2026-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// Parse JWT_EXPIRES_IN ("24h", "30m", "60s", "7d", or a raw number of seconds)
// into milliseconds so the token's actual lifetime matches what the client is told.
function parseExpiresInToMs(v: string): number {
  const m = String(v).trim().match(/^(\d+)\s*([smhd])?$/i);
  if (!m) return 24 * 60 * 60 * 1000; // sensible default
  const n = parseInt(m[1], 10);
  const unit = (m[2] || 's').toLowerCase();
  const mult = unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
  return n * mult;
}
const EXPIRES_IN_MS = parseExpiresInToMs(JWT_EXPIRES_IN);

export interface TokenPayload {
  userId: string;
  authUserId: string;
  email: string;
  role: string;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

/**
 * Extract and verify the JWT from an incoming request.
 *
 * IMPORTANT: in the Azure Functions v4 Node.js programming model,
 * `req.headers` is a Fetch-API `Headers` instance, not a plain object.
 * You MUST use `headers.get('authorization')` — `headers.authorization`
 * returns `undefined`. The dual-path below handles both shapes so the
 * code also works in unit tests that pass a plain object.
 */
export function getTokenFromRequest(req: any): TokenPayload | null {
  let auth = '';

  if (req && req.headers) {
    if (typeof req.headers.get === 'function') {
      // Azure Functions v4 / Fetch Headers
      auth = req.headers.get('authorization') || req.headers.get('Authorization') || '';
    } else {
      // Plain-object fallback (tests, older runtimes)
      auth = req.headers.authorization || req.headers.Authorization || '';
    }
  }

  if (!auth) return null;

  // Strip "Bearer " case-insensitively, trim surrounding whitespace.
  const token = auth.replace(/^\s*Bearer\s+/i, '').trim();
  if (!token) return null;

  return verifyToken(token);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function signIn(email: string, password: string) {
  const user = await queryOne(
    `SELECT * FROM users WHERE email = @email`,
    { email: email.toLowerCase().trim() }
  );

  if (!user) return { error: 'Invalid email or password' };
  if (!user.enabled) return { error: 'Account pending approval. Contact administrator.' };

  const valid = await comparePassword(password, user.password_hash);
  if (!valid) return { error: 'Invalid email or password' };

  const payload: TokenPayload = {
    userId: user.id,
    authUserId: user.auth_user_id,
    email: user.email,
    role: user.role,
  };

  const access_token = signToken(payload);
  const refresh_token = uuidv4();
  const expires_at = Date.now() + EXPIRES_IN_MS;

  await execute(
    `UPDATE users SET refresh_token = @refresh_token, last_sign_in = SYSUTCDATETIME() WHERE id = @id`,
    { refresh_token, id: user.id }
  );

  const { password_hash, refresh_token: _, ...safeUser } = user;

  return {
    access_token,
    refresh_token,
    expires_at,
    user: safeUser,
  };
}

export async function refreshSession(refresh_token: string) {
  const user = await queryOne(
    `SELECT * FROM users WHERE refresh_token = @refresh_token`,
    { refresh_token }
  );

  if (!user) return { error: 'Invalid refresh token' };
  if (!user.enabled) return { error: 'Account disabled' };

  const payload: TokenPayload = {
    userId: user.id,
    authUserId: user.auth_user_id,
    email: user.email,
    role: user.role,
  };

  const access_token = signToken(payload);
  const new_refresh_token = uuidv4();
  const expires_at = Date.now() + EXPIRES_IN_MS;

  await execute(
    `UPDATE users SET refresh_token = @new_refresh_token WHERE id = @id`,
    { new_refresh_token, id: user.id }
  );

  const { password_hash, refresh_token: _, ...safeUser } = user;

  return { access_token, refresh_token: new_refresh_token, expires_at, user: safeUser };
}