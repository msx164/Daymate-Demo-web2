import {READING_RIG_DRAFT} from './readingRigDraft.js';
// Authored source and destination pivots keep assembly independent of viewport size.
export const READING_ASSEMBLY=Object.freeze({width:1024,height:1536,layers:[
  {id:'body',name:'topwear',source:[0,0],target:[160,0],scale:1.5,angle:0},
  {id:'support',name:'handwear_left',source:[570,150],target:[335,275],scale:.7,angle:25},
  {id:'rest-hand',name:'handwear_right',source:[1400,590],target:[605,293],scale:.65,angle:-35},
  {id:'book',name:'objects',source:[660,760],target:[512,480],scale:.55,angle:0},
  {id:'support',name:'hand_left_front',source:[570,150],target:[335,275],scale:.7,angle:25,crop:[830,350,170,110]},
  {id:'rest-hand',name:'hand_right_front',source:[1400,590],target:[605,293],scale:.65,angle:-35,crop:[1090,735,210,150]},
]});
export const READING_ANIMATED_ASSEMBLY=Object.freeze({...READING_ASSEMBLY,layers:[
  ...READING_ASSEMBLY.layers.slice(0,4),
  {id:'page',name:'page_right',source:[950,650],target:[512,430],scale:.55,angle:0,initialOpacity:0},
  {id:'page',name:'page_left',source:[950,650],target:[512,430],scale:.55,angle:0,flipX:true,initialOpacity:0},
  ...READING_ASSEMBLY.layers.slice(4),
]});
export function drawReadingLayer(context,image,layer){
  const region=READING_RIG_DRAFT.layers.find(value=>value.id===layer.id);
  if(!region)throw Error('Unknown reading layer');
  const [x,y,w,h]=layer.crop||region.rect;
  context.save();context.translate(...layer.target);context.rotate(layer.angle*Math.PI/180);context.scale(layer.scale,layer.scale);
  if(layer.flipX)context.scale(-1,1);
  context.drawImage(image,x,y,w,h,x-layer.source[0],y-layer.source[1],w,h);context.restore();
}
export function drawReadingAssembly(context,image,layers=READING_ASSEMBLY.layers){
  context.clearRect(0,0,READING_ASSEMBLY.width,READING_ASSEMBLY.height);
  for(const layer of layers){
    if(layer.initialOpacity===undefined)drawReadingLayer(context,image,layer);
    else{context.save();context.globalAlpha=layer.initialOpacity;drawReadingLayer(context,image,layer);context.restore();}
  }
}
