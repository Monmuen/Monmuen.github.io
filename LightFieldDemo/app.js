import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { StereoEffect } from './vendor/StereoEffects.js';
import { VRButton } from './vendor/VRButton.js';
const apertureInput = document.querySelector('#aperture');
const focusInput = document.querySelector('#focus');
const stInput = document.querySelector('#stplane');
const loadWrap = document.querySelector('#load-wrap');
const loadBtn = document.querySelector('#load');
const viewModeBtn = document.querySelector('#view-mode');
const gyroButton = document.querySelector('#gyro-button');

const scene = new THREE.Scene();
let width = window.innerWidth;
let height = window.innerHeight;
const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
const gyroCamera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);// 陀螺仪控制使用的相机
const renderer = new THREE.WebGLRenderer({ antialias: true });
let fragmentShader, vertexShader;
renderer.xr.enabled = true; // 启用WebXR
renderer.setSize(width, height);
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

camera.position.z = 2;
gyroCamera.position.z = 2;
gyroCamera.lookAt(0, 0, 1); // 确保初始方向一致

const effect = new StereoEffect(renderer);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target = new THREE.Vector3(0, 0, 1);
controls.panSpeed = 2;
controls.enabled = true; // 默认启用

let useDeviceControls = false;
let fieldTexture;
let plane, planeMat, planePts;
const filename = './framesnew.mp4';
const camsX = 17;
const camsY = 17;
const resX = 1024;
const resY = 1024;
const cameraGap = 0.08;
let aperture = Number(apertureInput.value);
let focus = Number(focusInput.value);
let isStereoView = true;

window.addEventListener('resize', () => {
  width = window.innerWidth;
  height = window.innerHeight;
  camera.aspect = width / height;
  gyroCamera.aspect = width / height;
  camera.updateProjectionMatrix();
  gyroCamera.updateProjectionMatrix();
  renderer.setSize(width, height);
  effect.setSize(width, height);
});

apertureInput.addEventListener('input', e => {
  aperture = Number(apertureInput.value);
  planeMat.uniforms.aperture.value = aperture;
});

focusInput.addEventListener('input', e => {
  focus = Number(focusInput.value);
  planeMat.uniforms.focus.value = focus;
});

stInput.addEventListener('input', () => {
  planePts.visible = stInput.checked;
});

loadBtn.addEventListener('click', async () => {
  loadBtn.setAttribute('disabled', true);
  await loadScene();
});

viewModeBtn.addEventListener('click', () => {
  toggleViewMode();
});

gyroButton.addEventListener('click', () => {
  useDeviceControls = !useDeviceControls;
  if (useDeviceControls) {
    controls.enabled = false; // 禁用 OrbitControls
    initDeviceOrientationControls();
    console.log("陀螺仪模式已启动。");
  } else {
    controls.enabled = true; // 启用 OrbitControls
    disableDeviceOrientationControls();
    console.log("陀螺仪模式已关闭。");
  }
});

function toggleViewMode() {
  isStereoView = !isStereoView;
  viewModeBtn.textContent = isStereoView ? 'Switch to Single View' : 'Switch to Left/Right View';
}

async function loadScene() {
  await loadShaders();
  initPlaneMaterial();
  await extractImages();
  loadPlane();
  animate();
}

renderer.xr.addEventListener('sessionstart', () => {
  // plane.position.set(0, 0, -2); // 确保相机能正确看到图像
  
  useDeviceControls = true;

  plane.position.set(0,0,-2)
  planePts.position.set(0, 1.6, -2.01);
  plane.updateMatrix();

  console.log('Plane position set to:', plane.position);
  console.log('PlanePts position set to:', planePts.position);
});

renderer.xr.addEventListener('sessionend', () => {
  // plane.position.set(0, 0, 0); // 退出VR模式后重置位置
  // planePts.position.set(0, 0, -0.01); // 重置点云的位置
  scene.position.set(0,0,0);
  //plane.position.set(0,0,0);
});

async function loadShaders() {
  vertexShader = await fetch('./vertex.glsl').then(res => res.text());
  fragmentShader = await fetch('./fragment.glsl').then(res => res.text());
  console.log('Loaded shaders');
}

function initPlaneMaterial() {
  planeMat = new THREE.ShaderMaterial({
    uniforms: {
      field: { value: null }, // 初始化时设置为 null
      camArraySize: new THREE.Uniform(new THREE.Vector2(camsX, camsY)),
      aperture: { value: aperture },
      focus: { value: focus },
      // useDeviceControls: { value: useDeviceControls ? 1.0 : 0.0 }
    },
    vertexShader,
    fragmentShader,
  });
}

async function extractImages() {
  const loader = new THREE.ImageLoader();
  let count = 0;
  let offset = 0;

  console.log('starting extraction');

  const fetchFrames = async () => {
    const loadPromises = [];
    for (let i = 0; i < camsX * camsY; i++) {
      loadPromises.push(loadImage(i));
    }

    await Promise.all(loadPromises);

    loadWrap.style.display = 'none';
    console.log('Loaded field data');
  };

  const loadImage = async (index) => {
    return new Promise((resolve, reject) => {
      loader.load(`./Image/image${index + 1}.png`, (image) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = resX;
        canvas.height = resY;
        ctx.drawImage(image, 0, 0, resX, resY);
        const imgData = ctx.getImageData(0, 0, resX, resY);
        const buffer = new Uint8Array(imgData.data);

        if (index === 0) {
          fieldTexture = new THREE.DataTexture2DArray(new Uint8Array(resX * resY * 4 * camsX * camsY), resX, resY, camsX * camsY);
        }

        fieldTexture.image.data.set(buffer, offset);
        offset += buffer.length;
        count++;

        fieldTexture.needsUpdate = true;
        planeMat.uniforms.field.value = fieldTexture;
        loadBtn.textContent = `Loaded ${Math.round(100 * (index + 1) / (camsX * camsY))}%`;
        resolve();
      }, undefined, reject);
    });
  };

  await fetchFrames();
}




function loadPlane() {
  const planeGeo = new THREE.PlaneGeometry(camsX * cameraGap * 4, camsY * cameraGap * 4, camsX, camsY);
  const planePtsGeo = new THREE.PlaneGeometry(camsX * cameraGap * 2, camsY * cameraGap * 2, camsX, camsY);
  const ptsMat = new THREE.PointsMaterial({ size: 0.01, color: 0xeeccff });
  planePts = new THREE.Points(planePtsGeo, ptsMat);
  planePts.position.set(0,0,-0.01);
  planePts.visible = stInput.checked;
  plane = new THREE.Mesh(planeGeo, planeMat); // 使用之前定义的 planeMat
  scene.add(planePts);
  scene.add(plane);
  console.log('Loaded plane');
}

function animate() {
  renderer.setAnimationLoop(() => {
  requestAnimationFrame(animate);
  let activeCamera;
  if (useDeviceControls) {
    activeCamera = gyroCamera;
  } else {
    activeCamera = camera;
    controls.update(); // 更新 OrbitControls
  }
  if (isStereoView) {
    effect.setSize(window.innerWidth, window.innerHeight);
    effect.render(scene, activeCamera);
  } else {
    renderer.setSize(width, height);
    renderer.render(scene, activeCamera);
  }
});
}

let initialOrientation = null;

function initDeviceOrientationControls() {
  window.addEventListener('deviceorientation', handleDeviceOrientation);
}

function disableDeviceOrientationControls() {
  window.removeEventListener('deviceorientation', handleDeviceOrientation);
  initialOrientation = null;
}

function handleDeviceOrientation(event) {
  const alpha = event.alpha ? THREE.MathUtils.degToRad(event.alpha) : 0;
  const beta = event.beta ? THREE.MathUtils.degToRad(event.beta) : 0;
  const gamma = event.gamma ? THREE.MathUtils.degToRad(event.gamma) : 0;

  if (!initialOrientation) {
    initialOrientation = { alpha, beta, gamma };
  }

  updateCameraOrientation(alpha, beta, gamma);
}

function updateCameraOrientation(alpha, beta, gamma) {
  const alphaOffset = initialOrientation ? alpha - initialOrientation.alpha : 0;
  const betaOffset = initialOrientation ? beta - initialOrientation.beta : 0;
  const gammaOffset = initialOrientation ? gamma - initialOrientation.gamma : 0;

  const euler = new THREE.Euler(betaOffset, alphaOffset, -gammaOffset, 'YXZ');
  gyroCamera.quaternion.setFromEuler(euler);
  gyroCamera.updateMatrixWorld(true); // 确保相机更新，正确接收参数
}