import { chartHeight, formatFocusDuration } from "../dashboardUtils.js";
export function FocusTrend({ weekFocusData }) {
  return (
<section className="focus-week">

          <div className="panel-header">

            <div>

              <div className="panel-title">
                最近 7 天专注趋势
              </div>

              <div className="panel-subtitle">
                看看这一周的专注状态
              </div>

            </div>

          </div>


          <div className="focus-chart">

            {weekFocusData.map((item) => {

              const barHeight = chartHeight(item.seconds, weekFocusData);

              return (

                <div
                  className="focus-chart-item"
                  key={item.date}
                >

                  <div className="focus-chart-value">
                    {formatFocusDuration(item.seconds)}
                  </div>

                  <div
                    className="focus-chart-bar"
                    title={`${item.date}：${formatFocusDuration(item.seconds)}`}
                    style={{
                      height: `${barHeight}px`
                    }}
                  ></div>

                  <div className="focus-chart-date">
                    {new Date(
                      `${item.date}T12:00:00+08:00`
                    ).toLocaleDateString([], {
                      weekday: "short",
                      timeZone: "Asia/Shanghai",
                    })}
                  </div>

                </div>

              );

            })}

          </div>

        </section>
  );
}
