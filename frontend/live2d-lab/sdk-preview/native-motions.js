import { CubismMotion } from '@framework/motion/cubismmotion';
import { CubismMotionManager } from '@framework/motion/cubismmotionmanager';
import { CubismFramework } from '@framework/live2dcubismframework';
import { createNativePlayer as createPlayer } from '../../src/nativeMotionPlayer.js';
export function createNativePlayer(options) {
  return createPlayer({...options,createMotion:buffer=>{
    const motion=CubismMotion.create(buffer,buffer.byteLength,undefined,undefined,true);
    // Standalone motions require these arrays even when no external blink/lip-sync effect is configured.
    motion?.setEffectIds([],[]);return motion;
  },
    createManager:()=>new CubismMotionManager(),parameterIndex:(model,name)=>model.getParameterIndex(CubismFramework.getIdManager().getId(name))});
}
