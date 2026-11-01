import { formatFocusDuration } from "../dashboardUtils.js";
export function StatsCards({ completedCount, todayTasks, completionRate, todayFocusSeconds, totalFocusSeconds, companionDays, focusStreak }) {
  return (
<section className="stats">

          <div className="stat-card">

            <div className="stat-icon">
              ✓
            </div>

            <div>

              <div className="stat-title">
                今日任务
              </div>

              <div className="stat-value">
                {completedCount}
                <span>
                  {" "}
                  / {todayTasks.length}
                </span>
              </div>
              <div className="stat-subtitle">完成率 {completionRate}%</div>

            </div>

          </div>


          <div className="stat-card">

            <div className="stat-icon">
              ◷
            </div>

            <div>

              <div className="stat-title">
                今日专注
              </div>

              <div className="stat-value focus-duration-value">
                {formatFocusDuration(
                  todayFocusSeconds
                )}
              </div>
              <div className="stat-subtitle">累计 {formatFocusDuration(totalFocusSeconds)}</div>

            </div>

          </div>


          <div className="stat-card">

            <div className="stat-icon">
              ♡
            </div>

            <div>

              <div className="stat-title">
                陪伴天数
              </div>

              <div className="stat-value">
                {companionDays}
                <span>
                  {" "}
                  天
                </span>
              </div>

            </div>

          </div>
          <div className="stat-card">

            <div className="stat-icon">
              🔥
            </div>

            <div>

              <div className="stat-title">
                连续专注
              </div>

              <div className="stat-value">
                {focusStreak}
                <span>
                  {" "}
                  天
                </span>
              </div>

            </div>

          </div>

        </section>
  );
}
