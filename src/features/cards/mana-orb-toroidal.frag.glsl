precision highp float;
varying vec2 vUV;
uniform sampler2D uBackdrop;
uniform vec2 uCenter;
uniform vec2 uSize;
uniform float uTime;
uniform float uMana;

vec2 hash2(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy);
}

float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 w = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash2(i).x, hash2(i + vec2(1, 0)).x, w.x),
    mix(hash2(i + vec2(0, 1)).x, hash2(i + vec2(1, 1)).x, w.x),
    w.y
  );
}

float fbm(vec2 p) {
  mat2 turn = mat2(.80, .60, -.60, .80);
  float value = 0.0;
  float weight = .54;
  for (int i = 0; i < 4; i++) {
    value += noise2(p) * weight;
    p = turn * p * 2.08 + vec2(5.8, 3.7);
    weight *= .49;
  }
  return value;
}

vec2 advect(vec2 p, float t) {
  vec2 seed = p * 1.75 + vec2(.12 * t, -.25 * t);
  vec2 flow = vec2(
    fbm(seed + vec2(.10 * t, 4.8)),
    fbm(seed + vec2(7.1, -.04 * t))
  ) - .48;
  return p + flow * .83;
}

float liquidSurface(float x, float t, float charge) {
  float wave = .039 * sin(x * 5.4 - t * 1.42)
             + .020 * sin(x * 9.1 + t * .97)
             + .020 * sin(x * 2.6 + t * .48);
  float level = mix(-1.09, .82, charge) + .25 * smoothstep(.84, 1.0, charge);
  return level + wave * (1.0 - smoothstep(.91, 1.0, charge));
}

vec3 liquid(vec3 behind, vec2 p, float t, float charge) {
  float surface = liquidSurface(p.x, t, charge);
  float depth = surface - p.y;
  float body = smoothstep(-.025, .023, depth) * smoothstep(0.0, .045, charge);
  vec2 flow = advect(p * vec2(1.0, .81), t);
  float cloud = fbm(flow * 3.2 + vec2(t * .08, -t * .21));
  float light = smoothstep(.28, .76, cloud);
  vec3 solution = mix(vec3(.010, .032, .103), vec3(.017, .184, .465), light);
  float ray = exp(-max(depth, 0.0) * 1.9) * (.32 + .68 * light);
  solution += vec3(.012, .094, .185) * ray;
  float vein = exp(-35.0 * abs(fbm(flow * 4.8 + vec2(-t * .11, 1.4)) - .52));
  solution += vec3(.020, .164, .250) * vein * smoothstep(.20, .65, light);
  float flowSpec = .45 + .55 * smoothstep(.22, .72, noise2(vec2(p.x * 17.0 - t * .50, 2.1)));
  float crest = exp(-152.0 * abs(depth)) * flowSpec;
  float softCrest = exp(-28.0 * abs(depth)) * (.28 + .72 * light);
  vec3 wetBehind = behind * mix(vec3(.25, .47, .61), vec3(.13, .36, .54), smoothstep(0.0, 1.15, depth));
  vec3 mixed = mix(behind, wetBehind + solution, body);
  return mixed + (vec3(.26, .72, .84) * crest * .68 + vec3(.027, .26, .40) * softCrest)
               * smoothstep(0.0, .10, charge);
}

float softLine(float distanceToLine, float width) {
  float d = distanceToLine / width;
  return exp(-d * d);
}

vec3 tintEnergy(vec3 background, vec3 tint, float density) {
  return background * (1.0 - .29 * density) + tint * density;
}

// Toroidal ribbon variant 7, copied from the supplied mana-orb HTML study.
vec3 toroidalRibbon(vec3 background, vec2 p, float t, float charge) {
  float a = smoothstep(0.0, .60, charge);
  float y = p.y;
  float wobble = .11 * sin(y * 3.2 + t * .80);
  float taper = 1.0 - smoothstep(.50, 1.0, abs(y));
  float phase = y * 5.3 - t * 1.30;
  float span = .36 - .13 * abs(y);
  float tilt = .39 * sin(phase) + .14 * sin(phase * 2.0);
  float sheet = (p.x + wobble - tilt * span) / (.15 + .18 * abs(cos(phase)));
  float fold = .56 + .44 * sin(phase + sheet * 2.7);
  float front = softLine(sheet, .82) * fold;
  float rear = softLine(sheet, 1.48) * (.52 + .48 * cos(phase));
  vec3 hue = vec3(.15, .84, .80);
  float shimmer = .61 + .39 * fbm(p * 4.1 + vec2(.23 * t, -.33 * t));
  return tintEnergy(background, hue, (front * .52 + rear * .31) * shimmer * taper * a);
}

void main() {
  vec2 p = (vUV - .5) * 2.0;
  float radius = min(length(p), 1.0);
  float r2 = radius * radius;

  float magnification = 1.0 - .23 * (1.0 - r2) + .265 * pow(radius, 5.0);
  vec2 baseUV = uCenter + p * uSize * .5;
  vec2 deflection = p * (magnification - 1.0) * uSize * .5;
  vec2 lensUV = baseUV + deflection;
  vec2 dispersion = p * pow(radius, 4.0) * uSize * .006;
  vec3 refracted = vec3(
    texture2D(uBackdrop, lensUV + dispersion).r,
    texture2D(uBackdrop, lensUV).g,
    texture2D(uBackdrop, lensUV - dispersion).b
  );
  vec3 scene = texture2D(uBackdrop, baseUV).rgb;
  float rimFade = smoothstep(.967, 1.0, radius);
  vec3 glass = mix(refracted, scene, rimFade * .38);
  glass *= .94 - pow(radius, 6.0) * .17;

  vec3 filledGlass = mix(glass, liquid(glass, p, uTime, uMana), smoothstep(.76, .995, uMana));
  vec3 color = toroidalRibbon(filledGlass, p, uTime, uMana);
  vec3 normal = normalize(vec3(p * .92, sqrt(max(.045, 1.0 - r2))));
  float reflection = pow(max(dot(normal, normalize(vec3(-.46, .58, .69))), 0.0), 38.0);
  float rimDistance = (radius - .956) * 58.0;
  float rim = exp(-rimDistance * rimDistance);
  float side = .33 + .67 * pow(clamp((p.y - p.x + 2.0) * .25, 0.0, 1.0), 3.0);
  color += vec3(.68, .74, .79) * reflection * .14;
  color += vec3(.66, .72, .77) * rim * side * .47;
  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
