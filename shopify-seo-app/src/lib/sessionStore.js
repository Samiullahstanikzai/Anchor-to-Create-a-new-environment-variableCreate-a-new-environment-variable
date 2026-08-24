import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../config.js";

/**
 * Tiny JSON-file backed session store keyed by shop domain.
 *
 * This intentionally has no external dependencies so the app runs anywhere
 * Node.js runs. For real production traffic across multiple app instances,
 * swap this out for a real database (Postgres, Redis, etc.) — every call in
 * this module is `async` for exactly that reason, so the rest of the app
 * doesn't need to change.
 */
export class SessionStore {
  constructor(path = config.sessionDbPath) {
    this.path = path;
    this._cache = null;
  }

  _load() {
    if (this._cache) return this._cache;
    if (!existsSync(this.path)) {
      this._cache = {};
      return this._cache;
    }
    try {
      this._cache = JSON.parse(readFileSync(this.path, "utf8"));
    } catch {
      this._cache = {};
    }
    return this._cache;
  }

  _persist() {
    const dir = dirname(this.path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.path, JSON.stringify(this._cache, null, 2));
  }

  async storeSession(shop, session) {
    const all = this._load();
    all[shop] = { ...all[shop], ...session, shop, updatedAt: new Date().toISOString() };
    this._persist();
    return all[shop];
  }

  async loadSession(shop) {
    const all = this._load();
    return all[shop] ?? null;
  }

  async deleteSession(shop) {
    const all = this._load();
    delete all[shop];
    this._persist();
  }

  async listSessions() {
    return Object.values(this._load());
  }
}

export const sessionStore = new SessionStore();
