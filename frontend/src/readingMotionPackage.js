import {checkLive2DPackage} from './live2dPackage.js';
export async function loadReadingMotion({fetcher=fetch,signal}={}){
  const base='/reading-preview/v2/';
  const index=await fetcher(base+'assets.json',{signal});if(!index.ok)throw Error('阅读动作资源清单不可用。');
  const inventory=await index.json();
  if(inventory?.version!==1||!Array.isArray(inventory.resources)||inventory.resources.length<4||inventory.resources.length>16)throw Error('阅读动作资源清单无效。');
  const names=new Set();
  for(const resource of inventory.resources){
    if(typeof resource?.name!=='string'||!/^\w[\w./-]*\.(json|moc3|png|txt)$/.test(resource.name)||resource.name.includes('..')||resource.name.includes('//')||names.has(resource.name)||!/^[a-f0-9]{64}$/.test(resource.sha256))throw Error('阅读动作资源路径或指纹无效。');
    names.add(resource.name);
  }
  const files=new Map();let total=0;
  for(const resource of inventory.resources){
    const response=await fetcher(base+resource.name,{signal});if(!response.ok)throw Error('阅读动作资源读取失败。');
    const bytes=await response.arrayBuffer();total+=bytes.byteLength;
    if(bytes.byteLength>16*1024*1024||total>64*1024*1024)throw Error('阅读动作资源超出预算。');
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),value=>value.toString(16).padStart(2,'0')).join('');
    if(hash!==resource.sha256)throw Error('阅读动作资源指纹不符，请重新构建。');
    files.set(resource.name,new File([bytes],resource.name));
  }
  const checked=await checkLive2DPackage(files);if(!checked.ok||checked.motions.length!==1)throw Error(checked.message||'阅读动作无效。');
  return {files,clip:checked.motions[0].id};
}
