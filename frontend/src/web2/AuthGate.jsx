import { useEffect, useState } from 'react';
import { get, post } from './api.js';
import { session, saveSession, clearSession } from './session.js';
import day from '../assets/companion/day-reading-v1.png';
import './Web2.css';

export function AuthGate({ children }) {
  const [account, setAccount] = useState(null), [checking, setChecking] = useState(() => !!session());
  const [register, setRegister] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    if (!session()) return;
    get('/me').then(user => { if (active) { setAccount(user); setChecking(false); } }).catch(e => {
      if (e.status === 401) clearSession();
      if (active) { setError(e.message); setChecking(false); }
    });
    return () => { active = false; };
  }, []);
  if (checking) return <div className="w2-loading" role="status">正在打开你的 Daymate…</div>;
  if (account) return children;
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const result = await post(register ? '/register' : '/login', data);
      saveSession(result); window.location.reload();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <main className="w2-auth"><section className="w2-auth-story">
    <span className="w2-wordmark"><img src="/branding/daymate-final-64.png" alt="" width="44" height="44" />Daymate <small>TOGETHER</small></span>
    <div><span className="w2-eyebrow">有人同行，也有 Day 陪你</span><h1>从一件小事开始，<br />一起把今天往前推。</h1><p>各做各的事，共享一段专注时间。<br />需要独处时，Day 也会在这里。</p></div>
    <img src={day} alt="Day 安静阅读，陪你开始行动" />
    <div className="w2-auth-tags"><span>双人行动</span><span>安静同行</span><span>私人复盘</span></div>
  </section><section className="w2-auth-form"><div>
    <span className="w2-eyebrow">WELCOME TO YOUR DAY</span><h2>{register ? '创建你的新空间' : '欢迎回来'}</h2>
    <p>登录后，任务和复盘只对自己可见。</p><form onSubmit={submit}>
      {register && <label>昵称<input name="nickname" maxLength={24} required placeholder="伙伴如何称呼你" autoComplete="nickname" /></label>}
      <label>账号<input name="login" required pattern="[a-zA-Z0-9_]{3,32}" minLength={3} maxLength={32} autoComplete="username" placeholder="3—32位字母、数字或下划线" /></label>
      <label>密码<input type="password" name="password" required minLength={8} maxLength={128} autoComplete={register ? 'new-password' : 'current-password'} placeholder="至少8位" /></label>
      {error && <p className="w2-error" role="alert">{error}</p>}
      <button className="w2-primary" disabled={busy}>{busy ? '正在连接…' : register ? '创建账号并进入' : '进入 Daymate'}</button>
    </form><button className="w2-link" onClick={() => { setRegister(!register); setError(''); }}>{register ? '已有账号？返回登录' : '第一次来？创建账号'}</button>
    <p className="w2-small">这是独立的 Web 2.0 体验空间。原桌面版的账号、数据和设置不会被导入。建议使用不同的浏览器配置文件体验双人同行。</p>
  </div></section></main>;
}
