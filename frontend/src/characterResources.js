export function characterSnapshot(value) {
  if (!value || typeof value !== 'object') throw Error('角色信息不可用');
  if (!value.character) return { character: null, error: typeof value.error === 'string' ? value.error : '' };
  const { id, name, poses } = value.character;
  if (!/^[a-f0-9]{32}$/.test(id) || typeof name !== 'string' || !name.trim() || name.length > 40
    || !poses || !Object.hasOwn(poses, 'default') || Object.keys(poses).some(pose =>
      !['default', 'focused', 'speaking'].includes(pose) || poses[pose] !== `/characters/${id}/${pose}.png`)) throw Error('角色资源地址无效');
  return { character: { id, name, poses: { ...poses } }, error: '' };
}

export function avatarResource({ character, pose, custom, images, failed = [] }) {
  if (character === 'robot') return { pose: 'robot', source: 'robot' };
  const candidates = [];
  if (character === 'custom' && custom) {
    for (const key of [pose, 'default']) if (custom.poses[key]) candidates.push({ pose: key, src: custom.poses[key], source: 'custom', name: custom.name });
  }
  for (const key of character === 'custom' ? ['default'] : [pose, 'default']) {
    if (images[key]) candidates.push({ pose: key, src: images[key], source: 'builtin', name: 'Day' });
  }
  return candidates.find(item => !failed.includes(item.src)) || { pose: 'robot', source: 'robot' };
}
