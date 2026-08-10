const THREE_JS = `
<script type="module" id="kidults-webgl-3d">
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.js';

function initKidultsHero3D(){
  const host=document.getElementById('kidults-hero-3d');
  if(!host) return;

  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(24,1,.1,100);
  camera.position.set(7.4,3.8,8.6);
  camera.lookAt(.3,.25,0);

  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  renderer.setClearColor(0x000000,0);
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.12;
  renderer.domElement.setAttribute('aria-label','Kidults Mobility Sculpture 01 interactive 3D visual');
  host.innerHTML='';
  host.appendChild(renderer.domElement);

  const car=new THREE.Group();
  car.rotation.y=-0.16;
  car.position.y=-0.18;
  scene.add(car);

  const ivory=new THREE.MeshPhysicalMaterial({color:0xf4f0e8,metalness:.08,roughness:.23,clearcoat:1,clearcoatRoughness:.16});
  const pearl=new THREE.MeshPhysicalMaterial({color:0xfdfbf6,metalness:.02,roughness:.16,clearcoat:1,clearcoatRoughness:.12});
  const dark=new THREE.MeshPhysicalMaterial({color:0x07100e,metalness:.42,roughness:.12,clearcoat:1,clearcoatRoughness:.08});
  const tireMat=new THREE.MeshStandardMaterial({color:0x151816,metalness:.05,roughness:.72});
  const rimMat=new THREE.MeshPhysicalMaterial({color:0xf5f1e8,metalness:.34,roughness:.25,clearcoat:.8});

  // Main body: layered, stretched super-ellipsoid forms create the low, monolithic sculpture silhouette.
  const body=new THREE.Mesh(new THREE.SphereGeometry(1,96,48),ivory);
  body.scale.set(3.25,.72,1.18); body.position.set(.15,.45,0); body.castShadow=true; body.receiveShadow=true; car.add(body);

  const nose=new THREE.Mesh(new THREE.SphereGeometry(1,72,36),pearl);
  nose.scale.set(2.15,.48,1.12); nose.position.set(-2.15,.32,0); nose.rotation.z=.04; nose.castShadow=true; car.add(nose);

  const tail=new THREE.Mesh(new THREE.SphereGeometry(1,72,36),ivory);
  tail.scale.set(1.5,.56,1.12); tail.position.set(2.35,.48,0); tail.castShadow=true; car.add(tail);

  // Black panoramic canopy, shaped as a low glossy capsule.
  const canopy=new THREE.Mesh(new THREE.SphereGeometry(1,72,36),dark);
  canopy.scale.set(1.78,.56,.9); canopy.position.set(.45,1.00,0); canopy.rotation.z=-.03; canopy.castShadow=true; car.add(canopy);
  const canopyMask=new THREE.Mesh(new THREE.BoxGeometry(4.2,.62,2.2),ivory);
  canopyMask.position.set(.45,.58,0); car.add(canopyMask);

  // Lower shadow intake and underbody.
  const intake=new THREE.Mesh(new THREE.BoxGeometry(4.55,.16,1.65),dark);
  intake.position.set(-.65,-.02,0); intake.rotation.z=-.02; car.add(intake);
  const under=new THREE.Mesh(new THREE.BoxGeometry(5.1,.13,1.68),new THREE.MeshStandardMaterial({color:0x111713,roughness:.5}));
  under.position.set(.25,-.20,0); car.add(under);

  function addWheel(x){
    const wheel=new THREE.Group();
    const tire=new THREE.Mesh(new THREE.TorusGeometry(.58,.105,32,96),tireMat); tire.rotation.y=Math.PI/2; tire.castShadow=true; wheel.add(tire);
    const disc=new THREE.Mesh(new THREE.CylinderGeometry(.47,.47,.13,96),rimMat); disc.rotation.z=Math.PI/2; disc.castShadow=true; wheel.add(disc);
    const hub=new THREE.Mesh(new THREE.CylinderGeometry(.055,.055,.15,48),new THREE.MeshPhysicalMaterial({color:0xd8d2c7,metalness:.65,roughness:.18})); hub.rotation.z=Math.PI/2; wheel.add(hub);
    for(let i=0;i<28;i++){
      const a=i*Math.PI*2/28;
      const spoke=new THREE.Mesh(new THREE.BoxGeometry(.012,.33,.018),new THREE.MeshStandardMaterial({color:0xb9b2a6,metalness:.5,roughness:.28}));
      spoke.position.set(0,Math.cos(a)*.17,Math.sin(a)*.17); spoke.rotation.x=a; wheel.add(spoke);
    }
    wheel.position.set(x,-.01,0);
    car.add(wheel);
  }
  addWheel(-1.82); addWheel(2.05);

  // Fine side highlight / shoulder line.
  const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(-2.7,.46,.98),new THREE.Vector3(-1.1,.43,1.10),new THREE.Vector3(.7,.44,1.09),new THREE.Vector3(2.65,.49,.93)]);
  const trim=new THREE.Mesh(new THREE.TubeGeometry(curve,80,.018,10,false),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.92}));
  car.add(trim);

  // Ground and studio lighting.
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(30,18),new THREE.ShadowMaterial({color:0x756f66,opacity:.14}));
  floor.rotation.x=-Math.PI/2; floor.position.y=-.66; floor.receiveShadow=true; scene.add(floor);

  scene.add(new THREE.HemisphereLight(0xffffff,0xd8d2c7,2.25));
  const key=new THREE.DirectionalLight(0xffffff,4.6); key.position.set(-5,8,7); key.castShadow=true; key.shadow.mapSize.set(2048,2048); key.shadow.camera.left=-8;key.shadow.camera.right=8;key.shadow.camera.top=6;key.shadow.camera.bottom=-4; scene.add(key);
  const fill=new THREE.DirectionalLight(0xf1eee8,2.25); fill.position.set(5,4,-6); scene.add(fill);
  const rim=new THREE.DirectionalLight(0xffffff,2.0); rim.position.set(3,6,8); scene.add(rim);

  let pointerX=0,pointerY=0,targetX=0,targetY=0;
  host.addEventListener('pointermove',e=>{const r=host.getBoundingClientRect();targetX=((e.clientX-r.left)/r.width-.5)*.12;targetY=((e.clientY-r.top)/r.height-.5)*.05;},{passive:true});
  host.addEventListener('pointerleave',()=>{targetX=0;targetY=0},{passive:true});

  function resize(){
    const w=Math.max(host.clientWidth,1),h=Math.max(host.clientHeight,1);
    renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host); resize();

  const clock=new THREE.Clock();
  function frame(){
    const t=clock.getElapsedTime();
    pointerX+=(targetX-pointerX)*.045; pointerY+=(targetY-pointerY)*.045;
    car.rotation.y=-.16+pointerX;
    car.rotation.x=-.015-pointerY;
    car.position.y=-.18+Math.sin(t*.65)*.008;
    renderer.render(scene,camera);
    requestAnimationFrame(frame);
  }
  frame();
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',initKidultsHero3D,{once:true});
else initKidultsHero3D();
</script>`;

const THREE_STYLE = `
<style id="kidults-webgl-style">
#kidults-hero-3d{position:absolute;right:1.4%;bottom:1.5%;width:69%;height:70%;z-index:1;filter:none!important}
#kidults-hero-3d canvas{width:100%!important;height:100%!important;display:block;outline:0}
@media(max-width:760px){#kidults-hero-3d{right:-7%;bottom:1%;width:92%;height:68%}}
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
      body = body
        .replace(/<svg class="car-stage"[\s\S]*?<\/svg>/, '<div id="kidults-hero-3d" class="car-stage" role="img" aria-label="Kidults Mobility Sculpture 01 3D"></div>')
        .replace("</head>", `${THREE_STYLE}</head>`)
        .replace("</body>", `${THREE_JS}</body>`);

      const headers = new Headers(response.headers);
      headers.set("content-type", "text/html; charset=utf-8");
      headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
      headers.set("pragma", "no-cache");
      headers.set("expires", "0");
      headers.set("x-kidults-environment", "poc-preview");
      headers.set("x-kidults-design-baseline", "owner-approved-final-plus-webgl3d-2026-08-11");
      headers.set("x-kidults-production-promotion", "false");
      return new Response(body, { status: response.status, statusText: response.statusText, headers });
    }

    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "kidults-global-standard-preview",
        environment: "poc-preview",
        final_design_locked: true,
        hero_rendering: "webgl-threejs-procedural-3d",
        production_promotion_authorized: false,
        portal: "/global-standard"
      }, { headers: { "cache-control": "no-store" } });
    }

    return env.ASSETS.fetch(request);
  }
};