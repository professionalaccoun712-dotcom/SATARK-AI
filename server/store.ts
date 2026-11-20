import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AlertRecord, TrustedContact, UserProfile } from '../src/types.ts';

interface StoredUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

interface DatabaseState {
  users: StoredUser[];
  alertsByOwner: Record<string, AlertRecord[]>;
  contactsByOwner: Record<string, TrustedContact[]>;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'satark-db.json');
const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  createHmac('sha256', 'satark-local-session-seed')
    .update(process.cwd())
    .digest('hex');

const DEFAULT_STATE: DatabaseState = {
  users: [],
  alertsByOwner: {},
  contactsByOwner: {},
};

function ensureDb(): DatabaseState {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_STATE, null, 2), 'utf8');
      return { ...DEFAULT_STATE, alertsByOwner: {}, contactsByOwner: {} };
    }
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<DatabaseState>;
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      alertsByOwner: parsed.alertsByOwner && typeof parsed.alertsByOwner === 'object' ? parsed.alertsByOwner : {},
      contactsByOwner: parsed.contactsByOwner && typeof parsed.contactsByOwner === 'object' ? parsed.contactsByOwner : {},
    };
  } catch {
    return { users: [], alertsByOwner: {}, contactsByOwner: {} };
  }
}

function saveDb(state: DatabaseState): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmpFile, DB_FILE);
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, key] = storedHash.split(':');
  if (!salt || !key) return false;
  const derived = scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(key, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return timingSafeEqual(derived, keyBuf);
}

export function createSessionToken(userId: string): string {
  const exp = Date.now() + 1000 * 60 * 60 * 24 * 14; // 14 days
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp })).toString('base64url');
  const sig = createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expectedSig = createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      uid?: string;
      exp?: number;
    };
    if (!decoded.uid || !decoded.exp || decoded.exp < Date.now()) return null;
    return decoded.uid;
  } catch {
    return null;
  }
}

export function signupUser(name: string, email: string, password: string): UserProfile {
  const db = ensureDb();
  const normalizedEmail = email.trim().toLowerCase();
  if (db.users.some((u) => u.email === normalizedEmail)) {
    throw new Error('An account with this email already exists.');
  }
  const id = `usr_${randomBytes(8).toString('hex')}`;
  const stored: StoredUser = {
    id,
    name: name.trim(),
    email: normalizedEmail,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
  };
  db.users.push(stored);
  saveDb(db);
  return { id: stored.id, name: stored.name, email: stored.email };
}

export function loginUser(email: string, password: string): UserProfile {
  const db = ensureDb();
  const normalizedEmail = email.trim().toLowerCase();
  const user = db.users.find((u) => u.email === normalizedEmail);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw new Error('Invalid email or password.');
  }
  return { id: user.id, name: user.name, email: user.email };
}

export function getUserById(userId: string): UserProfile | null {
  const db = ensureDb();
  const user = db.users.find((u) => u.id === userId);
  return user ? { id: user.id, name: user.name, email: user.email } : null;
}

export function listAlerts(ownerId: string): AlertRecord[] {
  const db = ensureDb();
  const items = db.alertsByOwner[ownerId] || [];
  return [...items].sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1)).slice(0, 100);
}

export function addAlert(ownerId: string, alert: AlertRecord): AlertRecord {
  const db = ensureDb();
  const existing = db.alertsByOwner[ownerId] || [];
  db.alertsByOwner[ownerId] = [alert, ...existing].slice(0, 100);
  saveDb(db);
  return alert;
}

export function closeAlert(ownerId: string, alertId: string): AlertRecord | null {
  const db = ensureDb();
  const items = db.alertsByOwner[ownerId] || [];
  const found = items.find((a) => a.id === alertId);
  if (!found) return null;
  found.closed = true;
  saveDb(db);
  return found;
}

export function deleteAlert(ownerId: string, alertId: string): boolean {
  const db = ensureDb();
  const items = db.alertsByOwner[ownerId] || [];
  const next = items.filter((a) => a.id !== alertId);
  if (next.length === items.length) return false;
  db.alertsByOwner[ownerId] = next;
  saveDb(db);
  return true;
}

export function listContacts(ownerId: string): TrustedContact[] {
  const db = ensureDb();
  return db.contactsByOwner[ownerId] || [];
}

export function addContact(
  ownerId: string,
  input: { name: string; phone: string; relationship: string }
): TrustedContact {
  const db = ensureDb();
  const existing = db.contactsByOwner[ownerId] || [];
  const contact: TrustedContact = {
    id: `cnt_${randomBytes(6).toString('hex')}`,
    name: input.name.trim(),
    phone: input.phone.trim(),
    relationship: input.relationship.trim() || 'Trusted contact',
    createdAt: new Date().toISOString(),
  };
  db.contactsByOwner[ownerId] = [contact, ...existing].slice(0, 20);
  saveDb(db);
  return contact;
}

export function deleteContact(ownerId: string, contactId: string): boolean {
  const db = ensureDb();
  const existing = db.contactsByOwner[ownerId] || [];
  const next = existing.filter((c) => c.id !== contactId);
  if (next.length === existing.length) return false;
  db.contactsByOwner[ownerId] = next;
  saveDb(db);
  return true;
}
