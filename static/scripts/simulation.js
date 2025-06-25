import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- DOM Elements ---
const steeringJsonContainer = document.getElementById('steeringJson');
const viewportContainer = document.getElementById('simViewport');
const logsContainer = document.getElementById('simulationLogs');
const restartButton = document.getElementById('restartButton');
const statsOverlay = document.getElementById('statsOverlay');
const pauseButton = document.getElementById('pauseButton');
const resetButton = document.getElementById('resetButton');
const bsSelect = document.getElementById('bsSelect');

// --- Simulation State ---
let scene, camera, renderer, controls;
let factoryFloor, obstacles = [], baseStations = [], agvs = [], beams = [];
let clock = new THREE.Clock();
let lastLLMUpdateTime = 0;
let isPaused = false;

let simParams = {
    areaSize: 100,
    bsDensity: 3,
    ueDensity: 5,
    obstacleDensity: 15,
    ueSpeed: 2,
    selectedBsId: null,
    bsHeight: 10,
    bsAntennas: 3, 
    bsBandwidth: 100,
    llmQueryInterval: 5000, // Mock update interval
};

// --- Logging Function ---
function log(message, type = 'DEBUG') {
    const time = new Date().toLocaleTimeString();
    const entry = document.createElement('div');

    if (type === 'WARN') entry.style.color = '#facc15';
    if (type === 'ERROR') entry.style.color = '#f87171';
    if (type === 'DEBUG') entry.style.color = '#9ca3af';
    if (type === 'SUCCESS') entry.style.color = '#34d399';
    
    entry.innerHTML = `[${time}] ${message}`;
    logsContainer.appendChild(entry);

    // Auto-scroll to bottom
    logsContainer.scrollTop = logsContainer.scrollHeight;

    // Limit log lines (optional)
    const maxLines = 100;
    while (logsContainer.childNodes.length > maxLines) {
        logsContainer.removeChild(logsContainer.firstChild);
    }
}

// --- Scene Creation ---
function createFactoryEnvironment() {
    // Floor
    const floorGeometry = new THREE.PlaneGeometry(simParams.areaSize, simParams.areaSize);
    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x334433, side: THREE.DoubleSide }); // Dark green-ish
    factoryFloor = new THREE.Mesh(floorGeometry, floorMaterial);
    factoryFloor.rotation.x = -Math.PI / 2;
    factoryFloor.receiveShadow = true;
    scene.add(factoryFloor);

    // Simple Obstacles (representing workstations, storage)
    const obstacleGeo = new THREE.BoxGeometry(5, 10, 5); // Example size
    const obstacleMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa }); // Grey
    for (let i = 0; i < simParams.obstacleDensity; i++) {
        const obs = new THREE.Mesh(obstacleGeo, obstacleMat.clone()); // Clone material for potential color variations
        obs.position.set(
            (Math.random() - 0.5) * simParams.areaSize * 0.8,
            5, // Height / 2
            (Math.random() - 0.5) * simParams.areaSize * 0.8
        );
            obs.castShadow = true;
            obs.receiveShadow = true;
        obstacles.push(obs);
        scene.add(obs);
    }
    log(`Created floor and ${simParams.obstacleDensity} obstacles.`);
}

function createBaseStation(id, position) {
    const bsGroup = new THREE.Group();
    bsGroup.position.copy(position);
    bsGroup.userData = {
        id: id,
        type: 'gNodeB',
        height: simParams.bsHeight,
        antennas: simParams.bsAntennas,
        bandwidth: simParams.bsBandwidth
    };

    // Mast
    const mastGeo = new THREE.CylinderGeometry(0.5, 0.5, position.y, 8);
    const mastMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
    const mast = new THREE.Mesh(mastGeo, mastMat);
    mast.position.y = -position.y / 2; // Position relative to group center
        mast.castShadow = true;
    bsGroup.add(mast);

    // Antenna Array Representation (simple spheres in a circle)
    const radius = 1.0;
    const antennaGeo = new THREE.SphereGeometry(0.2, 8, 8);
    const antennaMat = new THREE.MeshStandardMaterial({ color: 0xffcc00 }); // Yellow
    for (let i = 0; i < simParams.bsAntennas; i++) {
        const angle = (i / simParams.bsAntennas) * Math.PI * 2;
        const antenna = new THREE.Mesh(antennaGeo, antennaMat);
        antenna.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
        bsGroup.add(antenna);
    }

        // Coverage Visualization (Semi-transparent sphere)
    const coverageRadius = simParams.areaSize * 0.3; // Example radius
    const coverageGeo = new THREE.SphereGeometry(coverageRadius, 32, 16);
    const coverageMat = new THREE.MeshBasicMaterial({
        color: 0x0077ff,
        transparent: true,
        opacity: 0.05, // Very transparent
        side: THREE.DoubleSide,
        depthWrite: false // Avoid hiding objects behind it
    });
    const coverageSphere = new THREE.Mesh(coverageGeo, coverageMat);
    coverageSphere.name = "coverageSphere";
    bsGroup.add(coverageSphere);
    bsGroup.castShadow = true;

    baseStations.push(bsGroup);
    scene.add(bsGroup);

    // Add to dropdown
    const option = document.createElement('option');
    option.value = id;
    option.textContent = id;
    bsSelect.appendChild(option);

    return bsGroup;
}

function createAGV(id) {
    // Replace with GLTF loading for a proper AGV model
    const agvGeo = new THREE.BoxGeometry(1.5, 1, 2.5); // Simple AGV shape
    const agvMat = new THREE.MeshStandardMaterial({ color: 0xff4444 }); // Red-ish
    const agv = new THREE.Mesh(agvGeo, agvMat);
    agv.castShadow = true;
    agv.receiveShadow = true;

    // Initial random position on floor
    agv.position.set(
        (Math.random() - 0.5) * simParams.areaSize * 0.9,
        0.5, // Place slightly above floor
        (Math.random() - 0.5) * simParams.areaSize * 0.9
    );

    // Movement path (simple waypoints)
    agv.userData = {
        id: id,
        type: 'AGV',
        waypoints: [],
        currentWaypointIndex: 0,
        speed: simParams.ueSpeed * (0.8 + Math.random() * 0.4), // Slight speed variation
        connectedBS: null, // Which BS it's primarily connected to
        connectionLine: null // THREE.Line object
    };
    // Generate a simple rectangular path
    const pathSize = simParams.areaSize * (0.4 + Math.random() * 0.5);
    const pathOffset = new THREE.Vector3(
            (Math.random() - 0.5) * simParams.areaSize * 0.2,
            0.5,
            (Math.random() - 0.5) * simParams.areaSize * 0.2
    );
    agv.userData.waypoints = [
        new THREE.Vector3(-pathSize/2, 0.5, -pathSize/2).add(pathOffset),
        new THREE.Vector3( pathSize/2, 0.5, -pathSize/2).add(pathOffset),
        new THREE.Vector3( pathSize/2, 0.5,  pathSize/2).add(pathOffset),
        new THREE.Vector3(-pathSize/2, 0.5,  pathSize/2).add(pathOffset),
    ];
        agv.position.copy(agv.userData.waypoints[0]); // Start at first waypoint


    agvs.push(agv);
    scene.add(agv);
    return agv;
}

function createBeam(bs, agv) {
    const beamMaterial = new THREE.MeshBasicMaterial({
        color: 0x00aaff, // Light blue
        transparent: true,
        opacity: 0.5,
        depthWrite: false // Render beams potentially through objects
    });
        // Cone points from tip to base, so start needs adjustment
    const beamGeometry = new THREE.ConeGeometry(0.5, 1, 16, 1, true); // Radius, Height, Segments, OpenEnded
    beamGeometry.translate(0, -0.5, 0); // Move origin to the tip
    beamGeometry.rotateX(Math.PI / 2); // Point along Z initially

    const beam = new THREE.Mesh(beamGeometry, beamMaterial);
    beam.userData = { bsId: bs.userData.id, agvId: agv.userData.id };
    beams.push(beam);
    scene.add(beam);
    return beam;
}

// --- Simulation Logic ---
function updateAGVMovement(agv, delta) {
    if (!agv.userData.waypoints || agv.userData.waypoints.length === 0) return;

    const targetWaypoint = agv.userData.waypoints[agv.userData.currentWaypointIndex];
    const direction = targetWaypoint.clone().sub(agv.position);
    const distanceToWaypoint = direction.length();

    if (distanceToWaypoint < 0.5) { // Close enough to target
        agv.userData.currentWaypointIndex = (agv.userData.currentWaypointIndex + 1) % agv.userData.waypoints.length;
    } else {
        direction.normalize();
        agv.position.add(direction.multiplyScalar(agv.userData.speed * delta));
        // Simple look towards movement direction
        const lookAtPos = agv.position.clone().add(direction); // Point slightly ahead
        agv.lookAt(lookAtPos.x, agv.position.y, lookAtPos.z); // Keep AGV level
    }
}

function findClosestBS(agv) {
    let closestBS = null;
    let minDistanceSq = Infinity;

    baseStations.forEach(bs => {
        const distSq = agv.position.distanceToSquared(bs.position);
        if (distSq < minDistanceSq) {
            minDistanceSq = distSq;
            closestBS = bs;
        }
    });
    return closestBS;
}

function updateBeamforming() {
    const beamSteeringData = {}; // For JSON output

    // Assign AGVs to closest BS (simple association)
    agvs.forEach(agv => {
        agv.userData.connectedBS = findClosestBS(agv);
        
        // Remove old connection line if exists
        if (agv.userData.connectionLine) {
            scene.remove(agv.userData.connectionLine);
            agv.userData.connectionLine.geometry.dispose();
            agv.userData.connectionLine.material.dispose();
            agv.userData.connectionLine = null;
        }

        // Create new connection line (simple ray)
        if (agv.userData.connectedBS) {
            const points = [agv.position.clone(), agv.userData.connectedBS.position.clone()];
            const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
            const lineMat = new THREE.LineBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.3 }); // Green line
            agv.userData.connectionLine = new THREE.Line(lineGeo, lineMat);
            scene.add(agv.userData.connectionLine);
        }
    });


    // Clear existing beams
    beams.forEach(beam => scene.remove(beam));
    beams.forEach(beam => { beam.geometry.dispose(); beam.material.dispose(); }); // Cleanup
    beams = [];

    // Create and steer new beams for each BS-AGV connection
    baseStations.forEach(bs => {
        beamSteeringData[bs.userData.id] = { steering_angles: [] }; // Init for JSON

        agvs.forEach(agv => {
            if (agv.userData.connectedBS === bs) {
            const beam = createBeam(bs, agv);

                const bsPos = bs.position;
                const agvPos = agv.position;
                const direction = agvPos.clone().sub(bsPos);
                const distance = direction.length();

                beam.scale.z = distance; // Set length
                beam.position.copy(bsPos); // Start at BS
                beam.lookAt(agvPos); // Point towards AGV

                // Calculate Azimuth/Elevation (simplified)
                const dirNorm = direction.normalize();
                const azimuth = Math.atan2(dirNorm.x, dirNorm.z); // Angle in XZ plane
                const elevation = Math.asin(dirNorm.y); // Angle from XZ plane

                // Store for JSON output (convert radians to degrees)
                beamSteeringData[bs.userData.id].steering_angles.push({
                    agv_id: agv.userData.id,
                    azimuth_deg: THREE.MathUtils.radToDeg(azimuth).toFixed(1),
                    elevation_deg: THREE.MathUtils.radToDeg(elevation).toFixed(1)
                });

                // Adjust beam color/opacity based on distance (simple signal strength proxy)
                const maxDist = simParams.areaSize * 0.5;
                const strengthFactor = Math.max(0.1, 1.0 - distance / maxDist);
                beam.material.opacity = 0.2 + 0.5 * strengthFactor; // Base opacity + strength
                beam.material.color.setHSL(0.55, 0.9, 0.5 + 0.2 * strengthFactor); // Shift blue towards cyan/white for stronger

                // Conceptual beam width adjustment (Subtle effect)
                // Narrower beam for more 'elements' conceptually
                const baseRadius = 0.8;
                const elementsFactor = Math.max(0.2, 1.0 - (bs.userData.elements - 1) / 32); // Narrower for more elements
                beam.scale.x = beam.scale.y = baseRadius * elementsFactor;
            }
        });
    });

    // Update Steering Prediction JSON display periodically
    const now = clock.getElapsedTime();
    if (now - lastLLMUpdateTime > simParams.llmQueryInterval / 1000) {
        updatePredictionDisplay(beamSteeringData);
        log("Mock steering prediction computed.");
        lastLLMUpdateTime = now;
    }
}

function updatePredictionDisplay(data) {
    const formattedData = { beamforming_solutions: [] };
    Object.keys(data).forEach(bsId => {
        formattedData.beamforming_solutions.push({
            bs_id: bsId,
            // Format angles more like the example image
            steering_angles: data[bsId].steering_angles.map(a => 
                `${a.azimuth_deg}, ${a.elevation_deg} (AGV: ${a.agv_id})`)
        });
    });
    steeringJsonContainer.textContent = JSON.stringify(formattedData, null, 2);
}

function updateStatsOverlay() {    
    // Placeholder stats 
    const totalAGVs = agvs.length;
    const connectedAGVs = agvs.filter(a => a.userData.connectedBS).length;
    const coverage = totalAGVs > 0 ? (connectedAGVs / totalAGVs * 100).toFixed(1) : 0;
    const avgBandwidth = connectedAGVs * (Math.random() * 5 + 10); 
    statsOverlay.innerHTML = `UE Coverage: ${coverage}% (${connectedAGVs}/${totalAGVs})<br>Avr. Bandwidth: ${avgBandwidth.toFixed(1)} Mbps`;
}

// --- UI and Event Handlers ---
function setupUIListeners() {
    // Simulation Controls
    resetButton.addEventListener('click', resetSimulation);
    pauseButton.addEventListener('click', togglePause);
    restartButton.addEventListener('click', () => {
        log("Restarting simulation...");
        clearScene();
        resetSimulation();
    });

    // Base Station Configs
    bsSelect.addEventListener('change', (e) => {
        simParams.selectedBsId = e.target.value;
        updateBSConfigPanel(simParams.selectedBsId);
        highlightSelectedBS(simParams.selectedBsId);
        log(`Selected gNodeB: ${simParams.selectedBsId}`);
    });

        // Sliders with live value update
    document.querySelectorAll('input[type="range"]').forEach(slider => {
            const valueSpan = document.getElementById(`${slider.id}Value`);
            if (valueSpan) {
                valueSpan.textContent = slider.value; // Initial value
                slider.addEventListener('input', (e) => {
                    valueSpan.textContent = e.target.value;
                    // Update corresponding simParam immediately for some sliders
                    if(slider.id === 'ueSpeed') simParams.ueSpeed = parseFloat(e.target.value);
                    if(slider.id === 'llmQueryInterval') simParams.llmQueryInterval = parseInt(e.target.value);
                });
            }
            // Add change listener for BS specific or reset-requiring params
            slider.addEventListener('change', handleParamChange);
    });
}

function handleParamChange(event) {
    const id = event.target.id;
    const value = event.target.type === 'range' ? parseFloat(event.target.value) : event.target.value;

    // Parameters requiring simulation reset
    const resetParams = ['ueDensity', 'bsDensity', 'areaSize', 'obstacleDensity'];
    if (resetParams.includes(id)) {
        simParams[id] = value;
        clearScene();
        resetSimulation();
        log(`Parameter ${id} changed to ${value}. Resetting simulation.`);
        return;
    }

    // Parameters affecting selected BS
    const bsParams = ['bsHeight', 'bsAntennas', 'bsBandwidth'];

    if (bsParams.includes(id) && simParams.selectedBsId) {
        const selectedBS = baseStations.find(bs => 
            bs.userData.id === simParams.selectedBsId);

        // If a BS is selected
        if (selectedBS) {
            selectedBS.userData[id] = value;

            if (id === 'bsHeight') {
                selectedBS.position.y = value;
                log(`Updated ${simParams.selectedBsId} height to ${value}`);
            } else if (id === 'bsAntennas') {
                log(`Updated ${simParams.selectedBsId} antennas to ${value} (visual update not implemented!)`, 'WARN');
            } else {
                log(`Updated ${simParams.selectedBsId} ${id} to ${value}`);
            }
        }
    } else if (bsParams.includes(id)) {
        simParams[id] = value;
    }
}

function updateBSConfigPanel(bsId) {
    const bs = baseStations.find(b => b.userData.id === bsId);
    if (bs) {
        document.getElementById('bsHeight').value = bs.userData.height;
        document.getElementById('bsHeightValue').textContent = bs.userData.height;
        document.getElementById('bsAntennas').value = bs.userData.antennas;
        document.getElementById('bsAntennasValue').textContent = bs.userData.antennas;
        document.getElementById('bsBandwidth').value = bs.userData.bandwidth;
        document.getElementById('bsBandwidthValue').textContent = bs.userData.bandwidth;
        document.getElementById('bs-configs').classList.remove('hidden');
    } else {
        document.getElementById('bs-configs').classList.add('hidden');       
    }
}

function highlightSelectedBS(bsId) {
    baseStations.forEach(bs => {
        const coverageSphere = bs.getObjectByName("coverageSphere");
        if (coverageSphere) {
            if (bs.userData.id === bsId) {
                coverageSphere.material.opacity = 0.15; // Make slightly more visible
                coverageSphere.material.color.setHex(0xffff00); // Yellow highlight
            } else {
                coverageSphere.material.opacity = 0.05; // Default transparency
                coverageSphere.material.color.setHex(0x0077ff); // Default blue
            }
        }
    });
}

function togglePause() {
    isPaused = !isPaused;
    pauseButton.innerHTML = isPaused ? `<i class="fas fa-play"></i> Start` : `<i class="fas fa-pause"></i> Pause`;
    pauseButton.classList.toggle('bg-blue-600', isPaused);
    pauseButton.classList.toggle('bg-yellow-600', !isPaused);
    pauseButton.classList.toggle('hover:bg-blue-700', isPaused);
    pauseButton.classList.toggle('hover:bg-yellow-700', !isPaused);
    log(isPaused ? "Simulation paused!" : "Simulation running...");
}

function resetSimulation() {
    isPaused = true; 
    log("Resetting simulation...");
    pauseButton.innerHTML = `<i class="fas fa-play"></i> Start`;
    pauseButton.classList.add('bg-yellow-600', 'hover:bg-yellow-700');
    pauseButton.classList.remove('bg-blue-600', 'hover:bg-blue-700');

    // Read current values from sliders that trigger reset
    simParams.areaSize = parseFloat(document.getElementById('areaSize').value);
    simParams.bsDensity = parseInt(document.getElementById('bsDensity').value);
    simParams.ueDensity = parseInt(document.getElementById('ueDensity').value);
    simParams.obstacleDensity = parseInt(document.getElementById('obstacleDensity').value);

    clearScene(); // Remove existing objects
    createFactoryEnvironment();

    // Create Base Stations
    bsSelect.innerHTML = '<option value="">Select</option>'; // Clear dropdown
    for (let i = 0; i < simParams.bsDensity; i++) {
        const angle = (i / simParams.bsDensity) * Math.PI * 2;
        const radius = simParams.areaSize * 0.35;
        const position = new THREE.Vector3(
            Math.cos(angle) * radius,
            simParams.bsHeight, // Use current height setting
            Math.sin(angle) * radius
        );
        createBaseStation(`gNodeB${i + 1}`, position);
    }

    // Select the first BS by default if available
    if (baseStations.length > 0) {
        simParams.selectedBsId = baseStations[0].userData.id;
        bsSelect.value = simParams.selectedBsId;
        updateBSConfigPanel(simParams.selectedBsId);
        highlightSelectedBS(simParams.selectedBsId);
    } else {
        simParams.selectedBsId = null;
        updateBSConfigPanel(null);
    }

    // Create AGVs
    for (let i = 0; i < simParams.ueDensity; i++) {
        createAGV(`AGV${i + 1}`);
    }

    // Reset camera slightly
    camera.position.set(simParams.areaSize * 0.7, simParams.areaSize * 0.6, simParams.areaSize * 0.7);
    controls.target.set(0, simParams.bsHeight / 4, 0); // Look towards center slightly raised
    controls.update();
    lastLLMUpdateTime = 0; // Reset mock LLM timer
    log(`Created ${simParams.bsDensity} BS and ${simParams.ueDensity} AGVs.`);
}

function clearScene() {
    log("Clearing scene objects...");

    // Remove AGVs and their lines
    agvs.forEach(agv => {
        if (agv.userData.connectionLine) scene.remove(agv.userData.connectionLine);
        scene.remove(agv);
    });
    agvs = [];

    // Remove Beams
    beams.forEach(beam => scene.remove(beam));
    beams = [];

    // Remove Base Stations
    baseStations.forEach(bs => scene.remove(bs));
    baseStations = [];

    // Remove Obstacles
    obstacles.forEach(obs => scene.remove(obs));
    obstacles = [];

    // Remove Floor
    if(factoryFloor) scene.remove(factoryFloor);
    factoryFloor = null;

    // Clear UI elements linked to objects
    bsSelect.innerHTML = '<option value="">Select BS</option>';
    steeringJsonContainer.textContent = '{\n  "beamforming_solutions": []\n}';
}

// --- Window Resize ---
function onWindowResize() {
    const newWidth = viewportContainer.clientWidth;
    const newHeight = viewportContainer.clientHeight;

    if (newWidth > 0 && newHeight > 0) { // Check dimensions are valid
        camera.aspect = newWidth / newHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(newWidth, newHeight);
    }
}

// --- Animation Loop ---
function animateFrame() {
    requestAnimationFrame(animateFrame);
    const delta = clock.getDelta();
    
    if (isPaused === false) {
        // Update AGV movement
        agvs.forEach(agv => { 
            updateAGVMovement(agv, delta); 
        });

        // Update beamforming 
        updateBeamforming();

        // Update stats overlay
        updateStatsOverlay();
    }

    // if controls.enableDamping/controls.autoRotate = true
    controls.update(); 
    renderer.render(scene, camera);
}

// --- Initialization ---
function initialize() {
    log("Initializing simulation...");

    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb); 
    scene.fog = new THREE.Fog(0x1a202c, 100, 300);

    // Camera
    const aspect = viewportContainer.clientWidth / viewportContainer.clientHeight;
    camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
    camera.position.set(simParams.areaSize * 0.7, simParams.areaSize * 0.6, simParams.areaSize * 0.7);
    camera.lookAt(0, 0, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(viewportContainer.clientWidth, viewportContainer.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true; // Enable shadows
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    viewportContainer.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x606060);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(simParams.areaSize * 0.5, simParams.areaSize, simParams.areaSize * 0.5);
    directionalLight.castShadow = true;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.far = simParams.areaSize * 3;
    directionalLight.shadow.camera.left = -simParams.areaSize;
    directionalLight.shadow.camera.right = simParams.areaSize;
    directionalLight.shadow.camera.top = simParams.areaSize;
    directionalLight.shadow.camera.bottom = -simParams.areaSize;
    scene.add(directionalLight);

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.autoRotateSpeed = 0.25;
    controls.dampingFactor = 0.05;
    controls.enableDamping = true;
    controls.autoRotate = false;

    // Prevent looking below ground
    controls.maxPolarAngle = Math.PI / 2 - 0.05; 
    controls.target.set(0, 0, 0);
    controls.update();

    // Resize listener
    window.addEventListener('resize', onWindowResize, false);

    setupUIListeners();
    resetSimulation();
    animateFrame();

    log("Initialization complete!", "SUCCESS");
}

// --- Initialize simulation ---
initialize();