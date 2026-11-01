import {test} from 'node:test';
import assert from 'node:assert/strict';
import {READING_RIG_DRAFT as draft} from './readingRigDraft.js';
test('reading draft keeps disjoint source regions inside the atlas and cannot claim a compiled rig',()=>{
  assert.equal(draft.status,'needs_review');
  assert.equal(new Set(draft.layers.map(layer=>layer.id)).size,6);
  for(const layer of draft.layers){
    const [x,y,w,h]=layer.rect;
    assert.ok(x>=0&&y>=0&&w>0&&h>0&&x+w<=draft.width&&y+h<=draft.height);
    for(const other of draft.layers){
      if(other===layer)continue;
      const [a,b,c,d]=other.rect;
      assert.ok(x+w<=a||a+c<=x||y+h<=b||b+d<=y);
    }
  }
});
