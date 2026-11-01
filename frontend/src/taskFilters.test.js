import test from 'node:test';
import assert from 'node:assert/strict';
import { filterTasks } from './taskFilters.js';
const tasks = [
  { id: 2, name: '阅读 React', task_date: '2026-10-17', start_time: '10:00', task_type: '学习', completed: false },
  { id: 1, name: '阅读笔记', task_date: '2026-10-17', start_time: '09:00', task_type: '学习', completed: true },
  { id: 3, name: '阅读计划', task_date: '2026-10-18', start_time: '09:00', task_type: '工作', completed: false },
];
test('task search combines date, completion and type without changing the original task order', () => {
  assert.deepEqual(filterTasks(tasks, { date: '2026-10-17', query: ' REACT ', status: 'pending', type: '学习' }).map(x => x.id), [2]);
  assert.deepEqual(filterTasks(tasks, { date: '2026-10-17', status: 'completed' }).map(x => x.id), [1]);
  assert.deepEqual(filterTasks(tasks, { scope: 'all', type: '工作', query: '阅读' }).map(x => x.id), [3]);
  assert.deepEqual(tasks.map(x => x.id), [2, 1, 3]);
});
test('task results sort chronologically and report an empty search without excluding other dates in all scope', () => {
  assert.deepEqual(filterTasks(tasks, { scope: 'all' }).map(x => x.id), [1, 2, 3]);
  assert.deepEqual(filterTasks(tasks, { scope: 'all', query: '不存在' }), []);
});
