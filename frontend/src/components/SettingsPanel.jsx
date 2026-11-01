import { userStorage } from '../web2/session.js';
import { useState } from 'react';
import { readFocusMinutes, validFocusMinutes, writeFocusMinutes } from '../focusPreferences.js';
import { RuntimeDiagnostics } from './RuntimeDiagnostics.jsx';
import { DatabaseSnapshots } from './DatabaseSnapshots.jsx';
import { DatabaseSelection } from './DatabaseSelection.jsx';
import { Live2DPackageCheck } from './Live2DPackageCheck.jsx';
import {SCENES} from '../companionScenes.js';
import {Live2DWorkshop} from './Live2DWorkshop.jsx';
import { ProactiveSettings } from './ProactiveSettings.jsx';
import { useConversation } from '../companionConversation.js';
export function SettingsPanel({ appearance, onCompanion, readingPreviewVisible=true }) {
  const { chat } = useConversation();
  const { settings, update, warning } = appearance;
  const [minutes, setMinutes] = useState(() => { try { return readFocusMinutes(userStorage('local')); } catch { return 25; } });
  const [message, setMessage] = useState('');
  function saveMinutes(event) {
    event.preventDefault();
    if (!validFocusMinutes(minutes)) { setMessage('请输入 1–240 之间的整数分钟数。'); return; }
    try { setMessage(writeFocusMinutes(userStorage('local'), minutes) ? '默认专注时长已保存，下次开始专注时使用；当前计时不变。' : '当前环境无法保存设置，请在开始专注时选择时长。'); }
    catch { setMessage('当前环境无法保存设置，请在开始专注时选择时长。'); }
  }
  return <section className="panel settings-panel" aria-labelledby="settings-title">
    <h2 id="settings-title">显示与陪伴设置</h2>
    <label>默认场景 <select aria-label="设置默认场景" value={settings.scene} onChange={event => update({ scene: event.target.value })}>
      {Object.entries(SCENES).map(([id,info])=><option key={id} value={id}>{info.label}</option>)}</select></label>
    <label><input type="checkbox" checked={settings.motion} onChange={event => update({ motion: event.target.checked })} />启用轻微动作</label>
    <p>角色选择、PNG 导入与 Live2D 预览可在陪伴页调整。系统启用减少动态效果时，角色会保持静止。</p>
    <button className="primary-button" onClick={onCompanion}>打开陪伴与聊天设置</button>
    <form className="focus-default-form" onSubmit={saveMinutes}><h3>专注偏好</h3>
      <label>默认专注时长（分钟）<input aria-label="默认专注时长" type="number" min="1" max="240" step="1" required value={minutes} onChange={event => setMinutes(event.target.value)} /></label>
      <button className="primary-button" type="submit">保存专注偏好</button><p role="status">{message}</p>
    </form>
    <ProactiveSettings />
    <h3>AI 模型与回复朗读</h3>
    <p role="status">{chat.checking ? '正在检查模型配置…' : chat.status?.configured ? `当前模型：${chat.status.model}，配置已就绪。` : '模型暂不可用，请检查配置或稍后重试。'}</p>
    <button disabled={chat.checking || chat.busy} onClick={chat.refreshStatus}>重新检查配置</button>
    <p>在首页即可与 Day 对话。任务与记忆只在你主动选择分享后发送。回复朗读可在陪伴空间中按需开启，不会自动播放。</p>
    <h3>本地数据与隐私</h3><p>任务和专注记录保存在本机数据库。聊天只在发送时交给已配置的模型服务；分享任务和偏好需要手动选择。对话存档在陪伴页手动保存，不会在此自动清理数据。</p>
    <details className="settings-advanced"><summary>本地数据与高级工具</summary>
    <DatabaseSnapshots />
    <DatabaseSelection />
    <Live2DWorkshop visible={readingPreviewVisible}/>
    <Live2DPackageCheck />
    <RuntimeDiagnostics />
    </details>
    {warning && <p className="form-error" role="status">{warning}</p>}
  </section>;
}
