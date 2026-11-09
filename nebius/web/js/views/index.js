import { authViews } from './auth.js';
import { dashboard } from './dashboard.js';
import { projectsView, iamView } from './projects.js';
import { filesView } from './files.js';
import { computeView } from './compute.js';
import { jobsView } from './jobs.js';
import { trainingView } from './training.js';
import { notebooksView } from './notebooks.js';
import { terminalView } from './terminal.js';
import { monitoringView, logsView, apiView, notificationsView, settingsView, adminView, helpView, searchView } from './ops.js';
import { h } from '../ui.js';

export const views = {
  ...authViews, dashboard, projects: projectsView, iam: iamView, files: filesView, compute: computeView, jobs: jobsView, training: trainingView,
  notebooks: notebooksView, terminal: terminalView, monitoring: monitoringView, logs: logsView, api: apiView, notifications: notificationsView,
  settings: settingsView, admin: adminView, help: helpView, search: searchView,
  notfound: () => h('div.card', {}, h('h2', {}, 'Page not found'), h('a', { href: '#/dashboard' }, 'Go to the dashboard')),
};
