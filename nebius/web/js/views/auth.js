import { post, setCsrf } from '../api.js';
import { h, toast, errMsg } from '../ui.js';
import { state, go, loadContext } from '../app.js';

function shell(title, form, foot) {
  return h('div.auth', {}, h('div.auth-card', {},
    h('div.auth-brand', {}, h('img', { src: '/assets/logo.svg', alt: '', width: 40, height: 40 }), h('div', {}, h('strong', {}, 'NEBIUS'), h('small.muted', {}, 'AI cloud console'))),
    h('h1', {}, title), form, foot ? h('div.auth-foot', {}, foot) : null,
    h('p.legal', {}, 'Provisional internal development name — not affiliated with Nebius Group N.V. or Nebius AI Cloud.')));
}
function form(fields, submit, onSubmit) {
  const f = h('form', { novalidate: false }, fields.map((x) => h('label.field', {}, h('span', {}, x.label), h('input', { name: x.name, type: x.type || 'text', required: x.required !== false, autocomplete: x.autocomplete || 'off', minlength: x.minlength, value: x.value || '' }))),
    h('button.btn.primary.block', { type: 'submit' }, submit));
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const b = f.querySelector('button[type=submit]'); b.disabled = true;
    try { await onSubmit(Object.fromEntries(new FormData(f))); } catch (err) { toast(errMsg(err), 'error'); } finally { b.disabled = false; }
  });
  return f;
}

export const authViews = {
  login: () => shell('Sign in', form([{ name: 'email', label: 'Email', type: 'email', autocomplete: 'username' }, { name: 'password', label: 'Password', type: 'password', autocomplete: 'current-password' }], 'Sign in', async (v) => {
    const r = await post('/api/auth/login', { email: v.email, password: v.password });
    setCsrf(r.csrf_token); state.user = null;
    await loadContext();
    let after = '#/dashboard'; try { after = sessionStorage.getItem('nebius.after') || after; sessionStorage.removeItem('nebius.after'); } catch { /* */ }
    go(after.startsWith('#/login') ? '#/dashboard' : after);
  }), [h('a', { href: '#/signup' }, 'Create account'), h('a', { href: '#/forgot' }, 'Forgot password?')]),

  signup: () => shell('Create your account', form([{ name: 'display_name', label: 'Name', required: false }, { name: 'email', label: 'Email', type: 'email', autocomplete: 'username' }, { name: 'password', label: 'Password (10+ chars, letters and numbers)', type: 'password', autocomplete: 'new-password', minlength: 10 }], 'Create account', async (v) => {
    const r = await post('/api/auth/signup', v);
    toast(r.message); go('#/verify');
  }), [h('a', { href: '#/login' }, 'Already have an account? Sign in')]),

  verify: (route) => {
    const token = route.query.get('token');
    const el = shell('Verify your email', form([{ name: 'token', label: 'Verification code (from the email)', value: token || '' }], 'Verify', async (v) => {
      await post('/api/auth/verify-email', { token: v.token.trim() }); toast('Email verified. Please sign in.'); go('#/login');
    }), [h('a', { href: '#/login' }, 'Back to sign in')]);
    return el;
  },

  forgot: () => shell('Reset password', form([{ name: 'email', label: 'Email', type: 'email' }], 'Send reset link', async (v) => {
    const r = await post('/api/auth/forgot-password', v); toast(r.message); go('#/reset');
  }), [h('a', { href: '#/login' }, 'Back to sign in')]),

  reset: (route) => shell('Choose a new password', form([{ name: 'token', label: 'Reset code', value: route.query.get('token') || '' }, { name: 'password', label: 'New password', type: 'password', autocomplete: 'new-password', minlength: 10 }], 'Reset password', async (v) => {
    await post('/api/auth/reset-password', { token: v.token.trim(), password: v.password }); toast('Password changed. Sign in with the new password.'); go('#/login');
  })),

  invite: async (route) => {
    const token = route.query.get('token') || '';
    return h('div.center', {}, h('div.card', {}, h('h2', {}, 'Accept invitation'),
      form([{ name: 'token', label: 'Invitation code', value: token }], 'Join organization', async (v) => {
        const r = await post('/api/invitations/accept', { token: v.token.trim() });
        toast(`Joined ${r.organization.name} as ${r.role}`); state.user = null; go('#/dashboard');
      })));
  },
};
