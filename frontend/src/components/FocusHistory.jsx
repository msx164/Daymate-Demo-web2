export function FocusHistory({ todaySessions, title = '今日专注记录', emptyMessage = '今天还没有专注记录' }) {
  return (
<section className="focus-history">

          <div className="panel-header">

            <div>

              <div className="panel-title">
                {title}
              </div>

              <div className="panel-subtitle">
                按中国时区开始日期统计；跨午夜记录归开始日
              </div>

            </div>

          </div>


          {todaySessions.length === 0 ? (

            <div className="empty-task">
              {emptyMessage}
            </div>

          ) : (

            <div className="focus-history-list">

              {todaySessions.map((session) => (

                <div
                  className="focus-history-item"
                  key={session.id}
                >

                  <div>

                    <strong>
                      {session.task_name}
                    </strong>

                    <div className="focus-history-time">

                      {new Date(
                        session.started_at
                      ).toLocaleString("zh-CN", {
                        timeZone: "Asia/Shanghai",
                        month: "2-digit", day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}

                      {" - "}

                      {new Date(
                        session.ended_at
                      ).toLocaleString("zh-CN", {
                        timeZone: "Asia/Shanghai",
                        month: "2-digit", day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}

                    </div>

                  </div>


                  <div className="focus-history-duration">

                    {Math.floor(
                      session.seconds / 60
                    )}
                    分

                    {session.seconds % 60}
                    秒

                  </div>

                </div>

              ))}

            </div>

          )}

        </section>
  );
}
