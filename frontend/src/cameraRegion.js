export const CAMERA_REGIONS=Object.freeze({
  full:{label:'全画面',x:0,y:0,width:1,height:1},
  desk:{label:'桌面下半区',x:0,y:.5,width:1,height:.5},
  left:{label:'左半区',x:0,y:0,width:.5,height:1},
  right:{label:'右半区',x:.5,y:0,width:.5,height:1},
});
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
export function normalizeCameraRegion(value){
  if(!value||!['x','y','width','height'].every(key=>Number.isFinite(value[key])))return{x:0,y:0,width:1,height:1};
  const x=clamp(value.x,0,.9),y=clamp(value.y,0,.9);
  return{x,y,width:Math.min(1-x,clamp(value.width,.1,1)),height:Math.min(1-y,clamp(value.height,.1,1))};
}
export function cameraRegionPreset(value){
  const region=normalizeCameraRegion(value);
  return Object.keys(CAMERA_REGIONS).find(key=>['x','y','width','height'].every(field=>Math.abs(CAMERA_REGIONS[key][field]-region[field])<.000001))||'custom';
}
export function cameraRegionCrop(width,height,region){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)throw Error('Video dimensions unavailable');
  const r=normalizeCameraRegion(region),sx=Math.floor(r.x*width),sy=Math.floor(r.y*height);
  const sw=Math.max(1,Math.min(width-sx,Math.round(r.width*width))),sh=Math.max(1,Math.min(height-sy,Math.round(r.height*height)));
  const scale=Math.min(1,640/Math.max(sw,sh));
  return{sx,sy,sw,sh,resizeWidth:Math.max(1,Math.round(sw*scale)),resizeHeight:Math.max(1,Math.round(sh*scale))};
}
export function captureCameraRegion(element,region,makeBitmap=createImageBitmap){
  const {sx,sy,sw,sh,resizeWidth,resizeHeight}=cameraRegionCrop(element.videoWidth,element.videoHeight,region);
  return makeBitmap(element,sx,sy,sw,sh,{resizeWidth,resizeHeight,resizeQuality:'low'});
}
