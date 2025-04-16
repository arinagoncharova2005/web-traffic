class GlobeVisualization {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.controls = null;
        this.globe = null;
        this.markers = [];
        this.markerGroups = {
            normal: new THREE.Group(),
            suspicious: new THREE.Group()
        };
        
        // array to store points
        this.dataPoints = [];
         // array to store active points
        this.pulseEffects = [];
        
        // time of showing the point
        this.markerLifetime = 10000; // milliseconds
        
        // initialize globe (the Earth)
        this.init();
        
        // set up tooltip 
        this.setupTooltip();

        // add window blur
        window.addEventListener('blur', () => {
            if (this.tooltip) {
                this.tooltip.style.display = 'none';
            }
            if (this.highlightedObject) {
                this.resetHighlight();
            }
        });
        
        // initialize animation
        this.animate();
    }
    
    init() {
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        // add background
        this.renderer.setClearColor(0x04052e);
        this.container.appendChild(this.renderer.domElement);
        
        // set camera aspect ratio 
        this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.camera.position.z = 2.5;
        
        // set orbit controls
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        
        // add light
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 3, 5);
        this.scene.add(directionalLight);

        // create stars in the background
        this.createStarBackground();
        
        // create the globe
        this.createGlobe();
        
        // Add marker groups to scene
        this.scene.add(this.markerGroups.normal);
        this.scene.add(this.markerGroups.suspicious);
        
        // listen to window resize
        window.addEventListener('resize', () => this.onWindowResize());
        
        // clean the old points
        setInterval(() => this.cleanupOldMarkers(), 1000);
    }
    
    createGlobe() {
        // add globe texture
        const textureLoader = new THREE.TextureLoader();
        const globeTexture = textureLoader.load('/static/assets/texture_map.jpeg');
        
        const globeGeometry = new THREE.SphereGeometry(1, 64, 64);
        const globeMaterial = new THREE.MeshPhongMaterial({
            map: globeTexture,
            bumpScale: 0.005
        });
        
        this.globe = new THREE.Mesh(globeGeometry, globeMaterial);
        this.scene.add(this.globe);
    }

    
    // visualize point from where the packets were received
    addMarker(lat, lng, isSuspicious, ipAddress, timestamp, country) {
        // convert latitude and longitude to 3D coordinates
        const phi = (90 - lat) * Math.PI / 180;
        const theta = (lng + 180) * Math.PI / 180;
        
        const radius = 1.01; 
        const x = -radius * Math.sin(phi) * Math.cos(theta);
        const y = radius * Math.cos(phi);
        const z = radius * Math.sin(phi) * Math.sin(theta);
        
        // create point on the globe
        const markerGeometry = new THREE.SphereGeometry(0.01, 16, 16);
        const markerMaterial = new THREE.MeshBasicMaterial({
            color: isSuspicious ? 0xff6978 : 0x8fcb9b,
            transparent: true,
            opacity: 0.8
        });
        
        const marker = new THREE.Mesh(markerGeometry, markerMaterial);
        marker.position.set(x, y, z);
        
        // data for point tooltip 
        marker.userData = {
            type: 'marker',
            ipAddress: ipAddress || 'Unknown IP',
            lat: lat.toFixed(4),
            lng: lng.toFixed(4),
            isSuspicious: isSuspicious,
            timestamp: Date.now(),
            country: country || 'Unknown'
        };
        
        // add point to the corresponding group
        const group = isSuspicious ? this.markerGroups.suspicious : this.markerGroups.normal;
        group.add(marker);
        
        // store point with time for future cleaning
        this.dataPoints.push({
            marker,
            timestamp: Date.now(),
            group
        });
        
        // add pulsation
        this.createPulseEffect(x, y, z, isSuspicious);
        
        return marker;
    }
    
    // function to add pulsation for active points
    createPulseEffect(x, y, z, isSuspicious) {
        const pulseGeometry = new THREE.SphereGeometry(0.01, 16, 16);
        const pulseMaterial = new THREE.MeshBasicMaterial({
            color: isSuspicious ?  0xff6978 : 0x8fcb9b,
            transparent: true,
            opacity: 0.6
        });
        
        const pulse = new THREE.Mesh(pulseGeometry, pulseMaterial);
        pulse.position.set(x, y, z);
        
        const group = isSuspicious ? this.markerGroups.suspicious : this.markerGroups.normal;
        group.add(pulse);
        
        // add animation
        const startTime = Date.now();
        const animate = () => {
            const elapsed = Date.now() - startTime;
            
            // scale active point for 2 seconds
            if (elapsed < 2000) {
                const scale = 1 + elapsed / 500;
                pulse.scale.set(scale, scale, scale);
                pulse.material.opacity = 0.6 * (1 - elapsed / 2000);
                
                requestAnimationFrame(animate);
            } else {
                group.remove(pulse);
                pulse.geometry.dispose();
                pulse.material.dispose();
            }
        };
        
        animate();
    }
    
    cleanupOldMarkers() {
        const now = Date.now();
        
        console.log(`Cleaning up. Markers: ${this.dataPoints.length}, Lifetime: ${this.markerLifetime}ms`);
        
        // delete old points
        this.dataPoints = this.dataPoints.filter(point => {
            const age = now - point.timestamp;
            if (age > this.markerLifetime) {
                console.log(`Removing marker, age: ${age}ms, timestamp: ${new Date(point.timestamp).toLocaleString()}`);
                point.group.remove(point.marker);
                point.marker.geometry.dispose();
                point.marker.material.dispose();
                return false;
            }
            return true;
        });
        
        // remove left pulsation
        if (this.pulseEffects) {
            this.pulseEffects = this.pulseEffects.filter(point => {
                const age = now - point.timestamp;
                if (age > this.markerLifetime) {
                    point.group.remove(point.pulse);
                    point.pulse.geometry.dispose();
                    point.pulse.material.dispose();
                    return false;
                }
                return true;
            });
        }
        
        console.log(`Cleanup complete. Remaining markers: ${this.dataPoints.length}`);
    }
    
    onWindowResize() {
        // current dimensions of the container
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        
        // update camera aspect ratio
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        
        // update renderer size
        this.renderer.setSize(width, height);
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
    
        
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    generateStarTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const context = canvas.getContext('2d');
        
        // create gradient for the star
        const gradient = context.createRadialGradient(
            canvas.width / 2, canvas.height / 2, 0, 
            canvas.width / 2, canvas.height / 2, canvas.width / 2
        );
        
        // make the center bright white
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
        gradient.addColorStop(0.2, 'rgba(240, 240, 255, 0.9)');
        gradient.addColorStop(0.4, 'rgba(220, 220, 255, 0.6)');
        gradient.addColorStop(0.6, 'rgba(180, 180, 240, 0.3)');
        gradient.addColorStop(1, 'rgba(0, 0, 40, 0)');
        
        // add gradient
        context.fillStyle = gradient;
        context.fillRect(0, 0, canvas.width, canvas.height);
        
        // add texture
        const texture = new THREE.Texture(canvas);
        texture.needsUpdate = true;
        return texture;
    }

    createStarBackground() {
        // particle system for stars
        const starsGeometry = new THREE.BufferGeometry();
        const starsCount = 8000; // Number of stars
        
        // star positions and sizes
        const positions = new Float32Array(starsCount * 3);
        const sizes = new Float32Array(starsCount);
        const colors = new Float32Array(starsCount * 3);
        
        // stars are placed in a large sphere surrounding the scene
        const radius = 50;
        
        //  random positions for stars
        for (let i = 0; i < starsCount; i++) {
            // spherical distribution for realistic star placement
            const theta = 2 * Math.PI * Math.random();
            const phi = Math.acos(2 * Math.random() - 1);
            
            // cube root for more uniform distribution
            const r = radius * Math.cbrt(Math.random());
            
            // from spherical to Cartesian coordinates
            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = r * Math.cos(phi);
            
            // random star sizes
            sizes[i] = Math.random() * 2.0 + 0.5;
            const colorRand = Math.random();
            if (colorRand < 0.8) {
                // white
                colors[i * 3] = 0.9 + Math.random() * 0.1; // R
                colors[i * 3 + 1] = 0.9 + Math.random() * 0.1; // G
                colors[i * 3 + 2] = 0.9 + Math.random() * 0.1; // B
            } else if (colorRand < 0.95) {
                // yellow
                colors[i * 3] = 0.9 + Math.random() * 0.1; // R
                colors[i * 3 + 1] = 0.7 + Math.random() * 0.3; // G
                colors[i * 3 + 2] = 0.4 + Math.random() * 0.3; // B
            } else {
                // red
                colors[i * 3] = 0.8 + Math.random() * 0.2; // R
                colors[i * 3 + 1] = 0.3 + Math.random() * 0.2; // G
                colors[i * 3 + 2] = 0.2 + Math.random() * 0.2; // B
            }
        }
    
        // add attributes to the geometry
        starsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        starsGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        const starTexture = this.generateStarTexture();
        
        // star material with some stars brighter than others
        const starsMaterial = new THREE.PointsMaterial({
            color: 0xFFFFFF,
            transparent: true,
            opacity: 0.8,
            size: 0.15,
            sizeAttenuation: true,
            map: starTexture,
            alphaTest: 0.1, // This helps avoid rendering artifacts
            depthWrite: false
        });
        
        // star field as particles
        const starField = new THREE.Points(starsGeometry, starsMaterial);
        this.scene.add(starField);
        
        // nebulae for visual interest
        this.addNebula(30, 20, -40, 0x8fcb9b, 0.2);  // Green nebula
        this.addNebula(-40, -10, 20, 0xff6978, 0.15); // Pink nebula
        this.addNebula(10, -30, -25, 0x7289DA, 0.1);  // Blue nebula
    }

// create nebulae
addNebula(x, y, z, color, opacity) {
    const nebulaMaterial = new THREE.SpriteMaterial({
        map: this.generateNebulaTexture(),
        color: color,
        transparent: true,
        opacity: opacity,
        blending: THREE.AdditiveBlending
    });
    
    const nebula = new THREE.Sprite(nebulaMaterial);
    nebula.position.set(x, y, z);
    nebula.scale.set(15, 15, 1);
    this.scene.add(nebula);
}

// generate nebula texture
generateNebulaTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    
    // Create radial gradient for nebula
    const gradient = context.createRadialGradient(
        canvas.width / 2, canvas.height / 2, 0,
        canvas.width / 2, canvas.height / 2, canvas.width / 2
    );
    
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
    gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.8)');
    gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.5)');
    gradient.addColorStop(0.6, 'rgba(255, 255, 255, 0.3)');
    gradient.addColorStop(0.8, 'rgba(255, 255, 255, 0.1)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    // Create texture from canvas
    const texture = new THREE.Texture(canvas);
    texture.needsUpdate = true;
    return texture;
}

// set up tooltip
setupTooltip() {
    console.log("Setting up tooltip");
    
    this.tooltip = document.getElementById('globe-tooltip');
    if (!this.tooltip) {
        console.warn("Globe tooltip element not found. Make sure you have a div with id 'globe-tooltip' in your HTML");
        // create toltip  if it does not exist
        this.tooltip = document.createElement('div');
        this.tooltip.id = 'globe-tooltip';
        document.body.appendChild(this.tooltip);
    }
    
    //style tooltip
    this.tooltip.style.position = 'absolute';
    this.tooltip.style.backgroundColor = 'rgba(4, 5, 46, 0.85)';
    this.tooltip.style.color = '#f8edeb';
    this.tooltip.style.padding = '10px';
    this.tooltip.style.borderRadius = '4px';
    this.tooltip.style.fontSize = '12px';
    this.tooltip.style.pointerEvents = 'none';
    this.tooltip.style.zIndex = '1000';
    this.tooltip.style.boxShadow = '0 4px 8px rgba(0,0,0,0.3)';
    this.tooltip.style.maxWidth = '250px';
    this.tooltip.style.display = 'none';
    
    // raycaster
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    
    // delete existing event listeners if any
    if (this._boundMouseMove) this.container.removeEventListener('mousemove', this._boundMouseMove);
    if (this._boundMouseLeave) this.container.removeEventListener('mouseleave', this._boundMouseLeave);
    
    // bound event handlers
    this._boundMouseMove = this.onMouseMove.bind(this);
    this._boundMouseLeave = this.onMouseLeave.bind(this);
    
    // set event listeners
    this.container.addEventListener('mousemove', this._boundMouseMove);
    this.container.addEventListener('mouseleave', this._boundMouseLeave);
    
    console.log("Tooltip setup complete");
}


onMouseLeave(event) {
    console.log('Mouse left container');
    
    // Сбрасываем выделение объекта
    if (this.highlightedObject) {
        // Restore original appearance
        if (this.highlightedObject.material) {
            if (this.highlightedObject._originalEmissive) {
                this.highlightedObject.material.emissive.copy(this.highlightedObject._originalEmissive);
            }
            if (this.highlightedObject._originalScale) {
                this.highlightedObject.scale.copy(this.highlightedObject._originalScale);
            }
        }
        this.highlightedObject = null;
    }
    
    // hide tooltip
    if (this.tooltip) {
        this.tooltip.style.display = 'none';
    }
}

onMouseMove(event) {
    // update mouse position
    const rect = this.container.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / this.container.clientWidth) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / this.container.clientHeight) * 2 + 1;
    
    // ray cast 
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    // get intersections with marker groups
    const normalIntersects = this.raycaster.intersectObjects(this.markerGroups.normal.children);
    const suspiciousIntersects = this.raycaster.intersectObjects(this.markerGroups.suspicious.children);
    
    // sort by distance
    const intersects = [...normalIntersects, ...suspiciousIntersects].sort((a, b) => a.distance - b.distance);
    
    if (intersects.length > 0) {
        const object = intersects[0].object;
        
        // check if it is a marker
        if (object.userData && object.userData.type === 'marker') {
            // if it is a different object than the currently highlighted one
            if (this.highlightedObject !== object) {
                // reset previous highlight
                this.resetHighlight();
                
                // add new highlight
                this.highlightedObject = object;
                this.showTooltip(object, event);
            } else {
                // update position for same object
                this.tooltip.style.left = `${event.clientX + 15}px`;
                this.tooltip.style.top = `${event.clientY - 15}px`;
            }
            return;
        }
    }
    
    // reset highlight
    this.resetHighlight();
}


// reset the highlight
resetHighlight() {
    if (!this.highlightedObject) return;
    
    // original appearance
    if (this.highlightedObject.material) {
        // check if material has emissive property 
        if (this.highlightedObject._originalEmissive && 
            this.highlightedObject.material.emissive) {
            this.highlightedObject.material.emissive.copy(this.highlightedObject._originalEmissive);
        }
        
        // restore scale if we have it saved
        if (this.highlightedObject._originalScale) {
            this.highlightedObject.scale.copy(this.highlightedObject._originalScale);
        }
    }
    
    // clear highlighted object and hide tooltip
    this.highlightedObject = null;
    
    if (this.tooltip) {
        this.tooltip.style.display = 'none';
    }
}

// show tooltip
showTooltip(object, event) {
    const userData = object.userData;
    
    // format the timestamp
    const date = new Date(userData.timestamp);
    const formattedTime = date.toLocaleString();
    
    // tooltip content
    const tooltipHTML = `
        <div style="margin-bottom: 5px;"><strong>💻 IP:</strong> ${userData.ipAddress}</div>
        <div style="margin-bottom: 5px;"><strong>🌏 Country:</strong> ${userData.country}</div>
        <div style="margin-bottom: 5px;"><strong>📍</strong> ${userData.lat},  ${userData.lng}</div>
        <div><strong>⏰ Time:</strong> ${formattedTime}</div>
    `;
    
    // add the tooltip
    this.tooltip.innerHTML = tooltipHTML;
    this.tooltip.style.display = 'block';
    this.tooltip.style.left = `${event.clientX + 15}px`;
    this.tooltip.style.top = `${event.clientY - 15}px`;
    
    // highlight the object
    if (object.material) {
        //  save the scale
        if (!object._originalScale) {
            object._originalScale = object.scale.clone();
        }
        
        // check different material types
        if (object.material.emissive) {
            if (!object._originalEmissive) {
                object._originalEmissive = object.material.emissive.clone();
            }
            object.material.emissive.set(0x555555);
        } else {
            if (!object._originalColor) {
                object._originalColor = object.material.color.clone();
            }
        }
        
        // scale up
        object.scale.set(
            object._originalScale.x * 1.3,
            object._originalScale.y * 1.3,
            object._originalScale.z * 1.3
        );
    }
}

onClick(event) {
    //  clicks similar to mouse moves

    if (this.highlightedObject) {
        const userData = this.highlightedObject.userData.type ? 
            this.highlightedObject.userData : 
            (this.highlightedObject.parent && this.highlightedObject.parent.userData.type ? 
                this.highlightedObject.parent.userData : null);
                
        if (userData) {
            console.log('Clicked on:', userData);
            this.focusOnLocation(userData.lat, userData.lng);
        }
    }
}

focusOnLocation(lat, lng) {
    // target point on globe
    const phi = (90 - lat) * Math.PI / 180;
    const theta = (lng + 180) * Math.PI / 180;
    
    const targetX = -Math.sin(phi) * Math.cos(theta) * 5;
    const targetY = Math.cos(phi) * 5;
    const targetZ = Math.sin(phi) * Math.sin(theta) * 5;
    
    // animate camera move
    const startPosition = this.camera.position.clone();
    const endPosition = new THREE.Vector3(targetX, targetY, targetZ);
    
    // add animation
    const duration = 1000; // milliseconds
    const startTime = Date.now();
    
    const animate = () => {
        const now = Date.now();
        const timeElapsed = now - startTime;
        const progress = Math.min(timeElapsed / duration, 1);
        
        // smoothing animation
        const easeProgress = 1 - Math.pow(1 - progress, 3); // Cubic ease out
        
        // interpolate camera position
        this.camera.position.lerpVectors(startPosition, endPosition, easeProgress);
        this.camera.lookAt(0, 0, 0);
        
        if (progress < 1) {
            requestAnimationFrame(animate);
        }
    };
    
    animate();
}
    
}