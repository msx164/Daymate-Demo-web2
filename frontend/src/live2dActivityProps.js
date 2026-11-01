import { activityId } from './companionActivities.js';
import { propSettings } from './activityProps.js';
import { activityRhythm } from './activityRhythm.js';
// Foreground props use the same frame and clock as the model; no second animation loop.
export function drawActivityProps(context, { activity, width, height, figureHeight, seconds, animated, settings, clear=true, opacity=1 }) {
  if (!context) return;
  if(clear)context.clearRect(0,0,width,height);
  activity = activityId(activity);
  const props=propSettings(settings);
  if (activity === 'idle' || !props.visible) return;
  const {t,sweep:wave,turn,keys,wash,washY}=activityRhythm(seconds,animated);
  const unit = figureHeight / 400, top = (height - figureHeight) / 2;
  context.save();context.globalAlpha=Math.max(0,Math.min(1,opacity)); context.translate(width/2+figureHeight*props.x/100, top+figureHeight*.5+figureHeight*props.y/100);
  context.scale(unit*props.scale,unit*props.scale);context.translate(0,-200);
  context.lineWidth = 2; context.lineJoin = 'round'; context.lineCap = 'round'; context.strokeStyle = '#695a80';
  const path = (points, fill) => { context.beginPath(); points.forEach(([x,y],i)=>i?context.lineTo(x,y):context.moveTo(x,y)); context.closePath(); if(fill){context.fillStyle=fill;context.fill();}context.stroke(); };
  const rect = (x,y,w,h,fill,r=4) => {context.beginPath();context.roundRect(x,y,w,h,r);context.fillStyle=fill;context.fill();context.stroke();};
  const line = (x,y,a,b,color) => {context.beginPath();context.strokeStyle=color||'#695a80';context.moveTo(x,y);context.lineTo(a,b);context.stroke();};
  const circle = (x,y,r,fill) => {context.beginPath();context.arc(x,y,r,0,Math.PI*2);context.fillStyle=fill;context.fill();context.stroke();};
  if(activity==='reading') {
    context.translate(0,202); context.rotate(Math.sin(t*.55)*.015);
    path([[-64,-22],[-7,-14],[0,-8],[7,-14],[64,-22],[59,29],[7,36],[0,30],[-7,36],[-59,29]],'#8b76bd');
    path([[-58,-18],[-7,-11],[0,-5],[0,25],[-8,29],[-54,22]],'#fffaf0');
    path([[58,-18],[7,-11],[0,-5],[0,25],[8,29],[54,22]],'#fffaf0');
    for(let i=0;i<4;i++){line(-47,-5+i*7,-12,0+i*7,'#d9c8ad');line(12,0+i*7,47,-5+i*7,'#d9c8ad');}
    if(turn>.01) path([[0,-5],[turn*43,-17],[turn*40,20],[0,25]],'#fffef8');
  } else if(activity==='working') {
    context.translate(0,-30);
    rect(-80,244,160,10,'#ccb5a0');line(-65,254,-65,313);line(65,254,65,313);
    path([[-58,179],[53,179],[61,231],[-50,231]],'#5e668d');
    path([[-51,185],[47,185],[53,224],[-44,224]],'#d9ecf6');
    line(-37,195,0,195,'#91adca');line(-35,202,25,202,'#91adca');line(-33,209,11,209,'#91adca');
    path([[-50,231],[61,231],[74,243],[-72,243]],'#c4cadc');
    for(let i=0;i<8;i++)line(-47+i*13,235,-41+i*13,239,keys*Math.sin(i+1)>.2?'#8a78b6':'#aeb9cf');
  } else if(activity==='cleaning') {
    context.translate(40+wave*7,205);context.rotate(wave*.1);
    rect(6,-30,6,162,'#b99b78',3);path([[-12,128],[26,128],[38,158],[-25,158]],'#ddc48e');
    for(let i=0;i<7;i++)line(-12+i*6,133,-22+i*9,157,'#b49a67');
    for(let i=0;i<3;i++) {const x=-45+i*22+wave*4;line(x,362-205,x+7,362-205,'#c8b2d7');}
  } else if(activity==='dishes') {
    rect(-83,251,166,36,'#bfd7de',10);rect(-75,246,150,12,'#e9f4f6',5);
    context.lineWidth=5;context.beginPath();context.strokeStyle='#8dabb6';context.moveTo(57,246);context.lineTo(57,207);context.quadraticCurveTo(57,183,38,183);context.quadraticCurveTo(22,183,22,202);context.stroke();context.lineWidth=2;
    for(let i=0;i<3;i++)line(19+i*4,208,19+i*4,241,'#83c3db');
    context.strokeStyle='#739cb2';circle(-14,223,32,'#fcfdfb');circle(-14,223,24,'#edf3f4');
    const x=-14+wash*10,y=223+washY*6;
    rect(x-12,y-7,24,14,'#e6d786',4);line(x-9,y+5,x+8,y+5,'#83bdaa');
    for(let i=0;i<3;i++)circle(-57+i*18,236-Math.sin(t*1.5+i)*5,3+i*.5,'#ffffffbb');
  } else if(activity==='stretching') {
    context.strokeStyle='#8ba89e';rect(-80,376,160,13,'#c9dfd4',6);
  } else if(activity==='resting') {
    rect(40,247,45,8,'#ccb5a0');line(62,255,62,299);
    rect(49,225,21,22,'#e2d8ef');context.beginPath();context.arc(72,235,6,-Math.PI/2,Math.PI/2);context.stroke();
    for(let i=0;i<2;i++)line(54+i*9+Math.sin(t+i),220,56+i*9,210,'#bcabc8');
  }
  context.restore();
}
