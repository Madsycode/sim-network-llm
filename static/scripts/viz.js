import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const CONFIGS = {
    vendors: ['Ericsson', 'Nokia', 'Huawei', 'Samsung'],
    bands: [{ name: 'n78', freq: 3500 }, { name: 'n257', freq: 28000 }, { name: 'n258', freq: 26000 }],
    agvTasks: ['Transporting Parts', 'Material Supply', 'Waste Removal', 'Tool Delivery', 'Assembly Transfer'],
    pathLoss: { referenceDistance: 1.0, referenceLoss: 32.45, exponent: 2.5, obstacleShadowLoss: 10 },
    thermalNoiseDBM: -174, handoverMarginDB: 3, bsTxPowerDBM: 23,
};

const UTILS = {
    estimateThroughput: (sinr_db) => {
        const linear_sinr = Math.pow(10, sinr_db / 10);
        const spectral_efficiency = Math.log2(1 + linear_sinr);
        return Math.min(spectral_efficiency * 20, 400) * (0.8 + Math.random() * 0.2);
    },

    getSINRColor: (sinr) => {
        if (sinr > 15) return new THREE.Color(0x00ff00);    // Excellent
        if (sinr > 5) return new THREE.Color(0xffff00);     // Good
        if (sinr >-5) return new THREE.Color(0xffa500);     // Fair
        return new THREE.Color(0xff0000);                   // Poor
    },
    
    generateImei: () => '35824005' + Math.floor(1000000 + Math.random() * 9000000),
    getRandom: (arr) => arr[Math.floor(Math.random() * arr.length)],
    clamp: (val, min, max) => Math.max(min, Math.min(val, max)),
    dbmToWatts: (dbm) => Math.pow(10, (dbm - 30) / 10),
};

class Simulation {
    constructor() {
        this.dom = { 
            restartButton: document.getElementById('restartButton'),
            bsConfigPanel: document.getElementById('bs-configs'), 
            ueConfigPanel: document.getElementById('ue-configs'), 
            rotateSpeed: document.getElementById('rotateSpeed'),
            factoryArea: document.getElementById('factoryArea'),
            pauseButton: document.getElementById('pauseButton'), 
            viewport: document.getElementById('simViewport'), 
            ueDensity: document.getElementById('ueDensity'),
            bsDensity: document.getElementById('bsDensity'), 
            logs: document.getElementById('simulationLogs'), 
            stats: document.getElementById('statsOverlay'), 
            ueSelect: document.getElementById('ueSelect'), 
            bsSelect: document.getElementById('bsSelect') 
        };
        
        this.raycaster = new THREE.Raycaster();
        this.clock = new THREE.Clock();
        this.scene = new THREE.Scene();
        this.isPaused = true;
        
        this.collidableObjects = []; 
        this.chargingStations = [];
        this.connectionLines = []; 
        this.workstations = []; 
        this.obstacles = [];
        this.gNodeBs = []; 
        this.agvs = []; 
        
        this.controls = null;
        this.renderer = null; 
        this.camera = null; 
        
        this.params = { 
            obstacleDensity: 30,
            selectedBsId: null, 
            selectedUeId: null, 
            factorySize: 250, 
            wallHeight: 10,
            ueDensity: 10, 
            bsDensity: 4 
        };

        this._initialize();
    }
    
    // configuration for nav grid
    _navConfig = { cellSize: 2.5, cols: 0, rows: 0, originX: 0, originZ: 0, grid: null };

    _buildNavGrid() {
        const size = this.params.factorySize;
        const cs = this._navConfig.cellSize;
        this._navConfig.cols = Math.ceil(size / cs);
        this._navConfig.rows = Math.ceil(size / cs);
        this._navConfig.originX = -size / 2;
        this._navConfig.originZ = -size / 2;
        // initialize grid with 0 = free, 1 = blocked
        this._navConfig.grid = new Array(this._navConfig.rows).fill(0).map(()=> new Uint8Array(this._navConfig.cols));

        // mark cells intersecting collidable objects as blocked
        const tmpBox = new THREE.Box3();
        for (const obj of this.collidableObjects) {
            obj.updateMatrixWorld();
            tmpBox.setFromObject(obj);
            // expand box slightly to ensure safe clearance
            tmpBox.expandByScalar(0.6);
            // convert to grid extents
            const minI = Math.max(0, Math.floor((tmpBox.min.x - this._navConfig.originX) / cs));
            const maxI = Math.min(this._navConfig.cols - 1, Math.floor((tmpBox.max.x - this._navConfig.originX) / cs));
            const minJ = Math.max(0, Math.floor((tmpBox.min.z - this._navConfig.originZ) / cs));
            const maxJ = Math.min(this._navConfig.rows - 1, Math.floor((tmpBox.max.z - this._navConfig.originZ) / cs));
            for (let j = minJ; j <= maxJ; j++) {
                for (let i = minI; i <= maxI; i++) {
                    this._navConfig.grid[j][i] = 1;
                }
            }
        }
    }

    // world position -> grid indices
    _worldToGrid(pos) {
        const cs = this._navConfig.cellSize;
        const i = Math.floor((pos.x - this._navConfig.originX) / cs);
        const j = Math.floor((pos.z - this._navConfig.originZ) / cs);
        return { i, j };
    }

    // grid indices -> world position (center of cell)
    _gridToWorld(i, j) {
        const cs = this._navConfig.cellSize;
        const x = this._navConfig.originX + i * cs + cs / 2;
        const z = this._navConfig.originZ + j * cs + cs / 2;
        return new THREE.Vector3(x, 0.5, z);
    }

    // Manhattan / Euclidean heuristic
    _hCost(a, b) { return Math.hypot(a.i - b.i, a.j - b.j); }

    // neighbors (8-connected)
    _getNeighbors(node) {
        const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
        const nb = [];
        for (const d of dirs) {
            const ni = node.i + d[0], nj = node.j + d[1];
            if (ni >= 0 && ni < this._navConfig.cols && nj >= 0 && nj < this._navConfig.rows) {
                if (this._navConfig.grid[nj][ni] === 0) nb.push({ i: ni, j: nj });
            }
        }
        return nb;
    }

    // A* returning an array of world Vector3 waypoints or null
    _findPathWorld(startVec, goalVec) {
        if (!this._navConfig.grid) this._buildNavGrid();
        const start = this._worldToGrid(startVec);
        const goal = this._worldToGrid(goalVec);
        // clamp indices
        start.i = Math.min(Math.max(start.i,0), this._navConfig.cols-1);
        start.j = Math.min(Math.max(start.j,0), this._navConfig.rows-1);
        goal.i = Math.min(Math.max(goal.i,0), this._navConfig.cols-1);
        goal.j = Math.min(Math.max(goal.j,0), this._navConfig.rows-1);

        // if start or goal on blocked cell, attempt to find nearest free neighbor (small search radius)
        const snapToFree = (cell) => {
            if (this._navConfig.grid[cell.j][cell.i] === 0) return cell;
            const radius = 3;
            for (let r = 1; r <= radius; r++) {
                for (let dj = -r; dj <= r; dj++) {
                    for (let di = -r; di <= r; di++) {
                        const ni = cell.i + di, nj = cell.j + dj;
                        if (ni >=0 && ni < this._navConfig.cols && nj >=0 && nj < this._navConfig.rows) {
                            if (this._navConfig.grid[nj][ni] === 0) return { i: ni, j: nj };
                        }
                    }
                }
            }
            return null;
        };
        const s = snapToFree(start), g = snapToFree(goal);
        if (!s || !g) return null;

        // A*
        const key = (n)=> `${n.i},${n.j}`;
        const open = new Map();
        const closed = new Set();
        const gScore = new Map();
        const fScore = new Map();
        const cameFrom = new Map();

        open.set(key(s), s); gScore.set(key(s), 0); fScore.set(key(s), this._hCost(s,g));

        while (open.size > 0) {
            // pick node with lowest f
            let currentKey, current;
            for (const [k,n] of open) {
                if (!current || (fScore.get(k) < fScore.get(currentKey))) { current = n; currentKey = k; }
            }
            if (current.i === g.i && current.j === g.j) {
                // reconstruct
                const path = [];
                let curK = currentKey;
                while (cameFrom.has(curK)) {
                    const parts = curK.split(',').map(Number);
                    path.push({ i: parts[0], j: parts[1] });
                    curK = cameFrom.get(curK);
                }
                // add start
                const sparts = curK.split(',').map(Number);
                path.push({ i: sparts[0], j: sparts[1] });
                path.reverse();
                // reduce path by converting to world points and pruning near-collinear points
                const waypoints = path.map(p => this._gridToWorld(p.i, p.j));
                return waypoints;
            }

            open.delete(currentKey);
            closed.add(currentKey);

            for (const nb of this._getNeighbors(current)) {
                const nk = key(nb);
                if (closed.has(nk)) continue;
                const tentativeG = gScore.get(currentKey) + this._hCost(current, nb);
                const existingG = gScore.get(nk);
                if (!open.has(nk) || tentativeG < existingG) {
                    cameFrom.set(nk, currentKey);
                    gScore.set(nk, tentativeG);
                    fScore.set(nk, tentativeG + this._hCost(nb, g));
                    if (!open.has(nk)) open.set(nk, nb);
                }
            }
        }
        return null;
    }

    _initialize() {
        this.log('Initializing simulation...', 'DEBUG');
        this.scene.background = new THREE.Color(0x1a202c);
        this.scene.fog = new THREE.Fog(0x1a202c, this.params.factorySize * 1.5, this.params.factorySize * 3);
        this.camera = new THREE.PerspectiveCamera(45, this.dom.viewport.clientWidth / this.dom.viewport.clientHeight, 0.1, 1000);
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(this.dom.viewport.clientWidth, this.dom.viewport.clientHeight);
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true; 
        this.dom.viewport.appendChild(this.renderer.domElement);

        this.scene.add(new THREE.HemisphereLight(0x606070, 0x202020, 2.0));
        const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
        dirLight.position.set(this.params.factorySize * 0.5, this.params.factorySize * 0.8, this.params.factorySize * 0.3);
        dirLight.shadow.camera.bottom = -this.params.factorySize / 2;
        dirLight.shadow.camera.right = this.params.factorySize / 2;
        dirLight.shadow.camera.left = -this.params.factorySize / 2;
        dirLight.shadow.camera.top = this.params.factorySize / 2;
        dirLight.shadow.mapSize.height = 2048;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.castShadow = true;
        this.scene.add(dirLight);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.maxPolarAngle = Math.PI / 2 - 0.05; 
        this.controls.dampingFactor = 0.05;
        this.controls.enableDamping = true; 
        this.controls.autoRotate  = false; 
        this.controls.minDistance = 20; 
        this.controls.maxDistance = this.params.factorySize * 3;

        this._setupEventListeners();
        this.resetSimulation();
        this._animate();

        this.log('Initialization complete.', 'SUCCESS');
    }

    async _runQuery(query) {
        try {
            const response = await fetch('/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query })
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || 'Query failed!');
            }

            // Optional: return success or result if needed
            return await response.json();
        } catch (error) {
            this.log(`_runQuery failed for query: "${query}". 
                Error: ${error.message}`, 'ERROR');
        }
    }

    async _createGraph() {
        try {
            const payload = {
                gNodeBs: this.gNodeBs.map(bs => structuredClone(bs.userData)),
                AGVs: this.agvs.map(agv => structuredClone(agv.userData)),
            };

            const response = await fetch('/api/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Failed to create graph nodes.');
            }
            this.log('Knowledge Graph successfully updated.', 'DEBUG');
        } 
        catch (error) {
            this.log(`Graph creation error: ${error.message}`, 'ERROR');
        }
    }
    
    togglePause() { 
        this.isPaused = !this.isPaused; 

        if(this.isPaused === false) {
            this.intervalId = setInterval(() => {
                this._createGraph();
            }, 5000);
        }
        else {
            clearInterval(this.intervalId);
        }

        this.dom.pauseButton.innerHTML = this.isPaused ? 
        `<i class="fa-solid fa-play"></i> Start` : 
        `<i class="fa-solid fa-pause"></i> Pause`; 
        this.dom.pauseButton.classList.toggle('bg-blue-600', this.isPaused);
        this.dom.pauseButton.classList.toggle('bg-yellow-600', !this.isPaused);
        this.dom.pauseButton.classList.toggle('hover:bg-blue-700', this.isPaused);
        this.dom.pauseButton.classList.toggle('hover:bg-yellow-700', !this.isPaused);        
        this.log(this.isPaused ? "Simulation paused." : "Simulation running...", "WARN"); 
    }

    resetSimulation() {
        this.isPaused = true;
        this.log('Resetting simulation...', 'WARN');
        this.dom.pauseButton.innerHTML = `<i class="fa-solid fa-play"></i> Start`;

        this._clearSceneObjects();
        this._createEnvironment();
        
        const half = this.params.factorySize / 2;
        const quarter = this.params.factorySize / 4;

        const positions = [
            [-quarter, 0, -quarter], [ quarter, 0, -quarter],
            [-quarter, 0,  quarter], [ quarter, 0,  quarter]
        ];
        
        for (let i = 0; i < Math.min(this.params.bsDensity, 4); i++) {
            const [x, y, z] = positions[i];
            this._createBS(`gNodeB-${i + 1}`, x, y, z);
        }

        for (let i = 0; i < this.params.ueDensity; i++) 
            this._createUE(`AGV-${1001 + i}`);

        if (this.gNodeBs.length > 0) { 
            this.dom.bsSelect.value = this.gNodeBs[0].userData.id; 
            this.params.selectedBsId = this.gNodeBs[0].userData.id; 
        }

        if (this.agvs.length > 0) { 
            this.dom.ueSelect.value = this.agvs[0].userData.id; 
            this.params.selectedUeId = this.agvs[0].userData.id; 
        }

        this.camera.position.set(this.params.factorySize * 0.7, this.params.factorySize * 0.6, this.params.factorySize * 0.7);
        this.controls.target.set(0, 10, 0); this.controls.update();
        
        this._highlightSelectedBS(this.params.selectedBsId);
        this._highlightSelectedUE(this.params.selectedUeId);

        this.log(`Created ${this.gNodeBs.length} gNodeBs and ${this.params.ueDensity} AGVs.`, 'SUCCESS');
    }

    _createEnvironment() {
        this.obstacles = [];
        this.workstations = [];
        this.chargingStations = [];
        this.collidableObjects = []; 

        const boundingBoxes = [];
        const size = this.params.factorySize;
        const wallHeight = this.params.wallHeight;

        const floorMat = new THREE.MeshStandardMaterial({ map: this._createFloorTexture(), roughness: 0.6, metalness: 0.1 });
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(size, size), floorMat);
        floor.rotation.x = -Math.PI / 2; 
        this.scene.add(floor);

        const grid = new THREE.GridHelper(size, 20, 0x8899aa, 0x8899aa);
        grid.position.y = 0.01;
        this.scene.add(grid);

        const addWall = (geometry, position, rotationY = 0) => {
            const wall = new THREE.Mesh(geometry, floorMat);
            wall.position.copy(position);
            wall.rotation.y = rotationY;
            wall.castShadow = true;
            this.scene.add(wall);
            this.collidableObjects.push(wall); 
        };

        addWall(new THREE.BoxGeometry(size, wallHeight, 1), new THREE.Vector3(0, wallHeight/2, -size/2));
        addWall(new THREE.BoxGeometry(size, wallHeight, 1), new THREE.Vector3(0, wallHeight/2, size/2));
        addWall(new THREE.BoxGeometry(1, wallHeight, size), new THREE.Vector3(size/2, wallHeight/2, 0));
        addWall(new THREE.BoxGeometry(1, wallHeight, size), new THREE.Vector3(-size/2, wallHeight/2, 0));
        addWall(new THREE.BoxGeometry(1, wallHeight, size * 3/4), new THREE.Vector3(-size/6, wallHeight/2, size/8));
        addWall(new THREE.BoxGeometry(1, wallHeight, size/2), new THREE.Vector3(size/4, wallHeight/2, 0), Math.PI/2);

        const isOverlapping = (bbox) => boundingBoxes.some(existing => bbox.intersectsBox(existing));

        const addObject = (mesh) => {
            mesh.updateMatrixWorld();
            const bbox = new THREE.Box3().setFromObject(mesh);
            if (!isOverlapping(bbox)) {
                boundingBoxes.push(bbox);
                this.scene.add(mesh);
                return true;
            }
            return false;
        };

        const wsColors = [0xffff00, 0x4299e1, 0x718096, 0x9f7aea, 0x48bb78];
        for(let i = 0; i < 6; i++) {
            const ws = new THREE.Mesh( new THREE.BoxGeometry(12, 0.5 , 12), new THREE.MeshStandardMaterial({ color: wsColors[i % wsColors.length] }));
            ws.position.set(size * 0.4, 0.25, -size * 0.35 + i * size * 0.14);
            if (addObject(ws)) this.workstations.push(ws);
        }

        const charger = new THREE.Mesh( new THREE.CircleGeometry(10, 32), new THREE.MeshStandardMaterial({ color: 0xffff00 }));
        charger.position.set(-size * 0.4, 0.5, size * 0.4);
        charger.rotation.x = -Math.PI / 2;
        if (addObject(charger)) this.chargingStations.push(charger);

        for(let i = 0; i < this.params.obstacleDensity; i++) {
            let placed = false;
            for (let attempt = 0; attempt < 20 && !placed; attempt++) {
                const shapeX = Math.random() + 0.1;
                const shapeY = Math.random() + 0.1;
                const shapeZ = Math.random() + 0.1;
                const obs = new THREE.Mesh( new THREE.BoxGeometry(shapeX * 20, shapeY * this.params.wallHeight - 1, 20 * shapeZ), new THREE.MeshStandardMaterial({ color: 0x718096 }));
                obs.position.set( UTILS.clamp((Math.random() - 0.5) * size, -size/2 + 5, size/2 - 5), shapeY * 7.5, UTILS.clamp((Math.random() - 0.5) * size, -size/2 + 5, size/2 - 5));
                if (addObject(obs)) {
                    this.obstacles.push(obs);
                    this.collidableObjects.push(obs);
                    placed = true;
                }
            }
        }
    }
       
    _createFloorTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 512; canvas.height = 512;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#454945'; ctx.fillRect(0, 0, 512, 512);
        for (let i = 0; i < 5000; i++) {
            ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.1})`;
            ctx.beginPath();
            ctx.arc(Math.random() * 512, Math.random() * 512, Math.random() * 10, 0, Math.PI * 2);
            ctx.fill();
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(this.params.factorySize / 20, this.params.factorySize / 20);
        return texture;
    }
    
    _setupEventListeners() {
        this.dom.restartButton.addEventListener('click', () => this.resetSimulation());
        this.dom.pauseButton.addEventListener('click', () => this.togglePause());
        window.addEventListener('resize', () => this._onWindowResize(), false);
        
        this.dom.rotateSpeed.addEventListener('change', () => { 
            this.controls.autoRotateSpeed = this.dom.rotateSpeed.value;
            this.controls.autoRotate = this.dom.rotateSpeed.value > 0 ? true : false;
            document.getElementById('rotateSpeedValue').textContent = this.dom.rotateSpeed.value;
        });

        this.dom.factoryArea.addEventListener('change', () => { 
            this.params.factorySize = this.dom.factoryArea.value;
            document.getElementById('factoryAreaValue').textContent = this.dom.factoryArea.value;
            this.log(`Factory size set to ${this.params.factorySize}! Please reset the simulation.`, 'WARN');            
        });

        this.dom.bsDensity.addEventListener('change', () => { 
            this.params.bsDensity = this.dom.bsDensity.value;
            document.getElementById('bsDensityValue').textContent = this.dom.bsDensity.value;
            this.log(`BS density set to ${this.params.bsDensity}! Please reset the simulation.`, 'WARN');
        });

        this.dom.ueDensity.addEventListener('change', () => { 
            this.params.ueDensity = this.dom.ueDensity.value;
            document.getElementById('ueDensityValue').textContent = this.dom.ueDensity.value;
            this.log(`UE density set to ${this.params.ueDensity}! Please reset the simulation.`, 'WARN');
        });

        this.dom.bsSelect.addEventListener('change', e => { 
            this.params.selectedBsId = e.target.value; 
            this._highlightSelectedBS(this.params.selectedBsId); 
        });
        
        this.dom.ueSelect.addEventListener('change', e => { 
            this.params.selectedUeId = e.target.value; 
            this._highlightSelectedUE(this.params.selectedUeId); 
        });
    }

    log(message, type = 'EVENT') {
        if(type === 'ERROR') return;

        const colors = {
            'WARN': '#ffe100ff', 
            'ERROR': '#f87171', 
            'EVENT': '#9ca3af', 
            'SUCCESS': '#34d399', 
            'DEBUG': '#4299e1' 
        };
        const entry = document.createElement('div');
        const time = new Date().toLocaleTimeString();
        entry.style.color = colors[type] || colors['EVENT'];
        entry.innerHTML = `[${time}] ${message}`;
        this.dom.logs.appendChild(entry); this.dom.logs.scrollTop = this.dom.logs.scrollHeight;
        if (this.dom.logs.childNodes.length > 200) this.dom.logs.removeChild(this.dom.logs.firstChild);
    }

    _createTextLabel(text, size = 20, color = 'white') {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        const font = `bold ${size}px Arial`;
        context.font = font;
        
        // Measure text and size canvas accordingly
        const metrics = context.measureText(text);
        const textWidth = metrics.width;
        canvas.width = textWidth + 10; // Add some padding
        canvas.height = size + 10;

        // Re-apply font and draw text (important after resizing)
        context.font = font;
        context.fillStyle = color;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture, depthTest: false });
        const sprite = new THREE.Sprite(spriteMaterial);
        
        // Scale the sprite to an appropriate size in the scene
        sprite.scale.set(canvas.width / 10, canvas.height / 10, 1.0);        
        return sprite;
    }

    _createBS(id, x, y, z) {
        const bsGroup = new THREE.Group();       
        bsGroup.position.set(x, y, z);

        const mastHeight = 18;
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, mastHeight, 16),
            new THREE.MeshStandardMaterial({ color: 0x90a0b0, metalness: 0.7, roughness: 0.4 }));
        mast.position.y = mastHeight / 2; mast.castShadow = true;
        bsGroup.add(mast);

        const panelGeometry = new THREE.BoxGeometry(0.4, 2.5, 1.2);
        const panelMaterial = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.7 });
        const radius = 0.8;
        for (let i = 0; i < 3; i++) {
            const panel = new THREE.Mesh(panelGeometry, panelMaterial);
            const angle = (i / 3) * Math.PI * 2;
            panel.position.set(Math.cos(angle) * radius, mastHeight - 2, Math.sin(angle) * radius);
            panel.rotation.y = angle + Math.PI;            
            bsGroup.add(panel);
        }

        const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 8), new THREE.MeshStandardMaterial({ color: 0x718096 }));
        crossbar.position.y = mastHeight - 2; crossbar.rotation.z = Math.PI / 2;
        bsGroup.add(crossbar);

        // change creation of light and lightSphere
        const light = new THREE.PointLight(0x00aaff, 3, 30);
        light.position.y = mastHeight + 1; light.name = 'status_light';
        bsGroup.add(light);
        const lightSphere = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 12),
            new THREE.MeshStandardMaterial({ emissive: 0x00aaff, emissiveIntensity: 3 }));
        lightSphere.position.copy(light.position);
        bsGroup.add(lightSphere);

        // <-- Text label to BS -->
        const label = this._createTextLabel(id, 40, 'cyan');
        label.position.y = mastHeight + 3; 
        bsGroup.add(label);

        bsGroup.userData = { 
            id:id, 
            status: 'active', 
            connected_ues: [], 
            height: mastHeight,
            location: bsGroup.position,
            vendor: UTILS.getRandom(CONFIGS.vendors), 
            band: UTILS.getRandom(CONFIGS.bands).name,
        };

        this.gNodeBs.push(bsGroup); 
        this.scene.add(bsGroup); 

        // add select option
        this.dom.bsSelect.add(new Option(id, id));
    }

    _createUE(id) {
        const agvGroup = new THREE.Group();        
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.6, roughness: 0.3, envMapIntensity: 0.5 });
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
        const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.9, 2.2), bodyMat);
        body.castShadow = true; body.receiveShadow = true;

        // add low-profile bumper for visual and collision padding
        const bumper = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.25, 0.4), new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.6 }));
        bumper.position.set(0, -0.1, 1.05); agvGroup.add(bumper);
        // add visible lidar ring
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.9, 24), new THREE.MeshStandardMaterial({ emissive: 0x00ffff, emissiveIntensity: 0.6, side: THREE.DoubleSide }));
        ring.rotation.x = Math.PI / 2; ring.position.y = 0.82; agvGroup.add(ring);
        agvGroup.add(body);

        const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.5, 16);
        wheelGeo.rotateZ(Math.PI / 2);
        [ [1, -0.2, 1], [-1, -0.2, 1], [1, -0.2, -1], [-1, -0.2, -1] ].forEach(p => { 
            const wheel = new THREE.Mesh(wheelGeo, wheelMat); 
            wheel.position.fromArray(p); agvGroup.add(wheel); 
        });
        const sensor = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 10), 
            new THREE.MeshStandardMaterial({ color: 0x00ffff, 
                emissive: 0x00ffff, emissiveIntensity: 2 }));            
        sensor.name = "ue_sensor"; 
        sensor.position.y = 0.8; 
        agvGroup.add(sensor);
        
        // Text label 
        const label = this._createTextLabel(id, 20, '#FFD700');
        label.position.y = 2; 
        agvGroup.add(label);

        const bound = this.params.factorySize / 2 - 2;
        agvGroup.position.set(UTILS.clamp((Math.random()-0.5) * this.params.factorySize, 
        -bound, bound), 0.5, UTILS.clamp((Math.random()-0.5) * 
        this.params.factorySize, -bound, bound));
        
        //agv user data
        agvGroup.userData = {
            id, imei: UTILS.generateImei(), status: 'idle', task: 'None', battery_percentage: 100,
            connected_bs: null, rsrp_dbm: -140, sinr_db: -20, throughput_mbps: 0,
            targetPosition: null, stuck_timer: 0,
            location: agvGroup.position,
            speed: 3 + Math.random() * 2
        };

        this._assignNewTask(agvGroup);
        this.agvs.push(agvGroup); 
        this.scene.add(agvGroup); 

        // add option
        this.dom.ueSelect.add(new Option(id, id));
    }

    // --- REPLACE _assignNewTask ---
    _assignNewTask(agv) {
        const bound = this.params.factorySize / 2 - 2;
        if (agv.userData.battery_percentage < 20 && this.chargingStations.length > 0) {
            agv.userData.task = 'Charging';
            agv.userData.targetPosition = this.chargingStations[0].position.clone();
            this.log(`${agv.userData.id} battery low. Moving to charging station.`, 'WARN');
        } else {
            agv.userData.task = UTILS.getRandom(CONFIGS.agvTasks);
            // pick random workstation
            if (this.workstations.length === 0) {
                agv.userData.targetPosition = new THREE.Vector3(
                    UTILS.clamp((Math.random()-0.5) * this.params.factorySize, -bound, bound),
                    0.5,
                    UTILS.clamp((Math.random()-0.5) * this.params.factorySize, -bound, bound)
                );
            } else {
                agv.userData.targetPosition = UTILS.getRandom(this.workstations).position.clone();
            }
        }

        agv.userData.targetPosition.x = UTILS.clamp(agv.userData.targetPosition.x, -bound, bound);
        agv.userData.targetPosition.z = UTILS.clamp(agv.userData.targetPosition.z, -bound, bound);
        agv.userData.status = 'Moving';

        // build nav grid and compute path
        this._buildNavGrid();
        const path = this._findPathWorld(agv.position, agv.userData.targetPosition);
        if (path && path.length > 0) {
            agv.userData.path = path;
            agv.userData.pathIndex = 0;
            // optional: visualize small markers (comment if not desired)
            //agv.userData._pathHelpers = path.map(p => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.2,6,6), new THREE.MeshStandardMaterial({emissive:0x00ff00})); m.position.copy(p); this.scene.add(m); return m; });
        } else {
            // fallback: if no path found, assign wandering target to avoid permanent stuck
            this.log(`${agv.userData.id} path not found. Assigning fallback target.`, 'WARN');
            agv.userData.path = null;
            setTimeout(()=> this._assignNewTask(agv), 500 + Math.random() * 1500);
        }
    }

    // --- REPLACE _updateAGVState ---
    _updateAGVState(agv, delta) {
        if (!this.isPaused) agv.userData.battery_percentage = Math.max(0, agv.userData.battery_percentage - delta * 0.1);

        if (!agv.userData.targetPosition) return;

        // follow path if exists
        if (agv.userData.path && agv.userData.path.length > 0) {
            const idx = agv.userData.pathIndex || 0;
            const waypoint = agv.userData.path[idx];
            if (!waypoint) { agv.userData.path = null; agv.userData.pathIndex = 0; return; }

            const dirVec = waypoint.clone().sub(agv.position); dirVec.y = 0;
            const dist = dirVec.length();
            if (dist < (this._navConfig.cellSize * 0.6)) {
                // reached waypoint
                agv.userData.pathIndex = idx + 1;
                if (agv.userData.pathIndex >= agv.userData.path.length) {
                    // reached destination
                    agv.userData.targetPosition = null;
                    agv.userData.path = null;
                    agv.userData.pathIndex = 0;
                    agv.userData.stuck_timer = 0;
                    agv.userData.status = 'Idle';
                    if (agv.userData.task === 'Charging') {
                        // start charging
                    } else {
                        setTimeout(()=> this._assignNewTask(agv), 800 + Math.random() * 1200);
                    }
                    return;
                }
            } else {
                // attempt to move towards waypoint while checking collisions ahead
                const direction = dirVec.clone().normalize();
                this.raycaster.set(agv.position, direction);
                const intersections = this.raycaster.intersectObjects(this.collidableObjects, false);
                const collisionDistance = 1.2 * this._navConfig.cellSize; // safe lookahead
                if (intersections.length > 0 && intersections[0].distance < collisionDistance) {
                    agv.userData.stuck_timer += delta;
                    if (agv.userData.stuck_timer > 0.8) {
                        // obstruction detected on path. Rebuild nav grid and replan to current target
                        this.log(`${agv.userData.id} obstruction on path; replanning.`, 'DEBUG');
                        this._buildNavGrid();
                        const newPath = this._findPathWorld(agv.position, agv.userData.targetPosition);
                        if (newPath && newPath.length > 0) {
                            agv.userData.path = newPath;
                            agv.userData.pathIndex = 0;
                            agv.userData.stuck_timer = 0;
                        } else {
                            // can't replan; pick a new task
                            this.log(`${agv.userData.id} cannot replan. Assigning new task.`, 'WARN');
                            this._assignNewTask(agv);
                            agv.userData.stuck_timer = 0;
                        }
                    }
                } else {
                    agv.userData.stuck_timer = 0;
                    // movement
                    const moveDist = agv.userData.speed * delta;
                    agv.position.add(direction.multiplyScalar(moveDist));
                    // orientation
                    agv.lookAt(agv.position.clone().add(direction));
                    // clamp to boundaries
                    const bound = this.params.factorySize / 2 - 2;
                    agv.position.x = UTILS.clamp(agv.position.x, -bound, bound);
                    agv.position.z = UTILS.clamp(agv.position.z, -bound, bound);
                    // rotate wheels if present
                    agv.traverse((c) => {
                        if (c.geometry && c.geometry.type === "CylinderGeometry") {
                            c.rotation.x -= moveDist / 0.5; // wheel rotation heuristic
                        }
                    });
                }
            }
        } else {
            // original fallback: straight-line motion with raycast; keep but reduce step
            const direction = agv.userData.targetPosition.clone().sub(agv.position);
            direction.y = 0;
            if (direction.length() < 1.5) {
                agv.userData.stuck_timer = 0;
                agv.userData.status = 'Idle';
                if (agv.userData.task === 'Charging') {
                    if (agv.userData.battery_percentage < 100) agv.userData.battery_percentage += delta * 10;
                    else { this.log(`${agv.userData.id} fully charged.`, 'SUCCESS'); this._assignNewTask(agv); }
                } else {
                    setTimeout(() => this._assignNewTask(agv), 1000 + Math.random() * 2000);
                }
                agv.userData.targetPosition = null;
            } else {
                // try to replan using grid
                this._buildNavGrid();
                const newPath = this._findPathWorld(agv.position, agv.userData.targetPosition);
                if (newPath && newPath.length > 0) {
                    agv.userData.path = newPath; agv.userData.pathIndex = 0; return;
                }
                // otherwise use cautious straight move
                direction.normalize();
                this.raycaster.set(agv.position, direction);
                const intersections = this.raycaster.intersectObjects(this.collidableObjects);
                if (intersections.length > 0 && intersections[0].distance < 2.0) {
                    agv.userData.stuck_timer += delta;
                    if (agv.userData.stuck_timer > 2.0) {
                        this.log(`${agv.userData.id} is stuck, rerouting...`, 'EVENT');
                        this._assignNewTask(agv);
                        agv.userData.stuck_timer = 0;
                    }
                } else {
                    agv.userData.stuck_timer = 0;
                    agv.position.add(direction.multiplyScalar(agv.userData.speed * delta));
                    agv.lookAt(agv.position.clone().add(direction));
                    const bound = this.params.factorySize / 2 - 2;
                    agv.position.x = UTILS.clamp(agv.position.x, -bound, bound);
                    agv.position.z = UTILS.clamp(agv.position.z, -bound, bound);
                }
            }
        }
    }

    _updateConnectivity() {
        this.connectionLines.forEach(l => { this.scene.remove(l); l.geometry.dispose(); l.material.dispose(); });
        this.connectionLines = [];
        this.gNodeBs.forEach(bs => bs.userData.connected_ues = []);

        for (const agv of this.agvs) {
            const signals = this.gNodeBs.map(bs => {
                const distance = agv.position.distanceTo(bs.position);
                let pathLoss = CONFIGS.pathLoss.referenceLoss + 10 * CONFIGS.pathLoss.exponent * Math.log10(distance);
                this.raycaster.set(agv.position, bs.position.clone().sub(agv.position).normalize());
                const intersects = this.raycaster.intersectObjects(this.collidableObjects, false);
                if(intersects.length > 0 && intersects[0].distance < distance) pathLoss += CONFIGS.pathLoss.obstacleShadowLoss;
                return { bs, rsrp_dbm: CONFIGS.bsTxPowerDBM - pathLoss };
            });
            if (signals.length === 0) continue;
            
            signals.sort((a, b) => b.rsrp_dbm - a.rsrp_dbm);
            const bestSignal = signals[0];

            const currentBS = this.gNodeBs.find(bs => bs.userData.id === agv.userData.connected_bs);
            const currentRSRP = currentBS ? signals.find(s=> s.bs.userData.id === currentBS.userData.id).rsrp_dbm : -Infinity;
            if (!currentBS || bestSignal.rsrp_dbm > currentRSRP + CONFIGS.handoverMarginDB) {
                this.log(`DEBUG: ${agv.userData.id} to ${bestSignal.bs.userData.id} (RSRP: ${bestSignal.rsrp_dbm.toFixed(1)}dBm)`, 'DEBUG');
                agv.userData.connected_bs = bestSignal.bs.userData.id;

                // The cypher query 
                const cypher = `
                    MATCH (agv:AGV {id: '${agv.userData.id}'})
                    OPTIONAL MATCH (agv)-[r:CONNECTED_TO]->()
                    DELETE r
                    WITH agv
                    MATCH (gnb:gNodeB {id: '${bestSignal.bs.userData.id}'})
                    MERGE (agv)-[:CONNECTED_TO]->(gnb)`;
                // execute query
                this._runQuery(cypher);
            }
            
            const servingBS = this.gNodeBs.find(b => b.userData.id === agv.userData.connected_bs);
            if(!servingBS) { 
                agv.userData.throughput_mbps = 0; 
                agv.userData.rsrp_dbm = -140; 
                agv.userData.sinr_db = -20; 
                continue; 
            }
            
            const servingRSRP_dbm = signals.find(s => s.bs.userData.id === servingBS.userData.id).rsrp_dbm;
            const servingRSRPWatts = UTILS.dbmToWatts(servingRSRP_dbm);
            let interferenceWatts = 0;
            signals.filter(s => s.bs.userData.id !== servingBS.userData.id).forEach(s => { interferenceWatts += UTILS.dbmToWatts(s.rsrp_dbm); });
            const noiseWatts = UTILS.dbmToWatts(CONFIGS.thermalNoiseDBM + 10 * Math.log10(20e6));
            
            agv.userData.rsrp_dbm = servingRSRP_dbm;
            agv.userData.sinr_db = 10 * Math.log10(servingRSRPWatts / (interferenceWatts + noiseWatts));
            agv.userData.throughput_mbps = UTILS.estimateThroughput(agv.userData.sinr_db);
            servingBS.userData.connected_ues.push(agv.userData.id);

            const lineEdge = new THREE.Vector3(servingBS.position.x, servingBS.userData.height, servingBS.position.z);
            const line = new THREE.Line( new THREE.BufferGeometry().setFromPoints([agv.position, lineEdge]), new THREE.LineBasicMaterial({ color: UTILS.getSINRColor(agv.userData.sinr_db) }));
            this.connectionLines.push(line); this.scene.add(line);
        }
    }
       
    _highlightSelectedBS(bsId) { 
        this.gNodeBs.forEach(bs => { 
            bs.getObjectByName('status_light').intensity = bs.userData.id === bsId ? 25 : 10; 
        }); 
    }

    _highlightSelectedUE(ueId) { 
        this.agvs.forEach(agv => { 
            const sensor = agv.getObjectByName("ue_sensor"); 
            if(sensor) sensor.material.emissive.setHex(agv.userData.id === ueId ? 0xff4444 : 0x00ffff); 
        }); 
    }
    
    _clearSceneObjects() {
        this.log("Clearing scene objects...");
        [...this.agvs, ...this.gNodeBs, ...this.obstacles, ...this.workstations, ...this.chargingStations, ...this.connectionLines].forEach(obj => this.scene.remove(obj));
        this.agvs = []; this.gNodeBs = []; this.obstacles = []; this.workstations = []; this.chargingStations = []; this.connectionLines = [];
        this.dom.bsSelect.innerHTML = '<option value="">None</option>'; this.dom.ueSelect.innerHTML = '<option value="">None</option>';
    }
    
    _onWindowResize() { 
        const { clientWidth: w, clientHeight: h } = this.dom.viewport; 
        this.camera.aspect = w / h; 
        this.camera.updateProjectionMatrix(); 
        this.renderer.setSize(w, h); 
    }

    _updateUI() {
        const connectedAGVs = this.agvs.filter(a => a.userData.connected_bs);
        let avg_rsrp = -140, avg_sinr = -20, total_throughput = 0;
        if(connectedAGVs.length > 0) {
            avg_rsrp = connectedAGVs.reduce((acc, ue) => acc + ue.userData.rsrp_dbm, 0) / connectedAGVs.length;
            avg_sinr = connectedAGVs.reduce((acc, ue) => acc + ue.userData.sinr_db, 0) / connectedAGVs.length;
            total_throughput = connectedAGVs.reduce((acc, ue) => acc + ue.userData.throughput_mbps, 0);
        }
        this.dom.stats.innerHTML = `<div class="mb-2"><h2><i class="fas fa-wifi"></i> Network Health</h2></div>
            <div class="info-field"><strong>Throughput:</strong><span>${total_throughput.toFixed(1)} Mbps</span></div>
            <div class="info-field"><strong>Connected:</strong><span>${connectedAGVs.length}/${this.agvs.length} UEs</span></div>
            <div class="info-field"><strong>Avg. RSRP:</strong><span>${avg_rsrp.toFixed(1)} dBm</span></div>
            <div class="info-field"><strong>Avg. SINR:</strong><span>${avg_sinr.toFixed(1)} dB</span></div>`;

        const selectedBS = this.gNodeBs.find(b => b.userData.id === this.params.selectedBsId);
        if(selectedBS) {
            this.dom.bsConfigPanel.classList.remove('hidden');
            const { status, vendor, band, connected_ues } = selectedBS.userData;
            document.getElementById('bsStatus').textContent = status;
            document.getElementById('bsVendor').textContent = vendor;
            document.getElementById('bsBand').textContent = band;
            document.getElementById('bsPosition').textContent = `X:${selectedBS.position.x.toFixed(0)} Y:${selectedBS.position.y.toFixed(0)} Z:${selectedBS.position.z.toFixed(0)}`;
            const ueCount = connected_ues.length;
            document.getElementById('bsConnectedUes').textContent = ueCount;
            const load = (ueCount / 10) * 100;
            document.getElementById('bsLoad').textContent = `${load.toFixed(0)}%`;
            selectedBS.getObjectByName('status_light').color.set(load > 75 ? 0xff4444 : load > 50 ? 0xffff00 : 0x00aaff);
        } else { this.dom.bsConfigPanel.classList.add('hidden'); }

        const selectedUE = this.agvs.find(u => u.userData.id === this.params.selectedUeId);
        if (selectedUE) {
            this.dom.ueConfigPanel.classList.remove('hidden');
            const data = selectedUE.userData;
            const pos = selectedUE.position;
            document.getElementById('ueImei').textContent = data.imei;
            document.getElementById('ueStatus').textContent = data.status;
            document.getElementById('ueTask').textContent = data.task;
            document.getElementById('ueSpeed').textContent = `${data.status === 'Moving' ? data.speed.toFixed(1) : '0.0'} m/s`;
            document.getElementById('uePosition').textContent = `X:${pos.x.toFixed(1)} Y:${pos.y.toFixed(1)} Z:${pos.z.toFixed(1)}`;
            document.getElementById('ueBattery').textContent = `${data.battery_percentage.toFixed(0)}%`;
            document.getElementById('ueConnectedBs').textContent = data.connected_bs || 'None';
            document.getElementById('ueRSRP').textContent = `${data.rsrp_dbm.toFixed(1)} dBm`;
            document.getElementById('ueSINR').textContent = `${data.sinr_db.toFixed(1)} dB`;
            document.getElementById('ueThroughput').textContent = `${data.throughput_mbps.toFixed(1)} Mbps`;
        } else { this.dom.ueConfigPanel.classList.add('hidden'); }
    }

    _animate() {
        requestAnimationFrame(() => this._animate());
        const delta = this.clock.getDelta();
        
        if (delta > 0) { 
            if (!this.isPaused) {
                this.agvs.forEach(agv => this._updateAGVState(agv, delta));
                this._updateConnectivity();
            }
            this._updateUI();
            this.controls.update();
            this.renderer.render(this.scene, this.camera);
        }
    }
}

window.addEventListener('DOMContentLoaded', () => { 
    new Simulation() 
});