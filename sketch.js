// sketch.js

// —————————————————————————————————————
// CONFIGURATION & STATE
// —————————————————————————————————————
const N_ANCHORS         = 300;  // per user preference
const TRIGGER_DIST      = 25;   // per user preference
const ANCHOR_VIS_RADIUS = 0;

const LINE_STEPS        = 900;
const ARC_STEPS         = 540;
const BEZ_STEPS         = 360;
const SHAPE_SPEED_MIN   = 0.001;
const SHAPE_SPEED_MAX   = 0.004;

let shapeCounter      = 0;
let bgGradientStops = [];    // NEW VARIABLE TO STORE INITIAL BACKGROUND COLORS
let latticesCompleted = 0;      // cap at 2 full lattices

let anchors           = [];
let skeletons         = [];
let ornaments         = [];
       // NEW ARRAY TO STORE PERSISTENT GEOMETRIES
let lineAnims         = [];
let latticeAnims      = [];
let skeletonCount     = 0;
let lastDragTime      = 0;
let vanishingPoints   = [];
let thickStrokeCount  = 0;
let foregroundAnims   = [];
let firstTwoShapeColors = [];

let palette, bgColor, bgTransparent;
let bgLayer, lineLayer, foregroundLayer;

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

  vanishingPoints = [
    createVector(width / 2, -height * 0.5), // Top
    createVector(width * 1.5, height / 2),  // Right
    createVector(-width * 0.5, height / 2), // Left
  ];

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

  drawBackground();

  // Kandinsky palette (for shapes)
  

  // anchors
  for(let i=0; i<N_ANCHORS; i++){
    anchors.push({
      rx: random(TRIGGER_DIST, width - TRIGGER_DIST) / width,
      ry: random(TRIGGER_DIST, height - TRIGGER_DIST) / height,
      x: 0, y: 0
    });
  }
  updateAnchorPositions();

  // persistent stroke layers
  lineLayer = createGraphics(width, height);
  foregroundLayer = createGraphics(width, height);
  lineLayer.strokeCap(ROUND);
  foregroundLayer.strokeCap(ROUND);

  reset(); // Initial reset of all state
}

// —————————————————————————————————————
// DRAW LOOP
// —————————————————————————————————————
function draw(){
  // 1) splotchy pastel background
  image(bgLayer, 0, 0);

  // 2) persistent lines & arcs from the background layer
  image(lineLayer, 0, 0);

  // 3) draw anchors
  noStroke(); fill(0,0,0,0.07);
  anchors.forEach(a => ellipse(a.x, a.y, ANCHOR_VIS_RADIUS));

  // 4) draw all shapes (skeletons and ornaments)
  skeletons.forEach(s => s.display());
  ornaments.forEach(o => o.display());

  // 4.5) Draw the foreground layer on top of the shapes
  image(foregroundLayer, 0, 0);

  // 5) animate BACKGROUND lines & arcs (drawing to the offscreen buffer)
  for(let i=lineAnims.length-1; i>=0; i--){
    if(!lineAnims[i].step(lineLayer)){
      lineAnims.splice(i,1);
    }
  }

  // 6) animate lattices (drawing to the offscreen buffer)
  for(let i=latticeAnims.length-1; i>=0; i--){
    if(!latticeAnims[i].step(lineLayer)){
      latticeAnims.splice(i,1);
    }
  }

  // 7) animate FOREGROUND lines & arcs (drawing directly to the main canvas)
  for(let i=foregroundAnims.length-1; i>=0; i--){
    if(!foregroundAnims[i].step(foregroundLayer)){ // Draw to the foreground layer
      foregroundAnims.splice(i,1);
    }
  }
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

      angle
    }));
    skeletonCount++;
    return;
  }

  // thereafter mix
  // FIRST, check for special thick stroke event
  if (thickStrokeCount < 2 && random() < 0.1) { // 10% chance, but only twice ever
    const options = {
      strokeWeight: random(8, 15),
      color: color(0, 0, 15, 0.85) // Almost opaque black
    };
    if (random() < 0.5) { // 50% chance for a line
      let B = random(anchors);
      foregroundAnims.push(new LineAnim(A.x, A.y, B.x, B.y, LINE_STEPS, options));
    } else { // 50% chance for a bezier
      let C1 = random(anchors), C2 = random(anchors), D = random(anchors);
      foregroundAnims.push(new BezierAnim(A, C1, C2, D, BEZ_STEPS, options));
    }
    thickStrokeCount++;
    return; // Don't draw anything else this drag
  }

  let r = random();
    if(r < 0.18){ // line
    const anims = random() < 0.3 ? foregroundAnims : lineAnims;
    if (random() < 0.4 && vanishingPoints.length > 0) { // 40% chance for perspective line
        let vp = random(vanishingPoints);
        let pA = createVector(A.x, A.y);
        let dir = p5.Vector.sub(vp, pA);
        dir.setMag(width * 2);
        let B = p5.Vector.add(pA, dir);
        anims.push(new LineAnim(A.x, A.y, B.x, B.y, LINE_STEPS, {}));
    } else { // Original random line
        let B = random(anchors);
        anims.push(new LineAnim(A.x, A.y, B.x, B.y, LINE_STEPS, {}));
    }
  } else if(r < 0.32){ // arc
    // Arcs always go in the background for now
    let R  = random(20,80),
        st = random(TWO_PI),
        sw = random(PI*0.3, PI*0.8);
    lineAnims.push(new ArcAnim(A.x, A.y, R, st, sw, ARC_STEPS));
  } else if(r < 0.45){ // bezier
    const anims = random() < 0.3 ? foregroundAnims : lineAnims;
    if (random() < 0.4 && vanishingPoints.length > 0) { // 40% chance for perspective bezier
        let D = random(anchors);
        let vp = random(vanishingPoints);
        let pA = createVector(A.x, A.y);
        let pD = createVector(D.x, D.y);
        let C1 = p5.Vector.lerp(pA, vp, random(0.25, 0.5));
        let C2 = p5.Vector.lerp(pD, vp, random(0.25, 0.5));
        anims.push(new BezierAnim(A, C1, C2, D, BEZ_STEPS, {}));
    } else { // Original random bezier
        let C1 = random(anchors), C2 = random(anchors), D = random(anchors);
        anims.push(new BezierAnim(A, C1, C2, D, BEZ_STEPS, {}));
    }
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
  constructor(x0,y0,x1,y1,steps, opts={}){
    Object.assign(this,{x0,y0,x1,y1,steps,i:0});
    this.col = opts.color || color(0,0,15,0.8);
    this.w   = opts.strokeWeight || random(1,2);
  }
  step(g){
    let t0 = this.i/this.steps,
        t1 = (this.i+1)/this.steps;
    let xA = lerp(this.x0,this.x1,t0),
        yA = lerp(this.y0,this.y1,t0),
        xB = lerp(this.x0,this.x1,t1),
        yB = lerp(this.y0,this.y1,t1);
    if(g){
      g.stroke(this.col);
      g.strokeWeight(this.w);
      if (this.col === color(0,0,15,0.8)) {
        g.noFill();
        g.stroke(0);
        g.strokeWeight(this.w);
      }
      g.line(xA,yA, xB,yB);
    } else {
      stroke(this.col);
      strokeWeight(this.w);
      line(xA,yA, xB,yB);
    }
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
  constructor(p0,p1,p2,p3,steps, opts={}){
    this.pts   = [p0,p1,p2,p3];
    this.steps = steps;
    this.i     = 0;
    this.col   = opts.color || color(0,0,15,0.8);
    this.w     = opts.strokeWeight || random(1,2);
  }
  step(g){
    let t0 = this.i/this.steps,
        t1 = (this.i+1)/this.steps;
    let [p0,p1,p2,p3] = this.pts;
    let ax = bezierPoint(p0.x,p1.x,p2.x,p3.x,t0),
        ay = bezierPoint(p0.y,p1.y,p2.y,p3.y,t0),
        bx = bezierPoint(p0.x,p1.x,p2.x,p3.x,t1),
        by = bezierPoint(p0.y,p1.y,p2.y,p3.y,t1);
    if(g){
      g.stroke(this.col); g.strokeWeight(this.w);
      g.line(ax,ay,bx,by);
    } else {
      stroke(this.col); strokeWeight(this.w);
      line(ax,ay,bx,by);
    }
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
    let sf;
    if (this.index <= 2) {
      // Make the first two shapes significantly larger
      sf = random(1.8, 2.5);
    } else {
      // Subsequent shapes scale down gradually
      sf = map(this.index, 3, 100, 1.2, 0.4, true);
    }
        this.targetSize = base * sf;

    // New tangent spawning logic
    // 50% of the time, spawn the shape tangent to the anchor point
    if (random() < 0.5) {
      const radius = this.targetSize / 2;
      const angle = random(TWO_PI);
      // The shape's center is offset from the anchor point (x, y)
      // so that the anchor point lies on the shape's final circumference.
      this.x = x + radius * cos(angle);
      this.y = y + radius * sin(angle);
    }

    this.t     = 0;
    this.speed = random(SHAPE_SPEED_MIN,SHAPE_SPEED_MAX);
                            // Create a palette that excludes black/white extremes for all shapes.
    const colorfulPalette = palette.filter(c => brightness(c) >= 15 && brightness(c) < 85);

    if (this.index <= 2) {
        let selectedColor;
        // This is the first of the two main shapes
        if (firstTwoShapeColors.length === 0) {
            if (colorfulPalette.length > 0) {
                selectedColor = random(colorfulPalette);
            } else { // Failsafe
                let c1 = random(palette);
                selectedColor = color(hue(c1), saturation(c1), random(40, 70));
            }
        } 
        // This is the second of the two main shapes
        else {
            // Find a color different from the first one
            let availableColors = colorfulPalette.filter(c => c.toString() !== firstTwoShapeColors[0].toString());
            if (availableColors.length > 0) {
                selectedColor = random(availableColors);
            } else { // Failsafe
                let otherColor = random(palette.filter(c => c.toString() !== firstTwoShapeColors[0].toString()));
                // Super failsafe if only one color exists in the entire palette
                if (!otherColor) {
                    let baseColor = firstTwoShapeColors[0];
                    let newHue = (hue(baseColor) + 180) % 360; // Get complementary hue
                    selectedColor = color(newHue, saturation(baseColor), brightness(baseColor));
                } else {
                    selectedColor = color(hue(otherColor), saturation(otherColor), random(40, 70));
                }
            }
        }
        this.c = selectedColor;
        this.c2 = selectedColor; // c2 isn't used in open shapes, but keep it consistent.
        firstTwoShapeColors.push(this.c);

    } else {
        // For all other shapes, pick from the colorful palette, with a fallback.
        if (colorfulPalette.length > 0) {
            this.c = random(colorfulPalette);
            this.c2 = random(colorfulPalette);
        } else {
            // Failsafe: fall back to the original palette if no colorful options exist.
            this.c = random(palette);
            this.c2 = random(palette);
        }
    }
    this.rot   = opts.angle || random(TWO_PI);
    this.sw    = random(0.8,3);

        if (this.index <= 2) {
      this.rawType = random(['openRect', 'openTriangle']);
    } else {
      let styles = opts.styleSet || [
        "circle","rect","triangle","semiCircle",
        "openRect","openTriangle","halo",
        "concentricCircle","concentricArc","squiggle"
      ];
      this.rawType = random(styles);
    }
    this.useAdditiveBlend = random() < 0.5;

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
    const originalBlendMode = ctx.globalCompositeOperation;

    try {
      if (this.useAdditiveBlend) {
        ctx.globalCompositeOperation = 'lighter';
      }

    // --- circle / halo ---
        if(this.type==="circle"){
      if(this.style==="halo"){
        // Create a dimmer, less saturated color for the halo effect
        let haloColor = color(hue(this.c), saturation(this.c) * 0.6, lightness(this.c) * 0.85);
        let r0 = s * 0.4, r1 = s * 0.8;
        let grad = ctx.createRadialGradient(0, 0, r0, 0, 0, r1);
        grad.addColorStop(0, haloColor.toString());
        grad.addColorStop(1, bgTransparent);
        ctx.fillStyle = grad;
        noStroke();
        circle(0, 0, s * 0.8);
      } else {
        fill(this.c);
        noStroke();
        circle(0, 0, s);
      }
    }

    // --- semiCircle ---
    else if(this.type==="semiCircle"){
      if(this.style==="filled"){ noStroke(); fill(this.c); }
      else { noFill(); stroke(0,0,15); strokeWeight(this.sw); }
      arc(0,0,s,s,0,PI);
    }

    // --- rect / openRect ---
    else if (this.type === "rect") {
        let w = s, h = s * 0.6;
        if (this.style === "open") {
            const verts = [
                [-w / 2, -h / 2], // top-left
                [w / 2, -h / 2],  // top-right
                [w / 2, h / 2],   // bottom-right
                [-w / 2, h / 2]   // bottom-left
            ];
            const edges = [
                { v: [verts[0], verts[1]], dir: [0, -1] }, // top
                { v: [verts[1], verts[2]], dir: [1, 0]  }, // right
                { v: [verts[2], verts[3]], dir: [0, 1]  }, // bottom
                { v: [verts[3], verts[0]], dir: [-1, 0] }  // left
            ];

            // Determine which edge is "open" based on the gradient angle.
            let θ = this.gradientAngle,
                dx = cos(θ),
                dy = sin(θ);
            let maxDot = -Infinity,
                openIdx = 0;
            for (let i = 0; i < 4; i++) {
                let dot = edges[i].dir[0] * dx + edges[i].dir[1] * dy;
                if (dot > maxDot) {
                    maxDot = dot;
                    openIdx = i;
                }
            }

            // The gradient starts at the midpoint of the edge opposite the open edge
            // and ends at the midpoint of the open edge.
            let oppositeIdx = (openIdx + 2) % 4;
            
            let startEdge = edges[oppositeIdx].v;
            let endEdge = edges[openIdx].v;

            let startX = (startEdge[0][0] + startEdge[1][0]) / 2;
            let startY = (startEdge[0][1] + startEdge[1][1]) / 2;
            let endX = (endEdge[0][0] + endEdge[1][0]) / 2;
            let endY = (endEdge[0][1] + endEdge[1][1]) / 2;

            const r = red(this.c), g = green(this.c), b = blue(this.c);
            const transparentShapeColor = `rgba(${r},${g},${b},0)`;
            let lg = ctx.createLinearGradient(startX, startY, endX, endY);
            lg.addColorStop(0, this.c.toString());
            lg.addColorStop(0.9, transparentShapeColor);
            lg.addColorStop(1, transparentShapeColor);

            // Clip to the rect path and fill with the gradient
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(...verts[0]);
            ctx.lineTo(...verts[1]);
            ctx.lineTo(...verts[2]);
            ctx.lineTo(...verts[3]);
            ctx.closePath();
            ctx.clip();
            ctx.fillStyle = lg;
            ctx.fillRect(-w / 2, -h / 2, w, h);
            ctx.restore();

                        // Draw strokes on the three non-open edges
            noFill();
            stroke(0);
            strokeWeight(this.sw);
            for (let i = 0; i < 4; i++) {
                if (i !== openIdx) {
                    let v1 = edges[i].v[0];
                    let v2 = edges[i].v[1];
                    line(v1[0], v1[1], v2[0], v2[1]);
                }
            }
        } else if (this.style === "filled") {
            noStroke();
            fill(this.c);
            rect(-w / 2, -h / 2, w, h);
        } else {
            noFill();
            stroke(0, 0, 15);
            strokeWeight(this.sw);
            rect(-w / 2, -h / 2, w, h);
        }
    }

    // --- triangle / openTriangle ---
    else if (this.type === "triangle") {
        let hgt = s * sqrt(3) / 2,
            v = [
                [-s / 2, hgt / 3],
                [s / 2, hgt / 3],
                [0, -2 * hgt / 3]
            ];

        if (this.style === "open") {
            // Determine which edge is "open" based on the gradient angle.
            // The open edge is the one whose midpoint is most in the direction of the gradient.
            let θ = this.gradientAngle,
                dx = cos(θ),
                dy = sin(θ);
            let maxDot = -Infinity,
                openIdx = 0;
            for (let i = 0; i < 3; i++) {
                let j = (i + 1) % 3;
                // Midpoint of the edge
                let mx = (v[i][0] + v[j][0]) / 2,
                    my = (v[i][1] + v[j][1]) / 2;
                // Project midpoint onto gradient vector
                let dot = mx * dx + my * dy;
                if (dot > maxDot) {
                    maxDot = dot;
                    openIdx = i;
                }
            }

            // The gradient starts at the vertex opposite the open edge (the "V" corner)
            // and ends at the midpoint of the open edge.
            let startVert = v[(openIdx + 2) % 3];
            let edgeA = v[openIdx],
                edgeB = v[(openIdx + 1) % 3];
            let midX = (edgeA[0] + edgeB[0]) / 2,
                midY = (edgeA[1] + edgeB[1]) / 2;

            const r = red(this.c), g = green(this.c), b = blue(this.c);
            const transparentShapeColor = `rgba(${r},${g},${b},0)`;
            let lg = ctx.createLinearGradient(startVert[0], startVert[1], midX, midY);
            lg.addColorStop(0, this.c.toString());
            lg.addColorStop(0.9, transparentShapeColor);
            lg.addColorStop(1, transparentShapeColor);

            // Clip to the triangle path and fill with the gradient
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(...v[0]);
            ctx.lineTo(...v[1]);
            ctx.lineTo(...v[2]);
            ctx.clip();
            ctx.fillStyle = lg;
            // Use a bounding box that covers the whole shape for the fill
            let half = s; 
            ctx.fillRect(-half, -half, 2 * half, 2 * half);
            ctx.restore();

            // Draw strokes on the two non-open edges
            noFill();
            stroke(0);
            strokeWeight(this.sw);
            for (let i = 0; i < 3; i++) {
                if (i !== openIdx) {
                    let j = (i + 1) % 3;
                    line(v[i][0], v[i][1], v[j][0], v[j][1]);
                }
            }
        } else if (this.style === "filled") {
            noStroke();
            fill(this.c);
            triangle(...v[0], ...v[1], ...v[2]);
        } else {
            noFill();
            stroke(0, 0, 15);
            strokeWeight(this.sw);
            triangle(...v[0], ...v[1], ...v[2]);
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

    } finally {
      ctx.globalCompositeOperation = originalBlendMode;
    }

    pop();
  }
}

// —————————————————————————————————————
// RESIZE
// —————————————————————————————————————
function windowResized() {
  let w, h;
  if (windowWidth / windowHeight < 16/9) {
    w = windowWidth;
    h = floor(w * 9/16);
  } else {
    h = windowHeight;
    w = floor(h * 16/9);
  }

  // Preserve lineLayer
  const tempLine = createGraphics(w,h);
  tempLine.image(lineLayer, 0, 0, w, h);
  lineLayer.resizeCanvas(w, h);
  lineLayer.image(tempLine, 0, 0);
  tempLine.remove();

  // Preserve foregroundLayer
  const tempForeground = createGraphics(w,h);
  tempForeground.image(foregroundLayer, 0, 0, w, h);
  foregroundLayer.resizeCanvas(w, h);
  foregroundLayer.image(tempForeground, 0, 0);
  tempForeground.remove();

  // Resize and redraw background
  bgLayer.resizeCanvas(w, h);
  bgLayer.pixelDensity(1);
  drawBackground();
  
  // Final canvas resize and anchor update
  resizeCanvas(w, h);
  updateAnchorPositions();
}

function generateHarmoniousPalette() {
  let baseHue = random(360);
  let harmonyMode = random(['analogous', 'complementary', 'triadic', 'split-complementary']);
  let newPalette = [];

  // Always add black and a slightly off-white for contrast and highlights
  newPalette.push(color(0, 0, 10));       // Near-black
    newPalette.push(color(baseHue, 10, 90)); // Off-white with a hint of the base hue

  // Generate the rest of the palette based on the harmony mode
  switch (harmonyMode) {
    case 'analogous':
      for (let i = 0; i < 3; i++) {
        let hue = (baseHue + (i - 1) * 30 + 360) % 360;
        newPalette.push(color(hue, random(60, 90), random(50, 80)));
      }
      break;
    case 'complementary':
      newPalette.push(color(baseHue, random(70, 90), random(50, 85)));
      newPalette.push(color((baseHue + 180) % 360, random(70, 90), random(50, 85)));
      break;
    case 'triadic':
      for (let i = 0; i < 3; i++) {
        let hue = (baseHue + i * 120) % 360;
        newPalette.push(color(hue, random(60, 85), random(50, 80)));
      }
      break;
    case 'split-complementary':
      newPalette.push(color(baseHue, random(70, 90), random(50, 85)));
      newPalette.push(color((baseHue + 150) % 360, random(60, 85), random(50, 80)));
      newPalette.push(color((baseHue + 210) % 360, random(60, 85), random(50, 80)));
      break;
  }

  return newPalette;
}

function reset() {
  // Clear all animation arrays and reset counters
  skeletons = [];
  ornaments = [];
  lineAnims = [];
  latticeAnims = [];
  foregroundAnims = [];
  skeletonCount = 0;
  thickStrokeCount = 0;

  // Clear the graphics layers
  if (lineLayer) lineLayer.clear();
  if (foregroundLayer) foregroundLayer.clear();
  
  // Generate a new harmonious color palette
  palette = generateHarmoniousPalette();

  // Redraw the background
  drawBackground();
}



function updateAnchorPositions(){
  for(const a of anchors){
    a.x = a.rx * width;
    a.y = a.ry * height;
  }
}

function drawBackground() {
  const noiseScale = 0.002; // Zoomed in even further for very large color patches
  const rOffset = 0;
  const gOffset = 10000;
  const bOffset = 20000;

  bgLayer.loadPixels();
  for (let y = 0; y < bgLayer.height; y++) {
    for (let x = 0; x < bgLayer.width; x++) {
      const r = noise(x * noiseScale + rOffset, y * noiseScale) * 255;
      const g = noise(x * noiseScale + gOffset, y * noiseScale) * 255;
      const b = noise(x * noiseScale + bOffset, y * noiseScale) * 255;

      let idx = 4 * (x + y * bgLayer.width);
      bgLayer.pixels[idx] = r;
      bgLayer.pixels[idx + 1] = g;
      bgLayer.pixels[idx + 2] = b;
      bgLayer.pixels[idx + 3] = 255;
    }
  }
  bgLayer.updatePixels();
}
