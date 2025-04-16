let packetData = [];
let countryData = {};
let countryChart = null;

let countriesGeoJSON = null;

// get country from the latitude and longitude
async function loadCountriesGeoJSON() {
        // use github
        console.log("Attempting to fetch GeoJSON from CDN...");
        try {
            const response = await fetch('https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            countriesGeoJSON = await response.json();
            console.log("Successfully loaded GeoJSON from CDN");
        } catch (cdnError) {
            console.error("Error fetching GeoJSON from CDN:", cdnError);
            console.error("All attempts to load GeoJSON data failed");
        }
}

// get country
function getCountryFromCoordinates(lat, lng) {
    if (!countriesGeoJSON || !countriesGeoJSON.features) {
        console.warn('Countries GeoJSON data not loaded or invalid');
        return 'Unknown';
    }
    
    try {
        // point from the coordinates
        const point = turf.point([lng, lat]);
    
        
        // check which country polygon contains this point
        for (const feature of countriesGeoJSON.features) {
            try {
                if (feature.geometry && turf.booleanPointInPolygon(point, feature.geometry)) {
                    const countryName = feature.properties.name || feature.properties.ADMIN || 'Unknown';
                    console.log(`Found country: ${countryName}`);
                    return countryName;
                }
            } catch (polygonError) {
                continue;
            }
        }
        
    } catch (error) {

        return 'Unknown';
    }
}


    document.addEventListener('DOMContentLoaded', async() => {
        await loadCountriesGeoJSON();
        // globe visualization
        const globe = new GlobeVisualization('visualization');
        createBackgroundStars();
        initCountryChart();
        setupTableInteractions();
        
        
        // connect to Socket.IO server
        const socket = io();
        
        // packets statistics
        let stats = {
            totalPackages: 0,
            suspiciousPackages: 0,
            locations: {},
            recentConnections: []
        };

        
    
// process new package data from socket
socket.on('new_package', (data) => {
    console.log("Received new package:", data);
    
    // check coordinates
    if (typeof data.latitude !== 'number' || typeof data.longitude !== 'number' || 
        isNaN(data.latitude) || isNaN(data.longitude)) {
        console.error("Invalid coordinates:", data.latitude, data.longitude);
        data.country = 'Unknown';
    }
    // get country from coordinates
    else if (!data.country || data.country === 'Unknown' || data.country === 'Not defined') {
        data.country = getCountryFromCoordinates(data.latitude, data.longitude);
        console.log(`Determined country: ${data.country}`);
    }

    if ((!data.country || data.country === 'Unknown' || data.country === 'Not defined') && 
        data.latitude && data.longitude) {
        data.country = getCountryFromCoordinates(data.latitude, data.longitude);
    }

    globe.addMarker(
        data.latitude,
        data.longitude,
        data.suspicious,
        data.ip_address,
        data.timestamp * 1000,
        data.country
    );

    // update counter for the given country
    const country = data.country || 'Unknown';
    countryData[country] = (countryData[country] || 0) + 1;
    
    // combine packet data
    packetData.unshift({
        ip: data.ip_address || 'Unknown',
        country: country,
        timestamp: data.timestamp ? data.timestamp * 1000 : Date.now(),
        suspicious: data.suspicious || false
    });
    
    // cut stored packets
    if (packetData.length > 1000) packetData.pop();
    
    // update table and pie
    if (document.visibilityState !== 'hidden') {
        updateTable();
        updateCountryChart();
    }
    
    // update statistics
    const totalPackages = parseInt(document.getElementById('total-packets').textContent) + 1;
    const suspiciousPackages = parseInt(document.getElementById('suspicious-packets').textContent) + 
                            (data.suspicious ? 1 : 0);
    
    document.getElementById('total-packets').textContent = totalPackages;
    document.getElementById('suspicious-packets').textContent = suspiciousPackages;
    
    const percentage = Math.round((suspiciousPackages / totalPackages) * 100);
    document.getElementById('suspicious-percentage').textContent = `${percentage}%`;
});
    
    // get initial data
    fetchInitialData();
    
    // pie with countries
    function initCountryChart() {
        const ctx = document.getElementById('country-chart').getContext('2d');
        countryChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: [],
                datasets: [{
                    data: [],
                    backgroundColor: [
                        'rgba(143, 203, 155, 0.7)',
                        'rgba(255, 105, 120, 0.7)',
                        'rgba(93, 139, 244, 0.7)',
                        'rgba(255, 199, 107, 0.7)',
                        'rgba(154, 129, 205, 0.7)',
                        'rgba(86, 207, 225, 0.7)'
                    ],
                    borderColor: [
                        'rgba(143, 203, 155, 1)',
                        'rgba(255, 105, 120, 1)',
                        'rgba(93, 139, 244, 1)',
                        'rgba(255, 199, 107, 1)',
                        'rgba(154, 129, 205, 1)',
                        'rgba(86, 207, 225, 1)'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            color: '#FFFFFF',
                            font: {
                                size: 11
                            },
                            padding: 15
                        }
                    }
                },
                cutout: '60%'
            }
        });
    }
    
    function updateCountryChart() {
        // get top 5 countries
        const sortedCountries = Object.entries(countryData)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
        
        // add category "Other" is the number of countries > 5
        let otherCount = 0;
        if (Object.keys(countryData).length > 5) {
            Object.entries(countryData)
                .sort((a, b) => b[1] - a[1])
                .slice(5)
                .forEach(([_, count]) => {
                    otherCount += count;
                });
        }

        // data for chart
        const labels = sortedCountries.map(([country]) => country);
        const data = sortedCountries.map(([_, count]) => count);
        
        // add "Other" if needed
        if (otherCount > 0) {
            labels.push('Other');
            data.push(otherCount);
        }
        
        // update the chart
        countryChart.data.labels = labels;
        countryChart.data.datasets[0].data = data;
        countryChart.update();
    }
function setupTableInteractions() {
    const searchInput = document.getElementById('table-search');
    const statusFilter = document.getElementById('status-filter');
    const tableHeaders = document.querySelectorAll('#packets-table th');
    
    // event listener for search
    searchInput.addEventListener('input', updateTable);
    
    // event listener for filter
    statusFilter.addEventListener('change', updateTable);
    
    // event listeners for sorting
    tableHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const sortBy = header.getAttribute('data-sort');
            sortTable(sortBy);
        });
    });
}
function updateTable() {
    const searchInput = document.getElementById('table-search');
    const statusFilter = document.getElementById('status-filter');
    const tbody = document.getElementById('packets-body');
    
    const searchTerm = searchInput.value.toLowerCase();
    const filterValue = statusFilter.value;
    
    // clean table
    tbody.innerHTML = '';
    
    // filter the data
    const filteredData = packetData.filter(packet => {
        // Apply status filter
        if (filterValue === 'suspicious' && !packet.suspicious) return false;
        if (filterValue === 'normal' && packet.suspicious) return false;
        
        // Apply search
        if (searchTerm) {
            const ipMatch = packet.ip.toLowerCase().includes(searchTerm);
            const countryMatch = packet.country.toLowerCase().includes(searchTerm);
            return ipMatch || countryMatch;
        }
        
        return true;
    });
    
    // cut 100 packets 
    const displayData = filteredData.slice(0, 100);
    // add rows to table
    displayData.forEach(packet => {
        const row = document.createElement('tr');
        if (packet.suspicious) row.classList.add('suspicious-row');
        
        const time = new Date(packet.timestamp);
        
        row.innerHTML = `
            <td>${packet.ip}</td>
            <td>${packet.country}</td>
            <td>${time.toLocaleString()}</td>
        `;
        
        tbody.appendChild(row);
    });
}

function sortTable(sortBy) {
    // sort the data
    packetData.sort((a, b) => {
        if (sortBy === 'time') {
            return b.timestamp - a.timestamp;
        } else if (sortBy === 'ip') {
            return a.ip.localeCompare(b.ip);
        } else if (sortBy === 'country') {
            return a.country.localeCompare(b.country);
        } else if (sortBy === 'status') {
            return b.suspicious - a.suspicious;
        }
        return 0;
    });
    
    // update the table
    updateTable();
}

// get the data  
    function fetchInitialData() {
        fetch('/api/package')
            .then(response => response.json())
            .then(data => {
                // process all existing data
                data.forEach(item => {
                    globe.addMarker(
                        item.latitude, 
                        item.longitude, 
                        item.suspicious,
                        item.ip_address || 'Unknown', 
                        item.timestamp ? item.timestamp * 1000 : Date.now(), 
                        item.country || 'Unknown'
                    );
                });
                
                // update statistics
                stats.totalPackages = data.length;
                stats.suspiciousPackages = data.filter(pkg => pkg.suspicious).length;
                
                // update dictionary with locations
                data.forEach(pkg => {
                    const locationKey = `${pkg.latitude.toFixed(1)},${pkg.longitude.toFixed(1)}`;
                    if (!stats.locations[locationKey]) {
                        stats.locations[locationKey] = {
                            lat: pkg.latitude,
                            lng: pkg.longitude,
                            count: 0,
                            suspicious: 0
                        };
                    }
                    
                    stats.locations[locationKey].count++;
                    if (pkg.suspicious) {
                        stats.locations[locationKey].suspicious++;
                    }
                });
                
                // update recent connections
                stats.recentConnections = data.slice(-10).map(pkg => ({
                    ip: pkg.ip_address,
                    lat: pkg.latitude,
                    lng: pkg.longitude,
                    timestamp: pkg.timestamp,
                    suspicious: pkg.suspicious
                })).reverse();
                
                updateUI();
            })
            .catch(error => console.error('Error fetching initial data:', error));

        // resize after load to ensure proper rendering
        window.addEventListener('load', () => {
            window.dispatchEvent(new Event('resize'));
        });
    }
    

    function createBackgroundStars() {
        const backgroundContainer = document.getElementById('background-canvas');
        
        // create a scene, camera and renderer for the background
        const bgScene = new THREE.Scene();
        const bgCamera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        bgCamera.position.z = 2.5;
        
        const bgRenderer = new THREE.WebGLRenderer({ alpha: true });
        bgRenderer.setSize(window.innerWidth, window.innerHeight);
        bgRenderer.setClearColor(0x04052e);
        backgroundContainer.appendChild(bgRenderer.domElement);
        
        // create stars
        const starsGeometry = new THREE.BufferGeometry();
        const starsCount = 5000;
        
        const positions = new Float32Array(starsCount * 3);
        const sizes = new Float32Array(starsCount);
        
        for (let i = 0; i < starsCount; i++) {
            const theta = 2 * Math.PI * Math.random();
            const phi = Math.acos(2 * Math.random() - 1);
            const r = 70 * Math.cbrt(Math.random());
            
            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            sizes[i] = 0.3 + 1.7 * Math.pow(Math.random(), 3);
    }
    
    starsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starsGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    
    // add star texture
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext('2d');
    
    const gradient = context.createRadialGradient(
        canvas.width / 2, canvas.height / 2, 0, 
        canvas.width / 2, canvas.height / 2, canvas.width / 2
    );
    
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
    gradient.addColorStop(0.2, 'rgba(240, 240, 255, 0.9)');
    gradient.addColorStop(0.4, 'rgba(220, 220, 255, 0.6)');
    gradient.addColorStop(0.6, 'rgba(180, 180, 240, 0.3)');
    gradient.addColorStop(1, 'rgba(0, 0, 40, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    const starTexture = new THREE.Texture(canvas);
    starTexture.needsUpdate = true;
    
    const starsMaterial = new THREE.PointsMaterial({
        map: starTexture,
        transparent: true,
        opacity: 0.8,
        size: 0.15,
        sizeAttenuation: true,
        alphaTest: 0.1,
        depthWrite: false
    });
    
    const starField = new THREE.Points(starsGeometry, starsMaterial);
    bgScene.add(starField);
    
    // add animation for the background
    function animateBackground() {
        requestAnimationFrame(animateBackground);
        starField.rotation.y += 0.0001;
        bgRenderer.render(bgScene, bgCamera);
    }
    
    animateBackground();
    
    // check window resizing
    window.addEventListener('resize', () => {
        bgCamera.aspect = window.innerWidth / window.innerHeight;
        bgCamera.updateProjectionMatrix();
        bgRenderer.setSize(window.innerWidth, window.innerHeight);
    });
}
    
    function updateUI() {
        // update values
        document.getElementById('total-packets').textContent = stats.totalPackages;
        document.getElementById('suspicious-packets').textContent = stats.suspiciousPackages;
        
        // update top locations
        const topLocations = Object.values(stats.locations)
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);
        
        const topLocationsList = document.getElementById('top-locations');
        topLocationsList.innerHTML = '';
        
        topLocations.forEach(location => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span>${location.lat.toFixed(1)}, ${location.lng.toFixed(1)}</span>
                <span>Count: ${location.count}</span>
            `;
            if (location.suspicious > 0) {
                li.classList.add('suspicious');
            }
            topLocationsList.appendChild(li);
        });
        
        // update latest connections
        const latestConnectionsList = document.getElementById('latest-connections');
        latestConnectionsList.innerHTML = '';
        
        stats.recentConnections.forEach(conn => {
            const li = document.createElement('li');
            const date = new Date(conn.timestamp * 1000);
            const timeString = date.toLocaleTimeString();
            
            li.className = conn.suspicious ? 'suspicious' : 'normal';
            li.innerHTML = `
                <div class="connection-info">
                    <span>${conn.ip}</span>
                    <small>${conn.lat.toFixed(2)}, ${conn.lng.toFixed(2)}</small>
                </div>
                <small>${timeString}</small>
            `;
            latestConnectionsList.appendChild(li);
        });
    }
    
});