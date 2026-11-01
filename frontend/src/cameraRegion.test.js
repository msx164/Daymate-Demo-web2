import test from 'node:test';import assert from 'node:assert/strict';
import {CAMERA_REGIONS,normalizeCameraRegion,cameraRegionPreset,cameraRegionCrop,captureCameraRegion} from './cameraRegion.js';
test('invalid regions fall back to full frame and all edges stay bounded',()=>{
  assert.deepEqual(normalizeCameraRegion({x:NaN}),{x:0,y:0,width:1,height:1});
  const r=normalizeCameraRegion({x:2,y:-2,width:5,height:-1});
  assert.equal(r.x,.9);assert.equal(r.y,0);assert.ok(Math.abs(r.width-.1)<1e-8);assert.equal(r.height,.1);
});
test('presets round-trip and a manually adjusted region is custom',()=>{
  for(const [key,value] of Object.entries(CAMERA_REGIONS))assert.equal(cameraRegionPreset(normalizeCameraRegion(value)),key);
  assert.equal(cameraRegionPreset({x:.1,y:.2,width:.3,height:.4}),'custom');
});
test('right and desk crops exclude pixels from the opposite half',()=>{
  assert.deepEqual(cameraRegionCrop(640,480,CAMERA_REGIONS.right),{sx:320,sy:0,sw:320,sh:480,resizeWidth:320,resizeHeight:480});
  assert.deepEqual(cameraRegionCrop(1280,720,CAMERA_REGIONS.desk),{sx:0,sy:360,sw:1280,sh:360,resizeWidth:640,resizeHeight:180});
});
test('odd or tiny dimensions produce a nonempty in-bounds crop and never upscale',()=>{
  for(const [w,h] of [[1,1],[17,19],[1921,1081]]){
    const c=cameraRegionCrop(w,h,{x:.9,y:.9,width:1,height:1});
    assert.ok(c.sx+c.sw<=w&&c.sy+c.sh<=h&&c.sw>=1&&c.sh>=1);
    assert.ok(c.resizeWidth<=c.sw&&c.resizeHeight<=c.sh&&Math.max(c.resizeWidth,c.resizeHeight)<=640);
  }
  assert.throws(()=>cameraRegionCrop(0,480,CAMERA_REGIONS.full));
});
test('capture sends crop coordinates to the bitmap API rather than masking the preview',()=>{
  const element={videoWidth:640,videoHeight:480};let args;
  const bitmap={};assert.equal(captureCameraRegion(element,CAMERA_REGIONS.left,(...value)=>{args=value;return bitmap;}),bitmap);
  assert.deepEqual(args,[element,0,0,320,480,{resizeWidth:320,resizeHeight:480,resizeQuality:'low'}]);
});
