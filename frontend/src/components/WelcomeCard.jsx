export function WelcomeCard({ openTaskModal }) {
  return (
<section className="status-card">

          <div className="status-content">

            <div className="status-label">
              TODAY
            </div>

            <h2>
              今天的状态怎么样？
            </h2>

            <p>
              你的 AI 伙伴会陪你完成今天的任务，
              需要的时候提醒你休息和专注。
            </p>

            <button
              className="primary-button"
              onClick={openTaskModal}
            >
              添加一个任务 →
            </button>

          </div>


          <div className="companion">

            <div className="companion-glow"></div>

            <div className="companion-avatar">
              🤖
            </div>

            <div className="speech">
              我会陪着你哦！
            </div>

          </div>

        </section>
  );
}
