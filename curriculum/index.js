// Curriculum Task Library for Clear RL training
// Each task: { id, level, title, description, skeleton?, tests[] }
// Tests are HTTP assertions: { method, path, body?, expect: { status, bodyHas?, bodyLength? } }
//
// Usage:
//   import { tasks, getTask, getLevel } from './curriculum/index.js';
//   const task = getTask('hello-world');
//   const level2 = getLevel(2);

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const taskFiles = [
  'L1-hello-world.json',
  'L1-greeting.json',
  'L2-echo.json',
  'L2-calculator.json',
  'L3-counter.json',
  'L3-key-value-store.json',
  'L4-todo-crud.json',
  'L4-bookmark-manager.json',
  'L5-auth-todo.json',
  'L5-user-profiles.json',
  'L6-blog-search.json',
  'L6-contact-book.json',
  'L7-rate-limited-api.json',
  'L7-validated-forms.json',
  'L8-multi-tenant.json',
  'L8-rbac-api.json',
  'L9-agent-summary.json',
  'L9-agent-categorizer.json',
  'L10-full-saas.json',
  'L10-dashboard-api.json',
];

export const tasks = taskFiles.map(f => {
  const raw = readFileSync(join(__dirname, 'tasks', f), 'utf8');
  return JSON.parse(raw);
});

export function getTask(id) {
  return tasks.find(t => t.id === id) || null;
}

export function getLevel(level) {
  return tasks.filter(t => t.level === level);
}

export function listTasks() {
  return tasks.map(t => ({ id: t.id, level: t.level, title: t.title, tests: t.tests.length }));
}
