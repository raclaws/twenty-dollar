import { makeAutoObservable, runInAction } from 'mobx';
import { idbClearAll } from '@/sync/idb';

export interface AuthUser {
  email: string;
  name: string;
}

const LS_EMAIL_KEY = 'td_user_email';
const LS_NAME_KEY = 'td_user_name';

export class AuthStore {
  user: AuthUser | null = null;
  isLoading = true;
  error: string | null = null;

  constructor() {
    makeAutoObservable(this);
    this.restoreFromCache();
  }

  get isAuthenticated(): boolean {
    return this.user !== null;
  }

  private restoreFromCache() {
    const email = localStorage.getItem(LS_EMAIL_KEY);
    const name = localStorage.getItem(LS_NAME_KEY);
    if (email && name) {
      this.user = { email, name };
    }
    this.isLoading = false;
  }

  async login(email: string, password: string): Promise<boolean> {
    this.error = null;
    this.isLoading = true;
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Login failed' }));
        runInAction(() => {
          this.error = data.error || 'Invalid credentials';
          this.isLoading = false;
        });
        return false;
      }

      const data = await res.json();
      runInAction(() => {
        this.user = { email: data.email, name: data.name };
        localStorage.setItem(LS_EMAIL_KEY, data.email);
        localStorage.setItem(LS_NAME_KEY, data.name);
        this.isLoading = false;
      });
      return true;
    } catch {
      runInAction(() => {
        this.error = 'Network error';
        this.isLoading = false;
      });
      return false;
    }
  }

  async logout(): Promise<void> {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // proceed even if request fails
    }
    await idbClearAll();
    localStorage.removeItem(LS_EMAIL_KEY);
    localStorage.removeItem(LS_NAME_KEY);
    runInAction(() => {
      this.user = null;
    });
  }

  async checkSession(): Promise<boolean> {
    try {
      const res = await fetch('/api/auth/me', {
        credentials: 'include',
      });
      if (!res.ok) {
        runInAction(() => {
          this.user = null;
          localStorage.removeItem(LS_EMAIL_KEY);
          localStorage.removeItem(LS_NAME_KEY);
        });
        return false;
      }
      const data = await res.json();
      runInAction(() => {
        this.user = { email: data.email, name: data.name };
        localStorage.setItem(LS_EMAIL_KEY, data.email);
        localStorage.setItem(LS_NAME_KEY, data.name);
      });
      return true;
    } catch {
      return false;
    }
  }

  async setup(name: string, email: string, password: string): Promise<boolean> {
    this.error = null;
    this.isLoading = true;
    try {
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, email, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Setup failed' }));
        runInAction(() => {
          this.error = data.error || 'Setup failed';
          this.isLoading = false;
        });
        return false;
      }

      const data = await res.json();
      runInAction(() => {
        this.user = { email: data.email, name: data.name };
        localStorage.setItem(LS_EMAIL_KEY, data.email);
        localStorage.setItem(LS_NAME_KEY, data.name);
        this.isLoading = false;
      });
      return true;
    } catch {
      runInAction(() => {
        this.error = 'Network error';
        this.isLoading = false;
      });
      return false;
    }
  }
}
