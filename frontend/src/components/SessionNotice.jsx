import {createPortal} from 'react-dom';

export function SessionNotice({target,children}){
  return target?createPortal(children,target):children;
}
