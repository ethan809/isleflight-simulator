// Driver-focused instruments and recover controls, isolated from the flight UI.
(() => {
 const css=document.createElement('style');
 css.textContent=`#driverDashboard{position:fixed;bottom:84px;left:50%;transform:translateX(-50%);z-index:4;display:flex;align-items:center;gap:15px;background:linear-gradient(140deg,#0c2029ee,#18333de5);border:1px solid #93b6bb88;border-radius:17px;padding:11px 18px;box-shadow:0 13px 38px #05141bbd;color:white;font:600 12px system-ui;pointer-events:none}#driverDashboard[hidden]{display:none!important}.driverSpeed{font:750 42px/1 system-ui;font-variant-numeric:tabular-nums;letter-spacing:-2px}.driverSpeed small{font:700 10px system-ui;color:#b5d4d8;margin-left:4px;letter-spacing:0}.driverGear{background:#f5d8a0;color:#233744;border-radius:9px;min-width:43px;text-align:center;padding:11px 5px;font:800 22px system-ui}.driverInfo{display:flex;flex-direction:column;gap:5px;min-width:145px}.driverInfo strong{font-size:13px}.driverMeter{height:7px;border-radius:10px;background:#385862;overflow:hidden}.driverMeter span{display:block;height:100%;width:0;background:linear-gradient(90deg,#5cdbbe,#f3c16e,#f17575)}.driverWarn{font-size:11px;color:#f2c889}#recoverCar{pointer-events:auto;position:fixed;right:22px;bottom:162px;z-index:5;background:#153744de;color:white;border:1px solid #87b4ba88;border-radius:9px;padding:9px 12px;font:700 12px system-ui;cursor:pointer}#recoverCar[hidden]{display:none!important}@media(max-width:700px){#driverDashboard{bottom:120px;padding:8px 10px;gap:8px}.driverSpeed{font-size:31px}.driverInfo{min-width:100px}#recoverCar{bottom:205px}}`;
 document.head.append(css);
 const el=document.createElement('div');el.id='driverDashboard';el.hidden=true;
 el.innerHTML='<div class="driverGear" id="driverGear">N</div><div><div class="driverSpeed"><span id="driverSpeed">0</span><small>MPH</small></div><div id="driverSurface" class="driverWarn">ROAD</div></div><div class="driverInfo"><strong id="driverModel">CAR</strong><div class="driverMeter"><span id="driverRPM"></span></div><span id="driverDamage">RPM 800 · DAMAGE 0%</span></div>';
 document.body.append(el);
 const recover=document.createElement('button');recover.id='recoverCar';recover.textContent='R · Recover car';recover.hidden=true;document.body.append(recover);
 function recoverCar(){if(!driving)return;const nearest=nearestDriveRoad(driver.x,driver.z,activeMap);if(!nearest)return;Object.assign(driver,nearest,{speed:0,vx:0,vz:0,yawRate:0,damage:0,roll:0,pitch:0});driver.y=terrainHeight(driver.x,driver.z,activeMap)+.52;driver.cameraYaw=0;driver.cameraPitch=-.25}
 recover.onclick=recoverCar;
 document.addEventListener('keydown',event=>{if(event.key.toLowerCase()==='r'&&driving&&document.activeElement?.tagName!=='TEXTAREA'&&document.activeElement?.tagName!=='INPUT'){recoverCar();event.preventDefault()}},true);
 const $=id=>document.getElementById(id);let last=0;
 function update(now){requestAnimationFrame(update);if(now-last<90)return;last=now;
  el.hidden=!driving;recover.hidden=!driving;
  if(!driving)return;
  const speed=Math.round(Math.abs(driver.speed)*2.23694);$('driverSpeed').textContent=speed;
  $('driverGear').textContent=driver.gear||'N';$('driverModel').textContent=licensedCarNames[driver.model]?.name||'CAR';
  $('driverRPM').style.width=Math.min(100,(driver.rpm||850)/70)+'%';
  $('driverDamage').textContent='RPM '+Math.round(driver.rpm||850)+' · DAMAGE '+Math.round(driver.damage)+'%';
  $('driverSurface').textContent=driver.offRoad?'OFF ROAD · LOW GRIP':Math.abs(driver.yawRate||0)>.65&&speed>40?'HARD CORNERING':'ROAD · NORMAL GRIP';
 }
 requestAnimationFrame(update);
})();
