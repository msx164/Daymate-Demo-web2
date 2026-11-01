export function Sidebar({ page, onNavigate }) {
  return (
<aside className="sidebar">

        <div className="logo">
          <img className="web2-app-icon" src="/branding/daymate-final-64.png" alt="" width="36" height="36" />
          <span>Daymate</span>
        </div>

        <nav className="nav" aria-label="主导航">
          {[
            ['home', '⌂', '首页'], ['tasks', '✓', '任务'], ['focus', '◷', '专注'],
            ['together', '◉', '一起做完'], ['buddies', '♧', '我的搭子'], ['action-history', '↗', '同行记录'], ['companion', '♡', '陪伴'], ['settings', '⚙', '设置'],
          ].map(([id, icon, label]) => <button type="button" key={id}
            className={`nav-item ${page === id ? 'active' : ''}`} aria-label={label}
            aria-current={page === id ? 'page' : undefined} onClick={() => onNavigate(id)}>
            <span aria-hidden="true">{icon}</span><span>{label}</span>
          </button>)}
        </nav>

      </aside>
  );
}
