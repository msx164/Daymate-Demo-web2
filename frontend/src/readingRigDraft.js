// Source atlas regions, not an exported Cubism rig or parameter bindings.
export const READING_RIG_DRAFT=Object.freeze({
  width:1536,height:1024,status:'needs_review',
  layers:[
    {id:'body',label:'躯干与头部',rect:[40,0,380,1024],review:'v2 已去掉重复袖口。检查肩部接合与补画后的胸口；头部尚未独立拆分。'},
    {id:'support',label:'持书前臂',rect:[520,120,480,380],review:'需匹配肘部与掌心握点；手指尚未与前臂分层。'},
    {id:'turn-hand',label:'翻页前臂',rect:[1060,170,470,320],review:'捏页姿态待调整；拇指、食指需要遮挡层。'},
    {id:'book',label:'打开的书',rect:[430,600,470,310],review:'需继续拆分书封、左右页、书脊；当前是一张完整书图。'},
    {id:'page',label:'翻动书页',rect:[930,610,160,260],review:'曲面页尚需对齐书脊和翻页手的接触点。'},
    {id:'rest-hand',label:'回位前臂',rect:[1090,550,430,370],review:'回到持书姿态时需验证袖口、手腕和书边连续性。'},
  ],
});
