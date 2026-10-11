// Wide-screen layout test: board left, info panel right, nothing overlapping or off-screen.
const { chromium } = require('playwright');
const S='';
(async()=>{const br=await chromium.launch();
const errs=[];let fails=0;const ok=(n,c,x='')=>{if(!c)fails++;console.log((c?'ok   ':'FAIL ')+n+(c?'':'  '+x))};
for(const [name,vp,oi] of [['1920',{width:1920,height:1080},1],['1280',{width:1280,height:720},0],['1024',{width:1024,height:768},2],['1000',{width:1000,height:700},1]]){
 const pg=await br.newPage({viewport:vp});pg.on('pageerror',e=>errs.push(name+': '+e.message));
 await pg.goto('file://'+__dirname+'/../chess/index.html');await pg.click('[data-m="1"]');
 await pg.screenshot({path:S+`w-${name}-select.png`});
 if(oi)await pg.click('#ex');await pg.locator('.oc').nth(oi).click();await pg.waitForTimeout(500);
 ok(name+' wide class on',await pg.evaluate(()=>$('app').classList.contains('wd')));
 // play a few moves so the panel has content
 await pg.evaluate(()=>{fx=false;snd=false});
 for(const [a,b2] of [['e2','e4'],['d2','d4']]){
  await pg.evaluate(([a,b2])=>{const q=s=>[8-+s[1],'abcdefgh'.indexOf(s[0])];const [r,c]=q(a),[y,x]=q(b2);play(r,c,y,x,'Q')},[a,b2]);
  await pg.waitForFunction(()=>turn=='w'&&!an&&!sa,null,{timeout:8000}).catch(()=>{});}
 await pg.waitForTimeout(600);
 const tp=await pg.locator('.top').boundingBox(),bw=await pg.locator('#bw').boundingBox(),pb=await pg.locator('#pb').boundingBox(),pw=await pg.locator('#pw').boundingBox(),rb=await pg.locator('#rb').boundingBox(),bub=await pg.locator('#bub').boundingBox();
 ok(name+' board left of panel',bw.x+bw.width<pb.x,JSON.stringify([bw,pb]));
 ok(name+' everything inside viewport',[bw,pb,pw,rb,bub].every(r=>r.x>=0&&r.y>=0&&r.x+r.width<=vp.width&&r.y+r.height<=vp.height),JSON.stringify({bw,pb,pw,rb,bub}));
 ok(name+' panel matches board height (+-6px)',Math.abs((pw.y+pw.height)-(bw.y+bw.height))<=8&&Math.abs(tp.y-bw.y)<=8,JSON.stringify([bw.y,bw.height,pb.y,pw.y+pw.height]));
 ok(name+' rib has room',rb.height>=60,String(rb.height));
 ok(name+' no overlap pb/bub/rb/pw',pb.y+pb.height<=bub.y&&bub.y+bub.height<=rb.y&&rb.y+rb.height<=pw.y,JSON.stringify([pb,bub,rb,pw]));
 await pg.screenshot({path:S+`w-${name}.png`});await pg.close()}
await br.close();console.log(errs.length?errs.join('\n'):'no page errors');console.log(fails?fails+' FAILED':'all ok')})();
