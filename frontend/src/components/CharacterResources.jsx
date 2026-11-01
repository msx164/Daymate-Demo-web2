import { useEffect, useState } from 'react';
import { characterSnapshot } from '../characterResources.js';
import { CharacterContext, useCharacterResources } from '../hooks/useCharacterResources.js';

export function CharacterResources({ children }) {
  const bridge = window.daymateDesktop || window.daymatePet;
  const [view, setView] = useState({ character: null, error: '', loading: !!bridge?.getCharacter });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!bridge?.getCharacter) return;
    let active = true, received = false;
    const accept = value => {
      if (!active) return;
      try { setView({ ...characterSnapshot(value), loading: false }); }
      catch { setView({ character: null, error: '角色资源读取失败，已回退内置形象。', loading: false }); }
    };
    const unsubscribe = bridge.onCharacter(value => { received = true; accept(value); });
    bridge.getCharacter().then(value => { if (!received) accept(value); }, () => { if (active && !received) setView({ character: null, error: '本机角色暂时无法读取，已回退内置形象。', loading: false }); });
    return () => { active = false; unsubscribe(); };
  }, [bridge]);
  async function importCharacter(image=false) {
    const importer=image?bridge?.importCharacterImage:bridge?.importCharacter;
    if (busy || !importer) return false;
    setBusy(true);
    try {
      const result = await importer();
      if (result.canceled) return false;
      if (result.failure) throw Error(result.failure);
      setView({ ...characterSnapshot(result), loading: false });
      return true;
    } catch (error) {
      setView(previous => ({ ...previous, error: error.message || '角色导入失败，原角色保持不变。' }));
      return false;
    } finally { setBusy(false); }
  }
  async function deleteCharacter(){
    if(busy||!view.character||!bridge?.deleteCharacter)return false;
    setBusy(true);
    try{
      const result=await bridge.deleteCharacter(view.character.id);
      if(result.canceled)return false;
      if(result.failure)throw Error(result.failure);
      setView({...characterSnapshot(result),loading:false});return true;
    }catch(error){setView(previous=>({...previous,error:error.message||'删除未完成，请重试。'}));return false;}
    finally{setBusy(false);}
  }
  return <CharacterContext.Provider value={{ ...view, busy,deleteCharacter,deleteSupported:!!bridge?.deleteCharacter, importCharacter:()=>importCharacter(false),importImage:()=>importCharacter(true),imageSupported:!!bridge?.importCharacterImage, supported: !!bridge?.importCharacter }}>{children}</CharacterContext.Provider>;
}

export function CharacterImport({ onSelect,onRemove }) {
  const resources = useCharacterResources();
  return <details className="character-import"><summary>上传图片与自定义角色</summary>
    <p className="form-hint">支持 PNG、JPG/JPEG、WebP、BMP、GIF，动图取首帧。每张最多 8 MiB，宽高 64–2048 像素。图片仅保存在本机，建议透明背景与完整身体。</p>
    {resources.imageSupported && <button disabled={resources.busy||resources.loading} onClick={async()=>{if(await resources.importImage())onSelect();}}>{resources.busy?'正在处理…':'上传角色图片'}</button>}
    {resources.character&&<div className="custom-character-current"><span>当前图片：{resources.character.name}</span>{resources.deleteSupported&&<button disabled={resources.busy||resources.loading} onClick={async()=>{if(await resources.deleteCharacter())onRemove?.();}}>删除自定义形象</button>}</div>}
    <details className="character-pack-options"><summary>导入角色包（可选）</summary>
    <p className="form-hint">角色包目录需含 daymate-character.json 和默认 PNG，可另附专注、交流立绘。仅复制图片到本机，不上传；导入成功后选用，原始文件不改动。</p>
    <p className="form-hint">每张 PNG 最多 8 MiB，宽高 64–2048 像素，建议透明背景、统一画布与站位。此格式不包含 Live2D 或口型。</p>
    <pre>{`{ "version": 1, "name": "我的伙伴", "poses": {\n  "default": "idle.png", "focused": "focus.png", "speaking": "talk.png"\n} }`}</pre>
    <p className="form-hint">focused、speaking 可省略；缺失时使用自己的默认图。再次导入会换用新包，旧副本保留在本机。切回内置形象使用上方“形象”选择框。</p>
    {resources.supported ? <button disabled={resources.busy || resources.loading} onClick={async () => { if (await resources.importCharacter()) onSelect(); }}>{resources.busy ? '正在导入…' : '选择角色包目录'}</button>
      : <p className="form-hint">角色包导入在 Windows 桌面版中可用。</p>}
    </details>
    {resources.error && <p className="form-error" role="alert">{resources.error}</p>}
  </details>;
}
