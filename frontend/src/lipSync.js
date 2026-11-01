export function visemeShape(value){
  if(!Number.isInteger(value)||value<0||value>21||[0,21].includes(value))return{open:0,width:1};
  if([7,8,9,10].includes(value))return{open:.75,width:.65};
  if([1,2,3,4,5,11].includes(value))return{open:1,width:1};
  if([18,19,20].includes(value))return{open:.2,width:.9};
  return{open:.45,width:1.05};
}
