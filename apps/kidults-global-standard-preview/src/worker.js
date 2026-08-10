const THREE_JS = `
<script type="module" id="kidults-webgl-3d">
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.js';

function initKidultsHero3D(){
  const host=document.getElementById('kidults-hero-3d');
  if(!host) return;

  let renderer;
  try{
    renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
  }catch(err){
    host.dataset.webgl='failed';
    console.error('KIDULTS WebGL init failed',err);
    return;
  }

  host.dataset.webgl='active';
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(27,1,.1,100);
  camera.position.set(-7.7,3.15,8.6);
  camera.lookAt(.35,.30,0);

  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  renderer.setClearColor(0x000000,0);
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.16;
  renderer.domElement.setAttribute('aria-label','Kidults Mobility Sculpture 01 interactive WebGL 3D object');
  host.replaceChildren(renderer.domElement);

  const car=new THREE.Group();
  car.rotation.y=.08;
  car.rotation.z=-.012;
  car.position.set(.18,-.12,0);
  scene.add(car);

  const ivory=new THREE.MeshPhysicalMaterial({
    color:0xf5f0e7,metalness:.04,roughness:.19,clearcoat:1,clearcoatRoughness:.09,
    sheen:1,sheenColor:new THREE.Color(0xffffff),sheenRoughness:.3
  });
  const pearl=new THREE.MeshPhysicalMaterial({
    color:0xfffcf7,metalness:.02,roughness:.13,clearcoat:1,clearcoatRoughness:.07
  });
  const glass=new THREE.MeshPhysicalMaterial({
    color:0x050908,metalness:.32,roughness:.055,clearcoat:1,clearcoatRoughness:.035,
    transmission:.04,thickness:.3
  });
  const black=new THREE.MeshStandardMaterial({color:0x090d0c,metalness:.2,roughness:.3});
  const tireMat=new THREE.MeshStandardMaterial({color:0x141615,metalness:.02,roughness:.68});
  const rimMat=new THREE.MeshPhysicalMaterial({color:0xf7f3eb,metalness:.24,roughness:.19,clearcoat:1});
  const metalMat=new THREE.MeshStandardMaterial({color:0xbeb8ae,metalness:.65,roughness:.24});

  function ellipsoid(radius, sx, sy, sz, material, px, py, pz){
    const m=new THREE.Mesh(new THREE.SphereGeometry(radius,96,56),material);
    m.scale.set(sx,sy,sz);m.position.set(px,py,pz);m.castShadow=true;m.receiveShadow=true;return m;
  }

  // Long low body, with a lower nose and stronger rear haunch to match the approved sculpture.
  const main=ellipsoid(1,3.28,.67,1.08,ivory,.28,.46,0); car.add(main);
  const nose=ellipsoid(1,1.92,.41,1.02,pearl,-2.34,.31,.02); nose.rotation.z=.035; car.add(nose);
  const rear=ellipsoid(1,1.42,.66,1.07,ivory,2.38,.56,-.01); rear.rotation.z=-.03; car.add(rear);

  // Flatten the lower half visually with sculpted rocker and black aerodynamic voids.
  const rocker=new THREE.Mesh(new THREE.BoxGeometry(5.35,.15,1.68),black);
  rocker.position.set(.18,-.16,0); rocker.castShadow=true; car.add(rocker);

  const frontIntake=new THREE.Mesh(new THREE.BoxGeometry(1.86,.22,1.54),black);
  frontIntake.position.set(-2.18,.02,.02);frontIntake.rotation.z=-.035;car.add(frontIntake);
  const sideVoid=new THREE.Mesh(new THREE.BoxGeometry(1.45,.28,.22),black);
  sideVoid.position.set(1.42,.06,.95);sideVoid.rotation.z=-.15;car.add(sideVoid);

  // Panoramic glossy canopy.
  const canopy=ellipsoid(1,1.72,.50,.82,glass,.42,1.01,-.02);
  canopy.rotation.z=-.025;car.add(canopy);
  const glassClip=new THREE.Mesh(new THREE.BoxGeometry(4.2,.55,2.4),ivory);
  glassClip.position.set(.37,.57,0);car.add(glassClip);

  // Wheel arches: soft ivory collars over large thin wheels.
  function addWheel(x, scale=1){
    const wheel=new THREE.Group();
    const tire=new THREE.Mesh(new THREE.TorusGeometry(.58*scale,.095*scale,32,128),tireMat);
    tire.rotation.y=Math.PI/2; tire.castShadow=true; wheel.add(tire);
    const disc=new THREE.Mesh(new THREE.CylinderGeometry(.475*scale,.475*scale,.105*scale,128),rimMat);
    disc.rotation.z=Math.PI/2;disc.castShadow=true;wheel.add(disc);
    const hub=new THREE.Mesh(new THREE.CylinderGeometry(.055*scale,.055*scale,.13*scale,48),metalMat);
    hub.rotation.z=Math.PI/2;wheel.add(hub);
    for(let i=0;i<36;i++){
      const a=i*Math.PI*2/36;
      const spoke=new THREE.Mesh(new THREE.BoxGeometry(.009,.34*scale,.010),metalMat);
      spoke.position.set(.06,Math.cos(a)*.17*scale,Math.sin(a)*.17*scale);
      spoke.rotation.x=a;
      wheel.add(spoke);
    }
    const collar=new THREE.Mesh(new THREE.TorusGeometry(.66*scale,.07*scale,24,128),ivory);
    collar.rotation.y=Math.PI/2; collar.position.x=-.01; wheel.add(collar);
    wheel.position.set(x,-.025,.94);
    car.add(wheel);

    const far=wheel.clone();
    far.position.z=-.94;
    car.add(far);
  }
  addWheel(-1.74,.98);
  addWheel(2.02,1.03);

  // Fine shoulder highlight and lower bright trim.
  const shoulderCurve=new THREE.CatmullRomCurve3([
    new THREE.Vector3(-2.72,.53,1.00),new THREE.Vector3(-1.15,.49,1.09),
    new THREE.Vector3(.55,.50,1.08),new THREE.Vector3(2.66,.57,.91)
  ]);
  car.add(new THREE.Mesh(new THREE.TubeGeometry(shoulderCurve,96,.015,10,false),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.93})));

  const lowerCurve=new THREE.CatmullRomCurve3([
    new THREE.Vector3(-2.63,.08,1.00),new THREE.Vector3(-.8,.05,1.03),new THREE.Vector3(2.48,.11,.86)
  ]);
  car.add(new THREE.Mesh(new THREE.TubeGeometry(lowerCurve,80,.012,8,false),new THREE.MeshBasicMaterial({color:0xe7e2d8,transparent:true,opacity:.82})));

  // Ground contact shadow and studio floor.
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(30,18),new THREE.ShadowMaterial({color:0x6f675b,opacity:.17}));
  floor.rotation.x=-Math.PI/2;floor.position.y=-.69;floor.receiveShadow=true;scene.add(floor);
  const shadowDisc=new THREE.Mesh(new THREE.CircleGeometry(3.55,96),new THREE.MeshBasicMaterial({color:0x70695f,transparent:true,opacity:.075,depthWrite:false}));
  shadowDisc.rotation.x=-Math.PI/2;shadowDisc.scale.set(1.65,.43,1);shadowDisc.position.set(.35,-.675,.02);scene.add(shadowDisc);

  // Softbox-style light rig.
  scene.add(new THREE.HemisphereLight(0xffffff,0xd8d2c7,2.15));
  const key=new THREE.DirectionalLight(0xffffff,4.8);key.position.set(-5.5,7.5,7.0);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-8;key.shadow.camera.right=8;key.shadow.camera.top=6;key.shadow.camera.bottom=-4;scene.add(key);
  const fill=new THREE.DirectionalLight(0xf5f0e8,2.7);fill.position.set(6,4.5,2.5);scene.add(fill);
  const back=new THREE.DirectionalLight(0xffffff,2.4);back.position.set(4,6,-7);scene.add(back);
  const low=new THREE.PointLight(0xffffff,1.2,18);low.position.set(-2,1.1,5);scene.add(low);

  let targetYaw=0,targetPitch=0,yaw=0,pitch=0;
  host.addEventListener('pointermove',e=>{
    const r=host.getBoundingClientRect();
    targetYaw=((e.clientX-r.left)/r.width-.5)*.10;
    targetPitch=((e.clientY-r.top)/r.height-.5)*.035;
  },{passive:true});
  host.addEventListener('pointerleave',()=>{targetYaw=0;targetPitch=0},{passive:true});

  function resize(){
    const w=Math.max(host.clientWidth,1),h=Math.max(host.clientHeight,1);
    renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host);resize();

  const clock=new THREE.Clock();
  function animate(){
    const t=clock.getElapsedTime();
    yaw+=(targetYaw-yaw)*.04;pitch+=(targetPitch-pitch)*.04;
    car.rotation.y=.08+yaw;
    car.rotation.x=-.008-pitch;
    car.position.y=-.12+Math.sin(t*.52)*.006;
    renderer.render(scene,camera);
    requestAnimationFrame(animate);
  }
  animate();
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',initKidultsHero3D,{once:true});
else initKidultsHero3D();
</script>`;

const THREE_STYLE = `
<style id="kidults-webgl-style">
#kidults-hero-3d{position:absolute;right:1.1%;bottom:1.5%;width:70.5%;height:72%;z-index:1;filter:none!important;overflow:visible}
#kidults-hero-3d canvas{width:100%!important;height:100%!important;display:block;outline:0}
#kidults-hero-3d[data-webgl="active"] + .dots{z-index:5}
@media(max-width:760px){#kidults-hero-3d{right:-8%;bottom:0;width:96%;height:70%}}
</style>`;

async function proxyIntelligence(path) {
  const upstream = `https://kidults-autonomous-intelligence.john-kim9524.workers.dev${path}`;
  try {
    const response = await fetch(upstream, { headers: { accept: "application/json" } });
    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-kidults-source": path.includes("/preview") ? "preview" : "current"
      }
    });
  } catch (_) {
    return Response.json({ ok: false, mode: "fallback" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/live") {
      const preview = await proxyIntelligence("/v1/intelligence/preview");
      if (preview.ok) return preview;
      return proxyIntelligence("/v1/intelligence/current");
    }

    if (url.pathname === "/v1/intelligence/preview" || url.pathname === "/v1/intelligence/current") {
      return proxyIntelligence(url.pathname);
    }

    if (url.pathname === "/" || url.pathname === "/global-standard") {
      const assetUrl = new URL("/global-standard.html", url.origin);
      const response = await env.ASSETS.fetch(new Request(assetUrl, request));
      let body = await response.text();
      const heroReplacement='<div id="kidults-hero-3d" class="car-stage" role="img" aria-label="Kidults Mobility Sculpture 01 true WebGL 3D"></div>';
      body = body
        .replace(/<svg class="car-stage"[\s\S]*?<\/svg>/, heroReplacement)
        .replace("</head>", `${THREE_STYLE}</head>`)
        .replace("</body>", `${THREE_JS}</body>`);

      const headers = new Headers(response.headers);
      headers.set("content-type", "text/html; charset=utf-8");
      headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
      headers.set("pragma", "no-cache");
      headers.set("expires", "0");
      headers.set("x-kidults-environment", "poc-preview");
      headers.set("x-kidults-design-baseline", "owner-approved-final-true-webgl3d-v2-2026-08-11");
      headers.set("x-kidults-production-promotion", "false");
      return new Response(body, { status: response.status, statusText: response.statusText, headers });
    }

    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "kidults-global-standard-preview",
        environment: "poc-preview",
        final_design_locked: true,
        hero_rendering: "true-webgl-threejs-procedural-3d-v2",
        production_promotion_authorized: false,
        portal: "/global-standard"
      }, { headers: { "cache-control": "no-store" } });
    }

    return env.ASSETS.fetch(request);
  }
};