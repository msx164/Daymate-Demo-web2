export function compareFocusTotals(week, history) {
  if (!Array.isArray(week) || week.length !== 7 || !week.every(item => Number.isSafeInteger(item.seconds) && item.seconds >= 0)
    || !Number.isSafeInteger(history?.total_seconds) || history.total_seconds < 0
    || history.start_date !== week[0].date || history.end_date !== week[6].date) throw Error('核对数据格式或日期区间不一致');
  const trendSeconds = week.reduce((sum, item) => sum + item.seconds, 0);
  return { matched: trendSeconds === history.total_seconds, trendSeconds, historySeconds: history.total_seconds };
}
