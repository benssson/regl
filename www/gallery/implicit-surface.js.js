(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*
  tags: advanced

  <p>Implicit surface raytracing demo. Many ideas and pieces of code taken from <a href="https://github.com/kevinroast/webglshaders/blob/master/distancefield1.html">here</a> and <a href="http://www.iquilezles.org/www/articles/distfunctions/distfunctions.htm">here</a>  </p>

 */

var regl = require('../regl')();

var camera = require('./util/camera')(regl, {
  center: [-12, 5, 1],
  phi: -0.2
});

var raytrace = regl({
  vert: '\n    precision mediump float;\n    attribute vec2 position;\n    void main () {\n      gl_Position = vec4(position, 0, 1);\n    }',
  frag: '\n    precision mediump float;\n    uniform float width, height, timestep;\n    uniform vec3 eye, center;\n    vec2 resolution = vec2(width, height);\n\n    float torus(vec3 p, vec2 t)\n    {\n      vec2 q = vec2(length(p.xz)-t.x,p.y);\n      return length(q)-t.y;\n    }\n\n    float sphere(vec3 p, float s)\n    {\n      return length(p)-s;\n    }\n\n    vec2 opU(vec2 d1, vec2 d2)\n    {\n      return (d1.x < d2.x) ? d1 : d2;\n    }\n\n    vec3 opRep(vec3 p, vec3 c)\n    {\n      return vec3(mod(p.yz, c.yz)-0.5*c.yz, p.x);\n    }\n\n    float plane(vec3 p, vec4 n)\n    {\n      return dot(p, n.xyz) + n.w;\n    }\n\n    vec2 distanceEstimate(vec3 pos)\n    {\n      float cellSize = 5.;\n      float cellNumber = floor(pos.y/cellSize)+1.;\n      float period = 50./cellNumber;\n      float s = sin(timestep/period);\n      float c = cos(timestep/period);\n      mat3 r = mat3(c,  -s,  0.,\n                    s,   c,  0.,\n                    0.,  0., 1.);\n      vec2 ball = vec2(sphere(opRep(pos-vec3(0, 0, s*2.0), vec3(cellSize)), 0.5), 45.);\n      vec2 tor = vec2(torus(opRep(pos, vec3(cellSize))*r, vec2(1.0, 0.25)), 15.);\n      vec2 floor = vec2(plane(pos, vec4(0, 1, 0, -1)), 0.);\n      vec2 objects = opU(tor, ball);\n      return opU(floor, objects);\n    }\n\n    vec3 getNormal(vec3 pos)\n    {\n      const vec2 delta = vec2(0.01, 0);\n\n      vec3 n;\n      n.x = distanceEstimate(pos + delta.xyy).x - distanceEstimate(pos - delta.xyy).x;\n      n.y = distanceEstimate(pos + delta.yxy).x - distanceEstimate(pos - delta.yxy).x;\n      n.z = distanceEstimate(pos + delta.yyx).x - distanceEstimate(pos - delta.yyx).x;\n\n      return normalize(n);\n    }\n\n    float softshadow(in vec3 ro, in vec3 rd, in float mint, in float tmax)\n    {\n      float res = 1.0;\n      float t = mint;\n      for (int i=0; i<16; i++)\n      {\n        float h = distanceEstimate(ro + rd*t).x;\n        res = min(res, 8.0*h/t);\n        t += clamp(h, 0.02, 0.11);\n        if( h<0.001 || t>tmax ) break;\n      }\n      return clamp(res, 0., 1.);\n    }\n\n    float calcAO(in vec3 pos, in vec3 nor)\n    {\n      float occ = 0.0;\n      float sca = 1.0;\n      for (int i=0; i<5; i++)\n      {\n        float hr = 0.01 + 0.12*float(i)/4.0;\n        vec3 aopos =  nor * hr + pos;\n        float dd = distanceEstimate(aopos).x;\n        occ += -(dd-hr)*sca;\n        sca *= 0.95;\n      }\n      return clamp(1.0 - 3.0*occ, 0., 1.);\n    }\n\n    vec3 sunLight  = normalize(vec3(-0.6, 0.7, 0.5));\n    vec3 sunColour = vec3(1.0, .75, .6);\n    vec3 Sky(in vec3 rayDir)\n    {\n      float sunAmount = max(dot(rayDir, sunLight), 0.0);\n      float v = pow(1.0 - max(rayDir.y, 0.0), 6.);\n      vec3  sky = mix(vec3(.1, .2, .3), vec3(.32, .32, .32), v);\n      sky = sky + sunColour * sunAmount * sunAmount * .25;\n      sky = sky + sunColour * min(pow(sunAmount, 800.0)*1.5, .3);\n\n      return clamp(sky, 0., 1.);\n    }\n\n    const float horizonLength = 100.;\n    const float surfacePrecision = 0.01;\n    const int maxIterations = 128;\n    vec2 castRay(vec3 rayOrigin, vec3 rayDir)\n    {\n      float t = 0.;\n      for (int i=0; i<maxIterations; i++)\n      {\n        vec3 p = rayOrigin + rayDir * t;\n        vec2 d = distanceEstimate(p);\n        if (abs(d.x) < surfacePrecision)\n        {\n          return vec2(t, d.y);\n        }\n        t += d.x;\n        if (t >= horizonLength) break;\n      }\n      return vec2(t, -1.);\n    }\n\n    vec3 getRay(vec3 dir, vec2 pos) {\n      pos = pos - 0.5;\n      pos.x *= resolution.x/resolution.y;\n\n      dir = normalize(dir);\n      vec3 right = normalize(cross(vec3(0., 1., 0.), dir));\n      vec3 up = normalize(cross(dir, right));\n\n      return dir + right*pos.x + up*pos.y;\n    }\n\n    vec3 render(in vec3 ro, in vec3 rd)\n    {\n      vec3 skyColor = Sky(rd);\n      vec3 color = skyColor;\n      vec2 res = castRay(ro, rd);\n      float t = res.x;\n      float material = res.y;\n      if (t < horizonLength)\n      {\n        vec3 pos = ro + t*rd;\n        vec3 normal = getNormal(pos);\n        vec3 reflectionDir = reflect(rd, normal);\n\n        // material\n        color = 0.45 + 0.3*sin(vec3(0.05, 0.08, 0.10)) * material;\n\n        if (material == 0.0)\n        {\n          float f = mod(floor(2.*pos.z) + floor(2.*pos.x), 2.);\n          color = 0.4 + 0.1*f*vec3(1.);\n        }\n\n        // lighting\n        float occ = calcAO(pos, normal);\n        float amb = clamp(0.5+0.5*normal.y, 0., 1.);\n        float dif = clamp(dot(normal, sunLight), 0., 1.);\n        float bac = clamp(dot(normal, normalize(vec3(-sunLight.x, 0., -sunLight.z))), 0., 1.) * clamp(1.0-pos.y, 0., 1.);\n        float dom = smoothstep(-0.1, 0.1, reflectionDir.y);\n        float fre = pow(clamp(1.0+dot(normal, rd), 0., 1.), 2.);\n        float spe = pow(clamp(dot(reflectionDir, sunLight), 0., 1.), 16.);\n\n        dif *= softshadow(pos, sunLight, 0.02, 2.5);\n        dom *= softshadow(pos, reflectionDir, 0.02, 2.5);\n\n        vec3 lin = vec3(0.);\n        lin += 1.20 * dif * vec3(1.00, 0.85, 0.55);\n        lin += 1.20 * spe * vec3(1.00, 0.85, 0.55) * dif;\n        lin += 0.20 * amb * vec3(0.50, 0.70, 1.00) * occ;\n        lin += 0.30 * dom * vec3(0.50, 0.70, 1.00) * occ;\n        lin += 0.30 * bac * vec3(0.25, 0.25, 0.25) * occ;\n        lin += 0.40 * fre * vec3(1.00, 1.00, 1.00) * occ;\n        color = color * lin;\n\n        color = mix(color, skyColor, 1.0-exp(-0.001*t*t));\n      }\n      return vec3(clamp(color, 0., 1.));\n    }\n\n    void main () {\n      vec2 p = gl_FragCoord.xy / resolution.xy;\n      vec3 rayDir = normalize(getRay(eye-center, p));\n      vec3 res = render(center, rayDir);\n      gl_FragColor = vec4(res.rgb, 1.);\n    }',
  attributes: {
    position: [-4, -4, 4, -4, 0, 4]
  },
  uniforms: {
    height: regl.context('viewportHeight'),
    width: regl.context('viewportWidth'),
    timestep: regl.context('tick')
  },
  count: 3
});

regl.frame(function () {
  camera(function () {
    raytrace();
  });
});

},{"../regl":43,"./util/camera":2}],2:[function(require,module,exports){
var mouseChange = require('mouse-change');
var mouseWheel = require('mouse-wheel');
var identity = require('gl-mat4/identity');
var perspective = require('gl-mat4/perspective');
var lookAt = require('gl-mat4/lookAt');

module.exports = createCamera;

function createCamera(regl, props) {
  var cameraState = {
    view: identity(new Float32Array(16)),
    projection: identity(new Float32Array(16)),
    center: new Float32Array(props.center || 3),
    theta: props.theta || 0,
    phi: props.phi || 0,
    distance: Math.log(props.distance || 10.0),
    eye: new Float32Array(3),
    up: new Float32Array(props.up || [0, 1, 0])
  };

  var right = new Float32Array([1, 0, 0]);
  var front = new Float32Array([0, 0, 1]);

  var minDistance = Math.log('minDistance' in props ? props.minDistance : 0.1);
  var maxDistance = Math.log('maxDistance' in props ? props.maxDistance : 1000);

  var dtheta = 0;
  var dphi = 0;
  var ddistance = 0;

  var prevX = 0;
  var prevY = 0;
  mouseChange(function (buttons, x, y) {
    if (buttons & 1) {
      var dx = (x - prevX) / window.innerWidth;
      var dy = (y - prevY) / window.innerHeight;
      var w = Math.max(cameraState.distance, 0.5);

      dtheta += w * dx;
      dphi += w * dy;
    }
    prevX = x;
    prevY = y;
  });

  mouseWheel(function (dx, dy) {
    ddistance += dy / window.innerHeight;
  });

  function damp(x) {
    var xd = x * 0.9;
    if (xd < 0.1) {
      return 0;
    }
    return xd;
  }

  function clamp(x, lo, hi) {
    return Math.min(Math.max(x, lo), hi);
  }

  function updateCamera() {
    var center = cameraState.center;
    var eye = cameraState.eye;
    var up = cameraState.up;

    cameraState.theta += dtheta;
    cameraState.phi = clamp(cameraState.phi + dphi, -Math.PI / 2.0, Math.PI / 2.0);
    cameraState.distance = clamp(cameraState.distance + ddistance, minDistance, maxDistance);

    dtheta = damp(dtheta);
    dphi = damp(dphi);
    ddistance = damp(ddistance);

    var theta = cameraState.theta;
    var phi = cameraState.phi;
    var r = Math.exp(cameraState.distance);

    var vf = r * Math.sin(theta) * Math.cos(phi);
    var vr = r * Math.cos(theta) * Math.cos(phi);
    var vu = r * Math.sin(phi);

    for (var i = 0; i < 3; ++i) {
      eye[i] = center[i] + vf * front[i] + vr * right[i] + vu * up[i];
    }

    lookAt(cameraState.view, eye, center, up);
  }

  var injectContext = regl({
    context: Object.assign({}, cameraState, {
      projection: function ({ viewportWidth, viewportHeight }) {
        return perspective(cameraState.projection, Math.PI / 4.0, viewportWidth / viewportHeight, 0.01, 1000.0);
      }
    }),
    uniforms: Object.keys(cameraState).reduce(function (uniforms, name) {
      uniforms[name] = regl.context(name);
      return uniforms;
    }, {})
  });

  function setupCamera(block) {
    updateCamera();
    injectContext(block);
  }

  Object.keys(cameraState).forEach(function (name) {
    setupCamera[name] = cameraState[name];
  });

  return setupCamera;
}

},{"gl-mat4/identity":35,"gl-mat4/lookAt":36,"gl-mat4/perspective":37,"mouse-change":38,"mouse-wheel":40}],3:[function(require,module,exports){
var GL_FLOAT = 5126;

function AttributeRecord() {
  this.state = 0;

  this.x = 0.0;
  this.y = 0.0;
  this.z = 0.0;
  this.w = 0.0;

  this.buffer = null;
  this.size = 0;
  this.normalized = false;
  this.type = GL_FLOAT;
  this.offset = 0;
  this.stride = 0;
  this.divisor = 0;
}

module.exports = function wrapAttributeState(gl, extensions, limits, bufferState, stringStore) {
  var NUM_ATTRIBUTES = limits.maxAttributes;
  var attributeBindings = new Array(NUM_ATTRIBUTES);
  for (var i = 0; i < NUM_ATTRIBUTES; ++i) {
    attributeBindings[i] = new AttributeRecord();
  }

  return {
    Record: AttributeRecord,
    scope: {},
    state: attributeBindings
  };
};

},{}],4:[function(require,module,exports){

var isTypedArray = require('./util/is-typed-array');
var isNDArrayLike = require('./util/is-ndarray');
var values = require('./util/values');
var pool = require('./util/pool');
var flattenUtil = require('./util/flatten');

var arrayFlatten = flattenUtil.flatten;
var arrayShape = flattenUtil.shape;

var arrayTypes = require('./constants/arraytypes.json');
var bufferTypes = require('./constants/dtypes.json');
var usageTypes = require('./constants/usage.json');

var GL_STATIC_DRAW = 0x88E4;
var GL_STREAM_DRAW = 0x88E0;

var GL_UNSIGNED_BYTE = 5121;
var GL_FLOAT = 5126;

var DTYPES_SIZES = [];
DTYPES_SIZES[5120] = 1; // int8
DTYPES_SIZES[5122] = 2; // int16
DTYPES_SIZES[5124] = 4; // int32
DTYPES_SIZES[5121] = 1; // uint8
DTYPES_SIZES[5123] = 2; // uint16
DTYPES_SIZES[5125] = 4; // uint32
DTYPES_SIZES[5126] = 4; // float32

function typedArrayCode(data) {
  return arrayTypes[Object.prototype.toString.call(data)] | 0;
}

function copyArray(out, inp) {
  for (var i = 0; i < inp.length; ++i) {
    out[i] = inp[i];
  }
}

function transpose(result, data, shapeX, shapeY, strideX, strideY, offset) {
  var ptr = 0;
  for (var i = 0; i < shapeX; ++i) {
    for (var j = 0; j < shapeY; ++j) {
      result[ptr++] = data[strideX * i + strideY * j + offset];
    }
  }
}

module.exports = function wrapBufferState(gl, stats, config) {
  var bufferCount = 0;
  var bufferSet = {};

  function REGLBuffer(type) {
    this.id = bufferCount++;
    this.buffer = gl.createBuffer();
    this.type = type;
    this.usage = GL_STATIC_DRAW;
    this.byteLength = 0;
    this.dimension = 1;
    this.dtype = GL_UNSIGNED_BYTE;

    this.persistentData = null;

    if (config.profile) {
      this.stats = { size: 0 };
    }
  }

  REGLBuffer.prototype.bind = function () {
    gl.bindBuffer(this.type, this.buffer);
  };

  REGLBuffer.prototype.destroy = function () {
    destroy(this);
  };

  var streamPool = [];

  function createStream(type, data) {
    var buffer = streamPool.pop();
    if (!buffer) {
      buffer = new REGLBuffer(type);
    }
    buffer.bind();
    initBufferFromData(buffer, data, GL_STREAM_DRAW, 0, 1, false);
    return buffer;
  }

  function destroyStream(stream) {
    streamPool.push(stream);
  }

  function initBufferFromTypedArray(buffer, data, usage) {
    buffer.byteLength = data.byteLength;
    gl.bufferData(buffer.type, data, usage);
  }

  function initBufferFromData(buffer, data, usage, dtype, dimension, persist) {
    var shape;
    buffer.usage = usage;
    if (Array.isArray(data)) {
      buffer.dtype = dtype || GL_FLOAT;
      if (data.length > 0) {
        var flatData;
        if (Array.isArray(data[0])) {
          shape = arrayShape(data);
          var dim = 1;
          for (var i = 1; i < shape.length; ++i) {
            dim *= shape[i];
          }
          buffer.dimension = dim;
          flatData = arrayFlatten(data, shape, buffer.dtype);
          initBufferFromTypedArray(buffer, flatData, usage);
          if (persist) {
            buffer.persistentData = flatData;
          } else {
            pool.freeType(flatData);
          }
        } else if (typeof data[0] === 'number') {
          buffer.dimension = dimension;
          var typedData = pool.allocType(buffer.dtype, data.length);
          copyArray(typedData, data);
          initBufferFromTypedArray(buffer, typedData, usage);
          if (persist) {
            buffer.persistentData = typedData;
          } else {
            pool.freeType(typedData);
          }
        } else if (isTypedArray(data[0])) {
          buffer.dimension = data[0].length;
          buffer.dtype = dtype || typedArrayCode(data[0]) || GL_FLOAT;
          flatData = arrayFlatten(data, [data.length, data[0].length], buffer.dtype);
          initBufferFromTypedArray(buffer, flatData, usage);
          if (persist) {
            buffer.persistentData = flatData;
          } else {
            pool.freeType(flatData);
          }
        } else {}
      }
    } else if (isTypedArray(data)) {
      buffer.dtype = dtype || typedArrayCode(data);
      buffer.dimension = dimension;
      initBufferFromTypedArray(buffer, data, usage);
      if (persist) {
        buffer.persistentData = new Uint8Array(new Uint8Array(data.buffer));
      }
    } else if (isNDArrayLike(data)) {
      shape = data.shape;
      var stride = data.stride;
      var offset = data.offset;

      var shapeX = 0;
      var shapeY = 0;
      var strideX = 0;
      var strideY = 0;
      if (shape.length === 1) {
        shapeX = shape[0];
        shapeY = 1;
        strideX = stride[0];
        strideY = 0;
      } else if (shape.length === 2) {
        shapeX = shape[0];
        shapeY = shape[1];
        strideX = stride[0];
        strideY = stride[1];
      } else {}

      buffer.dtype = dtype || typedArrayCode(data.data) || GL_FLOAT;
      buffer.dimension = shapeY;

      var transposeData = pool.allocType(buffer.dtype, shapeX * shapeY);
      transpose(transposeData, data.data, shapeX, shapeY, strideX, strideY, offset);
      initBufferFromTypedArray(buffer, transposeData, usage);
      if (persist) {
        buffer.persistentData = transposeData;
      } else {
        pool.freeType(transposeData);
      }
    } else {}
  }

  function destroy(buffer) {
    stats.bufferCount--;

    var handle = buffer.buffer;

    gl.deleteBuffer(handle);
    buffer.buffer = null;
    delete bufferSet[buffer.id];
  }

  function createBuffer(options, type, deferInit, persistent) {
    stats.bufferCount++;

    var buffer = new REGLBuffer(type);
    bufferSet[buffer.id] = buffer;

    function reglBuffer(options) {
      var usage = GL_STATIC_DRAW;
      var data = null;
      var byteLength = 0;
      var dtype = 0;
      var dimension = 1;
      if (Array.isArray(options) || isTypedArray(options) || isNDArrayLike(options)) {
        data = options;
      } else if (typeof options === 'number') {
        byteLength = options | 0;
      } else if (options) {

        if ('data' in options) {

          data = options.data;
        }

        if ('usage' in options) {

          usage = usageTypes[options.usage];
        }

        if ('type' in options) {

          dtype = bufferTypes[options.type];
        }

        if ('dimension' in options) {

          dimension = options.dimension | 0;
        }

        if ('length' in options) {

          byteLength = options.length | 0;
        }
      }

      buffer.bind();
      if (!data) {
        gl.bufferData(buffer.type, byteLength, usage);
        buffer.dtype = dtype || GL_UNSIGNED_BYTE;
        buffer.usage = usage;
        buffer.dimension = dimension;
        buffer.byteLength = byteLength;
      } else {
        initBufferFromData(buffer, data, usage, dtype, dimension, persistent);
      }

      if (config.profile) {
        buffer.stats.size = buffer.byteLength * DTYPES_SIZES[buffer.dtype];
      }

      return reglBuffer;
    }

    function setSubData(data, offset) {

      gl.bufferSubData(buffer.type, offset, data);
    }

    function subdata(data, offset_) {
      var offset = (offset_ || 0) | 0;
      var shape;
      buffer.bind();
      if (Array.isArray(data)) {
        if (data.length > 0) {
          if (typeof data[0] === 'number') {
            var converted = pool.allocType(buffer.dtype, data.length);
            copyArray(converted, data);
            setSubData(converted, offset);
            pool.freeType(converted);
          } else if (Array.isArray(data[0]) || isTypedArray(data[0])) {
            shape = arrayShape(data);
            var flatData = arrayFlatten(data, shape, buffer.dtype);
            setSubData(flatData, offset);
            pool.freeType(flatData);
          } else {}
        }
      } else if (isTypedArray(data)) {
        setSubData(data, offset);
      } else if (isNDArrayLike(data)) {
        shape = data.shape;
        var stride = data.stride;

        var shapeX = 0;
        var shapeY = 0;
        var strideX = 0;
        var strideY = 0;
        if (shape.length === 1) {
          shapeX = shape[0];
          shapeY = 1;
          strideX = stride[0];
          strideY = 0;
        } else if (shape.length === 2) {
          shapeX = shape[0];
          shapeY = shape[1];
          strideX = stride[0];
          strideY = stride[1];
        } else {}
        var dtype = Array.isArray(data.data) ? buffer.dtype : typedArrayCode(data.data);

        var transposeData = pool.allocType(dtype, shapeX * shapeY);
        transpose(transposeData, data.data, shapeX, shapeY, strideX, strideY, data.offset);
        setSubData(transposeData, offset);
        pool.freeType(transposeData);
      } else {}
      return reglBuffer;
    }

    if (!deferInit) {
      reglBuffer(options);
    }

    reglBuffer._reglType = 'buffer';
    reglBuffer._buffer = buffer;
    reglBuffer.subdata = subdata;
    if (config.profile) {
      reglBuffer.stats = buffer.stats;
    }
    reglBuffer.destroy = function () {
      destroy(buffer);
    };

    return reglBuffer;
  }

  function restoreBuffers() {
    values(bufferSet).forEach(function (buffer) {
      buffer.buffer = gl.createBuffer();
      gl.bindBuffer(buffer.type, buffer.buffer);
      gl.bufferData(buffer.type, buffer.persistentData || buffer.byteLength, buffer.usage);
    });
  }

  if (config.profile) {
    stats.getTotalBufferSize = function () {
      var total = 0;
      // TODO: Right now, the streams are not part of the total count.
      Object.keys(bufferSet).forEach(function (key) {
        total += bufferSet[key].stats.size;
      });
      return total;
    };
  }

  return {
    create: createBuffer,

    createStream: createStream,
    destroyStream: destroyStream,

    clear: function () {
      values(bufferSet).forEach(destroy);
      streamPool.forEach(destroy);
    },

    getBuffer: function (wrapper) {
      if (wrapper && wrapper._buffer instanceof REGLBuffer) {
        return wrapper._buffer;
      }
      return null;
    },

    restore: restoreBuffers,

    _initBuffer: initBufferFromData
  };
};

},{"./constants/arraytypes.json":5,"./constants/dtypes.json":6,"./constants/usage.json":8,"./util/flatten":25,"./util/is-ndarray":27,"./util/is-typed-array":28,"./util/pool":30,"./util/values":33}],5:[function(require,module,exports){
module.exports={
  "[object Int8Array]": 5120
, "[object Int16Array]": 5122
, "[object Int32Array]": 5124
, "[object Uint8Array]": 5121
, "[object Uint8ClampedArray]": 5121
, "[object Uint16Array]": 5123
, "[object Uint32Array]": 5125
, "[object Float32Array]": 5126
, "[object Float64Array]": 5121
, "[object ArrayBuffer]": 5121
}

},{}],6:[function(require,module,exports){
module.exports={
  "int8": 5120
, "int16": 5122
, "int32": 5124
, "uint8": 5121
, "uint16": 5123
, "uint32": 5125
, "float": 5126
, "float32": 5126
}

},{}],7:[function(require,module,exports){
module.exports={
  "points": 0,
  "point": 0,
  "lines": 1,
  "line": 1,
  "line loop": 2,
  "line strip": 3,
  "triangles": 4,
  "triangle": 4,
  "triangle strip": 5,
  "triangle fan": 6
}

},{}],8:[function(require,module,exports){
module.exports={
  "static": 35044,
  "dynamic": 35048,
  "stream": 35040
}

},{}],9:[function(require,module,exports){

var createEnvironment = require('./util/codegen');
var loop = require('./util/loop');
var isTypedArray = require('./util/is-typed-array');
var isNDArray = require('./util/is-ndarray');
var isArrayLike = require('./util/is-array-like');
var dynamic = require('./dynamic');

var primTypes = require('./constants/primitives.json');
var glTypes = require('./constants/dtypes.json');

// "cute" names for vector components
var CUTE_COMPONENTS = 'xyzw'.split('');

var GL_UNSIGNED_BYTE = 5121;

var ATTRIB_STATE_POINTER = 1;
var ATTRIB_STATE_CONSTANT = 2;

var DYN_FUNC = 0;
var DYN_PROP = 1;
var DYN_CONTEXT = 2;
var DYN_STATE = 3;
var DYN_THUNK = 4;

var S_DITHER = 'dither';
var S_BLEND_ENABLE = 'blend.enable';
var S_BLEND_COLOR = 'blend.color';
var S_BLEND_EQUATION = 'blend.equation';
var S_BLEND_FUNC = 'blend.func';
var S_DEPTH_ENABLE = 'depth.enable';
var S_DEPTH_FUNC = 'depth.func';
var S_DEPTH_RANGE = 'depth.range';
var S_DEPTH_MASK = 'depth.mask';
var S_COLOR_MASK = 'colorMask';
var S_CULL_ENABLE = 'cull.enable';
var S_CULL_FACE = 'cull.face';
var S_FRONT_FACE = 'frontFace';
var S_LINE_WIDTH = 'lineWidth';
var S_POLYGON_OFFSET_ENABLE = 'polygonOffset.enable';
var S_POLYGON_OFFSET_OFFSET = 'polygonOffset.offset';
var S_SAMPLE_ALPHA = 'sample.alpha';
var S_SAMPLE_ENABLE = 'sample.enable';
var S_SAMPLE_COVERAGE = 'sample.coverage';
var S_STENCIL_ENABLE = 'stencil.enable';
var S_STENCIL_MASK = 'stencil.mask';
var S_STENCIL_FUNC = 'stencil.func';
var S_STENCIL_OPFRONT = 'stencil.opFront';
var S_STENCIL_OPBACK = 'stencil.opBack';
var S_SCISSOR_ENABLE = 'scissor.enable';
var S_SCISSOR_BOX = 'scissor.box';
var S_VIEWPORT = 'viewport';

var S_PROFILE = 'profile';

var S_FRAMEBUFFER = 'framebuffer';
var S_VERT = 'vert';
var S_FRAG = 'frag';
var S_ELEMENTS = 'elements';
var S_PRIMITIVE = 'primitive';
var S_COUNT = 'count';
var S_OFFSET = 'offset';
var S_INSTANCES = 'instances';

var SUFFIX_WIDTH = 'Width';
var SUFFIX_HEIGHT = 'Height';

var S_FRAMEBUFFER_WIDTH = S_FRAMEBUFFER + SUFFIX_WIDTH;
var S_FRAMEBUFFER_HEIGHT = S_FRAMEBUFFER + SUFFIX_HEIGHT;
var S_VIEWPORT_WIDTH = S_VIEWPORT + SUFFIX_WIDTH;
var S_VIEWPORT_HEIGHT = S_VIEWPORT + SUFFIX_HEIGHT;
var S_DRAWINGBUFFER = 'drawingBuffer';
var S_DRAWINGBUFFER_WIDTH = S_DRAWINGBUFFER + SUFFIX_WIDTH;
var S_DRAWINGBUFFER_HEIGHT = S_DRAWINGBUFFER + SUFFIX_HEIGHT;

var NESTED_OPTIONS = [S_BLEND_FUNC, S_BLEND_EQUATION, S_STENCIL_FUNC, S_STENCIL_OPFRONT, S_STENCIL_OPBACK, S_SAMPLE_COVERAGE, S_VIEWPORT, S_SCISSOR_BOX, S_POLYGON_OFFSET_OFFSET];

var GL_ARRAY_BUFFER = 34962;
var GL_ELEMENT_ARRAY_BUFFER = 34963;

var GL_FRAGMENT_SHADER = 35632;
var GL_VERTEX_SHADER = 35633;

var GL_TEXTURE_2D = 0x0DE1;
var GL_TEXTURE_CUBE_MAP = 0x8513;

var GL_CULL_FACE = 0x0B44;
var GL_BLEND = 0x0BE2;
var GL_DITHER = 0x0BD0;
var GL_STENCIL_TEST = 0x0B90;
var GL_DEPTH_TEST = 0x0B71;
var GL_SCISSOR_TEST = 0x0C11;
var GL_POLYGON_OFFSET_FILL = 0x8037;
var GL_SAMPLE_ALPHA_TO_COVERAGE = 0x809E;
var GL_SAMPLE_COVERAGE = 0x80A0;

var GL_FLOAT = 5126;
var GL_FLOAT_VEC2 = 35664;
var GL_FLOAT_VEC3 = 35665;
var GL_FLOAT_VEC4 = 35666;
var GL_INT = 5124;
var GL_INT_VEC2 = 35667;
var GL_INT_VEC3 = 35668;
var GL_INT_VEC4 = 35669;
var GL_BOOL = 35670;
var GL_BOOL_VEC2 = 35671;
var GL_BOOL_VEC3 = 35672;
var GL_BOOL_VEC4 = 35673;
var GL_FLOAT_MAT2 = 35674;
var GL_FLOAT_MAT3 = 35675;
var GL_FLOAT_MAT4 = 35676;
var GL_SAMPLER_2D = 35678;
var GL_SAMPLER_CUBE = 35680;

var GL_TRIANGLES = 4;

var GL_FRONT = 1028;
var GL_BACK = 1029;
var GL_CW = 0x0900;
var GL_CCW = 0x0901;
var GL_MIN_EXT = 0x8007;
var GL_MAX_EXT = 0x8008;
var GL_ALWAYS = 519;
var GL_KEEP = 7680;
var GL_ZERO = 0;
var GL_ONE = 1;
var GL_FUNC_ADD = 0x8006;
var GL_LESS = 513;

var GL_FRAMEBUFFER = 0x8D40;
var GL_COLOR_ATTACHMENT0 = 0x8CE0;

var blendFuncs = {
  '0': 0,
  '1': 1,
  'zero': 0,
  'one': 1,
  'src color': 768,
  'one minus src color': 769,
  'src alpha': 770,
  'one minus src alpha': 771,
  'dst color': 774,
  'one minus dst color': 775,
  'dst alpha': 772,
  'one minus dst alpha': 773,
  'constant color': 32769,
  'one minus constant color': 32770,
  'constant alpha': 32771,
  'one minus constant alpha': 32772,
  'src alpha saturate': 776
};

// There are invalid values for srcRGB and dstRGB. See:
// https://www.khronos.org/registry/webgl/specs/1.0/#6.13
// https://github.com/KhronosGroup/WebGL/blob/0d3201f5f7ec3c0060bc1f04077461541f1987b9/conformance-suites/1.0.3/conformance/misc/webgl-specific.html#L56
var invalidBlendCombinations = ['constant color, constant alpha', 'one minus constant color, constant alpha', 'constant color, one minus constant alpha', 'one minus constant color, one minus constant alpha', 'constant alpha, constant color', 'constant alpha, one minus constant color', 'one minus constant alpha, constant color', 'one minus constant alpha, one minus constant color'];

var compareFuncs = {
  'never': 512,
  'less': 513,
  '<': 513,
  'equal': 514,
  '=': 514,
  '==': 514,
  '===': 514,
  'lequal': 515,
  '<=': 515,
  'greater': 516,
  '>': 516,
  'notequal': 517,
  '!=': 517,
  '!==': 517,
  'gequal': 518,
  '>=': 518,
  'always': 519
};

var stencilOps = {
  '0': 0,
  'zero': 0,
  'keep': 7680,
  'replace': 7681,
  'increment': 7682,
  'decrement': 7683,
  'increment wrap': 34055,
  'decrement wrap': 34056,
  'invert': 5386
};

var shaderType = {
  'frag': GL_FRAGMENT_SHADER,
  'vert': GL_VERTEX_SHADER
};

var orientationType = {
  'cw': GL_CW,
  'ccw': GL_CCW
};

function isBufferArgs(x) {
  return Array.isArray(x) || isTypedArray(x) || isNDArray(x);
}

// Make sure viewport is processed first
function sortState(state) {
  return state.sort(function (a, b) {
    if (a === S_VIEWPORT) {
      return -1;
    } else if (b === S_VIEWPORT) {
      return 1;
    }
    return a < b ? -1 : 1;
  });
}

function Declaration(thisDep, contextDep, propDep, append) {
  this.thisDep = thisDep;
  this.contextDep = contextDep;
  this.propDep = propDep;
  this.append = append;
}

function isStatic(decl) {
  return decl && !(decl.thisDep || decl.contextDep || decl.propDep);
}

function createStaticDecl(append) {
  return new Declaration(false, false, false, append);
}

function createDynamicDecl(dyn, append) {
  var type = dyn.type;
  if (type === DYN_FUNC) {
    var numArgs = dyn.data.length;
    return new Declaration(true, numArgs >= 1, numArgs >= 2, append);
  } else if (type === DYN_THUNK) {
    var data = dyn.data;
    return new Declaration(data.thisDep, data.contextDep, data.propDep, append);
  } else {
    return new Declaration(type === DYN_STATE, type === DYN_CONTEXT, type === DYN_PROP, append);
  }
}

var SCOPE_DECL = new Declaration(false, false, false, function () {});

module.exports = function reglCore(gl, stringStore, extensions, limits, bufferState, elementState, textureState, framebufferState, uniformState, attributeState, shaderState, drawState, contextState, timer, config) {
  var AttributeRecord = attributeState.Record;

  var blendEquations = {
    'add': 32774,
    'subtract': 32778,
    'reverse subtract': 32779
  };
  if (extensions.ext_blend_minmax) {
    blendEquations.min = GL_MIN_EXT;
    blendEquations.max = GL_MAX_EXT;
  }

  var extInstancing = extensions.angle_instanced_arrays;
  var extDrawBuffers = extensions.webgl_draw_buffers;

  // ===================================================
  // ===================================================
  // WEBGL STATE
  // ===================================================
  // ===================================================
  var currentState = {
    dirty: true,
    profile: config.profile
  };
  var nextState = {};
  var GL_STATE_NAMES = [];
  var GL_FLAGS = {};
  var GL_VARIABLES = {};

  function propName(name) {
    return name.replace('.', '_');
  }

  function stateFlag(sname, cap, init) {
    var name = propName(sname);
    GL_STATE_NAMES.push(sname);
    nextState[name] = currentState[name] = !!init;
    GL_FLAGS[name] = cap;
  }

  function stateVariable(sname, func, init) {
    var name = propName(sname);
    GL_STATE_NAMES.push(sname);
    if (Array.isArray(init)) {
      currentState[name] = init.slice();
      nextState[name] = init.slice();
    } else {
      currentState[name] = nextState[name] = init;
    }
    GL_VARIABLES[name] = func;
  }

  // Dithering
  stateFlag(S_DITHER, GL_DITHER);

  // Blending
  stateFlag(S_BLEND_ENABLE, GL_BLEND);
  stateVariable(S_BLEND_COLOR, 'blendColor', [0, 0, 0, 0]);
  stateVariable(S_BLEND_EQUATION, 'blendEquationSeparate', [GL_FUNC_ADD, GL_FUNC_ADD]);
  stateVariable(S_BLEND_FUNC, 'blendFuncSeparate', [GL_ONE, GL_ZERO, GL_ONE, GL_ZERO]);

  // Depth
  stateFlag(S_DEPTH_ENABLE, GL_DEPTH_TEST, true);
  stateVariable(S_DEPTH_FUNC, 'depthFunc', GL_LESS);
  stateVariable(S_DEPTH_RANGE, 'depthRange', [0, 1]);
  stateVariable(S_DEPTH_MASK, 'depthMask', true);

  // Color mask
  stateVariable(S_COLOR_MASK, S_COLOR_MASK, [true, true, true, true]);

  // Face culling
  stateFlag(S_CULL_ENABLE, GL_CULL_FACE);
  stateVariable(S_CULL_FACE, 'cullFace', GL_BACK);

  // Front face orientation
  stateVariable(S_FRONT_FACE, S_FRONT_FACE, GL_CCW);

  // Line width
  stateVariable(S_LINE_WIDTH, S_LINE_WIDTH, 1);

  // Polygon offset
  stateFlag(S_POLYGON_OFFSET_ENABLE, GL_POLYGON_OFFSET_FILL);
  stateVariable(S_POLYGON_OFFSET_OFFSET, 'polygonOffset', [0, 0]);

  // Sample coverage
  stateFlag(S_SAMPLE_ALPHA, GL_SAMPLE_ALPHA_TO_COVERAGE);
  stateFlag(S_SAMPLE_ENABLE, GL_SAMPLE_COVERAGE);
  stateVariable(S_SAMPLE_COVERAGE, 'sampleCoverage', [1, false]);

  // Stencil
  stateFlag(S_STENCIL_ENABLE, GL_STENCIL_TEST);
  stateVariable(S_STENCIL_MASK, 'stencilMask', -1);
  stateVariable(S_STENCIL_FUNC, 'stencilFunc', [GL_ALWAYS, 0, -1]);
  stateVariable(S_STENCIL_OPFRONT, 'stencilOpSeparate', [GL_FRONT, GL_KEEP, GL_KEEP, GL_KEEP]);
  stateVariable(S_STENCIL_OPBACK, 'stencilOpSeparate', [GL_BACK, GL_KEEP, GL_KEEP, GL_KEEP]);

  // Scissor
  stateFlag(S_SCISSOR_ENABLE, GL_SCISSOR_TEST);
  stateVariable(S_SCISSOR_BOX, 'scissor', [0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight]);

  // Viewport
  stateVariable(S_VIEWPORT, S_VIEWPORT, [0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight]);

  // ===================================================
  // ===================================================
  // ENVIRONMENT
  // ===================================================
  // ===================================================
  var sharedState = {
    gl: gl,
    context: contextState,
    strings: stringStore,
    next: nextState,
    current: currentState,
    draw: drawState,
    elements: elementState,
    buffer: bufferState,
    shader: shaderState,
    attributes: attributeState.state,
    uniforms: uniformState,
    framebuffer: framebufferState,
    extensions: extensions,

    timer: timer,
    isBufferArgs: isBufferArgs
  };

  var sharedConstants = {
    primTypes: primTypes,
    compareFuncs: compareFuncs,
    blendFuncs: blendFuncs,
    blendEquations: blendEquations,
    stencilOps: stencilOps,
    glTypes: glTypes,
    orientationType: orientationType
  };

  if (extDrawBuffers) {
    sharedConstants.backBuffer = [GL_BACK];
    sharedConstants.drawBuffer = loop(limits.maxDrawbuffers, function (i) {
      if (i === 0) {
        return [0];
      }
      return loop(i, function (j) {
        return GL_COLOR_ATTACHMENT0 + j;
      });
    });
  }

  var drawCallCounter = 0;
  function createREGLEnvironment() {
    var env = createEnvironment();
    var link = env.link;
    var global = env.global;
    env.id = drawCallCounter++;

    env.batchId = '0';

    // link shared state
    var SHARED = link(sharedState);
    var shared = env.shared = {
      props: 'a0'
    };
    Object.keys(sharedState).forEach(function (prop) {
      shared[prop] = global.def(SHARED, '.', prop);
    });

    // Inject runtime assertion stuff for debug builds


    // Copy GL state variables over
    var nextVars = env.next = {};
    var currentVars = env.current = {};
    Object.keys(GL_VARIABLES).forEach(function (variable) {
      if (Array.isArray(currentState[variable])) {
        nextVars[variable] = global.def(shared.next, '.', variable);
        currentVars[variable] = global.def(shared.current, '.', variable);
      }
    });

    // Initialize shared constants
    var constants = env.constants = {};
    Object.keys(sharedConstants).forEach(function (name) {
      constants[name] = global.def(JSON.stringify(sharedConstants[name]));
    });

    // Helper function for calling a block
    env.invoke = function (block, x) {
      switch (x.type) {
        case DYN_FUNC:
          var argList = ['this', shared.context, shared.props, env.batchId];
          return block.def(link(x.data), '.call(', argList.slice(0, Math.max(x.data.length + 1, 4)), ')');
        case DYN_PROP:
          return block.def(shared.props, x.data);
        case DYN_CONTEXT:
          return block.def(shared.context, x.data);
        case DYN_STATE:
          return block.def('this', x.data);
        case DYN_THUNK:
          x.data.append(env, block);
          return x.data.ref;
      }
    };

    env.attribCache = {};

    var scopeAttribs = {};
    env.scopeAttrib = function (name) {
      var id = stringStore.id(name);
      if (id in scopeAttribs) {
        return scopeAttribs[id];
      }
      var binding = attributeState.scope[id];
      if (!binding) {
        binding = attributeState.scope[id] = new AttributeRecord();
      }
      var result = scopeAttribs[id] = link(binding);
      return result;
    };

    return env;
  }

  // ===================================================
  // ===================================================
  // PARSING
  // ===================================================
  // ===================================================
  function parseProfile(options) {
    var staticOptions = options.static;
    var dynamicOptions = options.dynamic;

    var profileEnable;
    if (S_PROFILE in staticOptions) {
      var value = !!staticOptions[S_PROFILE];
      profileEnable = createStaticDecl(function (env, scope) {
        return value;
      });
      profileEnable.enable = value;
    } else if (S_PROFILE in dynamicOptions) {
      var dyn = dynamicOptions[S_PROFILE];
      profileEnable = createDynamicDecl(dyn, function (env, scope) {
        return env.invoke(scope, dyn);
      });
    }

    return profileEnable;
  }

  function parseFramebuffer(options, env) {
    var staticOptions = options.static;
    var dynamicOptions = options.dynamic;

    if (S_FRAMEBUFFER in staticOptions) {
      var framebuffer = staticOptions[S_FRAMEBUFFER];
      if (framebuffer) {
        framebuffer = framebufferState.getFramebuffer(framebuffer);

        return createStaticDecl(function (env, block) {
          var FRAMEBUFFER = env.link(framebuffer);
          var shared = env.shared;
          block.set(shared.framebuffer, '.next', FRAMEBUFFER);
          var CONTEXT = shared.context;
          block.set(CONTEXT, '.' + S_FRAMEBUFFER_WIDTH, FRAMEBUFFER + '.width');
          block.set(CONTEXT, '.' + S_FRAMEBUFFER_HEIGHT, FRAMEBUFFER + '.height');
          return FRAMEBUFFER;
        });
      } else {
        return createStaticDecl(function (env, scope) {
          var shared = env.shared;
          scope.set(shared.framebuffer, '.next', 'null');
          var CONTEXT = shared.context;
          scope.set(CONTEXT, '.' + S_FRAMEBUFFER_WIDTH, CONTEXT + '.' + S_DRAWINGBUFFER_WIDTH);
          scope.set(CONTEXT, '.' + S_FRAMEBUFFER_HEIGHT, CONTEXT + '.' + S_DRAWINGBUFFER_HEIGHT);
          return 'null';
        });
      }
    } else if (S_FRAMEBUFFER in dynamicOptions) {
      var dyn = dynamicOptions[S_FRAMEBUFFER];
      return createDynamicDecl(dyn, function (env, scope) {
        var FRAMEBUFFER_FUNC = env.invoke(scope, dyn);
        var shared = env.shared;
        var FRAMEBUFFER_STATE = shared.framebuffer;
        var FRAMEBUFFER = scope.def(FRAMEBUFFER_STATE, '.getFramebuffer(', FRAMEBUFFER_FUNC, ')');

        scope.set(FRAMEBUFFER_STATE, '.next', FRAMEBUFFER);
        var CONTEXT = shared.context;
        scope.set(CONTEXT, '.' + S_FRAMEBUFFER_WIDTH, FRAMEBUFFER + '?' + FRAMEBUFFER + '.width:' + CONTEXT + '.' + S_DRAWINGBUFFER_WIDTH);
        scope.set(CONTEXT, '.' + S_FRAMEBUFFER_HEIGHT, FRAMEBUFFER + '?' + FRAMEBUFFER + '.height:' + CONTEXT + '.' + S_DRAWINGBUFFER_HEIGHT);
        return FRAMEBUFFER;
      });
    } else {
      return null;
    }
  }

  function parseViewportScissor(options, framebuffer, env) {
    var staticOptions = options.static;
    var dynamicOptions = options.dynamic;

    function parseBox(param) {
      if (param in staticOptions) {
        var box = staticOptions[param];

        var isStatic = true;
        var x = box.x | 0;
        var y = box.y | 0;
        var w, h;
        if ('width' in box) {
          w = box.width | 0;
        } else {
          isStatic = false;
        }
        if ('height' in box) {
          h = box.height | 0;
        } else {
          isStatic = false;
        }

        return new Declaration(!isStatic && framebuffer && framebuffer.thisDep, !isStatic && framebuffer && framebuffer.contextDep, !isStatic && framebuffer && framebuffer.propDep, function (env, scope) {
          var CONTEXT = env.shared.context;
          var BOX_W = w;
          if (!('width' in box)) {
            BOX_W = scope.def(CONTEXT, '.', S_FRAMEBUFFER_WIDTH, '-', x);
          }
          var BOX_H = h;
          if (!('height' in box)) {
            BOX_H = scope.def(CONTEXT, '.', S_FRAMEBUFFER_HEIGHT, '-', y);
          }
          return [x, y, BOX_W, BOX_H];
        });
      } else if (param in dynamicOptions) {
        var dynBox = dynamicOptions[param];
        var result = createDynamicDecl(dynBox, function (env, scope) {
          var BOX = env.invoke(scope, dynBox);

          var CONTEXT = env.shared.context;
          var BOX_X = scope.def(BOX, '.x|0');
          var BOX_Y = scope.def(BOX, '.y|0');
          var BOX_W = scope.def('"width" in ', BOX, '?', BOX, '.width|0:', '(', CONTEXT, '.', S_FRAMEBUFFER_WIDTH, '-', BOX_X, ')');
          var BOX_H = scope.def('"height" in ', BOX, '?', BOX, '.height|0:', '(', CONTEXT, '.', S_FRAMEBUFFER_HEIGHT, '-', BOX_Y, ')');

          return [BOX_X, BOX_Y, BOX_W, BOX_H];
        });
        if (framebuffer) {
          result.thisDep = result.thisDep || framebuffer.thisDep;
          result.contextDep = result.contextDep || framebuffer.contextDep;
          result.propDep = result.propDep || framebuffer.propDep;
        }
        return result;
      } else if (framebuffer) {
        return new Declaration(framebuffer.thisDep, framebuffer.contextDep, framebuffer.propDep, function (env, scope) {
          var CONTEXT = env.shared.context;
          return [0, 0, scope.def(CONTEXT, '.', S_FRAMEBUFFER_WIDTH), scope.def(CONTEXT, '.', S_FRAMEBUFFER_HEIGHT)];
        });
      } else {
        return null;
      }
    }

    var viewport = parseBox(S_VIEWPORT);

    if (viewport) {
      var prevViewport = viewport;
      viewport = new Declaration(viewport.thisDep, viewport.contextDep, viewport.propDep, function (env, scope) {
        var VIEWPORT = prevViewport.append(env, scope);
        var CONTEXT = env.shared.context;
        scope.set(CONTEXT, '.' + S_VIEWPORT_WIDTH, VIEWPORT[2]);
        scope.set(CONTEXT, '.' + S_VIEWPORT_HEIGHT, VIEWPORT[3]);
        return VIEWPORT;
      });
    }

    return {
      viewport: viewport,
      scissor_box: parseBox(S_SCISSOR_BOX)
    };
  }

  function parseProgram(options) {
    var staticOptions = options.static;
    var dynamicOptions = options.dynamic;

    function parseShader(name) {
      if (name in staticOptions) {
        var id = stringStore.id(staticOptions[name]);

        var result = createStaticDecl(function () {
          return id;
        });
        result.id = id;
        return result;
      } else if (name in dynamicOptions) {
        var dyn = dynamicOptions[name];
        return createDynamicDecl(dyn, function (env, scope) {
          var str = env.invoke(scope, dyn);
          var id = scope.def(env.shared.strings, '.id(', str, ')');

          return id;
        });
      }
      return null;
    }

    var frag = parseShader(S_FRAG);
    var vert = parseShader(S_VERT);

    var program = null;
    var progVar;
    if (isStatic(frag) && isStatic(vert)) {
      program = shaderState.program(vert.id, frag.id);
      progVar = createStaticDecl(function (env, scope) {
        return env.link(program);
      });
    } else {
      progVar = new Declaration(frag && frag.thisDep || vert && vert.thisDep, frag && frag.contextDep || vert && vert.contextDep, frag && frag.propDep || vert && vert.propDep, function (env, scope) {
        var SHADER_STATE = env.shared.shader;
        var fragId;
        if (frag) {
          fragId = frag.append(env, scope);
        } else {
          fragId = scope.def(SHADER_STATE, '.', S_FRAG);
        }
        var vertId;
        if (vert) {
          vertId = vert.append(env, scope);
        } else {
          vertId = scope.def(SHADER_STATE, '.', S_VERT);
        }
        var progDef = SHADER_STATE + '.program(' + vertId + ',' + fragId;

        return scope.def(progDef + ')');
      });
    }

    return {
      frag: frag,
      vert: vert,
      progVar: progVar,
      program: program
    };
  }

  function parseDraw(options, env) {
    var staticOptions = options.static;
    var dynamicOptions = options.dynamic;

    function parseElements() {
      if (S_ELEMENTS in staticOptions) {
        var elements = staticOptions[S_ELEMENTS];
        if (isBufferArgs(elements)) {
          elements = elementState.getElements(elementState.create(elements, true));
        } else if (elements) {
          elements = elementState.getElements(elements);
        }
        var result = createStaticDecl(function (env, scope) {
          if (elements) {
            var result = env.link(elements);
            env.ELEMENTS = result;
            return result;
          }
          env.ELEMENTS = null;
          return null;
        });
        result.value = elements;
        return result;
      } else if (S_ELEMENTS in dynamicOptions) {
        var dyn = dynamicOptions[S_ELEMENTS];
        return createDynamicDecl(dyn, function (env, scope) {
          var shared = env.shared;

          var IS_BUFFER_ARGS = shared.isBufferArgs;
          var ELEMENT_STATE = shared.elements;

          var elementDefn = env.invoke(scope, dyn);
          var elements = scope.def('null');
          var elementStream = scope.def(IS_BUFFER_ARGS, '(', elementDefn, ')');

          var ifte = env.cond(elementStream).then(elements, '=', ELEMENT_STATE, '.createStream(', elementDefn, ');').else(elements, '=', ELEMENT_STATE, '.getElements(', elementDefn, ');');

          scope.entry(ifte);
          scope.exit(env.cond(elementStream).then(ELEMENT_STATE, '.destroyStream(', elements, ');'));

          env.ELEMENTS = elements;

          return elements;
        });
      }

      return null;
    }

    var elements = parseElements();

    function parsePrimitive() {
      if (S_PRIMITIVE in staticOptions) {
        var primitive = staticOptions[S_PRIMITIVE];

        return createStaticDecl(function (env, scope) {
          return primTypes[primitive];
        });
      } else if (S_PRIMITIVE in dynamicOptions) {
        var dynPrimitive = dynamicOptions[S_PRIMITIVE];
        return createDynamicDecl(dynPrimitive, function (env, scope) {
          var PRIM_TYPES = env.constants.primTypes;
          var prim = env.invoke(scope, dynPrimitive);

          return scope.def(PRIM_TYPES, '[', prim, ']');
        });
      } else if (elements) {
        if (isStatic(elements)) {
          if (elements.value) {
            return createStaticDecl(function (env, scope) {
              return scope.def(env.ELEMENTS, '.primType');
            });
          } else {
            return createStaticDecl(function () {
              return GL_TRIANGLES;
            });
          }
        } else {
          return new Declaration(elements.thisDep, elements.contextDep, elements.propDep, function (env, scope) {
            var elements = env.ELEMENTS;
            return scope.def(elements, '?', elements, '.primType:', GL_TRIANGLES);
          });
        }
      }
      return null;
    }

    function parseParam(param, isOffset) {
      if (param in staticOptions) {
        var value = staticOptions[param] | 0;

        return createStaticDecl(function (env, scope) {
          if (isOffset) {
            env.OFFSET = value;
          }
          return value;
        });
      } else if (param in dynamicOptions) {
        var dynValue = dynamicOptions[param];
        return createDynamicDecl(dynValue, function (env, scope) {
          var result = env.invoke(scope, dynValue);
          if (isOffset) {
            env.OFFSET = result;
          }
          return result;
        });
      } else if (isOffset && elements) {
        return createStaticDecl(function (env, scope) {
          env.OFFSET = '0';
          return 0;
        });
      }
      return null;
    }

    var OFFSET = parseParam(S_OFFSET, true);

    function parseVertCount() {
      if (S_COUNT in staticOptions) {
        var count = staticOptions[S_COUNT] | 0;

        return createStaticDecl(function () {
          return count;
        });
      } else if (S_COUNT in dynamicOptions) {
        var dynCount = dynamicOptions[S_COUNT];
        return createDynamicDecl(dynCount, function (env, scope) {
          var result = env.invoke(scope, dynCount);

          return result;
        });
      } else if (elements) {
        if (isStatic(elements)) {
          if (elements) {
            if (OFFSET) {
              return new Declaration(OFFSET.thisDep, OFFSET.contextDep, OFFSET.propDep, function (env, scope) {
                var result = scope.def(env.ELEMENTS, '.vertCount-', env.OFFSET);

                return result;
              });
            } else {
              return createStaticDecl(function (env, scope) {
                return scope.def(env.ELEMENTS, '.vertCount');
              });
            }
          } else {
            var result = createStaticDecl(function () {
              return -1;
            });

            return result;
          }
        } else {
          var variable = new Declaration(elements.thisDep || OFFSET.thisDep, elements.contextDep || OFFSET.contextDep, elements.propDep || OFFSET.propDep, function (env, scope) {
            var elements = env.ELEMENTS;
            if (env.OFFSET) {
              return scope.def(elements, '?', elements, '.vertCount-', env.OFFSET, ':-1');
            }
            return scope.def(elements, '?', elements, '.vertCount:-1');
          });

          return variable;
        }
      }
      return null;
    }

    return {
      elements: elements,
      primitive: parsePrimitive(),
      count: parseVertCount(),
      instances: parseParam(S_INSTANCES, false),
      offset: OFFSET
    };
  }

  function parseGLState(options, env) {
    var staticOptions = options.static;
    var dynamicOptions = options.dynamic;

    var STATE = {};

    GL_STATE_NAMES.forEach(function (prop) {
      var param = propName(prop);

      function parseParam(parseStatic, parseDynamic) {
        if (prop in staticOptions) {
          var value = parseStatic(staticOptions[prop]);
          STATE[param] = createStaticDecl(function () {
            return value;
          });
        } else if (prop in dynamicOptions) {
          var dyn = dynamicOptions[prop];
          STATE[param] = createDynamicDecl(dyn, function (env, scope) {
            return parseDynamic(env, scope, env.invoke(scope, dyn));
          });
        }
      }

      switch (prop) {
        case S_CULL_ENABLE:
        case S_BLEND_ENABLE:
        case S_DITHER:
        case S_STENCIL_ENABLE:
        case S_DEPTH_ENABLE:
        case S_SCISSOR_ENABLE:
        case S_POLYGON_OFFSET_ENABLE:
        case S_SAMPLE_ALPHA:
        case S_SAMPLE_ENABLE:
        case S_DEPTH_MASK:
          return parseParam(function (value) {

            return value;
          }, function (env, scope, value) {

            return value;
          });

        case S_DEPTH_FUNC:
          return parseParam(function (value) {

            return compareFuncs[value];
          }, function (env, scope, value) {
            var COMPARE_FUNCS = env.constants.compareFuncs;

            return scope.def(COMPARE_FUNCS, '[', value, ']');
          });

        case S_DEPTH_RANGE:
          return parseParam(function (value) {

            return value;
          }, function (env, scope, value) {

            var Z_NEAR = scope.def('+', value, '[0]');
            var Z_FAR = scope.def('+', value, '[1]');
            return [Z_NEAR, Z_FAR];
          });

        case S_BLEND_FUNC:
          return parseParam(function (value) {

            var srcRGB = 'srcRGB' in value ? value.srcRGB : value.src;
            var srcAlpha = 'srcAlpha' in value ? value.srcAlpha : value.src;
            var dstRGB = 'dstRGB' in value ? value.dstRGB : value.dst;
            var dstAlpha = 'dstAlpha' in value ? value.dstAlpha : value.dst;

            return [blendFuncs[srcRGB], blendFuncs[dstRGB], blendFuncs[srcAlpha], blendFuncs[dstAlpha]];
          }, function (env, scope, value) {
            var BLEND_FUNCS = env.constants.blendFuncs;

            function read(prefix, suffix) {
              var func = scope.def('"', prefix, suffix, '" in ', value, '?', value, '.', prefix, suffix, ':', value, '.', prefix);

              return func;
            }

            var srcRGB = read('src', 'RGB');
            var dstRGB = read('dst', 'RGB');

            var SRC_RGB = scope.def(BLEND_FUNCS, '[', srcRGB, ']');
            var SRC_ALPHA = scope.def(BLEND_FUNCS, '[', read('src', 'Alpha'), ']');
            var DST_RGB = scope.def(BLEND_FUNCS, '[', dstRGB, ']');
            var DST_ALPHA = scope.def(BLEND_FUNCS, '[', read('dst', 'Alpha'), ']');

            return [SRC_RGB, DST_RGB, SRC_ALPHA, DST_ALPHA];
          });

        case S_BLEND_EQUATION:
          return parseParam(function (value) {
            if (typeof value === 'string') {

              return [blendEquations[value], blendEquations[value]];
            } else if (typeof value === 'object') {

              return [blendEquations[value.rgb], blendEquations[value.alpha]];
            } else {}
          }, function (env, scope, value) {
            var BLEND_EQUATIONS = env.constants.blendEquations;

            var RGB = scope.def();
            var ALPHA = scope.def();

            var ifte = env.cond('typeof ', value, '==="string"');

            ifte.then(RGB, '=', ALPHA, '=', BLEND_EQUATIONS, '[', value, '];');
            ifte.else(RGB, '=', BLEND_EQUATIONS, '[', value, '.rgb];', ALPHA, '=', BLEND_EQUATIONS, '[', value, '.alpha];');

            scope(ifte);

            return [RGB, ALPHA];
          });

        case S_BLEND_COLOR:
          return parseParam(function (value) {

            return loop(4, function (i) {
              return +value[i];
            });
          }, function (env, scope, value) {

            return loop(4, function (i) {
              return scope.def('+', value, '[', i, ']');
            });
          });

        case S_STENCIL_MASK:
          return parseParam(function (value) {

            return value | 0;
          }, function (env, scope, value) {

            return scope.def(value, '|0');
          });

        case S_STENCIL_FUNC:
          return parseParam(function (value) {

            var cmp = value.cmp || 'keep';
            var ref = value.ref || 0;
            var mask = 'mask' in value ? value.mask : -1;

            return [compareFuncs[cmp], ref, mask];
          }, function (env, scope, value) {
            var COMPARE_FUNCS = env.constants.compareFuncs;

            var cmp = scope.def('"cmp" in ', value, '?', COMPARE_FUNCS, '[', value, '.cmp]', ':', GL_KEEP);
            var ref = scope.def(value, '.ref|0');
            var mask = scope.def('"mask" in ', value, '?', value, '.mask|0:-1');
            return [cmp, ref, mask];
          });

        case S_STENCIL_OPFRONT:
        case S_STENCIL_OPBACK:
          return parseParam(function (value) {

            var fail = value.fail || 'keep';
            var zfail = value.zfail || 'keep';
            var zpass = value.zpass || 'keep';

            return [prop === S_STENCIL_OPBACK ? GL_BACK : GL_FRONT, stencilOps[fail], stencilOps[zfail], stencilOps[zpass]];
          }, function (env, scope, value) {
            var STENCIL_OPS = env.constants.stencilOps;

            function read(name) {

              return scope.def('"', name, '" in ', value, '?', STENCIL_OPS, '[', value, '.', name, ']:', GL_KEEP);
            }

            return [prop === S_STENCIL_OPBACK ? GL_BACK : GL_FRONT, read('fail'), read('zfail'), read('zpass')];
          });

        case S_POLYGON_OFFSET_OFFSET:
          return parseParam(function (value) {

            var factor = value.factor | 0;
            var units = value.units | 0;

            return [factor, units];
          }, function (env, scope, value) {

            var FACTOR = scope.def(value, '.factor|0');
            var UNITS = scope.def(value, '.units|0');

            return [FACTOR, UNITS];
          });

        case S_CULL_FACE:
          return parseParam(function (value) {
            var face = 0;
            if (value === 'front') {
              face = GL_FRONT;
            } else if (value === 'back') {
              face = GL_BACK;
            }

            return face;
          }, function (env, scope, value) {

            return scope.def(value, '==="front"?', GL_FRONT, ':', GL_BACK);
          });

        case S_LINE_WIDTH:
          return parseParam(function (value) {

            return value;
          }, function (env, scope, value) {

            return value;
          });

        case S_FRONT_FACE:
          return parseParam(function (value) {

            return orientationType[value];
          }, function (env, scope, value) {

            return scope.def(value + '==="cw"?' + GL_CW + ':' + GL_CCW);
          });

        case S_COLOR_MASK:
          return parseParam(function (value) {

            return value.map(function (v) {
              return !!v;
            });
          }, function (env, scope, value) {

            return loop(4, function (i) {
              return '!!' + value + '[' + i + ']';
            });
          });

        case S_SAMPLE_COVERAGE:
          return parseParam(function (value) {

            var sampleValue = 'value' in value ? value.value : 1;
            var sampleInvert = !!value.invert;

            return [sampleValue, sampleInvert];
          }, function (env, scope, value) {

            var VALUE = scope.def('"value" in ', value, '?+', value, '.value:1');
            var INVERT = scope.def('!!', value, '.invert');
            return [VALUE, INVERT];
          });
      }
    });

    return STATE;
  }

  function parseUniforms(uniforms, env) {
    var staticUniforms = uniforms.static;
    var dynamicUniforms = uniforms.dynamic;

    var UNIFORMS = {};

    Object.keys(staticUniforms).forEach(function (name) {
      var value = staticUniforms[name];
      var result;
      if (typeof value === 'number' || typeof value === 'boolean') {
        result = createStaticDecl(function () {
          return value;
        });
      } else if (typeof value === 'function') {
        var reglType = value._reglType;
        if (reglType === 'texture2d' || reglType === 'textureCube') {
          result = createStaticDecl(function (env) {
            return env.link(value);
          });
        } else if (reglType === 'framebuffer' || reglType === 'framebufferCube') {

          result = createStaticDecl(function (env) {
            return env.link(value.color[0]);
          });
        } else {}
      } else if (isArrayLike(value)) {
        result = createStaticDecl(function (env) {
          var ITEM = env.global.def('[', loop(value.length, function (i) {

            return value[i];
          }), ']');
          return ITEM;
        });
      } else {}
      result.value = value;
      UNIFORMS[name] = result;
    });

    Object.keys(dynamicUniforms).forEach(function (key) {
      var dyn = dynamicUniforms[key];
      UNIFORMS[key] = createDynamicDecl(dyn, function (env, scope) {
        return env.invoke(scope, dyn);
      });
    });

    return UNIFORMS;
  }

  function parseAttributes(attributes, env) {
    var staticAttributes = attributes.static;
    var dynamicAttributes = attributes.dynamic;

    var attributeDefs = {};

    Object.keys(staticAttributes).forEach(function (attribute) {
      var value = staticAttributes[attribute];
      var id = stringStore.id(attribute);

      var record = new AttributeRecord();
      if (isBufferArgs(value)) {
        record.state = ATTRIB_STATE_POINTER;
        record.buffer = bufferState.getBuffer(bufferState.create(value, GL_ARRAY_BUFFER, false, true));
        record.type = 0;
      } else {
        var buffer = bufferState.getBuffer(value);
        if (buffer) {
          record.state = ATTRIB_STATE_POINTER;
          record.buffer = buffer;
          record.type = 0;
        } else {

          if (value.constant) {
            var constant = value.constant;
            record.buffer = 'null';
            record.state = ATTRIB_STATE_CONSTANT;
            if (typeof constant === 'number') {
              record.x = constant;
            } else {

              CUTE_COMPONENTS.forEach(function (c, i) {
                if (i < constant.length) {
                  record[c] = constant[i];
                }
              });
            }
          } else {
            if (isBufferArgs(value.buffer)) {
              buffer = bufferState.getBuffer(bufferState.create(value.buffer, GL_ARRAY_BUFFER, false, true));
            } else {
              buffer = bufferState.getBuffer(value.buffer);
            }

            var offset = value.offset | 0;

            var stride = value.stride | 0;

            var size = value.size | 0;

            var normalized = !!value.normalized;

            var type = 0;
            if ('type' in value) {

              type = glTypes[value.type];
            }

            var divisor = value.divisor | 0;
            if ('divisor' in value) {}

            record.buffer = buffer;
            record.state = ATTRIB_STATE_POINTER;
            record.size = size;
            record.normalized = normalized;
            record.type = type || buffer.dtype;
            record.offset = offset;
            record.stride = stride;
            record.divisor = divisor;
          }
        }
      }

      attributeDefs[attribute] = createStaticDecl(function (env, scope) {
        var cache = env.attribCache;
        if (id in cache) {
          return cache[id];
        }
        var result = {
          isStream: false
        };
        Object.keys(record).forEach(function (key) {
          result[key] = record[key];
        });
        if (record.buffer) {
          result.buffer = env.link(record.buffer);
          result.type = result.type || result.buffer + '.dtype';
        }
        cache[id] = result;
        return result;
      });
    });

    Object.keys(dynamicAttributes).forEach(function (attribute) {
      var dyn = dynamicAttributes[attribute];

      function appendAttributeCode(env, block) {
        var VALUE = env.invoke(block, dyn);

        var shared = env.shared;

        var IS_BUFFER_ARGS = shared.isBufferArgs;
        var BUFFER_STATE = shared.buffer;

        // Perform validation on attribute


        // allocate names for result
        var result = {
          isStream: block.def(false)
        };
        var defaultRecord = new AttributeRecord();
        defaultRecord.state = ATTRIB_STATE_POINTER;
        Object.keys(defaultRecord).forEach(function (key) {
          result[key] = block.def('' + defaultRecord[key]);
        });

        var BUFFER = result.buffer;
        var TYPE = result.type;
        block('if(', IS_BUFFER_ARGS, '(', VALUE, ')){', result.isStream, '=true;', BUFFER, '=', BUFFER_STATE, '.createStream(', GL_ARRAY_BUFFER, ',', VALUE, ');', TYPE, '=', BUFFER, '.dtype;', '}else{', BUFFER, '=', BUFFER_STATE, '.getBuffer(', VALUE, ');', 'if(', BUFFER, '){', TYPE, '=', BUFFER, '.dtype;', '}else if("constant" in ', VALUE, '){', result.state, '=', ATTRIB_STATE_CONSTANT, ';', 'if(typeof ' + VALUE + '.constant === "number"){', result[CUTE_COMPONENTS[0]], '=', VALUE, '.constant;', CUTE_COMPONENTS.slice(1).map(function (n) {
          return result[n];
        }).join('='), '=0;', '}else{', CUTE_COMPONENTS.map(function (name, i) {
          return result[name] + '=' + VALUE + '.constant.length>=' + i + '?' + VALUE + '.constant[' + i + ']:0;';
        }).join(''), '}}else{', 'if(', IS_BUFFER_ARGS, '(', VALUE, '.buffer)){', BUFFER, '=', BUFFER_STATE, '.createStream(', GL_ARRAY_BUFFER, ',', VALUE, '.buffer);', '}else{', BUFFER, '=', BUFFER_STATE, '.getBuffer(', VALUE, '.buffer);', '}', TYPE, '="type" in ', VALUE, '?', shared.glTypes, '[', VALUE, '.type]:', BUFFER, '.dtype;', result.normalized, '=!!', VALUE, '.normalized;');
        function emitReadRecord(name) {
          block(result[name], '=', VALUE, '.', name, '|0;');
        }
        emitReadRecord('size');
        emitReadRecord('offset');
        emitReadRecord('stride');
        emitReadRecord('divisor');

        block('}}');

        block.exit('if(', result.isStream, '){', BUFFER_STATE, '.destroyStream(', BUFFER, ');', '}');

        return result;
      }

      attributeDefs[attribute] = createDynamicDecl(dyn, appendAttributeCode);
    });

    return attributeDefs;
  }

  function parseContext(context) {
    var staticContext = context.static;
    var dynamicContext = context.dynamic;
    var result = {};

    Object.keys(staticContext).forEach(function (name) {
      var value = staticContext[name];
      result[name] = createStaticDecl(function (env, scope) {
        if (typeof value === 'number' || typeof value === 'boolean') {
          return '' + value;
        } else {
          return env.link(value);
        }
      });
    });

    Object.keys(dynamicContext).forEach(function (name) {
      var dyn = dynamicContext[name];
      result[name] = createDynamicDecl(dyn, function (env, scope) {
        return env.invoke(scope, dyn);
      });
    });

    return result;
  }

  function parseArguments(options, attributes, uniforms, context, env) {
    var staticOptions = options.static;
    var dynamicOptions = options.dynamic;

    var framebuffer = parseFramebuffer(options, env);
    var viewportAndScissor = parseViewportScissor(options, framebuffer, env);
    var draw = parseDraw(options, env);
    var state = parseGLState(options, env);
    var shader = parseProgram(options, env);

    function copyBox(name) {
      var defn = viewportAndScissor[name];
      if (defn) {
        state[name] = defn;
      }
    }
    copyBox(S_VIEWPORT);
    copyBox(propName(S_SCISSOR_BOX));

    var dirty = Object.keys(state).length > 0;

    var result = {
      framebuffer: framebuffer,
      draw: draw,
      shader: shader,
      state: state,
      dirty: dirty
    };

    result.profile = parseProfile(options, env);
    result.uniforms = parseUniforms(uniforms, env);
    result.attributes = parseAttributes(attributes, env);
    result.context = parseContext(context, env);
    return result;
  }

  // ===================================================
  // ===================================================
  // COMMON UPDATE FUNCTIONS
  // ===================================================
  // ===================================================
  function emitContext(env, scope, context) {
    var shared = env.shared;
    var CONTEXT = shared.context;

    var contextEnter = env.scope();

    Object.keys(context).forEach(function (name) {
      scope.save(CONTEXT, '.' + name);
      var defn = context[name];
      contextEnter(CONTEXT, '.', name, '=', defn.append(env, scope), ';');
    });

    scope(contextEnter);
  }

  // ===================================================
  // ===================================================
  // COMMON DRAWING FUNCTIONS
  // ===================================================
  // ===================================================
  function emitPollFramebuffer(env, scope, framebuffer, skipCheck) {
    var shared = env.shared;

    var GL = shared.gl;
    var FRAMEBUFFER_STATE = shared.framebuffer;
    var EXT_DRAW_BUFFERS;
    if (extDrawBuffers) {
      EXT_DRAW_BUFFERS = scope.def(shared.extensions, '.webgl_draw_buffers');
    }

    var constants = env.constants;

    var DRAW_BUFFERS = constants.drawBuffer;
    var BACK_BUFFER = constants.backBuffer;

    var NEXT;
    if (framebuffer) {
      NEXT = framebuffer.append(env, scope);
    } else {
      NEXT = scope.def(FRAMEBUFFER_STATE, '.next');
    }

    if (!skipCheck) {
      scope('if(', NEXT, '!==', FRAMEBUFFER_STATE, '.cur){');
    }
    scope('if(', NEXT, '){', GL, '.bindFramebuffer(', GL_FRAMEBUFFER, ',', NEXT, '.framebuffer);');
    if (extDrawBuffers) {
      scope(EXT_DRAW_BUFFERS, '.drawBuffersWEBGL(', DRAW_BUFFERS, '[', NEXT, '.colorAttachments.length]);');
    }
    scope('}else{', GL, '.bindFramebuffer(', GL_FRAMEBUFFER, ',null);');
    if (extDrawBuffers) {
      scope(EXT_DRAW_BUFFERS, '.drawBuffersWEBGL(', BACK_BUFFER, ');');
    }
    scope('}', FRAMEBUFFER_STATE, '.cur=', NEXT, ';');
    if (!skipCheck) {
      scope('}');
    }
  }

  function emitPollState(env, scope, args) {
    var shared = env.shared;

    var GL = shared.gl;

    var CURRENT_VARS = env.current;
    var NEXT_VARS = env.next;
    var CURRENT_STATE = shared.current;
    var NEXT_STATE = shared.next;

    var block = env.cond(CURRENT_STATE, '.dirty');

    GL_STATE_NAMES.forEach(function (prop) {
      var param = propName(prop);
      if (param in args.state) {
        return;
      }

      var NEXT, CURRENT;
      if (param in NEXT_VARS) {
        NEXT = NEXT_VARS[param];
        CURRENT = CURRENT_VARS[param];
        var parts = loop(currentState[param].length, function (i) {
          return block.def(NEXT, '[', i, ']');
        });
        block(env.cond(parts.map(function (p, i) {
          return p + '!==' + CURRENT + '[' + i + ']';
        }).join('||')).then(GL, '.', GL_VARIABLES[param], '(', parts, ');', parts.map(function (p, i) {
          return CURRENT + '[' + i + ']=' + p;
        }).join(';'), ';'));
      } else {
        NEXT = block.def(NEXT_STATE, '.', param);
        var ifte = env.cond(NEXT, '!==', CURRENT_STATE, '.', param);
        block(ifte);
        if (param in GL_FLAGS) {
          ifte(env.cond(NEXT).then(GL, '.enable(', GL_FLAGS[param], ');').else(GL, '.disable(', GL_FLAGS[param], ');'), CURRENT_STATE, '.', param, '=', NEXT, ';');
        } else {
          ifte(GL, '.', GL_VARIABLES[param], '(', NEXT, ');', CURRENT_STATE, '.', param, '=', NEXT, ';');
        }
      }
    });
    if (Object.keys(args.state).length === 0) {
      block(CURRENT_STATE, '.dirty=false;');
    }
    scope(block);
  }

  function emitSetOptions(env, scope, options, filter) {
    var shared = env.shared;
    var CURRENT_VARS = env.current;
    var CURRENT_STATE = shared.current;
    var GL = shared.gl;
    sortState(Object.keys(options)).forEach(function (param) {
      var defn = options[param];
      if (filter && !filter(defn)) {
        return;
      }
      var variable = defn.append(env, scope);
      if (GL_FLAGS[param]) {
        var flag = GL_FLAGS[param];
        if (isStatic(defn)) {
          if (variable) {
            scope(GL, '.enable(', flag, ');');
          } else {
            scope(GL, '.disable(', flag, ');');
          }
        } else {
          scope(env.cond(variable).then(GL, '.enable(', flag, ');').else(GL, '.disable(', flag, ');'));
        }
        scope(CURRENT_STATE, '.', param, '=', variable, ';');
      } else if (isArrayLike(variable)) {
        var CURRENT = CURRENT_VARS[param];
        scope(GL, '.', GL_VARIABLES[param], '(', variable, ');', variable.map(function (v, i) {
          return CURRENT + '[' + i + ']=' + v;
        }).join(';'), ';');
      } else {
        scope(GL, '.', GL_VARIABLES[param], '(', variable, ');', CURRENT_STATE, '.', param, '=', variable, ';');
      }
    });
  }

  function injectExtensions(env, scope) {
    if (extInstancing) {
      env.instancing = scope.def(env.shared.extensions, '.angle_instanced_arrays');
    }
  }

  function emitProfile(env, scope, args, useScope, incrementCounter) {
    var shared = env.shared;
    var STATS = env.stats;
    var CURRENT_STATE = shared.current;
    var TIMER = shared.timer;
    var profileArg = args.profile;

    function perfCounter() {
      if (typeof performance === 'undefined') {
        return 'Date.now()';
      } else {
        return 'performance.now()';
      }
    }

    var CPU_START, QUERY_COUNTER;
    function emitProfileStart(block) {
      CPU_START = scope.def();
      block(CPU_START, '=', perfCounter(), ';');
      if (typeof incrementCounter === 'string') {
        block(STATS, '.count+=', incrementCounter, ';');
      } else {
        block(STATS, '.count++;');
      }
      if (timer) {
        if (useScope) {
          QUERY_COUNTER = scope.def();
          block(QUERY_COUNTER, '=', TIMER, '.getNumPendingQueries();');
        } else {
          block(TIMER, '.beginQuery(', STATS, ');');
        }
      }
    }

    function emitProfileEnd(block) {
      block(STATS, '.cpuTime+=', perfCounter(), '-', CPU_START, ';');
      if (timer) {
        if (useScope) {
          block(TIMER, '.pushScopeStats(', QUERY_COUNTER, ',', TIMER, '.getNumPendingQueries(),', STATS, ');');
        } else {
          block(TIMER, '.endQuery();');
        }
      }
    }

    function scopeProfile(value) {
      var prev = scope.def(CURRENT_STATE, '.profile');
      scope(CURRENT_STATE, '.profile=', value, ';');
      scope.exit(CURRENT_STATE, '.profile=', prev, ';');
    }

    var USE_PROFILE;
    if (profileArg) {
      if (isStatic(profileArg)) {
        if (profileArg.enable) {
          emitProfileStart(scope);
          emitProfileEnd(scope.exit);
          scopeProfile('true');
        } else {
          scopeProfile('false');
        }
        return;
      }
      USE_PROFILE = profileArg.append(env, scope);
      scopeProfile(USE_PROFILE);
    } else {
      USE_PROFILE = scope.def(CURRENT_STATE, '.profile');
    }

    var start = env.block();
    emitProfileStart(start);
    scope('if(', USE_PROFILE, '){', start, '}');
    var end = env.block();
    emitProfileEnd(end);
    scope.exit('if(', USE_PROFILE, '){', end, '}');
  }

  function emitAttributes(env, scope, args, attributes, filter) {
    var shared = env.shared;

    function typeLength(x) {
      switch (x) {
        case GL_FLOAT_VEC2:
        case GL_INT_VEC2:
        case GL_BOOL_VEC2:
          return 2;
        case GL_FLOAT_VEC3:
        case GL_INT_VEC3:
        case GL_BOOL_VEC3:
          return 3;
        case GL_FLOAT_VEC4:
        case GL_INT_VEC4:
        case GL_BOOL_VEC4:
          return 4;
        default:
          return 1;
      }
    }

    function emitBindAttribute(ATTRIBUTE, size, record) {
      var GL = shared.gl;

      var LOCATION = scope.def(ATTRIBUTE, '.location');
      var BINDING = scope.def(shared.attributes, '[', LOCATION, ']');

      var STATE = record.state;
      var BUFFER = record.buffer;
      var CONST_COMPONENTS = [record.x, record.y, record.z, record.w];

      var COMMON_KEYS = ['buffer', 'normalized', 'offset', 'stride'];

      function emitBuffer() {
        scope('if(!', BINDING, '.buffer){', GL, '.enableVertexAttribArray(', LOCATION, ');}');

        var TYPE = record.type;
        var SIZE;
        if (!record.size) {
          SIZE = size;
        } else {
          SIZE = scope.def(record.size, '||', size);
        }

        scope('if(', BINDING, '.type!==', TYPE, '||', BINDING, '.size!==', SIZE, '||', COMMON_KEYS.map(function (key) {
          return BINDING + '.' + key + '!==' + record[key];
        }).join('||'), '){', GL, '.bindBuffer(', GL_ARRAY_BUFFER, ',', BUFFER, '.buffer);', GL, '.vertexAttribPointer(', [LOCATION, SIZE, TYPE, record.normalized, record.stride, record.offset], ');', BINDING, '.type=', TYPE, ';', BINDING, '.size=', SIZE, ';', COMMON_KEYS.map(function (key) {
          return BINDING + '.' + key + '=' + record[key] + ';';
        }).join(''), '}');

        if (extInstancing) {
          var DIVISOR = record.divisor;
          scope('if(', BINDING, '.divisor!==', DIVISOR, '){', env.instancing, '.vertexAttribDivisorANGLE(', [LOCATION, DIVISOR], ');', BINDING, '.divisor=', DIVISOR, ';}');
        }
      }

      function emitConstant() {
        scope('if(', BINDING, '.buffer){', GL, '.disableVertexAttribArray(', LOCATION, ');', '}if(', CUTE_COMPONENTS.map(function (c, i) {
          return BINDING + '.' + c + '!==' + CONST_COMPONENTS[i];
        }).join('||'), '){', GL, '.vertexAttrib4f(', LOCATION, ',', CONST_COMPONENTS, ');', CUTE_COMPONENTS.map(function (c, i) {
          return BINDING + '.' + c + '=' + CONST_COMPONENTS[i] + ';';
        }).join(''), '}');
      }

      if (STATE === ATTRIB_STATE_POINTER) {
        emitBuffer();
      } else if (STATE === ATTRIB_STATE_CONSTANT) {
        emitConstant();
      } else {
        scope('if(', STATE, '===', ATTRIB_STATE_POINTER, '){');
        emitBuffer();
        scope('}else{');
        emitConstant();
        scope('}');
      }
    }

    attributes.forEach(function (attribute) {
      var name = attribute.name;
      var arg = args.attributes[name];
      var record;
      if (arg) {
        if (!filter(arg)) {
          return;
        }
        record = arg.append(env, scope);
      } else {
        if (!filter(SCOPE_DECL)) {
          return;
        }
        var scopeAttrib = env.scopeAttrib(name);

        record = {};
        Object.keys(new AttributeRecord()).forEach(function (key) {
          record[key] = scope.def(scopeAttrib, '.', key);
        });
      }
      emitBindAttribute(env.link(attribute), typeLength(attribute.info.type), record);
    });
  }

  function emitUniforms(env, scope, args, uniforms, filter) {
    var shared = env.shared;
    var GL = shared.gl;

    var infix;
    for (var i = 0; i < uniforms.length; ++i) {
      var uniform = uniforms[i];
      var name = uniform.name;
      var type = uniform.info.type;
      var arg = args.uniforms[name];
      var UNIFORM = env.link(uniform);
      var LOCATION = UNIFORM + '.location';

      var VALUE;
      if (arg) {
        if (!filter(arg)) {
          continue;
        }
        if (isStatic(arg)) {
          var value = arg.value;

          if (type === GL_SAMPLER_2D || type === GL_SAMPLER_CUBE) {

            var TEX_VALUE = env.link(value._texture || value.color[0]._texture);
            scope(GL, '.uniform1i(', LOCATION, ',', TEX_VALUE + '.bind());');
            scope.exit(TEX_VALUE, '.unbind();');
          } else if (type === GL_FLOAT_MAT2 || type === GL_FLOAT_MAT3 || type === GL_FLOAT_MAT4) {

            var MAT_VALUE = env.global.def('new Float32Array([' + Array.prototype.slice.call(value) + '])');
            var dim = 2;
            if (type === GL_FLOAT_MAT3) {
              dim = 3;
            } else if (type === GL_FLOAT_MAT4) {
              dim = 4;
            }
            scope(GL, '.uniformMatrix', dim, 'fv(', LOCATION, ',false,', MAT_VALUE, ');');
          } else {
            switch (type) {
              case GL_FLOAT:

                infix = '1f';
                break;
              case GL_FLOAT_VEC2:

                infix = '2f';
                break;
              case GL_FLOAT_VEC3:

                infix = '3f';
                break;
              case GL_FLOAT_VEC4:

                infix = '4f';
                break;
              case GL_BOOL:

                infix = '1i';
                break;
              case GL_INT:

                infix = '1i';
                break;
              case GL_BOOL_VEC2:

                infix = '2i';
                break;
              case GL_INT_VEC2:

                infix = '2i';
                break;
              case GL_BOOL_VEC3:

                infix = '3i';
                break;
              case GL_INT_VEC3:

                infix = '3i';
                break;
              case GL_BOOL_VEC4:

                infix = '4i';
                break;
              case GL_INT_VEC4:

                infix = '4i';
                break;
            }
            scope(GL, '.uniform', infix, '(', LOCATION, ',', isArrayLike(value) ? Array.prototype.slice.call(value) : value, ');');
          }
          continue;
        } else {
          VALUE = arg.append(env, scope);
        }
      } else {
        if (!filter(SCOPE_DECL)) {
          continue;
        }
        VALUE = scope.def(shared.uniforms, '[', stringStore.id(name), ']');
      }

      if (type === GL_SAMPLER_2D) {
        scope('if(', VALUE, '&&', VALUE, '._reglType==="framebuffer"){', VALUE, '=', VALUE, '.color[0];', '}');
      } else if (type === GL_SAMPLER_CUBE) {
        scope('if(', VALUE, '&&', VALUE, '._reglType==="framebufferCube"){', VALUE, '=', VALUE, '.color[0];', '}');
      }

      // perform type validation


      var unroll = 1;
      switch (type) {
        case GL_SAMPLER_2D:
        case GL_SAMPLER_CUBE:
          var TEX = scope.def(VALUE, '._texture');
          scope(GL, '.uniform1i(', LOCATION, ',', TEX, '.bind());');
          scope.exit(TEX, '.unbind();');
          continue;

        case GL_INT:
        case GL_BOOL:
          infix = '1i';
          break;

        case GL_INT_VEC2:
        case GL_BOOL_VEC2:
          infix = '2i';
          unroll = 2;
          break;

        case GL_INT_VEC3:
        case GL_BOOL_VEC3:
          infix = '3i';
          unroll = 3;
          break;

        case GL_INT_VEC4:
        case GL_BOOL_VEC4:
          infix = '4i';
          unroll = 4;
          break;

        case GL_FLOAT:
          infix = '1f';
          break;

        case GL_FLOAT_VEC2:
          infix = '2f';
          unroll = 2;
          break;

        case GL_FLOAT_VEC3:
          infix = '3f';
          unroll = 3;
          break;

        case GL_FLOAT_VEC4:
          infix = '4f';
          unroll = 4;
          break;

        case GL_FLOAT_MAT2:
          infix = 'Matrix2fv';
          break;

        case GL_FLOAT_MAT3:
          infix = 'Matrix3fv';
          break;

        case GL_FLOAT_MAT4:
          infix = 'Matrix4fv';
          break;
      }

      scope(GL, '.uniform', infix, '(', LOCATION, ',');
      if (infix.charAt(0) === 'M') {
        var matSize = Math.pow(type - GL_FLOAT_MAT2 + 2, 2);
        var STORAGE = env.global.def('new Float32Array(', matSize, ')');
        scope('false,(Array.isArray(', VALUE, ')||', VALUE, ' instanceof Float32Array)?', VALUE, ':(', loop(matSize, function (i) {
          return STORAGE + '[' + i + ']=' + VALUE + '[' + i + ']';
        }), ',', STORAGE, ')');
      } else if (unroll > 1) {
        scope(loop(unroll, function (i) {
          return VALUE + '[' + i + ']';
        }));
      } else {
        scope(VALUE);
      }
      scope(');');
    }
  }

  function emitDraw(env, outer, inner, args) {
    var shared = env.shared;
    var GL = shared.gl;
    var DRAW_STATE = shared.draw;

    var drawOptions = args.draw;

    function emitElements() {
      var defn = drawOptions.elements;
      var ELEMENTS;
      var scope = outer;
      if (defn) {
        if (defn.contextDep && args.contextDynamic || defn.propDep) {
          scope = inner;
        }
        ELEMENTS = defn.append(env, scope);
      } else {
        ELEMENTS = scope.def(DRAW_STATE, '.', S_ELEMENTS);
      }
      if (ELEMENTS) {
        scope('if(' + ELEMENTS + ')' + GL + '.bindBuffer(' + GL_ELEMENT_ARRAY_BUFFER + ',' + ELEMENTS + '.buffer.buffer);');
      }
      return ELEMENTS;
    }

    function emitCount() {
      var defn = drawOptions.count;
      var COUNT;
      var scope = outer;
      if (defn) {
        if (defn.contextDep && args.contextDynamic || defn.propDep) {
          scope = inner;
        }
        COUNT = defn.append(env, scope);
      } else {
        COUNT = scope.def(DRAW_STATE, '.', S_COUNT);
      }
      return COUNT;
    }

    var ELEMENTS = emitElements();
    function emitValue(name) {
      var defn = drawOptions[name];
      if (defn) {
        if (defn.contextDep && args.contextDynamic || defn.propDep) {
          return defn.append(env, inner);
        } else {
          return defn.append(env, outer);
        }
      } else {
        return outer.def(DRAW_STATE, '.', name);
      }
    }

    var PRIMITIVE = emitValue(S_PRIMITIVE);
    var OFFSET = emitValue(S_OFFSET);

    var COUNT = emitCount();
    if (typeof COUNT === 'number') {
      if (COUNT === 0) {
        return;
      }
    } else {
      inner('if(', COUNT, '){');
      inner.exit('}');
    }

    var INSTANCES, EXT_INSTANCING;
    if (extInstancing) {
      INSTANCES = emitValue(S_INSTANCES);
      EXT_INSTANCING = env.instancing;
    }

    var ELEMENT_TYPE = ELEMENTS + '.type';

    var elementsStatic = drawOptions.elements && isStatic(drawOptions.elements);

    function emitInstancing() {
      function drawElements() {
        inner(EXT_INSTANCING, '.drawElementsInstancedANGLE(', [PRIMITIVE, COUNT, ELEMENT_TYPE, OFFSET + '<<((' + ELEMENT_TYPE + '-' + GL_UNSIGNED_BYTE + ')>>1)', INSTANCES], ');');
      }

      function drawArrays() {
        inner(EXT_INSTANCING, '.drawArraysInstancedANGLE(', [PRIMITIVE, OFFSET, COUNT, INSTANCES], ');');
      }

      if (ELEMENTS) {
        if (!elementsStatic) {
          inner('if(', ELEMENTS, '){');
          drawElements();
          inner('}else{');
          drawArrays();
          inner('}');
        } else {
          drawElements();
        }
      } else {
        drawArrays();
      }
    }

    function emitRegular() {
      function drawElements() {
        inner(GL + '.drawElements(' + [PRIMITIVE, COUNT, ELEMENT_TYPE, OFFSET + '<<((' + ELEMENT_TYPE + '-' + GL_UNSIGNED_BYTE + ')>>1)'] + ');');
      }

      function drawArrays() {
        inner(GL + '.drawArrays(' + [PRIMITIVE, OFFSET, COUNT] + ');');
      }

      if (ELEMENTS) {
        if (!elementsStatic) {
          inner('if(', ELEMENTS, '){');
          drawElements();
          inner('}else{');
          drawArrays();
          inner('}');
        } else {
          drawElements();
        }
      } else {
        drawArrays();
      }
    }

    if (extInstancing && (typeof INSTANCES !== 'number' || INSTANCES >= 0)) {
      if (typeof INSTANCES === 'string') {
        inner('if(', INSTANCES, '>0){');
        emitInstancing();
        inner('}else if(', INSTANCES, '<0){');
        emitRegular();
        inner('}');
      } else {
        emitInstancing();
      }
    } else {
      emitRegular();
    }
  }

  function createBody(emitBody, parentEnv, args, program, count) {
    var env = createREGLEnvironment();
    var scope = env.proc('body', count);

    if (extInstancing) {
      env.instancing = scope.def(env.shared.extensions, '.angle_instanced_arrays');
    }
    emitBody(env, scope, args, program);
    return env.compile().body;
  }

  // ===================================================
  // ===================================================
  // DRAW PROC
  // ===================================================
  // ===================================================
  function emitDrawBody(env, draw, args, program) {
    injectExtensions(env, draw);
    emitAttributes(env, draw, args, program.attributes, function () {
      return true;
    });
    emitUniforms(env, draw, args, program.uniforms, function () {
      return true;
    });
    emitDraw(env, draw, draw, args);
  }

  function emitDrawProc(env, args) {
    var draw = env.proc('draw', 1);

    injectExtensions(env, draw);

    emitContext(env, draw, args.context);
    emitPollFramebuffer(env, draw, args.framebuffer);

    emitPollState(env, draw, args);
    emitSetOptions(env, draw, args.state);

    emitProfile(env, draw, args, false, true);

    var program = args.shader.progVar.append(env, draw);
    draw(env.shared.gl, '.useProgram(', program, '.program);');

    if (args.shader.program) {
      emitDrawBody(env, draw, args, args.shader.program);
    } else {
      var drawCache = env.global.def('{}');
      var PROG_ID = draw.def(program, '.id');
      var CACHED_PROC = draw.def(drawCache, '[', PROG_ID, ']');
      draw(env.cond(CACHED_PROC).then(CACHED_PROC, '.call(this,a0);').else(CACHED_PROC, '=', drawCache, '[', PROG_ID, ']=', env.link(function (program) {
        return createBody(emitDrawBody, env, args, program, 1);
      }), '(', program, ');', CACHED_PROC, '.call(this,a0);'));
    }

    if (Object.keys(args.state).length > 0) {
      draw(env.shared.current, '.dirty=true;');
    }
  }

  // ===================================================
  // ===================================================
  // BATCH PROC
  // ===================================================
  // ===================================================

  function emitBatchDynamicShaderBody(env, scope, args, program) {
    env.batchId = 'a1';

    injectExtensions(env, scope);

    function all() {
      return true;
    }

    emitAttributes(env, scope, args, program.attributes, all);
    emitUniforms(env, scope, args, program.uniforms, all);
    emitDraw(env, scope, scope, args);
  }

  function emitBatchBody(env, scope, args, program) {
    injectExtensions(env, scope);

    var contextDynamic = args.contextDep;

    var BATCH_ID = scope.def();
    var PROP_LIST = 'a0';
    var NUM_PROPS = 'a1';
    var PROPS = scope.def();
    env.shared.props = PROPS;
    env.batchId = BATCH_ID;

    var outer = env.scope();
    var inner = env.scope();

    scope(outer.entry, 'for(', BATCH_ID, '=0;', BATCH_ID, '<', NUM_PROPS, ';++', BATCH_ID, '){', PROPS, '=', PROP_LIST, '[', BATCH_ID, '];', inner, '}', outer.exit);

    function isInnerDefn(defn) {
      return defn.contextDep && contextDynamic || defn.propDep;
    }

    function isOuterDefn(defn) {
      return !isInnerDefn(defn);
    }

    if (args.needsContext) {
      emitContext(env, inner, args.context);
    }
    if (args.needsFramebuffer) {
      emitPollFramebuffer(env, inner, args.framebuffer);
    }
    emitSetOptions(env, inner, args.state, isInnerDefn);

    if (args.profile && isInnerDefn(args.profile)) {
      emitProfile(env, inner, args, false, true);
    }

    if (!program) {
      var progCache = env.global.def('{}');
      var PROGRAM = args.shader.progVar.append(env, inner);
      var PROG_ID = inner.def(PROGRAM, '.id');
      var CACHED_PROC = inner.def(progCache, '[', PROG_ID, ']');
      inner(env.shared.gl, '.useProgram(', PROGRAM, '.program);', 'if(!', CACHED_PROC, '){', CACHED_PROC, '=', progCache, '[', PROG_ID, ']=', env.link(function (program) {
        return createBody(emitBatchDynamicShaderBody, env, args, program, 2);
      }), '(', PROGRAM, ');}', CACHED_PROC, '.call(this,a0[', BATCH_ID, '],', BATCH_ID, ');');
    } else {
      emitAttributes(env, outer, args, program.attributes, isOuterDefn);
      emitAttributes(env, inner, args, program.attributes, isInnerDefn);
      emitUniforms(env, outer, args, program.uniforms, isOuterDefn);
      emitUniforms(env, inner, args, program.uniforms, isInnerDefn);
      emitDraw(env, outer, inner, args);
    }
  }

  function emitBatchProc(env, args) {
    var batch = env.proc('batch', 2);
    env.batchId = '0';

    injectExtensions(env, batch);

    // Check if any context variables depend on props
    var contextDynamic = false;
    var needsContext = true;
    Object.keys(args.context).forEach(function (name) {
      contextDynamic = contextDynamic || args.context[name].propDep;
    });
    if (!contextDynamic) {
      emitContext(env, batch, args.context);
      needsContext = false;
    }

    // framebuffer state affects framebufferWidth/height context vars
    var framebuffer = args.framebuffer;
    var needsFramebuffer = false;
    if (framebuffer) {
      if (framebuffer.propDep) {
        contextDynamic = needsFramebuffer = true;
      } else if (framebuffer.contextDep && contextDynamic) {
        needsFramebuffer = true;
      }
      if (!needsFramebuffer) {
        emitPollFramebuffer(env, batch, framebuffer);
      }
    } else {
      emitPollFramebuffer(env, batch, null);
    }

    // viewport is weird because it can affect context vars
    if (args.state.viewport && args.state.viewport.propDep) {
      contextDynamic = true;
    }

    function isInnerDefn(defn) {
      return defn.contextDep && contextDynamic || defn.propDep;
    }

    // set webgl options
    emitPollState(env, batch, args);
    emitSetOptions(env, batch, args.state, function (defn) {
      return !isInnerDefn(defn);
    });

    if (!args.profile || !isInnerDefn(args.profile)) {
      emitProfile(env, batch, args, false, 'a1');
    }

    // Save these values to args so that the batch body routine can use them
    args.contextDep = contextDynamic;
    args.needsContext = needsContext;
    args.needsFramebuffer = needsFramebuffer;

    // determine if shader is dynamic
    var progDefn = args.shader.progVar;
    if (progDefn.contextDep && contextDynamic || progDefn.propDep) {
      emitBatchBody(env, batch, args, null);
    } else {
      var PROGRAM = progDefn.append(env, batch);
      batch(env.shared.gl, '.useProgram(', PROGRAM, '.program);');
      if (args.shader.program) {
        emitBatchBody(env, batch, args, args.shader.program);
      } else {
        var batchCache = env.global.def('{}');
        var PROG_ID = batch.def(PROGRAM, '.id');
        var CACHED_PROC = batch.def(batchCache, '[', PROG_ID, ']');
        batch(env.cond(CACHED_PROC).then(CACHED_PROC, '.call(this,a0,a1);').else(CACHED_PROC, '=', batchCache, '[', PROG_ID, ']=', env.link(function (program) {
          return createBody(emitBatchBody, env, args, program, 2);
        }), '(', PROGRAM, ');', CACHED_PROC, '.call(this,a0,a1);'));
      }
    }

    if (Object.keys(args.state).length > 0) {
      batch(env.shared.current, '.dirty=true;');
    }
  }

  // ===================================================
  // ===================================================
  // SCOPE COMMAND
  // ===================================================
  // ===================================================
  function emitScopeProc(env, args) {
    var scope = env.proc('scope', 3);
    env.batchId = 'a2';

    var shared = env.shared;
    var CURRENT_STATE = shared.current;

    emitContext(env, scope, args.context);

    if (args.framebuffer) {
      args.framebuffer.append(env, scope);
    }

    sortState(Object.keys(args.state)).forEach(function (name) {
      var defn = args.state[name];
      var value = defn.append(env, scope);
      if (isArrayLike(value)) {
        value.forEach(function (v, i) {
          scope.set(env.next[name], '[' + i + ']', v);
        });
      } else {
        scope.set(shared.next, '.' + name, value);
      }
    });

    emitProfile(env, scope, args, true, true);[S_ELEMENTS, S_OFFSET, S_COUNT, S_INSTANCES, S_PRIMITIVE].forEach(function (opt) {
      var variable = args.draw[opt];
      if (!variable) {
        return;
      }
      scope.set(shared.draw, '.' + opt, '' + variable.append(env, scope));
    });

    Object.keys(args.uniforms).forEach(function (opt) {
      scope.set(shared.uniforms, '[' + stringStore.id(opt) + ']', args.uniforms[opt].append(env, scope));
    });

    Object.keys(args.attributes).forEach(function (name) {
      var record = args.attributes[name].append(env, scope);
      var scopeAttrib = env.scopeAttrib(name);
      Object.keys(new AttributeRecord()).forEach(function (prop) {
        scope.set(scopeAttrib, '.' + prop, record[prop]);
      });
    });

    function saveShader(name) {
      var shader = args.shader[name];
      if (shader) {
        scope.set(shared.shader, '.' + name, shader.append(env, scope));
      }
    }
    saveShader(S_VERT);
    saveShader(S_FRAG);

    if (Object.keys(args.state).length > 0) {
      scope(CURRENT_STATE, '.dirty=true;');
      scope.exit(CURRENT_STATE, '.dirty=true;');
    }

    scope('a1(', env.shared.context, ',a0,', env.batchId, ');');
  }

  function isDynamicObject(object) {
    if (typeof object !== 'object' || isArrayLike(object)) {
      return;
    }
    var props = Object.keys(object);
    for (var i = 0; i < props.length; ++i) {
      if (dynamic.isDynamic(object[props[i]])) {
        return true;
      }
    }
    return false;
  }

  function splatObject(env, options, name) {
    var object = options.static[name];
    if (!object || !isDynamicObject(object)) {
      return;
    }

    var globals = env.global;
    var keys = Object.keys(object);
    var thisDep = false;
    var contextDep = false;
    var propDep = false;
    var objectRef = env.global.def('{}');
    keys.forEach(function (key) {
      var value = object[key];
      if (dynamic.isDynamic(value)) {
        if (typeof value === 'function') {
          value = object[key] = dynamic.unbox(value);
        }
        var deps = createDynamicDecl(value, null);
        thisDep = thisDep || deps.thisDep;
        propDep = propDep || deps.propDep;
        contextDep = contextDep || deps.contextDep;
      } else {
        globals(objectRef, '.', key, '=');
        switch (typeof value) {
          case 'number':
            globals(value);
            break;
          case 'string':
            globals('"', value, '"');
            break;
          case 'object':
            if (Array.isArray(value)) {
              globals('[', value.join(), ']');
            }
            break;
          default:
            globals(env.link(value));
            break;
        }
        globals(';');
      }
    });

    function appendBlock(env, block) {
      keys.forEach(function (key) {
        var value = object[key];
        if (!dynamic.isDynamic(value)) {
          return;
        }
        var ref = env.invoke(block, value);
        block(objectRef, '.', key, '=', ref, ';');
      });
    }

    options.dynamic[name] = new dynamic.DynamicVariable(DYN_THUNK, {
      thisDep: thisDep,
      contextDep: contextDep,
      propDep: propDep,
      ref: objectRef,
      append: appendBlock
    });
    delete options.static[name];
  }

  // ===========================================================================
  // ===========================================================================
  // MAIN DRAW COMMAND
  // ===========================================================================
  // ===========================================================================
  function compileCommand(options, attributes, uniforms, context, stats) {
    var env = createREGLEnvironment();

    // link stats, so that we can easily access it in the program.
    env.stats = env.link(stats);

    // splat options and attributes to allow for dynamic nested properties
    Object.keys(attributes.static).forEach(function (key) {
      splatObject(env, attributes, key);
    });
    NESTED_OPTIONS.forEach(function (name) {
      splatObject(env, options, name);
    });

    var args = parseArguments(options, attributes, uniforms, context, env);

    emitDrawProc(env, args);
    emitScopeProc(env, args);
    emitBatchProc(env, args);

    return env.compile();
  }

  // ===========================================================================
  // ===========================================================================
  // POLL / REFRESH
  // ===========================================================================
  // ===========================================================================
  return {
    next: nextState,
    current: currentState,
    procs: function () {
      var env = createREGLEnvironment();
      var poll = env.proc('poll');
      var refresh = env.proc('refresh');
      var common = env.block();
      poll(common);
      refresh(common);

      var shared = env.shared;
      var GL = shared.gl;
      var NEXT_STATE = shared.next;
      var CURRENT_STATE = shared.current;

      common(CURRENT_STATE, '.dirty=false;');

      emitPollFramebuffer(env, poll);
      emitPollFramebuffer(env, refresh, null, true);

      // Refresh updates all attribute state changes
      var extInstancing = gl.getExtension('angle_instanced_arrays');
      var INSTANCING;
      if (extInstancing) {
        INSTANCING = env.link(extInstancing);
      }
      for (var i = 0; i < limits.maxAttributes; ++i) {
        var BINDING = refresh.def(shared.attributes, '[', i, ']');
        var ifte = env.cond(BINDING, '.buffer');
        ifte.then(GL, '.enableVertexAttribArray(', i, ');', GL, '.bindBuffer(', GL_ARRAY_BUFFER, ',', BINDING, '.buffer.buffer);', GL, '.vertexAttribPointer(', i, ',', BINDING, '.size,', BINDING, '.type,', BINDING, '.normalized,', BINDING, '.stride,', BINDING, '.offset);').else(GL, '.disableVertexAttribArray(', i, ');', GL, '.vertexAttrib4f(', i, ',', BINDING, '.x,', BINDING, '.y,', BINDING, '.z,', BINDING, '.w);', BINDING, '.buffer=null;');
        refresh(ifte);
        if (extInstancing) {
          refresh(INSTANCING, '.vertexAttribDivisorANGLE(', i, ',', BINDING, '.divisor);');
        }
      }

      Object.keys(GL_FLAGS).forEach(function (flag) {
        var cap = GL_FLAGS[flag];
        var NEXT = common.def(NEXT_STATE, '.', flag);
        var block = env.block();
        block('if(', NEXT, '){', GL, '.enable(', cap, ')}else{', GL, '.disable(', cap, ')}', CURRENT_STATE, '.', flag, '=', NEXT, ';');
        refresh(block);
        poll('if(', NEXT, '!==', CURRENT_STATE, '.', flag, '){', block, '}');
      });

      Object.keys(GL_VARIABLES).forEach(function (name) {
        var func = GL_VARIABLES[name];
        var init = currentState[name];
        var NEXT, CURRENT;
        var block = env.block();
        block(GL, '.', func, '(');
        if (isArrayLike(init)) {
          var n = init.length;
          NEXT = env.global.def(NEXT_STATE, '.', name);
          CURRENT = env.global.def(CURRENT_STATE, '.', name);
          block(loop(n, function (i) {
            return NEXT + '[' + i + ']';
          }), ');', loop(n, function (i) {
            return CURRENT + '[' + i + ']=' + NEXT + '[' + i + '];';
          }).join(''));
          poll('if(', loop(n, function (i) {
            return NEXT + '[' + i + ']!==' + CURRENT + '[' + i + ']';
          }).join('||'), '){', block, '}');
        } else {
          NEXT = common.def(NEXT_STATE, '.', name);
          CURRENT = common.def(CURRENT_STATE, '.', name);
          block(NEXT, ');', CURRENT_STATE, '.', name, '=', NEXT, ';');
          poll('if(', NEXT, '!==', CURRENT, '){', block, '}');
        }
        refresh(block);
      });

      return env.compile();
    }(),
    compile: compileCommand
  };
};

},{"./constants/dtypes.json":6,"./constants/primitives.json":7,"./dynamic":10,"./util/codegen":23,"./util/is-array-like":26,"./util/is-ndarray":27,"./util/is-typed-array":28,"./util/loop":29}],10:[function(require,module,exports){
var VARIABLE_COUNTER = 0;

var DYN_FUNC = 0;

function DynamicVariable(type, data) {
  this.id = VARIABLE_COUNTER++;
  this.type = type;
  this.data = data;
}

function escapeStr(str) {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function splitParts(str) {
  if (str.length === 0) {
    return [];
  }

  var firstChar = str.charAt(0);
  var lastChar = str.charAt(str.length - 1);

  if (str.length > 1 && firstChar === lastChar && (firstChar === '"' || firstChar === "'")) {
    return ['"' + escapeStr(str.substr(1, str.length - 2)) + '"'];
  }

  var parts = /\[(false|true|null|\d+|'[^']*'|"[^"]*")\]/.exec(str);
  if (parts) {
    return splitParts(str.substr(0, parts.index)).concat(splitParts(parts[1])).concat(splitParts(str.substr(parts.index + parts[0].length)));
  }

  var subparts = str.split('.');
  if (subparts.length === 1) {
    return ['"' + escapeStr(str) + '"'];
  }

  var result = [];
  for (var i = 0; i < subparts.length; ++i) {
    result = result.concat(splitParts(subparts[i]));
  }
  return result;
}

function toAccessorString(str) {
  return '[' + splitParts(str).join('][') + ']';
}

function defineDynamic(type, data) {
  return new DynamicVariable(type, toAccessorString(data + ''));
}

function isDynamic(x) {
  return typeof x === 'function' && !x._reglType || x instanceof DynamicVariable;
}

function unbox(x, path) {
  if (typeof x === 'function') {
    return new DynamicVariable(DYN_FUNC, x);
  }
  return x;
}

module.exports = {
  DynamicVariable: DynamicVariable,
  define: defineDynamic,
  isDynamic: isDynamic,
  unbox: unbox,
  accessor: toAccessorString
};

},{}],11:[function(require,module,exports){

var isTypedArray = require('./util/is-typed-array');
var isNDArrayLike = require('./util/is-ndarray');
var values = require('./util/values');

var primTypes = require('./constants/primitives.json');
var usageTypes = require('./constants/usage.json');

var GL_POINTS = 0;
var GL_LINES = 1;
var GL_TRIANGLES = 4;

var GL_BYTE = 5120;
var GL_UNSIGNED_BYTE = 5121;
var GL_SHORT = 5122;
var GL_UNSIGNED_SHORT = 5123;
var GL_INT = 5124;
var GL_UNSIGNED_INT = 5125;

var GL_ELEMENT_ARRAY_BUFFER = 34963;

var GL_STREAM_DRAW = 0x88E0;
var GL_STATIC_DRAW = 0x88E4;

module.exports = function wrapElementsState(gl, extensions, bufferState, stats) {
  var elementSet = {};
  var elementCount = 0;

  var elementTypes = {
    'uint8': GL_UNSIGNED_BYTE,
    'uint16': GL_UNSIGNED_SHORT
  };

  if (extensions.oes_element_index_uint) {
    elementTypes.uint32 = GL_UNSIGNED_INT;
  }

  function REGLElementBuffer(buffer) {
    this.id = elementCount++;
    elementSet[this.id] = this;
    this.buffer = buffer;
    this.primType = GL_TRIANGLES;
    this.vertCount = 0;
    this.type = 0;
  }

  REGLElementBuffer.prototype.bind = function () {
    this.buffer.bind();
  };

  var bufferPool = [];

  function createElementStream(data) {
    var result = bufferPool.pop();
    if (!result) {
      result = new REGLElementBuffer(bufferState.create(null, GL_ELEMENT_ARRAY_BUFFER, true, false)._buffer);
    }
    initElements(result, data, GL_STREAM_DRAW, -1, -1, 0, 0);
    return result;
  }

  function destroyElementStream(elements) {
    bufferPool.push(elements);
  }

  function initElements(elements, data, usage, prim, count, byteLength, type) {
    elements.buffer.bind();
    if (data) {
      var predictedType = type;
      if (!type && (!isTypedArray(data) || isNDArrayLike(data) && !isTypedArray(data.data))) {
        predictedType = extensions.oes_element_index_uint ? GL_UNSIGNED_INT : GL_UNSIGNED_SHORT;
      }
      bufferState._initBuffer(elements.buffer, data, usage, predictedType, 3);
    } else {
      gl.bufferData(GL_ELEMENT_ARRAY_BUFFER, byteLength, usage);
      elements.buffer.dtype = dtype || GL_UNSIGNED_BYTE;
      elements.buffer.usage = usage;
      elements.buffer.dimension = 3;
      elements.buffer.byteLength = byteLength;
    }

    var dtype = type;
    if (!type) {
      switch (elements.buffer.dtype) {
        case GL_UNSIGNED_BYTE:
        case GL_BYTE:
          dtype = GL_UNSIGNED_BYTE;
          break;

        case GL_UNSIGNED_SHORT:
        case GL_SHORT:
          dtype = GL_UNSIGNED_SHORT;
          break;

        case GL_UNSIGNED_INT:
        case GL_INT:
          dtype = GL_UNSIGNED_INT;
          break;

        default:

      }
      elements.buffer.dtype = dtype;
    }
    elements.type = dtype;

    // Check oes_element_index_uint extension


    // try to guess default primitive type and arguments
    var vertCount = count;
    if (vertCount < 0) {
      vertCount = elements.buffer.byteLength;
      if (dtype === GL_UNSIGNED_SHORT) {
        vertCount >>= 1;
      } else if (dtype === GL_UNSIGNED_INT) {
        vertCount >>= 2;
      }
    }
    elements.vertCount = vertCount;

    // try to guess primitive type from cell dimension
    var primType = prim;
    if (prim < 0) {
      primType = GL_TRIANGLES;
      var dimension = elements.buffer.dimension;
      if (dimension === 1) primType = GL_POINTS;
      if (dimension === 2) primType = GL_LINES;
      if (dimension === 3) primType = GL_TRIANGLES;
    }
    elements.primType = primType;
  }

  function destroyElements(elements) {
    stats.elementsCount--;

    delete elementSet[elements.id];
    elements.buffer.destroy();
    elements.buffer = null;
  }

  function createElements(options, persistent) {
    var buffer = bufferState.create(null, GL_ELEMENT_ARRAY_BUFFER, true);
    var elements = new REGLElementBuffer(buffer._buffer);
    stats.elementsCount++;

    function reglElements(options) {
      if (!options) {
        buffer();
        elements.primType = GL_TRIANGLES;
        elements.vertCount = 0;
        elements.type = GL_UNSIGNED_BYTE;
      } else if (typeof options === 'number') {
        buffer(options);
        elements.primType = GL_TRIANGLES;
        elements.vertCount = options | 0;
        elements.type = GL_UNSIGNED_BYTE;
      } else {
        var data = null;
        var usage = GL_STATIC_DRAW;
        var primType = -1;
        var vertCount = -1;
        var byteLength = 0;
        var dtype = 0;
        if (Array.isArray(options) || isTypedArray(options) || isNDArrayLike(options)) {
          data = options;
        } else {

          if ('data' in options) {
            data = options.data;
          }
          if ('usage' in options) {

            usage = usageTypes[options.usage];
          }
          if ('primitive' in options) {

            primType = primTypes[options.primitive];
          }
          if ('count' in options) {

            vertCount = options.count | 0;
          }
          if ('type' in options) {

            dtype = elementTypes[options.type];
          }
          if ('length' in options) {
            byteLength = options.length | 0;
          } else {
            byteLength = vertCount;
            if (dtype === GL_UNSIGNED_SHORT || dtype === GL_SHORT) {
              byteLength *= 2;
            } else if (dtype === GL_UNSIGNED_INT || dtype === GL_INT) {
              byteLength *= 4;
            }
          }
        }
        initElements(elements, data, usage, primType, vertCount, byteLength, dtype);
      }

      return reglElements;
    }

    reglElements(options);

    reglElements._reglType = 'elements';
    reglElements._elements = elements;
    reglElements.subdata = function (data, offset) {
      buffer.subdata(data, offset);
      return reglElements;
    };
    reglElements.destroy = function () {
      destroyElements(elements);
    };

    return reglElements;
  }

  return {
    create: createElements,
    createStream: createElementStream,
    destroyStream: destroyElementStream,
    getElements: function (elements) {
      if (typeof elements === 'function' && elements._elements instanceof REGLElementBuffer) {
        return elements._elements;
      }
      return null;
    },
    clear: function () {
      values(elementSet).forEach(destroyElements);
    }
  };
};

},{"./constants/primitives.json":7,"./constants/usage.json":8,"./util/is-ndarray":27,"./util/is-typed-array":28,"./util/values":33}],12:[function(require,module,exports){


module.exports = function createExtensionCache(gl, config) {
  var extensions = {};

  function tryLoadExtension(name_) {

    var name = name_.toLowerCase();
    var ext;
    try {
      ext = extensions[name] = gl.getExtension(name);
    } catch (e) {}
    return !!ext;
  }

  for (var i = 0; i < config.extensions.length; ++i) {
    var name = config.extensions[i];
    if (!tryLoadExtension(name)) {
      config.onDestroy();
      config.onDone('"' + name + '" extension is not supported by the current WebGL context, try upgrading your system or a different browser');
      return null;
    }
  }

  config.optionalExtensions.forEach(tryLoadExtension);

  return {
    extensions: extensions,
    restore: function () {
      Object.keys(extensions).forEach(function (name) {
        if (!tryLoadExtension(name)) {
          throw new Error('(regl): error restoring extension ' + name);
        }
      });
    }
  };
};

},{}],13:[function(require,module,exports){

var values = require('./util/values');
var extend = require('./util/extend');

// We store these constants so that the minifier can inline them
var GL_FRAMEBUFFER = 0x8D40;
var GL_RENDERBUFFER = 0x8D41;

var GL_TEXTURE_2D = 0x0DE1;
var GL_TEXTURE_CUBE_MAP_POSITIVE_X = 0x8515;

var GL_COLOR_ATTACHMENT0 = 0x8CE0;
var GL_DEPTH_ATTACHMENT = 0x8D00;
var GL_STENCIL_ATTACHMENT = 0x8D20;
var GL_DEPTH_STENCIL_ATTACHMENT = 0x821A;

var GL_FRAMEBUFFER_COMPLETE = 0x8CD5;
var GL_FRAMEBUFFER_INCOMPLETE_ATTACHMENT = 0x8CD6;
var GL_FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT = 0x8CD7;
var GL_FRAMEBUFFER_INCOMPLETE_DIMENSIONS = 0x8CD9;
var GL_FRAMEBUFFER_UNSUPPORTED = 0x8CDD;

var GL_HALF_FLOAT_OES = 0x8D61;
var GL_UNSIGNED_BYTE = 0x1401;
var GL_FLOAT = 0x1406;

var GL_RGBA = 0x1908;

var GL_DEPTH_COMPONENT = 0x1902;

var colorTextureFormatEnums = [GL_RGBA];

// for every texture format, store
// the number of channels
var textureFormatChannels = [];
textureFormatChannels[GL_RGBA] = 4;

// for every texture type, store
// the size in bytes.
var textureTypeSizes = [];
textureTypeSizes[GL_UNSIGNED_BYTE] = 1;
textureTypeSizes[GL_FLOAT] = 4;
textureTypeSizes[GL_HALF_FLOAT_OES] = 2;

var GL_RGBA4 = 0x8056;
var GL_RGB5_A1 = 0x8057;
var GL_RGB565 = 0x8D62;
var GL_DEPTH_COMPONENT16 = 0x81A5;
var GL_STENCIL_INDEX8 = 0x8D48;
var GL_DEPTH_STENCIL = 0x84F9;

var GL_SRGB8_ALPHA8_EXT = 0x8C43;

var GL_RGBA32F_EXT = 0x8814;

var GL_RGBA16F_EXT = 0x881A;
var GL_RGB16F_EXT = 0x881B;

var colorRenderbufferFormatEnums = [GL_RGBA4, GL_RGB5_A1, GL_RGB565, GL_SRGB8_ALPHA8_EXT, GL_RGBA16F_EXT, GL_RGB16F_EXT, GL_RGBA32F_EXT];

var statusCode = {};
statusCode[GL_FRAMEBUFFER_COMPLETE] = 'complete';
statusCode[GL_FRAMEBUFFER_INCOMPLETE_ATTACHMENT] = 'incomplete attachment';
statusCode[GL_FRAMEBUFFER_INCOMPLETE_DIMENSIONS] = 'incomplete dimensions';
statusCode[GL_FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT] = 'incomplete, missing attachment';
statusCode[GL_FRAMEBUFFER_UNSUPPORTED] = 'unsupported';

module.exports = function wrapFBOState(gl, extensions, limits, textureState, renderbufferState, stats) {
  var framebufferState = {
    cur: null,
    next: null,
    dirty: false
  };

  var colorTextureFormats = ['rgba'];
  var colorRenderbufferFormats = ['rgba4', 'rgb565', 'rgb5 a1'];

  if (extensions.ext_srgb) {
    colorRenderbufferFormats.push('srgba');
  }

  if (extensions.ext_color_buffer_half_float) {
    colorRenderbufferFormats.push('rgba16f', 'rgb16f');
  }

  if (extensions.webgl_color_buffer_float) {
    colorRenderbufferFormats.push('rgba32f');
  }

  var colorTypes = ['uint8'];
  if (extensions.oes_texture_half_float) {
    colorTypes.push('half float', 'float16');
  }
  if (extensions.oes_texture_float) {
    colorTypes.push('float', 'float32');
  }

  function FramebufferAttachment(target, texture, renderbuffer) {
    this.target = target;
    this.texture = texture;
    this.renderbuffer = renderbuffer;

    var w = 0;
    var h = 0;
    if (texture) {
      w = texture.width;
      h = texture.height;
    } else if (renderbuffer) {
      w = renderbuffer.width;
      h = renderbuffer.height;
    }
    this.width = w;
    this.height = h;
  }

  function decRef(attachment) {
    if (attachment) {
      if (attachment.texture) {
        attachment.texture._texture.decRef();
      }
      if (attachment.renderbuffer) {
        attachment.renderbuffer._renderbuffer.decRef();
      }
    }
  }

  function incRefAndCheckShape(attachment, width, height) {
    if (!attachment) {
      return;
    }
    if (attachment.texture) {
      var texture = attachment.texture._texture;
      var tw = Math.max(1, texture.width);
      var th = Math.max(1, texture.height);

      texture.refCount += 1;
    } else {
      var renderbuffer = attachment.renderbuffer._renderbuffer;

      renderbuffer.refCount += 1;
    }
  }

  function attach(location, attachment) {
    if (attachment) {
      if (attachment.texture) {
        gl.framebufferTexture2D(GL_FRAMEBUFFER, location, attachment.target, attachment.texture._texture.texture, 0);
      } else {
        gl.framebufferRenderbuffer(GL_FRAMEBUFFER, location, GL_RENDERBUFFER, attachment.renderbuffer._renderbuffer.renderbuffer);
      }
    }
  }

  function parseAttachment(attachment) {
    var target = GL_TEXTURE_2D;
    var texture = null;
    var renderbuffer = null;

    var data = attachment;
    if (typeof attachment === 'object') {
      data = attachment.data;
      if ('target' in attachment) {
        target = attachment.target | 0;
      }
    }

    var type = data._reglType;
    if (type === 'texture2d') {
      texture = data;
    } else if (type === 'textureCube') {
      texture = data;
    } else if (type === 'renderbuffer') {
      renderbuffer = data;
      target = GL_RENDERBUFFER;
    } else {}

    return new FramebufferAttachment(target, texture, renderbuffer);
  }

  function allocAttachment(width, height, isTexture, format, type) {
    if (isTexture) {
      var texture = textureState.create2D({
        width: width,
        height: height,
        format: format,
        type: type
      });
      texture._texture.refCount = 0;
      return new FramebufferAttachment(GL_TEXTURE_2D, texture, null);
    } else {
      var rb = renderbufferState.create({
        width: width,
        height: height,
        format: format
      });
      rb._renderbuffer.refCount = 0;
      return new FramebufferAttachment(GL_RENDERBUFFER, null, rb);
    }
  }

  function unwrapAttachment(attachment) {
    return attachment && (attachment.texture || attachment.renderbuffer);
  }

  function resizeAttachment(attachment, w, h) {
    if (attachment) {
      if (attachment.texture) {
        attachment.texture.resize(w, h);
      } else if (attachment.renderbuffer) {
        attachment.renderbuffer.resize(w, h);
      }
    }
  }

  var framebufferCount = 0;
  var framebufferSet = {};

  function REGLFramebuffer() {
    this.id = framebufferCount++;
    framebufferSet[this.id] = this;

    this.framebuffer = gl.createFramebuffer();
    this.width = 0;
    this.height = 0;

    this.colorAttachments = [];
    this.depthAttachment = null;
    this.stencilAttachment = null;
    this.depthStencilAttachment = null;
  }

  function decFBORefs(framebuffer) {
    framebuffer.colorAttachments.forEach(decRef);
    decRef(framebuffer.depthAttachment);
    decRef(framebuffer.stencilAttachment);
    decRef(framebuffer.depthStencilAttachment);
  }

  function destroy(framebuffer) {
    var handle = framebuffer.framebuffer;

    gl.deleteFramebuffer(handle);
    framebuffer.framebuffer = null;
    stats.framebufferCount--;
    delete framebufferSet[framebuffer.id];
  }

  function updateFramebuffer(framebuffer) {
    var i;

    gl.bindFramebuffer(GL_FRAMEBUFFER, framebuffer.framebuffer);
    var colorAttachments = framebuffer.colorAttachments;
    for (i = 0; i < colorAttachments.length; ++i) {
      attach(GL_COLOR_ATTACHMENT0 + i, colorAttachments[i]);
    }
    for (i = colorAttachments.length; i < limits.maxColorAttachments; ++i) {
      gl.framebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0 + i, GL_TEXTURE_2D, null, 0);
    }

    gl.framebufferTexture2D(GL_FRAMEBUFFER, GL_DEPTH_STENCIL_ATTACHMENT, GL_TEXTURE_2D, null, 0);
    gl.framebufferTexture2D(GL_FRAMEBUFFER, GL_DEPTH_ATTACHMENT, GL_TEXTURE_2D, null, 0);
    gl.framebufferTexture2D(GL_FRAMEBUFFER, GL_STENCIL_ATTACHMENT, GL_TEXTURE_2D, null, 0);

    attach(GL_DEPTH_ATTACHMENT, framebuffer.depthAttachment);
    attach(GL_STENCIL_ATTACHMENT, framebuffer.stencilAttachment);
    attach(GL_DEPTH_STENCIL_ATTACHMENT, framebuffer.depthStencilAttachment);

    // Check status code
    var status = gl.checkFramebufferStatus(GL_FRAMEBUFFER);
    if (status !== GL_FRAMEBUFFER_COMPLETE) {}

    gl.bindFramebuffer(GL_FRAMEBUFFER, framebufferState.next);
    framebufferState.cur = framebufferState.next;

    // FIXME: Clear error code here.  This is a work around for a bug in
    // headless-gl
    gl.getError();
  }

  function createFBO(a0, a1) {
    var framebuffer = new REGLFramebuffer();
    stats.framebufferCount++;

    function reglFramebuffer(a, b) {
      var i;

      var extDrawBuffers = extensions.webgl_draw_buffers;

      var width = 0;
      var height = 0;

      var needsDepth = true;
      var needsStencil = true;

      var colorBuffer = null;
      var colorTexture = true;
      var colorFormat = 'rgba';
      var colorType = 'uint8';
      var colorCount = 1;

      var depthBuffer = null;
      var stencilBuffer = null;
      var depthStencilBuffer = null;
      var depthStencilTexture = false;

      if (typeof a === 'number') {
        width = a | 0;
        height = b | 0 || width;
      } else if (!a) {
        width = height = 1;
      } else {

        var options = a;

        if ('shape' in options) {
          var shape = options.shape;

          width = shape[0];
          height = shape[1];
        } else {
          if ('radius' in options) {
            width = height = options.radius;
          }
          if ('width' in options) {
            width = options.width;
          }
          if ('height' in options) {
            height = options.height;
          }
        }

        if ('color' in options || 'colors' in options) {
          colorBuffer = options.color || options.colors;
          if (Array.isArray(colorBuffer)) {}
        }

        if (!colorBuffer) {
          if ('colorCount' in options) {
            colorCount = options.colorCount | 0;
          }

          if ('colorTexture' in options) {
            colorTexture = !!options.colorTexture;
            colorFormat = 'rgba4';
          }

          if ('colorType' in options) {
            colorType = options.colorType;
            if (!colorTexture) {
              if (colorType === 'half float' || colorType === 'float16') {

                colorFormat = 'rgba16f';
              } else if (colorType === 'float' || colorType === 'float32') {

                colorFormat = 'rgba32f';
              }
            } else {}
          }

          if ('colorFormat' in options) {
            colorFormat = options.colorFormat;
            if (colorTextureFormats.indexOf(colorFormat) >= 0) {
              colorTexture = true;
            } else if (colorRenderbufferFormats.indexOf(colorFormat) >= 0) {
              colorTexture = false;
            } else {
              if (colorTexture) {} else {}
            }
          }
        }

        if ('depthTexture' in options || 'depthStencilTexture' in options) {
          depthStencilTexture = !!(options.depthTexture || options.depthStencilTexture);
        }

        if ('depth' in options) {
          if (typeof options.depth === 'boolean') {
            needsDepth = options.depth;
          } else {
            depthBuffer = options.depth;
            needsStencil = false;
          }
        }

        if ('stencil' in options) {
          if (typeof options.stencil === 'boolean') {
            needsStencil = options.stencil;
          } else {
            stencilBuffer = options.stencil;
            needsDepth = false;
          }
        }

        if ('depthStencil' in options) {
          if (typeof options.depthStencil === 'boolean') {
            needsDepth = needsStencil = options.depthStencil;
          } else {
            depthStencilBuffer = options.depthStencil;
            needsDepth = false;
            needsStencil = false;
          }
        }
      }

      // parse attachments
      var colorAttachments = null;
      var depthAttachment = null;
      var stencilAttachment = null;
      var depthStencilAttachment = null;

      // Set up color attachments
      if (Array.isArray(colorBuffer)) {
        colorAttachments = colorBuffer.map(parseAttachment);
      } else if (colorBuffer) {
        colorAttachments = [parseAttachment(colorBuffer)];
      } else {
        colorAttachments = new Array(colorCount);
        for (i = 0; i < colorCount; ++i) {
          colorAttachments[i] = allocAttachment(width, height, colorTexture, colorFormat, colorType);
        }
      }

      width = width || colorAttachments[0].width;
      height = height || colorAttachments[0].height;

      if (depthBuffer) {
        depthAttachment = parseAttachment(depthBuffer);
      } else if (needsDepth && !needsStencil) {
        depthAttachment = allocAttachment(width, height, depthStencilTexture, 'depth', 'uint32');
      }

      if (stencilBuffer) {
        stencilAttachment = parseAttachment(stencilBuffer);
      } else if (needsStencil && !needsDepth) {
        stencilAttachment = allocAttachment(width, height, false, 'stencil', 'uint8');
      }

      if (depthStencilBuffer) {
        depthStencilAttachment = parseAttachment(depthStencilBuffer);
      } else if (!depthBuffer && !stencilBuffer && needsStencil && needsDepth) {
        depthStencilAttachment = allocAttachment(width, height, depthStencilTexture, 'depth stencil', 'depth stencil');
      }

      var commonColorAttachmentSize = null;

      for (i = 0; i < colorAttachments.length; ++i) {
        incRefAndCheckShape(colorAttachments[i], width, height);

        if (colorAttachments[i] && colorAttachments[i].texture) {
          var colorAttachmentSize = textureFormatChannels[colorAttachments[i].texture._texture.format] * textureTypeSizes[colorAttachments[i].texture._texture.type];

          if (commonColorAttachmentSize === null) {
            commonColorAttachmentSize = colorAttachmentSize;
          } else {
            // We need to make sure that all color attachments have the same number of bitplanes
            // (that is, the same numer of bits per pixel)
            // This is required by the GLES2.0 standard. See the beginning of Chapter 4 in that document.

          }
        }
      }
      incRefAndCheckShape(depthAttachment, width, height);

      incRefAndCheckShape(stencilAttachment, width, height);

      incRefAndCheckShape(depthStencilAttachment, width, height);

      // decrement references
      decFBORefs(framebuffer);

      framebuffer.width = width;
      framebuffer.height = height;

      framebuffer.colorAttachments = colorAttachments;
      framebuffer.depthAttachment = depthAttachment;
      framebuffer.stencilAttachment = stencilAttachment;
      framebuffer.depthStencilAttachment = depthStencilAttachment;

      reglFramebuffer.color = colorAttachments.map(unwrapAttachment);
      reglFramebuffer.depth = unwrapAttachment(depthAttachment);
      reglFramebuffer.stencil = unwrapAttachment(stencilAttachment);
      reglFramebuffer.depthStencil = unwrapAttachment(depthStencilAttachment);

      reglFramebuffer.width = framebuffer.width;
      reglFramebuffer.height = framebuffer.height;

      updateFramebuffer(framebuffer);

      return reglFramebuffer;
    }

    function resize(w_, h_) {

      var w = w_ | 0;
      var h = h_ | 0 || w;
      if (w === framebuffer.width && h === framebuffer.height) {
        return reglFramebuffer;
      }

      // resize all buffers
      var colorAttachments = framebuffer.colorAttachments;
      for (var i = 0; i < colorAttachments.length; ++i) {
        resizeAttachment(colorAttachments[i], w, h);
      }
      resizeAttachment(framebuffer.depthAttachment, w, h);
      resizeAttachment(framebuffer.stencilAttachment, w, h);
      resizeAttachment(framebuffer.depthStencilAttachment, w, h);

      framebuffer.width = reglFramebuffer.width = w;
      framebuffer.height = reglFramebuffer.height = h;

      updateFramebuffer(framebuffer);

      return reglFramebuffer;
    }

    reglFramebuffer(a0, a1);

    return extend(reglFramebuffer, {
      resize: resize,
      _reglType: 'framebuffer',
      _framebuffer: framebuffer,
      destroy: function () {
        destroy(framebuffer);
        decFBORefs(framebuffer);
      }
    });
  }

  function createCubeFBO(options) {
    var faces = Array(6);

    function reglFramebufferCube(a) {
      var i;

      var extDrawBuffers = extensions.webgl_draw_buffers;

      var params = {
        color: null
      };

      var radius = 0;

      var colorBuffer = null;
      var colorFormat = 'rgba';
      var colorType = 'uint8';
      var colorCount = 1;

      if (typeof a === 'number') {
        radius = a | 0;
      } else if (!a) {
        radius = 1;
      } else {

        var options = a;

        if ('shape' in options) {
          var shape = options.shape;

          radius = shape[0];
        } else {
          if ('radius' in options) {
            radius = options.radius | 0;
          }
          if ('width' in options) {
            radius = options.width | 0;
            if ('height' in options) {}
          } else if ('height' in options) {
            radius = options.height | 0;
          }
        }

        if ('color' in options || 'colors' in options) {
          colorBuffer = options.color || options.colors;
          if (Array.isArray(colorBuffer)) {}
        }

        if (!colorBuffer) {
          if ('colorCount' in options) {
            colorCount = options.colorCount | 0;
          }

          if ('colorType' in options) {

            colorType = options.colorType;
          }

          if ('colorFormat' in options) {
            colorFormat = options.colorFormat;
          }
        }

        if ('depth' in options) {
          params.depth = options.depth;
        }

        if ('stencil' in options) {
          params.stencil = options.stencil;
        }

        if ('depthStencil' in options) {
          params.depthStencil = options.depthStencil;
        }
      }

      var colorCubes;
      if (colorBuffer) {
        if (Array.isArray(colorBuffer)) {
          colorCubes = [];
          for (i = 0; i < colorBuffer.length; ++i) {
            colorCubes[i] = colorBuffer[i];
          }
        } else {
          colorCubes = [colorBuffer];
        }
      } else {
        colorCubes = Array(colorCount);
        var cubeMapParams = {
          radius: radius,
          format: colorFormat,
          type: colorType
        };
        for (i = 0; i < colorCount; ++i) {
          colorCubes[i] = textureState.createCube(cubeMapParams);
        }
      }

      // Check color cubes
      params.color = Array(colorCubes.length);
      for (i = 0; i < colorCubes.length; ++i) {
        var cube = colorCubes[i];

        radius = radius || cube.width;

        params.color[i] = {
          target: GL_TEXTURE_CUBE_MAP_POSITIVE_X,
          data: colorCubes[i]
        };
      }

      for (i = 0; i < 6; ++i) {
        for (var j = 0; j < colorCubes.length; ++j) {
          params.color[j].target = GL_TEXTURE_CUBE_MAP_POSITIVE_X + i;
        }
        // reuse depth-stencil attachments across all cube maps
        if (i > 0) {
          params.depth = faces[0].depth;
          params.stencil = faces[0].stencil;
          params.depthStencil = faces[0].depthStencil;
        }
        if (faces[i]) {
          faces[i](params);
        } else {
          faces[i] = createFBO(params);
        }
      }

      return extend(reglFramebufferCube, {
        width: radius,
        height: radius,
        color: colorCubes
      });
    }

    function resize(radius_) {
      var i;
      var radius = radius_ | 0;

      if (radius === reglFramebufferCube.width) {
        return reglFramebufferCube;
      }

      var colors = reglFramebufferCube.color;
      for (i = 0; i < colors.length; ++i) {
        colors[i].resize(radius);
      }

      for (i = 0; i < 6; ++i) {
        faces[i].resize(radius);
      }

      reglFramebufferCube.width = reglFramebufferCube.height = radius;

      return reglFramebufferCube;
    }

    reglFramebufferCube(options);

    return extend(reglFramebufferCube, {
      faces: faces,
      resize: resize,
      _reglType: 'framebufferCube',
      destroy: function () {
        faces.forEach(function (f) {
          f.destroy();
        });
      }
    });
  }

  function restoreFramebuffers() {
    values(framebufferSet).forEach(function (fb) {
      fb.framebuffer = gl.createFramebuffer();
      updateFramebuffer(fb);
    });
  }

  return extend(framebufferState, {
    getFramebuffer: function (object) {
      if (typeof object === 'function' && object._reglType === 'framebuffer') {
        var fbo = object._framebuffer;
        if (fbo instanceof REGLFramebuffer) {
          return fbo;
        }
      }
      return null;
    },
    create: createFBO,
    createCube: createCubeFBO,
    clear: function () {
      values(framebufferSet).forEach(destroy);
    },
    restore: restoreFramebuffers
  });
};

},{"./util/extend":24,"./util/values":33}],14:[function(require,module,exports){
var GL_SUBPIXEL_BITS = 0x0D50;
var GL_RED_BITS = 0x0D52;
var GL_GREEN_BITS = 0x0D53;
var GL_BLUE_BITS = 0x0D54;
var GL_ALPHA_BITS = 0x0D55;
var GL_DEPTH_BITS = 0x0D56;
var GL_STENCIL_BITS = 0x0D57;

var GL_ALIASED_POINT_SIZE_RANGE = 0x846D;
var GL_ALIASED_LINE_WIDTH_RANGE = 0x846E;

var GL_MAX_TEXTURE_SIZE = 0x0D33;
var GL_MAX_VIEWPORT_DIMS = 0x0D3A;
var GL_MAX_VERTEX_ATTRIBS = 0x8869;
var GL_MAX_VERTEX_UNIFORM_VECTORS = 0x8DFB;
var GL_MAX_VARYING_VECTORS = 0x8DFC;
var GL_MAX_COMBINED_TEXTURE_IMAGE_UNITS = 0x8B4D;
var GL_MAX_VERTEX_TEXTURE_IMAGE_UNITS = 0x8B4C;
var GL_MAX_TEXTURE_IMAGE_UNITS = 0x8872;
var GL_MAX_FRAGMENT_UNIFORM_VECTORS = 0x8DFD;
var GL_MAX_CUBE_MAP_TEXTURE_SIZE = 0x851C;
var GL_MAX_RENDERBUFFER_SIZE = 0x84E8;

var GL_VENDOR = 0x1F00;
var GL_RENDERER = 0x1F01;
var GL_VERSION = 0x1F02;
var GL_SHADING_LANGUAGE_VERSION = 0x8B8C;

var GL_MAX_TEXTURE_MAX_ANISOTROPY_EXT = 0x84FF;

var GL_MAX_COLOR_ATTACHMENTS_WEBGL = 0x8CDF;
var GL_MAX_DRAW_BUFFERS_WEBGL = 0x8824;

module.exports = function (gl, extensions) {
  var maxAnisotropic = 1;
  if (extensions.ext_texture_filter_anisotropic) {
    maxAnisotropic = gl.getParameter(GL_MAX_TEXTURE_MAX_ANISOTROPY_EXT);
  }

  var maxDrawbuffers = 1;
  var maxColorAttachments = 1;
  if (extensions.webgl_draw_buffers) {
    maxDrawbuffers = gl.getParameter(GL_MAX_DRAW_BUFFERS_WEBGL);
    maxColorAttachments = gl.getParameter(GL_MAX_COLOR_ATTACHMENTS_WEBGL);
  }

  return {
    // drawing buffer bit depth
    colorBits: [gl.getParameter(GL_RED_BITS), gl.getParameter(GL_GREEN_BITS), gl.getParameter(GL_BLUE_BITS), gl.getParameter(GL_ALPHA_BITS)],
    depthBits: gl.getParameter(GL_DEPTH_BITS),
    stencilBits: gl.getParameter(GL_STENCIL_BITS),
    subpixelBits: gl.getParameter(GL_SUBPIXEL_BITS),

    // supported extensions
    extensions: Object.keys(extensions).filter(function (ext) {
      return !!extensions[ext];
    }),

    // max aniso samples
    maxAnisotropic: maxAnisotropic,

    // max draw buffers
    maxDrawbuffers: maxDrawbuffers,
    maxColorAttachments: maxColorAttachments,

    // point and line size ranges
    pointSizeDims: gl.getParameter(GL_ALIASED_POINT_SIZE_RANGE),
    lineWidthDims: gl.getParameter(GL_ALIASED_LINE_WIDTH_RANGE),
    maxViewportDims: gl.getParameter(GL_MAX_VIEWPORT_DIMS),
    maxCombinedTextureUnits: gl.getParameter(GL_MAX_COMBINED_TEXTURE_IMAGE_UNITS),
    maxCubeMapSize: gl.getParameter(GL_MAX_CUBE_MAP_TEXTURE_SIZE),
    maxRenderbufferSize: gl.getParameter(GL_MAX_RENDERBUFFER_SIZE),
    maxTextureUnits: gl.getParameter(GL_MAX_TEXTURE_IMAGE_UNITS),
    maxTextureSize: gl.getParameter(GL_MAX_TEXTURE_SIZE),
    maxAttributes: gl.getParameter(GL_MAX_VERTEX_ATTRIBS),
    maxVertexUniforms: gl.getParameter(GL_MAX_VERTEX_UNIFORM_VECTORS),
    maxVertexTextureUnits: gl.getParameter(GL_MAX_VERTEX_TEXTURE_IMAGE_UNITS),
    maxVaryingVectors: gl.getParameter(GL_MAX_VARYING_VECTORS),
    maxFragmentUniforms: gl.getParameter(GL_MAX_FRAGMENT_UNIFORM_VECTORS),

    // vendor info
    glsl: gl.getParameter(GL_SHADING_LANGUAGE_VERSION),
    renderer: gl.getParameter(GL_RENDERER),
    vendor: gl.getParameter(GL_VENDOR),
    version: gl.getParameter(GL_VERSION)
  };
};

},{}],15:[function(require,module,exports){

var isTypedArray = require('./util/is-typed-array');

var GL_RGBA = 6408;
var GL_UNSIGNED_BYTE = 5121;
var GL_PACK_ALIGNMENT = 0x0D05;
var GL_FLOAT = 0x1406; // 5126

module.exports = function wrapReadPixels(gl, framebufferState, reglPoll, context, glAttributes, extensions) {
  function readPixels(input) {
    var type;
    if (framebufferState.next === null) {

      type = GL_UNSIGNED_BYTE;
    } else {

      type = framebufferState.next.colorAttachments[0].texture._texture.type;

      if (extensions.oes_texture_float) {} else {}
    }

    var x = 0;
    var y = 0;
    var width = context.framebufferWidth;
    var height = context.framebufferHeight;
    var data = null;

    if (isTypedArray(input)) {
      data = input;
    } else if (input) {

      x = input.x | 0;
      y = input.y | 0;

      width = (input.width || context.framebufferWidth - x) | 0;
      height = (input.height || context.framebufferHeight - y) | 0;
      data = input.data || null;
    }

    // sanity check input.data
    if (data) {
      if (type === GL_UNSIGNED_BYTE) {} else if (type === GL_FLOAT) {}
    }

    // Update WebGL state
    reglPoll();

    // Compute size
    var size = width * height * 4;

    // Allocate data
    if (!data) {
      if (type === GL_UNSIGNED_BYTE) {
        data = new Uint8Array(size);
      } else if (type === GL_FLOAT) {
        data = data || new Float32Array(size);
      }
    }

    // Type check


    // Run read pixels
    gl.pixelStorei(GL_PACK_ALIGNMENT, 4);
    gl.readPixels(x, y, width, height, GL_RGBA, type, data);

    return data;
  }

  return readPixels;
};

},{"./util/is-typed-array":28}],16:[function(require,module,exports){

var values = require('./util/values');

var GL_RENDERBUFFER = 0x8D41;

var GL_RGBA4 = 0x8056;
var GL_RGB5_A1 = 0x8057;
var GL_RGB565 = 0x8D62;
var GL_DEPTH_COMPONENT16 = 0x81A5;
var GL_STENCIL_INDEX8 = 0x8D48;
var GL_DEPTH_STENCIL = 0x84F9;

var GL_SRGB8_ALPHA8_EXT = 0x8C43;

var GL_RGBA32F_EXT = 0x8814;

var GL_RGBA16F_EXT = 0x881A;
var GL_RGB16F_EXT = 0x881B;

var FORMAT_SIZES = [];

FORMAT_SIZES[GL_RGBA4] = 2;
FORMAT_SIZES[GL_RGB5_A1] = 2;
FORMAT_SIZES[GL_RGB565] = 2;

FORMAT_SIZES[GL_DEPTH_COMPONENT16] = 2;
FORMAT_SIZES[GL_STENCIL_INDEX8] = 1;
FORMAT_SIZES[GL_DEPTH_STENCIL] = 4;

FORMAT_SIZES[GL_SRGB8_ALPHA8_EXT] = 4;
FORMAT_SIZES[GL_RGBA32F_EXT] = 16;
FORMAT_SIZES[GL_RGBA16F_EXT] = 8;
FORMAT_SIZES[GL_RGB16F_EXT] = 6;

function getRenderbufferSize(format, width, height) {
  return FORMAT_SIZES[format] * width * height;
}

module.exports = function (gl, extensions, limits, stats, config) {
  var formatTypes = {
    'rgba4': GL_RGBA4,
    'rgb565': GL_RGB565,
    'rgb5 a1': GL_RGB5_A1,
    'depth': GL_DEPTH_COMPONENT16,
    'stencil': GL_STENCIL_INDEX8,
    'depth stencil': GL_DEPTH_STENCIL
  };

  if (extensions.ext_srgb) {
    formatTypes['srgba'] = GL_SRGB8_ALPHA8_EXT;
  }

  if (extensions.ext_color_buffer_half_float) {
    formatTypes['rgba16f'] = GL_RGBA16F_EXT;
    formatTypes['rgb16f'] = GL_RGB16F_EXT;
  }

  if (extensions.webgl_color_buffer_float) {
    formatTypes['rgba32f'] = GL_RGBA32F_EXT;
  }

  var formatTypesInvert = [];
  Object.keys(formatTypes).forEach(function (key) {
    var val = formatTypes[key];
    formatTypesInvert[val] = key;
  });

  var renderbufferCount = 0;
  var renderbufferSet = {};

  function REGLRenderbuffer(renderbuffer) {
    this.id = renderbufferCount++;
    this.refCount = 1;

    this.renderbuffer = renderbuffer;

    this.format = GL_RGBA4;
    this.width = 0;
    this.height = 0;

    if (config.profile) {
      this.stats = { size: 0 };
    }
  }

  REGLRenderbuffer.prototype.decRef = function () {
    if (--this.refCount <= 0) {
      destroy(this);
    }
  };

  function destroy(rb) {
    var handle = rb.renderbuffer;

    gl.bindRenderbuffer(GL_RENDERBUFFER, null);
    gl.deleteRenderbuffer(handle);
    rb.renderbuffer = null;
    rb.refCount = 0;
    delete renderbufferSet[rb.id];
    stats.renderbufferCount--;
  }

  function createRenderbuffer(a, b) {
    var renderbuffer = new REGLRenderbuffer(gl.createRenderbuffer());
    renderbufferSet[renderbuffer.id] = renderbuffer;
    stats.renderbufferCount++;

    function reglRenderbuffer(a, b) {
      var w = 0;
      var h = 0;
      var format = GL_RGBA4;

      if (typeof a === 'object' && a) {
        var options = a;
        if ('shape' in options) {
          var shape = options.shape;

          w = shape[0] | 0;
          h = shape[1] | 0;
        } else {
          if ('radius' in options) {
            w = h = options.radius | 0;
          }
          if ('width' in options) {
            w = options.width | 0;
          }
          if ('height' in options) {
            h = options.height | 0;
          }
        }
        if ('format' in options) {

          format = formatTypes[options.format];
        }
      } else if (typeof a === 'number') {
        w = a | 0;
        if (typeof b === 'number') {
          h = b | 0;
        } else {
          h = w;
        }
      } else if (!a) {
        w = h = 1;
      } else {}

      // check shape


      if (w === renderbuffer.width && h === renderbuffer.height && format === renderbuffer.format) {
        return;
      }

      reglRenderbuffer.width = renderbuffer.width = w;
      reglRenderbuffer.height = renderbuffer.height = h;
      renderbuffer.format = format;

      gl.bindRenderbuffer(GL_RENDERBUFFER, renderbuffer.renderbuffer);
      gl.renderbufferStorage(GL_RENDERBUFFER, format, w, h);

      if (config.profile) {
        renderbuffer.stats.size = getRenderbufferSize(renderbuffer.format, renderbuffer.width, renderbuffer.height);
      }
      reglRenderbuffer.format = formatTypesInvert[renderbuffer.format];

      return reglRenderbuffer;
    }

    function resize(w_, h_) {
      var w = w_ | 0;
      var h = h_ | 0 || w;

      if (w === renderbuffer.width && h === renderbuffer.height) {
        return reglRenderbuffer;
      }

      // check shape


      reglRenderbuffer.width = renderbuffer.width = w;
      reglRenderbuffer.height = renderbuffer.height = h;

      gl.bindRenderbuffer(GL_RENDERBUFFER, renderbuffer.renderbuffer);
      gl.renderbufferStorage(GL_RENDERBUFFER, renderbuffer.format, w, h);

      // also, recompute size.
      if (config.profile) {
        renderbuffer.stats.size = getRenderbufferSize(renderbuffer.format, renderbuffer.width, renderbuffer.height);
      }

      return reglRenderbuffer;
    }

    reglRenderbuffer(a, b);

    reglRenderbuffer.resize = resize;
    reglRenderbuffer._reglType = 'renderbuffer';
    reglRenderbuffer._renderbuffer = renderbuffer;
    if (config.profile) {
      reglRenderbuffer.stats = renderbuffer.stats;
    }
    reglRenderbuffer.destroy = function () {
      renderbuffer.decRef();
    };

    return reglRenderbuffer;
  }

  if (config.profile) {
    stats.getTotalRenderbufferSize = function () {
      var total = 0;
      Object.keys(renderbufferSet).forEach(function (key) {
        total += renderbufferSet[key].stats.size;
      });
      return total;
    };
  }

  function restoreRenderbuffers() {
    values(renderbufferSet).forEach(function (rb) {
      rb.renderbuffer = gl.createRenderbuffer();
      gl.bindRenderbuffer(GL_RENDERBUFFER, rb.renderbuffer);
      gl.renderbufferStorage(GL_RENDERBUFFER, rb.format, rb.width, rb.height);
    });
    gl.bindRenderbuffer(GL_RENDERBUFFER, null);
  }

  return {
    create: createRenderbuffer,
    clear: function () {
      values(renderbufferSet).forEach(destroy);
    },
    restore: restoreRenderbuffers
  };
};

},{"./util/values":33}],17:[function(require,module,exports){

var values = require('./util/values');

var GL_FRAGMENT_SHADER = 35632;
var GL_VERTEX_SHADER = 35633;

var GL_ACTIVE_UNIFORMS = 0x8B86;
var GL_ACTIVE_ATTRIBUTES = 0x8B89;

module.exports = function wrapShaderState(gl, stringStore, stats, config) {
  // ===================================================
  // glsl compilation and linking
  // ===================================================
  var fragShaders = {};
  var vertShaders = {};

  function ActiveInfo(name, id, location, info) {
    this.name = name;
    this.id = id;
    this.location = location;
    this.info = info;
  }

  function insertActiveInfo(list, info) {
    for (var i = 0; i < list.length; ++i) {
      if (list[i].id === info.id) {
        list[i].location = info.location;
        return;
      }
    }
    list.push(info);
  }

  function getShader(type, id, command) {
    var cache = type === GL_FRAGMENT_SHADER ? fragShaders : vertShaders;
    var shader = cache[id];

    if (!shader) {
      var source = stringStore.str(id);
      shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);

      cache[id] = shader;
    }

    return shader;
  }

  // ===================================================
  // program linking
  // ===================================================
  var programCache = {};
  var programList = [];

  var PROGRAM_COUNTER = 0;

  function REGLProgram(fragId, vertId) {
    this.id = PROGRAM_COUNTER++;
    this.fragId = fragId;
    this.vertId = vertId;
    this.program = null;
    this.uniforms = [];
    this.attributes = [];

    if (config.profile) {
      this.stats = {
        uniformsCount: 0,
        attributesCount: 0
      };
    }
  }

  function linkProgram(desc, command) {
    var i, info;

    // -------------------------------
    // compile & link
    // -------------------------------
    var fragShader = getShader(GL_FRAGMENT_SHADER, desc.fragId);
    var vertShader = getShader(GL_VERTEX_SHADER, desc.vertId);

    var program = desc.program = gl.createProgram();
    gl.attachShader(program, fragShader);
    gl.attachShader(program, vertShader);
    gl.linkProgram(program);

    // -------------------------------
    // grab uniforms
    // -------------------------------
    var numUniforms = gl.getProgramParameter(program, GL_ACTIVE_UNIFORMS);
    if (config.profile) {
      desc.stats.uniformsCount = numUniforms;
    }
    var uniforms = desc.uniforms;
    for (i = 0; i < numUniforms; ++i) {
      info = gl.getActiveUniform(program, i);
      if (info) {
        if (info.size > 1) {
          for (var j = 0; j < info.size; ++j) {
            var name = info.name.replace('[0]', '[' + j + ']');
            insertActiveInfo(uniforms, new ActiveInfo(name, stringStore.id(name), gl.getUniformLocation(program, name), info));
          }
        } else {
          insertActiveInfo(uniforms, new ActiveInfo(info.name, stringStore.id(info.name), gl.getUniformLocation(program, info.name), info));
        }
      }
    }

    // -------------------------------
    // grab attributes
    // -------------------------------
    var numAttributes = gl.getProgramParameter(program, GL_ACTIVE_ATTRIBUTES);
    if (config.profile) {
      desc.stats.attributesCount = numAttributes;
    }

    var attributes = desc.attributes;
    for (i = 0; i < numAttributes; ++i) {
      info = gl.getActiveAttrib(program, i);
      if (info) {
        insertActiveInfo(attributes, new ActiveInfo(info.name, stringStore.id(info.name), gl.getAttribLocation(program, info.name), info));
      }
    }
  }

  if (config.profile) {
    stats.getMaxUniformsCount = function () {
      var m = 0;
      programList.forEach(function (desc) {
        if (desc.stats.uniformsCount > m) {
          m = desc.stats.uniformsCount;
        }
      });
      return m;
    };

    stats.getMaxAttributesCount = function () {
      var m = 0;
      programList.forEach(function (desc) {
        if (desc.stats.attributesCount > m) {
          m = desc.stats.attributesCount;
        }
      });
      return m;
    };
  }

  function restoreShaders() {
    fragShaders = {};
    vertShaders = {};
    for (var i = 0; i < programList.length; ++i) {
      linkProgram(programList[i]);
    }
  }

  return {
    clear: function () {
      var deleteShader = gl.deleteShader.bind(gl);
      values(fragShaders).forEach(deleteShader);
      fragShaders = {};
      values(vertShaders).forEach(deleteShader);
      vertShaders = {};

      programList.forEach(function (desc) {
        gl.deleteProgram(desc.program);
      });
      programList.length = 0;
      programCache = {};

      stats.shaderCount = 0;
    },

    program: function (vertId, fragId, command) {

      stats.shaderCount++;

      var cache = programCache[fragId];
      if (!cache) {
        cache = programCache[fragId] = {};
      }
      var program = cache[vertId];
      if (!program) {
        program = new REGLProgram(fragId, vertId);
        linkProgram(program, command);
        cache[vertId] = program;
        programList.push(program);
      }
      return program;
    },

    restore: restoreShaders,

    shader: getShader,

    frag: -1,
    vert: -1
  };
};

},{"./util/values":33}],18:[function(require,module,exports){

module.exports = function stats() {
  return {
    bufferCount: 0,
    elementsCount: 0,
    framebufferCount: 0,
    shaderCount: 0,
    textureCount: 0,
    cubeCount: 0,
    renderbufferCount: 0,

    maxTextureUnits: 0
  };
};

},{}],19:[function(require,module,exports){
module.exports = function createStringStore() {
  var stringIds = { '': 0 };
  var stringValues = [''];
  return {
    id: function (str) {
      var result = stringIds[str];
      if (result) {
        return result;
      }
      result = stringIds[str] = stringValues.length;
      stringValues.push(str);
      return result;
    },

    str: function (id) {
      return stringValues[id];
    }
  };
};

},{}],20:[function(require,module,exports){

var extend = require('./util/extend');
var values = require('./util/values');
var isTypedArray = require('./util/is-typed-array');
var isNDArrayLike = require('./util/is-ndarray');
var pool = require('./util/pool');
var convertToHalfFloat = require('./util/to-half-float');
var isArrayLike = require('./util/is-array-like');
var flattenUtils = require('./util/flatten');

var dtypes = require('./constants/arraytypes.json');
var arrayTypes = require('./constants/arraytypes.json');

var GL_COMPRESSED_TEXTURE_FORMATS = 0x86A3;

var GL_TEXTURE_2D = 0x0DE1;
var GL_TEXTURE_CUBE_MAP = 0x8513;
var GL_TEXTURE_CUBE_MAP_POSITIVE_X = 0x8515;

var GL_RGBA = 0x1908;
var GL_ALPHA = 0x1906;
var GL_RGB = 0x1907;
var GL_LUMINANCE = 0x1909;
var GL_LUMINANCE_ALPHA = 0x190A;

var GL_RGBA4 = 0x8056;
var GL_RGB5_A1 = 0x8057;
var GL_RGB565 = 0x8D62;

var GL_UNSIGNED_SHORT_4_4_4_4 = 0x8033;
var GL_UNSIGNED_SHORT_5_5_5_1 = 0x8034;
var GL_UNSIGNED_SHORT_5_6_5 = 0x8363;
var GL_UNSIGNED_INT_24_8_WEBGL = 0x84FA;

var GL_DEPTH_COMPONENT = 0x1902;
var GL_DEPTH_STENCIL = 0x84F9;

var GL_SRGB_EXT = 0x8C40;
var GL_SRGB_ALPHA_EXT = 0x8C42;

var GL_HALF_FLOAT_OES = 0x8D61;

var GL_COMPRESSED_RGB_S3TC_DXT1_EXT = 0x83F0;
var GL_COMPRESSED_RGBA_S3TC_DXT1_EXT = 0x83F1;
var GL_COMPRESSED_RGBA_S3TC_DXT3_EXT = 0x83F2;
var GL_COMPRESSED_RGBA_S3TC_DXT5_EXT = 0x83F3;

var GL_COMPRESSED_RGB_ATC_WEBGL = 0x8C92;
var GL_COMPRESSED_RGBA_ATC_EXPLICIT_ALPHA_WEBGL = 0x8C93;
var GL_COMPRESSED_RGBA_ATC_INTERPOLATED_ALPHA_WEBGL = 0x87EE;

var GL_COMPRESSED_RGB_PVRTC_4BPPV1_IMG = 0x8C00;
var GL_COMPRESSED_RGB_PVRTC_2BPPV1_IMG = 0x8C01;
var GL_COMPRESSED_RGBA_PVRTC_4BPPV1_IMG = 0x8C02;
var GL_COMPRESSED_RGBA_PVRTC_2BPPV1_IMG = 0x8C03;

var GL_COMPRESSED_RGB_ETC1_WEBGL = 0x8D64;

var GL_UNSIGNED_BYTE = 0x1401;
var GL_UNSIGNED_SHORT = 0x1403;
var GL_UNSIGNED_INT = 0x1405;
var GL_FLOAT = 0x1406;

var GL_TEXTURE_WRAP_S = 0x2802;
var GL_TEXTURE_WRAP_T = 0x2803;

var GL_REPEAT = 0x2901;
var GL_CLAMP_TO_EDGE = 0x812F;
var GL_MIRRORED_REPEAT = 0x8370;

var GL_TEXTURE_MAG_FILTER = 0x2800;
var GL_TEXTURE_MIN_FILTER = 0x2801;

var GL_NEAREST = 0x2600;
var GL_LINEAR = 0x2601;
var GL_NEAREST_MIPMAP_NEAREST = 0x2700;
var GL_LINEAR_MIPMAP_NEAREST = 0x2701;
var GL_NEAREST_MIPMAP_LINEAR = 0x2702;
var GL_LINEAR_MIPMAP_LINEAR = 0x2703;

var GL_GENERATE_MIPMAP_HINT = 0x8192;
var GL_DONT_CARE = 0x1100;
var GL_FASTEST = 0x1101;
var GL_NICEST = 0x1102;

var GL_TEXTURE_MAX_ANISOTROPY_EXT = 0x84FE;

var GL_UNPACK_ALIGNMENT = 0x0CF5;
var GL_UNPACK_FLIP_Y_WEBGL = 0x9240;
var GL_UNPACK_PREMULTIPLY_ALPHA_WEBGL = 0x9241;
var GL_UNPACK_COLORSPACE_CONVERSION_WEBGL = 0x9243;

var GL_BROWSER_DEFAULT_WEBGL = 0x9244;

var GL_TEXTURE0 = 0x84C0;

var MIPMAP_FILTERS = [GL_NEAREST_MIPMAP_NEAREST, GL_NEAREST_MIPMAP_LINEAR, GL_LINEAR_MIPMAP_NEAREST, GL_LINEAR_MIPMAP_LINEAR];

var CHANNELS_FORMAT = [0, GL_LUMINANCE, GL_LUMINANCE_ALPHA, GL_RGB, GL_RGBA];

var FORMAT_CHANNELS = {};
FORMAT_CHANNELS[GL_LUMINANCE] = FORMAT_CHANNELS[GL_ALPHA] = FORMAT_CHANNELS[GL_DEPTH_COMPONENT] = 1;
FORMAT_CHANNELS[GL_DEPTH_STENCIL] = FORMAT_CHANNELS[GL_LUMINANCE_ALPHA] = 2;
FORMAT_CHANNELS[GL_RGB] = FORMAT_CHANNELS[GL_SRGB_EXT] = 3;
FORMAT_CHANNELS[GL_RGBA] = FORMAT_CHANNELS[GL_SRGB_ALPHA_EXT] = 4;

var formatTypes = {};
formatTypes[GL_RGBA4] = GL_UNSIGNED_SHORT_4_4_4_4;
formatTypes[GL_RGB565] = GL_UNSIGNED_SHORT_5_6_5;
formatTypes[GL_RGB5_A1] = GL_UNSIGNED_SHORT_5_5_5_1;
formatTypes[GL_DEPTH_COMPONENT] = GL_UNSIGNED_INT;
formatTypes[GL_DEPTH_STENCIL] = GL_UNSIGNED_INT_24_8_WEBGL;

function objectName(str) {
  return '[object ' + str + ']';
}

var CANVAS_CLASS = objectName('HTMLCanvasElement');
var CONTEXT2D_CLASS = objectName('CanvasRenderingContext2D');
var IMAGE_CLASS = objectName('HTMLImageElement');
var VIDEO_CLASS = objectName('HTMLVideoElement');

var PIXEL_CLASSES = Object.keys(dtypes).concat([CANVAS_CLASS, CONTEXT2D_CLASS, IMAGE_CLASS, VIDEO_CLASS]);

// for every texture type, store
// the size in bytes.
var TYPE_SIZES = [];
TYPE_SIZES[GL_UNSIGNED_BYTE] = 1;
TYPE_SIZES[GL_FLOAT] = 4;
TYPE_SIZES[GL_HALF_FLOAT_OES] = 2;

TYPE_SIZES[GL_UNSIGNED_SHORT] = 2;
TYPE_SIZES[GL_UNSIGNED_INT] = 4;

var FORMAT_SIZES_SPECIAL = [];
FORMAT_SIZES_SPECIAL[GL_RGBA4] = 2;
FORMAT_SIZES_SPECIAL[GL_RGB5_A1] = 2;
FORMAT_SIZES_SPECIAL[GL_RGB565] = 2;
FORMAT_SIZES_SPECIAL[GL_DEPTH_STENCIL] = 4;

FORMAT_SIZES_SPECIAL[GL_COMPRESSED_RGB_S3TC_DXT1_EXT] = 0.5;
FORMAT_SIZES_SPECIAL[GL_COMPRESSED_RGBA_S3TC_DXT1_EXT] = 0.5;
FORMAT_SIZES_SPECIAL[GL_COMPRESSED_RGBA_S3TC_DXT3_EXT] = 1;
FORMAT_SIZES_SPECIAL[GL_COMPRESSED_RGBA_S3TC_DXT5_EXT] = 1;

FORMAT_SIZES_SPECIAL[GL_COMPRESSED_RGB_ATC_WEBGL] = 0.5;
FORMAT_SIZES_SPECIAL[GL_COMPRESSED_RGBA_ATC_EXPLICIT_ALPHA_WEBGL] = 1;
FORMAT_SIZES_SPECIAL[GL_COMPRESSED_RGBA_ATC_INTERPOLATED_ALPHA_WEBGL] = 1;

FORMAT_SIZES_SPECIAL[GL_COMPRESSED_RGB_PVRTC_4BPPV1_IMG] = 0.5;
FORMAT_SIZES_SPECIAL[GL_COMPRESSED_RGB_PVRTC_2BPPV1_IMG] = 0.25;
FORMAT_SIZES_SPECIAL[GL_COMPRESSED_RGBA_PVRTC_4BPPV1_IMG] = 0.5;
FORMAT_SIZES_SPECIAL[GL_COMPRESSED_RGBA_PVRTC_2BPPV1_IMG] = 0.25;

FORMAT_SIZES_SPECIAL[GL_COMPRESSED_RGB_ETC1_WEBGL] = 0.5;

function isNumericArray(arr) {
  return Array.isArray(arr) && (arr.length === 0 || typeof arr[0] === 'number');
}

function isRectArray(arr) {
  if (!Array.isArray(arr)) {
    return false;
  }
  var width = arr.length;
  if (width === 0 || !isArrayLike(arr[0])) {
    return false;
  }
  return true;
}

function classString(x) {
  return Object.prototype.toString.call(x);
}

function isCanvasElement(object) {
  return classString(object) === CANVAS_CLASS;
}

function isContext2D(object) {
  return classString(object) === CONTEXT2D_CLASS;
}

function isImageElement(object) {
  return classString(object) === IMAGE_CLASS;
}

function isVideoElement(object) {
  return classString(object) === VIDEO_CLASS;
}

function isPixelData(object) {
  if (!object) {
    return false;
  }
  var className = classString(object);
  if (PIXEL_CLASSES.indexOf(className) >= 0) {
    return true;
  }
  return isNumericArray(object) || isRectArray(object) || isNDArrayLike(object);
}

function typedArrayCode(data) {
  return arrayTypes[Object.prototype.toString.call(data)] | 0;
}

function convertData(result, data) {
  var n = data.length;
  switch (result.type) {
    case GL_UNSIGNED_BYTE:
    case GL_UNSIGNED_SHORT:
    case GL_UNSIGNED_INT:
    case GL_FLOAT:
      var converted = pool.allocType(result.type, n);
      converted.set(data);
      result.data = converted;
      break;

    case GL_HALF_FLOAT_OES:
      result.data = convertToHalfFloat(data);
      break;

    default:

  }
}

function preConvert(image, n) {
  return pool.allocType(image.type === GL_HALF_FLOAT_OES ? GL_FLOAT : image.type, n);
}

function postConvert(image, data) {
  if (image.type === GL_HALF_FLOAT_OES) {
    image.data = convertToHalfFloat(data);
    pool.freeType(data);
  } else {
    image.data = data;
  }
}

function transposeData(image, array, strideX, strideY, strideC, offset) {
  var w = image.width;
  var h = image.height;
  var c = image.channels;
  var n = w * h * c;
  var data = preConvert(image, n);

  var p = 0;
  for (var i = 0; i < h; ++i) {
    for (var j = 0; j < w; ++j) {
      for (var k = 0; k < c; ++k) {
        data[p++] = array[strideX * j + strideY * i + strideC * k + offset];
      }
    }
  }

  postConvert(image, data);
}

function getTextureSize(format, type, width, height, isMipmap, isCube) {
  var s;
  if (typeof FORMAT_SIZES_SPECIAL[format] !== 'undefined') {
    // we have a special array for dealing with weird color formats such as RGB5A1
    s = FORMAT_SIZES_SPECIAL[format];
  } else {
    s = FORMAT_CHANNELS[format] * TYPE_SIZES[type];
  }

  if (isCube) {
    s *= 6;
  }

  if (isMipmap) {
    // compute the total size of all the mipmaps.
    var total = 0;

    var w = width;
    while (w >= 1) {
      // we can only use mipmaps on a square image,
      // so we can simply use the width and ignore the height:
      total += s * w * w;
      w /= 2;
    }
    return total;
  } else {
    return s * width * height;
  }
}

module.exports = function createTextureSet(gl, extensions, limits, reglPoll, contextState, stats, config) {
  // -------------------------------------------------------
  // Initialize constants and parameter tables here
  // -------------------------------------------------------
  var mipmapHint = {
    "don't care": GL_DONT_CARE,
    'dont care': GL_DONT_CARE,
    'nice': GL_NICEST,
    'fast': GL_FASTEST
  };

  var wrapModes = {
    'repeat': GL_REPEAT,
    'clamp': GL_CLAMP_TO_EDGE,
    'mirror': GL_MIRRORED_REPEAT
  };

  var magFilters = {
    'nearest': GL_NEAREST,
    'linear': GL_LINEAR
  };

  var minFilters = extend({
    'mipmap': GL_LINEAR_MIPMAP_LINEAR,
    'nearest mipmap nearest': GL_NEAREST_MIPMAP_NEAREST,
    'linear mipmap nearest': GL_LINEAR_MIPMAP_NEAREST,
    'nearest mipmap linear': GL_NEAREST_MIPMAP_LINEAR,
    'linear mipmap linear': GL_LINEAR_MIPMAP_LINEAR
  }, magFilters);

  var colorSpace = {
    'none': 0,
    'browser': GL_BROWSER_DEFAULT_WEBGL
  };

  var textureTypes = {
    'uint8': GL_UNSIGNED_BYTE,
    'rgba4': GL_UNSIGNED_SHORT_4_4_4_4,
    'rgb565': GL_UNSIGNED_SHORT_5_6_5,
    'rgb5 a1': GL_UNSIGNED_SHORT_5_5_5_1
  };

  var textureFormats = {
    'alpha': GL_ALPHA,
    'luminance': GL_LUMINANCE,
    'luminance alpha': GL_LUMINANCE_ALPHA,
    'rgb': GL_RGB,
    'rgba': GL_RGBA,
    'rgba4': GL_RGBA4,
    'rgb5 a1': GL_RGB5_A1,
    'rgb565': GL_RGB565
  };

  var compressedTextureFormats = {};

  if (extensions.ext_srgb) {
    textureFormats.srgb = GL_SRGB_EXT;
    textureFormats.srgba = GL_SRGB_ALPHA_EXT;
  }

  if (extensions.oes_texture_float) {
    textureTypes.float32 = textureTypes.float = GL_FLOAT;
  }

  if (extensions.oes_texture_half_float) {
    textureTypes['float16'] = textureTypes['half float'] = GL_HALF_FLOAT_OES;
  }

  if (extensions.webgl_depth_texture) {
    extend(textureFormats, {
      'depth': GL_DEPTH_COMPONENT,
      'depth stencil': GL_DEPTH_STENCIL
    });

    extend(textureTypes, {
      'uint16': GL_UNSIGNED_SHORT,
      'uint32': GL_UNSIGNED_INT,
      'depth stencil': GL_UNSIGNED_INT_24_8_WEBGL
    });
  }

  if (extensions.webgl_compressed_texture_s3tc) {
    extend(compressedTextureFormats, {
      'rgb s3tc dxt1': GL_COMPRESSED_RGB_S3TC_DXT1_EXT,
      'rgba s3tc dxt1': GL_COMPRESSED_RGBA_S3TC_DXT1_EXT,
      'rgba s3tc dxt3': GL_COMPRESSED_RGBA_S3TC_DXT3_EXT,
      'rgba s3tc dxt5': GL_COMPRESSED_RGBA_S3TC_DXT5_EXT
    });
  }

  if (extensions.webgl_compressed_texture_atc) {
    extend(compressedTextureFormats, {
      'rgb atc': GL_COMPRESSED_RGB_ATC_WEBGL,
      'rgba atc explicit alpha': GL_COMPRESSED_RGBA_ATC_EXPLICIT_ALPHA_WEBGL,
      'rgba atc interpolated alpha': GL_COMPRESSED_RGBA_ATC_INTERPOLATED_ALPHA_WEBGL
    });
  }

  if (extensions.webgl_compressed_texture_pvrtc) {
    extend(compressedTextureFormats, {
      'rgb pvrtc 4bppv1': GL_COMPRESSED_RGB_PVRTC_4BPPV1_IMG,
      'rgb pvrtc 2bppv1': GL_COMPRESSED_RGB_PVRTC_2BPPV1_IMG,
      'rgba pvrtc 4bppv1': GL_COMPRESSED_RGBA_PVRTC_4BPPV1_IMG,
      'rgba pvrtc 2bppv1': GL_COMPRESSED_RGBA_PVRTC_2BPPV1_IMG
    });
  }

  if (extensions.webgl_compressed_texture_etc1) {
    compressedTextureFormats['rgb etc1'] = GL_COMPRESSED_RGB_ETC1_WEBGL;
  }

  // Copy over all texture formats
  var supportedCompressedFormats = Array.prototype.slice.call(gl.getParameter(GL_COMPRESSED_TEXTURE_FORMATS));
  Object.keys(compressedTextureFormats).forEach(function (name) {
    var format = compressedTextureFormats[name];
    if (supportedCompressedFormats.indexOf(format) >= 0) {
      textureFormats[name] = format;
    }
  });

  var supportedFormats = Object.keys(textureFormats);
  limits.textureFormats = supportedFormats;

  // associate with every format string its
  // corresponding GL-value.
  var textureFormatsInvert = [];
  Object.keys(textureFormats).forEach(function (key) {
    var val = textureFormats[key];
    textureFormatsInvert[val] = key;
  });

  // associate with every type string its
  // corresponding GL-value.
  var textureTypesInvert = [];
  Object.keys(textureTypes).forEach(function (key) {
    var val = textureTypes[key];
    textureTypesInvert[val] = key;
  });

  var magFiltersInvert = [];
  Object.keys(magFilters).forEach(function (key) {
    var val = magFilters[key];
    magFiltersInvert[val] = key;
  });

  var minFiltersInvert = [];
  Object.keys(minFilters).forEach(function (key) {
    var val = minFilters[key];
    minFiltersInvert[val] = key;
  });

  var wrapModesInvert = [];
  Object.keys(wrapModes).forEach(function (key) {
    var val = wrapModes[key];
    wrapModesInvert[val] = key;
  });

  // colorFormats[] gives the format (channels) associated to an
  // internalformat
  var colorFormats = supportedFormats.reduce(function (color, key) {
    var glenum = textureFormats[key];
    if (glenum === GL_LUMINANCE || glenum === GL_ALPHA || glenum === GL_LUMINANCE || glenum === GL_LUMINANCE_ALPHA || glenum === GL_DEPTH_COMPONENT || glenum === GL_DEPTH_STENCIL) {
      color[glenum] = glenum;
    } else if (glenum === GL_RGB5_A1 || key.indexOf('rgba') >= 0) {
      color[glenum] = GL_RGBA;
    } else {
      color[glenum] = GL_RGB;
    }
    return color;
  }, {});

  function TexFlags() {
    // format info
    this.internalformat = GL_RGBA;
    this.format = GL_RGBA;
    this.type = GL_UNSIGNED_BYTE;
    this.compressed = false;

    // pixel storage
    this.premultiplyAlpha = false;
    this.flipY = false;
    this.unpackAlignment = 1;
    this.colorSpace = 0;

    // shape info
    this.width = 0;
    this.height = 0;
    this.channels = 0;
  }

  function copyFlags(result, other) {
    result.internalformat = other.internalformat;
    result.format = other.format;
    result.type = other.type;
    result.compressed = other.compressed;

    result.premultiplyAlpha = other.premultiplyAlpha;
    result.flipY = other.flipY;
    result.unpackAlignment = other.unpackAlignment;
    result.colorSpace = other.colorSpace;

    result.width = other.width;
    result.height = other.height;
    result.channels = other.channels;
  }

  function parseFlags(flags, options) {
    if (typeof options !== 'object' || !options) {
      return;
    }

    if ('premultiplyAlpha' in options) {

      flags.premultiplyAlpha = options.premultiplyAlpha;
    }

    if ('flipY' in options) {

      flags.flipY = options.flipY;
    }

    if ('alignment' in options) {

      flags.unpackAlignment = options.alignment;
    }

    if ('colorSpace' in options) {

      flags.colorSpace = colorSpace[options.colorSpace];
    }

    if ('type' in options) {
      var type = options.type;

      flags.type = textureTypes[type];
    }

    var w = flags.width;
    var h = flags.height;
    var c = flags.channels;
    var hasChannels = false;
    if ('shape' in options) {

      w = options.shape[0];
      h = options.shape[1];
      if (options.shape.length === 3) {
        c = options.shape[2];

        hasChannels = true;
      }
    } else {
      if ('radius' in options) {
        w = h = options.radius;
      }
      if ('width' in options) {
        w = options.width;
      }
      if ('height' in options) {
        h = options.height;
      }
      if ('channels' in options) {
        c = options.channels;

        hasChannels = true;
      }
    }
    flags.width = w | 0;
    flags.height = h | 0;
    flags.channels = c | 0;

    var hasFormat = false;
    if ('format' in options) {
      var formatStr = options.format;

      var internalformat = flags.internalformat = textureFormats[formatStr];
      flags.format = colorFormats[internalformat];
      if (formatStr in textureTypes) {
        if (!('type' in options)) {
          flags.type = textureTypes[formatStr];
        }
      }
      if (formatStr in compressedTextureFormats) {
        flags.compressed = true;
      }
      hasFormat = true;
    }

    // Reconcile channels and format
    if (!hasChannels && hasFormat) {
      flags.channels = FORMAT_CHANNELS[flags.format];
    } else if (hasChannels && !hasFormat) {
      if (flags.channels !== CHANNELS_FORMAT[flags.format]) {
        flags.format = flags.internalformat = CHANNELS_FORMAT[flags.channels];
      }
    } else if (hasFormat && hasChannels) {}
  }

  function setFlags(flags) {
    gl.pixelStorei(GL_UNPACK_FLIP_Y_WEBGL, flags.flipY);
    gl.pixelStorei(GL_UNPACK_PREMULTIPLY_ALPHA_WEBGL, flags.premultiplyAlpha);
    gl.pixelStorei(GL_UNPACK_COLORSPACE_CONVERSION_WEBGL, flags.colorSpace);
    gl.pixelStorei(GL_UNPACK_ALIGNMENT, flags.unpackAlignment);
  }

  // -------------------------------------------------------
  // Tex image data
  // -------------------------------------------------------
  function TexImage() {
    TexFlags.call(this);

    this.xOffset = 0;
    this.yOffset = 0;

    // data
    this.data = null;
    this.needsFree = false;

    // html element
    this.element = null;

    // copyTexImage info
    this.needsCopy = false;
  }

  function parseImage(image, options) {
    var data = null;
    if (isPixelData(options)) {
      data = options;
    } else if (options) {

      parseFlags(image, options);
      if ('x' in options) {
        image.xOffset = options.x | 0;
      }
      if ('y' in options) {
        image.yOffset = options.y | 0;
      }
      if (isPixelData(options.data)) {
        data = options.data;
      }
    }

    if (options.copy) {

      var viewW = contextState.viewportWidth;
      var viewH = contextState.viewportHeight;
      image.width = image.width || viewW - image.xOffset;
      image.height = image.height || viewH - image.yOffset;
      image.needsCopy = true;
    } else if (!data) {
      image.width = image.width || 1;
      image.height = image.height || 1;
      image.channels = image.channels || 4;
    } else if (isTypedArray(data)) {
      image.channels = image.channels || 4;
      image.data = data;
      if (!('type' in options) && image.type === GL_UNSIGNED_BYTE) {
        image.type = typedArrayCode(data);
      }
    } else if (isNumericArray(data)) {
      image.channels = image.channels || 4;
      convertData(image, data);
      image.alignment = 1;
      image.needsFree = true;
    } else if (isNDArrayLike(data)) {
      var array = data.data;
      if (!Array.isArray(array) && image.type === GL_UNSIGNED_BYTE) {
        image.type = typedArrayCode(array);
      }
      var shape = data.shape;
      var stride = data.stride;
      var shapeX, shapeY, shapeC, strideX, strideY, strideC;
      if (shape.length === 3) {
        shapeC = shape[2];
        strideC = stride[2];
      } else {

        shapeC = 1;
        strideC = 1;
      }
      shapeX = shape[0];
      shapeY = shape[1];
      strideX = stride[0];
      strideY = stride[1];
      image.alignment = 1;
      image.width = shapeX;
      image.height = shapeY;
      image.channels = shapeC;
      image.format = image.internalformat = CHANNELS_FORMAT[shapeC];
      image.needsFree = true;
      transposeData(image, array, strideX, strideY, strideC, data.offset);
    } else if (isCanvasElement(data) || isContext2D(data)) {
      if (isCanvasElement(data)) {
        image.element = data;
      } else {
        image.element = data.canvas;
      }
      image.width = image.element.width;
      image.height = image.element.height;
      image.channels = 4;
    } else if (isImageElement(data)) {
      image.element = data;
      image.width = data.naturalWidth;
      image.height = data.naturalHeight;
      image.channels = 4;
    } else if (isVideoElement(data)) {
      image.element = data;
      image.width = data.videoWidth;
      image.height = data.videoHeight;
      image.channels = 4;
    } else if (isRectArray(data)) {
      var w = image.width || data[0].length;
      var h = image.height || data.length;
      var c = image.channels;
      if (isArrayLike(data[0][0])) {
        c = c || data[0][0].length;
      } else {
        c = c || 1;
      }
      var arrayShape = flattenUtils.shape(data);
      var n = 1;
      for (var dd = 0; dd < arrayShape.length; ++dd) {
        n *= arrayShape[dd];
      }
      var allocData = preConvert(image, n);
      flattenUtils.flatten(data, arrayShape, '', allocData);
      postConvert(image, allocData);
      image.alignment = 1;
      image.width = w;
      image.height = h;
      image.channels = c;
      image.format = image.internalformat = CHANNELS_FORMAT[c];
      image.needsFree = true;
    }

    if (image.type === GL_FLOAT) {} else if (image.type === GL_HALF_FLOAT_OES) {}

    // do compressed texture  validation here.
  }

  function setImage(info, target, miplevel) {
    var element = info.element;
    var data = info.data;
    var internalformat = info.internalformat;
    var format = info.format;
    var type = info.type;
    var width = info.width;
    var height = info.height;

    setFlags(info);

    if (element) {
      gl.texImage2D(target, miplevel, format, format, type, element);
    } else if (info.compressed) {
      gl.compressedTexImage2D(target, miplevel, internalformat, width, height, 0, data);
    } else if (info.needsCopy) {
      reglPoll();
      gl.copyTexImage2D(target, miplevel, format, info.xOffset, info.yOffset, width, height, 0);
    } else {
      gl.texImage2D(target, miplevel, format, width, height, 0, format, type, data);
    }
  }

  function setSubImage(info, target, x, y, miplevel) {
    var element = info.element;
    var data = info.data;
    var internalformat = info.internalformat;
    var format = info.format;
    var type = info.type;
    var width = info.width;
    var height = info.height;

    setFlags(info);

    if (element) {
      gl.texSubImage2D(target, miplevel, x, y, format, type, element);
    } else if (info.compressed) {
      gl.compressedTexSubImage2D(target, miplevel, x, y, internalformat, width, height, data);
    } else if (info.needsCopy) {
      reglPoll();
      gl.copyTexSubImage2D(target, miplevel, x, y, info.xOffset, info.yOffset, width, height);
    } else {
      gl.texSubImage2D(target, miplevel, x, y, width, height, format, type, data);
    }
  }

  // texImage pool
  var imagePool = [];

  function allocImage() {
    return imagePool.pop() || new TexImage();
  }

  function freeImage(image) {
    if (image.needsFree) {
      pool.freeType(image.data);
    }
    TexImage.call(image);
    imagePool.push(image);
  }

  // -------------------------------------------------------
  // Mip map
  // -------------------------------------------------------
  function MipMap() {
    TexFlags.call(this);

    this.genMipmaps = false;
    this.mipmapHint = GL_DONT_CARE;
    this.mipmask = 0;
    this.images = Array(16);
  }

  function parseMipMapFromShape(mipmap, width, height) {
    var img = mipmap.images[0] = allocImage();
    mipmap.mipmask = 1;
    img.width = mipmap.width = width;
    img.height = mipmap.height = height;
    img.channels = mipmap.channels = 4;
  }

  function parseMipMapFromObject(mipmap, options) {
    var imgData = null;
    if (isPixelData(options)) {
      imgData = mipmap.images[0] = allocImage();
      copyFlags(imgData, mipmap);
      parseImage(imgData, options);
      mipmap.mipmask = 1;
    } else {
      parseFlags(mipmap, options);
      if (Array.isArray(options.mipmap)) {
        var mipData = options.mipmap;
        for (var i = 0; i < mipData.length; ++i) {
          imgData = mipmap.images[i] = allocImage();
          copyFlags(imgData, mipmap);
          imgData.width >>= i;
          imgData.height >>= i;
          parseImage(imgData, mipData[i]);
          mipmap.mipmask |= 1 << i;
        }
      } else {
        imgData = mipmap.images[0] = allocImage();
        copyFlags(imgData, mipmap);
        parseImage(imgData, options);
        mipmap.mipmask = 1;
      }
    }
    copyFlags(mipmap, mipmap.images[0]);

    // For textures of the compressed format WEBGL_compressed_texture_s3tc
    // we must have that
    //
    // "When level equals zero width and height must be a multiple of 4.
    // When level is greater than 0 width and height must be 0, 1, 2 or a multiple of 4. "
    //
    // but we do not yet support having multiple mipmap levels for compressed textures,
    // so we only test for level zero.

    if (mipmap.compressed && mipmap.internalformat === GL_COMPRESSED_RGB_S3TC_DXT1_EXT || mipmap.internalformat === GL_COMPRESSED_RGBA_S3TC_DXT1_EXT || mipmap.internalformat === GL_COMPRESSED_RGBA_S3TC_DXT3_EXT || mipmap.internalformat === GL_COMPRESSED_RGBA_S3TC_DXT5_EXT) {}
  }

  function setMipMap(mipmap, target) {
    var images = mipmap.images;
    for (var i = 0; i < images.length; ++i) {
      if (!images[i]) {
        return;
      }
      setImage(images[i], target, i);
    }
  }

  var mipPool = [];

  function allocMipMap() {
    var result = mipPool.pop() || new MipMap();
    TexFlags.call(result);
    result.mipmask = 0;
    for (var i = 0; i < 16; ++i) {
      result.images[i] = null;
    }
    return result;
  }

  function freeMipMap(mipmap) {
    var images = mipmap.images;
    for (var i = 0; i < images.length; ++i) {
      if (images[i]) {
        freeImage(images[i]);
      }
      images[i] = null;
    }
    mipPool.push(mipmap);
  }

  // -------------------------------------------------------
  // Tex info
  // -------------------------------------------------------
  function TexInfo() {
    this.minFilter = GL_NEAREST;
    this.magFilter = GL_NEAREST;

    this.wrapS = GL_CLAMP_TO_EDGE;
    this.wrapT = GL_CLAMP_TO_EDGE;

    this.anisotropic = 1;

    this.genMipmaps = false;
    this.mipmapHint = GL_DONT_CARE;
  }

  function parseTexInfo(info, options) {
    if ('min' in options) {
      var minFilter = options.min;

      info.minFilter = minFilters[minFilter];
      if (MIPMAP_FILTERS.indexOf(info.minFilter) >= 0) {
        info.genMipmaps = true;
      }
    }

    if ('mag' in options) {
      var magFilter = options.mag;

      info.magFilter = magFilters[magFilter];
    }

    var wrapS = info.wrapS;
    var wrapT = info.wrapT;
    if ('wrap' in options) {
      var wrap = options.wrap;
      if (typeof wrap === 'string') {

        wrapS = wrapT = wrapModes[wrap];
      } else if (Array.isArray(wrap)) {

        wrapS = wrapModes[wrap[0]];
        wrapT = wrapModes[wrap[1]];
      }
    } else {
      if ('wrapS' in options) {
        var optWrapS = options.wrapS;

        wrapS = wrapModes[optWrapS];
      }
      if ('wrapT' in options) {
        var optWrapT = options.wrapT;

        wrapT = wrapModes[optWrapT];
      }
    }
    info.wrapS = wrapS;
    info.wrapT = wrapT;

    if ('anisotropic' in options) {
      var anisotropic = options.anisotropic;

      info.anisotropic = options.anisotropic;
    }

    if ('mipmap' in options) {
      var hasMipMap = false;
      switch (typeof options.mipmap) {
        case 'string':

          info.mipmapHint = mipmapHint[options.mipmap];
          info.genMipmaps = true;
          hasMipMap = true;
          break;

        case 'boolean':
          hasMipMap = info.genMipmaps = options.mipmap;
          break;

        case 'object':

          info.genMipmaps = false;
          hasMipMap = true;
          break;

        default:

      }
      if (hasMipMap && !('min' in options)) {
        info.minFilter = GL_NEAREST_MIPMAP_NEAREST;
      }
    }
  }

  function setTexInfo(info, target) {
    gl.texParameteri(target, GL_TEXTURE_MIN_FILTER, info.minFilter);
    gl.texParameteri(target, GL_TEXTURE_MAG_FILTER, info.magFilter);
    gl.texParameteri(target, GL_TEXTURE_WRAP_S, info.wrapS);
    gl.texParameteri(target, GL_TEXTURE_WRAP_T, info.wrapT);
    if (extensions.ext_texture_filter_anisotropic) {
      gl.texParameteri(target, GL_TEXTURE_MAX_ANISOTROPY_EXT, info.anisotropic);
    }
    if (info.genMipmaps) {
      gl.hint(GL_GENERATE_MIPMAP_HINT, info.mipmapHint);
      gl.generateMipmap(target);
    }
  }

  // -------------------------------------------------------
  // Full texture object
  // -------------------------------------------------------
  var textureCount = 0;
  var textureSet = {};
  var numTexUnits = limits.maxTextureUnits;
  var textureUnits = Array(numTexUnits).map(function () {
    return null;
  });

  function REGLTexture(target) {
    TexFlags.call(this);
    this.mipmask = 0;
    this.internalformat = GL_RGBA;

    this.id = textureCount++;

    this.refCount = 1;

    this.target = target;
    this.texture = gl.createTexture();

    this.unit = -1;
    this.bindCount = 0;

    this.texInfo = new TexInfo();

    if (config.profile) {
      this.stats = { size: 0 };
    }
  }

  function tempBind(texture) {
    gl.activeTexture(GL_TEXTURE0);
    gl.bindTexture(texture.target, texture.texture);
  }

  function tempRestore() {
    var prev = textureUnits[0];
    if (prev) {
      gl.bindTexture(prev.target, prev.texture);
    } else {
      gl.bindTexture(GL_TEXTURE_2D, null);
    }
  }

  function destroy(texture) {
    var handle = texture.texture;

    var unit = texture.unit;
    var target = texture.target;
    if (unit >= 0) {
      gl.activeTexture(GL_TEXTURE0 + unit);
      gl.bindTexture(target, null);
      textureUnits[unit] = null;
    }
    gl.deleteTexture(handle);
    texture.texture = null;
    texture.params = null;
    texture.pixels = null;
    texture.refCount = 0;
    delete textureSet[texture.id];
    stats.textureCount--;
  }

  extend(REGLTexture.prototype, {
    bind: function () {
      var texture = this;
      texture.bindCount += 1;
      var unit = texture.unit;
      if (unit < 0) {
        for (var i = 0; i < numTexUnits; ++i) {
          var other = textureUnits[i];
          if (other) {
            if (other.bindCount > 0) {
              continue;
            }
            other.unit = -1;
          }
          textureUnits[i] = texture;
          unit = i;
          break;
        }
        if (unit >= numTexUnits) {}
        if (config.profile && stats.maxTextureUnits < unit + 1) {
          stats.maxTextureUnits = unit + 1; // +1, since the units are zero-based
        }
        texture.unit = unit;
        gl.activeTexture(GL_TEXTURE0 + unit);
        gl.bindTexture(texture.target, texture.texture);
      }
      return unit;
    },

    unbind: function () {
      this.bindCount -= 1;
    },

    decRef: function () {
      if (--this.refCount <= 0) {
        destroy(this);
      }
    }
  });

  function createTexture2D(a, b) {
    var texture = new REGLTexture(GL_TEXTURE_2D);
    textureSet[texture.id] = texture;
    stats.textureCount++;

    function reglTexture2D(a, b) {
      var texInfo = texture.texInfo;
      TexInfo.call(texInfo);
      var mipData = allocMipMap();

      if (typeof a === 'number') {
        if (typeof b === 'number') {
          parseMipMapFromShape(mipData, a | 0, b | 0);
        } else {
          parseMipMapFromShape(mipData, a | 0, a | 0);
        }
      } else if (a) {

        parseTexInfo(texInfo, a);
        parseMipMapFromObject(mipData, a);
      } else {
        // empty textures get assigned a default shape of 1x1
        parseMipMapFromShape(mipData, 1, 1);
      }

      if (texInfo.genMipmaps) {
        mipData.mipmask = (mipData.width << 1) - 1;
      }
      texture.mipmask = mipData.mipmask;

      copyFlags(texture, mipData);

      texture.internalformat = mipData.internalformat;

      reglTexture2D.width = mipData.width;
      reglTexture2D.height = mipData.height;

      tempBind(texture);
      setMipMap(mipData, GL_TEXTURE_2D);
      setTexInfo(texInfo, GL_TEXTURE_2D);
      tempRestore();

      freeMipMap(mipData);

      if (config.profile) {
        texture.stats.size = getTextureSize(texture.internalformat, texture.type, mipData.width, mipData.height, texInfo.genMipmaps, false);
      }
      reglTexture2D.format = textureFormatsInvert[texture.internalformat];
      reglTexture2D.type = textureTypesInvert[texture.type];

      reglTexture2D.mag = magFiltersInvert[texInfo.magFilter];
      reglTexture2D.min = minFiltersInvert[texInfo.minFilter];

      reglTexture2D.wrapS = wrapModesInvert[texInfo.wrapS];
      reglTexture2D.wrapT = wrapModesInvert[texInfo.wrapT];

      return reglTexture2D;
    }

    function subimage(image, x_, y_, level_) {

      var x = x_ | 0;
      var y = y_ | 0;
      var level = level_ | 0;

      var imageData = allocImage();
      copyFlags(imageData, texture);
      imageData.width = 0;
      imageData.height = 0;
      parseImage(imageData, image);
      imageData.width = imageData.width || (texture.width >> level) - x;
      imageData.height = imageData.height || (texture.height >> level) - y;

      tempBind(texture);
      setSubImage(imageData, GL_TEXTURE_2D, x, y, level);
      tempRestore();

      freeImage(imageData);

      return reglTexture2D;
    }

    function resize(w_, h_) {
      var w = w_ | 0;
      var h = h_ | 0 || w;
      if (w === texture.width && h === texture.height) {
        return reglTexture2D;
      }

      reglTexture2D.width = texture.width = w;
      reglTexture2D.height = texture.height = h;

      tempBind(texture);
      for (var i = 0; texture.mipmask >> i; ++i) {
        gl.texImage2D(GL_TEXTURE_2D, i, texture.format, w >> i, h >> i, 0, texture.format, texture.type, null);
      }
      tempRestore();

      // also, recompute the texture size.
      if (config.profile) {
        texture.stats.size = getTextureSize(texture.internalformat, texture.type, w, h, false, false);
      }

      return reglTexture2D;
    }

    reglTexture2D(a, b);

    reglTexture2D.subimage = subimage;
    reglTexture2D.resize = resize;
    reglTexture2D._reglType = 'texture2d';
    reglTexture2D._texture = texture;
    if (config.profile) {
      reglTexture2D.stats = texture.stats;
    }
    reglTexture2D.destroy = function () {
      texture.decRef();
    };

    return reglTexture2D;
  }

  function createTextureCube(a0, a1, a2, a3, a4, a5) {
    var texture = new REGLTexture(GL_TEXTURE_CUBE_MAP);
    textureSet[texture.id] = texture;
    stats.cubeCount++;

    var faces = new Array(6);

    function reglTextureCube(a0, a1, a2, a3, a4, a5) {
      var i;
      var texInfo = texture.texInfo;
      TexInfo.call(texInfo);
      for (i = 0; i < 6; ++i) {
        faces[i] = allocMipMap();
      }

      if (typeof a0 === 'number' || !a0) {
        var s = a0 | 0 || 1;
        for (i = 0; i < 6; ++i) {
          parseMipMapFromShape(faces[i], s, s);
        }
      } else if (typeof a0 === 'object') {
        if (a1) {
          parseMipMapFromObject(faces[0], a0);
          parseMipMapFromObject(faces[1], a1);
          parseMipMapFromObject(faces[2], a2);
          parseMipMapFromObject(faces[3], a3);
          parseMipMapFromObject(faces[4], a4);
          parseMipMapFromObject(faces[5], a5);
        } else {
          parseTexInfo(texInfo, a0);
          parseFlags(texture, a0);
          if ('faces' in a0) {
            var face_input = a0.faces;

            for (i = 0; i < 6; ++i) {

              copyFlags(faces[i], texture);
              parseMipMapFromObject(faces[i], face_input[i]);
            }
          } else {
            for (i = 0; i < 6; ++i) {
              parseMipMapFromObject(faces[i], a0);
            }
          }
        }
      } else {}

      copyFlags(texture, faces[0]);
      if (texInfo.genMipmaps) {
        texture.mipmask = (faces[0].width << 1) - 1;
      } else {
        texture.mipmask = faces[0].mipmask;
      }

      texture.internalformat = faces[0].internalformat;

      reglTextureCube.width = faces[0].width;
      reglTextureCube.height = faces[0].height;

      tempBind(texture);
      for (i = 0; i < 6; ++i) {
        setMipMap(faces[i], GL_TEXTURE_CUBE_MAP_POSITIVE_X + i);
      }
      setTexInfo(texInfo, GL_TEXTURE_CUBE_MAP);
      tempRestore();

      if (config.profile) {
        texture.stats.size = getTextureSize(texture.internalformat, texture.type, reglTextureCube.width, reglTextureCube.height, texInfo.genMipmaps, true);
      }

      reglTextureCube.format = textureFormatsInvert[texture.internalformat];
      reglTextureCube.type = textureTypesInvert[texture.type];

      reglTextureCube.mag = magFiltersInvert[texInfo.magFilter];
      reglTextureCube.min = minFiltersInvert[texInfo.minFilter];

      reglTextureCube.wrapS = wrapModesInvert[texInfo.wrapS];
      reglTextureCube.wrapT = wrapModesInvert[texInfo.wrapT];

      for (i = 0; i < 6; ++i) {
        freeMipMap(faces[i]);
      }

      return reglTextureCube;
    }

    function subimage(face, image, x_, y_, level_) {

      var x = x_ | 0;
      var y = y_ | 0;
      var level = level_ | 0;

      var imageData = allocImage();
      copyFlags(imageData, texture);
      imageData.width = 0;
      imageData.height = 0;
      parseImage(imageData, image);
      imageData.width = imageData.width || (texture.width >> level) - x;
      imageData.height = imageData.height || (texture.height >> level) - y;

      tempBind(texture);
      setSubImage(imageData, GL_TEXTURE_CUBE_MAP_POSITIVE_X + face, x, y, level);
      tempRestore();

      freeImage(imageData);

      return reglTextureCube;
    }

    function resize(radius_) {
      var radius = radius_ | 0;
      if (radius === texture.width) {
        return;
      }

      reglTextureCube.width = texture.width = radius;
      reglTextureCube.height = texture.height = radius;

      tempBind(texture);
      for (var i = 0; i < 6; ++i) {
        for (var j = 0; texture.mipmask >> j; ++j) {
          gl.texImage2D(GL_TEXTURE_CUBE_MAP_POSITIVE_X + i, j, texture.format, radius >> j, radius >> j, 0, texture.format, texture.type, null);
        }
      }
      tempRestore();

      if (config.profile) {
        texture.stats.size = getTextureSize(texture.internalformat, texture.type, reglTextureCube.width, reglTextureCube.height, false, true);
      }

      return reglTextureCube;
    }

    reglTextureCube(a0, a1, a2, a3, a4, a5);

    reglTextureCube.subimage = subimage;
    reglTextureCube.resize = resize;
    reglTextureCube._reglType = 'textureCube';
    reglTextureCube._texture = texture;
    if (config.profile) {
      reglTextureCube.stats = texture.stats;
    }
    reglTextureCube.destroy = function () {
      texture.decRef();
    };

    return reglTextureCube;
  }

  // Called when regl is destroyed
  function destroyTextures() {
    for (var i = 0; i < numTexUnits; ++i) {
      gl.activeTexture(GL_TEXTURE0 + i);
      gl.bindTexture(GL_TEXTURE_2D, null);
      textureUnits[i] = null;
    }
    values(textureSet).forEach(destroy);

    stats.cubeCount = 0;
    stats.textureCount = 0;
  }

  if (config.profile) {
    stats.getTotalTextureSize = function () {
      var total = 0;
      Object.keys(textureSet).forEach(function (key) {
        total += textureSet[key].stats.size;
      });
      return total;
    };
  }

  function restoreTextures() {
    values(textureSet).forEach(function (texture) {
      texture.texture = gl.createTexture();
      gl.bindTexture(texture.target, texture.texture);
      for (var i = 0; i < 32; ++i) {
        if ((texture.mipmask & 1 << i) === 0) {
          continue;
        }
        if (texture.target === GL_TEXTURE_2D) {
          gl.texImage2D(GL_TEXTURE_2D, i, texture.internalformat, texture.width >> i, texture.height >> i, 0, texture.internalformat, texture.type, null);
        } else {
          for (var j = 0; j < 6; ++j) {
            gl.texImage2D(GL_TEXTURE_CUBE_MAP_POSITIVE_X + j, i, texture.internalformat, texture.width >> i, texture.height >> i, 0, texture.internalformat, texture.type, null);
          }
        }
      }
      setTexInfo(texture.texInfo, texture.target);
    });
  }

  return {
    create2D: createTexture2D,
    createCube: createTextureCube,
    clear: destroyTextures,
    getTexture: function (wrapper) {
      return null;
    },
    restore: restoreTextures
  };
};

},{"./constants/arraytypes.json":5,"./util/extend":24,"./util/flatten":25,"./util/is-array-like":26,"./util/is-ndarray":27,"./util/is-typed-array":28,"./util/pool":30,"./util/to-half-float":32,"./util/values":33}],21:[function(require,module,exports){
var GL_QUERY_RESULT_EXT = 0x8866;
var GL_QUERY_RESULT_AVAILABLE_EXT = 0x8867;
var GL_TIME_ELAPSED_EXT = 0x88BF;

module.exports = function (gl, extensions) {
  var extTimer = extensions.ext_disjoint_timer_query;

  if (!extTimer) {
    return null;
  }

  // QUERY POOL BEGIN
  var queryPool = [];
  function allocQuery() {
    return queryPool.pop() || extTimer.createQueryEXT();
  }
  function freeQuery(query) {
    queryPool.push(query);
  }
  // QUERY POOL END

  var pendingQueries = [];
  function beginQuery(stats) {
    var query = allocQuery();
    extTimer.beginQueryEXT(GL_TIME_ELAPSED_EXT, query);
    pendingQueries.push(query);
    pushScopeStats(pendingQueries.length - 1, pendingQueries.length, stats);
  }

  function endQuery() {
    extTimer.endQueryEXT(GL_TIME_ELAPSED_EXT);
  }

  //
  // Pending stats pool.
  //
  function PendingStats() {
    this.startQueryIndex = -1;
    this.endQueryIndex = -1;
    this.sum = 0;
    this.stats = null;
  }
  var pendingStatsPool = [];
  function allocPendingStats() {
    return pendingStatsPool.pop() || new PendingStats();
  }
  function freePendingStats(pendingStats) {
    pendingStatsPool.push(pendingStats);
  }
  // Pending stats pool end

  var pendingStats = [];
  function pushScopeStats(start, end, stats) {
    var ps = allocPendingStats();
    ps.startQueryIndex = start;
    ps.endQueryIndex = end;
    ps.sum = 0;
    ps.stats = stats;
    pendingStats.push(ps);
  }

  // we should call this at the beginning of the frame,
  // in order to update gpuTime
  var timeSum = [];
  var queryPtr = [];
  function update() {
    var ptr, i;

    var n = pendingQueries.length;
    if (n === 0) {
      return;
    }

    // Reserve space
    queryPtr.length = Math.max(queryPtr.length, n + 1);
    timeSum.length = Math.max(timeSum.length, n + 1);
    timeSum[0] = 0;
    queryPtr[0] = 0;

    // Update all pending timer queries
    var queryTime = 0;
    ptr = 0;
    for (i = 0; i < pendingQueries.length; ++i) {
      var query = pendingQueries[i];
      if (extTimer.getQueryObjectEXT(query, GL_QUERY_RESULT_AVAILABLE_EXT)) {
        queryTime += extTimer.getQueryObjectEXT(query, GL_QUERY_RESULT_EXT);
        freeQuery(query);
      } else {
        pendingQueries[ptr++] = query;
      }
      timeSum[i + 1] = queryTime;
      queryPtr[i + 1] = ptr;
    }
    pendingQueries.length = ptr;

    // Update all pending stat queries
    ptr = 0;
    for (i = 0; i < pendingStats.length; ++i) {
      var stats = pendingStats[i];
      var start = stats.startQueryIndex;
      var end = stats.endQueryIndex;
      stats.sum += timeSum[end] - timeSum[start];
      var startPtr = queryPtr[start];
      var endPtr = queryPtr[end];
      if (endPtr === startPtr) {
        stats.stats.gpuTime += stats.sum / 1e6;
        freePendingStats(stats);
      } else {
        stats.startQueryIndex = startPtr;
        stats.endQueryIndex = endPtr;
        pendingStats[ptr++] = stats;
      }
    }
    pendingStats.length = ptr;
  }

  return {
    beginQuery: beginQuery,
    endQuery: endQuery,
    pushScopeStats: pushScopeStats,
    update: update,
    getNumPendingQueries: function () {
      return pendingQueries.length;
    },
    clear: function () {
      queryPool.push.apply(queryPool, pendingQueries);
      for (var i = 0; i < queryPool.length; i++) {
        extTimer.deleteQueryEXT(queryPool[i]);
      }
      pendingQueries.length = 0;
      queryPool.length = 0;
    },
    restore: function () {
      pendingQueries.length = 0;
      queryPool.length = 0;
    }
  };
};

},{}],22:[function(require,module,exports){
/* globals performance */
module.exports = typeof performance !== 'undefined' && performance.now ? function () {
  return performance.now();
} : function () {
  return +new Date();
};

},{}],23:[function(require,module,exports){
var extend = require('./extend');

function slice(x) {
  return Array.prototype.slice.call(x);
}

function join(x) {
  return slice(x).join('');
}

module.exports = function createEnvironment() {
  // Unique variable id counter
  var varCounter = 0;

  // Linked values are passed from this scope into the generated code block
  // Calling link() passes a value into the generated scope and returns
  // the variable name which it is bound to
  var linkedNames = [];
  var linkedValues = [];
  function link(value) {
    for (var i = 0; i < linkedValues.length; ++i) {
      if (linkedValues[i] === value) {
        return linkedNames[i];
      }
    }

    var name = 'g' + varCounter++;
    linkedNames.push(name);
    linkedValues.push(value);
    return name;
  }

  // create a code block
  function block() {
    var code = [];
    function push() {
      code.push.apply(code, slice(arguments));
    }

    var vars = [];
    function def() {
      var name = 'v' + varCounter++;
      vars.push(name);

      if (arguments.length > 0) {
        code.push(name, '=');
        code.push.apply(code, slice(arguments));
        code.push(';');
      }

      return name;
    }

    return extend(push, {
      def: def,
      toString: function () {
        return join([vars.length > 0 ? 'var ' + vars + ';' : '', join(code)]);
      }
    });
  }

  function scope() {
    var entry = block();
    var exit = block();

    var entryToString = entry.toString;
    var exitToString = exit.toString;

    function save(object, prop) {
      exit(object, prop, '=', entry.def(object, prop), ';');
    }

    return extend(function () {
      entry.apply(entry, slice(arguments));
    }, {
      def: entry.def,
      entry: entry,
      exit: exit,
      save: save,
      set: function (object, prop, value) {
        save(object, prop);
        entry(object, prop, '=', value, ';');
      },
      toString: function () {
        return entryToString() + exitToString();
      }
    });
  }

  function conditional() {
    var pred = join(arguments);
    var thenBlock = scope();
    var elseBlock = scope();

    var thenToString = thenBlock.toString;
    var elseToString = elseBlock.toString;

    return extend(thenBlock, {
      then: function () {
        thenBlock.apply(thenBlock, slice(arguments));
        return this;
      },
      else: function () {
        elseBlock.apply(elseBlock, slice(arguments));
        return this;
      },
      toString: function () {
        var elseClause = elseToString();
        if (elseClause) {
          elseClause = 'else{' + elseClause + '}';
        }
        return join(['if(', pred, '){', thenToString(), '}', elseClause]);
      }
    });
  }

  // procedure list
  var globalBlock = block();
  var procedures = {};
  function proc(name, count) {
    var args = [];
    function arg() {
      var name = 'a' + args.length;
      args.push(name);
      return name;
    }

    count = count || 0;
    for (var i = 0; i < count; ++i) {
      arg();
    }

    var body = scope();
    var bodyToString = body.toString;

    var result = procedures[name] = extend(body, {
      arg: arg,
      toString: function () {
        return join(['function(', args.join(), '){', bodyToString(), '}']);
      }
    });

    return result;
  }

  function compile() {
    var code = ['"use strict";', globalBlock, 'return {'];
    Object.keys(procedures).forEach(function (name) {
      code.push('"', name, '":', procedures[name].toString(), ',');
    });
    code.push('}');
    var src = join(code).replace(/;/g, ';\n').replace(/}/g, '}\n').replace(/{/g, '{\n');
    var proc = Function.apply(null, linkedNames.concat(src));
    return proc.apply(null, linkedValues);
  }

  return {
    global: globalBlock,
    link: link,
    block: block,
    proc: proc,
    scope: scope,
    cond: conditional,
    compile: compile
  };
};

},{"./extend":24}],24:[function(require,module,exports){
module.exports = function (base, opts) {
  var keys = Object.keys(opts);
  for (var i = 0; i < keys.length; ++i) {
    base[keys[i]] = opts[keys[i]];
  }
  return base;
};

},{}],25:[function(require,module,exports){
var pool = require('./pool');

module.exports = {
  shape: arrayShape,
  flatten: flattenArray
};

function flatten1D(array, nx, out) {
  for (var i = 0; i < nx; ++i) {
    out[i] = array[i];
  }
}

function flatten2D(array, nx, ny, out) {
  var ptr = 0;
  for (var i = 0; i < nx; ++i) {
    var row = array[i];
    for (var j = 0; j < ny; ++j) {
      out[ptr++] = row[j];
    }
  }
}

function flatten3D(array, nx, ny, nz, out, ptr_) {
  var ptr = ptr_;
  for (var i = 0; i < nx; ++i) {
    var row = array[i];
    for (var j = 0; j < ny; ++j) {
      var col = row[j];
      for (var k = 0; k < nz; ++k) {
        out[ptr++] = col[k];
      }
    }
  }
}

function flattenRec(array, shape, level, out, ptr) {
  var stride = 1;
  for (var i = level + 1; i < shape.length; ++i) {
    stride *= shape[i];
  }
  var n = shape[level];
  if (shape.length - level === 4) {
    var nx = shape[level + 1];
    var ny = shape[level + 2];
    var nz = shape[level + 3];
    for (i = 0; i < n; ++i) {
      flatten3D(array[i], nx, ny, nz, out, ptr);
      ptr += stride;
    }
  } else {
    for (i = 0; i < n; ++i) {
      flattenRec(array[i], shape, level + 1, out, ptr);
      ptr += stride;
    }
  }
}

function flattenArray(array, shape, type, out_) {
  var sz = 1;
  if (shape.length) {
    for (var i = 0; i < shape.length; ++i) {
      sz *= shape[i];
    }
  } else {
    sz = 0;
  }
  var out = out_ || pool.allocType(type, sz);
  switch (shape.length) {
    case 0:
      break;
    case 1:
      flatten1D(array, shape[0], out);
      break;
    case 2:
      flatten2D(array, shape[0], shape[1], out);
      break;
    case 3:
      flatten3D(array, shape[0], shape[1], shape[2], out, 0);
      break;
    default:
      flattenRec(array, shape, 0, out, 0);
  }
  return out;
}

function arrayShape(array_) {
  var shape = [];
  for (var array = array_; array.length; array = array[0]) {
    shape.push(array.length);
  }
  return shape;
}

},{"./pool":30}],26:[function(require,module,exports){
var isTypedArray = require('./is-typed-array');
module.exports = function isArrayLike(s) {
  return Array.isArray(s) || isTypedArray(s);
};

},{"./is-typed-array":28}],27:[function(require,module,exports){
var isTypedArray = require('./is-typed-array');

module.exports = function isNDArrayLike(obj) {
  return !!obj && typeof obj === 'object' && Array.isArray(obj.shape) && Array.isArray(obj.stride) && typeof obj.offset === 'number' && obj.shape.length === obj.stride.length && (Array.isArray(obj.data) || isTypedArray(obj.data));
};

},{"./is-typed-array":28}],28:[function(require,module,exports){
var dtypes = require('../constants/arraytypes.json');
module.exports = function (x) {
  return Object.prototype.toString.call(x) in dtypes;
};

},{"../constants/arraytypes.json":5}],29:[function(require,module,exports){
module.exports = function loop(n, f) {
  var result = Array(n);
  for (var i = 0; i < n; ++i) {
    result[i] = f(i);
  }
  return result;
};

},{}],30:[function(require,module,exports){
var loop = require('./loop');

var GL_BYTE = 5120;
var GL_UNSIGNED_BYTE = 5121;
var GL_SHORT = 5122;
var GL_UNSIGNED_SHORT = 5123;
var GL_INT = 5124;
var GL_UNSIGNED_INT = 5125;
var GL_FLOAT = 5126;

var bufferPool = loop(8, function () {
  return [];
});

function nextPow16(v) {
  for (var i = 16; i <= 1 << 28; i *= 16) {
    if (v <= i) {
      return i;
    }
  }
  return 0;
}

function log2(v) {
  var r, shift;
  r = (v > 0xFFFF) << 4;
  v >>>= r;
  shift = (v > 0xFF) << 3;
  v >>>= shift;r |= shift;
  shift = (v > 0xF) << 2;
  v >>>= shift;r |= shift;
  shift = (v > 0x3) << 1;
  v >>>= shift;r |= shift;
  return r | v >> 1;
}

function alloc(n) {
  var sz = nextPow16(n);
  var bin = bufferPool[log2(sz) >> 2];
  if (bin.length > 0) {
    return bin.pop();
  }
  return new ArrayBuffer(sz);
}

function free(buf) {
  bufferPool[log2(buf.byteLength) >> 2].push(buf);
}

function allocType(type, n) {
  var result = null;
  switch (type) {
    case GL_BYTE:
      result = new Int8Array(alloc(n), 0, n);
      break;
    case GL_UNSIGNED_BYTE:
      result = new Uint8Array(alloc(n), 0, n);
      break;
    case GL_SHORT:
      result = new Int16Array(alloc(2 * n), 0, n);
      break;
    case GL_UNSIGNED_SHORT:
      result = new Uint16Array(alloc(2 * n), 0, n);
      break;
    case GL_INT:
      result = new Int32Array(alloc(4 * n), 0, n);
      break;
    case GL_UNSIGNED_INT:
      result = new Uint32Array(alloc(4 * n), 0, n);
      break;
    case GL_FLOAT:
      result = new Float32Array(alloc(4 * n), 0, n);
      break;
    default:
      return null;
  }
  if (result.length !== n) {
    return result.subarray(0, n);
  }
  return result;
}

function freeType(array) {
  free(array.buffer);
}

module.exports = {
  alloc: alloc,
  free: free,
  allocType: allocType,
  freeType: freeType
};

},{"./loop":29}],31:[function(require,module,exports){
/* globals requestAnimationFrame, cancelAnimationFrame */
if (typeof requestAnimationFrame === 'function' && typeof cancelAnimationFrame === 'function') {
  module.exports = {
    next: function (x) {
      return requestAnimationFrame(x);
    },
    cancel: function (x) {
      return cancelAnimationFrame(x);
    }
  };
} else {
  module.exports = {
    next: function (cb) {
      return setTimeout(cb, 16);
    },
    cancel: clearTimeout
  };
}

},{}],32:[function(require,module,exports){
var pool = require('./pool');

var FLOAT = new Float32Array(1);
var INT = new Uint32Array(FLOAT.buffer);

var GL_UNSIGNED_SHORT = 5123;

module.exports = function convertToHalfFloat(array) {
  var ushorts = pool.allocType(GL_UNSIGNED_SHORT, array.length);

  for (var i = 0; i < array.length; ++i) {
    if (isNaN(array[i])) {
      ushorts[i] = 0xffff;
    } else if (array[i] === Infinity) {
      ushorts[i] = 0x7c00;
    } else if (array[i] === -Infinity) {
      ushorts[i] = 0xfc00;
    } else {
      FLOAT[0] = array[i];
      var x = INT[0];

      var sgn = x >>> 31 << 15;
      var exp = (x << 1 >>> 24) - 127;
      var frac = x >> 13 & (1 << 10) - 1;

      if (exp < -24) {
        // round non-representable denormals to 0
        ushorts[i] = sgn;
      } else if (exp < -14) {
        // handle denormals
        var s = -14 - exp;
        ushorts[i] = sgn + (frac + (1 << 10) >> s);
      } else if (exp > 15) {
        // round overflow to +/- Infinity
        ushorts[i] = sgn + 0x7c00;
      } else {
        // otherwise convert directly
        ushorts[i] = sgn + (exp + 15 << 10) + frac;
      }
    }
  }

  return ushorts;
};

},{"./pool":30}],33:[function(require,module,exports){
module.exports = function (obj) {
  return Object.keys(obj).map(function (key) {
    return obj[key];
  });
};

},{}],34:[function(require,module,exports){
// Context and canvas creation helper functions

var extend = require('./util/extend');

function createCanvas(element, onDone, pixelRatio) {
  var canvas = document.createElement('canvas');
  extend(canvas.style, {
    border: 0,
    margin: 0,
    padding: 0,
    top: 0,
    left: 0
  });
  element.appendChild(canvas);

  if (element === document.body) {
    canvas.style.position = 'absolute';
    extend(element.style, {
      margin: 0,
      padding: 0
    });
  }

  function resize() {
    var w = window.innerWidth;
    var h = window.innerHeight;
    if (element !== document.body) {
      var bounds = element.getBoundingClientRect();
      w = bounds.right - bounds.left;
      h = bounds.top - bounds.bottom;
    }
    canvas.width = pixelRatio * w;
    canvas.height = pixelRatio * h;
    extend(canvas.style, {
      width: w + 'px',
      height: h + 'px'
    });
  }

  window.addEventListener('resize', resize, false);

  function onDestroy() {
    window.removeEventListener('resize', resize);
    element.removeChild(canvas);
  }

  resize();

  return {
    canvas: canvas,
    onDestroy: onDestroy
  };
}

function createContext(canvas, contexAttributes) {
  function get(name) {
    try {
      return canvas.getContext(name, contexAttributes);
    } catch (e) {
      return null;
    }
  }
  return get('webgl') || get('experimental-webgl') || get('webgl-experimental');
}

function isHTMLElement(obj) {
  return typeof obj.nodeName === 'string' && typeof obj.appendChild === 'function' && typeof obj.getBoundingClientRect === 'function';
}

function isWebGLContext(obj) {
  return typeof obj.drawArrays === 'function' || typeof obj.drawElements === 'function';
}

function parseExtensions(input) {
  if (typeof input === 'string') {
    return input.split();
  }

  return input;
}

function getElement(desc) {
  if (typeof desc === 'string') {

    return document.querySelector(desc);
  }
  return desc;
}

module.exports = function parseArgs(args_) {
  var args = args_ || {};
  var element, container, canvas, gl;
  var contextAttributes = {};
  var extensions = [];
  var optionalExtensions = [];
  var pixelRatio = typeof window === 'undefined' ? 1 : window.devicePixelRatio;
  var profile = false;
  var onDone = function (err) {
    if (err) {}
  };
  var onDestroy = function () {};
  if (typeof args === 'string') {

    element = document.querySelector(args);
  } else if (typeof args === 'object') {
    if (isHTMLElement(args)) {
      element = args;
    } else if (isWebGLContext(args)) {
      gl = args;
      canvas = gl.canvas;
    } else {

      if ('gl' in args) {
        gl = args.gl;
      } else if ('canvas' in args) {
        canvas = getElement(args.canvas);
      } else if ('container' in args) {
        container = getElement(args.container);
      }
      if ('attributes' in args) {
        contextAttributes = args.attributes;
      }
      if ('extensions' in args) {
        extensions = parseExtensions(args.extensions);
      }
      if ('optionalExtensions' in args) {
        optionalExtensions = parseExtensions(args.optionalExtensions);
      }
      if ('onDone' in args) {

        onDone = args.onDone;
      }
      if ('profile' in args) {
        profile = !!args.profile;
      }
      if ('pixelRatio' in args) {
        pixelRatio = +args.pixelRatio;
      }
    }
  } else {}

  if (element) {
    if (element.nodeName.toLowerCase() === 'canvas') {
      canvas = element;
    } else {
      container = element;
    }
  }

  if (!gl) {
    if (!canvas) {

      var result = createCanvas(container || document.body, onDone, pixelRatio);
      if (!result) {
        return null;
      }
      canvas = result.canvas;
      onDestroy = result.onDestroy;
    }
    gl = createContext(canvas, contextAttributes);
  }

  if (!gl) {
    onDestroy();
    onDone('webgl not supported, try upgrading your browser or graphics drivers http://get.webgl.org');
    return null;
  }

  return {
    gl: gl,
    canvas: canvas,
    container: container,
    extensions: extensions,
    optionalExtensions: optionalExtensions,
    pixelRatio: pixelRatio,
    profile: profile,
    onDone: onDone,
    onDestroy: onDestroy
  };
};

},{"./util/extend":24}],35:[function(require,module,exports){
module.exports = identity;

/**
 * Set a mat4 to the identity matrix
 *
 * @param {mat4} out the receiving matrix
 * @returns {mat4} out
 */
function identity(out) {
    out[0] = 1;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = 1;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = 1;
    out[11] = 0;
    out[12] = 0;
    out[13] = 0;
    out[14] = 0;
    out[15] = 1;
    return out;
};
},{}],36:[function(require,module,exports){
var identity = require('./identity');

module.exports = lookAt;

/**
 * Generates a look-at matrix with the given eye position, focal point, and up axis
 *
 * @param {mat4} out mat4 frustum matrix will be written into
 * @param {vec3} eye Position of the viewer
 * @param {vec3} center Point the viewer is looking at
 * @param {vec3} up vec3 pointing up
 * @returns {mat4} out
 */
function lookAt(out, eye, center, up) {
    var x0, x1, x2, y0, y1, y2, z0, z1, z2, len,
        eyex = eye[0],
        eyey = eye[1],
        eyez = eye[2],
        upx = up[0],
        upy = up[1],
        upz = up[2],
        centerx = center[0],
        centery = center[1],
        centerz = center[2];

    if (Math.abs(eyex - centerx) < 0.000001 &&
        Math.abs(eyey - centery) < 0.000001 &&
        Math.abs(eyez - centerz) < 0.000001) {
        return identity(out);
    }

    z0 = eyex - centerx;
    z1 = eyey - centery;
    z2 = eyez - centerz;

    len = 1 / Math.sqrt(z0 * z0 + z1 * z1 + z2 * z2);
    z0 *= len;
    z1 *= len;
    z2 *= len;

    x0 = upy * z2 - upz * z1;
    x1 = upz * z0 - upx * z2;
    x2 = upx * z1 - upy * z0;
    len = Math.sqrt(x0 * x0 + x1 * x1 + x2 * x2);
    if (!len) {
        x0 = 0;
        x1 = 0;
        x2 = 0;
    } else {
        len = 1 / len;
        x0 *= len;
        x1 *= len;
        x2 *= len;
    }

    y0 = z1 * x2 - z2 * x1;
    y1 = z2 * x0 - z0 * x2;
    y2 = z0 * x1 - z1 * x0;

    len = Math.sqrt(y0 * y0 + y1 * y1 + y2 * y2);
    if (!len) {
        y0 = 0;
        y1 = 0;
        y2 = 0;
    } else {
        len = 1 / len;
        y0 *= len;
        y1 *= len;
        y2 *= len;
    }

    out[0] = x0;
    out[1] = y0;
    out[2] = z0;
    out[3] = 0;
    out[4] = x1;
    out[5] = y1;
    out[6] = z1;
    out[7] = 0;
    out[8] = x2;
    out[9] = y2;
    out[10] = z2;
    out[11] = 0;
    out[12] = -(x0 * eyex + x1 * eyey + x2 * eyez);
    out[13] = -(y0 * eyex + y1 * eyey + y2 * eyez);
    out[14] = -(z0 * eyex + z1 * eyey + z2 * eyez);
    out[15] = 1;

    return out;
};
},{"./identity":35}],37:[function(require,module,exports){
module.exports = perspective;

/**
 * Generates a perspective projection matrix with the given bounds
 *
 * @param {mat4} out mat4 frustum matrix will be written into
 * @param {number} fovy Vertical field of view in radians
 * @param {number} aspect Aspect ratio. typically viewport width/height
 * @param {number} near Near bound of the frustum
 * @param {number} far Far bound of the frustum
 * @returns {mat4} out
 */
function perspective(out, fovy, aspect, near, far) {
    var f = 1.0 / Math.tan(fovy / 2),
        nf = 1 / (near - far);
    out[0] = f / aspect;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = f;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = (far + near) * nf;
    out[11] = -1;
    out[12] = 0;
    out[13] = 0;
    out[14] = (2 * far * near) * nf;
    out[15] = 0;
    return out;
};
},{}],38:[function(require,module,exports){
'use strict'

module.exports = mouseListen

var mouse = require('mouse-event')

function mouseListen(element, callback) {
  if(!callback) {
    callback = element
    element = window
  }

  var buttonState = 0
  var x = 0
  var y = 0
  var mods = {
    shift:   false,
    alt:     false,
    control: false,
    meta:    false
  }
  var attached = false

  function updateMods(ev) {
    var changed = false
    if('altKey' in ev) {
      changed = changed || ev.altKey !== mods.alt
      mods.alt = !!ev.altKey
    }
    if('shiftKey' in ev) {
      changed = changed || ev.shiftKey !== mods.shift
      mods.shift = !!ev.shiftKey
    }
    if('ctrlKey' in ev) {
      changed = changed || ev.ctrlKey !== mods.control
      mods.control = !!ev.ctrlKey
    }
    if('metaKey' in ev) {
      changed = changed || ev.metaKey !== mods.meta
      mods.meta = !!ev.metaKey
    }
    return changed
  }

  function handleEvent(nextButtons, ev) {
    var nextX = mouse.x(ev)
    var nextY = mouse.y(ev)
    if('buttons' in ev) {
      nextButtons = ev.buttons|0
    }
    if(nextButtons !== buttonState ||
       nextX !== x ||
       nextY !== y ||
       updateMods(ev)) {
      buttonState = nextButtons|0
      x = nextX||0
      y = nextY||0
      callback && callback(buttonState, x, y, mods)
    }
  }

  function clearState(ev) {
    handleEvent(0, ev)
  }

  function handleBlur() {
    if(buttonState ||
      x ||
      y ||
      mods.shift ||
      mods.alt ||
      mods.meta ||
      mods.control) {

      x = y = 0
      buttonState = 0
      mods.shift = mods.alt = mods.control = mods.meta = false
      callback && callback(0, 0, 0, mods)
    }
  }

  function handleMods(ev) {
    if(updateMods(ev)) {
      callback && callback(buttonState, x, y, mods)
    }
  }

  function handleMouseMove(ev) {
    if(mouse.buttons(ev) === 0) {
      handleEvent(0, ev)
    } else {
      handleEvent(buttonState, ev)
    }
  }

  function handleMouseDown(ev) {
    handleEvent(buttonState | mouse.buttons(ev), ev)
  }

  function handleMouseUp(ev) {
    handleEvent(buttonState & ~mouse.buttons(ev), ev)
  }

  function attachListeners() {
    if(attached) {
      return
    }
    attached = true

    element.addEventListener('mousemove', handleMouseMove)

    element.addEventListener('mousedown', handleMouseDown)

    element.addEventListener('mouseup', handleMouseUp)

    element.addEventListener('mouseleave', clearState)
    element.addEventListener('mouseenter', clearState)
    element.addEventListener('mouseout', clearState)
    element.addEventListener('mouseover', clearState)

    element.addEventListener('blur', handleBlur)

    element.addEventListener('keyup', handleMods)
    element.addEventListener('keydown', handleMods)
    element.addEventListener('keypress', handleMods)

    if(element !== window) {
      window.addEventListener('blur', handleBlur)

      window.addEventListener('keyup', handleMods)
      window.addEventListener('keydown', handleMods)
      window.addEventListener('keypress', handleMods)
    }
  }

  function detachListeners() {
    if(!attached) {
      return
    }
    attached = false

    element.removeEventListener('mousemove', handleMouseMove)

    element.removeEventListener('mousedown', handleMouseDown)

    element.removeEventListener('mouseup', handleMouseUp)

    element.removeEventListener('mouseleave', clearState)
    element.removeEventListener('mouseenter', clearState)
    element.removeEventListener('mouseout', clearState)
    element.removeEventListener('mouseover', clearState)

    element.removeEventListener('blur', handleBlur)

    element.removeEventListener('keyup', handleMods)
    element.removeEventListener('keydown', handleMods)
    element.removeEventListener('keypress', handleMods)

    if(element !== window) {
      window.removeEventListener('blur', handleBlur)

      window.removeEventListener('keyup', handleMods)
      window.removeEventListener('keydown', handleMods)
      window.removeEventListener('keypress', handleMods)
    }
  }

  //Attach listeners
  attachListeners()

  var result = {
    element: element
  }

  Object.defineProperties(result, {
    enabled: {
      get: function() { return attached },
      set: function(f) {
        if(f) {
          attachListeners()
        } else {
          detachListeners
        }
      },
      enumerable: true
    },
    buttons: {
      get: function() { return buttonState },
      enumerable: true
    },
    x: {
      get: function() { return x },
      enumerable: true
    },
    y: {
      get: function() { return y },
      enumerable: true
    },
    mods: {
      get: function() { return mods },
      enumerable: true
    }
  })

  return result
}

},{"mouse-event":39}],39:[function(require,module,exports){
'use strict'

function mouseButtons(ev) {
  if(typeof ev === 'object') {
    if('buttons' in ev) {
      return ev.buttons
    } else if('which' in ev) {
      var b = ev.which
      if(b === 2) {
        return 4
      } else if(b === 3) {
        return 2
      } else if(b > 0) {
        return 1<<(b-1)
      }
    } else if('button' in ev) {
      var b = ev.button
      if(b === 1) {
        return 4
      } else if(b === 2) {
        return 2
      } else if(b >= 0) {
        return 1<<b
      }
    }
  }
  return 0
}
exports.buttons = mouseButtons

function mouseElement(ev) {
  return ev.target || ev.srcElement || window
}
exports.element = mouseElement

function mouseRelativeX(ev) {
  if(typeof ev === 'object') {
    if('offsetX' in ev) {
      return ev.offsetX
    }
    var target = mouseElement(ev)
    var bounds = target.getBoundingClientRect()
    return ev.clientX - bounds.left
  }
  return 0
}
exports.x = mouseRelativeX

function mouseRelativeY(ev) {
  if(typeof ev === 'object') {
    if('offsetY' in ev) {
      return ev.offsetY
    }
    var target = mouseElement(ev)
    var bounds = target.getBoundingClientRect()
    return ev.clientY - bounds.top
  }
  return 0
}
exports.y = mouseRelativeY

},{}],40:[function(require,module,exports){
'use strict'

var toPX = require('to-px')

module.exports = mouseWheelListen

function mouseWheelListen(element, callback, noScroll) {
  if(typeof element === 'function') {
    noScroll = !!callback
    callback = element
    element = window
  }
  var lineHeight = toPX('ex', element)
  var listener = function(ev) {
    if(noScroll) {
      ev.preventDefault()
    }
    var dx = ev.deltaX || 0
    var dy = ev.deltaY || 0
    var dz = ev.deltaZ || 0
    var mode = ev.deltaMode
    var scale = 1
    switch(mode) {
      case 1:
        scale = lineHeight
      break
      case 2:
        scale = window.innerHeight
      break
    }
    dx *= scale
    dy *= scale
    dz *= scale
    if(dx || dy || dz) {
      return callback(dx, dy, dz, ev)
    }
  }
  element.addEventListener('wheel', listener)
  return listener
}

},{"to-px":42}],41:[function(require,module,exports){
module.exports = function parseUnit(str, out) {
    if (!out)
        out = [ 0, '' ]

    str = String(str)
    var num = parseFloat(str, 10)
    out[0] = num
    out[1] = str.match(/[\d.\-\+]*\s*(.*)/)[1] || ''
    return out
}
},{}],42:[function(require,module,exports){
'use strict'

var parseUnit = require('parse-unit')

module.exports = toPX

var PIXELS_PER_INCH = 96

function getPropertyInPX(element, prop) {
  var parts = parseUnit(getComputedStyle(element).getPropertyValue(prop))
  return parts[0] * toPX(parts[1], element)
}

//This brutal hack is needed
function getSizeBrutal(unit, element) {
  var testDIV = document.createElement('div')
  testDIV.style['font-size'] = '128' + unit
  element.appendChild(testDIV)
  var size = getPropertyInPX(testDIV, 'font-size') / 128
  element.removeChild(testDIV)
  return size
}

function toPX(str, element) {
  element = element || document.body
  str = (str || 'px').trim().toLowerCase()
  if(element === window || element === document) {
    element = document.body 
  }
  switch(str) {
    case '%':  //Ambiguous, not sure if we should use width or height
      return element.clientHeight / 100.0
    case 'ch':
    case 'ex':
      return getSizeBrutal(str, element)
    case 'em':
      return getPropertyInPX(element, 'font-size')
    case 'rem':
      return getPropertyInPX(document.body, 'font-size')
    case 'vw':
      return window.innerWidth/100
    case 'vh':
      return window.innerHeight/100
    case 'vmin':
      return Math.min(window.innerWidth, window.innerHeight) / 100
    case 'vmax':
      return Math.max(window.innerWidth, window.innerHeight) / 100
    case 'in':
      return PIXELS_PER_INCH
    case 'cm':
      return PIXELS_PER_INCH / 2.54
    case 'mm':
      return PIXELS_PER_INCH / 25.4
    case 'pt':
      return PIXELS_PER_INCH / 72
    case 'pc':
      return PIXELS_PER_INCH / 6
  }
  return 1
}
},{"parse-unit":41}],43:[function(require,module,exports){

var extend = require('./lib/util/extend');
var dynamic = require('./lib/dynamic');
var raf = require('./lib/util/raf');
var clock = require('./lib/util/clock');
var createStringStore = require('./lib/strings');
var initWebGL = require('./lib/webgl');
var wrapExtensions = require('./lib/extension');
var wrapLimits = require('./lib/limits');
var wrapBuffers = require('./lib/buffer');
var wrapElements = require('./lib/elements');
var wrapTextures = require('./lib/texture');
var wrapRenderbuffers = require('./lib/renderbuffer');
var wrapFramebuffers = require('./lib/framebuffer');
var wrapAttributes = require('./lib/attribute');
var wrapShaders = require('./lib/shader');
var wrapRead = require('./lib/read');
var createCore = require('./lib/core');
var createStats = require('./lib/stats');
var createTimer = require('./lib/timer');

var GL_COLOR_BUFFER_BIT = 16384;
var GL_DEPTH_BUFFER_BIT = 256;
var GL_STENCIL_BUFFER_BIT = 1024;

var GL_ARRAY_BUFFER = 34962;

var CONTEXT_LOST_EVENT = 'webglcontextlost';
var CONTEXT_RESTORED_EVENT = 'webglcontextrestored';

var DYN_PROP = 1;
var DYN_CONTEXT = 2;
var DYN_STATE = 3;

function find(haystack, needle) {
  for (var i = 0; i < haystack.length; ++i) {
    if (haystack[i] === needle) {
      return i;
    }
  }
  return -1;
}

module.exports = function wrapREGL(args) {
  var config = initWebGL(args);
  if (!config) {
    return null;
  }

  var gl = config.gl;
  var glAttributes = gl.getContextAttributes();
  var contextLost = gl.isContextLost();

  var extensionState = wrapExtensions(gl, config);
  if (!extensionState) {
    return null;
  }

  var stringStore = createStringStore();
  var stats = createStats();
  var extensions = extensionState.extensions;
  var timer = createTimer(gl, extensions);

  var START_TIME = clock();
  var WIDTH = gl.drawingBufferWidth;
  var HEIGHT = gl.drawingBufferHeight;

  var contextState = {
    tick: 0,
    time: 0,
    viewportWidth: WIDTH,
    viewportHeight: HEIGHT,
    framebufferWidth: WIDTH,
    framebufferHeight: HEIGHT,
    drawingBufferWidth: WIDTH,
    drawingBufferHeight: HEIGHT,
    pixelRatio: config.pixelRatio
  };
  var uniformState = {};
  var drawState = {
    elements: null,
    primitive: 4, // GL_TRIANGLES
    count: -1,
    offset: 0,
    instances: -1
  };

  var limits = wrapLimits(gl, extensions);
  var bufferState = wrapBuffers(gl, stats, config);
  var elementState = wrapElements(gl, extensions, bufferState, stats);
  var attributeState = wrapAttributes(gl, extensions, limits, bufferState, stringStore);
  var shaderState = wrapShaders(gl, stringStore, stats, config);
  var textureState = wrapTextures(gl, extensions, limits, function () {
    core.procs.poll();
  }, contextState, stats, config);
  var renderbufferState = wrapRenderbuffers(gl, extensions, limits, stats, config);
  var framebufferState = wrapFramebuffers(gl, extensions, limits, textureState, renderbufferState, stats);
  var core = createCore(gl, stringStore, extensions, limits, bufferState, elementState, textureState, framebufferState, uniformState, attributeState, shaderState, drawState, contextState, timer, config);
  var readPixels = wrapRead(gl, framebufferState, core.procs.poll, contextState, glAttributes, extensions);

  var nextState = core.next;
  var canvas = gl.canvas;

  var rafCallbacks = [];
  var lossCallbacks = [];
  var restoreCallbacks = [];
  var destroyCallbacks = [config.onDestroy];

  var activeRAF = null;
  function handleRAF() {
    if (rafCallbacks.length === 0) {
      if (timer) {
        timer.update();
      }
      activeRAF = null;
      return;
    }

    // schedule next animation frame
    activeRAF = raf.next(handleRAF);

    // poll for changes
    poll();

    // fire a callback for all pending rafs
    for (var i = rafCallbacks.length - 1; i >= 0; --i) {
      var cb = rafCallbacks[i];
      if (cb) {
        cb(contextState, null, 0);
      }
    }

    // flush all pending webgl calls
    gl.flush();

    // poll GPU timers *after* gl.flush so we don't delay command dispatch
    if (timer) {
      timer.update();
    }
  }

  function startRAF() {
    if (!activeRAF && rafCallbacks.length > 0) {
      activeRAF = raf.next(handleRAF);
    }
  }

  function stopRAF() {
    if (activeRAF) {
      raf.cancel(handleRAF);
      activeRAF = null;
    }
  }

  function handleContextLoss(event) {
    event.preventDefault();

    // set context lost flag
    contextLost = true;

    // pause request animation frame
    stopRAF();

    // lose context
    lossCallbacks.forEach(function (cb) {
      cb();
    });
  }

  function handleContextRestored(event) {
    // clear error code
    gl.getError();

    // clear context lost flag
    contextLost = false;

    // refresh state
    extensionState.restore();
    shaderState.restore();
    bufferState.restore();
    textureState.restore();
    renderbufferState.restore();
    framebufferState.restore();
    if (timer) {
      timer.restore();
    }

    // refresh state
    core.procs.refresh();

    // restart RAF
    startRAF();

    // restore context
    restoreCallbacks.forEach(function (cb) {
      cb();
    });
  }

  if (canvas) {
    canvas.addEventListener(CONTEXT_LOST_EVENT, handleContextLoss, false);
    canvas.addEventListener(CONTEXT_RESTORED_EVENT, handleContextRestored, false);
  }

  function destroy() {
    rafCallbacks.length = 0;
    stopRAF();

    if (canvas) {
      canvas.removeEventListener(CONTEXT_LOST_EVENT, handleContextLoss);
      canvas.removeEventListener(CONTEXT_RESTORED_EVENT, handleContextRestored);
    }

    shaderState.clear();
    framebufferState.clear();
    renderbufferState.clear();
    textureState.clear();
    elementState.clear();
    bufferState.clear();

    if (timer) {
      timer.clear();
    }

    destroyCallbacks.forEach(function (cb) {
      cb();
    });
  }

  function compileProcedure(options) {

    function flattenNestedOptions(options) {
      var result = extend({}, options);
      delete result.uniforms;
      delete result.attributes;
      delete result.context;

      if ('stencil' in result && result.stencil.op) {
        result.stencil.opBack = result.stencil.opFront = result.stencil.op;
        delete result.stencil.op;
      }

      function merge(name) {
        if (name in result) {
          var child = result[name];
          delete result[name];
          Object.keys(child).forEach(function (prop) {
            result[name + '.' + prop] = child[prop];
          });
        }
      }
      merge('blend');
      merge('depth');
      merge('cull');
      merge('stencil');
      merge('polygonOffset');
      merge('scissor');
      merge('sample');

      return result;
    }

    function separateDynamic(object) {
      var staticItems = {};
      var dynamicItems = {};
      Object.keys(object).forEach(function (option) {
        var value = object[option];
        if (dynamic.isDynamic(value)) {
          dynamicItems[option] = dynamic.unbox(value, option);
        } else {
          staticItems[option] = value;
        }
      });
      return {
        dynamic: dynamicItems,
        static: staticItems
      };
    }

    // Treat context variables separate from other dynamic variables
    var context = separateDynamic(options.context || {});
    var uniforms = separateDynamic(options.uniforms || {});
    var attributes = separateDynamic(options.attributes || {});
    var opts = separateDynamic(flattenNestedOptions(options));

    var stats = {
      gpuTime: 0.0,
      cpuTime: 0.0,
      count: 0
    };

    var compiled = core.compile(opts, attributes, uniforms, context, stats);

    var draw = compiled.draw;
    var batch = compiled.batch;
    var scope = compiled.scope;

    // FIXME: we should modify code generation for batch commands so this
    // isn't necessary
    var EMPTY_ARRAY = [];
    function reserve(count) {
      while (EMPTY_ARRAY.length < count) {
        EMPTY_ARRAY.push(null);
      }
      return EMPTY_ARRAY;
    }

    function REGLCommand(args, body) {
      var i;
      if (contextLost) {}
      if (typeof args === 'function') {
        return scope.call(this, null, args, 0);
      } else if (typeof body === 'function') {
        if (typeof args === 'number') {
          for (i = 0; i < args; ++i) {
            scope.call(this, null, body, i);
          }
          return;
        } else if (Array.isArray(args)) {
          for (i = 0; i < args.length; ++i) {
            scope.call(this, args[i], body, i);
          }
          return;
        } else {
          return scope.call(this, args, body, 0);
        }
      } else if (typeof args === 'number') {
        if (args > 0) {
          return batch.call(this, reserve(args | 0), args | 0);
        }
      } else if (Array.isArray(args)) {
        if (args.length) {
          return batch.call(this, args, args.length);
        }
      } else {
        return draw.call(this, args);
      }
    }

    return extend(REGLCommand, {
      stats: stats
    });
  }

  function clear(options) {

    var clearFlags = 0;
    core.procs.poll();

    var c = options.color;
    if (c) {
      gl.clearColor(+c[0] || 0, +c[1] || 0, +c[2] || 0, +c[3] || 0);
      clearFlags |= GL_COLOR_BUFFER_BIT;
    }
    if ('depth' in options) {
      gl.clearDepth(+options.depth);
      clearFlags |= GL_DEPTH_BUFFER_BIT;
    }
    if ('stencil' in options) {
      gl.clearStencil(options.stencil | 0);
      clearFlags |= GL_STENCIL_BUFFER_BIT;
    }

    gl.clear(clearFlags);
  }

  function frame(cb) {

    rafCallbacks.push(cb);

    function cancel() {
      // FIXME:  should we check something other than equals cb here?
      // what if a user calls frame twice with the same callback...
      //
      var i = find(rafCallbacks, cb);

      function pendingCancel() {
        var index = find(rafCallbacks, pendingCancel);
        rafCallbacks[index] = rafCallbacks[rafCallbacks.length - 1];
        rafCallbacks.length -= 1;
        if (rafCallbacks.length <= 0) {
          stopRAF();
        }
      }
      rafCallbacks[i] = pendingCancel;
    }

    startRAF();

    return {
      cancel: cancel
    };
  }

  // poll viewport
  function pollViewport() {
    var viewport = nextState.viewport;
    var scissorBox = nextState.scissor_box;
    viewport[0] = viewport[1] = scissorBox[0] = scissorBox[1] = 0;
    contextState.viewportWidth = contextState.framebufferWidth = contextState.drawingBufferWidth = viewport[2] = scissorBox[2] = gl.drawingBufferWidth;
    contextState.viewportHeight = contextState.framebufferHeight = contextState.drawingBufferHeight = viewport[3] = scissorBox[3] = gl.drawingBufferHeight;
  }

  function poll() {
    contextState.tick += 1;
    contextState.time = now();
    pollViewport();
    core.procs.poll();
  }

  function refresh() {
    pollViewport();
    core.procs.refresh();
    if (timer) {
      timer.update();
    }
  }

  function now() {
    return (clock() - START_TIME) / 1000.0;
  }

  refresh();

  function addListener(event, callback) {

    var callbacks;
    switch (event) {
      case 'frame':
        return frame(callback);
      case 'lost':
        callbacks = lossCallbacks;
        break;
      case 'restore':
        callbacks = restoreCallbacks;
        break;
      case 'destroy':
        callbacks = destroyCallbacks;
        break;
      default:

    }

    callbacks.push(callback);
    return {
      cancel: function () {
        for (var i = 0; i < callbacks.length; ++i) {
          if (callbacks[i] === callback) {
            callbacks[i] = callbacks[callbacks.length - 1];
            callbacks.pop();
            return;
          }
        }
      }
    };
  }

  var regl = extend(compileProcedure, {
    // Clear current FBO
    clear: clear,

    // Short cuts for dynamic variables
    prop: dynamic.define.bind(null, DYN_PROP),
    context: dynamic.define.bind(null, DYN_CONTEXT),
    this: dynamic.define.bind(null, DYN_STATE),

    // executes an empty draw command
    draw: compileProcedure({}),

    // Resources
    buffer: function (options) {
      return bufferState.create(options, GL_ARRAY_BUFFER, false, false);
    },
    elements: function (options) {
      return elementState.create(options, false);
    },
    texture: textureState.create2D,
    cube: textureState.createCube,
    renderbuffer: renderbufferState.create,
    framebuffer: framebufferState.create,
    framebufferCube: framebufferState.createCube,

    // Expose context attributes
    attributes: glAttributes,

    // Frame rendering
    frame: frame,
    on: addListener,

    // System limits
    limits: limits,
    hasExtension: function (name) {
      return limits.extensions.indexOf(name.toLowerCase()) >= 0;
    },

    // Read pixels
    read: readPixels,

    // Destroy regl and all associated resources
    destroy: destroy,

    // Direct GL state manipulation
    _gl: gl,
    _refresh: refresh,

    poll: function () {
      poll();
      if (timer) {
        timer.update();
      }
    },

    // Current time
    now: now,

    // regl Statistics Information
    stats: stats
  });

  config.onDone(null, regl);

  return regl;
};

},{"./lib/attribute":3,"./lib/buffer":4,"./lib/core":9,"./lib/dynamic":10,"./lib/elements":11,"./lib/extension":12,"./lib/framebuffer":13,"./lib/limits":14,"./lib/read":15,"./lib/renderbuffer":16,"./lib/shader":17,"./lib/stats":18,"./lib/strings":19,"./lib/texture":20,"./lib/timer":21,"./lib/util/clock":22,"./lib/util/extend":24,"./lib/util/raf":31,"./lib/webgl":34}]},{},[1])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJleGFtcGxlL2ltcGxpY2l0LXN1cmZhY2UuanMiLCJleGFtcGxlL3V0aWwvY2FtZXJhLmpzIiwibGliL2F0dHJpYnV0ZS5qcyIsImxpYi9idWZmZXIuanMiLCJsaWIvY29uc3RhbnRzL2FycmF5dHlwZXMuanNvbiIsImxpYi9jb25zdGFudHMvZHR5cGVzLmpzb24iLCJsaWIvY29uc3RhbnRzL3ByaW1pdGl2ZXMuanNvbiIsImxpYi9jb25zdGFudHMvdXNhZ2UuanNvbiIsImxpYi9jb3JlLmpzIiwibGliL2R5bmFtaWMuanMiLCJsaWIvZWxlbWVudHMuanMiLCJsaWIvZXh0ZW5zaW9uLmpzIiwibGliL2ZyYW1lYnVmZmVyLmpzIiwibGliL2xpbWl0cy5qcyIsImxpYi9yZWFkLmpzIiwibGliL3JlbmRlcmJ1ZmZlci5qcyIsImxpYi9zaGFkZXIuanMiLCJsaWIvc3RhdHMuanMiLCJsaWIvc3RyaW5ncy5qcyIsImxpYi90ZXh0dXJlLmpzIiwibGliL3RpbWVyLmpzIiwibGliL3V0aWwvY2xvY2suanMiLCJsaWIvdXRpbC9jb2RlZ2VuLmpzIiwibGliL3V0aWwvZXh0ZW5kLmpzIiwibGliL3V0aWwvZmxhdHRlbi5qcyIsImxpYi91dGlsL2lzLWFycmF5LWxpa2UuanMiLCJsaWIvdXRpbC9pcy1uZGFycmF5LmpzIiwibGliL3V0aWwvaXMtdHlwZWQtYXJyYXkuanMiLCJsaWIvdXRpbC9sb29wLmpzIiwibGliL3V0aWwvcG9vbC5qcyIsImxpYi91dGlsL3JhZi5qcyIsImxpYi91dGlsL3RvLWhhbGYtZmxvYXQuanMiLCJsaWIvdXRpbC92YWx1ZXMuanMiLCJsaWIvd2ViZ2wuanMiLCJub2RlX21vZHVsZXMvZ2wtbWF0NC9pZGVudGl0eS5qcyIsIm5vZGVfbW9kdWxlcy9nbC1tYXQ0L2xvb2tBdC5qcyIsIm5vZGVfbW9kdWxlcy9nbC1tYXQ0L3BlcnNwZWN0aXZlLmpzIiwibm9kZV9tb2R1bGVzL21vdXNlLWNoYW5nZS9tb3VzZS1saXN0ZW4uanMiLCJub2RlX21vZHVsZXMvbW91c2UtZXZlbnQvbW91c2UuanMiLCJub2RlX21vZHVsZXMvbW91c2Utd2hlZWwvd2hlZWwuanMiLCJub2RlX21vZHVsZXMvcGFyc2UtdW5pdC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy90by1weC90b3B4LmpzIiwicmVnbC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBOzs7Ozs7O0FBT0EsSUFBTSxPQUFPLFFBQVEsU0FBUixHQUFiOztBQUVBLElBQU0sU0FBUyxRQUFRLGVBQVIsRUFBeUIsSUFBekIsRUFBK0I7QUFDNUMsVUFBUSxDQUFDLENBQUMsRUFBRixFQUFNLENBQU4sRUFBUyxDQUFULENBRG9DO0FBRTVDLE9BQUssQ0FBQztBQUZzQyxDQUEvQixDQUFmOztBQUtBLElBQU0sV0FBVyxLQUFLO0FBQ3BCLDRJQURvQjtBQU9wQiwybUxBUG9CO0FBbU1wQixjQUFZO0FBQ1YsY0FBVSxDQUFDLENBQUMsQ0FBRixFQUFLLENBQUMsQ0FBTixFQUFTLENBQVQsRUFBWSxDQUFDLENBQWIsRUFBZ0IsQ0FBaEIsRUFBbUIsQ0FBbkI7QUFEQSxHQW5NUTtBQXNNcEIsWUFBVTtBQUNSLFlBQVEsS0FBSyxPQUFMLENBQWEsZ0JBQWIsQ0FEQTtBQUVSLFdBQU8sS0FBSyxPQUFMLENBQWEsZUFBYixDQUZDO0FBR1IsY0FBVSxLQUFLLE9BQUwsQ0FBYSxNQUFiO0FBSEYsR0F0TVU7QUEyTXBCLFNBQU87QUEzTWEsQ0FBTCxDQUFqQjs7QUE4TUEsS0FBSyxLQUFMLENBQVcsWUFBTTtBQUNmLFNBQU8sWUFBTTtBQUNYO0FBQ0QsR0FGRDtBQUdELENBSkQ7OztBQzVOQSxJQUFJLGNBQWMsUUFBUSxjQUFSLENBQWxCO0FBQ0EsSUFBSSxhQUFhLFFBQVEsYUFBUixDQUFqQjtBQUNBLElBQUksV0FBVyxRQUFRLGtCQUFSLENBQWY7QUFDQSxJQUFJLGNBQWMsUUFBUSxxQkFBUixDQUFsQjtBQUNBLElBQUksU0FBUyxRQUFRLGdCQUFSLENBQWI7O0FBRUEsT0FBTyxPQUFQLEdBQWlCLFlBQWpCOztBQUVBLFNBQVMsWUFBVCxDQUF1QixJQUF2QixFQUE2QixLQUE3QixFQUFvQztBQUNsQyxNQUFJLGNBQWM7QUFDaEIsVUFBTSxTQUFTLElBQUksWUFBSixDQUFpQixFQUFqQixDQUFULENBRFU7QUFFaEIsZ0JBQVksU0FBUyxJQUFJLFlBQUosQ0FBaUIsRUFBakIsQ0FBVCxDQUZJO0FBR2hCLFlBQVEsSUFBSSxZQUFKLENBQWlCLE1BQU0sTUFBTixJQUFnQixDQUFqQyxDQUhRO0FBSWhCLFdBQU8sTUFBTSxLQUFOLElBQWUsQ0FKTjtBQUtoQixTQUFLLE1BQU0sR0FBTixJQUFhLENBTEY7QUFNaEIsY0FBVSxLQUFLLEdBQUwsQ0FBUyxNQUFNLFFBQU4sSUFBa0IsSUFBM0IsQ0FOTTtBQU9oQixTQUFLLElBQUksWUFBSixDQUFpQixDQUFqQixDQVBXO0FBUWhCLFFBQUksSUFBSSxZQUFKLENBQWlCLE1BQU0sRUFBTixJQUFZLENBQUMsQ0FBRCxFQUFJLENBQUosRUFBTyxDQUFQLENBQTdCO0FBUlksR0FBbEI7O0FBV0EsTUFBSSxRQUFRLElBQUksWUFBSixDQUFpQixDQUFDLENBQUQsRUFBSSxDQUFKLEVBQU8sQ0FBUCxDQUFqQixDQUFaO0FBQ0EsTUFBSSxRQUFRLElBQUksWUFBSixDQUFpQixDQUFDLENBQUQsRUFBSSxDQUFKLEVBQU8sQ0FBUCxDQUFqQixDQUFaOztBQUVBLE1BQUksY0FBYyxLQUFLLEdBQUwsQ0FBUyxpQkFBaUIsS0FBakIsR0FBeUIsTUFBTSxXQUEvQixHQUE2QyxHQUF0RCxDQUFsQjtBQUNBLE1BQUksY0FBYyxLQUFLLEdBQUwsQ0FBUyxpQkFBaUIsS0FBakIsR0FBeUIsTUFBTSxXQUEvQixHQUE2QyxJQUF0RCxDQUFsQjs7QUFFQSxNQUFJLFNBQVMsQ0FBYjtBQUNBLE1BQUksT0FBTyxDQUFYO0FBQ0EsTUFBSSxZQUFZLENBQWhCOztBQUVBLE1BQUksUUFBUSxDQUFaO0FBQ0EsTUFBSSxRQUFRLENBQVo7QUFDQSxjQUFZLFVBQVUsT0FBVixFQUFtQixDQUFuQixFQUFzQixDQUF0QixFQUF5QjtBQUNuQyxRQUFJLFVBQVUsQ0FBZCxFQUFpQjtBQUNmLFVBQUksS0FBSyxDQUFDLElBQUksS0FBTCxJQUFjLE9BQU8sVUFBOUI7QUFDQSxVQUFJLEtBQUssQ0FBQyxJQUFJLEtBQUwsSUFBYyxPQUFPLFdBQTlCO0FBQ0EsVUFBSSxJQUFJLEtBQUssR0FBTCxDQUFTLFlBQVksUUFBckIsRUFBK0IsR0FBL0IsQ0FBUjs7QUFFQSxnQkFBVSxJQUFJLEVBQWQ7QUFDQSxjQUFRLElBQUksRUFBWjtBQUNEO0FBQ0QsWUFBUSxDQUFSO0FBQ0EsWUFBUSxDQUFSO0FBQ0QsR0FYRDs7QUFhQSxhQUFXLFVBQVUsRUFBVixFQUFjLEVBQWQsRUFBa0I7QUFDM0IsaUJBQWEsS0FBSyxPQUFPLFdBQXpCO0FBQ0QsR0FGRDs7QUFJQSxXQUFTLElBQVQsQ0FBZSxDQUFmLEVBQWtCO0FBQ2hCLFFBQUksS0FBSyxJQUFJLEdBQWI7QUFDQSxRQUFJLEtBQUssR0FBVCxFQUFjO0FBQ1osYUFBTyxDQUFQO0FBQ0Q7QUFDRCxXQUFPLEVBQVA7QUFDRDs7QUFFRCxXQUFTLEtBQVQsQ0FBZ0IsQ0FBaEIsRUFBbUIsRUFBbkIsRUFBdUIsRUFBdkIsRUFBMkI7QUFDekIsV0FBTyxLQUFLLEdBQUwsQ0FBUyxLQUFLLEdBQUwsQ0FBUyxDQUFULEVBQVksRUFBWixDQUFULEVBQTBCLEVBQTFCLENBQVA7QUFDRDs7QUFFRCxXQUFTLFlBQVQsR0FBeUI7QUFDdkIsUUFBSSxTQUFTLFlBQVksTUFBekI7QUFDQSxRQUFJLE1BQU0sWUFBWSxHQUF0QjtBQUNBLFFBQUksS0FBSyxZQUFZLEVBQXJCOztBQUVBLGdCQUFZLEtBQVosSUFBcUIsTUFBckI7QUFDQSxnQkFBWSxHQUFaLEdBQWtCLE1BQ2hCLFlBQVksR0FBWixHQUFrQixJQURGLEVBRWhCLENBQUMsS0FBSyxFQUFOLEdBQVcsR0FGSyxFQUdoQixLQUFLLEVBQUwsR0FBVSxHQUhNLENBQWxCO0FBSUEsZ0JBQVksUUFBWixHQUF1QixNQUNyQixZQUFZLFFBQVosR0FBdUIsU0FERixFQUVyQixXQUZxQixFQUdyQixXQUhxQixDQUF2Qjs7QUFLQSxhQUFTLEtBQUssTUFBTCxDQUFUO0FBQ0EsV0FBTyxLQUFLLElBQUwsQ0FBUDtBQUNBLGdCQUFZLEtBQUssU0FBTCxDQUFaOztBQUVBLFFBQUksUUFBUSxZQUFZLEtBQXhCO0FBQ0EsUUFBSSxNQUFNLFlBQVksR0FBdEI7QUFDQSxRQUFJLElBQUksS0FBSyxHQUFMLENBQVMsWUFBWSxRQUFyQixDQUFSOztBQUVBLFFBQUksS0FBSyxJQUFJLEtBQUssR0FBTCxDQUFTLEtBQVQsQ0FBSixHQUFzQixLQUFLLEdBQUwsQ0FBUyxHQUFULENBQS9CO0FBQ0EsUUFBSSxLQUFLLElBQUksS0FBSyxHQUFMLENBQVMsS0FBVCxDQUFKLEdBQXNCLEtBQUssR0FBTCxDQUFTLEdBQVQsQ0FBL0I7QUFDQSxRQUFJLEtBQUssSUFBSSxLQUFLLEdBQUwsQ0FBUyxHQUFULENBQWI7O0FBRUEsU0FBSyxJQUFJLElBQUksQ0FBYixFQUFnQixJQUFJLENBQXBCLEVBQXVCLEVBQUUsQ0FBekIsRUFBNEI7QUFDMUIsVUFBSSxDQUFKLElBQVMsT0FBTyxDQUFQLElBQVksS0FBSyxNQUFNLENBQU4sQ0FBakIsR0FBNEIsS0FBSyxNQUFNLENBQU4sQ0FBakMsR0FBNEMsS0FBSyxHQUFHLENBQUgsQ0FBMUQ7QUFDRDs7QUFFRCxXQUFPLFlBQVksSUFBbkIsRUFBeUIsR0FBekIsRUFBOEIsTUFBOUIsRUFBc0MsRUFBdEM7QUFDRDs7QUFFRCxNQUFJLGdCQUFnQixLQUFLO0FBQ3ZCLGFBQVMsT0FBTyxNQUFQLENBQWMsRUFBZCxFQUFrQixXQUFsQixFQUErQjtBQUN0QyxrQkFBWSxVQUFVLEVBQUMsYUFBRCxFQUFnQixjQUFoQixFQUFWLEVBQTJDO0FBQ3JELGVBQU8sWUFBWSxZQUFZLFVBQXhCLEVBQ0wsS0FBSyxFQUFMLEdBQVUsR0FETCxFQUVMLGdCQUFnQixjQUZYLEVBR0wsSUFISyxFQUlMLE1BSkssQ0FBUDtBQUtEO0FBUHFDLEtBQS9CLENBRGM7QUFVdkIsY0FBVSxPQUFPLElBQVAsQ0FBWSxXQUFaLEVBQXlCLE1BQXpCLENBQWdDLFVBQVUsUUFBVixFQUFvQixJQUFwQixFQUEwQjtBQUNsRSxlQUFTLElBQVQsSUFBaUIsS0FBSyxPQUFMLENBQWEsSUFBYixDQUFqQjtBQUNBLGFBQU8sUUFBUDtBQUNELEtBSFMsRUFHUCxFQUhPO0FBVmEsR0FBTCxDQUFwQjs7QUFnQkEsV0FBUyxXQUFULENBQXNCLEtBQXRCLEVBQTZCO0FBQzNCO0FBQ0Esa0JBQWMsS0FBZDtBQUNEOztBQUVELFNBQU8sSUFBUCxDQUFZLFdBQVosRUFBeUIsT0FBekIsQ0FBaUMsVUFBVSxJQUFWLEVBQWdCO0FBQy9DLGdCQUFZLElBQVosSUFBb0IsWUFBWSxJQUFaLENBQXBCO0FBQ0QsR0FGRDs7QUFJQSxTQUFPLFdBQVA7QUFDRDs7O0FDekhELElBQUksV0FBVyxJQUFmOztBQUVBLFNBQVMsZUFBVCxHQUE0QjtBQUMxQixPQUFLLEtBQUwsR0FBYSxDQUFiOztBQUVBLE9BQUssQ0FBTCxHQUFTLEdBQVQ7QUFDQSxPQUFLLENBQUwsR0FBUyxHQUFUO0FBQ0EsT0FBSyxDQUFMLEdBQVMsR0FBVDtBQUNBLE9BQUssQ0FBTCxHQUFTLEdBQVQ7O0FBRUEsT0FBSyxNQUFMLEdBQWMsSUFBZDtBQUNBLE9BQUssSUFBTCxHQUFZLENBQVo7QUFDQSxPQUFLLFVBQUwsR0FBa0IsS0FBbEI7QUFDQSxPQUFLLElBQUwsR0FBWSxRQUFaO0FBQ0EsT0FBSyxNQUFMLEdBQWMsQ0FBZDtBQUNBLE9BQUssTUFBTCxHQUFjLENBQWQ7QUFDQSxPQUFLLE9BQUwsR0FBZSxDQUFmO0FBQ0Q7O0FBRUQsT0FBTyxPQUFQLEdBQWlCLFNBQVMsa0JBQVQsQ0FDZixFQURlLEVBRWYsVUFGZSxFQUdmLE1BSGUsRUFJZixXQUplLEVBS2YsV0FMZSxFQUtGO0FBQ2IsTUFBSSxpQkFBaUIsT0FBTyxhQUE1QjtBQUNBLE1BQUksb0JBQW9CLElBQUksS0FBSixDQUFVLGNBQVYsQ0FBeEI7QUFDQSxPQUFLLElBQUksSUFBSSxDQUFiLEVBQWdCLElBQUksY0FBcEIsRUFBb0MsRUFBRSxDQUF0QyxFQUF5QztBQUN2QyxzQkFBa0IsQ0FBbEIsSUFBdUIsSUFBSSxlQUFKLEVBQXZCO0FBQ0Q7O0FBRUQsU0FBTztBQUNMLFlBQVEsZUFESDtBQUVMLFdBQU8sRUFGRjtBQUdMLFdBQU87QUFIRixHQUFQO0FBS0QsQ0FqQkQ7Ozs7QUNsQkEsSUFBSSxlQUFlLFFBQVEsdUJBQVIsQ0FBbkI7QUFDQSxJQUFJLGdCQUFnQixRQUFRLG1CQUFSLENBQXBCO0FBQ0EsSUFBSSxTQUFTLFFBQVEsZUFBUixDQUFiO0FBQ0EsSUFBSSxPQUFPLFFBQVEsYUFBUixDQUFYO0FBQ0EsSUFBSSxjQUFjLFFBQVEsZ0JBQVIsQ0FBbEI7O0FBRUEsSUFBSSxlQUFlLFlBQVksT0FBL0I7QUFDQSxJQUFJLGFBQWEsWUFBWSxLQUE3Qjs7QUFFQSxJQUFJLGFBQWEsUUFBUSw2QkFBUixDQUFqQjtBQUNBLElBQUksY0FBYyxRQUFRLHlCQUFSLENBQWxCO0FBQ0EsSUFBSSxhQUFhLFFBQVEsd0JBQVIsQ0FBakI7O0FBRUEsSUFBSSxpQkFBaUIsTUFBckI7QUFDQSxJQUFJLGlCQUFpQixNQUFyQjs7QUFFQSxJQUFJLG1CQUFtQixJQUF2QjtBQUNBLElBQUksV0FBVyxJQUFmOztBQUVBLElBQUksZUFBZSxFQUFuQjtBQUNBLGFBQWEsSUFBYixJQUFxQixDQUFyQixDLENBQXVCO0FBQ3ZCLGFBQWEsSUFBYixJQUFxQixDQUFyQixDLENBQXVCO0FBQ3ZCLGFBQWEsSUFBYixJQUFxQixDQUFyQixDLENBQXVCO0FBQ3ZCLGFBQWEsSUFBYixJQUFxQixDQUFyQixDLENBQXVCO0FBQ3ZCLGFBQWEsSUFBYixJQUFxQixDQUFyQixDLENBQXVCO0FBQ3ZCLGFBQWEsSUFBYixJQUFxQixDQUFyQixDLENBQXVCO0FBQ3ZCLGFBQWEsSUFBYixJQUFxQixDQUFyQixDLENBQXVCOztBQUV2QixTQUFTLGNBQVQsQ0FBeUIsSUFBekIsRUFBK0I7QUFDN0IsU0FBTyxXQUFXLE9BQU8sU0FBUCxDQUFpQixRQUFqQixDQUEwQixJQUExQixDQUErQixJQUEvQixDQUFYLElBQW1ELENBQTFEO0FBQ0Q7O0FBRUQsU0FBUyxTQUFULENBQW9CLEdBQXBCLEVBQXlCLEdBQXpCLEVBQThCO0FBQzVCLE9BQUssSUFBSSxJQUFJLENBQWIsRUFBZ0IsSUFBSSxJQUFJLE1BQXhCLEVBQWdDLEVBQUUsQ0FBbEMsRUFBcUM7QUFDbkMsUUFBSSxDQUFKLElBQVMsSUFBSSxDQUFKLENBQVQ7QUFDRDtBQUNGOztBQUVELFNBQVMsU0FBVCxDQUNFLE1BREYsRUFDVSxJQURWLEVBQ2dCLE1BRGhCLEVBQ3dCLE1BRHhCLEVBQ2dDLE9BRGhDLEVBQ3lDLE9BRHpDLEVBQ2tELE1BRGxELEVBQzBEO0FBQ3hELE1BQUksTUFBTSxDQUFWO0FBQ0EsT0FBSyxJQUFJLElBQUksQ0FBYixFQUFnQixJQUFJLE1BQXBCLEVBQTRCLEVBQUUsQ0FBOUIsRUFBaUM7QUFDL0IsU0FBSyxJQUFJLElBQUksQ0FBYixFQUFnQixJQUFJLE1BQXBCLEVBQTRCLEVBQUUsQ0FBOUIsRUFBaUM7QUFDL0IsYUFBTyxLQUFQLElBQWdCLEtBQUssVUFBVSxDQUFWLEdBQWMsVUFBVSxDQUF4QixHQUE0QixNQUFqQyxDQUFoQjtBQUNEO0FBQ0Y7QUFDRjs7QUFFRCxPQUFPLE9BQVAsR0FBaUIsU0FBUyxlQUFULENBQTBCLEVBQTFCLEVBQThCLEtBQTlCLEVBQXFDLE1BQXJDLEVBQTZDO0FBQzVELE1BQUksY0FBYyxDQUFsQjtBQUNBLE1BQUksWUFBWSxFQUFoQjs7QUFFQSxXQUFTLFVBQVQsQ0FBcUIsSUFBckIsRUFBMkI7QUFDekIsU0FBSyxFQUFMLEdBQVUsYUFBVjtBQUNBLFNBQUssTUFBTCxHQUFjLEdBQUcsWUFBSCxFQUFkO0FBQ0EsU0FBSyxJQUFMLEdBQVksSUFBWjtBQUNBLFNBQUssS0FBTCxHQUFhLGNBQWI7QUFDQSxTQUFLLFVBQUwsR0FBa0IsQ0FBbEI7QUFDQSxTQUFLLFNBQUwsR0FBaUIsQ0FBakI7QUFDQSxTQUFLLEtBQUwsR0FBYSxnQkFBYjs7QUFFQSxTQUFLLGNBQUwsR0FBc0IsSUFBdEI7O0FBRUEsUUFBSSxPQUFPLE9BQVgsRUFBb0I7QUFDbEIsV0FBSyxLQUFMLEdBQWEsRUFBQyxNQUFNLENBQVAsRUFBYjtBQUNEO0FBQ0Y7O0FBRUQsYUFBVyxTQUFYLENBQXFCLElBQXJCLEdBQTRCLFlBQVk7QUFDdEMsT0FBRyxVQUFILENBQWMsS0FBSyxJQUFuQixFQUF5QixLQUFLLE1BQTlCO0FBQ0QsR0FGRDs7QUFJQSxhQUFXLFNBQVgsQ0FBcUIsT0FBckIsR0FBK0IsWUFBWTtBQUN6QyxZQUFRLElBQVI7QUFDRCxHQUZEOztBQUlBLE1BQUksYUFBYSxFQUFqQjs7QUFFQSxXQUFTLFlBQVQsQ0FBdUIsSUFBdkIsRUFBNkIsSUFBN0IsRUFBbUM7QUFDakMsUUFBSSxTQUFTLFdBQVcsR0FBWCxFQUFiO0FBQ0EsUUFBSSxDQUFDLE1BQUwsRUFBYTtBQUNYLGVBQVMsSUFBSSxVQUFKLENBQWUsSUFBZixDQUFUO0FBQ0Q7QUFDRCxXQUFPLElBQVA7QUFDQSx1QkFBbUIsTUFBbkIsRUFBMkIsSUFBM0IsRUFBaUMsY0FBakMsRUFBaUQsQ0FBakQsRUFBb0QsQ0FBcEQsRUFBdUQsS0FBdkQ7QUFDQSxXQUFPLE1BQVA7QUFDRDs7QUFFRCxXQUFTLGFBQVQsQ0FBd0IsTUFBeEIsRUFBZ0M7QUFDOUIsZUFBVyxJQUFYLENBQWdCLE1BQWhCO0FBQ0Q7O0FBRUQsV0FBUyx3QkFBVCxDQUFtQyxNQUFuQyxFQUEyQyxJQUEzQyxFQUFpRCxLQUFqRCxFQUF3RDtBQUN0RCxXQUFPLFVBQVAsR0FBb0IsS0FBSyxVQUF6QjtBQUNBLE9BQUcsVUFBSCxDQUFjLE9BQU8sSUFBckIsRUFBMkIsSUFBM0IsRUFBaUMsS0FBakM7QUFDRDs7QUFFRCxXQUFTLGtCQUFULENBQTZCLE1BQTdCLEVBQXFDLElBQXJDLEVBQTJDLEtBQTNDLEVBQWtELEtBQWxELEVBQXlELFNBQXpELEVBQW9FLE9BQXBFLEVBQTZFO0FBQzNFLFFBQUksS0FBSjtBQUNBLFdBQU8sS0FBUCxHQUFlLEtBQWY7QUFDQSxRQUFJLE1BQU0sT0FBTixDQUFjLElBQWQsQ0FBSixFQUF5QjtBQUN2QixhQUFPLEtBQVAsR0FBZSxTQUFTLFFBQXhCO0FBQ0EsVUFBSSxLQUFLLE1BQUwsR0FBYyxDQUFsQixFQUFxQjtBQUNuQixZQUFJLFFBQUo7QUFDQSxZQUFJLE1BQU0sT0FBTixDQUFjLEtBQUssQ0FBTCxDQUFkLENBQUosRUFBNEI7QUFDMUIsa0JBQVEsV0FBVyxJQUFYLENBQVI7QUFDQSxjQUFJLE1BQU0sQ0FBVjtBQUNBLGVBQUssSUFBSSxJQUFJLENBQWIsRUFBZ0IsSUFBSSxNQUFNLE1BQTFCLEVBQWtDLEVBQUUsQ0FBcEMsRUFBdUM7QUFDckMsbUJBQU8sTUFBTSxDQUFOLENBQVA7QUFDRDtBQUNELGlCQUFPLFNBQVAsR0FBbUIsR0FBbkI7QUFDQSxxQkFBVyxhQUFhLElBQWIsRUFBbUIsS0FBbkIsRUFBMEIsT0FBTyxLQUFqQyxDQUFYO0FBQ0EsbUNBQXlCLE1BQXpCLEVBQWlDLFFBQWpDLEVBQTJDLEtBQTNDO0FBQ0EsY0FBSSxPQUFKLEVBQWE7QUFDWCxtQkFBTyxjQUFQLEdBQXdCLFFBQXhCO0FBQ0QsV0FGRCxNQUVPO0FBQ0wsaUJBQUssUUFBTCxDQUFjLFFBQWQ7QUFDRDtBQUNGLFNBZEQsTUFjTyxJQUFJLE9BQU8sS0FBSyxDQUFMLENBQVAsS0FBbUIsUUFBdkIsRUFBaUM7QUFDdEMsaUJBQU8sU0FBUCxHQUFtQixTQUFuQjtBQUNBLGNBQUksWUFBWSxLQUFLLFNBQUwsQ0FBZSxPQUFPLEtBQXRCLEVBQTZCLEtBQUssTUFBbEMsQ0FBaEI7QUFDQSxvQkFBVSxTQUFWLEVBQXFCLElBQXJCO0FBQ0EsbUNBQXlCLE1BQXpCLEVBQWlDLFNBQWpDLEVBQTRDLEtBQTVDO0FBQ0EsY0FBSSxPQUFKLEVBQWE7QUFDWCxtQkFBTyxjQUFQLEdBQXdCLFNBQXhCO0FBQ0QsV0FGRCxNQUVPO0FBQ0wsaUJBQUssUUFBTCxDQUFjLFNBQWQ7QUFDRDtBQUNGLFNBVk0sTUFVQSxJQUFJLGFBQWEsS0FBSyxDQUFMLENBQWIsQ0FBSixFQUEyQjtBQUNoQyxpQkFBTyxTQUFQLEdBQW1CLEtBQUssQ0FBTCxFQUFRLE1BQTNCO0FBQ0EsaUJBQU8sS0FBUCxHQUFlLFNBQVMsZUFBZSxLQUFLLENBQUwsQ0FBZixDQUFULElBQW9DLFFBQW5EO0FBQ0EscUJBQVcsYUFDVCxJQURTLEVBRVQsQ0FBQyxLQUFLLE1BQU4sRUFBYyxLQUFLLENBQUwsRUFBUSxNQUF0QixDQUZTLEVBR1QsT0FBTyxLQUhFLENBQVg7QUFJQSxtQ0FBeUIsTUFBekIsRUFBaUMsUUFBakMsRUFBMkMsS0FBM0M7QUFDQSxjQUFJLE9BQUosRUFBYTtBQUNYLG1CQUFPLGNBQVAsR0FBd0IsUUFBeEI7QUFDRCxXQUZELE1BRU87QUFDTCxpQkFBSyxRQUFMLENBQWMsUUFBZDtBQUNEO0FBQ0YsU0FiTSxNQWFBLENBRU47QUFDRjtBQUNGLEtBN0NELE1BNkNPLElBQUksYUFBYSxJQUFiLENBQUosRUFBd0I7QUFDN0IsYUFBTyxLQUFQLEdBQWUsU0FBUyxlQUFlLElBQWYsQ0FBeEI7QUFDQSxhQUFPLFNBQVAsR0FBbUIsU0FBbkI7QUFDQSwrQkFBeUIsTUFBekIsRUFBaUMsSUFBakMsRUFBdUMsS0FBdkM7QUFDQSxVQUFJLE9BQUosRUFBYTtBQUNYLGVBQU8sY0FBUCxHQUF3QixJQUFJLFVBQUosQ0FBZSxJQUFJLFVBQUosQ0FBZSxLQUFLLE1BQXBCLENBQWYsQ0FBeEI7QUFDRDtBQUNGLEtBUE0sTUFPQSxJQUFJLGNBQWMsSUFBZCxDQUFKLEVBQXlCO0FBQzlCLGNBQVEsS0FBSyxLQUFiO0FBQ0EsVUFBSSxTQUFTLEtBQUssTUFBbEI7QUFDQSxVQUFJLFNBQVMsS0FBSyxNQUFsQjs7QUFFQSxVQUFJLFNBQVMsQ0FBYjtBQUNBLFVBQUksU0FBUyxDQUFiO0FBQ0EsVUFBSSxVQUFVLENBQWQ7QUFDQSxVQUFJLFVBQVUsQ0FBZDtBQUNBLFVBQUksTUFBTSxNQUFOLEtBQWlCLENBQXJCLEVBQXdCO0FBQ3RCLGlCQUFTLE1BQU0sQ0FBTixDQUFUO0FBQ0EsaUJBQVMsQ0FBVDtBQUNBLGtCQUFVLE9BQU8sQ0FBUCxDQUFWO0FBQ0Esa0JBQVUsQ0FBVjtBQUNELE9BTEQsTUFLTyxJQUFJLE1BQU0sTUFBTixLQUFpQixDQUFyQixFQUF3QjtBQUM3QixpQkFBUyxNQUFNLENBQU4sQ0FBVDtBQUNBLGlCQUFTLE1BQU0sQ0FBTixDQUFUO0FBQ0Esa0JBQVUsT0FBTyxDQUFQLENBQVY7QUFDQSxrQkFBVSxPQUFPLENBQVAsQ0FBVjtBQUNELE9BTE0sTUFLQSxDQUVOOztBQUVELGFBQU8sS0FBUCxHQUFlLFNBQVMsZUFBZSxLQUFLLElBQXBCLENBQVQsSUFBc0MsUUFBckQ7QUFDQSxhQUFPLFNBQVAsR0FBbUIsTUFBbkI7O0FBRUEsVUFBSSxnQkFBZ0IsS0FBSyxTQUFMLENBQWUsT0FBTyxLQUF0QixFQUE2QixTQUFTLE1BQXRDLENBQXBCO0FBQ0EsZ0JBQVUsYUFBVixFQUNFLEtBQUssSUFEUCxFQUVFLE1BRkYsRUFFVSxNQUZWLEVBR0UsT0FIRixFQUdXLE9BSFgsRUFJRSxNQUpGO0FBS0EsK0JBQXlCLE1BQXpCLEVBQWlDLGFBQWpDLEVBQWdELEtBQWhEO0FBQ0EsVUFBSSxPQUFKLEVBQWE7QUFDWCxlQUFPLGNBQVAsR0FBd0IsYUFBeEI7QUFDRCxPQUZELE1BRU87QUFDTCxhQUFLLFFBQUwsQ0FBYyxhQUFkO0FBQ0Q7QUFDRixLQXRDTSxNQXNDQSxDQUVOO0FBQ0Y7O0FBRUQsV0FBUyxPQUFULENBQWtCLE1BQWxCLEVBQTBCO0FBQ3hCLFVBQU0sV0FBTjs7QUFFQSxRQUFJLFNBQVMsT0FBTyxNQUFwQjs7QUFFQSxPQUFHLFlBQUgsQ0FBZ0IsTUFBaEI7QUFDQSxXQUFPLE1BQVAsR0FBZ0IsSUFBaEI7QUFDQSxXQUFPLFVBQVUsT0FBTyxFQUFqQixDQUFQO0FBQ0Q7O0FBRUQsV0FBUyxZQUFULENBQXVCLE9BQXZCLEVBQWdDLElBQWhDLEVBQXNDLFNBQXRDLEVBQWlELFVBQWpELEVBQTZEO0FBQzNELFVBQU0sV0FBTjs7QUFFQSxRQUFJLFNBQVMsSUFBSSxVQUFKLENBQWUsSUFBZixDQUFiO0FBQ0EsY0FBVSxPQUFPLEVBQWpCLElBQXVCLE1BQXZCOztBQUVBLGFBQVMsVUFBVCxDQUFxQixPQUFyQixFQUE4QjtBQUM1QixVQUFJLFFBQVEsY0FBWjtBQUNBLFVBQUksT0FBTyxJQUFYO0FBQ0EsVUFBSSxhQUFhLENBQWpCO0FBQ0EsVUFBSSxRQUFRLENBQVo7QUFDQSxVQUFJLFlBQVksQ0FBaEI7QUFDQSxVQUFJLE1BQU0sT0FBTixDQUFjLE9BQWQsS0FDQSxhQUFhLE9BQWIsQ0FEQSxJQUVBLGNBQWMsT0FBZCxDQUZKLEVBRTRCO0FBQzFCLGVBQU8sT0FBUDtBQUNELE9BSkQsTUFJTyxJQUFJLE9BQU8sT0FBUCxLQUFtQixRQUF2QixFQUFpQztBQUN0QyxxQkFBYSxVQUFVLENBQXZCO0FBQ0QsT0FGTSxNQUVBLElBQUksT0FBSixFQUFhOztBQUdsQixZQUFJLFVBQVUsT0FBZCxFQUF1Qjs7QUFFckIsaUJBQU8sUUFBUSxJQUFmO0FBQ0Q7O0FBRUQsWUFBSSxXQUFXLE9BQWYsRUFBd0I7O0FBRXRCLGtCQUFRLFdBQVcsUUFBUSxLQUFuQixDQUFSO0FBQ0Q7O0FBRUQsWUFBSSxVQUFVLE9BQWQsRUFBdUI7O0FBRXJCLGtCQUFRLFlBQVksUUFBUSxJQUFwQixDQUFSO0FBQ0Q7O0FBRUQsWUFBSSxlQUFlLE9BQW5CLEVBQTRCOztBQUUxQixzQkFBWSxRQUFRLFNBQVIsR0FBb0IsQ0FBaEM7QUFDRDs7QUFFRCxZQUFJLFlBQVksT0FBaEIsRUFBeUI7O0FBRXZCLHVCQUFhLFFBQVEsTUFBUixHQUFpQixDQUE5QjtBQUNEO0FBQ0Y7O0FBRUQsYUFBTyxJQUFQO0FBQ0EsVUFBSSxDQUFDLElBQUwsRUFBVztBQUNULFdBQUcsVUFBSCxDQUFjLE9BQU8sSUFBckIsRUFBMkIsVUFBM0IsRUFBdUMsS0FBdkM7QUFDQSxlQUFPLEtBQVAsR0FBZSxTQUFTLGdCQUF4QjtBQUNBLGVBQU8sS0FBUCxHQUFlLEtBQWY7QUFDQSxlQUFPLFNBQVAsR0FBbUIsU0FBbkI7QUFDQSxlQUFPLFVBQVAsR0FBb0IsVUFBcEI7QUFDRCxPQU5ELE1BTU87QUFDTCwyQkFBbUIsTUFBbkIsRUFBMkIsSUFBM0IsRUFBaUMsS0FBakMsRUFBd0MsS0FBeEMsRUFBK0MsU0FBL0MsRUFBMEQsVUFBMUQ7QUFDRDs7QUFFRCxVQUFJLE9BQU8sT0FBWCxFQUFvQjtBQUNsQixlQUFPLEtBQVAsQ0FBYSxJQUFiLEdBQW9CLE9BQU8sVUFBUCxHQUFvQixhQUFhLE9BQU8sS0FBcEIsQ0FBeEM7QUFDRDs7QUFFRCxhQUFPLFVBQVA7QUFDRDs7QUFFRCxhQUFTLFVBQVQsQ0FBcUIsSUFBckIsRUFBMkIsTUFBM0IsRUFBbUM7O0FBR2pDLFNBQUcsYUFBSCxDQUFpQixPQUFPLElBQXhCLEVBQThCLE1BQTlCLEVBQXNDLElBQXRDO0FBQ0Q7O0FBRUQsYUFBUyxPQUFULENBQWtCLElBQWxCLEVBQXdCLE9BQXhCLEVBQWlDO0FBQy9CLFVBQUksU0FBUyxDQUFDLFdBQVcsQ0FBWixJQUFpQixDQUE5QjtBQUNBLFVBQUksS0FBSjtBQUNBLGFBQU8sSUFBUDtBQUNBLFVBQUksTUFBTSxPQUFOLENBQWMsSUFBZCxDQUFKLEVBQXlCO0FBQ3ZCLFlBQUksS0FBSyxNQUFMLEdBQWMsQ0FBbEIsRUFBcUI7QUFDbkIsY0FBSSxPQUFPLEtBQUssQ0FBTCxDQUFQLEtBQW1CLFFBQXZCLEVBQWlDO0FBQy9CLGdCQUFJLFlBQVksS0FBSyxTQUFMLENBQWUsT0FBTyxLQUF0QixFQUE2QixLQUFLLE1BQWxDLENBQWhCO0FBQ0Esc0JBQVUsU0FBVixFQUFxQixJQUFyQjtBQUNBLHVCQUFXLFNBQVgsRUFBc0IsTUFBdEI7QUFDQSxpQkFBSyxRQUFMLENBQWMsU0FBZDtBQUNELFdBTEQsTUFLTyxJQUFJLE1BQU0sT0FBTixDQUFjLEtBQUssQ0FBTCxDQUFkLEtBQTBCLGFBQWEsS0FBSyxDQUFMLENBQWIsQ0FBOUIsRUFBcUQ7QUFDMUQsb0JBQVEsV0FBVyxJQUFYLENBQVI7QUFDQSxnQkFBSSxXQUFXLGFBQWEsSUFBYixFQUFtQixLQUFuQixFQUEwQixPQUFPLEtBQWpDLENBQWY7QUFDQSx1QkFBVyxRQUFYLEVBQXFCLE1BQXJCO0FBQ0EsaUJBQUssUUFBTCxDQUFjLFFBQWQ7QUFDRCxXQUxNLE1BS0EsQ0FFTjtBQUNGO0FBQ0YsT0FoQkQsTUFnQk8sSUFBSSxhQUFhLElBQWIsQ0FBSixFQUF3QjtBQUM3QixtQkFBVyxJQUFYLEVBQWlCLE1BQWpCO0FBQ0QsT0FGTSxNQUVBLElBQUksY0FBYyxJQUFkLENBQUosRUFBeUI7QUFDOUIsZ0JBQVEsS0FBSyxLQUFiO0FBQ0EsWUFBSSxTQUFTLEtBQUssTUFBbEI7O0FBRUEsWUFBSSxTQUFTLENBQWI7QUFDQSxZQUFJLFNBQVMsQ0FBYjtBQUNBLFlBQUksVUFBVSxDQUFkO0FBQ0EsWUFBSSxVQUFVLENBQWQ7QUFDQSxZQUFJLE1BQU0sTUFBTixLQUFpQixDQUFyQixFQUF3QjtBQUN0QixtQkFBUyxNQUFNLENBQU4sQ0FBVDtBQUNBLG1CQUFTLENBQVQ7QUFDQSxvQkFBVSxPQUFPLENBQVAsQ0FBVjtBQUNBLG9CQUFVLENBQVY7QUFDRCxTQUxELE1BS08sSUFBSSxNQUFNLE1BQU4sS0FBaUIsQ0FBckIsRUFBd0I7QUFDN0IsbUJBQVMsTUFBTSxDQUFOLENBQVQ7QUFDQSxtQkFBUyxNQUFNLENBQU4sQ0FBVDtBQUNBLG9CQUFVLE9BQU8sQ0FBUCxDQUFWO0FBQ0Esb0JBQVUsT0FBTyxDQUFQLENBQVY7QUFDRCxTQUxNLE1BS0EsQ0FFTjtBQUNELFlBQUksUUFBUSxNQUFNLE9BQU4sQ0FBYyxLQUFLLElBQW5CLElBQ1IsT0FBTyxLQURDLEdBRVIsZUFBZSxLQUFLLElBQXBCLENBRko7O0FBSUEsWUFBSSxnQkFBZ0IsS0FBSyxTQUFMLENBQWUsS0FBZixFQUFzQixTQUFTLE1BQS9CLENBQXBCO0FBQ0Esa0JBQVUsYUFBVixFQUNFLEtBQUssSUFEUCxFQUVFLE1BRkYsRUFFVSxNQUZWLEVBR0UsT0FIRixFQUdXLE9BSFgsRUFJRSxLQUFLLE1BSlA7QUFLQSxtQkFBVyxhQUFYLEVBQTBCLE1BQTFCO0FBQ0EsYUFBSyxRQUFMLENBQWMsYUFBZDtBQUNELE9BakNNLE1BaUNBLENBRU47QUFDRCxhQUFPLFVBQVA7QUFDRDs7QUFFRCxRQUFJLENBQUMsU0FBTCxFQUFnQjtBQUNkLGlCQUFXLE9BQVg7QUFDRDs7QUFFRCxlQUFXLFNBQVgsR0FBdUIsUUFBdkI7QUFDQSxlQUFXLE9BQVgsR0FBcUIsTUFBckI7QUFDQSxlQUFXLE9BQVgsR0FBcUIsT0FBckI7QUFDQSxRQUFJLE9BQU8sT0FBWCxFQUFvQjtBQUNsQixpQkFBVyxLQUFYLEdBQW1CLE9BQU8sS0FBMUI7QUFDRDtBQUNELGVBQVcsT0FBWCxHQUFxQixZQUFZO0FBQUUsY0FBUSxNQUFSO0FBQWlCLEtBQXBEOztBQUVBLFdBQU8sVUFBUDtBQUNEOztBQUVELFdBQVMsY0FBVCxHQUEyQjtBQUN6QixXQUFPLFNBQVAsRUFBa0IsT0FBbEIsQ0FBMEIsVUFBVSxNQUFWLEVBQWtCO0FBQzFDLGFBQU8sTUFBUCxHQUFnQixHQUFHLFlBQUgsRUFBaEI7QUFDQSxTQUFHLFVBQUgsQ0FBYyxPQUFPLElBQXJCLEVBQTJCLE9BQU8sTUFBbEM7QUFDQSxTQUFHLFVBQUgsQ0FDRSxPQUFPLElBRFQsRUFDZSxPQUFPLGNBQVAsSUFBeUIsT0FBTyxVQUQvQyxFQUMyRCxPQUFPLEtBRGxFO0FBRUQsS0FMRDtBQU1EOztBQUVELE1BQUksT0FBTyxPQUFYLEVBQW9CO0FBQ2xCLFVBQU0sa0JBQU4sR0FBMkIsWUFBWTtBQUNyQyxVQUFJLFFBQVEsQ0FBWjtBQUNBO0FBQ0EsYUFBTyxJQUFQLENBQVksU0FBWixFQUF1QixPQUF2QixDQUErQixVQUFVLEdBQVYsRUFBZTtBQUM1QyxpQkFBUyxVQUFVLEdBQVYsRUFBZSxLQUFmLENBQXFCLElBQTlCO0FBQ0QsT0FGRDtBQUdBLGFBQU8sS0FBUDtBQUNELEtBUEQ7QUFRRDs7QUFFRCxTQUFPO0FBQ0wsWUFBUSxZQURIOztBQUdMLGtCQUFjLFlBSFQ7QUFJTCxtQkFBZSxhQUpWOztBQU1MLFdBQU8sWUFBWTtBQUNqQixhQUFPLFNBQVAsRUFBa0IsT0FBbEIsQ0FBMEIsT0FBMUI7QUFDQSxpQkFBVyxPQUFYLENBQW1CLE9BQW5CO0FBQ0QsS0FUSTs7QUFXTCxlQUFXLFVBQVUsT0FBVixFQUFtQjtBQUM1QixVQUFJLFdBQVcsUUFBUSxPQUFSLFlBQTJCLFVBQTFDLEVBQXNEO0FBQ3BELGVBQU8sUUFBUSxPQUFmO0FBQ0Q7QUFDRCxhQUFPLElBQVA7QUFDRCxLQWhCSTs7QUFrQkwsYUFBUyxjQWxCSjs7QUFvQkwsaUJBQWE7QUFwQlIsR0FBUDtBQXNCRCxDQTFWRDs7O0FDakRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUNKQSxJQUFJLG9CQUFvQixRQUFRLGdCQUFSLENBQXhCO0FBQ0EsSUFBSSxPQUFPLFFBQVEsYUFBUixDQUFYO0FBQ0EsSUFBSSxlQUFlLFFBQVEsdUJBQVIsQ0FBbkI7QUFDQSxJQUFJLFlBQVksUUFBUSxtQkFBUixDQUFoQjtBQUNBLElBQUksY0FBYyxRQUFRLHNCQUFSLENBQWxCO0FBQ0EsSUFBSSxVQUFVLFFBQVEsV0FBUixDQUFkOztBQUVBLElBQUksWUFBWSxRQUFRLDZCQUFSLENBQWhCO0FBQ0EsSUFBSSxVQUFVLFFBQVEseUJBQVIsQ0FBZDs7QUFFQTtBQUNBLElBQUksa0JBQWtCLE9BQU8sS0FBUCxDQUFhLEVBQWIsQ0FBdEI7O0FBRUEsSUFBSSxtQkFBbUIsSUFBdkI7O0FBRUEsSUFBSSx1QkFBdUIsQ0FBM0I7QUFDQSxJQUFJLHdCQUF3QixDQUE1Qjs7QUFFQSxJQUFJLFdBQVcsQ0FBZjtBQUNBLElBQUksV0FBVyxDQUFmO0FBQ0EsSUFBSSxjQUFjLENBQWxCO0FBQ0EsSUFBSSxZQUFZLENBQWhCO0FBQ0EsSUFBSSxZQUFZLENBQWhCOztBQUVBLElBQUksV0FBVyxRQUFmO0FBQ0EsSUFBSSxpQkFBaUIsY0FBckI7QUFDQSxJQUFJLGdCQUFnQixhQUFwQjtBQUNBLElBQUksbUJBQW1CLGdCQUF2QjtBQUNBLElBQUksZUFBZSxZQUFuQjtBQUNBLElBQUksaUJBQWlCLGNBQXJCO0FBQ0EsSUFBSSxlQUFlLFlBQW5CO0FBQ0EsSUFBSSxnQkFBZ0IsYUFBcEI7QUFDQSxJQUFJLGVBQWUsWUFBbkI7QUFDQSxJQUFJLGVBQWUsV0FBbkI7QUFDQSxJQUFJLGdCQUFnQixhQUFwQjtBQUNBLElBQUksY0FBYyxXQUFsQjtBQUNBLElBQUksZUFBZSxXQUFuQjtBQUNBLElBQUksZUFBZSxXQUFuQjtBQUNBLElBQUksMEJBQTBCLHNCQUE5QjtBQUNBLElBQUksMEJBQTBCLHNCQUE5QjtBQUNBLElBQUksaUJBQWlCLGNBQXJCO0FBQ0EsSUFBSSxrQkFBa0IsZUFBdEI7QUFDQSxJQUFJLG9CQUFvQixpQkFBeEI7QUFDQSxJQUFJLG1CQUFtQixnQkFBdkI7QUFDQSxJQUFJLGlCQUFpQixjQUFyQjtBQUNBLElBQUksaUJBQWlCLGNBQXJCO0FBQ0EsSUFBSSxvQkFBb0IsaUJBQXhCO0FBQ0EsSUFBSSxtQkFBbUIsZ0JBQXZCO0FBQ0EsSUFBSSxtQkFBbUIsZ0JBQXZCO0FBQ0EsSUFBSSxnQkFBZ0IsYUFBcEI7QUFDQSxJQUFJLGFBQWEsVUFBakI7O0FBRUEsSUFBSSxZQUFZLFNBQWhCOztBQUVBLElBQUksZ0JBQWdCLGFBQXBCO0FBQ0EsSUFBSSxTQUFTLE1BQWI7QUFDQSxJQUFJLFNBQVMsTUFBYjtBQUNBLElBQUksYUFBYSxVQUFqQjtBQUNBLElBQUksY0FBYyxXQUFsQjtBQUNBLElBQUksVUFBVSxPQUFkO0FBQ0EsSUFBSSxXQUFXLFFBQWY7QUFDQSxJQUFJLGNBQWMsV0FBbEI7O0FBRUEsSUFBSSxlQUFlLE9BQW5CO0FBQ0EsSUFBSSxnQkFBZ0IsUUFBcEI7O0FBRUEsSUFBSSxzQkFBc0IsZ0JBQWdCLFlBQTFDO0FBQ0EsSUFBSSx1QkFBdUIsZ0JBQWdCLGFBQTNDO0FBQ0EsSUFBSSxtQkFBbUIsYUFBYSxZQUFwQztBQUNBLElBQUksb0JBQW9CLGFBQWEsYUFBckM7QUFDQSxJQUFJLGtCQUFrQixlQUF0QjtBQUNBLElBQUksd0JBQXdCLGtCQUFrQixZQUE5QztBQUNBLElBQUkseUJBQXlCLGtCQUFrQixhQUEvQzs7QUFFQSxJQUFJLGlCQUFpQixDQUNuQixZQURtQixFQUVuQixnQkFGbUIsRUFHbkIsY0FIbUIsRUFJbkIsaUJBSm1CLEVBS25CLGdCQUxtQixFQU1uQixpQkFObUIsRUFPbkIsVUFQbUIsRUFRbkIsYUFSbUIsRUFTbkIsdUJBVG1CLENBQXJCOztBQVlBLElBQUksa0JBQWtCLEtBQXRCO0FBQ0EsSUFBSSwwQkFBMEIsS0FBOUI7O0FBRUEsSUFBSSxxQkFBcUIsS0FBekI7QUFDQSxJQUFJLG1CQUFtQixLQUF2Qjs7QUFFQSxJQUFJLGdCQUFnQixNQUFwQjtBQUNBLElBQUksc0JBQXNCLE1BQTFCOztBQUVBLElBQUksZUFBZSxNQUFuQjtBQUNBLElBQUksV0FBVyxNQUFmO0FBQ0EsSUFBSSxZQUFZLE1BQWhCO0FBQ0EsSUFBSSxrQkFBa0IsTUFBdEI7QUFDQSxJQUFJLGdCQUFnQixNQUFwQjtBQUNBLElBQUksa0JBQWtCLE1BQXRCO0FBQ0EsSUFBSSx5QkFBeUIsTUFBN0I7QUFDQSxJQUFJLDhCQUE4QixNQUFsQztBQUNBLElBQUkscUJBQXFCLE1BQXpCOztBQUVBLElBQUksV0FBVyxJQUFmO0FBQ0EsSUFBSSxnQkFBZ0IsS0FBcEI7QUFDQSxJQUFJLGdCQUFnQixLQUFwQjtBQUNBLElBQUksZ0JBQWdCLEtBQXBCO0FBQ0EsSUFBSSxTQUFTLElBQWI7QUFDQSxJQUFJLGNBQWMsS0FBbEI7QUFDQSxJQUFJLGNBQWMsS0FBbEI7QUFDQSxJQUFJLGNBQWMsS0FBbEI7QUFDQSxJQUFJLFVBQVUsS0FBZDtBQUNBLElBQUksZUFBZSxLQUFuQjtBQUNBLElBQUksZUFBZSxLQUFuQjtBQUNBLElBQUksZUFBZSxLQUFuQjtBQUNBLElBQUksZ0JBQWdCLEtBQXBCO0FBQ0EsSUFBSSxnQkFBZ0IsS0FBcEI7QUFDQSxJQUFJLGdCQUFnQixLQUFwQjtBQUNBLElBQUksZ0JBQWdCLEtBQXBCO0FBQ0EsSUFBSSxrQkFBa0IsS0FBdEI7O0FBRUEsSUFBSSxlQUFlLENBQW5COztBQUVBLElBQUksV0FBVyxJQUFmO0FBQ0EsSUFBSSxVQUFVLElBQWQ7QUFDQSxJQUFJLFFBQVEsTUFBWjtBQUNBLElBQUksU0FBUyxNQUFiO0FBQ0EsSUFBSSxhQUFhLE1BQWpCO0FBQ0EsSUFBSSxhQUFhLE1BQWpCO0FBQ0EsSUFBSSxZQUFZLEdBQWhCO0FBQ0EsSUFBSSxVQUFVLElBQWQ7QUFDQSxJQUFJLFVBQVUsQ0FBZDtBQUNBLElBQUksU0FBUyxDQUFiO0FBQ0EsSUFBSSxjQUFjLE1BQWxCO0FBQ0EsSUFBSSxVQUFVLEdBQWQ7O0FBRUEsSUFBSSxpQkFBaUIsTUFBckI7QUFDQSxJQUFJLHVCQUF1QixNQUEzQjs7QUFFQSxJQUFJLGFBQWE7QUFDZixPQUFLLENBRFU7QUFFZixPQUFLLENBRlU7QUFHZixVQUFRLENBSE87QUFJZixTQUFPLENBSlE7QUFLZixlQUFhLEdBTEU7QUFNZix5QkFBdUIsR0FOUjtBQU9mLGVBQWEsR0FQRTtBQVFmLHlCQUF1QixHQVJSO0FBU2YsZUFBYSxHQVRFO0FBVWYseUJBQXVCLEdBVlI7QUFXZixlQUFhLEdBWEU7QUFZZix5QkFBdUIsR0FaUjtBQWFmLG9CQUFrQixLQWJIO0FBY2YsOEJBQTRCLEtBZGI7QUFlZixvQkFBa0IsS0FmSDtBQWdCZiw4QkFBNEIsS0FoQmI7QUFpQmYsd0JBQXNCO0FBakJQLENBQWpCOztBQW9CQTtBQUNBO0FBQ0E7QUFDQSxJQUFJLDJCQUEyQixDQUM3QixnQ0FENkIsRUFFN0IsMENBRjZCLEVBRzdCLDBDQUg2QixFQUk3QixvREFKNkIsRUFLN0IsZ0NBTDZCLEVBTTdCLDBDQU42QixFQU83QiwwQ0FQNkIsRUFRN0Isb0RBUjZCLENBQS9COztBQVdBLElBQUksZUFBZTtBQUNqQixXQUFTLEdBRFE7QUFFakIsVUFBUSxHQUZTO0FBR2pCLE9BQUssR0FIWTtBQUlqQixXQUFTLEdBSlE7QUFLakIsT0FBSyxHQUxZO0FBTWpCLFFBQU0sR0FOVztBQU9qQixTQUFPLEdBUFU7QUFRakIsWUFBVSxHQVJPO0FBU2pCLFFBQU0sR0FUVztBQVVqQixhQUFXLEdBVk07QUFXakIsT0FBSyxHQVhZO0FBWWpCLGNBQVksR0FaSztBQWFqQixRQUFNLEdBYlc7QUFjakIsU0FBTyxHQWRVO0FBZWpCLFlBQVUsR0FmTztBQWdCakIsUUFBTSxHQWhCVztBQWlCakIsWUFBVTtBQWpCTyxDQUFuQjs7QUFvQkEsSUFBSSxhQUFhO0FBQ2YsT0FBSyxDQURVO0FBRWYsVUFBUSxDQUZPO0FBR2YsVUFBUSxJQUhPO0FBSWYsYUFBVyxJQUpJO0FBS2YsZUFBYSxJQUxFO0FBTWYsZUFBYSxJQU5FO0FBT2Ysb0JBQWtCLEtBUEg7QUFRZixvQkFBa0IsS0FSSDtBQVNmLFlBQVU7QUFUSyxDQUFqQjs7QUFZQSxJQUFJLGFBQWE7QUFDZixVQUFRLGtCQURPO0FBRWYsVUFBUTtBQUZPLENBQWpCOztBQUtBLElBQUksa0JBQWtCO0FBQ3BCLFFBQU0sS0FEYztBQUVwQixTQUFPO0FBRmEsQ0FBdEI7O0FBS0EsU0FBUyxZQUFULENBQXVCLENBQXZCLEVBQTBCO0FBQ3hCLFNBQU8sTUFBTSxPQUFOLENBQWMsQ0FBZCxLQUNMLGFBQWEsQ0FBYixDQURLLElBRUwsVUFBVSxDQUFWLENBRkY7QUFHRDs7QUFFRDtBQUNBLFNBQVMsU0FBVCxDQUFvQixLQUFwQixFQUEyQjtBQUN6QixTQUFPLE1BQU0sSUFBTixDQUFXLFVBQVUsQ0FBVixFQUFhLENBQWIsRUFBZ0I7QUFDaEMsUUFBSSxNQUFNLFVBQVYsRUFBc0I7QUFDcEIsYUFBTyxDQUFDLENBQVI7QUFDRCxLQUZELE1BRU8sSUFBSSxNQUFNLFVBQVYsRUFBc0I7QUFDM0IsYUFBTyxDQUFQO0FBQ0Q7QUFDRCxXQUFRLElBQUksQ0FBTCxHQUFVLENBQUMsQ0FBWCxHQUFlLENBQXRCO0FBQ0QsR0FQTSxDQUFQO0FBUUQ7O0FBRUQsU0FBUyxXQUFULENBQXNCLE9BQXRCLEVBQStCLFVBQS9CLEVBQTJDLE9BQTNDLEVBQW9ELE1BQXBELEVBQTREO0FBQzFELE9BQUssT0FBTCxHQUFlLE9BQWY7QUFDQSxPQUFLLFVBQUwsR0FBa0IsVUFBbEI7QUFDQSxPQUFLLE9BQUwsR0FBZSxPQUFmO0FBQ0EsT0FBSyxNQUFMLEdBQWMsTUFBZDtBQUNEOztBQUVELFNBQVMsUUFBVCxDQUFtQixJQUFuQixFQUF5QjtBQUN2QixTQUFPLFFBQVEsRUFBRSxLQUFLLE9BQUwsSUFBZ0IsS0FBSyxVQUFyQixJQUFtQyxLQUFLLE9BQTFDLENBQWY7QUFDRDs7QUFFRCxTQUFTLGdCQUFULENBQTJCLE1BQTNCLEVBQW1DO0FBQ2pDLFNBQU8sSUFBSSxXQUFKLENBQWdCLEtBQWhCLEVBQXVCLEtBQXZCLEVBQThCLEtBQTlCLEVBQXFDLE1BQXJDLENBQVA7QUFDRDs7QUFFRCxTQUFTLGlCQUFULENBQTRCLEdBQTVCLEVBQWlDLE1BQWpDLEVBQXlDO0FBQ3ZDLE1BQUksT0FBTyxJQUFJLElBQWY7QUFDQSxNQUFJLFNBQVMsUUFBYixFQUF1QjtBQUNyQixRQUFJLFVBQVUsSUFBSSxJQUFKLENBQVMsTUFBdkI7QUFDQSxXQUFPLElBQUksV0FBSixDQUNMLElBREssRUFFTCxXQUFXLENBRk4sRUFHTCxXQUFXLENBSE4sRUFJTCxNQUpLLENBQVA7QUFLRCxHQVBELE1BT08sSUFBSSxTQUFTLFNBQWIsRUFBd0I7QUFDN0IsUUFBSSxPQUFPLElBQUksSUFBZjtBQUNBLFdBQU8sSUFBSSxXQUFKLENBQ0wsS0FBSyxPQURBLEVBRUwsS0FBSyxVQUZBLEVBR0wsS0FBSyxPQUhBLEVBSUwsTUFKSyxDQUFQO0FBS0QsR0FQTSxNQU9BO0FBQ0wsV0FBTyxJQUFJLFdBQUosQ0FDTCxTQUFTLFNBREosRUFFTCxTQUFTLFdBRkosRUFHTCxTQUFTLFFBSEosRUFJTCxNQUpLLENBQVA7QUFLRDtBQUNGOztBQUVELElBQUksYUFBYSxJQUFJLFdBQUosQ0FBZ0IsS0FBaEIsRUFBdUIsS0FBdkIsRUFBOEIsS0FBOUIsRUFBcUMsWUFBWSxDQUFFLENBQW5ELENBQWpCOztBQUVBLE9BQU8sT0FBUCxHQUFpQixTQUFTLFFBQVQsQ0FDZixFQURlLEVBRWYsV0FGZSxFQUdmLFVBSGUsRUFJZixNQUplLEVBS2YsV0FMZSxFQU1mLFlBTmUsRUFPZixZQVBlLEVBUWYsZ0JBUmUsRUFTZixZQVRlLEVBVWYsY0FWZSxFQVdmLFdBWGUsRUFZZixTQVplLEVBYWYsWUFiZSxFQWNmLEtBZGUsRUFlZixNQWZlLEVBZVA7QUFDUixNQUFJLGtCQUFrQixlQUFlLE1BQXJDOztBQUVBLE1BQUksaUJBQWlCO0FBQ25CLFdBQU8sS0FEWTtBQUVuQixnQkFBWSxLQUZPO0FBR25CLHdCQUFvQjtBQUhELEdBQXJCO0FBS0EsTUFBSSxXQUFXLGdCQUFmLEVBQWlDO0FBQy9CLG1CQUFlLEdBQWYsR0FBcUIsVUFBckI7QUFDQSxtQkFBZSxHQUFmLEdBQXFCLFVBQXJCO0FBQ0Q7O0FBRUQsTUFBSSxnQkFBZ0IsV0FBVyxzQkFBL0I7QUFDQSxNQUFJLGlCQUFpQixXQUFXLGtCQUFoQzs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsTUFBSSxlQUFlO0FBQ2pCLFdBQU8sSUFEVTtBQUVqQixhQUFTLE9BQU87QUFGQyxHQUFuQjtBQUlBLE1BQUksWUFBWSxFQUFoQjtBQUNBLE1BQUksaUJBQWlCLEVBQXJCO0FBQ0EsTUFBSSxXQUFXLEVBQWY7QUFDQSxNQUFJLGVBQWUsRUFBbkI7O0FBRUEsV0FBUyxRQUFULENBQW1CLElBQW5CLEVBQXlCO0FBQ3ZCLFdBQU8sS0FBSyxPQUFMLENBQWEsR0FBYixFQUFrQixHQUFsQixDQUFQO0FBQ0Q7O0FBRUQsV0FBUyxTQUFULENBQW9CLEtBQXBCLEVBQTJCLEdBQTNCLEVBQWdDLElBQWhDLEVBQXNDO0FBQ3BDLFFBQUksT0FBTyxTQUFTLEtBQVQsQ0FBWDtBQUNBLG1CQUFlLElBQWYsQ0FBb0IsS0FBcEI7QUFDQSxjQUFVLElBQVYsSUFBa0IsYUFBYSxJQUFiLElBQXFCLENBQUMsQ0FBQyxJQUF6QztBQUNBLGFBQVMsSUFBVCxJQUFpQixHQUFqQjtBQUNEOztBQUVELFdBQVMsYUFBVCxDQUF3QixLQUF4QixFQUErQixJQUEvQixFQUFxQyxJQUFyQyxFQUEyQztBQUN6QyxRQUFJLE9BQU8sU0FBUyxLQUFULENBQVg7QUFDQSxtQkFBZSxJQUFmLENBQW9CLEtBQXBCO0FBQ0EsUUFBSSxNQUFNLE9BQU4sQ0FBYyxJQUFkLENBQUosRUFBeUI7QUFDdkIsbUJBQWEsSUFBYixJQUFxQixLQUFLLEtBQUwsRUFBckI7QUFDQSxnQkFBVSxJQUFWLElBQWtCLEtBQUssS0FBTCxFQUFsQjtBQUNELEtBSEQsTUFHTztBQUNMLG1CQUFhLElBQWIsSUFBcUIsVUFBVSxJQUFWLElBQWtCLElBQXZDO0FBQ0Q7QUFDRCxpQkFBYSxJQUFiLElBQXFCLElBQXJCO0FBQ0Q7O0FBRUQ7QUFDQSxZQUFVLFFBQVYsRUFBb0IsU0FBcEI7O0FBRUE7QUFDQSxZQUFVLGNBQVYsRUFBMEIsUUFBMUI7QUFDQSxnQkFBYyxhQUFkLEVBQTZCLFlBQTdCLEVBQTJDLENBQUMsQ0FBRCxFQUFJLENBQUosRUFBTyxDQUFQLEVBQVUsQ0FBVixDQUEzQztBQUNBLGdCQUFjLGdCQUFkLEVBQWdDLHVCQUFoQyxFQUNFLENBQUMsV0FBRCxFQUFjLFdBQWQsQ0FERjtBQUVBLGdCQUFjLFlBQWQsRUFBNEIsbUJBQTVCLEVBQ0UsQ0FBQyxNQUFELEVBQVMsT0FBVCxFQUFrQixNQUFsQixFQUEwQixPQUExQixDQURGOztBQUdBO0FBQ0EsWUFBVSxjQUFWLEVBQTBCLGFBQTFCLEVBQXlDLElBQXpDO0FBQ0EsZ0JBQWMsWUFBZCxFQUE0QixXQUE1QixFQUF5QyxPQUF6QztBQUNBLGdCQUFjLGFBQWQsRUFBNkIsWUFBN0IsRUFBMkMsQ0FBQyxDQUFELEVBQUksQ0FBSixDQUEzQztBQUNBLGdCQUFjLFlBQWQsRUFBNEIsV0FBNUIsRUFBeUMsSUFBekM7O0FBRUE7QUFDQSxnQkFBYyxZQUFkLEVBQTRCLFlBQTVCLEVBQTBDLENBQUMsSUFBRCxFQUFPLElBQVAsRUFBYSxJQUFiLEVBQW1CLElBQW5CLENBQTFDOztBQUVBO0FBQ0EsWUFBVSxhQUFWLEVBQXlCLFlBQXpCO0FBQ0EsZ0JBQWMsV0FBZCxFQUEyQixVQUEzQixFQUF1QyxPQUF2Qzs7QUFFQTtBQUNBLGdCQUFjLFlBQWQsRUFBNEIsWUFBNUIsRUFBMEMsTUFBMUM7O0FBRUE7QUFDQSxnQkFBYyxZQUFkLEVBQTRCLFlBQTVCLEVBQTBDLENBQTFDOztBQUVBO0FBQ0EsWUFBVSx1QkFBVixFQUFtQyxzQkFBbkM7QUFDQSxnQkFBYyx1QkFBZCxFQUF1QyxlQUF2QyxFQUF3RCxDQUFDLENBQUQsRUFBSSxDQUFKLENBQXhEOztBQUVBO0FBQ0EsWUFBVSxjQUFWLEVBQTBCLDJCQUExQjtBQUNBLFlBQVUsZUFBVixFQUEyQixrQkFBM0I7QUFDQSxnQkFBYyxpQkFBZCxFQUFpQyxnQkFBakMsRUFBbUQsQ0FBQyxDQUFELEVBQUksS0FBSixDQUFuRDs7QUFFQTtBQUNBLFlBQVUsZ0JBQVYsRUFBNEIsZUFBNUI7QUFDQSxnQkFBYyxjQUFkLEVBQThCLGFBQTlCLEVBQTZDLENBQUMsQ0FBOUM7QUFDQSxnQkFBYyxjQUFkLEVBQThCLGFBQTlCLEVBQTZDLENBQUMsU0FBRCxFQUFZLENBQVosRUFBZSxDQUFDLENBQWhCLENBQTdDO0FBQ0EsZ0JBQWMsaUJBQWQsRUFBaUMsbUJBQWpDLEVBQ0UsQ0FBQyxRQUFELEVBQVcsT0FBWCxFQUFvQixPQUFwQixFQUE2QixPQUE3QixDQURGO0FBRUEsZ0JBQWMsZ0JBQWQsRUFBZ0MsbUJBQWhDLEVBQ0UsQ0FBQyxPQUFELEVBQVUsT0FBVixFQUFtQixPQUFuQixFQUE0QixPQUE1QixDQURGOztBQUdBO0FBQ0EsWUFBVSxnQkFBVixFQUE0QixlQUE1QjtBQUNBLGdCQUFjLGFBQWQsRUFBNkIsU0FBN0IsRUFDRSxDQUFDLENBQUQsRUFBSSxDQUFKLEVBQU8sR0FBRyxrQkFBVixFQUE4QixHQUFHLG1CQUFqQyxDQURGOztBQUdBO0FBQ0EsZ0JBQWMsVUFBZCxFQUEwQixVQUExQixFQUNFLENBQUMsQ0FBRCxFQUFJLENBQUosRUFBTyxHQUFHLGtCQUFWLEVBQThCLEdBQUcsbUJBQWpDLENBREY7O0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLE1BQUksY0FBYztBQUNoQixRQUFJLEVBRFk7QUFFaEIsYUFBUyxZQUZPO0FBR2hCLGFBQVMsV0FITztBQUloQixVQUFNLFNBSlU7QUFLaEIsYUFBUyxZQUxPO0FBTWhCLFVBQU0sU0FOVTtBQU9oQixjQUFVLFlBUE07QUFRaEIsWUFBUSxXQVJRO0FBU2hCLFlBQVEsV0FUUTtBQVVoQixnQkFBWSxlQUFlLEtBVlg7QUFXaEIsY0FBVSxZQVhNO0FBWWhCLGlCQUFhLGdCQVpHO0FBYWhCLGdCQUFZLFVBYkk7O0FBZWhCLFdBQU8sS0FmUztBQWdCaEIsa0JBQWM7QUFoQkUsR0FBbEI7O0FBbUJBLE1BQUksa0JBQWtCO0FBQ3BCLGVBQVcsU0FEUztBQUVwQixrQkFBYyxZQUZNO0FBR3BCLGdCQUFZLFVBSFE7QUFJcEIsb0JBQWdCLGNBSkk7QUFLcEIsZ0JBQVksVUFMUTtBQU1wQixhQUFTLE9BTlc7QUFPcEIscUJBQWlCO0FBUEcsR0FBdEI7O0FBWUEsTUFBSSxjQUFKLEVBQW9CO0FBQ2xCLG9CQUFnQixVQUFoQixHQUE2QixDQUFDLE9BQUQsQ0FBN0I7QUFDQSxvQkFBZ0IsVUFBaEIsR0FBNkIsS0FBSyxPQUFPLGNBQVosRUFBNEIsVUFBVSxDQUFWLEVBQWE7QUFDcEUsVUFBSSxNQUFNLENBQVYsRUFBYTtBQUNYLGVBQU8sQ0FBQyxDQUFELENBQVA7QUFDRDtBQUNELGFBQU8sS0FBSyxDQUFMLEVBQVEsVUFBVSxDQUFWLEVBQWE7QUFDMUIsZUFBTyx1QkFBdUIsQ0FBOUI7QUFDRCxPQUZNLENBQVA7QUFHRCxLQVA0QixDQUE3QjtBQVFEOztBQUVELE1BQUksa0JBQWtCLENBQXRCO0FBQ0EsV0FBUyxxQkFBVCxHQUFrQztBQUNoQyxRQUFJLE1BQU0sbUJBQVY7QUFDQSxRQUFJLE9BQU8sSUFBSSxJQUFmO0FBQ0EsUUFBSSxTQUFTLElBQUksTUFBakI7QUFDQSxRQUFJLEVBQUosR0FBUyxpQkFBVDs7QUFFQSxRQUFJLE9BQUosR0FBYyxHQUFkOztBQUVBO0FBQ0EsUUFBSSxTQUFTLEtBQUssV0FBTCxDQUFiO0FBQ0EsUUFBSSxTQUFTLElBQUksTUFBSixHQUFhO0FBQ3hCLGFBQU87QUFEaUIsS0FBMUI7QUFHQSxXQUFPLElBQVAsQ0FBWSxXQUFaLEVBQXlCLE9BQXpCLENBQWlDLFVBQVUsSUFBVixFQUFnQjtBQUMvQyxhQUFPLElBQVAsSUFBZSxPQUFPLEdBQVAsQ0FBVyxNQUFYLEVBQW1CLEdBQW5CLEVBQXdCLElBQXhCLENBQWY7QUFDRCxLQUZEOztBQUlBOzs7QUFHQTtBQUNBLFFBQUksV0FBVyxJQUFJLElBQUosR0FBVyxFQUExQjtBQUNBLFFBQUksY0FBYyxJQUFJLE9BQUosR0FBYyxFQUFoQztBQUNBLFdBQU8sSUFBUCxDQUFZLFlBQVosRUFBMEIsT0FBMUIsQ0FBa0MsVUFBVSxRQUFWLEVBQW9CO0FBQ3BELFVBQUksTUFBTSxPQUFOLENBQWMsYUFBYSxRQUFiLENBQWQsQ0FBSixFQUEyQztBQUN6QyxpQkFBUyxRQUFULElBQXFCLE9BQU8sR0FBUCxDQUFXLE9BQU8sSUFBbEIsRUFBd0IsR0FBeEIsRUFBNkIsUUFBN0IsQ0FBckI7QUFDQSxvQkFBWSxRQUFaLElBQXdCLE9BQU8sR0FBUCxDQUFXLE9BQU8sT0FBbEIsRUFBMkIsR0FBM0IsRUFBZ0MsUUFBaEMsQ0FBeEI7QUFDRDtBQUNGLEtBTEQ7O0FBT0E7QUFDQSxRQUFJLFlBQVksSUFBSSxTQUFKLEdBQWdCLEVBQWhDO0FBQ0EsV0FBTyxJQUFQLENBQVksZUFBWixFQUE2QixPQUE3QixDQUFxQyxVQUFVLElBQVYsRUFBZ0I7QUFDbkQsZ0JBQVUsSUFBVixJQUFrQixPQUFPLEdBQVAsQ0FBVyxLQUFLLFNBQUwsQ0FBZSxnQkFBZ0IsSUFBaEIsQ0FBZixDQUFYLENBQWxCO0FBQ0QsS0FGRDs7QUFJQTtBQUNBLFFBQUksTUFBSixHQUFhLFVBQVUsS0FBVixFQUFpQixDQUFqQixFQUFvQjtBQUMvQixjQUFRLEVBQUUsSUFBVjtBQUNFLGFBQUssUUFBTDtBQUNFLGNBQUksVUFBVSxDQUNaLE1BRFksRUFFWixPQUFPLE9BRkssRUFHWixPQUFPLEtBSEssRUFJWixJQUFJLE9BSlEsQ0FBZDtBQU1BLGlCQUFPLE1BQU0sR0FBTixDQUNMLEtBQUssRUFBRSxJQUFQLENBREssRUFDUyxRQURULEVBRUgsUUFBUSxLQUFSLENBQWMsQ0FBZCxFQUFpQixLQUFLLEdBQUwsQ0FBUyxFQUFFLElBQUYsQ0FBTyxNQUFQLEdBQWdCLENBQXpCLEVBQTRCLENBQTVCLENBQWpCLENBRkcsRUFHSixHQUhJLENBQVA7QUFJRixhQUFLLFFBQUw7QUFDRSxpQkFBTyxNQUFNLEdBQU4sQ0FBVSxPQUFPLEtBQWpCLEVBQXdCLEVBQUUsSUFBMUIsQ0FBUDtBQUNGLGFBQUssV0FBTDtBQUNFLGlCQUFPLE1BQU0sR0FBTixDQUFVLE9BQU8sT0FBakIsRUFBMEIsRUFBRSxJQUE1QixDQUFQO0FBQ0YsYUFBSyxTQUFMO0FBQ0UsaUJBQU8sTUFBTSxHQUFOLENBQVUsTUFBVixFQUFrQixFQUFFLElBQXBCLENBQVA7QUFDRixhQUFLLFNBQUw7QUFDRSxZQUFFLElBQUYsQ0FBTyxNQUFQLENBQWMsR0FBZCxFQUFtQixLQUFuQjtBQUNBLGlCQUFPLEVBQUUsSUFBRixDQUFPLEdBQWQ7QUFwQko7QUFzQkQsS0F2QkQ7O0FBeUJBLFFBQUksV0FBSixHQUFrQixFQUFsQjs7QUFFQSxRQUFJLGVBQWUsRUFBbkI7QUFDQSxRQUFJLFdBQUosR0FBa0IsVUFBVSxJQUFWLEVBQWdCO0FBQ2hDLFVBQUksS0FBSyxZQUFZLEVBQVosQ0FBZSxJQUFmLENBQVQ7QUFDQSxVQUFJLE1BQU0sWUFBVixFQUF3QjtBQUN0QixlQUFPLGFBQWEsRUFBYixDQUFQO0FBQ0Q7QUFDRCxVQUFJLFVBQVUsZUFBZSxLQUFmLENBQXFCLEVBQXJCLENBQWQ7QUFDQSxVQUFJLENBQUMsT0FBTCxFQUFjO0FBQ1osa0JBQVUsZUFBZSxLQUFmLENBQXFCLEVBQXJCLElBQTJCLElBQUksZUFBSixFQUFyQztBQUNEO0FBQ0QsVUFBSSxTQUFTLGFBQWEsRUFBYixJQUFtQixLQUFLLE9BQUwsQ0FBaEM7QUFDQSxhQUFPLE1BQVA7QUFDRCxLQVhEOztBQWFBLFdBQU8sR0FBUDtBQUNEOztBQUVEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxXQUFTLFlBQVQsQ0FBdUIsT0FBdkIsRUFBZ0M7QUFDOUIsUUFBSSxnQkFBZ0IsUUFBUSxNQUE1QjtBQUNBLFFBQUksaUJBQWlCLFFBQVEsT0FBN0I7O0FBRUEsUUFBSSxhQUFKO0FBQ0EsUUFBSSxhQUFhLGFBQWpCLEVBQWdDO0FBQzlCLFVBQUksUUFBUSxDQUFDLENBQUMsY0FBYyxTQUFkLENBQWQ7QUFDQSxzQkFBZ0IsaUJBQWlCLFVBQVUsR0FBVixFQUFlLEtBQWYsRUFBc0I7QUFDckQsZUFBTyxLQUFQO0FBQ0QsT0FGZSxDQUFoQjtBQUdBLG9CQUFjLE1BQWQsR0FBdUIsS0FBdkI7QUFDRCxLQU5ELE1BTU8sSUFBSSxhQUFhLGNBQWpCLEVBQWlDO0FBQ3RDLFVBQUksTUFBTSxlQUFlLFNBQWYsQ0FBVjtBQUNBLHNCQUFnQixrQkFBa0IsR0FBbEIsRUFBdUIsVUFBVSxHQUFWLEVBQWUsS0FBZixFQUFzQjtBQUMzRCxlQUFPLElBQUksTUFBSixDQUFXLEtBQVgsRUFBa0IsR0FBbEIsQ0FBUDtBQUNELE9BRmUsQ0FBaEI7QUFHRDs7QUFFRCxXQUFPLGFBQVA7QUFDRDs7QUFFRCxXQUFTLGdCQUFULENBQTJCLE9BQTNCLEVBQW9DLEdBQXBDLEVBQXlDO0FBQ3ZDLFFBQUksZ0JBQWdCLFFBQVEsTUFBNUI7QUFDQSxRQUFJLGlCQUFpQixRQUFRLE9BQTdCOztBQUVBLFFBQUksaUJBQWlCLGFBQXJCLEVBQW9DO0FBQ2xDLFVBQUksY0FBYyxjQUFjLGFBQWQsQ0FBbEI7QUFDQSxVQUFJLFdBQUosRUFBaUI7QUFDZixzQkFBYyxpQkFBaUIsY0FBakIsQ0FBZ0MsV0FBaEMsQ0FBZDs7QUFFQSxlQUFPLGlCQUFpQixVQUFVLEdBQVYsRUFBZSxLQUFmLEVBQXNCO0FBQzVDLGNBQUksY0FBYyxJQUFJLElBQUosQ0FBUyxXQUFULENBQWxCO0FBQ0EsY0FBSSxTQUFTLElBQUksTUFBakI7QUFDQSxnQkFBTSxHQUFOLENBQ0UsT0FBTyxXQURULEVBRUUsT0FGRixFQUdFLFdBSEY7QUFJQSxjQUFJLFVBQVUsT0FBTyxPQUFyQjtBQUNBLGdCQUFNLEdBQU4sQ0FDRSxPQURGLEVBRUUsTUFBTSxtQkFGUixFQUdFLGNBQWMsUUFIaEI7QUFJQSxnQkFBTSxHQUFOLENBQ0UsT0FERixFQUVFLE1BQU0sb0JBRlIsRUFHRSxjQUFjLFNBSGhCO0FBSUEsaUJBQU8sV0FBUDtBQUNELFNBakJNLENBQVA7QUFrQkQsT0FyQkQsTUFxQk87QUFDTCxlQUFPLGlCQUFpQixVQUFVLEdBQVYsRUFBZSxLQUFmLEVBQXNCO0FBQzVDLGNBQUksU0FBUyxJQUFJLE1BQWpCO0FBQ0EsZ0JBQU0sR0FBTixDQUNFLE9BQU8sV0FEVCxFQUVFLE9BRkYsRUFHRSxNQUhGO0FBSUEsY0FBSSxVQUFVLE9BQU8sT0FBckI7QUFDQSxnQkFBTSxHQUFOLENBQ0UsT0FERixFQUVFLE1BQU0sbUJBRlIsRUFHRSxVQUFVLEdBQVYsR0FBZ0IscUJBSGxCO0FBSUEsZ0JBQU0sR0FBTixDQUNFLE9BREYsRUFFRSxNQUFNLG9CQUZSLEVBR0UsVUFBVSxHQUFWLEdBQWdCLHNCQUhsQjtBQUlBLGlCQUFPLE1BQVA7QUFDRCxTQWhCTSxDQUFQO0FBaUJEO0FBQ0YsS0ExQ0QsTUEwQ08sSUFBSSxpQkFBaUIsY0FBckIsRUFBcUM7QUFDMUMsVUFBSSxNQUFNLGVBQWUsYUFBZixDQUFWO0FBQ0EsYUFBTyxrQkFBa0IsR0FBbEIsRUFBdUIsVUFBVSxHQUFWLEVBQWUsS0FBZixFQUFzQjtBQUNsRCxZQUFJLG1CQUFtQixJQUFJLE1BQUosQ0FBVyxLQUFYLEVBQWtCLEdBQWxCLENBQXZCO0FBQ0EsWUFBSSxTQUFTLElBQUksTUFBakI7QUFDQSxZQUFJLG9CQUFvQixPQUFPLFdBQS9CO0FBQ0EsWUFBSSxjQUFjLE1BQU0sR0FBTixDQUNoQixpQkFEZ0IsRUFDRyxrQkFESCxFQUN1QixnQkFEdkIsRUFDeUMsR0FEekMsQ0FBbEI7O0FBS0EsY0FBTSxHQUFOLENBQ0UsaUJBREYsRUFFRSxPQUZGLEVBR0UsV0FIRjtBQUlBLFlBQUksVUFBVSxPQUFPLE9BQXJCO0FBQ0EsY0FBTSxHQUFOLENBQ0UsT0FERixFQUVFLE1BQU0sbUJBRlIsRUFHRSxjQUFjLEdBQWQsR0FBb0IsV0FBcEIsR0FBa0MsU0FBbEMsR0FDQSxPQURBLEdBQ1UsR0FEVixHQUNnQixxQkFKbEI7QUFLQSxjQUFNLEdBQU4sQ0FDRSxPQURGLEVBRUUsTUFBTSxvQkFGUixFQUdFLGNBQ0EsR0FEQSxHQUNNLFdBRE4sR0FDb0IsVUFEcEIsR0FFQSxPQUZBLEdBRVUsR0FGVixHQUVnQixzQkFMbEI7QUFNQSxlQUFPLFdBQVA7QUFDRCxPQTFCTSxDQUFQO0FBMkJELEtBN0JNLE1BNkJBO0FBQ0wsYUFBTyxJQUFQO0FBQ0Q7QUFDRjs7QUFFRCxXQUFTLG9CQUFULENBQStCLE9BQS9CLEVBQXdDLFdBQXhDLEVBQXFELEdBQXJELEVBQTBEO0FBQ3hELFFBQUksZ0JBQWdCLFFBQVEsTUFBNUI7QUFDQSxRQUFJLGlCQUFpQixRQUFRLE9BQTdCOztBQUVBLGFBQVMsUUFBVCxDQUFtQixLQUFuQixFQUEwQjtBQUN4QixVQUFJLFNBQVMsYUFBYixFQUE0QjtBQUMxQixZQUFJLE1BQU0sY0FBYyxLQUFkLENBQVY7O0FBR0EsWUFBSSxXQUFXLElBQWY7QUFDQSxZQUFJLElBQUksSUFBSSxDQUFKLEdBQVEsQ0FBaEI7QUFDQSxZQUFJLElBQUksSUFBSSxDQUFKLEdBQVEsQ0FBaEI7QUFDQSxZQUFJLENBQUosRUFBTyxDQUFQO0FBQ0EsWUFBSSxXQUFXLEdBQWYsRUFBb0I7QUFDbEIsY0FBSSxJQUFJLEtBQUosR0FBWSxDQUFoQjtBQUVELFNBSEQsTUFHTztBQUNMLHFCQUFXLEtBQVg7QUFDRDtBQUNELFlBQUksWUFBWSxHQUFoQixFQUFxQjtBQUNuQixjQUFJLElBQUksTUFBSixHQUFhLENBQWpCO0FBRUQsU0FIRCxNQUdPO0FBQ0wscUJBQVcsS0FBWDtBQUNEOztBQUVELGVBQU8sSUFBSSxXQUFKLENBQ0wsQ0FBQyxRQUFELElBQWEsV0FBYixJQUE0QixZQUFZLE9BRG5DLEVBRUwsQ0FBQyxRQUFELElBQWEsV0FBYixJQUE0QixZQUFZLFVBRm5DLEVBR0wsQ0FBQyxRQUFELElBQWEsV0FBYixJQUE0QixZQUFZLE9BSG5DLEVBSUwsVUFBVSxHQUFWLEVBQWUsS0FBZixFQUFzQjtBQUNwQixjQUFJLFVBQVUsSUFBSSxNQUFKLENBQVcsT0FBekI7QUFDQSxjQUFJLFFBQVEsQ0FBWjtBQUNBLGNBQUksRUFBRSxXQUFXLEdBQWIsQ0FBSixFQUF1QjtBQUNyQixvQkFBUSxNQUFNLEdBQU4sQ0FBVSxPQUFWLEVBQW1CLEdBQW5CLEVBQXdCLG1CQUF4QixFQUE2QyxHQUE3QyxFQUFrRCxDQUFsRCxDQUFSO0FBQ0Q7QUFDRCxjQUFJLFFBQVEsQ0FBWjtBQUNBLGNBQUksRUFBRSxZQUFZLEdBQWQsQ0FBSixFQUF3QjtBQUN0QixvQkFBUSxNQUFNLEdBQU4sQ0FBVSxPQUFWLEVBQW1CLEdBQW5CLEVBQXdCLG9CQUF4QixFQUE4QyxHQUE5QyxFQUFtRCxDQUFuRCxDQUFSO0FBQ0Q7QUFDRCxpQkFBTyxDQUFDLENBQUQsRUFBSSxDQUFKLEVBQU8sS0FBUCxFQUFjLEtBQWQsQ0FBUDtBQUNELFNBZkksQ0FBUDtBQWdCRCxPQXJDRCxNQXFDTyxJQUFJLFNBQVMsY0FBYixFQUE2QjtBQUNsQyxZQUFJLFNBQVMsZUFBZSxLQUFmLENBQWI7QUFDQSxZQUFJLFNBQVMsa0JBQWtCLE1BQWxCLEVBQTBCLFVBQVUsR0FBVixFQUFlLEtBQWYsRUFBc0I7QUFDM0QsY0FBSSxNQUFNLElBQUksTUFBSixDQUFXLEtBQVgsRUFBa0IsTUFBbEIsQ0FBVjs7QUFJQSxjQUFJLFVBQVUsSUFBSSxNQUFKLENBQVcsT0FBekI7QUFDQSxjQUFJLFFBQVEsTUFBTSxHQUFOLENBQVUsR0FBVixFQUFlLE1BQWYsQ0FBWjtBQUNBLGNBQUksUUFBUSxNQUFNLEdBQU4sQ0FBVSxHQUFWLEVBQWUsTUFBZixDQUFaO0FBQ0EsY0FBSSxRQUFRLE1BQU0sR0FBTixDQUNWLGFBRFUsRUFDSyxHQURMLEVBQ1UsR0FEVixFQUNlLEdBRGYsRUFDb0IsV0FEcEIsRUFFVixHQUZVLEVBRUwsT0FGSyxFQUVJLEdBRkosRUFFUyxtQkFGVCxFQUU4QixHQUY5QixFQUVtQyxLQUZuQyxFQUUwQyxHQUYxQyxDQUFaO0FBR0EsY0FBSSxRQUFRLE1BQU0sR0FBTixDQUNWLGNBRFUsRUFDTSxHQUROLEVBQ1csR0FEWCxFQUNnQixHQURoQixFQUNxQixZQURyQixFQUVWLEdBRlUsRUFFTCxPQUZLLEVBRUksR0FGSixFQUVTLG9CQUZULEVBRStCLEdBRi9CLEVBRW9DLEtBRnBDLEVBRTJDLEdBRjNDLENBQVo7O0FBTUEsaUJBQU8sQ0FBQyxLQUFELEVBQVEsS0FBUixFQUFlLEtBQWYsRUFBc0IsS0FBdEIsQ0FBUDtBQUNELFNBbEJZLENBQWI7QUFtQkEsWUFBSSxXQUFKLEVBQWlCO0FBQ2YsaUJBQU8sT0FBUCxHQUFpQixPQUFPLE9BQVAsSUFBa0IsWUFBWSxPQUEvQztBQUNBLGlCQUFPLFVBQVAsR0FBb0IsT0FBTyxVQUFQLElBQXFCLFlBQVksVUFBckQ7QUFDQSxpQkFBTyxPQUFQLEdBQWlCLE9BQU8sT0FBUCxJQUFrQixZQUFZLE9BQS9DO0FBQ0Q7QUFDRCxlQUFPLE1BQVA7QUFDRCxPQTNCTSxNQTJCQSxJQUFJLFdBQUosRUFBaUI7QUFDdEIsZUFBTyxJQUFJLFdBQUosQ0FDTCxZQUFZLE9BRFAsRUFFTCxZQUFZLFVBRlAsRUFHTCxZQUFZLE9BSFAsRUFJTCxVQUFVLEdBQVYsRUFBZSxLQUFmLEVBQXNCO0FBQ3BCLGNBQUksVUFBVSxJQUFJLE1BQUosQ0FBVyxPQUF6QjtBQUNBLGlCQUFPLENBQ0wsQ0FESyxFQUNGLENBREUsRUFFTCxNQUFNLEdBQU4sQ0FBVSxPQUFWLEVBQW1CLEdBQW5CLEVBQXdCLG1CQUF4QixDQUZLLEVBR0wsTUFBTSxHQUFOLENBQVUsT0FBVixFQUFtQixHQUFuQixFQUF3QixvQkFBeEIsQ0FISyxDQUFQO0FBSUQsU0FWSSxDQUFQO0FBV0QsT0FaTSxNQVlBO0FBQ0wsZUFBTyxJQUFQO0FBQ0Q7QUFDRjs7QUFFRCxRQUFJLFdBQVcsU0FBUyxVQUFULENBQWY7O0FBRUEsUUFBSSxRQUFKLEVBQWM7QUFDWixVQUFJLGVBQWUsUUFBbkI7QUFDQSxpQkFBVyxJQUFJLFdBQUosQ0FDVCxTQUFTLE9BREEsRUFFVCxTQUFTLFVBRkEsRUFHVCxTQUFTLE9BSEEsRUFJVCxVQUFVLEdBQVYsRUFBZSxLQUFmLEVBQXNCO0FBQ3BCLFlBQUksV0FBVyxhQUFhLE1BQWIsQ0FBb0IsR0FBcEIsRUFBeUIsS0FBekIsQ0FBZjtBQUNBLFlBQUksVUFBVSxJQUFJLE1BQUosQ0FBVyxPQUF6QjtBQUNBLGNBQU0sR0FBTixDQUNFLE9BREYsRUFFRSxNQUFNLGdCQUZSLEVBR0UsU0FBUyxDQUFULENBSEY7QUFJQSxjQUFNLEdBQU4sQ0FDRSxPQURGLEVBRUUsTUFBTSxpQkFGUixFQUdFLFNBQVMsQ0FBVCxDQUhGO0FBSUEsZUFBTyxRQUFQO0FBQ0QsT0FoQlEsQ0FBWDtBQWlCRDs7QUFFRCxXQUFPO0FBQ0wsZ0JBQVUsUUFETDtBQUVMLG1CQUFhLFNBQVMsYUFBVDtBQUZSLEtBQVA7QUFJRDs7QUFFRCxXQUFTLFlBQVQsQ0FBdUIsT0FBdkIsRUFBZ0M7QUFDOUIsUUFBSSxnQkFBZ0IsUUFBUSxNQUE1QjtBQUNBLFFBQUksaUJBQWlCLFFBQVEsT0FBN0I7O0FBRUEsYUFBUyxXQUFULENBQXNCLElBQXRCLEVBQTRCO0FBQzFCLFVBQUksUUFBUSxhQUFaLEVBQTJCO0FBQ3pCLFlBQUksS0FBSyxZQUFZLEVBQVosQ0FBZSxjQUFjLElBQWQsQ0FBZixDQUFUOztBQUVBLFlBQUksU0FBUyxpQkFBaUIsWUFBWTtBQUN4QyxpQkFBTyxFQUFQO0FBQ0QsU0FGWSxDQUFiO0FBR0EsZUFBTyxFQUFQLEdBQVksRUFBWjtBQUNBLGVBQU8sTUFBUDtBQUNELE9BUkQsTUFRTyxJQUFJLFFBQVEsY0FBWixFQUE0QjtBQUNqQyxZQUFJLE1BQU0sZUFBZSxJQUFmLENBQVY7QUFDQSxlQUFPLGtCQUFrQixHQUFsQixFQUF1QixVQUFVLEdBQVYsRUFBZSxLQUFmLEVBQXNCO0FBQ2xELGNBQUksTUFBTSxJQUFJLE1BQUosQ0FBVyxLQUFYLEVBQWtCLEdBQWxCLENBQVY7QUFDQSxjQUFJLEtBQUssTUFBTSxHQUFOLENBQVUsSUFBSSxNQUFKLENBQVcsT0FBckIsRUFBOEIsTUFBOUIsRUFBc0MsR0FBdEMsRUFBMkMsR0FBM0MsQ0FBVDs7QUFFQSxpQkFBTyxFQUFQO0FBQ0QsU0FMTSxDQUFQO0FBTUQ7QUFDRCxhQUFPLElBQVA7QUFDRDs7QUFFRCxRQUFJLE9BQU8sWUFBWSxNQUFaLENBQVg7QUFDQSxRQUFJLE9BQU8sWUFBWSxNQUFaLENBQVg7O0FBRUEsUUFBSSxVQUFVLElBQWQ7QUFDQSxRQUFJLE9BQUo7QUFDQSxRQUFJLFNBQVMsSUFBVCxLQUFrQixTQUFTLElBQVQsQ0FBdEIsRUFBc0M7QUFDcEMsZ0JBQVUsWUFBWSxPQUFaLENBQW9CLEtBQUssRUFBekIsRUFBNkIsS0FBSyxFQUFsQyxDQUFWO0FBQ0EsZ0JBQVUsaUJBQWlCLFVBQVUsR0FBVixFQUFlLEtBQWYsRUFBc0I7QUFDL0MsZUFBTyxJQUFJLElBQUosQ0FBUyxPQUFULENBQVA7QUFDRCxPQUZTLENBQVY7QUFHRCxLQUxELE1BS087QUFDTCxnQkFBVSxJQUFJLFdBQUosQ0FDUCxRQUFRLEtBQUssT0FBZCxJQUEyQixRQUFRLEtBQUssT0FEaEMsRUFFUCxRQUFRLEtBQUssVUFBZCxJQUE4QixRQUFRLEtBQUssVUFGbkMsRUFHUCxRQUFRLEtBQUssT0FBZCxJQUEyQixRQUFRLEtBQUssT0FIaEMsRUFJUixVQUFVLEdBQVYsRUFBZSxLQUFmLEVBQXNCO0FBQ3BCLFlBQUksZUFBZSxJQUFJLE1BQUosQ0FBVyxNQUE5QjtBQUNBLFlBQUksTUFBSjtBQUNBLFlBQUksSUFBSixFQUFVO0FBQ1IsbUJBQVMsS0FBSyxNQUFMLENBQVksR0FBWixFQUFpQixLQUFqQixDQUFUO0FBQ0QsU0FGRCxNQUVPO0FBQ0wsbUJBQVMsTUFBTSxHQUFOLENBQVUsWUFBVixFQUF3QixHQUF4QixFQUE2QixNQUE3QixDQUFUO0FBQ0Q7QUFDRCxZQUFJLE1BQUo7QUFDQSxZQUFJLElBQUosRUFBVTtBQUNSLG1CQUFTLEtBQUssTUFBTCxDQUFZLEdBQVosRUFBaUIsS0FBakIsQ0FBVDtBQUNELFNBRkQsTUFFTztBQUNMLG1CQUFTLE1BQU0sR0FBTixDQUFVLFlBQVYsRUFBd0IsR0FBeEIsRUFBNkIsTUFBN0IsQ0FBVDtBQUNEO0FBQ0QsWUFBSSxVQUFVLGVBQWUsV0FBZixHQUE2QixNQUE3QixHQUFzQyxHQUF0QyxHQUE0QyxNQUExRDs7QUFFQSxlQUFPLE1BQU0sR0FBTixDQUFVLFVBQVUsR0FBcEIsQ0FBUDtBQUNELE9BckJPLENBQVY7QUFzQkQ7O0FBRUQsV0FBTztBQUNMLFlBQU0sSUFERDtBQUVMLFlBQU0sSUFGRDtBQUdMLGVBQVMsT0FISjtBQUlMLGVBQVM7QUFKSixLQUFQO0FBTUQ7O0FBRUQsV0FBUyxTQUFULENBQW9CLE9BQXBCLEVBQTZCLEdBQTdCLEVBQWtDO0FBQ2hDLFFBQUksZ0JBQWdCLFFBQVEsTUFBNUI7QUFDQSxRQUFJLGlCQUFpQixRQUFRLE9BQTdCOztBQUVBLGFBQVMsYUFBVCxHQUEwQjtBQUN4QixVQUFJLGNBQWMsYUFBbEIsRUFBaUM7QUFDL0IsWUFBSSxXQUFXLGNBQWMsVUFBZCxDQUFmO0FBQ0EsWUFBSSxhQUFhLFFBQWIsQ0FBSixFQUE0QjtBQUMxQixxQkFBVyxhQUFhLFdBQWIsQ0FBeUIsYUFBYSxNQUFiLENBQW9CLFFBQXBCLEVBQThCLElBQTlCLENBQXpCLENBQVg7QUFDRCxTQUZELE1BRU8sSUFBSSxRQUFKLEVBQWM7QUFDbkIscUJBQVcsYUFBYSxXQUFiLENBQXlCLFFBQXpCLENBQVg7QUFFRDtBQUNELFlBQUksU0FBUyxpQkFBaUIsVUFBVSxHQUFWLEVBQWUsS0FBZixFQUFzQjtBQUNsRCxjQUFJLFFBQUosRUFBYztBQUNaLGdCQUFJLFNBQVMsSUFBSSxJQUFKLENBQVMsUUFBVCxDQUFiO0FBQ0EsZ0JBQUksUUFBSixHQUFlLE1BQWY7QUFDQSxtQkFBTyxNQUFQO0FBQ0Q7QUFDRCxjQUFJLFFBQUosR0FBZSxJQUFmO0FBQ0EsaUJBQU8sSUFBUDtBQUNELFNBUlksQ0FBYjtBQVNBLGVBQU8sS0FBUCxHQUFlLFFBQWY7QUFDQSxlQUFPLE1BQVA7QUFDRCxPQW5CRCxNQW1CTyxJQUFJLGNBQWMsY0FBbEIsRUFBa0M7QUFDdkMsWUFBSSxNQUFNLGVBQWUsVUFBZixDQUFWO0FBQ0EsZUFBTyxrQkFBa0IsR0FBbEIsRUFBdUIsVUFBVSxHQUFWLEVBQWUsS0FBZixFQUFzQjtBQUNsRCxjQUFJLFNBQVMsSUFBSSxNQUFqQjs7QUFFQSxjQUFJLGlCQUFpQixPQUFPLFlBQTVCO0FBQ0EsY0FBSSxnQkFBZ0IsT0FBTyxRQUEzQjs7QUFFQSxjQUFJLGNBQWMsSUFBSSxNQUFKLENBQVcsS0FBWCxFQUFrQixHQUFsQixDQUFsQjtBQUNBLGNBQUksV0FBVyxNQUFNLEdBQU4sQ0FBVSxNQUFWLENBQWY7QUFDQSxjQUFJLGdCQUFnQixNQUFNLEdBQU4sQ0FBVSxjQUFWLEVBQTBCLEdBQTFCLEVBQStCLFdBQS9CLEVBQTRDLEdBQTVDLENBQXBCOztBQUVBLGNBQUksT0FBTyxJQUFJLElBQUosQ0FBUyxhQUFULEVBQ1IsSUFEUSxDQUNILFFBREcsRUFDTyxHQURQLEVBQ1ksYUFEWixFQUMyQixnQkFEM0IsRUFDNkMsV0FEN0MsRUFDMEQsSUFEMUQsRUFFUixJQUZRLENBRUgsUUFGRyxFQUVPLEdBRlAsRUFFWSxhQUZaLEVBRTJCLGVBRjNCLEVBRTRDLFdBRjVDLEVBRXlELElBRnpELENBQVg7O0FBTUEsZ0JBQU0sS0FBTixDQUFZLElBQVo7QUFDQSxnQkFBTSxJQUFOLENBQ0UsSUFBSSxJQUFKLENBQVMsYUFBVCxFQUNHLElBREgsQ0FDUSxhQURSLEVBQ3VCLGlCQUR2QixFQUMwQyxRQUQxQyxFQUNvRCxJQURwRCxDQURGOztBQUlBLGNBQUksUUFBSixHQUFlLFFBQWY7O0FBRUEsaUJBQU8sUUFBUDtBQUNELFNBeEJNLENBQVA7QUF5QkQ7O0FBRUQsYUFBTyxJQUFQO0FBQ0Q7O0FBRUQsUUFBSSxXQUFXLGVBQWY7O0FBRUEsYUFBUyxjQUFULEdBQTJCO0FBQ3pCLFVBQUksZUFBZSxhQUFuQixFQUFrQztBQUNoQyxZQUFJLFlBQVksY0FBYyxXQUFkLENBQWhCOztBQUVBLGVBQU8saUJBQWlCLFVBQVUsR0FBVixFQUFlLEtBQWYsRUFBc0I7QUFDNUMsaUJBQU8sVUFBVSxTQUFWLENBQVA7QUFDRCxTQUZNLENBQVA7QUFHRCxPQU5ELE1BTU8sSUFBSSxlQUFlLGNBQW5CLEVBQW1DO0FBQ3hDLFlBQUksZUFBZSxlQUFlLFdBQWYsQ0FBbkI7QUFDQSxlQUFPLGtCQUFrQixZQUFsQixFQUFnQyxVQUFVLEdBQVYsRUFBZSxLQUFmLEVBQXNCO0FBQzNELGNBQUksYUFBYSxJQUFJLFNBQUosQ0FBYyxTQUEvQjtBQUNBLGNBQUksT0FBTyxJQUFJLE1BQUosQ0FBVyxLQUFYLEVBQWtCLFlBQWxCLENBQVg7O0FBRUEsaUJBQU8sTUFBTSxHQUFOLENBQVUsVUFBVixFQUFzQixHQUF0QixFQUEyQixJQUEzQixFQUFpQyxHQUFqQyxDQUFQO0FBQ0QsU0FMTSxDQUFQO0FBTUQsT0FSTSxNQVFBLElBQUksUUFBSixFQUFjO0FBQ25CLFlBQUksU0FBUyxRQUFULENBQUosRUFBd0I7QUFDdEIsY0FBSSxTQUFTLEtBQWIsRUFBb0I7QUFDbEIsbUJBQU8saUJBQWlCLFVBQVUsR0FBVixFQUFlLEtBQWYsRUFBc0I7QUFDNUMscUJBQU8sTUFBTSxHQUFOLENBQVUsSUFBSSxRQUFkLEVBQXdCLFdBQXhCLENBQVA7QUFDRCxhQUZNLENBQVA7QUFHRCxXQUpELE1BSU87QUFDTCxtQkFBTyxpQkFBaUIsWUFBWTtBQUNsQyxxQkFBTyxZQUFQO0FBQ0QsYUFGTSxDQUFQO0FBR0Q7QUFDRixTQVZELE1BVU87QUFDTCxpQkFBTyxJQUFJLFdBQUosQ0FDTCxTQUFTLE9BREosRUFFTCxTQUFTLFVBRkosRUFHTCxTQUFTLE9BSEosRUFJTCxVQUFVLEdBQVYsRUFBZSxLQUFmLEVBQXNCO0FBQ3BCLGdCQUFJLFdBQVcsSUFBSSxRQUFuQjtBQUNBLG1CQUFPLE1BQU0sR0FBTixDQUFVLFFBQVYsRUFBb0IsR0FBcEIsRUFBeUIsUUFBekIsRUFBbUMsWUFBbkMsRUFBaUQsWUFBakQsQ0FBUDtBQUNELFdBUEksQ0FBUDtBQVFEO0FBQ0Y7QUFDRCxhQUFPLElBQVA7QUFDRDs7QUFFRCxhQUFTLFVBQVQsQ0FBcUIsS0FBckIsRUFBNEIsUUFBNUIsRUFBc0M7QUFDcEMsVUFBSSxTQUFTLGFBQWIsRUFBNEI7QUFDMUIsWUFBSSxRQUFRLGNBQWMsS0FBZCxJQUF1QixDQUFuQzs7QUFFQSxlQUFPLGlCQUFpQixVQUFVLEdBQVYsRUFBZSxLQUFmLEVBQXNCO0FBQzVDLGNBQUksUUFBSixFQUFjO0FBQ1osZ0JBQUksTUFBSixHQUFhLEtBQWI7QUFDRDtBQUNELGlCQUFPLEtBQVA7QUFDRCxTQUxNLENBQVA7QUFNRCxPQVRELE1BU08sSUFBSSxTQUFTLGNBQWIsRUFBNkI7QUFDbEMsWUFBSSxXQUFXLGVBQWUsS0FBZixDQUFmO0FBQ0EsZUFBTyxrQkFBa0IsUUFBbEIsRUFBNEIsVUFBVSxHQUFWLEVBQWUsS0FBZixFQUFzQjtBQUN2RCxjQUFJLFNBQVMsSUFBSSxNQUFKLENBQVcsS0FBWCxFQUFrQixRQUFsQixDQUFiO0FBQ0EsY0FBSSxRQUFKLEVBQWM7QUFDWixnQkFBSSxNQUFKLEdBQWEsTUFBYjtBQUVEO0FBQ0QsaUJBQU8sTUFBUDtBQUNELFNBUE0sQ0FBUDtBQVFELE9BVk0sTUFVQSxJQUFJLFlBQVksUUFBaEIsRUFBMEI7QUFDL0IsZUFBTyxpQkFBaUIsVUFBVSxHQUFWLEVBQWUsS0FBZixFQUFzQjtBQUM1QyxjQUFJLE1BQUosR0FBYSxHQUFiO0FBQ0EsaUJBQU8sQ0FBUDtBQUNELFNBSE0sQ0FBUDtBQUlEO0FBQ0QsYUFBTyxJQUFQO0FBQ0Q7O0FBRUQsUUFBSSxTQUFTLFdBQVcsUUFBWCxFQUFxQixJQUFyQixDQUFiOztBQUVBLGFBQVMsY0FBVCxHQUEyQjtBQUN6QixVQUFJLFdBQVcsYUFBZixFQUE4QjtBQUM1QixZQUFJLFFBQVEsY0FBYyxPQUFkLElBQXlCLENBQXJDOztBQUVBLGVBQU8saUJBQWlCLFlBQVk7QUFDbEMsaUJBQU8sS0FBUDtBQUNELFNBRk0sQ0FBUDtBQUdELE9BTkQsTUFNTyxJQUFJLFdBQVcsY0FBZixFQUErQjtBQUNwQyxZQUFJLFdBQVcsZUFBZSxPQUFmLENBQWY7QUFDQSxlQUFPLGtCQUFrQixRQUFsQixFQUE0QixVQUFVLEdBQVYsRUFBZSxLQUFmLEVBQXNCO0FBQ3ZELGNBQUksU0FBUyxJQUFJLE1BQUosQ0FBVyxLQUFYLEVBQWtCLFFBQWxCLENBQWI7O0FBRUEsaUJBQU8sTUFBUDtBQUNELFNBSk0sQ0FBUDtBQUtELE9BUE0sTUFPQSxJQUFJLFFBQUosRUFBYztBQUNuQixZQUFJLFNBQVMsUUFBVCxDQUFKLEVBQXdCO0FBQ3RCLGNBQUksUUFBSixFQUFjO0FBQ1osZ0JBQUksTUFBSixFQUFZO0FBQ1YscUJBQU8sSUFBSSxXQUFKLENBQ0wsT0FBTyxPQURGLEVBRUwsT0FBTyxVQUZGLEVBR0wsT0FBTyxPQUhGLEVBSUwsVUFBVSxHQUFWLEVBQWUsS0FBZixFQUFzQjtBQUNwQixvQkFBSSxTQUFTLE1BQU0sR0FBTixDQUNYLElBQUksUUFETyxFQUNHLGFBREgsRUFDa0IsSUFBSSxNQUR0QixDQUFiOztBQUtBLHVCQUFPLE1BQVA7QUFDRCxlQVhJLENBQVA7QUFZRCxhQWJELE1BYU87QUFDTCxxQkFBTyxpQkFBaUIsVUFBVSxHQUFWLEVBQWUsS0FBZixFQUFzQjtBQUM1Qyx1QkFBTyxNQUFNLEdBQU4sQ0FBVSxJQUFJLFFBQWQsRUFBd0IsWUFBeEIsQ0FBUDtBQUNELGVBRk0sQ0FBUDtBQUdEO0FBQ0YsV0FuQkQsTUFtQk87QUFDTCxnQkFBSSxTQUFTLGlCQUFpQixZQUFZO0FBQ3hDLHFCQUFPLENBQUMsQ0FBUjtBQUNELGFBRlksQ0FBYjs7QUFJQSxtQkFBTyxNQUFQO0FBQ0Q7QUFDRixTQTNCRCxNQTJCTztBQUNMLGNBQUksV0FBVyxJQUFJLFdBQUosQ0FDYixTQUFTLE9BQVQsSUFBb0IsT0FBTyxPQURkLEVBRWIsU0FBUyxVQUFULElBQXVCLE9BQU8sVUFGakIsRUFHYixTQUFTLE9BQVQsSUFBb0IsT0FBTyxPQUhkLEVBSWIsVUFBVSxHQUFWLEVBQWUsS0FBZixFQUFzQjtBQUNwQixnQkFBSSxXQUFXLElBQUksUUFBbkI7QUFDQSxnQkFBSSxJQUFJLE1BQVIsRUFBZ0I7QUFDZCxxQkFBTyxNQUFNLEdBQU4sQ0FBVSxRQUFWLEVBQW9CLEdBQXBCLEVBQXlCLFFBQXpCLEVBQW1DLGFBQW5DLEVBQ0wsSUFBSSxNQURDLEVBQ08sS0FEUCxDQUFQO0FBRUQ7QUFDRCxtQkFBTyxNQUFNLEdBQU4sQ0FBVSxRQUFWLEVBQW9CLEdBQXBCLEVBQXlCLFFBQXpCLEVBQW1DLGVBQW5DLENBQVA7QUFDRCxXQVhZLENBQWY7O0FBYUEsaUJBQU8sUUFBUDtBQUNEO0FBQ0Y7QUFDRCxhQUFPLElBQVA7QUFDRDs7QUFFRCxXQUFPO0FBQ0wsZ0JBQVUsUUFETDtBQUVMLGlCQUFXLGdCQUZOO0FBR0wsYUFBTyxnQkFIRjtBQUlMLGlCQUFXLFdBQVcsV0FBWCxFQUF3QixLQUF4QixDQUpOO0FBS0wsY0FBUTtBQUxILEtBQVA7QUFPRDs7QUFFRCxXQUFTLFlBQVQsQ0FBdUIsT0FBdkIsRUFBZ0MsR0FBaEMsRUFBcUM7QUFDbkMsUUFBSSxnQkFBZ0IsUUFBUSxNQUE1QjtBQUNBLFFBQUksaUJBQWlCLFFBQVEsT0FBN0I7O0FBRUEsUUFBSSxRQUFRLEVBQVo7O0FBRUEsbUJBQWUsT0FBZixDQUF1QixVQUFVLElBQVYsRUFBZ0I7QUFDckMsVUFBSSxRQUFRLFNBQVMsSUFBVCxDQUFaOztBQUVBLGVBQVMsVUFBVCxDQUFxQixXQUFyQixFQUFrQyxZQUFsQyxFQUFnRDtBQUM5QyxZQUFJLFFBQVEsYUFBWixFQUEyQjtBQUN6QixjQUFJLFFBQVEsWUFBWSxjQUFjLElBQWQsQ0FBWixDQUFaO0FBQ0EsZ0JBQU0sS0FBTixJQUFlLGlCQUFpQixZQUFZO0FBQzFDLG1CQUFPLEtBQVA7QUFDRCxXQUZjLENBQWY7QUFHRCxTQUxELE1BS08sSUFBSSxRQUFRLGNBQVosRUFBNEI7QUFDakMsY0FBSSxNQUFNLGVBQWUsSUFBZixDQUFWO0FBQ0EsZ0JBQU0sS0FBTixJQUFlLGtCQUFrQixHQUFsQixFQUF1QixVQUFVLEdBQVYsRUFBZSxLQUFmLEVBQXNCO0FBQzFELG1CQUFPLGFBQWEsR0FBYixFQUFrQixLQUFsQixFQUF5QixJQUFJLE1BQUosQ0FBVyxLQUFYLEVBQWtCLEdBQWxCLENBQXpCLENBQVA7QUFDRCxXQUZjLENBQWY7QUFHRDtBQUNGOztBQUVELGNBQVEsSUFBUjtBQUNFLGFBQUssYUFBTDtBQUNBLGFBQUssY0FBTDtBQUNBLGFBQUssUUFBTDtBQUNBLGFBQUssZ0JBQUw7QUFDQSxhQUFLLGNBQUw7QUFDQSxhQUFLLGdCQUFMO0FBQ0EsYUFBSyx1QkFBTDtBQUNBLGFBQUssY0FBTDtBQUNBLGFBQUssZUFBTDtBQUNBLGFBQUssWUFBTDtBQUNFLGlCQUFPLFdBQ0wsVUFBVSxLQUFWLEVBQWlCOztBQUVmLG1CQUFPLEtBQVA7QUFDRCxXQUpJLEVBS0wsVUFBVSxHQUFWLEVBQWUsS0FBZixFQUFzQixLQUF0QixFQUE2Qjs7QUFFM0IsbUJBQU8sS0FBUDtBQUNELFdBUkksQ0FBUDs7QUFVRixhQUFLLFlBQUw7QUFDRSxpQkFBTyxXQUNMLFVBQVUsS0FBVixFQUFpQjs7QUFFZixtQkFBTyxhQUFhLEtBQWIsQ0FBUDtBQUNELFdBSkksRUFLTCxVQUFVLEdBQVYsRUFBZSxLQUFmLEVBQXNCLEtBQXRCLEVBQTZCO0FBQzNCLGdCQUFJLGdCQUFnQixJQUFJLFNBQUosQ0FBYyxZQUFsQzs7QUFFQSxtQkFBTyxNQUFNLEdBQU4sQ0FBVSxhQUFWLEVBQXlCLEdBQXpCLEVBQThCLEtBQTlCLEVBQXFDLEdBQXJDLENBQVA7QUFDRCxXQVRJLENBQVA7O0FBV0YsYUFBSyxhQUFMO0FBQ0UsaUJBQU8sV0FDTCxVQUFVLEtBQVYsRUFBaUI7O0FBRWYsbUJBQU8sS0FBUDtBQUNELFdBSkksRUFLTCxVQUFVLEdBQVYsRUFBZSxLQUFmLEVBQXNCLEtBQXRCLEVBQTZCOztBQUczQixnQkFBSSxTQUFTLE1BQU0sR0FBTixDQUFVLEdBQVYsRUFBZSxLQUFmLEVBQXNCLEtBQXRCLENBQWI7QUFDQSxnQkFBSSxRQUFRLE1BQU0sR0FBTixDQUFVLEdBQVYsRUFBZSxLQUFmLEVBQXNCLEtBQXRCLENBQVo7QUFDQSxtQkFBTyxDQUFDLE1BQUQsRUFBUyxLQUFULENBQVA7QUFDRCxXQVhJLENBQVA7O0FBYUYsYUFBSyxZQUFMO0FBQ0UsaUJBQU8sV0FDTCxVQUFVLEtBQVYsRUFBaUI7O0FBRWYsZ0JBQUksU0FBVSxZQUFZLEtBQVosR0FBb0IsTUFBTSxNQUExQixHQUFtQyxNQUFNLEdBQXZEO0FBQ0EsZ0JBQUksV0FBWSxjQUFjLEtBQWQsR0FBc0IsTUFBTSxRQUE1QixHQUF1QyxNQUFNLEdBQTdEO0FBQ0EsZ0JBQUksU0FBVSxZQUFZLEtBQVosR0FBb0IsTUFBTSxNQUExQixHQUFtQyxNQUFNLEdBQXZEO0FBQ0EsZ0JBQUksV0FBWSxjQUFjLEtBQWQsR0FBc0IsTUFBTSxRQUE1QixHQUF1QyxNQUFNLEdBQTdEOztBQVFBLG1CQUFPLENBQ0wsV0FBVyxNQUFYLENBREssRUFFTCxXQUFXLE1BQVgsQ0FGSyxFQUdMLFdBQVcsUUFBWCxDQUhLLEVBSUwsV0FBVyxRQUFYLENBSkssQ0FBUDtBQU1ELFdBcEJJLEVBcUJMLFVBQVUsR0FBVixFQUFlLEtBQWYsRUFBc0IsS0FBdEIsRUFBNkI7QUFDM0IsZ0JBQUksY0FBYyxJQUFJLFNBQUosQ0FBYyxVQUFoQzs7QUFJQSxxQkFBUyxJQUFULENBQWUsTUFBZixFQUF1QixNQUF2QixFQUErQjtBQUM3QixrQkFBSSxPQUFPLE1BQU0sR0FBTixDQUNULEdBRFMsRUFDSixNQURJLEVBQ0ksTUFESixFQUNZLE9BRFosRUFDcUIsS0FEckIsRUFFVCxHQUZTLEVBRUosS0FGSSxFQUVHLEdBRkgsRUFFUSxNQUZSLEVBRWdCLE1BRmhCLEVBR1QsR0FIUyxFQUdKLEtBSEksRUFHRyxHQUhILEVBR1EsTUFIUixDQUFYOztBQU9BLHFCQUFPLElBQVA7QUFDRDs7QUFFRCxnQkFBSSxTQUFTLEtBQUssS0FBTCxFQUFZLEtBQVosQ0FBYjtBQUNBLGdCQUFJLFNBQVMsS0FBSyxLQUFMLEVBQVksS0FBWixDQUFiOztBQUlBLGdCQUFJLFVBQVUsTUFBTSxHQUFOLENBQVUsV0FBVixFQUF1QixHQUF2QixFQUE0QixNQUE1QixFQUFvQyxHQUFwQyxDQUFkO0FBQ0EsZ0JBQUksWUFBWSxNQUFNLEdBQU4sQ0FBVSxXQUFWLEVBQXVCLEdBQXZCLEVBQTRCLEtBQUssS0FBTCxFQUFZLE9BQVosQ0FBNUIsRUFBa0QsR0FBbEQsQ0FBaEI7QUFDQSxnQkFBSSxVQUFVLE1BQU0sR0FBTixDQUFVLFdBQVYsRUFBdUIsR0FBdkIsRUFBNEIsTUFBNUIsRUFBb0MsR0FBcEMsQ0FBZDtBQUNBLGdCQUFJLFlBQVksTUFBTSxHQUFOLENBQVUsV0FBVixFQUF1QixHQUF2QixFQUE0QixLQUFLLEtBQUwsRUFBWSxPQUFaLENBQTVCLEVBQWtELEdBQWxELENBQWhCOztBQUVBLG1CQUFPLENBQUMsT0FBRCxFQUFVLE9BQVYsRUFBbUIsU0FBbkIsRUFBOEIsU0FBOUIsQ0FBUDtBQUNELFdBaERJLENBQVA7O0FBa0RGLGFBQUssZ0JBQUw7QUFDRSxpQkFBTyxXQUNMLFVBQVUsS0FBVixFQUFpQjtBQUNmLGdCQUFJLE9BQU8sS0FBUCxLQUFpQixRQUFyQixFQUErQjs7QUFFN0IscUJBQU8sQ0FDTCxlQUFlLEtBQWYsQ0FESyxFQUVMLGVBQWUsS0FBZixDQUZLLENBQVA7QUFJRCxhQU5ELE1BTU8sSUFBSSxPQUFPLEtBQVAsS0FBaUIsUUFBckIsRUFBK0I7O0FBR3BDLHFCQUFPLENBQ0wsZUFBZSxNQUFNLEdBQXJCLENBREssRUFFTCxlQUFlLE1BQU0sS0FBckIsQ0FGSyxDQUFQO0FBSUQsYUFQTSxNQU9BLENBRU47QUFDRixXQWxCSSxFQW1CTCxVQUFVLEdBQVYsRUFBZSxLQUFmLEVBQXNCLEtBQXRCLEVBQTZCO0FBQzNCLGdCQUFJLGtCQUFrQixJQUFJLFNBQUosQ0FBYyxjQUFwQzs7QUFFQSxnQkFBSSxNQUFNLE1BQU0sR0FBTixFQUFWO0FBQ0EsZ0JBQUksUUFBUSxNQUFNLEdBQU4sRUFBWjs7QUFFQSxnQkFBSSxPQUFPLElBQUksSUFBSixDQUFTLFNBQVQsRUFBb0IsS0FBcEIsRUFBMkIsYUFBM0IsQ0FBWDs7QUFJQSxpQkFBSyxJQUFMLENBQ0UsR0FERixFQUNPLEdBRFAsRUFDWSxLQURaLEVBQ21CLEdBRG5CLEVBQ3dCLGVBRHhCLEVBQ3lDLEdBRHpDLEVBQzhDLEtBRDlDLEVBQ3FELElBRHJEO0FBRUEsaUJBQUssSUFBTCxDQUNFLEdBREYsRUFDTyxHQURQLEVBQ1ksZUFEWixFQUM2QixHQUQ3QixFQUNrQyxLQURsQyxFQUN5QyxRQUR6QyxFQUVFLEtBRkYsRUFFUyxHQUZULEVBRWMsZUFGZCxFQUUrQixHQUYvQixFQUVvQyxLQUZwQyxFQUUyQyxVQUYzQzs7QUFJQSxrQkFBTSxJQUFOOztBQUVBLG1CQUFPLENBQUMsR0FBRCxFQUFNLEtBQU4sQ0FBUDtBQUNELFdBdENJLENBQVA7O0FBd0NGLGFBQUssYUFBTDtBQUNFLGlCQUFPLFdBQ0wsVUFBVSxLQUFWLEVBQWlCOztBQUVmLG1CQUFPLEtBQUssQ0FBTCxFQUFRLFVBQVUsQ0FBVixFQUFhO0FBQzFCLHFCQUFPLENBQUMsTUFBTSxDQUFOLENBQVI7QUFDRCxhQUZNLENBQVA7QUFHRCxXQU5JLEVBT0wsVUFBVSxHQUFWLEVBQWUsS0FBZixFQUFzQixLQUF0QixFQUE2Qjs7QUFFM0IsbUJBQU8sS0FBSyxDQUFMLEVBQVEsVUFBVSxDQUFWLEVBQWE7QUFDMUIscUJBQU8sTUFBTSxHQUFOLENBQVUsR0FBVixFQUFlLEtBQWYsRUFBc0IsR0FBdEIsRUFBMkIsQ0FBM0IsRUFBOEIsR0FBOUIsQ0FBUDtBQUNELGFBRk0sQ0FBUDtBQUdELFdBWkksQ0FBUDs7QUFjRixhQUFLLGNBQUw7QUFDRSxpQkFBTyxXQUNMLFVBQVUsS0FBVixFQUFpQjs7QUFFZixtQkFBTyxRQUFRLENBQWY7QUFDRCxXQUpJLEVBS0wsVUFBVSxHQUFWLEVBQWUsS0FBZixFQUFzQixLQUF0QixFQUE2Qjs7QUFFM0IsbUJBQU8sTUFBTSxHQUFOLENBQVUsS0FBVixFQUFpQixJQUFqQixDQUFQO0FBQ0QsV0FSSSxDQUFQOztBQVVGLGFBQUssY0FBTDtBQUNFLGlCQUFPLFdBQ0wsVUFBVSxLQUFWLEVBQWlCOztBQUVmLGdCQUFJLE1BQU0sTUFBTSxHQUFOLElBQWEsTUFBdkI7QUFDQSxnQkFBSSxNQUFNLE1BQU0sR0FBTixJQUFhLENBQXZCO0FBQ0EsZ0JBQUksT0FBTyxVQUFVLEtBQVYsR0FBa0IsTUFBTSxJQUF4QixHQUErQixDQUFDLENBQTNDOztBQUlBLG1CQUFPLENBQ0wsYUFBYSxHQUFiLENBREssRUFFTCxHQUZLLEVBR0wsSUFISyxDQUFQO0FBS0QsV0FkSSxFQWVMLFVBQVUsR0FBVixFQUFlLEtBQWYsRUFBc0IsS0FBdEIsRUFBNkI7QUFDM0IsZ0JBQUksZ0JBQWdCLElBQUksU0FBSixDQUFjLFlBQWxDOztBQUVBLGdCQUFJLE1BQU0sTUFBTSxHQUFOLENBQ1IsV0FEUSxFQUNLLEtBREwsRUFFUixHQUZRLEVBRUgsYUFGRyxFQUVZLEdBRlosRUFFaUIsS0FGakIsRUFFd0IsT0FGeEIsRUFHUixHQUhRLEVBR0gsT0FIRyxDQUFWO0FBSUEsZ0JBQUksTUFBTSxNQUFNLEdBQU4sQ0FBVSxLQUFWLEVBQWlCLFFBQWpCLENBQVY7QUFDQSxnQkFBSSxPQUFPLE1BQU0sR0FBTixDQUNULFlBRFMsRUFDSyxLQURMLEVBRVQsR0FGUyxFQUVKLEtBRkksRUFFRyxZQUZILENBQVg7QUFHQSxtQkFBTyxDQUFDLEdBQUQsRUFBTSxHQUFOLEVBQVcsSUFBWCxDQUFQO0FBQ0QsV0EzQkksQ0FBUDs7QUE2QkYsYUFBSyxpQkFBTDtBQUNBLGFBQUssZ0JBQUw7QUFDRSxpQkFBTyxXQUNMLFVBQVUsS0FBVixFQUFpQjs7QUFFZixnQkFBSSxPQUFPLE1BQU0sSUFBTixJQUFjLE1BQXpCO0FBQ0EsZ0JBQUksUUFBUSxNQUFNLEtBQU4sSUFBZSxNQUEzQjtBQUNBLGdCQUFJLFFBQVEsTUFBTSxLQUFOLElBQWUsTUFBM0I7O0FBSUEsbUJBQU8sQ0FDTCxTQUFTLGdCQUFULEdBQTRCLE9BQTVCLEdBQXNDLFFBRGpDLEVBRUwsV0FBVyxJQUFYLENBRkssRUFHTCxXQUFXLEtBQVgsQ0FISyxFQUlMLFdBQVcsS0FBWCxDQUpLLENBQVA7QUFNRCxXQWZJLEVBZ0JMLFVBQVUsR0FBVixFQUFlLEtBQWYsRUFBc0IsS0FBdEIsRUFBNkI7QUFDM0IsZ0JBQUksY0FBYyxJQUFJLFNBQUosQ0FBYyxVQUFoQzs7QUFJQSxxQkFBUyxJQUFULENBQWUsSUFBZixFQUFxQjs7QUFHbkIscUJBQU8sTUFBTSxHQUFOLENBQ0wsR0FESyxFQUNBLElBREEsRUFDTSxPQUROLEVBQ2UsS0FEZixFQUVMLEdBRkssRUFFQSxXQUZBLEVBRWEsR0FGYixFQUVrQixLQUZsQixFQUV5QixHQUZ6QixFQUU4QixJQUY5QixFQUVvQyxJQUZwQyxFQUdMLE9BSEssQ0FBUDtBQUlEOztBQUVELG1CQUFPLENBQ0wsU0FBUyxnQkFBVCxHQUE0QixPQUE1QixHQUFzQyxRQURqQyxFQUVMLEtBQUssTUFBTCxDQUZLLEVBR0wsS0FBSyxPQUFMLENBSEssRUFJTCxLQUFLLE9BQUwsQ0FKSyxDQUFQO0FBTUQsV0FwQ0ksQ0FBUDs7QUFzQ0YsYUFBSyx1QkFBTDtBQUNFLGlCQUFPLFdBQ0wsVUFBVSxLQUFWLEVBQWlCOztBQUVmLGdCQUFJLFNBQVMsTUFBTSxNQUFOLEdBQWUsQ0FBNUI7QUFDQSxnQkFBSSxRQUFRLE1BQU0sS0FBTixHQUFjLENBQTFCOztBQUdBLG1CQUFPLENBQUMsTUFBRCxFQUFTLEtBQVQsQ0FBUDtBQUNELFdBUkksRUFTTCxVQUFVLEdBQVYsRUFBZSxLQUFmLEVBQXNCLEtBQXRCLEVBQTZCOztBQUczQixnQkFBSSxTQUFTLE1BQU0sR0FBTixDQUFVLEtBQVYsRUFBaUIsV0FBakIsQ0FBYjtBQUNBLGdCQUFJLFFBQVEsTUFBTSxHQUFOLENBQVUsS0FBVixFQUFpQixVQUFqQixDQUFaOztBQUVBLG1CQUFPLENBQUMsTUFBRCxFQUFTLEtBQVQsQ0FBUDtBQUNELFdBaEJJLENBQVA7O0FBa0JGLGFBQUssV0FBTDtBQUNFLGlCQUFPLFdBQ0wsVUFBVSxLQUFWLEVBQWlCO0FBQ2YsZ0JBQUksT0FBTyxDQUFYO0FBQ0EsZ0JBQUksVUFBVSxPQUFkLEVBQXVCO0FBQ3JCLHFCQUFPLFFBQVA7QUFDRCxhQUZELE1BRU8sSUFBSSxVQUFVLE1BQWQsRUFBc0I7QUFDM0IscUJBQU8sT0FBUDtBQUNEOztBQUVELG1CQUFPLElBQVA7QUFDRCxXQVZJLEVBV0wsVUFBVSxHQUFWLEVBQWUsS0FBZixFQUFzQixLQUF0QixFQUE2Qjs7QUFFM0IsbUJBQU8sTUFBTSxHQUFOLENBQVUsS0FBVixFQUFpQixhQUFqQixFQUFnQyxRQUFoQyxFQUEwQyxHQUExQyxFQUErQyxPQUEvQyxDQUFQO0FBQ0QsV0FkSSxDQUFQOztBQWdCRixhQUFLLFlBQUw7QUFDRSxpQkFBTyxXQUNMLFVBQVUsS0FBVixFQUFpQjs7QUFFZixtQkFBTyxLQUFQO0FBQ0QsV0FKSSxFQUtMLFVBQVUsR0FBVixFQUFlLEtBQWYsRUFBc0IsS0FBdEIsRUFBNkI7O0FBRzNCLG1CQUFPLEtBQVA7QUFDRCxXQVRJLENBQVA7O0FBV0YsYUFBSyxZQUFMO0FBQ0UsaUJBQU8sV0FDTCxVQUFVLEtBQVYsRUFBaUI7O0FBRWYsbUJBQU8sZ0JBQWdCLEtBQWhCLENBQVA7QUFDRCxXQUpJLEVBS0wsVUFBVSxHQUFWLEVBQWUsS0FBZixFQUFzQixLQUF0QixFQUE2Qjs7QUFFM0IsbUJBQU8sTUFBTSxHQUFOLENBQVUsUUFBUSxVQUFSLEdBQXFCLEtBQXJCLEdBQTZCLEdBQTdCLEdBQW1DLE1BQTdDLENBQVA7QUFDRCxXQVJJLENBQVA7O0FBVUYsYUFBSyxZQUFMO0FBQ0UsaUJBQU8sV0FDTCxVQUFVLEtBQVYsRUFBaUI7O0FBRWYsbUJBQU8sTUFBTSxHQUFOLENBQVUsVUFBVSxDQUFWLEVBQWE7QUFBRSxxQkFBTyxDQUFDLENBQUMsQ0FBVDtBQUFZLGFBQXJDLENBQVA7QUFDRCxXQUpJLEVBS0wsVUFBVSxHQUFWLEVBQWUsS0FBZixFQUFzQixLQUF0QixFQUE2Qjs7QUFFM0IsbUJBQU8sS0FBSyxDQUFMLEVBQVEsVUFBVSxDQUFWLEVBQWE7QUFDMUIscUJBQU8sT0FBTyxLQUFQLEdBQWUsR0FBZixHQUFxQixDQUFyQixHQUF5QixHQUFoQztBQUNELGFBRk0sQ0FBUDtBQUdELFdBVkksQ0FBUDs7QUFZRixhQUFLLGlCQUFMO0FBQ0UsaUJBQU8sV0FDTCxVQUFVLEtBQVYsRUFBaUI7O0FBRWYsZ0JBQUksY0FBYyxXQUFXLEtBQVgsR0FBbUIsTUFBTSxLQUF6QixHQUFpQyxDQUFuRDtBQUNBLGdCQUFJLGVBQWUsQ0FBQyxDQUFDLE1BQU0sTUFBM0I7O0FBRUEsbUJBQU8sQ0FBQyxXQUFELEVBQWMsWUFBZCxDQUFQO0FBQ0QsV0FQSSxFQVFMLFVBQVUsR0FBVixFQUFlLEtBQWYsRUFBc0IsS0FBdEIsRUFBNkI7O0FBRTNCLGdCQUFJLFFBQVEsTUFBTSxHQUFOLENBQ1YsYUFEVSxFQUNLLEtBREwsRUFDWSxJQURaLEVBQ2tCLEtBRGxCLEVBQ3lCLFVBRHpCLENBQVo7QUFFQSxnQkFBSSxTQUFTLE1BQU0sR0FBTixDQUFVLElBQVYsRUFBZ0IsS0FBaEIsRUFBdUIsU0FBdkIsQ0FBYjtBQUNBLG1CQUFPLENBQUMsS0FBRCxFQUFRLE1BQVIsQ0FBUDtBQUNELFdBZEksQ0FBUDtBQXBUSjtBQW9VRCxLQXJWRDs7QUF1VkEsV0FBTyxLQUFQO0FBQ0Q7O0FBRUQsV0FBUyxhQUFULENBQXdCLFFBQXhCLEVBQWtDLEdBQWxDLEVBQXVDO0FBQ3JDLFFBQUksaUJBQWlCLFNBQVMsTUFBOUI7QUFDQSxRQUFJLGtCQUFrQixTQUFTLE9BQS9COztBQUVBLFFBQUksV0FBVyxFQUFmOztBQUVBLFdBQU8sSUFBUCxDQUFZLGNBQVosRUFBNEIsT0FBNUIsQ0FBb0MsVUFBVSxJQUFWLEVBQWdCO0FBQ2xELFVBQUksUUFBUSxlQUFlLElBQWYsQ0FBWjtBQUNBLFVBQUksTUFBSjtBQUNBLFVBQUksT0FBTyxLQUFQLEtBQWlCLFFBQWpCLElBQ0EsT0FBTyxLQUFQLEtBQWlCLFNBRHJCLEVBQ2dDO0FBQzlCLGlCQUFTLGlCQUFpQixZQUFZO0FBQ3BDLGlCQUFPLEtBQVA7QUFDRCxTQUZRLENBQVQ7QUFHRCxPQUxELE1BS08sSUFBSSxPQUFPLEtBQVAsS0FBaUIsVUFBckIsRUFBaUM7QUFDdEMsWUFBSSxXQUFXLE1BQU0sU0FBckI7QUFDQSxZQUFJLGFBQWEsV0FBYixJQUNBLGFBQWEsYUFEakIsRUFDZ0M7QUFDOUIsbUJBQVMsaUJBQWlCLFVBQVUsR0FBVixFQUFlO0FBQ3ZDLG1CQUFPLElBQUksSUFBSixDQUFTLEtBQVQsQ0FBUDtBQUNELFdBRlEsQ0FBVDtBQUdELFNBTEQsTUFLTyxJQUFJLGFBQWEsYUFBYixJQUNBLGFBQWEsaUJBRGpCLEVBQ29DOztBQUV6QyxtQkFBUyxpQkFBaUIsVUFBVSxHQUFWLEVBQWU7QUFDdkMsbUJBQU8sSUFBSSxJQUFKLENBQVMsTUFBTSxLQUFOLENBQVksQ0FBWixDQUFULENBQVA7QUFDRCxXQUZRLENBQVQ7QUFHRCxTQU5NLE1BTUEsQ0FFTjtBQUNGLE9BaEJNLE1BZ0JBLElBQUksWUFBWSxLQUFaLENBQUosRUFBd0I7QUFDN0IsaUJBQVMsaUJBQWlCLFVBQVUsR0FBVixFQUFlO0FBQ3ZDLGNBQUksT0FBTyxJQUFJLE1BQUosQ0FBVyxHQUFYLENBQWUsR0FBZixFQUNULEtBQUssTUFBTSxNQUFYLEVBQW1CLFVBQVUsQ0FBVixFQUFhOztBQUU5QixtQkFBTyxNQUFNLENBQU4sQ0FBUDtBQUNELFdBSEQsQ0FEUyxFQUlMLEdBSkssQ0FBWDtBQUtBLGlCQUFPLElBQVA7QUFDRCxTQVBRLENBQVQ7QUFRRCxPQVRNLE1BU0EsQ0FFTjtBQUNELGFBQU8sS0FBUCxHQUFlLEtBQWY7QUFDQSxlQUFTLElBQVQsSUFBaUIsTUFBakI7QUFDRCxLQXRDRDs7QUF3Q0EsV0FBTyxJQUFQLENBQVksZUFBWixFQUE2QixPQUE3QixDQUFxQyxVQUFVLEdBQVYsRUFBZTtBQUNsRCxVQUFJLE1BQU0sZ0JBQWdCLEdBQWhCLENBQVY7QUFDQSxlQUFTLEdBQVQsSUFBZ0Isa0JBQWtCLEdBQWxCLEVBQXVCLFVBQVUsR0FBVixFQUFlLEtBQWYsRUFBc0I7QUFDM0QsZUFBTyxJQUFJLE1BQUosQ0FBVyxLQUFYLEVBQWtCLEdBQWxCLENBQVA7QUFDRCxPQUZlLENBQWhCO0FBR0QsS0FMRDs7QUFPQSxXQUFPLFFBQVA7QUFDRDs7QUFFRCxXQUFTLGVBQVQsQ0FBMEIsVUFBMUIsRUFBc0MsR0FBdEMsRUFBMkM7QUFDekMsUUFBSSxtQkFBbUIsV0FBVyxNQUFsQztBQUNBLFFBQUksb0JBQW9CLFdBQVcsT0FBbkM7O0FBRUEsUUFBSSxnQkFBZ0IsRUFBcEI7O0FBRUEsV0FBTyxJQUFQLENBQVksZ0JBQVosRUFBOEIsT0FBOUIsQ0FBc0MsVUFBVSxTQUFWLEVBQXFCO0FBQ3pELFVBQUksUUFBUSxpQkFBaUIsU0FBakIsQ0FBWjtBQUNBLFVBQUksS0FBSyxZQUFZLEVBQVosQ0FBZSxTQUFmLENBQVQ7O0FBRUEsVUFBSSxTQUFTLElBQUksZUFBSixFQUFiO0FBQ0EsVUFBSSxhQUFhLEtBQWIsQ0FBSixFQUF5QjtBQUN2QixlQUFPLEtBQVAsR0FBZSxvQkFBZjtBQUNBLGVBQU8sTUFBUCxHQUFnQixZQUFZLFNBQVosQ0FDZCxZQUFZLE1BQVosQ0FBbUIsS0FBbkIsRUFBMEIsZUFBMUIsRUFBMkMsS0FBM0MsRUFBa0QsSUFBbEQsQ0FEYyxDQUFoQjtBQUVBLGVBQU8sSUFBUCxHQUFjLENBQWQ7QUFDRCxPQUxELE1BS087QUFDTCxZQUFJLFNBQVMsWUFBWSxTQUFaLENBQXNCLEtBQXRCLENBQWI7QUFDQSxZQUFJLE1BQUosRUFBWTtBQUNWLGlCQUFPLEtBQVAsR0FBZSxvQkFBZjtBQUNBLGlCQUFPLE1BQVAsR0FBZ0IsTUFBaEI7QUFDQSxpQkFBTyxJQUFQLEdBQWMsQ0FBZDtBQUNELFNBSkQsTUFJTzs7QUFFTCxjQUFJLE1BQU0sUUFBVixFQUFvQjtBQUNsQixnQkFBSSxXQUFXLE1BQU0sUUFBckI7QUFDQSxtQkFBTyxNQUFQLEdBQWdCLE1BQWhCO0FBQ0EsbUJBQU8sS0FBUCxHQUFlLHFCQUFmO0FBQ0EsZ0JBQUksT0FBTyxRQUFQLEtBQW9CLFFBQXhCLEVBQWtDO0FBQ2hDLHFCQUFPLENBQVAsR0FBVyxRQUFYO0FBQ0QsYUFGRCxNQUVPOztBQUVMLDhCQUFnQixPQUFoQixDQUF3QixVQUFVLENBQVYsRUFBYSxDQUFiLEVBQWdCO0FBQ3RDLG9CQUFJLElBQUksU0FBUyxNQUFqQixFQUF5QjtBQUN2Qix5QkFBTyxDQUFQLElBQVksU0FBUyxDQUFULENBQVo7QUFDRDtBQUNGLGVBSkQ7QUFLRDtBQUNGLFdBZEQsTUFjTztBQUNMLGdCQUFJLGFBQWEsTUFBTSxNQUFuQixDQUFKLEVBQWdDO0FBQzlCLHVCQUFTLFlBQVksU0FBWixDQUNQLFlBQVksTUFBWixDQUFtQixNQUFNLE1BQXpCLEVBQWlDLGVBQWpDLEVBQWtELEtBQWxELEVBQXlELElBQXpELENBRE8sQ0FBVDtBQUVELGFBSEQsTUFHTztBQUNMLHVCQUFTLFlBQVksU0FBWixDQUFzQixNQUFNLE1BQTVCLENBQVQ7QUFDRDs7QUFHRCxnQkFBSSxTQUFTLE1BQU0sTUFBTixHQUFlLENBQTVCOztBQUdBLGdCQUFJLFNBQVMsTUFBTSxNQUFOLEdBQWUsQ0FBNUI7O0FBR0EsZ0JBQUksT0FBTyxNQUFNLElBQU4sR0FBYSxDQUF4Qjs7QUFHQSxnQkFBSSxhQUFhLENBQUMsQ0FBQyxNQUFNLFVBQXpCOztBQUVBLGdCQUFJLE9BQU8sQ0FBWDtBQUNBLGdCQUFJLFVBQVUsS0FBZCxFQUFxQjs7QUFFbkIscUJBQU8sUUFBUSxNQUFNLElBQWQsQ0FBUDtBQUNEOztBQUVELGdCQUFJLFVBQVUsTUFBTSxPQUFOLEdBQWdCLENBQTlCO0FBQ0EsZ0JBQUksYUFBYSxLQUFqQixFQUF3QixDQUd2Qjs7QUFJRCxtQkFBTyxNQUFQLEdBQWdCLE1BQWhCO0FBQ0EsbUJBQU8sS0FBUCxHQUFlLG9CQUFmO0FBQ0EsbUJBQU8sSUFBUCxHQUFjLElBQWQ7QUFDQSxtQkFBTyxVQUFQLEdBQW9CLFVBQXBCO0FBQ0EsbUJBQU8sSUFBUCxHQUFjLFFBQVEsT0FBTyxLQUE3QjtBQUNBLG1CQUFPLE1BQVAsR0FBZ0IsTUFBaEI7QUFDQSxtQkFBTyxNQUFQLEdBQWdCLE1BQWhCO0FBQ0EsbUJBQU8sT0FBUCxHQUFpQixPQUFqQjtBQUNEO0FBQ0Y7QUFDRjs7QUFFRCxvQkFBYyxTQUFkLElBQTJCLGlCQUFpQixVQUFVLEdBQVYsRUFBZSxLQUFmLEVBQXNCO0FBQ2hFLFlBQUksUUFBUSxJQUFJLFdBQWhCO0FBQ0EsWUFBSSxNQUFNLEtBQVYsRUFBaUI7QUFDZixpQkFBTyxNQUFNLEVBQU4sQ0FBUDtBQUNEO0FBQ0QsWUFBSSxTQUFTO0FBQ1gsb0JBQVU7QUFEQyxTQUFiO0FBR0EsZUFBTyxJQUFQLENBQVksTUFBWixFQUFvQixPQUFwQixDQUE0QixVQUFVLEdBQVYsRUFBZTtBQUN6QyxpQkFBTyxHQUFQLElBQWMsT0FBTyxHQUFQLENBQWQ7QUFDRCxTQUZEO0FBR0EsWUFBSSxPQUFPLE1BQVgsRUFBbUI7QUFDakIsaUJBQU8sTUFBUCxHQUFnQixJQUFJLElBQUosQ0FBUyxPQUFPLE1BQWhCLENBQWhCO0FBQ0EsaUJBQU8sSUFBUCxHQUFjLE9BQU8sSUFBUCxJQUFnQixPQUFPLE1BQVAsR0FBZ0IsUUFBOUM7QUFDRDtBQUNELGNBQU0sRUFBTixJQUFZLE1BQVo7QUFDQSxlQUFPLE1BQVA7QUFDRCxPQWpCMEIsQ0FBM0I7QUFrQkQsS0FoR0Q7O0FBa0dBLFdBQU8sSUFBUCxDQUFZLGlCQUFaLEVBQStCLE9BQS9CLENBQXVDLFVBQVUsU0FBVixFQUFxQjtBQUMxRCxVQUFJLE1BQU0sa0JBQWtCLFNBQWxCLENBQVY7O0FBRUEsZUFBUyxtQkFBVCxDQUE4QixHQUE5QixFQUFtQyxLQUFuQyxFQUEwQztBQUN4QyxZQUFJLFFBQVEsSUFBSSxNQUFKLENBQVcsS0FBWCxFQUFrQixHQUFsQixDQUFaOztBQUVBLFlBQUksU0FBUyxJQUFJLE1BQWpCOztBQUVBLFlBQUksaUJBQWlCLE9BQU8sWUFBNUI7QUFDQSxZQUFJLGVBQWUsT0FBTyxNQUExQjs7QUFFQTs7O0FBR0E7QUFDQSxZQUFJLFNBQVM7QUFDWCxvQkFBVSxNQUFNLEdBQU4sQ0FBVSxLQUFWO0FBREMsU0FBYjtBQUdBLFlBQUksZ0JBQWdCLElBQUksZUFBSixFQUFwQjtBQUNBLHNCQUFjLEtBQWQsR0FBc0Isb0JBQXRCO0FBQ0EsZUFBTyxJQUFQLENBQVksYUFBWixFQUEyQixPQUEzQixDQUFtQyxVQUFVLEdBQVYsRUFBZTtBQUNoRCxpQkFBTyxHQUFQLElBQWMsTUFBTSxHQUFOLENBQVUsS0FBSyxjQUFjLEdBQWQsQ0FBZixDQUFkO0FBQ0QsU0FGRDs7QUFJQSxZQUFJLFNBQVMsT0FBTyxNQUFwQjtBQUNBLFlBQUksT0FBTyxPQUFPLElBQWxCO0FBQ0EsY0FDRSxLQURGLEVBQ1MsY0FEVCxFQUN5QixHQUR6QixFQUM4QixLQUQ5QixFQUNxQyxLQURyQyxFQUVFLE9BQU8sUUFGVCxFQUVtQixRQUZuQixFQUdFLE1BSEYsRUFHVSxHQUhWLEVBR2UsWUFIZixFQUc2QixnQkFIN0IsRUFHK0MsZUFIL0MsRUFHZ0UsR0FIaEUsRUFHcUUsS0FIckUsRUFHNEUsSUFINUUsRUFJRSxJQUpGLEVBSVEsR0FKUixFQUlhLE1BSmIsRUFJcUIsU0FKckIsRUFLRSxRQUxGLEVBTUUsTUFORixFQU1VLEdBTlYsRUFNZSxZQU5mLEVBTTZCLGFBTjdCLEVBTTRDLEtBTjVDLEVBTW1ELElBTm5ELEVBT0UsS0FQRixFQU9TLE1BUFQsRUFPaUIsSUFQakIsRUFRRSxJQVJGLEVBUVEsR0FSUixFQVFhLE1BUmIsRUFRcUIsU0FSckIsRUFTRSx5QkFURixFQVM2QixLQVQ3QixFQVNvQyxJQVRwQyxFQVVFLE9BQU8sS0FWVCxFQVVnQixHQVZoQixFQVVxQixxQkFWckIsRUFVNEMsR0FWNUMsRUFXRSxlQUFlLEtBQWYsR0FBdUIsMEJBWHpCLEVBWUUsT0FBTyxnQkFBZ0IsQ0FBaEIsQ0FBUCxDQVpGLEVBWThCLEdBWjlCLEVBWW1DLEtBWm5DLEVBWTBDLFlBWjFDLEVBYUUsZ0JBQWdCLEtBQWhCLENBQXNCLENBQXRCLEVBQXlCLEdBQXpCLENBQTZCLFVBQVUsQ0FBVixFQUFhO0FBQ3hDLGlCQUFPLE9BQU8sQ0FBUCxDQUFQO0FBQ0QsU0FGRCxFQUVHLElBRkgsQ0FFUSxHQUZSLENBYkYsRUFlZ0IsS0FmaEIsRUFnQkUsUUFoQkYsRUFpQkUsZ0JBQWdCLEdBQWhCLENBQW9CLFVBQVUsSUFBVixFQUFnQixDQUFoQixFQUFtQjtBQUNyQyxpQkFDRSxPQUFPLElBQVAsSUFBZSxHQUFmLEdBQXFCLEtBQXJCLEdBQTZCLG9CQUE3QixHQUFvRCxDQUFwRCxHQUNBLEdBREEsR0FDTSxLQUROLEdBQ2MsWUFEZCxHQUM2QixDQUQ3QixHQUNpQyxNQUZuQztBQUlELFNBTEQsRUFLRyxJQUxILENBS1EsRUFMUixDQWpCRixFQXVCRSxTQXZCRixFQXdCRSxLQXhCRixFQXdCUyxjQXhCVCxFQXdCeUIsR0F4QnpCLEVBd0I4QixLQXhCOUIsRUF3QnFDLFlBeEJyQyxFQXlCRSxNQXpCRixFQXlCVSxHQXpCVixFQXlCZSxZQXpCZixFQXlCNkIsZ0JBekI3QixFQXlCK0MsZUF6Qi9DLEVBeUJnRSxHQXpCaEUsRUF5QnFFLEtBekJyRSxFQXlCNEUsV0F6QjVFLEVBMEJFLFFBMUJGLEVBMkJFLE1BM0JGLEVBMkJVLEdBM0JWLEVBMkJlLFlBM0JmLEVBMkI2QixhQTNCN0IsRUEyQjRDLEtBM0I1QyxFQTJCbUQsV0EzQm5ELEVBNEJFLEdBNUJGLEVBNkJFLElBN0JGLEVBNkJRLGFBN0JSLEVBNkJ1QixLQTdCdkIsRUE2QjhCLEdBN0I5QixFQThCRSxPQUFPLE9BOUJULEVBOEJrQixHQTlCbEIsRUE4QnVCLEtBOUJ2QixFQThCOEIsU0E5QjlCLEVBOEJ5QyxNQTlCekMsRUE4QmlELFNBOUJqRCxFQStCRSxPQUFPLFVBL0JULEVBK0JxQixLQS9CckIsRUErQjRCLEtBL0I1QixFQStCbUMsY0EvQm5DO0FBZ0NBLGlCQUFTLGNBQVQsQ0FBeUIsSUFBekIsRUFBK0I7QUFDN0IsZ0JBQU0sT0FBTyxJQUFQLENBQU4sRUFBb0IsR0FBcEIsRUFBeUIsS0FBekIsRUFBZ0MsR0FBaEMsRUFBcUMsSUFBckMsRUFBMkMsS0FBM0M7QUFDRDtBQUNELHVCQUFlLE1BQWY7QUFDQSx1QkFBZSxRQUFmO0FBQ0EsdUJBQWUsUUFBZjtBQUNBLHVCQUFlLFNBQWY7O0FBRUEsY0FBTSxJQUFOOztBQUVBLGNBQU0sSUFBTixDQUNFLEtBREYsRUFDUyxPQUFPLFFBRGhCLEVBQzBCLElBRDFCLEVBRUUsWUFGRixFQUVnQixpQkFGaEIsRUFFbUMsTUFGbkMsRUFFMkMsSUFGM0MsRUFHRSxHQUhGOztBQUtBLGVBQU8sTUFBUDtBQUNEOztBQUVELG9CQUFjLFNBQWQsSUFBMkIsa0JBQWtCLEdBQWxCLEVBQXVCLG1CQUF2QixDQUEzQjtBQUNELEtBN0VEOztBQStFQSxXQUFPLGFBQVA7QUFDRDs7QUFFRCxXQUFTLFlBQVQsQ0FBdUIsT0FBdkIsRUFBZ0M7QUFDOUIsUUFBSSxnQkFBZ0IsUUFBUSxNQUE1QjtBQUNBLFFBQUksaUJBQWlCLFFBQVEsT0FBN0I7QUFDQSxRQUFJLFNBQVMsRUFBYjs7QUFFQSxXQUFPLElBQVAsQ0FBWSxhQUFaLEVBQTJCLE9BQTNCLENBQW1DLFVBQVUsSUFBVixFQUFnQjtBQUNqRCxVQUFJLFFBQVEsY0FBYyxJQUFkLENBQVo7QUFDQSxhQUFPLElBQVAsSUFBZSxpQkFBaUIsVUFBVSxHQUFWLEVBQWUsS0FBZixFQUFzQjtBQUNwRCxZQUFJLE9BQU8sS0FBUCxLQUFpQixRQUFqQixJQUE2QixPQUFPLEtBQVAsS0FBaUIsU0FBbEQsRUFBNkQ7QUFDM0QsaUJBQU8sS0FBSyxLQUFaO0FBQ0QsU0FGRCxNQUVPO0FBQ0wsaUJBQU8sSUFBSSxJQUFKLENBQVMsS0FBVCxDQUFQO0FBQ0Q7QUFDRixPQU5jLENBQWY7QUFPRCxLQVREOztBQVdBLFdBQU8sSUFBUCxDQUFZLGNBQVosRUFBNEIsT0FBNUIsQ0FBb0MsVUFBVSxJQUFWLEVBQWdCO0FBQ2xELFVBQUksTUFBTSxlQUFlLElBQWYsQ0FBVjtBQUNBLGFBQU8sSUFBUCxJQUFlLGtCQUFrQixHQUFsQixFQUF1QixVQUFVLEdBQVYsRUFBZSxLQUFmLEVBQXNCO0FBQzFELGVBQU8sSUFBSSxNQUFKLENBQVcsS0FBWCxFQUFrQixHQUFsQixDQUFQO0FBQ0QsT0FGYyxDQUFmO0FBR0QsS0FMRDs7QUFPQSxXQUFPLE1BQVA7QUFDRDs7QUFFRCxXQUFTLGNBQVQsQ0FBeUIsT0FBekIsRUFBa0MsVUFBbEMsRUFBOEMsUUFBOUMsRUFBd0QsT0FBeEQsRUFBaUUsR0FBakUsRUFBc0U7QUFDcEUsUUFBSSxnQkFBZ0IsUUFBUSxNQUE1QjtBQUNBLFFBQUksaUJBQWlCLFFBQVEsT0FBN0I7O0FBSUEsUUFBSSxjQUFjLGlCQUFpQixPQUFqQixFQUEwQixHQUExQixDQUFsQjtBQUNBLFFBQUkscUJBQXFCLHFCQUFxQixPQUFyQixFQUE4QixXQUE5QixFQUEyQyxHQUEzQyxDQUF6QjtBQUNBLFFBQUksT0FBTyxVQUFVLE9BQVYsRUFBbUIsR0FBbkIsQ0FBWDtBQUNBLFFBQUksUUFBUSxhQUFhLE9BQWIsRUFBc0IsR0FBdEIsQ0FBWjtBQUNBLFFBQUksU0FBUyxhQUFhLE9BQWIsRUFBc0IsR0FBdEIsQ0FBYjs7QUFFQSxhQUFTLE9BQVQsQ0FBa0IsSUFBbEIsRUFBd0I7QUFDdEIsVUFBSSxPQUFPLG1CQUFtQixJQUFuQixDQUFYO0FBQ0EsVUFBSSxJQUFKLEVBQVU7QUFDUixjQUFNLElBQU4sSUFBYyxJQUFkO0FBQ0Q7QUFDRjtBQUNELFlBQVEsVUFBUjtBQUNBLFlBQVEsU0FBUyxhQUFULENBQVI7O0FBRUEsUUFBSSxRQUFRLE9BQU8sSUFBUCxDQUFZLEtBQVosRUFBbUIsTUFBbkIsR0FBNEIsQ0FBeEM7O0FBRUEsUUFBSSxTQUFTO0FBQ1gsbUJBQWEsV0FERjtBQUVYLFlBQU0sSUFGSztBQUdYLGNBQVEsTUFIRztBQUlYLGFBQU8sS0FKSTtBQUtYLGFBQU87QUFMSSxLQUFiOztBQVFBLFdBQU8sT0FBUCxHQUFpQixhQUFhLE9BQWIsRUFBc0IsR0FBdEIsQ0FBakI7QUFDQSxXQUFPLFFBQVAsR0FBa0IsY0FBYyxRQUFkLEVBQXdCLEdBQXhCLENBQWxCO0FBQ0EsV0FBTyxVQUFQLEdBQW9CLGdCQUFnQixVQUFoQixFQUE0QixHQUE1QixDQUFwQjtBQUNBLFdBQU8sT0FBUCxHQUFpQixhQUFhLE9BQWIsRUFBc0IsR0FBdEIsQ0FBakI7QUFDQSxXQUFPLE1BQVA7QUFDRDs7QUFFRDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsV0FBUyxXQUFULENBQXNCLEdBQXRCLEVBQTJCLEtBQTNCLEVBQWtDLE9BQWxDLEVBQTJDO0FBQ3pDLFFBQUksU0FBUyxJQUFJLE1BQWpCO0FBQ0EsUUFBSSxVQUFVLE9BQU8sT0FBckI7O0FBRUEsUUFBSSxlQUFlLElBQUksS0FBSixFQUFuQjs7QUFFQSxXQUFPLElBQVAsQ0FBWSxPQUFaLEVBQXFCLE9BQXJCLENBQTZCLFVBQVUsSUFBVixFQUFnQjtBQUMzQyxZQUFNLElBQU4sQ0FBVyxPQUFYLEVBQW9CLE1BQU0sSUFBMUI7QUFDQSxVQUFJLE9BQU8sUUFBUSxJQUFSLENBQVg7QUFDQSxtQkFBYSxPQUFiLEVBQXNCLEdBQXRCLEVBQTJCLElBQTNCLEVBQWlDLEdBQWpDLEVBQXNDLEtBQUssTUFBTCxDQUFZLEdBQVosRUFBaUIsS0FBakIsQ0FBdEMsRUFBK0QsR0FBL0Q7QUFDRCxLQUpEOztBQU1BLFVBQU0sWUFBTjtBQUNEOztBQUVEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxXQUFTLG1CQUFULENBQThCLEdBQTlCLEVBQW1DLEtBQW5DLEVBQTBDLFdBQTFDLEVBQXVELFNBQXZELEVBQWtFO0FBQ2hFLFFBQUksU0FBUyxJQUFJLE1BQWpCOztBQUVBLFFBQUksS0FBSyxPQUFPLEVBQWhCO0FBQ0EsUUFBSSxvQkFBb0IsT0FBTyxXQUEvQjtBQUNBLFFBQUksZ0JBQUo7QUFDQSxRQUFJLGNBQUosRUFBb0I7QUFDbEIseUJBQW1CLE1BQU0sR0FBTixDQUFVLE9BQU8sVUFBakIsRUFBNkIscUJBQTdCLENBQW5CO0FBQ0Q7O0FBRUQsUUFBSSxZQUFZLElBQUksU0FBcEI7O0FBRUEsUUFBSSxlQUFlLFVBQVUsVUFBN0I7QUFDQSxRQUFJLGNBQWMsVUFBVSxVQUE1Qjs7QUFFQSxRQUFJLElBQUo7QUFDQSxRQUFJLFdBQUosRUFBaUI7QUFDZixhQUFPLFlBQVksTUFBWixDQUFtQixHQUFuQixFQUF3QixLQUF4QixDQUFQO0FBQ0QsS0FGRCxNQUVPO0FBQ0wsYUFBTyxNQUFNLEdBQU4sQ0FBVSxpQkFBVixFQUE2QixPQUE3QixDQUFQO0FBQ0Q7O0FBRUQsUUFBSSxDQUFDLFNBQUwsRUFBZ0I7QUFDZCxZQUFNLEtBQU4sRUFBYSxJQUFiLEVBQW1CLEtBQW5CLEVBQTBCLGlCQUExQixFQUE2QyxRQUE3QztBQUNEO0FBQ0QsVUFDRSxLQURGLEVBQ1MsSUFEVCxFQUNlLElBRGYsRUFFRSxFQUZGLEVBRU0sbUJBRk4sRUFFMkIsY0FGM0IsRUFFMkMsR0FGM0MsRUFFZ0QsSUFGaEQsRUFFc0QsZ0JBRnREO0FBR0EsUUFBSSxjQUFKLEVBQW9CO0FBQ2xCLFlBQU0sZ0JBQU4sRUFBd0Isb0JBQXhCLEVBQ0UsWUFERixFQUNnQixHQURoQixFQUNxQixJQURyQixFQUMyQiw2QkFEM0I7QUFFRDtBQUNELFVBQU0sUUFBTixFQUNFLEVBREYsRUFDTSxtQkFETixFQUMyQixjQUQzQixFQUMyQyxTQUQzQztBQUVBLFFBQUksY0FBSixFQUFvQjtBQUNsQixZQUFNLGdCQUFOLEVBQXdCLG9CQUF4QixFQUE4QyxXQUE5QyxFQUEyRCxJQUEzRDtBQUNEO0FBQ0QsVUFDRSxHQURGLEVBRUUsaUJBRkYsRUFFcUIsT0FGckIsRUFFOEIsSUFGOUIsRUFFb0MsR0FGcEM7QUFHQSxRQUFJLENBQUMsU0FBTCxFQUFnQjtBQUNkLFlBQU0sR0FBTjtBQUNEO0FBQ0Y7O0FBRUQsV0FBUyxhQUFULENBQXdCLEdBQXhCLEVBQTZCLEtBQTdCLEVBQW9DLElBQXBDLEVBQTBDO0FBQ3hDLFFBQUksU0FBUyxJQUFJLE1BQWpCOztBQUVBLFFBQUksS0FBSyxPQUFPLEVBQWhCOztBQUVBLFFBQUksZUFBZSxJQUFJLE9BQXZCO0FBQ0EsUUFBSSxZQUFZLElBQUksSUFBcEI7QUFDQSxRQUFJLGdCQUFnQixPQUFPLE9BQTNCO0FBQ0EsUUFBSSxhQUFhLE9BQU8sSUFBeEI7O0FBRUEsUUFBSSxRQUFRLElBQUksSUFBSixDQUFTLGFBQVQsRUFBd0IsUUFBeEIsQ0FBWjs7QUFFQSxtQkFBZSxPQUFmLENBQXVCLFVBQVUsSUFBVixFQUFnQjtBQUNyQyxVQUFJLFFBQVEsU0FBUyxJQUFULENBQVo7QUFDQSxVQUFJLFNBQVMsS0FBSyxLQUFsQixFQUF5QjtBQUN2QjtBQUNEOztBQUVELFVBQUksSUFBSixFQUFVLE9BQVY7QUFDQSxVQUFJLFNBQVMsU0FBYixFQUF3QjtBQUN0QixlQUFPLFVBQVUsS0FBVixDQUFQO0FBQ0Esa0JBQVUsYUFBYSxLQUFiLENBQVY7QUFDQSxZQUFJLFFBQVEsS0FBSyxhQUFhLEtBQWIsRUFBb0IsTUFBekIsRUFBaUMsVUFBVSxDQUFWLEVBQWE7QUFDeEQsaUJBQU8sTUFBTSxHQUFOLENBQVUsSUFBVixFQUFnQixHQUFoQixFQUFxQixDQUFyQixFQUF3QixHQUF4QixDQUFQO0FBQ0QsU0FGVyxDQUFaO0FBR0EsY0FBTSxJQUFJLElBQUosQ0FBUyxNQUFNLEdBQU4sQ0FBVSxVQUFVLENBQVYsRUFBYSxDQUFiLEVBQWdCO0FBQ3ZDLGlCQUFPLElBQUksS0FBSixHQUFZLE9BQVosR0FBc0IsR0FBdEIsR0FBNEIsQ0FBNUIsR0FBZ0MsR0FBdkM7QUFDRCxTQUZjLEVBRVosSUFGWSxDQUVQLElBRk8sQ0FBVCxFQUdILElBSEcsQ0FJRixFQUpFLEVBSUUsR0FKRixFQUlPLGFBQWEsS0FBYixDQUpQLEVBSTRCLEdBSjVCLEVBSWlDLEtBSmpDLEVBSXdDLElBSnhDLEVBS0YsTUFBTSxHQUFOLENBQVUsVUFBVSxDQUFWLEVBQWEsQ0FBYixFQUFnQjtBQUN4QixpQkFBTyxVQUFVLEdBQVYsR0FBZ0IsQ0FBaEIsR0FBb0IsSUFBcEIsR0FBMkIsQ0FBbEM7QUFDRCxTQUZELEVBRUcsSUFGSCxDQUVRLEdBRlIsQ0FMRSxFQU9ZLEdBUFosQ0FBTjtBQVFELE9BZEQsTUFjTztBQUNMLGVBQU8sTUFBTSxHQUFOLENBQVUsVUFBVixFQUFzQixHQUF0QixFQUEyQixLQUEzQixDQUFQO0FBQ0EsWUFBSSxPQUFPLElBQUksSUFBSixDQUFTLElBQVQsRUFBZSxLQUFmLEVBQXNCLGFBQXRCLEVBQXFDLEdBQXJDLEVBQTBDLEtBQTFDLENBQVg7QUFDQSxjQUFNLElBQU47QUFDQSxZQUFJLFNBQVMsUUFBYixFQUF1QjtBQUNyQixlQUNFLElBQUksSUFBSixDQUFTLElBQVQsRUFDSyxJQURMLENBQ1UsRUFEVixFQUNjLFVBRGQsRUFDMEIsU0FBUyxLQUFULENBRDFCLEVBQzJDLElBRDNDLEVBRUssSUFGTCxDQUVVLEVBRlYsRUFFYyxXQUZkLEVBRTJCLFNBQVMsS0FBVCxDQUYzQixFQUU0QyxJQUY1QyxDQURGLEVBSUUsYUFKRixFQUlpQixHQUpqQixFQUlzQixLQUp0QixFQUk2QixHQUo3QixFQUlrQyxJQUpsQyxFQUl3QyxHQUp4QztBQUtELFNBTkQsTUFNTztBQUNMLGVBQ0UsRUFERixFQUNNLEdBRE4sRUFDVyxhQUFhLEtBQWIsQ0FEWCxFQUNnQyxHQURoQyxFQUNxQyxJQURyQyxFQUMyQyxJQUQzQyxFQUVFLGFBRkYsRUFFaUIsR0FGakIsRUFFc0IsS0FGdEIsRUFFNkIsR0FGN0IsRUFFa0MsSUFGbEMsRUFFd0MsR0FGeEM7QUFHRDtBQUNGO0FBQ0YsS0FyQ0Q7QUFzQ0EsUUFBSSxPQUFPLElBQVAsQ0FBWSxLQUFLLEtBQWpCLEVBQXdCLE1BQXhCLEtBQW1DLENBQXZDLEVBQTBDO0FBQ3hDLFlBQU0sYUFBTixFQUFxQixlQUFyQjtBQUNEO0FBQ0QsVUFBTSxLQUFOO0FBQ0Q7O0FBRUQsV0FBUyxjQUFULENBQXlCLEdBQXpCLEVBQThCLEtBQTlCLEVBQXFDLE9BQXJDLEVBQThDLE1BQTlDLEVBQXNEO0FBQ3BELFFBQUksU0FBUyxJQUFJLE1BQWpCO0FBQ0EsUUFBSSxlQUFlLElBQUksT0FBdkI7QUFDQSxRQUFJLGdCQUFnQixPQUFPLE9BQTNCO0FBQ0EsUUFBSSxLQUFLLE9BQU8sRUFBaEI7QUFDQSxjQUFVLE9BQU8sSUFBUCxDQUFZLE9BQVosQ0FBVixFQUFnQyxPQUFoQyxDQUF3QyxVQUFVLEtBQVYsRUFBaUI7QUFDdkQsVUFBSSxPQUFPLFFBQVEsS0FBUixDQUFYO0FBQ0EsVUFBSSxVQUFVLENBQUMsT0FBTyxJQUFQLENBQWYsRUFBNkI7QUFDM0I7QUFDRDtBQUNELFVBQUksV0FBVyxLQUFLLE1BQUwsQ0FBWSxHQUFaLEVBQWlCLEtBQWpCLENBQWY7QUFDQSxVQUFJLFNBQVMsS0FBVCxDQUFKLEVBQXFCO0FBQ25CLFlBQUksT0FBTyxTQUFTLEtBQVQsQ0FBWDtBQUNBLFlBQUksU0FBUyxJQUFULENBQUosRUFBb0I7QUFDbEIsY0FBSSxRQUFKLEVBQWM7QUFDWixrQkFBTSxFQUFOLEVBQVUsVUFBVixFQUFzQixJQUF0QixFQUE0QixJQUE1QjtBQUNELFdBRkQsTUFFTztBQUNMLGtCQUFNLEVBQU4sRUFBVSxXQUFWLEVBQXVCLElBQXZCLEVBQTZCLElBQTdCO0FBQ0Q7QUFDRixTQU5ELE1BTU87QUFDTCxnQkFBTSxJQUFJLElBQUosQ0FBUyxRQUFULEVBQ0gsSUFERyxDQUNFLEVBREYsRUFDTSxVQUROLEVBQ2tCLElBRGxCLEVBQ3dCLElBRHhCLEVBRUgsSUFGRyxDQUVFLEVBRkYsRUFFTSxXQUZOLEVBRW1CLElBRm5CLEVBRXlCLElBRnpCLENBQU47QUFHRDtBQUNELGNBQU0sYUFBTixFQUFxQixHQUFyQixFQUEwQixLQUExQixFQUFpQyxHQUFqQyxFQUFzQyxRQUF0QyxFQUFnRCxHQUFoRDtBQUNELE9BZEQsTUFjTyxJQUFJLFlBQVksUUFBWixDQUFKLEVBQTJCO0FBQ2hDLFlBQUksVUFBVSxhQUFhLEtBQWIsQ0FBZDtBQUNBLGNBQ0UsRUFERixFQUNNLEdBRE4sRUFDVyxhQUFhLEtBQWIsQ0FEWCxFQUNnQyxHQURoQyxFQUNxQyxRQURyQyxFQUMrQyxJQUQvQyxFQUVFLFNBQVMsR0FBVCxDQUFhLFVBQVUsQ0FBVixFQUFhLENBQWIsRUFBZ0I7QUFDM0IsaUJBQU8sVUFBVSxHQUFWLEdBQWdCLENBQWhCLEdBQW9CLElBQXBCLEdBQTJCLENBQWxDO0FBQ0QsU0FGRCxFQUVHLElBRkgsQ0FFUSxHQUZSLENBRkYsRUFJZ0IsR0FKaEI7QUFLRCxPQVBNLE1BT0E7QUFDTCxjQUNFLEVBREYsRUFDTSxHQUROLEVBQ1csYUFBYSxLQUFiLENBRFgsRUFDZ0MsR0FEaEMsRUFDcUMsUUFEckMsRUFDK0MsSUFEL0MsRUFFRSxhQUZGLEVBRWlCLEdBRmpCLEVBRXNCLEtBRnRCLEVBRTZCLEdBRjdCLEVBRWtDLFFBRmxDLEVBRTRDLEdBRjVDO0FBR0Q7QUFDRixLQWhDRDtBQWlDRDs7QUFFRCxXQUFTLGdCQUFULENBQTJCLEdBQTNCLEVBQWdDLEtBQWhDLEVBQXVDO0FBQ3JDLFFBQUksYUFBSixFQUFtQjtBQUNqQixVQUFJLFVBQUosR0FBaUIsTUFBTSxHQUFOLENBQ2YsSUFBSSxNQUFKLENBQVcsVUFESSxFQUNRLHlCQURSLENBQWpCO0FBRUQ7QUFDRjs7QUFFRCxXQUFTLFdBQVQsQ0FBc0IsR0FBdEIsRUFBMkIsS0FBM0IsRUFBa0MsSUFBbEMsRUFBd0MsUUFBeEMsRUFBa0QsZ0JBQWxELEVBQW9FO0FBQ2xFLFFBQUksU0FBUyxJQUFJLE1BQWpCO0FBQ0EsUUFBSSxRQUFRLElBQUksS0FBaEI7QUFDQSxRQUFJLGdCQUFnQixPQUFPLE9BQTNCO0FBQ0EsUUFBSSxRQUFRLE9BQU8sS0FBbkI7QUFDQSxRQUFJLGFBQWEsS0FBSyxPQUF0Qjs7QUFFQSxhQUFTLFdBQVQsR0FBd0I7QUFDdEIsVUFBSSxPQUFPLFdBQVAsS0FBdUIsV0FBM0IsRUFBd0M7QUFDdEMsZUFBTyxZQUFQO0FBQ0QsT0FGRCxNQUVPO0FBQ0wsZUFBTyxtQkFBUDtBQUNEO0FBQ0Y7O0FBRUQsUUFBSSxTQUFKLEVBQWUsYUFBZjtBQUNBLGFBQVMsZ0JBQVQsQ0FBMkIsS0FBM0IsRUFBa0M7QUFDaEMsa0JBQVksTUFBTSxHQUFOLEVBQVo7QUFDQSxZQUFNLFNBQU4sRUFBaUIsR0FBakIsRUFBc0IsYUFBdEIsRUFBcUMsR0FBckM7QUFDQSxVQUFJLE9BQU8sZ0JBQVAsS0FBNEIsUUFBaEMsRUFBMEM7QUFDeEMsY0FBTSxLQUFOLEVBQWEsVUFBYixFQUF5QixnQkFBekIsRUFBMkMsR0FBM0M7QUFDRCxPQUZELE1BRU87QUFDTCxjQUFNLEtBQU4sRUFBYSxXQUFiO0FBQ0Q7QUFDRCxVQUFJLEtBQUosRUFBVztBQUNULFlBQUksUUFBSixFQUFjO0FBQ1osMEJBQWdCLE1BQU0sR0FBTixFQUFoQjtBQUNBLGdCQUFNLGFBQU4sRUFBcUIsR0FBckIsRUFBMEIsS0FBMUIsRUFBaUMsMEJBQWpDO0FBQ0QsU0FIRCxNQUdPO0FBQ0wsZ0JBQU0sS0FBTixFQUFhLGNBQWIsRUFBNkIsS0FBN0IsRUFBb0MsSUFBcEM7QUFDRDtBQUNGO0FBQ0Y7O0FBRUQsYUFBUyxjQUFULENBQXlCLEtBQXpCLEVBQWdDO0FBQzlCLFlBQU0sS0FBTixFQUFhLFlBQWIsRUFBMkIsYUFBM0IsRUFBMEMsR0FBMUMsRUFBK0MsU0FBL0MsRUFBMEQsR0FBMUQ7QUFDQSxVQUFJLEtBQUosRUFBVztBQUNULFlBQUksUUFBSixFQUFjO0FBQ1osZ0JBQU0sS0FBTixFQUFhLGtCQUFiLEVBQ0UsYUFERixFQUNpQixHQURqQixFQUVFLEtBRkYsRUFFUywwQkFGVCxFQUdFLEtBSEYsRUFHUyxJQUhUO0FBSUQsU0FMRCxNQUtPO0FBQ0wsZ0JBQU0sS0FBTixFQUFhLGNBQWI7QUFDRDtBQUNGO0FBQ0Y7O0FBRUQsYUFBUyxZQUFULENBQXVCLEtBQXZCLEVBQThCO0FBQzVCLFVBQUksT0FBTyxNQUFNLEdBQU4sQ0FBVSxhQUFWLEVBQXlCLFVBQXpCLENBQVg7QUFDQSxZQUFNLGFBQU4sRUFBcUIsV0FBckIsRUFBa0MsS0FBbEMsRUFBeUMsR0FBekM7QUFDQSxZQUFNLElBQU4sQ0FBVyxhQUFYLEVBQTBCLFdBQTFCLEVBQXVDLElBQXZDLEVBQTZDLEdBQTdDO0FBQ0Q7O0FBRUQsUUFBSSxXQUFKO0FBQ0EsUUFBSSxVQUFKLEVBQWdCO0FBQ2QsVUFBSSxTQUFTLFVBQVQsQ0FBSixFQUEwQjtBQUN4QixZQUFJLFdBQVcsTUFBZixFQUF1QjtBQUNyQiwyQkFBaUIsS0FBakI7QUFDQSx5QkFBZSxNQUFNLElBQXJCO0FBQ0EsdUJBQWEsTUFBYjtBQUNELFNBSkQsTUFJTztBQUNMLHVCQUFhLE9BQWI7QUFDRDtBQUNEO0FBQ0Q7QUFDRCxvQkFBYyxXQUFXLE1BQVgsQ0FBa0IsR0FBbEIsRUFBdUIsS0FBdkIsQ0FBZDtBQUNBLG1CQUFhLFdBQWI7QUFDRCxLQWJELE1BYU87QUFDTCxvQkFBYyxNQUFNLEdBQU4sQ0FBVSxhQUFWLEVBQXlCLFVBQXpCLENBQWQ7QUFDRDs7QUFFRCxRQUFJLFFBQVEsSUFBSSxLQUFKLEVBQVo7QUFDQSxxQkFBaUIsS0FBakI7QUFDQSxVQUFNLEtBQU4sRUFBYSxXQUFiLEVBQTBCLElBQTFCLEVBQWdDLEtBQWhDLEVBQXVDLEdBQXZDO0FBQ0EsUUFBSSxNQUFNLElBQUksS0FBSixFQUFWO0FBQ0EsbUJBQWUsR0FBZjtBQUNBLFVBQU0sSUFBTixDQUFXLEtBQVgsRUFBa0IsV0FBbEIsRUFBK0IsSUFBL0IsRUFBcUMsR0FBckMsRUFBMEMsR0FBMUM7QUFDRDs7QUFFRCxXQUFTLGNBQVQsQ0FBeUIsR0FBekIsRUFBOEIsS0FBOUIsRUFBcUMsSUFBckMsRUFBMkMsVUFBM0MsRUFBdUQsTUFBdkQsRUFBK0Q7QUFDN0QsUUFBSSxTQUFTLElBQUksTUFBakI7O0FBRUEsYUFBUyxVQUFULENBQXFCLENBQXJCLEVBQXdCO0FBQ3RCLGNBQVEsQ0FBUjtBQUNFLGFBQUssYUFBTDtBQUNBLGFBQUssV0FBTDtBQUNBLGFBQUssWUFBTDtBQUNFLGlCQUFPLENBQVA7QUFDRixhQUFLLGFBQUw7QUFDQSxhQUFLLFdBQUw7QUFDQSxhQUFLLFlBQUw7QUFDRSxpQkFBTyxDQUFQO0FBQ0YsYUFBSyxhQUFMO0FBQ0EsYUFBSyxXQUFMO0FBQ0EsYUFBSyxZQUFMO0FBQ0UsaUJBQU8sQ0FBUDtBQUNGO0FBQ0UsaUJBQU8sQ0FBUDtBQWRKO0FBZ0JEOztBQUVELGFBQVMsaUJBQVQsQ0FBNEIsU0FBNUIsRUFBdUMsSUFBdkMsRUFBNkMsTUFBN0MsRUFBcUQ7QUFDbkQsVUFBSSxLQUFLLE9BQU8sRUFBaEI7O0FBRUEsVUFBSSxXQUFXLE1BQU0sR0FBTixDQUFVLFNBQVYsRUFBcUIsV0FBckIsQ0FBZjtBQUNBLFVBQUksVUFBVSxNQUFNLEdBQU4sQ0FBVSxPQUFPLFVBQWpCLEVBQTZCLEdBQTdCLEVBQWtDLFFBQWxDLEVBQTRDLEdBQTVDLENBQWQ7O0FBRUEsVUFBSSxRQUFRLE9BQU8sS0FBbkI7QUFDQSxVQUFJLFNBQVMsT0FBTyxNQUFwQjtBQUNBLFVBQUksbUJBQW1CLENBQ3JCLE9BQU8sQ0FEYyxFQUVyQixPQUFPLENBRmMsRUFHckIsT0FBTyxDQUhjLEVBSXJCLE9BQU8sQ0FKYyxDQUF2Qjs7QUFPQSxVQUFJLGNBQWMsQ0FDaEIsUUFEZ0IsRUFFaEIsWUFGZ0IsRUFHaEIsUUFIZ0IsRUFJaEIsUUFKZ0IsQ0FBbEI7O0FBT0EsZUFBUyxVQUFULEdBQXVCO0FBQ3JCLGNBQ0UsTUFERixFQUNVLE9BRFYsRUFDbUIsV0FEbkIsRUFFRSxFQUZGLEVBRU0sMkJBRk4sRUFFbUMsUUFGbkMsRUFFNkMsS0FGN0M7O0FBSUEsWUFBSSxPQUFPLE9BQU8sSUFBbEI7QUFDQSxZQUFJLElBQUo7QUFDQSxZQUFJLENBQUMsT0FBTyxJQUFaLEVBQWtCO0FBQ2hCLGlCQUFPLElBQVA7QUFDRCxTQUZELE1BRU87QUFDTCxpQkFBTyxNQUFNLEdBQU4sQ0FBVSxPQUFPLElBQWpCLEVBQXVCLElBQXZCLEVBQTZCLElBQTdCLENBQVA7QUFDRDs7QUFFRCxjQUFNLEtBQU4sRUFDRSxPQURGLEVBQ1csVUFEWCxFQUN1QixJQUR2QixFQUM2QixJQUQ3QixFQUVFLE9BRkYsRUFFVyxVQUZYLEVBRXVCLElBRnZCLEVBRTZCLElBRjdCLEVBR0UsWUFBWSxHQUFaLENBQWdCLFVBQVUsR0FBVixFQUFlO0FBQzdCLGlCQUFPLFVBQVUsR0FBVixHQUFnQixHQUFoQixHQUFzQixLQUF0QixHQUE4QixPQUFPLEdBQVAsQ0FBckM7QUFDRCxTQUZELEVBRUcsSUFGSCxDQUVRLElBRlIsQ0FIRixFQU1FLElBTkYsRUFPRSxFQVBGLEVBT00sY0FQTixFQU9zQixlQVB0QixFQU91QyxHQVB2QyxFQU80QyxNQVA1QyxFQU9vRCxXQVBwRCxFQVFFLEVBUkYsRUFRTSx1QkFSTixFQVErQixDQUMzQixRQUQyQixFQUUzQixJQUYyQixFQUczQixJQUgyQixFQUkzQixPQUFPLFVBSm9CLEVBSzNCLE9BQU8sTUFMb0IsRUFNM0IsT0FBTyxNQU5vQixDQVIvQixFQWVLLElBZkwsRUFnQkUsT0FoQkYsRUFnQlcsUUFoQlgsRUFnQnFCLElBaEJyQixFQWdCMkIsR0FoQjNCLEVBaUJFLE9BakJGLEVBaUJXLFFBakJYLEVBaUJxQixJQWpCckIsRUFpQjJCLEdBakIzQixFQWtCRSxZQUFZLEdBQVosQ0FBZ0IsVUFBVSxHQUFWLEVBQWU7QUFDN0IsaUJBQU8sVUFBVSxHQUFWLEdBQWdCLEdBQWhCLEdBQXNCLEdBQXRCLEdBQTRCLE9BQU8sR0FBUCxDQUE1QixHQUEwQyxHQUFqRDtBQUNELFNBRkQsRUFFRyxJQUZILENBRVEsRUFGUixDQWxCRixFQXFCRSxHQXJCRjs7QUF1QkEsWUFBSSxhQUFKLEVBQW1CO0FBQ2pCLGNBQUksVUFBVSxPQUFPLE9BQXJCO0FBQ0EsZ0JBQ0UsS0FERixFQUNTLE9BRFQsRUFDa0IsYUFEbEIsRUFDaUMsT0FEakMsRUFDMEMsSUFEMUMsRUFFRSxJQUFJLFVBRk4sRUFFa0IsNEJBRmxCLEVBRWdELENBQUMsUUFBRCxFQUFXLE9BQVgsQ0FGaEQsRUFFcUUsSUFGckUsRUFHRSxPQUhGLEVBR1csV0FIWCxFQUd3QixPQUh4QixFQUdpQyxJQUhqQztBQUlEO0FBQ0Y7O0FBRUQsZUFBUyxZQUFULEdBQXlCO0FBQ3ZCLGNBQ0UsS0FERixFQUNTLE9BRFQsRUFDa0IsV0FEbEIsRUFFRSxFQUZGLEVBRU0sNEJBRk4sRUFFb0MsUUFGcEMsRUFFOEMsSUFGOUMsRUFHRSxNQUhGLEVBR1UsZ0JBQWdCLEdBQWhCLENBQW9CLFVBQVUsQ0FBVixFQUFhLENBQWIsRUFBZ0I7QUFDMUMsaUJBQU8sVUFBVSxHQUFWLEdBQWdCLENBQWhCLEdBQW9CLEtBQXBCLEdBQTRCLGlCQUFpQixDQUFqQixDQUFuQztBQUNELFNBRk8sRUFFTCxJQUZLLENBRUEsSUFGQSxDQUhWLEVBS2lCLElBTGpCLEVBTUUsRUFORixFQU1NLGtCQU5OLEVBTTBCLFFBTjFCLEVBTW9DLEdBTnBDLEVBTXlDLGdCQU56QyxFQU0yRCxJQU4zRCxFQU9FLGdCQUFnQixHQUFoQixDQUFvQixVQUFVLENBQVYsRUFBYSxDQUFiLEVBQWdCO0FBQ2xDLGlCQUFPLFVBQVUsR0FBVixHQUFnQixDQUFoQixHQUFvQixHQUFwQixHQUEwQixpQkFBaUIsQ0FBakIsQ0FBMUIsR0FBZ0QsR0FBdkQ7QUFDRCxTQUZELEVBRUcsSUFGSCxDQUVRLEVBRlIsQ0FQRixFQVVFLEdBVkY7QUFXRDs7QUFFRCxVQUFJLFVBQVUsb0JBQWQsRUFBb0M7QUFDbEM7QUFDRCxPQUZELE1BRU8sSUFBSSxVQUFVLHFCQUFkLEVBQXFDO0FBQzFDO0FBQ0QsT0FGTSxNQUVBO0FBQ0wsY0FBTSxLQUFOLEVBQWEsS0FBYixFQUFvQixLQUFwQixFQUEyQixvQkFBM0IsRUFBaUQsSUFBakQ7QUFDQTtBQUNBLGNBQU0sUUFBTjtBQUNBO0FBQ0EsY0FBTSxHQUFOO0FBQ0Q7QUFDRjs7QUFFRCxlQUFXLE9BQVgsQ0FBbUIsVUFBVSxTQUFWLEVBQXFCO0FBQ3RDLFVBQUksT0FBTyxVQUFVLElBQXJCO0FBQ0EsVUFBSSxNQUFNLEtBQUssVUFBTCxDQUFnQixJQUFoQixDQUFWO0FBQ0EsVUFBSSxNQUFKO0FBQ0EsVUFBSSxHQUFKLEVBQVM7QUFDUCxZQUFJLENBQUMsT0FBTyxHQUFQLENBQUwsRUFBa0I7QUFDaEI7QUFDRDtBQUNELGlCQUFTLElBQUksTUFBSixDQUFXLEdBQVgsRUFBZ0IsS0FBaEIsQ0FBVDtBQUNELE9BTEQsTUFLTztBQUNMLFlBQUksQ0FBQyxPQUFPLFVBQVAsQ0FBTCxFQUF5QjtBQUN2QjtBQUNEO0FBQ0QsWUFBSSxjQUFjLElBQUksV0FBSixDQUFnQixJQUFoQixDQUFsQjs7QUFFQSxpQkFBUyxFQUFUO0FBQ0EsZUFBTyxJQUFQLENBQVksSUFBSSxlQUFKLEVBQVosRUFBbUMsT0FBbkMsQ0FBMkMsVUFBVSxHQUFWLEVBQWU7QUFDeEQsaUJBQU8sR0FBUCxJQUFjLE1BQU0sR0FBTixDQUFVLFdBQVYsRUFBdUIsR0FBdkIsRUFBNEIsR0FBNUIsQ0FBZDtBQUNELFNBRkQ7QUFHRDtBQUNELHdCQUNFLElBQUksSUFBSixDQUFTLFNBQVQsQ0FERixFQUN1QixXQUFXLFVBQVUsSUFBVixDQUFlLElBQTFCLENBRHZCLEVBQ3dELE1BRHhEO0FBRUQsS0F0QkQ7QUF1QkQ7O0FBRUQsV0FBUyxZQUFULENBQXVCLEdBQXZCLEVBQTRCLEtBQTVCLEVBQW1DLElBQW5DLEVBQXlDLFFBQXpDLEVBQW1ELE1BQW5ELEVBQTJEO0FBQ3pELFFBQUksU0FBUyxJQUFJLE1BQWpCO0FBQ0EsUUFBSSxLQUFLLE9BQU8sRUFBaEI7O0FBRUEsUUFBSSxLQUFKO0FBQ0EsU0FBSyxJQUFJLElBQUksQ0FBYixFQUFnQixJQUFJLFNBQVMsTUFBN0IsRUFBcUMsRUFBRSxDQUF2QyxFQUEwQztBQUN4QyxVQUFJLFVBQVUsU0FBUyxDQUFULENBQWQ7QUFDQSxVQUFJLE9BQU8sUUFBUSxJQUFuQjtBQUNBLFVBQUksT0FBTyxRQUFRLElBQVIsQ0FBYSxJQUF4QjtBQUNBLFVBQUksTUFBTSxLQUFLLFFBQUwsQ0FBYyxJQUFkLENBQVY7QUFDQSxVQUFJLFVBQVUsSUFBSSxJQUFKLENBQVMsT0FBVCxDQUFkO0FBQ0EsVUFBSSxXQUFXLFVBQVUsV0FBekI7O0FBRUEsVUFBSSxLQUFKO0FBQ0EsVUFBSSxHQUFKLEVBQVM7QUFDUCxZQUFJLENBQUMsT0FBTyxHQUFQLENBQUwsRUFBa0I7QUFDaEI7QUFDRDtBQUNELFlBQUksU0FBUyxHQUFULENBQUosRUFBbUI7QUFDakIsY0FBSSxRQUFRLElBQUksS0FBaEI7O0FBRUEsY0FBSSxTQUFTLGFBQVQsSUFBMEIsU0FBUyxlQUF2QyxFQUF3RDs7QUFFdEQsZ0JBQUksWUFBWSxJQUFJLElBQUosQ0FBUyxNQUFNLFFBQU4sSUFBa0IsTUFBTSxLQUFOLENBQVksQ0FBWixFQUFlLFFBQTFDLENBQWhCO0FBQ0Esa0JBQU0sRUFBTixFQUFVLGFBQVYsRUFBeUIsUUFBekIsRUFBbUMsR0FBbkMsRUFBd0MsWUFBWSxXQUFwRDtBQUNBLGtCQUFNLElBQU4sQ0FBVyxTQUFYLEVBQXNCLFlBQXRCO0FBQ0QsV0FMRCxNQUtPLElBQ0wsU0FBUyxhQUFULElBQ0EsU0FBUyxhQURULElBRUEsU0FBUyxhQUhKLEVBR21COztBQUV4QixnQkFBSSxZQUFZLElBQUksTUFBSixDQUFXLEdBQVgsQ0FBZSx1QkFDN0IsTUFBTSxTQUFOLENBQWdCLEtBQWhCLENBQXNCLElBQXRCLENBQTJCLEtBQTNCLENBRDZCLEdBQ08sSUFEdEIsQ0FBaEI7QUFFQSxnQkFBSSxNQUFNLENBQVY7QUFDQSxnQkFBSSxTQUFTLGFBQWIsRUFBNEI7QUFDMUIsb0JBQU0sQ0FBTjtBQUNELGFBRkQsTUFFTyxJQUFJLFNBQVMsYUFBYixFQUE0QjtBQUNqQyxvQkFBTSxDQUFOO0FBQ0Q7QUFDRCxrQkFDRSxFQURGLEVBQ00sZ0JBRE4sRUFDd0IsR0FEeEIsRUFDNkIsS0FEN0IsRUFFRSxRQUZGLEVBRVksU0FGWixFQUV1QixTQUZ2QixFQUVrQyxJQUZsQztBQUdELFdBaEJNLE1BZ0JBO0FBQ0wsb0JBQVEsSUFBUjtBQUNFLG1CQUFLLFFBQUw7O0FBRUUsd0JBQVEsSUFBUjtBQUNBO0FBQ0YsbUJBQUssYUFBTDs7QUFFRSx3QkFBUSxJQUFSO0FBQ0E7QUFDRixtQkFBSyxhQUFMOztBQUVFLHdCQUFRLElBQVI7QUFDQTtBQUNGLG1CQUFLLGFBQUw7O0FBRUUsd0JBQVEsSUFBUjtBQUNBO0FBQ0YsbUJBQUssT0FBTDs7QUFFRSx3QkFBUSxJQUFSO0FBQ0E7QUFDRixtQkFBSyxNQUFMOztBQUVFLHdCQUFRLElBQVI7QUFDQTtBQUNGLG1CQUFLLFlBQUw7O0FBRUUsd0JBQVEsSUFBUjtBQUNBO0FBQ0YsbUJBQUssV0FBTDs7QUFFRSx3QkFBUSxJQUFSO0FBQ0E7QUFDRixtQkFBSyxZQUFMOztBQUVFLHdCQUFRLElBQVI7QUFDQTtBQUNGLG1CQUFLLFdBQUw7O0FBRUUsd0JBQVEsSUFBUjtBQUNBO0FBQ0YsbUJBQUssWUFBTDs7QUFFRSx3QkFBUSxJQUFSO0FBQ0E7QUFDRixtQkFBSyxXQUFMOztBQUVFLHdCQUFRLElBQVI7QUFDQTtBQWhESjtBQWtEQSxrQkFBTSxFQUFOLEVBQVUsVUFBVixFQUFzQixLQUF0QixFQUE2QixHQUE3QixFQUFrQyxRQUFsQyxFQUE0QyxHQUE1QyxFQUNFLFlBQVksS0FBWixJQUFxQixNQUFNLFNBQU4sQ0FBZ0IsS0FBaEIsQ0FBc0IsSUFBdEIsQ0FBMkIsS0FBM0IsQ0FBckIsR0FBeUQsS0FEM0QsRUFFRSxJQUZGO0FBR0Q7QUFDRDtBQUNELFNBaEZELE1BZ0ZPO0FBQ0wsa0JBQVEsSUFBSSxNQUFKLENBQVcsR0FBWCxFQUFnQixLQUFoQixDQUFSO0FBQ0Q7QUFDRixPQXZGRCxNQXVGTztBQUNMLFlBQUksQ0FBQyxPQUFPLFVBQVAsQ0FBTCxFQUF5QjtBQUN2QjtBQUNEO0FBQ0QsZ0JBQVEsTUFBTSxHQUFOLENBQVUsT0FBTyxRQUFqQixFQUEyQixHQUEzQixFQUFnQyxZQUFZLEVBQVosQ0FBZSxJQUFmLENBQWhDLEVBQXNELEdBQXRELENBQVI7QUFDRDs7QUFFRCxVQUFJLFNBQVMsYUFBYixFQUE0QjtBQUMxQixjQUNFLEtBREYsRUFDUyxLQURULEVBQ2dCLElBRGhCLEVBQ3NCLEtBRHRCLEVBQzZCLDhCQUQ3QixFQUVFLEtBRkYsRUFFUyxHQUZULEVBRWMsS0FGZCxFQUVxQixZQUZyQixFQUdFLEdBSEY7QUFJRCxPQUxELE1BS08sSUFBSSxTQUFTLGVBQWIsRUFBOEI7QUFDbkMsY0FDRSxLQURGLEVBQ1MsS0FEVCxFQUNnQixJQURoQixFQUNzQixLQUR0QixFQUM2QixrQ0FEN0IsRUFFRSxLQUZGLEVBRVMsR0FGVCxFQUVjLEtBRmQsRUFFcUIsWUFGckIsRUFHRSxHQUhGO0FBSUQ7O0FBRUQ7OztBQUdBLFVBQUksU0FBUyxDQUFiO0FBQ0EsY0FBUSxJQUFSO0FBQ0UsYUFBSyxhQUFMO0FBQ0EsYUFBSyxlQUFMO0FBQ0UsY0FBSSxNQUFNLE1BQU0sR0FBTixDQUFVLEtBQVYsRUFBaUIsV0FBakIsQ0FBVjtBQUNBLGdCQUFNLEVBQU4sRUFBVSxhQUFWLEVBQXlCLFFBQXpCLEVBQW1DLEdBQW5DLEVBQXdDLEdBQXhDLEVBQTZDLFdBQTdDO0FBQ0EsZ0JBQU0sSUFBTixDQUFXLEdBQVgsRUFBZ0IsWUFBaEI7QUFDQTs7QUFFRixhQUFLLE1BQUw7QUFDQSxhQUFLLE9BQUw7QUFDRSxrQkFBUSxJQUFSO0FBQ0E7O0FBRUYsYUFBSyxXQUFMO0FBQ0EsYUFBSyxZQUFMO0FBQ0Usa0JBQVEsSUFBUjtBQUNBLG1CQUFTLENBQVQ7QUFDQTs7QUFFRixhQUFLLFdBQUw7QUFDQSxhQUFLLFlBQUw7QUFDRSxrQkFBUSxJQUFSO0FBQ0EsbUJBQVMsQ0FBVDtBQUNBOztBQUVGLGFBQUssV0FBTDtBQUNBLGFBQUssWUFBTDtBQUNFLGtCQUFRLElBQVI7QUFDQSxtQkFBUyxDQUFUO0FBQ0E7O0FBRUYsYUFBSyxRQUFMO0FBQ0Usa0JBQVEsSUFBUjtBQUNBOztBQUVGLGFBQUssYUFBTDtBQUNFLGtCQUFRLElBQVI7QUFDQSxtQkFBUyxDQUFUO0FBQ0E7O0FBRUYsYUFBSyxhQUFMO0FBQ0Usa0JBQVEsSUFBUjtBQUNBLG1CQUFTLENBQVQ7QUFDQTs7QUFFRixhQUFLLGFBQUw7QUFDRSxrQkFBUSxJQUFSO0FBQ0EsbUJBQVMsQ0FBVDtBQUNBOztBQUVGLGFBQUssYUFBTDtBQUNFLGtCQUFRLFdBQVI7QUFDQTs7QUFFRixhQUFLLGFBQUw7QUFDRSxrQkFBUSxXQUFSO0FBQ0E7O0FBRUYsYUFBSyxhQUFMO0FBQ0Usa0JBQVEsV0FBUjtBQUNBO0FBNURKOztBQStEQSxZQUFNLEVBQU4sRUFBVSxVQUFWLEVBQXNCLEtBQXRCLEVBQTZCLEdBQTdCLEVBQWtDLFFBQWxDLEVBQTRDLEdBQTVDO0FBQ0EsVUFBSSxNQUFNLE1BQU4sQ0FBYSxDQUFiLE1BQW9CLEdBQXhCLEVBQTZCO0FBQzNCLFlBQUksVUFBVSxLQUFLLEdBQUwsQ0FBUyxPQUFPLGFBQVAsR0FBdUIsQ0FBaEMsRUFBbUMsQ0FBbkMsQ0FBZDtBQUNBLFlBQUksVUFBVSxJQUFJLE1BQUosQ0FBVyxHQUFYLENBQWUsbUJBQWYsRUFBb0MsT0FBcEMsRUFBNkMsR0FBN0MsQ0FBZDtBQUNBLGNBQ0UsdUJBREYsRUFDMkIsS0FEM0IsRUFDa0MsS0FEbEMsRUFDeUMsS0FEekMsRUFDZ0QsNEJBRGhELEVBQzhFLEtBRDlFLEVBQ3FGLElBRHJGLEVBRUUsS0FBSyxPQUFMLEVBQWMsVUFBVSxDQUFWLEVBQWE7QUFDekIsaUJBQU8sVUFBVSxHQUFWLEdBQWdCLENBQWhCLEdBQW9CLElBQXBCLEdBQTJCLEtBQTNCLEdBQW1DLEdBQW5DLEdBQXlDLENBQXpDLEdBQTZDLEdBQXBEO0FBQ0QsU0FGRCxDQUZGLEVBSU0sR0FKTixFQUlXLE9BSlgsRUFJb0IsR0FKcEI7QUFLRCxPQVJELE1BUU8sSUFBSSxTQUFTLENBQWIsRUFBZ0I7QUFDckIsY0FBTSxLQUFLLE1BQUwsRUFBYSxVQUFVLENBQVYsRUFBYTtBQUM5QixpQkFBTyxRQUFRLEdBQVIsR0FBYyxDQUFkLEdBQWtCLEdBQXpCO0FBQ0QsU0FGSyxDQUFOO0FBR0QsT0FKTSxNQUlBO0FBQ0wsY0FBTSxLQUFOO0FBQ0Q7QUFDRCxZQUFNLElBQU47QUFDRDtBQUNGOztBQUVELFdBQVMsUUFBVCxDQUFtQixHQUFuQixFQUF3QixLQUF4QixFQUErQixLQUEvQixFQUFzQyxJQUF0QyxFQUE0QztBQUMxQyxRQUFJLFNBQVMsSUFBSSxNQUFqQjtBQUNBLFFBQUksS0FBSyxPQUFPLEVBQWhCO0FBQ0EsUUFBSSxhQUFhLE9BQU8sSUFBeEI7O0FBRUEsUUFBSSxjQUFjLEtBQUssSUFBdkI7O0FBRUEsYUFBUyxZQUFULEdBQXlCO0FBQ3ZCLFVBQUksT0FBTyxZQUFZLFFBQXZCO0FBQ0EsVUFBSSxRQUFKO0FBQ0EsVUFBSSxRQUFRLEtBQVo7QUFDQSxVQUFJLElBQUosRUFBVTtBQUNSLFlBQUssS0FBSyxVQUFMLElBQW1CLEtBQUssY0FBekIsSUFBNEMsS0FBSyxPQUFyRCxFQUE4RDtBQUM1RCxrQkFBUSxLQUFSO0FBQ0Q7QUFDRCxtQkFBVyxLQUFLLE1BQUwsQ0FBWSxHQUFaLEVBQWlCLEtBQWpCLENBQVg7QUFDRCxPQUxELE1BS087QUFDTCxtQkFBVyxNQUFNLEdBQU4sQ0FBVSxVQUFWLEVBQXNCLEdBQXRCLEVBQTJCLFVBQTNCLENBQVg7QUFDRDtBQUNELFVBQUksUUFBSixFQUFjO0FBQ1osY0FDRSxRQUFRLFFBQVIsR0FBbUIsR0FBbkIsR0FDQSxFQURBLEdBQ0ssY0FETCxHQUNzQix1QkFEdEIsR0FDZ0QsR0FEaEQsR0FDc0QsUUFEdEQsR0FDaUUsa0JBRm5FO0FBR0Q7QUFDRCxhQUFPLFFBQVA7QUFDRDs7QUFFRCxhQUFTLFNBQVQsR0FBc0I7QUFDcEIsVUFBSSxPQUFPLFlBQVksS0FBdkI7QUFDQSxVQUFJLEtBQUo7QUFDQSxVQUFJLFFBQVEsS0FBWjtBQUNBLFVBQUksSUFBSixFQUFVO0FBQ1IsWUFBSyxLQUFLLFVBQUwsSUFBbUIsS0FBSyxjQUF6QixJQUE0QyxLQUFLLE9BQXJELEVBQThEO0FBQzVELGtCQUFRLEtBQVI7QUFDRDtBQUNELGdCQUFRLEtBQUssTUFBTCxDQUFZLEdBQVosRUFBaUIsS0FBakIsQ0FBUjtBQUVELE9BTkQsTUFNTztBQUNMLGdCQUFRLE1BQU0sR0FBTixDQUFVLFVBQVYsRUFBc0IsR0FBdEIsRUFBMkIsT0FBM0IsQ0FBUjtBQUVEO0FBQ0QsYUFBTyxLQUFQO0FBQ0Q7O0FBRUQsUUFBSSxXQUFXLGNBQWY7QUFDQSxhQUFTLFNBQVQsQ0FBb0IsSUFBcEIsRUFBMEI7QUFDeEIsVUFBSSxPQUFPLFlBQVksSUFBWixDQUFYO0FBQ0EsVUFBSSxJQUFKLEVBQVU7QUFDUixZQUFLLEtBQUssVUFBTCxJQUFtQixLQUFLLGNBQXpCLElBQTRDLEtBQUssT0FBckQsRUFBOEQ7QUFDNUQsaUJBQU8sS0FBSyxNQUFMLENBQVksR0FBWixFQUFpQixLQUFqQixDQUFQO0FBQ0QsU0FGRCxNQUVPO0FBQ0wsaUJBQU8sS0FBSyxNQUFMLENBQVksR0FBWixFQUFpQixLQUFqQixDQUFQO0FBQ0Q7QUFDRixPQU5ELE1BTU87QUFDTCxlQUFPLE1BQU0sR0FBTixDQUFVLFVBQVYsRUFBc0IsR0FBdEIsRUFBMkIsSUFBM0IsQ0FBUDtBQUNEO0FBQ0Y7O0FBRUQsUUFBSSxZQUFZLFVBQVUsV0FBVixDQUFoQjtBQUNBLFFBQUksU0FBUyxVQUFVLFFBQVYsQ0FBYjs7QUFFQSxRQUFJLFFBQVEsV0FBWjtBQUNBLFFBQUksT0FBTyxLQUFQLEtBQWlCLFFBQXJCLEVBQStCO0FBQzdCLFVBQUksVUFBVSxDQUFkLEVBQWlCO0FBQ2Y7QUFDRDtBQUNGLEtBSkQsTUFJTztBQUNMLFlBQU0sS0FBTixFQUFhLEtBQWIsRUFBb0IsSUFBcEI7QUFDQSxZQUFNLElBQU4sQ0FBVyxHQUFYO0FBQ0Q7O0FBRUQsUUFBSSxTQUFKLEVBQWUsY0FBZjtBQUNBLFFBQUksYUFBSixFQUFtQjtBQUNqQixrQkFBWSxVQUFVLFdBQVYsQ0FBWjtBQUNBLHVCQUFpQixJQUFJLFVBQXJCO0FBQ0Q7O0FBRUQsUUFBSSxlQUFlLFdBQVcsT0FBOUI7O0FBRUEsUUFBSSxpQkFBaUIsWUFBWSxRQUFaLElBQXdCLFNBQVMsWUFBWSxRQUFyQixDQUE3Qzs7QUFFQSxhQUFTLGNBQVQsR0FBMkI7QUFDekIsZUFBUyxZQUFULEdBQXlCO0FBQ3ZCLGNBQU0sY0FBTixFQUFzQiw4QkFBdEIsRUFBc0QsQ0FDcEQsU0FEb0QsRUFFcEQsS0FGb0QsRUFHcEQsWUFIb0QsRUFJcEQsU0FBUyxNQUFULEdBQWtCLFlBQWxCLEdBQWlDLEdBQWpDLEdBQXVDLGdCQUF2QyxHQUEwRCxPQUpOLEVBS3BELFNBTG9ELENBQXRELEVBTUcsSUFOSDtBQU9EOztBQUVELGVBQVMsVUFBVCxHQUF1QjtBQUNyQixjQUFNLGNBQU4sRUFBc0IsNEJBQXRCLEVBQ0UsQ0FBQyxTQUFELEVBQVksTUFBWixFQUFvQixLQUFwQixFQUEyQixTQUEzQixDQURGLEVBQ3lDLElBRHpDO0FBRUQ7O0FBRUQsVUFBSSxRQUFKLEVBQWM7QUFDWixZQUFJLENBQUMsY0FBTCxFQUFxQjtBQUNuQixnQkFBTSxLQUFOLEVBQWEsUUFBYixFQUF1QixJQUF2QjtBQUNBO0FBQ0EsZ0JBQU0sUUFBTjtBQUNBO0FBQ0EsZ0JBQU0sR0FBTjtBQUNELFNBTkQsTUFNTztBQUNMO0FBQ0Q7QUFDRixPQVZELE1BVU87QUFDTDtBQUNEO0FBQ0Y7O0FBRUQsYUFBUyxXQUFULEdBQXdCO0FBQ3RCLGVBQVMsWUFBVCxHQUF5QjtBQUN2QixjQUFNLEtBQUssZ0JBQUwsR0FBd0IsQ0FDNUIsU0FENEIsRUFFNUIsS0FGNEIsRUFHNUIsWUFINEIsRUFJNUIsU0FBUyxNQUFULEdBQWtCLFlBQWxCLEdBQWlDLEdBQWpDLEdBQXVDLGdCQUF2QyxHQUEwRCxPQUo5QixDQUF4QixHQUtGLElBTEo7QUFNRDs7QUFFRCxlQUFTLFVBQVQsR0FBdUI7QUFDckIsY0FBTSxLQUFLLGNBQUwsR0FBc0IsQ0FBQyxTQUFELEVBQVksTUFBWixFQUFvQixLQUFwQixDQUF0QixHQUFtRCxJQUF6RDtBQUNEOztBQUVELFVBQUksUUFBSixFQUFjO0FBQ1osWUFBSSxDQUFDLGNBQUwsRUFBcUI7QUFDbkIsZ0JBQU0sS0FBTixFQUFhLFFBQWIsRUFBdUIsSUFBdkI7QUFDQTtBQUNBLGdCQUFNLFFBQU47QUFDQTtBQUNBLGdCQUFNLEdBQU47QUFDRCxTQU5ELE1BTU87QUFDTDtBQUNEO0FBQ0YsT0FWRCxNQVVPO0FBQ0w7QUFDRDtBQUNGOztBQUVELFFBQUksa0JBQWtCLE9BQU8sU0FBUCxLQUFxQixRQUFyQixJQUFpQyxhQUFhLENBQWhFLENBQUosRUFBd0U7QUFDdEUsVUFBSSxPQUFPLFNBQVAsS0FBcUIsUUFBekIsRUFBbUM7QUFDakMsY0FBTSxLQUFOLEVBQWEsU0FBYixFQUF3QixNQUF4QjtBQUNBO0FBQ0EsY0FBTSxXQUFOLEVBQW1CLFNBQW5CLEVBQThCLE1BQTlCO0FBQ0E7QUFDQSxjQUFNLEdBQU47QUFDRCxPQU5ELE1BTU87QUFDTDtBQUNEO0FBQ0YsS0FWRCxNQVVPO0FBQ0w7QUFDRDtBQUNGOztBQUVELFdBQVMsVUFBVCxDQUFxQixRQUFyQixFQUErQixTQUEvQixFQUEwQyxJQUExQyxFQUFnRCxPQUFoRCxFQUF5RCxLQUF6RCxFQUFnRTtBQUM5RCxRQUFJLE1BQU0sdUJBQVY7QUFDQSxRQUFJLFFBQVEsSUFBSSxJQUFKLENBQVMsTUFBVCxFQUFpQixLQUFqQixDQUFaOztBQUVBLFFBQUksYUFBSixFQUFtQjtBQUNqQixVQUFJLFVBQUosR0FBaUIsTUFBTSxHQUFOLENBQ2YsSUFBSSxNQUFKLENBQVcsVUFESSxFQUNRLHlCQURSLENBQWpCO0FBRUQ7QUFDRCxhQUFTLEdBQVQsRUFBYyxLQUFkLEVBQXFCLElBQXJCLEVBQTJCLE9BQTNCO0FBQ0EsV0FBTyxJQUFJLE9BQUosR0FBYyxJQUFyQjtBQUNEOztBQUVEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxXQUFTLFlBQVQsQ0FBdUIsR0FBdkIsRUFBNEIsSUFBNUIsRUFBa0MsSUFBbEMsRUFBd0MsT0FBeEMsRUFBaUQ7QUFDL0MscUJBQWlCLEdBQWpCLEVBQXNCLElBQXRCO0FBQ0EsbUJBQWUsR0FBZixFQUFvQixJQUFwQixFQUEwQixJQUExQixFQUFnQyxRQUFRLFVBQXhDLEVBQW9ELFlBQVk7QUFDOUQsYUFBTyxJQUFQO0FBQ0QsS0FGRDtBQUdBLGlCQUFhLEdBQWIsRUFBa0IsSUFBbEIsRUFBd0IsSUFBeEIsRUFBOEIsUUFBUSxRQUF0QyxFQUFnRCxZQUFZO0FBQzFELGFBQU8sSUFBUDtBQUNELEtBRkQ7QUFHQSxhQUFTLEdBQVQsRUFBYyxJQUFkLEVBQW9CLElBQXBCLEVBQTBCLElBQTFCO0FBQ0Q7O0FBRUQsV0FBUyxZQUFULENBQXVCLEdBQXZCLEVBQTRCLElBQTVCLEVBQWtDO0FBQ2hDLFFBQUksT0FBTyxJQUFJLElBQUosQ0FBUyxNQUFULEVBQWlCLENBQWpCLENBQVg7O0FBRUEscUJBQWlCLEdBQWpCLEVBQXNCLElBQXRCOztBQUVBLGdCQUFZLEdBQVosRUFBaUIsSUFBakIsRUFBdUIsS0FBSyxPQUE1QjtBQUNBLHdCQUFvQixHQUFwQixFQUF5QixJQUF6QixFQUErQixLQUFLLFdBQXBDOztBQUVBLGtCQUFjLEdBQWQsRUFBbUIsSUFBbkIsRUFBeUIsSUFBekI7QUFDQSxtQkFBZSxHQUFmLEVBQW9CLElBQXBCLEVBQTBCLEtBQUssS0FBL0I7O0FBRUEsZ0JBQVksR0FBWixFQUFpQixJQUFqQixFQUF1QixJQUF2QixFQUE2QixLQUE3QixFQUFvQyxJQUFwQzs7QUFFQSxRQUFJLFVBQVUsS0FBSyxNQUFMLENBQVksT0FBWixDQUFvQixNQUFwQixDQUEyQixHQUEzQixFQUFnQyxJQUFoQyxDQUFkO0FBQ0EsU0FBSyxJQUFJLE1BQUosQ0FBVyxFQUFoQixFQUFvQixjQUFwQixFQUFvQyxPQUFwQyxFQUE2QyxZQUE3Qzs7QUFFQSxRQUFJLEtBQUssTUFBTCxDQUFZLE9BQWhCLEVBQXlCO0FBQ3ZCLG1CQUFhLEdBQWIsRUFBa0IsSUFBbEIsRUFBd0IsSUFBeEIsRUFBOEIsS0FBSyxNQUFMLENBQVksT0FBMUM7QUFDRCxLQUZELE1BRU87QUFDTCxVQUFJLFlBQVksSUFBSSxNQUFKLENBQVcsR0FBWCxDQUFlLElBQWYsQ0FBaEI7QUFDQSxVQUFJLFVBQVUsS0FBSyxHQUFMLENBQVMsT0FBVCxFQUFrQixLQUFsQixDQUFkO0FBQ0EsVUFBSSxjQUFjLEtBQUssR0FBTCxDQUFTLFNBQVQsRUFBb0IsR0FBcEIsRUFBeUIsT0FBekIsRUFBa0MsR0FBbEMsQ0FBbEI7QUFDQSxXQUNFLElBQUksSUFBSixDQUFTLFdBQVQsRUFDRyxJQURILENBQ1EsV0FEUixFQUNxQixpQkFEckIsRUFFRyxJQUZILENBR0ksV0FISixFQUdpQixHQUhqQixFQUdzQixTQUh0QixFQUdpQyxHQUhqQyxFQUdzQyxPQUh0QyxFQUcrQyxJQUgvQyxFQUlJLElBQUksSUFBSixDQUFTLFVBQVUsT0FBVixFQUFtQjtBQUMxQixlQUFPLFdBQVcsWUFBWCxFQUF5QixHQUF6QixFQUE4QixJQUE5QixFQUFvQyxPQUFwQyxFQUE2QyxDQUE3QyxDQUFQO0FBQ0QsT0FGRCxDQUpKLEVBTVEsR0FOUixFQU1hLE9BTmIsRUFNc0IsSUFOdEIsRUFPSSxXQVBKLEVBT2lCLGlCQVBqQixDQURGO0FBU0Q7O0FBRUQsUUFBSSxPQUFPLElBQVAsQ0FBWSxLQUFLLEtBQWpCLEVBQXdCLE1BQXhCLEdBQWlDLENBQXJDLEVBQXdDO0FBQ3RDLFdBQUssSUFBSSxNQUFKLENBQVcsT0FBaEIsRUFBeUIsY0FBekI7QUFDRDtBQUNGOztBQUVEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUEsV0FBUywwQkFBVCxDQUFxQyxHQUFyQyxFQUEwQyxLQUExQyxFQUFpRCxJQUFqRCxFQUF1RCxPQUF2RCxFQUFnRTtBQUM5RCxRQUFJLE9BQUosR0FBYyxJQUFkOztBQUVBLHFCQUFpQixHQUFqQixFQUFzQixLQUF0Qjs7QUFFQSxhQUFTLEdBQVQsR0FBZ0I7QUFDZCxhQUFPLElBQVA7QUFDRDs7QUFFRCxtQkFBZSxHQUFmLEVBQW9CLEtBQXBCLEVBQTJCLElBQTNCLEVBQWlDLFFBQVEsVUFBekMsRUFBcUQsR0FBckQ7QUFDQSxpQkFBYSxHQUFiLEVBQWtCLEtBQWxCLEVBQXlCLElBQXpCLEVBQStCLFFBQVEsUUFBdkMsRUFBaUQsR0FBakQ7QUFDQSxhQUFTLEdBQVQsRUFBYyxLQUFkLEVBQXFCLEtBQXJCLEVBQTRCLElBQTVCO0FBQ0Q7O0FBRUQsV0FBUyxhQUFULENBQXdCLEdBQXhCLEVBQTZCLEtBQTdCLEVBQW9DLElBQXBDLEVBQTBDLE9BQTFDLEVBQW1EO0FBQ2pELHFCQUFpQixHQUFqQixFQUFzQixLQUF0Qjs7QUFFQSxRQUFJLGlCQUFpQixLQUFLLFVBQTFCOztBQUVBLFFBQUksV0FBVyxNQUFNLEdBQU4sRUFBZjtBQUNBLFFBQUksWUFBWSxJQUFoQjtBQUNBLFFBQUksWUFBWSxJQUFoQjtBQUNBLFFBQUksUUFBUSxNQUFNLEdBQU4sRUFBWjtBQUNBLFFBQUksTUFBSixDQUFXLEtBQVgsR0FBbUIsS0FBbkI7QUFDQSxRQUFJLE9BQUosR0FBYyxRQUFkOztBQUVBLFFBQUksUUFBUSxJQUFJLEtBQUosRUFBWjtBQUNBLFFBQUksUUFBUSxJQUFJLEtBQUosRUFBWjs7QUFFQSxVQUNFLE1BQU0sS0FEUixFQUVFLE1BRkYsRUFFVSxRQUZWLEVBRW9CLEtBRnBCLEVBRTJCLFFBRjNCLEVBRXFDLEdBRnJDLEVBRTBDLFNBRjFDLEVBRXFELEtBRnJELEVBRTRELFFBRjVELEVBRXNFLElBRnRFLEVBR0UsS0FIRixFQUdTLEdBSFQsRUFHYyxTQUhkLEVBR3lCLEdBSHpCLEVBRzhCLFFBSDlCLEVBR3dDLElBSHhDLEVBSUUsS0FKRixFQUtFLEdBTEYsRUFNRSxNQUFNLElBTlI7O0FBUUEsYUFBUyxXQUFULENBQXNCLElBQXRCLEVBQTRCO0FBQzFCLGFBQVMsS0FBSyxVQUFMLElBQW1CLGNBQXBCLElBQXVDLEtBQUssT0FBcEQ7QUFDRDs7QUFFRCxhQUFTLFdBQVQsQ0FBc0IsSUFBdEIsRUFBNEI7QUFDMUIsYUFBTyxDQUFDLFlBQVksSUFBWixDQUFSO0FBQ0Q7O0FBRUQsUUFBSSxLQUFLLFlBQVQsRUFBdUI7QUFDckIsa0JBQVksR0FBWixFQUFpQixLQUFqQixFQUF3QixLQUFLLE9BQTdCO0FBQ0Q7QUFDRCxRQUFJLEtBQUssZ0JBQVQsRUFBMkI7QUFDekIsMEJBQW9CLEdBQXBCLEVBQXlCLEtBQXpCLEVBQWdDLEtBQUssV0FBckM7QUFDRDtBQUNELG1CQUFlLEdBQWYsRUFBb0IsS0FBcEIsRUFBMkIsS0FBSyxLQUFoQyxFQUF1QyxXQUF2Qzs7QUFFQSxRQUFJLEtBQUssT0FBTCxJQUFnQixZQUFZLEtBQUssT0FBakIsQ0FBcEIsRUFBK0M7QUFDN0Msa0JBQVksR0FBWixFQUFpQixLQUFqQixFQUF3QixJQUF4QixFQUE4QixLQUE5QixFQUFxQyxJQUFyQztBQUNEOztBQUVELFFBQUksQ0FBQyxPQUFMLEVBQWM7QUFDWixVQUFJLFlBQVksSUFBSSxNQUFKLENBQVcsR0FBWCxDQUFlLElBQWYsQ0FBaEI7QUFDQSxVQUFJLFVBQVUsS0FBSyxNQUFMLENBQVksT0FBWixDQUFvQixNQUFwQixDQUEyQixHQUEzQixFQUFnQyxLQUFoQyxDQUFkO0FBQ0EsVUFBSSxVQUFVLE1BQU0sR0FBTixDQUFVLE9BQVYsRUFBbUIsS0FBbkIsQ0FBZDtBQUNBLFVBQUksY0FBYyxNQUFNLEdBQU4sQ0FBVSxTQUFWLEVBQXFCLEdBQXJCLEVBQTBCLE9BQTFCLEVBQW1DLEdBQW5DLENBQWxCO0FBQ0EsWUFDRSxJQUFJLE1BQUosQ0FBVyxFQURiLEVBQ2lCLGNBRGpCLEVBQ2lDLE9BRGpDLEVBQzBDLFlBRDFDLEVBRUUsTUFGRixFQUVVLFdBRlYsRUFFdUIsSUFGdkIsRUFHRSxXQUhGLEVBR2UsR0FIZixFQUdvQixTQUhwQixFQUcrQixHQUgvQixFQUdvQyxPQUhwQyxFQUc2QyxJQUg3QyxFQUlFLElBQUksSUFBSixDQUFTLFVBQVUsT0FBVixFQUFtQjtBQUMxQixlQUFPLFdBQ0wsMEJBREssRUFDdUIsR0FEdkIsRUFDNEIsSUFENUIsRUFDa0MsT0FEbEMsRUFDMkMsQ0FEM0MsQ0FBUDtBQUVELE9BSEQsQ0FKRixFQU9NLEdBUE4sRUFPVyxPQVBYLEVBT29CLEtBUHBCLEVBUUUsV0FSRixFQVFlLGdCQVJmLEVBUWlDLFFBUmpDLEVBUTJDLElBUjNDLEVBUWlELFFBUmpELEVBUTJELElBUjNEO0FBU0QsS0FkRCxNQWNPO0FBQ0wscUJBQWUsR0FBZixFQUFvQixLQUFwQixFQUEyQixJQUEzQixFQUFpQyxRQUFRLFVBQXpDLEVBQXFELFdBQXJEO0FBQ0EscUJBQWUsR0FBZixFQUFvQixLQUFwQixFQUEyQixJQUEzQixFQUFpQyxRQUFRLFVBQXpDLEVBQXFELFdBQXJEO0FBQ0EsbUJBQWEsR0FBYixFQUFrQixLQUFsQixFQUF5QixJQUF6QixFQUErQixRQUFRLFFBQXZDLEVBQWlELFdBQWpEO0FBQ0EsbUJBQWEsR0FBYixFQUFrQixLQUFsQixFQUF5QixJQUF6QixFQUErQixRQUFRLFFBQXZDLEVBQWlELFdBQWpEO0FBQ0EsZUFBUyxHQUFULEVBQWMsS0FBZCxFQUFxQixLQUFyQixFQUE0QixJQUE1QjtBQUNEO0FBQ0Y7O0FBRUQsV0FBUyxhQUFULENBQXdCLEdBQXhCLEVBQTZCLElBQTdCLEVBQW1DO0FBQ2pDLFFBQUksUUFBUSxJQUFJLElBQUosQ0FBUyxPQUFULEVBQWtCLENBQWxCLENBQVo7QUFDQSxRQUFJLE9BQUosR0FBYyxHQUFkOztBQUVBLHFCQUFpQixHQUFqQixFQUFzQixLQUF0Qjs7QUFFQTtBQUNBLFFBQUksaUJBQWlCLEtBQXJCO0FBQ0EsUUFBSSxlQUFlLElBQW5CO0FBQ0EsV0FBTyxJQUFQLENBQVksS0FBSyxPQUFqQixFQUEwQixPQUExQixDQUFrQyxVQUFVLElBQVYsRUFBZ0I7QUFDaEQsdUJBQWlCLGtCQUFrQixLQUFLLE9BQUwsQ0FBYSxJQUFiLEVBQW1CLE9BQXREO0FBQ0QsS0FGRDtBQUdBLFFBQUksQ0FBQyxjQUFMLEVBQXFCO0FBQ25CLGtCQUFZLEdBQVosRUFBaUIsS0FBakIsRUFBd0IsS0FBSyxPQUE3QjtBQUNBLHFCQUFlLEtBQWY7QUFDRDs7QUFFRDtBQUNBLFFBQUksY0FBYyxLQUFLLFdBQXZCO0FBQ0EsUUFBSSxtQkFBbUIsS0FBdkI7QUFDQSxRQUFJLFdBQUosRUFBaUI7QUFDZixVQUFJLFlBQVksT0FBaEIsRUFBeUI7QUFDdkIseUJBQWlCLG1CQUFtQixJQUFwQztBQUNELE9BRkQsTUFFTyxJQUFJLFlBQVksVUFBWixJQUEwQixjQUE5QixFQUE4QztBQUNuRCwyQkFBbUIsSUFBbkI7QUFDRDtBQUNELFVBQUksQ0FBQyxnQkFBTCxFQUF1QjtBQUNyQiw0QkFBb0IsR0FBcEIsRUFBeUIsS0FBekIsRUFBZ0MsV0FBaEM7QUFDRDtBQUNGLEtBVEQsTUFTTztBQUNMLDBCQUFvQixHQUFwQixFQUF5QixLQUF6QixFQUFnQyxJQUFoQztBQUNEOztBQUVEO0FBQ0EsUUFBSSxLQUFLLEtBQUwsQ0FBVyxRQUFYLElBQXVCLEtBQUssS0FBTCxDQUFXLFFBQVgsQ0FBb0IsT0FBL0MsRUFBd0Q7QUFDdEQsdUJBQWlCLElBQWpCO0FBQ0Q7O0FBRUQsYUFBUyxXQUFULENBQXNCLElBQXRCLEVBQTRCO0FBQzFCLGFBQVEsS0FBSyxVQUFMLElBQW1CLGNBQXBCLElBQXVDLEtBQUssT0FBbkQ7QUFDRDs7QUFFRDtBQUNBLGtCQUFjLEdBQWQsRUFBbUIsS0FBbkIsRUFBMEIsSUFBMUI7QUFDQSxtQkFBZSxHQUFmLEVBQW9CLEtBQXBCLEVBQTJCLEtBQUssS0FBaEMsRUFBdUMsVUFBVSxJQUFWLEVBQWdCO0FBQ3JELGFBQU8sQ0FBQyxZQUFZLElBQVosQ0FBUjtBQUNELEtBRkQ7O0FBSUEsUUFBSSxDQUFDLEtBQUssT0FBTixJQUFpQixDQUFDLFlBQVksS0FBSyxPQUFqQixDQUF0QixFQUFpRDtBQUMvQyxrQkFBWSxHQUFaLEVBQWlCLEtBQWpCLEVBQXdCLElBQXhCLEVBQThCLEtBQTlCLEVBQXFDLElBQXJDO0FBQ0Q7O0FBRUQ7QUFDQSxTQUFLLFVBQUwsR0FBa0IsY0FBbEI7QUFDQSxTQUFLLFlBQUwsR0FBb0IsWUFBcEI7QUFDQSxTQUFLLGdCQUFMLEdBQXdCLGdCQUF4Qjs7QUFFQTtBQUNBLFFBQUksV0FBVyxLQUFLLE1BQUwsQ0FBWSxPQUEzQjtBQUNBLFFBQUssU0FBUyxVQUFULElBQXVCLGNBQXhCLElBQTJDLFNBQVMsT0FBeEQsRUFBaUU7QUFDL0Qsb0JBQ0UsR0FERixFQUVFLEtBRkYsRUFHRSxJQUhGLEVBSUUsSUFKRjtBQUtELEtBTkQsTUFNTztBQUNMLFVBQUksVUFBVSxTQUFTLE1BQVQsQ0FBZ0IsR0FBaEIsRUFBcUIsS0FBckIsQ0FBZDtBQUNBLFlBQU0sSUFBSSxNQUFKLENBQVcsRUFBakIsRUFBcUIsY0FBckIsRUFBcUMsT0FBckMsRUFBOEMsWUFBOUM7QUFDQSxVQUFJLEtBQUssTUFBTCxDQUFZLE9BQWhCLEVBQXlCO0FBQ3ZCLHNCQUNFLEdBREYsRUFFRSxLQUZGLEVBR0UsSUFIRixFQUlFLEtBQUssTUFBTCxDQUFZLE9BSmQ7QUFLRCxPQU5ELE1BTU87QUFDTCxZQUFJLGFBQWEsSUFBSSxNQUFKLENBQVcsR0FBWCxDQUFlLElBQWYsQ0FBakI7QUFDQSxZQUFJLFVBQVUsTUFBTSxHQUFOLENBQVUsT0FBVixFQUFtQixLQUFuQixDQUFkO0FBQ0EsWUFBSSxjQUFjLE1BQU0sR0FBTixDQUFVLFVBQVYsRUFBc0IsR0FBdEIsRUFBMkIsT0FBM0IsRUFBb0MsR0FBcEMsQ0FBbEI7QUFDQSxjQUNFLElBQUksSUFBSixDQUFTLFdBQVQsRUFDRyxJQURILENBQ1EsV0FEUixFQUNxQixvQkFEckIsRUFFRyxJQUZILENBR0ksV0FISixFQUdpQixHQUhqQixFQUdzQixVQUh0QixFQUdrQyxHQUhsQyxFQUd1QyxPQUh2QyxFQUdnRCxJQUhoRCxFQUlJLElBQUksSUFBSixDQUFTLFVBQVUsT0FBVixFQUFtQjtBQUMxQixpQkFBTyxXQUFXLGFBQVgsRUFBMEIsR0FBMUIsRUFBK0IsSUFBL0IsRUFBcUMsT0FBckMsRUFBOEMsQ0FBOUMsQ0FBUDtBQUNELFNBRkQsQ0FKSixFQU1RLEdBTlIsRUFNYSxPQU5iLEVBTXNCLElBTnRCLEVBT0ksV0FQSixFQU9pQixvQkFQakIsQ0FERjtBQVNEO0FBQ0Y7O0FBRUQsUUFBSSxPQUFPLElBQVAsQ0FBWSxLQUFLLEtBQWpCLEVBQXdCLE1BQXhCLEdBQWlDLENBQXJDLEVBQXdDO0FBQ3RDLFlBQU0sSUFBSSxNQUFKLENBQVcsT0FBakIsRUFBMEIsY0FBMUI7QUFDRDtBQUNGOztBQUVEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxXQUFTLGFBQVQsQ0FBd0IsR0FBeEIsRUFBNkIsSUFBN0IsRUFBbUM7QUFDakMsUUFBSSxRQUFRLElBQUksSUFBSixDQUFTLE9BQVQsRUFBa0IsQ0FBbEIsQ0FBWjtBQUNBLFFBQUksT0FBSixHQUFjLElBQWQ7O0FBRUEsUUFBSSxTQUFTLElBQUksTUFBakI7QUFDQSxRQUFJLGdCQUFnQixPQUFPLE9BQTNCOztBQUVBLGdCQUFZLEdBQVosRUFBaUIsS0FBakIsRUFBd0IsS0FBSyxPQUE3Qjs7QUFFQSxRQUFJLEtBQUssV0FBVCxFQUFzQjtBQUNwQixXQUFLLFdBQUwsQ0FBaUIsTUFBakIsQ0FBd0IsR0FBeEIsRUFBNkIsS0FBN0I7QUFDRDs7QUFFRCxjQUFVLE9BQU8sSUFBUCxDQUFZLEtBQUssS0FBakIsQ0FBVixFQUFtQyxPQUFuQyxDQUEyQyxVQUFVLElBQVYsRUFBZ0I7QUFDekQsVUFBSSxPQUFPLEtBQUssS0FBTCxDQUFXLElBQVgsQ0FBWDtBQUNBLFVBQUksUUFBUSxLQUFLLE1BQUwsQ0FBWSxHQUFaLEVBQWlCLEtBQWpCLENBQVo7QUFDQSxVQUFJLFlBQVksS0FBWixDQUFKLEVBQXdCO0FBQ3RCLGNBQU0sT0FBTixDQUFjLFVBQVUsQ0FBVixFQUFhLENBQWIsRUFBZ0I7QUFDNUIsZ0JBQU0sR0FBTixDQUFVLElBQUksSUFBSixDQUFTLElBQVQsQ0FBVixFQUEwQixNQUFNLENBQU4sR0FBVSxHQUFwQyxFQUF5QyxDQUF6QztBQUNELFNBRkQ7QUFHRCxPQUpELE1BSU87QUFDTCxjQUFNLEdBQU4sQ0FBVSxPQUFPLElBQWpCLEVBQXVCLE1BQU0sSUFBN0IsRUFBbUMsS0FBbkM7QUFDRDtBQUNGLEtBVkQ7O0FBWUEsZ0JBQVksR0FBWixFQUFpQixLQUFqQixFQUF3QixJQUF4QixFQUE4QixJQUE5QixFQUFvQyxJQUFwQyxFQUVDLENBQUMsVUFBRCxFQUFhLFFBQWIsRUFBdUIsT0FBdkIsRUFBZ0MsV0FBaEMsRUFBNkMsV0FBN0MsRUFBMEQsT0FBMUQsQ0FDQyxVQUFVLEdBQVYsRUFBZTtBQUNiLFVBQUksV0FBVyxLQUFLLElBQUwsQ0FBVSxHQUFWLENBQWY7QUFDQSxVQUFJLENBQUMsUUFBTCxFQUFlO0FBQ2I7QUFDRDtBQUNELFlBQU0sR0FBTixDQUFVLE9BQU8sSUFBakIsRUFBdUIsTUFBTSxHQUE3QixFQUFrQyxLQUFLLFNBQVMsTUFBVCxDQUFnQixHQUFoQixFQUFxQixLQUFyQixDQUF2QztBQUNELEtBUEY7O0FBU0QsV0FBTyxJQUFQLENBQVksS0FBSyxRQUFqQixFQUEyQixPQUEzQixDQUFtQyxVQUFVLEdBQVYsRUFBZTtBQUNoRCxZQUFNLEdBQU4sQ0FDRSxPQUFPLFFBRFQsRUFFRSxNQUFNLFlBQVksRUFBWixDQUFlLEdBQWYsQ0FBTixHQUE0QixHQUY5QixFQUdFLEtBQUssUUFBTCxDQUFjLEdBQWQsRUFBbUIsTUFBbkIsQ0FBMEIsR0FBMUIsRUFBK0IsS0FBL0IsQ0FIRjtBQUlELEtBTEQ7O0FBT0EsV0FBTyxJQUFQLENBQVksS0FBSyxVQUFqQixFQUE2QixPQUE3QixDQUFxQyxVQUFVLElBQVYsRUFBZ0I7QUFDbkQsVUFBSSxTQUFTLEtBQUssVUFBTCxDQUFnQixJQUFoQixFQUFzQixNQUF0QixDQUE2QixHQUE3QixFQUFrQyxLQUFsQyxDQUFiO0FBQ0EsVUFBSSxjQUFjLElBQUksV0FBSixDQUFnQixJQUFoQixDQUFsQjtBQUNBLGFBQU8sSUFBUCxDQUFZLElBQUksZUFBSixFQUFaLEVBQW1DLE9BQW5DLENBQTJDLFVBQVUsSUFBVixFQUFnQjtBQUN6RCxjQUFNLEdBQU4sQ0FBVSxXQUFWLEVBQXVCLE1BQU0sSUFBN0IsRUFBbUMsT0FBTyxJQUFQLENBQW5DO0FBQ0QsT0FGRDtBQUdELEtBTkQ7O0FBUUEsYUFBUyxVQUFULENBQXFCLElBQXJCLEVBQTJCO0FBQ3pCLFVBQUksU0FBUyxLQUFLLE1BQUwsQ0FBWSxJQUFaLENBQWI7QUFDQSxVQUFJLE1BQUosRUFBWTtBQUNWLGNBQU0sR0FBTixDQUFVLE9BQU8sTUFBakIsRUFBeUIsTUFBTSxJQUEvQixFQUFxQyxPQUFPLE1BQVAsQ0FBYyxHQUFkLEVBQW1CLEtBQW5CLENBQXJDO0FBQ0Q7QUFDRjtBQUNELGVBQVcsTUFBWDtBQUNBLGVBQVcsTUFBWDs7QUFFQSxRQUFJLE9BQU8sSUFBUCxDQUFZLEtBQUssS0FBakIsRUFBd0IsTUFBeEIsR0FBaUMsQ0FBckMsRUFBd0M7QUFDdEMsWUFBTSxhQUFOLEVBQXFCLGNBQXJCO0FBQ0EsWUFBTSxJQUFOLENBQVcsYUFBWCxFQUEwQixjQUExQjtBQUNEOztBQUVELFVBQU0sS0FBTixFQUFhLElBQUksTUFBSixDQUFXLE9BQXhCLEVBQWlDLE1BQWpDLEVBQXlDLElBQUksT0FBN0MsRUFBc0QsSUFBdEQ7QUFDRDs7QUFFRCxXQUFTLGVBQVQsQ0FBMEIsTUFBMUIsRUFBa0M7QUFDaEMsUUFBSSxPQUFPLE1BQVAsS0FBa0IsUUFBbEIsSUFBOEIsWUFBWSxNQUFaLENBQWxDLEVBQXVEO0FBQ3JEO0FBQ0Q7QUFDRCxRQUFJLFFBQVEsT0FBTyxJQUFQLENBQVksTUFBWixDQUFaO0FBQ0EsU0FBSyxJQUFJLElBQUksQ0FBYixFQUFnQixJQUFJLE1BQU0sTUFBMUIsRUFBa0MsRUFBRSxDQUFwQyxFQUF1QztBQUNyQyxVQUFJLFFBQVEsU0FBUixDQUFrQixPQUFPLE1BQU0sQ0FBTixDQUFQLENBQWxCLENBQUosRUFBeUM7QUFDdkMsZUFBTyxJQUFQO0FBQ0Q7QUFDRjtBQUNELFdBQU8sS0FBUDtBQUNEOztBQUVELFdBQVMsV0FBVCxDQUFzQixHQUF0QixFQUEyQixPQUEzQixFQUFvQyxJQUFwQyxFQUEwQztBQUN4QyxRQUFJLFNBQVMsUUFBUSxNQUFSLENBQWUsSUFBZixDQUFiO0FBQ0EsUUFBSSxDQUFDLE1BQUQsSUFBVyxDQUFDLGdCQUFnQixNQUFoQixDQUFoQixFQUF5QztBQUN2QztBQUNEOztBQUVELFFBQUksVUFBVSxJQUFJLE1BQWxCO0FBQ0EsUUFBSSxPQUFPLE9BQU8sSUFBUCxDQUFZLE1BQVosQ0FBWDtBQUNBLFFBQUksVUFBVSxLQUFkO0FBQ0EsUUFBSSxhQUFhLEtBQWpCO0FBQ0EsUUFBSSxVQUFVLEtBQWQ7QUFDQSxRQUFJLFlBQVksSUFBSSxNQUFKLENBQVcsR0FBWCxDQUFlLElBQWYsQ0FBaEI7QUFDQSxTQUFLLE9BQUwsQ0FBYSxVQUFVLEdBQVYsRUFBZTtBQUMxQixVQUFJLFFBQVEsT0FBTyxHQUFQLENBQVo7QUFDQSxVQUFJLFFBQVEsU0FBUixDQUFrQixLQUFsQixDQUFKLEVBQThCO0FBQzVCLFlBQUksT0FBTyxLQUFQLEtBQWlCLFVBQXJCLEVBQWlDO0FBQy9CLGtCQUFRLE9BQU8sR0FBUCxJQUFjLFFBQVEsS0FBUixDQUFjLEtBQWQsQ0FBdEI7QUFDRDtBQUNELFlBQUksT0FBTyxrQkFBa0IsS0FBbEIsRUFBeUIsSUFBekIsQ0FBWDtBQUNBLGtCQUFVLFdBQVcsS0FBSyxPQUExQjtBQUNBLGtCQUFVLFdBQVcsS0FBSyxPQUExQjtBQUNBLHFCQUFhLGNBQWMsS0FBSyxVQUFoQztBQUNELE9BUkQsTUFRTztBQUNMLGdCQUFRLFNBQVIsRUFBbUIsR0FBbkIsRUFBd0IsR0FBeEIsRUFBNkIsR0FBN0I7QUFDQSxnQkFBUSxPQUFPLEtBQWY7QUFDRSxlQUFLLFFBQUw7QUFDRSxvQkFBUSxLQUFSO0FBQ0E7QUFDRixlQUFLLFFBQUw7QUFDRSxvQkFBUSxHQUFSLEVBQWEsS0FBYixFQUFvQixHQUFwQjtBQUNBO0FBQ0YsZUFBSyxRQUFMO0FBQ0UsZ0JBQUksTUFBTSxPQUFOLENBQWMsS0FBZCxDQUFKLEVBQTBCO0FBQ3hCLHNCQUFRLEdBQVIsRUFBYSxNQUFNLElBQU4sRUFBYixFQUEyQixHQUEzQjtBQUNEO0FBQ0Q7QUFDRjtBQUNFLG9CQUFRLElBQUksSUFBSixDQUFTLEtBQVQsQ0FBUjtBQUNBO0FBZEo7QUFnQkEsZ0JBQVEsR0FBUjtBQUNEO0FBQ0YsS0E5QkQ7O0FBZ0NBLGFBQVMsV0FBVCxDQUFzQixHQUF0QixFQUEyQixLQUEzQixFQUFrQztBQUNoQyxXQUFLLE9BQUwsQ0FBYSxVQUFVLEdBQVYsRUFBZTtBQUMxQixZQUFJLFFBQVEsT0FBTyxHQUFQLENBQVo7QUFDQSxZQUFJLENBQUMsUUFBUSxTQUFSLENBQWtCLEtBQWxCLENBQUwsRUFBK0I7QUFDN0I7QUFDRDtBQUNELFlBQUksTUFBTSxJQUFJLE1BQUosQ0FBVyxLQUFYLEVBQWtCLEtBQWxCLENBQVY7QUFDQSxjQUFNLFNBQU4sRUFBaUIsR0FBakIsRUFBc0IsR0FBdEIsRUFBMkIsR0FBM0IsRUFBZ0MsR0FBaEMsRUFBcUMsR0FBckM7QUFDRCxPQVBEO0FBUUQ7O0FBRUQsWUFBUSxPQUFSLENBQWdCLElBQWhCLElBQXdCLElBQUksUUFBUSxlQUFaLENBQTRCLFNBQTVCLEVBQXVDO0FBQzdELGVBQVMsT0FEb0Q7QUFFN0Qsa0JBQVksVUFGaUQ7QUFHN0QsZUFBUyxPQUhvRDtBQUk3RCxXQUFLLFNBSndEO0FBSzdELGNBQVE7QUFMcUQsS0FBdkMsQ0FBeEI7QUFPQSxXQUFPLFFBQVEsTUFBUixDQUFlLElBQWYsQ0FBUDtBQUNEOztBQUVEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxXQUFTLGNBQVQsQ0FBeUIsT0FBekIsRUFBa0MsVUFBbEMsRUFBOEMsUUFBOUMsRUFBd0QsT0FBeEQsRUFBaUUsS0FBakUsRUFBd0U7QUFDdEUsUUFBSSxNQUFNLHVCQUFWOztBQUVBO0FBQ0EsUUFBSSxLQUFKLEdBQVksSUFBSSxJQUFKLENBQVMsS0FBVCxDQUFaOztBQUVBO0FBQ0EsV0FBTyxJQUFQLENBQVksV0FBVyxNQUF2QixFQUErQixPQUEvQixDQUF1QyxVQUFVLEdBQVYsRUFBZTtBQUNwRCxrQkFBWSxHQUFaLEVBQWlCLFVBQWpCLEVBQTZCLEdBQTdCO0FBQ0QsS0FGRDtBQUdBLG1CQUFlLE9BQWYsQ0FBdUIsVUFBVSxJQUFWLEVBQWdCO0FBQ3JDLGtCQUFZLEdBQVosRUFBaUIsT0FBakIsRUFBMEIsSUFBMUI7QUFDRCxLQUZEOztBQUlBLFFBQUksT0FBTyxlQUFlLE9BQWYsRUFBd0IsVUFBeEIsRUFBb0MsUUFBcEMsRUFBOEMsT0FBOUMsRUFBdUQsR0FBdkQsQ0FBWDs7QUFFQSxpQkFBYSxHQUFiLEVBQWtCLElBQWxCO0FBQ0Esa0JBQWMsR0FBZCxFQUFtQixJQUFuQjtBQUNBLGtCQUFjLEdBQWQsRUFBbUIsSUFBbkI7O0FBRUEsV0FBTyxJQUFJLE9BQUosRUFBUDtBQUNEOztBQUVEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxTQUFPO0FBQ0wsVUFBTSxTQUREO0FBRUwsYUFBUyxZQUZKO0FBR0wsV0FBUSxZQUFZO0FBQ2xCLFVBQUksTUFBTSx1QkFBVjtBQUNBLFVBQUksT0FBTyxJQUFJLElBQUosQ0FBUyxNQUFULENBQVg7QUFDQSxVQUFJLFVBQVUsSUFBSSxJQUFKLENBQVMsU0FBVCxDQUFkO0FBQ0EsVUFBSSxTQUFTLElBQUksS0FBSixFQUFiO0FBQ0EsV0FBSyxNQUFMO0FBQ0EsY0FBUSxNQUFSOztBQUVBLFVBQUksU0FBUyxJQUFJLE1BQWpCO0FBQ0EsVUFBSSxLQUFLLE9BQU8sRUFBaEI7QUFDQSxVQUFJLGFBQWEsT0FBTyxJQUF4QjtBQUNBLFVBQUksZ0JBQWdCLE9BQU8sT0FBM0I7O0FBRUEsYUFBTyxhQUFQLEVBQXNCLGVBQXRCOztBQUVBLDBCQUFvQixHQUFwQixFQUF5QixJQUF6QjtBQUNBLDBCQUFvQixHQUFwQixFQUF5QixPQUF6QixFQUFrQyxJQUFsQyxFQUF3QyxJQUF4Qzs7QUFFQTtBQUNBLFVBQUksZ0JBQWdCLEdBQUcsWUFBSCxDQUFnQix3QkFBaEIsQ0FBcEI7QUFDQSxVQUFJLFVBQUo7QUFDQSxVQUFJLGFBQUosRUFBbUI7QUFDakIscUJBQWEsSUFBSSxJQUFKLENBQVMsYUFBVCxDQUFiO0FBQ0Q7QUFDRCxXQUFLLElBQUksSUFBSSxDQUFiLEVBQWdCLElBQUksT0FBTyxhQUEzQixFQUEwQyxFQUFFLENBQTVDLEVBQStDO0FBQzdDLFlBQUksVUFBVSxRQUFRLEdBQVIsQ0FBWSxPQUFPLFVBQW5CLEVBQStCLEdBQS9CLEVBQW9DLENBQXBDLEVBQXVDLEdBQXZDLENBQWQ7QUFDQSxZQUFJLE9BQU8sSUFBSSxJQUFKLENBQVMsT0FBVCxFQUFrQixTQUFsQixDQUFYO0FBQ0EsYUFBSyxJQUFMLENBQ0UsRUFERixFQUNNLDJCQUROLEVBQ21DLENBRG5DLEVBQ3NDLElBRHRDLEVBRUUsRUFGRixFQUVNLGNBRk4sRUFHSSxlQUhKLEVBR3FCLEdBSHJCLEVBSUksT0FKSixFQUlhLGtCQUpiLEVBS0UsRUFMRixFQUtNLHVCQUxOLEVBTUksQ0FOSixFQU1PLEdBTlAsRUFPSSxPQVBKLEVBT2EsUUFQYixFQVFJLE9BUkosRUFRYSxRQVJiLEVBU0ksT0FUSixFQVNhLGNBVGIsRUFVSSxPQVZKLEVBVWEsVUFWYixFQVdJLE9BWEosRUFXYSxXQVhiLEVBWUUsSUFaRixDQWFFLEVBYkYsRUFhTSw0QkFiTixFQWFvQyxDQWJwQyxFQWF1QyxJQWJ2QyxFQWNFLEVBZEYsRUFjTSxrQkFkTixFQWVJLENBZkosRUFlTyxHQWZQLEVBZ0JJLE9BaEJKLEVBZ0JhLEtBaEJiLEVBaUJJLE9BakJKLEVBaUJhLEtBakJiLEVBa0JJLE9BbEJKLEVBa0JhLEtBbEJiLEVBbUJJLE9BbkJKLEVBbUJhLE1BbkJiLEVBb0JFLE9BcEJGLEVBb0JXLGVBcEJYO0FBcUJBLGdCQUFRLElBQVI7QUFDQSxZQUFJLGFBQUosRUFBbUI7QUFDakIsa0JBQ0UsVUFERixFQUNjLDRCQURkLEVBRUUsQ0FGRixFQUVLLEdBRkwsRUFHRSxPQUhGLEVBR1csWUFIWDtBQUlEO0FBQ0Y7O0FBRUQsYUFBTyxJQUFQLENBQVksUUFBWixFQUFzQixPQUF0QixDQUE4QixVQUFVLElBQVYsRUFBZ0I7QUFDNUMsWUFBSSxNQUFNLFNBQVMsSUFBVCxDQUFWO0FBQ0EsWUFBSSxPQUFPLE9BQU8sR0FBUCxDQUFXLFVBQVgsRUFBdUIsR0FBdkIsRUFBNEIsSUFBNUIsQ0FBWDtBQUNBLFlBQUksUUFBUSxJQUFJLEtBQUosRUFBWjtBQUNBLGNBQU0sS0FBTixFQUFhLElBQWIsRUFBbUIsSUFBbkIsRUFDRSxFQURGLEVBQ00sVUFETixFQUNrQixHQURsQixFQUN1QixTQUR2QixFQUVFLEVBRkYsRUFFTSxXQUZOLEVBRW1CLEdBRm5CLEVBRXdCLElBRnhCLEVBR0UsYUFIRixFQUdpQixHQUhqQixFQUdzQixJQUh0QixFQUc0QixHQUg1QixFQUdpQyxJQUhqQyxFQUd1QyxHQUh2QztBQUlBLGdCQUFRLEtBQVI7QUFDQSxhQUNFLEtBREYsRUFDUyxJQURULEVBQ2UsS0FEZixFQUNzQixhQUR0QixFQUNxQyxHQURyQyxFQUMwQyxJQUQxQyxFQUNnRCxJQURoRCxFQUVFLEtBRkYsRUFHRSxHQUhGO0FBSUQsT0FiRDs7QUFlQSxhQUFPLElBQVAsQ0FBWSxZQUFaLEVBQTBCLE9BQTFCLENBQWtDLFVBQVUsSUFBVixFQUFnQjtBQUNoRCxZQUFJLE9BQU8sYUFBYSxJQUFiLENBQVg7QUFDQSxZQUFJLE9BQU8sYUFBYSxJQUFiLENBQVg7QUFDQSxZQUFJLElBQUosRUFBVSxPQUFWO0FBQ0EsWUFBSSxRQUFRLElBQUksS0FBSixFQUFaO0FBQ0EsY0FBTSxFQUFOLEVBQVUsR0FBVixFQUFlLElBQWYsRUFBcUIsR0FBckI7QUFDQSxZQUFJLFlBQVksSUFBWixDQUFKLEVBQXVCO0FBQ3JCLGNBQUksSUFBSSxLQUFLLE1BQWI7QUFDQSxpQkFBTyxJQUFJLE1BQUosQ0FBVyxHQUFYLENBQWUsVUFBZixFQUEyQixHQUEzQixFQUFnQyxJQUFoQyxDQUFQO0FBQ0Esb0JBQVUsSUFBSSxNQUFKLENBQVcsR0FBWCxDQUFlLGFBQWYsRUFBOEIsR0FBOUIsRUFBbUMsSUFBbkMsQ0FBVjtBQUNBLGdCQUNFLEtBQUssQ0FBTCxFQUFRLFVBQVUsQ0FBVixFQUFhO0FBQ25CLG1CQUFPLE9BQU8sR0FBUCxHQUFhLENBQWIsR0FBaUIsR0FBeEI7QUFDRCxXQUZELENBREYsRUFHTSxJQUhOLEVBSUUsS0FBSyxDQUFMLEVBQVEsVUFBVSxDQUFWLEVBQWE7QUFDbkIsbUJBQU8sVUFBVSxHQUFWLEdBQWdCLENBQWhCLEdBQW9CLElBQXBCLEdBQTJCLElBQTNCLEdBQWtDLEdBQWxDLEdBQXdDLENBQXhDLEdBQTRDLElBQW5EO0FBQ0QsV0FGRCxFQUVHLElBRkgsQ0FFUSxFQUZSLENBSkY7QUFPQSxlQUNFLEtBREYsRUFDUyxLQUFLLENBQUwsRUFBUSxVQUFVLENBQVYsRUFBYTtBQUMxQixtQkFBTyxPQUFPLEdBQVAsR0FBYSxDQUFiLEdBQWlCLE1BQWpCLEdBQTBCLE9BQTFCLEdBQW9DLEdBQXBDLEdBQTBDLENBQTFDLEdBQThDLEdBQXJEO0FBQ0QsV0FGTSxFQUVKLElBRkksQ0FFQyxJQUZELENBRFQsRUFHaUIsSUFIakIsRUFJRSxLQUpGLEVBS0UsR0FMRjtBQU1ELFNBakJELE1BaUJPO0FBQ0wsaUJBQU8sT0FBTyxHQUFQLENBQVcsVUFBWCxFQUF1QixHQUF2QixFQUE0QixJQUE1QixDQUFQO0FBQ0Esb0JBQVUsT0FBTyxHQUFQLENBQVcsYUFBWCxFQUEwQixHQUExQixFQUErQixJQUEvQixDQUFWO0FBQ0EsZ0JBQ0UsSUFERixFQUNRLElBRFIsRUFFRSxhQUZGLEVBRWlCLEdBRmpCLEVBRXNCLElBRnRCLEVBRTRCLEdBRjVCLEVBRWlDLElBRmpDLEVBRXVDLEdBRnZDO0FBR0EsZUFDRSxLQURGLEVBQ1MsSUFEVCxFQUNlLEtBRGYsRUFDc0IsT0FEdEIsRUFDK0IsSUFEL0IsRUFFRSxLQUZGLEVBR0UsR0FIRjtBQUlEO0FBQ0QsZ0JBQVEsS0FBUjtBQUNELE9BbkNEOztBQXFDQSxhQUFPLElBQUksT0FBSixFQUFQO0FBQ0QsS0E5R00sRUFIRjtBQWtITCxhQUFTO0FBbEhKLEdBQVA7QUFvSEQsQ0FscEZEOzs7QUN0UkEsSUFBSSxtQkFBbUIsQ0FBdkI7O0FBRUEsSUFBSSxXQUFXLENBQWY7O0FBRUEsU0FBUyxlQUFULENBQTBCLElBQTFCLEVBQWdDLElBQWhDLEVBQXNDO0FBQ3BDLE9BQUssRUFBTCxHQUFXLGtCQUFYO0FBQ0EsT0FBSyxJQUFMLEdBQVksSUFBWjtBQUNBLE9BQUssSUFBTCxHQUFZLElBQVo7QUFDRDs7QUFFRCxTQUFTLFNBQVQsQ0FBb0IsR0FBcEIsRUFBeUI7QUFDdkIsU0FBTyxJQUFJLE9BQUosQ0FBWSxLQUFaLEVBQW1CLE1BQW5CLEVBQTJCLE9BQTNCLENBQW1DLElBQW5DLEVBQXlDLEtBQXpDLENBQVA7QUFDRDs7QUFFRCxTQUFTLFVBQVQsQ0FBcUIsR0FBckIsRUFBMEI7QUFDeEIsTUFBSSxJQUFJLE1BQUosS0FBZSxDQUFuQixFQUFzQjtBQUNwQixXQUFPLEVBQVA7QUFDRDs7QUFFRCxNQUFJLFlBQVksSUFBSSxNQUFKLENBQVcsQ0FBWCxDQUFoQjtBQUNBLE1BQUksV0FBVyxJQUFJLE1BQUosQ0FBVyxJQUFJLE1BQUosR0FBYSxDQUF4QixDQUFmOztBQUVBLE1BQUksSUFBSSxNQUFKLEdBQWEsQ0FBYixJQUNBLGNBQWMsUUFEZCxLQUVDLGNBQWMsR0FBZCxJQUFxQixjQUFjLEdBRnBDLENBQUosRUFFOEM7QUFDNUMsV0FBTyxDQUFDLE1BQU0sVUFBVSxJQUFJLE1BQUosQ0FBVyxDQUFYLEVBQWMsSUFBSSxNQUFKLEdBQWEsQ0FBM0IsQ0FBVixDQUFOLEdBQWlELEdBQWxELENBQVA7QUFDRDs7QUFFRCxNQUFJLFFBQVEsNENBQTRDLElBQTVDLENBQWlELEdBQWpELENBQVo7QUFDQSxNQUFJLEtBQUosRUFBVztBQUNULFdBQ0UsV0FBVyxJQUFJLE1BQUosQ0FBVyxDQUFYLEVBQWMsTUFBTSxLQUFwQixDQUFYLEVBQ0MsTUFERCxDQUNRLFdBQVcsTUFBTSxDQUFOLENBQVgsQ0FEUixFQUVDLE1BRkQsQ0FFUSxXQUFXLElBQUksTUFBSixDQUFXLE1BQU0sS0FBTixHQUFjLE1BQU0sQ0FBTixFQUFTLE1BQWxDLENBQVgsQ0FGUixDQURGO0FBS0Q7O0FBRUQsTUFBSSxXQUFXLElBQUksS0FBSixDQUFVLEdBQVYsQ0FBZjtBQUNBLE1BQUksU0FBUyxNQUFULEtBQW9CLENBQXhCLEVBQTJCO0FBQ3pCLFdBQU8sQ0FBQyxNQUFNLFVBQVUsR0FBVixDQUFOLEdBQXVCLEdBQXhCLENBQVA7QUFDRDs7QUFFRCxNQUFJLFNBQVMsRUFBYjtBQUNBLE9BQUssSUFBSSxJQUFJLENBQWIsRUFBZ0IsSUFBSSxTQUFTLE1BQTdCLEVBQXFDLEVBQUUsQ0FBdkMsRUFBMEM7QUFDeEMsYUFBUyxPQUFPLE1BQVAsQ0FBYyxXQUFXLFNBQVMsQ0FBVCxDQUFYLENBQWQsQ0FBVDtBQUNEO0FBQ0QsU0FBTyxNQUFQO0FBQ0Q7O0FBRUQsU0FBUyxnQkFBVCxDQUEyQixHQUEzQixFQUFnQztBQUM5QixTQUFPLE1BQU0sV0FBVyxHQUFYLEVBQWdCLElBQWhCLENBQXFCLElBQXJCLENBQU4sR0FBbUMsR0FBMUM7QUFDRDs7QUFFRCxTQUFTLGFBQVQsQ0FBd0IsSUFBeEIsRUFBOEIsSUFBOUIsRUFBb0M7QUFDbEMsU0FBTyxJQUFJLGVBQUosQ0FBb0IsSUFBcEIsRUFBMEIsaUJBQWlCLE9BQU8sRUFBeEIsQ0FBMUIsQ0FBUDtBQUNEOztBQUVELFNBQVMsU0FBVCxDQUFvQixDQUFwQixFQUF1QjtBQUNyQixTQUFRLE9BQU8sQ0FBUCxLQUFhLFVBQWIsSUFBMkIsQ0FBQyxFQUFFLFNBQS9CLElBQ0EsYUFBYSxlQURwQjtBQUVEOztBQUVELFNBQVMsS0FBVCxDQUFnQixDQUFoQixFQUFtQixJQUFuQixFQUF5QjtBQUN2QixNQUFJLE9BQU8sQ0FBUCxLQUFhLFVBQWpCLEVBQTZCO0FBQzNCLFdBQU8sSUFBSSxlQUFKLENBQW9CLFFBQXBCLEVBQThCLENBQTlCLENBQVA7QUFDRDtBQUNELFNBQU8sQ0FBUDtBQUNEOztBQUVELE9BQU8sT0FBUCxHQUFpQjtBQUNmLG1CQUFpQixlQURGO0FBRWYsVUFBUSxhQUZPO0FBR2YsYUFBVyxTQUhJO0FBSWYsU0FBTyxLQUpRO0FBS2YsWUFBVTtBQUxLLENBQWpCOzs7O0FDcEVBLElBQUksZUFBZSxRQUFRLHVCQUFSLENBQW5CO0FBQ0EsSUFBSSxnQkFBZ0IsUUFBUSxtQkFBUixDQUFwQjtBQUNBLElBQUksU0FBUyxRQUFRLGVBQVIsQ0FBYjs7QUFFQSxJQUFJLFlBQVksUUFBUSw2QkFBUixDQUFoQjtBQUNBLElBQUksYUFBYSxRQUFRLHdCQUFSLENBQWpCOztBQUVBLElBQUksWUFBWSxDQUFoQjtBQUNBLElBQUksV0FBVyxDQUFmO0FBQ0EsSUFBSSxlQUFlLENBQW5COztBQUVBLElBQUksVUFBVSxJQUFkO0FBQ0EsSUFBSSxtQkFBbUIsSUFBdkI7QUFDQSxJQUFJLFdBQVcsSUFBZjtBQUNBLElBQUksb0JBQW9CLElBQXhCO0FBQ0EsSUFBSSxTQUFTLElBQWI7QUFDQSxJQUFJLGtCQUFrQixJQUF0Qjs7QUFFQSxJQUFJLDBCQUEwQixLQUE5Qjs7QUFFQSxJQUFJLGlCQUFpQixNQUFyQjtBQUNBLElBQUksaUJBQWlCLE1BQXJCOztBQUVBLE9BQU8sT0FBUCxHQUFpQixTQUFTLGlCQUFULENBQTRCLEVBQTVCLEVBQWdDLFVBQWhDLEVBQTRDLFdBQTVDLEVBQXlELEtBQXpELEVBQWdFO0FBQy9FLE1BQUksYUFBYSxFQUFqQjtBQUNBLE1BQUksZUFBZSxDQUFuQjs7QUFFQSxNQUFJLGVBQWU7QUFDakIsYUFBUyxnQkFEUTtBQUVqQixjQUFVO0FBRk8sR0FBbkI7O0FBS0EsTUFBSSxXQUFXLHNCQUFmLEVBQXVDO0FBQ3JDLGlCQUFhLE1BQWIsR0FBc0IsZUFBdEI7QUFDRDs7QUFFRCxXQUFTLGlCQUFULENBQTRCLE1BQTVCLEVBQW9DO0FBQ2xDLFNBQUssRUFBTCxHQUFVLGNBQVY7QUFDQSxlQUFXLEtBQUssRUFBaEIsSUFBc0IsSUFBdEI7QUFDQSxTQUFLLE1BQUwsR0FBYyxNQUFkO0FBQ0EsU0FBSyxRQUFMLEdBQWdCLFlBQWhCO0FBQ0EsU0FBSyxTQUFMLEdBQWlCLENBQWpCO0FBQ0EsU0FBSyxJQUFMLEdBQVksQ0FBWjtBQUNEOztBQUVELG9CQUFrQixTQUFsQixDQUE0QixJQUE1QixHQUFtQyxZQUFZO0FBQzdDLFNBQUssTUFBTCxDQUFZLElBQVo7QUFDRCxHQUZEOztBQUlBLE1BQUksYUFBYSxFQUFqQjs7QUFFQSxXQUFTLG1CQUFULENBQThCLElBQTlCLEVBQW9DO0FBQ2xDLFFBQUksU0FBUyxXQUFXLEdBQVgsRUFBYjtBQUNBLFFBQUksQ0FBQyxNQUFMLEVBQWE7QUFDWCxlQUFTLElBQUksaUJBQUosQ0FBc0IsWUFBWSxNQUFaLENBQzdCLElBRDZCLEVBRTdCLHVCQUY2QixFQUc3QixJQUg2QixFQUk3QixLQUo2QixFQUl0QixPQUpBLENBQVQ7QUFLRDtBQUNELGlCQUFhLE1BQWIsRUFBcUIsSUFBckIsRUFBMkIsY0FBM0IsRUFBMkMsQ0FBQyxDQUE1QyxFQUErQyxDQUFDLENBQWhELEVBQW1ELENBQW5ELEVBQXNELENBQXREO0FBQ0EsV0FBTyxNQUFQO0FBQ0Q7O0FBRUQsV0FBUyxvQkFBVCxDQUErQixRQUEvQixFQUF5QztBQUN2QyxlQUFXLElBQVgsQ0FBZ0IsUUFBaEI7QUFDRDs7QUFFRCxXQUFTLFlBQVQsQ0FDRSxRQURGLEVBRUUsSUFGRixFQUdFLEtBSEYsRUFJRSxJQUpGLEVBS0UsS0FMRixFQU1FLFVBTkYsRUFPRSxJQVBGLEVBT1E7QUFDTixhQUFTLE1BQVQsQ0FBZ0IsSUFBaEI7QUFDQSxRQUFJLElBQUosRUFBVTtBQUNSLFVBQUksZ0JBQWdCLElBQXBCO0FBQ0EsVUFBSSxDQUFDLElBQUQsS0FDQSxDQUFDLGFBQWEsSUFBYixDQUFELElBQ0EsY0FBYyxJQUFkLEtBQXVCLENBQUMsYUFBYSxLQUFLLElBQWxCLENBRnhCLENBQUosRUFFdUQ7QUFDckQsd0JBQWdCLFdBQVcsc0JBQVgsR0FDWixlQURZLEdBRVosaUJBRko7QUFHRDtBQUNELGtCQUFZLFdBQVosQ0FDRSxTQUFTLE1BRFgsRUFFRSxJQUZGLEVBR0UsS0FIRixFQUlFLGFBSkYsRUFLRSxDQUxGO0FBTUQsS0FmRCxNQWVPO0FBQ0wsU0FBRyxVQUFILENBQWMsdUJBQWQsRUFBdUMsVUFBdkMsRUFBbUQsS0FBbkQ7QUFDQSxlQUFTLE1BQVQsQ0FBZ0IsS0FBaEIsR0FBd0IsU0FBUyxnQkFBakM7QUFDQSxlQUFTLE1BQVQsQ0FBZ0IsS0FBaEIsR0FBd0IsS0FBeEI7QUFDQSxlQUFTLE1BQVQsQ0FBZ0IsU0FBaEIsR0FBNEIsQ0FBNUI7QUFDQSxlQUFTLE1BQVQsQ0FBZ0IsVUFBaEIsR0FBNkIsVUFBN0I7QUFDRDs7QUFFRCxRQUFJLFFBQVEsSUFBWjtBQUNBLFFBQUksQ0FBQyxJQUFMLEVBQVc7QUFDVCxjQUFRLFNBQVMsTUFBVCxDQUFnQixLQUF4QjtBQUNFLGFBQUssZ0JBQUw7QUFDQSxhQUFLLE9BQUw7QUFDRSxrQkFBUSxnQkFBUjtBQUNBOztBQUVGLGFBQUssaUJBQUw7QUFDQSxhQUFLLFFBQUw7QUFDRSxrQkFBUSxpQkFBUjtBQUNBOztBQUVGLGFBQUssZUFBTDtBQUNBLGFBQUssTUFBTDtBQUNFLGtCQUFRLGVBQVI7QUFDQTs7QUFFRjs7QUFoQkY7QUFtQkEsZUFBUyxNQUFULENBQWdCLEtBQWhCLEdBQXdCLEtBQXhCO0FBQ0Q7QUFDRCxhQUFTLElBQVQsR0FBZ0IsS0FBaEI7O0FBRUE7OztBQUdBO0FBQ0EsUUFBSSxZQUFZLEtBQWhCO0FBQ0EsUUFBSSxZQUFZLENBQWhCLEVBQW1CO0FBQ2pCLGtCQUFZLFNBQVMsTUFBVCxDQUFnQixVQUE1QjtBQUNBLFVBQUksVUFBVSxpQkFBZCxFQUFpQztBQUMvQixzQkFBYyxDQUFkO0FBQ0QsT0FGRCxNQUVPLElBQUksVUFBVSxlQUFkLEVBQStCO0FBQ3BDLHNCQUFjLENBQWQ7QUFDRDtBQUNGO0FBQ0QsYUFBUyxTQUFULEdBQXFCLFNBQXJCOztBQUVBO0FBQ0EsUUFBSSxXQUFXLElBQWY7QUFDQSxRQUFJLE9BQU8sQ0FBWCxFQUFjO0FBQ1osaUJBQVcsWUFBWDtBQUNBLFVBQUksWUFBWSxTQUFTLE1BQVQsQ0FBZ0IsU0FBaEM7QUFDQSxVQUFJLGNBQWMsQ0FBbEIsRUFBcUIsV0FBVyxTQUFYO0FBQ3JCLFVBQUksY0FBYyxDQUFsQixFQUFxQixXQUFXLFFBQVg7QUFDckIsVUFBSSxjQUFjLENBQWxCLEVBQXFCLFdBQVcsWUFBWDtBQUN0QjtBQUNELGFBQVMsUUFBVCxHQUFvQixRQUFwQjtBQUNEOztBQUVELFdBQVMsZUFBVCxDQUEwQixRQUExQixFQUFvQztBQUNsQyxVQUFNLGFBQU47O0FBR0EsV0FBTyxXQUFXLFNBQVMsRUFBcEIsQ0FBUDtBQUNBLGFBQVMsTUFBVCxDQUFnQixPQUFoQjtBQUNBLGFBQVMsTUFBVCxHQUFrQixJQUFsQjtBQUNEOztBQUVELFdBQVMsY0FBVCxDQUF5QixPQUF6QixFQUFrQyxVQUFsQyxFQUE4QztBQUM1QyxRQUFJLFNBQVMsWUFBWSxNQUFaLENBQW1CLElBQW5CLEVBQXlCLHVCQUF6QixFQUFrRCxJQUFsRCxDQUFiO0FBQ0EsUUFBSSxXQUFXLElBQUksaUJBQUosQ0FBc0IsT0FBTyxPQUE3QixDQUFmO0FBQ0EsVUFBTSxhQUFOOztBQUVBLGFBQVMsWUFBVCxDQUF1QixPQUF2QixFQUFnQztBQUM5QixVQUFJLENBQUMsT0FBTCxFQUFjO0FBQ1o7QUFDQSxpQkFBUyxRQUFULEdBQW9CLFlBQXBCO0FBQ0EsaUJBQVMsU0FBVCxHQUFxQixDQUFyQjtBQUNBLGlCQUFTLElBQVQsR0FBZ0IsZ0JBQWhCO0FBQ0QsT0FMRCxNQUtPLElBQUksT0FBTyxPQUFQLEtBQW1CLFFBQXZCLEVBQWlDO0FBQ3RDLGVBQU8sT0FBUDtBQUNBLGlCQUFTLFFBQVQsR0FBb0IsWUFBcEI7QUFDQSxpQkFBUyxTQUFULEdBQXFCLFVBQVUsQ0FBL0I7QUFDQSxpQkFBUyxJQUFULEdBQWdCLGdCQUFoQjtBQUNELE9BTE0sTUFLQTtBQUNMLFlBQUksT0FBTyxJQUFYO0FBQ0EsWUFBSSxRQUFRLGNBQVo7QUFDQSxZQUFJLFdBQVcsQ0FBQyxDQUFoQjtBQUNBLFlBQUksWUFBWSxDQUFDLENBQWpCO0FBQ0EsWUFBSSxhQUFhLENBQWpCO0FBQ0EsWUFBSSxRQUFRLENBQVo7QUFDQSxZQUFJLE1BQU0sT0FBTixDQUFjLE9BQWQsS0FDQSxhQUFhLE9BQWIsQ0FEQSxJQUVBLGNBQWMsT0FBZCxDQUZKLEVBRTRCO0FBQzFCLGlCQUFPLE9BQVA7QUFDRCxTQUpELE1BSU87O0FBRUwsY0FBSSxVQUFVLE9BQWQsRUFBdUI7QUFDckIsbUJBQU8sUUFBUSxJQUFmO0FBRUQ7QUFDRCxjQUFJLFdBQVcsT0FBZixFQUF3Qjs7QUFFdEIsb0JBQVEsV0FBVyxRQUFRLEtBQW5CLENBQVI7QUFDRDtBQUNELGNBQUksZUFBZSxPQUFuQixFQUE0Qjs7QUFFMUIsdUJBQVcsVUFBVSxRQUFRLFNBQWxCLENBQVg7QUFDRDtBQUNELGNBQUksV0FBVyxPQUFmLEVBQXdCOztBQUV0Qix3QkFBWSxRQUFRLEtBQVIsR0FBZ0IsQ0FBNUI7QUFDRDtBQUNELGNBQUksVUFBVSxPQUFkLEVBQXVCOztBQUVyQixvQkFBUSxhQUFhLFFBQVEsSUFBckIsQ0FBUjtBQUNEO0FBQ0QsY0FBSSxZQUFZLE9BQWhCLEVBQXlCO0FBQ3ZCLHlCQUFhLFFBQVEsTUFBUixHQUFpQixDQUE5QjtBQUNELFdBRkQsTUFFTztBQUNMLHlCQUFhLFNBQWI7QUFDQSxnQkFBSSxVQUFVLGlCQUFWLElBQStCLFVBQVUsUUFBN0MsRUFBdUQ7QUFDckQsNEJBQWMsQ0FBZDtBQUNELGFBRkQsTUFFTyxJQUFJLFVBQVUsZUFBVixJQUE2QixVQUFVLE1BQTNDLEVBQW1EO0FBQ3hELDRCQUFjLENBQWQ7QUFDRDtBQUNGO0FBQ0Y7QUFDRCxxQkFDRSxRQURGLEVBRUUsSUFGRixFQUdFLEtBSEYsRUFJRSxRQUpGLEVBS0UsU0FMRixFQU1FLFVBTkYsRUFPRSxLQVBGO0FBUUQ7O0FBRUQsYUFBTyxZQUFQO0FBQ0Q7O0FBRUQsaUJBQWEsT0FBYjs7QUFFQSxpQkFBYSxTQUFiLEdBQXlCLFVBQXpCO0FBQ0EsaUJBQWEsU0FBYixHQUF5QixRQUF6QjtBQUNBLGlCQUFhLE9BQWIsR0FBdUIsVUFBVSxJQUFWLEVBQWdCLE1BQWhCLEVBQXdCO0FBQzdDLGFBQU8sT0FBUCxDQUFlLElBQWYsRUFBcUIsTUFBckI7QUFDQSxhQUFPLFlBQVA7QUFDRCxLQUhEO0FBSUEsaUJBQWEsT0FBYixHQUF1QixZQUFZO0FBQ2pDLHNCQUFnQixRQUFoQjtBQUNELEtBRkQ7O0FBSUEsV0FBTyxZQUFQO0FBQ0Q7O0FBRUQsU0FBTztBQUNMLFlBQVEsY0FESDtBQUVMLGtCQUFjLG1CQUZUO0FBR0wsbUJBQWUsb0JBSFY7QUFJTCxpQkFBYSxVQUFVLFFBQVYsRUFBb0I7QUFDL0IsVUFBSSxPQUFPLFFBQVAsS0FBb0IsVUFBcEIsSUFDQSxTQUFTLFNBQVQsWUFBOEIsaUJBRGxDLEVBQ3FEO0FBQ25ELGVBQU8sU0FBUyxTQUFoQjtBQUNEO0FBQ0QsYUFBTyxJQUFQO0FBQ0QsS0FWSTtBQVdMLFdBQU8sWUFBWTtBQUNqQixhQUFPLFVBQVAsRUFBbUIsT0FBbkIsQ0FBMkIsZUFBM0I7QUFDRDtBQWJJLEdBQVA7QUFlRCxDQWpQRDs7Ozs7QUN0QkEsT0FBTyxPQUFQLEdBQWlCLFNBQVMsb0JBQVQsQ0FBK0IsRUFBL0IsRUFBbUMsTUFBbkMsRUFBMkM7QUFDMUQsTUFBSSxhQUFhLEVBQWpCOztBQUVBLFdBQVMsZ0JBQVQsQ0FBMkIsS0FBM0IsRUFBa0M7O0FBRWhDLFFBQUksT0FBTyxNQUFNLFdBQU4sRUFBWDtBQUNBLFFBQUksR0FBSjtBQUNBLFFBQUk7QUFDRixZQUFNLFdBQVcsSUFBWCxJQUFtQixHQUFHLFlBQUgsQ0FBZ0IsSUFBaEIsQ0FBekI7QUFDRCxLQUZELENBRUUsT0FBTyxDQUFQLEVBQVUsQ0FBRTtBQUNkLFdBQU8sQ0FBQyxDQUFDLEdBQVQ7QUFDRDs7QUFFRCxPQUFLLElBQUksSUFBSSxDQUFiLEVBQWdCLElBQUksT0FBTyxVQUFQLENBQWtCLE1BQXRDLEVBQThDLEVBQUUsQ0FBaEQsRUFBbUQ7QUFDakQsUUFBSSxPQUFPLE9BQU8sVUFBUCxDQUFrQixDQUFsQixDQUFYO0FBQ0EsUUFBSSxDQUFDLGlCQUFpQixJQUFqQixDQUFMLEVBQTZCO0FBQzNCLGFBQU8sU0FBUDtBQUNBLGFBQU8sTUFBUCxDQUFjLE1BQU0sSUFBTixHQUFhLDZHQUEzQjtBQUNBLGFBQU8sSUFBUDtBQUNEO0FBQ0Y7O0FBRUQsU0FBTyxrQkFBUCxDQUEwQixPQUExQixDQUFrQyxnQkFBbEM7O0FBRUEsU0FBTztBQUNMLGdCQUFZLFVBRFA7QUFFTCxhQUFTLFlBQVk7QUFDbkIsYUFBTyxJQUFQLENBQVksVUFBWixFQUF3QixPQUF4QixDQUFnQyxVQUFVLElBQVYsRUFBZ0I7QUFDOUMsWUFBSSxDQUFDLGlCQUFpQixJQUFqQixDQUFMLEVBQTZCO0FBQzNCLGdCQUFNLElBQUksS0FBSixDQUFVLHVDQUF1QyxJQUFqRCxDQUFOO0FBQ0Q7QUFDRixPQUpEO0FBS0Q7QUFSSSxHQUFQO0FBVUQsQ0FsQ0Q7Ozs7QUNEQSxJQUFJLFNBQVMsUUFBUSxlQUFSLENBQWI7QUFDQSxJQUFJLFNBQVMsUUFBUSxlQUFSLENBQWI7O0FBRUE7QUFDQSxJQUFJLGlCQUFpQixNQUFyQjtBQUNBLElBQUksa0JBQWtCLE1BQXRCOztBQUVBLElBQUksZ0JBQWdCLE1BQXBCO0FBQ0EsSUFBSSxpQ0FBaUMsTUFBckM7O0FBRUEsSUFBSSx1QkFBdUIsTUFBM0I7QUFDQSxJQUFJLHNCQUFzQixNQUExQjtBQUNBLElBQUksd0JBQXdCLE1BQTVCO0FBQ0EsSUFBSSw4QkFBOEIsTUFBbEM7O0FBRUEsSUFBSSwwQkFBMEIsTUFBOUI7QUFDQSxJQUFJLHVDQUF1QyxNQUEzQztBQUNBLElBQUksK0NBQStDLE1BQW5EO0FBQ0EsSUFBSSx1Q0FBdUMsTUFBM0M7QUFDQSxJQUFJLDZCQUE2QixNQUFqQzs7QUFFQSxJQUFJLG9CQUFvQixNQUF4QjtBQUNBLElBQUksbUJBQW1CLE1BQXZCO0FBQ0EsSUFBSSxXQUFXLE1BQWY7O0FBRUEsSUFBSSxVQUFVLE1BQWQ7O0FBRUEsSUFBSSxxQkFBcUIsTUFBekI7O0FBRUEsSUFBSSwwQkFBMEIsQ0FDNUIsT0FENEIsQ0FBOUI7O0FBSUE7QUFDQTtBQUNBLElBQUksd0JBQXdCLEVBQTVCO0FBQ0Esc0JBQXNCLE9BQXRCLElBQWlDLENBQWpDOztBQUVBO0FBQ0E7QUFDQSxJQUFJLG1CQUFtQixFQUF2QjtBQUNBLGlCQUFpQixnQkFBakIsSUFBcUMsQ0FBckM7QUFDQSxpQkFBaUIsUUFBakIsSUFBNkIsQ0FBN0I7QUFDQSxpQkFBaUIsaUJBQWpCLElBQXNDLENBQXRDOztBQUVBLElBQUksV0FBVyxNQUFmO0FBQ0EsSUFBSSxhQUFhLE1BQWpCO0FBQ0EsSUFBSSxZQUFZLE1BQWhCO0FBQ0EsSUFBSSx1QkFBdUIsTUFBM0I7QUFDQSxJQUFJLG9CQUFvQixNQUF4QjtBQUNBLElBQUksbUJBQW1CLE1BQXZCOztBQUVBLElBQUksc0JBQXNCLE1BQTFCOztBQUVBLElBQUksaUJBQWlCLE1BQXJCOztBQUVBLElBQUksaUJBQWlCLE1BQXJCO0FBQ0EsSUFBSSxnQkFBZ0IsTUFBcEI7O0FBRUEsSUFBSSwrQkFBK0IsQ0FDakMsUUFEaUMsRUFFakMsVUFGaUMsRUFHakMsU0FIaUMsRUFJakMsbUJBSmlDLEVBS2pDLGNBTGlDLEVBTWpDLGFBTmlDLEVBT2pDLGNBUGlDLENBQW5DOztBQVVBLElBQUksYUFBYSxFQUFqQjtBQUNBLFdBQVcsdUJBQVgsSUFBc0MsVUFBdEM7QUFDQSxXQUFXLG9DQUFYLElBQW1ELHVCQUFuRDtBQUNBLFdBQVcsb0NBQVgsSUFBbUQsdUJBQW5EO0FBQ0EsV0FBVyw0Q0FBWCxJQUEyRCxnQ0FBM0Q7QUFDQSxXQUFXLDBCQUFYLElBQXlDLGFBQXpDOztBQUVBLE9BQU8sT0FBUCxHQUFpQixTQUFTLFlBQVQsQ0FDZixFQURlLEVBRWYsVUFGZSxFQUdmLE1BSGUsRUFJZixZQUplLEVBS2YsaUJBTGUsRUFNZixLQU5lLEVBTVI7QUFDUCxNQUFJLG1CQUFtQjtBQUNyQixTQUFLLElBRGdCO0FBRXJCLFVBQU0sSUFGZTtBQUdyQixXQUFPO0FBSGMsR0FBdkI7O0FBTUEsTUFBSSxzQkFBc0IsQ0FBQyxNQUFELENBQTFCO0FBQ0EsTUFBSSwyQkFBMkIsQ0FBQyxPQUFELEVBQVUsUUFBVixFQUFvQixTQUFwQixDQUEvQjs7QUFFQSxNQUFJLFdBQVcsUUFBZixFQUF5QjtBQUN2Qiw2QkFBeUIsSUFBekIsQ0FBOEIsT0FBOUI7QUFDRDs7QUFFRCxNQUFJLFdBQVcsMkJBQWYsRUFBNEM7QUFDMUMsNkJBQXlCLElBQXpCLENBQThCLFNBQTlCLEVBQXlDLFFBQXpDO0FBQ0Q7O0FBRUQsTUFBSSxXQUFXLHdCQUFmLEVBQXlDO0FBQ3ZDLDZCQUF5QixJQUF6QixDQUE4QixTQUE5QjtBQUNEOztBQUVELE1BQUksYUFBYSxDQUFDLE9BQUQsQ0FBakI7QUFDQSxNQUFJLFdBQVcsc0JBQWYsRUFBdUM7QUFDckMsZUFBVyxJQUFYLENBQWdCLFlBQWhCLEVBQThCLFNBQTlCO0FBQ0Q7QUFDRCxNQUFJLFdBQVcsaUJBQWYsRUFBa0M7QUFDaEMsZUFBVyxJQUFYLENBQWdCLE9BQWhCLEVBQXlCLFNBQXpCO0FBQ0Q7O0FBRUQsV0FBUyxxQkFBVCxDQUFnQyxNQUFoQyxFQUF3QyxPQUF4QyxFQUFpRCxZQUFqRCxFQUErRDtBQUM3RCxTQUFLLE1BQUwsR0FBYyxNQUFkO0FBQ0EsU0FBSyxPQUFMLEdBQWUsT0FBZjtBQUNBLFNBQUssWUFBTCxHQUFvQixZQUFwQjs7QUFFQSxRQUFJLElBQUksQ0FBUjtBQUNBLFFBQUksSUFBSSxDQUFSO0FBQ0EsUUFBSSxPQUFKLEVBQWE7QUFDWCxVQUFJLFFBQVEsS0FBWjtBQUNBLFVBQUksUUFBUSxNQUFaO0FBQ0QsS0FIRCxNQUdPLElBQUksWUFBSixFQUFrQjtBQUN2QixVQUFJLGFBQWEsS0FBakI7QUFDQSxVQUFJLGFBQWEsTUFBakI7QUFDRDtBQUNELFNBQUssS0FBTCxHQUFhLENBQWI7QUFDQSxTQUFLLE1BQUwsR0FBYyxDQUFkO0FBQ0Q7O0FBRUQsV0FBUyxNQUFULENBQWlCLFVBQWpCLEVBQTZCO0FBQzNCLFFBQUksVUFBSixFQUFnQjtBQUNkLFVBQUksV0FBVyxPQUFmLEVBQXdCO0FBQ3RCLG1CQUFXLE9BQVgsQ0FBbUIsUUFBbkIsQ0FBNEIsTUFBNUI7QUFDRDtBQUNELFVBQUksV0FBVyxZQUFmLEVBQTZCO0FBQzNCLG1CQUFXLFlBQVgsQ0FBd0IsYUFBeEIsQ0FBc0MsTUFBdEM7QUFDRDtBQUNGO0FBQ0Y7O0FBRUQsV0FBUyxtQkFBVCxDQUE4QixVQUE5QixFQUEwQyxLQUExQyxFQUFpRCxNQUFqRCxFQUF5RDtBQUN2RCxRQUFJLENBQUMsVUFBTCxFQUFpQjtBQUNmO0FBQ0Q7QUFDRCxRQUFJLFdBQVcsT0FBZixFQUF3QjtBQUN0QixVQUFJLFVBQVUsV0FBVyxPQUFYLENBQW1CLFFBQWpDO0FBQ0EsVUFBSSxLQUFLLEtBQUssR0FBTCxDQUFTLENBQVQsRUFBWSxRQUFRLEtBQXBCLENBQVQ7QUFDQSxVQUFJLEtBQUssS0FBSyxHQUFMLENBQVMsQ0FBVCxFQUFZLFFBQVEsTUFBcEIsQ0FBVDs7QUFFQSxjQUFRLFFBQVIsSUFBb0IsQ0FBcEI7QUFDRCxLQU5ELE1BTU87QUFDTCxVQUFJLGVBQWUsV0FBVyxZQUFYLENBQXdCLGFBQTNDOztBQUVBLG1CQUFhLFFBQWIsSUFBeUIsQ0FBekI7QUFDRDtBQUNGOztBQUVELFdBQVMsTUFBVCxDQUFpQixRQUFqQixFQUEyQixVQUEzQixFQUF1QztBQUNyQyxRQUFJLFVBQUosRUFBZ0I7QUFDZCxVQUFJLFdBQVcsT0FBZixFQUF3QjtBQUN0QixXQUFHLG9CQUFILENBQ0UsY0FERixFQUVFLFFBRkYsRUFHRSxXQUFXLE1BSGIsRUFJRSxXQUFXLE9BQVgsQ0FBbUIsUUFBbkIsQ0FBNEIsT0FKOUIsRUFLRSxDQUxGO0FBTUQsT0FQRCxNQU9PO0FBQ0wsV0FBRyx1QkFBSCxDQUNFLGNBREYsRUFFRSxRQUZGLEVBR0UsZUFIRixFQUlFLFdBQVcsWUFBWCxDQUF3QixhQUF4QixDQUFzQyxZQUp4QztBQUtEO0FBQ0Y7QUFDRjs7QUFFRCxXQUFTLGVBQVQsQ0FBMEIsVUFBMUIsRUFBc0M7QUFDcEMsUUFBSSxTQUFTLGFBQWI7QUFDQSxRQUFJLFVBQVUsSUFBZDtBQUNBLFFBQUksZUFBZSxJQUFuQjs7QUFFQSxRQUFJLE9BQU8sVUFBWDtBQUNBLFFBQUksT0FBTyxVQUFQLEtBQXNCLFFBQTFCLEVBQW9DO0FBQ2xDLGFBQU8sV0FBVyxJQUFsQjtBQUNBLFVBQUksWUFBWSxVQUFoQixFQUE0QjtBQUMxQixpQkFBUyxXQUFXLE1BQVgsR0FBb0IsQ0FBN0I7QUFDRDtBQUNGOztBQUlELFFBQUksT0FBTyxLQUFLLFNBQWhCO0FBQ0EsUUFBSSxTQUFTLFdBQWIsRUFBMEI7QUFDeEIsZ0JBQVUsSUFBVjtBQUVELEtBSEQsTUFHTyxJQUFJLFNBQVMsYUFBYixFQUE0QjtBQUNqQyxnQkFBVSxJQUFWO0FBRUQsS0FITSxNQUdBLElBQUksU0FBUyxjQUFiLEVBQTZCO0FBQ2xDLHFCQUFlLElBQWY7QUFDQSxlQUFTLGVBQVQ7QUFDRCxLQUhNLE1BR0EsQ0FFTjs7QUFFRCxXQUFPLElBQUkscUJBQUosQ0FBMEIsTUFBMUIsRUFBa0MsT0FBbEMsRUFBMkMsWUFBM0MsQ0FBUDtBQUNEOztBQUVELFdBQVMsZUFBVCxDQUNFLEtBREYsRUFFRSxNQUZGLEVBR0UsU0FIRixFQUlFLE1BSkYsRUFLRSxJQUxGLEVBS1E7QUFDTixRQUFJLFNBQUosRUFBZTtBQUNiLFVBQUksVUFBVSxhQUFhLFFBQWIsQ0FBc0I7QUFDbEMsZUFBTyxLQUQyQjtBQUVsQyxnQkFBUSxNQUYwQjtBQUdsQyxnQkFBUSxNQUgwQjtBQUlsQyxjQUFNO0FBSjRCLE9BQXRCLENBQWQ7QUFNQSxjQUFRLFFBQVIsQ0FBaUIsUUFBakIsR0FBNEIsQ0FBNUI7QUFDQSxhQUFPLElBQUkscUJBQUosQ0FBMEIsYUFBMUIsRUFBeUMsT0FBekMsRUFBa0QsSUFBbEQsQ0FBUDtBQUNELEtBVEQsTUFTTztBQUNMLFVBQUksS0FBSyxrQkFBa0IsTUFBbEIsQ0FBeUI7QUFDaEMsZUFBTyxLQUR5QjtBQUVoQyxnQkFBUSxNQUZ3QjtBQUdoQyxnQkFBUTtBQUh3QixPQUF6QixDQUFUO0FBS0EsU0FBRyxhQUFILENBQWlCLFFBQWpCLEdBQTRCLENBQTVCO0FBQ0EsYUFBTyxJQUFJLHFCQUFKLENBQTBCLGVBQTFCLEVBQTJDLElBQTNDLEVBQWlELEVBQWpELENBQVA7QUFDRDtBQUNGOztBQUVELFdBQVMsZ0JBQVQsQ0FBMkIsVUFBM0IsRUFBdUM7QUFDckMsV0FBTyxlQUFlLFdBQVcsT0FBWCxJQUFzQixXQUFXLFlBQWhELENBQVA7QUFDRDs7QUFFRCxXQUFTLGdCQUFULENBQTJCLFVBQTNCLEVBQXVDLENBQXZDLEVBQTBDLENBQTFDLEVBQTZDO0FBQzNDLFFBQUksVUFBSixFQUFnQjtBQUNkLFVBQUksV0FBVyxPQUFmLEVBQXdCO0FBQ3RCLG1CQUFXLE9BQVgsQ0FBbUIsTUFBbkIsQ0FBMEIsQ0FBMUIsRUFBNkIsQ0FBN0I7QUFDRCxPQUZELE1BRU8sSUFBSSxXQUFXLFlBQWYsRUFBNkI7QUFDbEMsbUJBQVcsWUFBWCxDQUF3QixNQUF4QixDQUErQixDQUEvQixFQUFrQyxDQUFsQztBQUNEO0FBQ0Y7QUFDRjs7QUFFRCxNQUFJLG1CQUFtQixDQUF2QjtBQUNBLE1BQUksaUJBQWlCLEVBQXJCOztBQUVBLFdBQVMsZUFBVCxHQUE0QjtBQUMxQixTQUFLLEVBQUwsR0FBVSxrQkFBVjtBQUNBLG1CQUFlLEtBQUssRUFBcEIsSUFBMEIsSUFBMUI7O0FBRUEsU0FBSyxXQUFMLEdBQW1CLEdBQUcsaUJBQUgsRUFBbkI7QUFDQSxTQUFLLEtBQUwsR0FBYSxDQUFiO0FBQ0EsU0FBSyxNQUFMLEdBQWMsQ0FBZDs7QUFFQSxTQUFLLGdCQUFMLEdBQXdCLEVBQXhCO0FBQ0EsU0FBSyxlQUFMLEdBQXVCLElBQXZCO0FBQ0EsU0FBSyxpQkFBTCxHQUF5QixJQUF6QjtBQUNBLFNBQUssc0JBQUwsR0FBOEIsSUFBOUI7QUFDRDs7QUFFRCxXQUFTLFVBQVQsQ0FBcUIsV0FBckIsRUFBa0M7QUFDaEMsZ0JBQVksZ0JBQVosQ0FBNkIsT0FBN0IsQ0FBcUMsTUFBckM7QUFDQSxXQUFPLFlBQVksZUFBbkI7QUFDQSxXQUFPLFlBQVksaUJBQW5CO0FBQ0EsV0FBTyxZQUFZLHNCQUFuQjtBQUNEOztBQUVELFdBQVMsT0FBVCxDQUFrQixXQUFsQixFQUErQjtBQUM3QixRQUFJLFNBQVMsWUFBWSxXQUF6Qjs7QUFFQSxPQUFHLGlCQUFILENBQXFCLE1BQXJCO0FBQ0EsZ0JBQVksV0FBWixHQUEwQixJQUExQjtBQUNBLFVBQU0sZ0JBQU47QUFDQSxXQUFPLGVBQWUsWUFBWSxFQUEzQixDQUFQO0FBQ0Q7O0FBRUQsV0FBUyxpQkFBVCxDQUE0QixXQUE1QixFQUF5QztBQUN2QyxRQUFJLENBQUo7O0FBRUEsT0FBRyxlQUFILENBQW1CLGNBQW5CLEVBQW1DLFlBQVksV0FBL0M7QUFDQSxRQUFJLG1CQUFtQixZQUFZLGdCQUFuQztBQUNBLFNBQUssSUFBSSxDQUFULEVBQVksSUFBSSxpQkFBaUIsTUFBakMsRUFBeUMsRUFBRSxDQUEzQyxFQUE4QztBQUM1QyxhQUFPLHVCQUF1QixDQUE5QixFQUFpQyxpQkFBaUIsQ0FBakIsQ0FBakM7QUFDRDtBQUNELFNBQUssSUFBSSxpQkFBaUIsTUFBMUIsRUFBa0MsSUFBSSxPQUFPLG1CQUE3QyxFQUFrRSxFQUFFLENBQXBFLEVBQXVFO0FBQ3JFLFNBQUcsb0JBQUgsQ0FDRSxjQURGLEVBRUUsdUJBQXVCLENBRnpCLEVBR0UsYUFIRixFQUlFLElBSkYsRUFLRSxDQUxGO0FBTUQ7O0FBRUQsT0FBRyxvQkFBSCxDQUNFLGNBREYsRUFFRSwyQkFGRixFQUdFLGFBSEYsRUFJRSxJQUpGLEVBS0UsQ0FMRjtBQU1BLE9BQUcsb0JBQUgsQ0FDRSxjQURGLEVBRUUsbUJBRkYsRUFHRSxhQUhGLEVBSUUsSUFKRixFQUtFLENBTEY7QUFNQSxPQUFHLG9CQUFILENBQ0UsY0FERixFQUVFLHFCQUZGLEVBR0UsYUFIRixFQUlFLElBSkYsRUFLRSxDQUxGOztBQU9BLFdBQU8sbUJBQVAsRUFBNEIsWUFBWSxlQUF4QztBQUNBLFdBQU8scUJBQVAsRUFBOEIsWUFBWSxpQkFBMUM7QUFDQSxXQUFPLDJCQUFQLEVBQW9DLFlBQVksc0JBQWhEOztBQUVBO0FBQ0EsUUFBSSxTQUFTLEdBQUcsc0JBQUgsQ0FBMEIsY0FBMUIsQ0FBYjtBQUNBLFFBQUksV0FBVyx1QkFBZixFQUF3QyxDQUV2Qzs7QUFFRCxPQUFHLGVBQUgsQ0FBbUIsY0FBbkIsRUFBbUMsaUJBQWlCLElBQXBEO0FBQ0EscUJBQWlCLEdBQWpCLEdBQXVCLGlCQUFpQixJQUF4Qzs7QUFFQTtBQUNBO0FBQ0EsT0FBRyxRQUFIO0FBQ0Q7O0FBRUQsV0FBUyxTQUFULENBQW9CLEVBQXBCLEVBQXdCLEVBQXhCLEVBQTRCO0FBQzFCLFFBQUksY0FBYyxJQUFJLGVBQUosRUFBbEI7QUFDQSxVQUFNLGdCQUFOOztBQUVBLGFBQVMsZUFBVCxDQUEwQixDQUExQixFQUE2QixDQUE3QixFQUFnQztBQUM5QixVQUFJLENBQUo7O0FBSUEsVUFBSSxpQkFBaUIsV0FBVyxrQkFBaEM7O0FBRUEsVUFBSSxRQUFRLENBQVo7QUFDQSxVQUFJLFNBQVMsQ0FBYjs7QUFFQSxVQUFJLGFBQWEsSUFBakI7QUFDQSxVQUFJLGVBQWUsSUFBbkI7O0FBRUEsVUFBSSxjQUFjLElBQWxCO0FBQ0EsVUFBSSxlQUFlLElBQW5CO0FBQ0EsVUFBSSxjQUFjLE1BQWxCO0FBQ0EsVUFBSSxZQUFZLE9BQWhCO0FBQ0EsVUFBSSxhQUFhLENBQWpCOztBQUVBLFVBQUksY0FBYyxJQUFsQjtBQUNBLFVBQUksZ0JBQWdCLElBQXBCO0FBQ0EsVUFBSSxxQkFBcUIsSUFBekI7QUFDQSxVQUFJLHNCQUFzQixLQUExQjs7QUFFQSxVQUFJLE9BQU8sQ0FBUCxLQUFhLFFBQWpCLEVBQTJCO0FBQ3pCLGdCQUFRLElBQUksQ0FBWjtBQUNBLGlCQUFVLElBQUksQ0FBTCxJQUFXLEtBQXBCO0FBQ0QsT0FIRCxNQUdPLElBQUksQ0FBQyxDQUFMLEVBQVE7QUFDYixnQkFBUSxTQUFTLENBQWpCO0FBQ0QsT0FGTSxNQUVBOztBQUVMLFlBQUksVUFBVSxDQUFkOztBQUVBLFlBQUksV0FBVyxPQUFmLEVBQXdCO0FBQ3RCLGNBQUksUUFBUSxRQUFRLEtBQXBCOztBQUVBLGtCQUFRLE1BQU0sQ0FBTixDQUFSO0FBQ0EsbUJBQVMsTUFBTSxDQUFOLENBQVQ7QUFDRCxTQUxELE1BS087QUFDTCxjQUFJLFlBQVksT0FBaEIsRUFBeUI7QUFDdkIsb0JBQVEsU0FBUyxRQUFRLE1BQXpCO0FBQ0Q7QUFDRCxjQUFJLFdBQVcsT0FBZixFQUF3QjtBQUN0QixvQkFBUSxRQUFRLEtBQWhCO0FBQ0Q7QUFDRCxjQUFJLFlBQVksT0FBaEIsRUFBeUI7QUFDdkIscUJBQVMsUUFBUSxNQUFqQjtBQUNEO0FBQ0Y7O0FBRUQsWUFBSSxXQUFXLE9BQVgsSUFDQSxZQUFZLE9BRGhCLEVBQ3lCO0FBQ3ZCLHdCQUNFLFFBQVEsS0FBUixJQUNBLFFBQVEsTUFGVjtBQUdBLGNBQUksTUFBTSxPQUFOLENBQWMsV0FBZCxDQUFKLEVBQWdDLENBRS9CO0FBQ0Y7O0FBRUQsWUFBSSxDQUFDLFdBQUwsRUFBa0I7QUFDaEIsY0FBSSxnQkFBZ0IsT0FBcEIsRUFBNkI7QUFDM0IseUJBQWEsUUFBUSxVQUFSLEdBQXFCLENBQWxDO0FBRUQ7O0FBRUQsY0FBSSxrQkFBa0IsT0FBdEIsRUFBK0I7QUFDN0IsMkJBQWUsQ0FBQyxDQUFDLFFBQVEsWUFBekI7QUFDQSwwQkFBYyxPQUFkO0FBQ0Q7O0FBRUQsY0FBSSxlQUFlLE9BQW5CLEVBQTRCO0FBQzFCLHdCQUFZLFFBQVEsU0FBcEI7QUFDQSxnQkFBSSxDQUFDLFlBQUwsRUFBbUI7QUFDakIsa0JBQUksY0FBYyxZQUFkLElBQThCLGNBQWMsU0FBaEQsRUFBMkQ7O0FBRXpELDhCQUFjLFNBQWQ7QUFDRCxlQUhELE1BR08sSUFBSSxjQUFjLE9BQWQsSUFBeUIsY0FBYyxTQUEzQyxFQUFzRDs7QUFFM0QsOEJBQWMsU0FBZDtBQUNEO0FBQ0YsYUFSRCxNQVFPLENBR047QUFFRjs7QUFFRCxjQUFJLGlCQUFpQixPQUFyQixFQUE4QjtBQUM1QiwwQkFBYyxRQUFRLFdBQXRCO0FBQ0EsZ0JBQUksb0JBQW9CLE9BQXBCLENBQTRCLFdBQTVCLEtBQTRDLENBQWhELEVBQW1EO0FBQ2pELDZCQUFlLElBQWY7QUFDRCxhQUZELE1BRU8sSUFBSSx5QkFBeUIsT0FBekIsQ0FBaUMsV0FBakMsS0FBaUQsQ0FBckQsRUFBd0Q7QUFDN0QsNkJBQWUsS0FBZjtBQUNELGFBRk0sTUFFQTtBQUNMLGtCQUFJLFlBQUosRUFBa0IsQ0FFakIsQ0FGRCxNQUVPLENBRU47QUFDRjtBQUNGO0FBQ0Y7O0FBRUQsWUFBSSxrQkFBa0IsT0FBbEIsSUFBNkIseUJBQXlCLE9BQTFELEVBQW1FO0FBQ2pFLGdDQUFzQixDQUFDLEVBQUUsUUFBUSxZQUFSLElBQ3ZCLFFBQVEsbUJBRGEsQ0FBdkI7QUFHRDs7QUFFRCxZQUFJLFdBQVcsT0FBZixFQUF3QjtBQUN0QixjQUFJLE9BQU8sUUFBUSxLQUFmLEtBQXlCLFNBQTdCLEVBQXdDO0FBQ3RDLHlCQUFhLFFBQVEsS0FBckI7QUFDRCxXQUZELE1BRU87QUFDTCwwQkFBYyxRQUFRLEtBQXRCO0FBQ0EsMkJBQWUsS0FBZjtBQUNEO0FBQ0Y7O0FBRUQsWUFBSSxhQUFhLE9BQWpCLEVBQTBCO0FBQ3hCLGNBQUksT0FBTyxRQUFRLE9BQWYsS0FBMkIsU0FBL0IsRUFBMEM7QUFDeEMsMkJBQWUsUUFBUSxPQUF2QjtBQUNELFdBRkQsTUFFTztBQUNMLDRCQUFnQixRQUFRLE9BQXhCO0FBQ0EseUJBQWEsS0FBYjtBQUNEO0FBQ0Y7O0FBRUQsWUFBSSxrQkFBa0IsT0FBdEIsRUFBK0I7QUFDN0IsY0FBSSxPQUFPLFFBQVEsWUFBZixLQUFnQyxTQUFwQyxFQUErQztBQUM3Qyx5QkFBYSxlQUFlLFFBQVEsWUFBcEM7QUFDRCxXQUZELE1BRU87QUFDTCxpQ0FBcUIsUUFBUSxZQUE3QjtBQUNBLHlCQUFhLEtBQWI7QUFDQSwyQkFBZSxLQUFmO0FBQ0Q7QUFDRjtBQUNGOztBQUVEO0FBQ0EsVUFBSSxtQkFBbUIsSUFBdkI7QUFDQSxVQUFJLGtCQUFrQixJQUF0QjtBQUNBLFVBQUksb0JBQW9CLElBQXhCO0FBQ0EsVUFBSSx5QkFBeUIsSUFBN0I7O0FBRUE7QUFDQSxVQUFJLE1BQU0sT0FBTixDQUFjLFdBQWQsQ0FBSixFQUFnQztBQUM5QiwyQkFBbUIsWUFBWSxHQUFaLENBQWdCLGVBQWhCLENBQW5CO0FBQ0QsT0FGRCxNQUVPLElBQUksV0FBSixFQUFpQjtBQUN0QiwyQkFBbUIsQ0FBQyxnQkFBZ0IsV0FBaEIsQ0FBRCxDQUFuQjtBQUNELE9BRk0sTUFFQTtBQUNMLDJCQUFtQixJQUFJLEtBQUosQ0FBVSxVQUFWLENBQW5CO0FBQ0EsYUFBSyxJQUFJLENBQVQsRUFBWSxJQUFJLFVBQWhCLEVBQTRCLEVBQUUsQ0FBOUIsRUFBaUM7QUFDL0IsMkJBQWlCLENBQWpCLElBQXNCLGdCQUNwQixLQURvQixFQUVwQixNQUZvQixFQUdwQixZQUhvQixFQUlwQixXQUpvQixFQUtwQixTQUxvQixDQUF0QjtBQU1EO0FBQ0Y7O0FBS0QsY0FBUSxTQUFTLGlCQUFpQixDQUFqQixFQUFvQixLQUFyQztBQUNBLGVBQVMsVUFBVSxpQkFBaUIsQ0FBakIsRUFBb0IsTUFBdkM7O0FBRUEsVUFBSSxXQUFKLEVBQWlCO0FBQ2YsMEJBQWtCLGdCQUFnQixXQUFoQixDQUFsQjtBQUNELE9BRkQsTUFFTyxJQUFJLGNBQWMsQ0FBQyxZQUFuQixFQUFpQztBQUN0QywwQkFBa0IsZ0JBQ2hCLEtBRGdCLEVBRWhCLE1BRmdCLEVBR2hCLG1CQUhnQixFQUloQixPQUpnQixFQUtoQixRQUxnQixDQUFsQjtBQU1EOztBQUVELFVBQUksYUFBSixFQUFtQjtBQUNqQiw0QkFBb0IsZ0JBQWdCLGFBQWhCLENBQXBCO0FBQ0QsT0FGRCxNQUVPLElBQUksZ0JBQWdCLENBQUMsVUFBckIsRUFBaUM7QUFDdEMsNEJBQW9CLGdCQUNsQixLQURrQixFQUVsQixNQUZrQixFQUdsQixLQUhrQixFQUlsQixTQUprQixFQUtsQixPQUxrQixDQUFwQjtBQU1EOztBQUVELFVBQUksa0JBQUosRUFBd0I7QUFDdEIsaUNBQXlCLGdCQUFnQixrQkFBaEIsQ0FBekI7QUFDRCxPQUZELE1BRU8sSUFBSSxDQUFDLFdBQUQsSUFBZ0IsQ0FBQyxhQUFqQixJQUFrQyxZQUFsQyxJQUFrRCxVQUF0RCxFQUFrRTtBQUN2RSxpQ0FBeUIsZ0JBQ3ZCLEtBRHVCLEVBRXZCLE1BRnVCLEVBR3ZCLG1CQUh1QixFQUl2QixlQUp1QixFQUt2QixlQUx1QixDQUF6QjtBQU1EOztBQUlELFVBQUksNEJBQTRCLElBQWhDOztBQUVBLFdBQUssSUFBSSxDQUFULEVBQVksSUFBSSxpQkFBaUIsTUFBakMsRUFBeUMsRUFBRSxDQUEzQyxFQUE4QztBQUM1Qyw0QkFBb0IsaUJBQWlCLENBQWpCLENBQXBCLEVBQXlDLEtBQXpDLEVBQWdELE1BQWhEOztBQUdBLFlBQUksaUJBQWlCLENBQWpCLEtBQXVCLGlCQUFpQixDQUFqQixFQUFvQixPQUEvQyxFQUF3RDtBQUN0RCxjQUFJLHNCQUNBLHNCQUFzQixpQkFBaUIsQ0FBakIsRUFBb0IsT0FBcEIsQ0FBNEIsUUFBNUIsQ0FBcUMsTUFBM0QsSUFDQSxpQkFBaUIsaUJBQWlCLENBQWpCLEVBQW9CLE9BQXBCLENBQTRCLFFBQTVCLENBQXFDLElBQXRELENBRko7O0FBSUEsY0FBSSw4QkFBOEIsSUFBbEMsRUFBd0M7QUFDdEMsd0NBQTRCLG1CQUE1QjtBQUNELFdBRkQsTUFFTztBQUNMO0FBQ0E7QUFDQTs7QUFFRDtBQUNGO0FBQ0Y7QUFDRCwwQkFBb0IsZUFBcEIsRUFBcUMsS0FBckMsRUFBNEMsTUFBNUM7O0FBRUEsMEJBQW9CLGlCQUFwQixFQUF1QyxLQUF2QyxFQUE4QyxNQUE5Qzs7QUFFQSwwQkFBb0Isc0JBQXBCLEVBQTRDLEtBQTVDLEVBQW1ELE1BQW5EOztBQUdBO0FBQ0EsaUJBQVcsV0FBWDs7QUFFQSxrQkFBWSxLQUFaLEdBQW9CLEtBQXBCO0FBQ0Esa0JBQVksTUFBWixHQUFxQixNQUFyQjs7QUFFQSxrQkFBWSxnQkFBWixHQUErQixnQkFBL0I7QUFDQSxrQkFBWSxlQUFaLEdBQThCLGVBQTlCO0FBQ0Esa0JBQVksaUJBQVosR0FBZ0MsaUJBQWhDO0FBQ0Esa0JBQVksc0JBQVosR0FBcUMsc0JBQXJDOztBQUVBLHNCQUFnQixLQUFoQixHQUF3QixpQkFBaUIsR0FBakIsQ0FBcUIsZ0JBQXJCLENBQXhCO0FBQ0Esc0JBQWdCLEtBQWhCLEdBQXdCLGlCQUFpQixlQUFqQixDQUF4QjtBQUNBLHNCQUFnQixPQUFoQixHQUEwQixpQkFBaUIsaUJBQWpCLENBQTFCO0FBQ0Esc0JBQWdCLFlBQWhCLEdBQStCLGlCQUFpQixzQkFBakIsQ0FBL0I7O0FBRUEsc0JBQWdCLEtBQWhCLEdBQXdCLFlBQVksS0FBcEM7QUFDQSxzQkFBZ0IsTUFBaEIsR0FBeUIsWUFBWSxNQUFyQzs7QUFFQSx3QkFBa0IsV0FBbEI7O0FBRUEsYUFBTyxlQUFQO0FBQ0Q7O0FBRUQsYUFBUyxNQUFULENBQWlCLEVBQWpCLEVBQXFCLEVBQXJCLEVBQXlCOztBQUd2QixVQUFJLElBQUksS0FBSyxDQUFiO0FBQ0EsVUFBSSxJQUFLLEtBQUssQ0FBTixJQUFZLENBQXBCO0FBQ0EsVUFBSSxNQUFNLFlBQVksS0FBbEIsSUFBMkIsTUFBTSxZQUFZLE1BQWpELEVBQXlEO0FBQ3ZELGVBQU8sZUFBUDtBQUNEOztBQUVEO0FBQ0EsVUFBSSxtQkFBbUIsWUFBWSxnQkFBbkM7QUFDQSxXQUFLLElBQUksSUFBSSxDQUFiLEVBQWdCLElBQUksaUJBQWlCLE1BQXJDLEVBQTZDLEVBQUUsQ0FBL0MsRUFBa0Q7QUFDaEQseUJBQWlCLGlCQUFpQixDQUFqQixDQUFqQixFQUFzQyxDQUF0QyxFQUF5QyxDQUF6QztBQUNEO0FBQ0QsdUJBQWlCLFlBQVksZUFBN0IsRUFBOEMsQ0FBOUMsRUFBaUQsQ0FBakQ7QUFDQSx1QkFBaUIsWUFBWSxpQkFBN0IsRUFBZ0QsQ0FBaEQsRUFBbUQsQ0FBbkQ7QUFDQSx1QkFBaUIsWUFBWSxzQkFBN0IsRUFBcUQsQ0FBckQsRUFBd0QsQ0FBeEQ7O0FBRUEsa0JBQVksS0FBWixHQUFvQixnQkFBZ0IsS0FBaEIsR0FBd0IsQ0FBNUM7QUFDQSxrQkFBWSxNQUFaLEdBQXFCLGdCQUFnQixNQUFoQixHQUF5QixDQUE5Qzs7QUFFQSx3QkFBa0IsV0FBbEI7O0FBRUEsYUFBTyxlQUFQO0FBQ0Q7O0FBRUQsb0JBQWdCLEVBQWhCLEVBQW9CLEVBQXBCOztBQUVBLFdBQU8sT0FBTyxlQUFQLEVBQXdCO0FBQzdCLGNBQVEsTUFEcUI7QUFFN0IsaUJBQVcsYUFGa0I7QUFHN0Isb0JBQWMsV0FIZTtBQUk3QixlQUFTLFlBQVk7QUFDbkIsZ0JBQVEsV0FBUjtBQUNBLG1CQUFXLFdBQVg7QUFDRDtBQVA0QixLQUF4QixDQUFQO0FBU0Q7O0FBRUQsV0FBUyxhQUFULENBQXdCLE9BQXhCLEVBQWlDO0FBQy9CLFFBQUksUUFBUSxNQUFNLENBQU4sQ0FBWjs7QUFFQSxhQUFTLG1CQUFULENBQThCLENBQTlCLEVBQWlDO0FBQy9CLFVBQUksQ0FBSjs7QUFJQSxVQUFJLGlCQUFpQixXQUFXLGtCQUFoQzs7QUFFQSxVQUFJLFNBQVM7QUFDWCxlQUFPO0FBREksT0FBYjs7QUFJQSxVQUFJLFNBQVMsQ0FBYjs7QUFFQSxVQUFJLGNBQWMsSUFBbEI7QUFDQSxVQUFJLGNBQWMsTUFBbEI7QUFDQSxVQUFJLFlBQVksT0FBaEI7QUFDQSxVQUFJLGFBQWEsQ0FBakI7O0FBRUEsVUFBSSxPQUFPLENBQVAsS0FBYSxRQUFqQixFQUEyQjtBQUN6QixpQkFBUyxJQUFJLENBQWI7QUFDRCxPQUZELE1BRU8sSUFBSSxDQUFDLENBQUwsRUFBUTtBQUNiLGlCQUFTLENBQVQ7QUFDRCxPQUZNLE1BRUE7O0FBRUwsWUFBSSxVQUFVLENBQWQ7O0FBRUEsWUFBSSxXQUFXLE9BQWYsRUFBd0I7QUFDdEIsY0FBSSxRQUFRLFFBQVEsS0FBcEI7O0FBR0EsbUJBQVMsTUFBTSxDQUFOLENBQVQ7QUFDRCxTQUxELE1BS087QUFDTCxjQUFJLFlBQVksT0FBaEIsRUFBeUI7QUFDdkIscUJBQVMsUUFBUSxNQUFSLEdBQWlCLENBQTFCO0FBQ0Q7QUFDRCxjQUFJLFdBQVcsT0FBZixFQUF3QjtBQUN0QixxQkFBUyxRQUFRLEtBQVIsR0FBZ0IsQ0FBekI7QUFDQSxnQkFBSSxZQUFZLE9BQWhCLEVBQXlCLENBRXhCO0FBQ0YsV0FMRCxNQUtPLElBQUksWUFBWSxPQUFoQixFQUF5QjtBQUM5QixxQkFBUyxRQUFRLE1BQVIsR0FBaUIsQ0FBMUI7QUFDRDtBQUNGOztBQUVELFlBQUksV0FBVyxPQUFYLElBQ0EsWUFBWSxPQURoQixFQUN5QjtBQUN2Qix3QkFDRSxRQUFRLEtBQVIsSUFDQSxRQUFRLE1BRlY7QUFHQSxjQUFJLE1BQU0sT0FBTixDQUFjLFdBQWQsQ0FBSixFQUFnQyxDQUUvQjtBQUNGOztBQUVELFlBQUksQ0FBQyxXQUFMLEVBQWtCO0FBQ2hCLGNBQUksZ0JBQWdCLE9BQXBCLEVBQTZCO0FBQzNCLHlCQUFhLFFBQVEsVUFBUixHQUFxQixDQUFsQztBQUVEOztBQUVELGNBQUksZUFBZSxPQUFuQixFQUE0Qjs7QUFFMUIsd0JBQVksUUFBUSxTQUFwQjtBQUNEOztBQUVELGNBQUksaUJBQWlCLE9BQXJCLEVBQThCO0FBQzVCLDBCQUFjLFFBQVEsV0FBdEI7QUFFRDtBQUNGOztBQUVELFlBQUksV0FBVyxPQUFmLEVBQXdCO0FBQ3RCLGlCQUFPLEtBQVAsR0FBZSxRQUFRLEtBQXZCO0FBQ0Q7O0FBRUQsWUFBSSxhQUFhLE9BQWpCLEVBQTBCO0FBQ3hCLGlCQUFPLE9BQVAsR0FBaUIsUUFBUSxPQUF6QjtBQUNEOztBQUVELFlBQUksa0JBQWtCLE9BQXRCLEVBQStCO0FBQzdCLGlCQUFPLFlBQVAsR0FBc0IsUUFBUSxZQUE5QjtBQUNEO0FBQ0Y7O0FBRUQsVUFBSSxVQUFKO0FBQ0EsVUFBSSxXQUFKLEVBQWlCO0FBQ2YsWUFBSSxNQUFNLE9BQU4sQ0FBYyxXQUFkLENBQUosRUFBZ0M7QUFDOUIsdUJBQWEsRUFBYjtBQUNBLGVBQUssSUFBSSxDQUFULEVBQVksSUFBSSxZQUFZLE1BQTVCLEVBQW9DLEVBQUUsQ0FBdEMsRUFBeUM7QUFDdkMsdUJBQVcsQ0FBWCxJQUFnQixZQUFZLENBQVosQ0FBaEI7QUFDRDtBQUNGLFNBTEQsTUFLTztBQUNMLHVCQUFhLENBQUUsV0FBRixDQUFiO0FBQ0Q7QUFDRixPQVRELE1BU087QUFDTCxxQkFBYSxNQUFNLFVBQU4sQ0FBYjtBQUNBLFlBQUksZ0JBQWdCO0FBQ2xCLGtCQUFRLE1BRFU7QUFFbEIsa0JBQVEsV0FGVTtBQUdsQixnQkFBTTtBQUhZLFNBQXBCO0FBS0EsYUFBSyxJQUFJLENBQVQsRUFBWSxJQUFJLFVBQWhCLEVBQTRCLEVBQUUsQ0FBOUIsRUFBaUM7QUFDL0IscUJBQVcsQ0FBWCxJQUFnQixhQUFhLFVBQWIsQ0FBd0IsYUFBeEIsQ0FBaEI7QUFDRDtBQUNGOztBQUVEO0FBQ0EsYUFBTyxLQUFQLEdBQWUsTUFBTSxXQUFXLE1BQWpCLENBQWY7QUFDQSxXQUFLLElBQUksQ0FBVCxFQUFZLElBQUksV0FBVyxNQUEzQixFQUFtQyxFQUFFLENBQXJDLEVBQXdDO0FBQ3RDLFlBQUksT0FBTyxXQUFXLENBQVgsQ0FBWDs7QUFFQSxpQkFBUyxVQUFVLEtBQUssS0FBeEI7O0FBRUEsZUFBTyxLQUFQLENBQWEsQ0FBYixJQUFrQjtBQUNoQixrQkFBUSw4QkFEUTtBQUVoQixnQkFBTSxXQUFXLENBQVg7QUFGVSxTQUFsQjtBQUlEOztBQUVELFdBQUssSUFBSSxDQUFULEVBQVksSUFBSSxDQUFoQixFQUFtQixFQUFFLENBQXJCLEVBQXdCO0FBQ3RCLGFBQUssSUFBSSxJQUFJLENBQWIsRUFBZ0IsSUFBSSxXQUFXLE1BQS9CLEVBQXVDLEVBQUUsQ0FBekMsRUFBNEM7QUFDMUMsaUJBQU8sS0FBUCxDQUFhLENBQWIsRUFBZ0IsTUFBaEIsR0FBeUIsaUNBQWlDLENBQTFEO0FBQ0Q7QUFDRDtBQUNBLFlBQUksSUFBSSxDQUFSLEVBQVc7QUFDVCxpQkFBTyxLQUFQLEdBQWUsTUFBTSxDQUFOLEVBQVMsS0FBeEI7QUFDQSxpQkFBTyxPQUFQLEdBQWlCLE1BQU0sQ0FBTixFQUFTLE9BQTFCO0FBQ0EsaUJBQU8sWUFBUCxHQUFzQixNQUFNLENBQU4sRUFBUyxZQUEvQjtBQUNEO0FBQ0QsWUFBSSxNQUFNLENBQU4sQ0FBSixFQUFjO0FBQ1gsZ0JBQU0sQ0FBTixDQUFELENBQVcsTUFBWDtBQUNELFNBRkQsTUFFTztBQUNMLGdCQUFNLENBQU4sSUFBVyxVQUFVLE1BQVYsQ0FBWDtBQUNEO0FBQ0Y7O0FBRUQsYUFBTyxPQUFPLG1CQUFQLEVBQTRCO0FBQ2pDLGVBQU8sTUFEMEI7QUFFakMsZ0JBQVEsTUFGeUI7QUFHakMsZUFBTztBQUgwQixPQUE1QixDQUFQO0FBS0Q7O0FBRUQsYUFBUyxNQUFULENBQWlCLE9BQWpCLEVBQTBCO0FBQ3hCLFVBQUksQ0FBSjtBQUNBLFVBQUksU0FBUyxVQUFVLENBQXZCOztBQUdBLFVBQUksV0FBVyxvQkFBb0IsS0FBbkMsRUFBMEM7QUFDeEMsZUFBTyxtQkFBUDtBQUNEOztBQUVELFVBQUksU0FBUyxvQkFBb0IsS0FBakM7QUFDQSxXQUFLLElBQUksQ0FBVCxFQUFZLElBQUksT0FBTyxNQUF2QixFQUErQixFQUFFLENBQWpDLEVBQW9DO0FBQ2xDLGVBQU8sQ0FBUCxFQUFVLE1BQVYsQ0FBaUIsTUFBakI7QUFDRDs7QUFFRCxXQUFLLElBQUksQ0FBVCxFQUFZLElBQUksQ0FBaEIsRUFBbUIsRUFBRSxDQUFyQixFQUF3QjtBQUN0QixjQUFNLENBQU4sRUFBUyxNQUFULENBQWdCLE1BQWhCO0FBQ0Q7O0FBRUQsMEJBQW9CLEtBQXBCLEdBQTRCLG9CQUFvQixNQUFwQixHQUE2QixNQUF6RDs7QUFFQSxhQUFPLG1CQUFQO0FBQ0Q7O0FBRUQsd0JBQW9CLE9BQXBCOztBQUVBLFdBQU8sT0FBTyxtQkFBUCxFQUE0QjtBQUNqQyxhQUFPLEtBRDBCO0FBRWpDLGNBQVEsTUFGeUI7QUFHakMsaUJBQVcsaUJBSHNCO0FBSWpDLGVBQVMsWUFBWTtBQUNuQixjQUFNLE9BQU4sQ0FBYyxVQUFVLENBQVYsRUFBYTtBQUN6QixZQUFFLE9BQUY7QUFDRCxTQUZEO0FBR0Q7QUFSZ0MsS0FBNUIsQ0FBUDtBQVVEOztBQUVELFdBQVMsbUJBQVQsR0FBZ0M7QUFDOUIsV0FBTyxjQUFQLEVBQXVCLE9BQXZCLENBQStCLFVBQVUsRUFBVixFQUFjO0FBQzNDLFNBQUcsV0FBSCxHQUFpQixHQUFHLGlCQUFILEVBQWpCO0FBQ0Esd0JBQWtCLEVBQWxCO0FBQ0QsS0FIRDtBQUlEOztBQUVELFNBQU8sT0FBTyxnQkFBUCxFQUF5QjtBQUM5QixvQkFBZ0IsVUFBVSxNQUFWLEVBQWtCO0FBQ2hDLFVBQUksT0FBTyxNQUFQLEtBQWtCLFVBQWxCLElBQWdDLE9BQU8sU0FBUCxLQUFxQixhQUF6RCxFQUF3RTtBQUN0RSxZQUFJLE1BQU0sT0FBTyxZQUFqQjtBQUNBLFlBQUksZUFBZSxlQUFuQixFQUFvQztBQUNsQyxpQkFBTyxHQUFQO0FBQ0Q7QUFDRjtBQUNELGFBQU8sSUFBUDtBQUNELEtBVDZCO0FBVTlCLFlBQVEsU0FWc0I7QUFXOUIsZ0JBQVksYUFYa0I7QUFZOUIsV0FBTyxZQUFZO0FBQ2pCLGFBQU8sY0FBUCxFQUF1QixPQUF2QixDQUErQixPQUEvQjtBQUNELEtBZDZCO0FBZTlCLGFBQVM7QUFmcUIsR0FBekIsQ0FBUDtBQWlCRCxDQTl2QkQ7OztBQzdFQSxJQUFJLG1CQUFtQixNQUF2QjtBQUNBLElBQUksY0FBYyxNQUFsQjtBQUNBLElBQUksZ0JBQWdCLE1BQXBCO0FBQ0EsSUFBSSxlQUFlLE1BQW5CO0FBQ0EsSUFBSSxnQkFBZ0IsTUFBcEI7QUFDQSxJQUFJLGdCQUFnQixNQUFwQjtBQUNBLElBQUksa0JBQWtCLE1BQXRCOztBQUVBLElBQUksOEJBQThCLE1BQWxDO0FBQ0EsSUFBSSw4QkFBOEIsTUFBbEM7O0FBRUEsSUFBSSxzQkFBc0IsTUFBMUI7QUFDQSxJQUFJLHVCQUF1QixNQUEzQjtBQUNBLElBQUksd0JBQXdCLE1BQTVCO0FBQ0EsSUFBSSxnQ0FBZ0MsTUFBcEM7QUFDQSxJQUFJLHlCQUF5QixNQUE3QjtBQUNBLElBQUksc0NBQXNDLE1BQTFDO0FBQ0EsSUFBSSxvQ0FBb0MsTUFBeEM7QUFDQSxJQUFJLDZCQUE2QixNQUFqQztBQUNBLElBQUksa0NBQWtDLE1BQXRDO0FBQ0EsSUFBSSwrQkFBK0IsTUFBbkM7QUFDQSxJQUFJLDJCQUEyQixNQUEvQjs7QUFFQSxJQUFJLFlBQVksTUFBaEI7QUFDQSxJQUFJLGNBQWMsTUFBbEI7QUFDQSxJQUFJLGFBQWEsTUFBakI7QUFDQSxJQUFJLDhCQUE4QixNQUFsQzs7QUFFQSxJQUFJLG9DQUFvQyxNQUF4Qzs7QUFFQSxJQUFJLGlDQUFpQyxNQUFyQztBQUNBLElBQUksNEJBQTRCLE1BQWhDOztBQUVBLE9BQU8sT0FBUCxHQUFpQixVQUFVLEVBQVYsRUFBYyxVQUFkLEVBQTBCO0FBQ3pDLE1BQUksaUJBQWlCLENBQXJCO0FBQ0EsTUFBSSxXQUFXLDhCQUFmLEVBQStDO0FBQzdDLHFCQUFpQixHQUFHLFlBQUgsQ0FBZ0IsaUNBQWhCLENBQWpCO0FBQ0Q7O0FBRUQsTUFBSSxpQkFBaUIsQ0FBckI7QUFDQSxNQUFJLHNCQUFzQixDQUExQjtBQUNBLE1BQUksV0FBVyxrQkFBZixFQUFtQztBQUNqQyxxQkFBaUIsR0FBRyxZQUFILENBQWdCLHlCQUFoQixDQUFqQjtBQUNBLDBCQUFzQixHQUFHLFlBQUgsQ0FBZ0IsOEJBQWhCLENBQXRCO0FBQ0Q7O0FBRUQsU0FBTztBQUNMO0FBQ0EsZUFBVyxDQUNULEdBQUcsWUFBSCxDQUFnQixXQUFoQixDQURTLEVBRVQsR0FBRyxZQUFILENBQWdCLGFBQWhCLENBRlMsRUFHVCxHQUFHLFlBQUgsQ0FBZ0IsWUFBaEIsQ0FIUyxFQUlULEdBQUcsWUFBSCxDQUFnQixhQUFoQixDQUpTLENBRk47QUFRTCxlQUFXLEdBQUcsWUFBSCxDQUFnQixhQUFoQixDQVJOO0FBU0wsaUJBQWEsR0FBRyxZQUFILENBQWdCLGVBQWhCLENBVFI7QUFVTCxrQkFBYyxHQUFHLFlBQUgsQ0FBZ0IsZ0JBQWhCLENBVlQ7O0FBWUw7QUFDQSxnQkFBWSxPQUFPLElBQVAsQ0FBWSxVQUFaLEVBQXdCLE1BQXhCLENBQStCLFVBQVUsR0FBVixFQUFlO0FBQ3hELGFBQU8sQ0FBQyxDQUFDLFdBQVcsR0FBWCxDQUFUO0FBQ0QsS0FGVyxDQWJQOztBQWlCTDtBQUNBLG9CQUFnQixjQWxCWDs7QUFvQkw7QUFDQSxvQkFBZ0IsY0FyQlg7QUFzQkwseUJBQXFCLG1CQXRCaEI7O0FBd0JMO0FBQ0EsbUJBQWUsR0FBRyxZQUFILENBQWdCLDJCQUFoQixDQXpCVjtBQTBCTCxtQkFBZSxHQUFHLFlBQUgsQ0FBZ0IsMkJBQWhCLENBMUJWO0FBMkJMLHFCQUFpQixHQUFHLFlBQUgsQ0FBZ0Isb0JBQWhCLENBM0JaO0FBNEJMLDZCQUF5QixHQUFHLFlBQUgsQ0FBZ0IsbUNBQWhCLENBNUJwQjtBQTZCTCxvQkFBZ0IsR0FBRyxZQUFILENBQWdCLDRCQUFoQixDQTdCWDtBQThCTCx5QkFBcUIsR0FBRyxZQUFILENBQWdCLHdCQUFoQixDQTlCaEI7QUErQkwscUJBQWlCLEdBQUcsWUFBSCxDQUFnQiwwQkFBaEIsQ0EvQlo7QUFnQ0wsb0JBQWdCLEdBQUcsWUFBSCxDQUFnQixtQkFBaEIsQ0FoQ1g7QUFpQ0wsbUJBQWUsR0FBRyxZQUFILENBQWdCLHFCQUFoQixDQWpDVjtBQWtDTCx1QkFBbUIsR0FBRyxZQUFILENBQWdCLDZCQUFoQixDQWxDZDtBQW1DTCwyQkFBdUIsR0FBRyxZQUFILENBQWdCLGlDQUFoQixDQW5DbEI7QUFvQ0wsdUJBQW1CLEdBQUcsWUFBSCxDQUFnQixzQkFBaEIsQ0FwQ2Q7QUFxQ0wseUJBQXFCLEdBQUcsWUFBSCxDQUFnQiwrQkFBaEIsQ0FyQ2hCOztBQXVDTDtBQUNBLFVBQU0sR0FBRyxZQUFILENBQWdCLDJCQUFoQixDQXhDRDtBQXlDTCxjQUFVLEdBQUcsWUFBSCxDQUFnQixXQUFoQixDQXpDTDtBQTBDTCxZQUFRLEdBQUcsWUFBSCxDQUFnQixTQUFoQixDQTFDSDtBQTJDTCxhQUFTLEdBQUcsWUFBSCxDQUFnQixVQUFoQjtBQTNDSixHQUFQO0FBNkNELENBMUREOzs7O0FDaENBLElBQUksZUFBZSxRQUFRLHVCQUFSLENBQW5COztBQUVBLElBQUksVUFBVSxJQUFkO0FBQ0EsSUFBSSxtQkFBbUIsSUFBdkI7QUFDQSxJQUFJLG9CQUFvQixNQUF4QjtBQUNBLElBQUksV0FBVyxNQUFmLEMsQ0FBc0I7O0FBRXRCLE9BQU8sT0FBUCxHQUFpQixTQUFTLGNBQVQsQ0FDZixFQURlLEVBRWYsZ0JBRmUsRUFHZixRQUhlLEVBSWYsT0FKZSxFQUtmLFlBTGUsRUFNZixVQU5lLEVBTUg7QUFDWixXQUFTLFVBQVQsQ0FBcUIsS0FBckIsRUFBNEI7QUFDMUIsUUFBSSxJQUFKO0FBQ0EsUUFBSSxpQkFBaUIsSUFBakIsS0FBMEIsSUFBOUIsRUFBb0M7O0FBRWxDLGFBQU8sZ0JBQVA7QUFDRCxLQUhELE1BR087O0FBRUwsYUFBTyxpQkFBaUIsSUFBakIsQ0FBc0IsZ0JBQXRCLENBQXVDLENBQXZDLEVBQTBDLE9BQTFDLENBQWtELFFBQWxELENBQTJELElBQWxFOztBQUVBLFVBQUksV0FBVyxpQkFBZixFQUFrQyxDQUVqQyxDQUZELE1BRU8sQ0FFTjtBQUNGOztBQUVELFFBQUksSUFBSSxDQUFSO0FBQ0EsUUFBSSxJQUFJLENBQVI7QUFDQSxRQUFJLFFBQVEsUUFBUSxnQkFBcEI7QUFDQSxRQUFJLFNBQVMsUUFBUSxpQkFBckI7QUFDQSxRQUFJLE9BQU8sSUFBWDs7QUFFQSxRQUFJLGFBQWEsS0FBYixDQUFKLEVBQXlCO0FBQ3ZCLGFBQU8sS0FBUDtBQUNELEtBRkQsTUFFTyxJQUFJLEtBQUosRUFBVzs7QUFFaEIsVUFBSSxNQUFNLENBQU4sR0FBVSxDQUFkO0FBQ0EsVUFBSSxNQUFNLENBQU4sR0FBVSxDQUFkOztBQUdBLGNBQVEsQ0FBQyxNQUFNLEtBQU4sSUFBZ0IsUUFBUSxnQkFBUixHQUEyQixDQUE1QyxJQUFrRCxDQUExRDtBQUNBLGVBQVMsQ0FBQyxNQUFNLE1BQU4sSUFBaUIsUUFBUSxpQkFBUixHQUE0QixDQUE5QyxJQUFvRCxDQUE3RDtBQUNBLGFBQU8sTUFBTSxJQUFOLElBQWMsSUFBckI7QUFDRDs7QUFFRDtBQUNBLFFBQUksSUFBSixFQUFVO0FBQ1IsVUFBSSxTQUFTLGdCQUFiLEVBQStCLENBRTlCLENBRkQsTUFFTyxJQUFJLFNBQVMsUUFBYixFQUF1QixDQUU3QjtBQUNGOztBQUtEO0FBQ0E7O0FBRUE7QUFDQSxRQUFJLE9BQU8sUUFBUSxNQUFSLEdBQWlCLENBQTVCOztBQUVBO0FBQ0EsUUFBSSxDQUFDLElBQUwsRUFBVztBQUNULFVBQUksU0FBUyxnQkFBYixFQUErQjtBQUM3QixlQUFPLElBQUksVUFBSixDQUFlLElBQWYsQ0FBUDtBQUNELE9BRkQsTUFFTyxJQUFJLFNBQVMsUUFBYixFQUF1QjtBQUM1QixlQUFPLFFBQVEsSUFBSSxZQUFKLENBQWlCLElBQWpCLENBQWY7QUFDRDtBQUNGOztBQUVEOzs7QUFJQTtBQUNBLE9BQUcsV0FBSCxDQUFlLGlCQUFmLEVBQWtDLENBQWxDO0FBQ0EsT0FBRyxVQUFILENBQWMsQ0FBZCxFQUFpQixDQUFqQixFQUFvQixLQUFwQixFQUEyQixNQUEzQixFQUFtQyxPQUFuQyxFQUNjLElBRGQsRUFFYyxJQUZkOztBQUlBLFdBQU8sSUFBUDtBQUNEOztBQUVELFNBQU8sVUFBUDtBQUNELENBbkZEOzs7O0FDUEEsSUFBSSxTQUFTLFFBQVEsZUFBUixDQUFiOztBQUVBLElBQUksa0JBQWtCLE1BQXRCOztBQUVBLElBQUksV0FBVyxNQUFmO0FBQ0EsSUFBSSxhQUFhLE1BQWpCO0FBQ0EsSUFBSSxZQUFZLE1BQWhCO0FBQ0EsSUFBSSx1QkFBdUIsTUFBM0I7QUFDQSxJQUFJLG9CQUFvQixNQUF4QjtBQUNBLElBQUksbUJBQW1CLE1BQXZCOztBQUVBLElBQUksc0JBQXNCLE1BQTFCOztBQUVBLElBQUksaUJBQWlCLE1BQXJCOztBQUVBLElBQUksaUJBQWlCLE1BQXJCO0FBQ0EsSUFBSSxnQkFBZ0IsTUFBcEI7O0FBRUEsSUFBSSxlQUFlLEVBQW5COztBQUVBLGFBQWEsUUFBYixJQUF5QixDQUF6QjtBQUNBLGFBQWEsVUFBYixJQUEyQixDQUEzQjtBQUNBLGFBQWEsU0FBYixJQUEwQixDQUExQjs7QUFFQSxhQUFhLG9CQUFiLElBQXFDLENBQXJDO0FBQ0EsYUFBYSxpQkFBYixJQUFrQyxDQUFsQztBQUNBLGFBQWEsZ0JBQWIsSUFBaUMsQ0FBakM7O0FBRUEsYUFBYSxtQkFBYixJQUFvQyxDQUFwQztBQUNBLGFBQWEsY0FBYixJQUErQixFQUEvQjtBQUNBLGFBQWEsY0FBYixJQUErQixDQUEvQjtBQUNBLGFBQWEsYUFBYixJQUE4QixDQUE5Qjs7QUFFQSxTQUFTLG1CQUFULENBQThCLE1BQTlCLEVBQXNDLEtBQXRDLEVBQTZDLE1BQTdDLEVBQXFEO0FBQ25ELFNBQU8sYUFBYSxNQUFiLElBQXVCLEtBQXZCLEdBQStCLE1BQXRDO0FBQ0Q7O0FBRUQsT0FBTyxPQUFQLEdBQWlCLFVBQVUsRUFBVixFQUFjLFVBQWQsRUFBMEIsTUFBMUIsRUFBa0MsS0FBbEMsRUFBeUMsTUFBekMsRUFBaUQ7QUFDaEUsTUFBSSxjQUFjO0FBQ2hCLGFBQVMsUUFETztBQUVoQixjQUFVLFNBRk07QUFHaEIsZUFBVyxVQUhLO0FBSWhCLGFBQVMsb0JBSk87QUFLaEIsZUFBVyxpQkFMSztBQU1oQixxQkFBaUI7QUFORCxHQUFsQjs7QUFTQSxNQUFJLFdBQVcsUUFBZixFQUF5QjtBQUN2QixnQkFBWSxPQUFaLElBQXVCLG1CQUF2QjtBQUNEOztBQUVELE1BQUksV0FBVywyQkFBZixFQUE0QztBQUMxQyxnQkFBWSxTQUFaLElBQXlCLGNBQXpCO0FBQ0EsZ0JBQVksUUFBWixJQUF3QixhQUF4QjtBQUNEOztBQUVELE1BQUksV0FBVyx3QkFBZixFQUF5QztBQUN2QyxnQkFBWSxTQUFaLElBQXlCLGNBQXpCO0FBQ0Q7O0FBRUQsTUFBSSxvQkFBb0IsRUFBeEI7QUFDQSxTQUFPLElBQVAsQ0FBWSxXQUFaLEVBQXlCLE9BQXpCLENBQWlDLFVBQVUsR0FBVixFQUFlO0FBQzlDLFFBQUksTUFBTSxZQUFZLEdBQVosQ0FBVjtBQUNBLHNCQUFrQixHQUFsQixJQUF5QixHQUF6QjtBQUNELEdBSEQ7O0FBS0EsTUFBSSxvQkFBb0IsQ0FBeEI7QUFDQSxNQUFJLGtCQUFrQixFQUF0Qjs7QUFFQSxXQUFTLGdCQUFULENBQTJCLFlBQTNCLEVBQXlDO0FBQ3ZDLFNBQUssRUFBTCxHQUFVLG1CQUFWO0FBQ0EsU0FBSyxRQUFMLEdBQWdCLENBQWhCOztBQUVBLFNBQUssWUFBTCxHQUFvQixZQUFwQjs7QUFFQSxTQUFLLE1BQUwsR0FBYyxRQUFkO0FBQ0EsU0FBSyxLQUFMLEdBQWEsQ0FBYjtBQUNBLFNBQUssTUFBTCxHQUFjLENBQWQ7O0FBRUEsUUFBSSxPQUFPLE9BQVgsRUFBb0I7QUFDbEIsV0FBSyxLQUFMLEdBQWEsRUFBQyxNQUFNLENBQVAsRUFBYjtBQUNEO0FBQ0Y7O0FBRUQsbUJBQWlCLFNBQWpCLENBQTJCLE1BQTNCLEdBQW9DLFlBQVk7QUFDOUMsUUFBSSxFQUFFLEtBQUssUUFBUCxJQUFtQixDQUF2QixFQUEwQjtBQUN4QixjQUFRLElBQVI7QUFDRDtBQUNGLEdBSkQ7O0FBTUEsV0FBUyxPQUFULENBQWtCLEVBQWxCLEVBQXNCO0FBQ3BCLFFBQUksU0FBUyxHQUFHLFlBQWhCOztBQUVBLE9BQUcsZ0JBQUgsQ0FBb0IsZUFBcEIsRUFBcUMsSUFBckM7QUFDQSxPQUFHLGtCQUFILENBQXNCLE1BQXRCO0FBQ0EsT0FBRyxZQUFILEdBQWtCLElBQWxCO0FBQ0EsT0FBRyxRQUFILEdBQWMsQ0FBZDtBQUNBLFdBQU8sZ0JBQWdCLEdBQUcsRUFBbkIsQ0FBUDtBQUNBLFVBQU0saUJBQU47QUFDRDs7QUFFRCxXQUFTLGtCQUFULENBQTZCLENBQTdCLEVBQWdDLENBQWhDLEVBQW1DO0FBQ2pDLFFBQUksZUFBZSxJQUFJLGdCQUFKLENBQXFCLEdBQUcsa0JBQUgsRUFBckIsQ0FBbkI7QUFDQSxvQkFBZ0IsYUFBYSxFQUE3QixJQUFtQyxZQUFuQztBQUNBLFVBQU0saUJBQU47O0FBRUEsYUFBUyxnQkFBVCxDQUEyQixDQUEzQixFQUE4QixDQUE5QixFQUFpQztBQUMvQixVQUFJLElBQUksQ0FBUjtBQUNBLFVBQUksSUFBSSxDQUFSO0FBQ0EsVUFBSSxTQUFTLFFBQWI7O0FBRUEsVUFBSSxPQUFPLENBQVAsS0FBYSxRQUFiLElBQXlCLENBQTdCLEVBQWdDO0FBQzlCLFlBQUksVUFBVSxDQUFkO0FBQ0EsWUFBSSxXQUFXLE9BQWYsRUFBd0I7QUFDdEIsY0FBSSxRQUFRLFFBQVEsS0FBcEI7O0FBRUEsY0FBSSxNQUFNLENBQU4sSUFBVyxDQUFmO0FBQ0EsY0FBSSxNQUFNLENBQU4sSUFBVyxDQUFmO0FBQ0QsU0FMRCxNQUtPO0FBQ0wsY0FBSSxZQUFZLE9BQWhCLEVBQXlCO0FBQ3ZCLGdCQUFJLElBQUksUUFBUSxNQUFSLEdBQWlCLENBQXpCO0FBQ0Q7QUFDRCxjQUFJLFdBQVcsT0FBZixFQUF3QjtBQUN0QixnQkFBSSxRQUFRLEtBQVIsR0FBZ0IsQ0FBcEI7QUFDRDtBQUNELGNBQUksWUFBWSxPQUFoQixFQUF5QjtBQUN2QixnQkFBSSxRQUFRLE1BQVIsR0FBaUIsQ0FBckI7QUFDRDtBQUNGO0FBQ0QsWUFBSSxZQUFZLE9BQWhCLEVBQXlCOztBQUV2QixtQkFBUyxZQUFZLFFBQVEsTUFBcEIsQ0FBVDtBQUNEO0FBQ0YsT0F0QkQsTUFzQk8sSUFBSSxPQUFPLENBQVAsS0FBYSxRQUFqQixFQUEyQjtBQUNoQyxZQUFJLElBQUksQ0FBUjtBQUNBLFlBQUksT0FBTyxDQUFQLEtBQWEsUUFBakIsRUFBMkI7QUFDekIsY0FBSSxJQUFJLENBQVI7QUFDRCxTQUZELE1BRU87QUFDTCxjQUFJLENBQUo7QUFDRDtBQUNGLE9BUE0sTUFPQSxJQUFJLENBQUMsQ0FBTCxFQUFRO0FBQ2IsWUFBSSxJQUFJLENBQVI7QUFDRCxPQUZNLE1BRUEsQ0FFTjs7QUFFRDs7O0FBR0EsVUFBSSxNQUFNLGFBQWEsS0FBbkIsSUFDQSxNQUFNLGFBQWEsTUFEbkIsSUFFQSxXQUFXLGFBQWEsTUFGNUIsRUFFb0M7QUFDbEM7QUFDRDs7QUFFRCx1QkFBaUIsS0FBakIsR0FBeUIsYUFBYSxLQUFiLEdBQXFCLENBQTlDO0FBQ0EsdUJBQWlCLE1BQWpCLEdBQTBCLGFBQWEsTUFBYixHQUFzQixDQUFoRDtBQUNBLG1CQUFhLE1BQWIsR0FBc0IsTUFBdEI7O0FBRUEsU0FBRyxnQkFBSCxDQUFvQixlQUFwQixFQUFxQyxhQUFhLFlBQWxEO0FBQ0EsU0FBRyxtQkFBSCxDQUF1QixlQUF2QixFQUF3QyxNQUF4QyxFQUFnRCxDQUFoRCxFQUFtRCxDQUFuRDs7QUFFQSxVQUFJLE9BQU8sT0FBWCxFQUFvQjtBQUNsQixxQkFBYSxLQUFiLENBQW1CLElBQW5CLEdBQTBCLG9CQUFvQixhQUFhLE1BQWpDLEVBQXlDLGFBQWEsS0FBdEQsRUFBNkQsYUFBYSxNQUExRSxDQUExQjtBQUNEO0FBQ0QsdUJBQWlCLE1BQWpCLEdBQTBCLGtCQUFrQixhQUFhLE1BQS9CLENBQTFCOztBQUVBLGFBQU8sZ0JBQVA7QUFDRDs7QUFFRCxhQUFTLE1BQVQsQ0FBaUIsRUFBakIsRUFBcUIsRUFBckIsRUFBeUI7QUFDdkIsVUFBSSxJQUFJLEtBQUssQ0FBYjtBQUNBLFVBQUksSUFBSyxLQUFLLENBQU4sSUFBWSxDQUFwQjs7QUFFQSxVQUFJLE1BQU0sYUFBYSxLQUFuQixJQUE0QixNQUFNLGFBQWEsTUFBbkQsRUFBMkQ7QUFDekQsZUFBTyxnQkFBUDtBQUNEOztBQUVEOzs7QUFHQSx1QkFBaUIsS0FBakIsR0FBeUIsYUFBYSxLQUFiLEdBQXFCLENBQTlDO0FBQ0EsdUJBQWlCLE1BQWpCLEdBQTBCLGFBQWEsTUFBYixHQUFzQixDQUFoRDs7QUFFQSxTQUFHLGdCQUFILENBQW9CLGVBQXBCLEVBQXFDLGFBQWEsWUFBbEQ7QUFDQSxTQUFHLG1CQUFILENBQXVCLGVBQXZCLEVBQXdDLGFBQWEsTUFBckQsRUFBNkQsQ0FBN0QsRUFBZ0UsQ0FBaEU7O0FBRUE7QUFDQSxVQUFJLE9BQU8sT0FBWCxFQUFvQjtBQUNsQixxQkFBYSxLQUFiLENBQW1CLElBQW5CLEdBQTBCLG9CQUN4QixhQUFhLE1BRFcsRUFDSCxhQUFhLEtBRFYsRUFDaUIsYUFBYSxNQUQ5QixDQUExQjtBQUVEOztBQUVELGFBQU8sZ0JBQVA7QUFDRDs7QUFFRCxxQkFBaUIsQ0FBakIsRUFBb0IsQ0FBcEI7O0FBRUEscUJBQWlCLE1BQWpCLEdBQTBCLE1BQTFCO0FBQ0EscUJBQWlCLFNBQWpCLEdBQTZCLGNBQTdCO0FBQ0EscUJBQWlCLGFBQWpCLEdBQWlDLFlBQWpDO0FBQ0EsUUFBSSxPQUFPLE9BQVgsRUFBb0I7QUFDbEIsdUJBQWlCLEtBQWpCLEdBQXlCLGFBQWEsS0FBdEM7QUFDRDtBQUNELHFCQUFpQixPQUFqQixHQUEyQixZQUFZO0FBQ3JDLG1CQUFhLE1BQWI7QUFDRCxLQUZEOztBQUlBLFdBQU8sZ0JBQVA7QUFDRDs7QUFFRCxNQUFJLE9BQU8sT0FBWCxFQUFvQjtBQUNsQixVQUFNLHdCQUFOLEdBQWlDLFlBQVk7QUFDM0MsVUFBSSxRQUFRLENBQVo7QUFDQSxhQUFPLElBQVAsQ0FBWSxlQUFaLEVBQTZCLE9BQTdCLENBQXFDLFVBQVUsR0FBVixFQUFlO0FBQ2xELGlCQUFTLGdCQUFnQixHQUFoQixFQUFxQixLQUFyQixDQUEyQixJQUFwQztBQUNELE9BRkQ7QUFHQSxhQUFPLEtBQVA7QUFDRCxLQU5EO0FBT0Q7O0FBRUQsV0FBUyxvQkFBVCxHQUFpQztBQUMvQixXQUFPLGVBQVAsRUFBd0IsT0FBeEIsQ0FBZ0MsVUFBVSxFQUFWLEVBQWM7QUFDNUMsU0FBRyxZQUFILEdBQWtCLEdBQUcsa0JBQUgsRUFBbEI7QUFDQSxTQUFHLGdCQUFILENBQW9CLGVBQXBCLEVBQXFDLEdBQUcsWUFBeEM7QUFDQSxTQUFHLG1CQUFILENBQXVCLGVBQXZCLEVBQXdDLEdBQUcsTUFBM0MsRUFBbUQsR0FBRyxLQUF0RCxFQUE2RCxHQUFHLE1BQWhFO0FBQ0QsS0FKRDtBQUtBLE9BQUcsZ0JBQUgsQ0FBb0IsZUFBcEIsRUFBcUMsSUFBckM7QUFDRDs7QUFFRCxTQUFPO0FBQ0wsWUFBUSxrQkFESDtBQUVMLFdBQU8sWUFBWTtBQUNqQixhQUFPLGVBQVAsRUFBd0IsT0FBeEIsQ0FBZ0MsT0FBaEM7QUFDRCxLQUpJO0FBS0wsYUFBUztBQUxKLEdBQVA7QUFPRCxDQXhNRDs7OztBQ3JDQSxJQUFJLFNBQVMsUUFBUSxlQUFSLENBQWI7O0FBRUEsSUFBSSxxQkFBcUIsS0FBekI7QUFDQSxJQUFJLG1CQUFtQixLQUF2Qjs7QUFFQSxJQUFJLHFCQUFxQixNQUF6QjtBQUNBLElBQUksdUJBQXVCLE1BQTNCOztBQUVBLE9BQU8sT0FBUCxHQUFpQixTQUFTLGVBQVQsQ0FBMEIsRUFBMUIsRUFBOEIsV0FBOUIsRUFBMkMsS0FBM0MsRUFBa0QsTUFBbEQsRUFBMEQ7QUFDekU7QUFDQTtBQUNBO0FBQ0EsTUFBSSxjQUFjLEVBQWxCO0FBQ0EsTUFBSSxjQUFjLEVBQWxCOztBQUVBLFdBQVMsVUFBVCxDQUFxQixJQUFyQixFQUEyQixFQUEzQixFQUErQixRQUEvQixFQUF5QyxJQUF6QyxFQUErQztBQUM3QyxTQUFLLElBQUwsR0FBWSxJQUFaO0FBQ0EsU0FBSyxFQUFMLEdBQVUsRUFBVjtBQUNBLFNBQUssUUFBTCxHQUFnQixRQUFoQjtBQUNBLFNBQUssSUFBTCxHQUFZLElBQVo7QUFDRDs7QUFFRCxXQUFTLGdCQUFULENBQTJCLElBQTNCLEVBQWlDLElBQWpDLEVBQXVDO0FBQ3JDLFNBQUssSUFBSSxJQUFJLENBQWIsRUFBZ0IsSUFBSSxLQUFLLE1BQXpCLEVBQWlDLEVBQUUsQ0FBbkMsRUFBc0M7QUFDcEMsVUFBSSxLQUFLLENBQUwsRUFBUSxFQUFSLEtBQWUsS0FBSyxFQUF4QixFQUE0QjtBQUMxQixhQUFLLENBQUwsRUFBUSxRQUFSLEdBQW1CLEtBQUssUUFBeEI7QUFDQTtBQUNEO0FBQ0Y7QUFDRCxTQUFLLElBQUwsQ0FBVSxJQUFWO0FBQ0Q7O0FBRUQsV0FBUyxTQUFULENBQW9CLElBQXBCLEVBQTBCLEVBQTFCLEVBQThCLE9BQTlCLEVBQXVDO0FBQ3JDLFFBQUksUUFBUSxTQUFTLGtCQUFULEdBQThCLFdBQTlCLEdBQTRDLFdBQXhEO0FBQ0EsUUFBSSxTQUFTLE1BQU0sRUFBTixDQUFiOztBQUVBLFFBQUksQ0FBQyxNQUFMLEVBQWE7QUFDWCxVQUFJLFNBQVMsWUFBWSxHQUFaLENBQWdCLEVBQWhCLENBQWI7QUFDQSxlQUFTLEdBQUcsWUFBSCxDQUFnQixJQUFoQixDQUFUO0FBQ0EsU0FBRyxZQUFILENBQWdCLE1BQWhCLEVBQXdCLE1BQXhCO0FBQ0EsU0FBRyxhQUFILENBQWlCLE1BQWpCOztBQUVBLFlBQU0sRUFBTixJQUFZLE1BQVo7QUFDRDs7QUFFRCxXQUFPLE1BQVA7QUFDRDs7QUFFRDtBQUNBO0FBQ0E7QUFDQSxNQUFJLGVBQWUsRUFBbkI7QUFDQSxNQUFJLGNBQWMsRUFBbEI7O0FBRUEsTUFBSSxrQkFBa0IsQ0FBdEI7O0FBRUEsV0FBUyxXQUFULENBQXNCLE1BQXRCLEVBQThCLE1BQTlCLEVBQXNDO0FBQ3BDLFNBQUssRUFBTCxHQUFVLGlCQUFWO0FBQ0EsU0FBSyxNQUFMLEdBQWMsTUFBZDtBQUNBLFNBQUssTUFBTCxHQUFjLE1BQWQ7QUFDQSxTQUFLLE9BQUwsR0FBZSxJQUFmO0FBQ0EsU0FBSyxRQUFMLEdBQWdCLEVBQWhCO0FBQ0EsU0FBSyxVQUFMLEdBQWtCLEVBQWxCOztBQUVBLFFBQUksT0FBTyxPQUFYLEVBQW9CO0FBQ2xCLFdBQUssS0FBTCxHQUFhO0FBQ1gsdUJBQWUsQ0FESjtBQUVYLHlCQUFpQjtBQUZOLE9BQWI7QUFJRDtBQUNGOztBQUVELFdBQVMsV0FBVCxDQUFzQixJQUF0QixFQUE0QixPQUE1QixFQUFxQztBQUNuQyxRQUFJLENBQUosRUFBTyxJQUFQOztBQUVBO0FBQ0E7QUFDQTtBQUNBLFFBQUksYUFBYSxVQUFVLGtCQUFWLEVBQThCLEtBQUssTUFBbkMsQ0FBakI7QUFDQSxRQUFJLGFBQWEsVUFBVSxnQkFBVixFQUE0QixLQUFLLE1BQWpDLENBQWpCOztBQUVBLFFBQUksVUFBVSxLQUFLLE9BQUwsR0FBZSxHQUFHLGFBQUgsRUFBN0I7QUFDQSxPQUFHLFlBQUgsQ0FBZ0IsT0FBaEIsRUFBeUIsVUFBekI7QUFDQSxPQUFHLFlBQUgsQ0FBZ0IsT0FBaEIsRUFBeUIsVUFBekI7QUFDQSxPQUFHLFdBQUgsQ0FBZSxPQUFmOztBQUdBO0FBQ0E7QUFDQTtBQUNBLFFBQUksY0FBYyxHQUFHLG1CQUFILENBQXVCLE9BQXZCLEVBQWdDLGtCQUFoQyxDQUFsQjtBQUNBLFFBQUksT0FBTyxPQUFYLEVBQW9CO0FBQ2xCLFdBQUssS0FBTCxDQUFXLGFBQVgsR0FBMkIsV0FBM0I7QUFDRDtBQUNELFFBQUksV0FBVyxLQUFLLFFBQXBCO0FBQ0EsU0FBSyxJQUFJLENBQVQsRUFBWSxJQUFJLFdBQWhCLEVBQTZCLEVBQUUsQ0FBL0IsRUFBa0M7QUFDaEMsYUFBTyxHQUFHLGdCQUFILENBQW9CLE9BQXBCLEVBQTZCLENBQTdCLENBQVA7QUFDQSxVQUFJLElBQUosRUFBVTtBQUNSLFlBQUksS0FBSyxJQUFMLEdBQVksQ0FBaEIsRUFBbUI7QUFDakIsZUFBSyxJQUFJLElBQUksQ0FBYixFQUFnQixJQUFJLEtBQUssSUFBekIsRUFBK0IsRUFBRSxDQUFqQyxFQUFvQztBQUNsQyxnQkFBSSxPQUFPLEtBQUssSUFBTCxDQUFVLE9BQVYsQ0FBa0IsS0FBbEIsRUFBeUIsTUFBTSxDQUFOLEdBQVUsR0FBbkMsQ0FBWDtBQUNBLDZCQUFpQixRQUFqQixFQUEyQixJQUFJLFVBQUosQ0FDekIsSUFEeUIsRUFFekIsWUFBWSxFQUFaLENBQWUsSUFBZixDQUZ5QixFQUd6QixHQUFHLGtCQUFILENBQXNCLE9BQXRCLEVBQStCLElBQS9CLENBSHlCLEVBSXpCLElBSnlCLENBQTNCO0FBS0Q7QUFDRixTQVRELE1BU087QUFDTCwyQkFBaUIsUUFBakIsRUFBMkIsSUFBSSxVQUFKLENBQ3pCLEtBQUssSUFEb0IsRUFFekIsWUFBWSxFQUFaLENBQWUsS0FBSyxJQUFwQixDQUZ5QixFQUd6QixHQUFHLGtCQUFILENBQXNCLE9BQXRCLEVBQStCLEtBQUssSUFBcEMsQ0FIeUIsRUFJekIsSUFKeUIsQ0FBM0I7QUFLRDtBQUNGO0FBQ0Y7O0FBRUQ7QUFDQTtBQUNBO0FBQ0EsUUFBSSxnQkFBZ0IsR0FBRyxtQkFBSCxDQUF1QixPQUF2QixFQUFnQyxvQkFBaEMsQ0FBcEI7QUFDQSxRQUFJLE9BQU8sT0FBWCxFQUFvQjtBQUNsQixXQUFLLEtBQUwsQ0FBVyxlQUFYLEdBQTZCLGFBQTdCO0FBQ0Q7O0FBRUQsUUFBSSxhQUFhLEtBQUssVUFBdEI7QUFDQSxTQUFLLElBQUksQ0FBVCxFQUFZLElBQUksYUFBaEIsRUFBK0IsRUFBRSxDQUFqQyxFQUFvQztBQUNsQyxhQUFPLEdBQUcsZUFBSCxDQUFtQixPQUFuQixFQUE0QixDQUE1QixDQUFQO0FBQ0EsVUFBSSxJQUFKLEVBQVU7QUFDUix5QkFBaUIsVUFBakIsRUFBNkIsSUFBSSxVQUFKLENBQzNCLEtBQUssSUFEc0IsRUFFM0IsWUFBWSxFQUFaLENBQWUsS0FBSyxJQUFwQixDQUYyQixFQUczQixHQUFHLGlCQUFILENBQXFCLE9BQXJCLEVBQThCLEtBQUssSUFBbkMsQ0FIMkIsRUFJM0IsSUFKMkIsQ0FBN0I7QUFLRDtBQUNGO0FBQ0Y7O0FBRUQsTUFBSSxPQUFPLE9BQVgsRUFBb0I7QUFDbEIsVUFBTSxtQkFBTixHQUE0QixZQUFZO0FBQ3RDLFVBQUksSUFBSSxDQUFSO0FBQ0Esa0JBQVksT0FBWixDQUFvQixVQUFVLElBQVYsRUFBZ0I7QUFDbEMsWUFBSSxLQUFLLEtBQUwsQ0FBVyxhQUFYLEdBQTJCLENBQS9CLEVBQWtDO0FBQ2hDLGNBQUksS0FBSyxLQUFMLENBQVcsYUFBZjtBQUNEO0FBQ0YsT0FKRDtBQUtBLGFBQU8sQ0FBUDtBQUNELEtBUkQ7O0FBVUEsVUFBTSxxQkFBTixHQUE4QixZQUFZO0FBQ3hDLFVBQUksSUFBSSxDQUFSO0FBQ0Esa0JBQVksT0FBWixDQUFvQixVQUFVLElBQVYsRUFBZ0I7QUFDbEMsWUFBSSxLQUFLLEtBQUwsQ0FBVyxlQUFYLEdBQTZCLENBQWpDLEVBQW9DO0FBQ2xDLGNBQUksS0FBSyxLQUFMLENBQVcsZUFBZjtBQUNEO0FBQ0YsT0FKRDtBQUtBLGFBQU8sQ0FBUDtBQUNELEtBUkQ7QUFTRDs7QUFFRCxXQUFTLGNBQVQsR0FBMkI7QUFDekIsa0JBQWMsRUFBZDtBQUNBLGtCQUFjLEVBQWQ7QUFDQSxTQUFLLElBQUksSUFBSSxDQUFiLEVBQWdCLElBQUksWUFBWSxNQUFoQyxFQUF3QyxFQUFFLENBQTFDLEVBQTZDO0FBQzNDLGtCQUFZLFlBQVksQ0FBWixDQUFaO0FBQ0Q7QUFDRjs7QUFFRCxTQUFPO0FBQ0wsV0FBTyxZQUFZO0FBQ2pCLFVBQUksZUFBZSxHQUFHLFlBQUgsQ0FBZ0IsSUFBaEIsQ0FBcUIsRUFBckIsQ0FBbkI7QUFDQSxhQUFPLFdBQVAsRUFBb0IsT0FBcEIsQ0FBNEIsWUFBNUI7QUFDQSxvQkFBYyxFQUFkO0FBQ0EsYUFBTyxXQUFQLEVBQW9CLE9BQXBCLENBQTRCLFlBQTVCO0FBQ0Esb0JBQWMsRUFBZDs7QUFFQSxrQkFBWSxPQUFaLENBQW9CLFVBQVUsSUFBVixFQUFnQjtBQUNsQyxXQUFHLGFBQUgsQ0FBaUIsS0FBSyxPQUF0QjtBQUNELE9BRkQ7QUFHQSxrQkFBWSxNQUFaLEdBQXFCLENBQXJCO0FBQ0EscUJBQWUsRUFBZjs7QUFFQSxZQUFNLFdBQU4sR0FBb0IsQ0FBcEI7QUFDRCxLQWZJOztBQWlCTCxhQUFTLFVBQVUsTUFBVixFQUFrQixNQUFsQixFQUEwQixPQUExQixFQUFtQzs7QUFJMUMsWUFBTSxXQUFOOztBQUVBLFVBQUksUUFBUSxhQUFhLE1BQWIsQ0FBWjtBQUNBLFVBQUksQ0FBQyxLQUFMLEVBQVk7QUFDVixnQkFBUSxhQUFhLE1BQWIsSUFBdUIsRUFBL0I7QUFDRDtBQUNELFVBQUksVUFBVSxNQUFNLE1BQU4sQ0FBZDtBQUNBLFVBQUksQ0FBQyxPQUFMLEVBQWM7QUFDWixrQkFBVSxJQUFJLFdBQUosQ0FBZ0IsTUFBaEIsRUFBd0IsTUFBeEIsQ0FBVjtBQUNBLG9CQUFZLE9BQVosRUFBcUIsT0FBckI7QUFDQSxjQUFNLE1BQU4sSUFBZ0IsT0FBaEI7QUFDQSxvQkFBWSxJQUFaLENBQWlCLE9BQWpCO0FBQ0Q7QUFDRCxhQUFPLE9BQVA7QUFDRCxLQW5DSTs7QUFxQ0wsYUFBUyxjQXJDSjs7QUF1Q0wsWUFBUSxTQXZDSDs7QUF5Q0wsVUFBTSxDQUFDLENBekNGO0FBMENMLFVBQU0sQ0FBQztBQTFDRixHQUFQO0FBNENELENBNU1EOzs7O0FDUkEsT0FBTyxPQUFQLEdBQWlCLFNBQVMsS0FBVCxHQUFrQjtBQUNqQyxTQUFPO0FBQ0wsaUJBQWEsQ0FEUjtBQUVMLG1CQUFlLENBRlY7QUFHTCxzQkFBa0IsQ0FIYjtBQUlMLGlCQUFhLENBSlI7QUFLTCxrQkFBYyxDQUxUO0FBTUwsZUFBVyxDQU5OO0FBT0wsdUJBQW1CLENBUGQ7O0FBU0wscUJBQWlCO0FBVFosR0FBUDtBQVdELENBWkQ7OztBQ0RBLE9BQU8sT0FBUCxHQUFpQixTQUFTLGlCQUFULEdBQThCO0FBQzdDLE1BQUksWUFBWSxFQUFDLElBQUksQ0FBTCxFQUFoQjtBQUNBLE1BQUksZUFBZSxDQUFDLEVBQUQsQ0FBbkI7QUFDQSxTQUFPO0FBQ0wsUUFBSSxVQUFVLEdBQVYsRUFBZTtBQUNqQixVQUFJLFNBQVMsVUFBVSxHQUFWLENBQWI7QUFDQSxVQUFJLE1BQUosRUFBWTtBQUNWLGVBQU8sTUFBUDtBQUNEO0FBQ0QsZUFBUyxVQUFVLEdBQVYsSUFBaUIsYUFBYSxNQUF2QztBQUNBLG1CQUFhLElBQWIsQ0FBa0IsR0FBbEI7QUFDQSxhQUFPLE1BQVA7QUFDRCxLQVRJOztBQVdMLFNBQUssVUFBVSxFQUFWLEVBQWM7QUFDakIsYUFBTyxhQUFhLEVBQWIsQ0FBUDtBQUNEO0FBYkksR0FBUDtBQWVELENBbEJEOzs7O0FDQ0EsSUFBSSxTQUFTLFFBQVEsZUFBUixDQUFiO0FBQ0EsSUFBSSxTQUFTLFFBQVEsZUFBUixDQUFiO0FBQ0EsSUFBSSxlQUFlLFFBQVEsdUJBQVIsQ0FBbkI7QUFDQSxJQUFJLGdCQUFnQixRQUFRLG1CQUFSLENBQXBCO0FBQ0EsSUFBSSxPQUFPLFFBQVEsYUFBUixDQUFYO0FBQ0EsSUFBSSxxQkFBcUIsUUFBUSxzQkFBUixDQUF6QjtBQUNBLElBQUksY0FBYyxRQUFRLHNCQUFSLENBQWxCO0FBQ0EsSUFBSSxlQUFlLFFBQVEsZ0JBQVIsQ0FBbkI7O0FBRUEsSUFBSSxTQUFTLFFBQVEsNkJBQVIsQ0FBYjtBQUNBLElBQUksYUFBYSxRQUFRLDZCQUFSLENBQWpCOztBQUVBLElBQUksZ0NBQWdDLE1BQXBDOztBQUVBLElBQUksZ0JBQWdCLE1BQXBCO0FBQ0EsSUFBSSxzQkFBc0IsTUFBMUI7QUFDQSxJQUFJLGlDQUFpQyxNQUFyQzs7QUFFQSxJQUFJLFVBQVUsTUFBZDtBQUNBLElBQUksV0FBVyxNQUFmO0FBQ0EsSUFBSSxTQUFTLE1BQWI7QUFDQSxJQUFJLGVBQWUsTUFBbkI7QUFDQSxJQUFJLHFCQUFxQixNQUF6Qjs7QUFFQSxJQUFJLFdBQVcsTUFBZjtBQUNBLElBQUksYUFBYSxNQUFqQjtBQUNBLElBQUksWUFBWSxNQUFoQjs7QUFFQSxJQUFJLDRCQUE0QixNQUFoQztBQUNBLElBQUksNEJBQTRCLE1BQWhDO0FBQ0EsSUFBSSwwQkFBMEIsTUFBOUI7QUFDQSxJQUFJLDZCQUE2QixNQUFqQzs7QUFFQSxJQUFJLHFCQUFxQixNQUF6QjtBQUNBLElBQUksbUJBQW1CLE1BQXZCOztBQUVBLElBQUksY0FBYyxNQUFsQjtBQUNBLElBQUksb0JBQW9CLE1BQXhCOztBQUVBLElBQUksb0JBQW9CLE1BQXhCOztBQUVBLElBQUksa0NBQWtDLE1BQXRDO0FBQ0EsSUFBSSxtQ0FBbUMsTUFBdkM7QUFDQSxJQUFJLG1DQUFtQyxNQUF2QztBQUNBLElBQUksbUNBQW1DLE1BQXZDOztBQUVBLElBQUksOEJBQThCLE1BQWxDO0FBQ0EsSUFBSSw4Q0FBOEMsTUFBbEQ7QUFDQSxJQUFJLGtEQUFrRCxNQUF0RDs7QUFFQSxJQUFJLHFDQUFxQyxNQUF6QztBQUNBLElBQUkscUNBQXFDLE1BQXpDO0FBQ0EsSUFBSSxzQ0FBc0MsTUFBMUM7QUFDQSxJQUFJLHNDQUFzQyxNQUExQzs7QUFFQSxJQUFJLCtCQUErQixNQUFuQzs7QUFFQSxJQUFJLG1CQUFtQixNQUF2QjtBQUNBLElBQUksb0JBQW9CLE1BQXhCO0FBQ0EsSUFBSSxrQkFBa0IsTUFBdEI7QUFDQSxJQUFJLFdBQVcsTUFBZjs7QUFFQSxJQUFJLG9CQUFvQixNQUF4QjtBQUNBLElBQUksb0JBQW9CLE1BQXhCOztBQUVBLElBQUksWUFBWSxNQUFoQjtBQUNBLElBQUksbUJBQW1CLE1BQXZCO0FBQ0EsSUFBSSxxQkFBcUIsTUFBekI7O0FBRUEsSUFBSSx3QkFBd0IsTUFBNUI7QUFDQSxJQUFJLHdCQUF3QixNQUE1Qjs7QUFFQSxJQUFJLGFBQWEsTUFBakI7QUFDQSxJQUFJLFlBQVksTUFBaEI7QUFDQSxJQUFJLDRCQUE0QixNQUFoQztBQUNBLElBQUksMkJBQTJCLE1BQS9CO0FBQ0EsSUFBSSwyQkFBMkIsTUFBL0I7QUFDQSxJQUFJLDBCQUEwQixNQUE5Qjs7QUFFQSxJQUFJLDBCQUEwQixNQUE5QjtBQUNBLElBQUksZUFBZSxNQUFuQjtBQUNBLElBQUksYUFBYSxNQUFqQjtBQUNBLElBQUksWUFBWSxNQUFoQjs7QUFFQSxJQUFJLGdDQUFnQyxNQUFwQzs7QUFFQSxJQUFJLHNCQUFzQixNQUExQjtBQUNBLElBQUkseUJBQXlCLE1BQTdCO0FBQ0EsSUFBSSxvQ0FBb0MsTUFBeEM7QUFDQSxJQUFJLHdDQUF3QyxNQUE1Qzs7QUFFQSxJQUFJLDJCQUEyQixNQUEvQjs7QUFFQSxJQUFJLGNBQWMsTUFBbEI7O0FBRUEsSUFBSSxpQkFBaUIsQ0FDbkIseUJBRG1CLEVBRW5CLHdCQUZtQixFQUduQix3QkFIbUIsRUFJbkIsdUJBSm1CLENBQXJCOztBQU9BLElBQUksa0JBQWtCLENBQ3BCLENBRG9CLEVBRXBCLFlBRm9CLEVBR3BCLGtCQUhvQixFQUlwQixNQUpvQixFQUtwQixPQUxvQixDQUF0Qjs7QUFRQSxJQUFJLGtCQUFrQixFQUF0QjtBQUNBLGdCQUFnQixZQUFoQixJQUNBLGdCQUFnQixRQUFoQixJQUNBLGdCQUFnQixrQkFBaEIsSUFBc0MsQ0FGdEM7QUFHQSxnQkFBZ0IsZ0JBQWhCLElBQ0EsZ0JBQWdCLGtCQUFoQixJQUFzQyxDQUR0QztBQUVBLGdCQUFnQixNQUFoQixJQUNBLGdCQUFnQixXQUFoQixJQUErQixDQUQvQjtBQUVBLGdCQUFnQixPQUFoQixJQUNBLGdCQUFnQixpQkFBaEIsSUFBcUMsQ0FEckM7O0FBR0EsSUFBSSxjQUFjLEVBQWxCO0FBQ0EsWUFBWSxRQUFaLElBQXdCLHlCQUF4QjtBQUNBLFlBQVksU0FBWixJQUF5Qix1QkFBekI7QUFDQSxZQUFZLFVBQVosSUFBMEIseUJBQTFCO0FBQ0EsWUFBWSxrQkFBWixJQUFrQyxlQUFsQztBQUNBLFlBQVksZ0JBQVosSUFBZ0MsMEJBQWhDOztBQUVBLFNBQVMsVUFBVCxDQUFxQixHQUFyQixFQUEwQjtBQUN4QixTQUFPLGFBQWEsR0FBYixHQUFtQixHQUExQjtBQUNEOztBQUVELElBQUksZUFBZSxXQUFXLG1CQUFYLENBQW5CO0FBQ0EsSUFBSSxrQkFBa0IsV0FBVywwQkFBWCxDQUF0QjtBQUNBLElBQUksY0FBYyxXQUFXLGtCQUFYLENBQWxCO0FBQ0EsSUFBSSxjQUFjLFdBQVcsa0JBQVgsQ0FBbEI7O0FBRUEsSUFBSSxnQkFBZ0IsT0FBTyxJQUFQLENBQVksTUFBWixFQUFvQixNQUFwQixDQUEyQixDQUM3QyxZQUQ2QyxFQUU3QyxlQUY2QyxFQUc3QyxXQUg2QyxFQUk3QyxXQUo2QyxDQUEzQixDQUFwQjs7QUFPQTtBQUNBO0FBQ0EsSUFBSSxhQUFhLEVBQWpCO0FBQ0EsV0FBVyxnQkFBWCxJQUErQixDQUEvQjtBQUNBLFdBQVcsUUFBWCxJQUF1QixDQUF2QjtBQUNBLFdBQVcsaUJBQVgsSUFBZ0MsQ0FBaEM7O0FBRUEsV0FBVyxpQkFBWCxJQUFnQyxDQUFoQztBQUNBLFdBQVcsZUFBWCxJQUE4QixDQUE5Qjs7QUFFQSxJQUFJLHVCQUF1QixFQUEzQjtBQUNBLHFCQUFxQixRQUFyQixJQUFpQyxDQUFqQztBQUNBLHFCQUFxQixVQUFyQixJQUFtQyxDQUFuQztBQUNBLHFCQUFxQixTQUFyQixJQUFrQyxDQUFsQztBQUNBLHFCQUFxQixnQkFBckIsSUFBeUMsQ0FBekM7O0FBRUEscUJBQXFCLCtCQUFyQixJQUF3RCxHQUF4RDtBQUNBLHFCQUFxQixnQ0FBckIsSUFBeUQsR0FBekQ7QUFDQSxxQkFBcUIsZ0NBQXJCLElBQXlELENBQXpEO0FBQ0EscUJBQXFCLGdDQUFyQixJQUF5RCxDQUF6RDs7QUFFQSxxQkFBcUIsMkJBQXJCLElBQW9ELEdBQXBEO0FBQ0EscUJBQXFCLDJDQUFyQixJQUFvRSxDQUFwRTtBQUNBLHFCQUFxQiwrQ0FBckIsSUFBd0UsQ0FBeEU7O0FBRUEscUJBQXFCLGtDQUFyQixJQUEyRCxHQUEzRDtBQUNBLHFCQUFxQixrQ0FBckIsSUFBMkQsSUFBM0Q7QUFDQSxxQkFBcUIsbUNBQXJCLElBQTRELEdBQTVEO0FBQ0EscUJBQXFCLG1DQUFyQixJQUE0RCxJQUE1RDs7QUFFQSxxQkFBcUIsNEJBQXJCLElBQXFELEdBQXJEOztBQUVBLFNBQVMsY0FBVCxDQUF5QixHQUF6QixFQUE4QjtBQUM1QixTQUNFLE1BQU0sT0FBTixDQUFjLEdBQWQsTUFDQyxJQUFJLE1BQUosS0FBZSxDQUFmLElBQ0QsT0FBTyxJQUFJLENBQUosQ0FBUCxLQUFrQixRQUZsQixDQURGO0FBSUQ7O0FBRUQsU0FBUyxXQUFULENBQXNCLEdBQXRCLEVBQTJCO0FBQ3pCLE1BQUksQ0FBQyxNQUFNLE9BQU4sQ0FBYyxHQUFkLENBQUwsRUFBeUI7QUFDdkIsV0FBTyxLQUFQO0FBQ0Q7QUFDRCxNQUFJLFFBQVEsSUFBSSxNQUFoQjtBQUNBLE1BQUksVUFBVSxDQUFWLElBQWUsQ0FBQyxZQUFZLElBQUksQ0FBSixDQUFaLENBQXBCLEVBQXlDO0FBQ3ZDLFdBQU8sS0FBUDtBQUNEO0FBQ0QsU0FBTyxJQUFQO0FBQ0Q7O0FBRUQsU0FBUyxXQUFULENBQXNCLENBQXRCLEVBQXlCO0FBQ3ZCLFNBQU8sT0FBTyxTQUFQLENBQWlCLFFBQWpCLENBQTBCLElBQTFCLENBQStCLENBQS9CLENBQVA7QUFDRDs7QUFFRCxTQUFTLGVBQVQsQ0FBMEIsTUFBMUIsRUFBa0M7QUFDaEMsU0FBTyxZQUFZLE1BQVosTUFBd0IsWUFBL0I7QUFDRDs7QUFFRCxTQUFTLFdBQVQsQ0FBc0IsTUFBdEIsRUFBOEI7QUFDNUIsU0FBTyxZQUFZLE1BQVosTUFBd0IsZUFBL0I7QUFDRDs7QUFFRCxTQUFTLGNBQVQsQ0FBeUIsTUFBekIsRUFBaUM7QUFDL0IsU0FBTyxZQUFZLE1BQVosTUFBd0IsV0FBL0I7QUFDRDs7QUFFRCxTQUFTLGNBQVQsQ0FBeUIsTUFBekIsRUFBaUM7QUFDL0IsU0FBTyxZQUFZLE1BQVosTUFBd0IsV0FBL0I7QUFDRDs7QUFFRCxTQUFTLFdBQVQsQ0FBc0IsTUFBdEIsRUFBOEI7QUFDNUIsTUFBSSxDQUFDLE1BQUwsRUFBYTtBQUNYLFdBQU8sS0FBUDtBQUNEO0FBQ0QsTUFBSSxZQUFZLFlBQVksTUFBWixDQUFoQjtBQUNBLE1BQUksY0FBYyxPQUFkLENBQXNCLFNBQXRCLEtBQW9DLENBQXhDLEVBQTJDO0FBQ3pDLFdBQU8sSUFBUDtBQUNEO0FBQ0QsU0FDRSxlQUFlLE1BQWYsS0FDQSxZQUFZLE1BQVosQ0FEQSxJQUVBLGNBQWMsTUFBZCxDQUhGO0FBSUQ7O0FBRUQsU0FBUyxjQUFULENBQXlCLElBQXpCLEVBQStCO0FBQzdCLFNBQU8sV0FBVyxPQUFPLFNBQVAsQ0FBaUIsUUFBakIsQ0FBMEIsSUFBMUIsQ0FBK0IsSUFBL0IsQ0FBWCxJQUFtRCxDQUExRDtBQUNEOztBQUVELFNBQVMsV0FBVCxDQUFzQixNQUF0QixFQUE4QixJQUE5QixFQUFvQztBQUNsQyxNQUFJLElBQUksS0FBSyxNQUFiO0FBQ0EsVUFBUSxPQUFPLElBQWY7QUFDRSxTQUFLLGdCQUFMO0FBQ0EsU0FBSyxpQkFBTDtBQUNBLFNBQUssZUFBTDtBQUNBLFNBQUssUUFBTDtBQUNFLFVBQUksWUFBWSxLQUFLLFNBQUwsQ0FBZSxPQUFPLElBQXRCLEVBQTRCLENBQTVCLENBQWhCO0FBQ0EsZ0JBQVUsR0FBVixDQUFjLElBQWQ7QUFDQSxhQUFPLElBQVAsR0FBYyxTQUFkO0FBQ0E7O0FBRUYsU0FBSyxpQkFBTDtBQUNFLGFBQU8sSUFBUCxHQUFjLG1CQUFtQixJQUFuQixDQUFkO0FBQ0E7O0FBRUY7O0FBZEY7QUFpQkQ7O0FBRUQsU0FBUyxVQUFULENBQXFCLEtBQXJCLEVBQTRCLENBQTVCLEVBQStCO0FBQzdCLFNBQU8sS0FBSyxTQUFMLENBQ0wsTUFBTSxJQUFOLEtBQWUsaUJBQWYsR0FDSSxRQURKLEdBRUksTUFBTSxJQUhMLEVBR1csQ0FIWCxDQUFQO0FBSUQ7O0FBRUQsU0FBUyxXQUFULENBQXNCLEtBQXRCLEVBQTZCLElBQTdCLEVBQW1DO0FBQ2pDLE1BQUksTUFBTSxJQUFOLEtBQWUsaUJBQW5CLEVBQXNDO0FBQ3BDLFVBQU0sSUFBTixHQUFhLG1CQUFtQixJQUFuQixDQUFiO0FBQ0EsU0FBSyxRQUFMLENBQWMsSUFBZDtBQUNELEdBSEQsTUFHTztBQUNMLFVBQU0sSUFBTixHQUFhLElBQWI7QUFDRDtBQUNGOztBQUVELFNBQVMsYUFBVCxDQUF3QixLQUF4QixFQUErQixLQUEvQixFQUFzQyxPQUF0QyxFQUErQyxPQUEvQyxFQUF3RCxPQUF4RCxFQUFpRSxNQUFqRSxFQUF5RTtBQUN2RSxNQUFJLElBQUksTUFBTSxLQUFkO0FBQ0EsTUFBSSxJQUFJLE1BQU0sTUFBZDtBQUNBLE1BQUksSUFBSSxNQUFNLFFBQWQ7QUFDQSxNQUFJLElBQUksSUFBSSxDQUFKLEdBQVEsQ0FBaEI7QUFDQSxNQUFJLE9BQU8sV0FBVyxLQUFYLEVBQWtCLENBQWxCLENBQVg7O0FBRUEsTUFBSSxJQUFJLENBQVI7QUFDQSxPQUFLLElBQUksSUFBSSxDQUFiLEVBQWdCLElBQUksQ0FBcEIsRUFBdUIsRUFBRSxDQUF6QixFQUE0QjtBQUMxQixTQUFLLElBQUksSUFBSSxDQUFiLEVBQWdCLElBQUksQ0FBcEIsRUFBdUIsRUFBRSxDQUF6QixFQUE0QjtBQUMxQixXQUFLLElBQUksSUFBSSxDQUFiLEVBQWdCLElBQUksQ0FBcEIsRUFBdUIsRUFBRSxDQUF6QixFQUE0QjtBQUMxQixhQUFLLEdBQUwsSUFBWSxNQUFNLFVBQVUsQ0FBVixHQUFjLFVBQVUsQ0FBeEIsR0FBNEIsVUFBVSxDQUF0QyxHQUEwQyxNQUFoRCxDQUFaO0FBQ0Q7QUFDRjtBQUNGOztBQUVELGNBQVksS0FBWixFQUFtQixJQUFuQjtBQUNEOztBQUVELFNBQVMsY0FBVCxDQUF5QixNQUF6QixFQUFpQyxJQUFqQyxFQUF1QyxLQUF2QyxFQUE4QyxNQUE5QyxFQUFzRCxRQUF0RCxFQUFnRSxNQUFoRSxFQUF3RTtBQUN0RSxNQUFJLENBQUo7QUFDQSxNQUFJLE9BQU8scUJBQXFCLE1BQXJCLENBQVAsS0FBd0MsV0FBNUMsRUFBeUQ7QUFDdkQ7QUFDQSxRQUFJLHFCQUFxQixNQUFyQixDQUFKO0FBQ0QsR0FIRCxNQUdPO0FBQ0wsUUFBSSxnQkFBZ0IsTUFBaEIsSUFBMEIsV0FBVyxJQUFYLENBQTlCO0FBQ0Q7O0FBRUQsTUFBSSxNQUFKLEVBQVk7QUFDVixTQUFLLENBQUw7QUFDRDs7QUFFRCxNQUFJLFFBQUosRUFBYztBQUNaO0FBQ0EsUUFBSSxRQUFRLENBQVo7O0FBRUEsUUFBSSxJQUFJLEtBQVI7QUFDQSxXQUFPLEtBQUssQ0FBWixFQUFlO0FBQ2I7QUFDQTtBQUNBLGVBQVMsSUFBSSxDQUFKLEdBQVEsQ0FBakI7QUFDQSxXQUFLLENBQUw7QUFDRDtBQUNELFdBQU8sS0FBUDtBQUNELEdBWkQsTUFZTztBQUNMLFdBQU8sSUFBSSxLQUFKLEdBQVksTUFBbkI7QUFDRDtBQUNGOztBQUVELE9BQU8sT0FBUCxHQUFpQixTQUFTLGdCQUFULENBQ2YsRUFEZSxFQUNYLFVBRFcsRUFDQyxNQURELEVBQ1MsUUFEVCxFQUNtQixZQURuQixFQUNpQyxLQURqQyxFQUN3QyxNQUR4QyxFQUNnRDtBQUMvRDtBQUNBO0FBQ0E7QUFDQSxNQUFJLGFBQWE7QUFDZixrQkFBYyxZQURDO0FBRWYsaUJBQWEsWUFGRTtBQUdmLFlBQVEsU0FITztBQUlmLFlBQVE7QUFKTyxHQUFqQjs7QUFPQSxNQUFJLFlBQVk7QUFDZCxjQUFVLFNBREk7QUFFZCxhQUFTLGdCQUZLO0FBR2QsY0FBVTtBQUhJLEdBQWhCOztBQU1BLE1BQUksYUFBYTtBQUNmLGVBQVcsVUFESTtBQUVmLGNBQVU7QUFGSyxHQUFqQjs7QUFLQSxNQUFJLGFBQWEsT0FBTztBQUN0QixjQUFVLHVCQURZO0FBRXRCLDhCQUEwQix5QkFGSjtBQUd0Qiw2QkFBeUIsd0JBSEg7QUFJdEIsNkJBQXlCLHdCQUpIO0FBS3RCLDRCQUF3QjtBQUxGLEdBQVAsRUFNZCxVQU5jLENBQWpCOztBQVFBLE1BQUksYUFBYTtBQUNmLFlBQVEsQ0FETztBQUVmLGVBQVc7QUFGSSxHQUFqQjs7QUFLQSxNQUFJLGVBQWU7QUFDakIsYUFBUyxnQkFEUTtBQUVqQixhQUFTLHlCQUZRO0FBR2pCLGNBQVUsdUJBSE87QUFJakIsZUFBVztBQUpNLEdBQW5COztBQU9BLE1BQUksaUJBQWlCO0FBQ25CLGFBQVMsUUFEVTtBQUVuQixpQkFBYSxZQUZNO0FBR25CLHVCQUFtQixrQkFIQTtBQUluQixXQUFPLE1BSlk7QUFLbkIsWUFBUSxPQUxXO0FBTW5CLGFBQVMsUUFOVTtBQU9uQixlQUFXLFVBUFE7QUFRbkIsY0FBVTtBQVJTLEdBQXJCOztBQVdBLE1BQUksMkJBQTJCLEVBQS9COztBQUVBLE1BQUksV0FBVyxRQUFmLEVBQXlCO0FBQ3ZCLG1CQUFlLElBQWYsR0FBc0IsV0FBdEI7QUFDQSxtQkFBZSxLQUFmLEdBQXVCLGlCQUF2QjtBQUNEOztBQUVELE1BQUksV0FBVyxpQkFBZixFQUFrQztBQUNoQyxpQkFBYSxPQUFiLEdBQXVCLGFBQWEsS0FBYixHQUFxQixRQUE1QztBQUNEOztBQUVELE1BQUksV0FBVyxzQkFBZixFQUF1QztBQUNyQyxpQkFBYSxTQUFiLElBQTBCLGFBQWEsWUFBYixJQUE2QixpQkFBdkQ7QUFDRDs7QUFFRCxNQUFJLFdBQVcsbUJBQWYsRUFBb0M7QUFDbEMsV0FBTyxjQUFQLEVBQXVCO0FBQ3JCLGVBQVMsa0JBRFk7QUFFckIsdUJBQWlCO0FBRkksS0FBdkI7O0FBS0EsV0FBTyxZQUFQLEVBQXFCO0FBQ25CLGdCQUFVLGlCQURTO0FBRW5CLGdCQUFVLGVBRlM7QUFHbkIsdUJBQWlCO0FBSEUsS0FBckI7QUFLRDs7QUFFRCxNQUFJLFdBQVcsNkJBQWYsRUFBOEM7QUFDNUMsV0FBTyx3QkFBUCxFQUFpQztBQUMvQix1QkFBaUIsK0JBRGM7QUFFL0Isd0JBQWtCLGdDQUZhO0FBRy9CLHdCQUFrQixnQ0FIYTtBQUkvQix3QkFBa0I7QUFKYSxLQUFqQztBQU1EOztBQUVELE1BQUksV0FBVyw0QkFBZixFQUE2QztBQUMzQyxXQUFPLHdCQUFQLEVBQWlDO0FBQy9CLGlCQUFXLDJCQURvQjtBQUUvQixpQ0FBMkIsMkNBRkk7QUFHL0IscUNBQStCO0FBSEEsS0FBakM7QUFLRDs7QUFFRCxNQUFJLFdBQVcsOEJBQWYsRUFBK0M7QUFDN0MsV0FBTyx3QkFBUCxFQUFpQztBQUMvQiwwQkFBb0Isa0NBRFc7QUFFL0IsMEJBQW9CLGtDQUZXO0FBRy9CLDJCQUFxQixtQ0FIVTtBQUkvQiwyQkFBcUI7QUFKVSxLQUFqQztBQU1EOztBQUVELE1BQUksV0FBVyw2QkFBZixFQUE4QztBQUM1Qyw2QkFBeUIsVUFBekIsSUFBdUMsNEJBQXZDO0FBQ0Q7O0FBRUQ7QUFDQSxNQUFJLDZCQUE2QixNQUFNLFNBQU4sQ0FBZ0IsS0FBaEIsQ0FBc0IsSUFBdEIsQ0FDL0IsR0FBRyxZQUFILENBQWdCLDZCQUFoQixDQUQrQixDQUFqQztBQUVBLFNBQU8sSUFBUCxDQUFZLHdCQUFaLEVBQXNDLE9BQXRDLENBQThDLFVBQVUsSUFBVixFQUFnQjtBQUM1RCxRQUFJLFNBQVMseUJBQXlCLElBQXpCLENBQWI7QUFDQSxRQUFJLDJCQUEyQixPQUEzQixDQUFtQyxNQUFuQyxLQUE4QyxDQUFsRCxFQUFxRDtBQUNuRCxxQkFBZSxJQUFmLElBQXVCLE1BQXZCO0FBQ0Q7QUFDRixHQUxEOztBQU9BLE1BQUksbUJBQW1CLE9BQU8sSUFBUCxDQUFZLGNBQVosQ0FBdkI7QUFDQSxTQUFPLGNBQVAsR0FBd0IsZ0JBQXhCOztBQUVBO0FBQ0E7QUFDQSxNQUFJLHVCQUF1QixFQUEzQjtBQUNBLFNBQU8sSUFBUCxDQUFZLGNBQVosRUFBNEIsT0FBNUIsQ0FBb0MsVUFBVSxHQUFWLEVBQWU7QUFDakQsUUFBSSxNQUFNLGVBQWUsR0FBZixDQUFWO0FBQ0EseUJBQXFCLEdBQXJCLElBQTRCLEdBQTVCO0FBQ0QsR0FIRDs7QUFLQTtBQUNBO0FBQ0EsTUFBSSxxQkFBcUIsRUFBekI7QUFDQSxTQUFPLElBQVAsQ0FBWSxZQUFaLEVBQTBCLE9BQTFCLENBQWtDLFVBQVUsR0FBVixFQUFlO0FBQy9DLFFBQUksTUFBTSxhQUFhLEdBQWIsQ0FBVjtBQUNBLHVCQUFtQixHQUFuQixJQUEwQixHQUExQjtBQUNELEdBSEQ7O0FBS0EsTUFBSSxtQkFBbUIsRUFBdkI7QUFDQSxTQUFPLElBQVAsQ0FBWSxVQUFaLEVBQXdCLE9BQXhCLENBQWdDLFVBQVUsR0FBVixFQUFlO0FBQzdDLFFBQUksTUFBTSxXQUFXLEdBQVgsQ0FBVjtBQUNBLHFCQUFpQixHQUFqQixJQUF3QixHQUF4QjtBQUNELEdBSEQ7O0FBS0EsTUFBSSxtQkFBbUIsRUFBdkI7QUFDQSxTQUFPLElBQVAsQ0FBWSxVQUFaLEVBQXdCLE9BQXhCLENBQWdDLFVBQVUsR0FBVixFQUFlO0FBQzdDLFFBQUksTUFBTSxXQUFXLEdBQVgsQ0FBVjtBQUNBLHFCQUFpQixHQUFqQixJQUF3QixHQUF4QjtBQUNELEdBSEQ7O0FBS0EsTUFBSSxrQkFBa0IsRUFBdEI7QUFDQSxTQUFPLElBQVAsQ0FBWSxTQUFaLEVBQXVCLE9BQXZCLENBQStCLFVBQVUsR0FBVixFQUFlO0FBQzVDLFFBQUksTUFBTSxVQUFVLEdBQVYsQ0FBVjtBQUNBLG9CQUFnQixHQUFoQixJQUF1QixHQUF2QjtBQUNELEdBSEQ7O0FBS0E7QUFDQTtBQUNBLE1BQUksZUFBZSxpQkFBaUIsTUFBakIsQ0FBd0IsVUFBVSxLQUFWLEVBQWlCLEdBQWpCLEVBQXNCO0FBQy9ELFFBQUksU0FBUyxlQUFlLEdBQWYsQ0FBYjtBQUNBLFFBQUksV0FBVyxZQUFYLElBQ0EsV0FBVyxRQURYLElBRUEsV0FBVyxZQUZYLElBR0EsV0FBVyxrQkFIWCxJQUlBLFdBQVcsa0JBSlgsSUFLQSxXQUFXLGdCQUxmLEVBS2lDO0FBQy9CLFlBQU0sTUFBTixJQUFnQixNQUFoQjtBQUNELEtBUEQsTUFPTyxJQUFJLFdBQVcsVUFBWCxJQUF5QixJQUFJLE9BQUosQ0FBWSxNQUFaLEtBQXVCLENBQXBELEVBQXVEO0FBQzVELFlBQU0sTUFBTixJQUFnQixPQUFoQjtBQUNELEtBRk0sTUFFQTtBQUNMLFlBQU0sTUFBTixJQUFnQixNQUFoQjtBQUNEO0FBQ0QsV0FBTyxLQUFQO0FBQ0QsR0Fma0IsRUFlaEIsRUFmZ0IsQ0FBbkI7O0FBaUJBLFdBQVMsUUFBVCxHQUFxQjtBQUNuQjtBQUNBLFNBQUssY0FBTCxHQUFzQixPQUF0QjtBQUNBLFNBQUssTUFBTCxHQUFjLE9BQWQ7QUFDQSxTQUFLLElBQUwsR0FBWSxnQkFBWjtBQUNBLFNBQUssVUFBTCxHQUFrQixLQUFsQjs7QUFFQTtBQUNBLFNBQUssZ0JBQUwsR0FBd0IsS0FBeEI7QUFDQSxTQUFLLEtBQUwsR0FBYSxLQUFiO0FBQ0EsU0FBSyxlQUFMLEdBQXVCLENBQXZCO0FBQ0EsU0FBSyxVQUFMLEdBQWtCLENBQWxCOztBQUVBO0FBQ0EsU0FBSyxLQUFMLEdBQWEsQ0FBYjtBQUNBLFNBQUssTUFBTCxHQUFjLENBQWQ7QUFDQSxTQUFLLFFBQUwsR0FBZ0IsQ0FBaEI7QUFDRDs7QUFFRCxXQUFTLFNBQVQsQ0FBb0IsTUFBcEIsRUFBNEIsS0FBNUIsRUFBbUM7QUFDakMsV0FBTyxjQUFQLEdBQXdCLE1BQU0sY0FBOUI7QUFDQSxXQUFPLE1BQVAsR0FBZ0IsTUFBTSxNQUF0QjtBQUNBLFdBQU8sSUFBUCxHQUFjLE1BQU0sSUFBcEI7QUFDQSxXQUFPLFVBQVAsR0FBb0IsTUFBTSxVQUExQjs7QUFFQSxXQUFPLGdCQUFQLEdBQTBCLE1BQU0sZ0JBQWhDO0FBQ0EsV0FBTyxLQUFQLEdBQWUsTUFBTSxLQUFyQjtBQUNBLFdBQU8sZUFBUCxHQUF5QixNQUFNLGVBQS9CO0FBQ0EsV0FBTyxVQUFQLEdBQW9CLE1BQU0sVUFBMUI7O0FBRUEsV0FBTyxLQUFQLEdBQWUsTUFBTSxLQUFyQjtBQUNBLFdBQU8sTUFBUCxHQUFnQixNQUFNLE1BQXRCO0FBQ0EsV0FBTyxRQUFQLEdBQWtCLE1BQU0sUUFBeEI7QUFDRDs7QUFFRCxXQUFTLFVBQVQsQ0FBcUIsS0FBckIsRUFBNEIsT0FBNUIsRUFBcUM7QUFDbkMsUUFBSSxPQUFPLE9BQVAsS0FBbUIsUUFBbkIsSUFBK0IsQ0FBQyxPQUFwQyxFQUE2QztBQUMzQztBQUNEOztBQUVELFFBQUksc0JBQXNCLE9BQTFCLEVBQW1DOztBQUVqQyxZQUFNLGdCQUFOLEdBQXlCLFFBQVEsZ0JBQWpDO0FBQ0Q7O0FBRUQsUUFBSSxXQUFXLE9BQWYsRUFBd0I7O0FBRXRCLFlBQU0sS0FBTixHQUFjLFFBQVEsS0FBdEI7QUFDRDs7QUFFRCxRQUFJLGVBQWUsT0FBbkIsRUFBNEI7O0FBRTFCLFlBQU0sZUFBTixHQUF3QixRQUFRLFNBQWhDO0FBQ0Q7O0FBRUQsUUFBSSxnQkFBZ0IsT0FBcEIsRUFBNkI7O0FBRTNCLFlBQU0sVUFBTixHQUFtQixXQUFXLFFBQVEsVUFBbkIsQ0FBbkI7QUFDRDs7QUFFRCxRQUFJLFVBQVUsT0FBZCxFQUF1QjtBQUNyQixVQUFJLE9BQU8sUUFBUSxJQUFuQjs7QUFLQSxZQUFNLElBQU4sR0FBYSxhQUFhLElBQWIsQ0FBYjtBQUNEOztBQUVELFFBQUksSUFBSSxNQUFNLEtBQWQ7QUFDQSxRQUFJLElBQUksTUFBTSxNQUFkO0FBQ0EsUUFBSSxJQUFJLE1BQU0sUUFBZDtBQUNBLFFBQUksY0FBYyxLQUFsQjtBQUNBLFFBQUksV0FBVyxPQUFmLEVBQXdCOztBQUV0QixVQUFJLFFBQVEsS0FBUixDQUFjLENBQWQsQ0FBSjtBQUNBLFVBQUksUUFBUSxLQUFSLENBQWMsQ0FBZCxDQUFKO0FBQ0EsVUFBSSxRQUFRLEtBQVIsQ0FBYyxNQUFkLEtBQXlCLENBQTdCLEVBQWdDO0FBQzlCLFlBQUksUUFBUSxLQUFSLENBQWMsQ0FBZCxDQUFKOztBQUVBLHNCQUFjLElBQWQ7QUFDRDtBQUdGLEtBWEQsTUFXTztBQUNMLFVBQUksWUFBWSxPQUFoQixFQUF5QjtBQUN2QixZQUFJLElBQUksUUFBUSxNQUFoQjtBQUVEO0FBQ0QsVUFBSSxXQUFXLE9BQWYsRUFBd0I7QUFDdEIsWUFBSSxRQUFRLEtBQVo7QUFFRDtBQUNELFVBQUksWUFBWSxPQUFoQixFQUF5QjtBQUN2QixZQUFJLFFBQVEsTUFBWjtBQUVEO0FBQ0QsVUFBSSxjQUFjLE9BQWxCLEVBQTJCO0FBQ3pCLFlBQUksUUFBUSxRQUFaOztBQUVBLHNCQUFjLElBQWQ7QUFDRDtBQUNGO0FBQ0QsVUFBTSxLQUFOLEdBQWMsSUFBSSxDQUFsQjtBQUNBLFVBQU0sTUFBTixHQUFlLElBQUksQ0FBbkI7QUFDQSxVQUFNLFFBQU4sR0FBaUIsSUFBSSxDQUFyQjs7QUFFQSxRQUFJLFlBQVksS0FBaEI7QUFDQSxRQUFJLFlBQVksT0FBaEIsRUFBeUI7QUFDdkIsVUFBSSxZQUFZLFFBQVEsTUFBeEI7O0FBR0EsVUFBSSxpQkFBaUIsTUFBTSxjQUFOLEdBQXVCLGVBQWUsU0FBZixDQUE1QztBQUNBLFlBQU0sTUFBTixHQUFlLGFBQWEsY0FBYixDQUFmO0FBQ0EsVUFBSSxhQUFhLFlBQWpCLEVBQStCO0FBQzdCLFlBQUksRUFBRSxVQUFVLE9BQVosQ0FBSixFQUEwQjtBQUN4QixnQkFBTSxJQUFOLEdBQWEsYUFBYSxTQUFiLENBQWI7QUFDRDtBQUNGO0FBQ0QsVUFBSSxhQUFhLHdCQUFqQixFQUEyQztBQUN6QyxjQUFNLFVBQU4sR0FBbUIsSUFBbkI7QUFDRDtBQUNELGtCQUFZLElBQVo7QUFDRDs7QUFFRDtBQUNBLFFBQUksQ0FBQyxXQUFELElBQWdCLFNBQXBCLEVBQStCO0FBQzdCLFlBQU0sUUFBTixHQUFpQixnQkFBZ0IsTUFBTSxNQUF0QixDQUFqQjtBQUNELEtBRkQsTUFFTyxJQUFJLGVBQWUsQ0FBQyxTQUFwQixFQUErQjtBQUNwQyxVQUFJLE1BQU0sUUFBTixLQUFtQixnQkFBZ0IsTUFBTSxNQUF0QixDQUF2QixFQUFzRDtBQUNwRCxjQUFNLE1BQU4sR0FBZSxNQUFNLGNBQU4sR0FBdUIsZ0JBQWdCLE1BQU0sUUFBdEIsQ0FBdEM7QUFDRDtBQUNGLEtBSk0sTUFJQSxJQUFJLGFBQWEsV0FBakIsRUFBOEIsQ0FFcEM7QUFDRjs7QUFFRCxXQUFTLFFBQVQsQ0FBbUIsS0FBbkIsRUFBMEI7QUFDeEIsT0FBRyxXQUFILENBQWUsc0JBQWYsRUFBdUMsTUFBTSxLQUE3QztBQUNBLE9BQUcsV0FBSCxDQUFlLGlDQUFmLEVBQWtELE1BQU0sZ0JBQXhEO0FBQ0EsT0FBRyxXQUFILENBQWUscUNBQWYsRUFBc0QsTUFBTSxVQUE1RDtBQUNBLE9BQUcsV0FBSCxDQUFlLG1CQUFmLEVBQW9DLE1BQU0sZUFBMUM7QUFDRDs7QUFFRDtBQUNBO0FBQ0E7QUFDQSxXQUFTLFFBQVQsR0FBcUI7QUFDbkIsYUFBUyxJQUFULENBQWMsSUFBZDs7QUFFQSxTQUFLLE9BQUwsR0FBZSxDQUFmO0FBQ0EsU0FBSyxPQUFMLEdBQWUsQ0FBZjs7QUFFQTtBQUNBLFNBQUssSUFBTCxHQUFZLElBQVo7QUFDQSxTQUFLLFNBQUwsR0FBaUIsS0FBakI7O0FBRUE7QUFDQSxTQUFLLE9BQUwsR0FBZSxJQUFmOztBQUVBO0FBQ0EsU0FBSyxTQUFMLEdBQWlCLEtBQWpCO0FBQ0Q7O0FBRUQsV0FBUyxVQUFULENBQXFCLEtBQXJCLEVBQTRCLE9BQTVCLEVBQXFDO0FBQ25DLFFBQUksT0FBTyxJQUFYO0FBQ0EsUUFBSSxZQUFZLE9BQVosQ0FBSixFQUEwQjtBQUN4QixhQUFPLE9BQVA7QUFDRCxLQUZELE1BRU8sSUFBSSxPQUFKLEVBQWE7O0FBRWxCLGlCQUFXLEtBQVgsRUFBa0IsT0FBbEI7QUFDQSxVQUFJLE9BQU8sT0FBWCxFQUFvQjtBQUNsQixjQUFNLE9BQU4sR0FBZ0IsUUFBUSxDQUFSLEdBQVksQ0FBNUI7QUFDRDtBQUNELFVBQUksT0FBTyxPQUFYLEVBQW9CO0FBQ2xCLGNBQU0sT0FBTixHQUFnQixRQUFRLENBQVIsR0FBWSxDQUE1QjtBQUNEO0FBQ0QsVUFBSSxZQUFZLFFBQVEsSUFBcEIsQ0FBSixFQUErQjtBQUM3QixlQUFPLFFBQVEsSUFBZjtBQUNEO0FBQ0Y7O0FBSUQsUUFBSSxRQUFRLElBQVosRUFBa0I7O0FBRWhCLFVBQUksUUFBUSxhQUFhLGFBQXpCO0FBQ0EsVUFBSSxRQUFRLGFBQWEsY0FBekI7QUFDQSxZQUFNLEtBQU4sR0FBYyxNQUFNLEtBQU4sSUFBZ0IsUUFBUSxNQUFNLE9BQTVDO0FBQ0EsWUFBTSxNQUFOLEdBQWUsTUFBTSxNQUFOLElBQWlCLFFBQVEsTUFBTSxPQUE5QztBQUNBLFlBQU0sU0FBTixHQUFrQixJQUFsQjtBQUVELEtBUkQsTUFRTyxJQUFJLENBQUMsSUFBTCxFQUFXO0FBQ2hCLFlBQU0sS0FBTixHQUFjLE1BQU0sS0FBTixJQUFlLENBQTdCO0FBQ0EsWUFBTSxNQUFOLEdBQWUsTUFBTSxNQUFOLElBQWdCLENBQS9CO0FBQ0EsWUFBTSxRQUFOLEdBQWlCLE1BQU0sUUFBTixJQUFrQixDQUFuQztBQUNELEtBSk0sTUFJQSxJQUFJLGFBQWEsSUFBYixDQUFKLEVBQXdCO0FBQzdCLFlBQU0sUUFBTixHQUFpQixNQUFNLFFBQU4sSUFBa0IsQ0FBbkM7QUFDQSxZQUFNLElBQU4sR0FBYSxJQUFiO0FBQ0EsVUFBSSxFQUFFLFVBQVUsT0FBWixLQUF3QixNQUFNLElBQU4sS0FBZSxnQkFBM0MsRUFBNkQ7QUFDM0QsY0FBTSxJQUFOLEdBQWEsZUFBZSxJQUFmLENBQWI7QUFDRDtBQUNGLEtBTk0sTUFNQSxJQUFJLGVBQWUsSUFBZixDQUFKLEVBQTBCO0FBQy9CLFlBQU0sUUFBTixHQUFpQixNQUFNLFFBQU4sSUFBa0IsQ0FBbkM7QUFDQSxrQkFBWSxLQUFaLEVBQW1CLElBQW5CO0FBQ0EsWUFBTSxTQUFOLEdBQWtCLENBQWxCO0FBQ0EsWUFBTSxTQUFOLEdBQWtCLElBQWxCO0FBQ0QsS0FMTSxNQUtBLElBQUksY0FBYyxJQUFkLENBQUosRUFBeUI7QUFDOUIsVUFBSSxRQUFRLEtBQUssSUFBakI7QUFDQSxVQUFJLENBQUMsTUFBTSxPQUFOLENBQWMsS0FBZCxDQUFELElBQXlCLE1BQU0sSUFBTixLQUFlLGdCQUE1QyxFQUE4RDtBQUM1RCxjQUFNLElBQU4sR0FBYSxlQUFlLEtBQWYsQ0FBYjtBQUNEO0FBQ0QsVUFBSSxRQUFRLEtBQUssS0FBakI7QUFDQSxVQUFJLFNBQVMsS0FBSyxNQUFsQjtBQUNBLFVBQUksTUFBSixFQUFZLE1BQVosRUFBb0IsTUFBcEIsRUFBNEIsT0FBNUIsRUFBcUMsT0FBckMsRUFBOEMsT0FBOUM7QUFDQSxVQUFJLE1BQU0sTUFBTixLQUFpQixDQUFyQixFQUF3QjtBQUN0QixpQkFBUyxNQUFNLENBQU4sQ0FBVDtBQUNBLGtCQUFVLE9BQU8sQ0FBUCxDQUFWO0FBQ0QsT0FIRCxNQUdPOztBQUVMLGlCQUFTLENBQVQ7QUFDQSxrQkFBVSxDQUFWO0FBQ0Q7QUFDRCxlQUFTLE1BQU0sQ0FBTixDQUFUO0FBQ0EsZUFBUyxNQUFNLENBQU4sQ0FBVDtBQUNBLGdCQUFVLE9BQU8sQ0FBUCxDQUFWO0FBQ0EsZ0JBQVUsT0FBTyxDQUFQLENBQVY7QUFDQSxZQUFNLFNBQU4sR0FBa0IsQ0FBbEI7QUFDQSxZQUFNLEtBQU4sR0FBYyxNQUFkO0FBQ0EsWUFBTSxNQUFOLEdBQWUsTUFBZjtBQUNBLFlBQU0sUUFBTixHQUFpQixNQUFqQjtBQUNBLFlBQU0sTUFBTixHQUFlLE1BQU0sY0FBTixHQUF1QixnQkFBZ0IsTUFBaEIsQ0FBdEM7QUFDQSxZQUFNLFNBQU4sR0FBa0IsSUFBbEI7QUFDQSxvQkFBYyxLQUFkLEVBQXFCLEtBQXJCLEVBQTRCLE9BQTVCLEVBQXFDLE9BQXJDLEVBQThDLE9BQTlDLEVBQXVELEtBQUssTUFBNUQ7QUFDRCxLQTNCTSxNQTJCQSxJQUFJLGdCQUFnQixJQUFoQixLQUF5QixZQUFZLElBQVosQ0FBN0IsRUFBZ0Q7QUFDckQsVUFBSSxnQkFBZ0IsSUFBaEIsQ0FBSixFQUEyQjtBQUN6QixjQUFNLE9BQU4sR0FBZ0IsSUFBaEI7QUFDRCxPQUZELE1BRU87QUFDTCxjQUFNLE9BQU4sR0FBZ0IsS0FBSyxNQUFyQjtBQUNEO0FBQ0QsWUFBTSxLQUFOLEdBQWMsTUFBTSxPQUFOLENBQWMsS0FBNUI7QUFDQSxZQUFNLE1BQU4sR0FBZSxNQUFNLE9BQU4sQ0FBYyxNQUE3QjtBQUNBLFlBQU0sUUFBTixHQUFpQixDQUFqQjtBQUNELEtBVE0sTUFTQSxJQUFJLGVBQWUsSUFBZixDQUFKLEVBQTBCO0FBQy9CLFlBQU0sT0FBTixHQUFnQixJQUFoQjtBQUNBLFlBQU0sS0FBTixHQUFjLEtBQUssWUFBbkI7QUFDQSxZQUFNLE1BQU4sR0FBZSxLQUFLLGFBQXBCO0FBQ0EsWUFBTSxRQUFOLEdBQWlCLENBQWpCO0FBQ0QsS0FMTSxNQUtBLElBQUksZUFBZSxJQUFmLENBQUosRUFBMEI7QUFDL0IsWUFBTSxPQUFOLEdBQWdCLElBQWhCO0FBQ0EsWUFBTSxLQUFOLEdBQWMsS0FBSyxVQUFuQjtBQUNBLFlBQU0sTUFBTixHQUFlLEtBQUssV0FBcEI7QUFDQSxZQUFNLFFBQU4sR0FBaUIsQ0FBakI7QUFDRCxLQUxNLE1BS0EsSUFBSSxZQUFZLElBQVosQ0FBSixFQUF1QjtBQUM1QixVQUFJLElBQUksTUFBTSxLQUFOLElBQWUsS0FBSyxDQUFMLEVBQVEsTUFBL0I7QUFDQSxVQUFJLElBQUksTUFBTSxNQUFOLElBQWdCLEtBQUssTUFBN0I7QUFDQSxVQUFJLElBQUksTUFBTSxRQUFkO0FBQ0EsVUFBSSxZQUFZLEtBQUssQ0FBTCxFQUFRLENBQVIsQ0FBWixDQUFKLEVBQTZCO0FBQzNCLFlBQUksS0FBSyxLQUFLLENBQUwsRUFBUSxDQUFSLEVBQVcsTUFBcEI7QUFDRCxPQUZELE1BRU87QUFDTCxZQUFJLEtBQUssQ0FBVDtBQUNEO0FBQ0QsVUFBSSxhQUFhLGFBQWEsS0FBYixDQUFtQixJQUFuQixDQUFqQjtBQUNBLFVBQUksSUFBSSxDQUFSO0FBQ0EsV0FBSyxJQUFJLEtBQUssQ0FBZCxFQUFpQixLQUFLLFdBQVcsTUFBakMsRUFBeUMsRUFBRSxFQUEzQyxFQUErQztBQUM3QyxhQUFLLFdBQVcsRUFBWCxDQUFMO0FBQ0Q7QUFDRCxVQUFJLFlBQVksV0FBVyxLQUFYLEVBQWtCLENBQWxCLENBQWhCO0FBQ0EsbUJBQWEsT0FBYixDQUFxQixJQUFyQixFQUEyQixVQUEzQixFQUF1QyxFQUF2QyxFQUEyQyxTQUEzQztBQUNBLGtCQUFZLEtBQVosRUFBbUIsU0FBbkI7QUFDQSxZQUFNLFNBQU4sR0FBa0IsQ0FBbEI7QUFDQSxZQUFNLEtBQU4sR0FBYyxDQUFkO0FBQ0EsWUFBTSxNQUFOLEdBQWUsQ0FBZjtBQUNBLFlBQU0sUUFBTixHQUFpQixDQUFqQjtBQUNBLFlBQU0sTUFBTixHQUFlLE1BQU0sY0FBTixHQUF1QixnQkFBZ0IsQ0FBaEIsQ0FBdEM7QUFDQSxZQUFNLFNBQU4sR0FBa0IsSUFBbEI7QUFDRDs7QUFFRCxRQUFJLE1BQU0sSUFBTixLQUFlLFFBQW5CLEVBQTZCLENBRTVCLENBRkQsTUFFTyxJQUFJLE1BQU0sSUFBTixLQUFlLGlCQUFuQixFQUFzQyxDQUU1Qzs7QUFFRDtBQUNEOztBQUVELFdBQVMsUUFBVCxDQUFtQixJQUFuQixFQUF5QixNQUF6QixFQUFpQyxRQUFqQyxFQUEyQztBQUN6QyxRQUFJLFVBQVUsS0FBSyxPQUFuQjtBQUNBLFFBQUksT0FBTyxLQUFLLElBQWhCO0FBQ0EsUUFBSSxpQkFBaUIsS0FBSyxjQUExQjtBQUNBLFFBQUksU0FBUyxLQUFLLE1BQWxCO0FBQ0EsUUFBSSxPQUFPLEtBQUssSUFBaEI7QUFDQSxRQUFJLFFBQVEsS0FBSyxLQUFqQjtBQUNBLFFBQUksU0FBUyxLQUFLLE1BQWxCOztBQUVBLGFBQVMsSUFBVDs7QUFFQSxRQUFJLE9BQUosRUFBYTtBQUNYLFNBQUcsVUFBSCxDQUFjLE1BQWQsRUFBc0IsUUFBdEIsRUFBZ0MsTUFBaEMsRUFBd0MsTUFBeEMsRUFBZ0QsSUFBaEQsRUFBc0QsT0FBdEQ7QUFDRCxLQUZELE1BRU8sSUFBSSxLQUFLLFVBQVQsRUFBcUI7QUFDMUIsU0FBRyxvQkFBSCxDQUF3QixNQUF4QixFQUFnQyxRQUFoQyxFQUEwQyxjQUExQyxFQUEwRCxLQUExRCxFQUFpRSxNQUFqRSxFQUF5RSxDQUF6RSxFQUE0RSxJQUE1RTtBQUNELEtBRk0sTUFFQSxJQUFJLEtBQUssU0FBVCxFQUFvQjtBQUN6QjtBQUNBLFNBQUcsY0FBSCxDQUNFLE1BREYsRUFDVSxRQURWLEVBQ29CLE1BRHBCLEVBQzRCLEtBQUssT0FEakMsRUFDMEMsS0FBSyxPQUQvQyxFQUN3RCxLQUR4RCxFQUMrRCxNQUQvRCxFQUN1RSxDQUR2RTtBQUVELEtBSk0sTUFJQTtBQUNMLFNBQUcsVUFBSCxDQUNFLE1BREYsRUFDVSxRQURWLEVBQ29CLE1BRHBCLEVBQzRCLEtBRDVCLEVBQ21DLE1BRG5DLEVBQzJDLENBRDNDLEVBQzhDLE1BRDlDLEVBQ3NELElBRHRELEVBQzRELElBRDVEO0FBRUQ7QUFDRjs7QUFFRCxXQUFTLFdBQVQsQ0FBc0IsSUFBdEIsRUFBNEIsTUFBNUIsRUFBb0MsQ0FBcEMsRUFBdUMsQ0FBdkMsRUFBMEMsUUFBMUMsRUFBb0Q7QUFDbEQsUUFBSSxVQUFVLEtBQUssT0FBbkI7QUFDQSxRQUFJLE9BQU8sS0FBSyxJQUFoQjtBQUNBLFFBQUksaUJBQWlCLEtBQUssY0FBMUI7QUFDQSxRQUFJLFNBQVMsS0FBSyxNQUFsQjtBQUNBLFFBQUksT0FBTyxLQUFLLElBQWhCO0FBQ0EsUUFBSSxRQUFRLEtBQUssS0FBakI7QUFDQSxRQUFJLFNBQVMsS0FBSyxNQUFsQjs7QUFFQSxhQUFTLElBQVQ7O0FBRUEsUUFBSSxPQUFKLEVBQWE7QUFDWCxTQUFHLGFBQUgsQ0FDRSxNQURGLEVBQ1UsUUFEVixFQUNvQixDQURwQixFQUN1QixDQUR2QixFQUMwQixNQUQxQixFQUNrQyxJQURsQyxFQUN3QyxPQUR4QztBQUVELEtBSEQsTUFHTyxJQUFJLEtBQUssVUFBVCxFQUFxQjtBQUMxQixTQUFHLHVCQUFILENBQ0UsTUFERixFQUNVLFFBRFYsRUFDb0IsQ0FEcEIsRUFDdUIsQ0FEdkIsRUFDMEIsY0FEMUIsRUFDMEMsS0FEMUMsRUFDaUQsTUFEakQsRUFDeUQsSUFEekQ7QUFFRCxLQUhNLE1BR0EsSUFBSSxLQUFLLFNBQVQsRUFBb0I7QUFDekI7QUFDQSxTQUFHLGlCQUFILENBQ0UsTUFERixFQUNVLFFBRFYsRUFDb0IsQ0FEcEIsRUFDdUIsQ0FEdkIsRUFDMEIsS0FBSyxPQUQvQixFQUN3QyxLQUFLLE9BRDdDLEVBQ3NELEtBRHRELEVBQzZELE1BRDdEO0FBRUQsS0FKTSxNQUlBO0FBQ0wsU0FBRyxhQUFILENBQ0UsTUFERixFQUNVLFFBRFYsRUFDb0IsQ0FEcEIsRUFDdUIsQ0FEdkIsRUFDMEIsS0FEMUIsRUFDaUMsTUFEakMsRUFDeUMsTUFEekMsRUFDaUQsSUFEakQsRUFDdUQsSUFEdkQ7QUFFRDtBQUNGOztBQUVEO0FBQ0EsTUFBSSxZQUFZLEVBQWhCOztBQUVBLFdBQVMsVUFBVCxHQUF1QjtBQUNyQixXQUFPLFVBQVUsR0FBVixNQUFtQixJQUFJLFFBQUosRUFBMUI7QUFDRDs7QUFFRCxXQUFTLFNBQVQsQ0FBb0IsS0FBcEIsRUFBMkI7QUFDekIsUUFBSSxNQUFNLFNBQVYsRUFBcUI7QUFDbkIsV0FBSyxRQUFMLENBQWMsTUFBTSxJQUFwQjtBQUNEO0FBQ0QsYUFBUyxJQUFULENBQWMsS0FBZDtBQUNBLGNBQVUsSUFBVixDQUFlLEtBQWY7QUFDRDs7QUFFRDtBQUNBO0FBQ0E7QUFDQSxXQUFTLE1BQVQsR0FBbUI7QUFDakIsYUFBUyxJQUFULENBQWMsSUFBZDs7QUFFQSxTQUFLLFVBQUwsR0FBa0IsS0FBbEI7QUFDQSxTQUFLLFVBQUwsR0FBa0IsWUFBbEI7QUFDQSxTQUFLLE9BQUwsR0FBZSxDQUFmO0FBQ0EsU0FBSyxNQUFMLEdBQWMsTUFBTSxFQUFOLENBQWQ7QUFDRDs7QUFFRCxXQUFTLG9CQUFULENBQStCLE1BQS9CLEVBQXVDLEtBQXZDLEVBQThDLE1BQTlDLEVBQXNEO0FBQ3BELFFBQUksTUFBTSxPQUFPLE1BQVAsQ0FBYyxDQUFkLElBQW1CLFlBQTdCO0FBQ0EsV0FBTyxPQUFQLEdBQWlCLENBQWpCO0FBQ0EsUUFBSSxLQUFKLEdBQVksT0FBTyxLQUFQLEdBQWUsS0FBM0I7QUFDQSxRQUFJLE1BQUosR0FBYSxPQUFPLE1BQVAsR0FBZ0IsTUFBN0I7QUFDQSxRQUFJLFFBQUosR0FBZSxPQUFPLFFBQVAsR0FBa0IsQ0FBakM7QUFDRDs7QUFFRCxXQUFTLHFCQUFULENBQWdDLE1BQWhDLEVBQXdDLE9BQXhDLEVBQWlEO0FBQy9DLFFBQUksVUFBVSxJQUFkO0FBQ0EsUUFBSSxZQUFZLE9BQVosQ0FBSixFQUEwQjtBQUN4QixnQkFBVSxPQUFPLE1BQVAsQ0FBYyxDQUFkLElBQW1CLFlBQTdCO0FBQ0EsZ0JBQVUsT0FBVixFQUFtQixNQUFuQjtBQUNBLGlCQUFXLE9BQVgsRUFBb0IsT0FBcEI7QUFDQSxhQUFPLE9BQVAsR0FBaUIsQ0FBakI7QUFDRCxLQUxELE1BS087QUFDTCxpQkFBVyxNQUFYLEVBQW1CLE9BQW5CO0FBQ0EsVUFBSSxNQUFNLE9BQU4sQ0FBYyxRQUFRLE1BQXRCLENBQUosRUFBbUM7QUFDakMsWUFBSSxVQUFVLFFBQVEsTUFBdEI7QUFDQSxhQUFLLElBQUksSUFBSSxDQUFiLEVBQWdCLElBQUksUUFBUSxNQUE1QixFQUFvQyxFQUFFLENBQXRDLEVBQXlDO0FBQ3ZDLG9CQUFVLE9BQU8sTUFBUCxDQUFjLENBQWQsSUFBbUIsWUFBN0I7QUFDQSxvQkFBVSxPQUFWLEVBQW1CLE1BQW5CO0FBQ0Esa0JBQVEsS0FBUixLQUFrQixDQUFsQjtBQUNBLGtCQUFRLE1BQVIsS0FBbUIsQ0FBbkI7QUFDQSxxQkFBVyxPQUFYLEVBQW9CLFFBQVEsQ0FBUixDQUFwQjtBQUNBLGlCQUFPLE9BQVAsSUFBbUIsS0FBSyxDQUF4QjtBQUNEO0FBQ0YsT0FWRCxNQVVPO0FBQ0wsa0JBQVUsT0FBTyxNQUFQLENBQWMsQ0FBZCxJQUFtQixZQUE3QjtBQUNBLGtCQUFVLE9BQVYsRUFBbUIsTUFBbkI7QUFDQSxtQkFBVyxPQUFYLEVBQW9CLE9BQXBCO0FBQ0EsZUFBTyxPQUFQLEdBQWlCLENBQWpCO0FBQ0Q7QUFDRjtBQUNELGNBQVUsTUFBVixFQUFrQixPQUFPLE1BQVAsQ0FBYyxDQUFkLENBQWxCOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUEsUUFBSSxPQUFPLFVBQVAsSUFDQyxPQUFPLGNBQVAsS0FBMEIsK0JBRDNCLElBRUMsT0FBTyxjQUFQLEtBQTBCLGdDQUYzQixJQUdDLE9BQU8sY0FBUCxLQUEwQixnQ0FIM0IsSUFJQyxPQUFPLGNBQVAsS0FBMEIsZ0NBSi9CLEVBSWtFLENBRWpFO0FBQ0Y7O0FBRUQsV0FBUyxTQUFULENBQW9CLE1BQXBCLEVBQTRCLE1BQTVCLEVBQW9DO0FBQ2xDLFFBQUksU0FBUyxPQUFPLE1BQXBCO0FBQ0EsU0FBSyxJQUFJLElBQUksQ0FBYixFQUFnQixJQUFJLE9BQU8sTUFBM0IsRUFBbUMsRUFBRSxDQUFyQyxFQUF3QztBQUN0QyxVQUFJLENBQUMsT0FBTyxDQUFQLENBQUwsRUFBZ0I7QUFDZDtBQUNEO0FBQ0QsZUFBUyxPQUFPLENBQVAsQ0FBVCxFQUFvQixNQUFwQixFQUE0QixDQUE1QjtBQUNEO0FBQ0Y7O0FBRUQsTUFBSSxVQUFVLEVBQWQ7O0FBRUEsV0FBUyxXQUFULEdBQXdCO0FBQ3RCLFFBQUksU0FBUyxRQUFRLEdBQVIsTUFBaUIsSUFBSSxNQUFKLEVBQTlCO0FBQ0EsYUFBUyxJQUFULENBQWMsTUFBZDtBQUNBLFdBQU8sT0FBUCxHQUFpQixDQUFqQjtBQUNBLFNBQUssSUFBSSxJQUFJLENBQWIsRUFBZ0IsSUFBSSxFQUFwQixFQUF3QixFQUFFLENBQTFCLEVBQTZCO0FBQzNCLGFBQU8sTUFBUCxDQUFjLENBQWQsSUFBbUIsSUFBbkI7QUFDRDtBQUNELFdBQU8sTUFBUDtBQUNEOztBQUVELFdBQVMsVUFBVCxDQUFxQixNQUFyQixFQUE2QjtBQUMzQixRQUFJLFNBQVMsT0FBTyxNQUFwQjtBQUNBLFNBQUssSUFBSSxJQUFJLENBQWIsRUFBZ0IsSUFBSSxPQUFPLE1BQTNCLEVBQW1DLEVBQUUsQ0FBckMsRUFBd0M7QUFDdEMsVUFBSSxPQUFPLENBQVAsQ0FBSixFQUFlO0FBQ2Isa0JBQVUsT0FBTyxDQUFQLENBQVY7QUFDRDtBQUNELGFBQU8sQ0FBUCxJQUFZLElBQVo7QUFDRDtBQUNELFlBQVEsSUFBUixDQUFhLE1BQWI7QUFDRDs7QUFFRDtBQUNBO0FBQ0E7QUFDQSxXQUFTLE9BQVQsR0FBb0I7QUFDbEIsU0FBSyxTQUFMLEdBQWlCLFVBQWpCO0FBQ0EsU0FBSyxTQUFMLEdBQWlCLFVBQWpCOztBQUVBLFNBQUssS0FBTCxHQUFhLGdCQUFiO0FBQ0EsU0FBSyxLQUFMLEdBQWEsZ0JBQWI7O0FBRUEsU0FBSyxXQUFMLEdBQW1CLENBQW5COztBQUVBLFNBQUssVUFBTCxHQUFrQixLQUFsQjtBQUNBLFNBQUssVUFBTCxHQUFrQixZQUFsQjtBQUNEOztBQUVELFdBQVMsWUFBVCxDQUF1QixJQUF2QixFQUE2QixPQUE3QixFQUFzQztBQUNwQyxRQUFJLFNBQVMsT0FBYixFQUFzQjtBQUNwQixVQUFJLFlBQVksUUFBUSxHQUF4Qjs7QUFFQSxXQUFLLFNBQUwsR0FBaUIsV0FBVyxTQUFYLENBQWpCO0FBQ0EsVUFBSSxlQUFlLE9BQWYsQ0FBdUIsS0FBSyxTQUE1QixLQUEwQyxDQUE5QyxFQUFpRDtBQUMvQyxhQUFLLFVBQUwsR0FBa0IsSUFBbEI7QUFDRDtBQUNGOztBQUVELFFBQUksU0FBUyxPQUFiLEVBQXNCO0FBQ3BCLFVBQUksWUFBWSxRQUFRLEdBQXhCOztBQUVBLFdBQUssU0FBTCxHQUFpQixXQUFXLFNBQVgsQ0FBakI7QUFDRDs7QUFFRCxRQUFJLFFBQVEsS0FBSyxLQUFqQjtBQUNBLFFBQUksUUFBUSxLQUFLLEtBQWpCO0FBQ0EsUUFBSSxVQUFVLE9BQWQsRUFBdUI7QUFDckIsVUFBSSxPQUFPLFFBQVEsSUFBbkI7QUFDQSxVQUFJLE9BQU8sSUFBUCxLQUFnQixRQUFwQixFQUE4Qjs7QUFFNUIsZ0JBQVEsUUFBUSxVQUFVLElBQVYsQ0FBaEI7QUFDRCxPQUhELE1BR08sSUFBSSxNQUFNLE9BQU4sQ0FBYyxJQUFkLENBQUosRUFBeUI7O0FBRzlCLGdCQUFRLFVBQVUsS0FBSyxDQUFMLENBQVYsQ0FBUjtBQUNBLGdCQUFRLFVBQVUsS0FBSyxDQUFMLENBQVYsQ0FBUjtBQUNEO0FBQ0YsS0FYRCxNQVdPO0FBQ0wsVUFBSSxXQUFXLE9BQWYsRUFBd0I7QUFDdEIsWUFBSSxXQUFXLFFBQVEsS0FBdkI7O0FBRUEsZ0JBQVEsVUFBVSxRQUFWLENBQVI7QUFDRDtBQUNELFVBQUksV0FBVyxPQUFmLEVBQXdCO0FBQ3RCLFlBQUksV0FBVyxRQUFRLEtBQXZCOztBQUVBLGdCQUFRLFVBQVUsUUFBVixDQUFSO0FBQ0Q7QUFDRjtBQUNELFNBQUssS0FBTCxHQUFhLEtBQWI7QUFDQSxTQUFLLEtBQUwsR0FBYSxLQUFiOztBQUVBLFFBQUksaUJBQWlCLE9BQXJCLEVBQThCO0FBQzVCLFVBQUksY0FBYyxRQUFRLFdBQTFCOztBQUVBLFdBQUssV0FBTCxHQUFtQixRQUFRLFdBQTNCO0FBQ0Q7O0FBRUQsUUFBSSxZQUFZLE9BQWhCLEVBQXlCO0FBQ3ZCLFVBQUksWUFBWSxLQUFoQjtBQUNBLGNBQVEsT0FBTyxRQUFRLE1BQXZCO0FBQ0UsYUFBSyxRQUFMOztBQUVFLGVBQUssVUFBTCxHQUFrQixXQUFXLFFBQVEsTUFBbkIsQ0FBbEI7QUFDQSxlQUFLLFVBQUwsR0FBa0IsSUFBbEI7QUFDQSxzQkFBWSxJQUFaO0FBQ0E7O0FBRUYsYUFBSyxTQUFMO0FBQ0Usc0JBQVksS0FBSyxVQUFMLEdBQWtCLFFBQVEsTUFBdEM7QUFDQTs7QUFFRixhQUFLLFFBQUw7O0FBRUUsZUFBSyxVQUFMLEdBQWtCLEtBQWxCO0FBQ0Esc0JBQVksSUFBWjtBQUNBOztBQUVGOztBQWxCRjtBQXFCQSxVQUFJLGFBQWEsRUFBRSxTQUFTLE9BQVgsQ0FBakIsRUFBc0M7QUFDcEMsYUFBSyxTQUFMLEdBQWlCLHlCQUFqQjtBQUNEO0FBQ0Y7QUFDRjs7QUFFRCxXQUFTLFVBQVQsQ0FBcUIsSUFBckIsRUFBMkIsTUFBM0IsRUFBbUM7QUFDakMsT0FBRyxhQUFILENBQWlCLE1BQWpCLEVBQXlCLHFCQUF6QixFQUFnRCxLQUFLLFNBQXJEO0FBQ0EsT0FBRyxhQUFILENBQWlCLE1BQWpCLEVBQXlCLHFCQUF6QixFQUFnRCxLQUFLLFNBQXJEO0FBQ0EsT0FBRyxhQUFILENBQWlCLE1BQWpCLEVBQXlCLGlCQUF6QixFQUE0QyxLQUFLLEtBQWpEO0FBQ0EsT0FBRyxhQUFILENBQWlCLE1BQWpCLEVBQXlCLGlCQUF6QixFQUE0QyxLQUFLLEtBQWpEO0FBQ0EsUUFBSSxXQUFXLDhCQUFmLEVBQStDO0FBQzdDLFNBQUcsYUFBSCxDQUFpQixNQUFqQixFQUF5Qiw2QkFBekIsRUFBd0QsS0FBSyxXQUE3RDtBQUNEO0FBQ0QsUUFBSSxLQUFLLFVBQVQsRUFBcUI7QUFDbkIsU0FBRyxJQUFILENBQVEsdUJBQVIsRUFBaUMsS0FBSyxVQUF0QztBQUNBLFNBQUcsY0FBSCxDQUFrQixNQUFsQjtBQUNEO0FBQ0Y7O0FBRUQ7QUFDQTtBQUNBO0FBQ0EsTUFBSSxlQUFlLENBQW5CO0FBQ0EsTUFBSSxhQUFhLEVBQWpCO0FBQ0EsTUFBSSxjQUFjLE9BQU8sZUFBekI7QUFDQSxNQUFJLGVBQWUsTUFBTSxXQUFOLEVBQW1CLEdBQW5CLENBQXVCLFlBQVk7QUFDcEQsV0FBTyxJQUFQO0FBQ0QsR0FGa0IsQ0FBbkI7O0FBSUEsV0FBUyxXQUFULENBQXNCLE1BQXRCLEVBQThCO0FBQzVCLGFBQVMsSUFBVCxDQUFjLElBQWQ7QUFDQSxTQUFLLE9BQUwsR0FBZSxDQUFmO0FBQ0EsU0FBSyxjQUFMLEdBQXNCLE9BQXRCOztBQUVBLFNBQUssRUFBTCxHQUFVLGNBQVY7O0FBRUEsU0FBSyxRQUFMLEdBQWdCLENBQWhCOztBQUVBLFNBQUssTUFBTCxHQUFjLE1BQWQ7QUFDQSxTQUFLLE9BQUwsR0FBZSxHQUFHLGFBQUgsRUFBZjs7QUFFQSxTQUFLLElBQUwsR0FBWSxDQUFDLENBQWI7QUFDQSxTQUFLLFNBQUwsR0FBaUIsQ0FBakI7O0FBRUEsU0FBSyxPQUFMLEdBQWUsSUFBSSxPQUFKLEVBQWY7O0FBRUEsUUFBSSxPQUFPLE9BQVgsRUFBb0I7QUFDbEIsV0FBSyxLQUFMLEdBQWEsRUFBQyxNQUFNLENBQVAsRUFBYjtBQUNEO0FBQ0Y7O0FBRUQsV0FBUyxRQUFULENBQW1CLE9BQW5CLEVBQTRCO0FBQzFCLE9BQUcsYUFBSCxDQUFpQixXQUFqQjtBQUNBLE9BQUcsV0FBSCxDQUFlLFFBQVEsTUFBdkIsRUFBK0IsUUFBUSxPQUF2QztBQUNEOztBQUVELFdBQVMsV0FBVCxHQUF3QjtBQUN0QixRQUFJLE9BQU8sYUFBYSxDQUFiLENBQVg7QUFDQSxRQUFJLElBQUosRUFBVTtBQUNSLFNBQUcsV0FBSCxDQUFlLEtBQUssTUFBcEIsRUFBNEIsS0FBSyxPQUFqQztBQUNELEtBRkQsTUFFTztBQUNMLFNBQUcsV0FBSCxDQUFlLGFBQWYsRUFBOEIsSUFBOUI7QUFDRDtBQUNGOztBQUVELFdBQVMsT0FBVCxDQUFrQixPQUFsQixFQUEyQjtBQUN6QixRQUFJLFNBQVMsUUFBUSxPQUFyQjs7QUFFQSxRQUFJLE9BQU8sUUFBUSxJQUFuQjtBQUNBLFFBQUksU0FBUyxRQUFRLE1BQXJCO0FBQ0EsUUFBSSxRQUFRLENBQVosRUFBZTtBQUNiLFNBQUcsYUFBSCxDQUFpQixjQUFjLElBQS9CO0FBQ0EsU0FBRyxXQUFILENBQWUsTUFBZixFQUF1QixJQUF2QjtBQUNBLG1CQUFhLElBQWIsSUFBcUIsSUFBckI7QUFDRDtBQUNELE9BQUcsYUFBSCxDQUFpQixNQUFqQjtBQUNBLFlBQVEsT0FBUixHQUFrQixJQUFsQjtBQUNBLFlBQVEsTUFBUixHQUFpQixJQUFqQjtBQUNBLFlBQVEsTUFBUixHQUFpQixJQUFqQjtBQUNBLFlBQVEsUUFBUixHQUFtQixDQUFuQjtBQUNBLFdBQU8sV0FBVyxRQUFRLEVBQW5CLENBQVA7QUFDQSxVQUFNLFlBQU47QUFDRDs7QUFFRCxTQUFPLFlBQVksU0FBbkIsRUFBOEI7QUFDNUIsVUFBTSxZQUFZO0FBQ2hCLFVBQUksVUFBVSxJQUFkO0FBQ0EsY0FBUSxTQUFSLElBQXFCLENBQXJCO0FBQ0EsVUFBSSxPQUFPLFFBQVEsSUFBbkI7QUFDQSxVQUFJLE9BQU8sQ0FBWCxFQUFjO0FBQ1osYUFBSyxJQUFJLElBQUksQ0FBYixFQUFnQixJQUFJLFdBQXBCLEVBQWlDLEVBQUUsQ0FBbkMsRUFBc0M7QUFDcEMsY0FBSSxRQUFRLGFBQWEsQ0FBYixDQUFaO0FBQ0EsY0FBSSxLQUFKLEVBQVc7QUFDVCxnQkFBSSxNQUFNLFNBQU4sR0FBa0IsQ0FBdEIsRUFBeUI7QUFDdkI7QUFDRDtBQUNELGtCQUFNLElBQU4sR0FBYSxDQUFDLENBQWQ7QUFDRDtBQUNELHVCQUFhLENBQWIsSUFBa0IsT0FBbEI7QUFDQSxpQkFBTyxDQUFQO0FBQ0E7QUFDRDtBQUNELFlBQUksUUFBUSxXQUFaLEVBQXlCLENBRXhCO0FBQ0QsWUFBSSxPQUFPLE9BQVAsSUFBa0IsTUFBTSxlQUFOLEdBQXlCLE9BQU8sQ0FBdEQsRUFBMEQ7QUFDeEQsZ0JBQU0sZUFBTixHQUF3QixPQUFPLENBQS9CLENBRHdELENBQ3ZCO0FBQ2xDO0FBQ0QsZ0JBQVEsSUFBUixHQUFlLElBQWY7QUFDQSxXQUFHLGFBQUgsQ0FBaUIsY0FBYyxJQUEvQjtBQUNBLFdBQUcsV0FBSCxDQUFlLFFBQVEsTUFBdkIsRUFBK0IsUUFBUSxPQUF2QztBQUNEO0FBQ0QsYUFBTyxJQUFQO0FBQ0QsS0E3QjJCOztBQStCNUIsWUFBUSxZQUFZO0FBQ2xCLFdBQUssU0FBTCxJQUFrQixDQUFsQjtBQUNELEtBakMyQjs7QUFtQzVCLFlBQVEsWUFBWTtBQUNsQixVQUFJLEVBQUUsS0FBSyxRQUFQLElBQW1CLENBQXZCLEVBQTBCO0FBQ3hCLGdCQUFRLElBQVI7QUFDRDtBQUNGO0FBdkMyQixHQUE5Qjs7QUEwQ0EsV0FBUyxlQUFULENBQTBCLENBQTFCLEVBQTZCLENBQTdCLEVBQWdDO0FBQzlCLFFBQUksVUFBVSxJQUFJLFdBQUosQ0FBZ0IsYUFBaEIsQ0FBZDtBQUNBLGVBQVcsUUFBUSxFQUFuQixJQUF5QixPQUF6QjtBQUNBLFVBQU0sWUFBTjs7QUFFQSxhQUFTLGFBQVQsQ0FBd0IsQ0FBeEIsRUFBMkIsQ0FBM0IsRUFBOEI7QUFDNUIsVUFBSSxVQUFVLFFBQVEsT0FBdEI7QUFDQSxjQUFRLElBQVIsQ0FBYSxPQUFiO0FBQ0EsVUFBSSxVQUFVLGFBQWQ7O0FBRUEsVUFBSSxPQUFPLENBQVAsS0FBYSxRQUFqQixFQUEyQjtBQUN6QixZQUFJLE9BQU8sQ0FBUCxLQUFhLFFBQWpCLEVBQTJCO0FBQ3pCLCtCQUFxQixPQUFyQixFQUE4QixJQUFJLENBQWxDLEVBQXFDLElBQUksQ0FBekM7QUFDRCxTQUZELE1BRU87QUFDTCwrQkFBcUIsT0FBckIsRUFBOEIsSUFBSSxDQUFsQyxFQUFxQyxJQUFJLENBQXpDO0FBQ0Q7QUFDRixPQU5ELE1BTU8sSUFBSSxDQUFKLEVBQU87O0FBRVoscUJBQWEsT0FBYixFQUFzQixDQUF0QjtBQUNBLDhCQUFzQixPQUF0QixFQUErQixDQUEvQjtBQUNELE9BSk0sTUFJQTtBQUNMO0FBQ0EsNkJBQXFCLE9BQXJCLEVBQThCLENBQTlCLEVBQWlDLENBQWpDO0FBQ0Q7O0FBRUQsVUFBSSxRQUFRLFVBQVosRUFBd0I7QUFDdEIsZ0JBQVEsT0FBUixHQUFrQixDQUFDLFFBQVEsS0FBUixJQUFpQixDQUFsQixJQUF1QixDQUF6QztBQUNEO0FBQ0QsY0FBUSxPQUFSLEdBQWtCLFFBQVEsT0FBMUI7O0FBRUEsZ0JBQVUsT0FBVixFQUFtQixPQUFuQjs7QUFHQSxjQUFRLGNBQVIsR0FBeUIsUUFBUSxjQUFqQzs7QUFFQSxvQkFBYyxLQUFkLEdBQXNCLFFBQVEsS0FBOUI7QUFDQSxvQkFBYyxNQUFkLEdBQXVCLFFBQVEsTUFBL0I7O0FBRUEsZUFBUyxPQUFUO0FBQ0EsZ0JBQVUsT0FBVixFQUFtQixhQUFuQjtBQUNBLGlCQUFXLE9BQVgsRUFBb0IsYUFBcEI7QUFDQTs7QUFFQSxpQkFBVyxPQUFYOztBQUVBLFVBQUksT0FBTyxPQUFYLEVBQW9CO0FBQ2xCLGdCQUFRLEtBQVIsQ0FBYyxJQUFkLEdBQXFCLGVBQ25CLFFBQVEsY0FEVyxFQUVuQixRQUFRLElBRlcsRUFHbkIsUUFBUSxLQUhXLEVBSW5CLFFBQVEsTUFKVyxFQUtuQixRQUFRLFVBTFcsRUFNbkIsS0FObUIsQ0FBckI7QUFPRDtBQUNELG9CQUFjLE1BQWQsR0FBdUIscUJBQXFCLFFBQVEsY0FBN0IsQ0FBdkI7QUFDQSxvQkFBYyxJQUFkLEdBQXFCLG1CQUFtQixRQUFRLElBQTNCLENBQXJCOztBQUVBLG9CQUFjLEdBQWQsR0FBb0IsaUJBQWlCLFFBQVEsU0FBekIsQ0FBcEI7QUFDQSxvQkFBYyxHQUFkLEdBQW9CLGlCQUFpQixRQUFRLFNBQXpCLENBQXBCOztBQUVBLG9CQUFjLEtBQWQsR0FBc0IsZ0JBQWdCLFFBQVEsS0FBeEIsQ0FBdEI7QUFDQSxvQkFBYyxLQUFkLEdBQXNCLGdCQUFnQixRQUFRLEtBQXhCLENBQXRCOztBQUVBLGFBQU8sYUFBUDtBQUNEOztBQUVELGFBQVMsUUFBVCxDQUFtQixLQUFuQixFQUEwQixFQUExQixFQUE4QixFQUE5QixFQUFrQyxNQUFsQyxFQUEwQzs7QUFHeEMsVUFBSSxJQUFJLEtBQUssQ0FBYjtBQUNBLFVBQUksSUFBSSxLQUFLLENBQWI7QUFDQSxVQUFJLFFBQVEsU0FBUyxDQUFyQjs7QUFFQSxVQUFJLFlBQVksWUFBaEI7QUFDQSxnQkFBVSxTQUFWLEVBQXFCLE9BQXJCO0FBQ0EsZ0JBQVUsS0FBVixHQUFrQixDQUFsQjtBQUNBLGdCQUFVLE1BQVYsR0FBbUIsQ0FBbkI7QUFDQSxpQkFBVyxTQUFYLEVBQXNCLEtBQXRCO0FBQ0EsZ0JBQVUsS0FBVixHQUFrQixVQUFVLEtBQVYsSUFBb0IsQ0FBQyxRQUFRLEtBQVIsSUFBaUIsS0FBbEIsSUFBMkIsQ0FBakU7QUFDQSxnQkFBVSxNQUFWLEdBQW1CLFVBQVUsTUFBVixJQUFxQixDQUFDLFFBQVEsTUFBUixJQUFrQixLQUFuQixJQUE0QixDQUFwRTs7QUFPQSxlQUFTLE9BQVQ7QUFDQSxrQkFBWSxTQUFaLEVBQXVCLGFBQXZCLEVBQXNDLENBQXRDLEVBQXlDLENBQXpDLEVBQTRDLEtBQTVDO0FBQ0E7O0FBRUEsZ0JBQVUsU0FBVjs7QUFFQSxhQUFPLGFBQVA7QUFDRDs7QUFFRCxhQUFTLE1BQVQsQ0FBaUIsRUFBakIsRUFBcUIsRUFBckIsRUFBeUI7QUFDdkIsVUFBSSxJQUFJLEtBQUssQ0FBYjtBQUNBLFVBQUksSUFBSyxLQUFLLENBQU4sSUFBWSxDQUFwQjtBQUNBLFVBQUksTUFBTSxRQUFRLEtBQWQsSUFBdUIsTUFBTSxRQUFRLE1BQXpDLEVBQWlEO0FBQy9DLGVBQU8sYUFBUDtBQUNEOztBQUVELG9CQUFjLEtBQWQsR0FBc0IsUUFBUSxLQUFSLEdBQWdCLENBQXRDO0FBQ0Esb0JBQWMsTUFBZCxHQUF1QixRQUFRLE1BQVIsR0FBaUIsQ0FBeEM7O0FBRUEsZUFBUyxPQUFUO0FBQ0EsV0FBSyxJQUFJLElBQUksQ0FBYixFQUFnQixRQUFRLE9BQVIsSUFBbUIsQ0FBbkMsRUFBc0MsRUFBRSxDQUF4QyxFQUEyQztBQUN6QyxXQUFHLFVBQUgsQ0FDRSxhQURGLEVBRUUsQ0FGRixFQUdFLFFBQVEsTUFIVixFQUlFLEtBQUssQ0FKUCxFQUtFLEtBQUssQ0FMUCxFQU1FLENBTkYsRUFPRSxRQUFRLE1BUFYsRUFRRSxRQUFRLElBUlYsRUFTRSxJQVRGO0FBVUQ7QUFDRDs7QUFFQTtBQUNBLFVBQUksT0FBTyxPQUFYLEVBQW9CO0FBQ2xCLGdCQUFRLEtBQVIsQ0FBYyxJQUFkLEdBQXFCLGVBQ25CLFFBQVEsY0FEVyxFQUVuQixRQUFRLElBRlcsRUFHbkIsQ0FIbUIsRUFJbkIsQ0FKbUIsRUFLbkIsS0FMbUIsRUFNbkIsS0FObUIsQ0FBckI7QUFPRDs7QUFFRCxhQUFPLGFBQVA7QUFDRDs7QUFFRCxrQkFBYyxDQUFkLEVBQWlCLENBQWpCOztBQUVBLGtCQUFjLFFBQWQsR0FBeUIsUUFBekI7QUFDQSxrQkFBYyxNQUFkLEdBQXVCLE1BQXZCO0FBQ0Esa0JBQWMsU0FBZCxHQUEwQixXQUExQjtBQUNBLGtCQUFjLFFBQWQsR0FBeUIsT0FBekI7QUFDQSxRQUFJLE9BQU8sT0FBWCxFQUFvQjtBQUNsQixvQkFBYyxLQUFkLEdBQXNCLFFBQVEsS0FBOUI7QUFDRDtBQUNELGtCQUFjLE9BQWQsR0FBd0IsWUFBWTtBQUNsQyxjQUFRLE1BQVI7QUFDRCxLQUZEOztBQUlBLFdBQU8sYUFBUDtBQUNEOztBQUVELFdBQVMsaUJBQVQsQ0FBNEIsRUFBNUIsRUFBZ0MsRUFBaEMsRUFBb0MsRUFBcEMsRUFBd0MsRUFBeEMsRUFBNEMsRUFBNUMsRUFBZ0QsRUFBaEQsRUFBb0Q7QUFDbEQsUUFBSSxVQUFVLElBQUksV0FBSixDQUFnQixtQkFBaEIsQ0FBZDtBQUNBLGVBQVcsUUFBUSxFQUFuQixJQUF5QixPQUF6QjtBQUNBLFVBQU0sU0FBTjs7QUFFQSxRQUFJLFFBQVEsSUFBSSxLQUFKLENBQVUsQ0FBVixDQUFaOztBQUVBLGFBQVMsZUFBVCxDQUEwQixFQUExQixFQUE4QixFQUE5QixFQUFrQyxFQUFsQyxFQUFzQyxFQUF0QyxFQUEwQyxFQUExQyxFQUE4QyxFQUE5QyxFQUFrRDtBQUNoRCxVQUFJLENBQUo7QUFDQSxVQUFJLFVBQVUsUUFBUSxPQUF0QjtBQUNBLGNBQVEsSUFBUixDQUFhLE9BQWI7QUFDQSxXQUFLLElBQUksQ0FBVCxFQUFZLElBQUksQ0FBaEIsRUFBbUIsRUFBRSxDQUFyQixFQUF3QjtBQUN0QixjQUFNLENBQU4sSUFBVyxhQUFYO0FBQ0Q7O0FBRUQsVUFBSSxPQUFPLEVBQVAsS0FBYyxRQUFkLElBQTBCLENBQUMsRUFBL0IsRUFBbUM7QUFDakMsWUFBSSxJQUFLLEtBQUssQ0FBTixJQUFZLENBQXBCO0FBQ0EsYUFBSyxJQUFJLENBQVQsRUFBWSxJQUFJLENBQWhCLEVBQW1CLEVBQUUsQ0FBckIsRUFBd0I7QUFDdEIsK0JBQXFCLE1BQU0sQ0FBTixDQUFyQixFQUErQixDQUEvQixFQUFrQyxDQUFsQztBQUNEO0FBQ0YsT0FMRCxNQUtPLElBQUksT0FBTyxFQUFQLEtBQWMsUUFBbEIsRUFBNEI7QUFDakMsWUFBSSxFQUFKLEVBQVE7QUFDTixnQ0FBc0IsTUFBTSxDQUFOLENBQXRCLEVBQWdDLEVBQWhDO0FBQ0EsZ0NBQXNCLE1BQU0sQ0FBTixDQUF0QixFQUFnQyxFQUFoQztBQUNBLGdDQUFzQixNQUFNLENBQU4sQ0FBdEIsRUFBZ0MsRUFBaEM7QUFDQSxnQ0FBc0IsTUFBTSxDQUFOLENBQXRCLEVBQWdDLEVBQWhDO0FBQ0EsZ0NBQXNCLE1BQU0sQ0FBTixDQUF0QixFQUFnQyxFQUFoQztBQUNBLGdDQUFzQixNQUFNLENBQU4sQ0FBdEIsRUFBZ0MsRUFBaEM7QUFDRCxTQVBELE1BT087QUFDTCx1QkFBYSxPQUFiLEVBQXNCLEVBQXRCO0FBQ0EscUJBQVcsT0FBWCxFQUFvQixFQUFwQjtBQUNBLGNBQUksV0FBVyxFQUFmLEVBQW1CO0FBQ2pCLGdCQUFJLGFBQWEsR0FBRyxLQUFwQjs7QUFFQSxpQkFBSyxJQUFJLENBQVQsRUFBWSxJQUFJLENBQWhCLEVBQW1CLEVBQUUsQ0FBckIsRUFBd0I7O0FBRXRCLHdCQUFVLE1BQU0sQ0FBTixDQUFWLEVBQW9CLE9BQXBCO0FBQ0Esb0NBQXNCLE1BQU0sQ0FBTixDQUF0QixFQUFnQyxXQUFXLENBQVgsQ0FBaEM7QUFDRDtBQUNGLFdBUkQsTUFRTztBQUNMLGlCQUFLLElBQUksQ0FBVCxFQUFZLElBQUksQ0FBaEIsRUFBbUIsRUFBRSxDQUFyQixFQUF3QjtBQUN0QixvQ0FBc0IsTUFBTSxDQUFOLENBQXRCLEVBQWdDLEVBQWhDO0FBQ0Q7QUFDRjtBQUNGO0FBQ0YsT0F6Qk0sTUF5QkEsQ0FFTjs7QUFFRCxnQkFBVSxPQUFWLEVBQW1CLE1BQU0sQ0FBTixDQUFuQjtBQUNBLFVBQUksUUFBUSxVQUFaLEVBQXdCO0FBQ3RCLGdCQUFRLE9BQVIsR0FBa0IsQ0FBQyxNQUFNLENBQU4sRUFBUyxLQUFULElBQWtCLENBQW5CLElBQXdCLENBQTFDO0FBQ0QsT0FGRCxNQUVPO0FBQ0wsZ0JBQVEsT0FBUixHQUFrQixNQUFNLENBQU4sRUFBUyxPQUEzQjtBQUNEOztBQUdELGNBQVEsY0FBUixHQUF5QixNQUFNLENBQU4sRUFBUyxjQUFsQzs7QUFFQSxzQkFBZ0IsS0FBaEIsR0FBd0IsTUFBTSxDQUFOLEVBQVMsS0FBakM7QUFDQSxzQkFBZ0IsTUFBaEIsR0FBeUIsTUFBTSxDQUFOLEVBQVMsTUFBbEM7O0FBRUEsZUFBUyxPQUFUO0FBQ0EsV0FBSyxJQUFJLENBQVQsRUFBWSxJQUFJLENBQWhCLEVBQW1CLEVBQUUsQ0FBckIsRUFBd0I7QUFDdEIsa0JBQVUsTUFBTSxDQUFOLENBQVYsRUFBb0IsaUNBQWlDLENBQXJEO0FBQ0Q7QUFDRCxpQkFBVyxPQUFYLEVBQW9CLG1CQUFwQjtBQUNBOztBQUVBLFVBQUksT0FBTyxPQUFYLEVBQW9CO0FBQ2xCLGdCQUFRLEtBQVIsQ0FBYyxJQUFkLEdBQXFCLGVBQ25CLFFBQVEsY0FEVyxFQUVuQixRQUFRLElBRlcsRUFHbkIsZ0JBQWdCLEtBSEcsRUFJbkIsZ0JBQWdCLE1BSkcsRUFLbkIsUUFBUSxVQUxXLEVBTW5CLElBTm1CLENBQXJCO0FBT0Q7O0FBRUQsc0JBQWdCLE1BQWhCLEdBQXlCLHFCQUFxQixRQUFRLGNBQTdCLENBQXpCO0FBQ0Esc0JBQWdCLElBQWhCLEdBQXVCLG1CQUFtQixRQUFRLElBQTNCLENBQXZCOztBQUVBLHNCQUFnQixHQUFoQixHQUFzQixpQkFBaUIsUUFBUSxTQUF6QixDQUF0QjtBQUNBLHNCQUFnQixHQUFoQixHQUFzQixpQkFBaUIsUUFBUSxTQUF6QixDQUF0Qjs7QUFFQSxzQkFBZ0IsS0FBaEIsR0FBd0IsZ0JBQWdCLFFBQVEsS0FBeEIsQ0FBeEI7QUFDQSxzQkFBZ0IsS0FBaEIsR0FBd0IsZ0JBQWdCLFFBQVEsS0FBeEIsQ0FBeEI7O0FBRUEsV0FBSyxJQUFJLENBQVQsRUFBWSxJQUFJLENBQWhCLEVBQW1CLEVBQUUsQ0FBckIsRUFBd0I7QUFDdEIsbUJBQVcsTUFBTSxDQUFOLENBQVg7QUFDRDs7QUFFRCxhQUFPLGVBQVA7QUFDRDs7QUFFRCxhQUFTLFFBQVQsQ0FBbUIsSUFBbkIsRUFBeUIsS0FBekIsRUFBZ0MsRUFBaEMsRUFBb0MsRUFBcEMsRUFBd0MsTUFBeEMsRUFBZ0Q7O0FBSTlDLFVBQUksSUFBSSxLQUFLLENBQWI7QUFDQSxVQUFJLElBQUksS0FBSyxDQUFiO0FBQ0EsVUFBSSxRQUFRLFNBQVMsQ0FBckI7O0FBRUEsVUFBSSxZQUFZLFlBQWhCO0FBQ0EsZ0JBQVUsU0FBVixFQUFxQixPQUFyQjtBQUNBLGdCQUFVLEtBQVYsR0FBa0IsQ0FBbEI7QUFDQSxnQkFBVSxNQUFWLEdBQW1CLENBQW5CO0FBQ0EsaUJBQVcsU0FBWCxFQUFzQixLQUF0QjtBQUNBLGdCQUFVLEtBQVYsR0FBa0IsVUFBVSxLQUFWLElBQW9CLENBQUMsUUFBUSxLQUFSLElBQWlCLEtBQWxCLElBQTJCLENBQWpFO0FBQ0EsZ0JBQVUsTUFBVixHQUFtQixVQUFVLE1BQVYsSUFBcUIsQ0FBQyxRQUFRLE1BQVIsSUFBa0IsS0FBbkIsSUFBNEIsQ0FBcEU7O0FBT0EsZUFBUyxPQUFUO0FBQ0Esa0JBQVksU0FBWixFQUF1QixpQ0FBaUMsSUFBeEQsRUFBOEQsQ0FBOUQsRUFBaUUsQ0FBakUsRUFBb0UsS0FBcEU7QUFDQTs7QUFFQSxnQkFBVSxTQUFWOztBQUVBLGFBQU8sZUFBUDtBQUNEOztBQUVELGFBQVMsTUFBVCxDQUFpQixPQUFqQixFQUEwQjtBQUN4QixVQUFJLFNBQVMsVUFBVSxDQUF2QjtBQUNBLFVBQUksV0FBVyxRQUFRLEtBQXZCLEVBQThCO0FBQzVCO0FBQ0Q7O0FBRUQsc0JBQWdCLEtBQWhCLEdBQXdCLFFBQVEsS0FBUixHQUFnQixNQUF4QztBQUNBLHNCQUFnQixNQUFoQixHQUF5QixRQUFRLE1BQVIsR0FBaUIsTUFBMUM7O0FBRUEsZUFBUyxPQUFUO0FBQ0EsV0FBSyxJQUFJLElBQUksQ0FBYixFQUFnQixJQUFJLENBQXBCLEVBQXVCLEVBQUUsQ0FBekIsRUFBNEI7QUFDMUIsYUFBSyxJQUFJLElBQUksQ0FBYixFQUFnQixRQUFRLE9BQVIsSUFBbUIsQ0FBbkMsRUFBc0MsRUFBRSxDQUF4QyxFQUEyQztBQUN6QyxhQUFHLFVBQUgsQ0FDRSxpQ0FBaUMsQ0FEbkMsRUFFRSxDQUZGLEVBR0UsUUFBUSxNQUhWLEVBSUUsVUFBVSxDQUpaLEVBS0UsVUFBVSxDQUxaLEVBTUUsQ0FORixFQU9FLFFBQVEsTUFQVixFQVFFLFFBQVEsSUFSVixFQVNFLElBVEY7QUFVRDtBQUNGO0FBQ0Q7O0FBRUEsVUFBSSxPQUFPLE9BQVgsRUFBb0I7QUFDbEIsZ0JBQVEsS0FBUixDQUFjLElBQWQsR0FBcUIsZUFDbkIsUUFBUSxjQURXLEVBRW5CLFFBQVEsSUFGVyxFQUduQixnQkFBZ0IsS0FIRyxFQUluQixnQkFBZ0IsTUFKRyxFQUtuQixLQUxtQixFQU1uQixJQU5tQixDQUFyQjtBQU9EOztBQUVELGFBQU8sZUFBUDtBQUNEOztBQUVELG9CQUFnQixFQUFoQixFQUFvQixFQUFwQixFQUF3QixFQUF4QixFQUE0QixFQUE1QixFQUFnQyxFQUFoQyxFQUFvQyxFQUFwQzs7QUFFQSxvQkFBZ0IsUUFBaEIsR0FBMkIsUUFBM0I7QUFDQSxvQkFBZ0IsTUFBaEIsR0FBeUIsTUFBekI7QUFDQSxvQkFBZ0IsU0FBaEIsR0FBNEIsYUFBNUI7QUFDQSxvQkFBZ0IsUUFBaEIsR0FBMkIsT0FBM0I7QUFDQSxRQUFJLE9BQU8sT0FBWCxFQUFvQjtBQUNsQixzQkFBZ0IsS0FBaEIsR0FBd0IsUUFBUSxLQUFoQztBQUNEO0FBQ0Qsb0JBQWdCLE9BQWhCLEdBQTBCLFlBQVk7QUFDcEMsY0FBUSxNQUFSO0FBQ0QsS0FGRDs7QUFJQSxXQUFPLGVBQVA7QUFDRDs7QUFFRDtBQUNBLFdBQVMsZUFBVCxHQUE0QjtBQUMxQixTQUFLLElBQUksSUFBSSxDQUFiLEVBQWdCLElBQUksV0FBcEIsRUFBaUMsRUFBRSxDQUFuQyxFQUFzQztBQUNwQyxTQUFHLGFBQUgsQ0FBaUIsY0FBYyxDQUEvQjtBQUNBLFNBQUcsV0FBSCxDQUFlLGFBQWYsRUFBOEIsSUFBOUI7QUFDQSxtQkFBYSxDQUFiLElBQWtCLElBQWxCO0FBQ0Q7QUFDRCxXQUFPLFVBQVAsRUFBbUIsT0FBbkIsQ0FBMkIsT0FBM0I7O0FBRUEsVUFBTSxTQUFOLEdBQWtCLENBQWxCO0FBQ0EsVUFBTSxZQUFOLEdBQXFCLENBQXJCO0FBQ0Q7O0FBRUQsTUFBSSxPQUFPLE9BQVgsRUFBb0I7QUFDbEIsVUFBTSxtQkFBTixHQUE0QixZQUFZO0FBQ3RDLFVBQUksUUFBUSxDQUFaO0FBQ0EsYUFBTyxJQUFQLENBQVksVUFBWixFQUF3QixPQUF4QixDQUFnQyxVQUFVLEdBQVYsRUFBZTtBQUM3QyxpQkFBUyxXQUFXLEdBQVgsRUFBZ0IsS0FBaEIsQ0FBc0IsSUFBL0I7QUFDRCxPQUZEO0FBR0EsYUFBTyxLQUFQO0FBQ0QsS0FORDtBQU9EOztBQUVELFdBQVMsZUFBVCxHQUE0QjtBQUMxQixXQUFPLFVBQVAsRUFBbUIsT0FBbkIsQ0FBMkIsVUFBVSxPQUFWLEVBQW1CO0FBQzVDLGNBQVEsT0FBUixHQUFrQixHQUFHLGFBQUgsRUFBbEI7QUFDQSxTQUFHLFdBQUgsQ0FBZSxRQUFRLE1BQXZCLEVBQStCLFFBQVEsT0FBdkM7QUFDQSxXQUFLLElBQUksSUFBSSxDQUFiLEVBQWdCLElBQUksRUFBcEIsRUFBd0IsRUFBRSxDQUExQixFQUE2QjtBQUMzQixZQUFJLENBQUMsUUFBUSxPQUFSLEdBQW1CLEtBQUssQ0FBekIsTUFBaUMsQ0FBckMsRUFBd0M7QUFDdEM7QUFDRDtBQUNELFlBQUksUUFBUSxNQUFSLEtBQW1CLGFBQXZCLEVBQXNDO0FBQ3BDLGFBQUcsVUFBSCxDQUFjLGFBQWQsRUFDRSxDQURGLEVBRUUsUUFBUSxjQUZWLEVBR0UsUUFBUSxLQUFSLElBQWlCLENBSG5CLEVBSUUsUUFBUSxNQUFSLElBQWtCLENBSnBCLEVBS0UsQ0FMRixFQU1FLFFBQVEsY0FOVixFQU9FLFFBQVEsSUFQVixFQVFFLElBUkY7QUFTRCxTQVZELE1BVU87QUFDTCxlQUFLLElBQUksSUFBSSxDQUFiLEVBQWdCLElBQUksQ0FBcEIsRUFBdUIsRUFBRSxDQUF6QixFQUE0QjtBQUMxQixlQUFHLFVBQUgsQ0FBYyxpQ0FBaUMsQ0FBL0MsRUFDRSxDQURGLEVBRUUsUUFBUSxjQUZWLEVBR0UsUUFBUSxLQUFSLElBQWlCLENBSG5CLEVBSUUsUUFBUSxNQUFSLElBQWtCLENBSnBCLEVBS0UsQ0FMRixFQU1FLFFBQVEsY0FOVixFQU9FLFFBQVEsSUFQVixFQVFFLElBUkY7QUFTRDtBQUNGO0FBQ0Y7QUFDRCxpQkFBVyxRQUFRLE9BQW5CLEVBQTRCLFFBQVEsTUFBcEM7QUFDRCxLQWhDRDtBQWlDRDs7QUFFRCxTQUFPO0FBQ0wsY0FBVSxlQURMO0FBRUwsZ0JBQVksaUJBRlA7QUFHTCxXQUFPLGVBSEY7QUFJTCxnQkFBWSxVQUFVLE9BQVYsRUFBbUI7QUFDN0IsYUFBTyxJQUFQO0FBQ0QsS0FOSTtBQU9MLGFBQVM7QUFQSixHQUFQO0FBU0QsQ0E3dENEOzs7QUMvVEEsSUFBSSxzQkFBc0IsTUFBMUI7QUFDQSxJQUFJLGdDQUFnQyxNQUFwQztBQUNBLElBQUksc0JBQXNCLE1BQTFCOztBQUVBLE9BQU8sT0FBUCxHQUFpQixVQUFVLEVBQVYsRUFBYyxVQUFkLEVBQTBCO0FBQ3pDLE1BQUksV0FBVyxXQUFXLHdCQUExQjs7QUFFQSxNQUFJLENBQUMsUUFBTCxFQUFlO0FBQ2IsV0FBTyxJQUFQO0FBQ0Q7O0FBRUQ7QUFDQSxNQUFJLFlBQVksRUFBaEI7QUFDQSxXQUFTLFVBQVQsR0FBdUI7QUFDckIsV0FBTyxVQUFVLEdBQVYsTUFBbUIsU0FBUyxjQUFULEVBQTFCO0FBQ0Q7QUFDRCxXQUFTLFNBQVQsQ0FBb0IsS0FBcEIsRUFBMkI7QUFDekIsY0FBVSxJQUFWLENBQWUsS0FBZjtBQUNEO0FBQ0Q7O0FBRUEsTUFBSSxpQkFBaUIsRUFBckI7QUFDQSxXQUFTLFVBQVQsQ0FBcUIsS0FBckIsRUFBNEI7QUFDMUIsUUFBSSxRQUFRLFlBQVo7QUFDQSxhQUFTLGFBQVQsQ0FBdUIsbUJBQXZCLEVBQTRDLEtBQTVDO0FBQ0EsbUJBQWUsSUFBZixDQUFvQixLQUFwQjtBQUNBLG1CQUFlLGVBQWUsTUFBZixHQUF3QixDQUF2QyxFQUEwQyxlQUFlLE1BQXpELEVBQWlFLEtBQWpFO0FBQ0Q7O0FBRUQsV0FBUyxRQUFULEdBQXFCO0FBQ25CLGFBQVMsV0FBVCxDQUFxQixtQkFBckI7QUFDRDs7QUFFRDtBQUNBO0FBQ0E7QUFDQSxXQUFTLFlBQVQsR0FBeUI7QUFDdkIsU0FBSyxlQUFMLEdBQXVCLENBQUMsQ0FBeEI7QUFDQSxTQUFLLGFBQUwsR0FBcUIsQ0FBQyxDQUF0QjtBQUNBLFNBQUssR0FBTCxHQUFXLENBQVg7QUFDQSxTQUFLLEtBQUwsR0FBYSxJQUFiO0FBQ0Q7QUFDRCxNQUFJLG1CQUFtQixFQUF2QjtBQUNBLFdBQVMsaUJBQVQsR0FBOEI7QUFDNUIsV0FBTyxpQkFBaUIsR0FBakIsTUFBMEIsSUFBSSxZQUFKLEVBQWpDO0FBQ0Q7QUFDRCxXQUFTLGdCQUFULENBQTJCLFlBQTNCLEVBQXlDO0FBQ3ZDLHFCQUFpQixJQUFqQixDQUFzQixZQUF0QjtBQUNEO0FBQ0Q7O0FBRUEsTUFBSSxlQUFlLEVBQW5CO0FBQ0EsV0FBUyxjQUFULENBQXlCLEtBQXpCLEVBQWdDLEdBQWhDLEVBQXFDLEtBQXJDLEVBQTRDO0FBQzFDLFFBQUksS0FBSyxtQkFBVDtBQUNBLE9BQUcsZUFBSCxHQUFxQixLQUFyQjtBQUNBLE9BQUcsYUFBSCxHQUFtQixHQUFuQjtBQUNBLE9BQUcsR0FBSCxHQUFTLENBQVQ7QUFDQSxPQUFHLEtBQUgsR0FBVyxLQUFYO0FBQ0EsaUJBQWEsSUFBYixDQUFrQixFQUFsQjtBQUNEOztBQUVEO0FBQ0E7QUFDQSxNQUFJLFVBQVUsRUFBZDtBQUNBLE1BQUksV0FBVyxFQUFmO0FBQ0EsV0FBUyxNQUFULEdBQW1CO0FBQ2pCLFFBQUksR0FBSixFQUFTLENBQVQ7O0FBRUEsUUFBSSxJQUFJLGVBQWUsTUFBdkI7QUFDQSxRQUFJLE1BQU0sQ0FBVixFQUFhO0FBQ1g7QUFDRDs7QUFFRDtBQUNBLGFBQVMsTUFBVCxHQUFrQixLQUFLLEdBQUwsQ0FBUyxTQUFTLE1BQWxCLEVBQTBCLElBQUksQ0FBOUIsQ0FBbEI7QUFDQSxZQUFRLE1BQVIsR0FBaUIsS0FBSyxHQUFMLENBQVMsUUFBUSxNQUFqQixFQUF5QixJQUFJLENBQTdCLENBQWpCO0FBQ0EsWUFBUSxDQUFSLElBQWEsQ0FBYjtBQUNBLGFBQVMsQ0FBVCxJQUFjLENBQWQ7O0FBRUE7QUFDQSxRQUFJLFlBQVksQ0FBaEI7QUFDQSxVQUFNLENBQU47QUFDQSxTQUFLLElBQUksQ0FBVCxFQUFZLElBQUksZUFBZSxNQUEvQixFQUF1QyxFQUFFLENBQXpDLEVBQTRDO0FBQzFDLFVBQUksUUFBUSxlQUFlLENBQWYsQ0FBWjtBQUNBLFVBQUksU0FBUyxpQkFBVCxDQUEyQixLQUEzQixFQUFrQyw2QkFBbEMsQ0FBSixFQUFzRTtBQUNwRSxxQkFBYSxTQUFTLGlCQUFULENBQTJCLEtBQTNCLEVBQWtDLG1CQUFsQyxDQUFiO0FBQ0Esa0JBQVUsS0FBVjtBQUNELE9BSEQsTUFHTztBQUNMLHVCQUFlLEtBQWYsSUFBd0IsS0FBeEI7QUFDRDtBQUNELGNBQVEsSUFBSSxDQUFaLElBQWlCLFNBQWpCO0FBQ0EsZUFBUyxJQUFJLENBQWIsSUFBa0IsR0FBbEI7QUFDRDtBQUNELG1CQUFlLE1BQWYsR0FBd0IsR0FBeEI7O0FBRUE7QUFDQSxVQUFNLENBQU47QUFDQSxTQUFLLElBQUksQ0FBVCxFQUFZLElBQUksYUFBYSxNQUE3QixFQUFxQyxFQUFFLENBQXZDLEVBQTBDO0FBQ3hDLFVBQUksUUFBUSxhQUFhLENBQWIsQ0FBWjtBQUNBLFVBQUksUUFBUSxNQUFNLGVBQWxCO0FBQ0EsVUFBSSxNQUFNLE1BQU0sYUFBaEI7QUFDQSxZQUFNLEdBQU4sSUFBYSxRQUFRLEdBQVIsSUFBZSxRQUFRLEtBQVIsQ0FBNUI7QUFDQSxVQUFJLFdBQVcsU0FBUyxLQUFULENBQWY7QUFDQSxVQUFJLFNBQVMsU0FBUyxHQUFULENBQWI7QUFDQSxVQUFJLFdBQVcsUUFBZixFQUF5QjtBQUN2QixjQUFNLEtBQU4sQ0FBWSxPQUFaLElBQXVCLE1BQU0sR0FBTixHQUFZLEdBQW5DO0FBQ0EseUJBQWlCLEtBQWpCO0FBQ0QsT0FIRCxNQUdPO0FBQ0wsY0FBTSxlQUFOLEdBQXdCLFFBQXhCO0FBQ0EsY0FBTSxhQUFOLEdBQXNCLE1BQXRCO0FBQ0EscUJBQWEsS0FBYixJQUFzQixLQUF0QjtBQUNEO0FBQ0Y7QUFDRCxpQkFBYSxNQUFiLEdBQXNCLEdBQXRCO0FBQ0Q7O0FBRUQsU0FBTztBQUNMLGdCQUFZLFVBRFA7QUFFTCxjQUFVLFFBRkw7QUFHTCxvQkFBZ0IsY0FIWDtBQUlMLFlBQVEsTUFKSDtBQUtMLDBCQUFzQixZQUFZO0FBQ2hDLGFBQU8sZUFBZSxNQUF0QjtBQUNELEtBUEk7QUFRTCxXQUFPLFlBQVk7QUFDakIsZ0JBQVUsSUFBVixDQUFlLEtBQWYsQ0FBcUIsU0FBckIsRUFBZ0MsY0FBaEM7QUFDQSxXQUFLLElBQUksSUFBSSxDQUFiLEVBQWdCLElBQUksVUFBVSxNQUE5QixFQUFzQyxHQUF0QyxFQUEyQztBQUN6QyxpQkFBUyxjQUFULENBQXdCLFVBQVUsQ0FBVixDQUF4QjtBQUNEO0FBQ0QscUJBQWUsTUFBZixHQUF3QixDQUF4QjtBQUNBLGdCQUFVLE1BQVYsR0FBbUIsQ0FBbkI7QUFDRCxLQWZJO0FBZ0JMLGFBQVMsWUFBWTtBQUNuQixxQkFBZSxNQUFmLEdBQXdCLENBQXhCO0FBQ0EsZ0JBQVUsTUFBVixHQUFtQixDQUFuQjtBQUNEO0FBbkJJLEdBQVA7QUFxQkQsQ0FySUQ7OztBQ0pBO0FBQ0EsT0FBTyxPQUFQLEdBQ0csT0FBTyxXQUFQLEtBQXVCLFdBQXZCLElBQXNDLFlBQVksR0FBbkQsR0FDRSxZQUFZO0FBQUUsU0FBTyxZQUFZLEdBQVosRUFBUDtBQUEwQixDQUQxQyxHQUVFLFlBQVk7QUFBRSxTQUFPLENBQUUsSUFBSSxJQUFKLEVBQVQ7QUFBc0IsQ0FIeEM7OztBQ0RBLElBQUksU0FBUyxRQUFRLFVBQVIsQ0FBYjs7QUFFQSxTQUFTLEtBQVQsQ0FBZ0IsQ0FBaEIsRUFBbUI7QUFDakIsU0FBTyxNQUFNLFNBQU4sQ0FBZ0IsS0FBaEIsQ0FBc0IsSUFBdEIsQ0FBMkIsQ0FBM0IsQ0FBUDtBQUNEOztBQUVELFNBQVMsSUFBVCxDQUFlLENBQWYsRUFBa0I7QUFDaEIsU0FBTyxNQUFNLENBQU4sRUFBUyxJQUFULENBQWMsRUFBZCxDQUFQO0FBQ0Q7O0FBRUQsT0FBTyxPQUFQLEdBQWlCLFNBQVMsaUJBQVQsR0FBOEI7QUFDN0M7QUFDQSxNQUFJLGFBQWEsQ0FBakI7O0FBRUE7QUFDQTtBQUNBO0FBQ0EsTUFBSSxjQUFjLEVBQWxCO0FBQ0EsTUFBSSxlQUFlLEVBQW5CO0FBQ0EsV0FBUyxJQUFULENBQWUsS0FBZixFQUFzQjtBQUNwQixTQUFLLElBQUksSUFBSSxDQUFiLEVBQWdCLElBQUksYUFBYSxNQUFqQyxFQUF5QyxFQUFFLENBQTNDLEVBQThDO0FBQzVDLFVBQUksYUFBYSxDQUFiLE1BQW9CLEtBQXhCLEVBQStCO0FBQzdCLGVBQU8sWUFBWSxDQUFaLENBQVA7QUFDRDtBQUNGOztBQUVELFFBQUksT0FBTyxNQUFPLFlBQWxCO0FBQ0EsZ0JBQVksSUFBWixDQUFpQixJQUFqQjtBQUNBLGlCQUFhLElBQWIsQ0FBa0IsS0FBbEI7QUFDQSxXQUFPLElBQVA7QUFDRDs7QUFFRDtBQUNBLFdBQVMsS0FBVCxHQUFrQjtBQUNoQixRQUFJLE9BQU8sRUFBWDtBQUNBLGFBQVMsSUFBVCxHQUFpQjtBQUNmLFdBQUssSUFBTCxDQUFVLEtBQVYsQ0FBZ0IsSUFBaEIsRUFBc0IsTUFBTSxTQUFOLENBQXRCO0FBQ0Q7O0FBRUQsUUFBSSxPQUFPLEVBQVg7QUFDQSxhQUFTLEdBQVQsR0FBZ0I7QUFDZCxVQUFJLE9BQU8sTUFBTyxZQUFsQjtBQUNBLFdBQUssSUFBTCxDQUFVLElBQVY7O0FBRUEsVUFBSSxVQUFVLE1BQVYsR0FBbUIsQ0FBdkIsRUFBMEI7QUFDeEIsYUFBSyxJQUFMLENBQVUsSUFBVixFQUFnQixHQUFoQjtBQUNBLGFBQUssSUFBTCxDQUFVLEtBQVYsQ0FBZ0IsSUFBaEIsRUFBc0IsTUFBTSxTQUFOLENBQXRCO0FBQ0EsYUFBSyxJQUFMLENBQVUsR0FBVjtBQUNEOztBQUVELGFBQU8sSUFBUDtBQUNEOztBQUVELFdBQU8sT0FBTyxJQUFQLEVBQWE7QUFDbEIsV0FBSyxHQURhO0FBRWxCLGdCQUFVLFlBQVk7QUFDcEIsZUFBTyxLQUFLLENBQ1QsS0FBSyxNQUFMLEdBQWMsQ0FBZCxHQUFrQixTQUFTLElBQVQsR0FBZ0IsR0FBbEMsR0FBd0MsRUFEL0IsRUFFVixLQUFLLElBQUwsQ0FGVSxDQUFMLENBQVA7QUFJRDtBQVBpQixLQUFiLENBQVA7QUFTRDs7QUFFRCxXQUFTLEtBQVQsR0FBa0I7QUFDaEIsUUFBSSxRQUFRLE9BQVo7QUFDQSxRQUFJLE9BQU8sT0FBWDs7QUFFQSxRQUFJLGdCQUFnQixNQUFNLFFBQTFCO0FBQ0EsUUFBSSxlQUFlLEtBQUssUUFBeEI7O0FBRUEsYUFBUyxJQUFULENBQWUsTUFBZixFQUF1QixJQUF2QixFQUE2QjtBQUMzQixXQUFLLE1BQUwsRUFBYSxJQUFiLEVBQW1CLEdBQW5CLEVBQXdCLE1BQU0sR0FBTixDQUFVLE1BQVYsRUFBa0IsSUFBbEIsQ0FBeEIsRUFBaUQsR0FBakQ7QUFDRDs7QUFFRCxXQUFPLE9BQU8sWUFBWTtBQUN4QixZQUFNLEtBQU4sQ0FBWSxLQUFaLEVBQW1CLE1BQU0sU0FBTixDQUFuQjtBQUNELEtBRk0sRUFFSjtBQUNELFdBQUssTUFBTSxHQURWO0FBRUQsYUFBTyxLQUZOO0FBR0QsWUFBTSxJQUhMO0FBSUQsWUFBTSxJQUpMO0FBS0QsV0FBSyxVQUFVLE1BQVYsRUFBa0IsSUFBbEIsRUFBd0IsS0FBeEIsRUFBK0I7QUFDbEMsYUFBSyxNQUFMLEVBQWEsSUFBYjtBQUNBLGNBQU0sTUFBTixFQUFjLElBQWQsRUFBb0IsR0FBcEIsRUFBeUIsS0FBekIsRUFBZ0MsR0FBaEM7QUFDRCxPQVJBO0FBU0QsZ0JBQVUsWUFBWTtBQUNwQixlQUFPLGtCQUFrQixjQUF6QjtBQUNEO0FBWEEsS0FGSSxDQUFQO0FBZUQ7O0FBRUQsV0FBUyxXQUFULEdBQXdCO0FBQ3RCLFFBQUksT0FBTyxLQUFLLFNBQUwsQ0FBWDtBQUNBLFFBQUksWUFBWSxPQUFoQjtBQUNBLFFBQUksWUFBWSxPQUFoQjs7QUFFQSxRQUFJLGVBQWUsVUFBVSxRQUE3QjtBQUNBLFFBQUksZUFBZSxVQUFVLFFBQTdCOztBQUVBLFdBQU8sT0FBTyxTQUFQLEVBQWtCO0FBQ3ZCLFlBQU0sWUFBWTtBQUNoQixrQkFBVSxLQUFWLENBQWdCLFNBQWhCLEVBQTJCLE1BQU0sU0FBTixDQUEzQjtBQUNBLGVBQU8sSUFBUDtBQUNELE9BSnNCO0FBS3ZCLFlBQU0sWUFBWTtBQUNoQixrQkFBVSxLQUFWLENBQWdCLFNBQWhCLEVBQTJCLE1BQU0sU0FBTixDQUEzQjtBQUNBLGVBQU8sSUFBUDtBQUNELE9BUnNCO0FBU3ZCLGdCQUFVLFlBQVk7QUFDcEIsWUFBSSxhQUFhLGNBQWpCO0FBQ0EsWUFBSSxVQUFKLEVBQWdCO0FBQ2QsdUJBQWEsVUFBVSxVQUFWLEdBQXVCLEdBQXBDO0FBQ0Q7QUFDRCxlQUFPLEtBQUssQ0FDVixLQURVLEVBQ0gsSUFERyxFQUNHLElBREgsRUFFVixjQUZVLEVBR1YsR0FIVSxFQUdMLFVBSEssQ0FBTCxDQUFQO0FBS0Q7QUFuQnNCLEtBQWxCLENBQVA7QUFxQkQ7O0FBRUQ7QUFDQSxNQUFJLGNBQWMsT0FBbEI7QUFDQSxNQUFJLGFBQWEsRUFBakI7QUFDQSxXQUFTLElBQVQsQ0FBZSxJQUFmLEVBQXFCLEtBQXJCLEVBQTRCO0FBQzFCLFFBQUksT0FBTyxFQUFYO0FBQ0EsYUFBUyxHQUFULEdBQWdCO0FBQ2QsVUFBSSxPQUFPLE1BQU0sS0FBSyxNQUF0QjtBQUNBLFdBQUssSUFBTCxDQUFVLElBQVY7QUFDQSxhQUFPLElBQVA7QUFDRDs7QUFFRCxZQUFRLFNBQVMsQ0FBakI7QUFDQSxTQUFLLElBQUksSUFBSSxDQUFiLEVBQWdCLElBQUksS0FBcEIsRUFBMkIsRUFBRSxDQUE3QixFQUFnQztBQUM5QjtBQUNEOztBQUVELFFBQUksT0FBTyxPQUFYO0FBQ0EsUUFBSSxlQUFlLEtBQUssUUFBeEI7O0FBRUEsUUFBSSxTQUFTLFdBQVcsSUFBWCxJQUFtQixPQUFPLElBQVAsRUFBYTtBQUMzQyxXQUFLLEdBRHNDO0FBRTNDLGdCQUFVLFlBQVk7QUFDcEIsZUFBTyxLQUFLLENBQ1YsV0FEVSxFQUNHLEtBQUssSUFBTCxFQURILEVBQ2dCLElBRGhCLEVBRVYsY0FGVSxFQUdWLEdBSFUsQ0FBTCxDQUFQO0FBS0Q7QUFSMEMsS0FBYixDQUFoQzs7QUFXQSxXQUFPLE1BQVA7QUFDRDs7QUFFRCxXQUFTLE9BQVQsR0FBb0I7QUFDbEIsUUFBSSxPQUFPLENBQUMsZUFBRCxFQUNULFdBRFMsRUFFVCxVQUZTLENBQVg7QUFHQSxXQUFPLElBQVAsQ0FBWSxVQUFaLEVBQXdCLE9BQXhCLENBQWdDLFVBQVUsSUFBVixFQUFnQjtBQUM5QyxXQUFLLElBQUwsQ0FBVSxHQUFWLEVBQWUsSUFBZixFQUFxQixJQUFyQixFQUEyQixXQUFXLElBQVgsRUFBaUIsUUFBakIsRUFBM0IsRUFBd0QsR0FBeEQ7QUFDRCxLQUZEO0FBR0EsU0FBSyxJQUFMLENBQVUsR0FBVjtBQUNBLFFBQUksTUFBTSxLQUFLLElBQUwsRUFDUCxPQURPLENBQ0MsSUFERCxFQUNPLEtBRFAsRUFFUCxPQUZPLENBRUMsSUFGRCxFQUVPLEtBRlAsRUFHUCxPQUhPLENBR0MsSUFIRCxFQUdPLEtBSFAsQ0FBVjtBQUlBLFFBQUksT0FBTyxTQUFTLEtBQVQsQ0FBZSxJQUFmLEVBQXFCLFlBQVksTUFBWixDQUFtQixHQUFuQixDQUFyQixDQUFYO0FBQ0EsV0FBTyxLQUFLLEtBQUwsQ0FBVyxJQUFYLEVBQWlCLFlBQWpCLENBQVA7QUFDRDs7QUFFRCxTQUFPO0FBQ0wsWUFBUSxXQURIO0FBRUwsVUFBTSxJQUZEO0FBR0wsV0FBTyxLQUhGO0FBSUwsVUFBTSxJQUpEO0FBS0wsV0FBTyxLQUxGO0FBTUwsVUFBTSxXQU5EO0FBT0wsYUFBUztBQVBKLEdBQVA7QUFTRCxDQTNLRDs7O0FDVkEsT0FBTyxPQUFQLEdBQWlCLFVBQVUsSUFBVixFQUFnQixJQUFoQixFQUFzQjtBQUNyQyxNQUFJLE9BQU8sT0FBTyxJQUFQLENBQVksSUFBWixDQUFYO0FBQ0EsT0FBSyxJQUFJLElBQUksQ0FBYixFQUFnQixJQUFJLEtBQUssTUFBekIsRUFBaUMsRUFBRSxDQUFuQyxFQUFzQztBQUNwQyxTQUFLLEtBQUssQ0FBTCxDQUFMLElBQWdCLEtBQUssS0FBSyxDQUFMLENBQUwsQ0FBaEI7QUFDRDtBQUNELFNBQU8sSUFBUDtBQUNELENBTkQ7OztBQ0FBLElBQUksT0FBTyxRQUFRLFFBQVIsQ0FBWDs7QUFFQSxPQUFPLE9BQVAsR0FBaUI7QUFDZixTQUFPLFVBRFE7QUFFZixXQUFTO0FBRk0sQ0FBakI7O0FBS0EsU0FBUyxTQUFULENBQW9CLEtBQXBCLEVBQTJCLEVBQTNCLEVBQStCLEdBQS9CLEVBQW9DO0FBQ2xDLE9BQUssSUFBSSxJQUFJLENBQWIsRUFBZ0IsSUFBSSxFQUFwQixFQUF3QixFQUFFLENBQTFCLEVBQTZCO0FBQzNCLFFBQUksQ0FBSixJQUFTLE1BQU0sQ0FBTixDQUFUO0FBQ0Q7QUFDRjs7QUFFRCxTQUFTLFNBQVQsQ0FBb0IsS0FBcEIsRUFBMkIsRUFBM0IsRUFBK0IsRUFBL0IsRUFBbUMsR0FBbkMsRUFBd0M7QUFDdEMsTUFBSSxNQUFNLENBQVY7QUFDQSxPQUFLLElBQUksSUFBSSxDQUFiLEVBQWdCLElBQUksRUFBcEIsRUFBd0IsRUFBRSxDQUExQixFQUE2QjtBQUMzQixRQUFJLE1BQU0sTUFBTSxDQUFOLENBQVY7QUFDQSxTQUFLLElBQUksSUFBSSxDQUFiLEVBQWdCLElBQUksRUFBcEIsRUFBd0IsRUFBRSxDQUExQixFQUE2QjtBQUMzQixVQUFJLEtBQUosSUFBYSxJQUFJLENBQUosQ0FBYjtBQUNEO0FBQ0Y7QUFDRjs7QUFFRCxTQUFTLFNBQVQsQ0FBb0IsS0FBcEIsRUFBMkIsRUFBM0IsRUFBK0IsRUFBL0IsRUFBbUMsRUFBbkMsRUFBdUMsR0FBdkMsRUFBNEMsSUFBNUMsRUFBa0Q7QUFDaEQsTUFBSSxNQUFNLElBQVY7QUFDQSxPQUFLLElBQUksSUFBSSxDQUFiLEVBQWdCLElBQUksRUFBcEIsRUFBd0IsRUFBRSxDQUExQixFQUE2QjtBQUMzQixRQUFJLE1BQU0sTUFBTSxDQUFOLENBQVY7QUFDQSxTQUFLLElBQUksSUFBSSxDQUFiLEVBQWdCLElBQUksRUFBcEIsRUFBd0IsRUFBRSxDQUExQixFQUE2QjtBQUMzQixVQUFJLE1BQU0sSUFBSSxDQUFKLENBQVY7QUFDQSxXQUFLLElBQUksSUFBSSxDQUFiLEVBQWdCLElBQUksRUFBcEIsRUFBd0IsRUFBRSxDQUExQixFQUE2QjtBQUMzQixZQUFJLEtBQUosSUFBYSxJQUFJLENBQUosQ0FBYjtBQUNEO0FBQ0Y7QUFDRjtBQUNGOztBQUVELFNBQVMsVUFBVCxDQUFxQixLQUFyQixFQUE0QixLQUE1QixFQUFtQyxLQUFuQyxFQUEwQyxHQUExQyxFQUErQyxHQUEvQyxFQUFvRDtBQUNsRCxNQUFJLFNBQVMsQ0FBYjtBQUNBLE9BQUssSUFBSSxJQUFJLFFBQVEsQ0FBckIsRUFBd0IsSUFBSSxNQUFNLE1BQWxDLEVBQTBDLEVBQUUsQ0FBNUMsRUFBK0M7QUFDN0MsY0FBVSxNQUFNLENBQU4sQ0FBVjtBQUNEO0FBQ0QsTUFBSSxJQUFJLE1BQU0sS0FBTixDQUFSO0FBQ0EsTUFBSSxNQUFNLE1BQU4sR0FBZSxLQUFmLEtBQXlCLENBQTdCLEVBQWdDO0FBQzlCLFFBQUksS0FBSyxNQUFNLFFBQVEsQ0FBZCxDQUFUO0FBQ0EsUUFBSSxLQUFLLE1BQU0sUUFBUSxDQUFkLENBQVQ7QUFDQSxRQUFJLEtBQUssTUFBTSxRQUFRLENBQWQsQ0FBVDtBQUNBLFNBQUssSUFBSSxDQUFULEVBQVksSUFBSSxDQUFoQixFQUFtQixFQUFFLENBQXJCLEVBQXdCO0FBQ3RCLGdCQUFVLE1BQU0sQ0FBTixDQUFWLEVBQW9CLEVBQXBCLEVBQXdCLEVBQXhCLEVBQTRCLEVBQTVCLEVBQWdDLEdBQWhDLEVBQXFDLEdBQXJDO0FBQ0EsYUFBTyxNQUFQO0FBQ0Q7QUFDRixHQVJELE1BUU87QUFDTCxTQUFLLElBQUksQ0FBVCxFQUFZLElBQUksQ0FBaEIsRUFBbUIsRUFBRSxDQUFyQixFQUF3QjtBQUN0QixpQkFBVyxNQUFNLENBQU4sQ0FBWCxFQUFxQixLQUFyQixFQUE0QixRQUFRLENBQXBDLEVBQXVDLEdBQXZDLEVBQTRDLEdBQTVDO0FBQ0EsYUFBTyxNQUFQO0FBQ0Q7QUFDRjtBQUNGOztBQUVELFNBQVMsWUFBVCxDQUF1QixLQUF2QixFQUE4QixLQUE5QixFQUFxQyxJQUFyQyxFQUEyQyxJQUEzQyxFQUFpRDtBQUMvQyxNQUFJLEtBQUssQ0FBVDtBQUNBLE1BQUksTUFBTSxNQUFWLEVBQWtCO0FBQ2hCLFNBQUssSUFBSSxJQUFJLENBQWIsRUFBZ0IsSUFBSSxNQUFNLE1BQTFCLEVBQWtDLEVBQUUsQ0FBcEMsRUFBdUM7QUFDckMsWUFBTSxNQUFNLENBQU4sQ0FBTjtBQUNEO0FBQ0YsR0FKRCxNQUlPO0FBQ0wsU0FBSyxDQUFMO0FBQ0Q7QUFDRCxNQUFJLE1BQU0sUUFBUSxLQUFLLFNBQUwsQ0FBZSxJQUFmLEVBQXFCLEVBQXJCLENBQWxCO0FBQ0EsVUFBUSxNQUFNLE1BQWQ7QUFDRSxTQUFLLENBQUw7QUFDRTtBQUNGLFNBQUssQ0FBTDtBQUNFLGdCQUFVLEtBQVYsRUFBaUIsTUFBTSxDQUFOLENBQWpCLEVBQTJCLEdBQTNCO0FBQ0E7QUFDRixTQUFLLENBQUw7QUFDRSxnQkFBVSxLQUFWLEVBQWlCLE1BQU0sQ0FBTixDQUFqQixFQUEyQixNQUFNLENBQU4sQ0FBM0IsRUFBcUMsR0FBckM7QUFDQTtBQUNGLFNBQUssQ0FBTDtBQUNFLGdCQUFVLEtBQVYsRUFBaUIsTUFBTSxDQUFOLENBQWpCLEVBQTJCLE1BQU0sQ0FBTixDQUEzQixFQUFxQyxNQUFNLENBQU4sQ0FBckMsRUFBK0MsR0FBL0MsRUFBb0QsQ0FBcEQ7QUFDQTtBQUNGO0FBQ0UsaUJBQVcsS0FBWCxFQUFrQixLQUFsQixFQUF5QixDQUF6QixFQUE0QixHQUE1QixFQUFpQyxDQUFqQztBQWJKO0FBZUEsU0FBTyxHQUFQO0FBQ0Q7O0FBRUQsU0FBUyxVQUFULENBQXFCLE1BQXJCLEVBQTZCO0FBQzNCLE1BQUksUUFBUSxFQUFaO0FBQ0EsT0FBSyxJQUFJLFFBQVEsTUFBakIsRUFBeUIsTUFBTSxNQUEvQixFQUF1QyxRQUFRLE1BQU0sQ0FBTixDQUEvQyxFQUF5RDtBQUN2RCxVQUFNLElBQU4sQ0FBVyxNQUFNLE1BQWpCO0FBQ0Q7QUFDRCxTQUFPLEtBQVA7QUFDRDs7O0FDNUZELElBQUksZUFBZSxRQUFRLGtCQUFSLENBQW5CO0FBQ0EsT0FBTyxPQUFQLEdBQWlCLFNBQVMsV0FBVCxDQUFzQixDQUF0QixFQUF5QjtBQUN4QyxTQUFPLE1BQU0sT0FBTixDQUFjLENBQWQsS0FBb0IsYUFBYSxDQUFiLENBQTNCO0FBQ0QsQ0FGRDs7O0FDREEsSUFBSSxlQUFlLFFBQVEsa0JBQVIsQ0FBbkI7O0FBRUEsT0FBTyxPQUFQLEdBQWlCLFNBQVMsYUFBVCxDQUF3QixHQUF4QixFQUE2QjtBQUM1QyxTQUNFLENBQUMsQ0FBQyxHQUFGLElBQ0EsT0FBTyxHQUFQLEtBQWUsUUFEZixJQUVBLE1BQU0sT0FBTixDQUFjLElBQUksS0FBbEIsQ0FGQSxJQUdBLE1BQU0sT0FBTixDQUFjLElBQUksTUFBbEIsQ0FIQSxJQUlBLE9BQU8sSUFBSSxNQUFYLEtBQXNCLFFBSnRCLElBS0EsSUFBSSxLQUFKLENBQVUsTUFBVixLQUFxQixJQUFJLE1BQUosQ0FBVyxNQUxoQyxLQU1DLE1BQU0sT0FBTixDQUFjLElBQUksSUFBbEIsS0FDQyxhQUFhLElBQUksSUFBakIsQ0FQRixDQURGO0FBU0QsQ0FWRDs7O0FDRkEsSUFBSSxTQUFTLFFBQVEsOEJBQVIsQ0FBYjtBQUNBLE9BQU8sT0FBUCxHQUFpQixVQUFVLENBQVYsRUFBYTtBQUM1QixTQUFPLE9BQU8sU0FBUCxDQUFpQixRQUFqQixDQUEwQixJQUExQixDQUErQixDQUEvQixLQUFxQyxNQUE1QztBQUNELENBRkQ7OztBQ0RBLE9BQU8sT0FBUCxHQUFpQixTQUFTLElBQVQsQ0FBZSxDQUFmLEVBQWtCLENBQWxCLEVBQXFCO0FBQ3BDLE1BQUksU0FBUyxNQUFNLENBQU4sQ0FBYjtBQUNBLE9BQUssSUFBSSxJQUFJLENBQWIsRUFBZ0IsSUFBSSxDQUFwQixFQUF1QixFQUFFLENBQXpCLEVBQTRCO0FBQzFCLFdBQU8sQ0FBUCxJQUFZLEVBQUUsQ0FBRixDQUFaO0FBQ0Q7QUFDRCxTQUFPLE1BQVA7QUFDRCxDQU5EOzs7QUNBQSxJQUFJLE9BQU8sUUFBUSxRQUFSLENBQVg7O0FBRUEsSUFBSSxVQUFVLElBQWQ7QUFDQSxJQUFJLG1CQUFtQixJQUF2QjtBQUNBLElBQUksV0FBVyxJQUFmO0FBQ0EsSUFBSSxvQkFBb0IsSUFBeEI7QUFDQSxJQUFJLFNBQVMsSUFBYjtBQUNBLElBQUksa0JBQWtCLElBQXRCO0FBQ0EsSUFBSSxXQUFXLElBQWY7O0FBRUEsSUFBSSxhQUFhLEtBQUssQ0FBTCxFQUFRLFlBQVk7QUFDbkMsU0FBTyxFQUFQO0FBQ0QsQ0FGZ0IsQ0FBakI7O0FBSUEsU0FBUyxTQUFULENBQW9CLENBQXBCLEVBQXVCO0FBQ3JCLE9BQUssSUFBSSxJQUFJLEVBQWIsRUFBaUIsS0FBTSxLQUFLLEVBQTVCLEVBQWlDLEtBQUssRUFBdEMsRUFBMEM7QUFDeEMsUUFBSSxLQUFLLENBQVQsRUFBWTtBQUNWLGFBQU8sQ0FBUDtBQUNEO0FBQ0Y7QUFDRCxTQUFPLENBQVA7QUFDRDs7QUFFRCxTQUFTLElBQVQsQ0FBZSxDQUFmLEVBQWtCO0FBQ2hCLE1BQUksQ0FBSixFQUFPLEtBQVA7QUFDQSxNQUFJLENBQUMsSUFBSSxNQUFMLEtBQWdCLENBQXBCO0FBQ0EsU0FBTyxDQUFQO0FBQ0EsVUFBUSxDQUFDLElBQUksSUFBTCxLQUFjLENBQXRCO0FBQ0EsU0FBTyxLQUFQLENBQWMsS0FBSyxLQUFMO0FBQ2QsVUFBUSxDQUFDLElBQUksR0FBTCxLQUFhLENBQXJCO0FBQ0EsU0FBTyxLQUFQLENBQWMsS0FBSyxLQUFMO0FBQ2QsVUFBUSxDQUFDLElBQUksR0FBTCxLQUFhLENBQXJCO0FBQ0EsU0FBTyxLQUFQLENBQWMsS0FBSyxLQUFMO0FBQ2QsU0FBTyxJQUFLLEtBQUssQ0FBakI7QUFDRDs7QUFFRCxTQUFTLEtBQVQsQ0FBZ0IsQ0FBaEIsRUFBbUI7QUFDakIsTUFBSSxLQUFLLFVBQVUsQ0FBVixDQUFUO0FBQ0EsTUFBSSxNQUFNLFdBQVcsS0FBSyxFQUFMLEtBQVksQ0FBdkIsQ0FBVjtBQUNBLE1BQUksSUFBSSxNQUFKLEdBQWEsQ0FBakIsRUFBb0I7QUFDbEIsV0FBTyxJQUFJLEdBQUosRUFBUDtBQUNEO0FBQ0QsU0FBTyxJQUFJLFdBQUosQ0FBZ0IsRUFBaEIsQ0FBUDtBQUNEOztBQUVELFNBQVMsSUFBVCxDQUFlLEdBQWYsRUFBb0I7QUFDbEIsYUFBVyxLQUFLLElBQUksVUFBVCxLQUF3QixDQUFuQyxFQUFzQyxJQUF0QyxDQUEyQyxHQUEzQztBQUNEOztBQUVELFNBQVMsU0FBVCxDQUFvQixJQUFwQixFQUEwQixDQUExQixFQUE2QjtBQUMzQixNQUFJLFNBQVMsSUFBYjtBQUNBLFVBQVEsSUFBUjtBQUNFLFNBQUssT0FBTDtBQUNFLGVBQVMsSUFBSSxTQUFKLENBQWMsTUFBTSxDQUFOLENBQWQsRUFBd0IsQ0FBeEIsRUFBMkIsQ0FBM0IsQ0FBVDtBQUNBO0FBQ0YsU0FBSyxnQkFBTDtBQUNFLGVBQVMsSUFBSSxVQUFKLENBQWUsTUFBTSxDQUFOLENBQWYsRUFBeUIsQ0FBekIsRUFBNEIsQ0FBNUIsQ0FBVDtBQUNBO0FBQ0YsU0FBSyxRQUFMO0FBQ0UsZUFBUyxJQUFJLFVBQUosQ0FBZSxNQUFNLElBQUksQ0FBVixDQUFmLEVBQTZCLENBQTdCLEVBQWdDLENBQWhDLENBQVQ7QUFDQTtBQUNGLFNBQUssaUJBQUw7QUFDRSxlQUFTLElBQUksV0FBSixDQUFnQixNQUFNLElBQUksQ0FBVixDQUFoQixFQUE4QixDQUE5QixFQUFpQyxDQUFqQyxDQUFUO0FBQ0E7QUFDRixTQUFLLE1BQUw7QUFDRSxlQUFTLElBQUksVUFBSixDQUFlLE1BQU0sSUFBSSxDQUFWLENBQWYsRUFBNkIsQ0FBN0IsRUFBZ0MsQ0FBaEMsQ0FBVDtBQUNBO0FBQ0YsU0FBSyxlQUFMO0FBQ0UsZUFBUyxJQUFJLFdBQUosQ0FBZ0IsTUFBTSxJQUFJLENBQVYsQ0FBaEIsRUFBOEIsQ0FBOUIsRUFBaUMsQ0FBakMsQ0FBVDtBQUNBO0FBQ0YsU0FBSyxRQUFMO0FBQ0UsZUFBUyxJQUFJLFlBQUosQ0FBaUIsTUFBTSxJQUFJLENBQVYsQ0FBakIsRUFBK0IsQ0FBL0IsRUFBa0MsQ0FBbEMsQ0FBVDtBQUNBO0FBQ0Y7QUFDRSxhQUFPLElBQVA7QUF2Qko7QUF5QkEsTUFBSSxPQUFPLE1BQVAsS0FBa0IsQ0FBdEIsRUFBeUI7QUFDdkIsV0FBTyxPQUFPLFFBQVAsQ0FBZ0IsQ0FBaEIsRUFBbUIsQ0FBbkIsQ0FBUDtBQUNEO0FBQ0QsU0FBTyxNQUFQO0FBQ0Q7O0FBRUQsU0FBUyxRQUFULENBQW1CLEtBQW5CLEVBQTBCO0FBQ3hCLE9BQUssTUFBTSxNQUFYO0FBQ0Q7O0FBRUQsT0FBTyxPQUFQLEdBQWlCO0FBQ2YsU0FBTyxLQURRO0FBRWYsUUFBTSxJQUZTO0FBR2YsYUFBVyxTQUhJO0FBSWYsWUFBVTtBQUpLLENBQWpCOzs7QUN0RkE7QUFDQSxJQUFJLE9BQU8scUJBQVAsS0FBaUMsVUFBakMsSUFDQSxPQUFPLG9CQUFQLEtBQWdDLFVBRHBDLEVBQ2dEO0FBQzlDLFNBQU8sT0FBUCxHQUFpQjtBQUNmLFVBQU0sVUFBVSxDQUFWLEVBQWE7QUFBRSxhQUFPLHNCQUFzQixDQUF0QixDQUFQO0FBQWlDLEtBRHZDO0FBRWYsWUFBUSxVQUFVLENBQVYsRUFBYTtBQUFFLGFBQU8scUJBQXFCLENBQXJCLENBQVA7QUFBZ0M7QUFGeEMsR0FBakI7QUFJRCxDQU5ELE1BTU87QUFDTCxTQUFPLE9BQVAsR0FBaUI7QUFDZixVQUFNLFVBQVUsRUFBVixFQUFjO0FBQ2xCLGFBQU8sV0FBVyxFQUFYLEVBQWUsRUFBZixDQUFQO0FBQ0QsS0FIYztBQUlmLFlBQVE7QUFKTyxHQUFqQjtBQU1EOzs7QUNkRCxJQUFJLE9BQU8sUUFBUSxRQUFSLENBQVg7O0FBRUEsSUFBSSxRQUFRLElBQUksWUFBSixDQUFpQixDQUFqQixDQUFaO0FBQ0EsSUFBSSxNQUFNLElBQUksV0FBSixDQUFnQixNQUFNLE1BQXRCLENBQVY7O0FBRUEsSUFBSSxvQkFBb0IsSUFBeEI7O0FBRUEsT0FBTyxPQUFQLEdBQWlCLFNBQVMsa0JBQVQsQ0FBNkIsS0FBN0IsRUFBb0M7QUFDbkQsTUFBSSxVQUFVLEtBQUssU0FBTCxDQUFlLGlCQUFmLEVBQWtDLE1BQU0sTUFBeEMsQ0FBZDs7QUFFQSxPQUFLLElBQUksSUFBSSxDQUFiLEVBQWdCLElBQUksTUFBTSxNQUExQixFQUFrQyxFQUFFLENBQXBDLEVBQXVDO0FBQ3JDLFFBQUksTUFBTSxNQUFNLENBQU4sQ0FBTixDQUFKLEVBQXFCO0FBQ25CLGNBQVEsQ0FBUixJQUFhLE1BQWI7QUFDRCxLQUZELE1BRU8sSUFBSSxNQUFNLENBQU4sTUFBYSxRQUFqQixFQUEyQjtBQUNoQyxjQUFRLENBQVIsSUFBYSxNQUFiO0FBQ0QsS0FGTSxNQUVBLElBQUksTUFBTSxDQUFOLE1BQWEsQ0FBQyxRQUFsQixFQUE0QjtBQUNqQyxjQUFRLENBQVIsSUFBYSxNQUFiO0FBQ0QsS0FGTSxNQUVBO0FBQ0wsWUFBTSxDQUFOLElBQVcsTUFBTSxDQUFOLENBQVg7QUFDQSxVQUFJLElBQUksSUFBSSxDQUFKLENBQVI7O0FBRUEsVUFBSSxNQUFPLE1BQU0sRUFBUCxJQUFjLEVBQXhCO0FBQ0EsVUFBSSxNQUFNLENBQUUsS0FBSyxDQUFOLEtBQWEsRUFBZCxJQUFvQixHQUE5QjtBQUNBLFVBQUksT0FBUSxLQUFLLEVBQU4sR0FBYSxDQUFDLEtBQUssRUFBTixJQUFZLENBQXBDOztBQUVBLFVBQUksTUFBTSxDQUFDLEVBQVgsRUFBZTtBQUNiO0FBQ0EsZ0JBQVEsQ0FBUixJQUFhLEdBQWI7QUFDRCxPQUhELE1BR08sSUFBSSxNQUFNLENBQUMsRUFBWCxFQUFlO0FBQ3BCO0FBQ0EsWUFBSSxJQUFJLENBQUMsRUFBRCxHQUFNLEdBQWQ7QUFDQSxnQkFBUSxDQUFSLElBQWEsT0FBUSxRQUFRLEtBQUssRUFBYixDQUFELElBQXNCLENBQTdCLENBQWI7QUFDRCxPQUpNLE1BSUEsSUFBSSxNQUFNLEVBQVYsRUFBYztBQUNuQjtBQUNBLGdCQUFRLENBQVIsSUFBYSxNQUFNLE1BQW5CO0FBQ0QsT0FITSxNQUdBO0FBQ0w7QUFDQSxnQkFBUSxDQUFSLElBQWEsT0FBUSxNQUFNLEVBQVAsSUFBYyxFQUFyQixJQUEyQixJQUF4QztBQUNEO0FBQ0Y7QUFDRjs7QUFFRCxTQUFPLE9BQVA7QUFDRCxDQXBDRDs7O0FDUEEsT0FBTyxPQUFQLEdBQWlCLFVBQVUsR0FBVixFQUFlO0FBQzlCLFNBQU8sT0FBTyxJQUFQLENBQVksR0FBWixFQUFpQixHQUFqQixDQUFxQixVQUFVLEdBQVYsRUFBZTtBQUFFLFdBQU8sSUFBSSxHQUFKLENBQVA7QUFBaUIsR0FBdkQsQ0FBUDtBQUNELENBRkQ7OztBQ0FBOztBQUVBLElBQUksU0FBUyxRQUFRLGVBQVIsQ0FBYjs7QUFFQSxTQUFTLFlBQVQsQ0FBdUIsT0FBdkIsRUFBZ0MsTUFBaEMsRUFBd0MsVUFBeEMsRUFBb0Q7QUFDbEQsTUFBSSxTQUFTLFNBQVMsYUFBVCxDQUF1QixRQUF2QixDQUFiO0FBQ0EsU0FBTyxPQUFPLEtBQWQsRUFBcUI7QUFDbkIsWUFBUSxDQURXO0FBRW5CLFlBQVEsQ0FGVztBQUduQixhQUFTLENBSFU7QUFJbkIsU0FBSyxDQUpjO0FBS25CLFVBQU07QUFMYSxHQUFyQjtBQU9BLFVBQVEsV0FBUixDQUFvQixNQUFwQjs7QUFFQSxNQUFJLFlBQVksU0FBUyxJQUF6QixFQUErQjtBQUM3QixXQUFPLEtBQVAsQ0FBYSxRQUFiLEdBQXdCLFVBQXhCO0FBQ0EsV0FBTyxRQUFRLEtBQWYsRUFBc0I7QUFDcEIsY0FBUSxDQURZO0FBRXBCLGVBQVM7QUFGVyxLQUF0QjtBQUlEOztBQUVELFdBQVMsTUFBVCxHQUFtQjtBQUNqQixRQUFJLElBQUksT0FBTyxVQUFmO0FBQ0EsUUFBSSxJQUFJLE9BQU8sV0FBZjtBQUNBLFFBQUksWUFBWSxTQUFTLElBQXpCLEVBQStCO0FBQzdCLFVBQUksU0FBUyxRQUFRLHFCQUFSLEVBQWI7QUFDQSxVQUFJLE9BQU8sS0FBUCxHQUFlLE9BQU8sSUFBMUI7QUFDQSxVQUFJLE9BQU8sR0FBUCxHQUFhLE9BQU8sTUFBeEI7QUFDRDtBQUNELFdBQU8sS0FBUCxHQUFlLGFBQWEsQ0FBNUI7QUFDQSxXQUFPLE1BQVAsR0FBZ0IsYUFBYSxDQUE3QjtBQUNBLFdBQU8sT0FBTyxLQUFkLEVBQXFCO0FBQ25CLGFBQU8sSUFBSSxJQURRO0FBRW5CLGNBQVEsSUFBSTtBQUZPLEtBQXJCO0FBSUQ7O0FBRUQsU0FBTyxnQkFBUCxDQUF3QixRQUF4QixFQUFrQyxNQUFsQyxFQUEwQyxLQUExQzs7QUFFQSxXQUFTLFNBQVQsR0FBc0I7QUFDcEIsV0FBTyxtQkFBUCxDQUEyQixRQUEzQixFQUFxQyxNQUFyQztBQUNBLFlBQVEsV0FBUixDQUFvQixNQUFwQjtBQUNEOztBQUVEOztBQUVBLFNBQU87QUFDTCxZQUFRLE1BREg7QUFFTCxlQUFXO0FBRk4sR0FBUDtBQUlEOztBQUVELFNBQVMsYUFBVCxDQUF3QixNQUF4QixFQUFnQyxnQkFBaEMsRUFBa0Q7QUFDaEQsV0FBUyxHQUFULENBQWMsSUFBZCxFQUFvQjtBQUNsQixRQUFJO0FBQ0YsYUFBTyxPQUFPLFVBQVAsQ0FBa0IsSUFBbEIsRUFBd0IsZ0JBQXhCLENBQVA7QUFDRCxLQUZELENBRUUsT0FBTyxDQUFQLEVBQVU7QUFDVixhQUFPLElBQVA7QUFDRDtBQUNGO0FBQ0QsU0FDRSxJQUFJLE9BQUosS0FDQSxJQUFJLG9CQUFKLENBREEsSUFFQSxJQUFJLG9CQUFKLENBSEY7QUFLRDs7QUFFRCxTQUFTLGFBQVQsQ0FBd0IsR0FBeEIsRUFBNkI7QUFDM0IsU0FDRSxPQUFPLElBQUksUUFBWCxLQUF3QixRQUF4QixJQUNBLE9BQU8sSUFBSSxXQUFYLEtBQTJCLFVBRDNCLElBRUEsT0FBTyxJQUFJLHFCQUFYLEtBQXFDLFVBSHZDO0FBS0Q7O0FBRUQsU0FBUyxjQUFULENBQXlCLEdBQXpCLEVBQThCO0FBQzVCLFNBQ0UsT0FBTyxJQUFJLFVBQVgsS0FBMEIsVUFBMUIsSUFDQSxPQUFPLElBQUksWUFBWCxLQUE0QixVQUY5QjtBQUlEOztBQUVELFNBQVMsZUFBVCxDQUEwQixLQUExQixFQUFpQztBQUMvQixNQUFJLE9BQU8sS0FBUCxLQUFpQixRQUFyQixFQUErQjtBQUM3QixXQUFPLE1BQU0sS0FBTixFQUFQO0FBQ0Q7O0FBRUQsU0FBTyxLQUFQO0FBQ0Q7O0FBRUQsU0FBUyxVQUFULENBQXFCLElBQXJCLEVBQTJCO0FBQ3pCLE1BQUksT0FBTyxJQUFQLEtBQWdCLFFBQXBCLEVBQThCOztBQUU1QixXQUFPLFNBQVMsYUFBVCxDQUF1QixJQUF2QixDQUFQO0FBQ0Q7QUFDRCxTQUFPLElBQVA7QUFDRDs7QUFFRCxPQUFPLE9BQVAsR0FBaUIsU0FBUyxTQUFULENBQW9CLEtBQXBCLEVBQTJCO0FBQzFDLE1BQUksT0FBTyxTQUFTLEVBQXBCO0FBQ0EsTUFBSSxPQUFKLEVBQWEsU0FBYixFQUF3QixNQUF4QixFQUFnQyxFQUFoQztBQUNBLE1BQUksb0JBQW9CLEVBQXhCO0FBQ0EsTUFBSSxhQUFhLEVBQWpCO0FBQ0EsTUFBSSxxQkFBcUIsRUFBekI7QUFDQSxNQUFJLGFBQWMsT0FBTyxNQUFQLEtBQWtCLFdBQWxCLEdBQWdDLENBQWhDLEdBQW9DLE9BQU8sZ0JBQTdEO0FBQ0EsTUFBSSxVQUFVLEtBQWQ7QUFDQSxNQUFJLFNBQVMsVUFBVSxHQUFWLEVBQWU7QUFDMUIsUUFBSSxHQUFKLEVBQVMsQ0FFUjtBQUNGLEdBSkQ7QUFLQSxNQUFJLFlBQVksWUFBWSxDQUFFLENBQTlCO0FBQ0EsTUFBSSxPQUFPLElBQVAsS0FBZ0IsUUFBcEIsRUFBOEI7O0FBRTVCLGNBQVUsU0FBUyxhQUFULENBQXVCLElBQXZCLENBQVY7QUFFRCxHQUpELE1BSU8sSUFBSSxPQUFPLElBQVAsS0FBZ0IsUUFBcEIsRUFBOEI7QUFDbkMsUUFBSSxjQUFjLElBQWQsQ0FBSixFQUF5QjtBQUN2QixnQkFBVSxJQUFWO0FBQ0QsS0FGRCxNQUVPLElBQUksZUFBZSxJQUFmLENBQUosRUFBMEI7QUFDL0IsV0FBSyxJQUFMO0FBQ0EsZUFBUyxHQUFHLE1BQVo7QUFDRCxLQUhNLE1BR0E7O0FBRUwsVUFBSSxRQUFRLElBQVosRUFBa0I7QUFDaEIsYUFBSyxLQUFLLEVBQVY7QUFDRCxPQUZELE1BRU8sSUFBSSxZQUFZLElBQWhCLEVBQXNCO0FBQzNCLGlCQUFTLFdBQVcsS0FBSyxNQUFoQixDQUFUO0FBQ0QsT0FGTSxNQUVBLElBQUksZUFBZSxJQUFuQixFQUF5QjtBQUM5QixvQkFBWSxXQUFXLEtBQUssU0FBaEIsQ0FBWjtBQUNEO0FBQ0QsVUFBSSxnQkFBZ0IsSUFBcEIsRUFBMEI7QUFDeEIsNEJBQW9CLEtBQUssVUFBekI7QUFFRDtBQUNELFVBQUksZ0JBQWdCLElBQXBCLEVBQTBCO0FBQ3hCLHFCQUFhLGdCQUFnQixLQUFLLFVBQXJCLENBQWI7QUFDRDtBQUNELFVBQUksd0JBQXdCLElBQTVCLEVBQWtDO0FBQ2hDLDZCQUFxQixnQkFBZ0IsS0FBSyxrQkFBckIsQ0FBckI7QUFDRDtBQUNELFVBQUksWUFBWSxJQUFoQixFQUFzQjs7QUFFcEIsaUJBQVMsS0FBSyxNQUFkO0FBQ0Q7QUFDRCxVQUFJLGFBQWEsSUFBakIsRUFBdUI7QUFDckIsa0JBQVUsQ0FBQyxDQUFDLEtBQUssT0FBakI7QUFDRDtBQUNELFVBQUksZ0JBQWdCLElBQXBCLEVBQTBCO0FBQ3hCLHFCQUFhLENBQUMsS0FBSyxVQUFuQjtBQUVEO0FBQ0Y7QUFDRixHQXJDTSxNQXFDQSxDQUVOOztBQUVELE1BQUksT0FBSixFQUFhO0FBQ1gsUUFBSSxRQUFRLFFBQVIsQ0FBaUIsV0FBakIsT0FBbUMsUUFBdkMsRUFBaUQ7QUFDL0MsZUFBUyxPQUFUO0FBQ0QsS0FGRCxNQUVPO0FBQ0wsa0JBQVksT0FBWjtBQUNEO0FBQ0Y7O0FBRUQsTUFBSSxDQUFDLEVBQUwsRUFBUztBQUNQLFFBQUksQ0FBQyxNQUFMLEVBQWE7O0FBRVgsVUFBSSxTQUFTLGFBQWEsYUFBYSxTQUFTLElBQW5DLEVBQXlDLE1BQXpDLEVBQWlELFVBQWpELENBQWI7QUFDQSxVQUFJLENBQUMsTUFBTCxFQUFhO0FBQ1gsZUFBTyxJQUFQO0FBQ0Q7QUFDRCxlQUFTLE9BQU8sTUFBaEI7QUFDQSxrQkFBWSxPQUFPLFNBQW5CO0FBQ0Q7QUFDRCxTQUFLLGNBQWMsTUFBZCxFQUFzQixpQkFBdEIsQ0FBTDtBQUNEOztBQUVELE1BQUksQ0FBQyxFQUFMLEVBQVM7QUFDUDtBQUNBLFdBQU8sMEZBQVA7QUFDQSxXQUFPLElBQVA7QUFDRDs7QUFFRCxTQUFPO0FBQ0wsUUFBSSxFQURDO0FBRUwsWUFBUSxNQUZIO0FBR0wsZUFBVyxTQUhOO0FBSUwsZ0JBQVksVUFKUDtBQUtMLHdCQUFvQixrQkFMZjtBQU1MLGdCQUFZLFVBTlA7QUFPTCxhQUFTLE9BUEo7QUFRTCxZQUFRLE1BUkg7QUFTTCxlQUFXO0FBVE4sR0FBUDtBQVdELENBakdEOzs7QUNwR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFD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QUFjLElBQWQsRUFBb0IsSUFBcEI7O0FBRUEsU0FBTyxJQUFQO0FBQ0QsQ0FsaEJEIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIi8qXG4gIHRhZ3M6IGFkdmFuY2VkXG5cbiAgPHA+SW1wbGljaXQgc3VyZmFjZSByYXl0cmFjaW5nIGRlbW8uIE1hbnkgaWRlYXMgYW5kIHBpZWNlcyBvZiBjb2RlIHRha2VuIGZyb20gPGEgaHJlZj1cImh0dHBzOi8vZ2l0aHViLmNvbS9rZXZpbnJvYXN0L3dlYmdsc2hhZGVycy9ibG9iL21hc3Rlci9kaXN0YW5jZWZpZWxkMS5odG1sXCI+aGVyZTwvYT4gYW5kIDxhIGhyZWY9XCJodHRwOi8vd3d3LmlxdWlsZXpsZXMub3JnL3d3dy9hcnRpY2xlcy9kaXN0ZnVuY3Rpb25zL2Rpc3RmdW5jdGlvbnMuaHRtXCI+aGVyZTwvYT4gIDwvcD5cblxuICovXG5cbmNvbnN0IHJlZ2wgPSByZXF1aXJlKCcuLi9yZWdsJykoKVxuXG5jb25zdCBjYW1lcmEgPSByZXF1aXJlKCcuL3V0aWwvY2FtZXJhJykocmVnbCwge1xuICBjZW50ZXI6IFstMTIsIDUsIDFdLFxuICBwaGk6IC0wLjJcbn0pXG5cbmNvbnN0IHJheXRyYWNlID0gcmVnbCh7XG4gIHZlcnQ6IGBcbiAgICBwcmVjaXNpb24gbWVkaXVtcCBmbG9hdDtcbiAgICBhdHRyaWJ1dGUgdmVjMiBwb3NpdGlvbjtcbiAgICB2b2lkIG1haW4gKCkge1xuICAgICAgZ2xfUG9zaXRpb24gPSB2ZWM0KHBvc2l0aW9uLCAwLCAxKTtcbiAgICB9YCxcbiAgZnJhZzogYFxuICAgIHByZWNpc2lvbiBtZWRpdW1wIGZsb2F0O1xuICAgIHVuaWZvcm0gZmxvYXQgd2lkdGgsIGhlaWdodCwgdGltZXN0ZXA7XG4gICAgdW5pZm9ybSB2ZWMzIGV5ZSwgY2VudGVyO1xuICAgIHZlYzIgcmVzb2x1dGlvbiA9IHZlYzIod2lkdGgsIGhlaWdodCk7XG5cbiAgICBmbG9hdCB0b3J1cyh2ZWMzIHAsIHZlYzIgdClcbiAgICB7XG4gICAgICB2ZWMyIHEgPSB2ZWMyKGxlbmd0aChwLnh6KS10LngscC55KTtcbiAgICAgIHJldHVybiBsZW5ndGgocSktdC55O1xuICAgIH1cblxuICAgIGZsb2F0IHNwaGVyZSh2ZWMzIHAsIGZsb2F0IHMpXG4gICAge1xuICAgICAgcmV0dXJuIGxlbmd0aChwKS1zO1xuICAgIH1cblxuICAgIHZlYzIgb3BVKHZlYzIgZDEsIHZlYzIgZDIpXG4gICAge1xuICAgICAgcmV0dXJuIChkMS54IDwgZDIueCkgPyBkMSA6IGQyO1xuICAgIH1cblxuICAgIHZlYzMgb3BSZXAodmVjMyBwLCB2ZWMzIGMpXG4gICAge1xuICAgICAgcmV0dXJuIHZlYzMobW9kKHAueXosIGMueXopLTAuNSpjLnl6LCBwLngpO1xuICAgIH1cblxuICAgIGZsb2F0IHBsYW5lKHZlYzMgcCwgdmVjNCBuKVxuICAgIHtcbiAgICAgIHJldHVybiBkb3QocCwgbi54eXopICsgbi53O1xuICAgIH1cblxuICAgIHZlYzIgZGlzdGFuY2VFc3RpbWF0ZSh2ZWMzIHBvcylcbiAgICB7XG4gICAgICBmbG9hdCBjZWxsU2l6ZSA9IDUuO1xuICAgICAgZmxvYXQgY2VsbE51bWJlciA9IGZsb29yKHBvcy55L2NlbGxTaXplKSsxLjtcbiAgICAgIGZsb2F0IHBlcmlvZCA9IDUwLi9jZWxsTnVtYmVyO1xuICAgICAgZmxvYXQgcyA9IHNpbih0aW1lc3RlcC9wZXJpb2QpO1xuICAgICAgZmxvYXQgYyA9IGNvcyh0aW1lc3RlcC9wZXJpb2QpO1xuICAgICAgbWF0MyByID0gbWF0MyhjLCAgLXMsICAwLixcbiAgICAgICAgICAgICAgICAgICAgcywgICBjLCAgMC4sXG4gICAgICAgICAgICAgICAgICAgIDAuLCAgMC4sIDEuKTtcbiAgICAgIHZlYzIgYmFsbCA9IHZlYzIoc3BoZXJlKG9wUmVwKHBvcy12ZWMzKDAsIDAsIHMqMi4wKSwgdmVjMyhjZWxsU2l6ZSkpLCAwLjUpLCA0NS4pO1xuICAgICAgdmVjMiB0b3IgPSB2ZWMyKHRvcnVzKG9wUmVwKHBvcywgdmVjMyhjZWxsU2l6ZSkpKnIsIHZlYzIoMS4wLCAwLjI1KSksIDE1Lik7XG4gICAgICB2ZWMyIGZsb29yID0gdmVjMihwbGFuZShwb3MsIHZlYzQoMCwgMSwgMCwgLTEpKSwgMC4pO1xuICAgICAgdmVjMiBvYmplY3RzID0gb3BVKHRvciwgYmFsbCk7XG4gICAgICByZXR1cm4gb3BVKGZsb29yLCBvYmplY3RzKTtcbiAgICB9XG5cbiAgICB2ZWMzIGdldE5vcm1hbCh2ZWMzIHBvcylcbiAgICB7XG4gICAgICBjb25zdCB2ZWMyIGRlbHRhID0gdmVjMigwLjAxLCAwKTtcblxuICAgICAgdmVjMyBuO1xuICAgICAgbi54ID0gZGlzdGFuY2VFc3RpbWF0ZShwb3MgKyBkZWx0YS54eXkpLnggLSBkaXN0YW5jZUVzdGltYXRlKHBvcyAtIGRlbHRhLnh5eSkueDtcbiAgICAgIG4ueSA9IGRpc3RhbmNlRXN0aW1hdGUocG9zICsgZGVsdGEueXh5KS54IC0gZGlzdGFuY2VFc3RpbWF0ZShwb3MgLSBkZWx0YS55eHkpLng7XG4gICAgICBuLnogPSBkaXN0YW5jZUVzdGltYXRlKHBvcyArIGRlbHRhLnl5eCkueCAtIGRpc3RhbmNlRXN0aW1hdGUocG9zIC0gZGVsdGEueXl4KS54O1xuXG4gICAgICByZXR1cm4gbm9ybWFsaXplKG4pO1xuICAgIH1cblxuICAgIGZsb2F0IHNvZnRzaGFkb3coaW4gdmVjMyBybywgaW4gdmVjMyByZCwgaW4gZmxvYXQgbWludCwgaW4gZmxvYXQgdG1heClcbiAgICB7XG4gICAgICBmbG9hdCByZXMgPSAxLjA7XG4gICAgICBmbG9hdCB0ID0gbWludDtcbiAgICAgIGZvciAoaW50IGk9MDsgaTwxNjsgaSsrKVxuICAgICAge1xuICAgICAgICBmbG9hdCBoID0gZGlzdGFuY2VFc3RpbWF0ZShybyArIHJkKnQpLng7XG4gICAgICAgIHJlcyA9IG1pbihyZXMsIDguMCpoL3QpO1xuICAgICAgICB0ICs9IGNsYW1wKGgsIDAuMDIsIDAuMTEpO1xuICAgICAgICBpZiggaDwwLjAwMSB8fCB0PnRtYXggKSBicmVhaztcbiAgICAgIH1cbiAgICAgIHJldHVybiBjbGFtcChyZXMsIDAuLCAxLik7XG4gICAgfVxuXG4gICAgZmxvYXQgY2FsY0FPKGluIHZlYzMgcG9zLCBpbiB2ZWMzIG5vcilcbiAgICB7XG4gICAgICBmbG9hdCBvY2MgPSAwLjA7XG4gICAgICBmbG9hdCBzY2EgPSAxLjA7XG4gICAgICBmb3IgKGludCBpPTA7IGk8NTsgaSsrKVxuICAgICAge1xuICAgICAgICBmbG9hdCBociA9IDAuMDEgKyAwLjEyKmZsb2F0KGkpLzQuMDtcbiAgICAgICAgdmVjMyBhb3BvcyA9ICBub3IgKiBociArIHBvcztcbiAgICAgICAgZmxvYXQgZGQgPSBkaXN0YW5jZUVzdGltYXRlKGFvcG9zKS54O1xuICAgICAgICBvY2MgKz0gLShkZC1ocikqc2NhO1xuICAgICAgICBzY2EgKj0gMC45NTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBjbGFtcCgxLjAgLSAzLjAqb2NjLCAwLiwgMS4pO1xuICAgIH1cblxuICAgIHZlYzMgc3VuTGlnaHQgID0gbm9ybWFsaXplKHZlYzMoLTAuNiwgMC43LCAwLjUpKTtcbiAgICB2ZWMzIHN1bkNvbG91ciA9IHZlYzMoMS4wLCAuNzUsIC42KTtcbiAgICB2ZWMzIFNreShpbiB2ZWMzIHJheURpcilcbiAgICB7XG4gICAgICBmbG9hdCBzdW5BbW91bnQgPSBtYXgoZG90KHJheURpciwgc3VuTGlnaHQpLCAwLjApO1xuICAgICAgZmxvYXQgdiA9IHBvdygxLjAgLSBtYXgocmF5RGlyLnksIDAuMCksIDYuKTtcbiAgICAgIHZlYzMgIHNreSA9IG1peCh2ZWMzKC4xLCAuMiwgLjMpLCB2ZWMzKC4zMiwgLjMyLCAuMzIpLCB2KTtcbiAgICAgIHNreSA9IHNreSArIHN1bkNvbG91ciAqIHN1bkFtb3VudCAqIHN1bkFtb3VudCAqIC4yNTtcbiAgICAgIHNreSA9IHNreSArIHN1bkNvbG91ciAqIG1pbihwb3coc3VuQW1vdW50LCA4MDAuMCkqMS41LCAuMyk7XG5cbiAgICAgIHJldHVybiBjbGFtcChza3ksIDAuLCAxLik7XG4gICAgfVxuXG4gICAgY29uc3QgZmxvYXQgaG9yaXpvbkxlbmd0aCA9IDEwMC47XG4gICAgY29uc3QgZmxvYXQgc3VyZmFjZVByZWNpc2lvbiA9IDAuMDE7XG4gICAgY29uc3QgaW50IG1heEl0ZXJhdGlvbnMgPSAxMjg7XG4gICAgdmVjMiBjYXN0UmF5KHZlYzMgcmF5T3JpZ2luLCB2ZWMzIHJheURpcilcbiAgICB7XG4gICAgICBmbG9hdCB0ID0gMC47XG4gICAgICBmb3IgKGludCBpPTA7IGk8bWF4SXRlcmF0aW9uczsgaSsrKVxuICAgICAge1xuICAgICAgICB2ZWMzIHAgPSByYXlPcmlnaW4gKyByYXlEaXIgKiB0O1xuICAgICAgICB2ZWMyIGQgPSBkaXN0YW5jZUVzdGltYXRlKHApO1xuICAgICAgICBpZiAoYWJzKGQueCkgPCBzdXJmYWNlUHJlY2lzaW9uKVxuICAgICAgICB7XG4gICAgICAgICAgcmV0dXJuIHZlYzIodCwgZC55KTtcbiAgICAgICAgfVxuICAgICAgICB0ICs9IGQueDtcbiAgICAgICAgaWYgKHQgPj0gaG9yaXpvbkxlbmd0aCkgYnJlYWs7XG4gICAgICB9XG4gICAgICByZXR1cm4gdmVjMih0LCAtMS4pO1xuICAgIH1cblxuICAgIHZlYzMgZ2V0UmF5KHZlYzMgZGlyLCB2ZWMyIHBvcykge1xuICAgICAgcG9zID0gcG9zIC0gMC41O1xuICAgICAgcG9zLnggKj0gcmVzb2x1dGlvbi54L3Jlc29sdXRpb24ueTtcblxuICAgICAgZGlyID0gbm9ybWFsaXplKGRpcik7XG4gICAgICB2ZWMzIHJpZ2h0ID0gbm9ybWFsaXplKGNyb3NzKHZlYzMoMC4sIDEuLCAwLiksIGRpcikpO1xuICAgICAgdmVjMyB1cCA9IG5vcm1hbGl6ZShjcm9zcyhkaXIsIHJpZ2h0KSk7XG5cbiAgICAgIHJldHVybiBkaXIgKyByaWdodCpwb3MueCArIHVwKnBvcy55O1xuICAgIH1cblxuICAgIHZlYzMgcmVuZGVyKGluIHZlYzMgcm8sIGluIHZlYzMgcmQpXG4gICAge1xuICAgICAgdmVjMyBza3lDb2xvciA9IFNreShyZCk7XG4gICAgICB2ZWMzIGNvbG9yID0gc2t5Q29sb3I7XG4gICAgICB2ZWMyIHJlcyA9IGNhc3RSYXkocm8sIHJkKTtcbiAgICAgIGZsb2F0IHQgPSByZXMueDtcbiAgICAgIGZsb2F0IG1hdGVyaWFsID0gcmVzLnk7XG4gICAgICBpZiAodCA8IGhvcml6b25MZW5ndGgpXG4gICAgICB7XG4gICAgICAgIHZlYzMgcG9zID0gcm8gKyB0KnJkO1xuICAgICAgICB2ZWMzIG5vcm1hbCA9IGdldE5vcm1hbChwb3MpO1xuICAgICAgICB2ZWMzIHJlZmxlY3Rpb25EaXIgPSByZWZsZWN0KHJkLCBub3JtYWwpO1xuXG4gICAgICAgIC8vIG1hdGVyaWFsXG4gICAgICAgIGNvbG9yID0gMC40NSArIDAuMypzaW4odmVjMygwLjA1LCAwLjA4LCAwLjEwKSkgKiBtYXRlcmlhbDtcblxuICAgICAgICBpZiAobWF0ZXJpYWwgPT0gMC4wKVxuICAgICAgICB7XG4gICAgICAgICAgZmxvYXQgZiA9IG1vZChmbG9vcigyLipwb3MueikgKyBmbG9vcigyLipwb3MueCksIDIuKTtcbiAgICAgICAgICBjb2xvciA9IDAuNCArIDAuMSpmKnZlYzMoMS4pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gbGlnaHRpbmdcbiAgICAgICAgZmxvYXQgb2NjID0gY2FsY0FPKHBvcywgbm9ybWFsKTtcbiAgICAgICAgZmxvYXQgYW1iID0gY2xhbXAoMC41KzAuNSpub3JtYWwueSwgMC4sIDEuKTtcbiAgICAgICAgZmxvYXQgZGlmID0gY2xhbXAoZG90KG5vcm1hbCwgc3VuTGlnaHQpLCAwLiwgMS4pO1xuICAgICAgICBmbG9hdCBiYWMgPSBjbGFtcChkb3Qobm9ybWFsLCBub3JtYWxpemUodmVjMygtc3VuTGlnaHQueCwgMC4sIC1zdW5MaWdodC56KSkpLCAwLiwgMS4pICogY2xhbXAoMS4wLXBvcy55LCAwLiwgMS4pO1xuICAgICAgICBmbG9hdCBkb20gPSBzbW9vdGhzdGVwKC0wLjEsIDAuMSwgcmVmbGVjdGlvbkRpci55KTtcbiAgICAgICAgZmxvYXQgZnJlID0gcG93KGNsYW1wKDEuMCtkb3Qobm9ybWFsLCByZCksIDAuLCAxLiksIDIuKTtcbiAgICAgICAgZmxvYXQgc3BlID0gcG93KGNsYW1wKGRvdChyZWZsZWN0aW9uRGlyLCBzdW5MaWdodCksIDAuLCAxLiksIDE2Lik7XG5cbiAgICAgICAgZGlmICo9IHNvZnRzaGFkb3cocG9zLCBzdW5MaWdodCwgMC4wMiwgMi41KTtcbiAgICAgICAgZG9tICo9IHNvZnRzaGFkb3cocG9zLCByZWZsZWN0aW9uRGlyLCAwLjAyLCAyLjUpO1xuXG4gICAgICAgIHZlYzMgbGluID0gdmVjMygwLik7XG4gICAgICAgIGxpbiArPSAxLjIwICogZGlmICogdmVjMygxLjAwLCAwLjg1LCAwLjU1KTtcbiAgICAgICAgbGluICs9IDEuMjAgKiBzcGUgKiB2ZWMzKDEuMDAsIDAuODUsIDAuNTUpICogZGlmO1xuICAgICAgICBsaW4gKz0gMC4yMCAqIGFtYiAqIHZlYzMoMC41MCwgMC43MCwgMS4wMCkgKiBvY2M7XG4gICAgICAgIGxpbiArPSAwLjMwICogZG9tICogdmVjMygwLjUwLCAwLjcwLCAxLjAwKSAqIG9jYztcbiAgICAgICAgbGluICs9IDAuMzAgKiBiYWMgKiB2ZWMzKDAuMjUsIDAuMjUsIDAuMjUpICogb2NjO1xuICAgICAgICBsaW4gKz0gMC40MCAqIGZyZSAqIHZlYzMoMS4wMCwgMS4wMCwgMS4wMCkgKiBvY2M7XG4gICAgICAgIGNvbG9yID0gY29sb3IgKiBsaW47XG5cbiAgICAgICAgY29sb3IgPSBtaXgoY29sb3IsIHNreUNvbG9yLCAxLjAtZXhwKC0wLjAwMSp0KnQpKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB2ZWMzKGNsYW1wKGNvbG9yLCAwLiwgMS4pKTtcbiAgICB9XG5cbiAgICB2b2lkIG1haW4gKCkge1xuICAgICAgdmVjMiBwID0gZ2xfRnJhZ0Nvb3JkLnh5IC8gcmVzb2x1dGlvbi54eTtcbiAgICAgIHZlYzMgcmF5RGlyID0gbm9ybWFsaXplKGdldFJheShleWUtY2VudGVyLCBwKSk7XG4gICAgICB2ZWMzIHJlcyA9IHJlbmRlcihjZW50ZXIsIHJheURpcik7XG4gICAgICBnbF9GcmFnQ29sb3IgPSB2ZWM0KHJlcy5yZ2IsIDEuKTtcbiAgICB9YCxcbiAgYXR0cmlidXRlczoge1xuICAgIHBvc2l0aW9uOiBbLTQsIC00LCA0LCAtNCwgMCwgNF1cbiAgfSxcbiAgdW5pZm9ybXM6IHtcbiAgICBoZWlnaHQ6IHJlZ2wuY29udGV4dCgndmlld3BvcnRIZWlnaHQnKSxcbiAgICB3aWR0aDogcmVnbC5jb250ZXh0KCd2aWV3cG9ydFdpZHRoJyksXG4gICAgdGltZXN0ZXA6IHJlZ2wuY29udGV4dCgndGljaycpXG4gIH0sXG4gIGNvdW50OiAzXG59KVxuXG5yZWdsLmZyYW1lKCgpID0+IHtcbiAgY2FtZXJhKCgpID0+IHtcbiAgICByYXl0cmFjZSgpXG4gIH0pXG59KVxuIiwidmFyIG1vdXNlQ2hhbmdlID0gcmVxdWlyZSgnbW91c2UtY2hhbmdlJylcbnZhciBtb3VzZVdoZWVsID0gcmVxdWlyZSgnbW91c2Utd2hlZWwnKVxudmFyIGlkZW50aXR5ID0gcmVxdWlyZSgnZ2wtbWF0NC9pZGVudGl0eScpXG52YXIgcGVyc3BlY3RpdmUgPSByZXF1aXJlKCdnbC1tYXQ0L3BlcnNwZWN0aXZlJylcbnZhciBsb29rQXQgPSByZXF1aXJlKCdnbC1tYXQ0L2xvb2tBdCcpXG5cbm1vZHVsZS5leHBvcnRzID0gY3JlYXRlQ2FtZXJhXG5cbmZ1bmN0aW9uIGNyZWF0ZUNhbWVyYSAocmVnbCwgcHJvcHMpIHtcbiAgdmFyIGNhbWVyYVN0YXRlID0ge1xuICAgIHZpZXc6IGlkZW50aXR5KG5ldyBGbG9hdDMyQXJyYXkoMTYpKSxcbiAgICBwcm9qZWN0aW9uOiBpZGVudGl0eShuZXcgRmxvYXQzMkFycmF5KDE2KSksXG4gICAgY2VudGVyOiBuZXcgRmxvYXQzMkFycmF5KHByb3BzLmNlbnRlciB8fCAzKSxcbiAgICB0aGV0YTogcHJvcHMudGhldGEgfHwgMCxcbiAgICBwaGk6IHByb3BzLnBoaSB8fCAwLFxuICAgIGRpc3RhbmNlOiBNYXRoLmxvZyhwcm9wcy5kaXN0YW5jZSB8fCAxMC4wKSxcbiAgICBleWU6IG5ldyBGbG9hdDMyQXJyYXkoMyksXG4gICAgdXA6IG5ldyBGbG9hdDMyQXJyYXkocHJvcHMudXAgfHwgWzAsIDEsIDBdKVxuICB9XG5cbiAgdmFyIHJpZ2h0ID0gbmV3IEZsb2F0MzJBcnJheShbMSwgMCwgMF0pXG4gIHZhciBmcm9udCA9IG5ldyBGbG9hdDMyQXJyYXkoWzAsIDAsIDFdKVxuXG4gIHZhciBtaW5EaXN0YW5jZSA9IE1hdGgubG9nKCdtaW5EaXN0YW5jZScgaW4gcHJvcHMgPyBwcm9wcy5taW5EaXN0YW5jZSA6IDAuMSlcbiAgdmFyIG1heERpc3RhbmNlID0gTWF0aC5sb2coJ21heERpc3RhbmNlJyBpbiBwcm9wcyA/IHByb3BzLm1heERpc3RhbmNlIDogMTAwMClcblxuICB2YXIgZHRoZXRhID0gMFxuICB2YXIgZHBoaSA9IDBcbiAgdmFyIGRkaXN0YW5jZSA9IDBcblxuICB2YXIgcHJldlggPSAwXG4gIHZhciBwcmV2WSA9IDBcbiAgbW91c2VDaGFuZ2UoZnVuY3Rpb24gKGJ1dHRvbnMsIHgsIHkpIHtcbiAgICBpZiAoYnV0dG9ucyAmIDEpIHtcbiAgICAgIHZhciBkeCA9ICh4IC0gcHJldlgpIC8gd2luZG93LmlubmVyV2lkdGhcbiAgICAgIHZhciBkeSA9ICh5IC0gcHJldlkpIC8gd2luZG93LmlubmVySGVpZ2h0XG4gICAgICB2YXIgdyA9IE1hdGgubWF4KGNhbWVyYVN0YXRlLmRpc3RhbmNlLCAwLjUpXG5cbiAgICAgIGR0aGV0YSArPSB3ICogZHhcbiAgICAgIGRwaGkgKz0gdyAqIGR5XG4gICAgfVxuICAgIHByZXZYID0geFxuICAgIHByZXZZID0geVxuICB9KVxuXG4gIG1vdXNlV2hlZWwoZnVuY3Rpb24gKGR4LCBkeSkge1xuICAgIGRkaXN0YW5jZSArPSBkeSAvIHdpbmRvdy5pbm5lckhlaWdodFxuICB9KVxuXG4gIGZ1bmN0aW9uIGRhbXAgKHgpIHtcbiAgICB2YXIgeGQgPSB4ICogMC45XG4gICAgaWYgKHhkIDwgMC4xKSB7XG4gICAgICByZXR1cm4gMFxuICAgIH1cbiAgICByZXR1cm4geGRcbiAgfVxuXG4gIGZ1bmN0aW9uIGNsYW1wICh4LCBsbywgaGkpIHtcbiAgICByZXR1cm4gTWF0aC5taW4oTWF0aC5tYXgoeCwgbG8pLCBoaSlcbiAgfVxuXG4gIGZ1bmN0aW9uIHVwZGF0ZUNhbWVyYSAoKSB7XG4gICAgdmFyIGNlbnRlciA9IGNhbWVyYVN0YXRlLmNlbnRlclxuICAgIHZhciBleWUgPSBjYW1lcmFTdGF0ZS5leWVcbiAgICB2YXIgdXAgPSBjYW1lcmFTdGF0ZS51cFxuXG4gICAgY2FtZXJhU3RhdGUudGhldGEgKz0gZHRoZXRhXG4gICAgY2FtZXJhU3RhdGUucGhpID0gY2xhbXAoXG4gICAgICBjYW1lcmFTdGF0ZS5waGkgKyBkcGhpLFxuICAgICAgLU1hdGguUEkgLyAyLjAsXG4gICAgICBNYXRoLlBJIC8gMi4wKVxuICAgIGNhbWVyYVN0YXRlLmRpc3RhbmNlID0gY2xhbXAoXG4gICAgICBjYW1lcmFTdGF0ZS5kaXN0YW5jZSArIGRkaXN0YW5jZSxcbiAgICAgIG1pbkRpc3RhbmNlLFxuICAgICAgbWF4RGlzdGFuY2UpXG5cbiAgICBkdGhldGEgPSBkYW1wKGR0aGV0YSlcbiAgICBkcGhpID0gZGFtcChkcGhpKVxuICAgIGRkaXN0YW5jZSA9IGRhbXAoZGRpc3RhbmNlKVxuXG4gICAgdmFyIHRoZXRhID0gY2FtZXJhU3RhdGUudGhldGFcbiAgICB2YXIgcGhpID0gY2FtZXJhU3RhdGUucGhpXG4gICAgdmFyIHIgPSBNYXRoLmV4cChjYW1lcmFTdGF0ZS5kaXN0YW5jZSlcblxuICAgIHZhciB2ZiA9IHIgKiBNYXRoLnNpbih0aGV0YSkgKiBNYXRoLmNvcyhwaGkpXG4gICAgdmFyIHZyID0gciAqIE1hdGguY29zKHRoZXRhKSAqIE1hdGguY29zKHBoaSlcbiAgICB2YXIgdnUgPSByICogTWF0aC5zaW4ocGhpKVxuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCAzOyArK2kpIHtcbiAgICAgIGV5ZVtpXSA9IGNlbnRlcltpXSArIHZmICogZnJvbnRbaV0gKyB2ciAqIHJpZ2h0W2ldICsgdnUgKiB1cFtpXVxuICAgIH1cblxuICAgIGxvb2tBdChjYW1lcmFTdGF0ZS52aWV3LCBleWUsIGNlbnRlciwgdXApXG4gIH1cblxuICB2YXIgaW5qZWN0Q29udGV4dCA9IHJlZ2woe1xuICAgIGNvbnRleHQ6IE9iamVjdC5hc3NpZ24oe30sIGNhbWVyYVN0YXRlLCB7XG4gICAgICBwcm9qZWN0aW9uOiBmdW5jdGlvbiAoe3ZpZXdwb3J0V2lkdGgsIHZpZXdwb3J0SGVpZ2h0fSkge1xuICAgICAgICByZXR1cm4gcGVyc3BlY3RpdmUoY2FtZXJhU3RhdGUucHJvamVjdGlvbixcbiAgICAgICAgICBNYXRoLlBJIC8gNC4wLFxuICAgICAgICAgIHZpZXdwb3J0V2lkdGggLyB2aWV3cG9ydEhlaWdodCxcbiAgICAgICAgICAwLjAxLFxuICAgICAgICAgIDEwMDAuMClcbiAgICAgIH1cbiAgICB9KSxcbiAgICB1bmlmb3JtczogT2JqZWN0LmtleXMoY2FtZXJhU3RhdGUpLnJlZHVjZShmdW5jdGlvbiAodW5pZm9ybXMsIG5hbWUpIHtcbiAgICAgIHVuaWZvcm1zW25hbWVdID0gcmVnbC5jb250ZXh0KG5hbWUpXG4gICAgICByZXR1cm4gdW5pZm9ybXNcbiAgICB9LCB7fSlcbiAgfSlcblxuICBmdW5jdGlvbiBzZXR1cENhbWVyYSAoYmxvY2spIHtcbiAgICB1cGRhdGVDYW1lcmEoKVxuICAgIGluamVjdENvbnRleHQoYmxvY2spXG4gIH1cblxuICBPYmplY3Qua2V5cyhjYW1lcmFTdGF0ZSkuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgIHNldHVwQ2FtZXJhW25hbWVdID0gY2FtZXJhU3RhdGVbbmFtZV1cbiAgfSlcblxuICByZXR1cm4gc2V0dXBDYW1lcmFcbn1cbiIsInZhciBHTF9GTE9BVCA9IDUxMjZcblxuZnVuY3Rpb24gQXR0cmlidXRlUmVjb3JkICgpIHtcbiAgdGhpcy5zdGF0ZSA9IDBcblxuICB0aGlzLnggPSAwLjBcbiAgdGhpcy55ID0gMC4wXG4gIHRoaXMueiA9IDAuMFxuICB0aGlzLncgPSAwLjBcblxuICB0aGlzLmJ1ZmZlciA9IG51bGxcbiAgdGhpcy5zaXplID0gMFxuICB0aGlzLm5vcm1hbGl6ZWQgPSBmYWxzZVxuICB0aGlzLnR5cGUgPSBHTF9GTE9BVFxuICB0aGlzLm9mZnNldCA9IDBcbiAgdGhpcy5zdHJpZGUgPSAwXG4gIHRoaXMuZGl2aXNvciA9IDBcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwQXR0cmlidXRlU3RhdGUgKFxuICBnbCxcbiAgZXh0ZW5zaW9ucyxcbiAgbGltaXRzLFxuICBidWZmZXJTdGF0ZSxcbiAgc3RyaW5nU3RvcmUpIHtcbiAgdmFyIE5VTV9BVFRSSUJVVEVTID0gbGltaXRzLm1heEF0dHJpYnV0ZXNcbiAgdmFyIGF0dHJpYnV0ZUJpbmRpbmdzID0gbmV3IEFycmF5KE5VTV9BVFRSSUJVVEVTKVxuICBmb3IgKHZhciBpID0gMDsgaSA8IE5VTV9BVFRSSUJVVEVTOyArK2kpIHtcbiAgICBhdHRyaWJ1dGVCaW5kaW5nc1tpXSA9IG5ldyBBdHRyaWJ1dGVSZWNvcmQoKVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBSZWNvcmQ6IEF0dHJpYnV0ZVJlY29yZCxcbiAgICBzY29wZToge30sXG4gICAgc3RhdGU6IGF0dHJpYnV0ZUJpbmRpbmdzXG4gIH1cbn1cbiIsIlxudmFyIGlzVHlwZWRBcnJheSA9IHJlcXVpcmUoJy4vdXRpbC9pcy10eXBlZC1hcnJheScpXG52YXIgaXNOREFycmF5TGlrZSA9IHJlcXVpcmUoJy4vdXRpbC9pcy1uZGFycmF5JylcbnZhciB2YWx1ZXMgPSByZXF1aXJlKCcuL3V0aWwvdmFsdWVzJylcbnZhciBwb29sID0gcmVxdWlyZSgnLi91dGlsL3Bvb2wnKVxudmFyIGZsYXR0ZW5VdGlsID0gcmVxdWlyZSgnLi91dGlsL2ZsYXR0ZW4nKVxuXG52YXIgYXJyYXlGbGF0dGVuID0gZmxhdHRlblV0aWwuZmxhdHRlblxudmFyIGFycmF5U2hhcGUgPSBmbGF0dGVuVXRpbC5zaGFwZVxuXG52YXIgYXJyYXlUeXBlcyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL2FycmF5dHlwZXMuanNvbicpXG52YXIgYnVmZmVyVHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy9kdHlwZXMuanNvbicpXG52YXIgdXNhZ2VUeXBlcyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL3VzYWdlLmpzb24nKVxuXG52YXIgR0xfU1RBVElDX0RSQVcgPSAweDg4RTRcbnZhciBHTF9TVFJFQU1fRFJBVyA9IDB4ODhFMFxuXG52YXIgR0xfVU5TSUdORURfQllURSA9IDUxMjFcbnZhciBHTF9GTE9BVCA9IDUxMjZcblxudmFyIERUWVBFU19TSVpFUyA9IFtdXG5EVFlQRVNfU0laRVNbNTEyMF0gPSAxIC8vIGludDhcbkRUWVBFU19TSVpFU1s1MTIyXSA9IDIgLy8gaW50MTZcbkRUWVBFU19TSVpFU1s1MTI0XSA9IDQgLy8gaW50MzJcbkRUWVBFU19TSVpFU1s1MTIxXSA9IDEgLy8gdWludDhcbkRUWVBFU19TSVpFU1s1MTIzXSA9IDIgLy8gdWludDE2XG5EVFlQRVNfU0laRVNbNTEyNV0gPSA0IC8vIHVpbnQzMlxuRFRZUEVTX1NJWkVTWzUxMjZdID0gNCAvLyBmbG9hdDMyXG5cbmZ1bmN0aW9uIHR5cGVkQXJyYXlDb2RlIChkYXRhKSB7XG4gIHJldHVybiBhcnJheVR5cGVzW09iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChkYXRhKV0gfCAwXG59XG5cbmZ1bmN0aW9uIGNvcHlBcnJheSAob3V0LCBpbnApIHtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBpbnAubGVuZ3RoOyArK2kpIHtcbiAgICBvdXRbaV0gPSBpbnBbaV1cbiAgfVxufVxuXG5mdW5jdGlvbiB0cmFuc3Bvc2UgKFxuICByZXN1bHQsIGRhdGEsIHNoYXBlWCwgc2hhcGVZLCBzdHJpZGVYLCBzdHJpZGVZLCBvZmZzZXQpIHtcbiAgdmFyIHB0ciA9IDBcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzaGFwZVg7ICsraSkge1xuICAgIGZvciAodmFyIGogPSAwOyBqIDwgc2hhcGVZOyArK2opIHtcbiAgICAgIHJlc3VsdFtwdHIrK10gPSBkYXRhW3N0cmlkZVggKiBpICsgc3RyaWRlWSAqIGogKyBvZmZzZXRdXG4gICAgfVxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gd3JhcEJ1ZmZlclN0YXRlIChnbCwgc3RhdHMsIGNvbmZpZykge1xuICB2YXIgYnVmZmVyQ291bnQgPSAwXG4gIHZhciBidWZmZXJTZXQgPSB7fVxuXG4gIGZ1bmN0aW9uIFJFR0xCdWZmZXIgKHR5cGUpIHtcbiAgICB0aGlzLmlkID0gYnVmZmVyQ291bnQrK1xuICAgIHRoaXMuYnVmZmVyID0gZ2wuY3JlYXRlQnVmZmVyKClcbiAgICB0aGlzLnR5cGUgPSB0eXBlXG4gICAgdGhpcy51c2FnZSA9IEdMX1NUQVRJQ19EUkFXXG4gICAgdGhpcy5ieXRlTGVuZ3RoID0gMFxuICAgIHRoaXMuZGltZW5zaW9uID0gMVxuICAgIHRoaXMuZHR5cGUgPSBHTF9VTlNJR05FRF9CWVRFXG5cbiAgICB0aGlzLnBlcnNpc3RlbnREYXRhID0gbnVsbFxuXG4gICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgICB0aGlzLnN0YXRzID0ge3NpemU6IDB9XG4gICAgfVxuICB9XG5cbiAgUkVHTEJ1ZmZlci5wcm90b3R5cGUuYmluZCA9IGZ1bmN0aW9uICgpIHtcbiAgICBnbC5iaW5kQnVmZmVyKHRoaXMudHlwZSwgdGhpcy5idWZmZXIpXG4gIH1cblxuICBSRUdMQnVmZmVyLnByb3RvdHlwZS5kZXN0cm95ID0gZnVuY3Rpb24gKCkge1xuICAgIGRlc3Ryb3kodGhpcylcbiAgfVxuXG4gIHZhciBzdHJlYW1Qb29sID0gW11cblxuICBmdW5jdGlvbiBjcmVhdGVTdHJlYW0gKHR5cGUsIGRhdGEpIHtcbiAgICB2YXIgYnVmZmVyID0gc3RyZWFtUG9vbC5wb3AoKVxuICAgIGlmICghYnVmZmVyKSB7XG4gICAgICBidWZmZXIgPSBuZXcgUkVHTEJ1ZmZlcih0eXBlKVxuICAgIH1cbiAgICBidWZmZXIuYmluZCgpXG4gICAgaW5pdEJ1ZmZlckZyb21EYXRhKGJ1ZmZlciwgZGF0YSwgR0xfU1RSRUFNX0RSQVcsIDAsIDEsIGZhbHNlKVxuICAgIHJldHVybiBidWZmZXJcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlc3Ryb3lTdHJlYW0gKHN0cmVhbSkge1xuICAgIHN0cmVhbVBvb2wucHVzaChzdHJlYW0pXG4gIH1cblxuICBmdW5jdGlvbiBpbml0QnVmZmVyRnJvbVR5cGVkQXJyYXkgKGJ1ZmZlciwgZGF0YSwgdXNhZ2UpIHtcbiAgICBidWZmZXIuYnl0ZUxlbmd0aCA9IGRhdGEuYnl0ZUxlbmd0aFxuICAgIGdsLmJ1ZmZlckRhdGEoYnVmZmVyLnR5cGUsIGRhdGEsIHVzYWdlKVxuICB9XG5cbiAgZnVuY3Rpb24gaW5pdEJ1ZmZlckZyb21EYXRhIChidWZmZXIsIGRhdGEsIHVzYWdlLCBkdHlwZSwgZGltZW5zaW9uLCBwZXJzaXN0KSB7XG4gICAgdmFyIHNoYXBlXG4gICAgYnVmZmVyLnVzYWdlID0gdXNhZ2VcbiAgICBpZiAoQXJyYXkuaXNBcnJheShkYXRhKSkge1xuICAgICAgYnVmZmVyLmR0eXBlID0gZHR5cGUgfHwgR0xfRkxPQVRcbiAgICAgIGlmIChkYXRhLmxlbmd0aCA+IDApIHtcbiAgICAgICAgdmFyIGZsYXREYXRhXG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KGRhdGFbMF0pKSB7XG4gICAgICAgICAgc2hhcGUgPSBhcnJheVNoYXBlKGRhdGEpXG4gICAgICAgICAgdmFyIGRpbSA9IDFcbiAgICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IHNoYXBlLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgICBkaW0gKj0gc2hhcGVbaV1cbiAgICAgICAgICB9XG4gICAgICAgICAgYnVmZmVyLmRpbWVuc2lvbiA9IGRpbVxuICAgICAgICAgIGZsYXREYXRhID0gYXJyYXlGbGF0dGVuKGRhdGEsIHNoYXBlLCBidWZmZXIuZHR5cGUpXG4gICAgICAgICAgaW5pdEJ1ZmZlckZyb21UeXBlZEFycmF5KGJ1ZmZlciwgZmxhdERhdGEsIHVzYWdlKVxuICAgICAgICAgIGlmIChwZXJzaXN0KSB7XG4gICAgICAgICAgICBidWZmZXIucGVyc2lzdGVudERhdGEgPSBmbGF0RGF0YVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwb29sLmZyZWVUeXBlKGZsYXREYXRhKVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZGF0YVswXSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICBidWZmZXIuZGltZW5zaW9uID0gZGltZW5zaW9uXG4gICAgICAgICAgdmFyIHR5cGVkRGF0YSA9IHBvb2wuYWxsb2NUeXBlKGJ1ZmZlci5kdHlwZSwgZGF0YS5sZW5ndGgpXG4gICAgICAgICAgY29weUFycmF5KHR5cGVkRGF0YSwgZGF0YSlcbiAgICAgICAgICBpbml0QnVmZmVyRnJvbVR5cGVkQXJyYXkoYnVmZmVyLCB0eXBlZERhdGEsIHVzYWdlKVxuICAgICAgICAgIGlmIChwZXJzaXN0KSB7XG4gICAgICAgICAgICBidWZmZXIucGVyc2lzdGVudERhdGEgPSB0eXBlZERhdGFcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcG9vbC5mcmVlVHlwZSh0eXBlZERhdGEpXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKGlzVHlwZWRBcnJheShkYXRhWzBdKSkge1xuICAgICAgICAgIGJ1ZmZlci5kaW1lbnNpb24gPSBkYXRhWzBdLmxlbmd0aFxuICAgICAgICAgIGJ1ZmZlci5kdHlwZSA9IGR0eXBlIHx8IHR5cGVkQXJyYXlDb2RlKGRhdGFbMF0pIHx8IEdMX0ZMT0FUXG4gICAgICAgICAgZmxhdERhdGEgPSBhcnJheUZsYXR0ZW4oXG4gICAgICAgICAgICBkYXRhLFxuICAgICAgICAgICAgW2RhdGEubGVuZ3RoLCBkYXRhWzBdLmxlbmd0aF0sXG4gICAgICAgICAgICBidWZmZXIuZHR5cGUpXG4gICAgICAgICAgaW5pdEJ1ZmZlckZyb21UeXBlZEFycmF5KGJ1ZmZlciwgZmxhdERhdGEsIHVzYWdlKVxuICAgICAgICAgIGlmIChwZXJzaXN0KSB7XG4gICAgICAgICAgICBidWZmZXIucGVyc2lzdGVudERhdGEgPSBmbGF0RGF0YVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwb29sLmZyZWVUeXBlKGZsYXREYXRhKVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoaXNUeXBlZEFycmF5KGRhdGEpKSB7XG4gICAgICBidWZmZXIuZHR5cGUgPSBkdHlwZSB8fCB0eXBlZEFycmF5Q29kZShkYXRhKVxuICAgICAgYnVmZmVyLmRpbWVuc2lvbiA9IGRpbWVuc2lvblxuICAgICAgaW5pdEJ1ZmZlckZyb21UeXBlZEFycmF5KGJ1ZmZlciwgZGF0YSwgdXNhZ2UpXG4gICAgICBpZiAocGVyc2lzdCkge1xuICAgICAgICBidWZmZXIucGVyc2lzdGVudERhdGEgPSBuZXcgVWludDhBcnJheShuZXcgVWludDhBcnJheShkYXRhLmJ1ZmZlcikpXG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChpc05EQXJyYXlMaWtlKGRhdGEpKSB7XG4gICAgICBzaGFwZSA9IGRhdGEuc2hhcGVcbiAgICAgIHZhciBzdHJpZGUgPSBkYXRhLnN0cmlkZVxuICAgICAgdmFyIG9mZnNldCA9IGRhdGEub2Zmc2V0XG5cbiAgICAgIHZhciBzaGFwZVggPSAwXG4gICAgICB2YXIgc2hhcGVZID0gMFxuICAgICAgdmFyIHN0cmlkZVggPSAwXG4gICAgICB2YXIgc3RyaWRlWSA9IDBcbiAgICAgIGlmIChzaGFwZS5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgc2hhcGVYID0gc2hhcGVbMF1cbiAgICAgICAgc2hhcGVZID0gMVxuICAgICAgICBzdHJpZGVYID0gc3RyaWRlWzBdXG4gICAgICAgIHN0cmlkZVkgPSAwXG4gICAgICB9IGVsc2UgaWYgKHNoYXBlLmxlbmd0aCA9PT0gMikge1xuICAgICAgICBzaGFwZVggPSBzaGFwZVswXVxuICAgICAgICBzaGFwZVkgPSBzaGFwZVsxXVxuICAgICAgICBzdHJpZGVYID0gc3RyaWRlWzBdXG4gICAgICAgIHN0cmlkZVkgPSBzdHJpZGVbMV1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIFxuICAgICAgfVxuXG4gICAgICBidWZmZXIuZHR5cGUgPSBkdHlwZSB8fCB0eXBlZEFycmF5Q29kZShkYXRhLmRhdGEpIHx8IEdMX0ZMT0FUXG4gICAgICBidWZmZXIuZGltZW5zaW9uID0gc2hhcGVZXG5cbiAgICAgIHZhciB0cmFuc3Bvc2VEYXRhID0gcG9vbC5hbGxvY1R5cGUoYnVmZmVyLmR0eXBlLCBzaGFwZVggKiBzaGFwZVkpXG4gICAgICB0cmFuc3Bvc2UodHJhbnNwb3NlRGF0YSxcbiAgICAgICAgZGF0YS5kYXRhLFxuICAgICAgICBzaGFwZVgsIHNoYXBlWSxcbiAgICAgICAgc3RyaWRlWCwgc3RyaWRlWSxcbiAgICAgICAgb2Zmc2V0KVxuICAgICAgaW5pdEJ1ZmZlckZyb21UeXBlZEFycmF5KGJ1ZmZlciwgdHJhbnNwb3NlRGF0YSwgdXNhZ2UpXG4gICAgICBpZiAocGVyc2lzdCkge1xuICAgICAgICBidWZmZXIucGVyc2lzdGVudERhdGEgPSB0cmFuc3Bvc2VEYXRhXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwb29sLmZyZWVUeXBlKHRyYW5zcG9zZURhdGEpXG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIFxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGRlc3Ryb3kgKGJ1ZmZlcikge1xuICAgIHN0YXRzLmJ1ZmZlckNvdW50LS1cblxuICAgIHZhciBoYW5kbGUgPSBidWZmZXIuYnVmZmVyXG4gICAgXG4gICAgZ2wuZGVsZXRlQnVmZmVyKGhhbmRsZSlcbiAgICBidWZmZXIuYnVmZmVyID0gbnVsbFxuICAgIGRlbGV0ZSBidWZmZXJTZXRbYnVmZmVyLmlkXVxuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlQnVmZmVyIChvcHRpb25zLCB0eXBlLCBkZWZlckluaXQsIHBlcnNpc3RlbnQpIHtcbiAgICBzdGF0cy5idWZmZXJDb3VudCsrXG5cbiAgICB2YXIgYnVmZmVyID0gbmV3IFJFR0xCdWZmZXIodHlwZSlcbiAgICBidWZmZXJTZXRbYnVmZmVyLmlkXSA9IGJ1ZmZlclxuXG4gICAgZnVuY3Rpb24gcmVnbEJ1ZmZlciAob3B0aW9ucykge1xuICAgICAgdmFyIHVzYWdlID0gR0xfU1RBVElDX0RSQVdcbiAgICAgIHZhciBkYXRhID0gbnVsbFxuICAgICAgdmFyIGJ5dGVMZW5ndGggPSAwXG4gICAgICB2YXIgZHR5cGUgPSAwXG4gICAgICB2YXIgZGltZW5zaW9uID0gMVxuICAgICAgaWYgKEFycmF5LmlzQXJyYXkob3B0aW9ucykgfHxcbiAgICAgICAgICBpc1R5cGVkQXJyYXkob3B0aW9ucykgfHxcbiAgICAgICAgICBpc05EQXJyYXlMaWtlKG9wdGlvbnMpKSB7XG4gICAgICAgIGRhdGEgPSBvcHRpb25zXG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBvcHRpb25zID09PSAnbnVtYmVyJykge1xuICAgICAgICBieXRlTGVuZ3RoID0gb3B0aW9ucyB8IDBcbiAgICAgIH0gZWxzZSBpZiAob3B0aW9ucykge1xuICAgICAgICBcblxuICAgICAgICBpZiAoJ2RhdGEnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBcbiAgICAgICAgICBkYXRhID0gb3B0aW9ucy5kYXRhXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ3VzYWdlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgXG4gICAgICAgICAgdXNhZ2UgPSB1c2FnZVR5cGVzW29wdGlvbnMudXNhZ2VdXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ3R5cGUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBcbiAgICAgICAgICBkdHlwZSA9IGJ1ZmZlclR5cGVzW29wdGlvbnMudHlwZV1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgnZGltZW5zaW9uJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgXG4gICAgICAgICAgZGltZW5zaW9uID0gb3B0aW9ucy5kaW1lbnNpb24gfCAwXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ2xlbmd0aCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIFxuICAgICAgICAgIGJ5dGVMZW5ndGggPSBvcHRpb25zLmxlbmd0aCB8IDBcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBidWZmZXIuYmluZCgpXG4gICAgICBpZiAoIWRhdGEpIHtcbiAgICAgICAgZ2wuYnVmZmVyRGF0YShidWZmZXIudHlwZSwgYnl0ZUxlbmd0aCwgdXNhZ2UpXG4gICAgICAgIGJ1ZmZlci5kdHlwZSA9IGR0eXBlIHx8IEdMX1VOU0lHTkVEX0JZVEVcbiAgICAgICAgYnVmZmVyLnVzYWdlID0gdXNhZ2VcbiAgICAgICAgYnVmZmVyLmRpbWVuc2lvbiA9IGRpbWVuc2lvblxuICAgICAgICBidWZmZXIuYnl0ZUxlbmd0aCA9IGJ5dGVMZW5ndGhcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGluaXRCdWZmZXJGcm9tRGF0YShidWZmZXIsIGRhdGEsIHVzYWdlLCBkdHlwZSwgZGltZW5zaW9uLCBwZXJzaXN0ZW50KVxuICAgICAgfVxuXG4gICAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgICAgYnVmZmVyLnN0YXRzLnNpemUgPSBidWZmZXIuYnl0ZUxlbmd0aCAqIERUWVBFU19TSVpFU1tidWZmZXIuZHR5cGVdXG4gICAgICB9XG5cbiAgICAgIHJldHVybiByZWdsQnVmZmVyXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc2V0U3ViRGF0YSAoZGF0YSwgb2Zmc2V0KSB7XG4gICAgICBcblxuICAgICAgZ2wuYnVmZmVyU3ViRGF0YShidWZmZXIudHlwZSwgb2Zmc2V0LCBkYXRhKVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHN1YmRhdGEgKGRhdGEsIG9mZnNldF8pIHtcbiAgICAgIHZhciBvZmZzZXQgPSAob2Zmc2V0XyB8fCAwKSB8IDBcbiAgICAgIHZhciBzaGFwZVxuICAgICAgYnVmZmVyLmJpbmQoKVxuICAgICAgaWYgKEFycmF5LmlzQXJyYXkoZGF0YSkpIHtcbiAgICAgICAgaWYgKGRhdGEubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGlmICh0eXBlb2YgZGF0YVswXSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgIHZhciBjb252ZXJ0ZWQgPSBwb29sLmFsbG9jVHlwZShidWZmZXIuZHR5cGUsIGRhdGEubGVuZ3RoKVxuICAgICAgICAgICAgY29weUFycmF5KGNvbnZlcnRlZCwgZGF0YSlcbiAgICAgICAgICAgIHNldFN1YkRhdGEoY29udmVydGVkLCBvZmZzZXQpXG4gICAgICAgICAgICBwb29sLmZyZWVUeXBlKGNvbnZlcnRlZClcbiAgICAgICAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoZGF0YVswXSkgfHwgaXNUeXBlZEFycmF5KGRhdGFbMF0pKSB7XG4gICAgICAgICAgICBzaGFwZSA9IGFycmF5U2hhcGUoZGF0YSlcbiAgICAgICAgICAgIHZhciBmbGF0RGF0YSA9IGFycmF5RmxhdHRlbihkYXRhLCBzaGFwZSwgYnVmZmVyLmR0eXBlKVxuICAgICAgICAgICAgc2V0U3ViRGF0YShmbGF0RGF0YSwgb2Zmc2V0KVxuICAgICAgICAgICAgcG9vbC5mcmVlVHlwZShmbGF0RGF0YSlcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGlzVHlwZWRBcnJheShkYXRhKSkge1xuICAgICAgICBzZXRTdWJEYXRhKGRhdGEsIG9mZnNldClcbiAgICAgIH0gZWxzZSBpZiAoaXNOREFycmF5TGlrZShkYXRhKSkge1xuICAgICAgICBzaGFwZSA9IGRhdGEuc2hhcGVcbiAgICAgICAgdmFyIHN0cmlkZSA9IGRhdGEuc3RyaWRlXG5cbiAgICAgICAgdmFyIHNoYXBlWCA9IDBcbiAgICAgICAgdmFyIHNoYXBlWSA9IDBcbiAgICAgICAgdmFyIHN0cmlkZVggPSAwXG4gICAgICAgIHZhciBzdHJpZGVZID0gMFxuICAgICAgICBpZiAoc2hhcGUubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgc2hhcGVYID0gc2hhcGVbMF1cbiAgICAgICAgICBzaGFwZVkgPSAxXG4gICAgICAgICAgc3RyaWRlWCA9IHN0cmlkZVswXVxuICAgICAgICAgIHN0cmlkZVkgPSAwXG4gICAgICAgIH0gZWxzZSBpZiAoc2hhcGUubGVuZ3RoID09PSAyKSB7XG4gICAgICAgICAgc2hhcGVYID0gc2hhcGVbMF1cbiAgICAgICAgICBzaGFwZVkgPSBzaGFwZVsxXVxuICAgICAgICAgIHN0cmlkZVggPSBzdHJpZGVbMF1cbiAgICAgICAgICBzdHJpZGVZID0gc3RyaWRlWzFdXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgXG4gICAgICAgIH1cbiAgICAgICAgdmFyIGR0eXBlID0gQXJyYXkuaXNBcnJheShkYXRhLmRhdGEpXG4gICAgICAgICAgPyBidWZmZXIuZHR5cGVcbiAgICAgICAgICA6IHR5cGVkQXJyYXlDb2RlKGRhdGEuZGF0YSlcblxuICAgICAgICB2YXIgdHJhbnNwb3NlRGF0YSA9IHBvb2wuYWxsb2NUeXBlKGR0eXBlLCBzaGFwZVggKiBzaGFwZVkpXG4gICAgICAgIHRyYW5zcG9zZSh0cmFuc3Bvc2VEYXRhLFxuICAgICAgICAgIGRhdGEuZGF0YSxcbiAgICAgICAgICBzaGFwZVgsIHNoYXBlWSxcbiAgICAgICAgICBzdHJpZGVYLCBzdHJpZGVZLFxuICAgICAgICAgIGRhdGEub2Zmc2V0KVxuICAgICAgICBzZXRTdWJEYXRhKHRyYW5zcG9zZURhdGEsIG9mZnNldClcbiAgICAgICAgcG9vbC5mcmVlVHlwZSh0cmFuc3Bvc2VEYXRhKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgXG4gICAgICB9XG4gICAgICByZXR1cm4gcmVnbEJ1ZmZlclxuICAgIH1cblxuICAgIGlmICghZGVmZXJJbml0KSB7XG4gICAgICByZWdsQnVmZmVyKG9wdGlvbnMpXG4gICAgfVxuXG4gICAgcmVnbEJ1ZmZlci5fcmVnbFR5cGUgPSAnYnVmZmVyJ1xuICAgIHJlZ2xCdWZmZXIuX2J1ZmZlciA9IGJ1ZmZlclxuICAgIHJlZ2xCdWZmZXIuc3ViZGF0YSA9IHN1YmRhdGFcbiAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgIHJlZ2xCdWZmZXIuc3RhdHMgPSBidWZmZXIuc3RhdHNcbiAgICB9XG4gICAgcmVnbEJ1ZmZlci5kZXN0cm95ID0gZnVuY3Rpb24gKCkgeyBkZXN0cm95KGJ1ZmZlcikgfVxuXG4gICAgcmV0dXJuIHJlZ2xCdWZmZXJcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlc3RvcmVCdWZmZXJzICgpIHtcbiAgICB2YWx1ZXMoYnVmZmVyU2V0KS5mb3JFYWNoKGZ1bmN0aW9uIChidWZmZXIpIHtcbiAgICAgIGJ1ZmZlci5idWZmZXIgPSBnbC5jcmVhdGVCdWZmZXIoKVxuICAgICAgZ2wuYmluZEJ1ZmZlcihidWZmZXIudHlwZSwgYnVmZmVyLmJ1ZmZlcilcbiAgICAgIGdsLmJ1ZmZlckRhdGEoXG4gICAgICAgIGJ1ZmZlci50eXBlLCBidWZmZXIucGVyc2lzdGVudERhdGEgfHwgYnVmZmVyLmJ5dGVMZW5ndGgsIGJ1ZmZlci51c2FnZSlcbiAgICB9KVxuICB9XG5cbiAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgc3RhdHMuZ2V0VG90YWxCdWZmZXJTaXplID0gZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIHRvdGFsID0gMFxuICAgICAgLy8gVE9ETzogUmlnaHQgbm93LCB0aGUgc3RyZWFtcyBhcmUgbm90IHBhcnQgb2YgdGhlIHRvdGFsIGNvdW50LlxuICAgICAgT2JqZWN0LmtleXMoYnVmZmVyU2V0KS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgdG90YWwgKz0gYnVmZmVyU2V0W2tleV0uc3RhdHMuc2l6ZVxuICAgICAgfSlcbiAgICAgIHJldHVybiB0b3RhbFxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY3JlYXRlOiBjcmVhdGVCdWZmZXIsXG5cbiAgICBjcmVhdGVTdHJlYW06IGNyZWF0ZVN0cmVhbSxcbiAgICBkZXN0cm95U3RyZWFtOiBkZXN0cm95U3RyZWFtLFxuXG4gICAgY2xlYXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhbHVlcyhidWZmZXJTZXQpLmZvckVhY2goZGVzdHJveSlcbiAgICAgIHN0cmVhbVBvb2wuZm9yRWFjaChkZXN0cm95KVxuICAgIH0sXG5cbiAgICBnZXRCdWZmZXI6IGZ1bmN0aW9uICh3cmFwcGVyKSB7XG4gICAgICBpZiAod3JhcHBlciAmJiB3cmFwcGVyLl9idWZmZXIgaW5zdGFuY2VvZiBSRUdMQnVmZmVyKSB7XG4gICAgICAgIHJldHVybiB3cmFwcGVyLl9idWZmZXJcbiAgICAgIH1cbiAgICAgIHJldHVybiBudWxsXG4gICAgfSxcblxuICAgIHJlc3RvcmU6IHJlc3RvcmVCdWZmZXJzLFxuXG4gICAgX2luaXRCdWZmZXI6IGluaXRCdWZmZXJGcm9tRGF0YVxuICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cz17XG4gIFwiW29iamVjdCBJbnQ4QXJyYXldXCI6IDUxMjBcbiwgXCJbb2JqZWN0IEludDE2QXJyYXldXCI6IDUxMjJcbiwgXCJbb2JqZWN0IEludDMyQXJyYXldXCI6IDUxMjRcbiwgXCJbb2JqZWN0IFVpbnQ4QXJyYXldXCI6IDUxMjFcbiwgXCJbb2JqZWN0IFVpbnQ4Q2xhbXBlZEFycmF5XVwiOiA1MTIxXG4sIFwiW29iamVjdCBVaW50MTZBcnJheV1cIjogNTEyM1xuLCBcIltvYmplY3QgVWludDMyQXJyYXldXCI6IDUxMjVcbiwgXCJbb2JqZWN0IEZsb2F0MzJBcnJheV1cIjogNTEyNlxuLCBcIltvYmplY3QgRmxvYXQ2NEFycmF5XVwiOiA1MTIxXG4sIFwiW29iamVjdCBBcnJheUJ1ZmZlcl1cIjogNTEyMVxufVxuIiwibW9kdWxlLmV4cG9ydHM9e1xuICBcImludDhcIjogNTEyMFxuLCBcImludDE2XCI6IDUxMjJcbiwgXCJpbnQzMlwiOiA1MTI0XG4sIFwidWludDhcIjogNTEyMVxuLCBcInVpbnQxNlwiOiA1MTIzXG4sIFwidWludDMyXCI6IDUxMjVcbiwgXCJmbG9hdFwiOiA1MTI2XG4sIFwiZmxvYXQzMlwiOiA1MTI2XG59XG4iLCJtb2R1bGUuZXhwb3J0cz17XG4gIFwicG9pbnRzXCI6IDAsXG4gIFwicG9pbnRcIjogMCxcbiAgXCJsaW5lc1wiOiAxLFxuICBcImxpbmVcIjogMSxcbiAgXCJsaW5lIGxvb3BcIjogMixcbiAgXCJsaW5lIHN0cmlwXCI6IDMsXG4gIFwidHJpYW5nbGVzXCI6IDQsXG4gIFwidHJpYW5nbGVcIjogNCxcbiAgXCJ0cmlhbmdsZSBzdHJpcFwiOiA1LFxuICBcInRyaWFuZ2xlIGZhblwiOiA2XG59XG4iLCJtb2R1bGUuZXhwb3J0cz17XG4gIFwic3RhdGljXCI6IDM1MDQ0LFxuICBcImR5bmFtaWNcIjogMzUwNDgsXG4gIFwic3RyZWFtXCI6IDM1MDQwXG59XG4iLCJcbnZhciBjcmVhdGVFbnZpcm9ubWVudCA9IHJlcXVpcmUoJy4vdXRpbC9jb2RlZ2VuJylcbnZhciBsb29wID0gcmVxdWlyZSgnLi91dGlsL2xvb3AnKVxudmFyIGlzVHlwZWRBcnJheSA9IHJlcXVpcmUoJy4vdXRpbC9pcy10eXBlZC1hcnJheScpXG52YXIgaXNOREFycmF5ID0gcmVxdWlyZSgnLi91dGlsL2lzLW5kYXJyYXknKVxudmFyIGlzQXJyYXlMaWtlID0gcmVxdWlyZSgnLi91dGlsL2lzLWFycmF5LWxpa2UnKVxudmFyIGR5bmFtaWMgPSByZXF1aXJlKCcuL2R5bmFtaWMnKVxuXG52YXIgcHJpbVR5cGVzID0gcmVxdWlyZSgnLi9jb25zdGFudHMvcHJpbWl0aXZlcy5qc29uJylcbnZhciBnbFR5cGVzID0gcmVxdWlyZSgnLi9jb25zdGFudHMvZHR5cGVzLmpzb24nKVxuXG4vLyBcImN1dGVcIiBuYW1lcyBmb3IgdmVjdG9yIGNvbXBvbmVudHNcbnZhciBDVVRFX0NPTVBPTkVOVFMgPSAneHl6dycuc3BsaXQoJycpXG5cbnZhciBHTF9VTlNJR05FRF9CWVRFID0gNTEyMVxuXG52YXIgQVRUUklCX1NUQVRFX1BPSU5URVIgPSAxXG52YXIgQVRUUklCX1NUQVRFX0NPTlNUQU5UID0gMlxuXG52YXIgRFlOX0ZVTkMgPSAwXG52YXIgRFlOX1BST1AgPSAxXG52YXIgRFlOX0NPTlRFWFQgPSAyXG52YXIgRFlOX1NUQVRFID0gM1xudmFyIERZTl9USFVOSyA9IDRcblxudmFyIFNfRElUSEVSID0gJ2RpdGhlcidcbnZhciBTX0JMRU5EX0VOQUJMRSA9ICdibGVuZC5lbmFibGUnXG52YXIgU19CTEVORF9DT0xPUiA9ICdibGVuZC5jb2xvcidcbnZhciBTX0JMRU5EX0VRVUFUSU9OID0gJ2JsZW5kLmVxdWF0aW9uJ1xudmFyIFNfQkxFTkRfRlVOQyA9ICdibGVuZC5mdW5jJ1xudmFyIFNfREVQVEhfRU5BQkxFID0gJ2RlcHRoLmVuYWJsZSdcbnZhciBTX0RFUFRIX0ZVTkMgPSAnZGVwdGguZnVuYydcbnZhciBTX0RFUFRIX1JBTkdFID0gJ2RlcHRoLnJhbmdlJ1xudmFyIFNfREVQVEhfTUFTSyA9ICdkZXB0aC5tYXNrJ1xudmFyIFNfQ09MT1JfTUFTSyA9ICdjb2xvck1hc2snXG52YXIgU19DVUxMX0VOQUJMRSA9ICdjdWxsLmVuYWJsZSdcbnZhciBTX0NVTExfRkFDRSA9ICdjdWxsLmZhY2UnXG52YXIgU19GUk9OVF9GQUNFID0gJ2Zyb250RmFjZSdcbnZhciBTX0xJTkVfV0lEVEggPSAnbGluZVdpZHRoJ1xudmFyIFNfUE9MWUdPTl9PRkZTRVRfRU5BQkxFID0gJ3BvbHlnb25PZmZzZXQuZW5hYmxlJ1xudmFyIFNfUE9MWUdPTl9PRkZTRVRfT0ZGU0VUID0gJ3BvbHlnb25PZmZzZXQub2Zmc2V0J1xudmFyIFNfU0FNUExFX0FMUEhBID0gJ3NhbXBsZS5hbHBoYSdcbnZhciBTX1NBTVBMRV9FTkFCTEUgPSAnc2FtcGxlLmVuYWJsZSdcbnZhciBTX1NBTVBMRV9DT1ZFUkFHRSA9ICdzYW1wbGUuY292ZXJhZ2UnXG52YXIgU19TVEVOQ0lMX0VOQUJMRSA9ICdzdGVuY2lsLmVuYWJsZSdcbnZhciBTX1NURU5DSUxfTUFTSyA9ICdzdGVuY2lsLm1hc2snXG52YXIgU19TVEVOQ0lMX0ZVTkMgPSAnc3RlbmNpbC5mdW5jJ1xudmFyIFNfU1RFTkNJTF9PUEZST05UID0gJ3N0ZW5jaWwub3BGcm9udCdcbnZhciBTX1NURU5DSUxfT1BCQUNLID0gJ3N0ZW5jaWwub3BCYWNrJ1xudmFyIFNfU0NJU1NPUl9FTkFCTEUgPSAnc2Npc3Nvci5lbmFibGUnXG52YXIgU19TQ0lTU09SX0JPWCA9ICdzY2lzc29yLmJveCdcbnZhciBTX1ZJRVdQT1JUID0gJ3ZpZXdwb3J0J1xuXG52YXIgU19QUk9GSUxFID0gJ3Byb2ZpbGUnXG5cbnZhciBTX0ZSQU1FQlVGRkVSID0gJ2ZyYW1lYnVmZmVyJ1xudmFyIFNfVkVSVCA9ICd2ZXJ0J1xudmFyIFNfRlJBRyA9ICdmcmFnJ1xudmFyIFNfRUxFTUVOVFMgPSAnZWxlbWVudHMnXG52YXIgU19QUklNSVRJVkUgPSAncHJpbWl0aXZlJ1xudmFyIFNfQ09VTlQgPSAnY291bnQnXG52YXIgU19PRkZTRVQgPSAnb2Zmc2V0J1xudmFyIFNfSU5TVEFOQ0VTID0gJ2luc3RhbmNlcydcblxudmFyIFNVRkZJWF9XSURUSCA9ICdXaWR0aCdcbnZhciBTVUZGSVhfSEVJR0hUID0gJ0hlaWdodCdcblxudmFyIFNfRlJBTUVCVUZGRVJfV0lEVEggPSBTX0ZSQU1FQlVGRkVSICsgU1VGRklYX1dJRFRIXG52YXIgU19GUkFNRUJVRkZFUl9IRUlHSFQgPSBTX0ZSQU1FQlVGRkVSICsgU1VGRklYX0hFSUdIVFxudmFyIFNfVklFV1BPUlRfV0lEVEggPSBTX1ZJRVdQT1JUICsgU1VGRklYX1dJRFRIXG52YXIgU19WSUVXUE9SVF9IRUlHSFQgPSBTX1ZJRVdQT1JUICsgU1VGRklYX0hFSUdIVFxudmFyIFNfRFJBV0lOR0JVRkZFUiA9ICdkcmF3aW5nQnVmZmVyJ1xudmFyIFNfRFJBV0lOR0JVRkZFUl9XSURUSCA9IFNfRFJBV0lOR0JVRkZFUiArIFNVRkZJWF9XSURUSFxudmFyIFNfRFJBV0lOR0JVRkZFUl9IRUlHSFQgPSBTX0RSQVdJTkdCVUZGRVIgKyBTVUZGSVhfSEVJR0hUXG5cbnZhciBORVNURURfT1BUSU9OUyA9IFtcbiAgU19CTEVORF9GVU5DLFxuICBTX0JMRU5EX0VRVUFUSU9OLFxuICBTX1NURU5DSUxfRlVOQyxcbiAgU19TVEVOQ0lMX09QRlJPTlQsXG4gIFNfU1RFTkNJTF9PUEJBQ0ssXG4gIFNfU0FNUExFX0NPVkVSQUdFLFxuICBTX1ZJRVdQT1JULFxuICBTX1NDSVNTT1JfQk9YLFxuICBTX1BPTFlHT05fT0ZGU0VUX09GRlNFVFxuXVxuXG52YXIgR0xfQVJSQVlfQlVGRkVSID0gMzQ5NjJcbnZhciBHTF9FTEVNRU5UX0FSUkFZX0JVRkZFUiA9IDM0OTYzXG5cbnZhciBHTF9GUkFHTUVOVF9TSEFERVIgPSAzNTYzMlxudmFyIEdMX1ZFUlRFWF9TSEFERVIgPSAzNTYzM1xuXG52YXIgR0xfVEVYVFVSRV8yRCA9IDB4MERFMVxudmFyIEdMX1RFWFRVUkVfQ1VCRV9NQVAgPSAweDg1MTNcblxudmFyIEdMX0NVTExfRkFDRSA9IDB4MEI0NFxudmFyIEdMX0JMRU5EID0gMHgwQkUyXG52YXIgR0xfRElUSEVSID0gMHgwQkQwXG52YXIgR0xfU1RFTkNJTF9URVNUID0gMHgwQjkwXG52YXIgR0xfREVQVEhfVEVTVCA9IDB4MEI3MVxudmFyIEdMX1NDSVNTT1JfVEVTVCA9IDB4MEMxMVxudmFyIEdMX1BPTFlHT05fT0ZGU0VUX0ZJTEwgPSAweDgwMzdcbnZhciBHTF9TQU1QTEVfQUxQSEFfVE9fQ09WRVJBR0UgPSAweDgwOUVcbnZhciBHTF9TQU1QTEVfQ09WRVJBR0UgPSAweDgwQTBcblxudmFyIEdMX0ZMT0FUID0gNTEyNlxudmFyIEdMX0ZMT0FUX1ZFQzIgPSAzNTY2NFxudmFyIEdMX0ZMT0FUX1ZFQzMgPSAzNTY2NVxudmFyIEdMX0ZMT0FUX1ZFQzQgPSAzNTY2NlxudmFyIEdMX0lOVCA9IDUxMjRcbnZhciBHTF9JTlRfVkVDMiA9IDM1NjY3XG52YXIgR0xfSU5UX1ZFQzMgPSAzNTY2OFxudmFyIEdMX0lOVF9WRUM0ID0gMzU2NjlcbnZhciBHTF9CT09MID0gMzU2NzBcbnZhciBHTF9CT09MX1ZFQzIgPSAzNTY3MVxudmFyIEdMX0JPT0xfVkVDMyA9IDM1NjcyXG52YXIgR0xfQk9PTF9WRUM0ID0gMzU2NzNcbnZhciBHTF9GTE9BVF9NQVQyID0gMzU2NzRcbnZhciBHTF9GTE9BVF9NQVQzID0gMzU2NzVcbnZhciBHTF9GTE9BVF9NQVQ0ID0gMzU2NzZcbnZhciBHTF9TQU1QTEVSXzJEID0gMzU2NzhcbnZhciBHTF9TQU1QTEVSX0NVQkUgPSAzNTY4MFxuXG52YXIgR0xfVFJJQU5HTEVTID0gNFxuXG52YXIgR0xfRlJPTlQgPSAxMDI4XG52YXIgR0xfQkFDSyA9IDEwMjlcbnZhciBHTF9DVyA9IDB4MDkwMFxudmFyIEdMX0NDVyA9IDB4MDkwMVxudmFyIEdMX01JTl9FWFQgPSAweDgwMDdcbnZhciBHTF9NQVhfRVhUID0gMHg4MDA4XG52YXIgR0xfQUxXQVlTID0gNTE5XG52YXIgR0xfS0VFUCA9IDc2ODBcbnZhciBHTF9aRVJPID0gMFxudmFyIEdMX09ORSA9IDFcbnZhciBHTF9GVU5DX0FERCA9IDB4ODAwNlxudmFyIEdMX0xFU1MgPSA1MTNcblxudmFyIEdMX0ZSQU1FQlVGRkVSID0gMHg4RDQwXG52YXIgR0xfQ09MT1JfQVRUQUNITUVOVDAgPSAweDhDRTBcblxudmFyIGJsZW5kRnVuY3MgPSB7XG4gICcwJzogMCxcbiAgJzEnOiAxLFxuICAnemVybyc6IDAsXG4gICdvbmUnOiAxLFxuICAnc3JjIGNvbG9yJzogNzY4LFxuICAnb25lIG1pbnVzIHNyYyBjb2xvcic6IDc2OSxcbiAgJ3NyYyBhbHBoYSc6IDc3MCxcbiAgJ29uZSBtaW51cyBzcmMgYWxwaGEnOiA3NzEsXG4gICdkc3QgY29sb3InOiA3NzQsXG4gICdvbmUgbWludXMgZHN0IGNvbG9yJzogNzc1LFxuICAnZHN0IGFscGhhJzogNzcyLFxuICAnb25lIG1pbnVzIGRzdCBhbHBoYSc6IDc3MyxcbiAgJ2NvbnN0YW50IGNvbG9yJzogMzI3NjksXG4gICdvbmUgbWludXMgY29uc3RhbnQgY29sb3InOiAzMjc3MCxcbiAgJ2NvbnN0YW50IGFscGhhJzogMzI3NzEsXG4gICdvbmUgbWludXMgY29uc3RhbnQgYWxwaGEnOiAzMjc3MixcbiAgJ3NyYyBhbHBoYSBzYXR1cmF0ZSc6IDc3NlxufVxuXG4vLyBUaGVyZSBhcmUgaW52YWxpZCB2YWx1ZXMgZm9yIHNyY1JHQiBhbmQgZHN0UkdCLiBTZWU6XG4vLyBodHRwczovL3d3dy5raHJvbm9zLm9yZy9yZWdpc3RyeS93ZWJnbC9zcGVjcy8xLjAvIzYuMTNcbi8vIGh0dHBzOi8vZ2l0aHViLmNvbS9LaHJvbm9zR3JvdXAvV2ViR0wvYmxvYi8wZDMyMDFmNWY3ZWMzYzAwNjBiYzFmMDQwNzc0NjE1NDFmMTk4N2I5L2NvbmZvcm1hbmNlLXN1aXRlcy8xLjAuMy9jb25mb3JtYW5jZS9taXNjL3dlYmdsLXNwZWNpZmljLmh0bWwjTDU2XG52YXIgaW52YWxpZEJsZW5kQ29tYmluYXRpb25zID0gW1xuICAnY29uc3RhbnQgY29sb3IsIGNvbnN0YW50IGFscGhhJyxcbiAgJ29uZSBtaW51cyBjb25zdGFudCBjb2xvciwgY29uc3RhbnQgYWxwaGEnLFxuICAnY29uc3RhbnQgY29sb3IsIG9uZSBtaW51cyBjb25zdGFudCBhbHBoYScsXG4gICdvbmUgbWludXMgY29uc3RhbnQgY29sb3IsIG9uZSBtaW51cyBjb25zdGFudCBhbHBoYScsXG4gICdjb25zdGFudCBhbHBoYSwgY29uc3RhbnQgY29sb3InLFxuICAnY29uc3RhbnQgYWxwaGEsIG9uZSBtaW51cyBjb25zdGFudCBjb2xvcicsXG4gICdvbmUgbWludXMgY29uc3RhbnQgYWxwaGEsIGNvbnN0YW50IGNvbG9yJyxcbiAgJ29uZSBtaW51cyBjb25zdGFudCBhbHBoYSwgb25lIG1pbnVzIGNvbnN0YW50IGNvbG9yJ1xuXVxuXG52YXIgY29tcGFyZUZ1bmNzID0ge1xuICAnbmV2ZXInOiA1MTIsXG4gICdsZXNzJzogNTEzLFxuICAnPCc6IDUxMyxcbiAgJ2VxdWFsJzogNTE0LFxuICAnPSc6IDUxNCxcbiAgJz09JzogNTE0LFxuICAnPT09JzogNTE0LFxuICAnbGVxdWFsJzogNTE1LFxuICAnPD0nOiA1MTUsXG4gICdncmVhdGVyJzogNTE2LFxuICAnPic6IDUxNixcbiAgJ25vdGVxdWFsJzogNTE3LFxuICAnIT0nOiA1MTcsXG4gICchPT0nOiA1MTcsXG4gICdnZXF1YWwnOiA1MTgsXG4gICc+PSc6IDUxOCxcbiAgJ2Fsd2F5cyc6IDUxOVxufVxuXG52YXIgc3RlbmNpbE9wcyA9IHtcbiAgJzAnOiAwLFxuICAnemVybyc6IDAsXG4gICdrZWVwJzogNzY4MCxcbiAgJ3JlcGxhY2UnOiA3NjgxLFxuICAnaW5jcmVtZW50JzogNzY4MixcbiAgJ2RlY3JlbWVudCc6IDc2ODMsXG4gICdpbmNyZW1lbnQgd3JhcCc6IDM0MDU1LFxuICAnZGVjcmVtZW50IHdyYXAnOiAzNDA1NixcbiAgJ2ludmVydCc6IDUzODZcbn1cblxudmFyIHNoYWRlclR5cGUgPSB7XG4gICdmcmFnJzogR0xfRlJBR01FTlRfU0hBREVSLFxuICAndmVydCc6IEdMX1ZFUlRFWF9TSEFERVJcbn1cblxudmFyIG9yaWVudGF0aW9uVHlwZSA9IHtcbiAgJ2N3JzogR0xfQ1csXG4gICdjY3cnOiBHTF9DQ1dcbn1cblxuZnVuY3Rpb24gaXNCdWZmZXJBcmdzICh4KSB7XG4gIHJldHVybiBBcnJheS5pc0FycmF5KHgpIHx8XG4gICAgaXNUeXBlZEFycmF5KHgpIHx8XG4gICAgaXNOREFycmF5KHgpXG59XG5cbi8vIE1ha2Ugc3VyZSB2aWV3cG9ydCBpcyBwcm9jZXNzZWQgZmlyc3RcbmZ1bmN0aW9uIHNvcnRTdGF0ZSAoc3RhdGUpIHtcbiAgcmV0dXJuIHN0YXRlLnNvcnQoZnVuY3Rpb24gKGEsIGIpIHtcbiAgICBpZiAoYSA9PT0gU19WSUVXUE9SVCkge1xuICAgICAgcmV0dXJuIC0xXG4gICAgfSBlbHNlIGlmIChiID09PSBTX1ZJRVdQT1JUKSB7XG4gICAgICByZXR1cm4gMVxuICAgIH1cbiAgICByZXR1cm4gKGEgPCBiKSA/IC0xIDogMVxuICB9KVxufVxuXG5mdW5jdGlvbiBEZWNsYXJhdGlvbiAodGhpc0RlcCwgY29udGV4dERlcCwgcHJvcERlcCwgYXBwZW5kKSB7XG4gIHRoaXMudGhpc0RlcCA9IHRoaXNEZXBcbiAgdGhpcy5jb250ZXh0RGVwID0gY29udGV4dERlcFxuICB0aGlzLnByb3BEZXAgPSBwcm9wRGVwXG4gIHRoaXMuYXBwZW5kID0gYXBwZW5kXG59XG5cbmZ1bmN0aW9uIGlzU3RhdGljIChkZWNsKSB7XG4gIHJldHVybiBkZWNsICYmICEoZGVjbC50aGlzRGVwIHx8IGRlY2wuY29udGV4dERlcCB8fCBkZWNsLnByb3BEZXApXG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVN0YXRpY0RlY2wgKGFwcGVuZCkge1xuICByZXR1cm4gbmV3IERlY2xhcmF0aW9uKGZhbHNlLCBmYWxzZSwgZmFsc2UsIGFwcGVuZClcbn1cblxuZnVuY3Rpb24gY3JlYXRlRHluYW1pY0RlY2wgKGR5biwgYXBwZW5kKSB7XG4gIHZhciB0eXBlID0gZHluLnR5cGVcbiAgaWYgKHR5cGUgPT09IERZTl9GVU5DKSB7XG4gICAgdmFyIG51bUFyZ3MgPSBkeW4uZGF0YS5sZW5ndGhcbiAgICByZXR1cm4gbmV3IERlY2xhcmF0aW9uKFxuICAgICAgdHJ1ZSxcbiAgICAgIG51bUFyZ3MgPj0gMSxcbiAgICAgIG51bUFyZ3MgPj0gMixcbiAgICAgIGFwcGVuZClcbiAgfSBlbHNlIGlmICh0eXBlID09PSBEWU5fVEhVTkspIHtcbiAgICB2YXIgZGF0YSA9IGR5bi5kYXRhXG4gICAgcmV0dXJuIG5ldyBEZWNsYXJhdGlvbihcbiAgICAgIGRhdGEudGhpc0RlcCxcbiAgICAgIGRhdGEuY29udGV4dERlcCxcbiAgICAgIGRhdGEucHJvcERlcCxcbiAgICAgIGFwcGVuZClcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gbmV3IERlY2xhcmF0aW9uKFxuICAgICAgdHlwZSA9PT0gRFlOX1NUQVRFLFxuICAgICAgdHlwZSA9PT0gRFlOX0NPTlRFWFQsXG4gICAgICB0eXBlID09PSBEWU5fUFJPUCxcbiAgICAgIGFwcGVuZClcbiAgfVxufVxuXG52YXIgU0NPUEVfREVDTCA9IG5ldyBEZWNsYXJhdGlvbihmYWxzZSwgZmFsc2UsIGZhbHNlLCBmdW5jdGlvbiAoKSB7fSlcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiByZWdsQ29yZSAoXG4gIGdsLFxuICBzdHJpbmdTdG9yZSxcbiAgZXh0ZW5zaW9ucyxcbiAgbGltaXRzLFxuICBidWZmZXJTdGF0ZSxcbiAgZWxlbWVudFN0YXRlLFxuICB0ZXh0dXJlU3RhdGUsXG4gIGZyYW1lYnVmZmVyU3RhdGUsXG4gIHVuaWZvcm1TdGF0ZSxcbiAgYXR0cmlidXRlU3RhdGUsXG4gIHNoYWRlclN0YXRlLFxuICBkcmF3U3RhdGUsXG4gIGNvbnRleHRTdGF0ZSxcbiAgdGltZXIsXG4gIGNvbmZpZykge1xuICB2YXIgQXR0cmlidXRlUmVjb3JkID0gYXR0cmlidXRlU3RhdGUuUmVjb3JkXG5cbiAgdmFyIGJsZW5kRXF1YXRpb25zID0ge1xuICAgICdhZGQnOiAzMjc3NCxcbiAgICAnc3VidHJhY3QnOiAzMjc3OCxcbiAgICAncmV2ZXJzZSBzdWJ0cmFjdCc6IDMyNzc5XG4gIH1cbiAgaWYgKGV4dGVuc2lvbnMuZXh0X2JsZW5kX21pbm1heCkge1xuICAgIGJsZW5kRXF1YXRpb25zLm1pbiA9IEdMX01JTl9FWFRcbiAgICBibGVuZEVxdWF0aW9ucy5tYXggPSBHTF9NQVhfRVhUXG4gIH1cblxuICB2YXIgZXh0SW5zdGFuY2luZyA9IGV4dGVuc2lvbnMuYW5nbGVfaW5zdGFuY2VkX2FycmF5c1xuICB2YXIgZXh0RHJhd0J1ZmZlcnMgPSBleHRlbnNpb25zLndlYmdsX2RyYXdfYnVmZmVyc1xuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gV0VCR0wgU1RBVEVcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICB2YXIgY3VycmVudFN0YXRlID0ge1xuICAgIGRpcnR5OiB0cnVlLFxuICAgIHByb2ZpbGU6IGNvbmZpZy5wcm9maWxlXG4gIH1cbiAgdmFyIG5leHRTdGF0ZSA9IHt9XG4gIHZhciBHTF9TVEFURV9OQU1FUyA9IFtdXG4gIHZhciBHTF9GTEFHUyA9IHt9XG4gIHZhciBHTF9WQVJJQUJMRVMgPSB7fVxuXG4gIGZ1bmN0aW9uIHByb3BOYW1lIChuYW1lKSB7XG4gICAgcmV0dXJuIG5hbWUucmVwbGFjZSgnLicsICdfJylcbiAgfVxuXG4gIGZ1bmN0aW9uIHN0YXRlRmxhZyAoc25hbWUsIGNhcCwgaW5pdCkge1xuICAgIHZhciBuYW1lID0gcHJvcE5hbWUoc25hbWUpXG4gICAgR0xfU1RBVEVfTkFNRVMucHVzaChzbmFtZSlcbiAgICBuZXh0U3RhdGVbbmFtZV0gPSBjdXJyZW50U3RhdGVbbmFtZV0gPSAhIWluaXRcbiAgICBHTF9GTEFHU1tuYW1lXSA9IGNhcFxuICB9XG5cbiAgZnVuY3Rpb24gc3RhdGVWYXJpYWJsZSAoc25hbWUsIGZ1bmMsIGluaXQpIHtcbiAgICB2YXIgbmFtZSA9IHByb3BOYW1lKHNuYW1lKVxuICAgIEdMX1NUQVRFX05BTUVTLnB1c2goc25hbWUpXG4gICAgaWYgKEFycmF5LmlzQXJyYXkoaW5pdCkpIHtcbiAgICAgIGN1cnJlbnRTdGF0ZVtuYW1lXSA9IGluaXQuc2xpY2UoKVxuICAgICAgbmV4dFN0YXRlW25hbWVdID0gaW5pdC5zbGljZSgpXG4gICAgfSBlbHNlIHtcbiAgICAgIGN1cnJlbnRTdGF0ZVtuYW1lXSA9IG5leHRTdGF0ZVtuYW1lXSA9IGluaXRcbiAgICB9XG4gICAgR0xfVkFSSUFCTEVTW25hbWVdID0gZnVuY1xuICB9XG5cbiAgLy8gRGl0aGVyaW5nXG4gIHN0YXRlRmxhZyhTX0RJVEhFUiwgR0xfRElUSEVSKVxuXG4gIC8vIEJsZW5kaW5nXG4gIHN0YXRlRmxhZyhTX0JMRU5EX0VOQUJMRSwgR0xfQkxFTkQpXG4gIHN0YXRlVmFyaWFibGUoU19CTEVORF9DT0xPUiwgJ2JsZW5kQ29sb3InLCBbMCwgMCwgMCwgMF0pXG4gIHN0YXRlVmFyaWFibGUoU19CTEVORF9FUVVBVElPTiwgJ2JsZW5kRXF1YXRpb25TZXBhcmF0ZScsXG4gICAgW0dMX0ZVTkNfQURELCBHTF9GVU5DX0FERF0pXG4gIHN0YXRlVmFyaWFibGUoU19CTEVORF9GVU5DLCAnYmxlbmRGdW5jU2VwYXJhdGUnLFxuICAgIFtHTF9PTkUsIEdMX1pFUk8sIEdMX09ORSwgR0xfWkVST10pXG5cbiAgLy8gRGVwdGhcbiAgc3RhdGVGbGFnKFNfREVQVEhfRU5BQkxFLCBHTF9ERVBUSF9URVNULCB0cnVlKVxuICBzdGF0ZVZhcmlhYmxlKFNfREVQVEhfRlVOQywgJ2RlcHRoRnVuYycsIEdMX0xFU1MpXG4gIHN0YXRlVmFyaWFibGUoU19ERVBUSF9SQU5HRSwgJ2RlcHRoUmFuZ2UnLCBbMCwgMV0pXG4gIHN0YXRlVmFyaWFibGUoU19ERVBUSF9NQVNLLCAnZGVwdGhNYXNrJywgdHJ1ZSlcblxuICAvLyBDb2xvciBtYXNrXG4gIHN0YXRlVmFyaWFibGUoU19DT0xPUl9NQVNLLCBTX0NPTE9SX01BU0ssIFt0cnVlLCB0cnVlLCB0cnVlLCB0cnVlXSlcblxuICAvLyBGYWNlIGN1bGxpbmdcbiAgc3RhdGVGbGFnKFNfQ1VMTF9FTkFCTEUsIEdMX0NVTExfRkFDRSlcbiAgc3RhdGVWYXJpYWJsZShTX0NVTExfRkFDRSwgJ2N1bGxGYWNlJywgR0xfQkFDSylcblxuICAvLyBGcm9udCBmYWNlIG9yaWVudGF0aW9uXG4gIHN0YXRlVmFyaWFibGUoU19GUk9OVF9GQUNFLCBTX0ZST05UX0ZBQ0UsIEdMX0NDVylcblxuICAvLyBMaW5lIHdpZHRoXG4gIHN0YXRlVmFyaWFibGUoU19MSU5FX1dJRFRILCBTX0xJTkVfV0lEVEgsIDEpXG5cbiAgLy8gUG9seWdvbiBvZmZzZXRcbiAgc3RhdGVGbGFnKFNfUE9MWUdPTl9PRkZTRVRfRU5BQkxFLCBHTF9QT0xZR09OX09GRlNFVF9GSUxMKVxuICBzdGF0ZVZhcmlhYmxlKFNfUE9MWUdPTl9PRkZTRVRfT0ZGU0VULCAncG9seWdvbk9mZnNldCcsIFswLCAwXSlcblxuICAvLyBTYW1wbGUgY292ZXJhZ2VcbiAgc3RhdGVGbGFnKFNfU0FNUExFX0FMUEhBLCBHTF9TQU1QTEVfQUxQSEFfVE9fQ09WRVJBR0UpXG4gIHN0YXRlRmxhZyhTX1NBTVBMRV9FTkFCTEUsIEdMX1NBTVBMRV9DT1ZFUkFHRSlcbiAgc3RhdGVWYXJpYWJsZShTX1NBTVBMRV9DT1ZFUkFHRSwgJ3NhbXBsZUNvdmVyYWdlJywgWzEsIGZhbHNlXSlcblxuICAvLyBTdGVuY2lsXG4gIHN0YXRlRmxhZyhTX1NURU5DSUxfRU5BQkxFLCBHTF9TVEVOQ0lMX1RFU1QpXG4gIHN0YXRlVmFyaWFibGUoU19TVEVOQ0lMX01BU0ssICdzdGVuY2lsTWFzaycsIC0xKVxuICBzdGF0ZVZhcmlhYmxlKFNfU1RFTkNJTF9GVU5DLCAnc3RlbmNpbEZ1bmMnLCBbR0xfQUxXQVlTLCAwLCAtMV0pXG4gIHN0YXRlVmFyaWFibGUoU19TVEVOQ0lMX09QRlJPTlQsICdzdGVuY2lsT3BTZXBhcmF0ZScsXG4gICAgW0dMX0ZST05ULCBHTF9LRUVQLCBHTF9LRUVQLCBHTF9LRUVQXSlcbiAgc3RhdGVWYXJpYWJsZShTX1NURU5DSUxfT1BCQUNLLCAnc3RlbmNpbE9wU2VwYXJhdGUnLFxuICAgIFtHTF9CQUNLLCBHTF9LRUVQLCBHTF9LRUVQLCBHTF9LRUVQXSlcblxuICAvLyBTY2lzc29yXG4gIHN0YXRlRmxhZyhTX1NDSVNTT1JfRU5BQkxFLCBHTF9TQ0lTU09SX1RFU1QpXG4gIHN0YXRlVmFyaWFibGUoU19TQ0lTU09SX0JPWCwgJ3NjaXNzb3InLFxuICAgIFswLCAwLCBnbC5kcmF3aW5nQnVmZmVyV2lkdGgsIGdsLmRyYXdpbmdCdWZmZXJIZWlnaHRdKVxuXG4gIC8vIFZpZXdwb3J0XG4gIHN0YXRlVmFyaWFibGUoU19WSUVXUE9SVCwgU19WSUVXUE9SVCxcbiAgICBbMCwgMCwgZ2wuZHJhd2luZ0J1ZmZlcldpZHRoLCBnbC5kcmF3aW5nQnVmZmVySGVpZ2h0XSlcblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIEVOVklST05NRU5UXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgdmFyIHNoYXJlZFN0YXRlID0ge1xuICAgIGdsOiBnbCxcbiAgICBjb250ZXh0OiBjb250ZXh0U3RhdGUsXG4gICAgc3RyaW5nczogc3RyaW5nU3RvcmUsXG4gICAgbmV4dDogbmV4dFN0YXRlLFxuICAgIGN1cnJlbnQ6IGN1cnJlbnRTdGF0ZSxcbiAgICBkcmF3OiBkcmF3U3RhdGUsXG4gICAgZWxlbWVudHM6IGVsZW1lbnRTdGF0ZSxcbiAgICBidWZmZXI6IGJ1ZmZlclN0YXRlLFxuICAgIHNoYWRlcjogc2hhZGVyU3RhdGUsXG4gICAgYXR0cmlidXRlczogYXR0cmlidXRlU3RhdGUuc3RhdGUsXG4gICAgdW5pZm9ybXM6IHVuaWZvcm1TdGF0ZSxcbiAgICBmcmFtZWJ1ZmZlcjogZnJhbWVidWZmZXJTdGF0ZSxcbiAgICBleHRlbnNpb25zOiBleHRlbnNpb25zLFxuXG4gICAgdGltZXI6IHRpbWVyLFxuICAgIGlzQnVmZmVyQXJnczogaXNCdWZmZXJBcmdzXG4gIH1cblxuICB2YXIgc2hhcmVkQ29uc3RhbnRzID0ge1xuICAgIHByaW1UeXBlczogcHJpbVR5cGVzLFxuICAgIGNvbXBhcmVGdW5jczogY29tcGFyZUZ1bmNzLFxuICAgIGJsZW5kRnVuY3M6IGJsZW5kRnVuY3MsXG4gICAgYmxlbmRFcXVhdGlvbnM6IGJsZW5kRXF1YXRpb25zLFxuICAgIHN0ZW5jaWxPcHM6IHN0ZW5jaWxPcHMsXG4gICAgZ2xUeXBlczogZ2xUeXBlcyxcbiAgICBvcmllbnRhdGlvblR5cGU6IG9yaWVudGF0aW9uVHlwZVxuICB9XG5cbiAgXG5cbiAgaWYgKGV4dERyYXdCdWZmZXJzKSB7XG4gICAgc2hhcmVkQ29uc3RhbnRzLmJhY2tCdWZmZXIgPSBbR0xfQkFDS11cbiAgICBzaGFyZWRDb25zdGFudHMuZHJhd0J1ZmZlciA9IGxvb3AobGltaXRzLm1heERyYXdidWZmZXJzLCBmdW5jdGlvbiAoaSkge1xuICAgICAgaWYgKGkgPT09IDApIHtcbiAgICAgICAgcmV0dXJuIFswXVxuICAgICAgfVxuICAgICAgcmV0dXJuIGxvb3AoaSwgZnVuY3Rpb24gKGopIHtcbiAgICAgICAgcmV0dXJuIEdMX0NPTE9SX0FUVEFDSE1FTlQwICsgalxuICAgICAgfSlcbiAgICB9KVxuICB9XG5cbiAgdmFyIGRyYXdDYWxsQ291bnRlciA9IDBcbiAgZnVuY3Rpb24gY3JlYXRlUkVHTEVudmlyb25tZW50ICgpIHtcbiAgICB2YXIgZW52ID0gY3JlYXRlRW52aXJvbm1lbnQoKVxuICAgIHZhciBsaW5rID0gZW52LmxpbmtcbiAgICB2YXIgZ2xvYmFsID0gZW52Lmdsb2JhbFxuICAgIGVudi5pZCA9IGRyYXdDYWxsQ291bnRlcisrXG5cbiAgICBlbnYuYmF0Y2hJZCA9ICcwJ1xuXG4gICAgLy8gbGluayBzaGFyZWQgc3RhdGVcbiAgICB2YXIgU0hBUkVEID0gbGluayhzaGFyZWRTdGF0ZSlcbiAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZCA9IHtcbiAgICAgIHByb3BzOiAnYTAnXG4gICAgfVxuICAgIE9iamVjdC5rZXlzKHNoYXJlZFN0YXRlKS5mb3JFYWNoKGZ1bmN0aW9uIChwcm9wKSB7XG4gICAgICBzaGFyZWRbcHJvcF0gPSBnbG9iYWwuZGVmKFNIQVJFRCwgJy4nLCBwcm9wKVxuICAgIH0pXG5cbiAgICAvLyBJbmplY3QgcnVudGltZSBhc3NlcnRpb24gc3R1ZmYgZm9yIGRlYnVnIGJ1aWxkc1xuICAgIFxuXG4gICAgLy8gQ29weSBHTCBzdGF0ZSB2YXJpYWJsZXMgb3ZlclxuICAgIHZhciBuZXh0VmFycyA9IGVudi5uZXh0ID0ge31cbiAgICB2YXIgY3VycmVudFZhcnMgPSBlbnYuY3VycmVudCA9IHt9XG4gICAgT2JqZWN0LmtleXMoR0xfVkFSSUFCTEVTKS5mb3JFYWNoKGZ1bmN0aW9uICh2YXJpYWJsZSkge1xuICAgICAgaWYgKEFycmF5LmlzQXJyYXkoY3VycmVudFN0YXRlW3ZhcmlhYmxlXSkpIHtcbiAgICAgICAgbmV4dFZhcnNbdmFyaWFibGVdID0gZ2xvYmFsLmRlZihzaGFyZWQubmV4dCwgJy4nLCB2YXJpYWJsZSlcbiAgICAgICAgY3VycmVudFZhcnNbdmFyaWFibGVdID0gZ2xvYmFsLmRlZihzaGFyZWQuY3VycmVudCwgJy4nLCB2YXJpYWJsZSlcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgLy8gSW5pdGlhbGl6ZSBzaGFyZWQgY29uc3RhbnRzXG4gICAgdmFyIGNvbnN0YW50cyA9IGVudi5jb25zdGFudHMgPSB7fVxuICAgIE9iamVjdC5rZXlzKHNoYXJlZENvbnN0YW50cykuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgY29uc3RhbnRzW25hbWVdID0gZ2xvYmFsLmRlZihKU09OLnN0cmluZ2lmeShzaGFyZWRDb25zdGFudHNbbmFtZV0pKVxuICAgIH0pXG5cbiAgICAvLyBIZWxwZXIgZnVuY3Rpb24gZm9yIGNhbGxpbmcgYSBibG9ja1xuICAgIGVudi5pbnZva2UgPSBmdW5jdGlvbiAoYmxvY2ssIHgpIHtcbiAgICAgIHN3aXRjaCAoeC50eXBlKSB7XG4gICAgICAgIGNhc2UgRFlOX0ZVTkM6XG4gICAgICAgICAgdmFyIGFyZ0xpc3QgPSBbXG4gICAgICAgICAgICAndGhpcycsXG4gICAgICAgICAgICBzaGFyZWQuY29udGV4dCxcbiAgICAgICAgICAgIHNoYXJlZC5wcm9wcyxcbiAgICAgICAgICAgIGVudi5iYXRjaElkXG4gICAgICAgICAgXVxuICAgICAgICAgIHJldHVybiBibG9jay5kZWYoXG4gICAgICAgICAgICBsaW5rKHguZGF0YSksICcuY2FsbCgnLFxuICAgICAgICAgICAgICBhcmdMaXN0LnNsaWNlKDAsIE1hdGgubWF4KHguZGF0YS5sZW5ndGggKyAxLCA0KSksXG4gICAgICAgICAgICAgJyknKVxuICAgICAgICBjYXNlIERZTl9QUk9QOlxuICAgICAgICAgIHJldHVybiBibG9jay5kZWYoc2hhcmVkLnByb3BzLCB4LmRhdGEpXG4gICAgICAgIGNhc2UgRFlOX0NPTlRFWFQ6XG4gICAgICAgICAgcmV0dXJuIGJsb2NrLmRlZihzaGFyZWQuY29udGV4dCwgeC5kYXRhKVxuICAgICAgICBjYXNlIERZTl9TVEFURTpcbiAgICAgICAgICByZXR1cm4gYmxvY2suZGVmKCd0aGlzJywgeC5kYXRhKVxuICAgICAgICBjYXNlIERZTl9USFVOSzpcbiAgICAgICAgICB4LmRhdGEuYXBwZW5kKGVudiwgYmxvY2spXG4gICAgICAgICAgcmV0dXJuIHguZGF0YS5yZWZcbiAgICAgIH1cbiAgICB9XG5cbiAgICBlbnYuYXR0cmliQ2FjaGUgPSB7fVxuXG4gICAgdmFyIHNjb3BlQXR0cmlicyA9IHt9XG4gICAgZW52LnNjb3BlQXR0cmliID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIHZhciBpZCA9IHN0cmluZ1N0b3JlLmlkKG5hbWUpXG4gICAgICBpZiAoaWQgaW4gc2NvcGVBdHRyaWJzKSB7XG4gICAgICAgIHJldHVybiBzY29wZUF0dHJpYnNbaWRdXG4gICAgICB9XG4gICAgICB2YXIgYmluZGluZyA9IGF0dHJpYnV0ZVN0YXRlLnNjb3BlW2lkXVxuICAgICAgaWYgKCFiaW5kaW5nKSB7XG4gICAgICAgIGJpbmRpbmcgPSBhdHRyaWJ1dGVTdGF0ZS5zY29wZVtpZF0gPSBuZXcgQXR0cmlidXRlUmVjb3JkKClcbiAgICAgIH1cbiAgICAgIHZhciByZXN1bHQgPSBzY29wZUF0dHJpYnNbaWRdID0gbGluayhiaW5kaW5nKVxuICAgICAgcmV0dXJuIHJlc3VsdFxuICAgIH1cblxuICAgIHJldHVybiBlbnZcbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gUEFSU0lOR1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIGZ1bmN0aW9uIHBhcnNlUHJvZmlsZSAob3B0aW9ucykge1xuICAgIHZhciBzdGF0aWNPcHRpb25zID0gb3B0aW9ucy5zdGF0aWNcbiAgICB2YXIgZHluYW1pY09wdGlvbnMgPSBvcHRpb25zLmR5bmFtaWNcblxuICAgIHZhciBwcm9maWxlRW5hYmxlXG4gICAgaWYgKFNfUFJPRklMRSBpbiBzdGF0aWNPcHRpb25zKSB7XG4gICAgICB2YXIgdmFsdWUgPSAhIXN0YXRpY09wdGlvbnNbU19QUk9GSUxFXVxuICAgICAgcHJvZmlsZUVuYWJsZSA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgcmV0dXJuIHZhbHVlXG4gICAgICB9KVxuICAgICAgcHJvZmlsZUVuYWJsZS5lbmFibGUgPSB2YWx1ZVxuICAgIH0gZWxzZSBpZiAoU19QUk9GSUxFIGluIGR5bmFtaWNPcHRpb25zKSB7XG4gICAgICB2YXIgZHluID0gZHluYW1pY09wdGlvbnNbU19QUk9GSUxFXVxuICAgICAgcHJvZmlsZUVuYWJsZSA9IGNyZWF0ZUR5bmFtaWNEZWNsKGR5biwgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgcmV0dXJuIGVudi5pbnZva2Uoc2NvcGUsIGR5bilcbiAgICAgIH0pXG4gICAgfVxuXG4gICAgcmV0dXJuIHByb2ZpbGVFbmFibGVcbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlRnJhbWVidWZmZXIgKG9wdGlvbnMsIGVudikge1xuICAgIHZhciBzdGF0aWNPcHRpb25zID0gb3B0aW9ucy5zdGF0aWNcbiAgICB2YXIgZHluYW1pY09wdGlvbnMgPSBvcHRpb25zLmR5bmFtaWNcblxuICAgIGlmIChTX0ZSQU1FQlVGRkVSIGluIHN0YXRpY09wdGlvbnMpIHtcbiAgICAgIHZhciBmcmFtZWJ1ZmZlciA9IHN0YXRpY09wdGlvbnNbU19GUkFNRUJVRkZFUl1cbiAgICAgIGlmIChmcmFtZWJ1ZmZlcikge1xuICAgICAgICBmcmFtZWJ1ZmZlciA9IGZyYW1lYnVmZmVyU3RhdGUuZ2V0RnJhbWVidWZmZXIoZnJhbWVidWZmZXIpXG4gICAgICAgIFxuICAgICAgICByZXR1cm4gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBibG9jaykge1xuICAgICAgICAgIHZhciBGUkFNRUJVRkZFUiA9IGVudi5saW5rKGZyYW1lYnVmZmVyKVxuICAgICAgICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG4gICAgICAgICAgYmxvY2suc2V0KFxuICAgICAgICAgICAgc2hhcmVkLmZyYW1lYnVmZmVyLFxuICAgICAgICAgICAgJy5uZXh0JyxcbiAgICAgICAgICAgIEZSQU1FQlVGRkVSKVxuICAgICAgICAgIHZhciBDT05URVhUID0gc2hhcmVkLmNvbnRleHRcbiAgICAgICAgICBibG9jay5zZXQoXG4gICAgICAgICAgICBDT05URVhULFxuICAgICAgICAgICAgJy4nICsgU19GUkFNRUJVRkZFUl9XSURUSCxcbiAgICAgICAgICAgIEZSQU1FQlVGRkVSICsgJy53aWR0aCcpXG4gICAgICAgICAgYmxvY2suc2V0KFxuICAgICAgICAgICAgQ09OVEVYVCxcbiAgICAgICAgICAgICcuJyArIFNfRlJBTUVCVUZGRVJfSEVJR0hULFxuICAgICAgICAgICAgRlJBTUVCVUZGRVIgKyAnLmhlaWdodCcpXG4gICAgICAgICAgcmV0dXJuIEZSQU1FQlVGRkVSXG4gICAgICAgIH0pXG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG4gICAgICAgICAgc2NvcGUuc2V0KFxuICAgICAgICAgICAgc2hhcmVkLmZyYW1lYnVmZmVyLFxuICAgICAgICAgICAgJy5uZXh0JyxcbiAgICAgICAgICAgICdudWxsJylcbiAgICAgICAgICB2YXIgQ09OVEVYVCA9IHNoYXJlZC5jb250ZXh0XG4gICAgICAgICAgc2NvcGUuc2V0KFxuICAgICAgICAgICAgQ09OVEVYVCxcbiAgICAgICAgICAgICcuJyArIFNfRlJBTUVCVUZGRVJfV0lEVEgsXG4gICAgICAgICAgICBDT05URVhUICsgJy4nICsgU19EUkFXSU5HQlVGRkVSX1dJRFRIKVxuICAgICAgICAgIHNjb3BlLnNldChcbiAgICAgICAgICAgIENPTlRFWFQsXG4gICAgICAgICAgICAnLicgKyBTX0ZSQU1FQlVGRkVSX0hFSUdIVCxcbiAgICAgICAgICAgIENPTlRFWFQgKyAnLicgKyBTX0RSQVdJTkdCVUZGRVJfSEVJR0hUKVxuICAgICAgICAgIHJldHVybiAnbnVsbCdcbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKFNfRlJBTUVCVUZGRVIgaW4gZHluYW1pY09wdGlvbnMpIHtcbiAgICAgIHZhciBkeW4gPSBkeW5hbWljT3B0aW9uc1tTX0ZSQU1FQlVGRkVSXVxuICAgICAgcmV0dXJuIGNyZWF0ZUR5bmFtaWNEZWNsKGR5biwgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgdmFyIEZSQU1FQlVGRkVSX0ZVTkMgPSBlbnYuaW52b2tlKHNjb3BlLCBkeW4pXG4gICAgICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG4gICAgICAgIHZhciBGUkFNRUJVRkZFUl9TVEFURSA9IHNoYXJlZC5mcmFtZWJ1ZmZlclxuICAgICAgICB2YXIgRlJBTUVCVUZGRVIgPSBzY29wZS5kZWYoXG4gICAgICAgICAgRlJBTUVCVUZGRVJfU1RBVEUsICcuZ2V0RnJhbWVidWZmZXIoJywgRlJBTUVCVUZGRVJfRlVOQywgJyknKVxuXG4gICAgICAgIFxuXG4gICAgICAgIHNjb3BlLnNldChcbiAgICAgICAgICBGUkFNRUJVRkZFUl9TVEFURSxcbiAgICAgICAgICAnLm5leHQnLFxuICAgICAgICAgIEZSQU1FQlVGRkVSKVxuICAgICAgICB2YXIgQ09OVEVYVCA9IHNoYXJlZC5jb250ZXh0XG4gICAgICAgIHNjb3BlLnNldChcbiAgICAgICAgICBDT05URVhULFxuICAgICAgICAgICcuJyArIFNfRlJBTUVCVUZGRVJfV0lEVEgsXG4gICAgICAgICAgRlJBTUVCVUZGRVIgKyAnPycgKyBGUkFNRUJVRkZFUiArICcud2lkdGg6JyArXG4gICAgICAgICAgQ09OVEVYVCArICcuJyArIFNfRFJBV0lOR0JVRkZFUl9XSURUSClcbiAgICAgICAgc2NvcGUuc2V0KFxuICAgICAgICAgIENPTlRFWFQsXG4gICAgICAgICAgJy4nICsgU19GUkFNRUJVRkZFUl9IRUlHSFQsXG4gICAgICAgICAgRlJBTUVCVUZGRVIgK1xuICAgICAgICAgICc/JyArIEZSQU1FQlVGRkVSICsgJy5oZWlnaHQ6JyArXG4gICAgICAgICAgQ09OVEVYVCArICcuJyArIFNfRFJBV0lOR0JVRkZFUl9IRUlHSFQpXG4gICAgICAgIHJldHVybiBGUkFNRUJVRkZFUlxuICAgICAgfSlcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZVZpZXdwb3J0U2Npc3NvciAob3B0aW9ucywgZnJhbWVidWZmZXIsIGVudikge1xuICAgIHZhciBzdGF0aWNPcHRpb25zID0gb3B0aW9ucy5zdGF0aWNcbiAgICB2YXIgZHluYW1pY09wdGlvbnMgPSBvcHRpb25zLmR5bmFtaWNcblxuICAgIGZ1bmN0aW9uIHBhcnNlQm94IChwYXJhbSkge1xuICAgICAgaWYgKHBhcmFtIGluIHN0YXRpY09wdGlvbnMpIHtcbiAgICAgICAgdmFyIGJveCA9IHN0YXRpY09wdGlvbnNbcGFyYW1dXG4gICAgICAgIFxuXG4gICAgICAgIHZhciBpc1N0YXRpYyA9IHRydWVcbiAgICAgICAgdmFyIHggPSBib3gueCB8IDBcbiAgICAgICAgdmFyIHkgPSBib3gueSB8IDBcbiAgICAgICAgdmFyIHcsIGhcbiAgICAgICAgaWYgKCd3aWR0aCcgaW4gYm94KSB7XG4gICAgICAgICAgdyA9IGJveC53aWR0aCB8IDBcbiAgICAgICAgICBcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpc1N0YXRpYyA9IGZhbHNlXG4gICAgICAgIH1cbiAgICAgICAgaWYgKCdoZWlnaHQnIGluIGJveCkge1xuICAgICAgICAgIGggPSBib3guaGVpZ2h0IHwgMFxuICAgICAgICAgIFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlzU3RhdGljID0gZmFsc2VcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBuZXcgRGVjbGFyYXRpb24oXG4gICAgICAgICAgIWlzU3RhdGljICYmIGZyYW1lYnVmZmVyICYmIGZyYW1lYnVmZmVyLnRoaXNEZXAsXG4gICAgICAgICAgIWlzU3RhdGljICYmIGZyYW1lYnVmZmVyICYmIGZyYW1lYnVmZmVyLmNvbnRleHREZXAsXG4gICAgICAgICAgIWlzU3RhdGljICYmIGZyYW1lYnVmZmVyICYmIGZyYW1lYnVmZmVyLnByb3BEZXAsXG4gICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICAgIHZhciBDT05URVhUID0gZW52LnNoYXJlZC5jb250ZXh0XG4gICAgICAgICAgICB2YXIgQk9YX1cgPSB3XG4gICAgICAgICAgICBpZiAoISgnd2lkdGgnIGluIGJveCkpIHtcbiAgICAgICAgICAgICAgQk9YX1cgPSBzY29wZS5kZWYoQ09OVEVYVCwgJy4nLCBTX0ZSQU1FQlVGRkVSX1dJRFRILCAnLScsIHgpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB2YXIgQk9YX0ggPSBoXG4gICAgICAgICAgICBpZiAoISgnaGVpZ2h0JyBpbiBib3gpKSB7XG4gICAgICAgICAgICAgIEJPWF9IID0gc2NvcGUuZGVmKENPTlRFWFQsICcuJywgU19GUkFNRUJVRkZFUl9IRUlHSFQsICctJywgeSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBbeCwgeSwgQk9YX1csIEJPWF9IXVxuICAgICAgICAgIH0pXG4gICAgICB9IGVsc2UgaWYgKHBhcmFtIGluIGR5bmFtaWNPcHRpb25zKSB7XG4gICAgICAgIHZhciBkeW5Cb3ggPSBkeW5hbWljT3B0aW9uc1twYXJhbV1cbiAgICAgICAgdmFyIHJlc3VsdCA9IGNyZWF0ZUR5bmFtaWNEZWNsKGR5bkJveCwgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICB2YXIgQk9YID0gZW52Lmludm9rZShzY29wZSwgZHluQm94KVxuXG4gICAgICAgICAgXG5cbiAgICAgICAgICB2YXIgQ09OVEVYVCA9IGVudi5zaGFyZWQuY29udGV4dFxuICAgICAgICAgIHZhciBCT1hfWCA9IHNjb3BlLmRlZihCT1gsICcueHwwJylcbiAgICAgICAgICB2YXIgQk9YX1kgPSBzY29wZS5kZWYoQk9YLCAnLnl8MCcpXG4gICAgICAgICAgdmFyIEJPWF9XID0gc2NvcGUuZGVmKFxuICAgICAgICAgICAgJ1wid2lkdGhcIiBpbiAnLCBCT1gsICc/JywgQk9YLCAnLndpZHRofDA6JyxcbiAgICAgICAgICAgICcoJywgQ09OVEVYVCwgJy4nLCBTX0ZSQU1FQlVGRkVSX1dJRFRILCAnLScsIEJPWF9YLCAnKScpXG4gICAgICAgICAgdmFyIEJPWF9IID0gc2NvcGUuZGVmKFxuICAgICAgICAgICAgJ1wiaGVpZ2h0XCIgaW4gJywgQk9YLCAnPycsIEJPWCwgJy5oZWlnaHR8MDonLFxuICAgICAgICAgICAgJygnLCBDT05URVhULCAnLicsIFNfRlJBTUVCVUZGRVJfSEVJR0hULCAnLScsIEJPWF9ZLCAnKScpXG5cbiAgICAgICAgICBcblxuICAgICAgICAgIHJldHVybiBbQk9YX1gsIEJPWF9ZLCBCT1hfVywgQk9YX0hdXG4gICAgICAgIH0pXG4gICAgICAgIGlmIChmcmFtZWJ1ZmZlcikge1xuICAgICAgICAgIHJlc3VsdC50aGlzRGVwID0gcmVzdWx0LnRoaXNEZXAgfHwgZnJhbWVidWZmZXIudGhpc0RlcFxuICAgICAgICAgIHJlc3VsdC5jb250ZXh0RGVwID0gcmVzdWx0LmNvbnRleHREZXAgfHwgZnJhbWVidWZmZXIuY29udGV4dERlcFxuICAgICAgICAgIHJlc3VsdC5wcm9wRGVwID0gcmVzdWx0LnByb3BEZXAgfHwgZnJhbWVidWZmZXIucHJvcERlcFxuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgIH0gZWxzZSBpZiAoZnJhbWVidWZmZXIpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBEZWNsYXJhdGlvbihcbiAgICAgICAgICBmcmFtZWJ1ZmZlci50aGlzRGVwLFxuICAgICAgICAgIGZyYW1lYnVmZmVyLmNvbnRleHREZXAsXG4gICAgICAgICAgZnJhbWVidWZmZXIucHJvcERlcCxcbiAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgICAgdmFyIENPTlRFWFQgPSBlbnYuc2hhcmVkLmNvbnRleHRcbiAgICAgICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICAgIDAsIDAsXG4gICAgICAgICAgICAgIHNjb3BlLmRlZihDT05URVhULCAnLicsIFNfRlJBTUVCVUZGRVJfV0lEVEgpLFxuICAgICAgICAgICAgICBzY29wZS5kZWYoQ09OVEVYVCwgJy4nLCBTX0ZSQU1FQlVGRkVSX0hFSUdIVCldXG4gICAgICAgICAgfSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBudWxsXG4gICAgICB9XG4gICAgfVxuXG4gICAgdmFyIHZpZXdwb3J0ID0gcGFyc2VCb3goU19WSUVXUE9SVClcblxuICAgIGlmICh2aWV3cG9ydCkge1xuICAgICAgdmFyIHByZXZWaWV3cG9ydCA9IHZpZXdwb3J0XG4gICAgICB2aWV3cG9ydCA9IG5ldyBEZWNsYXJhdGlvbihcbiAgICAgICAgdmlld3BvcnQudGhpc0RlcCxcbiAgICAgICAgdmlld3BvcnQuY29udGV4dERlcCxcbiAgICAgICAgdmlld3BvcnQucHJvcERlcCxcbiAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICB2YXIgVklFV1BPUlQgPSBwcmV2Vmlld3BvcnQuYXBwZW5kKGVudiwgc2NvcGUpXG4gICAgICAgICAgdmFyIENPTlRFWFQgPSBlbnYuc2hhcmVkLmNvbnRleHRcbiAgICAgICAgICBzY29wZS5zZXQoXG4gICAgICAgICAgICBDT05URVhULFxuICAgICAgICAgICAgJy4nICsgU19WSUVXUE9SVF9XSURUSCxcbiAgICAgICAgICAgIFZJRVdQT1JUWzJdKVxuICAgICAgICAgIHNjb3BlLnNldChcbiAgICAgICAgICAgIENPTlRFWFQsXG4gICAgICAgICAgICAnLicgKyBTX1ZJRVdQT1JUX0hFSUdIVCxcbiAgICAgICAgICAgIFZJRVdQT1JUWzNdKVxuICAgICAgICAgIHJldHVybiBWSUVXUE9SVFxuICAgICAgICB9KVxuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICB2aWV3cG9ydDogdmlld3BvcnQsXG4gICAgICBzY2lzc29yX2JveDogcGFyc2VCb3goU19TQ0lTU09SX0JPWClcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZVByb2dyYW0gKG9wdGlvbnMpIHtcbiAgICB2YXIgc3RhdGljT3B0aW9ucyA9IG9wdGlvbnMuc3RhdGljXG4gICAgdmFyIGR5bmFtaWNPcHRpb25zID0gb3B0aW9ucy5keW5hbWljXG5cbiAgICBmdW5jdGlvbiBwYXJzZVNoYWRlciAobmFtZSkge1xuICAgICAgaWYgKG5hbWUgaW4gc3RhdGljT3B0aW9ucykge1xuICAgICAgICB2YXIgaWQgPSBzdHJpbmdTdG9yZS5pZChzdGF0aWNPcHRpb25zW25hbWVdKVxuICAgICAgICBcbiAgICAgICAgdmFyIHJlc3VsdCA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHJldHVybiBpZFxuICAgICAgICB9KVxuICAgICAgICByZXN1bHQuaWQgPSBpZFxuICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICB9IGVsc2UgaWYgKG5hbWUgaW4gZHluYW1pY09wdGlvbnMpIHtcbiAgICAgICAgdmFyIGR5biA9IGR5bmFtaWNPcHRpb25zW25hbWVdXG4gICAgICAgIHJldHVybiBjcmVhdGVEeW5hbWljRGVjbChkeW4sIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgdmFyIHN0ciA9IGVudi5pbnZva2Uoc2NvcGUsIGR5bilcbiAgICAgICAgICB2YXIgaWQgPSBzY29wZS5kZWYoZW52LnNoYXJlZC5zdHJpbmdzLCAnLmlkKCcsIHN0ciwgJyknKVxuICAgICAgICAgIFxuICAgICAgICAgIHJldHVybiBpZFxuICAgICAgICB9KVxuICAgICAgfVxuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG5cbiAgICB2YXIgZnJhZyA9IHBhcnNlU2hhZGVyKFNfRlJBRylcbiAgICB2YXIgdmVydCA9IHBhcnNlU2hhZGVyKFNfVkVSVClcblxuICAgIHZhciBwcm9ncmFtID0gbnVsbFxuICAgIHZhciBwcm9nVmFyXG4gICAgaWYgKGlzU3RhdGljKGZyYWcpICYmIGlzU3RhdGljKHZlcnQpKSB7XG4gICAgICBwcm9ncmFtID0gc2hhZGVyU3RhdGUucHJvZ3JhbSh2ZXJ0LmlkLCBmcmFnLmlkKVxuICAgICAgcHJvZ1ZhciA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgcmV0dXJuIGVudi5saW5rKHByb2dyYW0pXG4gICAgICB9KVxuICAgIH0gZWxzZSB7XG4gICAgICBwcm9nVmFyID0gbmV3IERlY2xhcmF0aW9uKFxuICAgICAgICAoZnJhZyAmJiBmcmFnLnRoaXNEZXApIHx8ICh2ZXJ0ICYmIHZlcnQudGhpc0RlcCksXG4gICAgICAgIChmcmFnICYmIGZyYWcuY29udGV4dERlcCkgfHwgKHZlcnQgJiYgdmVydC5jb250ZXh0RGVwKSxcbiAgICAgICAgKGZyYWcgJiYgZnJhZy5wcm9wRGVwKSB8fCAodmVydCAmJiB2ZXJ0LnByb3BEZXApLFxuICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIHZhciBTSEFERVJfU1RBVEUgPSBlbnYuc2hhcmVkLnNoYWRlclxuICAgICAgICAgIHZhciBmcmFnSWRcbiAgICAgICAgICBpZiAoZnJhZykge1xuICAgICAgICAgICAgZnJhZ0lkID0gZnJhZy5hcHBlbmQoZW52LCBzY29wZSlcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZnJhZ0lkID0gc2NvcGUuZGVmKFNIQURFUl9TVEFURSwgJy4nLCBTX0ZSQUcpXG4gICAgICAgICAgfVxuICAgICAgICAgIHZhciB2ZXJ0SWRcbiAgICAgICAgICBpZiAodmVydCkge1xuICAgICAgICAgICAgdmVydElkID0gdmVydC5hcHBlbmQoZW52LCBzY29wZSlcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmVydElkID0gc2NvcGUuZGVmKFNIQURFUl9TVEFURSwgJy4nLCBTX1ZFUlQpXG4gICAgICAgICAgfVxuICAgICAgICAgIHZhciBwcm9nRGVmID0gU0hBREVSX1NUQVRFICsgJy5wcm9ncmFtKCcgKyB2ZXJ0SWQgKyAnLCcgKyBmcmFnSWRcbiAgICAgICAgICBcbiAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKHByb2dEZWYgKyAnKScpXG4gICAgICAgIH0pXG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIGZyYWc6IGZyYWcsXG4gICAgICB2ZXJ0OiB2ZXJ0LFxuICAgICAgcHJvZ1ZhcjogcHJvZ1ZhcixcbiAgICAgIHByb2dyYW06IHByb2dyYW1cbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZURyYXcgKG9wdGlvbnMsIGVudikge1xuICAgIHZhciBzdGF0aWNPcHRpb25zID0gb3B0aW9ucy5zdGF0aWNcbiAgICB2YXIgZHluYW1pY09wdGlvbnMgPSBvcHRpb25zLmR5bmFtaWNcblxuICAgIGZ1bmN0aW9uIHBhcnNlRWxlbWVudHMgKCkge1xuICAgICAgaWYgKFNfRUxFTUVOVFMgaW4gc3RhdGljT3B0aW9ucykge1xuICAgICAgICB2YXIgZWxlbWVudHMgPSBzdGF0aWNPcHRpb25zW1NfRUxFTUVOVFNdXG4gICAgICAgIGlmIChpc0J1ZmZlckFyZ3MoZWxlbWVudHMpKSB7XG4gICAgICAgICAgZWxlbWVudHMgPSBlbGVtZW50U3RhdGUuZ2V0RWxlbWVudHMoZWxlbWVudFN0YXRlLmNyZWF0ZShlbGVtZW50cywgdHJ1ZSkpXG4gICAgICAgIH0gZWxzZSBpZiAoZWxlbWVudHMpIHtcbiAgICAgICAgICBlbGVtZW50cyA9IGVsZW1lbnRTdGF0ZS5nZXRFbGVtZW50cyhlbGVtZW50cylcbiAgICAgICAgICBcbiAgICAgICAgfVxuICAgICAgICB2YXIgcmVzdWx0ID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIGlmIChlbGVtZW50cykge1xuICAgICAgICAgICAgdmFyIHJlc3VsdCA9IGVudi5saW5rKGVsZW1lbnRzKVxuICAgICAgICAgICAgZW52LkVMRU1FTlRTID0gcmVzdWx0XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICAgICAgfVxuICAgICAgICAgIGVudi5FTEVNRU5UUyA9IG51bGxcbiAgICAgICAgICByZXR1cm4gbnVsbFxuICAgICAgICB9KVxuICAgICAgICByZXN1bHQudmFsdWUgPSBlbGVtZW50c1xuICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICB9IGVsc2UgaWYgKFNfRUxFTUVOVFMgaW4gZHluYW1pY09wdGlvbnMpIHtcbiAgICAgICAgdmFyIGR5biA9IGR5bmFtaWNPcHRpb25zW1NfRUxFTUVOVFNdXG4gICAgICAgIHJldHVybiBjcmVhdGVEeW5hbWljRGVjbChkeW4sIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcblxuICAgICAgICAgIHZhciBJU19CVUZGRVJfQVJHUyA9IHNoYXJlZC5pc0J1ZmZlckFyZ3NcbiAgICAgICAgICB2YXIgRUxFTUVOVF9TVEFURSA9IHNoYXJlZC5lbGVtZW50c1xuXG4gICAgICAgICAgdmFyIGVsZW1lbnREZWZuID0gZW52Lmludm9rZShzY29wZSwgZHluKVxuICAgICAgICAgIHZhciBlbGVtZW50cyA9IHNjb3BlLmRlZignbnVsbCcpXG4gICAgICAgICAgdmFyIGVsZW1lbnRTdHJlYW0gPSBzY29wZS5kZWYoSVNfQlVGRkVSX0FSR1MsICcoJywgZWxlbWVudERlZm4sICcpJylcblxuICAgICAgICAgIHZhciBpZnRlID0gZW52LmNvbmQoZWxlbWVudFN0cmVhbSlcbiAgICAgICAgICAgIC50aGVuKGVsZW1lbnRzLCAnPScsIEVMRU1FTlRfU1RBVEUsICcuY3JlYXRlU3RyZWFtKCcsIGVsZW1lbnREZWZuLCAnKTsnKVxuICAgICAgICAgICAgLmVsc2UoZWxlbWVudHMsICc9JywgRUxFTUVOVF9TVEFURSwgJy5nZXRFbGVtZW50cygnLCBlbGVtZW50RGVmbiwgJyk7JylcblxuICAgICAgICAgIFxuXG4gICAgICAgICAgc2NvcGUuZW50cnkoaWZ0ZSlcbiAgICAgICAgICBzY29wZS5leGl0KFxuICAgICAgICAgICAgZW52LmNvbmQoZWxlbWVudFN0cmVhbSlcbiAgICAgICAgICAgICAgLnRoZW4oRUxFTUVOVF9TVEFURSwgJy5kZXN0cm95U3RyZWFtKCcsIGVsZW1lbnRzLCAnKTsnKSlcblxuICAgICAgICAgIGVudi5FTEVNRU5UUyA9IGVsZW1lbnRzXG5cbiAgICAgICAgICByZXR1cm4gZWxlbWVudHNcbiAgICAgICAgfSlcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG5cbiAgICB2YXIgZWxlbWVudHMgPSBwYXJzZUVsZW1lbnRzKClcblxuICAgIGZ1bmN0aW9uIHBhcnNlUHJpbWl0aXZlICgpIHtcbiAgICAgIGlmIChTX1BSSU1JVElWRSBpbiBzdGF0aWNPcHRpb25zKSB7XG4gICAgICAgIHZhciBwcmltaXRpdmUgPSBzdGF0aWNPcHRpb25zW1NfUFJJTUlUSVZFXVxuICAgICAgICBcbiAgICAgICAgcmV0dXJuIGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICByZXR1cm4gcHJpbVR5cGVzW3ByaW1pdGl2ZV1cbiAgICAgICAgfSlcbiAgICAgIH0gZWxzZSBpZiAoU19QUklNSVRJVkUgaW4gZHluYW1pY09wdGlvbnMpIHtcbiAgICAgICAgdmFyIGR5blByaW1pdGl2ZSA9IGR5bmFtaWNPcHRpb25zW1NfUFJJTUlUSVZFXVxuICAgICAgICByZXR1cm4gY3JlYXRlRHluYW1pY0RlY2woZHluUHJpbWl0aXZlLCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIHZhciBQUklNX1RZUEVTID0gZW52LmNvbnN0YW50cy5wcmltVHlwZXNcbiAgICAgICAgICB2YXIgcHJpbSA9IGVudi5pbnZva2Uoc2NvcGUsIGR5blByaW1pdGl2ZSlcbiAgICAgICAgICBcbiAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKFBSSU1fVFlQRVMsICdbJywgcHJpbSwgJ10nKVxuICAgICAgICB9KVxuICAgICAgfSBlbHNlIGlmIChlbGVtZW50cykge1xuICAgICAgICBpZiAoaXNTdGF0aWMoZWxlbWVudHMpKSB7XG4gICAgICAgICAgaWYgKGVsZW1lbnRzLnZhbHVlKSB7XG4gICAgICAgICAgICByZXR1cm4gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKGVudi5FTEVNRU5UUywgJy5wcmltVHlwZScpXG4gICAgICAgICAgICB9KVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgIHJldHVybiBHTF9UUklBTkdMRVNcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBuZXcgRGVjbGFyYXRpb24oXG4gICAgICAgICAgICBlbGVtZW50cy50aGlzRGVwLFxuICAgICAgICAgICAgZWxlbWVudHMuY29udGV4dERlcCxcbiAgICAgICAgICAgIGVsZW1lbnRzLnByb3BEZXAsXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgICAgICB2YXIgZWxlbWVudHMgPSBlbnYuRUxFTUVOVFNcbiAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZihlbGVtZW50cywgJz8nLCBlbGVtZW50cywgJy5wcmltVHlwZTonLCBHTF9UUklBTkdMRVMpXG4gICAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHBhcnNlUGFyYW0gKHBhcmFtLCBpc09mZnNldCkge1xuICAgICAgaWYgKHBhcmFtIGluIHN0YXRpY09wdGlvbnMpIHtcbiAgICAgICAgdmFyIHZhbHVlID0gc3RhdGljT3B0aW9uc1twYXJhbV0gfCAwXG4gICAgICAgIFxuICAgICAgICByZXR1cm4gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIGlmIChpc09mZnNldCkge1xuICAgICAgICAgICAgZW52Lk9GRlNFVCA9IHZhbHVlXG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB2YWx1ZVxuICAgICAgICB9KVxuICAgICAgfSBlbHNlIGlmIChwYXJhbSBpbiBkeW5hbWljT3B0aW9ucykge1xuICAgICAgICB2YXIgZHluVmFsdWUgPSBkeW5hbWljT3B0aW9uc1twYXJhbV1cbiAgICAgICAgcmV0dXJuIGNyZWF0ZUR5bmFtaWNEZWNsKGR5blZhbHVlLCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIHZhciByZXN1bHQgPSBlbnYuaW52b2tlKHNjb3BlLCBkeW5WYWx1ZSlcbiAgICAgICAgICBpZiAoaXNPZmZzZXQpIHtcbiAgICAgICAgICAgIGVudi5PRkZTRVQgPSByZXN1bHRcbiAgICAgICAgICAgIFxuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICAgIH0pXG4gICAgICB9IGVsc2UgaWYgKGlzT2Zmc2V0ICYmIGVsZW1lbnRzKSB7XG4gICAgICAgIHJldHVybiBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgZW52Lk9GRlNFVCA9ICcwJ1xuICAgICAgICAgIHJldHVybiAwXG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cblxuICAgIHZhciBPRkZTRVQgPSBwYXJzZVBhcmFtKFNfT0ZGU0VULCB0cnVlKVxuXG4gICAgZnVuY3Rpb24gcGFyc2VWZXJ0Q291bnQgKCkge1xuICAgICAgaWYgKFNfQ09VTlQgaW4gc3RhdGljT3B0aW9ucykge1xuICAgICAgICB2YXIgY291bnQgPSBzdGF0aWNPcHRpb25zW1NfQ09VTlRdIHwgMFxuICAgICAgICBcbiAgICAgICAgcmV0dXJuIGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHJldHVybiBjb3VudFxuICAgICAgICB9KVxuICAgICAgfSBlbHNlIGlmIChTX0NPVU5UIGluIGR5bmFtaWNPcHRpb25zKSB7XG4gICAgICAgIHZhciBkeW5Db3VudCA9IGR5bmFtaWNPcHRpb25zW1NfQ09VTlRdXG4gICAgICAgIHJldHVybiBjcmVhdGVEeW5hbWljRGVjbChkeW5Db3VudCwgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICB2YXIgcmVzdWx0ID0gZW52Lmludm9rZShzY29wZSwgZHluQ291bnQpXG4gICAgICAgICAgXG4gICAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgICB9KVxuICAgICAgfSBlbHNlIGlmIChlbGVtZW50cykge1xuICAgICAgICBpZiAoaXNTdGF0aWMoZWxlbWVudHMpKSB7XG4gICAgICAgICAgaWYgKGVsZW1lbnRzKSB7XG4gICAgICAgICAgICBpZiAoT0ZGU0VUKSB7XG4gICAgICAgICAgICAgIHJldHVybiBuZXcgRGVjbGFyYXRpb24oXG4gICAgICAgICAgICAgICAgT0ZGU0VULnRoaXNEZXAsXG4gICAgICAgICAgICAgICAgT0ZGU0VULmNvbnRleHREZXAsXG4gICAgICAgICAgICAgICAgT0ZGU0VULnByb3BEZXAsXG4gICAgICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICAgICAgICAgIHZhciByZXN1bHQgPSBzY29wZS5kZWYoXG4gICAgICAgICAgICAgICAgICAgIGVudi5FTEVNRU5UUywgJy52ZXJ0Q291bnQtJywgZW52Lk9GRlNFVClcblxuICAgICAgICAgICAgICAgICAgXG5cbiAgICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgcmV0dXJuIGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKGVudi5FTEVNRU5UUywgJy52ZXJ0Q291bnQnKVxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YXIgcmVzdWx0ID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgIHJldHVybiAtMVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB2YXIgdmFyaWFibGUgPSBuZXcgRGVjbGFyYXRpb24oXG4gICAgICAgICAgICBlbGVtZW50cy50aGlzRGVwIHx8IE9GRlNFVC50aGlzRGVwLFxuICAgICAgICAgICAgZWxlbWVudHMuY29udGV4dERlcCB8fCBPRkZTRVQuY29udGV4dERlcCxcbiAgICAgICAgICAgIGVsZW1lbnRzLnByb3BEZXAgfHwgT0ZGU0VULnByb3BEZXAsXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgICAgICB2YXIgZWxlbWVudHMgPSBlbnYuRUxFTUVOVFNcbiAgICAgICAgICAgICAgaWYgKGVudi5PRkZTRVQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKGVsZW1lbnRzLCAnPycsIGVsZW1lbnRzLCAnLnZlcnRDb3VudC0nLFxuICAgICAgICAgICAgICAgICAgZW52Lk9GRlNFVCwgJzotMScpXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZihlbGVtZW50cywgJz8nLCBlbGVtZW50cywgJy52ZXJ0Q291bnQ6LTEnKVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICBcbiAgICAgICAgICByZXR1cm4gdmFyaWFibGVcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgZWxlbWVudHM6IGVsZW1lbnRzLFxuICAgICAgcHJpbWl0aXZlOiBwYXJzZVByaW1pdGl2ZSgpLFxuICAgICAgY291bnQ6IHBhcnNlVmVydENvdW50KCksXG4gICAgICBpbnN0YW5jZXM6IHBhcnNlUGFyYW0oU19JTlNUQU5DRVMsIGZhbHNlKSxcbiAgICAgIG9mZnNldDogT0ZGU0VUXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VHTFN0YXRlIChvcHRpb25zLCBlbnYpIHtcbiAgICB2YXIgc3RhdGljT3B0aW9ucyA9IG9wdGlvbnMuc3RhdGljXG4gICAgdmFyIGR5bmFtaWNPcHRpb25zID0gb3B0aW9ucy5keW5hbWljXG5cbiAgICB2YXIgU1RBVEUgPSB7fVxuXG4gICAgR0xfU1RBVEVfTkFNRVMuZm9yRWFjaChmdW5jdGlvbiAocHJvcCkge1xuICAgICAgdmFyIHBhcmFtID0gcHJvcE5hbWUocHJvcClcblxuICAgICAgZnVuY3Rpb24gcGFyc2VQYXJhbSAocGFyc2VTdGF0aWMsIHBhcnNlRHluYW1pYykge1xuICAgICAgICBpZiAocHJvcCBpbiBzdGF0aWNPcHRpb25zKSB7XG4gICAgICAgICAgdmFyIHZhbHVlID0gcGFyc2VTdGF0aWMoc3RhdGljT3B0aW9uc1twcm9wXSlcbiAgICAgICAgICBTVEFURVtwYXJhbV0gPSBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZVxuICAgICAgICAgIH0pXG4gICAgICAgIH0gZWxzZSBpZiAocHJvcCBpbiBkeW5hbWljT3B0aW9ucykge1xuICAgICAgICAgIHZhciBkeW4gPSBkeW5hbWljT3B0aW9uc1twcm9wXVxuICAgICAgICAgIFNUQVRFW3BhcmFtXSA9IGNyZWF0ZUR5bmFtaWNEZWNsKGR5biwgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICAgIHJldHVybiBwYXJzZUR5bmFtaWMoZW52LCBzY29wZSwgZW52Lmludm9rZShzY29wZSwgZHluKSlcbiAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHN3aXRjaCAocHJvcCkge1xuICAgICAgICBjYXNlIFNfQ1VMTF9FTkFCTEU6XG4gICAgICAgIGNhc2UgU19CTEVORF9FTkFCTEU6XG4gICAgICAgIGNhc2UgU19ESVRIRVI6XG4gICAgICAgIGNhc2UgU19TVEVOQ0lMX0VOQUJMRTpcbiAgICAgICAgY2FzZSBTX0RFUFRIX0VOQUJMRTpcbiAgICAgICAgY2FzZSBTX1NDSVNTT1JfRU5BQkxFOlxuICAgICAgICBjYXNlIFNfUE9MWUdPTl9PRkZTRVRfRU5BQkxFOlxuICAgICAgICBjYXNlIFNfU0FNUExFX0FMUEhBOlxuICAgICAgICBjYXNlIFNfU0FNUExFX0VOQUJMRTpcbiAgICAgICAgY2FzZSBTX0RFUFRIX01BU0s6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiB2YWx1ZVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19ERVBUSF9GVU5DOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gY29tcGFyZUZ1bmNzW3ZhbHVlXVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICB2YXIgQ09NUEFSRV9GVU5DUyA9IGVudi5jb25zdGFudHMuY29tcGFyZUZ1bmNzXG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKENPTVBBUkVfRlVOQ1MsICdbJywgdmFsdWUsICddJylcbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgY2FzZSBTX0RFUFRIX1JBTkdFOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gdmFsdWVcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgXG5cbiAgICAgICAgICAgICAgdmFyIFpfTkVBUiA9IHNjb3BlLmRlZignKycsIHZhbHVlLCAnWzBdJylcbiAgICAgICAgICAgICAgdmFyIFpfRkFSID0gc2NvcGUuZGVmKCcrJywgdmFsdWUsICdbMV0nKVxuICAgICAgICAgICAgICByZXR1cm4gW1pfTkVBUiwgWl9GQVJdXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19CTEVORF9GVU5DOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICB2YXIgc3JjUkdCID0gKCdzcmNSR0InIGluIHZhbHVlID8gdmFsdWUuc3JjUkdCIDogdmFsdWUuc3JjKVxuICAgICAgICAgICAgICB2YXIgc3JjQWxwaGEgPSAoJ3NyY0FscGhhJyBpbiB2YWx1ZSA/IHZhbHVlLnNyY0FscGhhIDogdmFsdWUuc3JjKVxuICAgICAgICAgICAgICB2YXIgZHN0UkdCID0gKCdkc3RSR0InIGluIHZhbHVlID8gdmFsdWUuZHN0UkdCIDogdmFsdWUuZHN0KVxuICAgICAgICAgICAgICB2YXIgZHN0QWxwaGEgPSAoJ2RzdEFscGhhJyBpbiB2YWx1ZSA/IHZhbHVlLmRzdEFscGhhIDogdmFsdWUuZHN0KVxuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBcblxuICAgICAgICAgICAgICBcblxuICAgICAgICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgICAgIGJsZW5kRnVuY3Nbc3JjUkdCXSxcbiAgICAgICAgICAgICAgICBibGVuZEZ1bmNzW2RzdFJHQl0sXG4gICAgICAgICAgICAgICAgYmxlbmRGdW5jc1tzcmNBbHBoYV0sXG4gICAgICAgICAgICAgICAgYmxlbmRGdW5jc1tkc3RBbHBoYV1cbiAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICB2YXIgQkxFTkRfRlVOQ1MgPSBlbnYuY29uc3RhbnRzLmJsZW5kRnVuY3NcblxuICAgICAgICAgICAgICBcblxuICAgICAgICAgICAgICBmdW5jdGlvbiByZWFkIChwcmVmaXgsIHN1ZmZpeCkge1xuICAgICAgICAgICAgICAgIHZhciBmdW5jID0gc2NvcGUuZGVmKFxuICAgICAgICAgICAgICAgICAgJ1wiJywgcHJlZml4LCBzdWZmaXgsICdcIiBpbiAnLCB2YWx1ZSxcbiAgICAgICAgICAgICAgICAgICc/JywgdmFsdWUsICcuJywgcHJlZml4LCBzdWZmaXgsXG4gICAgICAgICAgICAgICAgICAnOicsIHZhbHVlLCAnLicsIHByZWZpeClcblxuICAgICAgICAgICAgICAgIFxuXG4gICAgICAgICAgICAgICAgcmV0dXJuIGZ1bmNcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIHZhciBzcmNSR0IgPSByZWFkKCdzcmMnLCAnUkdCJylcbiAgICAgICAgICAgICAgdmFyIGRzdFJHQiA9IHJlYWQoJ2RzdCcsICdSR0InKVxuXG4gICAgICAgICAgICAgIFxuXG4gICAgICAgICAgICAgIHZhciBTUkNfUkdCID0gc2NvcGUuZGVmKEJMRU5EX0ZVTkNTLCAnWycsIHNyY1JHQiwgJ10nKVxuICAgICAgICAgICAgICB2YXIgU1JDX0FMUEhBID0gc2NvcGUuZGVmKEJMRU5EX0ZVTkNTLCAnWycsIHJlYWQoJ3NyYycsICdBbHBoYScpLCAnXScpXG4gICAgICAgICAgICAgIHZhciBEU1RfUkdCID0gc2NvcGUuZGVmKEJMRU5EX0ZVTkNTLCAnWycsIGRzdFJHQiwgJ10nKVxuICAgICAgICAgICAgICB2YXIgRFNUX0FMUEhBID0gc2NvcGUuZGVmKEJMRU5EX0ZVTkNTLCAnWycsIHJlYWQoJ2RzdCcsICdBbHBoYScpLCAnXScpXG5cbiAgICAgICAgICAgICAgcmV0dXJuIFtTUkNfUkdCLCBEU1RfUkdCLCBTUkNfQUxQSEEsIERTVF9BTFBIQV1cbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgY2FzZSBTX0JMRU5EX0VRVUFUSU9OOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgICAgICAgIGJsZW5kRXF1YXRpb25zW3ZhbHVlXSxcbiAgICAgICAgICAgICAgICAgIGJsZW5kRXF1YXRpb25zW3ZhbHVlXVxuICAgICAgICAgICAgICAgIF1cbiAgICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgICAgICAgIGJsZW5kRXF1YXRpb25zW3ZhbHVlLnJnYl0sXG4gICAgICAgICAgICAgICAgICBibGVuZEVxdWF0aW9uc1t2YWx1ZS5hbHBoYV1cbiAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgdmFyIEJMRU5EX0VRVUFUSU9OUyA9IGVudi5jb25zdGFudHMuYmxlbmRFcXVhdGlvbnNcblxuICAgICAgICAgICAgICB2YXIgUkdCID0gc2NvcGUuZGVmKClcbiAgICAgICAgICAgICAgdmFyIEFMUEhBID0gc2NvcGUuZGVmKClcblxuICAgICAgICAgICAgICB2YXIgaWZ0ZSA9IGVudi5jb25kKCd0eXBlb2YgJywgdmFsdWUsICc9PT1cInN0cmluZ1wiJylcblxuICAgICAgICAgICAgICBcblxuICAgICAgICAgICAgICBpZnRlLnRoZW4oXG4gICAgICAgICAgICAgICAgUkdCLCAnPScsIEFMUEhBLCAnPScsIEJMRU5EX0VRVUFUSU9OUywgJ1snLCB2YWx1ZSwgJ107JylcbiAgICAgICAgICAgICAgaWZ0ZS5lbHNlKFxuICAgICAgICAgICAgICAgIFJHQiwgJz0nLCBCTEVORF9FUVVBVElPTlMsICdbJywgdmFsdWUsICcucmdiXTsnLFxuICAgICAgICAgICAgICAgIEFMUEhBLCAnPScsIEJMRU5EX0VRVUFUSU9OUywgJ1snLCB2YWx1ZSwgJy5hbHBoYV07JylcblxuICAgICAgICAgICAgICBzY29wZShpZnRlKVxuXG4gICAgICAgICAgICAgIHJldHVybiBbUkdCLCBBTFBIQV1cbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgY2FzZSBTX0JMRU5EX0NPTE9SOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gbG9vcCg0LCBmdW5jdGlvbiAoaSkge1xuICAgICAgICAgICAgICAgIHJldHVybiArdmFsdWVbaV1cbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiBsb29wKDQsIGZ1bmN0aW9uIChpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZignKycsIHZhbHVlLCAnWycsIGksICddJylcbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgY2FzZSBTX1NURU5DSUxfTUFTSzpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlIHwgMFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZih2YWx1ZSwgJ3wwJylcbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgY2FzZSBTX1NURU5DSUxfRlVOQzpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgdmFyIGNtcCA9IHZhbHVlLmNtcCB8fCAna2VlcCdcbiAgICAgICAgICAgICAgdmFyIHJlZiA9IHZhbHVlLnJlZiB8fCAwXG4gICAgICAgICAgICAgIHZhciBtYXNrID0gJ21hc2snIGluIHZhbHVlID8gdmFsdWUubWFzayA6IC0xXG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICAgICAgY29tcGFyZUZ1bmNzW2NtcF0sXG4gICAgICAgICAgICAgICAgcmVmLFxuICAgICAgICAgICAgICAgIG1hc2tcbiAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICB2YXIgQ09NUEFSRV9GVU5DUyA9IGVudi5jb25zdGFudHMuY29tcGFyZUZ1bmNzXG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICB2YXIgY21wID0gc2NvcGUuZGVmKFxuICAgICAgICAgICAgICAgICdcImNtcFwiIGluICcsIHZhbHVlLFxuICAgICAgICAgICAgICAgICc/JywgQ09NUEFSRV9GVU5DUywgJ1snLCB2YWx1ZSwgJy5jbXBdJyxcbiAgICAgICAgICAgICAgICAnOicsIEdMX0tFRVApXG4gICAgICAgICAgICAgIHZhciByZWYgPSBzY29wZS5kZWYodmFsdWUsICcucmVmfDAnKVxuICAgICAgICAgICAgICB2YXIgbWFzayA9IHNjb3BlLmRlZihcbiAgICAgICAgICAgICAgICAnXCJtYXNrXCIgaW4gJywgdmFsdWUsXG4gICAgICAgICAgICAgICAgJz8nLCB2YWx1ZSwgJy5tYXNrfDA6LTEnKVxuICAgICAgICAgICAgICByZXR1cm4gW2NtcCwgcmVmLCBtYXNrXVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfU1RFTkNJTF9PUEZST05UOlxuICAgICAgICBjYXNlIFNfU1RFTkNJTF9PUEJBQ0s6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHZhciBmYWlsID0gdmFsdWUuZmFpbCB8fCAna2VlcCdcbiAgICAgICAgICAgICAgdmFyIHpmYWlsID0gdmFsdWUuemZhaWwgfHwgJ2tlZXAnXG4gICAgICAgICAgICAgIHZhciB6cGFzcyA9IHZhbHVlLnpwYXNzIHx8ICdrZWVwJ1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgICAgIHByb3AgPT09IFNfU1RFTkNJTF9PUEJBQ0sgPyBHTF9CQUNLIDogR0xfRlJPTlQsXG4gICAgICAgICAgICAgICAgc3RlbmNpbE9wc1tmYWlsXSxcbiAgICAgICAgICAgICAgICBzdGVuY2lsT3BzW3pmYWlsXSxcbiAgICAgICAgICAgICAgICBzdGVuY2lsT3BzW3pwYXNzXVxuICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIHZhciBTVEVOQ0lMX09QUyA9IGVudi5jb25zdGFudHMuc3RlbmNpbE9wc1xuXG4gICAgICAgICAgICAgIFxuXG4gICAgICAgICAgICAgIGZ1bmN0aW9uIHJlYWQgKG5hbWUpIHtcbiAgICAgICAgICAgICAgICBcblxuICAgICAgICAgICAgICAgIHJldHVybiBzY29wZS5kZWYoXG4gICAgICAgICAgICAgICAgICAnXCInLCBuYW1lLCAnXCIgaW4gJywgdmFsdWUsXG4gICAgICAgICAgICAgICAgICAnPycsIFNURU5DSUxfT1BTLCAnWycsIHZhbHVlLCAnLicsIG5hbWUsICddOicsXG4gICAgICAgICAgICAgICAgICBHTF9LRUVQKVxuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgICAgICBwcm9wID09PSBTX1NURU5DSUxfT1BCQUNLID8gR0xfQkFDSyA6IEdMX0ZST05ULFxuICAgICAgICAgICAgICAgIHJlYWQoJ2ZhaWwnKSxcbiAgICAgICAgICAgICAgICByZWFkKCd6ZmFpbCcpLFxuICAgICAgICAgICAgICAgIHJlYWQoJ3pwYXNzJylcbiAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfUE9MWUdPTl9PRkZTRVRfT0ZGU0VUOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICB2YXIgZmFjdG9yID0gdmFsdWUuZmFjdG9yIHwgMFxuICAgICAgICAgICAgICB2YXIgdW5pdHMgPSB2YWx1ZS51bml0cyB8IDBcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gW2ZhY3RvciwgdW5pdHNdXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuXG4gICAgICAgICAgICAgIHZhciBGQUNUT1IgPSBzY29wZS5kZWYodmFsdWUsICcuZmFjdG9yfDAnKVxuICAgICAgICAgICAgICB2YXIgVU5JVFMgPSBzY29wZS5kZWYodmFsdWUsICcudW5pdHN8MCcpXG5cbiAgICAgICAgICAgICAgcmV0dXJuIFtGQUNUT1IsIFVOSVRTXVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfQ1VMTF9GQUNFOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIHZhciBmYWNlID0gMFxuICAgICAgICAgICAgICBpZiAodmFsdWUgPT09ICdmcm9udCcpIHtcbiAgICAgICAgICAgICAgICBmYWNlID0gR0xfRlJPTlRcbiAgICAgICAgICAgICAgfSBlbHNlIGlmICh2YWx1ZSA9PT0gJ2JhY2snKSB7XG4gICAgICAgICAgICAgICAgZmFjZSA9IEdMX0JBQ0tcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIGZhY2VcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiBzY29wZS5kZWYodmFsdWUsICc9PT1cImZyb250XCI/JywgR0xfRlJPTlQsICc6JywgR0xfQkFDSylcbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgY2FzZSBTX0xJTkVfV0lEVEg6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiB2YWx1ZVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICBcblxuICAgICAgICAgICAgICByZXR1cm4gdmFsdWVcbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgY2FzZSBTX0ZST05UX0ZBQ0U6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiBvcmllbnRhdGlvblR5cGVbdmFsdWVdXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKHZhbHVlICsgJz09PVwiY3dcIj8nICsgR0xfQ1cgKyAnOicgKyBHTF9DQ1cpXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19DT0xPUl9NQVNLOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gdmFsdWUubWFwKGZ1bmN0aW9uICh2KSB7IHJldHVybiAhIXYgfSlcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiBsb29wKDQsIGZ1bmN0aW9uIChpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuICchIScgKyB2YWx1ZSArICdbJyArIGkgKyAnXSdcbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgY2FzZSBTX1NBTVBMRV9DT1ZFUkFHRTpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgdmFyIHNhbXBsZVZhbHVlID0gJ3ZhbHVlJyBpbiB2YWx1ZSA/IHZhbHVlLnZhbHVlIDogMVxuICAgICAgICAgICAgICB2YXIgc2FtcGxlSW52ZXJ0ID0gISF2YWx1ZS5pbnZlcnRcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiBbc2FtcGxlVmFsdWUsIHNhbXBsZUludmVydF1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHZhciBWQUxVRSA9IHNjb3BlLmRlZihcbiAgICAgICAgICAgICAgICAnXCJ2YWx1ZVwiIGluICcsIHZhbHVlLCAnPysnLCB2YWx1ZSwgJy52YWx1ZToxJylcbiAgICAgICAgICAgICAgdmFyIElOVkVSVCA9IHNjb3BlLmRlZignISEnLCB2YWx1ZSwgJy5pbnZlcnQnKVxuICAgICAgICAgICAgICByZXR1cm4gW1ZBTFVFLCBJTlZFUlRdXG4gICAgICAgICAgICB9KVxuICAgICAgfVxuICAgIH0pXG5cbiAgICByZXR1cm4gU1RBVEVcbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlVW5pZm9ybXMgKHVuaWZvcm1zLCBlbnYpIHtcbiAgICB2YXIgc3RhdGljVW5pZm9ybXMgPSB1bmlmb3Jtcy5zdGF0aWNcbiAgICB2YXIgZHluYW1pY1VuaWZvcm1zID0gdW5pZm9ybXMuZHluYW1pY1xuXG4gICAgdmFyIFVOSUZPUk1TID0ge31cblxuICAgIE9iamVjdC5rZXlzKHN0YXRpY1VuaWZvcm1zKS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICB2YXIgdmFsdWUgPSBzdGF0aWNVbmlmb3Jtc1tuYW1lXVxuICAgICAgdmFyIHJlc3VsdFxuICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicgfHxcbiAgICAgICAgICB0eXBlb2YgdmFsdWUgPT09ICdib29sZWFuJykge1xuICAgICAgICByZXN1bHQgPSBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICByZXR1cm4gdmFsdWVcbiAgICAgICAgfSlcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIHZhbHVlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIHZhciByZWdsVHlwZSA9IHZhbHVlLl9yZWdsVHlwZVxuICAgICAgICBpZiAocmVnbFR5cGUgPT09ICd0ZXh0dXJlMmQnIHx8XG4gICAgICAgICAgICByZWdsVHlwZSA9PT0gJ3RleHR1cmVDdWJlJykge1xuICAgICAgICAgIHJlc3VsdCA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudikge1xuICAgICAgICAgICAgcmV0dXJuIGVudi5saW5rKHZhbHVlKVxuICAgICAgICAgIH0pXG4gICAgICAgIH0gZWxzZSBpZiAocmVnbFR5cGUgPT09ICdmcmFtZWJ1ZmZlcicgfHxcbiAgICAgICAgICAgICAgICAgICByZWdsVHlwZSA9PT0gJ2ZyYW1lYnVmZmVyQ3ViZScpIHtcbiAgICAgICAgICBcbiAgICAgICAgICByZXN1bHQgPSBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYpIHtcbiAgICAgICAgICAgIHJldHVybiBlbnYubGluayh2YWx1ZS5jb2xvclswXSlcbiAgICAgICAgICB9KVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIFxuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGlzQXJyYXlMaWtlKHZhbHVlKSkge1xuICAgICAgICByZXN1bHQgPSBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYpIHtcbiAgICAgICAgICB2YXIgSVRFTSA9IGVudi5nbG9iYWwuZGVmKCdbJyxcbiAgICAgICAgICAgIGxvb3AodmFsdWUubGVuZ3RoLCBmdW5jdGlvbiAoaSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlW2ldXG4gICAgICAgICAgICB9KSwgJ10nKVxuICAgICAgICAgIHJldHVybiBJVEVNXG4gICAgICAgIH0pXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBcbiAgICAgIH1cbiAgICAgIHJlc3VsdC52YWx1ZSA9IHZhbHVlXG4gICAgICBVTklGT1JNU1tuYW1lXSA9IHJlc3VsdFxuICAgIH0pXG5cbiAgICBPYmplY3Qua2V5cyhkeW5hbWljVW5pZm9ybXMpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgICAgdmFyIGR5biA9IGR5bmFtaWNVbmlmb3Jtc1trZXldXG4gICAgICBVTklGT1JNU1trZXldID0gY3JlYXRlRHluYW1pY0RlY2woZHluLCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICByZXR1cm4gZW52Lmludm9rZShzY29wZSwgZHluKVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgcmV0dXJuIFVOSUZPUk1TXG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZUF0dHJpYnV0ZXMgKGF0dHJpYnV0ZXMsIGVudikge1xuICAgIHZhciBzdGF0aWNBdHRyaWJ1dGVzID0gYXR0cmlidXRlcy5zdGF0aWNcbiAgICB2YXIgZHluYW1pY0F0dHJpYnV0ZXMgPSBhdHRyaWJ1dGVzLmR5bmFtaWNcblxuICAgIHZhciBhdHRyaWJ1dGVEZWZzID0ge31cblxuICAgIE9iamVjdC5rZXlzKHN0YXRpY0F0dHJpYnV0ZXMpLmZvckVhY2goZnVuY3Rpb24gKGF0dHJpYnV0ZSkge1xuICAgICAgdmFyIHZhbHVlID0gc3RhdGljQXR0cmlidXRlc1thdHRyaWJ1dGVdXG4gICAgICB2YXIgaWQgPSBzdHJpbmdTdG9yZS5pZChhdHRyaWJ1dGUpXG5cbiAgICAgIHZhciByZWNvcmQgPSBuZXcgQXR0cmlidXRlUmVjb3JkKClcbiAgICAgIGlmIChpc0J1ZmZlckFyZ3ModmFsdWUpKSB7XG4gICAgICAgIHJlY29yZC5zdGF0ZSA9IEFUVFJJQl9TVEFURV9QT0lOVEVSXG4gICAgICAgIHJlY29yZC5idWZmZXIgPSBidWZmZXJTdGF0ZS5nZXRCdWZmZXIoXG4gICAgICAgICAgYnVmZmVyU3RhdGUuY3JlYXRlKHZhbHVlLCBHTF9BUlJBWV9CVUZGRVIsIGZhbHNlLCB0cnVlKSlcbiAgICAgICAgcmVjb3JkLnR5cGUgPSAwXG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgYnVmZmVyID0gYnVmZmVyU3RhdGUuZ2V0QnVmZmVyKHZhbHVlKVxuICAgICAgICBpZiAoYnVmZmVyKSB7XG4gICAgICAgICAgcmVjb3JkLnN0YXRlID0gQVRUUklCX1NUQVRFX1BPSU5URVJcbiAgICAgICAgICByZWNvcmQuYnVmZmVyID0gYnVmZmVyXG4gICAgICAgICAgcmVjb3JkLnR5cGUgPSAwXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgXG4gICAgICAgICAgaWYgKHZhbHVlLmNvbnN0YW50KSB7XG4gICAgICAgICAgICB2YXIgY29uc3RhbnQgPSB2YWx1ZS5jb25zdGFudFxuICAgICAgICAgICAgcmVjb3JkLmJ1ZmZlciA9ICdudWxsJ1xuICAgICAgICAgICAgcmVjb3JkLnN0YXRlID0gQVRUUklCX1NUQVRFX0NPTlNUQU5UXG4gICAgICAgICAgICBpZiAodHlwZW9mIGNvbnN0YW50ID09PSAnbnVtYmVyJykge1xuICAgICAgICAgICAgICByZWNvcmQueCA9IGNvbnN0YW50XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgQ1VURV9DT01QT05FTlRTLmZvckVhY2goZnVuY3Rpb24gKGMsIGkpIHtcbiAgICAgICAgICAgICAgICBpZiAoaSA8IGNvbnN0YW50Lmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgcmVjb3JkW2NdID0gY29uc3RhbnRbaV1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGlmIChpc0J1ZmZlckFyZ3ModmFsdWUuYnVmZmVyKSkge1xuICAgICAgICAgICAgICBidWZmZXIgPSBidWZmZXJTdGF0ZS5nZXRCdWZmZXIoXG4gICAgICAgICAgICAgICAgYnVmZmVyU3RhdGUuY3JlYXRlKHZhbHVlLmJ1ZmZlciwgR0xfQVJSQVlfQlVGRkVSLCBmYWxzZSwgdHJ1ZSkpXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBidWZmZXIgPSBidWZmZXJTdGF0ZS5nZXRCdWZmZXIodmFsdWUuYnVmZmVyKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG5cbiAgICAgICAgICAgIHZhciBvZmZzZXQgPSB2YWx1ZS5vZmZzZXQgfCAwXG4gICAgICAgICAgICBcblxuICAgICAgICAgICAgdmFyIHN0cmlkZSA9IHZhbHVlLnN0cmlkZSB8IDBcbiAgICAgICAgICAgIFxuXG4gICAgICAgICAgICB2YXIgc2l6ZSA9IHZhbHVlLnNpemUgfCAwXG4gICAgICAgICAgICBcblxuICAgICAgICAgICAgdmFyIG5vcm1hbGl6ZWQgPSAhIXZhbHVlLm5vcm1hbGl6ZWRcblxuICAgICAgICAgICAgdmFyIHR5cGUgPSAwXG4gICAgICAgICAgICBpZiAoJ3R5cGUnIGluIHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICB0eXBlID0gZ2xUeXBlc1t2YWx1ZS50eXBlXVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgZGl2aXNvciA9IHZhbHVlLmRpdmlzb3IgfCAwXG4gICAgICAgICAgICBpZiAoJ2Rpdmlzb3InIGluIHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgXG5cbiAgICAgICAgICAgIHJlY29yZC5idWZmZXIgPSBidWZmZXJcbiAgICAgICAgICAgIHJlY29yZC5zdGF0ZSA9IEFUVFJJQl9TVEFURV9QT0lOVEVSXG4gICAgICAgICAgICByZWNvcmQuc2l6ZSA9IHNpemVcbiAgICAgICAgICAgIHJlY29yZC5ub3JtYWxpemVkID0gbm9ybWFsaXplZFxuICAgICAgICAgICAgcmVjb3JkLnR5cGUgPSB0eXBlIHx8IGJ1ZmZlci5kdHlwZVxuICAgICAgICAgICAgcmVjb3JkLm9mZnNldCA9IG9mZnNldFxuICAgICAgICAgICAgcmVjb3JkLnN0cmlkZSA9IHN0cmlkZVxuICAgICAgICAgICAgcmVjb3JkLmRpdmlzb3IgPSBkaXZpc29yXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGF0dHJpYnV0ZURlZnNbYXR0cmlidXRlXSA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgdmFyIGNhY2hlID0gZW52LmF0dHJpYkNhY2hlXG4gICAgICAgIGlmIChpZCBpbiBjYWNoZSkge1xuICAgICAgICAgIHJldHVybiBjYWNoZVtpZF1cbiAgICAgICAgfVxuICAgICAgICB2YXIgcmVzdWx0ID0ge1xuICAgICAgICAgIGlzU3RyZWFtOiBmYWxzZVxuICAgICAgICB9XG4gICAgICAgIE9iamVjdC5rZXlzKHJlY29yZCkuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgICAgcmVzdWx0W2tleV0gPSByZWNvcmRba2V5XVxuICAgICAgICB9KVxuICAgICAgICBpZiAocmVjb3JkLmJ1ZmZlcikge1xuICAgICAgICAgIHJlc3VsdC5idWZmZXIgPSBlbnYubGluayhyZWNvcmQuYnVmZmVyKVxuICAgICAgICAgIHJlc3VsdC50eXBlID0gcmVzdWx0LnR5cGUgfHwgKHJlc3VsdC5idWZmZXIgKyAnLmR0eXBlJylcbiAgICAgICAgfVxuICAgICAgICBjYWNoZVtpZF0gPSByZXN1bHRcbiAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgT2JqZWN0LmtleXMoZHluYW1pY0F0dHJpYnV0ZXMpLmZvckVhY2goZnVuY3Rpb24gKGF0dHJpYnV0ZSkge1xuICAgICAgdmFyIGR5biA9IGR5bmFtaWNBdHRyaWJ1dGVzW2F0dHJpYnV0ZV1cblxuICAgICAgZnVuY3Rpb24gYXBwZW5kQXR0cmlidXRlQ29kZSAoZW52LCBibG9jaykge1xuICAgICAgICB2YXIgVkFMVUUgPSBlbnYuaW52b2tlKGJsb2NrLCBkeW4pXG5cbiAgICAgICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcblxuICAgICAgICB2YXIgSVNfQlVGRkVSX0FSR1MgPSBzaGFyZWQuaXNCdWZmZXJBcmdzXG4gICAgICAgIHZhciBCVUZGRVJfU1RBVEUgPSBzaGFyZWQuYnVmZmVyXG5cbiAgICAgICAgLy8gUGVyZm9ybSB2YWxpZGF0aW9uIG9uIGF0dHJpYnV0ZVxuICAgICAgICBcblxuICAgICAgICAvLyBhbGxvY2F0ZSBuYW1lcyBmb3IgcmVzdWx0XG4gICAgICAgIHZhciByZXN1bHQgPSB7XG4gICAgICAgICAgaXNTdHJlYW06IGJsb2NrLmRlZihmYWxzZSlcbiAgICAgICAgfVxuICAgICAgICB2YXIgZGVmYXVsdFJlY29yZCA9IG5ldyBBdHRyaWJ1dGVSZWNvcmQoKVxuICAgICAgICBkZWZhdWx0UmVjb3JkLnN0YXRlID0gQVRUUklCX1NUQVRFX1BPSU5URVJcbiAgICAgICAgT2JqZWN0LmtleXMoZGVmYXVsdFJlY29yZCkuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgICAgcmVzdWx0W2tleV0gPSBibG9jay5kZWYoJycgKyBkZWZhdWx0UmVjb3JkW2tleV0pXG4gICAgICAgIH0pXG5cbiAgICAgICAgdmFyIEJVRkZFUiA9IHJlc3VsdC5idWZmZXJcbiAgICAgICAgdmFyIFRZUEUgPSByZXN1bHQudHlwZVxuICAgICAgICBibG9jayhcbiAgICAgICAgICAnaWYoJywgSVNfQlVGRkVSX0FSR1MsICcoJywgVkFMVUUsICcpKXsnLFxuICAgICAgICAgIHJlc3VsdC5pc1N0cmVhbSwgJz10cnVlOycsXG4gICAgICAgICAgQlVGRkVSLCAnPScsIEJVRkZFUl9TVEFURSwgJy5jcmVhdGVTdHJlYW0oJywgR0xfQVJSQVlfQlVGRkVSLCAnLCcsIFZBTFVFLCAnKTsnLFxuICAgICAgICAgIFRZUEUsICc9JywgQlVGRkVSLCAnLmR0eXBlOycsXG4gICAgICAgICAgJ31lbHNleycsXG4gICAgICAgICAgQlVGRkVSLCAnPScsIEJVRkZFUl9TVEFURSwgJy5nZXRCdWZmZXIoJywgVkFMVUUsICcpOycsXG4gICAgICAgICAgJ2lmKCcsIEJVRkZFUiwgJyl7JyxcbiAgICAgICAgICBUWVBFLCAnPScsIEJVRkZFUiwgJy5kdHlwZTsnLFxuICAgICAgICAgICd9ZWxzZSBpZihcImNvbnN0YW50XCIgaW4gJywgVkFMVUUsICcpeycsXG4gICAgICAgICAgcmVzdWx0LnN0YXRlLCAnPScsIEFUVFJJQl9TVEFURV9DT05TVEFOVCwgJzsnLFxuICAgICAgICAgICdpZih0eXBlb2YgJyArIFZBTFVFICsgJy5jb25zdGFudCA9PT0gXCJudW1iZXJcIil7JyxcbiAgICAgICAgICByZXN1bHRbQ1VURV9DT01QT05FTlRTWzBdXSwgJz0nLCBWQUxVRSwgJy5jb25zdGFudDsnLFxuICAgICAgICAgIENVVEVfQ09NUE9ORU5UUy5zbGljZSgxKS5tYXAoZnVuY3Rpb24gKG4pIHtcbiAgICAgICAgICAgIHJldHVybiByZXN1bHRbbl1cbiAgICAgICAgICB9KS5qb2luKCc9JyksICc9MDsnLFxuICAgICAgICAgICd9ZWxzZXsnLFxuICAgICAgICAgIENVVEVfQ09NUE9ORU5UUy5tYXAoZnVuY3Rpb24gKG5hbWUsIGkpIHtcbiAgICAgICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICAgIHJlc3VsdFtuYW1lXSArICc9JyArIFZBTFVFICsgJy5jb25zdGFudC5sZW5ndGg+PScgKyBpICtcbiAgICAgICAgICAgICAgJz8nICsgVkFMVUUgKyAnLmNvbnN0YW50WycgKyBpICsgJ106MDsnXG4gICAgICAgICAgICApXG4gICAgICAgICAgfSkuam9pbignJyksXG4gICAgICAgICAgJ319ZWxzZXsnLFxuICAgICAgICAgICdpZignLCBJU19CVUZGRVJfQVJHUywgJygnLCBWQUxVRSwgJy5idWZmZXIpKXsnLFxuICAgICAgICAgIEJVRkZFUiwgJz0nLCBCVUZGRVJfU1RBVEUsICcuY3JlYXRlU3RyZWFtKCcsIEdMX0FSUkFZX0JVRkZFUiwgJywnLCBWQUxVRSwgJy5idWZmZXIpOycsXG4gICAgICAgICAgJ31lbHNleycsXG4gICAgICAgICAgQlVGRkVSLCAnPScsIEJVRkZFUl9TVEFURSwgJy5nZXRCdWZmZXIoJywgVkFMVUUsICcuYnVmZmVyKTsnLFxuICAgICAgICAgICd9JyxcbiAgICAgICAgICBUWVBFLCAnPVwidHlwZVwiIGluICcsIFZBTFVFLCAnPycsXG4gICAgICAgICAgc2hhcmVkLmdsVHlwZXMsICdbJywgVkFMVUUsICcudHlwZV06JywgQlVGRkVSLCAnLmR0eXBlOycsXG4gICAgICAgICAgcmVzdWx0Lm5vcm1hbGl6ZWQsICc9ISEnLCBWQUxVRSwgJy5ub3JtYWxpemVkOycpXG4gICAgICAgIGZ1bmN0aW9uIGVtaXRSZWFkUmVjb3JkIChuYW1lKSB7XG4gICAgICAgICAgYmxvY2socmVzdWx0W25hbWVdLCAnPScsIFZBTFVFLCAnLicsIG5hbWUsICd8MDsnKVxuICAgICAgICB9XG4gICAgICAgIGVtaXRSZWFkUmVjb3JkKCdzaXplJylcbiAgICAgICAgZW1pdFJlYWRSZWNvcmQoJ29mZnNldCcpXG4gICAgICAgIGVtaXRSZWFkUmVjb3JkKCdzdHJpZGUnKVxuICAgICAgICBlbWl0UmVhZFJlY29yZCgnZGl2aXNvcicpXG5cbiAgICAgICAgYmxvY2soJ319JylcblxuICAgICAgICBibG9jay5leGl0KFxuICAgICAgICAgICdpZignLCByZXN1bHQuaXNTdHJlYW0sICcpeycsXG4gICAgICAgICAgQlVGRkVSX1NUQVRFLCAnLmRlc3Ryb3lTdHJlYW0oJywgQlVGRkVSLCAnKTsnLFxuICAgICAgICAgICd9JylcblxuICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICB9XG5cbiAgICAgIGF0dHJpYnV0ZURlZnNbYXR0cmlidXRlXSA9IGNyZWF0ZUR5bmFtaWNEZWNsKGR5biwgYXBwZW5kQXR0cmlidXRlQ29kZSlcbiAgICB9KVxuXG4gICAgcmV0dXJuIGF0dHJpYnV0ZURlZnNcbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlQ29udGV4dCAoY29udGV4dCkge1xuICAgIHZhciBzdGF0aWNDb250ZXh0ID0gY29udGV4dC5zdGF0aWNcbiAgICB2YXIgZHluYW1pY0NvbnRleHQgPSBjb250ZXh0LmR5bmFtaWNcbiAgICB2YXIgcmVzdWx0ID0ge31cblxuICAgIE9iamVjdC5rZXlzKHN0YXRpY0NvbnRleHQpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIHZhciB2YWx1ZSA9IHN0YXRpY0NvbnRleHRbbmFtZV1cbiAgICAgIHJlc3VsdFtuYW1lXSA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicgfHwgdHlwZW9mIHZhbHVlID09PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICByZXR1cm4gJycgKyB2YWx1ZVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBlbnYubGluayh2YWx1ZSlcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgT2JqZWN0LmtleXMoZHluYW1pY0NvbnRleHQpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIHZhciBkeW4gPSBkeW5hbWljQ29udGV4dFtuYW1lXVxuICAgICAgcmVzdWx0W25hbWVdID0gY3JlYXRlRHluYW1pY0RlY2woZHluLCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICByZXR1cm4gZW52Lmludm9rZShzY29wZSwgZHluKVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgcmV0dXJuIHJlc3VsdFxuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VBcmd1bWVudHMgKG9wdGlvbnMsIGF0dHJpYnV0ZXMsIHVuaWZvcm1zLCBjb250ZXh0LCBlbnYpIHtcbiAgICB2YXIgc3RhdGljT3B0aW9ucyA9IG9wdGlvbnMuc3RhdGljXG4gICAgdmFyIGR5bmFtaWNPcHRpb25zID0gb3B0aW9ucy5keW5hbWljXG5cbiAgICBcblxuICAgIHZhciBmcmFtZWJ1ZmZlciA9IHBhcnNlRnJhbWVidWZmZXIob3B0aW9ucywgZW52KVxuICAgIHZhciB2aWV3cG9ydEFuZFNjaXNzb3IgPSBwYXJzZVZpZXdwb3J0U2Npc3NvcihvcHRpb25zLCBmcmFtZWJ1ZmZlciwgZW52KVxuICAgIHZhciBkcmF3ID0gcGFyc2VEcmF3KG9wdGlvbnMsIGVudilcbiAgICB2YXIgc3RhdGUgPSBwYXJzZUdMU3RhdGUob3B0aW9ucywgZW52KVxuICAgIHZhciBzaGFkZXIgPSBwYXJzZVByb2dyYW0ob3B0aW9ucywgZW52KVxuXG4gICAgZnVuY3Rpb24gY29weUJveCAobmFtZSkge1xuICAgICAgdmFyIGRlZm4gPSB2aWV3cG9ydEFuZFNjaXNzb3JbbmFtZV1cbiAgICAgIGlmIChkZWZuKSB7XG4gICAgICAgIHN0YXRlW25hbWVdID0gZGVmblxuICAgICAgfVxuICAgIH1cbiAgICBjb3B5Qm94KFNfVklFV1BPUlQpXG4gICAgY29weUJveChwcm9wTmFtZShTX1NDSVNTT1JfQk9YKSlcblxuICAgIHZhciBkaXJ0eSA9IE9iamVjdC5rZXlzKHN0YXRlKS5sZW5ndGggPiAwXG5cbiAgICB2YXIgcmVzdWx0ID0ge1xuICAgICAgZnJhbWVidWZmZXI6IGZyYW1lYnVmZmVyLFxuICAgICAgZHJhdzogZHJhdyxcbiAgICAgIHNoYWRlcjogc2hhZGVyLFxuICAgICAgc3RhdGU6IHN0YXRlLFxuICAgICAgZGlydHk6IGRpcnR5XG4gICAgfVxuXG4gICAgcmVzdWx0LnByb2ZpbGUgPSBwYXJzZVByb2ZpbGUob3B0aW9ucywgZW52KVxuICAgIHJlc3VsdC51bmlmb3JtcyA9IHBhcnNlVW5pZm9ybXModW5pZm9ybXMsIGVudilcbiAgICByZXN1bHQuYXR0cmlidXRlcyA9IHBhcnNlQXR0cmlidXRlcyhhdHRyaWJ1dGVzLCBlbnYpXG4gICAgcmVzdWx0LmNvbnRleHQgPSBwYXJzZUNvbnRleHQoY29udGV4dCwgZW52KVxuICAgIHJldHVybiByZXN1bHRcbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gQ09NTU9OIFVQREFURSBGVU5DVElPTlNcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICBmdW5jdGlvbiBlbWl0Q29udGV4dCAoZW52LCBzY29wZSwgY29udGV4dCkge1xuICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG4gICAgdmFyIENPTlRFWFQgPSBzaGFyZWQuY29udGV4dFxuXG4gICAgdmFyIGNvbnRleHRFbnRlciA9IGVudi5zY29wZSgpXG5cbiAgICBPYmplY3Qua2V5cyhjb250ZXh0KS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICBzY29wZS5zYXZlKENPTlRFWFQsICcuJyArIG5hbWUpXG4gICAgICB2YXIgZGVmbiA9IGNvbnRleHRbbmFtZV1cbiAgICAgIGNvbnRleHRFbnRlcihDT05URVhULCAnLicsIG5hbWUsICc9JywgZGVmbi5hcHBlbmQoZW52LCBzY29wZSksICc7JylcbiAgICB9KVxuXG4gICAgc2NvcGUoY29udGV4dEVudGVyKVxuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBDT01NT04gRFJBV0lORyBGVU5DVElPTlNcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICBmdW5jdGlvbiBlbWl0UG9sbEZyYW1lYnVmZmVyIChlbnYsIHNjb3BlLCBmcmFtZWJ1ZmZlciwgc2tpcENoZWNrKSB7XG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcblxuICAgIHZhciBHTCA9IHNoYXJlZC5nbFxuICAgIHZhciBGUkFNRUJVRkZFUl9TVEFURSA9IHNoYXJlZC5mcmFtZWJ1ZmZlclxuICAgIHZhciBFWFRfRFJBV19CVUZGRVJTXG4gICAgaWYgKGV4dERyYXdCdWZmZXJzKSB7XG4gICAgICBFWFRfRFJBV19CVUZGRVJTID0gc2NvcGUuZGVmKHNoYXJlZC5leHRlbnNpb25zLCAnLndlYmdsX2RyYXdfYnVmZmVycycpXG4gICAgfVxuXG4gICAgdmFyIGNvbnN0YW50cyA9IGVudi5jb25zdGFudHNcblxuICAgIHZhciBEUkFXX0JVRkZFUlMgPSBjb25zdGFudHMuZHJhd0J1ZmZlclxuICAgIHZhciBCQUNLX0JVRkZFUiA9IGNvbnN0YW50cy5iYWNrQnVmZmVyXG5cbiAgICB2YXIgTkVYVFxuICAgIGlmIChmcmFtZWJ1ZmZlcikge1xuICAgICAgTkVYVCA9IGZyYW1lYnVmZmVyLmFwcGVuZChlbnYsIHNjb3BlKVxuICAgIH0gZWxzZSB7XG4gICAgICBORVhUID0gc2NvcGUuZGVmKEZSQU1FQlVGRkVSX1NUQVRFLCAnLm5leHQnKVxuICAgIH1cblxuICAgIGlmICghc2tpcENoZWNrKSB7XG4gICAgICBzY29wZSgnaWYoJywgTkVYVCwgJyE9PScsIEZSQU1FQlVGRkVSX1NUQVRFLCAnLmN1cil7JylcbiAgICB9XG4gICAgc2NvcGUoXG4gICAgICAnaWYoJywgTkVYVCwgJyl7JyxcbiAgICAgIEdMLCAnLmJpbmRGcmFtZWJ1ZmZlcignLCBHTF9GUkFNRUJVRkZFUiwgJywnLCBORVhULCAnLmZyYW1lYnVmZmVyKTsnKVxuICAgIGlmIChleHREcmF3QnVmZmVycykge1xuICAgICAgc2NvcGUoRVhUX0RSQVdfQlVGRkVSUywgJy5kcmF3QnVmZmVyc1dFQkdMKCcsXG4gICAgICAgIERSQVdfQlVGRkVSUywgJ1snLCBORVhULCAnLmNvbG9yQXR0YWNobWVudHMubGVuZ3RoXSk7JylcbiAgICB9XG4gICAgc2NvcGUoJ31lbHNleycsXG4gICAgICBHTCwgJy5iaW5kRnJhbWVidWZmZXIoJywgR0xfRlJBTUVCVUZGRVIsICcsbnVsbCk7JylcbiAgICBpZiAoZXh0RHJhd0J1ZmZlcnMpIHtcbiAgICAgIHNjb3BlKEVYVF9EUkFXX0JVRkZFUlMsICcuZHJhd0J1ZmZlcnNXRUJHTCgnLCBCQUNLX0JVRkZFUiwgJyk7JylcbiAgICB9XG4gICAgc2NvcGUoXG4gICAgICAnfScsXG4gICAgICBGUkFNRUJVRkZFUl9TVEFURSwgJy5jdXI9JywgTkVYVCwgJzsnKVxuICAgIGlmICghc2tpcENoZWNrKSB7XG4gICAgICBzY29wZSgnfScpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZW1pdFBvbGxTdGF0ZSAoZW52LCBzY29wZSwgYXJncykge1xuICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG5cbiAgICB2YXIgR0wgPSBzaGFyZWQuZ2xcblxuICAgIHZhciBDVVJSRU5UX1ZBUlMgPSBlbnYuY3VycmVudFxuICAgIHZhciBORVhUX1ZBUlMgPSBlbnYubmV4dFxuICAgIHZhciBDVVJSRU5UX1NUQVRFID0gc2hhcmVkLmN1cnJlbnRcbiAgICB2YXIgTkVYVF9TVEFURSA9IHNoYXJlZC5uZXh0XG5cbiAgICB2YXIgYmxvY2sgPSBlbnYuY29uZChDVVJSRU5UX1NUQVRFLCAnLmRpcnR5JylcblxuICAgIEdMX1NUQVRFX05BTUVTLmZvckVhY2goZnVuY3Rpb24gKHByb3ApIHtcbiAgICAgIHZhciBwYXJhbSA9IHByb3BOYW1lKHByb3ApXG4gICAgICBpZiAocGFyYW0gaW4gYXJncy5zdGF0ZSkge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cblxuICAgICAgdmFyIE5FWFQsIENVUlJFTlRcbiAgICAgIGlmIChwYXJhbSBpbiBORVhUX1ZBUlMpIHtcbiAgICAgICAgTkVYVCA9IE5FWFRfVkFSU1twYXJhbV1cbiAgICAgICAgQ1VSUkVOVCA9IENVUlJFTlRfVkFSU1twYXJhbV1cbiAgICAgICAgdmFyIHBhcnRzID0gbG9vcChjdXJyZW50U3RhdGVbcGFyYW1dLmxlbmd0aCwgZnVuY3Rpb24gKGkpIHtcbiAgICAgICAgICByZXR1cm4gYmxvY2suZGVmKE5FWFQsICdbJywgaSwgJ10nKVxuICAgICAgICB9KVxuICAgICAgICBibG9jayhlbnYuY29uZChwYXJ0cy5tYXAoZnVuY3Rpb24gKHAsIGkpIHtcbiAgICAgICAgICByZXR1cm4gcCArICchPT0nICsgQ1VSUkVOVCArICdbJyArIGkgKyAnXSdcbiAgICAgICAgfSkuam9pbignfHwnKSlcbiAgICAgICAgICAudGhlbihcbiAgICAgICAgICAgIEdMLCAnLicsIEdMX1ZBUklBQkxFU1twYXJhbV0sICcoJywgcGFydHMsICcpOycsXG4gICAgICAgICAgICBwYXJ0cy5tYXAoZnVuY3Rpb24gKHAsIGkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIENVUlJFTlQgKyAnWycgKyBpICsgJ109JyArIHBcbiAgICAgICAgICAgIH0pLmpvaW4oJzsnKSwgJzsnKSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIE5FWFQgPSBibG9jay5kZWYoTkVYVF9TVEFURSwgJy4nLCBwYXJhbSlcbiAgICAgICAgdmFyIGlmdGUgPSBlbnYuY29uZChORVhULCAnIT09JywgQ1VSUkVOVF9TVEFURSwgJy4nLCBwYXJhbSlcbiAgICAgICAgYmxvY2soaWZ0ZSlcbiAgICAgICAgaWYgKHBhcmFtIGluIEdMX0ZMQUdTKSB7XG4gICAgICAgICAgaWZ0ZShcbiAgICAgICAgICAgIGVudi5jb25kKE5FWFQpXG4gICAgICAgICAgICAgICAgLnRoZW4oR0wsICcuZW5hYmxlKCcsIEdMX0ZMQUdTW3BhcmFtXSwgJyk7JylcbiAgICAgICAgICAgICAgICAuZWxzZShHTCwgJy5kaXNhYmxlKCcsIEdMX0ZMQUdTW3BhcmFtXSwgJyk7JyksXG4gICAgICAgICAgICBDVVJSRU5UX1NUQVRFLCAnLicsIHBhcmFtLCAnPScsIE5FWFQsICc7JylcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZnRlKFxuICAgICAgICAgICAgR0wsICcuJywgR0xfVkFSSUFCTEVTW3BhcmFtXSwgJygnLCBORVhULCAnKTsnLFxuICAgICAgICAgICAgQ1VSUkVOVF9TVEFURSwgJy4nLCBwYXJhbSwgJz0nLCBORVhULCAnOycpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KVxuICAgIGlmIChPYmplY3Qua2V5cyhhcmdzLnN0YXRlKS5sZW5ndGggPT09IDApIHtcbiAgICAgIGJsb2NrKENVUlJFTlRfU1RBVEUsICcuZGlydHk9ZmFsc2U7JylcbiAgICB9XG4gICAgc2NvcGUoYmxvY2spXG4gIH1cblxuICBmdW5jdGlvbiBlbWl0U2V0T3B0aW9ucyAoZW52LCBzY29wZSwgb3B0aW9ucywgZmlsdGVyKSB7XG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcbiAgICB2YXIgQ1VSUkVOVF9WQVJTID0gZW52LmN1cnJlbnRcbiAgICB2YXIgQ1VSUkVOVF9TVEFURSA9IHNoYXJlZC5jdXJyZW50XG4gICAgdmFyIEdMID0gc2hhcmVkLmdsXG4gICAgc29ydFN0YXRlKE9iamVjdC5rZXlzKG9wdGlvbnMpKS5mb3JFYWNoKGZ1bmN0aW9uIChwYXJhbSkge1xuICAgICAgdmFyIGRlZm4gPSBvcHRpb25zW3BhcmFtXVxuICAgICAgaWYgKGZpbHRlciAmJiAhZmlsdGVyKGRlZm4pKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgICAgdmFyIHZhcmlhYmxlID0gZGVmbi5hcHBlbmQoZW52LCBzY29wZSlcbiAgICAgIGlmIChHTF9GTEFHU1twYXJhbV0pIHtcbiAgICAgICAgdmFyIGZsYWcgPSBHTF9GTEFHU1twYXJhbV1cbiAgICAgICAgaWYgKGlzU3RhdGljKGRlZm4pKSB7XG4gICAgICAgICAgaWYgKHZhcmlhYmxlKSB7XG4gICAgICAgICAgICBzY29wZShHTCwgJy5lbmFibGUoJywgZmxhZywgJyk7JylcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc2NvcGUoR0wsICcuZGlzYWJsZSgnLCBmbGFnLCAnKTsnKVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzY29wZShlbnYuY29uZCh2YXJpYWJsZSlcbiAgICAgICAgICAgIC50aGVuKEdMLCAnLmVuYWJsZSgnLCBmbGFnLCAnKTsnKVxuICAgICAgICAgICAgLmVsc2UoR0wsICcuZGlzYWJsZSgnLCBmbGFnLCAnKTsnKSlcbiAgICAgICAgfVxuICAgICAgICBzY29wZShDVVJSRU5UX1NUQVRFLCAnLicsIHBhcmFtLCAnPScsIHZhcmlhYmxlLCAnOycpXG4gICAgICB9IGVsc2UgaWYgKGlzQXJyYXlMaWtlKHZhcmlhYmxlKSkge1xuICAgICAgICB2YXIgQ1VSUkVOVCA9IENVUlJFTlRfVkFSU1twYXJhbV1cbiAgICAgICAgc2NvcGUoXG4gICAgICAgICAgR0wsICcuJywgR0xfVkFSSUFCTEVTW3BhcmFtXSwgJygnLCB2YXJpYWJsZSwgJyk7JyxcbiAgICAgICAgICB2YXJpYWJsZS5tYXAoZnVuY3Rpb24gKHYsIGkpIHtcbiAgICAgICAgICAgIHJldHVybiBDVVJSRU5UICsgJ1snICsgaSArICddPScgKyB2XG4gICAgICAgICAgfSkuam9pbignOycpLCAnOycpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzY29wZShcbiAgICAgICAgICBHTCwgJy4nLCBHTF9WQVJJQUJMRVNbcGFyYW1dLCAnKCcsIHZhcmlhYmxlLCAnKTsnLFxuICAgICAgICAgIENVUlJFTlRfU1RBVEUsICcuJywgcGFyYW0sICc9JywgdmFyaWFibGUsICc7JylcbiAgICAgIH1cbiAgICB9KVxuICB9XG5cbiAgZnVuY3Rpb24gaW5qZWN0RXh0ZW5zaW9ucyAoZW52LCBzY29wZSkge1xuICAgIGlmIChleHRJbnN0YW5jaW5nKSB7XG4gICAgICBlbnYuaW5zdGFuY2luZyA9IHNjb3BlLmRlZihcbiAgICAgICAgZW52LnNoYXJlZC5leHRlbnNpb25zLCAnLmFuZ2xlX2luc3RhbmNlZF9hcnJheXMnKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGVtaXRQcm9maWxlIChlbnYsIHNjb3BlLCBhcmdzLCB1c2VTY29wZSwgaW5jcmVtZW50Q291bnRlcikge1xuICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG4gICAgdmFyIFNUQVRTID0gZW52LnN0YXRzXG4gICAgdmFyIENVUlJFTlRfU1RBVEUgPSBzaGFyZWQuY3VycmVudFxuICAgIHZhciBUSU1FUiA9IHNoYXJlZC50aW1lclxuICAgIHZhciBwcm9maWxlQXJnID0gYXJncy5wcm9maWxlXG5cbiAgICBmdW5jdGlvbiBwZXJmQ291bnRlciAoKSB7XG4gICAgICBpZiAodHlwZW9mIHBlcmZvcm1hbmNlID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICByZXR1cm4gJ0RhdGUubm93KCknXG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gJ3BlcmZvcm1hbmNlLm5vdygpJ1xuICAgICAgfVxuICAgIH1cblxuICAgIHZhciBDUFVfU1RBUlQsIFFVRVJZX0NPVU5URVJcbiAgICBmdW5jdGlvbiBlbWl0UHJvZmlsZVN0YXJ0IChibG9jaykge1xuICAgICAgQ1BVX1NUQVJUID0gc2NvcGUuZGVmKClcbiAgICAgIGJsb2NrKENQVV9TVEFSVCwgJz0nLCBwZXJmQ291bnRlcigpLCAnOycpXG4gICAgICBpZiAodHlwZW9mIGluY3JlbWVudENvdW50ZXIgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGJsb2NrKFNUQVRTLCAnLmNvdW50Kz0nLCBpbmNyZW1lbnRDb3VudGVyLCAnOycpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBibG9jayhTVEFUUywgJy5jb3VudCsrOycpXG4gICAgICB9XG4gICAgICBpZiAodGltZXIpIHtcbiAgICAgICAgaWYgKHVzZVNjb3BlKSB7XG4gICAgICAgICAgUVVFUllfQ09VTlRFUiA9IHNjb3BlLmRlZigpXG4gICAgICAgICAgYmxvY2soUVVFUllfQ09VTlRFUiwgJz0nLCBUSU1FUiwgJy5nZXROdW1QZW5kaW5nUXVlcmllcygpOycpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgYmxvY2soVElNRVIsICcuYmVnaW5RdWVyeSgnLCBTVEFUUywgJyk7JylcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGVtaXRQcm9maWxlRW5kIChibG9jaykge1xuICAgICAgYmxvY2soU1RBVFMsICcuY3B1VGltZSs9JywgcGVyZkNvdW50ZXIoKSwgJy0nLCBDUFVfU1RBUlQsICc7JylcbiAgICAgIGlmICh0aW1lcikge1xuICAgICAgICBpZiAodXNlU2NvcGUpIHtcbiAgICAgICAgICBibG9jayhUSU1FUiwgJy5wdXNoU2NvcGVTdGF0cygnLFxuICAgICAgICAgICAgUVVFUllfQ09VTlRFUiwgJywnLFxuICAgICAgICAgICAgVElNRVIsICcuZ2V0TnVtUGVuZGluZ1F1ZXJpZXMoKSwnLFxuICAgICAgICAgICAgU1RBVFMsICcpOycpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgYmxvY2soVElNRVIsICcuZW5kUXVlcnkoKTsnKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc2NvcGVQcm9maWxlICh2YWx1ZSkge1xuICAgICAgdmFyIHByZXYgPSBzY29wZS5kZWYoQ1VSUkVOVF9TVEFURSwgJy5wcm9maWxlJylcbiAgICAgIHNjb3BlKENVUlJFTlRfU1RBVEUsICcucHJvZmlsZT0nLCB2YWx1ZSwgJzsnKVxuICAgICAgc2NvcGUuZXhpdChDVVJSRU5UX1NUQVRFLCAnLnByb2ZpbGU9JywgcHJldiwgJzsnKVxuICAgIH1cblxuICAgIHZhciBVU0VfUFJPRklMRVxuICAgIGlmIChwcm9maWxlQXJnKSB7XG4gICAgICBpZiAoaXNTdGF0aWMocHJvZmlsZUFyZykpIHtcbiAgICAgICAgaWYgKHByb2ZpbGVBcmcuZW5hYmxlKSB7XG4gICAgICAgICAgZW1pdFByb2ZpbGVTdGFydChzY29wZSlcbiAgICAgICAgICBlbWl0UHJvZmlsZUVuZChzY29wZS5leGl0KVxuICAgICAgICAgIHNjb3BlUHJvZmlsZSgndHJ1ZScpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgc2NvcGVQcm9maWxlKCdmYWxzZScpXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgICBVU0VfUFJPRklMRSA9IHByb2ZpbGVBcmcuYXBwZW5kKGVudiwgc2NvcGUpXG4gICAgICBzY29wZVByb2ZpbGUoVVNFX1BST0ZJTEUpXG4gICAgfSBlbHNlIHtcbiAgICAgIFVTRV9QUk9GSUxFID0gc2NvcGUuZGVmKENVUlJFTlRfU1RBVEUsICcucHJvZmlsZScpXG4gICAgfVxuXG4gICAgdmFyIHN0YXJ0ID0gZW52LmJsb2NrKClcbiAgICBlbWl0UHJvZmlsZVN0YXJ0KHN0YXJ0KVxuICAgIHNjb3BlKCdpZignLCBVU0VfUFJPRklMRSwgJyl7Jywgc3RhcnQsICd9JylcbiAgICB2YXIgZW5kID0gZW52LmJsb2NrKClcbiAgICBlbWl0UHJvZmlsZUVuZChlbmQpXG4gICAgc2NvcGUuZXhpdCgnaWYoJywgVVNFX1BST0ZJTEUsICcpeycsIGVuZCwgJ30nKVxuICB9XG5cbiAgZnVuY3Rpb24gZW1pdEF0dHJpYnV0ZXMgKGVudiwgc2NvcGUsIGFyZ3MsIGF0dHJpYnV0ZXMsIGZpbHRlcikge1xuICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG5cbiAgICBmdW5jdGlvbiB0eXBlTGVuZ3RoICh4KSB7XG4gICAgICBzd2l0Y2ggKHgpIHtcbiAgICAgICAgY2FzZSBHTF9GTE9BVF9WRUMyOlxuICAgICAgICBjYXNlIEdMX0lOVF9WRUMyOlxuICAgICAgICBjYXNlIEdMX0JPT0xfVkVDMjpcbiAgICAgICAgICByZXR1cm4gMlxuICAgICAgICBjYXNlIEdMX0ZMT0FUX1ZFQzM6XG4gICAgICAgIGNhc2UgR0xfSU5UX1ZFQzM6XG4gICAgICAgIGNhc2UgR0xfQk9PTF9WRUMzOlxuICAgICAgICAgIHJldHVybiAzXG4gICAgICAgIGNhc2UgR0xfRkxPQVRfVkVDNDpcbiAgICAgICAgY2FzZSBHTF9JTlRfVkVDNDpcbiAgICAgICAgY2FzZSBHTF9CT09MX1ZFQzQ6XG4gICAgICAgICAgcmV0dXJuIDRcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICByZXR1cm4gMVxuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGVtaXRCaW5kQXR0cmlidXRlIChBVFRSSUJVVEUsIHNpemUsIHJlY29yZCkge1xuICAgICAgdmFyIEdMID0gc2hhcmVkLmdsXG5cbiAgICAgIHZhciBMT0NBVElPTiA9IHNjb3BlLmRlZihBVFRSSUJVVEUsICcubG9jYXRpb24nKVxuICAgICAgdmFyIEJJTkRJTkcgPSBzY29wZS5kZWYoc2hhcmVkLmF0dHJpYnV0ZXMsICdbJywgTE9DQVRJT04sICddJylcblxuICAgICAgdmFyIFNUQVRFID0gcmVjb3JkLnN0YXRlXG4gICAgICB2YXIgQlVGRkVSID0gcmVjb3JkLmJ1ZmZlclxuICAgICAgdmFyIENPTlNUX0NPTVBPTkVOVFMgPSBbXG4gICAgICAgIHJlY29yZC54LFxuICAgICAgICByZWNvcmQueSxcbiAgICAgICAgcmVjb3JkLnosXG4gICAgICAgIHJlY29yZC53XG4gICAgICBdXG5cbiAgICAgIHZhciBDT01NT05fS0VZUyA9IFtcbiAgICAgICAgJ2J1ZmZlcicsXG4gICAgICAgICdub3JtYWxpemVkJyxcbiAgICAgICAgJ29mZnNldCcsXG4gICAgICAgICdzdHJpZGUnXG4gICAgICBdXG5cbiAgICAgIGZ1bmN0aW9uIGVtaXRCdWZmZXIgKCkge1xuICAgICAgICBzY29wZShcbiAgICAgICAgICAnaWYoIScsIEJJTkRJTkcsICcuYnVmZmVyKXsnLFxuICAgICAgICAgIEdMLCAnLmVuYWJsZVZlcnRleEF0dHJpYkFycmF5KCcsIExPQ0FUSU9OLCAnKTt9JylcblxuICAgICAgICB2YXIgVFlQRSA9IHJlY29yZC50eXBlXG4gICAgICAgIHZhciBTSVpFXG4gICAgICAgIGlmICghcmVjb3JkLnNpemUpIHtcbiAgICAgICAgICBTSVpFID0gc2l6ZVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIFNJWkUgPSBzY29wZS5kZWYocmVjb3JkLnNpemUsICd8fCcsIHNpemUpXG4gICAgICAgIH1cblxuICAgICAgICBzY29wZSgnaWYoJyxcbiAgICAgICAgICBCSU5ESU5HLCAnLnR5cGUhPT0nLCBUWVBFLCAnfHwnLFxuICAgICAgICAgIEJJTkRJTkcsICcuc2l6ZSE9PScsIFNJWkUsICd8fCcsXG4gICAgICAgICAgQ09NTU9OX0tFWVMubWFwKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgICAgIHJldHVybiBCSU5ESU5HICsgJy4nICsga2V5ICsgJyE9PScgKyByZWNvcmRba2V5XVxuICAgICAgICAgIH0pLmpvaW4oJ3x8JyksXG4gICAgICAgICAgJyl7JyxcbiAgICAgICAgICBHTCwgJy5iaW5kQnVmZmVyKCcsIEdMX0FSUkFZX0JVRkZFUiwgJywnLCBCVUZGRVIsICcuYnVmZmVyKTsnLFxuICAgICAgICAgIEdMLCAnLnZlcnRleEF0dHJpYlBvaW50ZXIoJywgW1xuICAgICAgICAgICAgTE9DQVRJT04sXG4gICAgICAgICAgICBTSVpFLFxuICAgICAgICAgICAgVFlQRSxcbiAgICAgICAgICAgIHJlY29yZC5ub3JtYWxpemVkLFxuICAgICAgICAgICAgcmVjb3JkLnN0cmlkZSxcbiAgICAgICAgICAgIHJlY29yZC5vZmZzZXRcbiAgICAgICAgICBdLCAnKTsnLFxuICAgICAgICAgIEJJTkRJTkcsICcudHlwZT0nLCBUWVBFLCAnOycsXG4gICAgICAgICAgQklORElORywgJy5zaXplPScsIFNJWkUsICc7JyxcbiAgICAgICAgICBDT01NT05fS0VZUy5tYXAoZnVuY3Rpb24gKGtleSkge1xuICAgICAgICAgICAgcmV0dXJuIEJJTkRJTkcgKyAnLicgKyBrZXkgKyAnPScgKyByZWNvcmRba2V5XSArICc7J1xuICAgICAgICAgIH0pLmpvaW4oJycpLFxuICAgICAgICAgICd9JylcblxuICAgICAgICBpZiAoZXh0SW5zdGFuY2luZykge1xuICAgICAgICAgIHZhciBESVZJU09SID0gcmVjb3JkLmRpdmlzb3JcbiAgICAgICAgICBzY29wZShcbiAgICAgICAgICAgICdpZignLCBCSU5ESU5HLCAnLmRpdmlzb3IhPT0nLCBESVZJU09SLCAnKXsnLFxuICAgICAgICAgICAgZW52Lmluc3RhbmNpbmcsICcudmVydGV4QXR0cmliRGl2aXNvckFOR0xFKCcsIFtMT0NBVElPTiwgRElWSVNPUl0sICcpOycsXG4gICAgICAgICAgICBCSU5ESU5HLCAnLmRpdmlzb3I9JywgRElWSVNPUiwgJzt9JylcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBmdW5jdGlvbiBlbWl0Q29uc3RhbnQgKCkge1xuICAgICAgICBzY29wZShcbiAgICAgICAgICAnaWYoJywgQklORElORywgJy5idWZmZXIpeycsXG4gICAgICAgICAgR0wsICcuZGlzYWJsZVZlcnRleEF0dHJpYkFycmF5KCcsIExPQ0FUSU9OLCAnKTsnLFxuICAgICAgICAgICd9aWYoJywgQ1VURV9DT01QT05FTlRTLm1hcChmdW5jdGlvbiAoYywgaSkge1xuICAgICAgICAgICAgcmV0dXJuIEJJTkRJTkcgKyAnLicgKyBjICsgJyE9PScgKyBDT05TVF9DT01QT05FTlRTW2ldXG4gICAgICAgICAgfSkuam9pbignfHwnKSwgJyl7JyxcbiAgICAgICAgICBHTCwgJy52ZXJ0ZXhBdHRyaWI0ZignLCBMT0NBVElPTiwgJywnLCBDT05TVF9DT01QT05FTlRTLCAnKTsnLFxuICAgICAgICAgIENVVEVfQ09NUE9ORU5UUy5tYXAoZnVuY3Rpb24gKGMsIGkpIHtcbiAgICAgICAgICAgIHJldHVybiBCSU5ESU5HICsgJy4nICsgYyArICc9JyArIENPTlNUX0NPTVBPTkVOVFNbaV0gKyAnOydcbiAgICAgICAgICB9KS5qb2luKCcnKSxcbiAgICAgICAgICAnfScpXG4gICAgICB9XG5cbiAgICAgIGlmIChTVEFURSA9PT0gQVRUUklCX1NUQVRFX1BPSU5URVIpIHtcbiAgICAgICAgZW1pdEJ1ZmZlcigpXG4gICAgICB9IGVsc2UgaWYgKFNUQVRFID09PSBBVFRSSUJfU1RBVEVfQ09OU1RBTlQpIHtcbiAgICAgICAgZW1pdENvbnN0YW50KClcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNjb3BlKCdpZignLCBTVEFURSwgJz09PScsIEFUVFJJQl9TVEFURV9QT0lOVEVSLCAnKXsnKVxuICAgICAgICBlbWl0QnVmZmVyKClcbiAgICAgICAgc2NvcGUoJ31lbHNleycpXG4gICAgICAgIGVtaXRDb25zdGFudCgpXG4gICAgICAgIHNjb3BlKCd9JylcbiAgICAgIH1cbiAgICB9XG5cbiAgICBhdHRyaWJ1dGVzLmZvckVhY2goZnVuY3Rpb24gKGF0dHJpYnV0ZSkge1xuICAgICAgdmFyIG5hbWUgPSBhdHRyaWJ1dGUubmFtZVxuICAgICAgdmFyIGFyZyA9IGFyZ3MuYXR0cmlidXRlc1tuYW1lXVxuICAgICAgdmFyIHJlY29yZFxuICAgICAgaWYgKGFyZykge1xuICAgICAgICBpZiAoIWZpbHRlcihhcmcpKSB7XG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cbiAgICAgICAgcmVjb3JkID0gYXJnLmFwcGVuZChlbnYsIHNjb3BlKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKCFmaWx0ZXIoU0NPUEVfREVDTCkpIHtcbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuICAgICAgICB2YXIgc2NvcGVBdHRyaWIgPSBlbnYuc2NvcGVBdHRyaWIobmFtZSlcbiAgICAgICAgXG4gICAgICAgIHJlY29yZCA9IHt9XG4gICAgICAgIE9iamVjdC5rZXlzKG5ldyBBdHRyaWJ1dGVSZWNvcmQoKSkuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgICAgcmVjb3JkW2tleV0gPSBzY29wZS5kZWYoc2NvcGVBdHRyaWIsICcuJywga2V5KVxuICAgICAgICB9KVxuICAgICAgfVxuICAgICAgZW1pdEJpbmRBdHRyaWJ1dGUoXG4gICAgICAgIGVudi5saW5rKGF0dHJpYnV0ZSksIHR5cGVMZW5ndGgoYXR0cmlidXRlLmluZm8udHlwZSksIHJlY29yZClcbiAgICB9KVxuICB9XG5cbiAgZnVuY3Rpb24gZW1pdFVuaWZvcm1zIChlbnYsIHNjb3BlLCBhcmdzLCB1bmlmb3JtcywgZmlsdGVyKSB7XG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcbiAgICB2YXIgR0wgPSBzaGFyZWQuZ2xcblxuICAgIHZhciBpbmZpeFxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdW5pZm9ybXMubGVuZ3RoOyArK2kpIHtcbiAgICAgIHZhciB1bmlmb3JtID0gdW5pZm9ybXNbaV1cbiAgICAgIHZhciBuYW1lID0gdW5pZm9ybS5uYW1lXG4gICAgICB2YXIgdHlwZSA9IHVuaWZvcm0uaW5mby50eXBlXG4gICAgICB2YXIgYXJnID0gYXJncy51bmlmb3Jtc1tuYW1lXVxuICAgICAgdmFyIFVOSUZPUk0gPSBlbnYubGluayh1bmlmb3JtKVxuICAgICAgdmFyIExPQ0FUSU9OID0gVU5JRk9STSArICcubG9jYXRpb24nXG5cbiAgICAgIHZhciBWQUxVRVxuICAgICAgaWYgKGFyZykge1xuICAgICAgICBpZiAoIWZpbHRlcihhcmcpKSB7XG4gICAgICAgICAgY29udGludWVcbiAgICAgICAgfVxuICAgICAgICBpZiAoaXNTdGF0aWMoYXJnKSkge1xuICAgICAgICAgIHZhciB2YWx1ZSA9IGFyZy52YWx1ZVxuICAgICAgICAgIFxuICAgICAgICAgIGlmICh0eXBlID09PSBHTF9TQU1QTEVSXzJEIHx8IHR5cGUgPT09IEdMX1NBTVBMRVJfQ1VCRSkge1xuICAgICAgICAgICAgXG4gICAgICAgICAgICB2YXIgVEVYX1ZBTFVFID0gZW52LmxpbmsodmFsdWUuX3RleHR1cmUgfHwgdmFsdWUuY29sb3JbMF0uX3RleHR1cmUpXG4gICAgICAgICAgICBzY29wZShHTCwgJy51bmlmb3JtMWkoJywgTE9DQVRJT04sICcsJywgVEVYX1ZBTFVFICsgJy5iaW5kKCkpOycpXG4gICAgICAgICAgICBzY29wZS5leGl0KFRFWF9WQUxVRSwgJy51bmJpbmQoKTsnKVxuICAgICAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgICAgICB0eXBlID09PSBHTF9GTE9BVF9NQVQyIHx8XG4gICAgICAgICAgICB0eXBlID09PSBHTF9GTE9BVF9NQVQzIHx8XG4gICAgICAgICAgICB0eXBlID09PSBHTF9GTE9BVF9NQVQ0KSB7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHZhciBNQVRfVkFMVUUgPSBlbnYuZ2xvYmFsLmRlZignbmV3IEZsb2F0MzJBcnJheShbJyArXG4gICAgICAgICAgICAgIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKHZhbHVlKSArICddKScpXG4gICAgICAgICAgICB2YXIgZGltID0gMlxuICAgICAgICAgICAgaWYgKHR5cGUgPT09IEdMX0ZMT0FUX01BVDMpIHtcbiAgICAgICAgICAgICAgZGltID0gM1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlID09PSBHTF9GTE9BVF9NQVQ0KSB7XG4gICAgICAgICAgICAgIGRpbSA9IDRcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHNjb3BlKFxuICAgICAgICAgICAgICBHTCwgJy51bmlmb3JtTWF0cml4JywgZGltLCAnZnYoJyxcbiAgICAgICAgICAgICAgTE9DQVRJT04sICcsZmFsc2UsJywgTUFUX1ZBTFVFLCAnKTsnKVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzd2l0Y2ggKHR5cGUpIHtcbiAgICAgICAgICAgICAgY2FzZSBHTF9GTE9BVDpcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICcxZidcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICBjYXNlIEdMX0ZMT0FUX1ZFQzI6XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaW5maXggPSAnMmYnXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgY2FzZSBHTF9GTE9BVF9WRUMzOlxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGluZml4ID0gJzNmJ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgIGNhc2UgR0xfRkxPQVRfVkVDNDpcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICc0ZidcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICBjYXNlIEdMX0JPT0w6XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaW5maXggPSAnMWknXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgY2FzZSBHTF9JTlQ6XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaW5maXggPSAnMWknXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgY2FzZSBHTF9CT09MX1ZFQzI6XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaW5maXggPSAnMmknXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgY2FzZSBHTF9JTlRfVkVDMjpcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICcyaSdcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICBjYXNlIEdMX0JPT0xfVkVDMzpcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICczaSdcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICBjYXNlIEdMX0lOVF9WRUMzOlxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGluZml4ID0gJzNpJ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgIGNhc2UgR0xfQk9PTF9WRUM0OlxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGluZml4ID0gJzRpJ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgIGNhc2UgR0xfSU5UX1ZFQzQ6XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaW5maXggPSAnNGknXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHNjb3BlKEdMLCAnLnVuaWZvcm0nLCBpbmZpeCwgJygnLCBMT0NBVElPTiwgJywnLFxuICAgICAgICAgICAgICBpc0FycmF5TGlrZSh2YWx1ZSkgPyBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbCh2YWx1ZSkgOiB2YWx1ZSxcbiAgICAgICAgICAgICAgJyk7JylcbiAgICAgICAgICB9XG4gICAgICAgICAgY29udGludWVcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBWQUxVRSA9IGFyZy5hcHBlbmQoZW52LCBzY29wZSlcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKCFmaWx0ZXIoU0NPUEVfREVDTCkpIHtcbiAgICAgICAgICBjb250aW51ZVxuICAgICAgICB9XG4gICAgICAgIFZBTFVFID0gc2NvcGUuZGVmKHNoYXJlZC51bmlmb3JtcywgJ1snLCBzdHJpbmdTdG9yZS5pZChuYW1lKSwgJ10nKVxuICAgICAgfVxuXG4gICAgICBpZiAodHlwZSA9PT0gR0xfU0FNUExFUl8yRCkge1xuICAgICAgICBzY29wZShcbiAgICAgICAgICAnaWYoJywgVkFMVUUsICcmJicsIFZBTFVFLCAnLl9yZWdsVHlwZT09PVwiZnJhbWVidWZmZXJcIil7JyxcbiAgICAgICAgICBWQUxVRSwgJz0nLCBWQUxVRSwgJy5jb2xvclswXTsnLFxuICAgICAgICAgICd9JylcbiAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gR0xfU0FNUExFUl9DVUJFKSB7XG4gICAgICAgIHNjb3BlKFxuICAgICAgICAgICdpZignLCBWQUxVRSwgJyYmJywgVkFMVUUsICcuX3JlZ2xUeXBlPT09XCJmcmFtZWJ1ZmZlckN1YmVcIil7JyxcbiAgICAgICAgICBWQUxVRSwgJz0nLCBWQUxVRSwgJy5jb2xvclswXTsnLFxuICAgICAgICAgICd9JylcbiAgICAgIH1cblxuICAgICAgLy8gcGVyZm9ybSB0eXBlIHZhbGlkYXRpb25cbiAgICAgIFxuXG4gICAgICB2YXIgdW5yb2xsID0gMVxuICAgICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICAgIGNhc2UgR0xfU0FNUExFUl8yRDpcbiAgICAgICAgY2FzZSBHTF9TQU1QTEVSX0NVQkU6XG4gICAgICAgICAgdmFyIFRFWCA9IHNjb3BlLmRlZihWQUxVRSwgJy5fdGV4dHVyZScpXG4gICAgICAgICAgc2NvcGUoR0wsICcudW5pZm9ybTFpKCcsIExPQ0FUSU9OLCAnLCcsIFRFWCwgJy5iaW5kKCkpOycpXG4gICAgICAgICAgc2NvcGUuZXhpdChURVgsICcudW5iaW5kKCk7JylcbiAgICAgICAgICBjb250aW51ZVxuXG4gICAgICAgIGNhc2UgR0xfSU5UOlxuICAgICAgICBjYXNlIEdMX0JPT0w6XG4gICAgICAgICAgaW5maXggPSAnMWknXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX0lOVF9WRUMyOlxuICAgICAgICBjYXNlIEdMX0JPT0xfVkVDMjpcbiAgICAgICAgICBpbmZpeCA9ICcyaSdcbiAgICAgICAgICB1bnJvbGwgPSAyXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX0lOVF9WRUMzOlxuICAgICAgICBjYXNlIEdMX0JPT0xfVkVDMzpcbiAgICAgICAgICBpbmZpeCA9ICczaSdcbiAgICAgICAgICB1bnJvbGwgPSAzXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX0lOVF9WRUM0OlxuICAgICAgICBjYXNlIEdMX0JPT0xfVkVDNDpcbiAgICAgICAgICBpbmZpeCA9ICc0aSdcbiAgICAgICAgICB1bnJvbGwgPSA0XG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX0ZMT0FUOlxuICAgICAgICAgIGluZml4ID0gJzFmJ1xuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSBHTF9GTE9BVF9WRUMyOlxuICAgICAgICAgIGluZml4ID0gJzJmJ1xuICAgICAgICAgIHVucm9sbCA9IDJcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfRkxPQVRfVkVDMzpcbiAgICAgICAgICBpbmZpeCA9ICczZidcbiAgICAgICAgICB1bnJvbGwgPSAzXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX0ZMT0FUX1ZFQzQ6XG4gICAgICAgICAgaW5maXggPSAnNGYnXG4gICAgICAgICAgdW5yb2xsID0gNFxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSBHTF9GTE9BVF9NQVQyOlxuICAgICAgICAgIGluZml4ID0gJ01hdHJpeDJmdidcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfRkxPQVRfTUFUMzpcbiAgICAgICAgICBpbmZpeCA9ICdNYXRyaXgzZnYnXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX0ZMT0FUX01BVDQ6XG4gICAgICAgICAgaW5maXggPSAnTWF0cml4NGZ2J1xuICAgICAgICAgIGJyZWFrXG4gICAgICB9XG5cbiAgICAgIHNjb3BlKEdMLCAnLnVuaWZvcm0nLCBpbmZpeCwgJygnLCBMT0NBVElPTiwgJywnKVxuICAgICAgaWYgKGluZml4LmNoYXJBdCgwKSA9PT0gJ00nKSB7XG4gICAgICAgIHZhciBtYXRTaXplID0gTWF0aC5wb3codHlwZSAtIEdMX0ZMT0FUX01BVDIgKyAyLCAyKVxuICAgICAgICB2YXIgU1RPUkFHRSA9IGVudi5nbG9iYWwuZGVmKCduZXcgRmxvYXQzMkFycmF5KCcsIG1hdFNpemUsICcpJylcbiAgICAgICAgc2NvcGUoXG4gICAgICAgICAgJ2ZhbHNlLChBcnJheS5pc0FycmF5KCcsIFZBTFVFLCAnKXx8JywgVkFMVUUsICcgaW5zdGFuY2VvZiBGbG9hdDMyQXJyYXkpPycsIFZBTFVFLCAnOignLFxuICAgICAgICAgIGxvb3AobWF0U2l6ZSwgZnVuY3Rpb24gKGkpIHtcbiAgICAgICAgICAgIHJldHVybiBTVE9SQUdFICsgJ1snICsgaSArICddPScgKyBWQUxVRSArICdbJyArIGkgKyAnXSdcbiAgICAgICAgICB9KSwgJywnLCBTVE9SQUdFLCAnKScpXG4gICAgICB9IGVsc2UgaWYgKHVucm9sbCA+IDEpIHtcbiAgICAgICAgc2NvcGUobG9vcCh1bnJvbGwsIGZ1bmN0aW9uIChpKSB7XG4gICAgICAgICAgcmV0dXJuIFZBTFVFICsgJ1snICsgaSArICddJ1xuICAgICAgICB9KSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNjb3BlKFZBTFVFKVxuICAgICAgfVxuICAgICAgc2NvcGUoJyk7JylcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBlbWl0RHJhdyAoZW52LCBvdXRlciwgaW5uZXIsIGFyZ3MpIHtcbiAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuICAgIHZhciBHTCA9IHNoYXJlZC5nbFxuICAgIHZhciBEUkFXX1NUQVRFID0gc2hhcmVkLmRyYXdcblxuICAgIHZhciBkcmF3T3B0aW9ucyA9IGFyZ3MuZHJhd1xuXG4gICAgZnVuY3Rpb24gZW1pdEVsZW1lbnRzICgpIHtcbiAgICAgIHZhciBkZWZuID0gZHJhd09wdGlvbnMuZWxlbWVudHNcbiAgICAgIHZhciBFTEVNRU5UU1xuICAgICAgdmFyIHNjb3BlID0gb3V0ZXJcbiAgICAgIGlmIChkZWZuKSB7XG4gICAgICAgIGlmICgoZGVmbi5jb250ZXh0RGVwICYmIGFyZ3MuY29udGV4dER5bmFtaWMpIHx8IGRlZm4ucHJvcERlcCkge1xuICAgICAgICAgIHNjb3BlID0gaW5uZXJcbiAgICAgICAgfVxuICAgICAgICBFTEVNRU5UUyA9IGRlZm4uYXBwZW5kKGVudiwgc2NvcGUpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBFTEVNRU5UUyA9IHNjb3BlLmRlZihEUkFXX1NUQVRFLCAnLicsIFNfRUxFTUVOVFMpXG4gICAgICB9XG4gICAgICBpZiAoRUxFTUVOVFMpIHtcbiAgICAgICAgc2NvcGUoXG4gICAgICAgICAgJ2lmKCcgKyBFTEVNRU5UUyArICcpJyArXG4gICAgICAgICAgR0wgKyAnLmJpbmRCdWZmZXIoJyArIEdMX0VMRU1FTlRfQVJSQVlfQlVGRkVSICsgJywnICsgRUxFTUVOVFMgKyAnLmJ1ZmZlci5idWZmZXIpOycpXG4gICAgICB9XG4gICAgICByZXR1cm4gRUxFTUVOVFNcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBlbWl0Q291bnQgKCkge1xuICAgICAgdmFyIGRlZm4gPSBkcmF3T3B0aW9ucy5jb3VudFxuICAgICAgdmFyIENPVU5UXG4gICAgICB2YXIgc2NvcGUgPSBvdXRlclxuICAgICAgaWYgKGRlZm4pIHtcbiAgICAgICAgaWYgKChkZWZuLmNvbnRleHREZXAgJiYgYXJncy5jb250ZXh0RHluYW1pYykgfHwgZGVmbi5wcm9wRGVwKSB7XG4gICAgICAgICAgc2NvcGUgPSBpbm5lclxuICAgICAgICB9XG4gICAgICAgIENPVU5UID0gZGVmbi5hcHBlbmQoZW52LCBzY29wZSlcbiAgICAgICAgXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBDT1VOVCA9IHNjb3BlLmRlZihEUkFXX1NUQVRFLCAnLicsIFNfQ09VTlQpXG4gICAgICAgIFxuICAgICAgfVxuICAgICAgcmV0dXJuIENPVU5UXG4gICAgfVxuXG4gICAgdmFyIEVMRU1FTlRTID0gZW1pdEVsZW1lbnRzKClcbiAgICBmdW5jdGlvbiBlbWl0VmFsdWUgKG5hbWUpIHtcbiAgICAgIHZhciBkZWZuID0gZHJhd09wdGlvbnNbbmFtZV1cbiAgICAgIGlmIChkZWZuKSB7XG4gICAgICAgIGlmICgoZGVmbi5jb250ZXh0RGVwICYmIGFyZ3MuY29udGV4dER5bmFtaWMpIHx8IGRlZm4ucHJvcERlcCkge1xuICAgICAgICAgIHJldHVybiBkZWZuLmFwcGVuZChlbnYsIGlubmVyKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBkZWZuLmFwcGVuZChlbnYsIG91dGVyKVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gb3V0ZXIuZGVmKERSQVdfU1RBVEUsICcuJywgbmFtZSlcbiAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgUFJJTUlUSVZFID0gZW1pdFZhbHVlKFNfUFJJTUlUSVZFKVxuICAgIHZhciBPRkZTRVQgPSBlbWl0VmFsdWUoU19PRkZTRVQpXG5cbiAgICB2YXIgQ09VTlQgPSBlbWl0Q291bnQoKVxuICAgIGlmICh0eXBlb2YgQ09VTlQgPT09ICdudW1iZXInKSB7XG4gICAgICBpZiAoQ09VTlQgPT09IDApIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGlubmVyKCdpZignLCBDT1VOVCwgJyl7JylcbiAgICAgIGlubmVyLmV4aXQoJ30nKVxuICAgIH1cblxuICAgIHZhciBJTlNUQU5DRVMsIEVYVF9JTlNUQU5DSU5HXG4gICAgaWYgKGV4dEluc3RhbmNpbmcpIHtcbiAgICAgIElOU1RBTkNFUyA9IGVtaXRWYWx1ZShTX0lOU1RBTkNFUylcbiAgICAgIEVYVF9JTlNUQU5DSU5HID0gZW52Lmluc3RhbmNpbmdcbiAgICB9XG5cbiAgICB2YXIgRUxFTUVOVF9UWVBFID0gRUxFTUVOVFMgKyAnLnR5cGUnXG5cbiAgICB2YXIgZWxlbWVudHNTdGF0aWMgPSBkcmF3T3B0aW9ucy5lbGVtZW50cyAmJiBpc1N0YXRpYyhkcmF3T3B0aW9ucy5lbGVtZW50cylcblxuICAgIGZ1bmN0aW9uIGVtaXRJbnN0YW5jaW5nICgpIHtcbiAgICAgIGZ1bmN0aW9uIGRyYXdFbGVtZW50cyAoKSB7XG4gICAgICAgIGlubmVyKEVYVF9JTlNUQU5DSU5HLCAnLmRyYXdFbGVtZW50c0luc3RhbmNlZEFOR0xFKCcsIFtcbiAgICAgICAgICBQUklNSVRJVkUsXG4gICAgICAgICAgQ09VTlQsXG4gICAgICAgICAgRUxFTUVOVF9UWVBFLFxuICAgICAgICAgIE9GRlNFVCArICc8PCgoJyArIEVMRU1FTlRfVFlQRSArICctJyArIEdMX1VOU0lHTkVEX0JZVEUgKyAnKT4+MSknLFxuICAgICAgICAgIElOU1RBTkNFU1xuICAgICAgICBdLCAnKTsnKVxuICAgICAgfVxuXG4gICAgICBmdW5jdGlvbiBkcmF3QXJyYXlzICgpIHtcbiAgICAgICAgaW5uZXIoRVhUX0lOU1RBTkNJTkcsICcuZHJhd0FycmF5c0luc3RhbmNlZEFOR0xFKCcsXG4gICAgICAgICAgW1BSSU1JVElWRSwgT0ZGU0VULCBDT1VOVCwgSU5TVEFOQ0VTXSwgJyk7JylcbiAgICAgIH1cblxuICAgICAgaWYgKEVMRU1FTlRTKSB7XG4gICAgICAgIGlmICghZWxlbWVudHNTdGF0aWMpIHtcbiAgICAgICAgICBpbm5lcignaWYoJywgRUxFTUVOVFMsICcpeycpXG4gICAgICAgICAgZHJhd0VsZW1lbnRzKClcbiAgICAgICAgICBpbm5lcignfWVsc2V7JylcbiAgICAgICAgICBkcmF3QXJyYXlzKClcbiAgICAgICAgICBpbm5lcignfScpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZHJhd0VsZW1lbnRzKClcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZHJhd0FycmF5cygpXG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZW1pdFJlZ3VsYXIgKCkge1xuICAgICAgZnVuY3Rpb24gZHJhd0VsZW1lbnRzICgpIHtcbiAgICAgICAgaW5uZXIoR0wgKyAnLmRyYXdFbGVtZW50cygnICsgW1xuICAgICAgICAgIFBSSU1JVElWRSxcbiAgICAgICAgICBDT1VOVCxcbiAgICAgICAgICBFTEVNRU5UX1RZUEUsXG4gICAgICAgICAgT0ZGU0VUICsgJzw8KCgnICsgRUxFTUVOVF9UWVBFICsgJy0nICsgR0xfVU5TSUdORURfQllURSArICcpPj4xKSdcbiAgICAgICAgXSArICcpOycpXG4gICAgICB9XG5cbiAgICAgIGZ1bmN0aW9uIGRyYXdBcnJheXMgKCkge1xuICAgICAgICBpbm5lcihHTCArICcuZHJhd0FycmF5cygnICsgW1BSSU1JVElWRSwgT0ZGU0VULCBDT1VOVF0gKyAnKTsnKVxuICAgICAgfVxuXG4gICAgICBpZiAoRUxFTUVOVFMpIHtcbiAgICAgICAgaWYgKCFlbGVtZW50c1N0YXRpYykge1xuICAgICAgICAgIGlubmVyKCdpZignLCBFTEVNRU5UUywgJyl7JylcbiAgICAgICAgICBkcmF3RWxlbWVudHMoKVxuICAgICAgICAgIGlubmVyKCd9ZWxzZXsnKVxuICAgICAgICAgIGRyYXdBcnJheXMoKVxuICAgICAgICAgIGlubmVyKCd9JylcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBkcmF3RWxlbWVudHMoKVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkcmF3QXJyYXlzKClcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoZXh0SW5zdGFuY2luZyAmJiAodHlwZW9mIElOU1RBTkNFUyAhPT0gJ251bWJlcicgfHwgSU5TVEFOQ0VTID49IDApKSB7XG4gICAgICBpZiAodHlwZW9mIElOU1RBTkNFUyA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgaW5uZXIoJ2lmKCcsIElOU1RBTkNFUywgJz4wKXsnKVxuICAgICAgICBlbWl0SW5zdGFuY2luZygpXG4gICAgICAgIGlubmVyKCd9ZWxzZSBpZignLCBJTlNUQU5DRVMsICc8MCl7JylcbiAgICAgICAgZW1pdFJlZ3VsYXIoKVxuICAgICAgICBpbm5lcignfScpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBlbWl0SW5zdGFuY2luZygpXG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGVtaXRSZWd1bGFyKClcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBjcmVhdGVCb2R5IChlbWl0Qm9keSwgcGFyZW50RW52LCBhcmdzLCBwcm9ncmFtLCBjb3VudCkge1xuICAgIHZhciBlbnYgPSBjcmVhdGVSRUdMRW52aXJvbm1lbnQoKVxuICAgIHZhciBzY29wZSA9IGVudi5wcm9jKCdib2R5JywgY291bnQpXG4gICAgXG4gICAgaWYgKGV4dEluc3RhbmNpbmcpIHtcbiAgICAgIGVudi5pbnN0YW5jaW5nID0gc2NvcGUuZGVmKFxuICAgICAgICBlbnYuc2hhcmVkLmV4dGVuc2lvbnMsICcuYW5nbGVfaW5zdGFuY2VkX2FycmF5cycpXG4gICAgfVxuICAgIGVtaXRCb2R5KGVudiwgc2NvcGUsIGFyZ3MsIHByb2dyYW0pXG4gICAgcmV0dXJuIGVudi5jb21waWxlKCkuYm9keVxuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBEUkFXIFBST0NcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICBmdW5jdGlvbiBlbWl0RHJhd0JvZHkgKGVudiwgZHJhdywgYXJncywgcHJvZ3JhbSkge1xuICAgIGluamVjdEV4dGVuc2lvbnMoZW52LCBkcmF3KVxuICAgIGVtaXRBdHRyaWJ1dGVzKGVudiwgZHJhdywgYXJncywgcHJvZ3JhbS5hdHRyaWJ1dGVzLCBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gdHJ1ZVxuICAgIH0pXG4gICAgZW1pdFVuaWZvcm1zKGVudiwgZHJhdywgYXJncywgcHJvZ3JhbS51bmlmb3JtcywgZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIHRydWVcbiAgICB9KVxuICAgIGVtaXREcmF3KGVudiwgZHJhdywgZHJhdywgYXJncylcbiAgfVxuXG4gIGZ1bmN0aW9uIGVtaXREcmF3UHJvYyAoZW52LCBhcmdzKSB7XG4gICAgdmFyIGRyYXcgPSBlbnYucHJvYygnZHJhdycsIDEpXG5cbiAgICBpbmplY3RFeHRlbnNpb25zKGVudiwgZHJhdylcblxuICAgIGVtaXRDb250ZXh0KGVudiwgZHJhdywgYXJncy5jb250ZXh0KVxuICAgIGVtaXRQb2xsRnJhbWVidWZmZXIoZW52LCBkcmF3LCBhcmdzLmZyYW1lYnVmZmVyKVxuXG4gICAgZW1pdFBvbGxTdGF0ZShlbnYsIGRyYXcsIGFyZ3MpXG4gICAgZW1pdFNldE9wdGlvbnMoZW52LCBkcmF3LCBhcmdzLnN0YXRlKVxuXG4gICAgZW1pdFByb2ZpbGUoZW52LCBkcmF3LCBhcmdzLCBmYWxzZSwgdHJ1ZSlcblxuICAgIHZhciBwcm9ncmFtID0gYXJncy5zaGFkZXIucHJvZ1Zhci5hcHBlbmQoZW52LCBkcmF3KVxuICAgIGRyYXcoZW52LnNoYXJlZC5nbCwgJy51c2VQcm9ncmFtKCcsIHByb2dyYW0sICcucHJvZ3JhbSk7JylcblxuICAgIGlmIChhcmdzLnNoYWRlci5wcm9ncmFtKSB7XG4gICAgICBlbWl0RHJhd0JvZHkoZW52LCBkcmF3LCBhcmdzLCBhcmdzLnNoYWRlci5wcm9ncmFtKVxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgZHJhd0NhY2hlID0gZW52Lmdsb2JhbC5kZWYoJ3t9JylcbiAgICAgIHZhciBQUk9HX0lEID0gZHJhdy5kZWYocHJvZ3JhbSwgJy5pZCcpXG4gICAgICB2YXIgQ0FDSEVEX1BST0MgPSBkcmF3LmRlZihkcmF3Q2FjaGUsICdbJywgUFJPR19JRCwgJ10nKVxuICAgICAgZHJhdyhcbiAgICAgICAgZW52LmNvbmQoQ0FDSEVEX1BST0MpXG4gICAgICAgICAgLnRoZW4oQ0FDSEVEX1BST0MsICcuY2FsbCh0aGlzLGEwKTsnKVxuICAgICAgICAgIC5lbHNlKFxuICAgICAgICAgICAgQ0FDSEVEX1BST0MsICc9JywgZHJhd0NhY2hlLCAnWycsIFBST0dfSUQsICddPScsXG4gICAgICAgICAgICBlbnYubGluayhmdW5jdGlvbiAocHJvZ3JhbSkge1xuICAgICAgICAgICAgICByZXR1cm4gY3JlYXRlQm9keShlbWl0RHJhd0JvZHksIGVudiwgYXJncywgcHJvZ3JhbSwgMSlcbiAgICAgICAgICAgIH0pLCAnKCcsIHByb2dyYW0sICcpOycsXG4gICAgICAgICAgICBDQUNIRURfUFJPQywgJy5jYWxsKHRoaXMsYTApOycpKVxuICAgIH1cblxuICAgIGlmIChPYmplY3Qua2V5cyhhcmdzLnN0YXRlKS5sZW5ndGggPiAwKSB7XG4gICAgICBkcmF3KGVudi5zaGFyZWQuY3VycmVudCwgJy5kaXJ0eT10cnVlOycpXG4gICAgfVxuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBCQVRDSCBQUk9DXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuICBmdW5jdGlvbiBlbWl0QmF0Y2hEeW5hbWljU2hhZGVyQm9keSAoZW52LCBzY29wZSwgYXJncywgcHJvZ3JhbSkge1xuICAgIGVudi5iYXRjaElkID0gJ2ExJ1xuXG4gICAgaW5qZWN0RXh0ZW5zaW9ucyhlbnYsIHNjb3BlKVxuXG4gICAgZnVuY3Rpb24gYWxsICgpIHtcbiAgICAgIHJldHVybiB0cnVlXG4gICAgfVxuXG4gICAgZW1pdEF0dHJpYnV0ZXMoZW52LCBzY29wZSwgYXJncywgcHJvZ3JhbS5hdHRyaWJ1dGVzLCBhbGwpXG4gICAgZW1pdFVuaWZvcm1zKGVudiwgc2NvcGUsIGFyZ3MsIHByb2dyYW0udW5pZm9ybXMsIGFsbClcbiAgICBlbWl0RHJhdyhlbnYsIHNjb3BlLCBzY29wZSwgYXJncylcbiAgfVxuXG4gIGZ1bmN0aW9uIGVtaXRCYXRjaEJvZHkgKGVudiwgc2NvcGUsIGFyZ3MsIHByb2dyYW0pIHtcbiAgICBpbmplY3RFeHRlbnNpb25zKGVudiwgc2NvcGUpXG5cbiAgICB2YXIgY29udGV4dER5bmFtaWMgPSBhcmdzLmNvbnRleHREZXBcblxuICAgIHZhciBCQVRDSF9JRCA9IHNjb3BlLmRlZigpXG4gICAgdmFyIFBST1BfTElTVCA9ICdhMCdcbiAgICB2YXIgTlVNX1BST1BTID0gJ2ExJ1xuICAgIHZhciBQUk9QUyA9IHNjb3BlLmRlZigpXG4gICAgZW52LnNoYXJlZC5wcm9wcyA9IFBST1BTXG4gICAgZW52LmJhdGNoSWQgPSBCQVRDSF9JRFxuXG4gICAgdmFyIG91dGVyID0gZW52LnNjb3BlKClcbiAgICB2YXIgaW5uZXIgPSBlbnYuc2NvcGUoKVxuXG4gICAgc2NvcGUoXG4gICAgICBvdXRlci5lbnRyeSxcbiAgICAgICdmb3IoJywgQkFUQ0hfSUQsICc9MDsnLCBCQVRDSF9JRCwgJzwnLCBOVU1fUFJPUFMsICc7KysnLCBCQVRDSF9JRCwgJyl7JyxcbiAgICAgIFBST1BTLCAnPScsIFBST1BfTElTVCwgJ1snLCBCQVRDSF9JRCwgJ107JyxcbiAgICAgIGlubmVyLFxuICAgICAgJ30nLFxuICAgICAgb3V0ZXIuZXhpdClcblxuICAgIGZ1bmN0aW9uIGlzSW5uZXJEZWZuIChkZWZuKSB7XG4gICAgICByZXR1cm4gKChkZWZuLmNvbnRleHREZXAgJiYgY29udGV4dER5bmFtaWMpIHx8IGRlZm4ucHJvcERlcClcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBpc091dGVyRGVmbiAoZGVmbikge1xuICAgICAgcmV0dXJuICFpc0lubmVyRGVmbihkZWZuKVxuICAgIH1cblxuICAgIGlmIChhcmdzLm5lZWRzQ29udGV4dCkge1xuICAgICAgZW1pdENvbnRleHQoZW52LCBpbm5lciwgYXJncy5jb250ZXh0KVxuICAgIH1cbiAgICBpZiAoYXJncy5uZWVkc0ZyYW1lYnVmZmVyKSB7XG4gICAgICBlbWl0UG9sbEZyYW1lYnVmZmVyKGVudiwgaW5uZXIsIGFyZ3MuZnJhbWVidWZmZXIpXG4gICAgfVxuICAgIGVtaXRTZXRPcHRpb25zKGVudiwgaW5uZXIsIGFyZ3Muc3RhdGUsIGlzSW5uZXJEZWZuKVxuXG4gICAgaWYgKGFyZ3MucHJvZmlsZSAmJiBpc0lubmVyRGVmbihhcmdzLnByb2ZpbGUpKSB7XG4gICAgICBlbWl0UHJvZmlsZShlbnYsIGlubmVyLCBhcmdzLCBmYWxzZSwgdHJ1ZSlcbiAgICB9XG5cbiAgICBpZiAoIXByb2dyYW0pIHtcbiAgICAgIHZhciBwcm9nQ2FjaGUgPSBlbnYuZ2xvYmFsLmRlZigne30nKVxuICAgICAgdmFyIFBST0dSQU0gPSBhcmdzLnNoYWRlci5wcm9nVmFyLmFwcGVuZChlbnYsIGlubmVyKVxuICAgICAgdmFyIFBST0dfSUQgPSBpbm5lci5kZWYoUFJPR1JBTSwgJy5pZCcpXG4gICAgICB2YXIgQ0FDSEVEX1BST0MgPSBpbm5lci5kZWYocHJvZ0NhY2hlLCAnWycsIFBST0dfSUQsICddJylcbiAgICAgIGlubmVyKFxuICAgICAgICBlbnYuc2hhcmVkLmdsLCAnLnVzZVByb2dyYW0oJywgUFJPR1JBTSwgJy5wcm9ncmFtKTsnLFxuICAgICAgICAnaWYoIScsIENBQ0hFRF9QUk9DLCAnKXsnLFxuICAgICAgICBDQUNIRURfUFJPQywgJz0nLCBwcm9nQ2FjaGUsICdbJywgUFJPR19JRCwgJ109JyxcbiAgICAgICAgZW52LmxpbmsoZnVuY3Rpb24gKHByb2dyYW0pIHtcbiAgICAgICAgICByZXR1cm4gY3JlYXRlQm9keShcbiAgICAgICAgICAgIGVtaXRCYXRjaER5bmFtaWNTaGFkZXJCb2R5LCBlbnYsIGFyZ3MsIHByb2dyYW0sIDIpXG4gICAgICAgIH0pLCAnKCcsIFBST0dSQU0sICcpO30nLFxuICAgICAgICBDQUNIRURfUFJPQywgJy5jYWxsKHRoaXMsYTBbJywgQkFUQ0hfSUQsICddLCcsIEJBVENIX0lELCAnKTsnKVxuICAgIH0gZWxzZSB7XG4gICAgICBlbWl0QXR0cmlidXRlcyhlbnYsIG91dGVyLCBhcmdzLCBwcm9ncmFtLmF0dHJpYnV0ZXMsIGlzT3V0ZXJEZWZuKVxuICAgICAgZW1pdEF0dHJpYnV0ZXMoZW52LCBpbm5lciwgYXJncywgcHJvZ3JhbS5hdHRyaWJ1dGVzLCBpc0lubmVyRGVmbilcbiAgICAgIGVtaXRVbmlmb3JtcyhlbnYsIG91dGVyLCBhcmdzLCBwcm9ncmFtLnVuaWZvcm1zLCBpc091dGVyRGVmbilcbiAgICAgIGVtaXRVbmlmb3JtcyhlbnYsIGlubmVyLCBhcmdzLCBwcm9ncmFtLnVuaWZvcm1zLCBpc0lubmVyRGVmbilcbiAgICAgIGVtaXREcmF3KGVudiwgb3V0ZXIsIGlubmVyLCBhcmdzKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGVtaXRCYXRjaFByb2MgKGVudiwgYXJncykge1xuICAgIHZhciBiYXRjaCA9IGVudi5wcm9jKCdiYXRjaCcsIDIpXG4gICAgZW52LmJhdGNoSWQgPSAnMCdcblxuICAgIGluamVjdEV4dGVuc2lvbnMoZW52LCBiYXRjaClcblxuICAgIC8vIENoZWNrIGlmIGFueSBjb250ZXh0IHZhcmlhYmxlcyBkZXBlbmQgb24gcHJvcHNcbiAgICB2YXIgY29udGV4dER5bmFtaWMgPSBmYWxzZVxuICAgIHZhciBuZWVkc0NvbnRleHQgPSB0cnVlXG4gICAgT2JqZWN0LmtleXMoYXJncy5jb250ZXh0KS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICBjb250ZXh0RHluYW1pYyA9IGNvbnRleHREeW5hbWljIHx8IGFyZ3MuY29udGV4dFtuYW1lXS5wcm9wRGVwXG4gICAgfSlcbiAgICBpZiAoIWNvbnRleHREeW5hbWljKSB7XG4gICAgICBlbWl0Q29udGV4dChlbnYsIGJhdGNoLCBhcmdzLmNvbnRleHQpXG4gICAgICBuZWVkc0NvbnRleHQgPSBmYWxzZVxuICAgIH1cblxuICAgIC8vIGZyYW1lYnVmZmVyIHN0YXRlIGFmZmVjdHMgZnJhbWVidWZmZXJXaWR0aC9oZWlnaHQgY29udGV4dCB2YXJzXG4gICAgdmFyIGZyYW1lYnVmZmVyID0gYXJncy5mcmFtZWJ1ZmZlclxuICAgIHZhciBuZWVkc0ZyYW1lYnVmZmVyID0gZmFsc2VcbiAgICBpZiAoZnJhbWVidWZmZXIpIHtcbiAgICAgIGlmIChmcmFtZWJ1ZmZlci5wcm9wRGVwKSB7XG4gICAgICAgIGNvbnRleHREeW5hbWljID0gbmVlZHNGcmFtZWJ1ZmZlciA9IHRydWVcbiAgICAgIH0gZWxzZSBpZiAoZnJhbWVidWZmZXIuY29udGV4dERlcCAmJiBjb250ZXh0RHluYW1pYykge1xuICAgICAgICBuZWVkc0ZyYW1lYnVmZmVyID0gdHJ1ZVxuICAgICAgfVxuICAgICAgaWYgKCFuZWVkc0ZyYW1lYnVmZmVyKSB7XG4gICAgICAgIGVtaXRQb2xsRnJhbWVidWZmZXIoZW52LCBiYXRjaCwgZnJhbWVidWZmZXIpXG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGVtaXRQb2xsRnJhbWVidWZmZXIoZW52LCBiYXRjaCwgbnVsbClcbiAgICB9XG5cbiAgICAvLyB2aWV3cG9ydCBpcyB3ZWlyZCBiZWNhdXNlIGl0IGNhbiBhZmZlY3QgY29udGV4dCB2YXJzXG4gICAgaWYgKGFyZ3Muc3RhdGUudmlld3BvcnQgJiYgYXJncy5zdGF0ZS52aWV3cG9ydC5wcm9wRGVwKSB7XG4gICAgICBjb250ZXh0RHluYW1pYyA9IHRydWVcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBpc0lubmVyRGVmbiAoZGVmbikge1xuICAgICAgcmV0dXJuIChkZWZuLmNvbnRleHREZXAgJiYgY29udGV4dER5bmFtaWMpIHx8IGRlZm4ucHJvcERlcFxuICAgIH1cblxuICAgIC8vIHNldCB3ZWJnbCBvcHRpb25zXG4gICAgZW1pdFBvbGxTdGF0ZShlbnYsIGJhdGNoLCBhcmdzKVxuICAgIGVtaXRTZXRPcHRpb25zKGVudiwgYmF0Y2gsIGFyZ3Muc3RhdGUsIGZ1bmN0aW9uIChkZWZuKSB7XG4gICAgICByZXR1cm4gIWlzSW5uZXJEZWZuKGRlZm4pXG4gICAgfSlcblxuICAgIGlmICghYXJncy5wcm9maWxlIHx8ICFpc0lubmVyRGVmbihhcmdzLnByb2ZpbGUpKSB7XG4gICAgICBlbWl0UHJvZmlsZShlbnYsIGJhdGNoLCBhcmdzLCBmYWxzZSwgJ2ExJylcbiAgICB9XG5cbiAgICAvLyBTYXZlIHRoZXNlIHZhbHVlcyB0byBhcmdzIHNvIHRoYXQgdGhlIGJhdGNoIGJvZHkgcm91dGluZSBjYW4gdXNlIHRoZW1cbiAgICBhcmdzLmNvbnRleHREZXAgPSBjb250ZXh0RHluYW1pY1xuICAgIGFyZ3MubmVlZHNDb250ZXh0ID0gbmVlZHNDb250ZXh0XG4gICAgYXJncy5uZWVkc0ZyYW1lYnVmZmVyID0gbmVlZHNGcmFtZWJ1ZmZlclxuXG4gICAgLy8gZGV0ZXJtaW5lIGlmIHNoYWRlciBpcyBkeW5hbWljXG4gICAgdmFyIHByb2dEZWZuID0gYXJncy5zaGFkZXIucHJvZ1ZhclxuICAgIGlmICgocHJvZ0RlZm4uY29udGV4dERlcCAmJiBjb250ZXh0RHluYW1pYykgfHwgcHJvZ0RlZm4ucHJvcERlcCkge1xuICAgICAgZW1pdEJhdGNoQm9keShcbiAgICAgICAgZW52LFxuICAgICAgICBiYXRjaCxcbiAgICAgICAgYXJncyxcbiAgICAgICAgbnVsbClcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIFBST0dSQU0gPSBwcm9nRGVmbi5hcHBlbmQoZW52LCBiYXRjaClcbiAgICAgIGJhdGNoKGVudi5zaGFyZWQuZ2wsICcudXNlUHJvZ3JhbSgnLCBQUk9HUkFNLCAnLnByb2dyYW0pOycpXG4gICAgICBpZiAoYXJncy5zaGFkZXIucHJvZ3JhbSkge1xuICAgICAgICBlbWl0QmF0Y2hCb2R5KFxuICAgICAgICAgIGVudixcbiAgICAgICAgICBiYXRjaCxcbiAgICAgICAgICBhcmdzLFxuICAgICAgICAgIGFyZ3Muc2hhZGVyLnByb2dyYW0pXG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgYmF0Y2hDYWNoZSA9IGVudi5nbG9iYWwuZGVmKCd7fScpXG4gICAgICAgIHZhciBQUk9HX0lEID0gYmF0Y2guZGVmKFBST0dSQU0sICcuaWQnKVxuICAgICAgICB2YXIgQ0FDSEVEX1BST0MgPSBiYXRjaC5kZWYoYmF0Y2hDYWNoZSwgJ1snLCBQUk9HX0lELCAnXScpXG4gICAgICAgIGJhdGNoKFxuICAgICAgICAgIGVudi5jb25kKENBQ0hFRF9QUk9DKVxuICAgICAgICAgICAgLnRoZW4oQ0FDSEVEX1BST0MsICcuY2FsbCh0aGlzLGEwLGExKTsnKVxuICAgICAgICAgICAgLmVsc2UoXG4gICAgICAgICAgICAgIENBQ0hFRF9QUk9DLCAnPScsIGJhdGNoQ2FjaGUsICdbJywgUFJPR19JRCwgJ109JyxcbiAgICAgICAgICAgICAgZW52LmxpbmsoZnVuY3Rpb24gKHByb2dyYW0pIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gY3JlYXRlQm9keShlbWl0QmF0Y2hCb2R5LCBlbnYsIGFyZ3MsIHByb2dyYW0sIDIpXG4gICAgICAgICAgICAgIH0pLCAnKCcsIFBST0dSQU0sICcpOycsXG4gICAgICAgICAgICAgIENBQ0hFRF9QUk9DLCAnLmNhbGwodGhpcyxhMCxhMSk7JykpXG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKE9iamVjdC5rZXlzKGFyZ3Muc3RhdGUpLmxlbmd0aCA+IDApIHtcbiAgICAgIGJhdGNoKGVudi5zaGFyZWQuY3VycmVudCwgJy5kaXJ0eT10cnVlOycpXG4gICAgfVxuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBTQ09QRSBDT01NQU5EXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgZnVuY3Rpb24gZW1pdFNjb3BlUHJvYyAoZW52LCBhcmdzKSB7XG4gICAgdmFyIHNjb3BlID0gZW52LnByb2MoJ3Njb3BlJywgMylcbiAgICBlbnYuYmF0Y2hJZCA9ICdhMidcblxuICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG4gICAgdmFyIENVUlJFTlRfU1RBVEUgPSBzaGFyZWQuY3VycmVudFxuXG4gICAgZW1pdENvbnRleHQoZW52LCBzY29wZSwgYXJncy5jb250ZXh0KVxuXG4gICAgaWYgKGFyZ3MuZnJhbWVidWZmZXIpIHtcbiAgICAgIGFyZ3MuZnJhbWVidWZmZXIuYXBwZW5kKGVudiwgc2NvcGUpXG4gICAgfVxuXG4gICAgc29ydFN0YXRlKE9iamVjdC5rZXlzKGFyZ3Muc3RhdGUpKS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICB2YXIgZGVmbiA9IGFyZ3Muc3RhdGVbbmFtZV1cbiAgICAgIHZhciB2YWx1ZSA9IGRlZm4uYXBwZW5kKGVudiwgc2NvcGUpXG4gICAgICBpZiAoaXNBcnJheUxpa2UodmFsdWUpKSB7XG4gICAgICAgIHZhbHVlLmZvckVhY2goZnVuY3Rpb24gKHYsIGkpIHtcbiAgICAgICAgICBzY29wZS5zZXQoZW52Lm5leHRbbmFtZV0sICdbJyArIGkgKyAnXScsIHYpXG4gICAgICAgIH0pXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzY29wZS5zZXQoc2hhcmVkLm5leHQsICcuJyArIG5hbWUsIHZhbHVlKVxuICAgICAgfVxuICAgIH0pXG5cbiAgICBlbWl0UHJvZmlsZShlbnYsIHNjb3BlLCBhcmdzLCB0cnVlLCB0cnVlKVxuXG4gICAgO1tTX0VMRU1FTlRTLCBTX09GRlNFVCwgU19DT1VOVCwgU19JTlNUQU5DRVMsIFNfUFJJTUlUSVZFXS5mb3JFYWNoKFxuICAgICAgZnVuY3Rpb24gKG9wdCkge1xuICAgICAgICB2YXIgdmFyaWFibGUgPSBhcmdzLmRyYXdbb3B0XVxuICAgICAgICBpZiAoIXZhcmlhYmxlKSB7XG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cbiAgICAgICAgc2NvcGUuc2V0KHNoYXJlZC5kcmF3LCAnLicgKyBvcHQsICcnICsgdmFyaWFibGUuYXBwZW5kKGVudiwgc2NvcGUpKVxuICAgICAgfSlcblxuICAgIE9iamVjdC5rZXlzKGFyZ3MudW5pZm9ybXMpLmZvckVhY2goZnVuY3Rpb24gKG9wdCkge1xuICAgICAgc2NvcGUuc2V0KFxuICAgICAgICBzaGFyZWQudW5pZm9ybXMsXG4gICAgICAgICdbJyArIHN0cmluZ1N0b3JlLmlkKG9wdCkgKyAnXScsXG4gICAgICAgIGFyZ3MudW5pZm9ybXNbb3B0XS5hcHBlbmQoZW52LCBzY29wZSkpXG4gICAgfSlcblxuICAgIE9iamVjdC5rZXlzKGFyZ3MuYXR0cmlidXRlcykuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgdmFyIHJlY29yZCA9IGFyZ3MuYXR0cmlidXRlc1tuYW1lXS5hcHBlbmQoZW52LCBzY29wZSlcbiAgICAgIHZhciBzY29wZUF0dHJpYiA9IGVudi5zY29wZUF0dHJpYihuYW1lKVxuICAgICAgT2JqZWN0LmtleXMobmV3IEF0dHJpYnV0ZVJlY29yZCgpKS5mb3JFYWNoKGZ1bmN0aW9uIChwcm9wKSB7XG4gICAgICAgIHNjb3BlLnNldChzY29wZUF0dHJpYiwgJy4nICsgcHJvcCwgcmVjb3JkW3Byb3BdKVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgZnVuY3Rpb24gc2F2ZVNoYWRlciAobmFtZSkge1xuICAgICAgdmFyIHNoYWRlciA9IGFyZ3Muc2hhZGVyW25hbWVdXG4gICAgICBpZiAoc2hhZGVyKSB7XG4gICAgICAgIHNjb3BlLnNldChzaGFyZWQuc2hhZGVyLCAnLicgKyBuYW1lLCBzaGFkZXIuYXBwZW5kKGVudiwgc2NvcGUpKVxuICAgICAgfVxuICAgIH1cbiAgICBzYXZlU2hhZGVyKFNfVkVSVClcbiAgICBzYXZlU2hhZGVyKFNfRlJBRylcblxuICAgIGlmIChPYmplY3Qua2V5cyhhcmdzLnN0YXRlKS5sZW5ndGggPiAwKSB7XG4gICAgICBzY29wZShDVVJSRU5UX1NUQVRFLCAnLmRpcnR5PXRydWU7JylcbiAgICAgIHNjb3BlLmV4aXQoQ1VSUkVOVF9TVEFURSwgJy5kaXJ0eT10cnVlOycpXG4gICAgfVxuXG4gICAgc2NvcGUoJ2ExKCcsIGVudi5zaGFyZWQuY29udGV4dCwgJyxhMCwnLCBlbnYuYmF0Y2hJZCwgJyk7JylcbiAgfVxuXG4gIGZ1bmN0aW9uIGlzRHluYW1pY09iamVjdCAob2JqZWN0KSB7XG4gICAgaWYgKHR5cGVvZiBvYmplY3QgIT09ICdvYmplY3QnIHx8IGlzQXJyYXlMaWtlKG9iamVjdCkpIHtcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICB2YXIgcHJvcHMgPSBPYmplY3Qua2V5cyhvYmplY3QpXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBwcm9wcy5sZW5ndGg7ICsraSkge1xuICAgICAgaWYgKGR5bmFtaWMuaXNEeW5hbWljKG9iamVjdFtwcm9wc1tpXV0pKSB7XG4gICAgICAgIHJldHVybiB0cnVlXG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBmYWxzZVxuICB9XG5cbiAgZnVuY3Rpb24gc3BsYXRPYmplY3QgKGVudiwgb3B0aW9ucywgbmFtZSkge1xuICAgIHZhciBvYmplY3QgPSBvcHRpb25zLnN0YXRpY1tuYW1lXVxuICAgIGlmICghb2JqZWN0IHx8ICFpc0R5bmFtaWNPYmplY3Qob2JqZWN0KSkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgdmFyIGdsb2JhbHMgPSBlbnYuZ2xvYmFsXG4gICAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhvYmplY3QpXG4gICAgdmFyIHRoaXNEZXAgPSBmYWxzZVxuICAgIHZhciBjb250ZXh0RGVwID0gZmFsc2VcbiAgICB2YXIgcHJvcERlcCA9IGZhbHNlXG4gICAgdmFyIG9iamVjdFJlZiA9IGVudi5nbG9iYWwuZGVmKCd7fScpXG4gICAga2V5cy5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgIHZhciB2YWx1ZSA9IG9iamVjdFtrZXldXG4gICAgICBpZiAoZHluYW1pYy5pc0R5bmFtaWModmFsdWUpKSB7XG4gICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICB2YWx1ZSA9IG9iamVjdFtrZXldID0gZHluYW1pYy51bmJveCh2YWx1ZSlcbiAgICAgICAgfVxuICAgICAgICB2YXIgZGVwcyA9IGNyZWF0ZUR5bmFtaWNEZWNsKHZhbHVlLCBudWxsKVxuICAgICAgICB0aGlzRGVwID0gdGhpc0RlcCB8fCBkZXBzLnRoaXNEZXBcbiAgICAgICAgcHJvcERlcCA9IHByb3BEZXAgfHwgZGVwcy5wcm9wRGVwXG4gICAgICAgIGNvbnRleHREZXAgPSBjb250ZXh0RGVwIHx8IGRlcHMuY29udGV4dERlcFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZ2xvYmFscyhvYmplY3RSZWYsICcuJywga2V5LCAnPScpXG4gICAgICAgIHN3aXRjaCAodHlwZW9mIHZhbHVlKSB7XG4gICAgICAgICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgICAgICAgIGdsb2JhbHModmFsdWUpXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICAgICAgICBnbG9iYWxzKCdcIicsIHZhbHVlLCAnXCInKVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICBjYXNlICdvYmplY3QnOlxuICAgICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG4gICAgICAgICAgICAgIGdsb2JhbHMoJ1snLCB2YWx1ZS5qb2luKCksICddJylcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIGdsb2JhbHMoZW52LmxpbmsodmFsdWUpKVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgfVxuICAgICAgICBnbG9iYWxzKCc7JylcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgZnVuY3Rpb24gYXBwZW5kQmxvY2sgKGVudiwgYmxvY2spIHtcbiAgICAgIGtleXMuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgIHZhciB2YWx1ZSA9IG9iamVjdFtrZXldXG4gICAgICAgIGlmICghZHluYW1pYy5pc0R5bmFtaWModmFsdWUpKSB7XG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cbiAgICAgICAgdmFyIHJlZiA9IGVudi5pbnZva2UoYmxvY2ssIHZhbHVlKVxuICAgICAgICBibG9jayhvYmplY3RSZWYsICcuJywga2V5LCAnPScsIHJlZiwgJzsnKVxuICAgICAgfSlcbiAgICB9XG5cbiAgICBvcHRpb25zLmR5bmFtaWNbbmFtZV0gPSBuZXcgZHluYW1pYy5EeW5hbWljVmFyaWFibGUoRFlOX1RIVU5LLCB7XG4gICAgICB0aGlzRGVwOiB0aGlzRGVwLFxuICAgICAgY29udGV4dERlcDogY29udGV4dERlcCxcbiAgICAgIHByb3BEZXA6IHByb3BEZXAsXG4gICAgICByZWY6IG9iamVjdFJlZixcbiAgICAgIGFwcGVuZDogYXBwZW5kQmxvY2tcbiAgICB9KVxuICAgIGRlbGV0ZSBvcHRpb25zLnN0YXRpY1tuYW1lXVxuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBNQUlOIERSQVcgQ09NTUFORFxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIGZ1bmN0aW9uIGNvbXBpbGVDb21tYW5kIChvcHRpb25zLCBhdHRyaWJ1dGVzLCB1bmlmb3JtcywgY29udGV4dCwgc3RhdHMpIHtcbiAgICB2YXIgZW52ID0gY3JlYXRlUkVHTEVudmlyb25tZW50KClcblxuICAgIC8vIGxpbmsgc3RhdHMsIHNvIHRoYXQgd2UgY2FuIGVhc2lseSBhY2Nlc3MgaXQgaW4gdGhlIHByb2dyYW0uXG4gICAgZW52LnN0YXRzID0gZW52Lmxpbmsoc3RhdHMpXG5cbiAgICAvLyBzcGxhdCBvcHRpb25zIGFuZCBhdHRyaWJ1dGVzIHRvIGFsbG93IGZvciBkeW5hbWljIG5lc3RlZCBwcm9wZXJ0aWVzXG4gICAgT2JqZWN0LmtleXMoYXR0cmlidXRlcy5zdGF0aWMpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgICAgc3BsYXRPYmplY3QoZW52LCBhdHRyaWJ1dGVzLCBrZXkpXG4gICAgfSlcbiAgICBORVNURURfT1BUSU9OUy5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICBzcGxhdE9iamVjdChlbnYsIG9wdGlvbnMsIG5hbWUpXG4gICAgfSlcblxuICAgIHZhciBhcmdzID0gcGFyc2VBcmd1bWVudHMob3B0aW9ucywgYXR0cmlidXRlcywgdW5pZm9ybXMsIGNvbnRleHQsIGVudilcblxuICAgIGVtaXREcmF3UHJvYyhlbnYsIGFyZ3MpXG4gICAgZW1pdFNjb3BlUHJvYyhlbnYsIGFyZ3MpXG4gICAgZW1pdEJhdGNoUHJvYyhlbnYsIGFyZ3MpXG5cbiAgICByZXR1cm4gZW52LmNvbXBpbGUoKVxuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBQT0xMIC8gUkVGUkVTSFxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIHJldHVybiB7XG4gICAgbmV4dDogbmV4dFN0YXRlLFxuICAgIGN1cnJlbnQ6IGN1cnJlbnRTdGF0ZSxcbiAgICBwcm9jczogKGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBlbnYgPSBjcmVhdGVSRUdMRW52aXJvbm1lbnQoKVxuICAgICAgdmFyIHBvbGwgPSBlbnYucHJvYygncG9sbCcpXG4gICAgICB2YXIgcmVmcmVzaCA9IGVudi5wcm9jKCdyZWZyZXNoJylcbiAgICAgIHZhciBjb21tb24gPSBlbnYuYmxvY2soKVxuICAgICAgcG9sbChjb21tb24pXG4gICAgICByZWZyZXNoKGNvbW1vbilcblxuICAgICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcbiAgICAgIHZhciBHTCA9IHNoYXJlZC5nbFxuICAgICAgdmFyIE5FWFRfU1RBVEUgPSBzaGFyZWQubmV4dFxuICAgICAgdmFyIENVUlJFTlRfU1RBVEUgPSBzaGFyZWQuY3VycmVudFxuXG4gICAgICBjb21tb24oQ1VSUkVOVF9TVEFURSwgJy5kaXJ0eT1mYWxzZTsnKVxuXG4gICAgICBlbWl0UG9sbEZyYW1lYnVmZmVyKGVudiwgcG9sbClcbiAgICAgIGVtaXRQb2xsRnJhbWVidWZmZXIoZW52LCByZWZyZXNoLCBudWxsLCB0cnVlKVxuXG4gICAgICAvLyBSZWZyZXNoIHVwZGF0ZXMgYWxsIGF0dHJpYnV0ZSBzdGF0ZSBjaGFuZ2VzXG4gICAgICB2YXIgZXh0SW5zdGFuY2luZyA9IGdsLmdldEV4dGVuc2lvbignYW5nbGVfaW5zdGFuY2VkX2FycmF5cycpXG4gICAgICB2YXIgSU5TVEFOQ0lOR1xuICAgICAgaWYgKGV4dEluc3RhbmNpbmcpIHtcbiAgICAgICAgSU5TVEFOQ0lORyA9IGVudi5saW5rKGV4dEluc3RhbmNpbmcpXG4gICAgICB9XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxpbWl0cy5tYXhBdHRyaWJ1dGVzOyArK2kpIHtcbiAgICAgICAgdmFyIEJJTkRJTkcgPSByZWZyZXNoLmRlZihzaGFyZWQuYXR0cmlidXRlcywgJ1snLCBpLCAnXScpXG4gICAgICAgIHZhciBpZnRlID0gZW52LmNvbmQoQklORElORywgJy5idWZmZXInKVxuICAgICAgICBpZnRlLnRoZW4oXG4gICAgICAgICAgR0wsICcuZW5hYmxlVmVydGV4QXR0cmliQXJyYXkoJywgaSwgJyk7JyxcbiAgICAgICAgICBHTCwgJy5iaW5kQnVmZmVyKCcsXG4gICAgICAgICAgICBHTF9BUlJBWV9CVUZGRVIsICcsJyxcbiAgICAgICAgICAgIEJJTkRJTkcsICcuYnVmZmVyLmJ1ZmZlcik7JyxcbiAgICAgICAgICBHTCwgJy52ZXJ0ZXhBdHRyaWJQb2ludGVyKCcsXG4gICAgICAgICAgICBpLCAnLCcsXG4gICAgICAgICAgICBCSU5ESU5HLCAnLnNpemUsJyxcbiAgICAgICAgICAgIEJJTkRJTkcsICcudHlwZSwnLFxuICAgICAgICAgICAgQklORElORywgJy5ub3JtYWxpemVkLCcsXG4gICAgICAgICAgICBCSU5ESU5HLCAnLnN0cmlkZSwnLFxuICAgICAgICAgICAgQklORElORywgJy5vZmZzZXQpOydcbiAgICAgICAgKS5lbHNlKFxuICAgICAgICAgIEdMLCAnLmRpc2FibGVWZXJ0ZXhBdHRyaWJBcnJheSgnLCBpLCAnKTsnLFxuICAgICAgICAgIEdMLCAnLnZlcnRleEF0dHJpYjRmKCcsXG4gICAgICAgICAgICBpLCAnLCcsXG4gICAgICAgICAgICBCSU5ESU5HLCAnLngsJyxcbiAgICAgICAgICAgIEJJTkRJTkcsICcueSwnLFxuICAgICAgICAgICAgQklORElORywgJy56LCcsXG4gICAgICAgICAgICBCSU5ESU5HLCAnLncpOycsXG4gICAgICAgICAgQklORElORywgJy5idWZmZXI9bnVsbDsnKVxuICAgICAgICByZWZyZXNoKGlmdGUpXG4gICAgICAgIGlmIChleHRJbnN0YW5jaW5nKSB7XG4gICAgICAgICAgcmVmcmVzaChcbiAgICAgICAgICAgIElOU1RBTkNJTkcsICcudmVydGV4QXR0cmliRGl2aXNvckFOR0xFKCcsXG4gICAgICAgICAgICBpLCAnLCcsXG4gICAgICAgICAgICBCSU5ESU5HLCAnLmRpdmlzb3IpOycpXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgT2JqZWN0LmtleXMoR0xfRkxBR1MpLmZvckVhY2goZnVuY3Rpb24gKGZsYWcpIHtcbiAgICAgICAgdmFyIGNhcCA9IEdMX0ZMQUdTW2ZsYWddXG4gICAgICAgIHZhciBORVhUID0gY29tbW9uLmRlZihORVhUX1NUQVRFLCAnLicsIGZsYWcpXG4gICAgICAgIHZhciBibG9jayA9IGVudi5ibG9jaygpXG4gICAgICAgIGJsb2NrKCdpZignLCBORVhULCAnKXsnLFxuICAgICAgICAgIEdMLCAnLmVuYWJsZSgnLCBjYXAsICcpfWVsc2V7JyxcbiAgICAgICAgICBHTCwgJy5kaXNhYmxlKCcsIGNhcCwgJyl9JyxcbiAgICAgICAgICBDVVJSRU5UX1NUQVRFLCAnLicsIGZsYWcsICc9JywgTkVYVCwgJzsnKVxuICAgICAgICByZWZyZXNoKGJsb2NrKVxuICAgICAgICBwb2xsKFxuICAgICAgICAgICdpZignLCBORVhULCAnIT09JywgQ1VSUkVOVF9TVEFURSwgJy4nLCBmbGFnLCAnKXsnLFxuICAgICAgICAgIGJsb2NrLFxuICAgICAgICAgICd9JylcbiAgICAgIH0pXG5cbiAgICAgIE9iamVjdC5rZXlzKEdMX1ZBUklBQkxFUykuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgICB2YXIgZnVuYyA9IEdMX1ZBUklBQkxFU1tuYW1lXVxuICAgICAgICB2YXIgaW5pdCA9IGN1cnJlbnRTdGF0ZVtuYW1lXVxuICAgICAgICB2YXIgTkVYVCwgQ1VSUkVOVFxuICAgICAgICB2YXIgYmxvY2sgPSBlbnYuYmxvY2soKVxuICAgICAgICBibG9jayhHTCwgJy4nLCBmdW5jLCAnKCcpXG4gICAgICAgIGlmIChpc0FycmF5TGlrZShpbml0KSkge1xuICAgICAgICAgIHZhciBuID0gaW5pdC5sZW5ndGhcbiAgICAgICAgICBORVhUID0gZW52Lmdsb2JhbC5kZWYoTkVYVF9TVEFURSwgJy4nLCBuYW1lKVxuICAgICAgICAgIENVUlJFTlQgPSBlbnYuZ2xvYmFsLmRlZihDVVJSRU5UX1NUQVRFLCAnLicsIG5hbWUpXG4gICAgICAgICAgYmxvY2soXG4gICAgICAgICAgICBsb29wKG4sIGZ1bmN0aW9uIChpKSB7XG4gICAgICAgICAgICAgIHJldHVybiBORVhUICsgJ1snICsgaSArICddJ1xuICAgICAgICAgICAgfSksICcpOycsXG4gICAgICAgICAgICBsb29wKG4sIGZ1bmN0aW9uIChpKSB7XG4gICAgICAgICAgICAgIHJldHVybiBDVVJSRU5UICsgJ1snICsgaSArICddPScgKyBORVhUICsgJ1snICsgaSArICddOydcbiAgICAgICAgICAgIH0pLmpvaW4oJycpKVxuICAgICAgICAgIHBvbGwoXG4gICAgICAgICAgICAnaWYoJywgbG9vcChuLCBmdW5jdGlvbiAoaSkge1xuICAgICAgICAgICAgICByZXR1cm4gTkVYVCArICdbJyArIGkgKyAnXSE9PScgKyBDVVJSRU5UICsgJ1snICsgaSArICddJ1xuICAgICAgICAgICAgfSkuam9pbignfHwnKSwgJyl7JyxcbiAgICAgICAgICAgIGJsb2NrLFxuICAgICAgICAgICAgJ30nKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIE5FWFQgPSBjb21tb24uZGVmKE5FWFRfU1RBVEUsICcuJywgbmFtZSlcbiAgICAgICAgICBDVVJSRU5UID0gY29tbW9uLmRlZihDVVJSRU5UX1NUQVRFLCAnLicsIG5hbWUpXG4gICAgICAgICAgYmxvY2soXG4gICAgICAgICAgICBORVhULCAnKTsnLFxuICAgICAgICAgICAgQ1VSUkVOVF9TVEFURSwgJy4nLCBuYW1lLCAnPScsIE5FWFQsICc7JylcbiAgICAgICAgICBwb2xsKFxuICAgICAgICAgICAgJ2lmKCcsIE5FWFQsICchPT0nLCBDVVJSRU5ULCAnKXsnLFxuICAgICAgICAgICAgYmxvY2ssXG4gICAgICAgICAgICAnfScpXG4gICAgICAgIH1cbiAgICAgICAgcmVmcmVzaChibG9jaylcbiAgICAgIH0pXG5cbiAgICAgIHJldHVybiBlbnYuY29tcGlsZSgpXG4gICAgfSkoKSxcbiAgICBjb21waWxlOiBjb21waWxlQ29tbWFuZFxuICB9XG59XG4iLCJ2YXIgVkFSSUFCTEVfQ09VTlRFUiA9IDBcblxudmFyIERZTl9GVU5DID0gMFxuXG5mdW5jdGlvbiBEeW5hbWljVmFyaWFibGUgKHR5cGUsIGRhdGEpIHtcbiAgdGhpcy5pZCA9IChWQVJJQUJMRV9DT1VOVEVSKyspXG4gIHRoaXMudHlwZSA9IHR5cGVcbiAgdGhpcy5kYXRhID0gZGF0YVxufVxuXG5mdW5jdGlvbiBlc2NhcGVTdHIgKHN0cikge1xuICByZXR1cm4gc3RyLnJlcGxhY2UoL1xcXFwvZywgJ1xcXFxcXFxcJykucmVwbGFjZSgvXCIvZywgJ1xcXFxcIicpXG59XG5cbmZ1bmN0aW9uIHNwbGl0UGFydHMgKHN0cikge1xuICBpZiAoc3RyLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiBbXVxuICB9XG5cbiAgdmFyIGZpcnN0Q2hhciA9IHN0ci5jaGFyQXQoMClcbiAgdmFyIGxhc3RDaGFyID0gc3RyLmNoYXJBdChzdHIubGVuZ3RoIC0gMSlcblxuICBpZiAoc3RyLmxlbmd0aCA+IDEgJiZcbiAgICAgIGZpcnN0Q2hhciA9PT0gbGFzdENoYXIgJiZcbiAgICAgIChmaXJzdENoYXIgPT09ICdcIicgfHwgZmlyc3RDaGFyID09PSBcIidcIikpIHtcbiAgICByZXR1cm4gWydcIicgKyBlc2NhcGVTdHIoc3RyLnN1YnN0cigxLCBzdHIubGVuZ3RoIC0gMikpICsgJ1wiJ11cbiAgfVxuXG4gIHZhciBwYXJ0cyA9IC9cXFsoZmFsc2V8dHJ1ZXxudWxsfFxcZCt8J1teJ10qJ3xcIlteXCJdKlwiKVxcXS8uZXhlYyhzdHIpXG4gIGlmIChwYXJ0cykge1xuICAgIHJldHVybiAoXG4gICAgICBzcGxpdFBhcnRzKHN0ci5zdWJzdHIoMCwgcGFydHMuaW5kZXgpKVxuICAgICAgLmNvbmNhdChzcGxpdFBhcnRzKHBhcnRzWzFdKSlcbiAgICAgIC5jb25jYXQoc3BsaXRQYXJ0cyhzdHIuc3Vic3RyKHBhcnRzLmluZGV4ICsgcGFydHNbMF0ubGVuZ3RoKSkpXG4gICAgKVxuICB9XG5cbiAgdmFyIHN1YnBhcnRzID0gc3RyLnNwbGl0KCcuJylcbiAgaWYgKHN1YnBhcnRzLmxlbmd0aCA9PT0gMSkge1xuICAgIHJldHVybiBbJ1wiJyArIGVzY2FwZVN0cihzdHIpICsgJ1wiJ11cbiAgfVxuXG4gIHZhciByZXN1bHQgPSBbXVxuICBmb3IgKHZhciBpID0gMDsgaSA8IHN1YnBhcnRzLmxlbmd0aDsgKytpKSB7XG4gICAgcmVzdWx0ID0gcmVzdWx0LmNvbmNhdChzcGxpdFBhcnRzKHN1YnBhcnRzW2ldKSlcbiAgfVxuICByZXR1cm4gcmVzdWx0XG59XG5cbmZ1bmN0aW9uIHRvQWNjZXNzb3JTdHJpbmcgKHN0cikge1xuICByZXR1cm4gJ1snICsgc3BsaXRQYXJ0cyhzdHIpLmpvaW4oJ11bJykgKyAnXSdcbn1cblxuZnVuY3Rpb24gZGVmaW5lRHluYW1pYyAodHlwZSwgZGF0YSkge1xuICByZXR1cm4gbmV3IER5bmFtaWNWYXJpYWJsZSh0eXBlLCB0b0FjY2Vzc29yU3RyaW5nKGRhdGEgKyAnJykpXG59XG5cbmZ1bmN0aW9uIGlzRHluYW1pYyAoeCkge1xuICByZXR1cm4gKHR5cGVvZiB4ID09PSAnZnVuY3Rpb24nICYmICF4Ll9yZWdsVHlwZSkgfHxcbiAgICAgICAgIHggaW5zdGFuY2VvZiBEeW5hbWljVmFyaWFibGVcbn1cblxuZnVuY3Rpb24gdW5ib3ggKHgsIHBhdGgpIHtcbiAgaWYgKHR5cGVvZiB4ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgcmV0dXJuIG5ldyBEeW5hbWljVmFyaWFibGUoRFlOX0ZVTkMsIHgpXG4gIH1cbiAgcmV0dXJuIHhcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIER5bmFtaWNWYXJpYWJsZTogRHluYW1pY1ZhcmlhYmxlLFxuICBkZWZpbmU6IGRlZmluZUR5bmFtaWMsXG4gIGlzRHluYW1pYzogaXNEeW5hbWljLFxuICB1bmJveDogdW5ib3gsXG4gIGFjY2Vzc29yOiB0b0FjY2Vzc29yU3RyaW5nXG59XG4iLCJcbnZhciBpc1R5cGVkQXJyYXkgPSByZXF1aXJlKCcuL3V0aWwvaXMtdHlwZWQtYXJyYXknKVxudmFyIGlzTkRBcnJheUxpa2UgPSByZXF1aXJlKCcuL3V0aWwvaXMtbmRhcnJheScpXG52YXIgdmFsdWVzID0gcmVxdWlyZSgnLi91dGlsL3ZhbHVlcycpXG5cbnZhciBwcmltVHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy9wcmltaXRpdmVzLmpzb24nKVxudmFyIHVzYWdlVHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy91c2FnZS5qc29uJylcblxudmFyIEdMX1BPSU5UUyA9IDBcbnZhciBHTF9MSU5FUyA9IDFcbnZhciBHTF9UUklBTkdMRVMgPSA0XG5cbnZhciBHTF9CWVRFID0gNTEyMFxudmFyIEdMX1VOU0lHTkVEX0JZVEUgPSA1MTIxXG52YXIgR0xfU0hPUlQgPSA1MTIyXG52YXIgR0xfVU5TSUdORURfU0hPUlQgPSA1MTIzXG52YXIgR0xfSU5UID0gNTEyNFxudmFyIEdMX1VOU0lHTkVEX0lOVCA9IDUxMjVcblxudmFyIEdMX0VMRU1FTlRfQVJSQVlfQlVGRkVSID0gMzQ5NjNcblxudmFyIEdMX1NUUkVBTV9EUkFXID0gMHg4OEUwXG52YXIgR0xfU1RBVElDX0RSQVcgPSAweDg4RTRcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwRWxlbWVudHNTdGF0ZSAoZ2wsIGV4dGVuc2lvbnMsIGJ1ZmZlclN0YXRlLCBzdGF0cykge1xuICB2YXIgZWxlbWVudFNldCA9IHt9XG4gIHZhciBlbGVtZW50Q291bnQgPSAwXG5cbiAgdmFyIGVsZW1lbnRUeXBlcyA9IHtcbiAgICAndWludDgnOiBHTF9VTlNJR05FRF9CWVRFLFxuICAgICd1aW50MTYnOiBHTF9VTlNJR05FRF9TSE9SVFxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMub2VzX2VsZW1lbnRfaW5kZXhfdWludCkge1xuICAgIGVsZW1lbnRUeXBlcy51aW50MzIgPSBHTF9VTlNJR05FRF9JTlRcbiAgfVxuXG4gIGZ1bmN0aW9uIFJFR0xFbGVtZW50QnVmZmVyIChidWZmZXIpIHtcbiAgICB0aGlzLmlkID0gZWxlbWVudENvdW50KytcbiAgICBlbGVtZW50U2V0W3RoaXMuaWRdID0gdGhpc1xuICAgIHRoaXMuYnVmZmVyID0gYnVmZmVyXG4gICAgdGhpcy5wcmltVHlwZSA9IEdMX1RSSUFOR0xFU1xuICAgIHRoaXMudmVydENvdW50ID0gMFxuICAgIHRoaXMudHlwZSA9IDBcbiAgfVxuXG4gIFJFR0xFbGVtZW50QnVmZmVyLnByb3RvdHlwZS5iaW5kID0gZnVuY3Rpb24gKCkge1xuICAgIHRoaXMuYnVmZmVyLmJpbmQoKVxuICB9XG5cbiAgdmFyIGJ1ZmZlclBvb2wgPSBbXVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZUVsZW1lbnRTdHJlYW0gKGRhdGEpIHtcbiAgICB2YXIgcmVzdWx0ID0gYnVmZmVyUG9vbC5wb3AoKVxuICAgIGlmICghcmVzdWx0KSB7XG4gICAgICByZXN1bHQgPSBuZXcgUkVHTEVsZW1lbnRCdWZmZXIoYnVmZmVyU3RhdGUuY3JlYXRlKFxuICAgICAgICBudWxsLFxuICAgICAgICBHTF9FTEVNRU5UX0FSUkFZX0JVRkZFUixcbiAgICAgICAgdHJ1ZSxcbiAgICAgICAgZmFsc2UpLl9idWZmZXIpXG4gICAgfVxuICAgIGluaXRFbGVtZW50cyhyZXN1bHQsIGRhdGEsIEdMX1NUUkVBTV9EUkFXLCAtMSwgLTEsIDAsIDApXG4gICAgcmV0dXJuIHJlc3VsdFxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveUVsZW1lbnRTdHJlYW0gKGVsZW1lbnRzKSB7XG4gICAgYnVmZmVyUG9vbC5wdXNoKGVsZW1lbnRzKVxuICB9XG5cbiAgZnVuY3Rpb24gaW5pdEVsZW1lbnRzIChcbiAgICBlbGVtZW50cyxcbiAgICBkYXRhLFxuICAgIHVzYWdlLFxuICAgIHByaW0sXG4gICAgY291bnQsXG4gICAgYnl0ZUxlbmd0aCxcbiAgICB0eXBlKSB7XG4gICAgZWxlbWVudHMuYnVmZmVyLmJpbmQoKVxuICAgIGlmIChkYXRhKSB7XG4gICAgICB2YXIgcHJlZGljdGVkVHlwZSA9IHR5cGVcbiAgICAgIGlmICghdHlwZSAmJiAoXG4gICAgICAgICAgIWlzVHlwZWRBcnJheShkYXRhKSB8fFxuICAgICAgICAgKGlzTkRBcnJheUxpa2UoZGF0YSkgJiYgIWlzVHlwZWRBcnJheShkYXRhLmRhdGEpKSkpIHtcbiAgICAgICAgcHJlZGljdGVkVHlwZSA9IGV4dGVuc2lvbnMub2VzX2VsZW1lbnRfaW5kZXhfdWludFxuICAgICAgICAgID8gR0xfVU5TSUdORURfSU5UXG4gICAgICAgICAgOiBHTF9VTlNJR05FRF9TSE9SVFxuICAgICAgfVxuICAgICAgYnVmZmVyU3RhdGUuX2luaXRCdWZmZXIoXG4gICAgICAgIGVsZW1lbnRzLmJ1ZmZlcixcbiAgICAgICAgZGF0YSxcbiAgICAgICAgdXNhZ2UsXG4gICAgICAgIHByZWRpY3RlZFR5cGUsXG4gICAgICAgIDMpXG4gICAgfSBlbHNlIHtcbiAgICAgIGdsLmJ1ZmZlckRhdGEoR0xfRUxFTUVOVF9BUlJBWV9CVUZGRVIsIGJ5dGVMZW5ndGgsIHVzYWdlKVxuICAgICAgZWxlbWVudHMuYnVmZmVyLmR0eXBlID0gZHR5cGUgfHwgR0xfVU5TSUdORURfQllURVxuICAgICAgZWxlbWVudHMuYnVmZmVyLnVzYWdlID0gdXNhZ2VcbiAgICAgIGVsZW1lbnRzLmJ1ZmZlci5kaW1lbnNpb24gPSAzXG4gICAgICBlbGVtZW50cy5idWZmZXIuYnl0ZUxlbmd0aCA9IGJ5dGVMZW5ndGhcbiAgICB9XG5cbiAgICB2YXIgZHR5cGUgPSB0eXBlXG4gICAgaWYgKCF0eXBlKSB7XG4gICAgICBzd2l0Y2ggKGVsZW1lbnRzLmJ1ZmZlci5kdHlwZSkge1xuICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX0JZVEU6XG4gICAgICAgIGNhc2UgR0xfQllURTpcbiAgICAgICAgICBkdHlwZSA9IEdMX1VOU0lHTkVEX0JZVEVcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfVU5TSUdORURfU0hPUlQ6XG4gICAgICAgIGNhc2UgR0xfU0hPUlQ6XG4gICAgICAgICAgZHR5cGUgPSBHTF9VTlNJR05FRF9TSE9SVFxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9JTlQ6XG4gICAgICAgIGNhc2UgR0xfSU5UOlxuICAgICAgICAgIGR0eXBlID0gR0xfVU5TSUdORURfSU5UXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIFxuICAgICAgfVxuICAgICAgZWxlbWVudHMuYnVmZmVyLmR0eXBlID0gZHR5cGVcbiAgICB9XG4gICAgZWxlbWVudHMudHlwZSA9IGR0eXBlXG5cbiAgICAvLyBDaGVjayBvZXNfZWxlbWVudF9pbmRleF91aW50IGV4dGVuc2lvblxuICAgIFxuXG4gICAgLy8gdHJ5IHRvIGd1ZXNzIGRlZmF1bHQgcHJpbWl0aXZlIHR5cGUgYW5kIGFyZ3VtZW50c1xuICAgIHZhciB2ZXJ0Q291bnQgPSBjb3VudFxuICAgIGlmICh2ZXJ0Q291bnQgPCAwKSB7XG4gICAgICB2ZXJ0Q291bnQgPSBlbGVtZW50cy5idWZmZXIuYnl0ZUxlbmd0aFxuICAgICAgaWYgKGR0eXBlID09PSBHTF9VTlNJR05FRF9TSE9SVCkge1xuICAgICAgICB2ZXJ0Q291bnQgPj49IDFcbiAgICAgIH0gZWxzZSBpZiAoZHR5cGUgPT09IEdMX1VOU0lHTkVEX0lOVCkge1xuICAgICAgICB2ZXJ0Q291bnQgPj49IDJcbiAgICAgIH1cbiAgICB9XG4gICAgZWxlbWVudHMudmVydENvdW50ID0gdmVydENvdW50XG5cbiAgICAvLyB0cnkgdG8gZ3Vlc3MgcHJpbWl0aXZlIHR5cGUgZnJvbSBjZWxsIGRpbWVuc2lvblxuICAgIHZhciBwcmltVHlwZSA9IHByaW1cbiAgICBpZiAocHJpbSA8IDApIHtcbiAgICAgIHByaW1UeXBlID0gR0xfVFJJQU5HTEVTXG4gICAgICB2YXIgZGltZW5zaW9uID0gZWxlbWVudHMuYnVmZmVyLmRpbWVuc2lvblxuICAgICAgaWYgKGRpbWVuc2lvbiA9PT0gMSkgcHJpbVR5cGUgPSBHTF9QT0lOVFNcbiAgICAgIGlmIChkaW1lbnNpb24gPT09IDIpIHByaW1UeXBlID0gR0xfTElORVNcbiAgICAgIGlmIChkaW1lbnNpb24gPT09IDMpIHByaW1UeXBlID0gR0xfVFJJQU5HTEVTXG4gICAgfVxuICAgIGVsZW1lbnRzLnByaW1UeXBlID0gcHJpbVR5cGVcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlc3Ryb3lFbGVtZW50cyAoZWxlbWVudHMpIHtcbiAgICBzdGF0cy5lbGVtZW50c0NvdW50LS1cblxuICAgIFxuICAgIGRlbGV0ZSBlbGVtZW50U2V0W2VsZW1lbnRzLmlkXVxuICAgIGVsZW1lbnRzLmJ1ZmZlci5kZXN0cm95KClcbiAgICBlbGVtZW50cy5idWZmZXIgPSBudWxsXG4gIH1cblxuICBmdW5jdGlvbiBjcmVhdGVFbGVtZW50cyAob3B0aW9ucywgcGVyc2lzdGVudCkge1xuICAgIHZhciBidWZmZXIgPSBidWZmZXJTdGF0ZS5jcmVhdGUobnVsbCwgR0xfRUxFTUVOVF9BUlJBWV9CVUZGRVIsIHRydWUpXG4gICAgdmFyIGVsZW1lbnRzID0gbmV3IFJFR0xFbGVtZW50QnVmZmVyKGJ1ZmZlci5fYnVmZmVyKVxuICAgIHN0YXRzLmVsZW1lbnRzQ291bnQrK1xuXG4gICAgZnVuY3Rpb24gcmVnbEVsZW1lbnRzIChvcHRpb25zKSB7XG4gICAgICBpZiAoIW9wdGlvbnMpIHtcbiAgICAgICAgYnVmZmVyKClcbiAgICAgICAgZWxlbWVudHMucHJpbVR5cGUgPSBHTF9UUklBTkdMRVNcbiAgICAgICAgZWxlbWVudHMudmVydENvdW50ID0gMFxuICAgICAgICBlbGVtZW50cy50eXBlID0gR0xfVU5TSUdORURfQllURVxuICAgICAgfSBlbHNlIGlmICh0eXBlb2Ygb3B0aW9ucyA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgYnVmZmVyKG9wdGlvbnMpXG4gICAgICAgIGVsZW1lbnRzLnByaW1UeXBlID0gR0xfVFJJQU5HTEVTXG4gICAgICAgIGVsZW1lbnRzLnZlcnRDb3VudCA9IG9wdGlvbnMgfCAwXG4gICAgICAgIGVsZW1lbnRzLnR5cGUgPSBHTF9VTlNJR05FRF9CWVRFXG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgZGF0YSA9IG51bGxcbiAgICAgICAgdmFyIHVzYWdlID0gR0xfU1RBVElDX0RSQVdcbiAgICAgICAgdmFyIHByaW1UeXBlID0gLTFcbiAgICAgICAgdmFyIHZlcnRDb3VudCA9IC0xXG4gICAgICAgIHZhciBieXRlTGVuZ3RoID0gMFxuICAgICAgICB2YXIgZHR5cGUgPSAwXG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KG9wdGlvbnMpIHx8XG4gICAgICAgICAgICBpc1R5cGVkQXJyYXkob3B0aW9ucykgfHxcbiAgICAgICAgICAgIGlzTkRBcnJheUxpa2Uob3B0aW9ucykpIHtcbiAgICAgICAgICBkYXRhID0gb3B0aW9uc1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIFxuICAgICAgICAgIGlmICgnZGF0YScgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgZGF0YSA9IG9wdGlvbnMuZGF0YVxuICAgICAgICAgICAgXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICgndXNhZ2UnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgdXNhZ2UgPSB1c2FnZVR5cGVzW29wdGlvbnMudXNhZ2VdXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICgncHJpbWl0aXZlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHByaW1UeXBlID0gcHJpbVR5cGVzW29wdGlvbnMucHJpbWl0aXZlXVxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoJ2NvdW50JyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHZlcnRDb3VudCA9IG9wdGlvbnMuY291bnQgfCAwXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICgndHlwZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBkdHlwZSA9IGVsZW1lbnRUeXBlc1tvcHRpb25zLnR5cGVdXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICgnbGVuZ3RoJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBieXRlTGVuZ3RoID0gb3B0aW9ucy5sZW5ndGggfCAwXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGJ5dGVMZW5ndGggPSB2ZXJ0Q291bnRcbiAgICAgICAgICAgIGlmIChkdHlwZSA9PT0gR0xfVU5TSUdORURfU0hPUlQgfHwgZHR5cGUgPT09IEdMX1NIT1JUKSB7XG4gICAgICAgICAgICAgIGJ5dGVMZW5ndGggKj0gMlxuICAgICAgICAgICAgfSBlbHNlIGlmIChkdHlwZSA9PT0gR0xfVU5TSUdORURfSU5UIHx8IGR0eXBlID09PSBHTF9JTlQpIHtcbiAgICAgICAgICAgICAgYnl0ZUxlbmd0aCAqPSA0XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGluaXRFbGVtZW50cyhcbiAgICAgICAgICBlbGVtZW50cyxcbiAgICAgICAgICBkYXRhLFxuICAgICAgICAgIHVzYWdlLFxuICAgICAgICAgIHByaW1UeXBlLFxuICAgICAgICAgIHZlcnRDb3VudCxcbiAgICAgICAgICBieXRlTGVuZ3RoLFxuICAgICAgICAgIGR0eXBlKVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gcmVnbEVsZW1lbnRzXG4gICAgfVxuXG4gICAgcmVnbEVsZW1lbnRzKG9wdGlvbnMpXG5cbiAgICByZWdsRWxlbWVudHMuX3JlZ2xUeXBlID0gJ2VsZW1lbnRzJ1xuICAgIHJlZ2xFbGVtZW50cy5fZWxlbWVudHMgPSBlbGVtZW50c1xuICAgIHJlZ2xFbGVtZW50cy5zdWJkYXRhID0gZnVuY3Rpb24gKGRhdGEsIG9mZnNldCkge1xuICAgICAgYnVmZmVyLnN1YmRhdGEoZGF0YSwgb2Zmc2V0KVxuICAgICAgcmV0dXJuIHJlZ2xFbGVtZW50c1xuICAgIH1cbiAgICByZWdsRWxlbWVudHMuZGVzdHJveSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIGRlc3Ryb3lFbGVtZW50cyhlbGVtZW50cylcbiAgICB9XG5cbiAgICByZXR1cm4gcmVnbEVsZW1lbnRzXG4gIH1cblxuICByZXR1cm4ge1xuICAgIGNyZWF0ZTogY3JlYXRlRWxlbWVudHMsXG4gICAgY3JlYXRlU3RyZWFtOiBjcmVhdGVFbGVtZW50U3RyZWFtLFxuICAgIGRlc3Ryb3lTdHJlYW06IGRlc3Ryb3lFbGVtZW50U3RyZWFtLFxuICAgIGdldEVsZW1lbnRzOiBmdW5jdGlvbiAoZWxlbWVudHMpIHtcbiAgICAgIGlmICh0eXBlb2YgZWxlbWVudHMgPT09ICdmdW5jdGlvbicgJiZcbiAgICAgICAgICBlbGVtZW50cy5fZWxlbWVudHMgaW5zdGFuY2VvZiBSRUdMRWxlbWVudEJ1ZmZlcikge1xuICAgICAgICByZXR1cm4gZWxlbWVudHMuX2VsZW1lbnRzXG4gICAgICB9XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH0sXG4gICAgY2xlYXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhbHVlcyhlbGVtZW50U2V0KS5mb3JFYWNoKGRlc3Ryb3lFbGVtZW50cylcbiAgICB9XG4gIH1cbn1cbiIsIlxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNyZWF0ZUV4dGVuc2lvbkNhY2hlIChnbCwgY29uZmlnKSB7XG4gIHZhciBleHRlbnNpb25zID0ge31cblxuICBmdW5jdGlvbiB0cnlMb2FkRXh0ZW5zaW9uIChuYW1lXykge1xuICAgIFxuICAgIHZhciBuYW1lID0gbmFtZV8udG9Mb3dlckNhc2UoKVxuICAgIHZhciBleHRcbiAgICB0cnkge1xuICAgICAgZXh0ID0gZXh0ZW5zaW9uc1tuYW1lXSA9IGdsLmdldEV4dGVuc2lvbihuYW1lKVxuICAgIH0gY2F0Y2ggKGUpIHt9XG4gICAgcmV0dXJuICEhZXh0XG4gIH1cblxuICBmb3IgKHZhciBpID0gMDsgaSA8IGNvbmZpZy5leHRlbnNpb25zLmxlbmd0aDsgKytpKSB7XG4gICAgdmFyIG5hbWUgPSBjb25maWcuZXh0ZW5zaW9uc1tpXVxuICAgIGlmICghdHJ5TG9hZEV4dGVuc2lvbihuYW1lKSkge1xuICAgICAgY29uZmlnLm9uRGVzdHJveSgpXG4gICAgICBjb25maWcub25Eb25lKCdcIicgKyBuYW1lICsgJ1wiIGV4dGVuc2lvbiBpcyBub3Qgc3VwcG9ydGVkIGJ5IHRoZSBjdXJyZW50IFdlYkdMIGNvbnRleHQsIHRyeSB1cGdyYWRpbmcgeW91ciBzeXN0ZW0gb3IgYSBkaWZmZXJlbnQgYnJvd3NlcicpXG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cbiAgfVxuXG4gIGNvbmZpZy5vcHRpb25hbEV4dGVuc2lvbnMuZm9yRWFjaCh0cnlMb2FkRXh0ZW5zaW9uKVxuXG4gIHJldHVybiB7XG4gICAgZXh0ZW5zaW9uczogZXh0ZW5zaW9ucyxcbiAgICByZXN0b3JlOiBmdW5jdGlvbiAoKSB7XG4gICAgICBPYmplY3Qua2V5cyhleHRlbnNpb25zKS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICAgIGlmICghdHJ5TG9hZEV4dGVuc2lvbihuYW1lKSkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcignKHJlZ2wpOiBlcnJvciByZXN0b3JpbmcgZXh0ZW5zaW9uICcgKyBuYW1lKVxuICAgICAgICB9XG4gICAgICB9KVxuICAgIH1cbiAgfVxufVxuIiwiXG52YXIgdmFsdWVzID0gcmVxdWlyZSgnLi91dGlsL3ZhbHVlcycpXG52YXIgZXh0ZW5kID0gcmVxdWlyZSgnLi91dGlsL2V4dGVuZCcpXG5cbi8vIFdlIHN0b3JlIHRoZXNlIGNvbnN0YW50cyBzbyB0aGF0IHRoZSBtaW5pZmllciBjYW4gaW5saW5lIHRoZW1cbnZhciBHTF9GUkFNRUJVRkZFUiA9IDB4OEQ0MFxudmFyIEdMX1JFTkRFUkJVRkZFUiA9IDB4OEQ0MVxuXG52YXIgR0xfVEVYVFVSRV8yRCA9IDB4MERFMVxudmFyIEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCA9IDB4ODUxNVxuXG52YXIgR0xfQ09MT1JfQVRUQUNITUVOVDAgPSAweDhDRTBcbnZhciBHTF9ERVBUSF9BVFRBQ0hNRU5UID0gMHg4RDAwXG52YXIgR0xfU1RFTkNJTF9BVFRBQ0hNRU5UID0gMHg4RDIwXG52YXIgR0xfREVQVEhfU1RFTkNJTF9BVFRBQ0hNRU5UID0gMHg4MjFBXG5cbnZhciBHTF9GUkFNRUJVRkZFUl9DT01QTEVURSA9IDB4OENENVxudmFyIEdMX0ZSQU1FQlVGRkVSX0lOQ09NUExFVEVfQVRUQUNITUVOVCA9IDB4OENENlxudmFyIEdMX0ZSQU1FQlVGRkVSX0lOQ09NUExFVEVfTUlTU0lOR19BVFRBQ0hNRU5UID0gMHg4Q0Q3XG52YXIgR0xfRlJBTUVCVUZGRVJfSU5DT01QTEVURV9ESU1FTlNJT05TID0gMHg4Q0Q5XG52YXIgR0xfRlJBTUVCVUZGRVJfVU5TVVBQT1JURUQgPSAweDhDRERcblxudmFyIEdMX0hBTEZfRkxPQVRfT0VTID0gMHg4RDYxXG52YXIgR0xfVU5TSUdORURfQllURSA9IDB4MTQwMVxudmFyIEdMX0ZMT0FUID0gMHgxNDA2XG5cbnZhciBHTF9SR0JBID0gMHgxOTA4XG5cbnZhciBHTF9ERVBUSF9DT01QT05FTlQgPSAweDE5MDJcblxudmFyIGNvbG9yVGV4dHVyZUZvcm1hdEVudW1zID0gW1xuICBHTF9SR0JBXG5dXG5cbi8vIGZvciBldmVyeSB0ZXh0dXJlIGZvcm1hdCwgc3RvcmVcbi8vIHRoZSBudW1iZXIgb2YgY2hhbm5lbHNcbnZhciB0ZXh0dXJlRm9ybWF0Q2hhbm5lbHMgPSBbXVxudGV4dHVyZUZvcm1hdENoYW5uZWxzW0dMX1JHQkFdID0gNFxuXG4vLyBmb3IgZXZlcnkgdGV4dHVyZSB0eXBlLCBzdG9yZVxuLy8gdGhlIHNpemUgaW4gYnl0ZXMuXG52YXIgdGV4dHVyZVR5cGVTaXplcyA9IFtdXG50ZXh0dXJlVHlwZVNpemVzW0dMX1VOU0lHTkVEX0JZVEVdID0gMVxudGV4dHVyZVR5cGVTaXplc1tHTF9GTE9BVF0gPSA0XG50ZXh0dXJlVHlwZVNpemVzW0dMX0hBTEZfRkxPQVRfT0VTXSA9IDJcblxudmFyIEdMX1JHQkE0ID0gMHg4MDU2XG52YXIgR0xfUkdCNV9BMSA9IDB4ODA1N1xudmFyIEdMX1JHQjU2NSA9IDB4OEQ2MlxudmFyIEdMX0RFUFRIX0NPTVBPTkVOVDE2ID0gMHg4MUE1XG52YXIgR0xfU1RFTkNJTF9JTkRFWDggPSAweDhENDhcbnZhciBHTF9ERVBUSF9TVEVOQ0lMID0gMHg4NEY5XG5cbnZhciBHTF9TUkdCOF9BTFBIQThfRVhUID0gMHg4QzQzXG5cbnZhciBHTF9SR0JBMzJGX0VYVCA9IDB4ODgxNFxuXG52YXIgR0xfUkdCQTE2Rl9FWFQgPSAweDg4MUFcbnZhciBHTF9SR0IxNkZfRVhUID0gMHg4ODFCXG5cbnZhciBjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdEVudW1zID0gW1xuICBHTF9SR0JBNCxcbiAgR0xfUkdCNV9BMSxcbiAgR0xfUkdCNTY1LFxuICBHTF9TUkdCOF9BTFBIQThfRVhULFxuICBHTF9SR0JBMTZGX0VYVCxcbiAgR0xfUkdCMTZGX0VYVCxcbiAgR0xfUkdCQTMyRl9FWFRcbl1cblxudmFyIHN0YXR1c0NvZGUgPSB7fVxuc3RhdHVzQ29kZVtHTF9GUkFNRUJVRkZFUl9DT01QTEVURV0gPSAnY29tcGxldGUnXG5zdGF0dXNDb2RlW0dMX0ZSQU1FQlVGRkVSX0lOQ09NUExFVEVfQVRUQUNITUVOVF0gPSAnaW5jb21wbGV0ZSBhdHRhY2htZW50J1xuc3RhdHVzQ29kZVtHTF9GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX0RJTUVOU0lPTlNdID0gJ2luY29tcGxldGUgZGltZW5zaW9ucydcbnN0YXR1c0NvZGVbR0xfRlJBTUVCVUZGRVJfSU5DT01QTEVURV9NSVNTSU5HX0FUVEFDSE1FTlRdID0gJ2luY29tcGxldGUsIG1pc3NpbmcgYXR0YWNobWVudCdcbnN0YXR1c0NvZGVbR0xfRlJBTUVCVUZGRVJfVU5TVVBQT1JURURdID0gJ3Vuc3VwcG9ydGVkJ1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBGQk9TdGF0ZSAoXG4gIGdsLFxuICBleHRlbnNpb25zLFxuICBsaW1pdHMsXG4gIHRleHR1cmVTdGF0ZSxcbiAgcmVuZGVyYnVmZmVyU3RhdGUsXG4gIHN0YXRzKSB7XG4gIHZhciBmcmFtZWJ1ZmZlclN0YXRlID0ge1xuICAgIGN1cjogbnVsbCxcbiAgICBuZXh0OiBudWxsLFxuICAgIGRpcnR5OiBmYWxzZVxuICB9XG5cbiAgdmFyIGNvbG9yVGV4dHVyZUZvcm1hdHMgPSBbJ3JnYmEnXVxuICB2YXIgY29sb3JSZW5kZXJidWZmZXJGb3JtYXRzID0gWydyZ2JhNCcsICdyZ2I1NjUnLCAncmdiNSBhMSddXG5cbiAgaWYgKGV4dGVuc2lvbnMuZXh0X3NyZ2IpIHtcbiAgICBjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdHMucHVzaCgnc3JnYmEnKVxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMuZXh0X2NvbG9yX2J1ZmZlcl9oYWxmX2Zsb2F0KSB7XG4gICAgY29sb3JSZW5kZXJidWZmZXJGb3JtYXRzLnB1c2goJ3JnYmExNmYnLCAncmdiMTZmJylcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLndlYmdsX2NvbG9yX2J1ZmZlcl9mbG9hdCkge1xuICAgIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0cy5wdXNoKCdyZ2JhMzJmJylcbiAgfVxuXG4gIHZhciBjb2xvclR5cGVzID0gWyd1aW50OCddXG4gIGlmIChleHRlbnNpb25zLm9lc190ZXh0dXJlX2hhbGZfZmxvYXQpIHtcbiAgICBjb2xvclR5cGVzLnB1c2goJ2hhbGYgZmxvYXQnLCAnZmxvYXQxNicpXG4gIH1cbiAgaWYgKGV4dGVuc2lvbnMub2VzX3RleHR1cmVfZmxvYXQpIHtcbiAgICBjb2xvclR5cGVzLnB1c2goJ2Zsb2F0JywgJ2Zsb2F0MzInKVxuICB9XG5cbiAgZnVuY3Rpb24gRnJhbWVidWZmZXJBdHRhY2htZW50ICh0YXJnZXQsIHRleHR1cmUsIHJlbmRlcmJ1ZmZlcikge1xuICAgIHRoaXMudGFyZ2V0ID0gdGFyZ2V0XG4gICAgdGhpcy50ZXh0dXJlID0gdGV4dHVyZVxuICAgIHRoaXMucmVuZGVyYnVmZmVyID0gcmVuZGVyYnVmZmVyXG5cbiAgICB2YXIgdyA9IDBcbiAgICB2YXIgaCA9IDBcbiAgICBpZiAodGV4dHVyZSkge1xuICAgICAgdyA9IHRleHR1cmUud2lkdGhcbiAgICAgIGggPSB0ZXh0dXJlLmhlaWdodFxuICAgIH0gZWxzZSBpZiAocmVuZGVyYnVmZmVyKSB7XG4gICAgICB3ID0gcmVuZGVyYnVmZmVyLndpZHRoXG4gICAgICBoID0gcmVuZGVyYnVmZmVyLmhlaWdodFxuICAgIH1cbiAgICB0aGlzLndpZHRoID0gd1xuICAgIHRoaXMuaGVpZ2h0ID0gaFxuICB9XG5cbiAgZnVuY3Rpb24gZGVjUmVmIChhdHRhY2htZW50KSB7XG4gICAgaWYgKGF0dGFjaG1lbnQpIHtcbiAgICAgIGlmIChhdHRhY2htZW50LnRleHR1cmUpIHtcbiAgICAgICAgYXR0YWNobWVudC50ZXh0dXJlLl90ZXh0dXJlLmRlY1JlZigpXG4gICAgICB9XG4gICAgICBpZiAoYXR0YWNobWVudC5yZW5kZXJidWZmZXIpIHtcbiAgICAgICAgYXR0YWNobWVudC5yZW5kZXJidWZmZXIuX3JlbmRlcmJ1ZmZlci5kZWNSZWYoKVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGluY1JlZkFuZENoZWNrU2hhcGUgKGF0dGFjaG1lbnQsIHdpZHRoLCBoZWlnaHQpIHtcbiAgICBpZiAoIWF0dGFjaG1lbnQpIHtcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICBpZiAoYXR0YWNobWVudC50ZXh0dXJlKSB7XG4gICAgICB2YXIgdGV4dHVyZSA9IGF0dGFjaG1lbnQudGV4dHVyZS5fdGV4dHVyZVxuICAgICAgdmFyIHR3ID0gTWF0aC5tYXgoMSwgdGV4dHVyZS53aWR0aClcbiAgICAgIHZhciB0aCA9IE1hdGgubWF4KDEsIHRleHR1cmUuaGVpZ2h0KVxuICAgICAgXG4gICAgICB0ZXh0dXJlLnJlZkNvdW50ICs9IDFcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIHJlbmRlcmJ1ZmZlciA9IGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyLl9yZW5kZXJidWZmZXJcbiAgICAgIFxuICAgICAgcmVuZGVyYnVmZmVyLnJlZkNvdW50ICs9IDFcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBhdHRhY2ggKGxvY2F0aW9uLCBhdHRhY2htZW50KSB7XG4gICAgaWYgKGF0dGFjaG1lbnQpIHtcbiAgICAgIGlmIChhdHRhY2htZW50LnRleHR1cmUpIHtcbiAgICAgICAgZ2wuZnJhbWVidWZmZXJUZXh0dXJlMkQoXG4gICAgICAgICAgR0xfRlJBTUVCVUZGRVIsXG4gICAgICAgICAgbG9jYXRpb24sXG4gICAgICAgICAgYXR0YWNobWVudC50YXJnZXQsXG4gICAgICAgICAgYXR0YWNobWVudC50ZXh0dXJlLl90ZXh0dXJlLnRleHR1cmUsXG4gICAgICAgICAgMClcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGdsLmZyYW1lYnVmZmVyUmVuZGVyYnVmZmVyKFxuICAgICAgICAgIEdMX0ZSQU1FQlVGRkVSLFxuICAgICAgICAgIGxvY2F0aW9uLFxuICAgICAgICAgIEdMX1JFTkRFUkJVRkZFUixcbiAgICAgICAgICBhdHRhY2htZW50LnJlbmRlcmJ1ZmZlci5fcmVuZGVyYnVmZmVyLnJlbmRlcmJ1ZmZlcilcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZUF0dGFjaG1lbnQgKGF0dGFjaG1lbnQpIHtcbiAgICB2YXIgdGFyZ2V0ID0gR0xfVEVYVFVSRV8yRFxuICAgIHZhciB0ZXh0dXJlID0gbnVsbFxuICAgIHZhciByZW5kZXJidWZmZXIgPSBudWxsXG5cbiAgICB2YXIgZGF0YSA9IGF0dGFjaG1lbnRcbiAgICBpZiAodHlwZW9mIGF0dGFjaG1lbnQgPT09ICdvYmplY3QnKSB7XG4gICAgICBkYXRhID0gYXR0YWNobWVudC5kYXRhXG4gICAgICBpZiAoJ3RhcmdldCcgaW4gYXR0YWNobWVudCkge1xuICAgICAgICB0YXJnZXQgPSBhdHRhY2htZW50LnRhcmdldCB8IDBcbiAgICAgIH1cbiAgICB9XG5cbiAgICBcblxuICAgIHZhciB0eXBlID0gZGF0YS5fcmVnbFR5cGVcbiAgICBpZiAodHlwZSA9PT0gJ3RleHR1cmUyZCcpIHtcbiAgICAgIHRleHR1cmUgPSBkYXRhXG4gICAgICBcbiAgICB9IGVsc2UgaWYgKHR5cGUgPT09ICd0ZXh0dXJlQ3ViZScpIHtcbiAgICAgIHRleHR1cmUgPSBkYXRhXG4gICAgICBcbiAgICB9IGVsc2UgaWYgKHR5cGUgPT09ICdyZW5kZXJidWZmZXInKSB7XG4gICAgICByZW5kZXJidWZmZXIgPSBkYXRhXG4gICAgICB0YXJnZXQgPSBHTF9SRU5ERVJCVUZGRVJcbiAgICB9IGVsc2Uge1xuICAgICAgXG4gICAgfVxuXG4gICAgcmV0dXJuIG5ldyBGcmFtZWJ1ZmZlckF0dGFjaG1lbnQodGFyZ2V0LCB0ZXh0dXJlLCByZW5kZXJidWZmZXIpXG4gIH1cblxuICBmdW5jdGlvbiBhbGxvY0F0dGFjaG1lbnQgKFxuICAgIHdpZHRoLFxuICAgIGhlaWdodCxcbiAgICBpc1RleHR1cmUsXG4gICAgZm9ybWF0LFxuICAgIHR5cGUpIHtcbiAgICBpZiAoaXNUZXh0dXJlKSB7XG4gICAgICB2YXIgdGV4dHVyZSA9IHRleHR1cmVTdGF0ZS5jcmVhdGUyRCh7XG4gICAgICAgIHdpZHRoOiB3aWR0aCxcbiAgICAgICAgaGVpZ2h0OiBoZWlnaHQsXG4gICAgICAgIGZvcm1hdDogZm9ybWF0LFxuICAgICAgICB0eXBlOiB0eXBlXG4gICAgICB9KVxuICAgICAgdGV4dHVyZS5fdGV4dHVyZS5yZWZDb3VudCA9IDBcbiAgICAgIHJldHVybiBuZXcgRnJhbWVidWZmZXJBdHRhY2htZW50KEdMX1RFWFRVUkVfMkQsIHRleHR1cmUsIG51bGwpXG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciByYiA9IHJlbmRlcmJ1ZmZlclN0YXRlLmNyZWF0ZSh7XG4gICAgICAgIHdpZHRoOiB3aWR0aCxcbiAgICAgICAgaGVpZ2h0OiBoZWlnaHQsXG4gICAgICAgIGZvcm1hdDogZm9ybWF0XG4gICAgICB9KVxuICAgICAgcmIuX3JlbmRlcmJ1ZmZlci5yZWZDb3VudCA9IDBcbiAgICAgIHJldHVybiBuZXcgRnJhbWVidWZmZXJBdHRhY2htZW50KEdMX1JFTkRFUkJVRkZFUiwgbnVsbCwgcmIpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gdW53cmFwQXR0YWNobWVudCAoYXR0YWNobWVudCkge1xuICAgIHJldHVybiBhdHRhY2htZW50ICYmIChhdHRhY2htZW50LnRleHR1cmUgfHwgYXR0YWNobWVudC5yZW5kZXJidWZmZXIpXG4gIH1cblxuICBmdW5jdGlvbiByZXNpemVBdHRhY2htZW50IChhdHRhY2htZW50LCB3LCBoKSB7XG4gICAgaWYgKGF0dGFjaG1lbnQpIHtcbiAgICAgIGlmIChhdHRhY2htZW50LnRleHR1cmUpIHtcbiAgICAgICAgYXR0YWNobWVudC50ZXh0dXJlLnJlc2l6ZSh3LCBoKVxuICAgICAgfSBlbHNlIGlmIChhdHRhY2htZW50LnJlbmRlcmJ1ZmZlcikge1xuICAgICAgICBhdHRhY2htZW50LnJlbmRlcmJ1ZmZlci5yZXNpemUodywgaClcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICB2YXIgZnJhbWVidWZmZXJDb3VudCA9IDBcbiAgdmFyIGZyYW1lYnVmZmVyU2V0ID0ge31cblxuICBmdW5jdGlvbiBSRUdMRnJhbWVidWZmZXIgKCkge1xuICAgIHRoaXMuaWQgPSBmcmFtZWJ1ZmZlckNvdW50KytcbiAgICBmcmFtZWJ1ZmZlclNldFt0aGlzLmlkXSA9IHRoaXNcblxuICAgIHRoaXMuZnJhbWVidWZmZXIgPSBnbC5jcmVhdGVGcmFtZWJ1ZmZlcigpXG4gICAgdGhpcy53aWR0aCA9IDBcbiAgICB0aGlzLmhlaWdodCA9IDBcblxuICAgIHRoaXMuY29sb3JBdHRhY2htZW50cyA9IFtdXG4gICAgdGhpcy5kZXB0aEF0dGFjaG1lbnQgPSBudWxsXG4gICAgdGhpcy5zdGVuY2lsQXR0YWNobWVudCA9IG51bGxcbiAgICB0aGlzLmRlcHRoU3RlbmNpbEF0dGFjaG1lbnQgPSBudWxsXG4gIH1cblxuICBmdW5jdGlvbiBkZWNGQk9SZWZzIChmcmFtZWJ1ZmZlcikge1xuICAgIGZyYW1lYnVmZmVyLmNvbG9yQXR0YWNobWVudHMuZm9yRWFjaChkZWNSZWYpXG4gICAgZGVjUmVmKGZyYW1lYnVmZmVyLmRlcHRoQXR0YWNobWVudClcbiAgICBkZWNSZWYoZnJhbWVidWZmZXIuc3RlbmNpbEF0dGFjaG1lbnQpXG4gICAgZGVjUmVmKGZyYW1lYnVmZmVyLmRlcHRoU3RlbmNpbEF0dGFjaG1lbnQpXG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95IChmcmFtZWJ1ZmZlcikge1xuICAgIHZhciBoYW5kbGUgPSBmcmFtZWJ1ZmZlci5mcmFtZWJ1ZmZlclxuICAgIFxuICAgIGdsLmRlbGV0ZUZyYW1lYnVmZmVyKGhhbmRsZSlcbiAgICBmcmFtZWJ1ZmZlci5mcmFtZWJ1ZmZlciA9IG51bGxcbiAgICBzdGF0cy5mcmFtZWJ1ZmZlckNvdW50LS1cbiAgICBkZWxldGUgZnJhbWVidWZmZXJTZXRbZnJhbWVidWZmZXIuaWRdXG4gIH1cblxuICBmdW5jdGlvbiB1cGRhdGVGcmFtZWJ1ZmZlciAoZnJhbWVidWZmZXIpIHtcbiAgICB2YXIgaVxuXG4gICAgZ2wuYmluZEZyYW1lYnVmZmVyKEdMX0ZSQU1FQlVGRkVSLCBmcmFtZWJ1ZmZlci5mcmFtZWJ1ZmZlcilcbiAgICB2YXIgY29sb3JBdHRhY2htZW50cyA9IGZyYW1lYnVmZmVyLmNvbG9yQXR0YWNobWVudHNcbiAgICBmb3IgKGkgPSAwOyBpIDwgY29sb3JBdHRhY2htZW50cy5sZW5ndGg7ICsraSkge1xuICAgICAgYXR0YWNoKEdMX0NPTE9SX0FUVEFDSE1FTlQwICsgaSwgY29sb3JBdHRhY2htZW50c1tpXSlcbiAgICB9XG4gICAgZm9yIChpID0gY29sb3JBdHRhY2htZW50cy5sZW5ndGg7IGkgPCBsaW1pdHMubWF4Q29sb3JBdHRhY2htZW50czsgKytpKSB7XG4gICAgICBnbC5mcmFtZWJ1ZmZlclRleHR1cmUyRChcbiAgICAgICAgR0xfRlJBTUVCVUZGRVIsXG4gICAgICAgIEdMX0NPTE9SX0FUVEFDSE1FTlQwICsgaSxcbiAgICAgICAgR0xfVEVYVFVSRV8yRCxcbiAgICAgICAgbnVsbCxcbiAgICAgICAgMClcbiAgICB9XG5cbiAgICBnbC5mcmFtZWJ1ZmZlclRleHR1cmUyRChcbiAgICAgIEdMX0ZSQU1FQlVGRkVSLFxuICAgICAgR0xfREVQVEhfU1RFTkNJTF9BVFRBQ0hNRU5ULFxuICAgICAgR0xfVEVYVFVSRV8yRCxcbiAgICAgIG51bGwsXG4gICAgICAwKVxuICAgIGdsLmZyYW1lYnVmZmVyVGV4dHVyZTJEKFxuICAgICAgR0xfRlJBTUVCVUZGRVIsXG4gICAgICBHTF9ERVBUSF9BVFRBQ0hNRU5ULFxuICAgICAgR0xfVEVYVFVSRV8yRCxcbiAgICAgIG51bGwsXG4gICAgICAwKVxuICAgIGdsLmZyYW1lYnVmZmVyVGV4dHVyZTJEKFxuICAgICAgR0xfRlJBTUVCVUZGRVIsXG4gICAgICBHTF9TVEVOQ0lMX0FUVEFDSE1FTlQsXG4gICAgICBHTF9URVhUVVJFXzJELFxuICAgICAgbnVsbCxcbiAgICAgIDApXG5cbiAgICBhdHRhY2goR0xfREVQVEhfQVRUQUNITUVOVCwgZnJhbWVidWZmZXIuZGVwdGhBdHRhY2htZW50KVxuICAgIGF0dGFjaChHTF9TVEVOQ0lMX0FUVEFDSE1FTlQsIGZyYW1lYnVmZmVyLnN0ZW5jaWxBdHRhY2htZW50KVxuICAgIGF0dGFjaChHTF9ERVBUSF9TVEVOQ0lMX0FUVEFDSE1FTlQsIGZyYW1lYnVmZmVyLmRlcHRoU3RlbmNpbEF0dGFjaG1lbnQpXG5cbiAgICAvLyBDaGVjayBzdGF0dXMgY29kZVxuICAgIHZhciBzdGF0dXMgPSBnbC5jaGVja0ZyYW1lYnVmZmVyU3RhdHVzKEdMX0ZSQU1FQlVGRkVSKVxuICAgIGlmIChzdGF0dXMgIT09IEdMX0ZSQU1FQlVGRkVSX0NPTVBMRVRFKSB7XG4gICAgICBcbiAgICB9XG5cbiAgICBnbC5iaW5kRnJhbWVidWZmZXIoR0xfRlJBTUVCVUZGRVIsIGZyYW1lYnVmZmVyU3RhdGUubmV4dClcbiAgICBmcmFtZWJ1ZmZlclN0YXRlLmN1ciA9IGZyYW1lYnVmZmVyU3RhdGUubmV4dFxuXG4gICAgLy8gRklYTUU6IENsZWFyIGVycm9yIGNvZGUgaGVyZS4gIFRoaXMgaXMgYSB3b3JrIGFyb3VuZCBmb3IgYSBidWcgaW5cbiAgICAvLyBoZWFkbGVzcy1nbFxuICAgIGdsLmdldEVycm9yKClcbiAgfVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZUZCTyAoYTAsIGExKSB7XG4gICAgdmFyIGZyYW1lYnVmZmVyID0gbmV3IFJFR0xGcmFtZWJ1ZmZlcigpXG4gICAgc3RhdHMuZnJhbWVidWZmZXJDb3VudCsrXG5cbiAgICBmdW5jdGlvbiByZWdsRnJhbWVidWZmZXIgKGEsIGIpIHtcbiAgICAgIHZhciBpXG5cbiAgICAgIFxuXG4gICAgICB2YXIgZXh0RHJhd0J1ZmZlcnMgPSBleHRlbnNpb25zLndlYmdsX2RyYXdfYnVmZmVyc1xuXG4gICAgICB2YXIgd2lkdGggPSAwXG4gICAgICB2YXIgaGVpZ2h0ID0gMFxuXG4gICAgICB2YXIgbmVlZHNEZXB0aCA9IHRydWVcbiAgICAgIHZhciBuZWVkc1N0ZW5jaWwgPSB0cnVlXG5cbiAgICAgIHZhciBjb2xvckJ1ZmZlciA9IG51bGxcbiAgICAgIHZhciBjb2xvclRleHR1cmUgPSB0cnVlXG4gICAgICB2YXIgY29sb3JGb3JtYXQgPSAncmdiYSdcbiAgICAgIHZhciBjb2xvclR5cGUgPSAndWludDgnXG4gICAgICB2YXIgY29sb3JDb3VudCA9IDFcblxuICAgICAgdmFyIGRlcHRoQnVmZmVyID0gbnVsbFxuICAgICAgdmFyIHN0ZW5jaWxCdWZmZXIgPSBudWxsXG4gICAgICB2YXIgZGVwdGhTdGVuY2lsQnVmZmVyID0gbnVsbFxuICAgICAgdmFyIGRlcHRoU3RlbmNpbFRleHR1cmUgPSBmYWxzZVxuXG4gICAgICBpZiAodHlwZW9mIGEgPT09ICdudW1iZXInKSB7XG4gICAgICAgIHdpZHRoID0gYSB8IDBcbiAgICAgICAgaGVpZ2h0ID0gKGIgfCAwKSB8fCB3aWR0aFxuICAgICAgfSBlbHNlIGlmICghYSkge1xuICAgICAgICB3aWR0aCA9IGhlaWdodCA9IDFcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIFxuICAgICAgICB2YXIgb3B0aW9ucyA9IGFcblxuICAgICAgICBpZiAoJ3NoYXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgdmFyIHNoYXBlID0gb3B0aW9ucy5zaGFwZVxuICAgICAgICAgIFxuICAgICAgICAgIHdpZHRoID0gc2hhcGVbMF1cbiAgICAgICAgICBoZWlnaHQgPSBzaGFwZVsxXVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmICgncmFkaXVzJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICB3aWR0aCA9IGhlaWdodCA9IG9wdGlvbnMucmFkaXVzXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICgnd2lkdGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIHdpZHRoID0gb3B0aW9ucy53aWR0aFxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoJ2hlaWdodCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgaGVpZ2h0ID0gb3B0aW9ucy5oZWlnaHRcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ2NvbG9yJyBpbiBvcHRpb25zIHx8XG4gICAgICAgICAgICAnY29sb3JzJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgY29sb3JCdWZmZXIgPVxuICAgICAgICAgICAgb3B0aW9ucy5jb2xvciB8fFxuICAgICAgICAgICAgb3B0aW9ucy5jb2xvcnNcbiAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShjb2xvckJ1ZmZlcikpIHtcbiAgICAgICAgICAgIFxuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghY29sb3JCdWZmZXIpIHtcbiAgICAgICAgICBpZiAoJ2NvbG9yQ291bnQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGNvbG9yQ291bnQgPSBvcHRpb25zLmNvbG9yQ291bnQgfCAwXG4gICAgICAgICAgICBcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAoJ2NvbG9yVGV4dHVyZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgY29sb3JUZXh0dXJlID0gISFvcHRpb25zLmNvbG9yVGV4dHVyZVxuICAgICAgICAgICAgY29sb3JGb3JtYXQgPSAncmdiYTQnXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKCdjb2xvclR5cGUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGNvbG9yVHlwZSA9IG9wdGlvbnMuY29sb3JUeXBlXG4gICAgICAgICAgICBpZiAoIWNvbG9yVGV4dHVyZSkge1xuICAgICAgICAgICAgICBpZiAoY29sb3JUeXBlID09PSAnaGFsZiBmbG9hdCcgfHwgY29sb3JUeXBlID09PSAnZmxvYXQxNicpIHtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBjb2xvckZvcm1hdCA9ICdyZ2JhMTZmJ1xuICAgICAgICAgICAgICB9IGVsc2UgaWYgKGNvbG9yVHlwZSA9PT0gJ2Zsb2F0JyB8fCBjb2xvclR5cGUgPT09ICdmbG9hdDMyJykge1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGNvbG9yRm9ybWF0ID0gJ3JnYmEzMmYnXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmICgnY29sb3JGb3JtYXQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGNvbG9yRm9ybWF0ID0gb3B0aW9ucy5jb2xvckZvcm1hdFxuICAgICAgICAgICAgaWYgKGNvbG9yVGV4dHVyZUZvcm1hdHMuaW5kZXhPZihjb2xvckZvcm1hdCkgPj0gMCkge1xuICAgICAgICAgICAgICBjb2xvclRleHR1cmUgPSB0cnVlXG4gICAgICAgICAgICB9IGVsc2UgaWYgKGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0cy5pbmRleE9mKGNvbG9yRm9ybWF0KSA+PSAwKSB7XG4gICAgICAgICAgICAgIGNvbG9yVGV4dHVyZSA9IGZhbHNlXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBpZiAoY29sb3JUZXh0dXJlKSB7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ2RlcHRoVGV4dHVyZScgaW4gb3B0aW9ucyB8fCAnZGVwdGhTdGVuY2lsVGV4dHVyZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGRlcHRoU3RlbmNpbFRleHR1cmUgPSAhIShvcHRpb25zLmRlcHRoVGV4dHVyZSB8fFxuICAgICAgICAgICAgb3B0aW9ucy5kZXB0aFN0ZW5jaWxUZXh0dXJlKVxuICAgICAgICAgIFxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCdkZXB0aCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucy5kZXB0aCA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgICAgICBuZWVkc0RlcHRoID0gb3B0aW9ucy5kZXB0aFxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBkZXB0aEJ1ZmZlciA9IG9wdGlvbnMuZGVwdGhcbiAgICAgICAgICAgIG5lZWRzU3RlbmNpbCA9IGZhbHNlXG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCdzdGVuY2lsJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgaWYgKHR5cGVvZiBvcHRpb25zLnN0ZW5jaWwgPT09ICdib29sZWFuJykge1xuICAgICAgICAgICAgbmVlZHNTdGVuY2lsID0gb3B0aW9ucy5zdGVuY2lsXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHN0ZW5jaWxCdWZmZXIgPSBvcHRpb25zLnN0ZW5jaWxcbiAgICAgICAgICAgIG5lZWRzRGVwdGggPSBmYWxzZVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgnZGVwdGhTdGVuY2lsJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgaWYgKHR5cGVvZiBvcHRpb25zLmRlcHRoU3RlbmNpbCA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgICAgICBuZWVkc0RlcHRoID0gbmVlZHNTdGVuY2lsID0gb3B0aW9ucy5kZXB0aFN0ZW5jaWxcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZGVwdGhTdGVuY2lsQnVmZmVyID0gb3B0aW9ucy5kZXB0aFN0ZW5jaWxcbiAgICAgICAgICAgIG5lZWRzRGVwdGggPSBmYWxzZVxuICAgICAgICAgICAgbmVlZHNTdGVuY2lsID0gZmFsc2VcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gcGFyc2UgYXR0YWNobWVudHNcbiAgICAgIHZhciBjb2xvckF0dGFjaG1lbnRzID0gbnVsbFxuICAgICAgdmFyIGRlcHRoQXR0YWNobWVudCA9IG51bGxcbiAgICAgIHZhciBzdGVuY2lsQXR0YWNobWVudCA9IG51bGxcbiAgICAgIHZhciBkZXB0aFN0ZW5jaWxBdHRhY2htZW50ID0gbnVsbFxuXG4gICAgICAvLyBTZXQgdXAgY29sb3IgYXR0YWNobWVudHNcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KGNvbG9yQnVmZmVyKSkge1xuICAgICAgICBjb2xvckF0dGFjaG1lbnRzID0gY29sb3JCdWZmZXIubWFwKHBhcnNlQXR0YWNobWVudClcbiAgICAgIH0gZWxzZSBpZiAoY29sb3JCdWZmZXIpIHtcbiAgICAgICAgY29sb3JBdHRhY2htZW50cyA9IFtwYXJzZUF0dGFjaG1lbnQoY29sb3JCdWZmZXIpXVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29sb3JBdHRhY2htZW50cyA9IG5ldyBBcnJheShjb2xvckNvdW50KVxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgY29sb3JDb3VudDsgKytpKSB7XG4gICAgICAgICAgY29sb3JBdHRhY2htZW50c1tpXSA9IGFsbG9jQXR0YWNobWVudChcbiAgICAgICAgICAgIHdpZHRoLFxuICAgICAgICAgICAgaGVpZ2h0LFxuICAgICAgICAgICAgY29sb3JUZXh0dXJlLFxuICAgICAgICAgICAgY29sb3JGb3JtYXQsXG4gICAgICAgICAgICBjb2xvclR5cGUpXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgXG4gICAgICBcblxuICAgICAgd2lkdGggPSB3aWR0aCB8fCBjb2xvckF0dGFjaG1lbnRzWzBdLndpZHRoXG4gICAgICBoZWlnaHQgPSBoZWlnaHQgfHwgY29sb3JBdHRhY2htZW50c1swXS5oZWlnaHRcblxuICAgICAgaWYgKGRlcHRoQnVmZmVyKSB7XG4gICAgICAgIGRlcHRoQXR0YWNobWVudCA9IHBhcnNlQXR0YWNobWVudChkZXB0aEJ1ZmZlcilcbiAgICAgIH0gZWxzZSBpZiAobmVlZHNEZXB0aCAmJiAhbmVlZHNTdGVuY2lsKSB7XG4gICAgICAgIGRlcHRoQXR0YWNobWVudCA9IGFsbG9jQXR0YWNobWVudChcbiAgICAgICAgICB3aWR0aCxcbiAgICAgICAgICBoZWlnaHQsXG4gICAgICAgICAgZGVwdGhTdGVuY2lsVGV4dHVyZSxcbiAgICAgICAgICAnZGVwdGgnLFxuICAgICAgICAgICd1aW50MzInKVxuICAgICAgfVxuXG4gICAgICBpZiAoc3RlbmNpbEJ1ZmZlcikge1xuICAgICAgICBzdGVuY2lsQXR0YWNobWVudCA9IHBhcnNlQXR0YWNobWVudChzdGVuY2lsQnVmZmVyKVxuICAgICAgfSBlbHNlIGlmIChuZWVkc1N0ZW5jaWwgJiYgIW5lZWRzRGVwdGgpIHtcbiAgICAgICAgc3RlbmNpbEF0dGFjaG1lbnQgPSBhbGxvY0F0dGFjaG1lbnQoXG4gICAgICAgICAgd2lkdGgsXG4gICAgICAgICAgaGVpZ2h0LFxuICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgICdzdGVuY2lsJyxcbiAgICAgICAgICAndWludDgnKVxuICAgICAgfVxuXG4gICAgICBpZiAoZGVwdGhTdGVuY2lsQnVmZmVyKSB7XG4gICAgICAgIGRlcHRoU3RlbmNpbEF0dGFjaG1lbnQgPSBwYXJzZUF0dGFjaG1lbnQoZGVwdGhTdGVuY2lsQnVmZmVyKVxuICAgICAgfSBlbHNlIGlmICghZGVwdGhCdWZmZXIgJiYgIXN0ZW5jaWxCdWZmZXIgJiYgbmVlZHNTdGVuY2lsICYmIG5lZWRzRGVwdGgpIHtcbiAgICAgICAgZGVwdGhTdGVuY2lsQXR0YWNobWVudCA9IGFsbG9jQXR0YWNobWVudChcbiAgICAgICAgICB3aWR0aCxcbiAgICAgICAgICBoZWlnaHQsXG4gICAgICAgICAgZGVwdGhTdGVuY2lsVGV4dHVyZSxcbiAgICAgICAgICAnZGVwdGggc3RlbmNpbCcsXG4gICAgICAgICAgJ2RlcHRoIHN0ZW5jaWwnKVxuICAgICAgfVxuXG4gICAgICBcblxuICAgICAgdmFyIGNvbW1vbkNvbG9yQXR0YWNobWVudFNpemUgPSBudWxsXG5cbiAgICAgIGZvciAoaSA9IDA7IGkgPCBjb2xvckF0dGFjaG1lbnRzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgIGluY1JlZkFuZENoZWNrU2hhcGUoY29sb3JBdHRhY2htZW50c1tpXSwgd2lkdGgsIGhlaWdodClcbiAgICAgICAgXG5cbiAgICAgICAgaWYgKGNvbG9yQXR0YWNobWVudHNbaV0gJiYgY29sb3JBdHRhY2htZW50c1tpXS50ZXh0dXJlKSB7XG4gICAgICAgICAgdmFyIGNvbG9yQXR0YWNobWVudFNpemUgPVxuICAgICAgICAgICAgICB0ZXh0dXJlRm9ybWF0Q2hhbm5lbHNbY29sb3JBdHRhY2htZW50c1tpXS50ZXh0dXJlLl90ZXh0dXJlLmZvcm1hdF0gKlxuICAgICAgICAgICAgICB0ZXh0dXJlVHlwZVNpemVzW2NvbG9yQXR0YWNobWVudHNbaV0udGV4dHVyZS5fdGV4dHVyZS50eXBlXVxuXG4gICAgICAgICAgaWYgKGNvbW1vbkNvbG9yQXR0YWNobWVudFNpemUgPT09IG51bGwpIHtcbiAgICAgICAgICAgIGNvbW1vbkNvbG9yQXR0YWNobWVudFNpemUgPSBjb2xvckF0dGFjaG1lbnRTaXplXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIFdlIG5lZWQgdG8gbWFrZSBzdXJlIHRoYXQgYWxsIGNvbG9yIGF0dGFjaG1lbnRzIGhhdmUgdGhlIHNhbWUgbnVtYmVyIG9mIGJpdHBsYW5lc1xuICAgICAgICAgICAgLy8gKHRoYXQgaXMsIHRoZSBzYW1lIG51bWVyIG9mIGJpdHMgcGVyIHBpeGVsKVxuICAgICAgICAgICAgLy8gVGhpcyBpcyByZXF1aXJlZCBieSB0aGUgR0xFUzIuMCBzdGFuZGFyZC4gU2VlIHRoZSBiZWdpbm5pbmcgb2YgQ2hhcHRlciA0IGluIHRoYXQgZG9jdW1lbnQuXG4gICAgICAgICAgICBcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGluY1JlZkFuZENoZWNrU2hhcGUoZGVwdGhBdHRhY2htZW50LCB3aWR0aCwgaGVpZ2h0KVxuICAgICAgXG4gICAgICBpbmNSZWZBbmRDaGVja1NoYXBlKHN0ZW5jaWxBdHRhY2htZW50LCB3aWR0aCwgaGVpZ2h0KVxuICAgICAgXG4gICAgICBpbmNSZWZBbmRDaGVja1NoYXBlKGRlcHRoU3RlbmNpbEF0dGFjaG1lbnQsIHdpZHRoLCBoZWlnaHQpXG4gICAgICBcblxuICAgICAgLy8gZGVjcmVtZW50IHJlZmVyZW5jZXNcbiAgICAgIGRlY0ZCT1JlZnMoZnJhbWVidWZmZXIpXG5cbiAgICAgIGZyYW1lYnVmZmVyLndpZHRoID0gd2lkdGhcbiAgICAgIGZyYW1lYnVmZmVyLmhlaWdodCA9IGhlaWdodFxuXG4gICAgICBmcmFtZWJ1ZmZlci5jb2xvckF0dGFjaG1lbnRzID0gY29sb3JBdHRhY2htZW50c1xuICAgICAgZnJhbWVidWZmZXIuZGVwdGhBdHRhY2htZW50ID0gZGVwdGhBdHRhY2htZW50XG4gICAgICBmcmFtZWJ1ZmZlci5zdGVuY2lsQXR0YWNobWVudCA9IHN0ZW5jaWxBdHRhY2htZW50XG4gICAgICBmcmFtZWJ1ZmZlci5kZXB0aFN0ZW5jaWxBdHRhY2htZW50ID0gZGVwdGhTdGVuY2lsQXR0YWNobWVudFxuXG4gICAgICByZWdsRnJhbWVidWZmZXIuY29sb3IgPSBjb2xvckF0dGFjaG1lbnRzLm1hcCh1bndyYXBBdHRhY2htZW50KVxuICAgICAgcmVnbEZyYW1lYnVmZmVyLmRlcHRoID0gdW53cmFwQXR0YWNobWVudChkZXB0aEF0dGFjaG1lbnQpXG4gICAgICByZWdsRnJhbWVidWZmZXIuc3RlbmNpbCA9IHVud3JhcEF0dGFjaG1lbnQoc3RlbmNpbEF0dGFjaG1lbnQpXG4gICAgICByZWdsRnJhbWVidWZmZXIuZGVwdGhTdGVuY2lsID0gdW53cmFwQXR0YWNobWVudChkZXB0aFN0ZW5jaWxBdHRhY2htZW50KVxuXG4gICAgICByZWdsRnJhbWVidWZmZXIud2lkdGggPSBmcmFtZWJ1ZmZlci53aWR0aFxuICAgICAgcmVnbEZyYW1lYnVmZmVyLmhlaWdodCA9IGZyYW1lYnVmZmVyLmhlaWdodFxuXG4gICAgICB1cGRhdGVGcmFtZWJ1ZmZlcihmcmFtZWJ1ZmZlcilcblxuICAgICAgcmV0dXJuIHJlZ2xGcmFtZWJ1ZmZlclxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHJlc2l6ZSAod18sIGhfKSB7XG4gICAgICBcblxuICAgICAgdmFyIHcgPSB3XyB8IDBcbiAgICAgIHZhciBoID0gKGhfIHwgMCkgfHwgd1xuICAgICAgaWYgKHcgPT09IGZyYW1lYnVmZmVyLndpZHRoICYmIGggPT09IGZyYW1lYnVmZmVyLmhlaWdodCkge1xuICAgICAgICByZXR1cm4gcmVnbEZyYW1lYnVmZmVyXG4gICAgICB9XG5cbiAgICAgIC8vIHJlc2l6ZSBhbGwgYnVmZmVyc1xuICAgICAgdmFyIGNvbG9yQXR0YWNobWVudHMgPSBmcmFtZWJ1ZmZlci5jb2xvckF0dGFjaG1lbnRzXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNvbG9yQXR0YWNobWVudHMubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgcmVzaXplQXR0YWNobWVudChjb2xvckF0dGFjaG1lbnRzW2ldLCB3LCBoKVxuICAgICAgfVxuICAgICAgcmVzaXplQXR0YWNobWVudChmcmFtZWJ1ZmZlci5kZXB0aEF0dGFjaG1lbnQsIHcsIGgpXG4gICAgICByZXNpemVBdHRhY2htZW50KGZyYW1lYnVmZmVyLnN0ZW5jaWxBdHRhY2htZW50LCB3LCBoKVxuICAgICAgcmVzaXplQXR0YWNobWVudChmcmFtZWJ1ZmZlci5kZXB0aFN0ZW5jaWxBdHRhY2htZW50LCB3LCBoKVxuXG4gICAgICBmcmFtZWJ1ZmZlci53aWR0aCA9IHJlZ2xGcmFtZWJ1ZmZlci53aWR0aCA9IHdcbiAgICAgIGZyYW1lYnVmZmVyLmhlaWdodCA9IHJlZ2xGcmFtZWJ1ZmZlci5oZWlnaHQgPSBoXG5cbiAgICAgIHVwZGF0ZUZyYW1lYnVmZmVyKGZyYW1lYnVmZmVyKVxuXG4gICAgICByZXR1cm4gcmVnbEZyYW1lYnVmZmVyXG4gICAgfVxuXG4gICAgcmVnbEZyYW1lYnVmZmVyKGEwLCBhMSlcblxuICAgIHJldHVybiBleHRlbmQocmVnbEZyYW1lYnVmZmVyLCB7XG4gICAgICByZXNpemU6IHJlc2l6ZSxcbiAgICAgIF9yZWdsVHlwZTogJ2ZyYW1lYnVmZmVyJyxcbiAgICAgIF9mcmFtZWJ1ZmZlcjogZnJhbWVidWZmZXIsXG4gICAgICBkZXN0cm95OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGRlc3Ryb3koZnJhbWVidWZmZXIpXG4gICAgICAgIGRlY0ZCT1JlZnMoZnJhbWVidWZmZXIpXG4gICAgICB9XG4gICAgfSlcbiAgfVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZUN1YmVGQk8gKG9wdGlvbnMpIHtcbiAgICB2YXIgZmFjZXMgPSBBcnJheSg2KVxuXG4gICAgZnVuY3Rpb24gcmVnbEZyYW1lYnVmZmVyQ3ViZSAoYSkge1xuICAgICAgdmFyIGlcblxuICAgICAgXG5cbiAgICAgIHZhciBleHREcmF3QnVmZmVycyA9IGV4dGVuc2lvbnMud2ViZ2xfZHJhd19idWZmZXJzXG5cbiAgICAgIHZhciBwYXJhbXMgPSB7XG4gICAgICAgIGNvbG9yOiBudWxsXG4gICAgICB9XG5cbiAgICAgIHZhciByYWRpdXMgPSAwXG5cbiAgICAgIHZhciBjb2xvckJ1ZmZlciA9IG51bGxcbiAgICAgIHZhciBjb2xvckZvcm1hdCA9ICdyZ2JhJ1xuICAgICAgdmFyIGNvbG9yVHlwZSA9ICd1aW50OCdcbiAgICAgIHZhciBjb2xvckNvdW50ID0gMVxuXG4gICAgICBpZiAodHlwZW9mIGEgPT09ICdudW1iZXInKSB7XG4gICAgICAgIHJhZGl1cyA9IGEgfCAwXG4gICAgICB9IGVsc2UgaWYgKCFhKSB7XG4gICAgICAgIHJhZGl1cyA9IDFcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIFxuICAgICAgICB2YXIgb3B0aW9ucyA9IGFcblxuICAgICAgICBpZiAoJ3NoYXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgdmFyIHNoYXBlID0gb3B0aW9ucy5zaGFwZVxuICAgICAgICAgIFxuICAgICAgICAgIFxuICAgICAgICAgIHJhZGl1cyA9IHNoYXBlWzBdXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaWYgKCdyYWRpdXMnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIHJhZGl1cyA9IG9wdGlvbnMucmFkaXVzIHwgMFxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoJ3dpZHRoJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICByYWRpdXMgPSBvcHRpb25zLndpZHRoIHwgMFxuICAgICAgICAgICAgaWYgKCdoZWlnaHQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIGlmICgnaGVpZ2h0JyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICByYWRpdXMgPSBvcHRpb25zLmhlaWdodCB8IDBcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ2NvbG9yJyBpbiBvcHRpb25zIHx8XG4gICAgICAgICAgICAnY29sb3JzJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgY29sb3JCdWZmZXIgPVxuICAgICAgICAgICAgb3B0aW9ucy5jb2xvciB8fFxuICAgICAgICAgICAgb3B0aW9ucy5jb2xvcnNcbiAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShjb2xvckJ1ZmZlcikpIHtcbiAgICAgICAgICAgIFxuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghY29sb3JCdWZmZXIpIHtcbiAgICAgICAgICBpZiAoJ2NvbG9yQ291bnQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGNvbG9yQ291bnQgPSBvcHRpb25zLmNvbG9yQ291bnQgfCAwXG4gICAgICAgICAgICBcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAoJ2NvbG9yVHlwZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBjb2xvclR5cGUgPSBvcHRpb25zLmNvbG9yVHlwZVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmICgnY29sb3JGb3JtYXQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGNvbG9yRm9ybWF0ID0gb3B0aW9ucy5jb2xvckZvcm1hdFxuICAgICAgICAgICAgXG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCdkZXB0aCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIHBhcmFtcy5kZXB0aCA9IG9wdGlvbnMuZGVwdGhcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgnc3RlbmNpbCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIHBhcmFtcy5zdGVuY2lsID0gb3B0aW9ucy5zdGVuY2lsXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ2RlcHRoU3RlbmNpbCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIHBhcmFtcy5kZXB0aFN0ZW5jaWwgPSBvcHRpb25zLmRlcHRoU3RlbmNpbFxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHZhciBjb2xvckN1YmVzXG4gICAgICBpZiAoY29sb3JCdWZmZXIpIHtcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoY29sb3JCdWZmZXIpKSB7XG4gICAgICAgICAgY29sb3JDdWJlcyA9IFtdXG4gICAgICAgICAgZm9yIChpID0gMDsgaSA8IGNvbG9yQnVmZmVyLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgICBjb2xvckN1YmVzW2ldID0gY29sb3JCdWZmZXJbaV1cbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29sb3JDdWJlcyA9IFsgY29sb3JCdWZmZXIgXVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb2xvckN1YmVzID0gQXJyYXkoY29sb3JDb3VudClcbiAgICAgICAgdmFyIGN1YmVNYXBQYXJhbXMgPSB7XG4gICAgICAgICAgcmFkaXVzOiByYWRpdXMsXG4gICAgICAgICAgZm9ybWF0OiBjb2xvckZvcm1hdCxcbiAgICAgICAgICB0eXBlOiBjb2xvclR5cGVcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgY29sb3JDb3VudDsgKytpKSB7XG4gICAgICAgICAgY29sb3JDdWJlc1tpXSA9IHRleHR1cmVTdGF0ZS5jcmVhdGVDdWJlKGN1YmVNYXBQYXJhbXMpXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gQ2hlY2sgY29sb3IgY3ViZXNcbiAgICAgIHBhcmFtcy5jb2xvciA9IEFycmF5KGNvbG9yQ3ViZXMubGVuZ3RoKVxuICAgICAgZm9yIChpID0gMDsgaSA8IGNvbG9yQ3ViZXMubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgdmFyIGN1YmUgPSBjb2xvckN1YmVzW2ldXG4gICAgICAgIFxuICAgICAgICByYWRpdXMgPSByYWRpdXMgfHwgY3ViZS53aWR0aFxuICAgICAgICBcbiAgICAgICAgcGFyYW1zLmNvbG9yW2ldID0ge1xuICAgICAgICAgIHRhcmdldDogR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YLFxuICAgICAgICAgIGRhdGE6IGNvbG9yQ3ViZXNbaV1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBmb3IgKGkgPSAwOyBpIDwgNjsgKytpKSB7XG4gICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgY29sb3JDdWJlcy5sZW5ndGg7ICsraikge1xuICAgICAgICAgIHBhcmFtcy5jb2xvcltqXS50YXJnZXQgPSBHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1ggKyBpXG4gICAgICAgIH1cbiAgICAgICAgLy8gcmV1c2UgZGVwdGgtc3RlbmNpbCBhdHRhY2htZW50cyBhY3Jvc3MgYWxsIGN1YmUgbWFwc1xuICAgICAgICBpZiAoaSA+IDApIHtcbiAgICAgICAgICBwYXJhbXMuZGVwdGggPSBmYWNlc1swXS5kZXB0aFxuICAgICAgICAgIHBhcmFtcy5zdGVuY2lsID0gZmFjZXNbMF0uc3RlbmNpbFxuICAgICAgICAgIHBhcmFtcy5kZXB0aFN0ZW5jaWwgPSBmYWNlc1swXS5kZXB0aFN0ZW5jaWxcbiAgICAgICAgfVxuICAgICAgICBpZiAoZmFjZXNbaV0pIHtcbiAgICAgICAgICAoZmFjZXNbaV0pKHBhcmFtcylcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBmYWNlc1tpXSA9IGNyZWF0ZUZCTyhwYXJhbXMpXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGV4dGVuZChyZWdsRnJhbWVidWZmZXJDdWJlLCB7XG4gICAgICAgIHdpZHRoOiByYWRpdXMsXG4gICAgICAgIGhlaWdodDogcmFkaXVzLFxuICAgICAgICBjb2xvcjogY29sb3JDdWJlc1xuICAgICAgfSlcbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZXNpemUgKHJhZGl1c18pIHtcbiAgICAgIHZhciBpXG4gICAgICB2YXIgcmFkaXVzID0gcmFkaXVzXyB8IDBcbiAgICAgIFxuXG4gICAgICBpZiAocmFkaXVzID09PSByZWdsRnJhbWVidWZmZXJDdWJlLndpZHRoKSB7XG4gICAgICAgIHJldHVybiByZWdsRnJhbWVidWZmZXJDdWJlXG4gICAgICB9XG5cbiAgICAgIHZhciBjb2xvcnMgPSByZWdsRnJhbWVidWZmZXJDdWJlLmNvbG9yXG4gICAgICBmb3IgKGkgPSAwOyBpIDwgY29sb3JzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgIGNvbG9yc1tpXS5yZXNpemUocmFkaXVzKVxuICAgICAgfVxuXG4gICAgICBmb3IgKGkgPSAwOyBpIDwgNjsgKytpKSB7XG4gICAgICAgIGZhY2VzW2ldLnJlc2l6ZShyYWRpdXMpXG4gICAgICB9XG5cbiAgICAgIHJlZ2xGcmFtZWJ1ZmZlckN1YmUud2lkdGggPSByZWdsRnJhbWVidWZmZXJDdWJlLmhlaWdodCA9IHJhZGl1c1xuXG4gICAgICByZXR1cm4gcmVnbEZyYW1lYnVmZmVyQ3ViZVxuICAgIH1cblxuICAgIHJlZ2xGcmFtZWJ1ZmZlckN1YmUob3B0aW9ucylcblxuICAgIHJldHVybiBleHRlbmQocmVnbEZyYW1lYnVmZmVyQ3ViZSwge1xuICAgICAgZmFjZXM6IGZhY2VzLFxuICAgICAgcmVzaXplOiByZXNpemUsXG4gICAgICBfcmVnbFR5cGU6ICdmcmFtZWJ1ZmZlckN1YmUnLFxuICAgICAgZGVzdHJveTogZnVuY3Rpb24gKCkge1xuICAgICAgICBmYWNlcy5mb3JFYWNoKGZ1bmN0aW9uIChmKSB7XG4gICAgICAgICAgZi5kZXN0cm95KClcbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICB9KVxuICB9XG5cbiAgZnVuY3Rpb24gcmVzdG9yZUZyYW1lYnVmZmVycyAoKSB7XG4gICAgdmFsdWVzKGZyYW1lYnVmZmVyU2V0KS5mb3JFYWNoKGZ1bmN0aW9uIChmYikge1xuICAgICAgZmIuZnJhbWVidWZmZXIgPSBnbC5jcmVhdGVGcmFtZWJ1ZmZlcigpXG4gICAgICB1cGRhdGVGcmFtZWJ1ZmZlcihmYilcbiAgICB9KVxuICB9XG5cbiAgcmV0dXJuIGV4dGVuZChmcmFtZWJ1ZmZlclN0YXRlLCB7XG4gICAgZ2V0RnJhbWVidWZmZXI6IGZ1bmN0aW9uIChvYmplY3QpIHtcbiAgICAgIGlmICh0eXBlb2Ygb2JqZWN0ID09PSAnZnVuY3Rpb24nICYmIG9iamVjdC5fcmVnbFR5cGUgPT09ICdmcmFtZWJ1ZmZlcicpIHtcbiAgICAgICAgdmFyIGZibyA9IG9iamVjdC5fZnJhbWVidWZmZXJcbiAgICAgICAgaWYgKGZibyBpbnN0YW5jZW9mIFJFR0xGcmFtZWJ1ZmZlcikge1xuICAgICAgICAgIHJldHVybiBmYm9cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIG51bGxcbiAgICB9LFxuICAgIGNyZWF0ZTogY3JlYXRlRkJPLFxuICAgIGNyZWF0ZUN1YmU6IGNyZWF0ZUN1YmVGQk8sXG4gICAgY2xlYXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhbHVlcyhmcmFtZWJ1ZmZlclNldCkuZm9yRWFjaChkZXN0cm95KVxuICAgIH0sXG4gICAgcmVzdG9yZTogcmVzdG9yZUZyYW1lYnVmZmVyc1xuICB9KVxufVxuIiwidmFyIEdMX1NVQlBJWEVMX0JJVFMgPSAweDBENTBcbnZhciBHTF9SRURfQklUUyA9IDB4MEQ1MlxudmFyIEdMX0dSRUVOX0JJVFMgPSAweDBENTNcbnZhciBHTF9CTFVFX0JJVFMgPSAweDBENTRcbnZhciBHTF9BTFBIQV9CSVRTID0gMHgwRDU1XG52YXIgR0xfREVQVEhfQklUUyA9IDB4MEQ1NlxudmFyIEdMX1NURU5DSUxfQklUUyA9IDB4MEQ1N1xuXG52YXIgR0xfQUxJQVNFRF9QT0lOVF9TSVpFX1JBTkdFID0gMHg4NDZEXG52YXIgR0xfQUxJQVNFRF9MSU5FX1dJRFRIX1JBTkdFID0gMHg4NDZFXG5cbnZhciBHTF9NQVhfVEVYVFVSRV9TSVpFID0gMHgwRDMzXG52YXIgR0xfTUFYX1ZJRVdQT1JUX0RJTVMgPSAweDBEM0FcbnZhciBHTF9NQVhfVkVSVEVYX0FUVFJJQlMgPSAweDg4NjlcbnZhciBHTF9NQVhfVkVSVEVYX1VOSUZPUk1fVkVDVE9SUyA9IDB4OERGQlxudmFyIEdMX01BWF9WQVJZSU5HX1ZFQ1RPUlMgPSAweDhERkNcbnZhciBHTF9NQVhfQ09NQklORURfVEVYVFVSRV9JTUFHRV9VTklUUyA9IDB4OEI0RFxudmFyIEdMX01BWF9WRVJURVhfVEVYVFVSRV9JTUFHRV9VTklUUyA9IDB4OEI0Q1xudmFyIEdMX01BWF9URVhUVVJFX0lNQUdFX1VOSVRTID0gMHg4ODcyXG52YXIgR0xfTUFYX0ZSQUdNRU5UX1VOSUZPUk1fVkVDVE9SUyA9IDB4OERGRFxudmFyIEdMX01BWF9DVUJFX01BUF9URVhUVVJFX1NJWkUgPSAweDg1MUNcbnZhciBHTF9NQVhfUkVOREVSQlVGRkVSX1NJWkUgPSAweDg0RThcblxudmFyIEdMX1ZFTkRPUiA9IDB4MUYwMFxudmFyIEdMX1JFTkRFUkVSID0gMHgxRjAxXG52YXIgR0xfVkVSU0lPTiA9IDB4MUYwMlxudmFyIEdMX1NIQURJTkdfTEFOR1VBR0VfVkVSU0lPTiA9IDB4OEI4Q1xuXG52YXIgR0xfTUFYX1RFWFRVUkVfTUFYX0FOSVNPVFJPUFlfRVhUID0gMHg4NEZGXG5cbnZhciBHTF9NQVhfQ09MT1JfQVRUQUNITUVOVFNfV0VCR0wgPSAweDhDREZcbnZhciBHTF9NQVhfRFJBV19CVUZGRVJTX1dFQkdMID0gMHg4ODI0XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGdsLCBleHRlbnNpb25zKSB7XG4gIHZhciBtYXhBbmlzb3Ryb3BpYyA9IDFcbiAgaWYgKGV4dGVuc2lvbnMuZXh0X3RleHR1cmVfZmlsdGVyX2FuaXNvdHJvcGljKSB7XG4gICAgbWF4QW5pc290cm9waWMgPSBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1RFWFRVUkVfTUFYX0FOSVNPVFJPUFlfRVhUKVxuICB9XG5cbiAgdmFyIG1heERyYXdidWZmZXJzID0gMVxuICB2YXIgbWF4Q29sb3JBdHRhY2htZW50cyA9IDFcbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfZHJhd19idWZmZXJzKSB7XG4gICAgbWF4RHJhd2J1ZmZlcnMgPSBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX0RSQVdfQlVGRkVSU19XRUJHTClcbiAgICBtYXhDb2xvckF0dGFjaG1lbnRzID0gZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9DT0xPUl9BVFRBQ0hNRU5UU19XRUJHTClcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgLy8gZHJhd2luZyBidWZmZXIgYml0IGRlcHRoXG4gICAgY29sb3JCaXRzOiBbXG4gICAgICBnbC5nZXRQYXJhbWV0ZXIoR0xfUkVEX0JJVFMpLFxuICAgICAgZ2wuZ2V0UGFyYW1ldGVyKEdMX0dSRUVOX0JJVFMpLFxuICAgICAgZ2wuZ2V0UGFyYW1ldGVyKEdMX0JMVUVfQklUUyksXG4gICAgICBnbC5nZXRQYXJhbWV0ZXIoR0xfQUxQSEFfQklUUylcbiAgICBdLFxuICAgIGRlcHRoQml0czogZ2wuZ2V0UGFyYW1ldGVyKEdMX0RFUFRIX0JJVFMpLFxuICAgIHN0ZW5jaWxCaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfU1RFTkNJTF9CSVRTKSxcbiAgICBzdWJwaXhlbEJpdHM6IGdsLmdldFBhcmFtZXRlcihHTF9TVUJQSVhFTF9CSVRTKSxcblxuICAgIC8vIHN1cHBvcnRlZCBleHRlbnNpb25zXG4gICAgZXh0ZW5zaW9uczogT2JqZWN0LmtleXMoZXh0ZW5zaW9ucykuZmlsdGVyKGZ1bmN0aW9uIChleHQpIHtcbiAgICAgIHJldHVybiAhIWV4dGVuc2lvbnNbZXh0XVxuICAgIH0pLFxuXG4gICAgLy8gbWF4IGFuaXNvIHNhbXBsZXNcbiAgICBtYXhBbmlzb3Ryb3BpYzogbWF4QW5pc290cm9waWMsXG5cbiAgICAvLyBtYXggZHJhdyBidWZmZXJzXG4gICAgbWF4RHJhd2J1ZmZlcnM6IG1heERyYXdidWZmZXJzLFxuICAgIG1heENvbG9yQXR0YWNobWVudHM6IG1heENvbG9yQXR0YWNobWVudHMsXG5cbiAgICAvLyBwb2ludCBhbmQgbGluZSBzaXplIHJhbmdlc1xuICAgIHBvaW50U2l6ZURpbXM6IGdsLmdldFBhcmFtZXRlcihHTF9BTElBU0VEX1BPSU5UX1NJWkVfUkFOR0UpLFxuICAgIGxpbmVXaWR0aERpbXM6IGdsLmdldFBhcmFtZXRlcihHTF9BTElBU0VEX0xJTkVfV0lEVEhfUkFOR0UpLFxuICAgIG1heFZpZXdwb3J0RGltczogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9WSUVXUE9SVF9ESU1TKSxcbiAgICBtYXhDb21iaW5lZFRleHR1cmVVbml0czogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9DT01CSU5FRF9URVhUVVJFX0lNQUdFX1VOSVRTKSxcbiAgICBtYXhDdWJlTWFwU2l6ZTogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9DVUJFX01BUF9URVhUVVJFX1NJWkUpLFxuICAgIG1heFJlbmRlcmJ1ZmZlclNpemU6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfUkVOREVSQlVGRkVSX1NJWkUpLFxuICAgIG1heFRleHR1cmVVbml0czogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9URVhUVVJFX0lNQUdFX1VOSVRTKSxcbiAgICBtYXhUZXh0dXJlU2l6ZTogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9URVhUVVJFX1NJWkUpLFxuICAgIG1heEF0dHJpYnV0ZXM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVkVSVEVYX0FUVFJJQlMpLFxuICAgIG1heFZlcnRleFVuaWZvcm1zOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1ZFUlRFWF9VTklGT1JNX1ZFQ1RPUlMpLFxuICAgIG1heFZlcnRleFRleHR1cmVVbml0czogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9WRVJURVhfVEVYVFVSRV9JTUFHRV9VTklUUyksXG4gICAgbWF4VmFyeWluZ1ZlY3RvcnM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVkFSWUlOR19WRUNUT1JTKSxcbiAgICBtYXhGcmFnbWVudFVuaWZvcm1zOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX0ZSQUdNRU5UX1VOSUZPUk1fVkVDVE9SUyksXG5cbiAgICAvLyB2ZW5kb3IgaW5mb1xuICAgIGdsc2w6IGdsLmdldFBhcmFtZXRlcihHTF9TSEFESU5HX0xBTkdVQUdFX1ZFUlNJT04pLFxuICAgIHJlbmRlcmVyOiBnbC5nZXRQYXJhbWV0ZXIoR0xfUkVOREVSRVIpLFxuICAgIHZlbmRvcjogZ2wuZ2V0UGFyYW1ldGVyKEdMX1ZFTkRPUiksXG4gICAgdmVyc2lvbjogZ2wuZ2V0UGFyYW1ldGVyKEdMX1ZFUlNJT04pXG4gIH1cbn1cbiIsIlxudmFyIGlzVHlwZWRBcnJheSA9IHJlcXVpcmUoJy4vdXRpbC9pcy10eXBlZC1hcnJheScpXG5cbnZhciBHTF9SR0JBID0gNjQwOFxudmFyIEdMX1VOU0lHTkVEX0JZVEUgPSA1MTIxXG52YXIgR0xfUEFDS19BTElHTk1FTlQgPSAweDBEMDVcbnZhciBHTF9GTE9BVCA9IDB4MTQwNiAvLyA1MTI2XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gd3JhcFJlYWRQaXhlbHMgKFxuICBnbCxcbiAgZnJhbWVidWZmZXJTdGF0ZSxcbiAgcmVnbFBvbGwsXG4gIGNvbnRleHQsXG4gIGdsQXR0cmlidXRlcyxcbiAgZXh0ZW5zaW9ucykge1xuICBmdW5jdGlvbiByZWFkUGl4ZWxzIChpbnB1dCkge1xuICAgIHZhciB0eXBlXG4gICAgaWYgKGZyYW1lYnVmZmVyU3RhdGUubmV4dCA9PT0gbnVsbCkge1xuICAgICAgXG4gICAgICB0eXBlID0gR0xfVU5TSUdORURfQllURVxuICAgIH0gZWxzZSB7XG4gICAgICBcbiAgICAgIHR5cGUgPSBmcmFtZWJ1ZmZlclN0YXRlLm5leHQuY29sb3JBdHRhY2htZW50c1swXS50ZXh0dXJlLl90ZXh0dXJlLnR5cGVcblxuICAgICAgaWYgKGV4dGVuc2lvbnMub2VzX3RleHR1cmVfZmxvYXQpIHtcbiAgICAgICAgXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBcbiAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgeCA9IDBcbiAgICB2YXIgeSA9IDBcbiAgICB2YXIgd2lkdGggPSBjb250ZXh0LmZyYW1lYnVmZmVyV2lkdGhcbiAgICB2YXIgaGVpZ2h0ID0gY29udGV4dC5mcmFtZWJ1ZmZlckhlaWdodFxuICAgIHZhciBkYXRhID0gbnVsbFxuXG4gICAgaWYgKGlzVHlwZWRBcnJheShpbnB1dCkpIHtcbiAgICAgIGRhdGEgPSBpbnB1dFxuICAgIH0gZWxzZSBpZiAoaW5wdXQpIHtcbiAgICAgIFxuICAgICAgeCA9IGlucHV0LnggfCAwXG4gICAgICB5ID0gaW5wdXQueSB8IDBcbiAgICAgIFxuICAgICAgXG4gICAgICB3aWR0aCA9IChpbnB1dC53aWR0aCB8fCAoY29udGV4dC5mcmFtZWJ1ZmZlcldpZHRoIC0geCkpIHwgMFxuICAgICAgaGVpZ2h0ID0gKGlucHV0LmhlaWdodCB8fCAoY29udGV4dC5mcmFtZWJ1ZmZlckhlaWdodCAtIHkpKSB8IDBcbiAgICAgIGRhdGEgPSBpbnB1dC5kYXRhIHx8IG51bGxcbiAgICB9XG5cbiAgICAvLyBzYW5pdHkgY2hlY2sgaW5wdXQuZGF0YVxuICAgIGlmIChkYXRhKSB7XG4gICAgICBpZiAodHlwZSA9PT0gR0xfVU5TSUdORURfQllURSkge1xuICAgICAgICBcbiAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gR0xfRkxPQVQpIHtcbiAgICAgICAgXG4gICAgICB9XG4gICAgfVxuXG4gICAgXG4gICAgXG5cbiAgICAvLyBVcGRhdGUgV2ViR0wgc3RhdGVcbiAgICByZWdsUG9sbCgpXG5cbiAgICAvLyBDb21wdXRlIHNpemVcbiAgICB2YXIgc2l6ZSA9IHdpZHRoICogaGVpZ2h0ICogNFxuXG4gICAgLy8gQWxsb2NhdGUgZGF0YVxuICAgIGlmICghZGF0YSkge1xuICAgICAgaWYgKHR5cGUgPT09IEdMX1VOU0lHTkVEX0JZVEUpIHtcbiAgICAgICAgZGF0YSA9IG5ldyBVaW50OEFycmF5KHNpemUpXG4gICAgICB9IGVsc2UgaWYgKHR5cGUgPT09IEdMX0ZMT0FUKSB7XG4gICAgICAgIGRhdGEgPSBkYXRhIHx8IG5ldyBGbG9hdDMyQXJyYXkoc2l6ZSlcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBUeXBlIGNoZWNrXG4gICAgXG4gICAgXG5cbiAgICAvLyBSdW4gcmVhZCBwaXhlbHNcbiAgICBnbC5waXhlbFN0b3JlaShHTF9QQUNLX0FMSUdOTUVOVCwgNClcbiAgICBnbC5yZWFkUGl4ZWxzKHgsIHksIHdpZHRoLCBoZWlnaHQsIEdMX1JHQkEsXG4gICAgICAgICAgICAgICAgICB0eXBlLFxuICAgICAgICAgICAgICAgICAgZGF0YSlcblxuICAgIHJldHVybiBkYXRhXG4gIH1cblxuICByZXR1cm4gcmVhZFBpeGVsc1xufVxuIiwiXG52YXIgdmFsdWVzID0gcmVxdWlyZSgnLi91dGlsL3ZhbHVlcycpXG5cbnZhciBHTF9SRU5ERVJCVUZGRVIgPSAweDhENDFcblxudmFyIEdMX1JHQkE0ID0gMHg4MDU2XG52YXIgR0xfUkdCNV9BMSA9IDB4ODA1N1xudmFyIEdMX1JHQjU2NSA9IDB4OEQ2MlxudmFyIEdMX0RFUFRIX0NPTVBPTkVOVDE2ID0gMHg4MUE1XG52YXIgR0xfU1RFTkNJTF9JTkRFWDggPSAweDhENDhcbnZhciBHTF9ERVBUSF9TVEVOQ0lMID0gMHg4NEY5XG5cbnZhciBHTF9TUkdCOF9BTFBIQThfRVhUID0gMHg4QzQzXG5cbnZhciBHTF9SR0JBMzJGX0VYVCA9IDB4ODgxNFxuXG52YXIgR0xfUkdCQTE2Rl9FWFQgPSAweDg4MUFcbnZhciBHTF9SR0IxNkZfRVhUID0gMHg4ODFCXG5cbnZhciBGT1JNQVRfU0laRVMgPSBbXVxuXG5GT1JNQVRfU0laRVNbR0xfUkdCQTRdID0gMlxuRk9STUFUX1NJWkVTW0dMX1JHQjVfQTFdID0gMlxuRk9STUFUX1NJWkVTW0dMX1JHQjU2NV0gPSAyXG5cbkZPUk1BVF9TSVpFU1tHTF9ERVBUSF9DT01QT05FTlQxNl0gPSAyXG5GT1JNQVRfU0laRVNbR0xfU1RFTkNJTF9JTkRFWDhdID0gMVxuRk9STUFUX1NJWkVTW0dMX0RFUFRIX1NURU5DSUxdID0gNFxuXG5GT1JNQVRfU0laRVNbR0xfU1JHQjhfQUxQSEE4X0VYVF0gPSA0XG5GT1JNQVRfU0laRVNbR0xfUkdCQTMyRl9FWFRdID0gMTZcbkZPUk1BVF9TSVpFU1tHTF9SR0JBMTZGX0VYVF0gPSA4XG5GT1JNQVRfU0laRVNbR0xfUkdCMTZGX0VYVF0gPSA2XG5cbmZ1bmN0aW9uIGdldFJlbmRlcmJ1ZmZlclNpemUgKGZvcm1hdCwgd2lkdGgsIGhlaWdodCkge1xuICByZXR1cm4gRk9STUFUX1NJWkVTW2Zvcm1hdF0gKiB3aWR0aCAqIGhlaWdodFxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChnbCwgZXh0ZW5zaW9ucywgbGltaXRzLCBzdGF0cywgY29uZmlnKSB7XG4gIHZhciBmb3JtYXRUeXBlcyA9IHtcbiAgICAncmdiYTQnOiBHTF9SR0JBNCxcbiAgICAncmdiNTY1JzogR0xfUkdCNTY1LFxuICAgICdyZ2I1IGExJzogR0xfUkdCNV9BMSxcbiAgICAnZGVwdGgnOiBHTF9ERVBUSF9DT01QT05FTlQxNixcbiAgICAnc3RlbmNpbCc6IEdMX1NURU5DSUxfSU5ERVg4LFxuICAgICdkZXB0aCBzdGVuY2lsJzogR0xfREVQVEhfU1RFTkNJTFxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMuZXh0X3NyZ2IpIHtcbiAgICBmb3JtYXRUeXBlc1snc3JnYmEnXSA9IEdMX1NSR0I4X0FMUEhBOF9FWFRcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLmV4dF9jb2xvcl9idWZmZXJfaGFsZl9mbG9hdCkge1xuICAgIGZvcm1hdFR5cGVzWydyZ2JhMTZmJ10gPSBHTF9SR0JBMTZGX0VYVFxuICAgIGZvcm1hdFR5cGVzWydyZ2IxNmYnXSA9IEdMX1JHQjE2Rl9FWFRcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLndlYmdsX2NvbG9yX2J1ZmZlcl9mbG9hdCkge1xuICAgIGZvcm1hdFR5cGVzWydyZ2JhMzJmJ10gPSBHTF9SR0JBMzJGX0VYVFxuICB9XG5cbiAgdmFyIGZvcm1hdFR5cGVzSW52ZXJ0ID0gW11cbiAgT2JqZWN0LmtleXMoZm9ybWF0VHlwZXMpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgIHZhciB2YWwgPSBmb3JtYXRUeXBlc1trZXldXG4gICAgZm9ybWF0VHlwZXNJbnZlcnRbdmFsXSA9IGtleVxuICB9KVxuXG4gIHZhciByZW5kZXJidWZmZXJDb3VudCA9IDBcbiAgdmFyIHJlbmRlcmJ1ZmZlclNldCA9IHt9XG5cbiAgZnVuY3Rpb24gUkVHTFJlbmRlcmJ1ZmZlciAocmVuZGVyYnVmZmVyKSB7XG4gICAgdGhpcy5pZCA9IHJlbmRlcmJ1ZmZlckNvdW50KytcbiAgICB0aGlzLnJlZkNvdW50ID0gMVxuXG4gICAgdGhpcy5yZW5kZXJidWZmZXIgPSByZW5kZXJidWZmZXJcblxuICAgIHRoaXMuZm9ybWF0ID0gR0xfUkdCQTRcbiAgICB0aGlzLndpZHRoID0gMFxuICAgIHRoaXMuaGVpZ2h0ID0gMFxuXG4gICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgICB0aGlzLnN0YXRzID0ge3NpemU6IDB9XG4gICAgfVxuICB9XG5cbiAgUkVHTFJlbmRlcmJ1ZmZlci5wcm90b3R5cGUuZGVjUmVmID0gZnVuY3Rpb24gKCkge1xuICAgIGlmICgtLXRoaXMucmVmQ291bnQgPD0gMCkge1xuICAgICAgZGVzdHJveSh0aGlzKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGRlc3Ryb3kgKHJiKSB7XG4gICAgdmFyIGhhbmRsZSA9IHJiLnJlbmRlcmJ1ZmZlclxuICAgIFxuICAgIGdsLmJpbmRSZW5kZXJidWZmZXIoR0xfUkVOREVSQlVGRkVSLCBudWxsKVxuICAgIGdsLmRlbGV0ZVJlbmRlcmJ1ZmZlcihoYW5kbGUpXG4gICAgcmIucmVuZGVyYnVmZmVyID0gbnVsbFxuICAgIHJiLnJlZkNvdW50ID0gMFxuICAgIGRlbGV0ZSByZW5kZXJidWZmZXJTZXRbcmIuaWRdXG4gICAgc3RhdHMucmVuZGVyYnVmZmVyQ291bnQtLVxuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlUmVuZGVyYnVmZmVyIChhLCBiKSB7XG4gICAgdmFyIHJlbmRlcmJ1ZmZlciA9IG5ldyBSRUdMUmVuZGVyYnVmZmVyKGdsLmNyZWF0ZVJlbmRlcmJ1ZmZlcigpKVxuICAgIHJlbmRlcmJ1ZmZlclNldFtyZW5kZXJidWZmZXIuaWRdID0gcmVuZGVyYnVmZmVyXG4gICAgc3RhdHMucmVuZGVyYnVmZmVyQ291bnQrK1xuXG4gICAgZnVuY3Rpb24gcmVnbFJlbmRlcmJ1ZmZlciAoYSwgYikge1xuICAgICAgdmFyIHcgPSAwXG4gICAgICB2YXIgaCA9IDBcbiAgICAgIHZhciBmb3JtYXQgPSBHTF9SR0JBNFxuXG4gICAgICBpZiAodHlwZW9mIGEgPT09ICdvYmplY3QnICYmIGEpIHtcbiAgICAgICAgdmFyIG9wdGlvbnMgPSBhXG4gICAgICAgIGlmICgnc2hhcGUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICB2YXIgc2hhcGUgPSBvcHRpb25zLnNoYXBlXG4gICAgICAgICAgXG4gICAgICAgICAgdyA9IHNoYXBlWzBdIHwgMFxuICAgICAgICAgIGggPSBzaGFwZVsxXSB8IDBcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZiAoJ3JhZGl1cycgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgdyA9IGggPSBvcHRpb25zLnJhZGl1cyB8IDBcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCd3aWR0aCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgdyA9IG9wdGlvbnMud2lkdGggfCAwXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICgnaGVpZ2h0JyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBoID0gb3B0aW9ucy5oZWlnaHQgfCAwXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmICgnZm9ybWF0JyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgXG4gICAgICAgICAgZm9ybWF0ID0gZm9ybWF0VHlwZXNbb3B0aW9ucy5mb3JtYXRdXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGEgPT09ICdudW1iZXInKSB7XG4gICAgICAgIHcgPSBhIHwgMFxuICAgICAgICBpZiAodHlwZW9mIGIgPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgaCA9IGIgfCAwXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaCA9IHdcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmICghYSkge1xuICAgICAgICB3ID0gaCA9IDFcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIFxuICAgICAgfVxuXG4gICAgICAvLyBjaGVjayBzaGFwZVxuICAgICAgXG5cbiAgICAgIGlmICh3ID09PSByZW5kZXJidWZmZXIud2lkdGggJiZcbiAgICAgICAgICBoID09PSByZW5kZXJidWZmZXIuaGVpZ2h0ICYmXG4gICAgICAgICAgZm9ybWF0ID09PSByZW5kZXJidWZmZXIuZm9ybWF0KSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuXG4gICAgICByZWdsUmVuZGVyYnVmZmVyLndpZHRoID0gcmVuZGVyYnVmZmVyLndpZHRoID0gd1xuICAgICAgcmVnbFJlbmRlcmJ1ZmZlci5oZWlnaHQgPSByZW5kZXJidWZmZXIuaGVpZ2h0ID0gaFxuICAgICAgcmVuZGVyYnVmZmVyLmZvcm1hdCA9IGZvcm1hdFxuXG4gICAgICBnbC5iaW5kUmVuZGVyYnVmZmVyKEdMX1JFTkRFUkJVRkZFUiwgcmVuZGVyYnVmZmVyLnJlbmRlcmJ1ZmZlcilcbiAgICAgIGdsLnJlbmRlcmJ1ZmZlclN0b3JhZ2UoR0xfUkVOREVSQlVGRkVSLCBmb3JtYXQsIHcsIGgpXG5cbiAgICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgICByZW5kZXJidWZmZXIuc3RhdHMuc2l6ZSA9IGdldFJlbmRlcmJ1ZmZlclNpemUocmVuZGVyYnVmZmVyLmZvcm1hdCwgcmVuZGVyYnVmZmVyLndpZHRoLCByZW5kZXJidWZmZXIuaGVpZ2h0KVxuICAgICAgfVxuICAgICAgcmVnbFJlbmRlcmJ1ZmZlci5mb3JtYXQgPSBmb3JtYXRUeXBlc0ludmVydFtyZW5kZXJidWZmZXIuZm9ybWF0XVxuXG4gICAgICByZXR1cm4gcmVnbFJlbmRlcmJ1ZmZlclxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHJlc2l6ZSAod18sIGhfKSB7XG4gICAgICB2YXIgdyA9IHdfIHwgMFxuICAgICAgdmFyIGggPSAoaF8gfCAwKSB8fCB3XG5cbiAgICAgIGlmICh3ID09PSByZW5kZXJidWZmZXIud2lkdGggJiYgaCA9PT0gcmVuZGVyYnVmZmVyLmhlaWdodCkge1xuICAgICAgICByZXR1cm4gcmVnbFJlbmRlcmJ1ZmZlclxuICAgICAgfVxuXG4gICAgICAvLyBjaGVjayBzaGFwZVxuICAgICAgXG5cbiAgICAgIHJlZ2xSZW5kZXJidWZmZXIud2lkdGggPSByZW5kZXJidWZmZXIud2lkdGggPSB3XG4gICAgICByZWdsUmVuZGVyYnVmZmVyLmhlaWdodCA9IHJlbmRlcmJ1ZmZlci5oZWlnaHQgPSBoXG5cbiAgICAgIGdsLmJpbmRSZW5kZXJidWZmZXIoR0xfUkVOREVSQlVGRkVSLCByZW5kZXJidWZmZXIucmVuZGVyYnVmZmVyKVxuICAgICAgZ2wucmVuZGVyYnVmZmVyU3RvcmFnZShHTF9SRU5ERVJCVUZGRVIsIHJlbmRlcmJ1ZmZlci5mb3JtYXQsIHcsIGgpXG5cbiAgICAgIC8vIGFsc28sIHJlY29tcHV0ZSBzaXplLlxuICAgICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgICAgIHJlbmRlcmJ1ZmZlci5zdGF0cy5zaXplID0gZ2V0UmVuZGVyYnVmZmVyU2l6ZShcbiAgICAgICAgICByZW5kZXJidWZmZXIuZm9ybWF0LCByZW5kZXJidWZmZXIud2lkdGgsIHJlbmRlcmJ1ZmZlci5oZWlnaHQpXG4gICAgICB9XG5cbiAgICAgIHJldHVybiByZWdsUmVuZGVyYnVmZmVyXG4gICAgfVxuXG4gICAgcmVnbFJlbmRlcmJ1ZmZlcihhLCBiKVxuXG4gICAgcmVnbFJlbmRlcmJ1ZmZlci5yZXNpemUgPSByZXNpemVcbiAgICByZWdsUmVuZGVyYnVmZmVyLl9yZWdsVHlwZSA9ICdyZW5kZXJidWZmZXInXG4gICAgcmVnbFJlbmRlcmJ1ZmZlci5fcmVuZGVyYnVmZmVyID0gcmVuZGVyYnVmZmVyXG4gICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgICByZWdsUmVuZGVyYnVmZmVyLnN0YXRzID0gcmVuZGVyYnVmZmVyLnN0YXRzXG4gICAgfVxuICAgIHJlZ2xSZW5kZXJidWZmZXIuZGVzdHJveSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHJlbmRlcmJ1ZmZlci5kZWNSZWYoKVxuICAgIH1cblxuICAgIHJldHVybiByZWdsUmVuZGVyYnVmZmVyXG4gIH1cblxuICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICBzdGF0cy5nZXRUb3RhbFJlbmRlcmJ1ZmZlclNpemUgPSBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgdG90YWwgPSAwXG4gICAgICBPYmplY3Qua2V5cyhyZW5kZXJidWZmZXJTZXQpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgICAgICB0b3RhbCArPSByZW5kZXJidWZmZXJTZXRba2V5XS5zdGF0cy5zaXplXG4gICAgICB9KVxuICAgICAgcmV0dXJuIHRvdGFsXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcmVzdG9yZVJlbmRlcmJ1ZmZlcnMgKCkge1xuICAgIHZhbHVlcyhyZW5kZXJidWZmZXJTZXQpLmZvckVhY2goZnVuY3Rpb24gKHJiKSB7XG4gICAgICByYi5yZW5kZXJidWZmZXIgPSBnbC5jcmVhdGVSZW5kZXJidWZmZXIoKVxuICAgICAgZ2wuYmluZFJlbmRlcmJ1ZmZlcihHTF9SRU5ERVJCVUZGRVIsIHJiLnJlbmRlcmJ1ZmZlcilcbiAgICAgIGdsLnJlbmRlcmJ1ZmZlclN0b3JhZ2UoR0xfUkVOREVSQlVGRkVSLCByYi5mb3JtYXQsIHJiLndpZHRoLCByYi5oZWlnaHQpXG4gICAgfSlcbiAgICBnbC5iaW5kUmVuZGVyYnVmZmVyKEdMX1JFTkRFUkJVRkZFUiwgbnVsbClcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY3JlYXRlOiBjcmVhdGVSZW5kZXJidWZmZXIsXG4gICAgY2xlYXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhbHVlcyhyZW5kZXJidWZmZXJTZXQpLmZvckVhY2goZGVzdHJveSlcbiAgICB9LFxuICAgIHJlc3RvcmU6IHJlc3RvcmVSZW5kZXJidWZmZXJzXG4gIH1cbn1cbiIsIlxudmFyIHZhbHVlcyA9IHJlcXVpcmUoJy4vdXRpbC92YWx1ZXMnKVxuXG52YXIgR0xfRlJBR01FTlRfU0hBREVSID0gMzU2MzJcbnZhciBHTF9WRVJURVhfU0hBREVSID0gMzU2MzNcblxudmFyIEdMX0FDVElWRV9VTklGT1JNUyA9IDB4OEI4NlxudmFyIEdMX0FDVElWRV9BVFRSSUJVVEVTID0gMHg4Qjg5XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gd3JhcFNoYWRlclN0YXRlIChnbCwgc3RyaW5nU3RvcmUsIHN0YXRzLCBjb25maWcpIHtcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIGdsc2wgY29tcGlsYXRpb24gYW5kIGxpbmtpbmdcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIHZhciBmcmFnU2hhZGVycyA9IHt9XG4gIHZhciB2ZXJ0U2hhZGVycyA9IHt9XG5cbiAgZnVuY3Rpb24gQWN0aXZlSW5mbyAobmFtZSwgaWQsIGxvY2F0aW9uLCBpbmZvKSB7XG4gICAgdGhpcy5uYW1lID0gbmFtZVxuICAgIHRoaXMuaWQgPSBpZFxuICAgIHRoaXMubG9jYXRpb24gPSBsb2NhdGlvblxuICAgIHRoaXMuaW5mbyA9IGluZm9cbiAgfVxuXG4gIGZ1bmN0aW9uIGluc2VydEFjdGl2ZUluZm8gKGxpc3QsIGluZm8pIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxpc3QubGVuZ3RoOyArK2kpIHtcbiAgICAgIGlmIChsaXN0W2ldLmlkID09PSBpbmZvLmlkKSB7XG4gICAgICAgIGxpc3RbaV0ubG9jYXRpb24gPSBpbmZvLmxvY2F0aW9uXG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgIH1cbiAgICBsaXN0LnB1c2goaW5mbylcbiAgfVxuXG4gIGZ1bmN0aW9uIGdldFNoYWRlciAodHlwZSwgaWQsIGNvbW1hbmQpIHtcbiAgICB2YXIgY2FjaGUgPSB0eXBlID09PSBHTF9GUkFHTUVOVF9TSEFERVIgPyBmcmFnU2hhZGVycyA6IHZlcnRTaGFkZXJzXG4gICAgdmFyIHNoYWRlciA9IGNhY2hlW2lkXVxuXG4gICAgaWYgKCFzaGFkZXIpIHtcbiAgICAgIHZhciBzb3VyY2UgPSBzdHJpbmdTdG9yZS5zdHIoaWQpXG4gICAgICBzaGFkZXIgPSBnbC5jcmVhdGVTaGFkZXIodHlwZSlcbiAgICAgIGdsLnNoYWRlclNvdXJjZShzaGFkZXIsIHNvdXJjZSlcbiAgICAgIGdsLmNvbXBpbGVTaGFkZXIoc2hhZGVyKVxuICAgICAgXG4gICAgICBjYWNoZVtpZF0gPSBzaGFkZXJcbiAgICB9XG5cbiAgICByZXR1cm4gc2hhZGVyXG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gcHJvZ3JhbSBsaW5raW5nXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICB2YXIgcHJvZ3JhbUNhY2hlID0ge31cbiAgdmFyIHByb2dyYW1MaXN0ID0gW11cblxuICB2YXIgUFJPR1JBTV9DT1VOVEVSID0gMFxuXG4gIGZ1bmN0aW9uIFJFR0xQcm9ncmFtIChmcmFnSWQsIHZlcnRJZCkge1xuICAgIHRoaXMuaWQgPSBQUk9HUkFNX0NPVU5URVIrK1xuICAgIHRoaXMuZnJhZ0lkID0gZnJhZ0lkXG4gICAgdGhpcy52ZXJ0SWQgPSB2ZXJ0SWRcbiAgICB0aGlzLnByb2dyYW0gPSBudWxsXG4gICAgdGhpcy51bmlmb3JtcyA9IFtdXG4gICAgdGhpcy5hdHRyaWJ1dGVzID0gW11cblxuICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgdGhpcy5zdGF0cyA9IHtcbiAgICAgICAgdW5pZm9ybXNDb3VudDogMCxcbiAgICAgICAgYXR0cmlidXRlc0NvdW50OiAwXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gbGlua1Byb2dyYW0gKGRlc2MsIGNvbW1hbmQpIHtcbiAgICB2YXIgaSwgaW5mb1xuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIGNvbXBpbGUgJiBsaW5rXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIHZhciBmcmFnU2hhZGVyID0gZ2V0U2hhZGVyKEdMX0ZSQUdNRU5UX1NIQURFUiwgZGVzYy5mcmFnSWQpXG4gICAgdmFyIHZlcnRTaGFkZXIgPSBnZXRTaGFkZXIoR0xfVkVSVEVYX1NIQURFUiwgZGVzYy52ZXJ0SWQpXG5cbiAgICB2YXIgcHJvZ3JhbSA9IGRlc2MucHJvZ3JhbSA9IGdsLmNyZWF0ZVByb2dyYW0oKVxuICAgIGdsLmF0dGFjaFNoYWRlcihwcm9ncmFtLCBmcmFnU2hhZGVyKVxuICAgIGdsLmF0dGFjaFNoYWRlcihwcm9ncmFtLCB2ZXJ0U2hhZGVyKVxuICAgIGdsLmxpbmtQcm9ncmFtKHByb2dyYW0pXG4gICAgXG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gZ3JhYiB1bmlmb3Jtc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICB2YXIgbnVtVW5pZm9ybXMgPSBnbC5nZXRQcm9ncmFtUGFyYW1ldGVyKHByb2dyYW0sIEdMX0FDVElWRV9VTklGT1JNUylcbiAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgIGRlc2Muc3RhdHMudW5pZm9ybXNDb3VudCA9IG51bVVuaWZvcm1zXG4gICAgfVxuICAgIHZhciB1bmlmb3JtcyA9IGRlc2MudW5pZm9ybXNcbiAgICBmb3IgKGkgPSAwOyBpIDwgbnVtVW5pZm9ybXM7ICsraSkge1xuICAgICAgaW5mbyA9IGdsLmdldEFjdGl2ZVVuaWZvcm0ocHJvZ3JhbSwgaSlcbiAgICAgIGlmIChpbmZvKSB7XG4gICAgICAgIGlmIChpbmZvLnNpemUgPiAxKSB7XG4gICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBpbmZvLnNpemU7ICsraikge1xuICAgICAgICAgICAgdmFyIG5hbWUgPSBpbmZvLm5hbWUucmVwbGFjZSgnWzBdJywgJ1snICsgaiArICddJylcbiAgICAgICAgICAgIGluc2VydEFjdGl2ZUluZm8odW5pZm9ybXMsIG5ldyBBY3RpdmVJbmZvKFxuICAgICAgICAgICAgICBuYW1lLFxuICAgICAgICAgICAgICBzdHJpbmdTdG9yZS5pZChuYW1lKSxcbiAgICAgICAgICAgICAgZ2wuZ2V0VW5pZm9ybUxvY2F0aW9uKHByb2dyYW0sIG5hbWUpLFxuICAgICAgICAgICAgICBpbmZvKSlcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaW5zZXJ0QWN0aXZlSW5mbyh1bmlmb3JtcywgbmV3IEFjdGl2ZUluZm8oXG4gICAgICAgICAgICBpbmZvLm5hbWUsXG4gICAgICAgICAgICBzdHJpbmdTdG9yZS5pZChpbmZvLm5hbWUpLFxuICAgICAgICAgICAgZ2wuZ2V0VW5pZm9ybUxvY2F0aW9uKHByb2dyYW0sIGluZm8ubmFtZSksXG4gICAgICAgICAgICBpbmZvKSlcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBncmFiIGF0dHJpYnV0ZXNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgdmFyIG51bUF0dHJpYnV0ZXMgPSBnbC5nZXRQcm9ncmFtUGFyYW1ldGVyKHByb2dyYW0sIEdMX0FDVElWRV9BVFRSSUJVVEVTKVxuICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgZGVzYy5zdGF0cy5hdHRyaWJ1dGVzQ291bnQgPSBudW1BdHRyaWJ1dGVzXG4gICAgfVxuXG4gICAgdmFyIGF0dHJpYnV0ZXMgPSBkZXNjLmF0dHJpYnV0ZXNcbiAgICBmb3IgKGkgPSAwOyBpIDwgbnVtQXR0cmlidXRlczsgKytpKSB7XG4gICAgICBpbmZvID0gZ2wuZ2V0QWN0aXZlQXR0cmliKHByb2dyYW0sIGkpXG4gICAgICBpZiAoaW5mbykge1xuICAgICAgICBpbnNlcnRBY3RpdmVJbmZvKGF0dHJpYnV0ZXMsIG5ldyBBY3RpdmVJbmZvKFxuICAgICAgICAgIGluZm8ubmFtZSxcbiAgICAgICAgICBzdHJpbmdTdG9yZS5pZChpbmZvLm5hbWUpLFxuICAgICAgICAgIGdsLmdldEF0dHJpYkxvY2F0aW9uKHByb2dyYW0sIGluZm8ubmFtZSksXG4gICAgICAgICAgaW5mbykpXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgc3RhdHMuZ2V0TWF4VW5pZm9ybXNDb3VudCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBtID0gMFxuICAgICAgcHJvZ3JhbUxpc3QuZm9yRWFjaChmdW5jdGlvbiAoZGVzYykge1xuICAgICAgICBpZiAoZGVzYy5zdGF0cy51bmlmb3Jtc0NvdW50ID4gbSkge1xuICAgICAgICAgIG0gPSBkZXNjLnN0YXRzLnVuaWZvcm1zQ291bnRcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIHJldHVybiBtXG4gICAgfVxuXG4gICAgc3RhdHMuZ2V0TWF4QXR0cmlidXRlc0NvdW50ID0gZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIG0gPSAwXG4gICAgICBwcm9ncmFtTGlzdC5mb3JFYWNoKGZ1bmN0aW9uIChkZXNjKSB7XG4gICAgICAgIGlmIChkZXNjLnN0YXRzLmF0dHJpYnV0ZXNDb3VudCA+IG0pIHtcbiAgICAgICAgICBtID0gZGVzYy5zdGF0cy5hdHRyaWJ1dGVzQ291bnRcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIHJldHVybiBtXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcmVzdG9yZVNoYWRlcnMgKCkge1xuICAgIGZyYWdTaGFkZXJzID0ge31cbiAgICB2ZXJ0U2hhZGVycyA9IHt9XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBwcm9ncmFtTGlzdC5sZW5ndGg7ICsraSkge1xuICAgICAgbGlua1Byb2dyYW0ocHJvZ3JhbUxpc3RbaV0pXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjbGVhcjogZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIGRlbGV0ZVNoYWRlciA9IGdsLmRlbGV0ZVNoYWRlci5iaW5kKGdsKVxuICAgICAgdmFsdWVzKGZyYWdTaGFkZXJzKS5mb3JFYWNoKGRlbGV0ZVNoYWRlcilcbiAgICAgIGZyYWdTaGFkZXJzID0ge31cbiAgICAgIHZhbHVlcyh2ZXJ0U2hhZGVycykuZm9yRWFjaChkZWxldGVTaGFkZXIpXG4gICAgICB2ZXJ0U2hhZGVycyA9IHt9XG5cbiAgICAgIHByb2dyYW1MaXN0LmZvckVhY2goZnVuY3Rpb24gKGRlc2MpIHtcbiAgICAgICAgZ2wuZGVsZXRlUHJvZ3JhbShkZXNjLnByb2dyYW0pXG4gICAgICB9KVxuICAgICAgcHJvZ3JhbUxpc3QubGVuZ3RoID0gMFxuICAgICAgcHJvZ3JhbUNhY2hlID0ge31cblxuICAgICAgc3RhdHMuc2hhZGVyQ291bnQgPSAwXG4gICAgfSxcblxuICAgIHByb2dyYW06IGZ1bmN0aW9uICh2ZXJ0SWQsIGZyYWdJZCwgY29tbWFuZCkge1xuICAgICAgXG4gICAgICBcblxuICAgICAgc3RhdHMuc2hhZGVyQ291bnQrK1xuXG4gICAgICB2YXIgY2FjaGUgPSBwcm9ncmFtQ2FjaGVbZnJhZ0lkXVxuICAgICAgaWYgKCFjYWNoZSkge1xuICAgICAgICBjYWNoZSA9IHByb2dyYW1DYWNoZVtmcmFnSWRdID0ge31cbiAgICAgIH1cbiAgICAgIHZhciBwcm9ncmFtID0gY2FjaGVbdmVydElkXVxuICAgICAgaWYgKCFwcm9ncmFtKSB7XG4gICAgICAgIHByb2dyYW0gPSBuZXcgUkVHTFByb2dyYW0oZnJhZ0lkLCB2ZXJ0SWQpXG4gICAgICAgIGxpbmtQcm9ncmFtKHByb2dyYW0sIGNvbW1hbmQpXG4gICAgICAgIGNhY2hlW3ZlcnRJZF0gPSBwcm9ncmFtXG4gICAgICAgIHByb2dyYW1MaXN0LnB1c2gocHJvZ3JhbSlcbiAgICAgIH1cbiAgICAgIHJldHVybiBwcm9ncmFtXG4gICAgfSxcblxuICAgIHJlc3RvcmU6IHJlc3RvcmVTaGFkZXJzLFxuXG4gICAgc2hhZGVyOiBnZXRTaGFkZXIsXG5cbiAgICBmcmFnOiAtMSxcbiAgICB2ZXJ0OiAtMVxuICB9XG59XG4iLCJcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gc3RhdHMgKCkge1xuICByZXR1cm4ge1xuICAgIGJ1ZmZlckNvdW50OiAwLFxuICAgIGVsZW1lbnRzQ291bnQ6IDAsXG4gICAgZnJhbWVidWZmZXJDb3VudDogMCxcbiAgICBzaGFkZXJDb3VudDogMCxcbiAgICB0ZXh0dXJlQ291bnQ6IDAsXG4gICAgY3ViZUNvdW50OiAwLFxuICAgIHJlbmRlcmJ1ZmZlckNvdW50OiAwLFxuXG4gICAgbWF4VGV4dHVyZVVuaXRzOiAwXG4gIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY3JlYXRlU3RyaW5nU3RvcmUgKCkge1xuICB2YXIgc3RyaW5nSWRzID0geycnOiAwfVxuICB2YXIgc3RyaW5nVmFsdWVzID0gWycnXVxuICByZXR1cm4ge1xuICAgIGlkOiBmdW5jdGlvbiAoc3RyKSB7XG4gICAgICB2YXIgcmVzdWx0ID0gc3RyaW5nSWRzW3N0cl1cbiAgICAgIGlmIChyZXN1bHQpIHtcbiAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgfVxuICAgICAgcmVzdWx0ID0gc3RyaW5nSWRzW3N0cl0gPSBzdHJpbmdWYWx1ZXMubGVuZ3RoXG4gICAgICBzdHJpbmdWYWx1ZXMucHVzaChzdHIpXG4gICAgICByZXR1cm4gcmVzdWx0XG4gICAgfSxcblxuICAgIHN0cjogZnVuY3Rpb24gKGlkKSB7XG4gICAgICByZXR1cm4gc3RyaW5nVmFsdWVzW2lkXVxuICAgIH1cbiAgfVxufVxuIiwiXG52YXIgZXh0ZW5kID0gcmVxdWlyZSgnLi91dGlsL2V4dGVuZCcpXG52YXIgdmFsdWVzID0gcmVxdWlyZSgnLi91dGlsL3ZhbHVlcycpXG52YXIgaXNUeXBlZEFycmF5ID0gcmVxdWlyZSgnLi91dGlsL2lzLXR5cGVkLWFycmF5JylcbnZhciBpc05EQXJyYXlMaWtlID0gcmVxdWlyZSgnLi91dGlsL2lzLW5kYXJyYXknKVxudmFyIHBvb2wgPSByZXF1aXJlKCcuL3V0aWwvcG9vbCcpXG52YXIgY29udmVydFRvSGFsZkZsb2F0ID0gcmVxdWlyZSgnLi91dGlsL3RvLWhhbGYtZmxvYXQnKVxudmFyIGlzQXJyYXlMaWtlID0gcmVxdWlyZSgnLi91dGlsL2lzLWFycmF5LWxpa2UnKVxudmFyIGZsYXR0ZW5VdGlscyA9IHJlcXVpcmUoJy4vdXRpbC9mbGF0dGVuJylcblxudmFyIGR0eXBlcyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL2FycmF5dHlwZXMuanNvbicpXG52YXIgYXJyYXlUeXBlcyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL2FycmF5dHlwZXMuanNvbicpXG5cbnZhciBHTF9DT01QUkVTU0VEX1RFWFRVUkVfRk9STUFUUyA9IDB4ODZBM1xuXG52YXIgR0xfVEVYVFVSRV8yRCA9IDB4MERFMVxudmFyIEdMX1RFWFRVUkVfQ1VCRV9NQVAgPSAweDg1MTNcbnZhciBHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1ggPSAweDg1MTVcblxudmFyIEdMX1JHQkEgPSAweDE5MDhcbnZhciBHTF9BTFBIQSA9IDB4MTkwNlxudmFyIEdMX1JHQiA9IDB4MTkwN1xudmFyIEdMX0xVTUlOQU5DRSA9IDB4MTkwOVxudmFyIEdMX0xVTUlOQU5DRV9BTFBIQSA9IDB4MTkwQVxuXG52YXIgR0xfUkdCQTQgPSAweDgwNTZcbnZhciBHTF9SR0I1X0ExID0gMHg4MDU3XG52YXIgR0xfUkdCNTY1ID0gMHg4RDYyXG5cbnZhciBHTF9VTlNJR05FRF9TSE9SVF80XzRfNF80ID0gMHg4MDMzXG52YXIgR0xfVU5TSUdORURfU0hPUlRfNV81XzVfMSA9IDB4ODAzNFxudmFyIEdMX1VOU0lHTkVEX1NIT1JUXzVfNl81ID0gMHg4MzYzXG52YXIgR0xfVU5TSUdORURfSU5UXzI0XzhfV0VCR0wgPSAweDg0RkFcblxudmFyIEdMX0RFUFRIX0NPTVBPTkVOVCA9IDB4MTkwMlxudmFyIEdMX0RFUFRIX1NURU5DSUwgPSAweDg0RjlcblxudmFyIEdMX1NSR0JfRVhUID0gMHg4QzQwXG52YXIgR0xfU1JHQl9BTFBIQV9FWFQgPSAweDhDNDJcblxudmFyIEdMX0hBTEZfRkxPQVRfT0VTID0gMHg4RDYxXG5cbnZhciBHTF9DT01QUkVTU0VEX1JHQl9TM1RDX0RYVDFfRVhUID0gMHg4M0YwXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUMV9FWFQgPSAweDgzRjFcbnZhciBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQzX0VYVCA9IDB4ODNGMlxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDVfRVhUID0gMHg4M0YzXG5cbnZhciBHTF9DT01QUkVTU0VEX1JHQl9BVENfV0VCR0wgPSAweDhDOTJcbnZhciBHTF9DT01QUkVTU0VEX1JHQkFfQVRDX0VYUExJQ0lUX0FMUEhBX1dFQkdMID0gMHg4QzkzXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX0FUQ19JTlRFUlBPTEFURURfQUxQSEFfV0VCR0wgPSAweDg3RUVcblxudmFyIEdMX0NPTVBSRVNTRURfUkdCX1BWUlRDXzRCUFBWMV9JTUcgPSAweDhDMDBcbnZhciBHTF9DT01QUkVTU0VEX1JHQl9QVlJUQ18yQlBQVjFfSU1HID0gMHg4QzAxXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX1BWUlRDXzRCUFBWMV9JTUcgPSAweDhDMDJcbnZhciBHTF9DT01QUkVTU0VEX1JHQkFfUFZSVENfMkJQUFYxX0lNRyA9IDB4OEMwM1xuXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JfRVRDMV9XRUJHTCA9IDB4OEQ2NFxuXG52YXIgR0xfVU5TSUdORURfQllURSA9IDB4MTQwMVxudmFyIEdMX1VOU0lHTkVEX1NIT1JUID0gMHgxNDAzXG52YXIgR0xfVU5TSUdORURfSU5UID0gMHgxNDA1XG52YXIgR0xfRkxPQVQgPSAweDE0MDZcblxudmFyIEdMX1RFWFRVUkVfV1JBUF9TID0gMHgyODAyXG52YXIgR0xfVEVYVFVSRV9XUkFQX1QgPSAweDI4MDNcblxudmFyIEdMX1JFUEVBVCA9IDB4MjkwMVxudmFyIEdMX0NMQU1QX1RPX0VER0UgPSAweDgxMkZcbnZhciBHTF9NSVJST1JFRF9SRVBFQVQgPSAweDgzNzBcblxudmFyIEdMX1RFWFRVUkVfTUFHX0ZJTFRFUiA9IDB4MjgwMFxudmFyIEdMX1RFWFRVUkVfTUlOX0ZJTFRFUiA9IDB4MjgwMVxuXG52YXIgR0xfTkVBUkVTVCA9IDB4MjYwMFxudmFyIEdMX0xJTkVBUiA9IDB4MjYwMVxudmFyIEdMX05FQVJFU1RfTUlQTUFQX05FQVJFU1QgPSAweDI3MDBcbnZhciBHTF9MSU5FQVJfTUlQTUFQX05FQVJFU1QgPSAweDI3MDFcbnZhciBHTF9ORUFSRVNUX01JUE1BUF9MSU5FQVIgPSAweDI3MDJcbnZhciBHTF9MSU5FQVJfTUlQTUFQX0xJTkVBUiA9IDB4MjcwM1xuXG52YXIgR0xfR0VORVJBVEVfTUlQTUFQX0hJTlQgPSAweDgxOTJcbnZhciBHTF9ET05UX0NBUkUgPSAweDExMDBcbnZhciBHTF9GQVNURVNUID0gMHgxMTAxXG52YXIgR0xfTklDRVNUID0gMHgxMTAyXG5cbnZhciBHTF9URVhUVVJFX01BWF9BTklTT1RST1BZX0VYVCA9IDB4ODRGRVxuXG52YXIgR0xfVU5QQUNLX0FMSUdOTUVOVCA9IDB4MENGNVxudmFyIEdMX1VOUEFDS19GTElQX1lfV0VCR0wgPSAweDkyNDBcbnZhciBHTF9VTlBBQ0tfUFJFTVVMVElQTFlfQUxQSEFfV0VCR0wgPSAweDkyNDFcbnZhciBHTF9VTlBBQ0tfQ09MT1JTUEFDRV9DT05WRVJTSU9OX1dFQkdMID0gMHg5MjQzXG5cbnZhciBHTF9CUk9XU0VSX0RFRkFVTFRfV0VCR0wgPSAweDkyNDRcblxudmFyIEdMX1RFWFRVUkUwID0gMHg4NEMwXG5cbnZhciBNSVBNQVBfRklMVEVSUyA9IFtcbiAgR0xfTkVBUkVTVF9NSVBNQVBfTkVBUkVTVCxcbiAgR0xfTkVBUkVTVF9NSVBNQVBfTElORUFSLFxuICBHTF9MSU5FQVJfTUlQTUFQX05FQVJFU1QsXG4gIEdMX0xJTkVBUl9NSVBNQVBfTElORUFSXG5dXG5cbnZhciBDSEFOTkVMU19GT1JNQVQgPSBbXG4gIDAsXG4gIEdMX0xVTUlOQU5DRSxcbiAgR0xfTFVNSU5BTkNFX0FMUEhBLFxuICBHTF9SR0IsXG4gIEdMX1JHQkFcbl1cblxudmFyIEZPUk1BVF9DSEFOTkVMUyA9IHt9XG5GT1JNQVRfQ0hBTk5FTFNbR0xfTFVNSU5BTkNFXSA9XG5GT1JNQVRfQ0hBTk5FTFNbR0xfQUxQSEFdID1cbkZPUk1BVF9DSEFOTkVMU1tHTF9ERVBUSF9DT01QT05FTlRdID0gMVxuRk9STUFUX0NIQU5ORUxTW0dMX0RFUFRIX1NURU5DSUxdID1cbkZPUk1BVF9DSEFOTkVMU1tHTF9MVU1JTkFOQ0VfQUxQSEFdID0gMlxuRk9STUFUX0NIQU5ORUxTW0dMX1JHQl0gPVxuRk9STUFUX0NIQU5ORUxTW0dMX1NSR0JfRVhUXSA9IDNcbkZPUk1BVF9DSEFOTkVMU1tHTF9SR0JBXSA9XG5GT1JNQVRfQ0hBTk5FTFNbR0xfU1JHQl9BTFBIQV9FWFRdID0gNFxuXG52YXIgZm9ybWF0VHlwZXMgPSB7fVxuZm9ybWF0VHlwZXNbR0xfUkdCQTRdID0gR0xfVU5TSUdORURfU0hPUlRfNF80XzRfNFxuZm9ybWF0VHlwZXNbR0xfUkdCNTY1XSA9IEdMX1VOU0lHTkVEX1NIT1JUXzVfNl81XG5mb3JtYXRUeXBlc1tHTF9SR0I1X0ExXSA9IEdMX1VOU0lHTkVEX1NIT1JUXzVfNV81XzFcbmZvcm1hdFR5cGVzW0dMX0RFUFRIX0NPTVBPTkVOVF0gPSBHTF9VTlNJR05FRF9JTlRcbmZvcm1hdFR5cGVzW0dMX0RFUFRIX1NURU5DSUxdID0gR0xfVU5TSUdORURfSU5UXzI0XzhfV0VCR0xcblxuZnVuY3Rpb24gb2JqZWN0TmFtZSAoc3RyKSB7XG4gIHJldHVybiAnW29iamVjdCAnICsgc3RyICsgJ10nXG59XG5cbnZhciBDQU5WQVNfQ0xBU1MgPSBvYmplY3ROYW1lKCdIVE1MQ2FudmFzRWxlbWVudCcpXG52YXIgQ09OVEVYVDJEX0NMQVNTID0gb2JqZWN0TmFtZSgnQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEJylcbnZhciBJTUFHRV9DTEFTUyA9IG9iamVjdE5hbWUoJ0hUTUxJbWFnZUVsZW1lbnQnKVxudmFyIFZJREVPX0NMQVNTID0gb2JqZWN0TmFtZSgnSFRNTFZpZGVvRWxlbWVudCcpXG5cbnZhciBQSVhFTF9DTEFTU0VTID0gT2JqZWN0LmtleXMoZHR5cGVzKS5jb25jYXQoW1xuICBDQU5WQVNfQ0xBU1MsXG4gIENPTlRFWFQyRF9DTEFTUyxcbiAgSU1BR0VfQ0xBU1MsXG4gIFZJREVPX0NMQVNTXG5dKVxuXG4vLyBmb3IgZXZlcnkgdGV4dHVyZSB0eXBlLCBzdG9yZVxuLy8gdGhlIHNpemUgaW4gYnl0ZXMuXG52YXIgVFlQRV9TSVpFUyA9IFtdXG5UWVBFX1NJWkVTW0dMX1VOU0lHTkVEX0JZVEVdID0gMVxuVFlQRV9TSVpFU1tHTF9GTE9BVF0gPSA0XG5UWVBFX1NJWkVTW0dMX0hBTEZfRkxPQVRfT0VTXSA9IDJcblxuVFlQRV9TSVpFU1tHTF9VTlNJR05FRF9TSE9SVF0gPSAyXG5UWVBFX1NJWkVTW0dMX1VOU0lHTkVEX0lOVF0gPSA0XG5cbnZhciBGT1JNQVRfU0laRVNfU1BFQ0lBTCA9IFtdXG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9SR0JBNF0gPSAyXG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9SR0I1X0ExXSA9IDJcbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX1JHQjU2NV0gPSAyXG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9ERVBUSF9TVEVOQ0lMXSA9IDRcblxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfQ09NUFJFU1NFRF9SR0JfUzNUQ19EWFQxX0VYVF0gPSAwLjVcbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDFfRVhUXSA9IDAuNVxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUM19FWFRdID0gMVxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUNV9FWFRdID0gMVxuXG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9DT01QUkVTU0VEX1JHQl9BVENfV0VCR0xdID0gMC41XG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9DT01QUkVTU0VEX1JHQkFfQVRDX0VYUExJQ0lUX0FMUEhBX1dFQkdMXSA9IDFcbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0NPTVBSRVNTRURfUkdCQV9BVENfSU5URVJQT0xBVEVEX0FMUEhBX1dFQkdMXSA9IDFcblxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfQ09NUFJFU1NFRF9SR0JfUFZSVENfNEJQUFYxX0lNR10gPSAwLjVcbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0NPTVBSRVNTRURfUkdCX1BWUlRDXzJCUFBWMV9JTUddID0gMC4yNVxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfQ09NUFJFU1NFRF9SR0JBX1BWUlRDXzRCUFBWMV9JTUddID0gMC41XG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9DT01QUkVTU0VEX1JHQkFfUFZSVENfMkJQUFYxX0lNR10gPSAwLjI1XG5cbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0NPTVBSRVNTRURfUkdCX0VUQzFfV0VCR0xdID0gMC41XG5cbmZ1bmN0aW9uIGlzTnVtZXJpY0FycmF5IChhcnIpIHtcbiAgcmV0dXJuIChcbiAgICBBcnJheS5pc0FycmF5KGFycikgJiZcbiAgICAoYXJyLmxlbmd0aCA9PT0gMCB8fFxuICAgIHR5cGVvZiBhcnJbMF0gPT09ICdudW1iZXInKSlcbn1cblxuZnVuY3Rpb24gaXNSZWN0QXJyYXkgKGFycikge1xuICBpZiAoIUFycmF5LmlzQXJyYXkoYXJyKSkge1xuICAgIHJldHVybiBmYWxzZVxuICB9XG4gIHZhciB3aWR0aCA9IGFyci5sZW5ndGhcbiAgaWYgKHdpZHRoID09PSAwIHx8ICFpc0FycmF5TGlrZShhcnJbMF0pKSB7XG4gICAgcmV0dXJuIGZhbHNlXG4gIH1cbiAgcmV0dXJuIHRydWVcbn1cblxuZnVuY3Rpb24gY2xhc3NTdHJpbmcgKHgpIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh4KVxufVxuXG5mdW5jdGlvbiBpc0NhbnZhc0VsZW1lbnQgKG9iamVjdCkge1xuICByZXR1cm4gY2xhc3NTdHJpbmcob2JqZWN0KSA9PT0gQ0FOVkFTX0NMQVNTXG59XG5cbmZ1bmN0aW9uIGlzQ29udGV4dDJEIChvYmplY3QpIHtcbiAgcmV0dXJuIGNsYXNzU3RyaW5nKG9iamVjdCkgPT09IENPTlRFWFQyRF9DTEFTU1xufVxuXG5mdW5jdGlvbiBpc0ltYWdlRWxlbWVudCAob2JqZWN0KSB7XG4gIHJldHVybiBjbGFzc1N0cmluZyhvYmplY3QpID09PSBJTUFHRV9DTEFTU1xufVxuXG5mdW5jdGlvbiBpc1ZpZGVvRWxlbWVudCAob2JqZWN0KSB7XG4gIHJldHVybiBjbGFzc1N0cmluZyhvYmplY3QpID09PSBWSURFT19DTEFTU1xufVxuXG5mdW5jdGlvbiBpc1BpeGVsRGF0YSAob2JqZWN0KSB7XG4gIGlmICghb2JqZWN0KSB7XG4gICAgcmV0dXJuIGZhbHNlXG4gIH1cbiAgdmFyIGNsYXNzTmFtZSA9IGNsYXNzU3RyaW5nKG9iamVjdClcbiAgaWYgKFBJWEVMX0NMQVNTRVMuaW5kZXhPZihjbGFzc05hbWUpID49IDApIHtcbiAgICByZXR1cm4gdHJ1ZVxuICB9XG4gIHJldHVybiAoXG4gICAgaXNOdW1lcmljQXJyYXkob2JqZWN0KSB8fFxuICAgIGlzUmVjdEFycmF5KG9iamVjdCkgfHxcbiAgICBpc05EQXJyYXlMaWtlKG9iamVjdCkpXG59XG5cbmZ1bmN0aW9uIHR5cGVkQXJyYXlDb2RlIChkYXRhKSB7XG4gIHJldHVybiBhcnJheVR5cGVzW09iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChkYXRhKV0gfCAwXG59XG5cbmZ1bmN0aW9uIGNvbnZlcnREYXRhIChyZXN1bHQsIGRhdGEpIHtcbiAgdmFyIG4gPSBkYXRhLmxlbmd0aFxuICBzd2l0Y2ggKHJlc3VsdC50eXBlKSB7XG4gICAgY2FzZSBHTF9VTlNJR05FRF9CWVRFOlxuICAgIGNhc2UgR0xfVU5TSUdORURfU0hPUlQ6XG4gICAgY2FzZSBHTF9VTlNJR05FRF9JTlQ6XG4gICAgY2FzZSBHTF9GTE9BVDpcbiAgICAgIHZhciBjb252ZXJ0ZWQgPSBwb29sLmFsbG9jVHlwZShyZXN1bHQudHlwZSwgbilcbiAgICAgIGNvbnZlcnRlZC5zZXQoZGF0YSlcbiAgICAgIHJlc3VsdC5kYXRhID0gY29udmVydGVkXG4gICAgICBicmVha1xuXG4gICAgY2FzZSBHTF9IQUxGX0ZMT0FUX09FUzpcbiAgICAgIHJlc3VsdC5kYXRhID0gY29udmVydFRvSGFsZkZsb2F0KGRhdGEpXG4gICAgICBicmVha1xuXG4gICAgZGVmYXVsdDpcbiAgICAgIFxuICB9XG59XG5cbmZ1bmN0aW9uIHByZUNvbnZlcnQgKGltYWdlLCBuKSB7XG4gIHJldHVybiBwb29sLmFsbG9jVHlwZShcbiAgICBpbWFnZS50eXBlID09PSBHTF9IQUxGX0ZMT0FUX09FU1xuICAgICAgPyBHTF9GTE9BVFxuICAgICAgOiBpbWFnZS50eXBlLCBuKVxufVxuXG5mdW5jdGlvbiBwb3N0Q29udmVydCAoaW1hZ2UsIGRhdGEpIHtcbiAgaWYgKGltYWdlLnR5cGUgPT09IEdMX0hBTEZfRkxPQVRfT0VTKSB7XG4gICAgaW1hZ2UuZGF0YSA9IGNvbnZlcnRUb0hhbGZGbG9hdChkYXRhKVxuICAgIHBvb2wuZnJlZVR5cGUoZGF0YSlcbiAgfSBlbHNlIHtcbiAgICBpbWFnZS5kYXRhID0gZGF0YVxuICB9XG59XG5cbmZ1bmN0aW9uIHRyYW5zcG9zZURhdGEgKGltYWdlLCBhcnJheSwgc3RyaWRlWCwgc3RyaWRlWSwgc3RyaWRlQywgb2Zmc2V0KSB7XG4gIHZhciB3ID0gaW1hZ2Uud2lkdGhcbiAgdmFyIGggPSBpbWFnZS5oZWlnaHRcbiAgdmFyIGMgPSBpbWFnZS5jaGFubmVsc1xuICB2YXIgbiA9IHcgKiBoICogY1xuICB2YXIgZGF0YSA9IHByZUNvbnZlcnQoaW1hZ2UsIG4pXG5cbiAgdmFyIHAgPSAwXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgaDsgKytpKSB7XG4gICAgZm9yICh2YXIgaiA9IDA7IGogPCB3OyArK2opIHtcbiAgICAgIGZvciAodmFyIGsgPSAwOyBrIDwgYzsgKytrKSB7XG4gICAgICAgIGRhdGFbcCsrXSA9IGFycmF5W3N0cmlkZVggKiBqICsgc3RyaWRlWSAqIGkgKyBzdHJpZGVDICogayArIG9mZnNldF1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBwb3N0Q29udmVydChpbWFnZSwgZGF0YSlcbn1cblxuZnVuY3Rpb24gZ2V0VGV4dHVyZVNpemUgKGZvcm1hdCwgdHlwZSwgd2lkdGgsIGhlaWdodCwgaXNNaXBtYXAsIGlzQ3ViZSkge1xuICB2YXIgc1xuICBpZiAodHlwZW9mIEZPUk1BVF9TSVpFU19TUEVDSUFMW2Zvcm1hdF0gIT09ICd1bmRlZmluZWQnKSB7XG4gICAgLy8gd2UgaGF2ZSBhIHNwZWNpYWwgYXJyYXkgZm9yIGRlYWxpbmcgd2l0aCB3ZWlyZCBjb2xvciBmb3JtYXRzIHN1Y2ggYXMgUkdCNUExXG4gICAgcyA9IEZPUk1BVF9TSVpFU19TUEVDSUFMW2Zvcm1hdF1cbiAgfSBlbHNlIHtcbiAgICBzID0gRk9STUFUX0NIQU5ORUxTW2Zvcm1hdF0gKiBUWVBFX1NJWkVTW3R5cGVdXG4gIH1cblxuICBpZiAoaXNDdWJlKSB7XG4gICAgcyAqPSA2XG4gIH1cblxuICBpZiAoaXNNaXBtYXApIHtcbiAgICAvLyBjb21wdXRlIHRoZSB0b3RhbCBzaXplIG9mIGFsbCB0aGUgbWlwbWFwcy5cbiAgICB2YXIgdG90YWwgPSAwXG5cbiAgICB2YXIgdyA9IHdpZHRoXG4gICAgd2hpbGUgKHcgPj0gMSkge1xuICAgICAgLy8gd2UgY2FuIG9ubHkgdXNlIG1pcG1hcHMgb24gYSBzcXVhcmUgaW1hZ2UsXG4gICAgICAvLyBzbyB3ZSBjYW4gc2ltcGx5IHVzZSB0aGUgd2lkdGggYW5kIGlnbm9yZSB0aGUgaGVpZ2h0OlxuICAgICAgdG90YWwgKz0gcyAqIHcgKiB3XG4gICAgICB3IC89IDJcbiAgICB9XG4gICAgcmV0dXJuIHRvdGFsXG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIHMgKiB3aWR0aCAqIGhlaWdodFxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY3JlYXRlVGV4dHVyZVNldCAoXG4gIGdsLCBleHRlbnNpb25zLCBsaW1pdHMsIHJlZ2xQb2xsLCBjb250ZXh0U3RhdGUsIHN0YXRzLCBjb25maWcpIHtcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAvLyBJbml0aWFsaXplIGNvbnN0YW50cyBhbmQgcGFyYW1ldGVyIHRhYmxlcyBoZXJlXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgdmFyIG1pcG1hcEhpbnQgPSB7XG4gICAgXCJkb24ndCBjYXJlXCI6IEdMX0RPTlRfQ0FSRSxcbiAgICAnZG9udCBjYXJlJzogR0xfRE9OVF9DQVJFLFxuICAgICduaWNlJzogR0xfTklDRVNULFxuICAgICdmYXN0JzogR0xfRkFTVEVTVFxuICB9XG5cbiAgdmFyIHdyYXBNb2RlcyA9IHtcbiAgICAncmVwZWF0JzogR0xfUkVQRUFULFxuICAgICdjbGFtcCc6IEdMX0NMQU1QX1RPX0VER0UsXG4gICAgJ21pcnJvcic6IEdMX01JUlJPUkVEX1JFUEVBVFxuICB9XG5cbiAgdmFyIG1hZ0ZpbHRlcnMgPSB7XG4gICAgJ25lYXJlc3QnOiBHTF9ORUFSRVNULFxuICAgICdsaW5lYXInOiBHTF9MSU5FQVJcbiAgfVxuXG4gIHZhciBtaW5GaWx0ZXJzID0gZXh0ZW5kKHtcbiAgICAnbWlwbWFwJzogR0xfTElORUFSX01JUE1BUF9MSU5FQVIsXG4gICAgJ25lYXJlc3QgbWlwbWFwIG5lYXJlc3QnOiBHTF9ORUFSRVNUX01JUE1BUF9ORUFSRVNULFxuICAgICdsaW5lYXIgbWlwbWFwIG5lYXJlc3QnOiBHTF9MSU5FQVJfTUlQTUFQX05FQVJFU1QsXG4gICAgJ25lYXJlc3QgbWlwbWFwIGxpbmVhcic6IEdMX05FQVJFU1RfTUlQTUFQX0xJTkVBUixcbiAgICAnbGluZWFyIG1pcG1hcCBsaW5lYXInOiBHTF9MSU5FQVJfTUlQTUFQX0xJTkVBUlxuICB9LCBtYWdGaWx0ZXJzKVxuXG4gIHZhciBjb2xvclNwYWNlID0ge1xuICAgICdub25lJzogMCxcbiAgICAnYnJvd3Nlcic6IEdMX0JST1dTRVJfREVGQVVMVF9XRUJHTFxuICB9XG5cbiAgdmFyIHRleHR1cmVUeXBlcyA9IHtcbiAgICAndWludDgnOiBHTF9VTlNJR05FRF9CWVRFLFxuICAgICdyZ2JhNCc6IEdMX1VOU0lHTkVEX1NIT1JUXzRfNF80XzQsXG4gICAgJ3JnYjU2NSc6IEdMX1VOU0lHTkVEX1NIT1JUXzVfNl81LFxuICAgICdyZ2I1IGExJzogR0xfVU5TSUdORURfU0hPUlRfNV81XzVfMVxuICB9XG5cbiAgdmFyIHRleHR1cmVGb3JtYXRzID0ge1xuICAgICdhbHBoYSc6IEdMX0FMUEhBLFxuICAgICdsdW1pbmFuY2UnOiBHTF9MVU1JTkFOQ0UsXG4gICAgJ2x1bWluYW5jZSBhbHBoYSc6IEdMX0xVTUlOQU5DRV9BTFBIQSxcbiAgICAncmdiJzogR0xfUkdCLFxuICAgICdyZ2JhJzogR0xfUkdCQSxcbiAgICAncmdiYTQnOiBHTF9SR0JBNCxcbiAgICAncmdiNSBhMSc6IEdMX1JHQjVfQTEsXG4gICAgJ3JnYjU2NSc6IEdMX1JHQjU2NVxuICB9XG5cbiAgdmFyIGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0cyA9IHt9XG5cbiAgaWYgKGV4dGVuc2lvbnMuZXh0X3NyZ2IpIHtcbiAgICB0ZXh0dXJlRm9ybWF0cy5zcmdiID0gR0xfU1JHQl9FWFRcbiAgICB0ZXh0dXJlRm9ybWF0cy5zcmdiYSA9IEdMX1NSR0JfQUxQSEFfRVhUXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9mbG9hdCkge1xuICAgIHRleHR1cmVUeXBlcy5mbG9hdDMyID0gdGV4dHVyZVR5cGVzLmZsb2F0ID0gR0xfRkxPQVRcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLm9lc190ZXh0dXJlX2hhbGZfZmxvYXQpIHtcbiAgICB0ZXh0dXJlVHlwZXNbJ2Zsb2F0MTYnXSA9IHRleHR1cmVUeXBlc1snaGFsZiBmbG9hdCddID0gR0xfSEFMRl9GTE9BVF9PRVNcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLndlYmdsX2RlcHRoX3RleHR1cmUpIHtcbiAgICBleHRlbmQodGV4dHVyZUZvcm1hdHMsIHtcbiAgICAgICdkZXB0aCc6IEdMX0RFUFRIX0NPTVBPTkVOVCxcbiAgICAgICdkZXB0aCBzdGVuY2lsJzogR0xfREVQVEhfU1RFTkNJTFxuICAgIH0pXG5cbiAgICBleHRlbmQodGV4dHVyZVR5cGVzLCB7XG4gICAgICAndWludDE2JzogR0xfVU5TSUdORURfU0hPUlQsXG4gICAgICAndWludDMyJzogR0xfVU5TSUdORURfSU5ULFxuICAgICAgJ2RlcHRoIHN0ZW5jaWwnOiBHTF9VTlNJR05FRF9JTlRfMjRfOF9XRUJHTFxuICAgIH0pXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9jb21wcmVzc2VkX3RleHR1cmVfczN0Yykge1xuICAgIGV4dGVuZChjb21wcmVzc2VkVGV4dHVyZUZvcm1hdHMsIHtcbiAgICAgICdyZ2IgczN0YyBkeHQxJzogR0xfQ09NUFJFU1NFRF9SR0JfUzNUQ19EWFQxX0VYVCxcbiAgICAgICdyZ2JhIHMzdGMgZHh0MSc6IEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDFfRVhULFxuICAgICAgJ3JnYmEgczN0YyBkeHQzJzogR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUM19FWFQsXG4gICAgICAncmdiYSBzM3RjIGR4dDUnOiBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQ1X0VYVFxuICAgIH0pXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9jb21wcmVzc2VkX3RleHR1cmVfYXRjKSB7XG4gICAgZXh0ZW5kKGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0cywge1xuICAgICAgJ3JnYiBhdGMnOiBHTF9DT01QUkVTU0VEX1JHQl9BVENfV0VCR0wsXG4gICAgICAncmdiYSBhdGMgZXhwbGljaXQgYWxwaGEnOiBHTF9DT01QUkVTU0VEX1JHQkFfQVRDX0VYUExJQ0lUX0FMUEhBX1dFQkdMLFxuICAgICAgJ3JnYmEgYXRjIGludGVycG9sYXRlZCBhbHBoYSc6IEdMX0NPTVBSRVNTRURfUkdCQV9BVENfSU5URVJQT0xBVEVEX0FMUEhBX1dFQkdMXG4gICAgfSlcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLndlYmdsX2NvbXByZXNzZWRfdGV4dHVyZV9wdnJ0Yykge1xuICAgIGV4dGVuZChjb21wcmVzc2VkVGV4dHVyZUZvcm1hdHMsIHtcbiAgICAgICdyZ2IgcHZydGMgNGJwcHYxJzogR0xfQ09NUFJFU1NFRF9SR0JfUFZSVENfNEJQUFYxX0lNRyxcbiAgICAgICdyZ2IgcHZydGMgMmJwcHYxJzogR0xfQ09NUFJFU1NFRF9SR0JfUFZSVENfMkJQUFYxX0lNRyxcbiAgICAgICdyZ2JhIHB2cnRjIDRicHB2MSc6IEdMX0NPTVBSRVNTRURfUkdCQV9QVlJUQ180QlBQVjFfSU1HLFxuICAgICAgJ3JnYmEgcHZydGMgMmJwcHYxJzogR0xfQ09NUFJFU1NFRF9SR0JBX1BWUlRDXzJCUFBWMV9JTUdcbiAgICB9KVxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfY29tcHJlc3NlZF90ZXh0dXJlX2V0YzEpIHtcbiAgICBjb21wcmVzc2VkVGV4dHVyZUZvcm1hdHNbJ3JnYiBldGMxJ10gPSBHTF9DT01QUkVTU0VEX1JHQl9FVEMxX1dFQkdMXG4gIH1cblxuICAvLyBDb3B5IG92ZXIgYWxsIHRleHR1cmUgZm9ybWF0c1xuICB2YXIgc3VwcG9ydGVkQ29tcHJlc3NlZEZvcm1hdHMgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChcbiAgICBnbC5nZXRQYXJhbWV0ZXIoR0xfQ09NUFJFU1NFRF9URVhUVVJFX0ZPUk1BVFMpKVxuICBPYmplY3Qua2V5cyhjb21wcmVzc2VkVGV4dHVyZUZvcm1hdHMpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICB2YXIgZm9ybWF0ID0gY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzW25hbWVdXG4gICAgaWYgKHN1cHBvcnRlZENvbXByZXNzZWRGb3JtYXRzLmluZGV4T2YoZm9ybWF0KSA+PSAwKSB7XG4gICAgICB0ZXh0dXJlRm9ybWF0c1tuYW1lXSA9IGZvcm1hdFxuICAgIH1cbiAgfSlcblxuICB2YXIgc3VwcG9ydGVkRm9ybWF0cyA9IE9iamVjdC5rZXlzKHRleHR1cmVGb3JtYXRzKVxuICBsaW1pdHMudGV4dHVyZUZvcm1hdHMgPSBzdXBwb3J0ZWRGb3JtYXRzXG5cbiAgLy8gYXNzb2NpYXRlIHdpdGggZXZlcnkgZm9ybWF0IHN0cmluZyBpdHNcbiAgLy8gY29ycmVzcG9uZGluZyBHTC12YWx1ZS5cbiAgdmFyIHRleHR1cmVGb3JtYXRzSW52ZXJ0ID0gW11cbiAgT2JqZWN0LmtleXModGV4dHVyZUZvcm1hdHMpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgIHZhciB2YWwgPSB0ZXh0dXJlRm9ybWF0c1trZXldXG4gICAgdGV4dHVyZUZvcm1hdHNJbnZlcnRbdmFsXSA9IGtleVxuICB9KVxuXG4gIC8vIGFzc29jaWF0ZSB3aXRoIGV2ZXJ5IHR5cGUgc3RyaW5nIGl0c1xuICAvLyBjb3JyZXNwb25kaW5nIEdMLXZhbHVlLlxuICB2YXIgdGV4dHVyZVR5cGVzSW52ZXJ0ID0gW11cbiAgT2JqZWN0LmtleXModGV4dHVyZVR5cGVzKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICB2YXIgdmFsID0gdGV4dHVyZVR5cGVzW2tleV1cbiAgICB0ZXh0dXJlVHlwZXNJbnZlcnRbdmFsXSA9IGtleVxuICB9KVxuXG4gIHZhciBtYWdGaWx0ZXJzSW52ZXJ0ID0gW11cbiAgT2JqZWN0LmtleXMobWFnRmlsdGVycykuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgdmFyIHZhbCA9IG1hZ0ZpbHRlcnNba2V5XVxuICAgIG1hZ0ZpbHRlcnNJbnZlcnRbdmFsXSA9IGtleVxuICB9KVxuXG4gIHZhciBtaW5GaWx0ZXJzSW52ZXJ0ID0gW11cbiAgT2JqZWN0LmtleXMobWluRmlsdGVycykuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgdmFyIHZhbCA9IG1pbkZpbHRlcnNba2V5XVxuICAgIG1pbkZpbHRlcnNJbnZlcnRbdmFsXSA9IGtleVxuICB9KVxuXG4gIHZhciB3cmFwTW9kZXNJbnZlcnQgPSBbXVxuICBPYmplY3Qua2V5cyh3cmFwTW9kZXMpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgIHZhciB2YWwgPSB3cmFwTW9kZXNba2V5XVxuICAgIHdyYXBNb2Rlc0ludmVydFt2YWxdID0ga2V5XG4gIH0pXG5cbiAgLy8gY29sb3JGb3JtYXRzW10gZ2l2ZXMgdGhlIGZvcm1hdCAoY2hhbm5lbHMpIGFzc29jaWF0ZWQgdG8gYW5cbiAgLy8gaW50ZXJuYWxmb3JtYXRcbiAgdmFyIGNvbG9yRm9ybWF0cyA9IHN1cHBvcnRlZEZvcm1hdHMucmVkdWNlKGZ1bmN0aW9uIChjb2xvciwga2V5KSB7XG4gICAgdmFyIGdsZW51bSA9IHRleHR1cmVGb3JtYXRzW2tleV1cbiAgICBpZiAoZ2xlbnVtID09PSBHTF9MVU1JTkFOQ0UgfHxcbiAgICAgICAgZ2xlbnVtID09PSBHTF9BTFBIQSB8fFxuICAgICAgICBnbGVudW0gPT09IEdMX0xVTUlOQU5DRSB8fFxuICAgICAgICBnbGVudW0gPT09IEdMX0xVTUlOQU5DRV9BTFBIQSB8fFxuICAgICAgICBnbGVudW0gPT09IEdMX0RFUFRIX0NPTVBPTkVOVCB8fFxuICAgICAgICBnbGVudW0gPT09IEdMX0RFUFRIX1NURU5DSUwpIHtcbiAgICAgIGNvbG9yW2dsZW51bV0gPSBnbGVudW1cbiAgICB9IGVsc2UgaWYgKGdsZW51bSA9PT0gR0xfUkdCNV9BMSB8fCBrZXkuaW5kZXhPZigncmdiYScpID49IDApIHtcbiAgICAgIGNvbG9yW2dsZW51bV0gPSBHTF9SR0JBXG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbG9yW2dsZW51bV0gPSBHTF9SR0JcbiAgICB9XG4gICAgcmV0dXJuIGNvbG9yXG4gIH0sIHt9KVxuXG4gIGZ1bmN0aW9uIFRleEZsYWdzICgpIHtcbiAgICAvLyBmb3JtYXQgaW5mb1xuICAgIHRoaXMuaW50ZXJuYWxmb3JtYXQgPSBHTF9SR0JBXG4gICAgdGhpcy5mb3JtYXQgPSBHTF9SR0JBXG4gICAgdGhpcy50eXBlID0gR0xfVU5TSUdORURfQllURVxuICAgIHRoaXMuY29tcHJlc3NlZCA9IGZhbHNlXG5cbiAgICAvLyBwaXhlbCBzdG9yYWdlXG4gICAgdGhpcy5wcmVtdWx0aXBseUFscGhhID0gZmFsc2VcbiAgICB0aGlzLmZsaXBZID0gZmFsc2VcbiAgICB0aGlzLnVucGFja0FsaWdubWVudCA9IDFcbiAgICB0aGlzLmNvbG9yU3BhY2UgPSAwXG5cbiAgICAvLyBzaGFwZSBpbmZvXG4gICAgdGhpcy53aWR0aCA9IDBcbiAgICB0aGlzLmhlaWdodCA9IDBcbiAgICB0aGlzLmNoYW5uZWxzID0gMFxuICB9XG5cbiAgZnVuY3Rpb24gY29weUZsYWdzIChyZXN1bHQsIG90aGVyKSB7XG4gICAgcmVzdWx0LmludGVybmFsZm9ybWF0ID0gb3RoZXIuaW50ZXJuYWxmb3JtYXRcbiAgICByZXN1bHQuZm9ybWF0ID0gb3RoZXIuZm9ybWF0XG4gICAgcmVzdWx0LnR5cGUgPSBvdGhlci50eXBlXG4gICAgcmVzdWx0LmNvbXByZXNzZWQgPSBvdGhlci5jb21wcmVzc2VkXG5cbiAgICByZXN1bHQucHJlbXVsdGlwbHlBbHBoYSA9IG90aGVyLnByZW11bHRpcGx5QWxwaGFcbiAgICByZXN1bHQuZmxpcFkgPSBvdGhlci5mbGlwWVxuICAgIHJlc3VsdC51bnBhY2tBbGlnbm1lbnQgPSBvdGhlci51bnBhY2tBbGlnbm1lbnRcbiAgICByZXN1bHQuY29sb3JTcGFjZSA9IG90aGVyLmNvbG9yU3BhY2VcblxuICAgIHJlc3VsdC53aWR0aCA9IG90aGVyLndpZHRoXG4gICAgcmVzdWx0LmhlaWdodCA9IG90aGVyLmhlaWdodFxuICAgIHJlc3VsdC5jaGFubmVscyA9IG90aGVyLmNoYW5uZWxzXG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZUZsYWdzIChmbGFncywgb3B0aW9ucykge1xuICAgIGlmICh0eXBlb2Ygb3B0aW9ucyAhPT0gJ29iamVjdCcgfHwgIW9wdGlvbnMpIHtcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIGlmICgncHJlbXVsdGlwbHlBbHBoYScgaW4gb3B0aW9ucykge1xuICAgICAgXG4gICAgICBmbGFncy5wcmVtdWx0aXBseUFscGhhID0gb3B0aW9ucy5wcmVtdWx0aXBseUFscGhhXG4gICAgfVxuXG4gICAgaWYgKCdmbGlwWScgaW4gb3B0aW9ucykge1xuICAgICAgXG4gICAgICBmbGFncy5mbGlwWSA9IG9wdGlvbnMuZmxpcFlcbiAgICB9XG5cbiAgICBpZiAoJ2FsaWdubWVudCcgaW4gb3B0aW9ucykge1xuICAgICAgXG4gICAgICBmbGFncy51bnBhY2tBbGlnbm1lbnQgPSBvcHRpb25zLmFsaWdubWVudFxuICAgIH1cblxuICAgIGlmICgnY29sb3JTcGFjZScgaW4gb3B0aW9ucykge1xuICAgICAgXG4gICAgICBmbGFncy5jb2xvclNwYWNlID0gY29sb3JTcGFjZVtvcHRpb25zLmNvbG9yU3BhY2VdXG4gICAgfVxuXG4gICAgaWYgKCd0eXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICB2YXIgdHlwZSA9IG9wdGlvbnMudHlwZVxuICAgICAgXG4gICAgICBcbiAgICAgIFxuICAgICAgXG4gICAgICBmbGFncy50eXBlID0gdGV4dHVyZVR5cGVzW3R5cGVdXG4gICAgfVxuXG4gICAgdmFyIHcgPSBmbGFncy53aWR0aFxuICAgIHZhciBoID0gZmxhZ3MuaGVpZ2h0XG4gICAgdmFyIGMgPSBmbGFncy5jaGFubmVsc1xuICAgIHZhciBoYXNDaGFubmVscyA9IGZhbHNlXG4gICAgaWYgKCdzaGFwZScgaW4gb3B0aW9ucykge1xuICAgICAgXG4gICAgICB3ID0gb3B0aW9ucy5zaGFwZVswXVxuICAgICAgaCA9IG9wdGlvbnMuc2hhcGVbMV1cbiAgICAgIGlmIChvcHRpb25zLnNoYXBlLmxlbmd0aCA9PT0gMykge1xuICAgICAgICBjID0gb3B0aW9ucy5zaGFwZVsyXVxuICAgICAgICBcbiAgICAgICAgaGFzQ2hhbm5lbHMgPSB0cnVlXG4gICAgICB9XG4gICAgICBcbiAgICAgIFxuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoJ3JhZGl1cycgaW4gb3B0aW9ucykge1xuICAgICAgICB3ID0gaCA9IG9wdGlvbnMucmFkaXVzXG4gICAgICAgIFxuICAgICAgfVxuICAgICAgaWYgKCd3aWR0aCcgaW4gb3B0aW9ucykge1xuICAgICAgICB3ID0gb3B0aW9ucy53aWR0aFxuICAgICAgICBcbiAgICAgIH1cbiAgICAgIGlmICgnaGVpZ2h0JyBpbiBvcHRpb25zKSB7XG4gICAgICAgIGggPSBvcHRpb25zLmhlaWdodFxuICAgICAgICBcbiAgICAgIH1cbiAgICAgIGlmICgnY2hhbm5lbHMnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgYyA9IG9wdGlvbnMuY2hhbm5lbHNcbiAgICAgICAgXG4gICAgICAgIGhhc0NoYW5uZWxzID0gdHJ1ZVxuICAgICAgfVxuICAgIH1cbiAgICBmbGFncy53aWR0aCA9IHcgfCAwXG4gICAgZmxhZ3MuaGVpZ2h0ID0gaCB8IDBcbiAgICBmbGFncy5jaGFubmVscyA9IGMgfCAwXG5cbiAgICB2YXIgaGFzRm9ybWF0ID0gZmFsc2VcbiAgICBpZiAoJ2Zvcm1hdCcgaW4gb3B0aW9ucykge1xuICAgICAgdmFyIGZvcm1hdFN0ciA9IG9wdGlvbnMuZm9ybWF0XG4gICAgICBcbiAgICAgIFxuICAgICAgdmFyIGludGVybmFsZm9ybWF0ID0gZmxhZ3MuaW50ZXJuYWxmb3JtYXQgPSB0ZXh0dXJlRm9ybWF0c1tmb3JtYXRTdHJdXG4gICAgICBmbGFncy5mb3JtYXQgPSBjb2xvckZvcm1hdHNbaW50ZXJuYWxmb3JtYXRdXG4gICAgICBpZiAoZm9ybWF0U3RyIGluIHRleHR1cmVUeXBlcykge1xuICAgICAgICBpZiAoISgndHlwZScgaW4gb3B0aW9ucykpIHtcbiAgICAgICAgICBmbGFncy50eXBlID0gdGV4dHVyZVR5cGVzW2Zvcm1hdFN0cl1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGZvcm1hdFN0ciBpbiBjb21wcmVzc2VkVGV4dHVyZUZvcm1hdHMpIHtcbiAgICAgICAgZmxhZ3MuY29tcHJlc3NlZCA9IHRydWVcbiAgICAgIH1cbiAgICAgIGhhc0Zvcm1hdCA9IHRydWVcbiAgICB9XG5cbiAgICAvLyBSZWNvbmNpbGUgY2hhbm5lbHMgYW5kIGZvcm1hdFxuICAgIGlmICghaGFzQ2hhbm5lbHMgJiYgaGFzRm9ybWF0KSB7XG4gICAgICBmbGFncy5jaGFubmVscyA9IEZPUk1BVF9DSEFOTkVMU1tmbGFncy5mb3JtYXRdXG4gICAgfSBlbHNlIGlmIChoYXNDaGFubmVscyAmJiAhaGFzRm9ybWF0KSB7XG4gICAgICBpZiAoZmxhZ3MuY2hhbm5lbHMgIT09IENIQU5ORUxTX0ZPUk1BVFtmbGFncy5mb3JtYXRdKSB7XG4gICAgICAgIGZsYWdzLmZvcm1hdCA9IGZsYWdzLmludGVybmFsZm9ybWF0ID0gQ0hBTk5FTFNfRk9STUFUW2ZsYWdzLmNoYW5uZWxzXVxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoaGFzRm9ybWF0ICYmIGhhc0NoYW5uZWxzKSB7XG4gICAgICBcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBzZXRGbGFncyAoZmxhZ3MpIHtcbiAgICBnbC5waXhlbFN0b3JlaShHTF9VTlBBQ0tfRkxJUF9ZX1dFQkdMLCBmbGFncy5mbGlwWSlcbiAgICBnbC5waXhlbFN0b3JlaShHTF9VTlBBQ0tfUFJFTVVMVElQTFlfQUxQSEFfV0VCR0wsIGZsYWdzLnByZW11bHRpcGx5QWxwaGEpXG4gICAgZ2wucGl4ZWxTdG9yZWkoR0xfVU5QQUNLX0NPTE9SU1BBQ0VfQ09OVkVSU0lPTl9XRUJHTCwgZmxhZ3MuY29sb3JTcGFjZSlcbiAgICBnbC5waXhlbFN0b3JlaShHTF9VTlBBQ0tfQUxJR05NRU5ULCBmbGFncy51bnBhY2tBbGlnbm1lbnQpXG4gIH1cblxuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vIFRleCBpbWFnZSBkYXRhXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgZnVuY3Rpb24gVGV4SW1hZ2UgKCkge1xuICAgIFRleEZsYWdzLmNhbGwodGhpcylcblxuICAgIHRoaXMueE9mZnNldCA9IDBcbiAgICB0aGlzLnlPZmZzZXQgPSAwXG5cbiAgICAvLyBkYXRhXG4gICAgdGhpcy5kYXRhID0gbnVsbFxuICAgIHRoaXMubmVlZHNGcmVlID0gZmFsc2VcblxuICAgIC8vIGh0bWwgZWxlbWVudFxuICAgIHRoaXMuZWxlbWVudCA9IG51bGxcblxuICAgIC8vIGNvcHlUZXhJbWFnZSBpbmZvXG4gICAgdGhpcy5uZWVkc0NvcHkgPSBmYWxzZVxuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VJbWFnZSAoaW1hZ2UsIG9wdGlvbnMpIHtcbiAgICB2YXIgZGF0YSA9IG51bGxcbiAgICBpZiAoaXNQaXhlbERhdGEob3B0aW9ucykpIHtcbiAgICAgIGRhdGEgPSBvcHRpb25zXG4gICAgfSBlbHNlIGlmIChvcHRpb25zKSB7XG4gICAgICBcbiAgICAgIHBhcnNlRmxhZ3MoaW1hZ2UsIG9wdGlvbnMpXG4gICAgICBpZiAoJ3gnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgaW1hZ2UueE9mZnNldCA9IG9wdGlvbnMueCB8IDBcbiAgICAgIH1cbiAgICAgIGlmICgneScgaW4gb3B0aW9ucykge1xuICAgICAgICBpbWFnZS55T2Zmc2V0ID0gb3B0aW9ucy55IHwgMFxuICAgICAgfVxuICAgICAgaWYgKGlzUGl4ZWxEYXRhKG9wdGlvbnMuZGF0YSkpIHtcbiAgICAgICAgZGF0YSA9IG9wdGlvbnMuZGF0YVxuICAgICAgfVxuICAgIH1cblxuICAgIFxuXG4gICAgaWYgKG9wdGlvbnMuY29weSkge1xuICAgICAgXG4gICAgICB2YXIgdmlld1cgPSBjb250ZXh0U3RhdGUudmlld3BvcnRXaWR0aFxuICAgICAgdmFyIHZpZXdIID0gY29udGV4dFN0YXRlLnZpZXdwb3J0SGVpZ2h0XG4gICAgICBpbWFnZS53aWR0aCA9IGltYWdlLndpZHRoIHx8ICh2aWV3VyAtIGltYWdlLnhPZmZzZXQpXG4gICAgICBpbWFnZS5oZWlnaHQgPSBpbWFnZS5oZWlnaHQgfHwgKHZpZXdIIC0gaW1hZ2UueU9mZnNldClcbiAgICAgIGltYWdlLm5lZWRzQ29weSA9IHRydWVcbiAgICAgIFxuICAgIH0gZWxzZSBpZiAoIWRhdGEpIHtcbiAgICAgIGltYWdlLndpZHRoID0gaW1hZ2Uud2lkdGggfHwgMVxuICAgICAgaW1hZ2UuaGVpZ2h0ID0gaW1hZ2UuaGVpZ2h0IHx8IDFcbiAgICAgIGltYWdlLmNoYW5uZWxzID0gaW1hZ2UuY2hhbm5lbHMgfHwgNFxuICAgIH0gZWxzZSBpZiAoaXNUeXBlZEFycmF5KGRhdGEpKSB7XG4gICAgICBpbWFnZS5jaGFubmVscyA9IGltYWdlLmNoYW5uZWxzIHx8IDRcbiAgICAgIGltYWdlLmRhdGEgPSBkYXRhXG4gICAgICBpZiAoISgndHlwZScgaW4gb3B0aW9ucykgJiYgaW1hZ2UudHlwZSA9PT0gR0xfVU5TSUdORURfQllURSkge1xuICAgICAgICBpbWFnZS50eXBlID0gdHlwZWRBcnJheUNvZGUoZGF0YSlcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGlzTnVtZXJpY0FycmF5KGRhdGEpKSB7XG4gICAgICBpbWFnZS5jaGFubmVscyA9IGltYWdlLmNoYW5uZWxzIHx8IDRcbiAgICAgIGNvbnZlcnREYXRhKGltYWdlLCBkYXRhKVxuICAgICAgaW1hZ2UuYWxpZ25tZW50ID0gMVxuICAgICAgaW1hZ2UubmVlZHNGcmVlID0gdHJ1ZVxuICAgIH0gZWxzZSBpZiAoaXNOREFycmF5TGlrZShkYXRhKSkge1xuICAgICAgdmFyIGFycmF5ID0gZGF0YS5kYXRhXG4gICAgICBpZiAoIUFycmF5LmlzQXJyYXkoYXJyYXkpICYmIGltYWdlLnR5cGUgPT09IEdMX1VOU0lHTkVEX0JZVEUpIHtcbiAgICAgICAgaW1hZ2UudHlwZSA9IHR5cGVkQXJyYXlDb2RlKGFycmF5KVxuICAgICAgfVxuICAgICAgdmFyIHNoYXBlID0gZGF0YS5zaGFwZVxuICAgICAgdmFyIHN0cmlkZSA9IGRhdGEuc3RyaWRlXG4gICAgICB2YXIgc2hhcGVYLCBzaGFwZVksIHNoYXBlQywgc3RyaWRlWCwgc3RyaWRlWSwgc3RyaWRlQ1xuICAgICAgaWYgKHNoYXBlLmxlbmd0aCA9PT0gMykge1xuICAgICAgICBzaGFwZUMgPSBzaGFwZVsyXVxuICAgICAgICBzdHJpZGVDID0gc3RyaWRlWzJdXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBcbiAgICAgICAgc2hhcGVDID0gMVxuICAgICAgICBzdHJpZGVDID0gMVxuICAgICAgfVxuICAgICAgc2hhcGVYID0gc2hhcGVbMF1cbiAgICAgIHNoYXBlWSA9IHNoYXBlWzFdXG4gICAgICBzdHJpZGVYID0gc3RyaWRlWzBdXG4gICAgICBzdHJpZGVZID0gc3RyaWRlWzFdXG4gICAgICBpbWFnZS5hbGlnbm1lbnQgPSAxXG4gICAgICBpbWFnZS53aWR0aCA9IHNoYXBlWFxuICAgICAgaW1hZ2UuaGVpZ2h0ID0gc2hhcGVZXG4gICAgICBpbWFnZS5jaGFubmVscyA9IHNoYXBlQ1xuICAgICAgaW1hZ2UuZm9ybWF0ID0gaW1hZ2UuaW50ZXJuYWxmb3JtYXQgPSBDSEFOTkVMU19GT1JNQVRbc2hhcGVDXVxuICAgICAgaW1hZ2UubmVlZHNGcmVlID0gdHJ1ZVxuICAgICAgdHJhbnNwb3NlRGF0YShpbWFnZSwgYXJyYXksIHN0cmlkZVgsIHN0cmlkZVksIHN0cmlkZUMsIGRhdGEub2Zmc2V0KVxuICAgIH0gZWxzZSBpZiAoaXNDYW52YXNFbGVtZW50KGRhdGEpIHx8IGlzQ29udGV4dDJEKGRhdGEpKSB7XG4gICAgICBpZiAoaXNDYW52YXNFbGVtZW50KGRhdGEpKSB7XG4gICAgICAgIGltYWdlLmVsZW1lbnQgPSBkYXRhXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpbWFnZS5lbGVtZW50ID0gZGF0YS5jYW52YXNcbiAgICAgIH1cbiAgICAgIGltYWdlLndpZHRoID0gaW1hZ2UuZWxlbWVudC53aWR0aFxuICAgICAgaW1hZ2UuaGVpZ2h0ID0gaW1hZ2UuZWxlbWVudC5oZWlnaHRcbiAgICAgIGltYWdlLmNoYW5uZWxzID0gNFxuICAgIH0gZWxzZSBpZiAoaXNJbWFnZUVsZW1lbnQoZGF0YSkpIHtcbiAgICAgIGltYWdlLmVsZW1lbnQgPSBkYXRhXG4gICAgICBpbWFnZS53aWR0aCA9IGRhdGEubmF0dXJhbFdpZHRoXG4gICAgICBpbWFnZS5oZWlnaHQgPSBkYXRhLm5hdHVyYWxIZWlnaHRcbiAgICAgIGltYWdlLmNoYW5uZWxzID0gNFxuICAgIH0gZWxzZSBpZiAoaXNWaWRlb0VsZW1lbnQoZGF0YSkpIHtcbiAgICAgIGltYWdlLmVsZW1lbnQgPSBkYXRhXG4gICAgICBpbWFnZS53aWR0aCA9IGRhdGEudmlkZW9XaWR0aFxuICAgICAgaW1hZ2UuaGVpZ2h0ID0gZGF0YS52aWRlb0hlaWdodFxuICAgICAgaW1hZ2UuY2hhbm5lbHMgPSA0XG4gICAgfSBlbHNlIGlmIChpc1JlY3RBcnJheShkYXRhKSkge1xuICAgICAgdmFyIHcgPSBpbWFnZS53aWR0aCB8fCBkYXRhWzBdLmxlbmd0aFxuICAgICAgdmFyIGggPSBpbWFnZS5oZWlnaHQgfHwgZGF0YS5sZW5ndGhcbiAgICAgIHZhciBjID0gaW1hZ2UuY2hhbm5lbHNcbiAgICAgIGlmIChpc0FycmF5TGlrZShkYXRhWzBdWzBdKSkge1xuICAgICAgICBjID0gYyB8fCBkYXRhWzBdWzBdLmxlbmd0aFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYyA9IGMgfHwgMVxuICAgICAgfVxuICAgICAgdmFyIGFycmF5U2hhcGUgPSBmbGF0dGVuVXRpbHMuc2hhcGUoZGF0YSlcbiAgICAgIHZhciBuID0gMVxuICAgICAgZm9yICh2YXIgZGQgPSAwOyBkZCA8IGFycmF5U2hhcGUubGVuZ3RoOyArK2RkKSB7XG4gICAgICAgIG4gKj0gYXJyYXlTaGFwZVtkZF1cbiAgICAgIH1cbiAgICAgIHZhciBhbGxvY0RhdGEgPSBwcmVDb252ZXJ0KGltYWdlLCBuKVxuICAgICAgZmxhdHRlblV0aWxzLmZsYXR0ZW4oZGF0YSwgYXJyYXlTaGFwZSwgJycsIGFsbG9jRGF0YSlcbiAgICAgIHBvc3RDb252ZXJ0KGltYWdlLCBhbGxvY0RhdGEpXG4gICAgICBpbWFnZS5hbGlnbm1lbnQgPSAxXG4gICAgICBpbWFnZS53aWR0aCA9IHdcbiAgICAgIGltYWdlLmhlaWdodCA9IGhcbiAgICAgIGltYWdlLmNoYW5uZWxzID0gY1xuICAgICAgaW1hZ2UuZm9ybWF0ID0gaW1hZ2UuaW50ZXJuYWxmb3JtYXQgPSBDSEFOTkVMU19GT1JNQVRbY11cbiAgICAgIGltYWdlLm5lZWRzRnJlZSA9IHRydWVcbiAgICB9XG5cbiAgICBpZiAoaW1hZ2UudHlwZSA9PT0gR0xfRkxPQVQpIHtcbiAgICAgIFxuICAgIH0gZWxzZSBpZiAoaW1hZ2UudHlwZSA9PT0gR0xfSEFMRl9GTE9BVF9PRVMpIHtcbiAgICAgIFxuICAgIH1cblxuICAgIC8vIGRvIGNvbXByZXNzZWQgdGV4dHVyZSAgdmFsaWRhdGlvbiBoZXJlLlxuICB9XG5cbiAgZnVuY3Rpb24gc2V0SW1hZ2UgKGluZm8sIHRhcmdldCwgbWlwbGV2ZWwpIHtcbiAgICB2YXIgZWxlbWVudCA9IGluZm8uZWxlbWVudFxuICAgIHZhciBkYXRhID0gaW5mby5kYXRhXG4gICAgdmFyIGludGVybmFsZm9ybWF0ID0gaW5mby5pbnRlcm5hbGZvcm1hdFxuICAgIHZhciBmb3JtYXQgPSBpbmZvLmZvcm1hdFxuICAgIHZhciB0eXBlID0gaW5mby50eXBlXG4gICAgdmFyIHdpZHRoID0gaW5mby53aWR0aFxuICAgIHZhciBoZWlnaHQgPSBpbmZvLmhlaWdodFxuXG4gICAgc2V0RmxhZ3MoaW5mbylcblxuICAgIGlmIChlbGVtZW50KSB7XG4gICAgICBnbC50ZXhJbWFnZTJEKHRhcmdldCwgbWlwbGV2ZWwsIGZvcm1hdCwgZm9ybWF0LCB0eXBlLCBlbGVtZW50KVxuICAgIH0gZWxzZSBpZiAoaW5mby5jb21wcmVzc2VkKSB7XG4gICAgICBnbC5jb21wcmVzc2VkVGV4SW1hZ2UyRCh0YXJnZXQsIG1pcGxldmVsLCBpbnRlcm5hbGZvcm1hdCwgd2lkdGgsIGhlaWdodCwgMCwgZGF0YSlcbiAgICB9IGVsc2UgaWYgKGluZm8ubmVlZHNDb3B5KSB7XG4gICAgICByZWdsUG9sbCgpXG4gICAgICBnbC5jb3B5VGV4SW1hZ2UyRChcbiAgICAgICAgdGFyZ2V0LCBtaXBsZXZlbCwgZm9ybWF0LCBpbmZvLnhPZmZzZXQsIGluZm8ueU9mZnNldCwgd2lkdGgsIGhlaWdodCwgMClcbiAgICB9IGVsc2Uge1xuICAgICAgZ2wudGV4SW1hZ2UyRChcbiAgICAgICAgdGFyZ2V0LCBtaXBsZXZlbCwgZm9ybWF0LCB3aWR0aCwgaGVpZ2h0LCAwLCBmb3JtYXQsIHR5cGUsIGRhdGEpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gc2V0U3ViSW1hZ2UgKGluZm8sIHRhcmdldCwgeCwgeSwgbWlwbGV2ZWwpIHtcbiAgICB2YXIgZWxlbWVudCA9IGluZm8uZWxlbWVudFxuICAgIHZhciBkYXRhID0gaW5mby5kYXRhXG4gICAgdmFyIGludGVybmFsZm9ybWF0ID0gaW5mby5pbnRlcm5hbGZvcm1hdFxuICAgIHZhciBmb3JtYXQgPSBpbmZvLmZvcm1hdFxuICAgIHZhciB0eXBlID0gaW5mby50eXBlXG4gICAgdmFyIHdpZHRoID0gaW5mby53aWR0aFxuICAgIHZhciBoZWlnaHQgPSBpbmZvLmhlaWdodFxuXG4gICAgc2V0RmxhZ3MoaW5mbylcblxuICAgIGlmIChlbGVtZW50KSB7XG4gICAgICBnbC50ZXhTdWJJbWFnZTJEKFxuICAgICAgICB0YXJnZXQsIG1pcGxldmVsLCB4LCB5LCBmb3JtYXQsIHR5cGUsIGVsZW1lbnQpXG4gICAgfSBlbHNlIGlmIChpbmZvLmNvbXByZXNzZWQpIHtcbiAgICAgIGdsLmNvbXByZXNzZWRUZXhTdWJJbWFnZTJEKFxuICAgICAgICB0YXJnZXQsIG1pcGxldmVsLCB4LCB5LCBpbnRlcm5hbGZvcm1hdCwgd2lkdGgsIGhlaWdodCwgZGF0YSlcbiAgICB9IGVsc2UgaWYgKGluZm8ubmVlZHNDb3B5KSB7XG4gICAgICByZWdsUG9sbCgpXG4gICAgICBnbC5jb3B5VGV4U3ViSW1hZ2UyRChcbiAgICAgICAgdGFyZ2V0LCBtaXBsZXZlbCwgeCwgeSwgaW5mby54T2Zmc2V0LCBpbmZvLnlPZmZzZXQsIHdpZHRoLCBoZWlnaHQpXG4gICAgfSBlbHNlIHtcbiAgICAgIGdsLnRleFN1YkltYWdlMkQoXG4gICAgICAgIHRhcmdldCwgbWlwbGV2ZWwsIHgsIHksIHdpZHRoLCBoZWlnaHQsIGZvcm1hdCwgdHlwZSwgZGF0YSlcbiAgICB9XG4gIH1cblxuICAvLyB0ZXhJbWFnZSBwb29sXG4gIHZhciBpbWFnZVBvb2wgPSBbXVxuXG4gIGZ1bmN0aW9uIGFsbG9jSW1hZ2UgKCkge1xuICAgIHJldHVybiBpbWFnZVBvb2wucG9wKCkgfHwgbmV3IFRleEltYWdlKClcbiAgfVxuXG4gIGZ1bmN0aW9uIGZyZWVJbWFnZSAoaW1hZ2UpIHtcbiAgICBpZiAoaW1hZ2UubmVlZHNGcmVlKSB7XG4gICAgICBwb29sLmZyZWVUeXBlKGltYWdlLmRhdGEpXG4gICAgfVxuICAgIFRleEltYWdlLmNhbGwoaW1hZ2UpXG4gICAgaW1hZ2VQb29sLnB1c2goaW1hZ2UpXG4gIH1cblxuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vIE1pcCBtYXBcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICBmdW5jdGlvbiBNaXBNYXAgKCkge1xuICAgIFRleEZsYWdzLmNhbGwodGhpcylcblxuICAgIHRoaXMuZ2VuTWlwbWFwcyA9IGZhbHNlXG4gICAgdGhpcy5taXBtYXBIaW50ID0gR0xfRE9OVF9DQVJFXG4gICAgdGhpcy5taXBtYXNrID0gMFxuICAgIHRoaXMuaW1hZ2VzID0gQXJyYXkoMTYpXG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZU1pcE1hcEZyb21TaGFwZSAobWlwbWFwLCB3aWR0aCwgaGVpZ2h0KSB7XG4gICAgdmFyIGltZyA9IG1pcG1hcC5pbWFnZXNbMF0gPSBhbGxvY0ltYWdlKClcbiAgICBtaXBtYXAubWlwbWFzayA9IDFcbiAgICBpbWcud2lkdGggPSBtaXBtYXAud2lkdGggPSB3aWR0aFxuICAgIGltZy5oZWlnaHQgPSBtaXBtYXAuaGVpZ2h0ID0gaGVpZ2h0XG4gICAgaW1nLmNoYW5uZWxzID0gbWlwbWFwLmNoYW5uZWxzID0gNFxuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VNaXBNYXBGcm9tT2JqZWN0IChtaXBtYXAsIG9wdGlvbnMpIHtcbiAgICB2YXIgaW1nRGF0YSA9IG51bGxcbiAgICBpZiAoaXNQaXhlbERhdGEob3B0aW9ucykpIHtcbiAgICAgIGltZ0RhdGEgPSBtaXBtYXAuaW1hZ2VzWzBdID0gYWxsb2NJbWFnZSgpXG4gICAgICBjb3B5RmxhZ3MoaW1nRGF0YSwgbWlwbWFwKVxuICAgICAgcGFyc2VJbWFnZShpbWdEYXRhLCBvcHRpb25zKVxuICAgICAgbWlwbWFwLm1pcG1hc2sgPSAxXG4gICAgfSBlbHNlIHtcbiAgICAgIHBhcnNlRmxhZ3MobWlwbWFwLCBvcHRpb25zKVxuICAgICAgaWYgKEFycmF5LmlzQXJyYXkob3B0aW9ucy5taXBtYXApKSB7XG4gICAgICAgIHZhciBtaXBEYXRhID0gb3B0aW9ucy5taXBtYXBcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBtaXBEYXRhLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgaW1nRGF0YSA9IG1pcG1hcC5pbWFnZXNbaV0gPSBhbGxvY0ltYWdlKClcbiAgICAgICAgICBjb3B5RmxhZ3MoaW1nRGF0YSwgbWlwbWFwKVxuICAgICAgICAgIGltZ0RhdGEud2lkdGggPj49IGlcbiAgICAgICAgICBpbWdEYXRhLmhlaWdodCA+Pj0gaVxuICAgICAgICAgIHBhcnNlSW1hZ2UoaW1nRGF0YSwgbWlwRGF0YVtpXSlcbiAgICAgICAgICBtaXBtYXAubWlwbWFzayB8PSAoMSA8PCBpKVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpbWdEYXRhID0gbWlwbWFwLmltYWdlc1swXSA9IGFsbG9jSW1hZ2UoKVxuICAgICAgICBjb3B5RmxhZ3MoaW1nRGF0YSwgbWlwbWFwKVxuICAgICAgICBwYXJzZUltYWdlKGltZ0RhdGEsIG9wdGlvbnMpXG4gICAgICAgIG1pcG1hcC5taXBtYXNrID0gMVxuICAgICAgfVxuICAgIH1cbiAgICBjb3B5RmxhZ3MobWlwbWFwLCBtaXBtYXAuaW1hZ2VzWzBdKVxuXG4gICAgLy8gRm9yIHRleHR1cmVzIG9mIHRoZSBjb21wcmVzc2VkIGZvcm1hdCBXRUJHTF9jb21wcmVzc2VkX3RleHR1cmVfczN0Y1xuICAgIC8vIHdlIG11c3QgaGF2ZSB0aGF0XG4gICAgLy9cbiAgICAvLyBcIldoZW4gbGV2ZWwgZXF1YWxzIHplcm8gd2lkdGggYW5kIGhlaWdodCBtdXN0IGJlIGEgbXVsdGlwbGUgb2YgNC5cbiAgICAvLyBXaGVuIGxldmVsIGlzIGdyZWF0ZXIgdGhhbiAwIHdpZHRoIGFuZCBoZWlnaHQgbXVzdCBiZSAwLCAxLCAyIG9yIGEgbXVsdGlwbGUgb2YgNC4gXCJcbiAgICAvL1xuICAgIC8vIGJ1dCB3ZSBkbyBub3QgeWV0IHN1cHBvcnQgaGF2aW5nIG11bHRpcGxlIG1pcG1hcCBsZXZlbHMgZm9yIGNvbXByZXNzZWQgdGV4dHVyZXMsXG4gICAgLy8gc28gd2Ugb25seSB0ZXN0IGZvciBsZXZlbCB6ZXJvLlxuXG4gICAgaWYgKG1pcG1hcC5jb21wcmVzc2VkICYmXG4gICAgICAgIChtaXBtYXAuaW50ZXJuYWxmb3JtYXQgPT09IEdMX0NPTVBSRVNTRURfUkdCX1MzVENfRFhUMV9FWFQpIHx8XG4gICAgICAgIChtaXBtYXAuaW50ZXJuYWxmb3JtYXQgPT09IEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDFfRVhUKSB8fFxuICAgICAgICAobWlwbWFwLmludGVybmFsZm9ybWF0ID09PSBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQzX0VYVCkgfHxcbiAgICAgICAgKG1pcG1hcC5pbnRlcm5hbGZvcm1hdCA9PT0gR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUNV9FWFQpKSB7XG4gICAgICBcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBzZXRNaXBNYXAgKG1pcG1hcCwgdGFyZ2V0KSB7XG4gICAgdmFyIGltYWdlcyA9IG1pcG1hcC5pbWFnZXNcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGltYWdlcy5sZW5ndGg7ICsraSkge1xuICAgICAgaWYgKCFpbWFnZXNbaV0pIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgICBzZXRJbWFnZShpbWFnZXNbaV0sIHRhcmdldCwgaSlcbiAgICB9XG4gIH1cblxuICB2YXIgbWlwUG9vbCA9IFtdXG5cbiAgZnVuY3Rpb24gYWxsb2NNaXBNYXAgKCkge1xuICAgIHZhciByZXN1bHQgPSBtaXBQb29sLnBvcCgpIHx8IG5ldyBNaXBNYXAoKVxuICAgIFRleEZsYWdzLmNhbGwocmVzdWx0KVxuICAgIHJlc3VsdC5taXBtYXNrID0gMFxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgMTY7ICsraSkge1xuICAgICAgcmVzdWx0LmltYWdlc1tpXSA9IG51bGxcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdFxuICB9XG5cbiAgZnVuY3Rpb24gZnJlZU1pcE1hcCAobWlwbWFwKSB7XG4gICAgdmFyIGltYWdlcyA9IG1pcG1hcC5pbWFnZXNcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGltYWdlcy5sZW5ndGg7ICsraSkge1xuICAgICAgaWYgKGltYWdlc1tpXSkge1xuICAgICAgICBmcmVlSW1hZ2UoaW1hZ2VzW2ldKVxuICAgICAgfVxuICAgICAgaW1hZ2VzW2ldID0gbnVsbFxuICAgIH1cbiAgICBtaXBQb29sLnB1c2gobWlwbWFwKVxuICB9XG5cbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAvLyBUZXggaW5mb1xuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIGZ1bmN0aW9uIFRleEluZm8gKCkge1xuICAgIHRoaXMubWluRmlsdGVyID0gR0xfTkVBUkVTVFxuICAgIHRoaXMubWFnRmlsdGVyID0gR0xfTkVBUkVTVFxuXG4gICAgdGhpcy53cmFwUyA9IEdMX0NMQU1QX1RPX0VER0VcbiAgICB0aGlzLndyYXBUID0gR0xfQ0xBTVBfVE9fRURHRVxuXG4gICAgdGhpcy5hbmlzb3Ryb3BpYyA9IDFcblxuICAgIHRoaXMuZ2VuTWlwbWFwcyA9IGZhbHNlXG4gICAgdGhpcy5taXBtYXBIaW50ID0gR0xfRE9OVF9DQVJFXG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZVRleEluZm8gKGluZm8sIG9wdGlvbnMpIHtcbiAgICBpZiAoJ21pbicgaW4gb3B0aW9ucykge1xuICAgICAgdmFyIG1pbkZpbHRlciA9IG9wdGlvbnMubWluXG4gICAgICBcbiAgICAgIGluZm8ubWluRmlsdGVyID0gbWluRmlsdGVyc1ttaW5GaWx0ZXJdXG4gICAgICBpZiAoTUlQTUFQX0ZJTFRFUlMuaW5kZXhPZihpbmZvLm1pbkZpbHRlcikgPj0gMCkge1xuICAgICAgICBpbmZvLmdlbk1pcG1hcHMgPSB0cnVlXG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKCdtYWcnIGluIG9wdGlvbnMpIHtcbiAgICAgIHZhciBtYWdGaWx0ZXIgPSBvcHRpb25zLm1hZ1xuICAgICAgXG4gICAgICBpbmZvLm1hZ0ZpbHRlciA9IG1hZ0ZpbHRlcnNbbWFnRmlsdGVyXVxuICAgIH1cblxuICAgIHZhciB3cmFwUyA9IGluZm8ud3JhcFNcbiAgICB2YXIgd3JhcFQgPSBpbmZvLndyYXBUXG4gICAgaWYgKCd3cmFwJyBpbiBvcHRpb25zKSB7XG4gICAgICB2YXIgd3JhcCA9IG9wdGlvbnMud3JhcFxuICAgICAgaWYgKHR5cGVvZiB3cmFwID09PSAnc3RyaW5nJykge1xuICAgICAgICBcbiAgICAgICAgd3JhcFMgPSB3cmFwVCA9IHdyYXBNb2Rlc1t3cmFwXVxuICAgICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KHdyYXApKSB7XG4gICAgICAgIFxuICAgICAgICBcbiAgICAgICAgd3JhcFMgPSB3cmFwTW9kZXNbd3JhcFswXV1cbiAgICAgICAgd3JhcFQgPSB3cmFwTW9kZXNbd3JhcFsxXV1cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKCd3cmFwUycgaW4gb3B0aW9ucykge1xuICAgICAgICB2YXIgb3B0V3JhcFMgPSBvcHRpb25zLndyYXBTXG4gICAgICAgIFxuICAgICAgICB3cmFwUyA9IHdyYXBNb2Rlc1tvcHRXcmFwU11cbiAgICAgIH1cbiAgICAgIGlmICgnd3JhcFQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIG9wdFdyYXBUID0gb3B0aW9ucy53cmFwVFxuICAgICAgICBcbiAgICAgICAgd3JhcFQgPSB3cmFwTW9kZXNbb3B0V3JhcFRdXG4gICAgICB9XG4gICAgfVxuICAgIGluZm8ud3JhcFMgPSB3cmFwU1xuICAgIGluZm8ud3JhcFQgPSB3cmFwVFxuXG4gICAgaWYgKCdhbmlzb3Ryb3BpYycgaW4gb3B0aW9ucykge1xuICAgICAgdmFyIGFuaXNvdHJvcGljID0gb3B0aW9ucy5hbmlzb3Ryb3BpY1xuICAgICAgXG4gICAgICBpbmZvLmFuaXNvdHJvcGljID0gb3B0aW9ucy5hbmlzb3Ryb3BpY1xuICAgIH1cblxuICAgIGlmICgnbWlwbWFwJyBpbiBvcHRpb25zKSB7XG4gICAgICB2YXIgaGFzTWlwTWFwID0gZmFsc2VcbiAgICAgIHN3aXRjaCAodHlwZW9mIG9wdGlvbnMubWlwbWFwKSB7XG4gICAgICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICAgICAgXG4gICAgICAgICAgaW5mby5taXBtYXBIaW50ID0gbWlwbWFwSGludFtvcHRpb25zLm1pcG1hcF1cbiAgICAgICAgICBpbmZvLmdlbk1pcG1hcHMgPSB0cnVlXG4gICAgICAgICAgaGFzTWlwTWFwID0gdHJ1ZVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICAgICAgaGFzTWlwTWFwID0gaW5mby5nZW5NaXBtYXBzID0gb3B0aW9ucy5taXBtYXBcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICAgICAgXG4gICAgICAgICAgaW5mby5nZW5NaXBtYXBzID0gZmFsc2VcbiAgICAgICAgICBoYXNNaXBNYXAgPSB0cnVlXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIFxuICAgICAgfVxuICAgICAgaWYgKGhhc01pcE1hcCAmJiAhKCdtaW4nIGluIG9wdGlvbnMpKSB7XG4gICAgICAgIGluZm8ubWluRmlsdGVyID0gR0xfTkVBUkVTVF9NSVBNQVBfTkVBUkVTVFxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHNldFRleEluZm8gKGluZm8sIHRhcmdldCkge1xuICAgIGdsLnRleFBhcmFtZXRlcmkodGFyZ2V0LCBHTF9URVhUVVJFX01JTl9GSUxURVIsIGluZm8ubWluRmlsdGVyKVxuICAgIGdsLnRleFBhcmFtZXRlcmkodGFyZ2V0LCBHTF9URVhUVVJFX01BR19GSUxURVIsIGluZm8ubWFnRmlsdGVyKVxuICAgIGdsLnRleFBhcmFtZXRlcmkodGFyZ2V0LCBHTF9URVhUVVJFX1dSQVBfUywgaW5mby53cmFwUylcbiAgICBnbC50ZXhQYXJhbWV0ZXJpKHRhcmdldCwgR0xfVEVYVFVSRV9XUkFQX1QsIGluZm8ud3JhcFQpXG4gICAgaWYgKGV4dGVuc2lvbnMuZXh0X3RleHR1cmVfZmlsdGVyX2FuaXNvdHJvcGljKSB7XG4gICAgICBnbC50ZXhQYXJhbWV0ZXJpKHRhcmdldCwgR0xfVEVYVFVSRV9NQVhfQU5JU09UUk9QWV9FWFQsIGluZm8uYW5pc290cm9waWMpXG4gICAgfVxuICAgIGlmIChpbmZvLmdlbk1pcG1hcHMpIHtcbiAgICAgIGdsLmhpbnQoR0xfR0VORVJBVEVfTUlQTUFQX0hJTlQsIGluZm8ubWlwbWFwSGludClcbiAgICAgIGdsLmdlbmVyYXRlTWlwbWFwKHRhcmdldClcbiAgICB9XG4gIH1cblxuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vIEZ1bGwgdGV4dHVyZSBvYmplY3RcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICB2YXIgdGV4dHVyZUNvdW50ID0gMFxuICB2YXIgdGV4dHVyZVNldCA9IHt9XG4gIHZhciBudW1UZXhVbml0cyA9IGxpbWl0cy5tYXhUZXh0dXJlVW5pdHNcbiAgdmFyIHRleHR1cmVVbml0cyA9IEFycmF5KG51bVRleFVuaXRzKS5tYXAoZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiBudWxsXG4gIH0pXG5cbiAgZnVuY3Rpb24gUkVHTFRleHR1cmUgKHRhcmdldCkge1xuICAgIFRleEZsYWdzLmNhbGwodGhpcylcbiAgICB0aGlzLm1pcG1hc2sgPSAwXG4gICAgdGhpcy5pbnRlcm5hbGZvcm1hdCA9IEdMX1JHQkFcblxuICAgIHRoaXMuaWQgPSB0ZXh0dXJlQ291bnQrK1xuXG4gICAgdGhpcy5yZWZDb3VudCA9IDFcblxuICAgIHRoaXMudGFyZ2V0ID0gdGFyZ2V0XG4gICAgdGhpcy50ZXh0dXJlID0gZ2wuY3JlYXRlVGV4dHVyZSgpXG5cbiAgICB0aGlzLnVuaXQgPSAtMVxuICAgIHRoaXMuYmluZENvdW50ID0gMFxuXG4gICAgdGhpcy50ZXhJbmZvID0gbmV3IFRleEluZm8oKVxuXG4gICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgICB0aGlzLnN0YXRzID0ge3NpemU6IDB9XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gdGVtcEJpbmQgKHRleHR1cmUpIHtcbiAgICBnbC5hY3RpdmVUZXh0dXJlKEdMX1RFWFRVUkUwKVxuICAgIGdsLmJpbmRUZXh0dXJlKHRleHR1cmUudGFyZ2V0LCB0ZXh0dXJlLnRleHR1cmUpXG4gIH1cblxuICBmdW5jdGlvbiB0ZW1wUmVzdG9yZSAoKSB7XG4gICAgdmFyIHByZXYgPSB0ZXh0dXJlVW5pdHNbMF1cbiAgICBpZiAocHJldikge1xuICAgICAgZ2wuYmluZFRleHR1cmUocHJldi50YXJnZXQsIHByZXYudGV4dHVyZSlcbiAgICB9IGVsc2Uge1xuICAgICAgZ2wuYmluZFRleHR1cmUoR0xfVEVYVFVSRV8yRCwgbnVsbClcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95ICh0ZXh0dXJlKSB7XG4gICAgdmFyIGhhbmRsZSA9IHRleHR1cmUudGV4dHVyZVxuICAgIFxuICAgIHZhciB1bml0ID0gdGV4dHVyZS51bml0XG4gICAgdmFyIHRhcmdldCA9IHRleHR1cmUudGFyZ2V0XG4gICAgaWYgKHVuaXQgPj0gMCkge1xuICAgICAgZ2wuYWN0aXZlVGV4dHVyZShHTF9URVhUVVJFMCArIHVuaXQpXG4gICAgICBnbC5iaW5kVGV4dHVyZSh0YXJnZXQsIG51bGwpXG4gICAgICB0ZXh0dXJlVW5pdHNbdW5pdF0gPSBudWxsXG4gICAgfVxuICAgIGdsLmRlbGV0ZVRleHR1cmUoaGFuZGxlKVxuICAgIHRleHR1cmUudGV4dHVyZSA9IG51bGxcbiAgICB0ZXh0dXJlLnBhcmFtcyA9IG51bGxcbiAgICB0ZXh0dXJlLnBpeGVscyA9IG51bGxcbiAgICB0ZXh0dXJlLnJlZkNvdW50ID0gMFxuICAgIGRlbGV0ZSB0ZXh0dXJlU2V0W3RleHR1cmUuaWRdXG4gICAgc3RhdHMudGV4dHVyZUNvdW50LS1cbiAgfVxuXG4gIGV4dGVuZChSRUdMVGV4dHVyZS5wcm90b3R5cGUsIHtcbiAgICBiaW5kOiBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgdGV4dHVyZSA9IHRoaXNcbiAgICAgIHRleHR1cmUuYmluZENvdW50ICs9IDFcbiAgICAgIHZhciB1bml0ID0gdGV4dHVyZS51bml0XG4gICAgICBpZiAodW5pdCA8IDApIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBudW1UZXhVbml0czsgKytpKSB7XG4gICAgICAgICAgdmFyIG90aGVyID0gdGV4dHVyZVVuaXRzW2ldXG4gICAgICAgICAgaWYgKG90aGVyKSB7XG4gICAgICAgICAgICBpZiAob3RoZXIuYmluZENvdW50ID4gMCkge1xuICAgICAgICAgICAgICBjb250aW51ZVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgb3RoZXIudW5pdCA9IC0xXG4gICAgICAgICAgfVxuICAgICAgICAgIHRleHR1cmVVbml0c1tpXSA9IHRleHR1cmVcbiAgICAgICAgICB1bml0ID0gaVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIH1cbiAgICAgICAgaWYgKHVuaXQgPj0gbnVtVGV4VW5pdHMpIHtcbiAgICAgICAgICBcbiAgICAgICAgfVxuICAgICAgICBpZiAoY29uZmlnLnByb2ZpbGUgJiYgc3RhdHMubWF4VGV4dHVyZVVuaXRzIDwgKHVuaXQgKyAxKSkge1xuICAgICAgICAgIHN0YXRzLm1heFRleHR1cmVVbml0cyA9IHVuaXQgKyAxIC8vICsxLCBzaW5jZSB0aGUgdW5pdHMgYXJlIHplcm8tYmFzZWRcbiAgICAgICAgfVxuICAgICAgICB0ZXh0dXJlLnVuaXQgPSB1bml0XG4gICAgICAgIGdsLmFjdGl2ZVRleHR1cmUoR0xfVEVYVFVSRTAgKyB1bml0KVxuICAgICAgICBnbC5iaW5kVGV4dHVyZSh0ZXh0dXJlLnRhcmdldCwgdGV4dHVyZS50ZXh0dXJlKVxuICAgICAgfVxuICAgICAgcmV0dXJuIHVuaXRcbiAgICB9LFxuXG4gICAgdW5iaW5kOiBmdW5jdGlvbiAoKSB7XG4gICAgICB0aGlzLmJpbmRDb3VudCAtPSAxXG4gICAgfSxcblxuICAgIGRlY1JlZjogZnVuY3Rpb24gKCkge1xuICAgICAgaWYgKC0tdGhpcy5yZWZDb3VudCA8PSAwKSB7XG4gICAgICAgIGRlc3Ryb3kodGhpcylcbiAgICAgIH1cbiAgICB9XG4gIH0pXG5cbiAgZnVuY3Rpb24gY3JlYXRlVGV4dHVyZTJEIChhLCBiKSB7XG4gICAgdmFyIHRleHR1cmUgPSBuZXcgUkVHTFRleHR1cmUoR0xfVEVYVFVSRV8yRClcbiAgICB0ZXh0dXJlU2V0W3RleHR1cmUuaWRdID0gdGV4dHVyZVxuICAgIHN0YXRzLnRleHR1cmVDb3VudCsrXG5cbiAgICBmdW5jdGlvbiByZWdsVGV4dHVyZTJEIChhLCBiKSB7XG4gICAgICB2YXIgdGV4SW5mbyA9IHRleHR1cmUudGV4SW5mb1xuICAgICAgVGV4SW5mby5jYWxsKHRleEluZm8pXG4gICAgICB2YXIgbWlwRGF0YSA9IGFsbG9jTWlwTWFwKClcblxuICAgICAgaWYgKHR5cGVvZiBhID09PSAnbnVtYmVyJykge1xuICAgICAgICBpZiAodHlwZW9mIGIgPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgcGFyc2VNaXBNYXBGcm9tU2hhcGUobWlwRGF0YSwgYSB8IDAsIGIgfCAwKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHBhcnNlTWlwTWFwRnJvbVNoYXBlKG1pcERhdGEsIGEgfCAwLCBhIHwgMClcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChhKSB7XG4gICAgICAgIFxuICAgICAgICBwYXJzZVRleEluZm8odGV4SW5mbywgYSlcbiAgICAgICAgcGFyc2VNaXBNYXBGcm9tT2JqZWN0KG1pcERhdGEsIGEpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBlbXB0eSB0ZXh0dXJlcyBnZXQgYXNzaWduZWQgYSBkZWZhdWx0IHNoYXBlIG9mIDF4MVxuICAgICAgICBwYXJzZU1pcE1hcEZyb21TaGFwZShtaXBEYXRhLCAxLCAxKVxuICAgICAgfVxuXG4gICAgICBpZiAodGV4SW5mby5nZW5NaXBtYXBzKSB7XG4gICAgICAgIG1pcERhdGEubWlwbWFzayA9IChtaXBEYXRhLndpZHRoIDw8IDEpIC0gMVxuICAgICAgfVxuICAgICAgdGV4dHVyZS5taXBtYXNrID0gbWlwRGF0YS5taXBtYXNrXG5cbiAgICAgIGNvcHlGbGFncyh0ZXh0dXJlLCBtaXBEYXRhKVxuXG4gICAgICBcbiAgICAgIHRleHR1cmUuaW50ZXJuYWxmb3JtYXQgPSBtaXBEYXRhLmludGVybmFsZm9ybWF0XG5cbiAgICAgIHJlZ2xUZXh0dXJlMkQud2lkdGggPSBtaXBEYXRhLndpZHRoXG4gICAgICByZWdsVGV4dHVyZTJELmhlaWdodCA9IG1pcERhdGEuaGVpZ2h0XG5cbiAgICAgIHRlbXBCaW5kKHRleHR1cmUpXG4gICAgICBzZXRNaXBNYXAobWlwRGF0YSwgR0xfVEVYVFVSRV8yRClcbiAgICAgIHNldFRleEluZm8odGV4SW5mbywgR0xfVEVYVFVSRV8yRClcbiAgICAgIHRlbXBSZXN0b3JlKClcblxuICAgICAgZnJlZU1pcE1hcChtaXBEYXRhKVxuXG4gICAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgICAgdGV4dHVyZS5zdGF0cy5zaXplID0gZ2V0VGV4dHVyZVNpemUoXG4gICAgICAgICAgdGV4dHVyZS5pbnRlcm5hbGZvcm1hdCxcbiAgICAgICAgICB0ZXh0dXJlLnR5cGUsXG4gICAgICAgICAgbWlwRGF0YS53aWR0aCxcbiAgICAgICAgICBtaXBEYXRhLmhlaWdodCxcbiAgICAgICAgICB0ZXhJbmZvLmdlbk1pcG1hcHMsXG4gICAgICAgICAgZmFsc2UpXG4gICAgICB9XG4gICAgICByZWdsVGV4dHVyZTJELmZvcm1hdCA9IHRleHR1cmVGb3JtYXRzSW52ZXJ0W3RleHR1cmUuaW50ZXJuYWxmb3JtYXRdXG4gICAgICByZWdsVGV4dHVyZTJELnR5cGUgPSB0ZXh0dXJlVHlwZXNJbnZlcnRbdGV4dHVyZS50eXBlXVxuXG4gICAgICByZWdsVGV4dHVyZTJELm1hZyA9IG1hZ0ZpbHRlcnNJbnZlcnRbdGV4SW5mby5tYWdGaWx0ZXJdXG4gICAgICByZWdsVGV4dHVyZTJELm1pbiA9IG1pbkZpbHRlcnNJbnZlcnRbdGV4SW5mby5taW5GaWx0ZXJdXG5cbiAgICAgIHJlZ2xUZXh0dXJlMkQud3JhcFMgPSB3cmFwTW9kZXNJbnZlcnRbdGV4SW5mby53cmFwU11cbiAgICAgIHJlZ2xUZXh0dXJlMkQud3JhcFQgPSB3cmFwTW9kZXNJbnZlcnRbdGV4SW5mby53cmFwVF1cblxuICAgICAgcmV0dXJuIHJlZ2xUZXh0dXJlMkRcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzdWJpbWFnZSAoaW1hZ2UsIHhfLCB5XywgbGV2ZWxfKSB7XG4gICAgICBcblxuICAgICAgdmFyIHggPSB4XyB8IDBcbiAgICAgIHZhciB5ID0geV8gfCAwXG4gICAgICB2YXIgbGV2ZWwgPSBsZXZlbF8gfCAwXG5cbiAgICAgIHZhciBpbWFnZURhdGEgPSBhbGxvY0ltYWdlKClcbiAgICAgIGNvcHlGbGFncyhpbWFnZURhdGEsIHRleHR1cmUpXG4gICAgICBpbWFnZURhdGEud2lkdGggPSAwXG4gICAgICBpbWFnZURhdGEuaGVpZ2h0ID0gMFxuICAgICAgcGFyc2VJbWFnZShpbWFnZURhdGEsIGltYWdlKVxuICAgICAgaW1hZ2VEYXRhLndpZHRoID0gaW1hZ2VEYXRhLndpZHRoIHx8ICgodGV4dHVyZS53aWR0aCA+PiBsZXZlbCkgLSB4KVxuICAgICAgaW1hZ2VEYXRhLmhlaWdodCA9IGltYWdlRGF0YS5oZWlnaHQgfHwgKCh0ZXh0dXJlLmhlaWdodCA+PiBsZXZlbCkgLSB5KVxuXG4gICAgICBcbiAgICAgIFxuICAgICAgXG4gICAgICBcblxuICAgICAgdGVtcEJpbmQodGV4dHVyZSlcbiAgICAgIHNldFN1YkltYWdlKGltYWdlRGF0YSwgR0xfVEVYVFVSRV8yRCwgeCwgeSwgbGV2ZWwpXG4gICAgICB0ZW1wUmVzdG9yZSgpXG5cbiAgICAgIGZyZWVJbWFnZShpbWFnZURhdGEpXG5cbiAgICAgIHJldHVybiByZWdsVGV4dHVyZTJEXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVzaXplICh3XywgaF8pIHtcbiAgICAgIHZhciB3ID0gd18gfCAwXG4gICAgICB2YXIgaCA9IChoXyB8IDApIHx8IHdcbiAgICAgIGlmICh3ID09PSB0ZXh0dXJlLndpZHRoICYmIGggPT09IHRleHR1cmUuaGVpZ2h0KSB7XG4gICAgICAgIHJldHVybiByZWdsVGV4dHVyZTJEXG4gICAgICB9XG5cbiAgICAgIHJlZ2xUZXh0dXJlMkQud2lkdGggPSB0ZXh0dXJlLndpZHRoID0gd1xuICAgICAgcmVnbFRleHR1cmUyRC5oZWlnaHQgPSB0ZXh0dXJlLmhlaWdodCA9IGhcblxuICAgICAgdGVtcEJpbmQodGV4dHVyZSlcbiAgICAgIGZvciAodmFyIGkgPSAwOyB0ZXh0dXJlLm1pcG1hc2sgPj4gaTsgKytpKSB7XG4gICAgICAgIGdsLnRleEltYWdlMkQoXG4gICAgICAgICAgR0xfVEVYVFVSRV8yRCxcbiAgICAgICAgICBpLFxuICAgICAgICAgIHRleHR1cmUuZm9ybWF0LFxuICAgICAgICAgIHcgPj4gaSxcbiAgICAgICAgICBoID4+IGksXG4gICAgICAgICAgMCxcbiAgICAgICAgICB0ZXh0dXJlLmZvcm1hdCxcbiAgICAgICAgICB0ZXh0dXJlLnR5cGUsXG4gICAgICAgICAgbnVsbClcbiAgICAgIH1cbiAgICAgIHRlbXBSZXN0b3JlKClcblxuICAgICAgLy8gYWxzbywgcmVjb21wdXRlIHRoZSB0ZXh0dXJlIHNpemUuXG4gICAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgICAgdGV4dHVyZS5zdGF0cy5zaXplID0gZ2V0VGV4dHVyZVNpemUoXG4gICAgICAgICAgdGV4dHVyZS5pbnRlcm5hbGZvcm1hdCxcbiAgICAgICAgICB0ZXh0dXJlLnR5cGUsXG4gICAgICAgICAgdyxcbiAgICAgICAgICBoLFxuICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgIGZhbHNlKVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gcmVnbFRleHR1cmUyRFxuICAgIH1cblxuICAgIHJlZ2xUZXh0dXJlMkQoYSwgYilcblxuICAgIHJlZ2xUZXh0dXJlMkQuc3ViaW1hZ2UgPSBzdWJpbWFnZVxuICAgIHJlZ2xUZXh0dXJlMkQucmVzaXplID0gcmVzaXplXG4gICAgcmVnbFRleHR1cmUyRC5fcmVnbFR5cGUgPSAndGV4dHVyZTJkJ1xuICAgIHJlZ2xUZXh0dXJlMkQuX3RleHR1cmUgPSB0ZXh0dXJlXG4gICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgICByZWdsVGV4dHVyZTJELnN0YXRzID0gdGV4dHVyZS5zdGF0c1xuICAgIH1cbiAgICByZWdsVGV4dHVyZTJELmRlc3Ryb3kgPSBmdW5jdGlvbiAoKSB7XG4gICAgICB0ZXh0dXJlLmRlY1JlZigpXG4gICAgfVxuXG4gICAgcmV0dXJuIHJlZ2xUZXh0dXJlMkRcbiAgfVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZVRleHR1cmVDdWJlIChhMCwgYTEsIGEyLCBhMywgYTQsIGE1KSB7XG4gICAgdmFyIHRleHR1cmUgPSBuZXcgUkVHTFRleHR1cmUoR0xfVEVYVFVSRV9DVUJFX01BUClcbiAgICB0ZXh0dXJlU2V0W3RleHR1cmUuaWRdID0gdGV4dHVyZVxuICAgIHN0YXRzLmN1YmVDb3VudCsrXG5cbiAgICB2YXIgZmFjZXMgPSBuZXcgQXJyYXkoNilcblxuICAgIGZ1bmN0aW9uIHJlZ2xUZXh0dXJlQ3ViZSAoYTAsIGExLCBhMiwgYTMsIGE0LCBhNSkge1xuICAgICAgdmFyIGlcbiAgICAgIHZhciB0ZXhJbmZvID0gdGV4dHVyZS50ZXhJbmZvXG4gICAgICBUZXhJbmZvLmNhbGwodGV4SW5mbylcbiAgICAgIGZvciAoaSA9IDA7IGkgPCA2OyArK2kpIHtcbiAgICAgICAgZmFjZXNbaV0gPSBhbGxvY01pcE1hcCgpXG4gICAgICB9XG5cbiAgICAgIGlmICh0eXBlb2YgYTAgPT09ICdudW1iZXInIHx8ICFhMCkge1xuICAgICAgICB2YXIgcyA9IChhMCB8IDApIHx8IDFcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IDY7ICsraSkge1xuICAgICAgICAgIHBhcnNlTWlwTWFwRnJvbVNoYXBlKGZhY2VzW2ldLCBzLCBzKVxuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBhMCA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgaWYgKGExKSB7XG4gICAgICAgICAgcGFyc2VNaXBNYXBGcm9tT2JqZWN0KGZhY2VzWzBdLCBhMClcbiAgICAgICAgICBwYXJzZU1pcE1hcEZyb21PYmplY3QoZmFjZXNbMV0sIGExKVxuICAgICAgICAgIHBhcnNlTWlwTWFwRnJvbU9iamVjdChmYWNlc1syXSwgYTIpXG4gICAgICAgICAgcGFyc2VNaXBNYXBGcm9tT2JqZWN0KGZhY2VzWzNdLCBhMylcbiAgICAgICAgICBwYXJzZU1pcE1hcEZyb21PYmplY3QoZmFjZXNbNF0sIGE0KVxuICAgICAgICAgIHBhcnNlTWlwTWFwRnJvbU9iamVjdChmYWNlc1s1XSwgYTUpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcGFyc2VUZXhJbmZvKHRleEluZm8sIGEwKVxuICAgICAgICAgIHBhcnNlRmxhZ3ModGV4dHVyZSwgYTApXG4gICAgICAgICAgaWYgKCdmYWNlcycgaW4gYTApIHtcbiAgICAgICAgICAgIHZhciBmYWNlX2lucHV0ID0gYTAuZmFjZXNcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IDY7ICsraSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgY29weUZsYWdzKGZhY2VzW2ldLCB0ZXh0dXJlKVxuICAgICAgICAgICAgICBwYXJzZU1pcE1hcEZyb21PYmplY3QoZmFjZXNbaV0sIGZhY2VfaW5wdXRbaV0pXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCA2OyArK2kpIHtcbiAgICAgICAgICAgICAgcGFyc2VNaXBNYXBGcm9tT2JqZWN0KGZhY2VzW2ldLCBhMClcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIFxuICAgICAgfVxuXG4gICAgICBjb3B5RmxhZ3ModGV4dHVyZSwgZmFjZXNbMF0pXG4gICAgICBpZiAodGV4SW5mby5nZW5NaXBtYXBzKSB7XG4gICAgICAgIHRleHR1cmUubWlwbWFzayA9IChmYWNlc1swXS53aWR0aCA8PCAxKSAtIDFcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRleHR1cmUubWlwbWFzayA9IGZhY2VzWzBdLm1pcG1hc2tcbiAgICAgIH1cblxuICAgICAgXG4gICAgICB0ZXh0dXJlLmludGVybmFsZm9ybWF0ID0gZmFjZXNbMF0uaW50ZXJuYWxmb3JtYXRcblxuICAgICAgcmVnbFRleHR1cmVDdWJlLndpZHRoID0gZmFjZXNbMF0ud2lkdGhcbiAgICAgIHJlZ2xUZXh0dXJlQ3ViZS5oZWlnaHQgPSBmYWNlc1swXS5oZWlnaHRcblxuICAgICAgdGVtcEJpbmQodGV4dHVyZSlcbiAgICAgIGZvciAoaSA9IDA7IGkgPCA2OyArK2kpIHtcbiAgICAgICAgc2V0TWlwTWFwKGZhY2VzW2ldLCBHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1ggKyBpKVxuICAgICAgfVxuICAgICAgc2V0VGV4SW5mbyh0ZXhJbmZvLCBHTF9URVhUVVJFX0NVQkVfTUFQKVxuICAgICAgdGVtcFJlc3RvcmUoKVxuXG4gICAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgICAgdGV4dHVyZS5zdGF0cy5zaXplID0gZ2V0VGV4dHVyZVNpemUoXG4gICAgICAgICAgdGV4dHVyZS5pbnRlcm5hbGZvcm1hdCxcbiAgICAgICAgICB0ZXh0dXJlLnR5cGUsXG4gICAgICAgICAgcmVnbFRleHR1cmVDdWJlLndpZHRoLFxuICAgICAgICAgIHJlZ2xUZXh0dXJlQ3ViZS5oZWlnaHQsXG4gICAgICAgICAgdGV4SW5mby5nZW5NaXBtYXBzLFxuICAgICAgICAgIHRydWUpXG4gICAgICB9XG5cbiAgICAgIHJlZ2xUZXh0dXJlQ3ViZS5mb3JtYXQgPSB0ZXh0dXJlRm9ybWF0c0ludmVydFt0ZXh0dXJlLmludGVybmFsZm9ybWF0XVxuICAgICAgcmVnbFRleHR1cmVDdWJlLnR5cGUgPSB0ZXh0dXJlVHlwZXNJbnZlcnRbdGV4dHVyZS50eXBlXVxuXG4gICAgICByZWdsVGV4dHVyZUN1YmUubWFnID0gbWFnRmlsdGVyc0ludmVydFt0ZXhJbmZvLm1hZ0ZpbHRlcl1cbiAgICAgIHJlZ2xUZXh0dXJlQ3ViZS5taW4gPSBtaW5GaWx0ZXJzSW52ZXJ0W3RleEluZm8ubWluRmlsdGVyXVxuXG4gICAgICByZWdsVGV4dHVyZUN1YmUud3JhcFMgPSB3cmFwTW9kZXNJbnZlcnRbdGV4SW5mby53cmFwU11cbiAgICAgIHJlZ2xUZXh0dXJlQ3ViZS53cmFwVCA9IHdyYXBNb2Rlc0ludmVydFt0ZXhJbmZvLndyYXBUXVxuXG4gICAgICBmb3IgKGkgPSAwOyBpIDwgNjsgKytpKSB7XG4gICAgICAgIGZyZWVNaXBNYXAoZmFjZXNbaV0pXG4gICAgICB9XG5cbiAgICAgIHJldHVybiByZWdsVGV4dHVyZUN1YmVcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzdWJpbWFnZSAoZmFjZSwgaW1hZ2UsIHhfLCB5XywgbGV2ZWxfKSB7XG4gICAgICBcbiAgICAgIFxuXG4gICAgICB2YXIgeCA9IHhfIHwgMFxuICAgICAgdmFyIHkgPSB5XyB8IDBcbiAgICAgIHZhciBsZXZlbCA9IGxldmVsXyB8IDBcblxuICAgICAgdmFyIGltYWdlRGF0YSA9IGFsbG9jSW1hZ2UoKVxuICAgICAgY29weUZsYWdzKGltYWdlRGF0YSwgdGV4dHVyZSlcbiAgICAgIGltYWdlRGF0YS53aWR0aCA9IDBcbiAgICAgIGltYWdlRGF0YS5oZWlnaHQgPSAwXG4gICAgICBwYXJzZUltYWdlKGltYWdlRGF0YSwgaW1hZ2UpXG4gICAgICBpbWFnZURhdGEud2lkdGggPSBpbWFnZURhdGEud2lkdGggfHwgKCh0ZXh0dXJlLndpZHRoID4+IGxldmVsKSAtIHgpXG4gICAgICBpbWFnZURhdGEuaGVpZ2h0ID0gaW1hZ2VEYXRhLmhlaWdodCB8fCAoKHRleHR1cmUuaGVpZ2h0ID4+IGxldmVsKSAtIHkpXG5cbiAgICAgIFxuICAgICAgXG4gICAgICBcbiAgICAgIFxuXG4gICAgICB0ZW1wQmluZCh0ZXh0dXJlKVxuICAgICAgc2V0U3ViSW1hZ2UoaW1hZ2VEYXRhLCBHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1ggKyBmYWNlLCB4LCB5LCBsZXZlbClcbiAgICAgIHRlbXBSZXN0b3JlKClcblxuICAgICAgZnJlZUltYWdlKGltYWdlRGF0YSlcblxuICAgICAgcmV0dXJuIHJlZ2xUZXh0dXJlQ3ViZVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHJlc2l6ZSAocmFkaXVzXykge1xuICAgICAgdmFyIHJhZGl1cyA9IHJhZGl1c18gfCAwXG4gICAgICBpZiAocmFkaXVzID09PSB0ZXh0dXJlLndpZHRoKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuXG4gICAgICByZWdsVGV4dHVyZUN1YmUud2lkdGggPSB0ZXh0dXJlLndpZHRoID0gcmFkaXVzXG4gICAgICByZWdsVGV4dHVyZUN1YmUuaGVpZ2h0ID0gdGV4dHVyZS5oZWlnaHQgPSByYWRpdXNcblxuICAgICAgdGVtcEJpbmQodGV4dHVyZSlcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgNjsgKytpKSB7XG4gICAgICAgIGZvciAodmFyIGogPSAwOyB0ZXh0dXJlLm1pcG1hc2sgPj4gajsgKytqKSB7XG4gICAgICAgICAgZ2wudGV4SW1hZ2UyRChcbiAgICAgICAgICAgIEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCArIGksXG4gICAgICAgICAgICBqLFxuICAgICAgICAgICAgdGV4dHVyZS5mb3JtYXQsXG4gICAgICAgICAgICByYWRpdXMgPj4gaixcbiAgICAgICAgICAgIHJhZGl1cyA+PiBqLFxuICAgICAgICAgICAgMCxcbiAgICAgICAgICAgIHRleHR1cmUuZm9ybWF0LFxuICAgICAgICAgICAgdGV4dHVyZS50eXBlLFxuICAgICAgICAgICAgbnVsbClcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgdGVtcFJlc3RvcmUoKVxuXG4gICAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgICAgdGV4dHVyZS5zdGF0cy5zaXplID0gZ2V0VGV4dHVyZVNpemUoXG4gICAgICAgICAgdGV4dHVyZS5pbnRlcm5hbGZvcm1hdCxcbiAgICAgICAgICB0ZXh0dXJlLnR5cGUsXG4gICAgICAgICAgcmVnbFRleHR1cmVDdWJlLndpZHRoLFxuICAgICAgICAgIHJlZ2xUZXh0dXJlQ3ViZS5oZWlnaHQsXG4gICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgdHJ1ZSlcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHJlZ2xUZXh0dXJlQ3ViZVxuICAgIH1cblxuICAgIHJlZ2xUZXh0dXJlQ3ViZShhMCwgYTEsIGEyLCBhMywgYTQsIGE1KVxuXG4gICAgcmVnbFRleHR1cmVDdWJlLnN1YmltYWdlID0gc3ViaW1hZ2VcbiAgICByZWdsVGV4dHVyZUN1YmUucmVzaXplID0gcmVzaXplXG4gICAgcmVnbFRleHR1cmVDdWJlLl9yZWdsVHlwZSA9ICd0ZXh0dXJlQ3ViZSdcbiAgICByZWdsVGV4dHVyZUN1YmUuX3RleHR1cmUgPSB0ZXh0dXJlXG4gICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgICByZWdsVGV4dHVyZUN1YmUuc3RhdHMgPSB0ZXh0dXJlLnN0YXRzXG4gICAgfVxuICAgIHJlZ2xUZXh0dXJlQ3ViZS5kZXN0cm95ID0gZnVuY3Rpb24gKCkge1xuICAgICAgdGV4dHVyZS5kZWNSZWYoKVxuICAgIH1cblxuICAgIHJldHVybiByZWdsVGV4dHVyZUN1YmVcbiAgfVxuXG4gIC8vIENhbGxlZCB3aGVuIHJlZ2wgaXMgZGVzdHJveWVkXG4gIGZ1bmN0aW9uIGRlc3Ryb3lUZXh0dXJlcyAoKSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBudW1UZXhVbml0czsgKytpKSB7XG4gICAgICBnbC5hY3RpdmVUZXh0dXJlKEdMX1RFWFRVUkUwICsgaSlcbiAgICAgIGdsLmJpbmRUZXh0dXJlKEdMX1RFWFRVUkVfMkQsIG51bGwpXG4gICAgICB0ZXh0dXJlVW5pdHNbaV0gPSBudWxsXG4gICAgfVxuICAgIHZhbHVlcyh0ZXh0dXJlU2V0KS5mb3JFYWNoKGRlc3Ryb3kpXG5cbiAgICBzdGF0cy5jdWJlQ291bnQgPSAwXG4gICAgc3RhdHMudGV4dHVyZUNvdW50ID0gMFxuICB9XG5cbiAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgc3RhdHMuZ2V0VG90YWxUZXh0dXJlU2l6ZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciB0b3RhbCA9IDBcbiAgICAgIE9iamVjdC5rZXlzKHRleHR1cmVTZXQpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgICAgICB0b3RhbCArPSB0ZXh0dXJlU2V0W2tleV0uc3RhdHMuc2l6ZVxuICAgICAgfSlcbiAgICAgIHJldHVybiB0b3RhbFxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHJlc3RvcmVUZXh0dXJlcyAoKSB7XG4gICAgdmFsdWVzKHRleHR1cmVTZXQpLmZvckVhY2goZnVuY3Rpb24gKHRleHR1cmUpIHtcbiAgICAgIHRleHR1cmUudGV4dHVyZSA9IGdsLmNyZWF0ZVRleHR1cmUoKVxuICAgICAgZ2wuYmluZFRleHR1cmUodGV4dHVyZS50YXJnZXQsIHRleHR1cmUudGV4dHVyZSlcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgMzI7ICsraSkge1xuICAgICAgICBpZiAoKHRleHR1cmUubWlwbWFzayAmICgxIDw8IGkpKSA9PT0gMCkge1xuICAgICAgICAgIGNvbnRpbnVlXG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRleHR1cmUudGFyZ2V0ID09PSBHTF9URVhUVVJFXzJEKSB7XG4gICAgICAgICAgZ2wudGV4SW1hZ2UyRChHTF9URVhUVVJFXzJELFxuICAgICAgICAgICAgaSxcbiAgICAgICAgICAgIHRleHR1cmUuaW50ZXJuYWxmb3JtYXQsXG4gICAgICAgICAgICB0ZXh0dXJlLndpZHRoID4+IGksXG4gICAgICAgICAgICB0ZXh0dXJlLmhlaWdodCA+PiBpLFxuICAgICAgICAgICAgMCxcbiAgICAgICAgICAgIHRleHR1cmUuaW50ZXJuYWxmb3JtYXQsXG4gICAgICAgICAgICB0ZXh0dXJlLnR5cGUsXG4gICAgICAgICAgICBudWxsKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgNjsgKytqKSB7XG4gICAgICAgICAgICBnbC50ZXhJbWFnZTJEKEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCArIGosXG4gICAgICAgICAgICAgIGksXG4gICAgICAgICAgICAgIHRleHR1cmUuaW50ZXJuYWxmb3JtYXQsXG4gICAgICAgICAgICAgIHRleHR1cmUud2lkdGggPj4gaSxcbiAgICAgICAgICAgICAgdGV4dHVyZS5oZWlnaHQgPj4gaSxcbiAgICAgICAgICAgICAgMCxcbiAgICAgICAgICAgICAgdGV4dHVyZS5pbnRlcm5hbGZvcm1hdCxcbiAgICAgICAgICAgICAgdGV4dHVyZS50eXBlLFxuICAgICAgICAgICAgICBudWxsKVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgc2V0VGV4SW5mbyh0ZXh0dXJlLnRleEluZm8sIHRleHR1cmUudGFyZ2V0KVxuICAgIH0pXG4gIH1cblxuICByZXR1cm4ge1xuICAgIGNyZWF0ZTJEOiBjcmVhdGVUZXh0dXJlMkQsXG4gICAgY3JlYXRlQ3ViZTogY3JlYXRlVGV4dHVyZUN1YmUsXG4gICAgY2xlYXI6IGRlc3Ryb3lUZXh0dXJlcyxcbiAgICBnZXRUZXh0dXJlOiBmdW5jdGlvbiAod3JhcHBlcikge1xuICAgICAgcmV0dXJuIG51bGxcbiAgICB9LFxuICAgIHJlc3RvcmU6IHJlc3RvcmVUZXh0dXJlc1xuICB9XG59XG4iLCJ2YXIgR0xfUVVFUllfUkVTVUxUX0VYVCA9IDB4ODg2NlxudmFyIEdMX1FVRVJZX1JFU1VMVF9BVkFJTEFCTEVfRVhUID0gMHg4ODY3XG52YXIgR0xfVElNRV9FTEFQU0VEX0VYVCA9IDB4ODhCRlxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChnbCwgZXh0ZW5zaW9ucykge1xuICB2YXIgZXh0VGltZXIgPSBleHRlbnNpb25zLmV4dF9kaXNqb2ludF90aW1lcl9xdWVyeVxuXG4gIGlmICghZXh0VGltZXIpIHtcbiAgICByZXR1cm4gbnVsbFxuICB9XG5cbiAgLy8gUVVFUlkgUE9PTCBCRUdJTlxuICB2YXIgcXVlcnlQb29sID0gW11cbiAgZnVuY3Rpb24gYWxsb2NRdWVyeSAoKSB7XG4gICAgcmV0dXJuIHF1ZXJ5UG9vbC5wb3AoKSB8fCBleHRUaW1lci5jcmVhdGVRdWVyeUVYVCgpXG4gIH1cbiAgZnVuY3Rpb24gZnJlZVF1ZXJ5IChxdWVyeSkge1xuICAgIHF1ZXJ5UG9vbC5wdXNoKHF1ZXJ5KVxuICB9XG4gIC8vIFFVRVJZIFBPT0wgRU5EXG5cbiAgdmFyIHBlbmRpbmdRdWVyaWVzID0gW11cbiAgZnVuY3Rpb24gYmVnaW5RdWVyeSAoc3RhdHMpIHtcbiAgICB2YXIgcXVlcnkgPSBhbGxvY1F1ZXJ5KClcbiAgICBleHRUaW1lci5iZWdpblF1ZXJ5RVhUKEdMX1RJTUVfRUxBUFNFRF9FWFQsIHF1ZXJ5KVxuICAgIHBlbmRpbmdRdWVyaWVzLnB1c2gocXVlcnkpXG4gICAgcHVzaFNjb3BlU3RhdHMocGVuZGluZ1F1ZXJpZXMubGVuZ3RoIC0gMSwgcGVuZGluZ1F1ZXJpZXMubGVuZ3RoLCBzdGF0cylcbiAgfVxuXG4gIGZ1bmN0aW9uIGVuZFF1ZXJ5ICgpIHtcbiAgICBleHRUaW1lci5lbmRRdWVyeUVYVChHTF9USU1FX0VMQVBTRURfRVhUKVxuICB9XG5cbiAgLy9cbiAgLy8gUGVuZGluZyBzdGF0cyBwb29sLlxuICAvL1xuICBmdW5jdGlvbiBQZW5kaW5nU3RhdHMgKCkge1xuICAgIHRoaXMuc3RhcnRRdWVyeUluZGV4ID0gLTFcbiAgICB0aGlzLmVuZFF1ZXJ5SW5kZXggPSAtMVxuICAgIHRoaXMuc3VtID0gMFxuICAgIHRoaXMuc3RhdHMgPSBudWxsXG4gIH1cbiAgdmFyIHBlbmRpbmdTdGF0c1Bvb2wgPSBbXVxuICBmdW5jdGlvbiBhbGxvY1BlbmRpbmdTdGF0cyAoKSB7XG4gICAgcmV0dXJuIHBlbmRpbmdTdGF0c1Bvb2wucG9wKCkgfHwgbmV3IFBlbmRpbmdTdGF0cygpXG4gIH1cbiAgZnVuY3Rpb24gZnJlZVBlbmRpbmdTdGF0cyAocGVuZGluZ1N0YXRzKSB7XG4gICAgcGVuZGluZ1N0YXRzUG9vbC5wdXNoKHBlbmRpbmdTdGF0cylcbiAgfVxuICAvLyBQZW5kaW5nIHN0YXRzIHBvb2wgZW5kXG5cbiAgdmFyIHBlbmRpbmdTdGF0cyA9IFtdXG4gIGZ1bmN0aW9uIHB1c2hTY29wZVN0YXRzIChzdGFydCwgZW5kLCBzdGF0cykge1xuICAgIHZhciBwcyA9IGFsbG9jUGVuZGluZ1N0YXRzKClcbiAgICBwcy5zdGFydFF1ZXJ5SW5kZXggPSBzdGFydFxuICAgIHBzLmVuZFF1ZXJ5SW5kZXggPSBlbmRcbiAgICBwcy5zdW0gPSAwXG4gICAgcHMuc3RhdHMgPSBzdGF0c1xuICAgIHBlbmRpbmdTdGF0cy5wdXNoKHBzKVxuICB9XG5cbiAgLy8gd2Ugc2hvdWxkIGNhbGwgdGhpcyBhdCB0aGUgYmVnaW5uaW5nIG9mIHRoZSBmcmFtZSxcbiAgLy8gaW4gb3JkZXIgdG8gdXBkYXRlIGdwdVRpbWVcbiAgdmFyIHRpbWVTdW0gPSBbXVxuICB2YXIgcXVlcnlQdHIgPSBbXVxuICBmdW5jdGlvbiB1cGRhdGUgKCkge1xuICAgIHZhciBwdHIsIGlcblxuICAgIHZhciBuID0gcGVuZGluZ1F1ZXJpZXMubGVuZ3RoXG4gICAgaWYgKG4gPT09IDApIHtcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIC8vIFJlc2VydmUgc3BhY2VcbiAgICBxdWVyeVB0ci5sZW5ndGggPSBNYXRoLm1heChxdWVyeVB0ci5sZW5ndGgsIG4gKyAxKVxuICAgIHRpbWVTdW0ubGVuZ3RoID0gTWF0aC5tYXgodGltZVN1bS5sZW5ndGgsIG4gKyAxKVxuICAgIHRpbWVTdW1bMF0gPSAwXG4gICAgcXVlcnlQdHJbMF0gPSAwXG5cbiAgICAvLyBVcGRhdGUgYWxsIHBlbmRpbmcgdGltZXIgcXVlcmllc1xuICAgIHZhciBxdWVyeVRpbWUgPSAwXG4gICAgcHRyID0gMFxuICAgIGZvciAoaSA9IDA7IGkgPCBwZW5kaW5nUXVlcmllcy5sZW5ndGg7ICsraSkge1xuICAgICAgdmFyIHF1ZXJ5ID0gcGVuZGluZ1F1ZXJpZXNbaV1cbiAgICAgIGlmIChleHRUaW1lci5nZXRRdWVyeU9iamVjdEVYVChxdWVyeSwgR0xfUVVFUllfUkVTVUxUX0FWQUlMQUJMRV9FWFQpKSB7XG4gICAgICAgIHF1ZXJ5VGltZSArPSBleHRUaW1lci5nZXRRdWVyeU9iamVjdEVYVChxdWVyeSwgR0xfUVVFUllfUkVTVUxUX0VYVClcbiAgICAgICAgZnJlZVF1ZXJ5KHF1ZXJ5KVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGVuZGluZ1F1ZXJpZXNbcHRyKytdID0gcXVlcnlcbiAgICAgIH1cbiAgICAgIHRpbWVTdW1baSArIDFdID0gcXVlcnlUaW1lXG4gICAgICBxdWVyeVB0cltpICsgMV0gPSBwdHJcbiAgICB9XG4gICAgcGVuZGluZ1F1ZXJpZXMubGVuZ3RoID0gcHRyXG5cbiAgICAvLyBVcGRhdGUgYWxsIHBlbmRpbmcgc3RhdCBxdWVyaWVzXG4gICAgcHRyID0gMFxuICAgIGZvciAoaSA9IDA7IGkgPCBwZW5kaW5nU3RhdHMubGVuZ3RoOyArK2kpIHtcbiAgICAgIHZhciBzdGF0cyA9IHBlbmRpbmdTdGF0c1tpXVxuICAgICAgdmFyIHN0YXJ0ID0gc3RhdHMuc3RhcnRRdWVyeUluZGV4XG4gICAgICB2YXIgZW5kID0gc3RhdHMuZW5kUXVlcnlJbmRleFxuICAgICAgc3RhdHMuc3VtICs9IHRpbWVTdW1bZW5kXSAtIHRpbWVTdW1bc3RhcnRdXG4gICAgICB2YXIgc3RhcnRQdHIgPSBxdWVyeVB0cltzdGFydF1cbiAgICAgIHZhciBlbmRQdHIgPSBxdWVyeVB0cltlbmRdXG4gICAgICBpZiAoZW5kUHRyID09PSBzdGFydFB0cikge1xuICAgICAgICBzdGF0cy5zdGF0cy5ncHVUaW1lICs9IHN0YXRzLnN1bSAvIDFlNlxuICAgICAgICBmcmVlUGVuZGluZ1N0YXRzKHN0YXRzKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc3RhdHMuc3RhcnRRdWVyeUluZGV4ID0gc3RhcnRQdHJcbiAgICAgICAgc3RhdHMuZW5kUXVlcnlJbmRleCA9IGVuZFB0clxuICAgICAgICBwZW5kaW5nU3RhdHNbcHRyKytdID0gc3RhdHNcbiAgICAgIH1cbiAgICB9XG4gICAgcGVuZGluZ1N0YXRzLmxlbmd0aCA9IHB0clxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBiZWdpblF1ZXJ5OiBiZWdpblF1ZXJ5LFxuICAgIGVuZFF1ZXJ5OiBlbmRRdWVyeSxcbiAgICBwdXNoU2NvcGVTdGF0czogcHVzaFNjb3BlU3RhdHMsXG4gICAgdXBkYXRlOiB1cGRhdGUsXG4gICAgZ2V0TnVtUGVuZGluZ1F1ZXJpZXM6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiBwZW5kaW5nUXVlcmllcy5sZW5ndGhcbiAgICB9LFxuICAgIGNsZWFyOiBmdW5jdGlvbiAoKSB7XG4gICAgICBxdWVyeVBvb2wucHVzaC5hcHBseShxdWVyeVBvb2wsIHBlbmRpbmdRdWVyaWVzKVxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBxdWVyeVBvb2wubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgZXh0VGltZXIuZGVsZXRlUXVlcnlFWFQocXVlcnlQb29sW2ldKVxuICAgICAgfVxuICAgICAgcGVuZGluZ1F1ZXJpZXMubGVuZ3RoID0gMFxuICAgICAgcXVlcnlQb29sLmxlbmd0aCA9IDBcbiAgICB9LFxuICAgIHJlc3RvcmU6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHBlbmRpbmdRdWVyaWVzLmxlbmd0aCA9IDBcbiAgICAgIHF1ZXJ5UG9vbC5sZW5ndGggPSAwXG4gICAgfVxuICB9XG59XG4iLCIvKiBnbG9iYWxzIHBlcmZvcm1hbmNlICovXG5tb2R1bGUuZXhwb3J0cyA9XG4gICh0eXBlb2YgcGVyZm9ybWFuY2UgIT09ICd1bmRlZmluZWQnICYmIHBlcmZvcm1hbmNlLm5vdylcbiAgPyBmdW5jdGlvbiAoKSB7IHJldHVybiBwZXJmb3JtYW5jZS5ub3coKSB9XG4gIDogZnVuY3Rpb24gKCkgeyByZXR1cm4gKyhuZXcgRGF0ZSgpKSB9XG4iLCJ2YXIgZXh0ZW5kID0gcmVxdWlyZSgnLi9leHRlbmQnKVxuXG5mdW5jdGlvbiBzbGljZSAoeCkge1xuICByZXR1cm4gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoeClcbn1cblxuZnVuY3Rpb24gam9pbiAoeCkge1xuICByZXR1cm4gc2xpY2UoeCkuam9pbignJylcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjcmVhdGVFbnZpcm9ubWVudCAoKSB7XG4gIC8vIFVuaXF1ZSB2YXJpYWJsZSBpZCBjb3VudGVyXG4gIHZhciB2YXJDb3VudGVyID0gMFxuXG4gIC8vIExpbmtlZCB2YWx1ZXMgYXJlIHBhc3NlZCBmcm9tIHRoaXMgc2NvcGUgaW50byB0aGUgZ2VuZXJhdGVkIGNvZGUgYmxvY2tcbiAgLy8gQ2FsbGluZyBsaW5rKCkgcGFzc2VzIGEgdmFsdWUgaW50byB0aGUgZ2VuZXJhdGVkIHNjb3BlIGFuZCByZXR1cm5zXG4gIC8vIHRoZSB2YXJpYWJsZSBuYW1lIHdoaWNoIGl0IGlzIGJvdW5kIHRvXG4gIHZhciBsaW5rZWROYW1lcyA9IFtdXG4gIHZhciBsaW5rZWRWYWx1ZXMgPSBbXVxuICBmdW5jdGlvbiBsaW5rICh2YWx1ZSkge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGlua2VkVmFsdWVzLmxlbmd0aDsgKytpKSB7XG4gICAgICBpZiAobGlua2VkVmFsdWVzW2ldID09PSB2YWx1ZSkge1xuICAgICAgICByZXR1cm4gbGlua2VkTmFtZXNbaV1cbiAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgbmFtZSA9ICdnJyArICh2YXJDb3VudGVyKyspXG4gICAgbGlua2VkTmFtZXMucHVzaChuYW1lKVxuICAgIGxpbmtlZFZhbHVlcy5wdXNoKHZhbHVlKVxuICAgIHJldHVybiBuYW1lXG4gIH1cblxuICAvLyBjcmVhdGUgYSBjb2RlIGJsb2NrXG4gIGZ1bmN0aW9uIGJsb2NrICgpIHtcbiAgICB2YXIgY29kZSA9IFtdXG4gICAgZnVuY3Rpb24gcHVzaCAoKSB7XG4gICAgICBjb2RlLnB1c2guYXBwbHkoY29kZSwgc2xpY2UoYXJndW1lbnRzKSlcbiAgICB9XG5cbiAgICB2YXIgdmFycyA9IFtdXG4gICAgZnVuY3Rpb24gZGVmICgpIHtcbiAgICAgIHZhciBuYW1lID0gJ3YnICsgKHZhckNvdW50ZXIrKylcbiAgICAgIHZhcnMucHVzaChuYW1lKVxuXG4gICAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgY29kZS5wdXNoKG5hbWUsICc9JylcbiAgICAgICAgY29kZS5wdXNoLmFwcGx5KGNvZGUsIHNsaWNlKGFyZ3VtZW50cykpXG4gICAgICAgIGNvZGUucHVzaCgnOycpXG4gICAgICB9XG5cbiAgICAgIHJldHVybiBuYW1lXG4gICAgfVxuXG4gICAgcmV0dXJuIGV4dGVuZChwdXNoLCB7XG4gICAgICBkZWY6IGRlZixcbiAgICAgIHRvU3RyaW5nOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBqb2luKFtcbiAgICAgICAgICAodmFycy5sZW5ndGggPiAwID8gJ3ZhciAnICsgdmFycyArICc7JyA6ICcnKSxcbiAgICAgICAgICBqb2luKGNvZGUpXG4gICAgICAgIF0pXG4gICAgICB9XG4gICAgfSlcbiAgfVxuXG4gIGZ1bmN0aW9uIHNjb3BlICgpIHtcbiAgICB2YXIgZW50cnkgPSBibG9jaygpXG4gICAgdmFyIGV4aXQgPSBibG9jaygpXG5cbiAgICB2YXIgZW50cnlUb1N0cmluZyA9IGVudHJ5LnRvU3RyaW5nXG4gICAgdmFyIGV4aXRUb1N0cmluZyA9IGV4aXQudG9TdHJpbmdcblxuICAgIGZ1bmN0aW9uIHNhdmUgKG9iamVjdCwgcHJvcCkge1xuICAgICAgZXhpdChvYmplY3QsIHByb3AsICc9JywgZW50cnkuZGVmKG9iamVjdCwgcHJvcCksICc7JylcbiAgICB9XG5cbiAgICByZXR1cm4gZXh0ZW5kKGZ1bmN0aW9uICgpIHtcbiAgICAgIGVudHJ5LmFwcGx5KGVudHJ5LCBzbGljZShhcmd1bWVudHMpKVxuICAgIH0sIHtcbiAgICAgIGRlZjogZW50cnkuZGVmLFxuICAgICAgZW50cnk6IGVudHJ5LFxuICAgICAgZXhpdDogZXhpdCxcbiAgICAgIHNhdmU6IHNhdmUsXG4gICAgICBzZXQ6IGZ1bmN0aW9uIChvYmplY3QsIHByb3AsIHZhbHVlKSB7XG4gICAgICAgIHNhdmUob2JqZWN0LCBwcm9wKVxuICAgICAgICBlbnRyeShvYmplY3QsIHByb3AsICc9JywgdmFsdWUsICc7JylcbiAgICAgIH0sXG4gICAgICB0b1N0cmluZzogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gZW50cnlUb1N0cmluZygpICsgZXhpdFRvU3RyaW5nKClcbiAgICAgIH1cbiAgICB9KVxuICB9XG5cbiAgZnVuY3Rpb24gY29uZGl0aW9uYWwgKCkge1xuICAgIHZhciBwcmVkID0gam9pbihhcmd1bWVudHMpXG4gICAgdmFyIHRoZW5CbG9jayA9IHNjb3BlKClcbiAgICB2YXIgZWxzZUJsb2NrID0gc2NvcGUoKVxuXG4gICAgdmFyIHRoZW5Ub1N0cmluZyA9IHRoZW5CbG9jay50b1N0cmluZ1xuICAgIHZhciBlbHNlVG9TdHJpbmcgPSBlbHNlQmxvY2sudG9TdHJpbmdcblxuICAgIHJldHVybiBleHRlbmQodGhlbkJsb2NrLCB7XG4gICAgICB0aGVuOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoZW5CbG9jay5hcHBseSh0aGVuQmxvY2ssIHNsaWNlKGFyZ3VtZW50cykpXG4gICAgICAgIHJldHVybiB0aGlzXG4gICAgICB9LFxuICAgICAgZWxzZTogZnVuY3Rpb24gKCkge1xuICAgICAgICBlbHNlQmxvY2suYXBwbHkoZWxzZUJsb2NrLCBzbGljZShhcmd1bWVudHMpKVxuICAgICAgICByZXR1cm4gdGhpc1xuICAgICAgfSxcbiAgICAgIHRvU3RyaW5nOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBlbHNlQ2xhdXNlID0gZWxzZVRvU3RyaW5nKClcbiAgICAgICAgaWYgKGVsc2VDbGF1c2UpIHtcbiAgICAgICAgICBlbHNlQ2xhdXNlID0gJ2Vsc2V7JyArIGVsc2VDbGF1c2UgKyAnfSdcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gam9pbihbXG4gICAgICAgICAgJ2lmKCcsIHByZWQsICcpeycsXG4gICAgICAgICAgdGhlblRvU3RyaW5nKCksXG4gICAgICAgICAgJ30nLCBlbHNlQ2xhdXNlXG4gICAgICAgIF0pXG4gICAgICB9XG4gICAgfSlcbiAgfVxuXG4gIC8vIHByb2NlZHVyZSBsaXN0XG4gIHZhciBnbG9iYWxCbG9jayA9IGJsb2NrKClcbiAgdmFyIHByb2NlZHVyZXMgPSB7fVxuICBmdW5jdGlvbiBwcm9jIChuYW1lLCBjb3VudCkge1xuICAgIHZhciBhcmdzID0gW11cbiAgICBmdW5jdGlvbiBhcmcgKCkge1xuICAgICAgdmFyIG5hbWUgPSAnYScgKyBhcmdzLmxlbmd0aFxuICAgICAgYXJncy5wdXNoKG5hbWUpXG4gICAgICByZXR1cm4gbmFtZVxuICAgIH1cblxuICAgIGNvdW50ID0gY291bnQgfHwgMFxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY291bnQ7ICsraSkge1xuICAgICAgYXJnKClcbiAgICB9XG5cbiAgICB2YXIgYm9keSA9IHNjb3BlKClcbiAgICB2YXIgYm9keVRvU3RyaW5nID0gYm9keS50b1N0cmluZ1xuXG4gICAgdmFyIHJlc3VsdCA9IHByb2NlZHVyZXNbbmFtZV0gPSBleHRlbmQoYm9keSwge1xuICAgICAgYXJnOiBhcmcsXG4gICAgICB0b1N0cmluZzogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gam9pbihbXG4gICAgICAgICAgJ2Z1bmN0aW9uKCcsIGFyZ3Muam9pbigpLCAnKXsnLFxuICAgICAgICAgIGJvZHlUb1N0cmluZygpLFxuICAgICAgICAgICd9J1xuICAgICAgICBdKVxuICAgICAgfVxuICAgIH0pXG5cbiAgICByZXR1cm4gcmVzdWx0XG4gIH1cblxuICBmdW5jdGlvbiBjb21waWxlICgpIHtcbiAgICB2YXIgY29kZSA9IFsnXCJ1c2Ugc3RyaWN0XCI7JyxcbiAgICAgIGdsb2JhbEJsb2NrLFxuICAgICAgJ3JldHVybiB7J11cbiAgICBPYmplY3Qua2V5cyhwcm9jZWR1cmVzKS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICBjb2RlLnB1c2goJ1wiJywgbmFtZSwgJ1wiOicsIHByb2NlZHVyZXNbbmFtZV0udG9TdHJpbmcoKSwgJywnKVxuICAgIH0pXG4gICAgY29kZS5wdXNoKCd9JylcbiAgICB2YXIgc3JjID0gam9pbihjb2RlKVxuICAgICAgLnJlcGxhY2UoLzsvZywgJztcXG4nKVxuICAgICAgLnJlcGxhY2UoL30vZywgJ31cXG4nKVxuICAgICAgLnJlcGxhY2UoL3svZywgJ3tcXG4nKVxuICAgIHZhciBwcm9jID0gRnVuY3Rpb24uYXBwbHkobnVsbCwgbGlua2VkTmFtZXMuY29uY2F0KHNyYykpXG4gICAgcmV0dXJuIHByb2MuYXBwbHkobnVsbCwgbGlua2VkVmFsdWVzKVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBnbG9iYWw6IGdsb2JhbEJsb2NrLFxuICAgIGxpbms6IGxpbmssXG4gICAgYmxvY2s6IGJsb2NrLFxuICAgIHByb2M6IHByb2MsXG4gICAgc2NvcGU6IHNjb3BlLFxuICAgIGNvbmQ6IGNvbmRpdGlvbmFsLFxuICAgIGNvbXBpbGU6IGNvbXBpbGVcbiAgfVxufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoYmFzZSwgb3B0cykge1xuICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKG9wdHMpXG4gIGZvciAodmFyIGkgPSAwOyBpIDwga2V5cy5sZW5ndGg7ICsraSkge1xuICAgIGJhc2Vba2V5c1tpXV0gPSBvcHRzW2tleXNbaV1dXG4gIH1cbiAgcmV0dXJuIGJhc2Vcbn1cbiIsInZhciBwb29sID0gcmVxdWlyZSgnLi9wb29sJylcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHNoYXBlOiBhcnJheVNoYXBlLFxuICBmbGF0dGVuOiBmbGF0dGVuQXJyYXlcbn1cblxuZnVuY3Rpb24gZmxhdHRlbjFEIChhcnJheSwgbngsIG91dCkge1xuICBmb3IgKHZhciBpID0gMDsgaSA8IG54OyArK2kpIHtcbiAgICBvdXRbaV0gPSBhcnJheVtpXVxuICB9XG59XG5cbmZ1bmN0aW9uIGZsYXR0ZW4yRCAoYXJyYXksIG54LCBueSwgb3V0KSB7XG4gIHZhciBwdHIgPSAwXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbng7ICsraSkge1xuICAgIHZhciByb3cgPSBhcnJheVtpXVxuICAgIGZvciAodmFyIGogPSAwOyBqIDwgbnk7ICsraikge1xuICAgICAgb3V0W3B0cisrXSA9IHJvd1tqXVxuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBmbGF0dGVuM0QgKGFycmF5LCBueCwgbnksIG56LCBvdXQsIHB0cl8pIHtcbiAgdmFyIHB0ciA9IHB0cl9cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBueDsgKytpKSB7XG4gICAgdmFyIHJvdyA9IGFycmF5W2ldXG4gICAgZm9yICh2YXIgaiA9IDA7IGogPCBueTsgKytqKSB7XG4gICAgICB2YXIgY29sID0gcm93W2pdXG4gICAgICBmb3IgKHZhciBrID0gMDsgayA8IG56OyArK2spIHtcbiAgICAgICAgb3V0W3B0cisrXSA9IGNvbFtrXVxuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBmbGF0dGVuUmVjIChhcnJheSwgc2hhcGUsIGxldmVsLCBvdXQsIHB0cikge1xuICB2YXIgc3RyaWRlID0gMVxuICBmb3IgKHZhciBpID0gbGV2ZWwgKyAxOyBpIDwgc2hhcGUubGVuZ3RoOyArK2kpIHtcbiAgICBzdHJpZGUgKj0gc2hhcGVbaV1cbiAgfVxuICB2YXIgbiA9IHNoYXBlW2xldmVsXVxuICBpZiAoc2hhcGUubGVuZ3RoIC0gbGV2ZWwgPT09IDQpIHtcbiAgICB2YXIgbnggPSBzaGFwZVtsZXZlbCArIDFdXG4gICAgdmFyIG55ID0gc2hhcGVbbGV2ZWwgKyAyXVxuICAgIHZhciBueiA9IHNoYXBlW2xldmVsICsgM11cbiAgICBmb3IgKGkgPSAwOyBpIDwgbjsgKytpKSB7XG4gICAgICBmbGF0dGVuM0QoYXJyYXlbaV0sIG54LCBueSwgbnosIG91dCwgcHRyKVxuICAgICAgcHRyICs9IHN0cmlkZVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBmb3IgKGkgPSAwOyBpIDwgbjsgKytpKSB7XG4gICAgICBmbGF0dGVuUmVjKGFycmF5W2ldLCBzaGFwZSwgbGV2ZWwgKyAxLCBvdXQsIHB0cilcbiAgICAgIHB0ciArPSBzdHJpZGVcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gZmxhdHRlbkFycmF5IChhcnJheSwgc2hhcGUsIHR5cGUsIG91dF8pIHtcbiAgdmFyIHN6ID0gMVxuICBpZiAoc2hhcGUubGVuZ3RoKSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzaGFwZS5sZW5ndGg7ICsraSkge1xuICAgICAgc3ogKj0gc2hhcGVbaV1cbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgc3ogPSAwXG4gIH1cbiAgdmFyIG91dCA9IG91dF8gfHwgcG9vbC5hbGxvY1R5cGUodHlwZSwgc3opXG4gIHN3aXRjaCAoc2hhcGUubGVuZ3RoKSB7XG4gICAgY2FzZSAwOlxuICAgICAgYnJlYWtcbiAgICBjYXNlIDE6XG4gICAgICBmbGF0dGVuMUQoYXJyYXksIHNoYXBlWzBdLCBvdXQpXG4gICAgICBicmVha1xuICAgIGNhc2UgMjpcbiAgICAgIGZsYXR0ZW4yRChhcnJheSwgc2hhcGVbMF0sIHNoYXBlWzFdLCBvdXQpXG4gICAgICBicmVha1xuICAgIGNhc2UgMzpcbiAgICAgIGZsYXR0ZW4zRChhcnJheSwgc2hhcGVbMF0sIHNoYXBlWzFdLCBzaGFwZVsyXSwgb3V0LCAwKVxuICAgICAgYnJlYWtcbiAgICBkZWZhdWx0OlxuICAgICAgZmxhdHRlblJlYyhhcnJheSwgc2hhcGUsIDAsIG91dCwgMClcbiAgfVxuICByZXR1cm4gb3V0XG59XG5cbmZ1bmN0aW9uIGFycmF5U2hhcGUgKGFycmF5Xykge1xuICB2YXIgc2hhcGUgPSBbXVxuICBmb3IgKHZhciBhcnJheSA9IGFycmF5XzsgYXJyYXkubGVuZ3RoOyBhcnJheSA9IGFycmF5WzBdKSB7XG4gICAgc2hhcGUucHVzaChhcnJheS5sZW5ndGgpXG4gIH1cbiAgcmV0dXJuIHNoYXBlXG59XG4iLCJ2YXIgaXNUeXBlZEFycmF5ID0gcmVxdWlyZSgnLi9pcy10eXBlZC1hcnJheScpXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGlzQXJyYXlMaWtlIChzKSB7XG4gIHJldHVybiBBcnJheS5pc0FycmF5KHMpIHx8IGlzVHlwZWRBcnJheShzKVxufVxuIiwidmFyIGlzVHlwZWRBcnJheSA9IHJlcXVpcmUoJy4vaXMtdHlwZWQtYXJyYXknKVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGlzTkRBcnJheUxpa2UgKG9iaikge1xuICByZXR1cm4gKFxuICAgICEhb2JqICYmXG4gICAgdHlwZW9mIG9iaiA9PT0gJ29iamVjdCcgJiZcbiAgICBBcnJheS5pc0FycmF5KG9iai5zaGFwZSkgJiZcbiAgICBBcnJheS5pc0FycmF5KG9iai5zdHJpZGUpICYmXG4gICAgdHlwZW9mIG9iai5vZmZzZXQgPT09ICdudW1iZXInICYmXG4gICAgb2JqLnNoYXBlLmxlbmd0aCA9PT0gb2JqLnN0cmlkZS5sZW5ndGggJiZcbiAgICAoQXJyYXkuaXNBcnJheShvYmouZGF0YSkgfHxcbiAgICAgIGlzVHlwZWRBcnJheShvYmouZGF0YSkpKVxufVxuIiwidmFyIGR0eXBlcyA9IHJlcXVpcmUoJy4uL2NvbnN0YW50cy9hcnJheXR5cGVzLmpzb24nKVxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoeCkge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHgpIGluIGR0eXBlc1xufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBsb29wIChuLCBmKSB7XG4gIHZhciByZXN1bHQgPSBBcnJheShuKVxuICBmb3IgKHZhciBpID0gMDsgaSA8IG47ICsraSkge1xuICAgIHJlc3VsdFtpXSA9IGYoaSlcbiAgfVxuICByZXR1cm4gcmVzdWx0XG59XG4iLCJ2YXIgbG9vcCA9IHJlcXVpcmUoJy4vbG9vcCcpXG5cbnZhciBHTF9CWVRFID0gNTEyMFxudmFyIEdMX1VOU0lHTkVEX0JZVEUgPSA1MTIxXG52YXIgR0xfU0hPUlQgPSA1MTIyXG52YXIgR0xfVU5TSUdORURfU0hPUlQgPSA1MTIzXG52YXIgR0xfSU5UID0gNTEyNFxudmFyIEdMX1VOU0lHTkVEX0lOVCA9IDUxMjVcbnZhciBHTF9GTE9BVCA9IDUxMjZcblxudmFyIGJ1ZmZlclBvb2wgPSBsb29wKDgsIGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIFtdXG59KVxuXG5mdW5jdGlvbiBuZXh0UG93MTYgKHYpIHtcbiAgZm9yICh2YXIgaSA9IDE2OyBpIDw9ICgxIDw8IDI4KTsgaSAqPSAxNikge1xuICAgIGlmICh2IDw9IGkpIHtcbiAgICAgIHJldHVybiBpXG4gICAgfVxuICB9XG4gIHJldHVybiAwXG59XG5cbmZ1bmN0aW9uIGxvZzIgKHYpIHtcbiAgdmFyIHIsIHNoaWZ0XG4gIHIgPSAodiA+IDB4RkZGRikgPDwgNFxuICB2ID4+Pj0gclxuICBzaGlmdCA9ICh2ID4gMHhGRikgPDwgM1xuICB2ID4+Pj0gc2hpZnQ7IHIgfD0gc2hpZnRcbiAgc2hpZnQgPSAodiA+IDB4RikgPDwgMlxuICB2ID4+Pj0gc2hpZnQ7IHIgfD0gc2hpZnRcbiAgc2hpZnQgPSAodiA+IDB4MykgPDwgMVxuICB2ID4+Pj0gc2hpZnQ7IHIgfD0gc2hpZnRcbiAgcmV0dXJuIHIgfCAodiA+PiAxKVxufVxuXG5mdW5jdGlvbiBhbGxvYyAobikge1xuICB2YXIgc3ogPSBuZXh0UG93MTYobilcbiAgdmFyIGJpbiA9IGJ1ZmZlclBvb2xbbG9nMihzeikgPj4gMl1cbiAgaWYgKGJpbi5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIGJpbi5wb3AoKVxuICB9XG4gIHJldHVybiBuZXcgQXJyYXlCdWZmZXIoc3opXG59XG5cbmZ1bmN0aW9uIGZyZWUgKGJ1Zikge1xuICBidWZmZXJQb29sW2xvZzIoYnVmLmJ5dGVMZW5ndGgpID4+IDJdLnB1c2goYnVmKVxufVxuXG5mdW5jdGlvbiBhbGxvY1R5cGUgKHR5cGUsIG4pIHtcbiAgdmFyIHJlc3VsdCA9IG51bGxcbiAgc3dpdGNoICh0eXBlKSB7XG4gICAgY2FzZSBHTF9CWVRFOlxuICAgICAgcmVzdWx0ID0gbmV3IEludDhBcnJheShhbGxvYyhuKSwgMCwgbilcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBHTF9VTlNJR05FRF9CWVRFOlxuICAgICAgcmVzdWx0ID0gbmV3IFVpbnQ4QXJyYXkoYWxsb2MobiksIDAsIG4pXG4gICAgICBicmVha1xuICAgIGNhc2UgR0xfU0hPUlQ6XG4gICAgICByZXN1bHQgPSBuZXcgSW50MTZBcnJheShhbGxvYygyICogbiksIDAsIG4pXG4gICAgICBicmVha1xuICAgIGNhc2UgR0xfVU5TSUdORURfU0hPUlQ6XG4gICAgICByZXN1bHQgPSBuZXcgVWludDE2QXJyYXkoYWxsb2MoMiAqIG4pLCAwLCBuKVxuICAgICAgYnJlYWtcbiAgICBjYXNlIEdMX0lOVDpcbiAgICAgIHJlc3VsdCA9IG5ldyBJbnQzMkFycmF5KGFsbG9jKDQgKiBuKSwgMCwgbilcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBHTF9VTlNJR05FRF9JTlQ6XG4gICAgICByZXN1bHQgPSBuZXcgVWludDMyQXJyYXkoYWxsb2MoNCAqIG4pLCAwLCBuKVxuICAgICAgYnJlYWtcbiAgICBjYXNlIEdMX0ZMT0FUOlxuICAgICAgcmVzdWx0ID0gbmV3IEZsb2F0MzJBcnJheShhbGxvYyg0ICogbiksIDAsIG4pXG4gICAgICBicmVha1xuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gbnVsbFxuICB9XG4gIGlmIChyZXN1bHQubGVuZ3RoICE9PSBuKSB7XG4gICAgcmV0dXJuIHJlc3VsdC5zdWJhcnJheSgwLCBuKVxuICB9XG4gIHJldHVybiByZXN1bHRcbn1cblxuZnVuY3Rpb24gZnJlZVR5cGUgKGFycmF5KSB7XG4gIGZyZWUoYXJyYXkuYnVmZmVyKVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgYWxsb2M6IGFsbG9jLFxuICBmcmVlOiBmcmVlLFxuICBhbGxvY1R5cGU6IGFsbG9jVHlwZSxcbiAgZnJlZVR5cGU6IGZyZWVUeXBlXG59XG4iLCIvKiBnbG9iYWxzIHJlcXVlc3RBbmltYXRpb25GcmFtZSwgY2FuY2VsQW5pbWF0aW9uRnJhbWUgKi9cbmlmICh0eXBlb2YgcmVxdWVzdEFuaW1hdGlvbkZyYW1lID09PSAnZnVuY3Rpb24nICYmXG4gICAgdHlwZW9mIGNhbmNlbEFuaW1hdGlvbkZyYW1lID09PSAnZnVuY3Rpb24nKSB7XG4gIG1vZHVsZS5leHBvcnRzID0ge1xuICAgIG5leHQ6IGZ1bmN0aW9uICh4KSB7IHJldHVybiByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoeCkgfSxcbiAgICBjYW5jZWw6IGZ1bmN0aW9uICh4KSB7IHJldHVybiBjYW5jZWxBbmltYXRpb25GcmFtZSh4KSB9XG4gIH1cbn0gZWxzZSB7XG4gIG1vZHVsZS5leHBvcnRzID0ge1xuICAgIG5leHQ6IGZ1bmN0aW9uIChjYikge1xuICAgICAgcmV0dXJuIHNldFRpbWVvdXQoY2IsIDE2KVxuICAgIH0sXG4gICAgY2FuY2VsOiBjbGVhclRpbWVvdXRcbiAgfVxufVxuIiwidmFyIHBvb2wgPSByZXF1aXJlKCcuL3Bvb2wnKVxuXG52YXIgRkxPQVQgPSBuZXcgRmxvYXQzMkFycmF5KDEpXG52YXIgSU5UID0gbmV3IFVpbnQzMkFycmF5KEZMT0FULmJ1ZmZlcilcblxudmFyIEdMX1VOU0lHTkVEX1NIT1JUID0gNTEyM1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNvbnZlcnRUb0hhbGZGbG9hdCAoYXJyYXkpIHtcbiAgdmFyIHVzaG9ydHMgPSBwb29sLmFsbG9jVHlwZShHTF9VTlNJR05FRF9TSE9SVCwgYXJyYXkubGVuZ3RoKVxuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgYXJyYXkubGVuZ3RoOyArK2kpIHtcbiAgICBpZiAoaXNOYU4oYXJyYXlbaV0pKSB7XG4gICAgICB1c2hvcnRzW2ldID0gMHhmZmZmXG4gICAgfSBlbHNlIGlmIChhcnJheVtpXSA9PT0gSW5maW5pdHkpIHtcbiAgICAgIHVzaG9ydHNbaV0gPSAweDdjMDBcbiAgICB9IGVsc2UgaWYgKGFycmF5W2ldID09PSAtSW5maW5pdHkpIHtcbiAgICAgIHVzaG9ydHNbaV0gPSAweGZjMDBcbiAgICB9IGVsc2Uge1xuICAgICAgRkxPQVRbMF0gPSBhcnJheVtpXVxuICAgICAgdmFyIHggPSBJTlRbMF1cblxuICAgICAgdmFyIHNnbiA9ICh4ID4+PiAzMSkgPDwgMTVcbiAgICAgIHZhciBleHAgPSAoKHggPDwgMSkgPj4+IDI0KSAtIDEyN1xuICAgICAgdmFyIGZyYWMgPSAoeCA+PiAxMykgJiAoKDEgPDwgMTApIC0gMSlcblxuICAgICAgaWYgKGV4cCA8IC0yNCkge1xuICAgICAgICAvLyByb3VuZCBub24tcmVwcmVzZW50YWJsZSBkZW5vcm1hbHMgdG8gMFxuICAgICAgICB1c2hvcnRzW2ldID0gc2duXG4gICAgICB9IGVsc2UgaWYgKGV4cCA8IC0xNCkge1xuICAgICAgICAvLyBoYW5kbGUgZGVub3JtYWxzXG4gICAgICAgIHZhciBzID0gLTE0IC0gZXhwXG4gICAgICAgIHVzaG9ydHNbaV0gPSBzZ24gKyAoKGZyYWMgKyAoMSA8PCAxMCkpID4+IHMpXG4gICAgICB9IGVsc2UgaWYgKGV4cCA+IDE1KSB7XG4gICAgICAgIC8vIHJvdW5kIG92ZXJmbG93IHRvICsvLSBJbmZpbml0eVxuICAgICAgICB1c2hvcnRzW2ldID0gc2duICsgMHg3YzAwXG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBvdGhlcndpc2UgY29udmVydCBkaXJlY3RseVxuICAgICAgICB1c2hvcnRzW2ldID0gc2duICsgKChleHAgKyAxNSkgPDwgMTApICsgZnJhY1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB1c2hvcnRzXG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChvYmopIHtcbiAgcmV0dXJuIE9iamVjdC5rZXlzKG9iaikubWFwKGZ1bmN0aW9uIChrZXkpIHsgcmV0dXJuIG9ialtrZXldIH0pXG59XG4iLCIvLyBDb250ZXh0IGFuZCBjYW52YXMgY3JlYXRpb24gaGVscGVyIGZ1bmN0aW9uc1xuXG52YXIgZXh0ZW5kID0gcmVxdWlyZSgnLi91dGlsL2V4dGVuZCcpXG5cbmZ1bmN0aW9uIGNyZWF0ZUNhbnZhcyAoZWxlbWVudCwgb25Eb25lLCBwaXhlbFJhdGlvKSB7XG4gIHZhciBjYW52YXMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjYW52YXMnKVxuICBleHRlbmQoY2FudmFzLnN0eWxlLCB7XG4gICAgYm9yZGVyOiAwLFxuICAgIG1hcmdpbjogMCxcbiAgICBwYWRkaW5nOiAwLFxuICAgIHRvcDogMCxcbiAgICBsZWZ0OiAwXG4gIH0pXG4gIGVsZW1lbnQuYXBwZW5kQ2hpbGQoY2FudmFzKVxuXG4gIGlmIChlbGVtZW50ID09PSBkb2N1bWVudC5ib2R5KSB7XG4gICAgY2FudmFzLnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJ1xuICAgIGV4dGVuZChlbGVtZW50LnN0eWxlLCB7XG4gICAgICBtYXJnaW46IDAsXG4gICAgICBwYWRkaW5nOiAwXG4gICAgfSlcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlc2l6ZSAoKSB7XG4gICAgdmFyIHcgPSB3aW5kb3cuaW5uZXJXaWR0aFxuICAgIHZhciBoID0gd2luZG93LmlubmVySGVpZ2h0XG4gICAgaWYgKGVsZW1lbnQgIT09IGRvY3VtZW50LmJvZHkpIHtcbiAgICAgIHZhciBib3VuZHMgPSBlbGVtZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpXG4gICAgICB3ID0gYm91bmRzLnJpZ2h0IC0gYm91bmRzLmxlZnRcbiAgICAgIGggPSBib3VuZHMudG9wIC0gYm91bmRzLmJvdHRvbVxuICAgIH1cbiAgICBjYW52YXMud2lkdGggPSBwaXhlbFJhdGlvICogd1xuICAgIGNhbnZhcy5oZWlnaHQgPSBwaXhlbFJhdGlvICogaFxuICAgIGV4dGVuZChjYW52YXMuc3R5bGUsIHtcbiAgICAgIHdpZHRoOiB3ICsgJ3B4JyxcbiAgICAgIGhlaWdodDogaCArICdweCdcbiAgICB9KVxuICB9XG5cbiAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsIHJlc2l6ZSwgZmFsc2UpXG5cbiAgZnVuY3Rpb24gb25EZXN0cm95ICgpIHtcbiAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcigncmVzaXplJywgcmVzaXplKVxuICAgIGVsZW1lbnQucmVtb3ZlQ2hpbGQoY2FudmFzKVxuICB9XG5cbiAgcmVzaXplKClcblxuICByZXR1cm4ge1xuICAgIGNhbnZhczogY2FudmFzLFxuICAgIG9uRGVzdHJveTogb25EZXN0cm95XG4gIH1cbn1cblxuZnVuY3Rpb24gY3JlYXRlQ29udGV4dCAoY2FudmFzLCBjb250ZXhBdHRyaWJ1dGVzKSB7XG4gIGZ1bmN0aW9uIGdldCAobmFtZSkge1xuICAgIHRyeSB7XG4gICAgICByZXR1cm4gY2FudmFzLmdldENvbnRleHQobmFtZSwgY29udGV4QXR0cmlidXRlcylcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cbiAgfVxuICByZXR1cm4gKFxuICAgIGdldCgnd2ViZ2wnKSB8fFxuICAgIGdldCgnZXhwZXJpbWVudGFsLXdlYmdsJykgfHxcbiAgICBnZXQoJ3dlYmdsLWV4cGVyaW1lbnRhbCcpXG4gIClcbn1cblxuZnVuY3Rpb24gaXNIVE1MRWxlbWVudCAob2JqKSB7XG4gIHJldHVybiAoXG4gICAgdHlwZW9mIG9iai5ub2RlTmFtZSA9PT0gJ3N0cmluZycgJiZcbiAgICB0eXBlb2Ygb2JqLmFwcGVuZENoaWxkID09PSAnZnVuY3Rpb24nICYmXG4gICAgdHlwZW9mIG9iai5nZXRCb3VuZGluZ0NsaWVudFJlY3QgPT09ICdmdW5jdGlvbidcbiAgKVxufVxuXG5mdW5jdGlvbiBpc1dlYkdMQ29udGV4dCAob2JqKSB7XG4gIHJldHVybiAoXG4gICAgdHlwZW9mIG9iai5kcmF3QXJyYXlzID09PSAnZnVuY3Rpb24nIHx8XG4gICAgdHlwZW9mIG9iai5kcmF3RWxlbWVudHMgPT09ICdmdW5jdGlvbidcbiAgKVxufVxuXG5mdW5jdGlvbiBwYXJzZUV4dGVuc2lvbnMgKGlucHV0KSB7XG4gIGlmICh0eXBlb2YgaW5wdXQgPT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIGlucHV0LnNwbGl0KClcbiAgfVxuICBcbiAgcmV0dXJuIGlucHV0XG59XG5cbmZ1bmN0aW9uIGdldEVsZW1lbnQgKGRlc2MpIHtcbiAgaWYgKHR5cGVvZiBkZXNjID09PSAnc3RyaW5nJykge1xuICAgIFxuICAgIHJldHVybiBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGRlc2MpXG4gIH1cbiAgcmV0dXJuIGRlc2Ncbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBwYXJzZUFyZ3MgKGFyZ3NfKSB7XG4gIHZhciBhcmdzID0gYXJnc18gfHwge31cbiAgdmFyIGVsZW1lbnQsIGNvbnRhaW5lciwgY2FudmFzLCBnbFxuICB2YXIgY29udGV4dEF0dHJpYnV0ZXMgPSB7fVxuICB2YXIgZXh0ZW5zaW9ucyA9IFtdXG4gIHZhciBvcHRpb25hbEV4dGVuc2lvbnMgPSBbXVxuICB2YXIgcGl4ZWxSYXRpbyA9ICh0eXBlb2Ygd2luZG93ID09PSAndW5kZWZpbmVkJyA/IDEgOiB3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpbylcbiAgdmFyIHByb2ZpbGUgPSBmYWxzZVxuICB2YXIgb25Eb25lID0gZnVuY3Rpb24gKGVycikge1xuICAgIGlmIChlcnIpIHtcbiAgICAgIFxuICAgIH1cbiAgfVxuICB2YXIgb25EZXN0cm95ID0gZnVuY3Rpb24gKCkge31cbiAgaWYgKHR5cGVvZiBhcmdzID09PSAnc3RyaW5nJykge1xuICAgIFxuICAgIGVsZW1lbnQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGFyZ3MpXG4gICAgXG4gIH0gZWxzZSBpZiAodHlwZW9mIGFyZ3MgPT09ICdvYmplY3QnKSB7XG4gICAgaWYgKGlzSFRNTEVsZW1lbnQoYXJncykpIHtcbiAgICAgIGVsZW1lbnQgPSBhcmdzXG4gICAgfSBlbHNlIGlmIChpc1dlYkdMQ29udGV4dChhcmdzKSkge1xuICAgICAgZ2wgPSBhcmdzXG4gICAgICBjYW52YXMgPSBnbC5jYW52YXNcbiAgICB9IGVsc2Uge1xuICAgICAgXG4gICAgICBpZiAoJ2dsJyBpbiBhcmdzKSB7XG4gICAgICAgIGdsID0gYXJncy5nbFxuICAgICAgfSBlbHNlIGlmICgnY2FudmFzJyBpbiBhcmdzKSB7XG4gICAgICAgIGNhbnZhcyA9IGdldEVsZW1lbnQoYXJncy5jYW52YXMpXG4gICAgICB9IGVsc2UgaWYgKCdjb250YWluZXInIGluIGFyZ3MpIHtcbiAgICAgICAgY29udGFpbmVyID0gZ2V0RWxlbWVudChhcmdzLmNvbnRhaW5lcilcbiAgICAgIH1cbiAgICAgIGlmICgnYXR0cmlidXRlcycgaW4gYXJncykge1xuICAgICAgICBjb250ZXh0QXR0cmlidXRlcyA9IGFyZ3MuYXR0cmlidXRlc1xuICAgICAgICBcbiAgICAgIH1cbiAgICAgIGlmICgnZXh0ZW5zaW9ucycgaW4gYXJncykge1xuICAgICAgICBleHRlbnNpb25zID0gcGFyc2VFeHRlbnNpb25zKGFyZ3MuZXh0ZW5zaW9ucylcbiAgICAgIH1cbiAgICAgIGlmICgnb3B0aW9uYWxFeHRlbnNpb25zJyBpbiBhcmdzKSB7XG4gICAgICAgIG9wdGlvbmFsRXh0ZW5zaW9ucyA9IHBhcnNlRXh0ZW5zaW9ucyhhcmdzLm9wdGlvbmFsRXh0ZW5zaW9ucylcbiAgICAgIH1cbiAgICAgIGlmICgnb25Eb25lJyBpbiBhcmdzKSB7XG4gICAgICAgIFxuICAgICAgICBvbkRvbmUgPSBhcmdzLm9uRG9uZVxuICAgICAgfVxuICAgICAgaWYgKCdwcm9maWxlJyBpbiBhcmdzKSB7XG4gICAgICAgIHByb2ZpbGUgPSAhIWFyZ3MucHJvZmlsZVxuICAgICAgfVxuICAgICAgaWYgKCdwaXhlbFJhdGlvJyBpbiBhcmdzKSB7XG4gICAgICAgIHBpeGVsUmF0aW8gPSArYXJncy5waXhlbFJhdGlvXG4gICAgICAgIFxuICAgICAgfVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBcbiAgfVxuXG4gIGlmIChlbGVtZW50KSB7XG4gICAgaWYgKGVsZW1lbnQubm9kZU5hbWUudG9Mb3dlckNhc2UoKSA9PT0gJ2NhbnZhcycpIHtcbiAgICAgIGNhbnZhcyA9IGVsZW1lbnRcbiAgICB9IGVsc2Uge1xuICAgICAgY29udGFpbmVyID0gZWxlbWVudFxuICAgIH1cbiAgfVxuXG4gIGlmICghZ2wpIHtcbiAgICBpZiAoIWNhbnZhcykge1xuICAgICAgXG4gICAgICB2YXIgcmVzdWx0ID0gY3JlYXRlQ2FudmFzKGNvbnRhaW5lciB8fCBkb2N1bWVudC5ib2R5LCBvbkRvbmUsIHBpeGVsUmF0aW8pXG4gICAgICBpZiAoIXJlc3VsdCkge1xuICAgICAgICByZXR1cm4gbnVsbFxuICAgICAgfVxuICAgICAgY2FudmFzID0gcmVzdWx0LmNhbnZhc1xuICAgICAgb25EZXN0cm95ID0gcmVzdWx0Lm9uRGVzdHJveVxuICAgIH1cbiAgICBnbCA9IGNyZWF0ZUNvbnRleHQoY2FudmFzLCBjb250ZXh0QXR0cmlidXRlcylcbiAgfVxuXG4gIGlmICghZ2wpIHtcbiAgICBvbkRlc3Ryb3koKVxuICAgIG9uRG9uZSgnd2ViZ2wgbm90IHN1cHBvcnRlZCwgdHJ5IHVwZ3JhZGluZyB5b3VyIGJyb3dzZXIgb3IgZ3JhcGhpY3MgZHJpdmVycyBodHRwOi8vZ2V0LndlYmdsLm9yZycpXG4gICAgcmV0dXJuIG51bGxcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgZ2w6IGdsLFxuICAgIGNhbnZhczogY2FudmFzLFxuICAgIGNvbnRhaW5lcjogY29udGFpbmVyLFxuICAgIGV4dGVuc2lvbnM6IGV4dGVuc2lvbnMsXG4gICAgb3B0aW9uYWxFeHRlbnNpb25zOiBvcHRpb25hbEV4dGVuc2lvbnMsXG4gICAgcGl4ZWxSYXRpbzogcGl4ZWxSYXRpbyxcbiAgICBwcm9maWxlOiBwcm9maWxlLFxuICAgIG9uRG9uZTogb25Eb25lLFxuICAgIG9uRGVzdHJveTogb25EZXN0cm95XG4gIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gaWRlbnRpdHk7XG5cbi8qKlxuICogU2V0IGEgbWF0NCB0byB0aGUgaWRlbnRpdHkgbWF0cml4XG4gKlxuICogQHBhcmFtIHttYXQ0fSBvdXQgdGhlIHJlY2VpdmluZyBtYXRyaXhcbiAqIEByZXR1cm5zIHttYXQ0fSBvdXRcbiAqL1xuZnVuY3Rpb24gaWRlbnRpdHkob3V0KSB7XG4gICAgb3V0WzBdID0gMTtcbiAgICBvdXRbMV0gPSAwO1xuICAgIG91dFsyXSA9IDA7XG4gICAgb3V0WzNdID0gMDtcbiAgICBvdXRbNF0gPSAwO1xuICAgIG91dFs1XSA9IDE7XG4gICAgb3V0WzZdID0gMDtcbiAgICBvdXRbN10gPSAwO1xuICAgIG91dFs4XSA9IDA7XG4gICAgb3V0WzldID0gMDtcbiAgICBvdXRbMTBdID0gMTtcbiAgICBvdXRbMTFdID0gMDtcbiAgICBvdXRbMTJdID0gMDtcbiAgICBvdXRbMTNdID0gMDtcbiAgICBvdXRbMTRdID0gMDtcbiAgICBvdXRbMTVdID0gMTtcbiAgICByZXR1cm4gb3V0O1xufTsiLCJ2YXIgaWRlbnRpdHkgPSByZXF1aXJlKCcuL2lkZW50aXR5Jyk7XG5cbm1vZHVsZS5leHBvcnRzID0gbG9va0F0O1xuXG4vKipcbiAqIEdlbmVyYXRlcyBhIGxvb2stYXQgbWF0cml4IHdpdGggdGhlIGdpdmVuIGV5ZSBwb3NpdGlvbiwgZm9jYWwgcG9pbnQsIGFuZCB1cCBheGlzXG4gKlxuICogQHBhcmFtIHttYXQ0fSBvdXQgbWF0NCBmcnVzdHVtIG1hdHJpeCB3aWxsIGJlIHdyaXR0ZW4gaW50b1xuICogQHBhcmFtIHt2ZWMzfSBleWUgUG9zaXRpb24gb2YgdGhlIHZpZXdlclxuICogQHBhcmFtIHt2ZWMzfSBjZW50ZXIgUG9pbnQgdGhlIHZpZXdlciBpcyBsb29raW5nIGF0XG4gKiBAcGFyYW0ge3ZlYzN9IHVwIHZlYzMgcG9pbnRpbmcgdXBcbiAqIEByZXR1cm5zIHttYXQ0fSBvdXRcbiAqL1xuZnVuY3Rpb24gbG9va0F0KG91dCwgZXllLCBjZW50ZXIsIHVwKSB7XG4gICAgdmFyIHgwLCB4MSwgeDIsIHkwLCB5MSwgeTIsIHowLCB6MSwgejIsIGxlbixcbiAgICAgICAgZXlleCA9IGV5ZVswXSxcbiAgICAgICAgZXlleSA9IGV5ZVsxXSxcbiAgICAgICAgZXlleiA9IGV5ZVsyXSxcbiAgICAgICAgdXB4ID0gdXBbMF0sXG4gICAgICAgIHVweSA9IHVwWzFdLFxuICAgICAgICB1cHogPSB1cFsyXSxcbiAgICAgICAgY2VudGVyeCA9IGNlbnRlclswXSxcbiAgICAgICAgY2VudGVyeSA9IGNlbnRlclsxXSxcbiAgICAgICAgY2VudGVyeiA9IGNlbnRlclsyXTtcblxuICAgIGlmIChNYXRoLmFicyhleWV4IC0gY2VudGVyeCkgPCAwLjAwMDAwMSAmJlxuICAgICAgICBNYXRoLmFicyhleWV5IC0gY2VudGVyeSkgPCAwLjAwMDAwMSAmJlxuICAgICAgICBNYXRoLmFicyhleWV6IC0gY2VudGVyeikgPCAwLjAwMDAwMSkge1xuICAgICAgICByZXR1cm4gaWRlbnRpdHkob3V0KTtcbiAgICB9XG5cbiAgICB6MCA9IGV5ZXggLSBjZW50ZXJ4O1xuICAgIHoxID0gZXlleSAtIGNlbnRlcnk7XG4gICAgejIgPSBleWV6IC0gY2VudGVyejtcblxuICAgIGxlbiA9IDEgLyBNYXRoLnNxcnQoejAgKiB6MCArIHoxICogejEgKyB6MiAqIHoyKTtcbiAgICB6MCAqPSBsZW47XG4gICAgejEgKj0gbGVuO1xuICAgIHoyICo9IGxlbjtcblxuICAgIHgwID0gdXB5ICogejIgLSB1cHogKiB6MTtcbiAgICB4MSA9IHVweiAqIHowIC0gdXB4ICogejI7XG4gICAgeDIgPSB1cHggKiB6MSAtIHVweSAqIHowO1xuICAgIGxlbiA9IE1hdGguc3FydCh4MCAqIHgwICsgeDEgKiB4MSArIHgyICogeDIpO1xuICAgIGlmICghbGVuKSB7XG4gICAgICAgIHgwID0gMDtcbiAgICAgICAgeDEgPSAwO1xuICAgICAgICB4MiA9IDA7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgbGVuID0gMSAvIGxlbjtcbiAgICAgICAgeDAgKj0gbGVuO1xuICAgICAgICB4MSAqPSBsZW47XG4gICAgICAgIHgyICo9IGxlbjtcbiAgICB9XG5cbiAgICB5MCA9IHoxICogeDIgLSB6MiAqIHgxO1xuICAgIHkxID0gejIgKiB4MCAtIHowICogeDI7XG4gICAgeTIgPSB6MCAqIHgxIC0gejEgKiB4MDtcblxuICAgIGxlbiA9IE1hdGguc3FydCh5MCAqIHkwICsgeTEgKiB5MSArIHkyICogeTIpO1xuICAgIGlmICghbGVuKSB7XG4gICAgICAgIHkwID0gMDtcbiAgICAgICAgeTEgPSAwO1xuICAgICAgICB5MiA9IDA7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgbGVuID0gMSAvIGxlbjtcbiAgICAgICAgeTAgKj0gbGVuO1xuICAgICAgICB5MSAqPSBsZW47XG4gICAgICAgIHkyICo9IGxlbjtcbiAgICB9XG5cbiAgICBvdXRbMF0gPSB4MDtcbiAgICBvdXRbMV0gPSB5MDtcbiAgICBvdXRbMl0gPSB6MDtcbiAgICBvdXRbM10gPSAwO1xuICAgIG91dFs0XSA9IHgxO1xuICAgIG91dFs1XSA9IHkxO1xuICAgIG91dFs2XSA9IHoxO1xuICAgIG91dFs3XSA9IDA7XG4gICAgb3V0WzhdID0geDI7XG4gICAgb3V0WzldID0geTI7XG4gICAgb3V0WzEwXSA9IHoyO1xuICAgIG91dFsxMV0gPSAwO1xuICAgIG91dFsxMl0gPSAtKHgwICogZXlleCArIHgxICogZXlleSArIHgyICogZXlleik7XG4gICAgb3V0WzEzXSA9IC0oeTAgKiBleWV4ICsgeTEgKiBleWV5ICsgeTIgKiBleWV6KTtcbiAgICBvdXRbMTRdID0gLSh6MCAqIGV5ZXggKyB6MSAqIGV5ZXkgKyB6MiAqIGV5ZXopO1xuICAgIG91dFsxNV0gPSAxO1xuXG4gICAgcmV0dXJuIG91dDtcbn07IiwibW9kdWxlLmV4cG9ydHMgPSBwZXJzcGVjdGl2ZTtcblxuLyoqXG4gKiBHZW5lcmF0ZXMgYSBwZXJzcGVjdGl2ZSBwcm9qZWN0aW9uIG1hdHJpeCB3aXRoIHRoZSBnaXZlbiBib3VuZHNcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCBtYXQ0IGZydXN0dW0gbWF0cml4IHdpbGwgYmUgd3JpdHRlbiBpbnRvXG4gKiBAcGFyYW0ge251bWJlcn0gZm92eSBWZXJ0aWNhbCBmaWVsZCBvZiB2aWV3IGluIHJhZGlhbnNcbiAqIEBwYXJhbSB7bnVtYmVyfSBhc3BlY3QgQXNwZWN0IHJhdGlvLiB0eXBpY2FsbHkgdmlld3BvcnQgd2lkdGgvaGVpZ2h0XG4gKiBAcGFyYW0ge251bWJlcn0gbmVhciBOZWFyIGJvdW5kIG9mIHRoZSBmcnVzdHVtXG4gKiBAcGFyYW0ge251bWJlcn0gZmFyIEZhciBib3VuZCBvZiB0aGUgZnJ1c3R1bVxuICogQHJldHVybnMge21hdDR9IG91dFxuICovXG5mdW5jdGlvbiBwZXJzcGVjdGl2ZShvdXQsIGZvdnksIGFzcGVjdCwgbmVhciwgZmFyKSB7XG4gICAgdmFyIGYgPSAxLjAgLyBNYXRoLnRhbihmb3Z5IC8gMiksXG4gICAgICAgIG5mID0gMSAvIChuZWFyIC0gZmFyKTtcbiAgICBvdXRbMF0gPSBmIC8gYXNwZWN0O1xuICAgIG91dFsxXSA9IDA7XG4gICAgb3V0WzJdID0gMDtcbiAgICBvdXRbM10gPSAwO1xuICAgIG91dFs0XSA9IDA7XG4gICAgb3V0WzVdID0gZjtcbiAgICBvdXRbNl0gPSAwO1xuICAgIG91dFs3XSA9IDA7XG4gICAgb3V0WzhdID0gMDtcbiAgICBvdXRbOV0gPSAwO1xuICAgIG91dFsxMF0gPSAoZmFyICsgbmVhcikgKiBuZjtcbiAgICBvdXRbMTFdID0gLTE7XG4gICAgb3V0WzEyXSA9IDA7XG4gICAgb3V0WzEzXSA9IDA7XG4gICAgb3V0WzE0XSA9ICgyICogZmFyICogbmVhcikgKiBuZjtcbiAgICBvdXRbMTVdID0gMDtcbiAgICByZXR1cm4gb3V0O1xufTsiLCIndXNlIHN0cmljdCdcblxubW9kdWxlLmV4cG9ydHMgPSBtb3VzZUxpc3RlblxuXG52YXIgbW91c2UgPSByZXF1aXJlKCdtb3VzZS1ldmVudCcpXG5cbmZ1bmN0aW9uIG1vdXNlTGlzdGVuKGVsZW1lbnQsIGNhbGxiYWNrKSB7XG4gIGlmKCFjYWxsYmFjaykge1xuICAgIGNhbGxiYWNrID0gZWxlbWVudFxuICAgIGVsZW1lbnQgPSB3aW5kb3dcbiAgfVxuXG4gIHZhciBidXR0b25TdGF0ZSA9IDBcbiAgdmFyIHggPSAwXG4gIHZhciB5ID0gMFxuICB2YXIgbW9kcyA9IHtcbiAgICBzaGlmdDogICBmYWxzZSxcbiAgICBhbHQ6ICAgICBmYWxzZSxcbiAgICBjb250cm9sOiBmYWxzZSxcbiAgICBtZXRhOiAgICBmYWxzZVxuICB9XG4gIHZhciBhdHRhY2hlZCA9IGZhbHNlXG5cbiAgZnVuY3Rpb24gdXBkYXRlTW9kcyhldikge1xuICAgIHZhciBjaGFuZ2VkID0gZmFsc2VcbiAgICBpZignYWx0S2V5JyBpbiBldikge1xuICAgICAgY2hhbmdlZCA9IGNoYW5nZWQgfHwgZXYuYWx0S2V5ICE9PSBtb2RzLmFsdFxuICAgICAgbW9kcy5hbHQgPSAhIWV2LmFsdEtleVxuICAgIH1cbiAgICBpZignc2hpZnRLZXknIGluIGV2KSB7XG4gICAgICBjaGFuZ2VkID0gY2hhbmdlZCB8fCBldi5zaGlmdEtleSAhPT0gbW9kcy5zaGlmdFxuICAgICAgbW9kcy5zaGlmdCA9ICEhZXYuc2hpZnRLZXlcbiAgICB9XG4gICAgaWYoJ2N0cmxLZXknIGluIGV2KSB7XG4gICAgICBjaGFuZ2VkID0gY2hhbmdlZCB8fCBldi5jdHJsS2V5ICE9PSBtb2RzLmNvbnRyb2xcbiAgICAgIG1vZHMuY29udHJvbCA9ICEhZXYuY3RybEtleVxuICAgIH1cbiAgICBpZignbWV0YUtleScgaW4gZXYpIHtcbiAgICAgIGNoYW5nZWQgPSBjaGFuZ2VkIHx8IGV2Lm1ldGFLZXkgIT09IG1vZHMubWV0YVxuICAgICAgbW9kcy5tZXRhID0gISFldi5tZXRhS2V5XG4gICAgfVxuICAgIHJldHVybiBjaGFuZ2VkXG4gIH1cblxuICBmdW5jdGlvbiBoYW5kbGVFdmVudChuZXh0QnV0dG9ucywgZXYpIHtcbiAgICB2YXIgbmV4dFggPSBtb3VzZS54KGV2KVxuICAgIHZhciBuZXh0WSA9IG1vdXNlLnkoZXYpXG4gICAgaWYoJ2J1dHRvbnMnIGluIGV2KSB7XG4gICAgICBuZXh0QnV0dG9ucyA9IGV2LmJ1dHRvbnN8MFxuICAgIH1cbiAgICBpZihuZXh0QnV0dG9ucyAhPT0gYnV0dG9uU3RhdGUgfHxcbiAgICAgICBuZXh0WCAhPT0geCB8fFxuICAgICAgIG5leHRZICE9PSB5IHx8XG4gICAgICAgdXBkYXRlTW9kcyhldikpIHtcbiAgICAgIGJ1dHRvblN0YXRlID0gbmV4dEJ1dHRvbnN8MFxuICAgICAgeCA9IG5leHRYfHwwXG4gICAgICB5ID0gbmV4dFl8fDBcbiAgICAgIGNhbGxiYWNrICYmIGNhbGxiYWNrKGJ1dHRvblN0YXRlLCB4LCB5LCBtb2RzKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGNsZWFyU3RhdGUoZXYpIHtcbiAgICBoYW5kbGVFdmVudCgwLCBldilcbiAgfVxuXG4gIGZ1bmN0aW9uIGhhbmRsZUJsdXIoKSB7XG4gICAgaWYoYnV0dG9uU3RhdGUgfHxcbiAgICAgIHggfHxcbiAgICAgIHkgfHxcbiAgICAgIG1vZHMuc2hpZnQgfHxcbiAgICAgIG1vZHMuYWx0IHx8XG4gICAgICBtb2RzLm1ldGEgfHxcbiAgICAgIG1vZHMuY29udHJvbCkge1xuXG4gICAgICB4ID0geSA9IDBcbiAgICAgIGJ1dHRvblN0YXRlID0gMFxuICAgICAgbW9kcy5zaGlmdCA9IG1vZHMuYWx0ID0gbW9kcy5jb250cm9sID0gbW9kcy5tZXRhID0gZmFsc2VcbiAgICAgIGNhbGxiYWNrICYmIGNhbGxiYWNrKDAsIDAsIDAsIG1vZHMpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gaGFuZGxlTW9kcyhldikge1xuICAgIGlmKHVwZGF0ZU1vZHMoZXYpKSB7XG4gICAgICBjYWxsYmFjayAmJiBjYWxsYmFjayhidXR0b25TdGF0ZSwgeCwgeSwgbW9kcylcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBoYW5kbGVNb3VzZU1vdmUoZXYpIHtcbiAgICBpZihtb3VzZS5idXR0b25zKGV2KSA9PT0gMCkge1xuICAgICAgaGFuZGxlRXZlbnQoMCwgZXYpXG4gICAgfSBlbHNlIHtcbiAgICAgIGhhbmRsZUV2ZW50KGJ1dHRvblN0YXRlLCBldilcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBoYW5kbGVNb3VzZURvd24oZXYpIHtcbiAgICBoYW5kbGVFdmVudChidXR0b25TdGF0ZSB8IG1vdXNlLmJ1dHRvbnMoZXYpLCBldilcbiAgfVxuXG4gIGZ1bmN0aW9uIGhhbmRsZU1vdXNlVXAoZXYpIHtcbiAgICBoYW5kbGVFdmVudChidXR0b25TdGF0ZSAmIH5tb3VzZS5idXR0b25zKGV2KSwgZXYpXG4gIH1cblxuICBmdW5jdGlvbiBhdHRhY2hMaXN0ZW5lcnMoKSB7XG4gICAgaWYoYXR0YWNoZWQpIHtcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICBhdHRhY2hlZCA9IHRydWVcblxuICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vtb3ZlJywgaGFuZGxlTW91c2VNb3ZlKVxuXG4gICAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWRvd24nLCBoYW5kbGVNb3VzZURvd24pXG5cbiAgICBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNldXAnLCBoYW5kbGVNb3VzZVVwKVxuXG4gICAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWxlYXZlJywgY2xlYXJTdGF0ZSlcbiAgICBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZW50ZXInLCBjbGVhclN0YXRlKVxuICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2VvdXQnLCBjbGVhclN0YXRlKVxuICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2VvdmVyJywgY2xlYXJTdGF0ZSlcblxuICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignYmx1cicsIGhhbmRsZUJsdXIpXG5cbiAgICBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleXVwJywgaGFuZGxlTW9kcylcbiAgICBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBoYW5kbGVNb2RzKVxuICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5cHJlc3MnLCBoYW5kbGVNb2RzKVxuXG4gICAgaWYoZWxlbWVudCAhPT0gd2luZG93KSB7XG4gICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignYmx1cicsIGhhbmRsZUJsdXIpXG5cbiAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdrZXl1cCcsIGhhbmRsZU1vZHMpXG4gICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIGhhbmRsZU1vZHMpXG4gICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigna2V5cHJlc3MnLCBoYW5kbGVNb2RzKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGRldGFjaExpc3RlbmVycygpIHtcbiAgICBpZighYXR0YWNoZWQpIHtcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICBhdHRhY2hlZCA9IGZhbHNlXG5cbiAgICBlbGVtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vdXNlbW92ZScsIGhhbmRsZU1vdXNlTW92ZSlcblxuICAgIGVsZW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcignbW91c2Vkb3duJywgaGFuZGxlTW91c2VEb3duKVxuXG4gICAgZWxlbWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZXVwJywgaGFuZGxlTW91c2VVcClcblxuICAgIGVsZW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcignbW91c2VsZWF2ZScsIGNsZWFyU3RhdGUpXG4gICAgZWxlbWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZWVudGVyJywgY2xlYXJTdGF0ZSlcbiAgICBlbGVtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vdXNlb3V0JywgY2xlYXJTdGF0ZSlcbiAgICBlbGVtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vdXNlb3ZlcicsIGNsZWFyU3RhdGUpXG5cbiAgICBlbGVtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2JsdXInLCBoYW5kbGVCbHVyKVxuXG4gICAgZWxlbWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdrZXl1cCcsIGhhbmRsZU1vZHMpXG4gICAgZWxlbWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdrZXlkb3duJywgaGFuZGxlTW9kcylcbiAgICBlbGVtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2tleXByZXNzJywgaGFuZGxlTW9kcylcblxuICAgIGlmKGVsZW1lbnQgIT09IHdpbmRvdykge1xuICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2JsdXInLCBoYW5kbGVCbHVyKVxuXG4gICAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcigna2V5dXAnLCBoYW5kbGVNb2RzKVxuICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBoYW5kbGVNb2RzKVxuICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2tleXByZXNzJywgaGFuZGxlTW9kcylcbiAgICB9XG4gIH1cblxuICAvL0F0dGFjaCBsaXN0ZW5lcnNcbiAgYXR0YWNoTGlzdGVuZXJzKClcblxuICB2YXIgcmVzdWx0ID0ge1xuICAgIGVsZW1lbnQ6IGVsZW1lbnRcbiAgfVxuXG4gIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzKHJlc3VsdCwge1xuICAgIGVuYWJsZWQ6IHtcbiAgICAgIGdldDogZnVuY3Rpb24oKSB7IHJldHVybiBhdHRhY2hlZCB9LFxuICAgICAgc2V0OiBmdW5jdGlvbihmKSB7XG4gICAgICAgIGlmKGYpIHtcbiAgICAgICAgICBhdHRhY2hMaXN0ZW5lcnMoKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGRldGFjaExpc3RlbmVyc1xuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgZW51bWVyYWJsZTogdHJ1ZVxuICAgIH0sXG4gICAgYnV0dG9uczoge1xuICAgICAgZ2V0OiBmdW5jdGlvbigpIHsgcmV0dXJuIGJ1dHRvblN0YXRlIH0sXG4gICAgICBlbnVtZXJhYmxlOiB0cnVlXG4gICAgfSxcbiAgICB4OiB7XG4gICAgICBnZXQ6IGZ1bmN0aW9uKCkgeyByZXR1cm4geCB9LFxuICAgICAgZW51bWVyYWJsZTogdHJ1ZVxuICAgIH0sXG4gICAgeToge1xuICAgICAgZ2V0OiBmdW5jdGlvbigpIHsgcmV0dXJuIHkgfSxcbiAgICAgIGVudW1lcmFibGU6IHRydWVcbiAgICB9LFxuICAgIG1vZHM6IHtcbiAgICAgIGdldDogZnVuY3Rpb24oKSB7IHJldHVybiBtb2RzIH0sXG4gICAgICBlbnVtZXJhYmxlOiB0cnVlXG4gICAgfVxuICB9KVxuXG4gIHJldHVybiByZXN1bHRcbn1cbiIsIid1c2Ugc3RyaWN0J1xuXG5mdW5jdGlvbiBtb3VzZUJ1dHRvbnMoZXYpIHtcbiAgaWYodHlwZW9mIGV2ID09PSAnb2JqZWN0Jykge1xuICAgIGlmKCdidXR0b25zJyBpbiBldikge1xuICAgICAgcmV0dXJuIGV2LmJ1dHRvbnNcbiAgICB9IGVsc2UgaWYoJ3doaWNoJyBpbiBldikge1xuICAgICAgdmFyIGIgPSBldi53aGljaFxuICAgICAgaWYoYiA9PT0gMikge1xuICAgICAgICByZXR1cm4gNFxuICAgICAgfSBlbHNlIGlmKGIgPT09IDMpIHtcbiAgICAgICAgcmV0dXJuIDJcbiAgICAgIH0gZWxzZSBpZihiID4gMCkge1xuICAgICAgICByZXR1cm4gMTw8KGItMSlcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYoJ2J1dHRvbicgaW4gZXYpIHtcbiAgICAgIHZhciBiID0gZXYuYnV0dG9uXG4gICAgICBpZihiID09PSAxKSB7XG4gICAgICAgIHJldHVybiA0XG4gICAgICB9IGVsc2UgaWYoYiA9PT0gMikge1xuICAgICAgICByZXR1cm4gMlxuICAgICAgfSBlbHNlIGlmKGIgPj0gMCkge1xuICAgICAgICByZXR1cm4gMTw8YlxuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gMFxufVxuZXhwb3J0cy5idXR0b25zID0gbW91c2VCdXR0b25zXG5cbmZ1bmN0aW9uIG1vdXNlRWxlbWVudChldikge1xuICByZXR1cm4gZXYudGFyZ2V0IHx8IGV2LnNyY0VsZW1lbnQgfHwgd2luZG93XG59XG5leHBvcnRzLmVsZW1lbnQgPSBtb3VzZUVsZW1lbnRcblxuZnVuY3Rpb24gbW91c2VSZWxhdGl2ZVgoZXYpIHtcbiAgaWYodHlwZW9mIGV2ID09PSAnb2JqZWN0Jykge1xuICAgIGlmKCdvZmZzZXRYJyBpbiBldikge1xuICAgICAgcmV0dXJuIGV2Lm9mZnNldFhcbiAgICB9XG4gICAgdmFyIHRhcmdldCA9IG1vdXNlRWxlbWVudChldilcbiAgICB2YXIgYm91bmRzID0gdGFyZ2V0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpXG4gICAgcmV0dXJuIGV2LmNsaWVudFggLSBib3VuZHMubGVmdFxuICB9XG4gIHJldHVybiAwXG59XG5leHBvcnRzLnggPSBtb3VzZVJlbGF0aXZlWFxuXG5mdW5jdGlvbiBtb3VzZVJlbGF0aXZlWShldikge1xuICBpZih0eXBlb2YgZXYgPT09ICdvYmplY3QnKSB7XG4gICAgaWYoJ29mZnNldFknIGluIGV2KSB7XG4gICAgICByZXR1cm4gZXYub2Zmc2V0WVxuICAgIH1cbiAgICB2YXIgdGFyZ2V0ID0gbW91c2VFbGVtZW50KGV2KVxuICAgIHZhciBib3VuZHMgPSB0YXJnZXQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KClcbiAgICByZXR1cm4gZXYuY2xpZW50WSAtIGJvdW5kcy50b3BcbiAgfVxuICByZXR1cm4gMFxufVxuZXhwb3J0cy55ID0gbW91c2VSZWxhdGl2ZVlcbiIsIid1c2Ugc3RyaWN0J1xuXG52YXIgdG9QWCA9IHJlcXVpcmUoJ3RvLXB4JylcblxubW9kdWxlLmV4cG9ydHMgPSBtb3VzZVdoZWVsTGlzdGVuXG5cbmZ1bmN0aW9uIG1vdXNlV2hlZWxMaXN0ZW4oZWxlbWVudCwgY2FsbGJhY2ssIG5vU2Nyb2xsKSB7XG4gIGlmKHR5cGVvZiBlbGVtZW50ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgbm9TY3JvbGwgPSAhIWNhbGxiYWNrXG4gICAgY2FsbGJhY2sgPSBlbGVtZW50XG4gICAgZWxlbWVudCA9IHdpbmRvd1xuICB9XG4gIHZhciBsaW5lSGVpZ2h0ID0gdG9QWCgnZXgnLCBlbGVtZW50KVxuICB2YXIgbGlzdGVuZXIgPSBmdW5jdGlvbihldikge1xuICAgIGlmKG5vU2Nyb2xsKSB7XG4gICAgICBldi5wcmV2ZW50RGVmYXVsdCgpXG4gICAgfVxuICAgIHZhciBkeCA9IGV2LmRlbHRhWCB8fCAwXG4gICAgdmFyIGR5ID0gZXYuZGVsdGFZIHx8IDBcbiAgICB2YXIgZHogPSBldi5kZWx0YVogfHwgMFxuICAgIHZhciBtb2RlID0gZXYuZGVsdGFNb2RlXG4gICAgdmFyIHNjYWxlID0gMVxuICAgIHN3aXRjaChtb2RlKSB7XG4gICAgICBjYXNlIDE6XG4gICAgICAgIHNjYWxlID0gbGluZUhlaWdodFxuICAgICAgYnJlYWtcbiAgICAgIGNhc2UgMjpcbiAgICAgICAgc2NhbGUgPSB3aW5kb3cuaW5uZXJIZWlnaHRcbiAgICAgIGJyZWFrXG4gICAgfVxuICAgIGR4ICo9IHNjYWxlXG4gICAgZHkgKj0gc2NhbGVcbiAgICBkeiAqPSBzY2FsZVxuICAgIGlmKGR4IHx8IGR5IHx8IGR6KSB7XG4gICAgICByZXR1cm4gY2FsbGJhY2soZHgsIGR5LCBkeiwgZXYpXG4gICAgfVxuICB9XG4gIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignd2hlZWwnLCBsaXN0ZW5lcilcbiAgcmV0dXJuIGxpc3RlbmVyXG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHBhcnNlVW5pdChzdHIsIG91dCkge1xuICAgIGlmICghb3V0KVxuICAgICAgICBvdXQgPSBbIDAsICcnIF1cblxuICAgIHN0ciA9IFN0cmluZyhzdHIpXG4gICAgdmFyIG51bSA9IHBhcnNlRmxvYXQoc3RyLCAxMClcbiAgICBvdXRbMF0gPSBudW1cbiAgICBvdXRbMV0gPSBzdHIubWF0Y2goL1tcXGQuXFwtXFwrXSpcXHMqKC4qKS8pWzFdIHx8ICcnXG4gICAgcmV0dXJuIG91dFxufSIsIid1c2Ugc3RyaWN0J1xuXG52YXIgcGFyc2VVbml0ID0gcmVxdWlyZSgncGFyc2UtdW5pdCcpXG5cbm1vZHVsZS5leHBvcnRzID0gdG9QWFxuXG52YXIgUElYRUxTX1BFUl9JTkNIID0gOTZcblxuZnVuY3Rpb24gZ2V0UHJvcGVydHlJblBYKGVsZW1lbnQsIHByb3ApIHtcbiAgdmFyIHBhcnRzID0gcGFyc2VVbml0KGdldENvbXB1dGVkU3R5bGUoZWxlbWVudCkuZ2V0UHJvcGVydHlWYWx1ZShwcm9wKSlcbiAgcmV0dXJuIHBhcnRzWzBdICogdG9QWChwYXJ0c1sxXSwgZWxlbWVudClcbn1cblxuLy9UaGlzIGJydXRhbCBoYWNrIGlzIG5lZWRlZFxuZnVuY3Rpb24gZ2V0U2l6ZUJydXRhbCh1bml0LCBlbGVtZW50KSB7XG4gIHZhciB0ZXN0RElWID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2JylcbiAgdGVzdERJVi5zdHlsZVsnZm9udC1zaXplJ10gPSAnMTI4JyArIHVuaXRcbiAgZWxlbWVudC5hcHBlbmRDaGlsZCh0ZXN0RElWKVxuICB2YXIgc2l6ZSA9IGdldFByb3BlcnR5SW5QWCh0ZXN0RElWLCAnZm9udC1zaXplJykgLyAxMjhcbiAgZWxlbWVudC5yZW1vdmVDaGlsZCh0ZXN0RElWKVxuICByZXR1cm4gc2l6ZVxufVxuXG5mdW5jdGlvbiB0b1BYKHN0ciwgZWxlbWVudCkge1xuICBlbGVtZW50ID0gZWxlbWVudCB8fCBkb2N1bWVudC5ib2R5XG4gIHN0ciA9IChzdHIgfHwgJ3B4JykudHJpbSgpLnRvTG93ZXJDYXNlKClcbiAgaWYoZWxlbWVudCA9PT0gd2luZG93IHx8IGVsZW1lbnQgPT09IGRvY3VtZW50KSB7XG4gICAgZWxlbWVudCA9IGRvY3VtZW50LmJvZHkgXG4gIH1cbiAgc3dpdGNoKHN0cikge1xuICAgIGNhc2UgJyUnOiAgLy9BbWJpZ3VvdXMsIG5vdCBzdXJlIGlmIHdlIHNob3VsZCB1c2Ugd2lkdGggb3IgaGVpZ2h0XG4gICAgICByZXR1cm4gZWxlbWVudC5jbGllbnRIZWlnaHQgLyAxMDAuMFxuICAgIGNhc2UgJ2NoJzpcbiAgICBjYXNlICdleCc6XG4gICAgICByZXR1cm4gZ2V0U2l6ZUJydXRhbChzdHIsIGVsZW1lbnQpXG4gICAgY2FzZSAnZW0nOlxuICAgICAgcmV0dXJuIGdldFByb3BlcnR5SW5QWChlbGVtZW50LCAnZm9udC1zaXplJylcbiAgICBjYXNlICdyZW0nOlxuICAgICAgcmV0dXJuIGdldFByb3BlcnR5SW5QWChkb2N1bWVudC5ib2R5LCAnZm9udC1zaXplJylcbiAgICBjYXNlICd2dyc6XG4gICAgICByZXR1cm4gd2luZG93LmlubmVyV2lkdGgvMTAwXG4gICAgY2FzZSAndmgnOlxuICAgICAgcmV0dXJuIHdpbmRvdy5pbm5lckhlaWdodC8xMDBcbiAgICBjYXNlICd2bWluJzpcbiAgICAgIHJldHVybiBNYXRoLm1pbih3aW5kb3cuaW5uZXJXaWR0aCwgd2luZG93LmlubmVySGVpZ2h0KSAvIDEwMFxuICAgIGNhc2UgJ3ZtYXgnOlxuICAgICAgcmV0dXJuIE1hdGgubWF4KHdpbmRvdy5pbm5lcldpZHRoLCB3aW5kb3cuaW5uZXJIZWlnaHQpIC8gMTAwXG4gICAgY2FzZSAnaW4nOlxuICAgICAgcmV0dXJuIFBJWEVMU19QRVJfSU5DSFxuICAgIGNhc2UgJ2NtJzpcbiAgICAgIHJldHVybiBQSVhFTFNfUEVSX0lOQ0ggLyAyLjU0XG4gICAgY2FzZSAnbW0nOlxuICAgICAgcmV0dXJuIFBJWEVMU19QRVJfSU5DSCAvIDI1LjRcbiAgICBjYXNlICdwdCc6XG4gICAgICByZXR1cm4gUElYRUxTX1BFUl9JTkNIIC8gNzJcbiAgICBjYXNlICdwYyc6XG4gICAgICByZXR1cm4gUElYRUxTX1BFUl9JTkNIIC8gNlxuICB9XG4gIHJldHVybiAxXG59IiwiXG52YXIgZXh0ZW5kID0gcmVxdWlyZSgnLi9saWIvdXRpbC9leHRlbmQnKVxudmFyIGR5bmFtaWMgPSByZXF1aXJlKCcuL2xpYi9keW5hbWljJylcbnZhciByYWYgPSByZXF1aXJlKCcuL2xpYi91dGlsL3JhZicpXG52YXIgY2xvY2sgPSByZXF1aXJlKCcuL2xpYi91dGlsL2Nsb2NrJylcbnZhciBjcmVhdGVTdHJpbmdTdG9yZSA9IHJlcXVpcmUoJy4vbGliL3N0cmluZ3MnKVxudmFyIGluaXRXZWJHTCA9IHJlcXVpcmUoJy4vbGliL3dlYmdsJylcbnZhciB3cmFwRXh0ZW5zaW9ucyA9IHJlcXVpcmUoJy4vbGliL2V4dGVuc2lvbicpXG52YXIgd3JhcExpbWl0cyA9IHJlcXVpcmUoJy4vbGliL2xpbWl0cycpXG52YXIgd3JhcEJ1ZmZlcnMgPSByZXF1aXJlKCcuL2xpYi9idWZmZXInKVxudmFyIHdyYXBFbGVtZW50cyA9IHJlcXVpcmUoJy4vbGliL2VsZW1lbnRzJylcbnZhciB3cmFwVGV4dHVyZXMgPSByZXF1aXJlKCcuL2xpYi90ZXh0dXJlJylcbnZhciB3cmFwUmVuZGVyYnVmZmVycyA9IHJlcXVpcmUoJy4vbGliL3JlbmRlcmJ1ZmZlcicpXG52YXIgd3JhcEZyYW1lYnVmZmVycyA9IHJlcXVpcmUoJy4vbGliL2ZyYW1lYnVmZmVyJylcbnZhciB3cmFwQXR0cmlidXRlcyA9IHJlcXVpcmUoJy4vbGliL2F0dHJpYnV0ZScpXG52YXIgd3JhcFNoYWRlcnMgPSByZXF1aXJlKCcuL2xpYi9zaGFkZXInKVxudmFyIHdyYXBSZWFkID0gcmVxdWlyZSgnLi9saWIvcmVhZCcpXG52YXIgY3JlYXRlQ29yZSA9IHJlcXVpcmUoJy4vbGliL2NvcmUnKVxudmFyIGNyZWF0ZVN0YXRzID0gcmVxdWlyZSgnLi9saWIvc3RhdHMnKVxudmFyIGNyZWF0ZVRpbWVyID0gcmVxdWlyZSgnLi9saWIvdGltZXInKVxuXG52YXIgR0xfQ09MT1JfQlVGRkVSX0JJVCA9IDE2Mzg0XG52YXIgR0xfREVQVEhfQlVGRkVSX0JJVCA9IDI1NlxudmFyIEdMX1NURU5DSUxfQlVGRkVSX0JJVCA9IDEwMjRcblxudmFyIEdMX0FSUkFZX0JVRkZFUiA9IDM0OTYyXG5cbnZhciBDT05URVhUX0xPU1RfRVZFTlQgPSAnd2ViZ2xjb250ZXh0bG9zdCdcbnZhciBDT05URVhUX1JFU1RPUkVEX0VWRU5UID0gJ3dlYmdsY29udGV4dHJlc3RvcmVkJ1xuXG52YXIgRFlOX1BST1AgPSAxXG52YXIgRFlOX0NPTlRFWFQgPSAyXG52YXIgRFlOX1NUQVRFID0gM1xuXG5mdW5jdGlvbiBmaW5kIChoYXlzdGFjaywgbmVlZGxlKSB7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgaGF5c3RhY2subGVuZ3RoOyArK2kpIHtcbiAgICBpZiAoaGF5c3RhY2tbaV0gPT09IG5lZWRsZSkge1xuICAgICAgcmV0dXJuIGlcbiAgICB9XG4gIH1cbiAgcmV0dXJuIC0xXG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gd3JhcFJFR0wgKGFyZ3MpIHtcbiAgdmFyIGNvbmZpZyA9IGluaXRXZWJHTChhcmdzKVxuICBpZiAoIWNvbmZpZykge1xuICAgIHJldHVybiBudWxsXG4gIH1cblxuICB2YXIgZ2wgPSBjb25maWcuZ2xcbiAgdmFyIGdsQXR0cmlidXRlcyA9IGdsLmdldENvbnRleHRBdHRyaWJ1dGVzKClcbiAgdmFyIGNvbnRleHRMb3N0ID0gZ2wuaXNDb250ZXh0TG9zdCgpXG5cbiAgdmFyIGV4dGVuc2lvblN0YXRlID0gd3JhcEV4dGVuc2lvbnMoZ2wsIGNvbmZpZylcbiAgaWYgKCFleHRlbnNpb25TdGF0ZSkge1xuICAgIHJldHVybiBudWxsXG4gIH1cblxuICB2YXIgc3RyaW5nU3RvcmUgPSBjcmVhdGVTdHJpbmdTdG9yZSgpXG4gIHZhciBzdGF0cyA9IGNyZWF0ZVN0YXRzKClcbiAgdmFyIGV4dGVuc2lvbnMgPSBleHRlbnNpb25TdGF0ZS5leHRlbnNpb25zXG4gIHZhciB0aW1lciA9IGNyZWF0ZVRpbWVyKGdsLCBleHRlbnNpb25zKVxuXG4gIHZhciBTVEFSVF9USU1FID0gY2xvY2soKVxuICB2YXIgV0lEVEggPSBnbC5kcmF3aW5nQnVmZmVyV2lkdGhcbiAgdmFyIEhFSUdIVCA9IGdsLmRyYXdpbmdCdWZmZXJIZWlnaHRcblxuICB2YXIgY29udGV4dFN0YXRlID0ge1xuICAgIHRpY2s6IDAsXG4gICAgdGltZTogMCxcbiAgICB2aWV3cG9ydFdpZHRoOiBXSURUSCxcbiAgICB2aWV3cG9ydEhlaWdodDogSEVJR0hULFxuICAgIGZyYW1lYnVmZmVyV2lkdGg6IFdJRFRILFxuICAgIGZyYW1lYnVmZmVySGVpZ2h0OiBIRUlHSFQsXG4gICAgZHJhd2luZ0J1ZmZlcldpZHRoOiBXSURUSCxcbiAgICBkcmF3aW5nQnVmZmVySGVpZ2h0OiBIRUlHSFQsXG4gICAgcGl4ZWxSYXRpbzogY29uZmlnLnBpeGVsUmF0aW9cbiAgfVxuICB2YXIgdW5pZm9ybVN0YXRlID0ge31cbiAgdmFyIGRyYXdTdGF0ZSA9IHtcbiAgICBlbGVtZW50czogbnVsbCxcbiAgICBwcmltaXRpdmU6IDQsIC8vIEdMX1RSSUFOR0xFU1xuICAgIGNvdW50OiAtMSxcbiAgICBvZmZzZXQ6IDAsXG4gICAgaW5zdGFuY2VzOiAtMVxuICB9XG5cbiAgdmFyIGxpbWl0cyA9IHdyYXBMaW1pdHMoZ2wsIGV4dGVuc2lvbnMpXG4gIHZhciBidWZmZXJTdGF0ZSA9IHdyYXBCdWZmZXJzKGdsLCBzdGF0cywgY29uZmlnKVxuICB2YXIgZWxlbWVudFN0YXRlID0gd3JhcEVsZW1lbnRzKGdsLCBleHRlbnNpb25zLCBidWZmZXJTdGF0ZSwgc3RhdHMpXG4gIHZhciBhdHRyaWJ1dGVTdGF0ZSA9IHdyYXBBdHRyaWJ1dGVzKFxuICAgIGdsLFxuICAgIGV4dGVuc2lvbnMsXG4gICAgbGltaXRzLFxuICAgIGJ1ZmZlclN0YXRlLFxuICAgIHN0cmluZ1N0b3JlKVxuICB2YXIgc2hhZGVyU3RhdGUgPSB3cmFwU2hhZGVycyhnbCwgc3RyaW5nU3RvcmUsIHN0YXRzLCBjb25maWcpXG4gIHZhciB0ZXh0dXJlU3RhdGUgPSB3cmFwVGV4dHVyZXMoXG4gICAgZ2wsXG4gICAgZXh0ZW5zaW9ucyxcbiAgICBsaW1pdHMsXG4gICAgZnVuY3Rpb24gKCkgeyBjb3JlLnByb2NzLnBvbGwoKSB9LFxuICAgIGNvbnRleHRTdGF0ZSxcbiAgICBzdGF0cyxcbiAgICBjb25maWcpXG4gIHZhciByZW5kZXJidWZmZXJTdGF0ZSA9IHdyYXBSZW5kZXJidWZmZXJzKGdsLCBleHRlbnNpb25zLCBsaW1pdHMsIHN0YXRzLCBjb25maWcpXG4gIHZhciBmcmFtZWJ1ZmZlclN0YXRlID0gd3JhcEZyYW1lYnVmZmVycyhcbiAgICBnbCxcbiAgICBleHRlbnNpb25zLFxuICAgIGxpbWl0cyxcbiAgICB0ZXh0dXJlU3RhdGUsXG4gICAgcmVuZGVyYnVmZmVyU3RhdGUsXG4gICAgc3RhdHMpXG4gIHZhciBjb3JlID0gY3JlYXRlQ29yZShcbiAgICBnbCxcbiAgICBzdHJpbmdTdG9yZSxcbiAgICBleHRlbnNpb25zLFxuICAgIGxpbWl0cyxcbiAgICBidWZmZXJTdGF0ZSxcbiAgICBlbGVtZW50U3RhdGUsXG4gICAgdGV4dHVyZVN0YXRlLFxuICAgIGZyYW1lYnVmZmVyU3RhdGUsXG4gICAgdW5pZm9ybVN0YXRlLFxuICAgIGF0dHJpYnV0ZVN0YXRlLFxuICAgIHNoYWRlclN0YXRlLFxuICAgIGRyYXdTdGF0ZSxcbiAgICBjb250ZXh0U3RhdGUsXG4gICAgdGltZXIsXG4gICAgY29uZmlnKVxuICB2YXIgcmVhZFBpeGVscyA9IHdyYXBSZWFkKFxuICAgIGdsLFxuICAgIGZyYW1lYnVmZmVyU3RhdGUsXG4gICAgY29yZS5wcm9jcy5wb2xsLFxuICAgIGNvbnRleHRTdGF0ZSxcbiAgICBnbEF0dHJpYnV0ZXMsIGV4dGVuc2lvbnMpXG5cbiAgdmFyIG5leHRTdGF0ZSA9IGNvcmUubmV4dFxuICB2YXIgY2FudmFzID0gZ2wuY2FudmFzXG5cbiAgdmFyIHJhZkNhbGxiYWNrcyA9IFtdXG4gIHZhciBsb3NzQ2FsbGJhY2tzID0gW11cbiAgdmFyIHJlc3RvcmVDYWxsYmFja3MgPSBbXVxuICB2YXIgZGVzdHJveUNhbGxiYWNrcyA9IFtjb25maWcub25EZXN0cm95XVxuXG4gIHZhciBhY3RpdmVSQUYgPSBudWxsXG4gIGZ1bmN0aW9uIGhhbmRsZVJBRiAoKSB7XG4gICAgaWYgKHJhZkNhbGxiYWNrcy5sZW5ndGggPT09IDApIHtcbiAgICAgIGlmICh0aW1lcikge1xuICAgICAgICB0aW1lci51cGRhdGUoKVxuICAgICAgfVxuICAgICAgYWN0aXZlUkFGID0gbnVsbFxuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgLy8gc2NoZWR1bGUgbmV4dCBhbmltYXRpb24gZnJhbWVcbiAgICBhY3RpdmVSQUYgPSByYWYubmV4dChoYW5kbGVSQUYpXG5cbiAgICAvLyBwb2xsIGZvciBjaGFuZ2VzXG4gICAgcG9sbCgpXG5cbiAgICAvLyBmaXJlIGEgY2FsbGJhY2sgZm9yIGFsbCBwZW5kaW5nIHJhZnNcbiAgICBmb3IgKHZhciBpID0gcmFmQ2FsbGJhY2tzLmxlbmd0aCAtIDE7IGkgPj0gMDsgLS1pKSB7XG4gICAgICB2YXIgY2IgPSByYWZDYWxsYmFja3NbaV1cbiAgICAgIGlmIChjYikge1xuICAgICAgICBjYihjb250ZXh0U3RhdGUsIG51bGwsIDApXG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gZmx1c2ggYWxsIHBlbmRpbmcgd2ViZ2wgY2FsbHNcbiAgICBnbC5mbHVzaCgpXG5cbiAgICAvLyBwb2xsIEdQVSB0aW1lcnMgKmFmdGVyKiBnbC5mbHVzaCBzbyB3ZSBkb24ndCBkZWxheSBjb21tYW5kIGRpc3BhdGNoXG4gICAgaWYgKHRpbWVyKSB7XG4gICAgICB0aW1lci51cGRhdGUoKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHN0YXJ0UkFGICgpIHtcbiAgICBpZiAoIWFjdGl2ZVJBRiAmJiByYWZDYWxsYmFja3MubGVuZ3RoID4gMCkge1xuICAgICAgYWN0aXZlUkFGID0gcmFmLm5leHQoaGFuZGxlUkFGKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHN0b3BSQUYgKCkge1xuICAgIGlmIChhY3RpdmVSQUYpIHtcbiAgICAgIHJhZi5jYW5jZWwoaGFuZGxlUkFGKVxuICAgICAgYWN0aXZlUkFGID0gbnVsbFxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGhhbmRsZUNvbnRleHRMb3NzIChldmVudCkge1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KClcblxuICAgIC8vIHNldCBjb250ZXh0IGxvc3QgZmxhZ1xuICAgIGNvbnRleHRMb3N0ID0gdHJ1ZVxuXG4gICAgLy8gcGF1c2UgcmVxdWVzdCBhbmltYXRpb24gZnJhbWVcbiAgICBzdG9wUkFGKClcblxuICAgIC8vIGxvc2UgY29udGV4dFxuICAgIGxvc3NDYWxsYmFja3MuZm9yRWFjaChmdW5jdGlvbiAoY2IpIHtcbiAgICAgIGNiKClcbiAgICB9KVxuICB9XG5cbiAgZnVuY3Rpb24gaGFuZGxlQ29udGV4dFJlc3RvcmVkIChldmVudCkge1xuICAgIC8vIGNsZWFyIGVycm9yIGNvZGVcbiAgICBnbC5nZXRFcnJvcigpXG5cbiAgICAvLyBjbGVhciBjb250ZXh0IGxvc3QgZmxhZ1xuICAgIGNvbnRleHRMb3N0ID0gZmFsc2VcblxuICAgIC8vIHJlZnJlc2ggc3RhdGVcbiAgICBleHRlbnNpb25TdGF0ZS5yZXN0b3JlKClcbiAgICBzaGFkZXJTdGF0ZS5yZXN0b3JlKClcbiAgICBidWZmZXJTdGF0ZS5yZXN0b3JlKClcbiAgICB0ZXh0dXJlU3RhdGUucmVzdG9yZSgpXG4gICAgcmVuZGVyYnVmZmVyU3RhdGUucmVzdG9yZSgpXG4gICAgZnJhbWVidWZmZXJTdGF0ZS5yZXN0b3JlKClcbiAgICBpZiAodGltZXIpIHtcbiAgICAgIHRpbWVyLnJlc3RvcmUoKVxuICAgIH1cblxuICAgIC8vIHJlZnJlc2ggc3RhdGVcbiAgICBjb3JlLnByb2NzLnJlZnJlc2goKVxuXG4gICAgLy8gcmVzdGFydCBSQUZcbiAgICBzdGFydFJBRigpXG5cbiAgICAvLyByZXN0b3JlIGNvbnRleHRcbiAgICByZXN0b3JlQ2FsbGJhY2tzLmZvckVhY2goZnVuY3Rpb24gKGNiKSB7XG4gICAgICBjYigpXG4gICAgfSlcbiAgfVxuXG4gIGlmIChjYW52YXMpIHtcbiAgICBjYW52YXMuYWRkRXZlbnRMaXN0ZW5lcihDT05URVhUX0xPU1RfRVZFTlQsIGhhbmRsZUNvbnRleHRMb3NzLCBmYWxzZSlcbiAgICBjYW52YXMuYWRkRXZlbnRMaXN0ZW5lcihDT05URVhUX1JFU1RPUkVEX0VWRU5ULCBoYW5kbGVDb250ZXh0UmVzdG9yZWQsIGZhbHNlKVxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSAoKSB7XG4gICAgcmFmQ2FsbGJhY2tzLmxlbmd0aCA9IDBcbiAgICBzdG9wUkFGKClcblxuICAgIGlmIChjYW52YXMpIHtcbiAgICAgIGNhbnZhcy5yZW1vdmVFdmVudExpc3RlbmVyKENPTlRFWFRfTE9TVF9FVkVOVCwgaGFuZGxlQ29udGV4dExvc3MpXG4gICAgICBjYW52YXMucmVtb3ZlRXZlbnRMaXN0ZW5lcihDT05URVhUX1JFU1RPUkVEX0VWRU5ULCBoYW5kbGVDb250ZXh0UmVzdG9yZWQpXG4gICAgfVxuXG4gICAgc2hhZGVyU3RhdGUuY2xlYXIoKVxuICAgIGZyYW1lYnVmZmVyU3RhdGUuY2xlYXIoKVxuICAgIHJlbmRlcmJ1ZmZlclN0YXRlLmNsZWFyKClcbiAgICB0ZXh0dXJlU3RhdGUuY2xlYXIoKVxuICAgIGVsZW1lbnRTdGF0ZS5jbGVhcigpXG4gICAgYnVmZmVyU3RhdGUuY2xlYXIoKVxuXG4gICAgaWYgKHRpbWVyKSB7XG4gICAgICB0aW1lci5jbGVhcigpXG4gICAgfVxuXG4gICAgZGVzdHJveUNhbGxiYWNrcy5mb3JFYWNoKGZ1bmN0aW9uIChjYikge1xuICAgICAgY2IoKVxuICAgIH0pXG4gIH1cblxuICBmdW5jdGlvbiBjb21waWxlUHJvY2VkdXJlIChvcHRpb25zKSB7XG4gICAgXG4gICAgXG5cbiAgICBmdW5jdGlvbiBmbGF0dGVuTmVzdGVkT3B0aW9ucyAob3B0aW9ucykge1xuICAgICAgdmFyIHJlc3VsdCA9IGV4dGVuZCh7fSwgb3B0aW9ucylcbiAgICAgIGRlbGV0ZSByZXN1bHQudW5pZm9ybXNcbiAgICAgIGRlbGV0ZSByZXN1bHQuYXR0cmlidXRlc1xuICAgICAgZGVsZXRlIHJlc3VsdC5jb250ZXh0XG5cbiAgICAgIGlmICgnc3RlbmNpbCcgaW4gcmVzdWx0ICYmIHJlc3VsdC5zdGVuY2lsLm9wKSB7XG4gICAgICAgIHJlc3VsdC5zdGVuY2lsLm9wQmFjayA9IHJlc3VsdC5zdGVuY2lsLm9wRnJvbnQgPSByZXN1bHQuc3RlbmNpbC5vcFxuICAgICAgICBkZWxldGUgcmVzdWx0LnN0ZW5jaWwub3BcbiAgICAgIH1cblxuICAgICAgZnVuY3Rpb24gbWVyZ2UgKG5hbWUpIHtcbiAgICAgICAgaWYgKG5hbWUgaW4gcmVzdWx0KSB7XG4gICAgICAgICAgdmFyIGNoaWxkID0gcmVzdWx0W25hbWVdXG4gICAgICAgICAgZGVsZXRlIHJlc3VsdFtuYW1lXVxuICAgICAgICAgIE9iamVjdC5rZXlzKGNoaWxkKS5mb3JFYWNoKGZ1bmN0aW9uIChwcm9wKSB7XG4gICAgICAgICAgICByZXN1bHRbbmFtZSArICcuJyArIHByb3BdID0gY2hpbGRbcHJvcF1cbiAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBtZXJnZSgnYmxlbmQnKVxuICAgICAgbWVyZ2UoJ2RlcHRoJylcbiAgICAgIG1lcmdlKCdjdWxsJylcbiAgICAgIG1lcmdlKCdzdGVuY2lsJylcbiAgICAgIG1lcmdlKCdwb2x5Z29uT2Zmc2V0JylcbiAgICAgIG1lcmdlKCdzY2lzc29yJylcbiAgICAgIG1lcmdlKCdzYW1wbGUnKVxuXG4gICAgICByZXR1cm4gcmVzdWx0XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc2VwYXJhdGVEeW5hbWljIChvYmplY3QpIHtcbiAgICAgIHZhciBzdGF0aWNJdGVtcyA9IHt9XG4gICAgICB2YXIgZHluYW1pY0l0ZW1zID0ge31cbiAgICAgIE9iamVjdC5rZXlzKG9iamVjdCkuZm9yRWFjaChmdW5jdGlvbiAob3B0aW9uKSB7XG4gICAgICAgIHZhciB2YWx1ZSA9IG9iamVjdFtvcHRpb25dXG4gICAgICAgIGlmIChkeW5hbWljLmlzRHluYW1pYyh2YWx1ZSkpIHtcbiAgICAgICAgICBkeW5hbWljSXRlbXNbb3B0aW9uXSA9IGR5bmFtaWMudW5ib3godmFsdWUsIG9wdGlvbilcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzdGF0aWNJdGVtc1tvcHRpb25dID0gdmFsdWVcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGR5bmFtaWM6IGR5bmFtaWNJdGVtcyxcbiAgICAgICAgc3RhdGljOiBzdGF0aWNJdGVtc1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFRyZWF0IGNvbnRleHQgdmFyaWFibGVzIHNlcGFyYXRlIGZyb20gb3RoZXIgZHluYW1pYyB2YXJpYWJsZXNcbiAgICB2YXIgY29udGV4dCA9IHNlcGFyYXRlRHluYW1pYyhvcHRpb25zLmNvbnRleHQgfHwge30pXG4gICAgdmFyIHVuaWZvcm1zID0gc2VwYXJhdGVEeW5hbWljKG9wdGlvbnMudW5pZm9ybXMgfHwge30pXG4gICAgdmFyIGF0dHJpYnV0ZXMgPSBzZXBhcmF0ZUR5bmFtaWMob3B0aW9ucy5hdHRyaWJ1dGVzIHx8IHt9KVxuICAgIHZhciBvcHRzID0gc2VwYXJhdGVEeW5hbWljKGZsYXR0ZW5OZXN0ZWRPcHRpb25zKG9wdGlvbnMpKVxuXG4gICAgdmFyIHN0YXRzID0ge1xuICAgICAgZ3B1VGltZTogMC4wLFxuICAgICAgY3B1VGltZTogMC4wLFxuICAgICAgY291bnQ6IDBcbiAgICB9XG5cbiAgICB2YXIgY29tcGlsZWQgPSBjb3JlLmNvbXBpbGUob3B0cywgYXR0cmlidXRlcywgdW5pZm9ybXMsIGNvbnRleHQsIHN0YXRzKVxuXG4gICAgdmFyIGRyYXcgPSBjb21waWxlZC5kcmF3XG4gICAgdmFyIGJhdGNoID0gY29tcGlsZWQuYmF0Y2hcbiAgICB2YXIgc2NvcGUgPSBjb21waWxlZC5zY29wZVxuXG4gICAgLy8gRklYTUU6IHdlIHNob3VsZCBtb2RpZnkgY29kZSBnZW5lcmF0aW9uIGZvciBiYXRjaCBjb21tYW5kcyBzbyB0aGlzXG4gICAgLy8gaXNuJ3QgbmVjZXNzYXJ5XG4gICAgdmFyIEVNUFRZX0FSUkFZID0gW11cbiAgICBmdW5jdGlvbiByZXNlcnZlIChjb3VudCkge1xuICAgICAgd2hpbGUgKEVNUFRZX0FSUkFZLmxlbmd0aCA8IGNvdW50KSB7XG4gICAgICAgIEVNUFRZX0FSUkFZLnB1c2gobnVsbClcbiAgICAgIH1cbiAgICAgIHJldHVybiBFTVBUWV9BUlJBWVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIFJFR0xDb21tYW5kIChhcmdzLCBib2R5KSB7XG4gICAgICB2YXIgaVxuICAgICAgaWYgKGNvbnRleHRMb3N0KSB7XG4gICAgICAgIFxuICAgICAgfVxuICAgICAgaWYgKHR5cGVvZiBhcmdzID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIHJldHVybiBzY29wZS5jYWxsKHRoaXMsIG51bGwsIGFyZ3MsIDApXG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBib2R5ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIGlmICh0eXBlb2YgYXJncyA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgYXJnczsgKytpKSB7XG4gICAgICAgICAgICBzY29wZS5jYWxsKHRoaXMsIG51bGwsIGJvZHksIGkpXG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVyblxuICAgICAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoYXJncykpIHtcbiAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgYXJncy5sZW5ndGg7ICsraSkge1xuICAgICAgICAgICAgc2NvcGUuY2FsbCh0aGlzLCBhcmdzW2ldLCBib2R5LCBpKVxuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gc2NvcGUuY2FsbCh0aGlzLCBhcmdzLCBib2R5LCAwKVxuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBhcmdzID09PSAnbnVtYmVyJykge1xuICAgICAgICBpZiAoYXJncyA+IDApIHtcbiAgICAgICAgICByZXR1cm4gYmF0Y2guY2FsbCh0aGlzLCByZXNlcnZlKGFyZ3MgfCAwKSwgYXJncyB8IDApXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShhcmdzKSkge1xuICAgICAgICBpZiAoYXJncy5sZW5ndGgpIHtcbiAgICAgICAgICByZXR1cm4gYmF0Y2guY2FsbCh0aGlzLCBhcmdzLCBhcmdzLmxlbmd0aClcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGRyYXcuY2FsbCh0aGlzLCBhcmdzKVxuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBleHRlbmQoUkVHTENvbW1hbmQsIHtcbiAgICAgIHN0YXRzOiBzdGF0c1xuICAgIH0pXG4gIH1cblxuICBmdW5jdGlvbiBjbGVhciAob3B0aW9ucykge1xuICAgIFxuXG4gICAgdmFyIGNsZWFyRmxhZ3MgPSAwXG4gICAgY29yZS5wcm9jcy5wb2xsKClcblxuICAgIHZhciBjID0gb3B0aW9ucy5jb2xvclxuICAgIGlmIChjKSB7XG4gICAgICBnbC5jbGVhckNvbG9yKCtjWzBdIHx8IDAsICtjWzFdIHx8IDAsICtjWzJdIHx8IDAsICtjWzNdIHx8IDApXG4gICAgICBjbGVhckZsYWdzIHw9IEdMX0NPTE9SX0JVRkZFUl9CSVRcbiAgICB9XG4gICAgaWYgKCdkZXB0aCcgaW4gb3B0aW9ucykge1xuICAgICAgZ2wuY2xlYXJEZXB0aCgrb3B0aW9ucy5kZXB0aClcbiAgICAgIGNsZWFyRmxhZ3MgfD0gR0xfREVQVEhfQlVGRkVSX0JJVFxuICAgIH1cbiAgICBpZiAoJ3N0ZW5jaWwnIGluIG9wdGlvbnMpIHtcbiAgICAgIGdsLmNsZWFyU3RlbmNpbChvcHRpb25zLnN0ZW5jaWwgfCAwKVxuICAgICAgY2xlYXJGbGFncyB8PSBHTF9TVEVOQ0lMX0JVRkZFUl9CSVRcbiAgICB9XG5cbiAgICBcbiAgICBnbC5jbGVhcihjbGVhckZsYWdzKVxuICB9XG5cbiAgZnVuY3Rpb24gZnJhbWUgKGNiKSB7XG4gICAgXG4gICAgcmFmQ2FsbGJhY2tzLnB1c2goY2IpXG5cbiAgICBmdW5jdGlvbiBjYW5jZWwgKCkge1xuICAgICAgLy8gRklYTUU6ICBzaG91bGQgd2UgY2hlY2sgc29tZXRoaW5nIG90aGVyIHRoYW4gZXF1YWxzIGNiIGhlcmU/XG4gICAgICAvLyB3aGF0IGlmIGEgdXNlciBjYWxscyBmcmFtZSB0d2ljZSB3aXRoIHRoZSBzYW1lIGNhbGxiYWNrLi4uXG4gICAgICAvL1xuICAgICAgdmFyIGkgPSBmaW5kKHJhZkNhbGxiYWNrcywgY2IpXG4gICAgICBcbiAgICAgIGZ1bmN0aW9uIHBlbmRpbmdDYW5jZWwgKCkge1xuICAgICAgICB2YXIgaW5kZXggPSBmaW5kKHJhZkNhbGxiYWNrcywgcGVuZGluZ0NhbmNlbClcbiAgICAgICAgcmFmQ2FsbGJhY2tzW2luZGV4XSA9IHJhZkNhbGxiYWNrc1tyYWZDYWxsYmFja3MubGVuZ3RoIC0gMV1cbiAgICAgICAgcmFmQ2FsbGJhY2tzLmxlbmd0aCAtPSAxXG4gICAgICAgIGlmIChyYWZDYWxsYmFja3MubGVuZ3RoIDw9IDApIHtcbiAgICAgICAgICBzdG9wUkFGKClcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmFmQ2FsbGJhY2tzW2ldID0gcGVuZGluZ0NhbmNlbFxuICAgIH1cblxuICAgIHN0YXJ0UkFGKClcblxuICAgIHJldHVybiB7XG4gICAgICBjYW5jZWw6IGNhbmNlbFxuICAgIH1cbiAgfVxuXG4gIC8vIHBvbGwgdmlld3BvcnRcbiAgZnVuY3Rpb24gcG9sbFZpZXdwb3J0ICgpIHtcbiAgICB2YXIgdmlld3BvcnQgPSBuZXh0U3RhdGUudmlld3BvcnRcbiAgICB2YXIgc2Npc3NvckJveCA9IG5leHRTdGF0ZS5zY2lzc29yX2JveFxuICAgIHZpZXdwb3J0WzBdID0gdmlld3BvcnRbMV0gPSBzY2lzc29yQm94WzBdID0gc2Npc3NvckJveFsxXSA9IDBcbiAgICBjb250ZXh0U3RhdGUudmlld3BvcnRXaWR0aCA9XG4gICAgICBjb250ZXh0U3RhdGUuZnJhbWVidWZmZXJXaWR0aCA9XG4gICAgICBjb250ZXh0U3RhdGUuZHJhd2luZ0J1ZmZlcldpZHRoID1cbiAgICAgIHZpZXdwb3J0WzJdID1cbiAgICAgIHNjaXNzb3JCb3hbMl0gPSBnbC5kcmF3aW5nQnVmZmVyV2lkdGhcbiAgICBjb250ZXh0U3RhdGUudmlld3BvcnRIZWlnaHQgPVxuICAgICAgY29udGV4dFN0YXRlLmZyYW1lYnVmZmVySGVpZ2h0ID1cbiAgICAgIGNvbnRleHRTdGF0ZS5kcmF3aW5nQnVmZmVySGVpZ2h0ID1cbiAgICAgIHZpZXdwb3J0WzNdID1cbiAgICAgIHNjaXNzb3JCb3hbM10gPSBnbC5kcmF3aW5nQnVmZmVySGVpZ2h0XG4gIH1cblxuICBmdW5jdGlvbiBwb2xsICgpIHtcbiAgICBjb250ZXh0U3RhdGUudGljayArPSAxXG4gICAgY29udGV4dFN0YXRlLnRpbWUgPSBub3coKVxuICAgIHBvbGxWaWV3cG9ydCgpXG4gICAgY29yZS5wcm9jcy5wb2xsKClcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlZnJlc2ggKCkge1xuICAgIHBvbGxWaWV3cG9ydCgpXG4gICAgY29yZS5wcm9jcy5yZWZyZXNoKClcbiAgICBpZiAodGltZXIpIHtcbiAgICAgIHRpbWVyLnVwZGF0ZSgpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gbm93ICgpIHtcbiAgICByZXR1cm4gKGNsb2NrKCkgLSBTVEFSVF9USU1FKSAvIDEwMDAuMFxuICB9XG5cbiAgcmVmcmVzaCgpXG5cbiAgZnVuY3Rpb24gYWRkTGlzdGVuZXIgKGV2ZW50LCBjYWxsYmFjaykge1xuICAgIFxuXG4gICAgdmFyIGNhbGxiYWNrc1xuICAgIHN3aXRjaCAoZXZlbnQpIHtcbiAgICAgIGNhc2UgJ2ZyYW1lJzpcbiAgICAgICAgcmV0dXJuIGZyYW1lKGNhbGxiYWNrKVxuICAgICAgY2FzZSAnbG9zdCc6XG4gICAgICAgIGNhbGxiYWNrcyA9IGxvc3NDYWxsYmFja3NcbiAgICAgICAgYnJlYWtcbiAgICAgIGNhc2UgJ3Jlc3RvcmUnOlxuICAgICAgICBjYWxsYmFja3MgPSByZXN0b3JlQ2FsbGJhY2tzXG4gICAgICAgIGJyZWFrXG4gICAgICBjYXNlICdkZXN0cm95JzpcbiAgICAgICAgY2FsbGJhY2tzID0gZGVzdHJveUNhbGxiYWNrc1xuICAgICAgICBicmVha1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgXG4gICAgfVxuXG4gICAgY2FsbGJhY2tzLnB1c2goY2FsbGJhY2spXG4gICAgcmV0dXJuIHtcbiAgICAgIGNhbmNlbDogZnVuY3Rpb24gKCkge1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNhbGxiYWNrcy5sZW5ndGg7ICsraSkge1xuICAgICAgICAgIGlmIChjYWxsYmFja3NbaV0gPT09IGNhbGxiYWNrKSB7XG4gICAgICAgICAgICBjYWxsYmFja3NbaV0gPSBjYWxsYmFja3NbY2FsbGJhY2tzLmxlbmd0aCAtIDFdXG4gICAgICAgICAgICBjYWxsYmFja3MucG9wKClcbiAgICAgICAgICAgIHJldHVyblxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHZhciByZWdsID0gZXh0ZW5kKGNvbXBpbGVQcm9jZWR1cmUsIHtcbiAgICAvLyBDbGVhciBjdXJyZW50IEZCT1xuICAgIGNsZWFyOiBjbGVhcixcblxuICAgIC8vIFNob3J0IGN1dHMgZm9yIGR5bmFtaWMgdmFyaWFibGVzXG4gICAgcHJvcDogZHluYW1pYy5kZWZpbmUuYmluZChudWxsLCBEWU5fUFJPUCksXG4gICAgY29udGV4dDogZHluYW1pYy5kZWZpbmUuYmluZChudWxsLCBEWU5fQ09OVEVYVCksXG4gICAgdGhpczogZHluYW1pYy5kZWZpbmUuYmluZChudWxsLCBEWU5fU1RBVEUpLFxuXG4gICAgLy8gZXhlY3V0ZXMgYW4gZW1wdHkgZHJhdyBjb21tYW5kXG4gICAgZHJhdzogY29tcGlsZVByb2NlZHVyZSh7fSksXG5cbiAgICAvLyBSZXNvdXJjZXNcbiAgICBidWZmZXI6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICByZXR1cm4gYnVmZmVyU3RhdGUuY3JlYXRlKG9wdGlvbnMsIEdMX0FSUkFZX0JVRkZFUiwgZmFsc2UsIGZhbHNlKVxuICAgIH0sXG4gICAgZWxlbWVudHM6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICByZXR1cm4gZWxlbWVudFN0YXRlLmNyZWF0ZShvcHRpb25zLCBmYWxzZSlcbiAgICB9LFxuICAgIHRleHR1cmU6IHRleHR1cmVTdGF0ZS5jcmVhdGUyRCxcbiAgICBjdWJlOiB0ZXh0dXJlU3RhdGUuY3JlYXRlQ3ViZSxcbiAgICByZW5kZXJidWZmZXI6IHJlbmRlcmJ1ZmZlclN0YXRlLmNyZWF0ZSxcbiAgICBmcmFtZWJ1ZmZlcjogZnJhbWVidWZmZXJTdGF0ZS5jcmVhdGUsXG4gICAgZnJhbWVidWZmZXJDdWJlOiBmcmFtZWJ1ZmZlclN0YXRlLmNyZWF0ZUN1YmUsXG5cbiAgICAvLyBFeHBvc2UgY29udGV4dCBhdHRyaWJ1dGVzXG4gICAgYXR0cmlidXRlczogZ2xBdHRyaWJ1dGVzLFxuXG4gICAgLy8gRnJhbWUgcmVuZGVyaW5nXG4gICAgZnJhbWU6IGZyYW1lLFxuICAgIG9uOiBhZGRMaXN0ZW5lcixcblxuICAgIC8vIFN5c3RlbSBsaW1pdHNcbiAgICBsaW1pdHM6IGxpbWl0cyxcbiAgICBoYXNFeHRlbnNpb246IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICByZXR1cm4gbGltaXRzLmV4dGVuc2lvbnMuaW5kZXhPZihuYW1lLnRvTG93ZXJDYXNlKCkpID49IDBcbiAgICB9LFxuXG4gICAgLy8gUmVhZCBwaXhlbHNcbiAgICByZWFkOiByZWFkUGl4ZWxzLFxuXG4gICAgLy8gRGVzdHJveSByZWdsIGFuZCBhbGwgYXNzb2NpYXRlZCByZXNvdXJjZXNcbiAgICBkZXN0cm95OiBkZXN0cm95LFxuXG4gICAgLy8gRGlyZWN0IEdMIHN0YXRlIG1hbmlwdWxhdGlvblxuICAgIF9nbDogZ2wsXG4gICAgX3JlZnJlc2g6IHJlZnJlc2gsXG5cbiAgICBwb2xsOiBmdW5jdGlvbiAoKSB7XG4gICAgICBwb2xsKClcbiAgICAgIGlmICh0aW1lcikge1xuICAgICAgICB0aW1lci51cGRhdGUoKVxuICAgICAgfVxuICAgIH0sXG5cbiAgICAvLyBDdXJyZW50IHRpbWVcbiAgICBub3c6IG5vdyxcblxuICAgIC8vIHJlZ2wgU3RhdGlzdGljcyBJbmZvcm1hdGlvblxuICAgIHN0YXRzOiBzdGF0c1xuICB9KVxuXG4gIGNvbmZpZy5vbkRvbmUobnVsbCwgcmVnbClcblxuICByZXR1cm4gcmVnbFxufVxuIl19
