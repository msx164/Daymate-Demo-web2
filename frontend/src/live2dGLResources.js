// One dedicated preview context only. Tracks handles, not GPU memory usage.
export function trackGLResources(gl) {
  const groups = new Map();
  let closed = false;
  for (const type of ['Buffer', 'Texture', 'Framebuffer', 'Renderbuffer', 'Program', 'Shader']) {
    const create = gl['create' + type].bind(gl), remove = gl['delete' + type].bind(gl), values = new Set();
    groups.set(type, { values, remove });
    gl['create' + type] = (...args) => {
      if (closed) return null;
      const result = create(...args); if (result) values.add(result); return result;
    };
    gl['delete' + type] = value => { remove(value); values.delete(value); };
  }
  const snapshot = () => Object.fromEntries([...groups].map(([type, group]) => [type, group.values.size]));
  return { snapshot,
    release() {
      if (closed) return snapshot();
      closed = true;
      for (const { values, remove } of groups.values()) {
        for (const value of values) { try { remove(value); } catch { /* Context may be lost. */ } }
        values.clear();
      }
      return snapshot();
    },
  };
}
