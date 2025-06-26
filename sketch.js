// sketch.js

// —————————————————————————————————————
// CONFIGURATION & STATE
// —————————————————————————————————————
const N_ANCHORS         = 400;  // per user preference
const TRIGGER_DIST      = 25;   // per user preference
const ANCHOR_VIS_RADIUS = 5;

const LINE_STEPS        = 900;
const ARC_STEPS         = 540;
const BEZ_STEPS         = 360;
const SHAPE_SPEED_MIN   = 0.001;
const SHAPE_SPEED_MAX   = 0.004;

let shapeCounter      = 0;
let latticesCompleted = 0;      // cap at 2 full lattices

let anchors           = [];
let skeletons         = [];
let ornaments         = [];
let lineAnims         = [];
let latticeAnims      = [];
let skeletonCount     = 0;
let lastDragTime      = 0;

let palette, bgColor, bgTransparent;
let bgLayer, lineLayer;

// —————————————————————————————————————
// P5 SETUP
// —————————————————————————————————————
function setup(){
  // 16×9 canvas
  let w = windowWidth,
      h = floor(w * 9/16);
  if(h > windowHeight){
    h = windowHeight;
    w = floor(h * 16/9);
  }
  createCanvas(w, h);
  colorMode(HSL, 360,100,100,1);

  // pastel background color + transparent string
  let H = random(360),
      S = random(15,35),
      L = random(85,97),
      A = 0.94;
  bgColor = color(H, S, L, A);
  let r = red(bgColor),
      g = green(bgColor),
      b = blue(bgColor);
  bgTransparent = `rgba(${floor(r)},${floor(g)},${floor(b)},0)`;

  // build the Kandinsky-style gradient background layer
  bgLayer = createGraphics(width, height);
  bgLayer.pixelDensity(1);
  bgLayer.colorMode(HSL, 360,100,100,1);
  // define gradient stops with neutral canvas tone randomly placed
  let neutral = color(0, 0, 98);
  let bgOptions = [
    neutral,
    color(0, 0, 15),
    color(45, 90, 60),
    color(220, 90, 52),
    color(310, 40, 72),
    color(190, 60, 72),
    color(126, 55, 55),
    color(13, 90, 60)
  ];
  // pick two additional colors
  let others = bgOptions.filter(c => c !== neutral);
  let c2 = random(others);
  let c3 = random(others.filter(c => c !== c2));
  // shuffle stops so neutral isn't always first
  let stops = shuffle([neutral, c2, c3], true);
  let g1 = stops[0];
  let g2 = stops[1];
  let g3 = stops[2];
  // perlin noise parameters
  let noiseScale = 0.005;
  let noiseAmp = 0.2;
  bgLayer.loadPixels();
  for(let y = 0; y < height; y++){
    for(let x = 0; x < width; x++){
      let v = y/height;
      let n = noise(x * noiseScale, y * noiseScale) * noiseAmp - noiseAmp/2;
      let t = constrain(v + n, 0, 1);
      let col = t < 0.5 ? lerpColor(g1, g2, t*2) : lerpColor(g2, g3, (t - 0.5)*2);
      let idx = 4 * (x + y * width);
      bgLayer.pixels[idx]     = red(col);
      bgLayer.pixels[idx + 1] = green(col);
      bgLayer.pixels[idx + 2] = blue(col);
      bgLayer.pixels[idx + 3] = 255;
    }
  }
  bgLayer.updatePixels();

  // Kandinsky palette (for shapes)
  palette = [
    color(0,0,15),   color(0,0,98),
    color(45,90,60), color(220,90,52),
    color(310,40,72),color(190,60,72),
    color(126,55,55),color(13,90,60)
  ];

  // anchors
  for(let i=0; i<N_ANCHORS; i++){
    anchors.push({
      x: random(TRIGGER_DIST, width-TRIGGER_DIST),
      y: random(TRIGGER_DIST, height-TRIGGER_DIST)
    });
  }

  // persistent stroke layer
  lineLayer = createGraphics(width, height);
  lineLayer.strokeCap(ROUND);
}

// —————————————————————————————————————
// DRAW LOOP
// —————————————————————————————————————
function draw(){
  // draw gradient background
  // 1) splotchy pastel background
  image(bgLayer, 0, 0);

  // 2) persistent lines & arcs
  image(lineLayer, 0, 0);

  // 3) draw anchors
  noStroke(); fill(0,0,0,0.07);
  anchors.forEach(a => ellipse(a.x, a.y, ANCHOR_VIS_RADIUS));

  // 4) draw skeleton shapes (intro)
  skeletons.forEach(s => s.display());

  // 5) animate lines & arcs
  for(let i=lineAnims.length-1; i>=0; i--){
    if(!lineAnims[i].step(lineLayer)){
      lineAnims.splice(i,1);
    }
  }

  // 6) animate lattices (fills + strokes)
  for(let i=latticeAnims.length-1; i>=0; i--){
    if(!latticeAnims[i].step(lineLayer)){
      latticeAnims.splice(i,1);
    }
  }

  // 7) draw remaining ornaments
  ornaments.forEach(o => o.display());
}

// —————————————————————————————————————
// SPAWN ON DRAG
// —————————————————————————————————————
function mouseDragged(){
  let now = millis();
  if(now - lastDragTime < 300) return;
  lastDragTime = now;

  // find nearest anchor
  let near = anchors
    .map(a => ({a, d: dist(mouseX,mouseY,a.x,a.y)}))
    .filter(o => o.d < TRIGGER_DIST);
  if(!near.length) return;
  let A = near.sort((a,b)=>a.d-b.d)[0].a;

  // intro skeletons
  if(skeletonCount < 2){
    let size  = random(min(width,height)*0.3, min(width,height)*0.45);
    let angle = atan2(mouseY - pmouseY, mouseX - pmouseX);
    skeletons.push(new KandinskyShape(A.x, A.y, {
      size,
      styleSet: ["circle","rect","triangle","semiCircle"],
      angle
    }));
    skeletonCount++;
    return;
  }

  // thereafter mix
  let r = random();
  if(r < 0.18){
    let B = random(anchors);
    lineAnims.push(new LineAnim(A.x, A.y, B.x, B.y, LINE_STEPS));
  }
  else if(r < 0.32){
    let R  = random(20,80),
        st = random(TWO_PI),
        sw = random(PI*0.3, PI*0.8);
    lineAnims.push(new ArcAnim(A.x, A.y, R, st, sw, ARC_STEPS));
  }
  else if(r < 0.45){
    let C1 = random(anchors), C2 = random(anchors), D = random(anchors);
    lineAnims.push(new BezierAnim(A, C1, C2, D, BEZ_STEPS));
  }
  else if(r < 0.50){
    ornaments.push(new KandinskyShape(A.x, A.y, {}));
  }
  else if(r < 0.65){
    let pick = random(["openRect","openTriangle"]);
    ornaments.push(new KandinskyShape(A.x, A.y, {
      size: random(30,60),
      styleSet: [pick]
    }));
  }
  else if(r < 0.75){
    ornaments.push(new KandinskyShape(A.x, A.y, {
      size: random(20,60),
      styleSet: ["halo"]
    }));
  }
  else if(r < 0.82){
    ornaments.push(new KandinskyShape(A.x, A.y, {
      size: random(25,70),
      styleSet: ["concentricCircle"]
    }));
  }
  else if(r < 0.88){
    ornaments.push(new KandinskyShape(A.x, A.y, {
      size: random(30,80),
      styleSet: ["concentricArc"]
    }));
  }
  // spawn lattice if allowed
  else if(latticeAnims.length===0 && latticesCompleted < 2){
    latticeAnims.push(new LatticeAnim(A.x, A.y, {
      w        : random(min(width,height)*0.033, min(width,height)*0.066),
      h        : random(min(width,height)*0.033, min(width,height)*0.066),
      spacing  : random(min(width,height)*0.008, min(width,height)*0.02),
      angle1   : random(TWO_PI),
      angle2   : random(PI/3, 2*PI/3),
      fillAlpha: random(0.6,0.9)
    }));
  }
}

// —————————————————————————————————————
// LINE ANIMATION
// —————————————————————————————————————
class LineAnim {
  constructor(x0,y0,x1,y1,steps){
    Object.assign(this,{x0,y0,x1,y1,steps,i:0});
    this.col = color(0,0,15,0.8);
    this.w   = random(1,2);
  }
  step(g){
    let t0 = this.i/this.steps,
        t1 = (this.i+1)/this.steps;
    let xA = lerp(this.x0,this.x1,t0),
        yA = lerp(this.y0,this.y1,t0),
        xB = lerp(this.x0,this.x1,t1),
        yB = lerp(this.y0,this.y1,t1);
    g.stroke(this.col);
    g.strokeWeight(this.w);
    g.line(xA,yA, xB,yB);
    this.i++;
    return this.i < this.steps;
  }
}

// —————————————————————————————————————
// ARC ANIMATION
// —————————————————————————————————————
class ArcAnim {
  constructor(cx,cy,r,start,sweep,steps){
    Object.assign(this,{cx,cy,r,start,sweep,steps,i:0});
    this.col = color(0,0,15,0.6);
    this.w   = random(1,2);
  }
  step(g){
    let t0 = this.i/this.steps,
        t1 = (this.i+1)/this.steps;
    let a0 = this.start + this.sweep*t0,
        a1 = this.start + this.sweep*t1;
    let xA = this.cx + cos(a0)*this.r,
        yA = this.cy + sin(a0)*this.r,
        xB = this.cx + cos(a1)*this.r,
        yB = this.cy + sin(a1)*this.r;
    g.stroke(this.col);
    g.strokeWeight(this.w);
    g.line(xA,yA, xB,yB);
    this.i++;
    return this.i < this.steps;
  }
}

// —————————————————————————————————————
// BEZIER ANIMATION
// —————————————————————————————————————
class BezierAnim {
  constructor(p0,p1,p2,p3,steps){
    this.pts   = [p0,p1,p2,p3];
    this.steps = steps;
    this.i     = 0;
    this.col   = color(0,0,15,0.8);
    this.w     = random(1,2);
  }
  step(g){
    let t0 = this.i/this.steps,
        t1 = (this.i+1)/this.steps;
    let [p0,p1,p2,p3] = this.pts;
    let ax = bezierPoint(p0.x,p1.x,p2.x,p3.x,t0),
        ay = bezierPoint(p0.y,p1.y,p2.y,p3.y,t0),
        bx = bezierPoint(p0.x,p1.x,p2.x,p3.x,t1),
        by = bezierPoint(p0.y,p1.y,p2.y,p3.y,t1);
    g.stroke(this.col); g.strokeWeight(this.w);
    g.line(ax,ay,bx,by);
    this.i++;
    return this.i < this.steps;
  }
}

// LATTICE ANIMATION
// —————————————————————————————————————
class LatticeAnim {
  constructor(x,y,opts){
    this.x = x; this.y = y;
    Object.assign(this, opts);
    // basis vectors
    this.v1 = p5.Vector.fromAngle(this.angle1).mult(this.spacing);
    this.v2 = p5.Vector.fromAngle(this.angle2).mult(this.spacing);
    this.N1 = ceil((this.w*1.5)/this.spacing);
    this.N2 = ceil((this.h*1.5)/this.spacing);

    // build cells
    this.cells = [];
    for(let i=-this.N1;i<=this.N1;i++){
      for(let j=-this.N2;j<=this.N2;j++){
        let p00 = p5.Vector.add(this.v1.copy().mult(i),
                                this.v2.copy().mult(j)),
            p10 = p5.Vector.add(this.v1.copy().mult(i+1),
                                this.v2.copy().mult(j)),
            p11 = p5.Vector.add(this.v1.copy().mult(i+1),
                                this.v2.copy().mult(j+1)),
            p01 = p5.Vector.add(this.v1.copy().mult(i),
                                this.v2.copy().mult(j+1));
        let base = random(palette);
        let col  = color(
          hue(base),
          saturation(base),
          lightness(base),
          this.fillAlpha
        );
        this.cells.push({ poly:[p00,p10,p11,p01], col });
      }
    }

    this.stage = 0;  // 0=cells,1=lines1,2=lines2
    this.cIdx  = 0;
    this.l1    = -this.N1;
    this.l2    = -this.N2;
    this.delay = 12;
    this.lastF = 0;
  }

  step(g){
    if(frameCount - this.lastF < this.delay) return true;
    this.lastF = frameCount;

    g.push(); g.translate(this.x, this.y);

    if(this.stage===0){
      // fill one cell this frame
      let c = this.cells[this.cIdx++];
      g.noStroke(); g.fill(c.col);
      g.beginShape();
      c.poly.forEach(p=> g.vertex(p.x, p.y));
      g.endShape(CLOSE);
      if(this.cIdx >= this.cells.length){
        this.stage = 1;
      }
    }
    else if(this.stage===1){
      // draw one family-θ1 line
      let off = this.l1 * this.spacing,
          dx  = cos(this.angle1),
          dy  = sin(this.angle1),
          nx  = -dy, ny = dx;
      let p1 = createVector(nx,ny).mult(-max(this.w,this.h)*1.2)
               .add(createVector(dx,dy).mult(off)),
          p2 = createVector(nx,ny).mult( max(this.w,this.h)*1.2)
               .add(createVector(dx,dy).mult(off));
      g.stroke(0,0,15); g.strokeWeight(1);
      g.line(p1.x,p1.y, p2.x,p2.y);
      this.l1++;
      if(this.l1 > this.N1) this.stage = 2;
    }
    else {
      // draw one family-θ2 line
      let off = this.l2 * this.spacing,
          dx  = cos(this.angle2),
          dy  = sin(this.angle2),
          nx  = -dy, ny = dx;
      let p1 = createVector(nx,ny).mult(-max(this.w,this.h)*1.2)
               .add(createVector(dx,dy).mult(off)),
          p2 = createVector(nx,ny).mult( max(this.w,this.h)*1.2)
               .add(createVector(dx,dy).mult(off));
      g.stroke(0,0,15); g.strokeWeight(1);
      g.line(p1.x,p1.y, p2.x,p2.y);
      this.l2++;
    }

    g.pop();

    if(this.stage>=2 && this.l2 > this.N2){
      latticesCompleted++;
      return false;
    }
    return true;
  }
}

// —————————————————————————————————————
// KANDINSKY SHAPE (all variants + gradients)
// —————————————————————————————————————
class KandinskyShape {
  constructor(x,y,opts={}){
    this.x = x; this.y = y;
    this.index      = ++shapeCounter;
    let base        = opts.size || random(40,100);
    let sf          = map(this.index,1,100,1,0.2,true);
    this.targetSize = base * sf;

    this.t     = 0;
    this.speed = random(SHAPE_SPEED_MIN,SHAPE_SPEED_MAX);
    this.c     = random(palette);
    this.c2    = random(palette);
    this.rot   = opts.angle || random(TWO_PI);
    this.sw    = random(0.8,3);

    let styles = opts.styleSet || [
      "circle","rect","triangle","semiCircle",
      "openRect","openTriangle","halo",
      "concentricCircle","concentricArc","squiggle"
    ];
    this.rawType = random(styles);

    // normalize type/style
    if(this.rawType==="halo"){
      this.type="circle"; this.style="halo";
    }
    else if(this.rawType==="openRect"){
      this.type="rect"; this.style="open";
      this.gradientAngle = random(TWO_PI);
    }
    else if(this.rawType==="openTriangle"){
      this.type="triangle"; this.style="open";
      this.gradientAngle = random(TWO_PI);
    }
    else {
      this.type  = this.rawType;
      this.style = "filled";
    }

    if(this.type==="concentricCircle"){
      this.rings = floor(random(3,6));
    }
    if(this.type==="concentricArc"){
      this.rings    = floor(random(3,6));
      this.arcStart = random(TWO_PI);
      this.arcSweep = random(PI/3, TWO_PI);
    }
    if(this.type==="squiggle"){
      let segs=15,len=this.targetSize*2;
      this.sv=[];
      for(let i=0;i<=segs;i++){
        let xx=map(i,0,segs,-len/2,len/2),
            yy=sin(i/segs*PI)*this.targetSize*0.2;
        this.sv.push({x:xx,y:yy});
      }
    }
  }

  display(){
    if(this.t < 1) this.t += this.speed;
    let s = this.targetSize * (1 - pow(1-this.t,3));

    push(); translate(this.x,this.y); rotate(this.rot);
    let ctx = drawingContext;

    // --- circle / halo ---
    if(this.type==="circle"){
      if(this.style==="halo"){
        let r0=s*0.4, r1=s*0.8;
        let grad = ctx.createRadialGradient(0,0,r0, 0,0,r1);
        grad.addColorStop(0, this.c.toString());
        grad.addColorStop(1, bgTransparent);
        ctx.save(); ctx.fillStyle=grad;
        ctx.beginPath(); ctx.arc(0,0,r1,0,2*PI);
        ctx.arc(0,0,r0,0,2*PI,true);
        ctx.closePath(); ctx.fill(); ctx.restore();
      }
      if(this.style==="filled") fill(this.c);
      else noFill();
      stroke(0,0,15); strokeWeight(this.sw);
      ellipse(0,0,s,s);
    }

    // --- semiCircle ---
    else if(this.type==="semiCircle"){
      if(this.style==="filled"){ noStroke(); fill(this.c); }
      else { noFill(); stroke(0,0,15); strokeWeight(this.sw); }
      arc(0,0,s,s,0,PI);
    }

    // --- rect / openRect ---
    else if(this.type==="rect"){
      let w=s, h=s*0.6;
      if(this.style==="open"){
        let θ=this.gradientAngle, dx=cos(θ), dy=sin(θ),
            half=max(w,h),
            x0=-dx*half, y0=-dy*half,
            x1= dx*half, y1= dy*half;
        let lg=ctx.createLinearGradient(x0,y0,x1,y1);
        lg.addColorStop(0,this.c.toString());
        lg.addColorStop(1,bgTransparent);
        ctx.save();
        ctx.beginPath(); ctx.rect(-w/2,-h/2,w,h);
        ctx.clip(); ctx.fillStyle=lg;
        ctx.fillRect(-w/2,-h/2,w,h); ctx.restore();

        noFill(); stroke(0,0,15); strokeWeight(this.sw);
        [["top",[-w/2,-h/2,w/2,-h/2]],
         ["right",[w/2,-h/2,w/2,h/2]],
         ["bottom",[w/2,h/2,-w/2,h/2]],
         ["left",[-w/2,h/2,-w/2,-h/2]]]
        .forEach(([edge,ln])=>{
          let mx=(ln[0]+ln[2])/2,
              my=(ln[1]+ln[3])/2;
          if(mx*dx + my*dy < 0) line(...ln);
        });
      }
      else if(this.style==="filled"){
        noStroke(); fill(this.c);
        rectMode(CENTER); rect(0,0,w,h);
      }
      else {
        noFill(); stroke(0,0,15); strokeWeight(this.sw);
        rectMode(CENTER); rect(0,0,w,h);
      }
    }

    // --- triangle / openTriangle ---
    else if(this.type==="triangle"){
      let hgt=s*sqrt(3)/2,
          v=[[ -s/2,hgt/3 ],
             [  s/2,hgt/3 ],
             [    0,-2*hgt/3 ]];
      if(this.style==="open"){
        let θ=this.gradientAngle, dx=cos(θ), dy=sin(θ),
            half=s,
            x0=-dx*half,y0=-dy*half,
            x1= dx*half,y1= dy*half;
        let lg=ctx.createLinearGradient(x0,y0,x1,y1);
        lg.addColorStop(0,this.c.toString());
        lg.addColorStop(1,bgTransparent);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(...v[0]); ctx.lineTo(...v[1]); ctx.lineTo(...v[2]);
        ctx.clip(); ctx.fillStyle=lg;
        ctx.fillRect(-half,-half,2*half,2*half); ctx.restore();

        noFill(); stroke(0,0,15); strokeWeight(this.sw);
        for(let i=0;i<3;i++){
          let j=(i+1)%3,
              mx=(v[i][0]+v[j][0])/2,
              my=(v[i][1]+v[j][1])/2;
          if(mx*dx + my*dy < 0)
            line(v[i][0],v[i][1], v[j][0],v[j][1]);
        }
      }
      else if(this.style==="filled"){
        noStroke(); fill(this.c);
        triangle(...v[0],...v[1],...v[2]);
      }
      else {
        noFill(); stroke(0,0,15); strokeWeight(this.sw);
        triangle(...v[0],...v[1],...v[2]);
      }
    }

    // --- concentricCircle ---
    else if(this.type==="concentricCircle"){
      noFill(); stroke(this.c); strokeWeight(this.sw);
      for(let i=1;i<=this.rings;i++){
        let r0 = s*(i/this.rings);
        ellipse(0,0,r0*2,r0*2);
      }
    }

    // --- concentricArc ---
    else if(this.type==="concentricArc"){
      noFill(); stroke(this.c); strokeWeight(this.sw);
      for(let i=1;i<=this.rings;i++){
        let r0 = s*(i/this.rings);
        arc(0,0,r0*2,r0*2,this.arcStart,this.arcStart+this.arcSweep);
      }
    }

    // --- squiggle ---
    else if(this.type==="squiggle"){
      noFill(); stroke(this.c); strokeWeight(this.sw);
      beginShape();
      this.sv.forEach(v=> vertex(
        v.x*(s/this.targetSize),
        v.y*(s/this.targetSize)
      ));
      endShape();
    }

    pop();
  }
}

// —————————————————————————————————————
// RESIZE
// —————————————————————————————————————
function windowResized(){
  let w = windowWidth,
      h = floor(w * 9/16);
  if(h > windowHeight){
    h = windowHeight;
    w = floor(h * 16/9);
  }
  resizeCanvas(w, h);
  lineLayer.resizeCanvas(w, h);
  bgLayer.resizeCanvas(w, h);
  bgLayer.pixelDensity(1);
  // regenerate background with neutral canvas tone randomly placed among stops
  bgLayer.colorMode(HSL, 360,100,100,1);
  let neutral = color(0, 0, 98);
  let bgOptions = [
    neutral,
    color(0, 0, 15),
    color(45, 90, 60),
    color(220, 90, 52),
    color(310, 40, 72),
    color(190, 60, 72),
    color(126, 55, 55),
    color(13, 90, 60)
  ];
  // pick two additional colors
  let others = bgOptions.filter(c => c !== neutral);
  let c2 = random(others);
  let c3 = random(others.filter(c => c !== c2));
  // shuffle stops so neutral isn't always first
  let stops = shuffle([neutral, c2, c3], true);
  let g1 = stops[0];
  let g2 = stops[1];
  let g3 = stops[2];
  // perlin noise parameters
  let noiseScale = 0.005;
  let noiseAmp = 0.2;
  bgLayer.loadPixels();
  for(let yy = 0; yy < height; yy++){
    for(let xx = 0; xx < width; xx++){
      let v = yy/height;
      let n = noise(xx * noiseScale, yy * noiseScale) * noiseAmp - noiseAmp/2;
      let t = constrain(v + n, 0, 1);
      let col = t < 0.5 ? lerpColor(g1, g2, t*2)
                        : lerpColor(g2, g3, (t - 0.5)*2);
      let idx = 4 * (xx + yy * width);
      bgLayer.pixels[idx]     = red(col);
      bgLayer.pixels[idx + 1] = green(col);
      bgLayer.pixels[idx + 2] = blue(col);
      bgLayer.pixels[idx + 3] = 255;
    }
  }
  bgLayer.updatePixels();
}