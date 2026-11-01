import { useEffect, useState } from 'react';
import { get, post, command, liveRoom } from './api.js';
import { session, userStorage, clearSession } from './session.js';
import { CompanionPanel } from '../components/CompanionPanel.jsx';
import dayReading from '../assets/companion/day-reading-v1.png';
import './Web2.css';

const stampRoom = data => ({ ...data, _receivedAt: Date.now() });
const modes = { quiet: '安静同行', checkin: '开始与结束聊一聊' };
const statusLabels = { working: '正在行动', away: '暂时离开', stuck: '遇到困难', done: '完成本轮目标' };
const results = { done: '完成了', partial: '推进了一部分', not_started: '这次没能开始' };
const states = { waiting: '等待就绪', active: '行动中', ended: '已结束', cancelled: '已取消', expired: '等待已到期' };
const clock = seconds => `${String(Math.floor(Math.max(0, seconds) / 60)).padStart(2, '0')}:${String(Math.floor(Math.max(0, seconds)) % 60).padStart(2, '0')}`;

export function AccountMenu() {
  const account = session()?.user;
  return <div className="w2-account"><span>{account?.nickname}</span><button className="w2-link" onClick={async () => {
    if (!window.confirm('退出账号？本轮行动不会暂停。可以先回到房间结束自己的行动。')) return;
    try { await post('/logout', {}); } catch { /* Locally revoke access even if the service is offline. */ }
    clearSession(); window.location.reload();
  }}>退出登录</button></div>;
}

export function CommunityPage({ page, navigate, tasks = [], onSolo }) {
  const user = session()?.user;
  const [lobby, setLobby] = useState(null), [buddies, setBuddies] = useState([]);
  const [roomId, setRoomId] = useState(() => userStorage('session').getItem('current-room'));
  const [room, setRoom] = useState(null), [connection, setConnection] = useState('connecting');
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(null), [duration, setDuration] = useState('all'), [mode, setMode] = useState('all');
  const [now, setNow] = useState(() => Date.now()), [dayOpen, setDayOpen] = useState(false), [muted, setMuted] = useState(false);
  const [dayTip, setDayTip] = useState('不必一次做完。先给自己一个可以开始的小目标。');
  async function refresh() {
    const [next, friends] = await Promise.all([get('/lobby'), get('/buddies')]);
    setLobby(next); setBuddies(friends);
  }
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [next, friends] = await Promise.all([get('/lobby'), get('/buddies')]);
        if (active) { setLobby(next); setBuddies(friends); }
      } catch (e) { if (active) setError(e.message); }
    }
    load(); const interval = setInterval(load, 5000);
    return () => { active = false; clearInterval(interval); };
  }, []);
  useEffect(() => {
    if (!roomId) return;
    let active = true;
    get('/rooms/' + roomId).then(data => { if (active) setRoom(stampRoom(data)); }).catch(e => { if (active) setError(e.message); });
    const stop = liveRoom(roomId, state => { if (active) setRoom(stampRoom(state)); }, state => { if (active) setConnection(state); });
    // HTTP fallback also permits recovery when a proxy drops the websocket.
    const fallback = setInterval(() => get('/rooms/' + roomId).then(data => { if (active) setRoom(stampRoom(data)); }).catch(() => {}), 8000);
    return () => { active = false; stop(); clearInterval(fallback); };
  }, [roomId]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  function openRoom(id) { setRoom(null); setRoomId(id); setError(''); userStorage('session').setItem('current-room', id); navigate('together'); }
  function closeRoom() { setRoomId(null); setRoom(null); setDayOpen(false); userStorage('session').removeItem('current-room'); }
  async function run(op, payload = {}) {
    if (busy) return false;
    setBusy(true); setError('');
    try {
      await command(op, { room_id: roomId, ...payload });
      if (roomId) setRoom(stampRoom(await get('/rooms/' + roomId)));
      await refresh(); return true;
    } catch (e) { setError(e.message); return false; } finally { setBusy(false); }
  }
  const mine = room?.members.find(m => m.user === user.id);
  const partner = room?.members.find(m => m.user !== user.id && !m.left_at) || room?.members.find(m => m.user !== user.id);
  const ended = room && (mine?.left_at || ['ended', 'expired', 'cancelled'].includes(room.state));
  const serverNow = room ? room.server_time + (now - room._receivedAt) / 1000 : now / 1000;
  const remaining = room ? Math.max(0, (room.state === 'active' ? room.ended : room.deadline) - serverNow) : 0;
  const visibleCards = lobby?.rooms.filter(r => (duration === 'all' || r.minutes === +duration) && (mode === 'all' || r.mode === mode)) || [];
  return <div className="w2-community">
    {error && <div role="alert" className="w2-error">{error} <button onClick={() => { setError(''); refresh().catch(e => setError(e.message)); }}>刷新查看</button></div>}
    {notice && <p role="status" className="w2-notice">{notice}<button aria-label="关闭提示" onClick={() => setNotice('')}>×</button></p>}
    {page === 'buddies' ? <>
      <div className="w2-section-heading"><div><span className="w2-eyebrow">BETTER WITH SOMEONE</span><h2>把一次同行，变成下次见。</h2><p>双向接受后成为搭子。邀请朋友时，在房间里分享专属邀请码。</p></div><button className="w2-primary" onClick={() => { navigate('together'); setModal({ type: 'create', invite: true }); }}>发起朋友行动</button></div>
      <div className="w2-card-grid">{buddies.map(b => <article className="w2-card" key={b.target}>
        <div className="w2-avatar">{b.nickname[0]}</div><h3>{b.nickname}</h3><p>{b.state === 'accepted' ? '已是搭子 · 下次一起开始' : b.requester === user.id ? '邀请已发出，等待对方接受' : '邀请你成为行动搭子'}</p>
        {b.state === 'pending' && b.requester !== user.id && <button className="w2-primary" disabled={busy} onClick={() => run('buddy', { target: b.target })}>接受搭子邀请</button>}
        {b.state === 'accepted' && <button className="w2-primary" onClick={() => { navigate('together'); setModal({ type: 'create', invite: true }); }}>创建邀请行动</button>}
        <button className="w2-link" disabled={busy} onClick={() => run('unbuddy', { target: b.target })}>{b.state === 'accepted' ? '解除搭子关系' : '撤回或忽略邀请'}</button>
      </article>)}</div>{!buddies.length && <Empty title="第一次同行，还在前面" text="先去行动广场认识一位伙伴。结束后，双方都愿意就可以约下一次。" action="去找一个行动" onClick={() => navigate('together')} />}
    </> : page === 'action-history' ? <>
      <div className="w2-section-heading"><div><span className="w2-eyebrow">SMALL STEPS COUNT</span><h2>每一点推进，都留在这里。</h2><p>本页只属于你。私人复盘不会展示给伙伴。</p></div></div>
      <div className="w2-history">{lobby?.history.map(r => <button key={r.id} className="w2-history-row" onClick={() => openRoom(r.id)}><span className="w2-history-icon">↗</span><div><strong>{r.goal}</strong><small>{new Date(r.created * 1000).toLocaleString('zh-CN')} · {states[r.state]}</small>{r.note && <p>{r.note}</p>}</div><span>{results[r.result] || '查看行动'} →</span></button>)}</div>
      {lobby && !lobby.history.length && <Empty title="从第一轮开始积累" text="一段时间，一个小目标，足够成为今天的起点。" action="开始第一轮" onClick={() => navigate('together')} />}
    </> : roomId ? <>
      <button className="w2-back" onClick={closeRoom}>← 返回行动广场（保留当前行动）</button>
      {!room ? <p role="status">正在打开行动房间…</p> : <>
        <div className="w2-room-top"><span className="w2-pill">{states[room.state]}</span><span className="w2-small">{connection === 'connected' ? '● 实时连接' : connection === 'denied' ? '连接权限已失效，请重新登录' : '连接恢复中 · 正在尝试同步'}</span><span>{modes[room.mode]} · {room.minutes}分钟</span></div>
        {room.host === user.id && room.visibility === 'invite' && room.state === 'waiting' && <div className="w2-invitation">专属邀请码 <strong>{room.code}</strong><button className="w2-link" onClick={() => navigator.clipboard?.writeText(room.code).then(() => setNotice('邀请码已复制，可发给朋友')).catch(() => setNotice('请手动复制邀请码'))}>复制</button><span>只有持有邀请码的人可以加入</span></div>}
        <section className="w2-room-focus"><div className="w2-room-heading"><span className="w2-eyebrow">ONE THING AT A TIME</span><h2>{ended ? '这一轮，辛苦了。' : room.state === 'waiting' ? '先说好，再一起开始。' : '各做各的事，一起往前走。'}</h2></div>
          <div className="w2-timer">{ended ? '✓' : room.state === 'waiting' ? clock(remaining) : clock(remaining)}</div>
          <p>{ended ? '完成或推进了一点，都可以如实记录。' : room.state === 'waiting' ? `等待伙伴与双方就绪 · 邀请 ${clock(remaining)} 后到期` : '这一段时间，只需要照顾好眼前的小目标。'}</p>
          <div className="w2-members">{room.members.map(m => <article key={m.user} className={'w2-member ' + (m.user === user.id ? 'is-me' : '')}><div className="w2-member-label"><span className="w2-avatar">{m.nickname[0]}</span><strong>{m.nickname}{m.user === user.id ? '（我）' : ''}</strong><span className="w2-pill">{m.left_at ? '已离开' : room.state === 'waiting' ? m.ready ? '准备好了' : '等待就绪' : statusLabels[m.status]}</span></div><p>{m.goal}</p></article>)}
          {!partner && <article className="w2-member w2-waiting"><span>＋</span><strong>留一个位置，等同行的人。</strong><p>等候时也可以选择先和 Day 开始。</p></article>}</div>
          {!ended && room.state === 'waiting' && <div className="w2-actions"><button className="w2-primary" disabled={busy || mine?.ready} onClick={() => run('ready')}>{mine?.ready ? '已就绪，等待伙伴' : '我准备好了'}</button><button className="w2-secondary" disabled={busy} onClick={async () => {
            if (await run('leave')) {
              try { await onSolo({ goal: mine.goal, minutes: room.minutes }); closeRoom(); }
              catch (e) { setError('等候已结束，但私人任务未确认：' + e.message + '。请先在任务页检查记录。'); }
            }
          }}>先和 Day 开始</button></div>}
          {!ended && room.state === 'active' && <div className="w2-actions">{Object.entries(statusLabels).map(([value, label]) => <button className={'w2-status ' + (mine?.status === value ? 'selected' : '')} key={value} disabled={busy} onClick={() => run('status', { status: value })}>{label}</button>)}</div>}
          {partner?.left_at && !ended && <p className="w2-notice">伙伴离开了，你的计时继续保留。可以保持当前行动，由 Day 安静陪伴。</p>}
          {!ended && <button className="w2-link w2-leave" disabled={busy} onClick={() => { if (window.confirm('结束自己的本轮行动？伙伴的计时会继续，你的记录会保留。')) run('leave'); }}>结束自己的行动并复盘</button>}
        </section>
        <div className="w2-room-bottom"><section className="w2-panel"><div className="w2-section-heading compact"><h3>本轮交流</h3><button className="w2-link" onClick={() => setMuted(!muted)}>{muted ? '展开消息' : '折叠消息'}</button></div><p className="w2-small">不必即时回应。没有发送消息，也可以是在认真行动。</p>
          {!muted && <div className="w2-messages" aria-live="polite">{room.messages.map(m => <div className={'w2-message ' + (m.user === user.id ? 'mine' : '')} key={m.id}><small>{m.nickname}</small><p>{m.body}</p></div>)}{!room.messages.length && <p className="w2-small">开始前说一句目标，结束后分享一点进展。</p>}</div>}
          {!mine?.left_at && !['cancelled', 'expired'].includes(room.state) && <form className="w2-message-form" onSubmit={async event => { event.preventDefault(); const form = event.currentTarget; const body = new FormData(form).get('body').trim(); if (body && await run('message', { body })) form.reset(); }}><input name="body" aria-label="给伙伴的消息" maxLength={500} required placeholder="一句简单的招呼或鼓励…" /><button className="w2-primary" disabled={busy}>发送</button></form>}
          {partner && <div className="w2-peer-controls"><button className="w2-link" disabled={busy} onClick={async () => { if (await run('buddy', { target: partner.user })) setNotice('搭子邀请已处理，可在“我的搭子”查看'); }}>以后再约</button><button className="w2-link" disabled={busy} onClick={() => { if (window.confirm('屏蔽此伙伴并离开共同房间？之后不能互相加入或邀请。')) run('block', { target: partner.user }); }}>屏蔽</button><button className="w2-link" onClick={() => setModal({ type: 'report', target: partner.user })}>举报</button></div>}
        </section><aside className="w2-day"><div><span className="w2-eyebrow">YOUR QUIET COMPANION</span><h3>Day 也在这里。</h3><p>{dayTip}</p><small>固定鼓励语 · 只对你可见</small><button className="w2-secondary" onClick={() => { setDayTip('如果卡住了，先做最小的一步：打开文件，写下一句话，或读一段。'); setDayOpen(true); }}>和 Day 聊聊</button></div><img src={dayReading} alt="安静阅读的 Day" /></aside></div>
        {ended && <ReviewForm room={room} busy={busy} save={async data => { if (await run('review', data)) setNotice('复盘已保存。只有你确认分享的那句话会对伙伴可见。'); }} onAgain={() => { closeRoom(); setModal({ type: 'create', invite: true, goal: mine?.goal }); }} />}
        {!!room.feedback.length && <section className="w2-panel"><h3>伙伴选择分享的进展</h3>{room.feedback.map(f => <p key={f.user}><strong>{f.nickname}</strong> · {results[f.result]}：{f.shared}</p>)}</section>}
      </>}
    </> : <>
      <section className="w2-hero"><div><span className="w2-eyebrow">A LITTLE COMPANY. A LITTLE PROGRESS.</span><h2>一起做完，<br />从这一小步开始。</h2><p>找一个人，各做各的事。<br />用一段约定好的时间，把今天往前推一点。</p><div className="w2-actions"><button className="w2-primary" onClick={() => setModal({ type: 'create' })}>＋ 发起一轮行动</button><button className="w2-secondary" onClick={() => setModal({ type: 'join-code' })}>输入朋友邀请码</button></div></div><div className="w2-hero-art"><span className="w2-orbit"/><img src={dayReading} alt="Day 陪你安静行动" /><span className="w2-hero-note">不用一直聊天，<br />在这里就很好。</span></div></section>
      {lobby?.current && <div className="w2-resume"><div><strong>你有一轮尚未结束的行动</strong><p>刷新和切换页面不会结束服务器上的计时。</p></div><button className="w2-primary" onClick={() => openRoom(lobby.current)}>回到当前行动 →</button></div>}
      <div className="w2-section-heading"><div><h2>现在，有人准备开始</h2><p>{lobby ? `${lobby.rooms.length} 个可加入的行动 · 时间和互动方式合适，就可以一起` : '正在寻找可以同行的行动…'}</p></div><button className="w2-link" onClick={() => refresh().catch(e => setError(e.message))}>↻ 刷新</button></div>
      <div className="w2-filters"><label>时长<select value={duration} onChange={e => setDuration(e.target.value)}><option value="all">不限时长</option>{[15, 25, 45].map(v => <option key={v} value={v}>{v}分钟</option>)}</select></label><label>互动方式<select value={mode} onChange={e => setMode(e.target.value)}><option value="all">全部方式</option><option value="quiet">安静同行</option><option value="checkin">开始与结束聊一聊</option></select></label><span>接受不同任务 · 默认无需摄像头</span></div>
      <div className="w2-card-grid">{visibleCards.map(card => <article className="w2-card" key={card.id}><span className="w2-pill">{card.minutes}分钟 · {modes[card.mode]}</span><h3>{card.goal}</h3><p>各自完成自己的目标，结束后回来分享进展。</p><div className="w2-card-footer"><span><span className="w2-avatar">{card.nickname[0]}</span>{card.nickname}</span><button className="w2-secondary" onClick={() => setModal({ type: 'join', card })}>一起开始 ↗</button></div></article>)}</div>
      {lobby && !visibleCards.length && <Empty title="这会儿，空位留给第一个开始的人。" text="可以发起行动等一位伙伴，也可以邀请朋友。暂时想独处，就和 Day 先开始。" action="邀请朋友一起" onClick={() => setModal({ type: 'create', invite: true })} />}
      <section className="w2-how"><div><span>01</span><h3>说出一个小目标</h3><p>这一轮只推进一件事。</p></div><div><span>02</span><h3>约好，再各自行动</h3><p>不用同一任务，也不必一直聊天。</p></div><div><span>03</span><h3>结束时，给一点回应</h3><p>完成、推进了一点，都值得记录。</p></div></section>
    </>}
    {modal && <ActionModal modal={modal} tasks={tasks} onClose={() => setModal(null)} onSuccess={id => { setModal(null); if (id) openRoom(id); else setNotice('举报已保存到本地待处理队列。此开发版尚未连接人工处理服务。'); refresh().catch(() => {}); }} />}
    {dayOpen && <div className="w2-drawer" role="dialog" aria-modal="true" aria-label="与 Day 私人对话"><div className="w2-section-heading"><h3>和 Day 聊聊 · 仅自己可见</h3><button aria-label="关闭 Day 对话" onClick={() => setDayOpen(false)}>×</button></div><p className="w2-small">内容不会自动分享给伙伴。模型未配置时，可继续使用计时与固定鼓励。</p><CompanionPanel tasks={[]} onReviewTask={() => { setDayOpen(false); navigate('tasks'); }} character="day" /></div>}
  </div>;
}

function Empty({ title, text, action, onClick }) {
  return <section className="w2-empty"><span aria-hidden="true">☀</span><h3>{title}</h3><p>{text}</p><button className="w2-secondary" onClick={onClick}>{action}</button></section>;
}

function ReviewForm({ room, busy, save, onAgain }) {
  const [result, setResult] = useState(room.my_review?.result || 'partial');
  const [note, setNote] = useState(room.my_review?.note || ''), [shared, setShared] = useState(room.my_review?.shared || '');
  const [share, setShare] = useState(!!room.my_review?.shared), [preview, setPreview] = useState(false);
  return <section className="w2-panel w2-review"><span className="w2-eyebrow">A MOMENT FOR YOURSELF</span><h2>留下一点进展。</h2><form onSubmit={e => { e.preventDefault(); if (share && !preview) { setPreview(true); return; } save({ result, note, shared: share ? shared : '' }); setPreview(false); }}>
    <div className="w2-actions">{Object.entries(results).map(([value, label]) => <button type="button" key={value} className={'w2-status ' + (result === value ? 'selected' : '')} onClick={() => { setResult(value); setPreview(false); }}>{label}</button>)}</div>
    <label>个人复盘 · 仅自己可见<textarea value={note} onChange={e => setNote(e.target.value)} maxLength={1500} placeholder="推进了什么？下一小步是什么？" /></label>
    <label className="w2-checkbox"><input type="checkbox" checked={share} onChange={e => { setShare(e.target.checked); setPreview(false); }} />我想另外分享一句进展给伙伴</label>
    {share && <label>给伙伴的一句话<textarea value={shared} onChange={e => { setShared(e.target.value); setPreview(false); }} maxLength={300} required placeholder="只写你愿意分享的内容" /></label>}
    {preview && <div className="w2-share-preview"><strong>即将分享给本轮伙伴</strong><p>{results[result]}：{shared}</p><small>上面的个人复盘不会发送。</small></div>}
    <div className="w2-actions"><button className="w2-primary" disabled={busy}>{share ? preview ? '确认分享并保存' : '预览分享内容' : '保存私人复盘'}</button><button type="button" className="w2-secondary" onClick={onAgain}>创建下一轮邀请</button></div>
  </form></section>;
}

function ActionModal({ modal, tasks, onClose, onSuccess }) {
  const [goal, setGoal] = useState(modal.goal || ''), [minutes, setMinutes] = useState(25), [mode, setMode] = useState(modal.card?.mode || 'quiet');
  const [visibility, setVisibility] = useState(modal.invite ? 'invite' : 'public');
  const [preview, setPreview] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const creating = modal.type === 'create', reporting = modal.type === 'report';
  useEffect(() => {
    const close = e => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', close); return () => document.removeEventListener('keydown', close);
  }, [onClose, busy]);
  async function submit(event) {
    event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget));
    if (creating && !preview) { setPreview(true); return; }
    setBusy(true); setError('');
    try {
      let result;
      if (creating) result = await post('/rooms', { goal: goal.trim(), minutes, mode, visibility });
      else if (reporting) result = await command('report', { room_id: modal.roomId || userStorage('session').getItem('current-room'), target: modal.target, reason: data.reason });
      else result = await post('/join', { goal: goal.trim(), ...(modal.card ? { room_id: modal.card.id } : { code: data.code.trim().toUpperCase() }) });
      onSuccess(result.room_id);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <div className="w2-modal-backdrop"><section className="w2-modal" role="dialog" aria-modal="true" aria-labelledby="w2-modal-title"><div className="w2-section-heading compact"><h2 id="w2-modal-title">{creating ? preview ? '确认这轮行动' : '这一轮，你想推进什么？' : reporting ? '反馈不合适的行为' : '说好目标，一起开始'}</h2><button disabled={busy} aria-label="关闭弹窗" onClick={onClose}>×</button></div>
    <form onSubmit={submit}>{reporting ? <label>举报原因<textarea name="reason" required maxLength={1000} placeholder="描述发生的行为，报告仅进入本地待处理队列。" /></label> : <>
      {creating && tasks.length > 0 && !preview && <label>从我的任务带入（可选）<select defaultValue="" onChange={e => setGoal(e.target.value)}><option value="">手动填写一个小目标</option>{tasks.filter(t => !t.completed).map(t => <option key={t.id} value={t.name}>{t.name}</option>)}</select></label>}
      <label>本轮公开目标<input autoFocus required maxLength={160} value={goal} onChange={e => { setGoal(e.target.value); setPreview(false); }} placeholder="例如：写出实验报告的提纲" /></label><p className="w2-small">这是伙伴将看到的内容，可以把私人任务改成概括表达。</p>
      {creating ? <><label>行动时长<div className="w2-actions">{[15, 25, 45].map(n => <button type="button" key={n} className={'w2-status ' + (minutes === n ? 'selected' : '')} onClick={() => { setMinutes(n); setPreview(false); }}>{n}分钟</button>)}</div><input type="number" aria-label="自定义行动分钟数" min={1} max={120} value={minutes} onChange={e => { setMinutes(+e.target.value); setPreview(false); }} /></label><label>互动方式<select value={mode} onChange={e => { setMode(e.target.value); setPreview(false); }}><option value="quiet">安静同行</option><option value="checkin">开始与结束聊一聊</option></select></label><label>加入范围<select value={visibility} onChange={e => { setVisibility(e.target.value); setPreview(false); }}><option value="public">公开找一位伙伴</option><option value="invite">仅通过邀请码加入</option></select></label>
        {preview && <div className="w2-share-preview"><strong>{goal}</strong><p>{minutes}分钟 · {modes[mode]} · {visibility === 'public' ? '公开广场可见' : '仅持邀请码者可加入'}</p><small>最多等待3分钟。双方确认后才会开始，不会公开任务库或私人对话。</small></div>}</> : <>{modal.card ? <div className="w2-share-preview"><strong>对方准备：{modal.card.goal}</strong><p>{modal.card.minutes}分钟 · {modes[modal.card.mode]}</p><small>加入代表接受本轮互动约定；各自完成自己的任务。</small></div> : <label>朋友的邀请码<input name="code" required minLength={8} maxLength={8} placeholder="8位邀请码" /></label>}</>}
    </>}{error && <p role="alert" className="w2-error">{error}</p>}<div className="w2-actions"><button type="button" className="w2-secondary" disabled={busy} onClick={onClose}>取消</button><button className="w2-primary" disabled={busy}>{busy ? '正在确认…' : creating ? preview ? '确认发布' : '预览行动卡片' : reporting ? '保存举报' : '接受约定并加入'}</button></div></form>
  </section></div>;
}
