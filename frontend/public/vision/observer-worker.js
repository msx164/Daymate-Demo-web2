/* Classic Worker: MediaPipe's WASM loader uses importScripts. The ESM API is
 * imported dynamically from the installed, locally copied package. */
let detector=null,kind=null,loading=false;
self.onmessage=async({data})=>{
  if(data.type==='init'){
    if(loading||detector)return;
    loading=true;
    try{
      if(!['face','posture','objects'].includes(data.kind))throw Error('Invalid task');
      kind=data.kind;
      const {FilesetResolver,FaceDetector,FaceLandmarker,ObjectDetector}=await import('./vision_bundle.mjs');
      const files=await FilesetResolver.forVisionTasks(new URL('./wasm',self.location.href).href);
      const paths={face:'./face-detector.tflite',posture:'./face-landmarker.task',objects:'./object-detector.tflite'};
      const options={baseOptions:{modelAssetPath:new URL(paths[kind],self.location.href).href,delegate:'CPU'},runningMode:'VIDEO',minDetectionConfidence:.6};
      if(kind==='posture'){
        delete options.minDetectionConfidence;
        Object.assign(options,{numFaces:2,outputFacialTransformationMatrixes:true,minFaceDetectionConfidence:.6,minFacePresenceConfidence:.6});
      }
      if(kind==='objects'){
        delete options.minDetectionConfidence;
        // Keep candidates for all UI profiles; the panel applies its selected
        // threshold without recreating the detector. Default UI remains .55.
        Object.assign(options,{categoryAllowlist:['cell phone','book','laptop'],scoreThreshold:.4,maxResults:10});
      }
      detector=await ({face:FaceDetector,posture:FaceLandmarker,objects:ObjectDetector})[kind].createFromOptions(files,options);
      self.postMessage({type:'ready'});
    }catch{self.postMessage({type:'error'});}
    return;
  }
  if(data.type!=='frame')return;
  const {bitmap,id,timestamp}=data;
  try{
    if(!detector)throw Error('Not ready');
    const start=performance.now(),result=detector.detectForVideo(bitmap,timestamp);
    const count=kind==='posture'?result.faceLandmarks.length:result.detections.length;
    // No landmarks, pixels or full model output cross back to the UI.
    const matrix=kind==='posture'&&count===1?Array.from(result.facialTransformationMatrixes[0]?.data||[]):null;
    const objects=kind==='objects'?result.detections.flatMap(d=>d.categories.filter(c=>['cell phone','book','laptop'].includes(c.categoryName)).map(c=>({label:c.categoryName,score:c.score}))):undefined;
    self.postMessage({type:'result',id,count,matrix,objects,durationMs:performance.now()-start});
  }catch{self.postMessage({type:'error'});}
  finally{bitmap?.close();}
};
