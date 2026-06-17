// ============================================================
// AUTHENTICATION — multi-user with roles
//   admin  → full access to all schools
//   school → access to their own school only
// Default admin: admin / mooe2024  (change in Setup)
// Session stored in sessionStorage (clears on browser close)
// ============================================================
const Auth = {
  SESSION_KEY: 'dwd_session',
  USERS_KEY: 'dwd_users',

  currentUser: null,

  _hash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const chr = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash |= 0;
    }
    return 'h_' + Math.abs(hash).toString(16);
  },

  _getUsers() {
    try {
      const stored = localStorage.getItem(this.USERS_KEY);
      if (stored) return JSON.parse(stored);
    } catch {}
    // Fall back to committed users-data.js (works across all devices)
    if (typeof USERS_DATA !== 'undefined' && USERS_DATA.length) return USERS_DATA;
    return [{
      id: 'admin',
      username: 'admin',
      passwordHash: this._hash('mooe2024'),
      role: 'admin',
      school_id: null,
      school_name: null,
    }];
  },

  _saveUsers(users) {
    localStorage.setItem(this.USERS_KEY, JSON.stringify(users));
  },

  isLoggedIn() {
    const session = sessionStorage.getItem(this.SESSION_KEY);
    if (session) {
      try {
        this.currentUser = JSON.parse(session);
        return true;
      } catch {}
    }
    return false;
  },

  isAdmin() {
    return this.currentUser?.role === 'admin';
  },

  getSchoolId() {
    if (this.currentUser?.role === 'school') return this.currentUser.school_id;
    return null;
  },

  async login(e) {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errEl    = document.getElementById('login-error');
    const btn      = e.target.querySelector('button[type="submit"]');
    const hash     = this._hash(password);

    // 1. Try local users first — instant, no network (covers admin always)
    let user = this._getUsers().find(u => u.username === username && u.passwordHash === hash);

    // 2. Not found locally — check Supabase school accounts
    if (!user) {
      if (btn) { btn.disabled = true; btn.textContent = 'Signing in...'; }
      try {
        if (typeof DB !== 'undefined') await DB.init(); // ensure ready if still initialising
        const { data } = await DB.getAppUsers();
        if (data && data.length) {
          user = data.find(u => u.username === username && u.passwordHash === hash);
        }
      } catch {}
      if (btn) { btn.disabled = false; btn.textContent = 'Sign In'; }
    }

    if (user) {
      this.currentUser = user;
      sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(user));
      document.getElementById('login-screen').style.display = 'none';
      errEl.classList.add('hidden');
      if (typeof App !== 'undefined') App.init();
    } else {
      errEl.textContent = 'Incorrect username or password.';
      errEl.classList.remove('hidden');
      document.getElementById('login-password').value = '';
    }
  },

  logout() {
    if (!confirm('Sign out?')) return;
    sessionStorage.removeItem(this.SESSION_KEY);
    location.reload();
  },

  getUsers() { return this._getUsers(); },

  async addSchoolUser(username, password, school_id, school_name) {
    const { data: existing } = await DB.getAppUsers();
    const local = this._getUsers();
    const all   = [...local, ...(existing || [])];
    if (all.find(u => u.username.toLowerCase() === username.toLowerCase())) {
      return { error: 'Username already exists.' };
    }
    const user = {
      id: 'u_' + Date.now().toString(36),
      username: username.trim(),
      passwordHash: this._hash(password),
      role: 'school',
      school_id,
      school_name,
    };
    const { error } = await DB.upsertAppUser(user);
    return { error: error ? (error.message || 'Failed to save.') : null };
  },

  async updateUserPassword(id, newPassword) {
    const { data: users } = await DB.getAppUsers();
    const user = (users || []).find(u => u.id === id)
              || this._getUsers().find(u => u.id === id);
    if (user) {
      await DB.upsertAppUser({ ...user, passwordHash: this._hash(newPassword) });
    }
  },

  async deleteUser(id) {
    await DB.deleteAppUser(id);
  },

  changeAdminCredentials(username, password) {
    const users = this._getUsers();
    const idx = users.findIndex(u => u.role === 'admin');
    if (idx > -1) {
      users[idx].username = username.trim();
      users[idx].passwordHash = this._hash(password);
      this._saveUsers(users);
    }
  },

  guard() {
    if (!this.isLoggedIn()) {
      document.getElementById('login-screen').style.display = 'flex';
    } else {
      document.getElementById('login-screen').style.display = 'none';
    }
  },
};

document.addEventListener('DOMContentLoaded', () => {
  Auth.guard(); // show login screen immediately — no network wait
  if (typeof DB !== 'undefined') DB.init(); // initialise Supabase in background
});
