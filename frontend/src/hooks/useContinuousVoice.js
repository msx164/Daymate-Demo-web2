import { useEffect, useState, useSyncExternalStore } from 'react';
import { createContinuousVoice } from '../continuousVoice.js';
import {watchDuplexSpeech} from '../duplexCapture.js';
import {createSentenceSpeech} from '../sentenceSpeech.js';
export function useContinuousVoice(turn,chat,speech) {
  const [controller]=useState(()=>createContinuousVoice({turn,chat,speech,sentencePlayer:createSentenceSpeech({chat,speech}),watchDuplex:watchDuplexSpeech,canContinue:async()=>{
    if(document.hidden)return false;
    return await window.daymateDesktop?.getVisibility?.()!==false;
  }}));
  const view=useSyncExternalStore(controller.subscribe,controller.getSnapshot);
  useEffect(()=>{controller.connect();return()=>controller.dispose();},[controller]);
  return {...view,controller};
}
