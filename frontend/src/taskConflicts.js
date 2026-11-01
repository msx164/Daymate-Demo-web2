export function taskInterval(task) {
  const start = Date.parse(`${task.task_date}T${task.start_time}:00+08:00`);
  let end = Date.parse(`${task.task_date}T${task.end_time}:00+08:00`);
  // Equal start/end means a zero-length schedule; earlier end means overnight.
  if (end < start) end += 86400000;
  return [start, end];
}
export function taskConflicts(proposal, tasks, excludeId = null) {
  const [start, end] = taskInterval(proposal);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start === end) return [];
  return tasks.filter((task) => {
    if (task.id === excludeId || task.completed) return false;
    const [otherStart, otherEnd] = taskInterval(task);
    return otherStart < otherEnd && start < otherEnd && otherStart < end;
  });
}
