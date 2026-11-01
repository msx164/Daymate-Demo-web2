const explanations={
  hidden:'窗口当前不可见。返回窗口后再手动开启摄像头或恢复观察。',
  'not-ready':'摄像头尚未提供可用画面，请等待预览出现；若一直没有画面，可关闭再开启摄像头。',
  'camera-ended':'摄像头视频轨道已结束。请使用摄像头按钮重新开启设备。',
  frozen:'视频画面时间已超过 3 秒没有更新。请检查摄像头连接和预览，必要时关闭再开启摄像头。',
  interrupted:'取帧期间摄像头或窗口状态改变，已丢弃本帧。请检查预览并恢复观察。',
  slow:'本次取帧或推理结果已超过 3 秒，已丢弃。可关闭暂时不用的观察，减少本机负载后再试。',
  'init-timeout':'物体模型加载超过 20 秒，已停止该检测。可减少本机负载后重试；仍失败时检查本地模型资源。',
  'frame-timeout':'取帧或推理超过 5 秒，已停止该检测。可关闭暂时不用的观察后重试。',
  'model-error':'物体模型初始化失败。请重试；若仍失败，检查本地 vision 模型与运行资源是否完整。',
  'inference-error':'物体模型处理画面失败，已停止该检测。可重新加载模型后重试。',
  'capture-error':'画面获取或发送失败，已停止该检测。请先确认摄像头预览正常，再重试。',
  'invalid-result':'物体模型返回了无效结果，该结果未参与观察。可重新加载模型后重试。',
  'worker-error':'物体检测后台线程出错，已停止该检测。可重新加载模型；若反复失败，请检查本地运行资源。',
  'worker-message-error':'物体检测后台消息无法读取，已停止该检测。可重新加载模型后重试。',
  'startup-error':'物体检测后台线程未能启动。请重试；若仍失败，检查本地运行资源。',
};

export function CameraInferenceNotice({state,reason,onRetry}){
  if(!['unknown','unavailable'].includes(state))return null;
  const known=Object.hasOwn(explanations,reason);
  return <div className="object-diagnostic" data-reason={known?reason:'unknown'}>
    <p>{known?explanations[reason]:'当前没有有效的物体观察结果，请检查摄像头预览；模型不可用时可重新加载。'}</p>
    <p className="form-hint">此时不累计手机可见时间，自检不会把不可用画面记为漏检。其他观察可独立运行。</p>
    {state==='unavailable'&&<button onClick={onRetry}>重新加载物体模型</button>}
  </div>;
}
