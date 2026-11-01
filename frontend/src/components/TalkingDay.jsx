import {useEffect,useState} from 'react';
import {useConversation} from '../companionConversation.js';
import {visemeShape} from '../lipSync.js';
import day from '../assets/companion/day-v1.png';
export function TalkingDay({x=501,y=179}){
  const {speech}=useConversation();const [shape,setShape]=useState({open:0,width:1});
  useEffect(()=>{
    let frame,previous=performance.now();const started=previous,target=visemeShape(speech.viseme);
    const sample=now=>{
      const delta=Math.min(80,now-previous);previous=now;
      const wanted=speech.phase==='speaking'&&now-started<(speech.visemeDuration||120)+100?target:{open:0,width:1};
      const factor=1-Math.exp(-delta/55);
      setShape(old=>({open:old.open+(wanted.open-old.open)*factor,width:old.width+(wanted.width-old.width)*factor}));
      if(now-started<1500)frame=requestAnimationFrame(sample);
    };frame=requestAnimationFrame(sample);return()=>cancelAnimationFrame(frame);
  },[speech.viseme,speech.lipTick,speech.phase,speech.visemeDuration]);
  const height=shape.open*14,width=17*shape.width;
  return <svg className="talking-day" viewBox="0 0 1024 1536" role="img" aria-label="Day · 同步 2D 口型" data-mouth-open={shape.open.toFixed(3)} data-lip-source={speech.lipSource}>
    <image href={day} width="1024" height="1536"/>
    <g transform={`translate(${x} ${y}) rotate(12)`} opacity={Math.min(1,shape.open*8)}>
      <ellipse cx="0" cy="1" rx="21" ry="9" fill="#f3cbb6"/>
      <path d={`M ${-width} -1 Q 0 -4 ${width} -1 Q 0 ${height*2} ${-width} -1`} fill="#603332" stroke="#b16e65" strokeWidth="1.4"/>
      <path d={`M ${-width*.7} 0 Q 0 3 ${width*.7} 0`} stroke="#fff0dd" strokeWidth={Math.max(0,2.2*shape.open)} fill="none"/>
      <ellipse cy={height*.6} rx={width*.45} ry={height*.18} fill="#c88183"/>
    </g>
  </svg>;
}
