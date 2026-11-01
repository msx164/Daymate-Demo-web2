export function SpeechControls({ speech }) {
  const active = ["starting", "speaking"].includes(speech.phase);
  return <details className="speech-controls"><summary>回复朗读 · 手动播放</summary>
    <p className="form-hint">使用 Windows 本地声音，不上传朗读文本。普通文字回复需手动点击“朗读”；视频陪伴中主动发送的语音文字，其完整回复会自动朗读。收起主界面会停止。</p>
    {!speech.supported ? <p className="form-hint">朗读在 Windows 桌面版中可用。</p> : <>
      <div className="speech-options"><button disabled={speech.loading || active} onClick={speech.loadVoices}>{speech.loading ? "读取中…" : "读取本地声音"}</button>
        <label>声音 <select aria-label="朗读声音" disabled={speech.loading || active || !speech.voices.length} value={speech.voice} onChange={event => speech.chooseVoice(event.target.value)}>
          {!speech.voices.length && <option value="">尚未读取</option>}
          {speech.voices.map(voice => <option key={voice.id} value={voice.id}>{voice.name} · {voice.language}</option>)}</select></label>
        <label>语速 <select aria-label="朗读语速" disabled={active} value={speech.rate} onChange={event => speech.chooseRate(Number(event.target.value))}>
          <option value={-2}>较慢</option><option value={0}>正常</option><option value={2}>较快</option></select></label>
        <button disabled={!active} onClick={speech.stop}>停止朗读</button></div>
      <p className="form-hint" role="status">{speech.phase === "starting" ? "正在准备朗读…" : speech.phase === "speaking" ? "正在朗读，可随时停止。" : "未在播放"}</p>
    </>}
    {(speech.error || speech.warning) && <p className="form-error" role="alert">{speech.error || speech.warning}</p>}
  </details>;
}
