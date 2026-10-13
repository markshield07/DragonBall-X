import * as THREE from 'three';
// Continuous profile-loft meshes for a muscular anime fighter.
// Smooth connected rings replace the old pile of torso/limb primitives.
// Coordinates match Avatar.js' existing ~1.75-metre rig.
export function loft(rings, segments=24) {
  const vertices=[], triangles=[];
  for(const ring of rings) for(let j=0;j<segments;j++) {
    const a=j*Math.PI*2/segments;
    vertices.push((ring.x||0)+Math.cos(a)*ring.rx, ring.y, (ring.z||0)+Math.sin(a)*ring.rz);
  }
  for(let i=0;i<rings.length-1;i++) for(let j=0;j<segments;j++) {
    const a=i*segments+j,b=i*segments+(j+1)%segments,c=(i+1)*segments+j,d=(i+1)*segments+(j+1)%segments;
    triangles.push(a,b,c,b,d,c);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  g.setIndex(triangles);g.computeVertexNormals();
  return g;
}
export function torsoGeometry(width=1, depth=1, feminine=false) {
  const w=width*(feminine?0.88:1);
  const profile=[
    [0.98,.165,.105], [1.03,.176,.115], [1.10,.145,.095],
    [1.17,.151,.103], [1.23,.185,.126], [1.31,.229,.145],
    [1.38,.247,.15], [1.44,.224,.139], [1.49,.148,.095],
    [1.55,.066,.066]
  ];
  return loft(profile.map(([y,rx,rz])=>({y,rx:rx*w,rz:rz*depth})),32);
}
export function legGeometry(side=1, mass=1) {
  // Lower calf, knee, sweep of vastus medialis, quad and glute insertion.
  const x=.135*side;
  return loft([
    {y:.16,rx:.071*mass,rz:.075*mass,x},
    {y:.23,rx:.093*mass,rz:.104*mass,x},
    {y:.33,rx:.112*mass,rz:.118*mass,x},
    {y:.43,rx:.078*mass,rz:.084*mass,x},
    {y:.52,rx:.097*mass,rz:.114*mass,x},
    {y:.63,rx:.143*mass,rz:.153*mass,x},
    {y:.75,rx:.155*mass,rz:.165*mass,x:x*.98},
    {y:.86,rx:.15*mass,rz:.165*mass,x:x*.95},
    {y:.98,rx:.127*mass,rz:.138*mass,x:x*.8},
  ],20);
}
export function armGeometry(upper=true) {
  // Segment axis is local +Y, with rounded, tapered ends.
  const profile=upper?[
    [-.17,.049,.056],[-.13,.071,.078],[-.06,.087,.094],
    [.025,.104,.109],[.11,.091,.102],[.18,.066,.075]
  ]:[
    [-.16,.055,.06],[-.1,.075,.082],[0,.086,.091],
    [.07,.074,.081],[.16,.05,.056]
  ];
  return loft(profile.map(([y,rx,rz])=>({y,rx,rz})),20);
}
