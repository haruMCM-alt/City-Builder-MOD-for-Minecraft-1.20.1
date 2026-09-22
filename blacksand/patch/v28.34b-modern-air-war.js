/* =========================================================================
   v28.34β — 現代戦アップデート
   1. AeroForge：Blenderの操作手順をそのままコードにした機体モデル工房
   2. SkyWar   ：完全新規ストーリー「空を取り戻せ」（無人機とF-15のパイロット）
   3. DroneOps ：MQ-9型無人機の遠隔操作（偵察・精密攻撃・目標指示）
   4. JetOps   ：F-15の操縦（訓練・BVR迎撃・格闘戦・護衛・最終決戦）
   5. QualityX ：ウルトラ画質 ～ ゴミスペモード（影とポリゴン以外を全部切る）
   6. FrameGen ：将来のフレーム生成の設計メモ（この版では未実装）
   ========================================================================= */

/* ---------------- 1. AeroForge ----------------
   機体は外部モデルを読み込まず、Blenderの操作と同じ手順で組み立てる。
     loft()  … 円を並べて「ブリッジエッジループ」で胴体にする
     plate() … 平面を押し出して（Extrude Region）主翼・尾翼にする
     spin()  … 断面を軸回転（Spin）させてノズル・レドーム・センサー球にする
     mirror  … ミラーモディファイアと同じ左右対称化
   同じ設計表（blueprints）からBlender用のPythonスクリプトも書き出せるので、
   ゲーム内の形とBlenderで開いた形が必ず一致する。 */
const AeroForge={
 mats:{},ready:false,
 mat(color,opt={}){
  const key=color+'|'+JSON.stringify(opt);
  if(!this.mats[key]){
   const m=new THREE.MeshStandardMaterial({color,roughness:opt.rough??.58,metalness:opt.metal??.42,
    transparent:!!opt.transparent,opacity:opt.opacity??1,side:opt.side||THREE.FrontSide,
    emissive:opt.emissive||0,emissiveIntensity:opt.emissiveIntensity??1,flatShading:!!opt.flat});
   m.color.convertSRGBToLinear();if(opt.emissive)m.emissive.convertSRGBToLinear();
   m.name='AeroForge_'+color.toString(16);this.mats[key]=m;
  }
  return this.mats[key];
 },
 /* ---- Blender: Add Circle × N → Bridge Edge Loops ----
    sections=[{z, y, w, h, n, e}]  w/h は半径、e は角のとがり（1=楕円, 2以上=角ばる） */
 loft(sections,opt={}){
  const seg=opt.seg||12,pos=[],idx=[],rings=[];
  const ring=(s)=>{
   const pts=[];
   for(let i=0;i<seg;i++){
    const a=i/seg*Math.PI*2,c=Math.cos(a),si=Math.sin(a),e=s.e||1.6;
    const fx=Math.sign(c)*Math.pow(Math.abs(c),2/e),fy=Math.sign(si)*Math.pow(Math.abs(si),2/e);
    pts.push([fx*(s.w||.001),(s.y||0)+fy*(s.h||.001),s.z]);
   }
   return pts;
  };
  for(const s of sections){const r=ring(s),base=pos.length/3;for(const p of r)pos.push(p[0],p[1],p[2]);rings.push(base);}
  for(let k=0;k<rings.length-1;k++){
   const a=rings[k],b=rings[k+1];
   for(let i=0;i<seg;i++){
    const j=(i+1)%seg;
    idx.push(a+i,b+i,b+j, a+i,b+j,a+j);      // ブリッジエッジループ
   }
  }
  /* 両端をふさぐ（Blenderの Grid Fill / Merge at Center 相当） */
  const cap=(s,base,flip)=>{
   const c=pos.length/3;pos.push(0,(s.y||0),s.z);
   for(let i=0;i<seg;i++){const j=(i+1)%seg;flip?idx.push(c,base+j,base+i):idx.push(c,base+i,base+j);}
  };
  if(opt.capFront!==false)cap(sections[0],rings[0],true);
  if(opt.capBack!==false)cap(sections[sections.length-1],rings[rings.length-1],false);
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setIndex(idx);g.computeVertexNormals();g.name='loft';
  return g;
 },
 /* ---- Blender: Add Plane → Extrude Region（厚み付け） ----
    outline=[[x,z]...]（上から見た形）, th=厚み, dihedral=上反角, twist=ねじり */
 plate(outline,th,opt={}){
  const pos=[],idx=[],n=outline.length,dih=opt.dihedral||0,twist=opt.twist||0,span=opt.span||1;
  const lift=(x)=>Math.abs(x)*Math.tan(dih*Math.PI/180);
  const thick=(x)=>th*(1-Math.min(.75,Math.abs(x)/span*(opt.taper??.55)));
  for(const [x,z] of outline){
   const y=lift(x)+z*Math.sin(twist*Math.PI/180)*Math.abs(x)/span,t=thick(x);
   pos.push(x,y+t/2,z);
  }
  for(const [x,z] of outline){
   const y=lift(x)+z*Math.sin(twist*Math.PI/180)*Math.abs(x)/span,t=thick(x);
   pos.push(x,y-t/2,z);
  }
  for(let i=1;i<n-1;i++){idx.push(0,i,i+1);idx.push(n,n+i+1,n+i);}
  for(let i=0;i<n;i++){const j=(i+1)%n;idx.push(i,n+i,n+j, i,n+j,j);}
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setIndex(idx);g.computeVertexNormals();g.name='plate';
  return g;
 },
 /* ---- Blender: Spin（断面をY軸まわりに回す） ---- profile=[[r,y]...] */
 spin(profile,opt={}){
  const seg=opt.seg||14,pos=[],idx=[],rows=[];
  for(const [r,y] of profile){
   const base=pos.length/3;
   for(let i=0;i<seg;i++){const a=i/seg*Math.PI*2;pos.push(Math.cos(a)*r,y,Math.sin(a)*r);}
   rows.push(base);
  }
  for(let k=0;k<rows.length-1;k++){
   const a=rows[k],b=rows[k+1];
   for(let i=0;i<seg;i++){const j=(i+1)%seg;idx.push(a+i,b+i,b+j, a+i,b+j,a+j);}
  }
  const first=profile[0],last=profile[profile.length-1];
  if(first[0]>.001){const c=pos.length/3;pos.push(0,first[1],0);for(let i=0;i<seg;i++){const j=(i+1)%seg;idx.push(c,rows[0]+j,rows[0]+i);}}
  if(last[0]>.001){const c=pos.length/3;pos.push(0,last[1],0);const b=rows[rows.length-1];for(let i=0;i<seg;i++){const j=(i+1)%seg;idx.push(c,b+i,b+j);}}
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setIndex(idx);g.computeVertexNormals();g.name='spin';
  return g;
 },
 /* 設計表：JSとBlender用Pythonの両方がこの表だけを見る */
 blueprints:{
  /* ===== F-15J イーグル（プレイヤー機／全長19.4m 相当） ===== */
  f15:{name:'F-15J EAGLE',scale:1,parts:[
   {op:'loft',color:0x8d99a3,name:'fuselage',seg:14,sections:[
    {z:-9.7,w:.05,h:.05},{z:-8.8,w:.42,h:.34,y:-.05},{z:-7.4,w:.86,h:.62,y:-.02},{z:-5.8,w:1.15,h:.82},
    {z:-3.4,w:1.42,h:.95,y:.05},{z:-.8,w:1.55,h:1.0,y:.08},{z:2.2,w:1.5,h:.96,y:.05},
    {z:5.0,w:1.34,h:.86},{z:7.4,w:1.1,h:.74,y:-.02},{z:9.0,w:.9,h:.66,y:-.02}]},
   {op:'plate',color:0x8d99a3,name:'wing',outline:[[1.2,-3.0],[7.6,1.4],[7.6,2.6],[1.2,3.4]],th:.42,dihedral:-.6,span:7.6,mirror:true,pos:[0,-.18,0]},
   {op:'plate',color:0x828e98,name:'stabilator',outline:[[1.1,5.6],[5.4,7.9],[5.4,8.9],[1.1,8.4]],th:.26,span:5.4,mirror:true,pos:[0,-.1,0]},
   {op:'plate',color:0x828e98,name:'fin',outline:[[.1,4.2],[.1,8.6],[1.1,8.9],[2.6,8.6],[2.6,5.4]],th:.26,span:2.6,mirror:true,rot:[0,0,Math.PI/2],pos:[1.05,1.1,0]},
   {op:'loft',color:0x76828c,name:'intake',seg:8,mirror:true,pos:[1.45,-.28,0],sections:[
    {z:-4.6,w:.52,h:.72},{z:-3.6,w:.62,h:.86},{z:-.5,w:.66,h:.9},{z:3.2,w:.62,h:.86}]},
   {op:'spin',color:0x4c4f4d,name:'nozzle',seg:12,mirror:true,pos:[.78,-.18,8.6],rot:[Math.PI/2,0,0],profile:[[.62,-.9],[.7,-.2],[.66,.35],[.52,.9]]},
   {op:'spin',color:0xff9a4d,name:'burner',seg:10,mirror:true,pos:[.78,-.18,9.35],rot:[Math.PI/2,0,0],
    profile:[[.5,-.4],[.34,.9],[.12,2.3]],glow:true},
   {op:'loft',color:0x2c3f4a,name:'canopy',seg:12,glass:true,pos:[0,.86,0],sections:[
    {z:-6.5,w:.16,h:.1},{z:-5.6,w:.52,h:.38},{z:-4.4,w:.62,h:.48},{z:-2.9,w:.6,h:.44},{z:-2.0,w:.42,h:.2}]},
   {op:'loft',color:0x30353a,name:'radome',seg:12,pos:[0,-.05,0],sections:[
    {z:-9.9,w:.03,h:.03},{z:-9.2,w:.3,h:.26},{z:-8.6,w:.44,h:.38}]},
   {op:'plate',color:0x6d7780,name:'pylon',outline:[[3.0,-.9],[3.34,-.9],[3.34,1.9],[3.0,1.9]],th:.7,span:3.4,mirror:true,pos:[0,-.62,0]},
   {op:'spin',color:0xb7b3a4,name:'missile',seg:10,mirror:true,pos:[3.18,-1.0,-.4],rot:[Math.PI/2,0,0],
    profile:[[.02,-1.9],[.16,-1.5],[.18,1.3],[.12,1.8]]},
   {op:'spin',color:0x8b9198,name:'tank',seg:12,pos:[0,-1.25,1.2],rot:[Math.PI/2,0,0],
    profile:[[.05,-3.2],[.42,-2.3],[.46,1.8],[.18,3.0]]}
  ]},
  /* ===== MQ-9型 無人機「サンドパイパー」 ===== */
  mq9:{name:'MQ-9 SANDPIPER',scale:1,parts:[
   {op:'loft',color:0xb9b6a6,name:'fuselage',seg:12,sections:[
    {z:-5.6,w:.28,h:.3,y:.05},{z:-5.0,w:.62,h:.66,y:.1},{z:-3.6,w:.72,h:.78,y:.06},
    {z:-1.2,w:.6,h:.62},{z:1.6,w:.42,h:.44},{z:4.2,w:.26,h:.28},{z:5.4,w:.14,h:.16}]},
   {op:'plate',color:0xc3c0b0,name:'wing',outline:[[.5,-1.2],[10.2,-.3],[10.2,.45],[.5,1.1]],th:.3,dihedral:1.5,span:10.2,mirror:true,pos:[0,.28,-.6]},
   {op:'plate',color:0xc3c0b0,name:'vtail',outline:[[.1,3.9],[.1,5.5],[1.0,5.6],[2.3,5.3],[2.3,4.4]],th:.2,span:2.3,mirror:true,rot:[0,0,Math.PI/2.55],pos:[.3,.2,0]},
   {op:'spin',color:0x9d9a8c,name:'sensorBall',seg:14,pos:[0,-.62,-4.5],profile:[[.05,-.62],[.34,-.48],[.46,-.2],[.46,.16],[.3,.4],[.05,.5]]},
   {op:'spin',color:0x2a3436,name:'sensorWindow',seg:12,pos:[0,-.98,-4.62],rot:[.5,0,0],glass:true,profile:[[.02,-.06],[.2,-.02],[.24,.06]]},
   {op:'plate',color:0x4a4a44,name:'prop',outline:[[.04,-.1],[1.55,-.24],[1.55,.24],[.04,.1]],th:.09,span:1.55,mirror:true,pos:[0,0,5.6]},
   {op:'spin',color:0x6f6d64,name:'spinner',seg:10,pos:[0,0,5.5],rot:[Math.PI/2,0,0],profile:[[.04,-.3],[.2,-.05],[.16,.3]]},
   {op:'plate',color:0x6d7780,name:'pylon',outline:[[2.2,-.5],[2.5,-.5],[2.5,1.1],[2.2,1.1]],th:.5,span:2.5,mirror:true,pos:[0,-.1,-.6]},
   {op:'spin',color:0x8d8a7d,name:'hellfire',seg:8,mirror:true,pos:[2.35,-.5,-1.0],rot:[Math.PI/2,0,0],
    profile:[[.02,-.85],[.1,-.62],[.11,.6],[.07,.85]]},
   {op:'spin',color:0xb9b6a6,name:'satdome',seg:12,pos:[0,.42,-4.0],profile:[[.05,0],[.36,.1],[.44,.32],[.24,.52],[.04,.58]]}
  ]},
  /* ===== 敵主力機（Su-27型）／ヴェスパ機は同型で塗装違い ===== */
  su27:{name:'ADVERSARY FLANKER',scale:1,parts:[
   {op:'loft',color:0x5b6b78,name:'fuselage',seg:14,sections:[
    {z:-10.6,w:.05,h:.05},{z:-9.4,w:.44,h:.4},{z:-7.6,w:.9,h:.72,y:.05},{z:-5.2,w:1.3,h:.92,y:.1},
    {z:-2.0,w:1.66,h:1.0,y:.12},{z:1.4,w:1.7,h:.96,y:.08},{z:5.2,w:1.4,h:.84},{z:8.8,w:1.05,h:.7}]},
   {op:'plate',color:0x5b6b78,name:'wing',outline:[[1.4,-3.6],[7.9,1.9],[7.9,3.0],[1.4,3.6]],th:.44,dihedral:-1.2,span:7.9,mirror:true,pos:[0,-.1,0]},
   {op:'plate',color:0x53616d,name:'stabilator',outline:[[1.2,5.4],[5.0,7.8],[5.0,8.8],[1.2,8.2]],th:.26,span:5.0,mirror:true,pos:[0,-.05,0]},
   {op:'plate',color:0x53616d,name:'fin',outline:[[.1,4.4],[.1,8.4],[1.0,8.8],[2.9,8.4],[2.9,5.6]],th:.24,span:2.9,mirror:true,rot:[0,.09,Math.PI/2],pos:[1.5,1.05,0]},
   {op:'spin',color:0x45484a,name:'nozzle',seg:12,mirror:true,pos:[.95,-.1,8.7],rot:[Math.PI/2,0,0],profile:[[.68,-.9],[.76,-.1],[.7,.5],[.56,1.0]]},
   {op:'spin',color:0xff9a4d,name:'burner',seg:10,mirror:true,pos:[.95,-.1,9.5],rot:[Math.PI/2,0,0],profile:[[.54,-.4],[.36,1.0],[.14,2.6]],glow:true},
   {op:'loft',color:0x263a44,name:'canopy',seg:12,glass:true,pos:[0,.92,0],sections:[
    {z:-7.2,w:.16,h:.1},{z:-6.2,w:.55,h:.4},{z:-4.8,w:.64,h:.5},{z:-3.2,w:.6,h:.44},{z:-2.2,w:.4,h:.18}]},
   {op:'loft',color:0x2c3033,name:'radome',seg:12,sections:[{z:-10.8,w:.03,h:.03},{z:-10.0,w:.34,h:.3},{z:-9.3,w:.48,h:.42}]},
   {op:'loft',color:0x4e5c67,name:'intake',seg:8,mirror:true,pos:[1.6,-.5,0],sections:[{z:-4.4,w:.6,h:.7},{z:-2.0,w:.66,h:.8},{z:2.6,w:.6,h:.72}]}
  ]},
  /* ===== C-130型 輸送機（護衛対象） ===== */
  c130:{name:'TRANSPORT HERCULES',scale:1,parts:[
   {op:'loft',color:0x7f8779,name:'fuselage',seg:14,sections:[
    {z:-14.0,w:.6,h:.9,y:.1},{z:-12.4,w:1.5,h:1.7},{z:-9.0,w:1.95,h:2.05},{z:2.0,w:1.95,h:2.05},
    {z:8.0,w:1.8,h:1.95},{z:13.0,w:1.0,h:1.5,y:.6},{z:15.5,w:.5,h:1.0,y:1.1}]},
   {op:'plate',color:0x7f8779,name:'wing',outline:[[1.6,-4.4],[20.0,-2.6],[20.0,-1.2],[1.6,-.4]],th:.9,dihedral:.5,span:20,mirror:true,pos:[0,1.9,0]},
   {op:'plate',color:0x767e70,name:'stabilizer',outline:[[1.0,12.0],[8.0,12.6],[8.0,14.2],[1.0,14.4]],th:.45,span:8,mirror:true,pos:[0,1.6,0]},
   {op:'plate',color:0x767e70,name:'fin',outline:[[.2,10.4],[.2,15.0],[2.0,15.2],[5.6,14.0],[5.6,11.6]],th:.4,span:5.6,rot:[0,0,Math.PI/2],pos:[2.0,2.1,0]},
   {op:'spin',color:0x5d635c,name:'engine',seg:10,mirror:true,pos:[5.4,1.6,-3.2],rot:[Math.PI/2,0,0],profile:[[.3,-2.6],[.8,-1.6],[.82,1.4],[.5,2.2]]},
   {op:'spin',color:0x5d635c,name:'engineOuter',seg:10,mirror:true,pos:[10.6,1.7,-2.6],rot:[Math.PI/2,0,0],profile:[[.3,-2.4],[.75,-1.5],[.78,1.3],[.48,2.0]]},
   {op:'plate',color:0x3b3f3a,name:'blade',outline:[[.1,-.2],[2.1,-.4],[2.1,.4],[.1,.2]],th:.14,span:2.1,mirror:true,pos:[5.4,1.6,-5.9]},
   {op:'plate',color:0x3b3f3a,name:'bladeOuter',outline:[[.1,-.2],[2.0,-.38],[2.0,.38],[.1,.2]],th:.14,span:2,mirror:true,pos:[10.6,1.7,-5.2]},
   {op:'loft',color:0x24323a,name:'cockpitGlass',seg:10,glass:true,pos:[0,1.5,0],sections:[{z:-13.6,w:.7,h:.4},{z:-12.6,w:1.2,h:.6},{z:-11.4,w:1.3,h:.6}]}
  ]},
  /* ===== 早期警戒機（円盤レーダー付き） ===== */
  awacs:{name:'AEW WINDOW',scale:1,parts:[
   {op:'loft',color:0xd6d9d2,name:'fuselage',seg:14,sections:[
    {z:-20.0,w:.7,h:.9},{z:-17.0,w:2.2,h:2.4},{z:-10.0,w:2.7,h:2.8},{z:8.0,w:2.7,h:2.8},
    {z:17.0,w:1.8,h:2.2,y:.6},{z:22.0,w:.6,h:1.1,y:1.4}]},
   {op:'plate',color:0xd0d3cc,name:'wing',outline:[[2.4,-3.0],[24.0,4.0],[24.0,6.4],[2.4,2.6]],th:1.1,dihedral:3,span:24,mirror:true,pos:[0,-1.2,0]},
   {op:'plate',color:0xd0d3cc,name:'stabilizer',outline:[[1.4,16.0],[9.5,18.2],[9.5,19.8],[1.4,19.0]],th:.5,span:9.5,mirror:true,pos:[0,1.0,0]},
   {op:'plate',color:0xd0d3cc,name:'fin',outline:[[.3,13.0],[.3,19.6],[2.4,20.0],[7.2,18.6],[7.2,15.0]],th:.5,span:7.2,rot:[0,0,Math.PI/2],pos:[2.6,2.6,0]},
   {op:'spin',color:0x6e7570,name:'engine',seg:10,mirror:true,pos:[8.0,-1.9,-3.0],rot:[Math.PI/2,0,0],profile:[[.5,-3.0],[1.25,-2.0],[1.3,2.0],[.8,3.0]]},
   {op:'spin',color:0x6e7570,name:'engineOuter',seg:10,mirror:true,pos:[15.0,-.4,1.0],rot:[Math.PI/2,0,0],profile:[[.5,-3.0],[1.2,-2.0],[1.25,2.0],[.8,3.0]]},
   {op:'spin',color:0x8e938d,name:'rotodome',seg:18,pos:[0,4.6,2.0],rot:[0,0,.06],profile:[[.1,-.5],[4.6,-.45],[5.2,0],[4.6,.45],[.1,.5]]},
   {op:'plate',color:0x5c635e,name:'domePylon',outline:[[-.5,-1.2],[.5,-1.2],[.5,1.2],[-.5,1.2]],th:2.6,span:1,pos:[0,3.3,2.0]}
  ]},
  /* ===== 巡航ミサイル（最終章で迎撃する目標） ===== */
  cruise:{name:'CRUISE MISSILE',scale:1,parts:[
   {op:'spin',color:0x8f9490,name:'body',seg:12,rot:[Math.PI/2,0,0],profile:[[.04,-3.1],[.3,-2.6],[.32,2.4],[.24,3.0]]},
   {op:'plate',color:0x7c817d,name:'wing',outline:[[.2,-.6],[1.5,-.3],[1.5,.25],[.2,.5]],th:.1,span:1.5,mirror:true},
   {op:'plate',color:0x7c817d,name:'tail',outline:[[.1,2.1],[.9,2.4],[.9,2.9],[.1,2.8]],th:.09,span:.9,mirror:true},
   {op:'spin',color:0xffb060,name:'exhaust',seg:8,rot:[Math.PI/2,0,0],pos:[0,0,3.2],profile:[[.2,-.1],[.12,.7],[.04,1.6]],glow:true}
  ]},
  /* ===== 地上目標：対空ミサイル発射機 と 捜索レーダー ===== */
  sam:{name:'SAM LAUNCHER',scale:1,parts:[
   {op:'loft',color:0x5f6a52,name:'hull',seg:8,sections:[{z:-4.2,w:1.3,h:.8},{z:-2.0,w:1.5,h:1.0},{z:2.6,w:1.5,h:1.0},{z:4.4,w:1.2,h:.8}]},
   {op:'plate',color:0x4e5847,name:'deck',outline:[[-1.6,-3.8],[1.6,-3.8],[1.6,4.2],[-1.6,4.2]],th:.3,span:1.6,pos:[0,1.0,0]},
   {op:'spin',color:0x6b7560,name:'tube',seg:8,mirror:true,pos:[.75,2.1,.4],rot:[-.45,0,0],profile:[[.3,-3.0],[.34,2.6],[.3,3.0]]},
   {op:'spin',color:0x3c433a,name:'wheel',seg:8,mirror:true,pos:[1.5,.5,-2.4],rot:[0,0,Math.PI/2],profile:[[.2,-.3],[.62,-.25],[.62,.25],[.2,.3]]},
   {op:'spin',color:0x3c433a,name:'wheelRear',seg:8,mirror:true,pos:[1.5,.5,2.4],rot:[0,0,Math.PI/2],profile:[[.2,-.3],[.62,-.25],[.62,.25],[.2,.3]]}
  ]},
  radar:{name:'SEARCH RADAR',scale:1,parts:[
   {op:'loft',color:0x59614f,name:'truck',seg:8,sections:[{z:-3.4,w:1.2,h:.9},{z:-1.0,w:1.4,h:1.1},{z:3.0,w:1.4,h:1.1},{z:4.0,w:1.1,h:.8}]},
   {op:'plate',color:0x8d9583,name:'dish',outline:[[-3.2,-.5],[3.2,-.5],[2.4,.5],[-2.4,.5]],th:.25,span:3.2,rot:[1.15,0,0],pos:[0,3.6,.6]},
   {op:'plate',color:0x4a5243,name:'mast',outline:[[-.3,-.3],[.3,-.3],[.3,.3],[-.3,.3]],th:2.6,span:.3,pos:[0,2.3,.6]},
   {op:'spin',color:0x33382f,name:'wheel',seg:8,mirror:true,pos:[1.4,.5,-1.8],rot:[0,0,Math.PI/2],profile:[[.2,-.3],[.6,-.25],[.6,.25],[.2,.3]]},
   {op:'spin',color:0x33382f,name:'wheelRear',seg:8,mirror:true,pos:[1.4,.5,2.0],rot:[0,0,Math.PI/2],profile:[[.2,-.3],[.6,-.25],[.6,.25],[.2,.3]]}
  ]},
  /* ===== 民間の車（誤爆を避ける対象） ===== */
  bus:{name:'CIVILIAN BUS',scale:1,parts:[
   {op:'loft',color:0xd8c98f,name:'body',seg:8,sections:[{z:-5.0,w:1.3,h:1.4},{z:-3.6,w:1.45,h:1.6},{z:3.8,w:1.45,h:1.6},{z:5.0,w:1.3,h:1.4}]},
   {op:'plate',color:0x2c3a40,name:'glass',outline:[[-1.4,-4.6],[1.4,-4.6],[1.4,-3.4],[-1.4,-3.4]],th:.9,span:1.4,glass:true,pos:[0,1.4,0]},
   {op:'spin',color:0x2a2a28,name:'wheel',seg:8,mirror:true,pos:[1.4,.55,-3.0],rot:[0,0,Math.PI/2],profile:[[.2,-.28],[.56,-.22],[.56,.22],[.2,.28]]},
   {op:'spin',color:0x2a2a28,name:'wheelRear',seg:8,mirror:true,pos:[1.4,.55,3.2],rot:[0,0,Math.PI/2],profile:[[.2,-.28],[.56,-.22],[.56,.22],[.2,.28]]}
  ]},
  truck:{name:'SUPPLY TRUCK',scale:1,parts:[
   {op:'loft',color:0x6a7059,name:'cab',seg:8,sections:[{z:-3.4,w:1.15,h:1.0},{z:-2.2,w:1.25,h:1.2},{z:-1.0,w:1.25,h:1.2}]},
   {op:'plate',color:0x5c6350,name:'bed',outline:[[-1.3,-.8],[1.3,-.8],[1.3,3.6],[-1.3,3.6]],th:1.5,span:1.3,pos:[0,1.4,0]},
   {op:'spin',color:0x2a2a28,name:'wheel',seg:8,mirror:true,pos:[1.25,.5,-2.4],rot:[0,0,Math.PI/2],profile:[[.18,-.26],[.52,-.2],[.52,.2],[.18,.26]]},
   {op:'spin',color:0x2a2a28,name:'wheelRear',seg:8,mirror:true,pos:[1.25,.5,2.4],rot:[0,0,Math.PI/2],profile:[[.18,-.26],[.52,-.2],[.52,.2],[.18,.26]]}
  ]}
 },
 geoCache:{},
 geometry(part){
  const key=part.op+'|'+(part.name||'')+'|'+JSON.stringify(part.sections||part.outline||part.profile)+'|'+part.th+'|'+part.seg+'|'+part.dihedral+'|'+part.span;
  if(!this.geoCache[key]){
   this.geoCache[key]=part.op==='loft'?this.loft(part.sections,{seg:part.seg})
    :part.op==='plate'?this.plate(part.outline,part.th,{dihedral:part.dihedral,span:part.span,twist:part.twist,taper:part.taper})
    :this.spin(part.profile,{seg:part.seg});
  }
  return this.geoCache[key];
 },
 /* 任務ごとに作り直す（MissionActionsが終了時に材質と形状を破棄するため） */
 reset(){this.mats={};this.geoCache={};},
 /* 設計表から機体を組み立てる。tintで塗装だけ差し替えられる */
 build(name,opt={}){
  const bp=this.blueprints[name];if(!bp)throw new Error('AeroForge: unknown airframe '+name);
  const root=new THREE.Group();root.name='AeroForge_'+name;
  const local={};
  /* unique:true の機体は材質を自分専用に持つ（赤外線表示などで個別に色を変えられる） */
  const pick=(color,o)=>{
   if(!opt.unique)return this.mat(color,o);
   const key=color+'|'+JSON.stringify(o);
   if(!local[key])local[key]=this.mat(color,o).clone();
   return local[key];
  };
  for(const part of bp.parts){
   const geo=this.geometry(part);
   const color=(opt.tint&&part.name!=='canopy'&&part.name!=='cockpitGlass'&&!part.glass&&!part.glow)
    ?(part.name.includes('fin')||part.name.includes('stabil')?opt.tint2||opt.tint:opt.tint):part.color;
   const mat=part.glow?pick(color,{emissive:color,emissiveIntensity:1.6,rough:.4,metal:0,transparent:true,opacity:.85})
    :part.glass?pick(color,{rough:.12,metal:.85,transparent:true,opacity:.62})
    :pick(color,{rough:part.name==='prop'||part.name==='blade'?.5:.58,metal:.42});
   const sides=part.mirror?[1,-1]:[1];
   for(const s of sides){
    const m=new THREE.Mesh(geo,mat);m.name=(part.mirror?(s>0?'R_':'L_'):'')+part.name;
    const p=part.pos||[0,0,0],r=part.rot||[0,0,0];
    m.position.set(p[0]*s,p[1],p[2]);m.rotation.set(r[0],r[1]*s,r[2]*s);
    if(s<0)m.scale.x=-1;                                   // ミラーモディファイア
    m.castShadow=false;m.receiveShadow=false;
    m.userData.part=part.name;root.add(m);
   }
  }
  if(bp.scale!==1)root.scale.setScalar(bp.scale);
  if(opt.scale)root.scale.multiplyScalar(opt.scale);
  root.userData.blender=true;root.userData.aeroforge=name;
  return root;
 },
 /* Blender 5.x 用のPythonスクリプト（同じ設計表から生成するので形が一致する） */
 script(){
  const L=[];
  L.push('# BLACKSAND : AFTERLIGHT  v28.34beta  /  AeroForge airframes');
  L.push('# Blender 5.x  >  Scripting  >  New  >  paste  >  Run');
  L.push('# loft = Add Circle xN + Bridge Edge Loops / plate = Add Plane + Extrude Region / spin = Spin');
  L.push('import bpy, bmesh, math');
  L.push('from mathutils import Vector');
  L.push('');
  L.push('def _mat(name, rgb, rough=0.58, metal=0.42, alpha=1.0, emit=0.0):');
  L.push('    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)');
  L.push('    m.use_nodes = True');
  L.push('    b = m.node_tree.nodes["Principled BSDF"]');
  L.push('    b.inputs["Base Color"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)');
  L.push('    b.inputs["Roughness"].default_value = rough');
  L.push('    b.inputs["Metallic"].default_value = metal');
  L.push('    if emit > 0.0:');
  L.push('        b.inputs["Emission Color"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)');
  L.push('        b.inputs["Emission Strength"].default_value = emit');
  L.push('    if alpha < 1.0:');
  L.push('        m.blend_method = "BLEND"');
  L.push('        b.inputs["Alpha"].default_value = alpha');
  L.push('    return m');
  L.push('');
  L.push('def _finish(bm, name, coll, mat, loc, rot, mirror):');
  L.push('    me = bpy.data.meshes.new(name)');
  L.push('    bm.to_mesh(me); bm.free()');
  L.push('    ob = bpy.data.objects.new(name, me)');
  L.push('    coll.objects.link(ob)');
  L.push('    ob.location = Vector(loc)');
  L.push('    ob.rotation_euler = rot');
  L.push('    ob.data.materials.append(mat)');
  L.push('    for p in ob.data.polygons: p.use_smooth = True');
  L.push('    if mirror:');
  L.push('        md = ob.modifiers.new("Mirror", "MIRROR")');
  L.push('        md.use_axis[0] = True');
  L.push('    return ob');
  L.push('');
  L.push('def loft(sections, seg, name, coll, mat, loc, rot, mirror):');
  L.push('    bm = bmesh.new(); rings = []');
  L.push('    for s in sections:');
  L.push('        ring = []');
  L.push('        for i in range(seg):');
  L.push('            a = i / seg * math.tau; c = math.cos(a); si = math.sin(a); e = s.get("e", 1.6)');
  L.push('            fx = math.copysign(abs(c) ** (2 / e), c); fy = math.copysign(abs(si) ** (2 / e), si)');
  L.push('            ring.append(bm.verts.new((fx * s["w"], s.get("y", 0.0) + fy * s["h"], s["z"])))');
  L.push('        rings.append(ring)');
  L.push('    for k in range(len(rings) - 1):');
  L.push('        a, b = rings[k], rings[k + 1]');
  L.push('        for i in range(seg):');
  L.push('            j = (i + 1) % seg');
  L.push('            bm.faces.new((a[i], b[i], b[j], a[j]))   # bridge edge loops');
  L.push('    for ring, s in ((rings[0], sections[0]), (rings[-1], sections[-1])):');
  L.push('        bm.faces.new(ring)                            # cap (grid fill)');
  L.push('    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])');
  L.push('    return _finish(bm, name, coll, mat, loc, rot, mirror)');
  L.push('');
  L.push('def plate(outline, th, span, dihedral, name, coll, mat, loc, rot, mirror):');
  L.push('    bm = bmesh.new()');
  L.push('    verts = []');
  L.push('    for x, z in outline:');
  L.push('        y = abs(x) * math.tan(math.radians(dihedral))');
  L.push('        verts.append(bm.verts.new((x, y, z)))');
  L.push('    face = bm.faces.new(verts)                        # add plane');
  L.push('    bmesh.ops.recalc_face_normals(bm, faces=[face])');
  L.push('    r = bmesh.ops.extrude_face_region(bm, geom=[face])  # extrude region')
  L.push('    moved = [v for v in r["geom"] if isinstance(v, bmesh.types.BMVert)]');
  L.push('    bmesh.ops.translate(bm, verts=moved, vec=(0.0, -th, 0.0))');
  L.push('    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])');
  L.push('    return _finish(bm, name, coll, mat, loc, rot, mirror)');
  L.push('');
  L.push('def spin(profile, seg, name, coll, mat, loc, rot, mirror):');
  L.push('    bm = bmesh.new()');
  L.push('    verts = [bm.verts.new((r, y, 0.0)) for r, y in profile]');
  L.push('    edges = [bm.edges.new((verts[i], verts[i + 1])) for i in range(len(verts) - 1)]');
  L.push('    bmesh.ops.spin(bm, geom=verts + edges, axis=(0, 1, 0), cent=(0, 0, 0),');
  L.push('                   dvec=(0, 0, 0), angle=math.tau, steps=seg, use_merge=True)');
  L.push('    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])');
  L.push('    return _finish(bm, name, coll, mat, loc, rot, mirror)');
  L.push('');
  L.push('def build(key, parts):');
  L.push('    coll = bpy.data.collections.new(key)');
  L.push('    bpy.context.scene.collection.children.link(coll)');
  L.push('    for p in parts:');
  L.push('        mat = _mat(key + "_" + p["name"], p["rgb"], p.get("rough", 0.58), p.get("metal", 0.42),');
  L.push('                   p.get("alpha", 1.0), p.get("emit", 0.0))');
  L.push('        loc = p.get("loc", (0, 0, 0)); rot = p.get("rot", (0, 0, 0)); mir = p.get("mirror", False)');
  L.push('        if p["op"] == "loft":   loft(p["sections"], p.get("seg", 12), p["name"], coll, mat, loc, rot, mir)');
  L.push('        elif p["op"] == "plate": plate(p["outline"], p["th"], p.get("span", 1.0), p.get("dihedral", 0.0), p["name"], coll, mat, loc, rot, mir)');
  L.push('        else:                    spin(p["profile"], p.get("seg", 12), p["name"], coll, mat, loc, rot, mir)');
  L.push('');
  L.push('AIRFRAMES = {');
  const hex=c=>{const r=((c>>16)&255)/255,g=((c>>8)&255)/255,b=(c&255)/255;
   const lin=v=>v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4);
   return '('+lin(r).toFixed(4)+', '+lin(g).toFixed(4)+', '+lin(b).toFixed(4)+')';};
  for(const [key,bp] of Object.entries(this.blueprints)){
   L.push('  "'+key+'": [  # '+bp.name);
   for(const p of bp.parts){
    const bits=['"op": "'+p.op+'"','"name": "'+p.name+'"','"rgb": '+hex(p.color)];
    if(p.op==='loft')bits.push('"seg": '+(p.seg||12),'"sections": ['+p.sections.map(s=>'{"z": '+s.z+', "w": '+(s.w||.001)+', "h": '+(s.h||.001)+', "y": '+(s.y||0)+'}').join(', ')+']');
    if(p.op==='plate')bits.push('"outline": ['+p.outline.map(o=>'('+o[0]+', '+o[1]+')').join(', ')+']','"th": '+p.th,'"span": '+(p.span||1),'"dihedral": '+(p.dihedral||0));
    if(p.op==='spin')bits.push('"seg": '+(p.seg||12),'"profile": ['+p.profile.map(o=>'('+o[0]+', '+o[1]+')').join(', ')+']');
    if(p.pos)bits.push('"loc": ('+p.pos.join(', ')+')');
    if(p.rot)bits.push('"rot": ('+p.rot.map(v=>v.toFixed(4)).join(', ')+')');
    if(p.mirror)bits.push('"mirror": True');
    if(p.glass)bits.push('"alpha": 0.62','"rough": 0.12','"metal": 0.85');
    if(p.glow)bits.push('"emit": 1.6','"rough": 0.4','"metal": 0.0');
    L.push('    {'+bits.join(', ')+'},');
   }
   L.push('  ],');
  }
  L.push('}');
  L.push('');
  L.push('for key, parts in AIRFRAMES.items():');
  L.push('    build(key, parts)');
  L.push('print("AeroForge: %d airframes built" % len(AIRFRAMES))');
  return L.join('\n');
 },
 download(){
  const blob=new Blob([this.script()],{type:'text/x-python'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='BLACKSAND-AEROFORGE-v28.34b.py';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
 }
};
document.documentElement.dataset.aeroforge='blender-5.2.1-aeroforge-28.34b';

/* ---------------- 2. SkyWorld：空と地面の共通ステージ ----------------
   ドローン任務とF-15任務が同じ地形を使う。地形は決まった式で作るので、
   同じ座標には毎回同じ山と街ができる（ブリーフィングの座標と一致する）。 */
const SkyWorld={
 seed:20348,
 /* なめらかな擬似ノイズ（乱数を使わないので毎回同じ地形になる） */
 noise(x,z){
  const s=(a,b)=>Math.sin(a*12.9898+b*78.233)*43758.5453;
  const h=(a,b)=>{const v=s(a,b);return v-Math.floor(v);};
  const xi=Math.floor(x),zi=Math.floor(z),xf=x-xi,zf=z-zi;
  const u=xf*xf*(3-2*xf),v=zf*zf*(3-2*zf);
  const a=h(xi,zi),b=h(xi+1,zi),c=h(xi,zi+1),d=h(xi+1,zi+1);
  return (a*(1-u)+b*u)*(1-v)+(c*(1-u)+d*u)*v;
 },
 height(x,z){
  const n=this.noise(x/4200,z/4200)*1.0+this.noise(x/1500,z/1500)*.45+this.noise(x/520,z/520)*.16;
  let h=(n-.62)*2600;
  if(h<0)h*=.12;                                  // 海側はほぼ平ら
  const road=Math.exp(-Math.pow((x+900)/1800,2));  // 谷（道路が通る）
  return h*(1-road*.72);
 },
 mat(color,opt){return AeroForge.mat(color,opt);},
 skydome(scene,night){
  const cv=document.createElement('canvas');cv.width=8;cv.height=128;
  const x=cv.getContext('2d'),g=x.createLinearGradient(0,0,0,128);
  if(night){g.addColorStop(0,'#0a1626');g.addColorStop(.55,'#16283b');g.addColorStop(1,'#2d3a42');}
  else{g.addColorStop(0,'#1d4f80');g.addColorStop(.48,'#7fb0cc');g.addColorStop(.78,'#cfd9cf');g.addColorStop(1,'#d9cbab');}
  x.fillStyle=g;x.fillRect(0,0,8,128);
  const tex=new THREE.CanvasTexture(cv);tex.encoding=THREE.sRGBEncoding;
  const dome=new THREE.Mesh(new THREE.SphereGeometry(58000,18,12),
   new THREE.MeshBasicMaterial({map:tex,side:THREE.BackSide,depthWrite:false,depthTest:false,fog:false}));
  dome.name='skydome';dome.renderOrder=-1;dome.frustumCulled=false;   /* 背景として最初に塗る */
  scene.add(dome);return dome;
 },
 terrain(scene,size,seg,night){
  const geo=new THREE.PlaneGeometry(size,size,seg,seg);
  geo.rotateX(-Math.PI/2);
  const pos=geo.attributes.position,col=[];
  const sand=new THREE.Color(0xb4a071).convertSRGBToLinear(),
        rock=new THREE.Color(0x77705c).convertSRGBToLinear(),
        peak=new THREE.Color(0x9aa08d).convertSRGBToLinear(),
        sea =new THREE.Color(0x24506b).convertSRGBToLinear();
  const c=new THREE.Color();
  for(let i=0;i<pos.count;i++){
   const x=pos.getX(i),z=pos.getZ(i),h=this.height(x,z);
   pos.setY(i,h);
   if(h<2)c.copy(sea);else if(h<160)c.copy(sand).lerp(rock,h/300);else c.copy(rock).lerp(peak,Math.min(1,(h-160)/700));
   if(night)c.multiplyScalar(.42);
   col.push(c.r,c.g,c.b);
  }
  geo.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  geo.computeVertexNormals();
  const m=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.95,metalness:0,flatShading:true}));
  m.name='terrain';scene.add(m);return m;
 },
 clouds(scene,count,y,spread,night){
  const geo=new THREE.SphereGeometry(1,7,5);
  const mat=new THREE.MeshStandardMaterial({color:night?0x2e3b48:0xd8dee2,roughness:1,metalness:0,transparent:true,opacity:.72,depthWrite:false,fog:false});
  mat.color.convertSRGBToLinear();
  const im=new THREE.InstancedMesh(geo,mat,count),m=new THREE.Matrix4(),q=new THREE.Quaternion(),
   p=new THREE.Vector3(),s=new THREE.Vector3();
  for(let i=0;i<count;i++){
   const a=this.noise(i*3.1,7.7),b=this.noise(i*1.7,3.3),c=this.noise(i*5.3,11.1);
   p.set((a-.5)*spread,y+(c-.5)*y*.7,(b-.5)*spread);
   s.set(700+c*1600,120+a*160,600+b*1400);
   m.compose(p,q,s);im.setMatrixAt(i,m);
  }
  im.frustumCulled=false;im.name='clouds';scene.add(im);return im;
 },
 city(scene,cx,cz,count,night){
  const geo=new THREE.BoxGeometry(1,1,1);
  const mat=new THREE.MeshStandardMaterial({color:night?0x4a4f52:0xa19b8c,roughness:.9,metalness:.05,flatShading:true});
  mat.color.convertSRGBToLinear();
  const im=new THREE.InstancedMesh(geo,mat,count),m=new THREE.Matrix4(),q=new THREE.Quaternion(),
   p=new THREE.Vector3(),s=new THREE.Vector3();
  for(let i=0;i<count;i++){
   const a=this.noise(i*2.3,1.1),b=this.noise(i*4.7,9.3),c=this.noise(i*7.1,5.5);
   const x=cx+(a-.5)*2400,z=cz+(b-.5)*2400,h=40+c*150;
   p.set(x,this.height(x,z)+h/2,z);s.set(26+a*40,h,26+b*40);
   m.compose(p,q,s);im.setMatrixAt(i,m);
  }
  im.name='city';scene.add(im);return im;
 },
 /* 岩と低い丘：ズームしたときに地面の大きさがわかるようにする */
 rocks(scene,cx,cz,count,spread,night){
  const geo=new THREE.ConeGeometry(1,1,6);
  const mat=new THREE.MeshStandardMaterial({color:night?0x4b4a42:0x8c8168,roughness:.98,metalness:0,flatShading:true});
  mat.color.convertSRGBToLinear();
  const im=new THREE.InstancedMesh(geo,mat,count),m=new THREE.Matrix4(),q=new THREE.Quaternion(),
   e=new THREE.Euler(),p=new THREE.Vector3(),sc=new THREE.Vector3();
  for(let i=0;i<count;i++){
   const a=this.noise(i*1.9,4.4),b=this.noise(i*3.7,8.1),c=this.noise(i*6.1,2.2);
   const x=cx+(a-.5)*spread,z=cz+(b-.5)*spread,r=18+c*70;
   e.set(0,a*6.28,(c-.5)*.25);q.setFromEuler(e);
   p.set(x,this.height(x,z)+r*.32,z);sc.set(r,r*(.5+c*.8),r);
   m.compose(p,q,sc);im.setMatrixAt(i,m);
  }
  im.name='rocks';scene.add(im);return im;
 },
 /* 塀のある施設：目標のまわりに置くと、何を見ているか分かりやすい */
 compound(scene,x,z,night){
  const g=new THREE.Group();g.name='compound';
  const y=this.height(x,z);
  const wall=this.mat(night?0x5a5648:0x9a9078,{rough:.95,metal:0});
  for(const [dx,dz,w,d] of [[0,-90,180,4],[0,90,180,4],[-90,0,4,180],[90,0,4,180]]){
   const m=new THREE.Mesh(new THREE.BoxGeometry(w,7,d),wall);m.position.set(dx,3.5,dz);g.add(m);
  }
  for(const [dx,dz,w,h,d] of [[-40,-30,44,11,30],[30,20,56,9,36],[-20,45,30,8,22]]){
   const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),this.mat(night?0x585a50:0xa8a189,{rough:.9,metal:0}));
   m.position.set(dx,h/2,dz);g.add(m);
  }
  g.position.set(x,y,z);scene.add(g);return g;
 },
 runway(scene,x,z,heading,len,wide){
  const g=new THREE.Group();g.name='runway';
  const y=this.height(x,z);
  const strip=new THREE.Mesh(new THREE.PlaneGeometry(wide,len),this.mat(0x3b3d3c,{rough:.95,metal:0}));
  strip.rotation.x=-Math.PI/2;g.add(strip);
  for(let i=-Math.floor(len/2/120);i<=Math.floor(len/2/120);i++){
   const dash=new THREE.Mesh(new THREE.PlaneGeometry(3,60),this.mat(0xe4e2d6,{rough:.9,metal:0}));
   dash.rotation.x=-Math.PI/2;dash.position.set(0,.4,i*120);g.add(dash);
  }
  for(const side of [-1,1]){
   const edge=new THREE.Mesh(new THREE.PlaneGeometry(2.2,len),this.mat(0xd8d3bc,{rough:.9,metal:0}));
   edge.rotation.x=-Math.PI/2;edge.position.set(side*wide/2,.4,0);g.add(edge);
  }
  const apron=new THREE.Mesh(new THREE.PlaneGeometry(wide*2.4,420),this.mat(0x46474a,{rough:.95,metal:0}));
  apron.rotation.x=-Math.PI/2;apron.position.set(wide*1.5,.2,-len*.22);g.add(apron);
  for(let i=0;i<4;i++){
   const hangar=new THREE.Mesh(new THREE.BoxGeometry(120,34,90),this.mat(0x6f7369,{rough:.9}));
   hangar.position.set(wide*1.5+(i-1.5)*150,17,-len*.22+180);g.add(hangar);
  }
  g.position.set(x,y+.2,z);g.rotation.y=heading;
  scene.add(g);g.userData.y=y;return g;
 },
 build(MA,opt={}){
  const night=!!opt.night;
  MA.makeWorld(night);
  const scene=MA.scene3D;
  scene.background=new THREE.Color(night?0x0d1a2a:0x6f9dbd);
  scene.fog=new THREE.Fog(night?0x14212f:0xa9bec6,opt.fogNear??6000,opt.fogFar??46000);
  scene.children.filter(o=>o.isLight).forEach(l=>scene.remove(l));
  const hemi=new THREE.HemisphereLight(night?0x30455e:0xbcd6e8,night?0x14181c:0x6b6046,night?.55:.9);
  scene.add(hemi);
  const sun=new THREE.DirectionalLight(night?0x9fb6d8:0xffe4b8,night?.7:1.45);
  sun.position.set(-8000,9000,4000);scene.add(sun);
  MA.camera3D.near=2;MA.camera3D.far=opt.far??120000;MA.camera3D.fov=opt.fov??58;MA.camera3D.updateProjectionMatrix();
  this.skydome(scene,night);
  this.terrain(scene,opt.size??120000,opt.seg??72,night);
  this.clouds(scene,opt.clouds??46,opt.cloudY??3200,90000,night);
  this.city(scene,opt.cityX??-14000,opt.cityZ??-22000,opt.cityCount??70,night);
  if(opt.rocks)this.rocks(scene,opt.rockX??0,opt.rockZ??0,opt.rocks,opt.rockSpread??26000,night);
  if(opt.compounds)for(const [x,z] of opt.compounds)this.compound(scene,x,z,night);
  SkyFX.init(scene);
  return scene;
 }
};

/* 爆発・煙・曳光弾：1つのインスタンスメッシュで全部描く（描画回数を増やさない） */
const SkyFX={
 pool:null,parts:[],cap:190,
 init(scene){
  const geo=new THREE.SphereGeometry(1,7,5);
  const mat=new THREE.MeshBasicMaterial({transparent:true,opacity:.95,depthWrite:false,
   blending:THREE.AdditiveBlending,fog:false});
  this.pool=new THREE.InstancedMesh(geo,mat,this.cap);
  this.pool.frustumCulled=false;this.pool.name='SkyFX';
  this.parts=[];this.m=new THREE.Matrix4();this.q=new THREE.Quaternion();
  this.v=new THREE.Vector3();this.s=new THREE.Vector3();this.c=new THREE.Color();
  /* 色の属性は最初のフレームより前に作る（あとから足すと反映されない） */
  for(let i=0;i<this.cap;i++){this.m.makeScale(0,0,0);this.pool.setMatrixAt(i,this.m);this.pool.setColorAt(i,this.c.setHex(0xffffff));}
  scene.add(this.pool);
 },
 spawn(pos,size,life,color,vel){
  if(!this.pool)return;
  if(this.parts.length>=this.cap)this.parts.shift();
  this.parts.push({p:pos.clone(),v:vel?vel.clone():new THREE.Vector3(),r:size,life,max:life,color});
 },
 boom(pos,size){
  this.spawn(pos,size,.55,0xfff0c0);
  for(let i=0;i<7;i++)this.spawn(pos,size*(.4+Math.random()*.6),.9+Math.random(),0xd8703c,
   new THREE.Vector3((Math.random()-.5)*size*2.4,(Math.random()*.6)*size*1.6,(Math.random()-.5)*size*2.4));
  for(let i=0;i<5;i++)this.spawn(pos,size*.9,1.9+Math.random(),0x6d6a66,
   new THREE.Vector3((Math.random()-.5)*size,Math.random()*size*.8,(Math.random()-.5)*size));
 },
 trail(pos,size,color){this.spawn(pos,size,.85,color||0xbfc6c4);},
 update(dt){
  if(!this.pool)return;
  const m=this.m,q=this.q,v=this.v,s=this.s,c=this.c;
  for(let i=this.parts.length-1;i>=0;i--){
   const p=this.parts[i];p.life-=dt;
   if(p.life<=0){this.parts.splice(i,1);continue;}
   p.p.addScaledVector(p.v,dt);
  }
  for(let i=0;i<this.cap;i++){
   const p=this.parts[i];
   if(!p){m.makeScale(0,0,0);this.pool.setMatrixAt(i,m);continue;}
   const t=p.life/p.max,grow=p.r*(1.35-t*.5);
   v.copy(p.p);s.setScalar(grow);m.compose(v,q,s);
   this.pool.setMatrixAt(i,m);
   c.setHex(p.color).convertSRGBToLinear().multiplyScalar(Math.pow(t,1.3));
   this.pool.setColorAt(i,c);
  }
  this.pool.instanceMatrix.needsUpdate=true;
  if(this.pool.instanceColor)this.pool.instanceColor.needsUpdate=true;
 },
 clear(){this.parts.length=0;}
};

/* 弾とミサイルの当たり判定：1フレームで進む距離が当たり判定より大きいと
   すり抜けるので、点ではなく「前の位置→今の位置」の線分との距離で見る。 */
const SkySweep={
 _ab:new THREE.Vector3(),_p:new THREE.Vector3(),
 dist(a,b,p){
  const ab=this._ab.copy(b).sub(a),len=ab.lengthSq();
  if(len<1e-6)return a.distanceTo(p);
  const t=Math.max(0,Math.min(1,this._p.copy(p).sub(a).dot(ab)/len));
  return this._p.copy(a).addScaledVector(ab,t).distanceTo(p);
 }
};

/* 3Dの座標を1000x600のHUD面へ写す（目標枠やリードの表示に使う） */
const SkyProject={
 v:new THREE.Vector3(),
 to(camera,pos){
  this.v.copy(pos).project(camera);
  return {x:(this.v.x*.5+.5)*1000,y:(-this.v.y*.5+.5)*600,z:this.v.z,on:this.v.z<1&&this.v.z>-1&&Math.abs(this.v.x)<1.25&&Math.abs(this.v.y)<1.25};
 }
};

/* ---------------- 3. DroneOps：MQ-9型無人機の遠隔操作 ----------------
   画面そのものがセンサー（カメラ）の映像。右上の小窓に機体の外観が映る。
   操作　機体：W/S 高度・A/D 旋回・Shift/Ctrl 速度・O 自動旋回
   　　　センサー：矢印キーかドラッグで首振り・Q/E ズーム・T 追尾・R 赤外線
   　　　攻撃：F 長押しでレーザー照射・Space 発射・X 中止・M 目標をマーク */
(function(){
 const MA=MissionActions;

 MA.catalog.drone={name:'無人機を操作',en:'06 / SANDPIPER',subtitle:'高度5千mの目',color:'#9fd6b4',
  lead:'MQ-9型無人機「サンドパイパー」を遠隔操作する。カメラで地上を探し、敵の対空レーダーと発射機を見つけて、味方に位置を知らせる。攻撃する回では、レーザーで目標を照らしてから撃つ。',
  steps:['監視空域に入り、地上を捜索する','目標を識別して、マークまたは攻撃する','損害を確認して離脱する'],
  controls:'W/S：高度　A/D：旋回　Shift/Ctrl：速度　O：自動旋回　矢印キーかドラッグ：カメラの首振り　Q/E：ズーム　T：追尾　R：赤外線カメラ　F長押し：レーザー照射　Space：発射　X：中止　M：目標をマーク',
  reward:'偵察の結果は味方の航空隊に渡される。'};

 const D={
  /* 任務ごとの設定 */
  variants:[
   {title:'偵察：敵の対空網をさがす',limit:300,alt:[3000,7000],marks:3,civil:2,attack:false,aaa:false,
    brief:'敵の対空レーダー3か所を見つけてマークする。学校と給水車は民間。まちがってマークしない。'},
   {title:'精密攻撃：移動する発射機',limit:330,alt:[2500,6500],marks:0,civil:1,attack:true,kills:2,aaa:false,
    brief:'道を走る発射機2両をレーザーで照らして破壊する。近くを走る民間バスに被害を出してはいけない。'},
   {title:'目標指示：味方F-15を導く',limit:210,alt:[3500,7500],marks:3,civil:1,attack:false,aaa:true,
    brief:'目標3つを識別して味方編隊に知らせる。高度3500m以下に降りると対空機関砲に撃たれる。'}
  ]
 };
 MA.droneVariants=D.variants;

 MA.setupDrone=function(){
  const v=D.variants[this.variant]||D.variants[0],s=this.s;
  AeroForge.reset();
  /* 監視空域は狭いので、地形は小さく細かく作る（ズームしても形が残る） */
  SkyWorld.build(this,{night:this.variant===1,size:44000,seg:150,far:60000,fov:26,
   fogNear:7000,fogFar:34000,cloudY:2600,clouds:26,cityX:-12000,cityZ:-13000,cityCount:48,
   rocks:220,rockSpread:22000,compounds:[[-2600,-1800],[1400,-5200],[-400,2600]]});
  const world=this.scene3D;
  const start=new THREE.Vector3(2600,v.alt[0]+900,3400);
  const toArea=new THREE.Vector3(0,0,0).sub(start);
  Object.assign(s,{step:0,v,alt:v.alt[0]+900,spd:78,bank:0,orbit:true,
   hdg:Math.atan2(toArea.x,-toArea.z)+Math.PI/2,
   saz:Math.atan2(toArea.x,-toArea.z),
   sel:Math.atan2(start.y,Math.hypot(toArea.x,toArea.z)),
   fov:26,ir:false,track:null,laser:0,laserTarget:null,
   hp:100,hell:4,shots:[],targets:[],marked:0,mistakes:0,rounds:0,bda:0,limit:v.limit,
   pos:start,sp:new THREE.Vector3(),warn:0,aaaT:2,
   contacts:0,destroyed:0,message:''});

  /* 機体（AeroForge製） */
  const drone=AeroForge.build('mq9',{scale:2.2});
  drone.name='sandpiper';world.add(drone);s.drone=drone;
  s.prop=drone.children.filter(o=>o.userData.part==='prop');

  /* 目標エリア：道路と、その脇の施設 */
  const area=new THREE.Vector3(0,0,0);
  s.area=area;
  const road=new THREE.Mesh(new THREE.PlaneGeometry(26,26000),AeroForge.mat(0x4a463c,{rough:.95,metal:0}));
  road.rotation.x=-Math.PI/2;road.position.set(-900,SkyWorld.height(-900,0)+1.2,0);world.add(road);
  s.road=road;

  const place=(kind,x,z,opt={})=>{
   const y=SkyWorld.height(x,z);
   const model=AeroForge.build(kind==='bus'?'bus':kind==='truck'?'truck':kind==='radar'?'radar':'sam',
    {scale:kind==='radar'?1.6:1.5,unique:true});
   model.position.set(x,y,z);model.rotation.y=opt.rot||0;world.add(model);
   const t={kind,model,pos:model.position,civilian:!!opt.civilian,ident:0,identified:false,
    marked:false,dead:false,label:opt.label||'',speed:opt.speed||0,path:opt.path||null,hot:kind!=='bus'};
   s.targets.push(t);
   /* 赤外線で白く光る部分（車体のエンジン側） */
   model.traverse(o=>{if(o.isMesh)o.userData.irHot=t.hot;});
   return t;
  };

  if(this.variant===0){
   place('radar',-2600,-1800,{label:'捜索レーダー A',rot:.4});
   place('radar',1400,-5200,{label:'捜索レーダー B',rot:-.8});
   place('sam',-400,2600,{label:'発射機 C',rot:1.2});
   place('bus',-900,-700,{civilian:true,label:'民間バス（学校）',speed:14,path:{axis:'z',from:-7000,to:7000}});
   place('truck',-880,4200,{civilian:true,label:'給水車（民間）',speed:9,path:{axis:'z',from:-6000,to:6000}});
   place('truck',2900,900,{label:'弾薬車'});
  }else if(this.variant===1){
   place('sam',-900,-3000,{label:'発射機 1',speed:12,path:{axis:'z',from:-9000,to:6000}});
   place('sam',-900,-4100,{label:'発射機 2',speed:12,path:{axis:'z',from:-10100,to:4900}});
   place('bus',-900,-6400,{civilian:true,label:'民間バス',speed:16,path:{axis:'z',from:-12000,to:9000}});
   place('truck',2200,-2400,{label:'補給車'});
  }else{
   place('radar',-3400,-2600,{label:'目標1／管制レーダー',rot:.7});
   place('sam',900,-4400,{label:'目標2／発射機',rot:-.3});
   place('sam',-2200,3100,{label:'目標3／発射機',rot:1.9});
   place('bus',-900,1200,{civilian:true,label:'民間車',speed:15,path:{axis:'z',from:-5000,to:8000}});
   /* 対空機関砲（高度が低いと撃ってくる） */
   s.aaa=[[-1800,-1200],[600,-3000],[-2600,2200]].map(([x,z])=>{
    const g=AeroForge.build('sam',{scale:1.2,tint:0x4c5343});
    g.position.set(x,SkyWorld.height(x,z),z);world.add(g);return g.position;
   });
  }
  s.contacts=s.targets.length;

  /* 味方F-15（目標指示の回だけ、指示後に飛来する） */
  if(this.variant===2){
   s.strike=AeroForge.build('f15',{scale:1.6});
   s.strike.visible=false;world.add(s.strike);
  }
  /* 外観用の小窓カメラ */
  this.pipCam=new THREE.PerspectiveCamera(42,1.5,1,40000);
  this.droneMissiles=[];
  this.touchKeys=[['上昇','KeyW'],['降下','KeyS'],['左','KeyA'],['右','KeyD'],
   ['ズーム+','KeyQ'],['ズーム-','KeyE'],['照射','KeyF'],['発射','Space'],['マーク','KeyM']];
  this.droneTools();this.touchPad();
  this.initialMessage=v.brief;
  this.updateDrone(0);
 };

 MA.droneTools=function(){
  const s=this.s;
  this.tools([
   ['自動旋回 ON / OFF',()=>{s.orbit=!s.orbit;this.message(s.orbit?'いま見ている地点のまわりを自動で旋回する。':'自動旋回を解除した。A/Dで旋回する。');}],
   ['赤外線 / 可視光',()=>{s.ir=!s.ir;SkyIR.apply(this.scene3D,s.ir);this.message(s.ir?'赤外線カメラ。熱を持つ車両が白く見える。':'可視光カメラに戻した。');}],
   ['追尾 ON / OFF',()=>this.droneTrack()],
   ['目標をマーク / M',()=>this.droneMark()]
  ]);
 };

 /* 視線の向き（世界座標） */
 MA.droneDir=function(){
  const s=this.s,ce=Math.cos(s.sel);
  return new THREE.Vector3(Math.sin(s.saz)*ce,-Math.sin(s.sel),-Math.cos(s.saz)*ce);
 };
 /* 視線が地面にあたる点 */
 MA.droneGround=function(){
  const s=this.s,d=this.droneDir(),out=new THREE.Vector3();
  let h=0;
  for(let i=0;i<3;i++){
   const t=(s.pos.y-h)/Math.max(.05,-d.y);
   out.copy(s.pos).addScaledVector(d,t);
   h=SkyWorld.height(out.x,out.z);
  }
  out.y=h;return out;
 };
 MA.droneTrack=function(){
  const s=this.s;
  if(s.track){s.track=null;this.message('追尾をやめた。カメラは手動になる。');return;}
  const t=this.droneAim();
  if(!t){this.message('十字の中に目標がない。矢印キーでカメラを合わせてから追尾する。');return;}
  s.track=t;this.message('「'+(t.identified?t.label:'未識別の目標')+'」を追尾。機体が動いてもカメラが離れない。');
 };
 /* 十字にいちばん近い目標 */
 MA.droneAim=function(){
  const s=this.s,d=this.droneDir(),lim=s.fov*Math.PI/180*.22;
  let best=null,bang=lim;
  for(const t of s.targets){
   if(t.dead)continue;
   const v=t.pos.clone().sub(s.pos).normalize(),ang=v.angleTo(d);
   if(ang<bang){bang=ang;best=t;}
  }
  return best;
 };
 MA.droneMark=function(){
  const s=this.s,v=s.v;
  if(v.attack){this.message('この任務はマークではなく攻撃する。Fでレーザー照射→Spaceで発射。');return;}
  const t=this.droneAim();
  if(!t){this.message('十字の中に目標がない。');return;}
  if(!t.identified){this.message('まだ識別できていない。ズーム（Q）で寄って、十字を目標に重ねて止める。');return;}
  if(t.marked){this.message('その目標はもうマークしてある。');return;}
  t.marked=true;
  if(t.civilian){
   s.mistakes++;s.hp-=0;this.message('民間の車をマークした。取り消して報告しなおす。マーク失敗＋1');
   Feedback.chord([220,180],.2,.03);t.marked=false;return;
  }
  s.marked++;Feedback.chord([520,700],.16,.03);
  this.message('「'+t.label+'」をマーク（'+s.marked+' / '+v.marks+'）。座標を味方に送った。');
  if(this.variant===2)this.droneCallStrike(t);
  if(s.marked>=v.marks){s.step=2;this.message('目標をすべて知らせた。損害を確認して離脱する。');}
 };
 MA.droneCallStrike=function(t){
  const s=this.s;
  s.strikeQueue=(s.strikeQueue||[]);
  s.strikeQueue.push({t,delay:4+s.strikeQueue.length*3});
 };

 /* レーザー誘導弾 */
 MA.droneFire=function(){
  const s=this.s;
  if(!s.v.attack){this.message('この任務では武器を使わない。');return;}
  if(s.hell<=0){this.message('搭載した誘導弾を撃ちつくした。');return;}
  if(!s.laserTarget||s.laser<2.5){this.message('先にFを長押しして、レーザーで目標を2.5秒照らし続ける。');return;}
  const t=s.laserTarget;
  const geo=AeroForge.spin([[.02,-1.2],[.13,-.8],[.14,.8],[.09,1.2]],{seg:8});
  const body=new THREE.Mesh(geo,AeroForge.mat(0x8f8b7e,{rough:.5}));
  body.scale.setScalar(2.2);body.rotation.x=Math.PI/2;
  const g=new THREE.Group();g.add(body);g.position.copy(s.pos);this.scene3D.add(g);
  const dir=t.pos.clone().sub(s.pos).normalize();
  this.droneMissiles.push({m:g,pos:g.position,vel:dir.multiplyScalar(480),t:0,target:t,lost:0,aborted:false,
   prev:g.position.clone()});
  s.hell--;s.shots.push(this.elapsed);
  Feedback.chord([320,240],.22,.04);
  this.message('発射。着弾までレーザーを外さない。民間が入ったらXで中止する。');
 };
 MA.droneAbort=function(){
  const s=this.s;
  for(const sh of this.droneMissiles)if(!sh.aborted){sh.aborted=true;sh.vel.y+=60;}
  if(this.droneMissiles.length){this.message('誘導を切って外した。人の被害は出していない。');s.rounds++;}
 };

 MA.updateDrone=function(dt){
  const s=this.s,k=this.keys,v=s.v;
  /* ---- 機体 ---- */
  const turn=((k.KeyD?1:0)-(k.KeyA?1:0));
  if(s.orbit){                       /* 一定の傾きで円を描き続ける（標準的な監視旋回） */
   s.hdg+=.05*dt;
   s.bank+=(.42-s.bank)*Math.min(1,dt*2);
  }else{
   s.hdg+=turn*.24*dt;s.bank+=(turn*.55-s.bank)*Math.min(1,dt*2.4);
  }
  s.spd=clamp(s.spd+((k.ShiftLeft||k.ShiftRight?9:0)-(k.ControlLeft||k.ControlRight?9:0))*dt,52,96);
  const climb=((k.KeyW?1:0)-(k.KeyS?1:0))*7.5;
  s.alt=clamp(s.alt+climb*dt,300,9000);
  s.pos.y+=(s.alt-s.pos.y)*Math.min(1,dt*.9);
  s.pos.x+=Math.sin(s.hdg)*s.spd*dt;s.pos.z+=-Math.cos(s.hdg)*s.spd*dt;
  if(s.drone){
   s.drone.position.copy(s.pos);
   s.drone.rotation.set(0,s.hdg,0);s.drone.rotateZ(-s.bank*.5);
   for(const p of s.prop)p.rotation.z+=dt*34;
  }
  /* ---- センサー ---- */
  const sensSpeed=s.fov/26*.8+.12;
  if(!s.track){
   s.saz+=((k.ArrowRight?1:0)-(k.ArrowLeft?1:0))*sensSpeed*dt;
   s.sel=clamp(s.sel+((k.ArrowDown?1:0)-(k.ArrowUp?1:0))*sensSpeed*dt,.08,1.5);
  }else if(!s.track.dead){
   const d=s.track.pos.clone().sub(s.pos);
   s.saz=Math.atan2(d.x,-d.z);
   s.sel=clamp(Math.atan2(-d.y,Math.hypot(d.x,d.z)),.05,1.5);
  }else s.track=null;
  if(k.KeyQ)s.fov=clamp(s.fov-dt*14,.9,26);
  if(k.KeyE)s.fov=clamp(s.fov+dt*14,.9,26);
  const cam=this.camera3D;
  cam.fov=s.fov;cam.updateProjectionMatrix();
  const ball=s.pos.clone().add(new THREE.Vector3(0,-1.4,0));
  cam.position.copy(ball);
  cam.lookAt(ball.clone().add(this.droneDir().multiplyScalar(1000)));
  /* 小窓（外観） */
  if(this.pipCam){
   const back=new THREE.Vector3(Math.sin(s.hdg),0,-Math.cos(s.hdg)).multiplyScalar(-46);
   this.pipCam.position.copy(s.pos).add(back).add(new THREE.Vector3(14,9,0));
   this.pipCam.lookAt(s.pos);
  }
  s.sp.copy(this.droneGround());

  if(dt===0)return;
  s.limit-=dt;
  SkyFX.update(dt);

  /* ---- 目標の移動 ---- */
  for(const t of s.targets){
   if(t.dead||!t.path||!t.speed)continue;
   const p=t.model.position;
   p.z+=t.speed*dt;
   if(p.z>t.path.to)p.z=t.path.from;
   p.y=SkyWorld.height(p.x,p.z);
   t.model.rotation.y=Math.PI;
  }
  /* ---- 識別 ---- */
  const aim=this.droneAim(),range=aim?s.pos.distanceTo(aim.pos):0;
  for(const t of s.targets)if(t!==aim&&!t.identified)t.ident=Math.max(0,t.ident-dt*.4);
  if(aim&&!aim.identified){
   const ok=s.fov<=9&&range<11000;
   aim.ident=clamp(aim.ident+(ok?dt/2.2:-dt*.5),0,1);
   if(aim.ident>=1){
    aim.identified=true;Feedback.chord([660,880],.12,.02);
    this.message('識別：'+aim.label+(aim.civilian?'（民間・攻撃禁止）':'（敵）'));
    if(s.step===0)s.step=1;
   }
  }
  /* ---- レーザー照射 ---- */
  if(v.attack){
   if(k.KeyF&&aim&&aim.identified&&!aim.civilian){
    if(s.laserTarget!==aim){s.laserTarget=aim;s.laser=0;}
    s.laser+=dt;
   }else if(k.KeyF&&aim&&aim.civilian){
    s.laserTarget=null;s.laser=0;s.warn=1.2;
   }else{
    s.laser=Math.max(0,s.laser-dt*1.6);
    if(s.laser<=0)s.laserTarget=null;
   }
  }
  /* ---- 飛翔中の誘導弾 ---- */
  for(let i=this.droneMissiles.length-1;i>=0;i--){
   const sh=this.droneMissiles[i];sh.t+=dt;
   if(!sh.aborted&&sh.target&&!sh.target.dead&&s.laserTarget===sh.target&&k.KeyF){
    /* 見越し追尾：走っている車の少し前を狙う */
    const spd=sh.vel.length(),d=sh.target.pos.distanceTo(sh.pos);
    const lead=sh.target.pos.clone();
    if(sh.target.speed)lead.z+=sh.target.speed*Math.min(9,d/spd);
    const want=lead.sub(sh.pos).normalize().multiplyScalar(spd);
    sh.vel.lerp(want,Math.min(1,dt*(d<900?9:2.6)));sh.lost=0;
   }else{sh.lost+=dt;sh.vel.y-=9.8*dt;}
   sh.prev.copy(sh.pos);
   sh.pos.addScaledVector(sh.vel,dt);
   sh.m.lookAt(sh.pos.clone().add(sh.vel));
   if(sh.t>.1&&sh.t%.08<dt)SkyFX.trail(sh.pos,7,0xbcc0bd);
   const groundY=SkyWorld.height(sh.pos.x,sh.pos.z);
   const hit=sh.target&&!sh.target.dead&&SkySweep.dist(sh.prev,sh.pos,sh.target.pos)<30;
   if(hit||sh.pos.y<=groundY||sh.t>48){
    const at=hit?sh.target.pos.clone():sh.pos.clone().setY(groundY);
    SkyFX.boom(at,26);
    this.scene3D.remove(sh.m);this.droneMissiles.splice(i,1);
    /* 近くの民間車に被害が出たか */
    let harm=null;
    for(const t of s.targets)if(t.civilian&&!t.dead&&t.pos.distanceTo(at)<90)harm=t;
    if(harm){this.finish(false,'民間の車のすぐそばに着弾した。交戦規定（ROE）違反。バスが通り過ぎるまで待ち、Xで中止する判断も使える。');return;}
    if(hit&&sh.lost<.75){
     sh.target.dead=true;sh.target.model.visible=false;s.destroyed++;
     Feedback.chord([420,300,220],.26,.05);
     this.message('命中：'+sh.target.label+'（'+s.destroyed+' / '+v.kills+'）');
     if(s.destroyed>=v.kills){s.step=2;s.bda=0;this.message('発射機を全部つぶした。10秒間、現場を撮影して被害を確認する（BDA）。');}
    }else{s.rounds++;this.message('外れた。レーザーを着弾まで外さないこと。残り'+s.hell+'発');}
   }
  }
  /* ---- 味方F-15による攻撃（目標指示の回） ---- */
  if(s.strikeQueue&&s.strikeQueue.length){
   const job=s.strikeQueue[0];job.delay-=dt;
   if(s.strike){
    s.strike.visible=true;
    const t=job.t.pos;
    const prog=clamp(1-job.delay/7,0,1);
    s.strike.position.set(t.x-2600*(1-prog),t.y+1400-900*prog,t.z+3000*(1-prog));
    s.strike.lookAt(t);
   }
   if(job.delay<=0){
    SkyFX.boom(job.t.pos,34);
    if(!job.t.dead){job.t.dead=true;job.t.model.visible=false;s.destroyed++;}
    this.message('味方F-15が「'+job.t.label+'」を破壊した。');
    s.strikeQueue.shift();
    if(!s.strikeQueue.length&&s.strike)s.strike.visible=false;
   }
  }
  /* ---- 対空機関砲 ---- */
  if(v.aaa&&s.pos.y<3500){
   s.aaaT-=dt;
   if(s.aaaT<=0){
    s.aaaT=.5;s.hp-=3.2;s.warn=1;
    const from=s.aaa[Math.floor(Math.random()*s.aaa.length)];
    SkyFX.spawn(new THREE.Vector3(from.x,from.y+40,from.z),9,.5,0xffd07a,
     s.pos.clone().sub(new THREE.Vector3(from.x,from.y,from.z)).normalize().multiplyScalar(900));
   }
   if(s.hp<=0){this.finish(false,'機関砲に撃たれて機体を失った。高度3500mより上を保てば当たらない。');return;}
  }
  /* ---- 目標の達成 ---- */
  if(s.step===2){
   if(v.attack||this.variant===2){
    const near=s.sp.distanceTo(s.area)<24000&&s.fov<14;
    s.bda+=(near?dt:-dt*.5);
    if(s.bda>=10){
     this.finish(true,this.variant===2
      ?'目標3つを味方に知らせ、F-15の攻撃をすべて確認した。敵の対空網に穴が開いた。'
      :'発射機2両を破壊し、民間に被害を出さなかった。撮影した映像を司令部に送った。');
     return;
    }
   }else{
    const home=Math.abs(((s.hdg*180/Math.PI)%360+360)%360-270)<22;
    s.bda+=(home&&s.pos.y>4500?dt:-dt);
    if(s.bda>=8){this.finish(true,'敵のレーダー3か所をマークし、無人機を無事に帰投コースへ乗せた。');return;}
   }
  }
  if(s.limit<=0){this.finish(false,'時間切れ。ズームは寄せすぎると探しにくい。広い画角（Eキー）で探し、見つけてから寄せる。');return;}
  s.warn=Math.max(0,s.warn-dt);
 };

 /* ------- センサー映像の上に描くHUD ------- */
 MA.drawDrone=function(a){
  const s=this.s,v=s.v;
  const green='#a8e6c0',dim='#7fae95',warn='#ff9d7a';
  /* 四隅のブラケット */
  a.strokeStyle=green+'';a.lineWidth=2;
  for(const [cx,cy,sx,sy] of [[40,40,1,1],[960,40,-1,1],[40,560,1,-1],[960,560,-1,-1]]){
   a.beginPath();a.moveTo(cx+38*sx,cy);a.lineTo(cx,cy);a.lineTo(cx,cy+30*sy);a.stroke();
  }
  /* 十字とスケール */
  const cx=500,cy=300;
  this.line(a,[[cx-70,cy],[cx-14,cy]],green,1.5);this.line(a,[[cx+14,cy],[cx+70,cy]],green,1.5);
  this.line(a,[[cx,cy-70],[cx,cy-14]],green,1.5);this.line(a,[[cx,cy+14],[cx,cy+70]],green,1.5);
  for(let i=-2;i<=2;i++){if(!i)continue;this.line(a,[[cx+i*28,cy-6],[cx+i*28,cy+6]],dim,1);}
  this.circle(a,cx,cy,3,green);
  /* 目標枠 */
  for(const t of s.targets){
   if(t.dead)continue;
   const p=SkyProject.to(this.camera3D,t.pos);
   if(!p.on)continue;
   const known=t.identified,col=t.civilian?'#9ed0ff':known?'#ffd27a':dim;
   const r=Math.max(9,26-s.fov*.6);
   a.strokeStyle=col;a.lineWidth=known?2:1;
   a.strokeRect(p.x-r,p.y-r,r*2,r*2);
   if(known)this.text(a,(t.civilian?'民間 ':'')+t.label+(t.marked?' [送信済]':''),p.x+r+6,p.y-r+12,12,col);
   else if(t.ident>0){
    this.box(a,p.x-r,p.y+r+5,r*2,4,'#0d211a');
    this.box(a,p.x-r,p.y+r+5,r*2*t.ident,4,'#ffd27a');
    this.text(a,'識別中',p.x-r,p.y+r+22,11,dim);
   }
   if(s.laserTarget===t){
    a.strokeStyle='#ff6b6b';a.lineWidth=2;
    a.beginPath();a.arc(p.x,p.y,r+10,0,Math.PI*2);a.stroke();
   }
  }
  /* 左上：機体の状態 */
  this.box(a,34,58,246,124,'#07161099','#79ad9166');
  this.text(a,'MQ-9 SANDPIPER / '+(s.ir?'IR':'EO'),46,78,12,green);
  this.text(a,'高度 '+Math.round(s.pos.y)+' m',46,100,16,'#e8f2ea');
  this.text(a,'速度 '+Math.round(s.spd*3.6)+' km/h',46,120,14,dim);
  this.text(a,'方位 '+String(Math.round(((s.hdg*180/Math.PI)%360+360)%360)).padStart(3,'0')+'°'+(s.orbit?'（自動旋回）':''),46,140,14,dim);
  this.text(a,'画角 '+s.fov.toFixed(1)+'°（'+(26/s.fov).toFixed(1)+'倍）',46,160,14,dim);
  this.text(a,'機体 '+Math.max(0,Math.ceil(s.hp))+'%',46,177,13,s.hp<60?warn:dim);
  /* 右上：小窓のわく（3Dはこの中に描かれる） */
  a.strokeStyle='#79ad9188';a.lineWidth=1;a.strokeRect(724,58,240,150);
  this.text(a,'CHASE VIEW / 機体',730,52,11,dim);
  /* 下：目標と時間 */
  this.box(a,34,466,932,52,'#07161099','#79ad9144');
  const goal=s.step===0?'地上を捜索して目標を識別する'
   :s.step===1?(v.attack?'レーザーで照らして発射機を破壊する（民間を避ける）':'識別した目標をマークして味方に知らせる')
   :(v.attack||this.variant===2?'現場を撮影して被害を確認する（BDA）':'西（方位270）へ高度4500m以上で離脱する');
  this.text(a,goal,48,492,16,'#eef5ec');
  this.text(a,(v.attack?'破壊 '+s.destroyed+' / '+v.kills:'マーク '+s.marked+' / '+v.marks)
   +'　残り '+Math.max(0,Math.ceil(s.limit))+'秒'
   +(v.attack?'　誘導弾 '+s.hell+'発':'')+(s.step===2?'　撮影 '+Math.max(0,Math.ceil(10-s.bda))+'秒':''),48,510,13,dim);
  /* レーザー */
  if(v.attack){
   const ready=s.laser>=2.5;
   this.box(a,384,534,232,34,ready?'#3a1f1f':'#0b1a16',ready?'#ff7b6b':'#79ad9144');
   this.text(a,ready?'LASER ON TARGET / Space 発射可':'F 長押しでレーザー照射 '+s.laser.toFixed(1)+'秒',500,556,14,ready?'#ffc0b0':dim,'center');
  }
  if(s.warn>0){
   a.globalAlpha=Math.min(1,s.warn);
   this.text(a,this.variant===2&&s.pos.y<3500?'警告：対空機関砲の射程内。高度を上げろ':'警告：民間は撃てない',500,250,20,warn,'center');
   a.globalAlpha=1;
  }
  this.text(a,'矢印：カメラ　Q/E：ズーム　T：追尾　R：赤外線　W/S：高度　A/D：旋回'+(v.attack?'　F：照射　Space：発射　X：中止':'　M：マーク'),500,588,11,dim,'center');
 };
})();

/* 赤外線カメラの見え方：色を熱っぽい白黒に置き換える（材質を差し替えない） */
const SkyIR={
 apply(scene,on){
  if(!scene)return;
  scene.traverse(o=>{
   if(!o.isMesh&&!o.isInstancedMesh)return;
   const list=Array.isArray(o.material)?o.material:[o.material];
   for(const m of list){
    if(!m)continue;
    if(!m.userData.__eo)m.userData.__eo={c:m.color?m.color.clone():null,vc:m.vertexColors,
     e:m.emissive?m.emissive.clone():null,ei:m.emissiveIntensity};
    const src=m.userData.__eo;
    if(on){
     const hot=o.userData.irHot;
     if(m.color){
      if(hot){m.color.setRGB(1,.96,.9);}
      else{const l=src.c?(src.c.r*.24+src.c.g*.62+src.c.b*.14):.2;m.color.setScalar(clamp(l*.7,.02,.9));}
     }
     if(m.emissive&&hot){m.emissive.setRGB(.8,.78,.7);m.emissiveIntensity=1.1;}
     m.vertexColors=false;
    }else{
     if(m.color&&src.c)m.color.copy(src.c);
     if(m.emissive&&src.e){m.emissive.copy(src.e);m.emissiveIntensity=src.ei;}
     m.vertexColors=src.vc;
    }
    m.needsUpdate=true;
   }
  });
 }
};

/* ---------------- 4. JetOps：F-15の操縦 ----------------
   操作　W/S：機首上げ下げ　A/D：横転　Q/E：方向舵　Shift：出力＋（Aで再燃焼）
   　　　Ctrl：出力−　B：減速板　Space：発射　1/2/3：兵装選択　T：ロック切替
   　　　X：フレア／チャフ　V：視点（コクピット／外部）　G：脚（着陸時） */
(function(){
 const MA=MissionActions,V3=(x,y,z)=>new THREE.Vector3(x,y,z);
 const KT=1.94384, FT=3.28084;          // m/s→ノット、m→フィート

 MA.catalog.jet={name:'F-15を操縦',en:'07 / EAGLE',subtitle:'鉄の空',color:'#a9c8e8',
  lead:'F-15を操縦する。レーダーで敵を探し、中距離ミサイル（AIM-120）と赤外線ミサイル（AIM-9）、機関砲で戦う。被弾しそうなときはフレアとチャフ、そして旋回で逃げる。',
  steps:['敵または目標を見つける','撃墜・護衛などの主目的を果たす','空域を離脱する（または着陸する）'],
  controls:'W/S：機首　A/D：横転　Q/E：方向舵　Shift：出力＋（再燃焼）　Ctrl：出力−　B：減速板　T：ロック　1/2/3：兵装　Space：発射　X：フレア／チャフ　V：視点　G：脚',
  reward:'撃墜の記録は航空隊の戦果に加算される。'};

 const JV=[
  {key:'train', title:'訓練飛行',       limit:420,hp:100,amraam:0,aim9:0,gun:0,bandits:0,gates:6,land:true,
   brief:'教官機のうしろにつき、6つの航路リングを通って、滑走路に着陸する。まずは操縦に慣れること。'},
  {key:'bvr',   title:'BVR迎撃',        limit:420,hp:100,amraam:4,aim9:2,gun:940,bandits:2,range:26000,
   brief:'26km先から来る敵2機を、中距離ミサイルで落とす。撃たれたらチャフ（X）と横向きの旋回で振り切る。'},
  {key:'dog',   title:'格闘戦',         limit:400,hp:100,amraam:0,aim9:2,gun:940,bandits:1,range:3200,ace:.72,
   brief:'至近距離の格闘戦。速度を捨てすぎると何もできない。うしろを取って赤外線ミサイルか機関砲で決める。'},
  {key:'escort',title:'輸送機の護衛',   limit:520,hp:100,amraam:4,aim9:2,gun:940,bandits:3,escort:true,waves:2,
   brief:'輸送機に合流し、2波の敵機から守りながら、目的地まで連れていく。輸送機から離れすぎないこと。'},
  {key:'final', title:'最終決戦',       limit:540,hp:120,amraam:4,aim9:4,gun:940,bandits:1,cruise:4,ace:.86,
   brief:'街へ向かう巡航ミサイル4発を落とし、そのあと敵のエース「ヴェスパ」を倒す。'}
 ];
 MA.jetVariants=JV;

 MA.setupJet=function(){
  const v=JV[this.variant]||JV[0],s=this.s;
  AeroForge.reset();
  SkyWorld.build(this,{night:v.key==='final',size:100000,seg:130,far:120000,fov:62,
   fogNear:12000,fogFar:80000,clouds:40,cloudY:3400,cityX:-26000,cityZ:-34000,cityCount:76,
   rocks:260,rockSpread:60000});
  const world=this.scene3D;
  Object.assign(s,{step:0,v,
   pos:V3(0,4200,26000),q:new THREE.Quaternion(),spd:240,thr:.72,ab:false,brake:false,
   hp:v.hp,flares:18,chaff:18,amraam:v.amraam,aim9:v.aim9,gun:v.gun,
   sel:v.amraam?'amraam':v.aim9?'aim9':'gun',lock:null,lockT:0,irLock:null,
   bandits:[],missiles:[],bullets:[],kills:0,limit:v.limit,view:0,gear:false,
   warn:0,warnText:'',rwr:[],incoming:[],cruise:[],gates:[],gate:0,
   formT:0,escortHp:100,bda:0,wave:0,shake:0,flareT:0,message:'',lastFire:-1,gunT:0,
   stall:0,gLoad:1,hitT:0,touchdown:false});

  /* 自機 */
  const jet=AeroForge.build('f15',{scale:1});
  jet.name='eagle';world.add(jet);s.jet=jet;
  s.burners=jet.children.filter(o=>o.userData.part==='burner');

  /* 基地と滑走路 */
  s.field=SkyWorld.runway(world,0,0,0,3400,60);
  s.fieldY=s.field.userData.y;

  const spawnJet=(kind,tint,pos,opt={})=>{
   const model=AeroForge.build(kind,{tint,tint2:opt.tint2,scale:opt.scale||1,unique:true});
   model.position.copy(pos);world.add(model);
   return {model,pos:model.position,q:new THREE.Quaternion(),spd:opt.spd||250,hp:opt.hp||100,
    cool:opt.cool||8,skill:opt.skill||.5,kind:opt.role||'bandit',flare:0,evade:0,label:opt.label||'敵機',
    dead:false,amraam:opt.amraam??2,aim9:opt.aim9??2,gun:opt.gun??600,name:opt.name||''};
  };
  s.spawnJet=spawnJet;

  if(v.key==='train'){
   /* 教官機と航路リング */
   s.tutor=spawnJet('f15',null,V3(300,4200,23000),{role:'tutor',label:'教官機 ドラゴン1',spd:235});
   for(let i=0;i<v.gates;i++){
    const x=[0,-2600,2200,3400,-1800,0][i]*1.4,y=[4200,4800,5600,4400,5200,3600][i],z=22000-i*4200;
    const ring=new THREE.Mesh(new THREE.TorusGeometry(420,14,8,40),AeroForge.mat(0x9ff0c8,{emissive:0x2f7d5c,rough:.4,metal:.1}));
    ring.position.set(x,y,z);world.add(ring);
    s.gates.push({x,y,z,mesh:ring,done:false});
   }
   this.initialMessage='まず操縦に慣れる。W/Sで機首、A/Dで横転。緑のリングを順番にくぐる。';
  }else if(v.key==='escort'){
   s.transport=spawnJet('c130',null,V3(-1200,3000,18000),{role:'transport',label:'輸送機 カーゴ1',spd:120,hp:100});
   s.awacs=spawnJet('awacs',null,V3(9000,7600,30000),{role:'awacs',label:'早期警戒機 ウィンドウ',spd:170});
   s.sam=AeroForge.build('sam',{scale:2.4,unique:true});
   s.sam.position.set(-9000,SkyWorld.height(-9000,2000),2000);world.add(s.sam);
   s.samT=14;
   this.initialMessage='輸送機カーゴ1に合流する。2km以内に近づいて、敵機が来るまで並んで飛ぶ。';
  }else if(v.key==='final'){
   for(let i=0;i<v.cruise;i++){
    const m=AeroForge.build('cruise',{scale:1.4,unique:true});
    const x=-6000+i*2400,z=14000+i*1500;
    m.position.set(x,460+SkyWorld.height(x,z),z);world.add(m);
    s.cruise.push({model:m,pos:m.position,dead:false,spd:250,hp:36,kind:'cruise',label:'巡航ミサイル '+(i+1)});
   }
   s.awacs=spawnJet('awacs',null,V3(12000,8200,34000),{role:'awacs',label:'早期警戒機 ウィンドウ',spd:170});
   this.initialMessage='街へ向かう巡航ミサイル4発が低空を飛んでいる。機関砲か赤外線ミサイルで落とす。';
  }else{
   const n=v.bandits,R=v.range;
   for(let i=0;i<n;i++){
    const off=(i-(n-1)/2)*2400;
    const b=spawnJet('su27',v.key==='dog'?0x2f3440:0x5b6b78,V3(off,4200+i*400,26000-R),
     {skill:v.ace||.55,label:v.key==='dog'?'ヴェスパ隊 僚機':'敵機 '+(i+1),spd:v.key==='dog'?230:270,
      amraam:v.key==='dog'?0:2,aim9:2,tint2:0x2b3038,cool:v.key==='dog'?6:22});
    b.q.setFromEuler(new THREE.Euler(0,0,0));
    s.bandits.push(b);
   }
   s.awacs=spawnJet('awacs',null,V3(11000,7800,32000),{role:'awacs',label:'早期警戒機 ウィンドウ',spd:170});
   this.initialMessage=v.key==='dog'
    ?'目の前に敵機。速度を保ちながら旋回してうしろを取る。Tでロック、2で赤外線ミサイル、3で機関砲。'
    :'26km先に敵2機。Tでロックして、1のAIM-120で撃つ。警報が鳴ったらXでチャフをまいて横に旋回する。';
  }

  this.pipCam=new THREE.PerspectiveCamera(46,1.6,2,60000);
  this.touchKeys=[['機首上','KeyW'],['機首下','KeyS'],['左','KeyA'],['右','KeyD'],
   ['出力+','ShiftLeft'],['出力-','ControlLeft'],['ロック','KeyT'],['発射','Space'],['フレア','KeyX']];
  this.jetTools();this.touchPad();
  this.updateJet(0);
 };

 MA.jetTools=function(){
  const s=this.s;
  this.tools([
   ['兵装切替 / 1・2・3',()=>this.jetCycleWeapon()],
   ['ロック / T',()=>this.jetLock()],
   ['フレア・チャフ / X',()=>this.jetFlare()],
   ['視点切替 / V',()=>{s.view=s.view?0:1;this.message(s.view?'外部視点。機体の姿勢が見やすい。':'コクピット視点。');}],
   ['再燃焼 ON / OFF',()=>{s.ab=!s.ab;this.message(s.ab?'アフターバーナー点火。燃料より速度を優先する。':'アフターバーナー切。');}]
  ]);
 };

 /* ---- 向きの補助 ---- */
 const fwdOf=(q)=>V3(0,0,-1).applyQuaternion(q);
 const upOf=(q)=>V3(0,1,0).applyQuaternion(q);
 MA.jetFwd=function(){return fwdOf(this.s.q);};

 MA.jetCycleWeapon=function(){
  const s=this.s,order=['amraam','aim9','gun'];
  let i=order.indexOf(s.sel);
  for(let n=0;n<3;n++){
   i=(i+1)%3;
   const k=order[i];
   if(k==='gun'?s.gun>0:s[k]>0){s.sel=k;this.message('兵装：'+this.jetWeaponName(k)+'（残り'+(k==='gun'?s.gun+'発':s[k]+'発')+'）');return;}
  }
  this.message('使える兵装がない。');
 };
 MA.jetWeaponName=k=>k==='amraam'?'AIM-120（中距離・レーダー誘導）':k==='aim9'?'AIM-9（近距離・赤外線）':'M61 機関砲';

 MA.jetTargets=function(){
  const s=this.s,list=[];
  for(const b of s.bandits)if(!b.dead)list.push(b);
  for(const c of s.cruise)if(!c.dead)list.push(c);
  return list;
 };
 MA.jetLock=function(){
  const s=this.s,f=this.jetFwd(),list=this.jetTargets();
  const cand=list.map(t=>{
   const d=t.pos.clone().sub(s.pos);
   return {t,r:d.length(),ang:d.normalize().angleTo(f)};
  }).filter(c=>c.ang<Math.PI/3&&c.r<70000).sort((a,b)=>a.r-b.r);
  if(!cand.length){s.lock=null;this.message('レーダーに目標がいない。機首を敵の方向へ向ける（レーダーは前方60度）。');return;}
  const cur=cand.findIndex(c=>c.t===s.lock);
  const next=cand[(cur+1)%cand.length];
  s.lock=next.t;s.lockT=0;
  this.message('ロック：'+next.t.label+'　距離'+(next.r/1000).toFixed(1)+'km');
  Feedback.chord([760,980],.1,.02);
 };
 MA.jetFlare=function(){
  const s=this.s;
  if(s.flares<=0&&s.chaff<=0){this.message('フレアもチャフも残っていない。');return;}
  if(s.flares>0)s.flares--;
  if(s.chaff>0)s.chaff--;
  s.flareT=1.4;
  for(let i=0;i<6;i++)SkyFX.spawn(s.pos.clone(),4,1.4,0xffd08a,
   V3((Math.random()-.5)*60,-20-Math.random()*30,(Math.random()-.5)*60));
  for(const m of s.missiles){
   if(m.side!=='them'||m.lost||m.dc>=2||m.pos.distanceTo(s.pos)>2400)continue;
   m.dc++;
   if(Math.random()<(m.kind==='aim9'?.45:.3))m.lost=true;
  }
  this.message('フレアとチャフを放出。いま横向きに大きく旋回する。');
 };

 MA.jetFire=function(){
  const s=this.s;
  if(this.elapsed-s.lastFire<.35)return;
  if(s.sel==='gun'){
   if(s.gun<=0)this.message('機関砲の弾切れ。');
   return;                                              /* 連射はupdateJetで処理 */
  }
  if(s.sel==='amraam'){
   if(!s.amraam){this.message('AIM-120を撃ちつくした。2で赤外線ミサイル、3で機関砲。');return;}
   if(!s.lock){this.message('先にTでロックする。ロックなしではAIM-120は誘導できない。');return;}
   const r=s.pos.distanceTo(s.lock.pos);
   if(r>42000){this.message('遠すぎる（'+(r/1000).toFixed(0)+'km）。42km以内まで詰める。');return;}
   s.amraam--;this.jetLaunch('amraam',s.lock);
  }else{
   if(!s.aim9){this.message('AIM-9を撃ちつくした。3で機関砲。');return;}
   const t=this.jetIrTarget();
   if(!t){this.message('赤外線ミサイルは前方20度・7km以内の目標にしか撃てない。もっと近づいて機首を向ける。');return;}
   s.aim9--;this.jetLaunch('aim9',t);
  }
  s.lastFire=this.elapsed;
 };
 MA.jetIrTarget=function(){
  const s=this.s,f=this.jetFwd();
  let best=null,score=1e9;
  for(const t of this.jetTargets()){
   const d=t.pos.clone().sub(s.pos),r=d.length(),ang=d.normalize().angleTo(f);
   if(r<7200&&ang<.35&&r*ang<score){score=r*ang;best=t;}
  }
  return best;
 };
 MA.jetLaunch=function(kind,target,from,side){
  const s=this.s,owner=from||s,sd=side||'me';
  const geo=AeroForge.spin(kind==='amraam'?[[.02,-1.8],[.13,-1.3],[.14,1.4],[.08,1.8]]:[[.02,-1.4],[.1,-1.0],[.11,1.1],[.07,1.4]],{seg:8});
  const body=new THREE.Mesh(geo,AeroForge.mat(kind==='amraam'?0xd8d5c8:0xb0aea2,{rough:.45}));
  body.rotation.x=Math.PI/2;
  const g=new THREE.Group();g.add(body);g.position.copy(owner.pos);this.scene3D.add(g);
  const dir=target?target.pos.clone().sub(owner.pos).normalize():fwdOf(owner.q||s.q);
  const spd0=(owner.spd||240)+120;
  s.missiles.push({m:g,pos:g.position,vel:dir.multiplyScalar(spd0),spd:spd0,kind,target,side:sd,
   t:0,fuel:kind==='amraam'?46:22,lost:false,turn:kind==='amraam'?.11:.16,armed:.6,dc:0,
   prev:g.position.clone()});
  Feedback.chord(sd==='me'?[300,210]:[190,150],.2,.04);
  if(sd==='me')this.message((kind==='amraam'?'AIM-120':'AIM-9')+'発射。'+(kind==='amraam'?'着弾までロックを外さない（機首を目標の方向に保つ）。':'追尾に任せてよい。'));
 };

 /* ---- 機関砲 ---- */
 MA.jetGuns=function(dt){
  const s=this.s;
  if(s.sel!=='gun'||!this.keys.Space||s.gun<=0)return;
  s.gun-=Math.min(s.gun,Math.ceil(dt*100));
  const f=this.jetFwd(),muzzle=s.pos.clone().addScaledVector(f,12);
  SkyFX.spawn(muzzle,3.2,.12,0xffe6a8,f.clone().multiplyScalar(1100).add(V3(0,0,0)));
  /* 当たり判定：弾道に沿って最も近い目標 */
  for(const t of this.jetTargets()){
   const d=t.pos.clone().sub(s.pos),r=d.length();
   if(r>1400)continue;
   const along=d.dot(f);
   if(along<0)continue;
   const perp=d.clone().addScaledVector(f,-along).length();
   const box=t.kind==='cruise'?44:34;
   if(perp<box&&Math.random()<dt*22)this.jetDamage(t,t.kind==='cruise'?9:7.5,'gun');
  }
  s.shake=Math.max(s.shake,.25);
 };

 MA.jetDamage=function(t,dmg,src){
  const s=this.s;
  if(t.dead)return;
  t.hp=(t.hp??100)-dmg;
  SkyFX.spawn(t.pos.clone(),8,.3,0xffd0a0);
  if(t.hp>0)return;
  t.dead=true;
  if(t.model)t.model.visible=false;
  SkyFX.boom(t.pos.clone(),t.spd>200?40:28);
  if(t.role==='transport'||t.kind==='transport'){this.finish(false,'輸送機を落とされた。敵機は必ず輸送機を狙う。輸送機の近く（3km以内）で戦うこと。');return;}
  if(s.cruise.includes(t)){
   s.destroyedCruise=(s.destroyedCruise||0)+1;
   this.message('巡航ミサイルを撃墜（'+s.destroyedCruise+' / '+s.v.cruise+'）');
  }else{
   s.kills++;
   this.message((t.name||t.label)+'を撃墜。撃墜数 '+s.kills);
  }
  Feedback.chord([520,392,262],.3,.05);
 };

 /* ---- 敵機の思考 ---- */
 MA.jetAI=function(b,dt){
  const s=this.s;
  if(b.dead)return;
  const toMe=s.pos.clone().sub(b.pos),r=toMe.length();
  let aim=null;
  if(b.kind==='tutor'){
   aim=b.pos.clone().add(V3(0,0,-6000));
   b.spd=232;
  }else if(b.kind==='transport'){
   aim=V3(-1200,3000,-14000);
   b.spd=118;
   if(b.pos.distanceTo(aim)<1500)b.arrived=true;
  }else if(b.kind==='awacs'){
   b.orbit=(b.orbit||0)+dt*.06;
   aim=V3(Math.cos(b.orbit)*16000+9000,7800,Math.sin(b.orbit)*16000+30000);
   b.spd=172;
  }else{
   /* 戦闘機：味方の輸送機がいれば輸送機、いなければプレイヤーを狙う */
   const prey=(s.transport&&!s.transport.dead&&Math.random()<.35)?s.transport:{pos:s.pos};
   const inbound=s.missiles.find(m=>m.side==='me'&&m.target===b&&!m.lost);
   if(inbound&&b.evade<=0)b.evade=2.6;
   b.evade=Math.max(0,b.evade-dt);
   const dir=prey.pos.clone().sub(b.pos);
   if(b.evade>0){
    /* 回避：横向きに大きく旋回して高度を落とす */
    const side=V3(-dir.z,0,dir.x).normalize().multiplyScalar(6000);
    aim=b.pos.clone().add(side).add(V3(0,-1200,0));
    if(b.flare<=0){b.flare=1.9;for(let i=0;i<4;i++)SkyFX.spawn(b.pos.clone(),4,1.2,0xffd08a,V3((Math.random()-.5)*50,-25,(Math.random()-.5)*50));
     /* 近くまで来たミサイルにだけ効く。1発につき2回まで。レーダー誘導はフレアでは外れにくい */
     for(const m of s.missiles){
      if(m.target!==b||m.lost||m.dc>=2||m.pos.distanceTo(b.pos)>2200)continue;
      m.dc++;
      if(Math.random()<(m.kind==='aim9'?.25:.08))m.lost=true;
     }}
   }else if(r<1500){
    aim=b.pos.clone().addScaledVector(fwdOf(b.q),4000).add(V3(0,600,0));   /* 近すぎるので離れる */
   }else{
    aim=prey.pos.clone().addScaledVector(V3(0,0,0),0);
    if(prey.pos===s.pos)aim=s.pos.clone().addScaledVector(this.jetFwd(),Math.min(2600,r*.22));
   }
   b.flare=Math.max(0,b.flare-dt);
   b.spd=clamp(b.spd+(b.evade>0?40:(r>9000?30:-8))*dt,180,b.skill>.8?430:380);
   /* 射撃 */
   b.cool-=dt;
   if(b.cool<=0&&r<40000){
    const ang=toMe.clone().normalize().angleTo(fwdOf(b.q));
    if(r>9000&&b.amraam>0&&ang<.6){b.amraam--;b.cool=19-b.skill*6;this.jetLaunch('amraam',{pos:s.pos,label:'自機'},b,'them');
     s.warn=2.2;s.warnText='警報：レーダー誘導ミサイル接近（Xでチャフ＋横旋回）';}
    else if(r<6500&&b.aim9>0&&ang<.4){b.aim9--;b.cool=13-b.skill*5;this.jetLaunch('aim9',{pos:s.pos,label:'自機'},b,'them');
     s.warn=2.2;s.warnText='警報：赤外線ミサイル接近（Xでフレア＋横旋回）';}
    else if(r<1100&&ang<.08&&b.gun>0){b.gun-=20;b.cool=.6;
     if(Math.random()<.45){s.hp-=3.4;s.hitT=.5;s.warn=1.2;s.warnText='機関砲で被弾';}}
   }
  }
  const want=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(b.pos,aim,V3(0,1,0)));
  const rate=(b.kind==='bandit'?.5+b.skill*.55:.28);
  b.q.slerp(want,Math.min(1,rate*dt));
  b.pos.addScaledVector(fwdOf(b.q),b.spd*dt);
  const gy=SkyWorld.height(b.pos.x,b.pos.z);
  if(b.pos.y<gy+260){b.pos.y=gy+260;}
  b.model.position.copy(b.pos);
  b.model.quaternion.copy(b.q);
 };

 /* 目標の速度（見越し点の計算に使う） */
 MA.velOf=function(t){
  const s=this.s;
  if(!t)return V3(0,0,0);
  if(t===s||t.self)return fwdOf(s.q).multiplyScalar(s.spd);
  if(t.kind==='cruise')return V3(-.78,0,-.62).normalize().multiplyScalar(t.spd*.7);
  if(t.q&&t.spd)return fwdOf(t.q).multiplyScalar(t.spd);
  return V3(0,0,0);
 };

 /* ---- ミサイルの飛翔 ---- */
 MA.jetMissiles=function(dt){
  const s=this.s;
  for(let i=s.missiles.length-1;i>=0;i--){
   const m=s.missiles[i];
   m.t+=dt;m.armed-=dt;m.fuel-=dt;
   const tgt=m.side==='me'?m.target:{pos:s.pos};
   const alive=m.side==='me'?(m.target&&!m.target.dead):true;
   /* レーダー誘導は撃った側が機首を向け続ける必要がある */
   let guiding=!m.lost&&alive&&m.fuel>0;
   if(guiding&&m.kind==='amraam'&&m.side==='me'&&m.target){
    const ang=m.target.pos.clone().sub(s.pos).normalize().angleTo(this.jetFwd());
    if(ang>1.15){guiding=false;m.lostWarn=true;}
   }
   if(guiding&&tgt){
    /* 見越し（リード）追尾：相手がどこへ行くかを見て、そこへ向かう */
    const rel=tgt.pos.clone().sub(m.pos),dist=rel.length();
    const tof=Math.min(8,dist/Math.max(200,m.spd));
    const lead=tgt.pos.clone().addScaledVector(m.side==='me'?this.velOf(m.target):fwdOf(s.q).multiplyScalar(s.spd),tof);
    const want=lead.sub(m.pos).normalize().multiplyScalar(m.spd);
    m.vel.lerp(want,Math.min(1,m.turn*dt*(dist<2500?26:8)));
   }else{m.vel.y-=9.8*dt;}
   const topSpd=m.kind==='amraam'?1150:900;
   m.spd=clamp(m.spd+(m.fuel>0?90:-70)*dt,180,topSpd);
   m.vel.setLength(m.spd);
   m.prev.copy(m.pos);
   m.pos.addScaledVector(m.vel,dt);
   m.m.lookAt(m.pos.clone().add(m.vel));
   SkyFX.trail(m.pos,m.kind==='amraam'?9:7,0xcfd4d0);
   const hitR=m.side==='me'?60:52;      /* 近接信管 */
   const targetPos=m.side==='me'?(m.target?m.target.pos:null):s.pos;
   /* すれ違いざまの「すり抜け」を防ぐため、線分で当たりを見る */
   const dist=targetPos?SkySweep.dist(m.prev,m.pos,targetPos):1e9;
   if(m.armed<=0&&dist<hitR&&!m.lost){
    SkyFX.boom(m.pos.clone(),22);
    /* ミサイルが当たれば戦闘機は落ちる（エースだけは装甲が厚く2発必要） */
    if(m.side==='me'&&m.target)this.jetDamage(m.target,m.kind==='amraam'?110:95,'missile');
    else{s.hp-=m.kind==='amraam'?34:30;s.hitT=.9;s.shake=1;s.warn=1.6;s.warnText='被弾！ 機体の状態を確認しろ';}
    this.scene3D.remove(m.m);s.missiles.splice(i,1);continue;
   }
   if(m.fuel<-8||m.pos.y<SkyWorld.height(m.pos.x,m.pos.z)+8||m.t>70){
    if(m.pos.y<SkyWorld.height(m.pos.x,m.pos.z)+20)SkyFX.boom(m.pos.clone(),16);
    this.scene3D.remove(m.m);s.missiles.splice(i,1);
   }
  }
 };

 MA.updateJet=function(dt){
  const s=this.s,k=this.keys,v=s.v;
  /* ---- 操縦 ---- */
  const auth=clamp(s.spd/190,.22,1.25)*(s.stall>0?.35:1);
  const pitchIn=(k.KeyW?1:0)-(k.KeyS?1:0),rollIn=(k.KeyD?1:0)-(k.KeyA?1:0),yawIn=(k.KeyE?1:0)-(k.KeyQ?1:0);
  const e=new THREE.Euler(pitchIn*.85*auth*dt,-yawIn*.4*auth*dt,-rollIn*2.5*auth*dt,'XYZ');
  s.q.multiply(new THREE.Quaternion().setFromEuler(e));
  s.q.normalize();
  /* 出力と速度 */
  if(k.ShiftLeft||k.ShiftRight)s.thr=clamp(s.thr+dt*.5,0,1);
  if(k.ControlLeft||k.ControlRight)s.thr=clamp(s.thr-dt*.5,0,1);
  s.brake=!!k.KeyB;
  if(s.thr>=.99&&(k.ShiftLeft||k.ShiftRight))s.ab=true;
  if(s.thr<.75)s.ab=false;
  const f=fwdOf(s.q);
  const thrust=s.thr*23+(s.ab?27:0);
  const drag=.00023*s.spd*s.spd+Math.abs(pitchIn)*7*auth+(s.brake?30:0)+(s.gear?14:0);
  s.spd=clamp(s.spd+(thrust-drag-9.81*f.y*1.05)*dt,45,720);
  s.gLoad=1+Math.abs(pitchIn)*Math.min(7.5,s.spd/60)*auth*.9;
  s.stall=s.spd<115?Math.min(2,s.stall+dt):Math.max(0,s.stall-dt*1.4);
  if(s.stall>.4){                        /* 失速：機首が落ちる */
   const drop=new THREE.Quaternion().setFromEuler(new THREE.Euler(-.5*dt,0,0));
   s.q.multiply(drop);
  }
  s.pos.addScaledVector(f,s.spd*dt);
  if(s.jet){s.jet.position.copy(s.pos);s.jet.quaternion.copy(s.q);
   const bs=.6+(s.ab?1.5:s.thr*.8);
   for(const b of s.burners)b.scale.set(1,bs,1);
   for(const b of s.burners)b.visible=s.thr>.25;
  }
  /* ---- カメラ ---- */
  const cam=this.camera3D;
  const shake=s.shake>0?s.shake:0;
  /* 操縦席の位置（キャノピーの中）。前に機首だけが見える */
  const cockpit=s.pos.clone().addScaledVector(f,5.0).addScaledVector(upOf(s.q),1.2);
  const chase=s.pos.clone().addScaledVector(f,-34).addScaledVector(upOf(s.q),9);
  const main=s.view?chase:cockpit;
  cam.position.copy(main);
  if(shake)cam.position.add(V3((Math.random()-.5)*shake*2.4,(Math.random()-.5)*shake*2.4,0));
  cam.quaternion.copy(s.q);
  if(s.view)cam.lookAt(s.pos);
  cam.fov=s.view?52:66;cam.updateProjectionMatrix();
  if(this.pipCam){
   const p=s.view?cockpit:chase;
   this.pipCam.position.copy(p);
   if(s.view)this.pipCam.quaternion.copy(s.q);else this.pipCam.lookAt(s.pos);
  }
  if(dt===0)return;
  s.shake=Math.max(0,s.shake-dt*2.2);
  s.hitT=Math.max(0,s.hitT-dt);
  s.warn=Math.max(0,s.warn-dt);
  s.limit-=dt;
  s.flareT=Math.max(0,s.flareT-dt);
  if(s.lock&&s.lock.dead)s.lock=null;
  if(s.lock)s.lockT+=dt;
  this.jetGuns(dt);
  this.jetMissiles(dt);
  SkyFX.update(dt);
  /* ---- 味方と敵 ---- */
  for(const b of s.bandits)this.jetAI(b,dt);
  if(s.tutor)this.jetAI(s.tutor,dt);
  if(s.transport)this.jetAI(s.transport,dt);
  if(s.awacs)this.jetAI(s.awacs,dt);
  /* 巡航ミサイル：街へ向かって低空を飛ぶ */
  for(const c of s.cruise){
   if(c.dead)continue;
   c.pos.z-=c.spd*dt*.62;c.pos.x-=c.spd*dt*.78;
   c.pos.y=SkyWorld.height(c.pos.x,c.pos.z)+460;
   c.model.position.copy(c.pos);
   c.model.lookAt(c.pos.clone().add(V3(-.78,0,-.62)));
   if(c.pos.z<-30000){this.finish(false,'巡航ミサイルが街に到達した。低空の目標は、高度を下げて後ろから追うと当たりやすい。');return;}
  }
  /* 地対空ミサイル（護衛任務） */
  if(s.sam&&s.samT!==undefined){
   const r=s.pos.distanceTo(s.sam.position);
   s.samT-=dt;
   if(s.samT<=0&&r<16000){
    s.samT=17;
    this.jetLaunch('amraam',{pos:s.pos,label:'自機'},{pos:s.sam.position.clone().add(V3(0,40,0)),spd:260,q:new THREE.Quaternion()},'them');
    s.warn=2.4;s.warnText='警報：地上から対空ミサイル（Xでチャフ＋高度変更）';
   }
  }
  /* ---- 被弾・墜落 ---- */
  const gy=SkyWorld.height(s.pos.x,s.pos.z);
  if(s.hp<=0){this.finish(false,'撃墜された。警報が鳴ったらXでフレアとチャフ、そして敵の方向に対して横向きに大きく旋回する。');return;}
  const onField=v.land&&s.step===2&&Math.abs(s.pos.x-s.field.position.x)<260&&Math.abs(s.pos.z-s.field.position.z)<1900;
  if(s.pos.y<gy+14&&!onField){
   this.finish(false,'地面に接触した。低空では機首を上げ、速度を保つ（Shiftで出力を上げる）。');return;}
  if(s.pos.y>19000){this.finish(false,'成層圏まで上がって失速した。高度は12000m以下で戦う。');return;}
  if(s.limit<=0){this.finish(false,'時間切れ。');return;}

  /* ---- 任務ごとの進行 ---- */
  if(v.key==='train')this.jetTrain(dt);
  else if(v.key==='escort')this.jetEscort(dt);
  else if(v.key==='final')this.jetFinal(dt);
  else{
   const left=s.bandits.filter(b=>!b.dead).length;
   if(s.step===0&&s.lock)s.step=1;
   if(!left&&s.step<2){s.step=2;s.bda=0;this.message('敵機を全部落とした。西（方位270）へ高度3000m以上で離脱する。');}
   if(s.step===2&&this.jetEgress(dt))
    this.finish(true,v.key==='dog'
     ?'格闘戦に勝った。ヴェスパ隊の僚機を落とし、空域を離脱した。'
     :'敵2機を中距離ミサイルで落とし、空域を離脱した。');
  }
 };

 /* 離脱：方位270±25度、高度3000m以上を10秒 */
 MA.jetEgress=function(dt){
  const s=this.s,f=this.jetFwd();
  const hdg=(Math.atan2(f.x,-f.z)*180/Math.PI+360)%360;
  const ok=Math.abs(hdg-270)<25&&s.pos.y>3000;
  s.bda=clamp(s.bda+(ok?dt:-dt),0,12);
  return s.bda>=10;
 };

 MA.jetTrain=function(dt){
  const s=this.s;
  if(s.step===0){
   const g=s.gates[s.gate];
   if(g){
    const d=s.pos.distanceTo(V3(g.x,g.y,g.z));
    if(d<520){
     g.done=true;g.mesh.visible=false;s.gate++;
     Feedback.chord([660,880],.14,.02);
     this.message('リング '+s.gate+' / '+s.gates.length+' 通過。'+(s.gate<s.gates.length?'次のリングへ。':'次は教官機のうしろにつく。'));
    }
   }
   if(s.gate>=s.gates.length){s.step=1;s.formT=0;this.message('教官機（青い枠）の後方1km以内に入って、12秒ついていく。');}
  }else if(s.step===1){
   const t=s.tutor;
   const d=s.pos.distanceTo(t.pos);
   const f=this.jetFwd(),ang=t.pos.clone().sub(s.pos).normalize().angleTo(f);
   const ok=d<1400&&d>120&&ang<.6;
   s.formT=clamp(s.formT+(ok?dt:-dt*.7),0,14);
   if(s.formT>=12){s.step=2;s.gear=false;this.message('編隊よし。基地へ戻って着陸する。Gで脚を出し、速度150ノット前後、高度を落として滑走路に合わせる。');}
  }else{
   /* 着陸 */
   const rw=s.field.position,dz=s.pos.z-rw.z,dx=s.pos.x-rw.x;
   const alt=s.pos.y-s.fieldY;
   if(alt<6&&Math.abs(dx)<60&&Math.abs(dz)<1700){
    const spdKt=s.spd*KT;
    if(!s.gear){this.finish(false,'脚を出さずに接地した。Gで脚を出してから降りる。');return;}
    if(spdKt>210){this.finish(false,'速すぎる接地で滑走路を外れた。150〜180ノットまで落として降りる。');return;}
    s.spd=Math.max(0,s.spd-dt*32);
    s.pos.y=s.fieldY+2.2;
    if(s.spd*KT<60&&!s.touchdown){s.touchdown=true;
     this.finish(true,'航路・編隊・着陸をすべてこなした。明日からF-15の実任務に入る。');return;}
   }
  }
 };

 MA.jetEscort=function(dt){
  const s=this.s,t=s.transport;
  if(!t)return;
  const d=s.pos.distanceTo(t.pos);
  if(s.step===0){
   if(d<2000){s.step=1;this.message('合流よし。敵機が来る。輸送機から3km以上離れない。');this.jetWave();}
  }else if(s.step===1){
   if(d>9000){s.warn=1;s.warnText='輸送機から離れすぎている。すぐ戻れ';}
   const left=s.bandits.filter(b=>!b.dead).length;
   if(!left){
    if(s.wave<s.v.waves)this.jetWave();
    else{s.step=2;this.message('敵機は全滅。輸送機を目的地まで送る。');}
   }
  }else{
   if(t.arrived)this.finish(true,'輸送機カーゴ1を目的地まで守りきった。増援と物資が前線に届く。');
  }
 };
 MA.jetWave=function(){
  const s=this.s;
  s.wave++;
  const n=s.wave===1?2:1;
  for(let i=0;i<n;i++){
   const b=s.spawnJet('su27',0x54626f,s.pos.clone().add(V3(4200+i*2200,600,-10500)),
    {skill:.5+s.wave*.12,label:'敵機 '+s.wave+'-'+(i+1),spd:280,amraam:1,aim9:2,tint2:0x2b3038});
   s.bandits.push(b);
  }
  s.warn=2;s.warnText='第'+s.wave+'波：敵機'+n+'機が接近';
  this.message('第'+s.wave+'波の敵機'+n+'機。輸送機を狙ってくる。');
 };

 MA.jetFinal=function(dt){
  const s=this.s;
  if(s.step===0){
   const left=s.cruise.filter(c=>!c.dead).length;
   if(!left){
    s.step=1;
    const b=s.spawnJet('su27',0x22262e,s.pos.clone().add(V3(2600,1800,-9000)),
     {skill:s.v.ace,label:'ヴェスパ',name:'ヴェスパ',spd:300,hp:170,amraam:3,aim9:4,gun:900,tint2:0x6d2b2b});
    s.bandits.push(b);
    s.warn=2.6;s.warnText='ヴェスパ機、単機で接近';
    this.message('巡航ミサイルは全部落とした。ヴェスパが来る。長く曲がり合うと不利。速度を保って一撃で決める。');
   }
  }else if(s.step===1){
   if(!s.bandits.filter(b=>!b.dead).length){s.step=2;s.bda=0;this.message('ヴェスパ撃墜。西へ離脱する。');}
  }else if(this.jetEgress(dt)){
   this.finish(true,'巡航ミサイル4発を落とし、ヴェスパを倒した。空はこちらのものだ。');
  }
 };

 /* ------- HUD ------- */
 MA.drawJet=function(a){
  const s=this.s,v=s.v,cam=this.camera3D;
  const hud='#9fe6b0',dim='#79b894',warn='#ff9d7a',cold='#a9c8e8';
  const cx=500,cy=290;
  const f=this.jetFwd();
  const hdg=(Math.atan2(f.x,-f.z)*180/Math.PI+360)%360;
  const pitch=Math.asin(clamp(f.y,-1,1))*180/Math.PI;
  const roll=Math.atan2(upOf(s.q).x,upOf(s.q).y)*180/Math.PI;

  /* ピッチラダー（機体の傾きに合わせて回す） */
  a.save();
  a.translate(cx,cy);a.rotate(-roll*Math.PI/180);
  a.strokeStyle=hud;a.lineWidth=1.6;a.globalAlpha=.9;
  for(let p=-60;p<=60;p+=10){
   const y=(pitch-p)*7;
   if(Math.abs(y)>150)continue;
   const w=p===0?150:70,dash=p<0;
   a.setLineDash(dash?[9,9]:[]);
   a.beginPath();a.moveTo(-w,y);a.lineTo(-18,y);a.moveTo(18,y);a.lineTo(w,y);a.stroke();
   a.setLineDash([]);
   if(p!==0){a.fillStyle=hud;a.font='11px monospace';a.textAlign='right';a.fillText(String(p),-w-6,y+4);}
  }
  a.restore();a.globalAlpha=1;
  /* 機首マーク */
  this.line(a,[[cx-26,cy],[cx-8,cy]],hud,2);this.line(a,[[cx+8,cy],[cx+26,cy]],hud,2);
  this.line(a,[[cx,cy-8],[cx,cy-1]],hud,2);
  this.circle(a,cx,cy,3,null,hud);

  /* 速度・高度 */
  this.box(a,60,250,96,80,'#07161066','#79b89455');
  this.text(a,'速度 kt',68,266,10,dim);
  this.text(a,String(Math.round(s.spd*KT)),68,292,22,'#eaf4ec');
  this.text(a,'M '+(s.spd/300).toFixed(2),68,312,12,dim);
  this.text(a,'G '+s.gLoad.toFixed(1),68,326,11,s.gLoad>7?warn:dim);
  this.box(a,844,250,100,80,'#07161066','#79b89455');
  this.text(a,'高度 ft',852,266,10,dim);
  this.text(a,String(Math.round((s.pos.y)*FT)),852,292,20,'#eaf4ec');
  this.text(a,Math.round(s.pos.y)+' m',852,312,12,dim);
  this.text(a,'出力 '+Math.round(s.thr*100)+'%'+(s.ab?' AB':''),852,326,11,s.ab?warn:dim);
  /* 方位テープ */
  this.box(a,330,44,340,26,'#07161077','#79b89455');
  for(let i=-4;i<=4;i++){
   const deg=(Math.round(hdg/10)*10+i*10+360)%360,x=500+i*38-((hdg%10)/10)*38;
   if(x<340||x>660)continue;
   this.line(a,[[x,48],[x,56]],dim,1);
   this.text(a,String(deg/10|0),x,68,10,dim,'center');
  }
  this.text(a,String(Math.round(hdg)).padStart(3,'0'),500,38,15,hud,'center');
  this.line(a,[[500,44],[500,58]],hud,2);

  /* 兵装 */
  this.box(a,34,466,270,104,'#07161099','#79b89444');
  this.text(a,'兵装 '+MA.jetWeaponName(s.sel),46,486,12,cold);
  this.text(a,'AIM-120 ×'+s.amraam+'　AIM-9 ×'+s.aim9,46,506,13,'#e8f2ea');
  this.text(a,'機関砲 '+s.gun+'発　フレア '+s.flares,46,524,13,dim);
  this.text(a,'機体 '+Math.max(0,Math.ceil(s.hp))+'%'+(s.gear?'　脚出':''),46,542,13,s.hp<50?warn:dim);
  this.text(a,'1/2/3 兵装　Space 発射　X フレア　T ロック　V 視点',46,560,10.5,dim);

  /* レーダー画面（前方60度・60kmまで） */
  const rx=724,ry=430,rw=240,rh=140;
  this.box(a,rx,ry,rw,rh,'#04120d99','#79b89455');
  this.text(a,'RADAR ±60° / 60km',rx+8,ry-6,10,dim);
  for(let g=1;g<=3;g++)this.line(a,[[rx,ry+rh-rh*g/3],[rx+rw,ry+rh-rh*g/3]],'#2f5a48',1);
  this.line(a,[[rx+rw/2,ry],[rx+rw/2,ry+rh]],'#2f5a48',1);
  for(const t of this.jetTargets()){
   const d=t.pos.clone().sub(s.pos),r=d.length();
   if(r>60000)continue;
   const rel=Math.atan2(d.x,-d.z)-Math.atan2(f.x,-f.z);
   let az=Math.atan2(Math.sin(rel),Math.cos(rel))*180/Math.PI;
   if(Math.abs(az)>60)continue;
   const px=rx+rw/2+az/60*(rw/2),py=ry+rh-r/60000*rh;
   const own=t===s.lock;
   this.box(a,px-4,py-4,8,8,own?'#ffd27a':'#8fd6a8');
   if(own){a.strokeStyle='#ffd27a';a.lineWidth=1;a.strokeRect(px-8,py-8,16,16);
    this.text(a,(r/1000).toFixed(1)+'km',px+11,py+4,10,'#ffd27a');}
  }
  /* 敵ミサイル警報表示（RWR） */
  const wx=660,wy=250,wr=54;
  this.circle(a,wx+wr,wy+wr,wr,'#04120d88','#79b89444');
  this.text(a,'RWR',wx+wr-13,wy+wr+4,10,dim);
  for(const m of s.missiles.filter(m=>m.side==='them')){
   const d=m.pos.clone().sub(s.pos),rel=Math.atan2(d.x,-d.z)-Math.atan2(f.x,-f.z);
   const px=wx+wr+Math.sin(rel)*wr*.78,py=wy+wr-Math.cos(rel)*wr*.78;
   this.circle(a,px,py,4,'#ff8a7a');
  }
  for(const b of s.bandits.filter(b=>!b.dead)){
   const d=b.pos.clone().sub(s.pos),rel=Math.atan2(d.x,-d.z)-Math.atan2(f.x,-f.z);
   const px=wx+wr+Math.sin(rel)*wr*.6,py=wy+wr-Math.cos(rel)*wr*.6;
   this.circle(a,px,py,3,'#ffd27a');
  }

  /* 目標枠・リード */
  const mark=(pos,label,color,size)=>{
   const p=SkyProject.to(cam,pos);
   if(!p.on)return null;
   a.strokeStyle=color;a.lineWidth=1.6;
   a.strokeRect(p.x-size,p.y-size,size*2,size*2);
   if(label)this.text(a,label,p.x+size+5,p.y-size+11,11,color);
   return p;
  };
  for(const t of this.jetTargets()){
   const r=s.pos.distanceTo(t.pos);
   const size=clamp(2600/Math.max(120,r)*22,8,40);
   const p=mark(t.pos,(t.label||'')+' '+(r/1000).toFixed(1)+'km',t===s.lock?'#ffd27a':'#ff9d8a',size);
   if(t===s.lock&&p){
    /* ロック中は画面外でも方向を示す */
    this.line(a,[[cx,cy],[p.x,p.y]],'#ffd27a33',1);
   }
  }
  if(s.tutor&&!s.tutor.dead)mark(s.tutor.pos,'教官機 '+(s.pos.distanceTo(s.tutor.pos)/1000).toFixed(1)+'km',cold,18);
  if(s.transport&&!s.transport.dead)mark(s.transport.pos,'輸送機 '+(s.pos.distanceTo(s.transport.pos)/1000).toFixed(1)+'km',cold,22);
  if(s.awacs&&!s.awacs.dead)mark(s.awacs.pos,'ウィンドウ',cold,14);
  if(v.key==='train'&&s.step===0&&s.gates[s.gate]){
   const g=s.gates[s.gate];
   mark(V3(g.x,g.y,g.z),'リング '+(s.gate+1)+' / '+s.gates.length,'#9ff0c8',24);
  }
  if(v.key==='train'&&s.step===2){
   const p=mark(s.field.position.clone().setY(s.fieldY+2),'滑走路',cold,26);
   this.text(a,'進入：速度150〜180kt / 高度を落として中心線に合わせる / Gで脚',500,120,13,cold,'center');
  }
  /* 機関砲の照準（近距離の目標に対する見越し点） */
  if(s.sel==='gun'){
   const t=this.jetIrTarget()||s.lock;
   if(t){
    const r=s.pos.distanceTo(t.pos);
    if(r<1600){
     const tof=r/1030;
     const lead=t.pos.clone().addScaledVector((t.vel||fwdOf(t.q||s.q).multiplyScalar(t.spd||250)),tof);
     const p=SkyProject.to(cam,lead);
     if(p.on){this.circle(a,p.x,p.y,13,null,'#ffe6a8');this.circle(a,p.x,p.y,2,'#ffe6a8');}
    }
   }
  }
  /* 状態と警報 */
  if(s.stall>.4){this.text(a,'失速警報：速度が足りない。機首を下げて出力を上げる',500,182,16,warn,'center');}
  const agl=s.pos.y-SkyWorld.height(s.pos.x,s.pos.z);
  if(agl<420&&!(v.land&&s.step===2))this.text(a,'低高度警報 '+Math.round(agl)+' m　機首を上げろ',500,158,16,warn,'center');
  if(s.warn>0){
   a.globalAlpha=Math.min(1,s.warn);
   this.box(a,280,206,440,30,'#3a1616cc','#ff8a7a');
   this.text(a,s.warnText||'警告',500,226,15,'#ffd4c8','center');
   a.globalAlpha=1;
  }
  if(s.hitT>0){a.fillStyle='rgba(255,60,40,'+(s.hitT*.28).toFixed(2)+')';a.fillRect(0,0,1000,600);}
  /* 小窓のわく */
  a.strokeStyle='#79b89466';a.lineWidth=1;a.strokeRect(724,58,240,150);
  this.text(a,s.view?'COCKPIT':'CHASE VIEW',730,52,10,dim);
  /* 下段の目的 */
  const goal=v.key==='train'?(s.step===0?'航路リングを順番にくぐる':s.step===1?'教官機のうしろに12秒つく（'+Math.floor(s.formT)+'/12）':'基地に着陸する')
   :v.key==='escort'?(s.step===0?'輸送機カーゴ1に合流する':s.step===1?'輸送機を守って敵機を落とす（第'+s.wave+'波）':'輸送機を目的地まで送る')
   :v.key==='final'?(s.step===0?'巡航ミサイルを撃墜（'+(s.destroyedCruise||0)+' / '+v.cruise+'）':s.step===1?'ヴェスパを撃墜する':'西へ離脱（'+Math.floor(s.bda)+'/10秒）')
   :(s.step<2?'敵機を撃墜する（残り'+s.bandits.filter(b=>!b.dead).length+'機）':'西へ離脱（'+Math.floor(s.bda)+'/10秒）');
  this.box(a,330,466,634,40,'#07161088','#79b89433');
  this.text(a,goal,344,492,15,'#eef5ec');
  this.text(a,'残り '+Math.max(0,Math.ceil(s.limit))+'秒　撃墜 '+s.kills,344,462,11,dim);
 };
})();

/* ---------------- 5. 格納庫：AeroForgeで作った機体を見る ---------------- */
(function(){
 const MA=MissionActions;
 MA.catalog.hangar={name:'機体を見る（格納庫）',en:'08 / HANGAR',subtitle:'AeroForge 格納庫',color:'#d8c9a0',
  lead:'Blenderの操作（円を並べてブリッジ、平面を押し出し、断面を軸回転）と同じ手順で組んだ機体を、そのまま回して見られる。同じ設計表からBlender用のPythonも書き出せる。',
  steps:['機体を選ぶ','回して形を見る','Blenderスクリプトを保存する'],
  controls:'A/D：回す　W/S：上下から見る　Q/E：寄る・引く　1〜9：機体を切り替え',reward:''};

 const LIST=['f15','mq9','su27','c130','awacs','cruise','sam','radar','bus','truck'];
 MA.setupHangar=function(){
  const s=this.s;
  AeroForge.reset();
  this.makeWorld(false);
  const scene=this.scene3D;
  scene.background=new THREE.Color(0x121a1f);
  scene.fog=null;
  scene.add(new THREE.DirectionalLight(0xffffff,.9).translateX(-40));
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(260,260,10,10),
   new THREE.MeshStandardMaterial({color:0x151b1e,roughness:.98}));
  floor.rotation.x=-Math.PI/2;floor.position.y=-22;scene.add(floor);
  const grid=THREE.GridHelper?new THREE.GridHelper(260,26,0x35564e,0x1e2c29):null;
  if(grid){grid.position.y=-21.9;scene.add(grid);}
  Object.assign(s,{step:0,idx:0,spin:.6,tilt:.35,dist:64,model:null,verts:0,tris:0});
  this.camera3D.near=.5;this.camera3D.far=4000;this.camera3D.fov=42;this.camera3D.updateProjectionMatrix();
  this.hangarLoad(0);
  this.touchKeys=[['回す左','KeyA'],['回す右','KeyD'],['上から','KeyW'],['下から','KeyS'],['寄る','KeyQ'],['引く','KeyE'],['次の機体','Digit2']];
  this.touchPad();
  this.tools([
   ['次の機体',()=>this.hangarLoad((this.s.idx+1)%LIST.length)],
   ['Blenderスクリプトを保存',()=>{AeroForge.download();this.s.step=2;this.message('BLACKSAND-AEROFORGE-v28.34b.py を保存した。Blenderのスクリプト画面に貼り付けて実行すると、同じ機体ができる。');}]
  ]);
  this.initialMessage='A/Dで回す、W/Sで見る角度、Q/Eで寄り引き。下の「次の機体」で切り替え。';
 };
 MA.hangarLoad=function(i){
  const s=this.s;
  if(s.model)this.scene3D.remove(s.model);
  s.idx=i;
  const name=LIST[i];
  const m=AeroForge.build(name,{unique:true});
  m.traverse(o=>{if(o.userData.part==='burner')o.visible=false;});   /* 格納庫ではエンジンは止めてある */
  const box=new THREE.Box3().setFromObject(m),size=new THREE.Vector3();box.getSize(size);
  const k=26/Math.max(size.x,size.y,size.z);
  m.scale.multiplyScalar(k);
  m.position.y=-4;
  this.scene3D.add(m);s.model=m;s.step=Math.max(s.step,1);
  let verts=0,tris=0;
  m.traverse(o=>{if(o.isMesh&&o.geometry){verts+=o.geometry.attributes.position.count;
   tris+=(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3;}});
  s.verts=verts;s.tris=Math.round(tris);
  s.name=AeroForge.blueprints[name].name;
  s.parts=AeroForge.blueprints[name].parts.length;
  this.message(s.name+'：部品 '+s.parts+'個・三角形 '+s.tris+'枚');
 };
 MA.updateHangar=function(dt){
  const s=this.s,k=this.keys;
  s.spin+=((k.KeyD?1:0)-(k.KeyA?1:0))*dt*1.4+dt*.14;
  s.tilt=clamp(s.tilt+((k.KeyW?1:0)-(k.KeyS?1:0))*dt*.9,-.6,1.2);
  s.dist=clamp(s.dist+((k.KeyE?1:0)-(k.KeyQ?1:0))*dt*40,26,160);
  for(let i=0;i<LIST.length;i++)if(k['Digit'+(i+1)]&&s.idx!==i)this.hangarLoad(i);
  if(s.model)s.model.rotation.y=s.spin;
  const cam=this.camera3D;
  cam.position.set(0,Math.sin(s.tilt)*s.dist,Math.cos(s.tilt)*s.dist);
  cam.lookAt(0,-2,0);
 };
 MA.drawHangar=function(a){
  const s=this.s;
  this.box(a,34,40,330,126,'#0b161a99','#c9b98a44');
  this.text(a,'AEROFORGE / BLENDER OPERATIONS',46,62,11,'#d8c9a0');
  this.text(a,s.name||'',46,88,18,'#f0ece0');
  this.text(a,'部品 '+s.parts+'個　三角形 '+s.tris+'枚　頂点 '+s.verts,46,110,13,'#a99f86');
  this.text(a,'loft（円＋ブリッジ）／plate（平面＋押し出し）／spin（軸回転）',46,130,11.5,'#a99f86');
  this.text(a,'ミラーは左右対称の部品にだけ使う',46,148,11.5,'#a99f86');
  this.text(a,(s.idx+1)+' / '+LIST.length+'　1〜9キーで直接選択',46,164,11,'#8e8672');
  this.text(a,'A/D 回す　W/S 角度　Q/E 寄り引き',500,578,12,'#a99f86','center');
 };
})();

/* ---------------- 6. SkyWar：完全新規ストーリー「空を取り戻せ」 ----------------
   無人機（MQ-9型）の遠隔操作から始まり、F-15のパイロットとして空を取り戻す
   全8章。既存の「核発射を阻止せよ」とは別の話・別の登場人物・別のセーブ。 */
const SkyWar={
 version:'28.34b',
 title:'空を取り戻せ',
 subtitle:'OPERATION IRON VEIL',
 prologue:'隣国の武装勢力「鉄環（てっかん）」が、沿岸のオルドナ空港と長距離対空ミサイルを占拠した。'
  +'空が封鎖され、けが人も物資も運べない。{P}は第7航空隊のパイロット。'
  +'はじめは無人機のカメラで敵を探し、やがてF-15に乗って、空を取り戻す。',
 cast:{
  p:'{P}（あなた）／ 第7航空隊のパイロット',
  yuki:'ユキ ／ 無人機のセンサー担当。カメラの目',
  misaki:'ミサキ ／ 早期警戒機の管制官（コールサイン「ウィンドウ」）',
  hayato:'ハヤト ／ F-15の教官。のちの僚機「ドラゴン1」',
  take:'タケ ／ 整備長。機体と兵装を用意する',
  vespa:'ヴェスパ ／ 鉄環のエースパイロット。ハヤトの元教官',
  gideon:'ギデオン ／ 鉄環の防空指揮官'
 },
 people:[
  ['{P}（あなた）','第7航空隊のパイロット。前半は無人機を遠隔操作し、後半はF-15に乗る。'],
  ['ユキ','無人機のセンサー担当。何が映っているかを判断する。'],
  ['ミサキ','早期警戒機の管制官。敵機の位置と進入路を教える。'],
  ['ハヤト','F-15の教官。{P}の僚機になる。'],
  ['タケ','整備長。機体の状態と兵装を管理する。'],
  ['ヴェスパ','敵のエース。ハヤトの元教官。'],
  ['ギデオン','敵の防空指揮官。対空ミサイルで空を封鎖している。']
 ],
 chapters:[
  {id:'sky1',title:'空の目',tag:'無人機 / 偵察',type:'drone',variant:0,
   location:'サハド平原 上空5000m',
   goal:'無人機のカメラで、敵の対空レーダー3か所を見つけて味方に知らせる。',
   next:'見つけた発射機を、夜のうちに叩く。',
   intro:[
    ['misaki','{P}、聞こえる？ ミサキ。今日から空の状況を説明する役をやる。'],
    ['misaki','鉄環が沿岸の空港と長距離対空ミサイルを取った。おかげで味方の飛行機は一機も近づけない。'],
    ['yuki','はじめまして、ユキです。無人機「サンドパイパー」のカメラ担当。操縦は{P}、見るのは二人で。'],
    ['yuki','まずは敵のレーダーを探す。高い高度から、ゆっくり。焦って寄りすぎると、かえって見つからないよ。'],
    ['p','了解。カメラで探して、見つけたら座標を送る。']
   ],
   outro:[
    ['yuki','レーダー3か所、座標を送った。これで敵の目の位置がわかった。'],
    ['misaki','よくやった。学校のバスをマークしなかったのも助かる。あれを敵だと報告したら、取り返しがつかない。'],
    ['yuki','次は、そのレーダーに弾を運ぶ発射機。夜のあいだに動くから、暗視で追う。'],
    ['p','夜でも追える。やろう。']
   ],
   record:'サハド平原で敵の対空レーダー3か所を確認。民間の車と区別して報告した。'},
  {id:'sky2',title:'静かな一撃',tag:'無人機 / 精密攻撃 / ROE',type:'drone',variant:1,
   location:'サハド街道（夜）',
   goal:'移動する発射機2両を、レーザーで照らして破壊する。民間バスに被害を出さない。',
   next:'F-15への転換訓練。自分の体で空へ出る。',
   intro:[
    ['yuki','街道を発射機が2両。前の車はたぶん囮。赤外線に切り替えて、エンジンの熱で見分けて。'],
    ['misaki','ひとつだけ約束。同じ道を民間のバスが走っている。少しでも近ければ撃たない。'],
    ['p','待てばいい。こっちは燃料がある。'],
    ['yuki','そう。無人機のいいところは、待てること。Fでレーザーを当て続けて、Spaceで落とす。'],
    ['misaki','撃ったあとでも、Xで誘導を切れば外せる。迷ったら外して。']
   ],
   outro:[
    ['yuki','2両とも止まった。バスは何も知らずに走っていったよ。'],
    ['misaki','報告は「民間被害なし」。この一行のために、{P}は30秒待った。覚えておいて。'],
    ['hayato','──はじめて話す。ハヤトだ。F-15の教官をしている。'],
    ['hayato','無人機の腕は聞いた。だが空を取り返すには、人が乗った戦闘機がいる。明日から転換訓練だ。'],
    ['p','乗ります。']
   ],
   record:'夜の街道で発射機2両を破壊。民間バスをやり過ごしてから撃ち、被害を出さなかった。'},
  {id:'sky3',title:'はじめての空',tag:'F-15 / 訓練',type:'jet',variant:0,
   location:'第7航空隊 基地',
   goal:'航路リング6つを通り、教官機の後ろにつき、滑走路に着陸する。',
   next:'26km先の敵2機を、レーダーとミサイルで迎え撃つ。',
   intro:[
    ['take','整備長のタケだ。{P}の機体はこれ。翼も胴も、うちで一から組んだ。大事に使ってくれ。'],
    ['hayato','無人機との違いは一つ。落ちたら{P}も落ちる。だから速度と高度を捨てるな。'],
    ['hayato','緑のリングを順番にくぐって、私の後ろにつけ。最後は着陸だ。Gで脚を出すのを忘れるな。'],
    ['p','高度と速度。忘れません。']
   ],
   outro:[
    ['hayato','悪くない。無人機で目を作ってきた人間は、だいたい空でも周りが見える。'],
    ['misaki','ちょうどいい時に仕上がった。敵の戦闘機が海の上に出てきている。2機。'],
    ['hayato','初陣が迎撃か。いいさ、遠くから撃つのがいちばん安全だ。'],
    ['p','行きます。']
   ],
   record:'F-15の転換訓練を修了。航路・編隊・着陸をこなした。'},
  {id:'sky4',title:'見えない敵',tag:'F-15 / BVR迎撃',type:'jet',variant:1,
   location:'オルドナ沖 高度4000m',
   goal:'26km先から来る敵2機を、AIM-120で撃墜して離脱する。',
   next:'敵のエース部隊が出てくる。近距離の格闘戦になる。',
   intro:[
    ['misaki','正面26km、高度4000、2機。まだ相手の目には入っていない。'],
    ['hayato','Tでロック、1でAIM-120。撃ったら機首を目標から外すな。外すと誘導が切れる。'],
    ['misaki','向こうも撃ってくる。警報が鳴ったらXでチャフ、そして敵に対して横向きに大きく曲がる。'],
    ['p','ロックした。撃ちます。']
   ],
   outro:[
    ['misaki','2機とも落ちた。{P}は姿を見ないまま勝った。それがいまの空の戦い方。'],
    ['hayato','だが相手も学ぶ。次は近づいてくる。ヴェスパの部隊だ。'],
    ['hayato','ヴェスパは……私の教官だった男だ。今は金で飛んでいる。'],
    ['p','近づかれる前に落とせなければ、格闘戦ですね。']
   ],
   record:'オルドナ沖で敵2機を中距離ミサイルで撃墜。初の空対空戦果。'},
  {id:'sky5',title:'近すぎる距離',tag:'F-15 / 格闘戦',type:'jet',variant:2,
   location:'オルドナ沖 高度4000m',
   goal:'ヴェスパ隊の僚機との格闘戦に勝ち、離脱する。',
   next:'無人機に戻り、敵の防空の中心を味方に指し示す。',
   intro:[
    ['hayato','来たぞ。3km、正面。もうミサイルの距離じゃない。'],
    ['hayato','覚えておけ。曲がるたびに速度は減る。減りきったら的だ。'],
    ['misaki','高度も速度のうち。降りながら曲がれば速度は残る。'],
    ['p','うしろを取ります。']
   ],
   outro:[
    ['hayato','……やられた。右の翼をやられた。飛べる。基地に戻る。'],
    ['misaki','ハヤトは無事。機体は修理に2日。{P}、しばらく僚機なしだ。'],
    ['take','その2日で、無人機のほうをもう一度出す。敵の防空の中心を見つけたい。'],
    ['yuki','また一緒だね、{P}。今度は味方のF-15を私たちが導く。']
   ],
   record:'格闘戦でヴェスパ隊の僚機を撃墜。ハヤト機は被弾し、修理に入った。'},
  {id:'sky6',title:'二つの目',tag:'無人機 / 目標指示',type:'drone',variant:2,
   location:'鉄環 防空司令部の周辺',
   goal:'目標3つを識別して味方F-15に指示し、対空網に穴を開ける。',
   next:'開いた空の道で、救援物資を運ぶ輸送機を護衛する。',
   intro:[
    ['yuki','敵の防空を回しているのは、ここにある管制レーダーと発射機2両。'],
    ['misaki','味方のF-15が待機している。{P}がマークした順に叩く。'],
    ['yuki','ただし、低いところは機関砲の射程。高度3500mより下に降りないで。'],
    ['gideon','（傍受）……こちらギデオン。上に無人機がいる。高度を測れ。落とせ。'],
    ['p','聞こえてる。高いまま仕事をします。']
   ],
   outro:[
    ['misaki','3つとも消えた。空に道が開いた。ギデオンの封鎖は終わり。'],
    ['yuki','無人機って、こういう仕事のためにあると思う。誰も乗っていない目で、先に見る。'],
    ['take','道が開いたなら、運ぶものがある。街の病院に薬と発電機。輸送機が出る。'],
    ['p','護衛は私が。']
   ],
   record:'防空司令部のレーダーと発射機を味方F-15に指示して破壊。空の封鎖が解けた。'},
  {id:'sky7',title:'嵐の護衛',tag:'F-15 / 護衛',type:'jet',variant:3,
   location:'サハド回廊',
   goal:'輸送機カーゴ1を、2波の敵機と地上の対空ミサイルから守って目的地まで送る。',
   next:'鉄環は最後の手を使う。街へ向かう巡航ミサイル。',
   intro:[
    ['misaki','輸送機カーゴ1。薬と発電機を積んでいる。速度は遅い。逃げられない。'],
    ['misaki','敵は必ず輸送機を狙う。{P}は輸送機から3km以上離れないで。'],
    ['take','地上に対空ミサイルが1か所残っている。警報が鳴ったらチャフと高度変更。'],
    ['p','カーゴ1は落とさせません。']
   ],
   outro:[
    ['misaki','カーゴ1、着陸。薬は病院に入った。今夜の手術は電気が持つ。'],
    ['hayato','（無線）機体が直った。次は一緒に飛ぶ。……間に合ってよかった。'],
    ['misaki','よくない知らせもある。鉄環が巡航ミサイルを準備した。狙いは街。'],
    ['gideon','（傍受）空を取られたなら、空の外から撃つ。4発だ。'],
    ['p','全部落とします。']
   ],
   record:'輸送機カーゴ1を護衛し、救援物資を街へ届けた。ハヤト機が復帰。'},
  {id:'sky8',title:'鉄の空',tag:'F-15 / 最終決戦',type:'jet',variant:4,
   location:'街の手前 低空',
   goal:'巡航ミサイル4発を撃墜し、ヴェスパを倒して空を取り戻す。',
   next:'',
   intro:[
    ['misaki','巡航ミサイル4発、低空。街まで5分。高いところからでは当たらない。降りて、後ろから。'],
    ['hayato','ヴェスパも来る。あの人は必ず、いちばん大事な場面に出てくる。'],
    ['vespa','（無線）無人機で私の部隊を削った子がいると聞いた。今日は自分で飛んでいるな。'],
    ['vespa','機械ごしではなく、ここで会おう。'],
    ['p','行きます。まずミサイル、それからあなたです。']
   ],
   outro:[
    ['misaki','4発とも海と砂漠に落ちた。街は無事。……そして、ヴェスパ機も落ちた。'],
    ['hayato','脱出したそうだ。あの人はまた飛ぶかもしれん。だが今日の空はこちらのものだ。'],
    ['yuki','無人機の目で始めて、自分の手で終わらせたね。'],
    ['take','機体を見た。翼にひびが入っている。……よく帰ってきた。'],
    ['p','空は、取り戻しました。']
   ],
   record:'巡航ミサイル4発を迎撃し、敵エース「ヴェスパ」を撃墜。空の封鎖は完全に終わった。'}
 ],
 ending:[
  ['misaki','鉄環の防空はなくなった。空港は明日、味方の手に戻る。'],
  ['hayato','{P}は無人機から始めて、戦闘機で終えた。どちらも空だ。どちらも人が決める。'],
  ['yuki','次に飛ぶときも、私が見てる。'],
  ['p','ありがとう。……次も、撃たない判断ができるように。']
 ],
 /* ---- セーブ ---- */
 data(){
  if(!SAVE.sky||typeof SAVE.sky!=='object')SAVE.sky={ch:0,done:[],best:{},finished:false};
  if(!Array.isArray(SAVE.sky.done))SAVE.sky.done=[];
  if(!SAVE.sky.best||typeof SAVE.sky.best!=='object')SAVE.sky.best={};
  return SAVE.sky;
 },
 name(){const n=(SAVE.name||'').trim();return n&&n!=='PLAYER'?n:'あなた';},
 fill(t){return String(t).split('{P}').join(this.name());},
 unlocked(i){const d=this.data();return i===0||d.done.includes(this.chapters[i-1].id);},

 /* ---- 画面 ---- */
 install(){
  const css=document.createElement('style');
  css.textContent=`
#skyHub,#skyTalk{position:fixed;inset:0;z-index:180;overflow:auto;padding:5vh 6vw;color:#e8f0ea;
 background:radial-gradient(circle at 25% 15%,#12303acc,#05090cf5 70%);backdrop-filter:blur(5px);
 font-family:system-ui,sans-serif}
#skyHub[hidden],#skyTalk[hidden]{display:none!important}
#skyHub .eyebrow{letter-spacing:.3em;font:11px monospace;color:#9fd6d0}
#skyHub h1{font-size:clamp(26px,5vw,46px);margin:6px 0 4px;letter-spacing:.06em}
#skyHub .lead{max-width:860px;line-height:1.85;color:#b9c9c2;font-size:14px}
#skyBar{display:flex;flex-wrap:wrap;gap:9px;margin:18px 0}
#skyBar button,#skyTalk button{background:#14303a;border:1px solid #6e9c95;color:#e8f0ea;
 padding:10px 16px;border-radius:8px;font-size:13px;cursor:pointer}
#skyBar button:hover,#skyTalk button:hover{background:#1d4450}
#skyBar button.go{background:#2c6b58;border-color:#8fd3b4}
#skyChapters{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px;margin-top:6px}
.skyCh{text-align:left;background:#0e2029;border:1px solid #3f5f63;border-radius:10px;padding:13px 15px;
 color:#e8f0ea;cursor:pointer;min-height:132px;display:flex;flex-direction:column;gap:5px}
.skyCh:hover{border-color:#8fd3b4}
.skyCh small{color:#8fb3ab;font:11px monospace;letter-spacing:.12em}
.skyCh b{font-size:16px}
.skyCh p{margin:0;font-size:12px;line-height:1.6;color:#a9bdb6}
.skyCh .state{margin-top:auto;font-size:11px;color:#9fd6b4}
.skyCh[data-lock="1"]{opacity:.42;cursor:not-allowed}
.skyCh[data-done="1"]{border-color:#2c6b58;background:#102a26}
#skyFree{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 24px}
#skyFree button{background:#132228;border:1px solid #47656a;color:#cfe0d8;padding:8px 12px;border-radius:7px;font-size:12px;cursor:pointer}
#skyTalk{display:flex;align-items:flex-end;justify-content:center;padding:0 0 6vh}
#skyTalkCard{width:min(920px,92vw);background:#08161cf0;border:1px solid #6e9c95;border-radius:14px;padding:22px 26px;box-shadow:0 24px 70px #000a}
#skyTalkWho{color:#9fd6d0;font:12px monospace;letter-spacing:.2em;margin-bottom:8px}
#skyTalkLine{font-size:clamp(15px,2.2vw,19px);line-height:1.9;min-height:3.6em}
#skyTalkFoot{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:14px}
#skyTalkFoot small{color:#7fa39b;font-size:11px}
@media(max-width:680px){#skyHub{padding:4vh 5vw}#skyChapters{grid-template-columns:1fr 1fr}.skyCh{min-height:118px}}
`;
  document.head.append(css);

  const entry=document.createElement('button');
  entry.id='skyEntry';entry.className='mbtn';
  entry.innerHTML='ストーリー2：空を取り戻せ<small>全8章 / 無人機とF-15 / 現代戦</small>';
  const menu=$('#title .menu');
  if(menu)menu.insertBefore(entry,$('#btnShop')||$('#btnSet'));
  UI.bind(entry,()=>this.open());

  const hub=document.createElement('section');hub.id='skyHub';hub.hidden=true;
  hub.innerHTML='<div class="eyebrow">AFTERLIGHT / '+this.subtitle+'</div><h1></h1>'
   +'<p class="lead" id="skyLead"></p>'
   +'<div id="skyBar"><button class="go" id="skyContinue">続きから</button>'
   +'<button id="skyPeople">登場人物</button><button id="skyRecords">これまでの記録</button>'
   +'<button id="skyBlender">機体のBlenderスクリプトを保存</button>'
   +'<button id="skyHangar">格納庫で機体を見る</button>'
   +'<button id="skyHome">タイトルへ</button></div>'
   +'<div class="eyebrow" style="margin-bottom:6px">自由に遊ぶ（進行は変わりません）</div><div id="skyFree"></div>'
   +'<div id="skyChapters"></div>';
  document.body.append(hub);
  hub.querySelector('h1').textContent=this.title;

  const talk=document.createElement('section');talk.id='skyTalk';talk.hidden=true;
  talk.innerHTML='<div id="skyTalkCard"><div id="skyTalkWho"></div><div id="skyTalkLine"></div>'
   +'<div id="skyTalkFoot"><small>クリック / Enter / Space で次へ</small><span>'
   +'<button id="skyTalkSkip">まとめて読む</button> <button id="skyTalkNext">次へ ▶</button></span></div></div>';
  document.body.append(talk);
  talk.onclick=e=>{if(e.target===talk||e.target.id==='skyTalkCard'||e.target.id==='skyTalkLine')this.talkNext();};
  $('#skyTalkNext').onclick=()=>this.talkNext();
  $('#skyTalkSkip').onclick=()=>this.talkAll();
  addEventListener('keydown',e=>{
   if($('#skyTalk').hidden)return;
   if(e.code==='Enter'||e.code==='Space'){e.preventDefault();this.talkNext();}
   if(e.code==='Escape'){e.preventDefault();this.talkAll();}
  });

  $('#skyContinue').onclick=()=>{
   const d=this.data();
   const next=this.chapters.findIndex(c=>!d.done.includes(c.id));
   this.begin(next<0?this.chapters.length-1:next);
  };
  $('#skyHome').onclick=()=>{hub.hidden=true;Game.toMenu();};
  $('#skyPeople').onclick=()=>this.showPeople();
  $('#skyRecords').onclick=()=>this.showRecords();
  $('#skyBlender').onclick=()=>{AeroForge.download();toast('Blenderスクリプトを保存した（BLACKSAND-AEROFORGE-v28.34b.py）');};
  $('#skyHangar').onclick=()=>{hub.hidden=true;MissionActions.open('hangar',true,0);MissionActions.sky={free:true};};
 },

 open(){
  if(typeof Story!=='undefined'&&Story.active)Story.leave(false);
  if(Match.running)Game.quitMatch();
  if(typeof Net!=='undefined'&&Net.live)Net.reset();
  Game.show(null);Game.state='menu';document.exitPointerLock?.();
  $('#storyHub')&&($('#storyHub').hidden=true);
  $('#skyHub').hidden=false;
  this.paint();
 },
 paint(){
  const d=this.data();
  $('#skyLead').textContent=this.fill(this.prologue);
  const free=$('#skyFree');free.innerHTML='';
  const freeList=[['無人機：偵察','drone',0],['無人機：精密攻撃','drone',1],['無人機：目標指示','drone',2],
   ['F-15：訓練飛行','jet',0],['F-15：BVR迎撃','jet',1],['F-15：格闘戦','jet',2],
   ['F-15：輸送機の護衛','jet',3],['F-15：最終決戦','jet',4]];
  for(const [label,type,variant] of freeList){
   const b=document.createElement('button');b.textContent=label;
   b.onclick=()=>{$('#skyHub').hidden=true;MissionActions.open(type,true,variant);MissionActions.sky={free:true};};
   free.append(b);
  }
  const wrap=$('#skyChapters');wrap.innerHTML='';
  this.chapters.forEach((c,i)=>{
   const done=d.done.includes(c.id),lock=!this.unlocked(i);
   const b=document.createElement('button');b.className='skyCh';
   b.dataset.lock=lock?'1':'0';b.dataset.done=done?'1':'0';
   const best=d.best[c.id];
   b.innerHTML='<small>第'+(i+1)+'章 · '+escapeHTML(c.tag)+'</small><b>'+escapeHTML(c.title)+'</b>'
    +'<p>'+escapeHTML(this.fill(c.goal))+'</p>'
    +'<span class="state">'+(lock?'前の章をクリアすると解放':done?'クリア'+(best?'（評価 '+best.score+' / 100）':''):'ここから出撃')+'</span>';
   if(!lock)b.onclick=()=>this.begin(i);
   wrap.append(b);
  });
 },
 showPeople(){
  this.talk(this.people.map(([n,t])=>['',this.fill(n)+'　'+this.fill(t)]),()=>this.open());
 },
 showRecords(){
  const d=this.data();
  const lines=this.chapters.filter(c=>d.done.includes(c.id)).map(c=>['',this.fill(c.record)]);
  this.talk(lines.length?lines:[['','まだ記録がない。第1章から始めよう。']],()=>this.open());
 },

 /* ---- 会話 ---- */
 talk(lines,done){
  this.lines=lines.slice();this.li=0;this.onTalkEnd=done;
  $('#skyHub').hidden=true;$('#skyTalk').hidden=false;
  this.paintTalk();
 },
 paintTalk(){
  const l=this.lines[this.li];
  if(!l){this.talkDone();return;}
  const who=l[0]?this.fill(this.cast[l[0]]||l[0]):'';
  $('#skyTalkWho').textContent=who;
  $('#skyTalkLine').textContent=this.fill(l[1]);
  $('#skyTalkNext').textContent=this.li>=this.lines.length-1?'つづける ▶':'次へ ▶';
 },
 talkNext(){this.li++;this.paintTalk();},
 talkAll(){
  const rest=this.lines.slice(this.li).map(l=>(l[0]?'【'+this.fill(this.cast[l[0]]||l[0])+'】\n':'')+this.fill(l[1])).join('\n\n');
  $('#skyTalkWho').textContent='まとめ';
  $('#skyTalkLine').textContent=rest;
  this.li=this.lines.length-1;
  $('#skyTalkNext').textContent='つづける ▶';
 },
 talkDone(){
  $('#skyTalk').hidden=true;
  const fn=this.onTalkEnd;this.onTalkEnd=null;
  if(fn)fn();
 },

 /* ---- 出撃と帰還 ---- */
 begin(i){
  const c=this.chapters[i];if(!c)return;
  this.chapter=i;
  this.talk(c.intro,()=>this.launch(i));
 },
 launch(i){
  const c=this.chapters[i];
  $('#skyHub').hidden=true;$('#skyTalk').hidden=true;
  MissionActions.open(c.type,true,c.variant);
  MissionActions.sky={ch:i};
  /* 章の見出しとブリーフィングに差し替える */
  $('#opEyebrow').textContent='IRON VEIL / CHAPTER '+String(i+1).padStart(2,'0');
  $('#opTitle').textContent=c.title;
  const cat=MissionActions.catalog[c.type];
  MissionActions.modal('MISSION BRIEFING',c.title,
   '<div class="opContext"><b>場所</b><br>'+escapeHTML(c.location)+'<br><b>この章の目的</b><br>'+escapeHTML(this.fill(c.goal))+'</div>'
   +'<p>'+escapeHTML(MissionActions.s.v?MissionActions.s.v.brief:cat.lead)+'</p>'
   +'<ol>'+cat.steps.map(t=>'<li>'+escapeHTML(t)+'</li>').join('')+'</ol>'
   +'<p>'+escapeHTML(cat.controls)+'</p>',
   [['任務を開始',()=>MissionActions.start()],['ブリーフィングに戻る',()=>{MissionActions.exit();}]]);
 },
 complete(result){
  const i=this.chapter,c=this.chapters[i];
  const d=this.data();
  if(c&&!d.done.includes(c.id))d.done.push(c.id);
  if(c){
   const best=d.best[c.id];
   if(!best||result.score>best.score)d.best[c.id]={score:result.score,seconds:result.seconds};
  }
  d.ch=Math.min(this.chapters.length-1,i+1);
  if(d.done.length>=this.chapters.length)d.finished=true;
  writeSave();
  const last=i>=this.chapters.length-1;
  const lines=(c?c.outro:[]).concat(last?this.ending:[]);
  this.talk(lines,()=>{
   if(last){toast('「空を取り戻せ」クリア。自由出撃と格納庫はいつでも遊べる。');}
   this.open();
  });
 }
};

/* ---------------- 7. MissionActions への接続 ---------------- */
(function(){
 const MA=MissionActions;
 const mine=t=>t==='drone'||t==='jet'||t==='hangar';

 /* 新しい任務のキー操作 */
 const baseKey=MA.keyAction;
 MA.keyAction=function(key){
  const t=this.type,s=this.s;
  if(t==='drone'){
   if(key==='Space')this.droneFire();
   else if(key==='KeyX')this.droneAbort();
   else if(key==='KeyM')this.droneMark();
   else if(key==='KeyT')this.droneTrack();
   else if(key==='KeyR'){s.ir=!s.ir;SkyIR.apply(this.scene3D,s.ir);this.message(s.ir?'赤外線カメラ。':'可視光カメラ。');}
   else if(key==='KeyO'){s.orbit=!s.orbit;this.message(s.orbit?'自動旋回 ON':'自動旋回 OFF');}
   return;
  }
  if(t==='jet'){
   if(key==='Space')this.jetFire();
   else if(key==='KeyT')this.jetLock();
   else if(key==='KeyX')this.jetFlare();
   else if(key==='KeyV'){s.view=s.view?0:1;}
   else if(key==='KeyG'){s.gear=!s.gear;this.message(s.gear?'脚を出した。速度が落ちる。':'脚を格納した。');}
   else if(key==='Digit1'||key==='Digit2'||key==='Digit3'){
    const want=key==='Digit1'?'amraam':key==='Digit2'?'aim9':'gun';
    const have=want==='gun'?s.gun>0:s[want]>0;
    if(have){s.sel=want;this.message('兵装：'+MA.jetWeaponName(want));}
    else this.message(MA.jetWeaponName(want)+'は残っていない。');
   }
   return;
  }
  return baseKey.call(this,key);
 };

 /* ドラッグでカメラを振る（無人機） */
 const basePointer=MA.pointerAction;
 MA.pointerAction=function(kind){
  if(this.type==='drone'){
   const s=this.s,p=this.pointer;
   if(!p)return;
   if(kind==='down'){s.drag={x:p.x,y:p.y};return;}
   if(kind==='up'){s.drag=null;return;}
   if(kind==='move'&&s.drag&&p.down){
    const k=s.fov/26*.0026;
    s.saz+=(p.x-s.drag.x)*k;
    s.sel=clamp(s.sel-(p.y-s.drag.y)*k,.08,1.5);
    s.drag={x:p.x,y:p.y};
    s.track=null;
   }
   return;
  }
  if(mine(this.type))return;
  return basePointer.call(this,kind);
 };

 /* 任務ごとのタッチボタン */
 const baseTouch=MA.touchPad;
 MA.touchPad=function(){
  if(this.touchKeys){
   const el=$('#opTouch');el.hidden=false;el.innerHTML='';
   for(const [label,key] of this.touchKeys){
    const b=document.createElement('button');b.textContent=label;
    b.setAttribute('aria-label','操作 '+key);
    b.onpointerdown=e=>{if(this.phase!=='playing')return;e.preventDefault();
     b.setPointerCapture(e.pointerId);this.keys[key]=true;this.keyAction(key);};
    b.onpointerup=b.onpointercancel=()=>this.keys[key]=false;
    el.append(b);
   }
   return;
  }
  return baseTouch.call(this);
 };

 /* 評価 */
 const baseScore=MA.score;
 MA.score=function(){
  const s=this.s;
  if(this.type==='drone')return clamp(100-s.mistakes*18-s.rounds*9-(100-s.hp)*.5,0,100);
  if(this.type==='jet')return clamp(s.hp*.6+s.kills*9+(s.v.key==='train'?30:0)+(s.destroyedCruise||0)*5,0,100);
  if(this.type==='hangar')return 100;
  return baseScore.call(this);
 };

 /* 下段の状態表示 */
 const baseUI=MA.updateUI;
 MA.updateUI=function(){
  baseUI.call(this);
  const s=this.s;
  if(this.type==='drone'){
   $('#opStatus').textContent='高度 '+Math.round(s.pos.y)+' m　画角 '+s.fov.toFixed(1)+'°\n'
    +(s.v.attack?'破壊 '+s.destroyed+' / '+s.v.kills+'　誘導弾 '+s.hell:'マーク '+s.marked+' / '+s.v.marks)
    +'　残り '+Math.max(0,Math.ceil(s.limit))+'秒';
  }else if(this.type==='jet'){
   $('#opStatus').textContent=Math.round(s.spd*1.94384)+' kt　'+Math.round(s.pos.y*3.28084)+' ft\n'
    +'機体 '+Math.max(0,Math.ceil(s.hp))+'%　撃墜 '+s.kills+'　残り '+Math.max(0,Math.ceil(s.limit))+'秒';
  }else if(this.type==='hangar'){
   $('#opStatus').textContent=(s.name||'')+'\n三角形 '+s.tris+'枚　部品 '+s.parts+'個';
  }
 };

 /* 小窓（外観／コクピット）を描く */
 const baseRender=MA.render3D;
 MA.render3D=function(){
  if(!this.scene3D)return;
  baseRender.call(this);
  if(!this.pipCam||!mine(this.type))return;
  const r=this.canvas.getBoundingClientRect();
  if(!r.width||!r.height)return;
  const scale=Math.min(r.width/1000,r.height/600);
  const ox=r.left+(r.width-1000*scale)/2,oy=r.top+(r.height-600*scale)/2;
  const x=ox+724*scale,y=oy+58*scale,w=240*scale,h=150*scale;
  const vy=innerHeight-(y+h);
  this.pipCam.aspect=w/h;this.pipCam.updateProjectionMatrix();
  const exposure=renderer.toneMappingExposure;renderer.toneMappingExposure=.95;
  renderer.setRenderTarget(null);
  renderer.setViewport(x,vy,w,h);renderer.setScissor(x,vy,w,h);renderer.setScissorTest(true);
  try{renderer.render(this.scene3D,this.pipCam);}
  finally{renderer.setScissorTest(false);renderer.setViewport(0,0,innerWidth,innerHeight);
   renderer.toneMappingExposure=exposure;}
 };

 /* 片づけ */
 const baseDispose=MA.dispose;
 MA.dispose=function(){
  this.pipCam=null;this.touchKeys=null;this.droneMissiles=null;
  SkyFX.pool=null;SkyFX.clear();
  /* 画像（キャンバスから作った空の色など）も片づける。基本のdisposeは材質までしか見ない */
  if(this.scene3D)this.scene3D.traverse(o=>{
   const list=Array.isArray(o.material)?o.material:[o.material];
   for(const m of list){
    if(!m)continue;
    for(const key of ['map','normalMap','emissiveMap','alphaMap'])if(m[key]&&m[key].dispose)m[key].dispose();
   }
  });
  return baseDispose.call(this);
 };

 /* 任務を開くときは、ストーリー2の画面を必ず隠す（3Dの前に残らないように） */
 const baseOpen=MA.open;
 MA.open=function(type,practice,variant){
  const hub=$('#skyHub'),talk=$('#skyTalk');
  if(hub)hub.hidden=true;
  if(talk)talk.hidden=true;
  return baseOpen.call(this,type,practice,variant);
 };

 /* 任務を抜けたときの戻り先 */
 const baseExit=MA.exit;
 MA.exit=function(){
  if(this.sky){
   this.sky=null;this.dispose();
   if(typeof CinematicAudio!=='undefined')CinematicAudio.set(false);
   Game.state='menu';Game.show(null);document.body.classList.remove('specialSession');
   setMusicVol();SkyWar.open();
   return;
  }
  return baseExit.call(this);
 };
 const baseComplete=MA.complete;
 MA.complete=function(){
  if(this.sky){
   if(!this.result||!this.result.ok)return;      /* 失敗した任務では章を進めない */
   const run=this.sky,result=this.result;
   this.sky=null;this.dispose();
   if(typeof CinematicAudio!=='undefined')CinematicAudio.set(false);
   Game.state='menu';Game.show(null);document.body.classList.remove('specialSession');
   setMusicVol();
   if(run.free||run.ch===undefined)SkyWar.open();
   else SkyWar.complete(result||{score:0,seconds:0});
   return;
  }
  return baseComplete.call(this);
 };

 /* 起動時に画面を作る */
 const baseWire=wireMenus;
 wireMenus=function(){baseWire();SkyWar.install();};
})();

/* ---------------- 8. QualityX：ウルトラ画質 ～ ゴミスペモード ----------------
   画質は5段階になった。
     ゴミスペ … 影・後処理・粒子・板ポリ表示を全部切り、ポリゴンだけを塗りつぶす。
                 材質は光の計算をしない単色（MeshBasic）に差し替え、解像度も落とす。
     低 / 中 / 高 … これまでどおり。
     ウルトラ … 解像度を上乗せ（スーパーサンプリング）、影を4096でやわらかく、
                 テクスチャを異方性フィルタの最大値で引き、影を落とす物を増やす。
   既存のコードは SAVE.quality（low/mid/high）を見て動くので、そこは壊さない。
   5段階の選択は SAVE.qualityMode に持ち、legacy値へ写す。 */
const QualityX={
 tiers:[
  {id:'potato',label:'ゴミスペ',legacy:'low', note:'影と後処理を全部オフ。ポリゴンの塗りつぶしだけ'},
  {id:'low',   label:'低',      legacy:'low', note:'影なし・後処理なし'},
  {id:'mid',   label:'中',      legacy:'mid', note:'標準'},
  {id:'high',  label:'高',      legacy:'high',note:'影と後処理あり'},
  {id:'ultra', label:'ウルトラ',legacy:'high',note:'解像度を上乗せ・影4096・異方性フィルタ最大'}
 ],
 basics:new Map(),
 flattened:false,
 tier(){return this.tiers.find(t=>t.id===this.mode())||this.tiers[2];},
 mode(){
  const m=SAVE.qualityMode;
  if(this.tiers.some(t=>t.id===m))return m;
  return SAVE.quality==='low'?'low':SAVE.quality==='high'?'high':'mid';
 },
 is(id){return this.mode()===id;},
 normalize(){
  const t=this.tier();
  SAVE.qualityMode=t.id;
  if(SAVE.quality!==t.legacy)SAVE.quality=t.legacy;
 },
 set(id){
  if(!this.tiers.some(t=>t.id===id))return;
  const wasPotato=this.is('potato');
  SAVE.qualityMode=id;
  SAVE.quality=this.tier().legacy;
  writeSave();
  if(wasPotato&&id!=='potato')this.unflatten();
  applyQuality();
  this.syncUI();
  if(typeof toast==='function')toast('画質：'+this.tier().label+'（'+this.tier().note+'）');
 },

 /* ---- ポリゴンだけの材質に差し替える（元の材質はメッシュに預けておく） ---- */
 basic(src){
  if(Array.isArray(src))return src.map(m=>this.basic(m));
  /* 自前のシェーダ（空など）は差し替えない。差し替えるとuniformsを触るコードが壊れる */
  if(!src||src.isMeshBasicMaterial||src.isSpriteMaterial||src.isPointsMaterial)return src;
  if(src.isShaderMaterial||src.isRawShaderMaterial||src.uniforms)return src;
  if(this.basics.has(src))return this.basics.get(src);
  const m=new THREE.MeshBasicMaterial({
   /* 光の計算をしないぶん明るく出るので、少しだけ落とす */
   color:src.color?src.color.clone().multiplyScalar(.8):new THREE.Color(0xcccccc),
   transparent:src.transparent,opacity:src.opacity,side:src.side,
   depthWrite:src.depthWrite,depthTest:src.depthTest,blending:src.blending,
   alphaTest:src.alphaTest,vertexColors:src.vertexColors,wireframe:false,fog:false
  });
  if(src.morphTargets)m.morphTargets=true;
  if(src.skinning)m.skinning=true;
  m.name='Potato_'+(src.name||'mat');
  this.basics.set(src,m);
  return m;
 },
 flatten(root){
  if(!root)return;
  root.traverse(o=>{
   if(o.isPoints||o.isSprite||o.isLine||o.isLineSegments){
    if(o.userData.__potatoHid===undefined)o.userData.__potatoHid=o.visible;
    o.visible=false;return;
   }
   if(!o.isMesh&&!o.isInstancedMesh)return;
   if(!o.userData.__potatoMat)o.userData.__potatoMat=o.material;
   o.material=this.basic(o.userData.__potatoMat);
   if(o.castShadow)o.userData.__potatoCast=true;
   o.castShadow=false;o.receiveShadow=false;
  });
  this.flattened=true;
 },
 unflatten(){
  const roots=[typeof scene!=='undefined'?scene:null,
   typeof Preview!=='undefined'&&Preview.scene,typeof Podium!=='undefined'&&Podium.scene].filter(Boolean);
  for(const root of roots)root.traverse(o=>{
   if(o.userData.__potatoHid!==undefined){o.visible=o.userData.__potatoHid;delete o.userData.__potatoHid;}
   if(o.userData.__potatoMat){o.material=o.userData.__potatoMat;delete o.userData.__potatoMat;}
   if(o.userData.__potatoCast){o.castShadow=true;delete o.userData.__potatoCast;}
  });
  this.flattened=false;
  for(const m of this.basics.values())m.dispose();
  this.basics.clear();
 },

 apply(){
  if(typeof renderer==='undefined'||!renderer)return;
  this.normalize();
  const id=this.mode(),dpr=devicePixelRatio||1;
  if(id==='potato'){
   renderer.setPixelRatio(Math.min(dpr,.62));
   renderer.shadowMap.enabled=false;
   if(typeof sun!=='undefined'&&sun){sun.castShadow=false;}
   if(typeof PostFX!=='undefined'){PostFX.on=false;PostFX.resize&&PostFX.resize();}
   if(typeof scene!=='undefined'&&scene){
    scene.fog=null;scene.environment=null;
    this.flatten(scene);
   }
   if(typeof Preview!=='undefined'&&Preview.scene)this.flatten(Preview.scene);
   if(typeof Podium!=='undefined'&&Podium.scene)this.flatten(Podium.scene);
  }else if(id==='ultra'){
   renderer.setPixelRatio(Math.min(Math.max(dpr,1)*1.4,2.6));
   renderer.shadowMap.enabled=true;
   if(THREE.PCFSoftShadowMap!==undefined)renderer.shadowMap.type=THREE.PCFSoftShadowMap;
   if(typeof sun!=='undefined'&&sun){
    sun.castShadow=true;
    if(sun.shadow.mapSize.x!==4096){
     if(sun.shadow.map){sun.shadow.map.dispose();sun.shadow.map=null;}
     sun.shadow.mapSize.set(4096,4096);
    }
    sun.shadow.bias=-.00035;
   }
   if(typeof PostFX!=='undefined'){PostFX.on=true;PostFX.resize&&PostFX.resize();}
   const aniso=renderer.capabilities.getMaxAnisotropy?renderer.capabilities.getMaxAnisotropy():1;
   if(typeof scene!=='undefined'&&scene)scene.traverse(o=>{
    if(!o.isMesh&&!o.isInstancedMesh)return;
    o.castShadow=o.userData.kind!=='ground'&&o.userData.kind!=='fx';
    o.receiveShadow=true;
    const list=Array.isArray(o.material)?o.material:[o.material];
    for(const m of list){
     if(!m)continue;
     for(const key of ['map','normalMap','roughnessMap','metalnessMap','aoMap','emissiveMap'])
      if(m[key]&&m[key].anisotropy!==aniso){m[key].anisotropy=aniso;m[key].needsUpdate=true;}
    }
   });
  }
  if(typeof Afterlight!=='undefined')Afterlight.pixelScale=renderer.getPixelRatio();
 },

 /* 設定画面の5段ボタン */
 syncUI(){
  const seg=$('#segQ');if(!seg)return;
  const cur=this.mode();
  seg.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.qm===cur));
  const note=$('#segQNote');
  if(note)note.textContent=this.tier().label+'：'+this.tier().note;
 },
 installUI(){
  const seg=$('#segQ');if(!seg)return;
  seg.innerHTML=this.tiers.map(t=>'<button data-qm="'+t.id+'">'+t.label+'</button>').join('');
  seg.querySelectorAll('button').forEach(b=>{
   b.onclick=()=>{this.set(b.dataset.qm);if(typeof Audio1!=='undefined')Audio1.ui('eq');};
  });
  const row=seg.closest('.srow');
  if(row&&!$('#segQNote')){
   const note=document.createElement('div');
   note.id='segQNote';note.className='srow';
   note.style.cssText='font-size:11.5px;color:var(--mute);display:block;margin-top:-6px';
   row.after(note);
  }
  this.syncUI();
 }
};

/* 既存のapplyQualityの後ろに、5段階ぶんの上書きを足す */
(function(){
 const basePotatoQuality=applyQuality;
 applyQuality=function(){
  QualityX.normalize();
  basePotatoQuality();
  QualityX.apply();
 };
 /* 新しい地形を作るたび、ゴミスペ／ウルトラの設定を敷き直す */
 if(typeof buildWorld==='function'){
  const baseBuild=buildWorld;
  buildWorld=function(){const r=baseBuild.apply(this,arguments);QualityX.apply();return r;};
 }
 /* 試合中に出てきた物にも適用する（2秒ごとの軽い見回り）と、FPS表示の段階名 */
 let sweep=0;
 const baseTickQ=Afterlight.tick;
 Afterlight.tick=function(dt){
  baseTickQ.call(this,dt);
  const el=$('#perf');
  if(el&&SAVE.showPerf&&renderer)
   el.textContent=this.fps+' FPS · '+QualityX.tier().label+' · '+Math.round(renderer.getPixelRatio()*100)+'%';
  if(!QualityX.is('potato'))return;
  sweep-=dt||0;
  if(sweep>0)return;
  sweep=2;
  if(typeof scene!=='undefined'&&scene)QualityX.flatten(scene);
 };
 const baseBindSettings=bindSettings;
 bindSettings=function(){baseBindSettings();QualityX.installUI();};
})();

/* ---------------- 9. フレーム生成：この版では未実装（設計メモだけ） ---------------- */
const FrameGenPlan={
 implemented:false,
 title:'フレーム生成（将来の追加予定・未実装）',
 summary:'描画したフレームの間に、作ったフレームを1枚はさんで表示だけ倍にする仕組み。'
  +'v28.34βでは入れていない。下は、この単一HTMLに入れるならこうする、という設計メモ。',
 items:[
  ['方式A：再投影（おすすめ・第1段階）',
   'いま描いたフレームの色と深度を残しておき、次に「表示だけのフレーム」を作るときは、'
   +'予測したカメラ行列でピクセルを深度に沿って押し出す（空間ワープ）。'
   +'カメラの動きが支配的なFPSでは、これだけで見た目の滑らかさがほぼ得られる。'
   +'物の動きは追えないので、動く物は次の段階で足す。'],
  ['方式B：速度ベクトルで押し出す（第2段階）',
   '各ピクセルの「前のフレームからどれだけ動いたか」を別の描画先に書き出し、'
   +'半分だけ進めた位置へ色を運ぶ。兵士・車両・自分の銃のような動く物も追える。'
   +'穴（前のフレームに写っていなかった場所）は、まわりの色を広げて埋める。'],
  ['方式C：2枚の実フレームの間を補間（採用しない）',
   '次のフレームを待ってから中間を作るので、必ず1フレーム分の遅れが出る。'
   +'狙って撃つゲームでは操作感を壊すため、ムービーとリプレイ以外では使わない。'],
  ['遅延の扱い',
   '方式A・Bは「予測」なので入力遅延は増えない。そのかわり予測が外れると輪郭がにじむ。'
   +'ワープ量に上限を設け、超えたら生成をやめて実フレームを2回出す（急な振り向きのとき）。'],
  ['HUDと十字は必ず実フレーム',
   '生成フレームにHUDを引き伸ばすと、数字や十字がぶれて読めなくなる。'
   +'HUDと照準は生成後に毎回そのまま描き直す（この作品はHUDがCSS/Canvasなので分離しやすい）。'],
  ['この作品での実装場所',
   'PostFXがすでに描画先（レンダーターゲット）と全画面パスの仕組みを持っているので、'
   +'そこへ (1) 色と深度の履歴2枚 (2) 速度ベクトル用の描画先 (3) ワープと穴埋めのシェーダ を足す。'
   +'速度ベクトルは、動く物だけを対象にした2回目の描画で作り、地形などはカメラ再投影で済ませる。'],
  ['有効にする条件',
   '画面の書き換えが120Hz以上で、かつ描画が重い（GPUが詰まっている）ときだけ意味がある。'
   +'Afterlight.fpsの測定値と表示間隔の安定度を見て、自動で入り切りする。'
   +'スマホでは既定オフ。ゴミスペモードでは無効（そもそも軽い）。ウルトラ画質と組み合わせると効果が大きい。'],
  ['確認のしかた',
   '生成フレームだけ薄い赤に着色するデバッグ表示と、'
   +'「実描画fps／表示fps／捨てた生成フレーム数」の3つを画面に出して、破綻を見つける。'],
  ['危ないところ',
   'iOSでの浮動小数点の描画先の対応、遠距離（F-15任務の120km）での深度の精度、'
   +'加算合成の粒子や曳光弾はワープに向かないので対象外にして描き直す、の3点。']
 ],
 text(){
  return this.title+'\n\n'+this.summary+'\n\n'+this.items.map(([h,b],i)=>(i+1)+'. '+h+'\n   '+b).join('\n\n');
 },
 html(){
  return '<p>'+escapeHTML(this.summary)+'</p><ol style="line-height:1.85;font-size:13px">'
   +this.items.map(([h,b])=>'<li><b>'+escapeHTML(h)+'</b><br>'+escapeHTML(b)+'</li>').join('')+'</ol>';
 },
 show(){
  let box=$('#frameGenPlan');
  if(!box){
   box=document.createElement('section');box.id='frameGenPlan';
   box.style.cssText='position:fixed;inset:0;z-index:420;overflow:auto;padding:6vh 7vw;color:#e8f0ea;'
    +'background:radial-gradient(circle at 30% 10%,#13303acc,#05090cf7 70%);backdrop-filter:blur(5px);font-family:system-ui,sans-serif';
   box.innerHTML='<div style="max-width:880px;margin:0 auto">'
    +'<div style="letter-spacing:.3em;font:11px monospace;color:#9fd6d0">v28.34β / FRAME GENERATION — NOT IMPLEMENTED</div>'
    +'<h2 style="font-size:26px;margin:8px 0 14px">'+escapeHTML(this.title)+'</h2>'
    +'<div id="frameGenBody"></div>'
    +'<div style="display:flex;gap:9px;margin-top:18px"><button id="frameGenCopy" class="mbtn" style="padding:9px 18px">計画をテキストで保存</button>'
    +'<button id="frameGenClose" class="mbtn" style="padding:9px 18px">閉じる</button></div></div>';
   document.body.append(box);
   $('#frameGenBody').innerHTML=this.html();
   $('#frameGenClose').onclick=()=>{box.hidden=true;};
   $('#frameGenCopy').onclick=()=>{
    const blob=new Blob([this.text()],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),
     a=document.createElement('a');
    a.href=url;a.download='BLACKSAND-framegen-plan-v28.34b.txt';a.click();
    setTimeout(()=>URL.revokeObjectURL(url),3000);
   };
  }
  box.hidden=false;
 }
};

/* ---------------- 10. 版の表示と、設定画面への追加 ---------------- */
(function(){
 const VER='v28.34β';
 document.title='BLACKSAND : AFTERLIGHT — FORGED '+VER;
 document.documentElement.dataset.build='28.34b';
 if(typeof Afterlight!=='undefined')Afterlight.version='28.34b';

 const baseWireVer=wireMenus;
 wireMenus=function(){
  baseWireVer();
  /* 版の表示 */
  const ed=$('#title .edition');if(ed)ed.textContent='FORGED IN BLENDER / '+VER;
  const cap=$('#sceneCaption small');if(cap)cap.textContent='OPERATION BLACKSAND / AFTERLIGHT '+VER;

  /* 設定：機体モデルとフレーム生成の行を足す */
  const panel=$('#setting');
  if(panel&&!$('#skySettings')){
   const box=document.createElement('div');
   box.id='skySettings';box.className='editionSettings';
   box.innerHTML='<div class="srow"><span>機体モデル（Blender）<br>'
    +'<small style="color:var(--mute);font-size:11px">F-15・無人機・輸送機などをBlenderで開ける形で保存</small></span>'
    +'<span class="seg"><button id="skyDlBlender">Pythonを保存</button></span></div>'
    +'<div class="srow"><span>フレーム生成<br>'
    +'<small style="color:var(--mute);font-size:11px">この版では未実装。追加するときの設計だけ見られる</small></span>'
    +'<span class="seg"><button id="skyFrameGen">計画を見る</button></span></div>';
   panel.insertBefore(box,$('#setting>.menu'));
   UI.bind($('#skyDlBlender'),()=>{AeroForge.download();toast('BLACKSAND-AEROFORGE-v28.34b.py を保存した');});
   UI.bind($('#skyFrameGen'),()=>FrameGenPlan.show());
  }

  /* 操作方法・ガイドに、今回の更新内容を足す */
  const relase=document.querySelector('.forge-release');
  if(relase&&!$('#skyRelease')){
   const sec=document.createElement('section');
   sec.id='skyRelease';sec.className='forge-release';
   sec.setAttribute('aria-label','v28.34β 更新内容');
   sec.innerHTML='<h2>UPDATE / '+VER+'</h2>'
    +'<ul style="line-height:1.9;font-size:13px">'
    +'<li><b>新しいストーリー「空を取り戻せ」（全8章・完全新規）</b>：無人機（MQ-9型）の遠隔操作から始まり、'
    +'F-15のパイロットとして空を取り戻す現代戦の話。登場人物もセーブも既存のストーリーとは別。</li>'
    +'<li><b>無人機の操作</b>：センサー（カメラ）の映像で地上を捜索し、識別・マーク・レーザー照射・誘導弾。'
    +'民間を撃たない判断（交戦規定）が評価に入る。</li>'
    +'<li><b>F-15の操縦</b>：訓練飛行・BVR迎撃・格闘戦・輸送機の護衛・巡航ミサイル迎撃と最終決戦。'
    +'レーダー、AIM-120、AIM-9、機関砲、フレアとチャフ、失速警報。</li>'
    +'<li><b>AeroForge（Blender手順そのままの機体モデル）</b>：円を並べてブリッジ、平面を押し出し、断面を軸回転。'
    +'同じ設計表からBlender用のPythonを書き出せる（設定 → 機体モデル）。格納庫で回して見られる。</li>'
    +'<li><b>画質が5段階</b>：ゴミスペ／低／中／高／ウルトラ。ゴミスペは影と後処理を全部切り、'
    +'光の計算をしない単色でポリゴンだけを塗る。ウルトラは解像度の上乗せと4096の影。</li>'
    +'<li><b>フレーム生成</b>：未実装。設計メモだけ入れた（設定 → フレーム生成 → 計画を見る）。</li>'
    +'</ul>';
   relase.parentNode.insertBefore(sec,relase);
  }
 };
})();
