import { activityId } from './companionActivities.js';
export const PROP_SETTINGS_KEY='daymate.activityProps.v1';
export const DEFAULT_PROP_SETTINGS=Object.freeze({visible:true,x:0,y:0,scale:1});
export function validPropSettings(value) {
  return !!value && typeof value.visible==='boolean' && Number.isFinite(value.x) && value.x>=-25 && value.x<=25
    && Number.isFinite(value.y) && value.y>=-25 && value.y<=25 && Number.isFinite(value.scale) && value.scale>=.5 && value.scale<=1.5;
}
export function propSettings(value) { return validPropSettings(value)?{visible:value.visible,x:value.x,y:value.y,scale:value.scale}:{...DEFAULT_PROP_SETTINGS}; }
export function readPropProfiles(storage) {
  try {
    const raw=storage?.getItem(PROP_SETTINGS_KEY);if(!raw)return {profiles:{},warning:''};
    const data=JSON.parse(raw);if(data.version!==1 || !data.profiles || typeof data.profiles!=='object' || Array.isArray(data.profiles))throw Error();
    const profiles={};
    for(const [id,value] of Object.entries(data.profiles))if(activityId(id)===id && validPropSettings(value))profiles[id]=propSettings(value);
    return {profiles,warning:''};
  }catch{return {profiles:{},warning:'道具设置无法读取，已恢复默认。'};}
}
export function writePropProfiles(storage,profiles) {
  try {
    if(!storage)throw Error();
    const values={};for(const [id,value] of Object.entries(profiles))if(activityId(id)===id && validPropSettings(value))values[id]=propSettings(value);
    storage.setItem(PROP_SETTINGS_KEY,JSON.stringify({version:1,profiles:values}));return '';
  }catch{return '道具设置未能保存，本次调整仍有效。';}
}
