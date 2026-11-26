// Direct WebRTC multiplayer. Signalling is exchanged by copy/paste; no account or server.
(() => {
  const style=document.createElement('style');
  style.textContent='#peerPanel{top:64px;left:18px;width:min(390px,calc(100vw - 36px));padding:16px;max-height:calc(100dvh - 90px);overflow:auto}#peerPanel textarea{display:block;width:100%;height:100px;resize:vertical;background:#183540;color:#fff;border:1px solid #7697a4;border-radius:8px;padding:9px;margin:9px 0;font:12px ui-monospace,monospace}#peerPanel .peerActions{display:flex;flex-wrap:wrap;gap:7px}#peerPanel p{font-size:13px;line-height:1.45;color:#ccdfe3}#peerStatus{color:#fbd19c!important}';
  document.head.append(style);
  const button=document.createElement('button');button.textContent='👥 Multiplayer';button.id='peerButton';
  document.querySelector('.toptools')?.append(button);
  const panel=document.createElement('section');panel.id='peerPanel';panel.className='panel';panel.hidden=true;
  panel.innerHTML='<div class="panelHead"><h2>Peer-to-peer multiplayer</h2><button id="peerClose">×</button></div><p>Connect to one friend using WebRTC. Share connection codes privately. Both players should choose the same map region to see each other.</p><div class="peerActions"><button id="peerHost">1. Host game</button><button id="peerJoin">1. Join game</button></div><label for="peerCode">Your code (send to your friend)</label><textarea id="peerCode" readonly placeholder="Your connection code will appear here"></textarea><div class="peerActions"><button id="peerCopy">Copy my code</button></div><label for="peerIncoming">Friend’s code</label><textarea id="peerIncoming" placeholder="Paste the code your friend sent"></textarea><div class="peerActions"><button id="peerAccept">2. Use friend’s code</button><button id="peerDisconnect">Disconnect</button></div><p id="peerStatus" role="status">Not connected</p>';
  document.body.append(panel);
  const $=id=>document.getElementById(id);
  $('peerClose').onclick=()=>panel.hidden=true;
  button.onclick=()=>{panel.hidden=!panel.hidden;keys.clear()};
  for(const id of ['peerCode','peerIncoming'])$(id).addEventListener('keydown',event=>event.stopPropagation());
  let connection=null,channel=null,hosting=false,lastSend=0;
  const peer={state:null,lastSeen:0};
  const status=message=>$('peerStatus').textContent=message;
  const config={iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun.cloudflare.com:3478'}]};
  function close(){if(channel)channel.close();if(connection)connection.close();channel=null;connection=null;peer.state=null;status('Disconnected')}
  function watchData(data){channel=data;channel.onopen=()=>status('Connected! You can now fly or drive together.');channel.onclose=()=>status('Peer disconnected');channel.onmessage=event=>{
    try{const state=JSON.parse(event.data);if(state&&state.version===1&&Number.isFinite(state.x)&&Number.isFinite(state.y)&&Number.isFinite(state.z)&&Number.isFinite(state.heading)&&state.region>=0&&state.region<=4){peer.state=state;peer.lastSeen=performance.now()}}catch{}
  }}
  function makeConnection(){close();connection=new RTCPeerConnection(config);connection.onconnectionstatechange=()=>status('Connection: '+connection.connectionState);
    connection.ondatachannel=event=>watchData(event.channel);connection.oniceconnectionstatechange=()=>{if(connection?.iceConnectionState==='failed')status('Connection failed. Your network may block direct connections.')};
    return connection;
  }
  const pack=obj=>btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
  const unpack=str=>JSON.parse(decodeURIComponent(escape(atob(str.trim()))));
  const waitIce=pc=>new Promise(resolve=>{if(pc.iceGatheringState==='complete')return resolve();const timer=setTimeout(resolve,10000);pc.addEventListener('icegatheringstatechange',()=>{if(pc.iceGatheringState==='complete'){clearTimeout(timer);resolve()}})});
  $('peerHost').onclick=async()=>{if(!window.RTCPeerConnection)return status('This browser does not support WebRTC.');try{hosting=true;const pc=makeConnection();watchData(pc.createDataChannel('isleflight',{ordered:false,maxRetransmits:0}));status('Creating host invitation…');await pc.setLocalDescription(await pc.createOffer());await waitIce(pc);$('peerCode').value=pack(pc.localDescription);status('Copy your invitation to your friend. Ask them to click Join game and paste it.')}catch(e){status('Could not host: '+e.message)}};
  $('peerJoin').onclick=()=>{hosting=false;makeConnection();$('peerCode').value='';status('Paste the host’s code below, then click Use friend’s code.')};
  $('peerAccept').onclick=async()=>{try{const pc=connection;if(!pc)throw Error('Choose Host or Join first');const desc=unpack($('peerIncoming').value);if(desc.type!==(hosting?'answer':'offer'))throw Error('Wrong code type for this step');await pc.setRemoteDescription(desc);if(!hosting){await pc.setLocalDescription(await pc.createAnswer());status('Creating your reply…');await waitIce(pc);$('peerCode').value=pack(pc.localDescription);status('Send your reply code to the host. You will connect when they paste it.')}else status('Friend’s answer accepted. Connecting…')}catch(e){status('Code error: '+e.message)}};
  $('peerCopy').onclick=async()=>{try{await navigator.clipboard.writeText($('peerCode').value);status('Code copied. Send it to your friend privately.')}catch{ $('peerCode').select();document.execCommand('copy');status('Code selected for copying.')}};
  $('peerDisconnect').onclick=close;
  window.syncPeers=now=>{if(!channel||channel.readyState!=='open'||now-lastSend<100)return;lastSend=now;
    const obj=driving?driver:onFoot?{x:walker.x,y:terrainHeight(walker.x,walker.z,activeMap)+1.7,z:walker.z,heading:walker.yaw}:plane;
    channel.send(JSON.stringify({version:1,x:obj.x,y:obj.y,z:obj.z,heading:obj.heading||0,region:activeMap,mode:driving?'car':onFoot?'walk':'plane',model:driving?driver.model:fleet.value}));
  };
  const defaultCar=carModel('#31b3cf');
  window.drawPeerVehicles=(draw,camera,cx,cz)=>{
    const s=peer.state;if(!s||performance.now()-peer.lastSeen>5000||s.region!==activeMap||Math.hypot(s.x-cx,s.z-cz)>4500)return;
    const mesh=s.mode==='car'?(licensedCars.get(s.model)||defaultCar):s.mode==='walk'?defaultCar:npcModels[0];
    const co=Math.cos(s.heading),si=Math.sin(s.heading),alt=s.mode==='car'?.52:s.mode==='walk'?-1.5:0;
    draw(mesh,([x,y,z])=>[s.x+x*co+z*si,s.y+y+alt,s.z+z*co-x*si]);
  };
})();
