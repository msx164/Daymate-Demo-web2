import test from 'node:test';import assert from 'node:assert/strict';
import {DEFAULT_PROP_SETTINGS,propSettings,readPropProfiles,writePropProfiles} from './activityProps.js';
test('prop settings reject unbounded or malformed values and whitelist display fields',()=>{
  for(const value of [null,{}, {visible:true,x:Infinity,y:0,scale:1},{visible:true,x:0,y:0,scale:2}])assert.deepEqual(propSettings(value),DEFAULT_PROP_SETTINGS);
  assert.deepEqual(propSettings({visible:false,x:3,y:-2,scale:.8,token:'secret'}),{visible:false,x:3,y:-2,scale:.8});
});
test('per-activity calibration persists independently, tolerates missing data and bounded storage failure',()=>{
  let raw;const storage={getItem:()=>raw,setItem:(_k,value)=>{raw=value;}};
  assert.deepEqual(readPropProfiles(storage).profiles,{});
  assert.equal(writePropProfiles(storage,{reading:{visible:true,x:3,y:4,scale:1.2,private:'secret'},dishes:{visible:false,x:0,y:0,scale:1}}),'');
  assert.equal(readPropProfiles(storage).profiles.reading.x,3);assert.equal(readPropProfiles(storage).profiles.dishes.visible,false);assert.ok(!raw.includes('secret'));
  raw='bad';assert.ok(readPropProfiles(storage).warning);assert.ok(writePropProfiles(null,{}));
});
