export function filterTasks(tasks, { date, scope = 'today', query = '', status = 'all', type = 'all' }) {
  const search = query.trim().toLocaleLowerCase();
  return tasks.filter(task => (scope !== 'today' || task.task_date === date)
    && (!search || task.name.toLocaleLowerCase().includes(search))
    && (status === 'all' || task.completed === (status === 'completed'))
    && (type === 'all' || task.task_type === type))
    .sort((a, b) => a.task_date.localeCompare(b.task_date) || a.start_time.localeCompare(b.start_time) || a.id - b.id);
}
