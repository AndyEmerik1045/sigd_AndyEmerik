// ===========================================================
// PETA FASILITAS UNTAN — Versi v2
// Clustering + Filter Kategori + State Terpusat
// ===========================================================

// ---------- KONFIGURASI ----------
const MAP_CENTER = [-0.0575, 109.3450];
const MAP_ZOOM = 16;

const WARNA_KATEGORI = {
    'kafe': '#c62828',
    'belajar': '#1565c0',
    'kuliner': '#ef6c00',
    'lainnya': '#6a1b9a'
};

function warnaKapasitas(kapasitas) {
    if (kapasitas >= 100) return '#b71c1c';
    if (kapasitas >= 60) return '#ef6c00';
    if (kapasitas >= 30) return '#fbc02d';
    return '#a5d6a7';
}

// ---------- STATE TERPUSAT ----------
const state = {
    showLabels: true,
    cluster: false,
    filters: { kafe: true, belajar: true, kuliner: true }
};

// ---------- DATA MENTAH ----------
const rawData = { titik: null, parkir: null, jalan: null, batas: null };

// ---------- LAYER AKTIF ----------
const activeLayers = { jalan: null, batas: null };

// Wadah tetap untuk titik favorit: didaftarkan SEKALI ke layer control,
// isinya diganti setiap renderTitik()
const grupTitik = L.layerGroup();
const grupParkir = L.layerGroup();

// ---------- INISIALISASI PETA ----------
const map = L.map('map', {
    center: MAP_CENTER,
    zoom: MAP_ZOOM,
    zoomControl: true
});

L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles © Esri',
    maxZoom: 19
}).addTo(map);

// ---------- HELPER ----------
function escapeHTML(teks) {
    return String(teks)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function createCircleIcon(color) {
    return L.divIcon({
        className: 'custom-circle-marker',
        html: `<span style="display:block;width:16px;height:16px;background:${color};border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.4)"></span>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
        popupAnchor: [0, -8]
    });
}

function buildPopupHTML(feature) {
    const props = feature.properties || {};
    let html = '<div style="min-width:200px">';
    html += `<h4>${escapeHTML(props.nama || 'Tanpa Nama')}</h4><table>`;
    Object.keys(props).forEach(key => {
        if (key === 'nama') return;
        html += `<tr><td>${escapeHTML(key)}</td><td>${escapeHTML(props[key])}</td></tr>`;
    });
    html += '</table></div>';
    return html;
}

function bindLabel(layer, feature) {
    const nama = feature.properties && feature.properties.nama;
    if (!nama) return;
    layer.bindTooltip(nama, {
        permanent: true,
        direction: 'top',
        offset: [0, -10],
        className: 'label-fasilitas'
    });
}

// ---------- DIGITASI (Topik 3) ----------
const drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

const drawControl = new L.Control.Draw({
    position: 'topleft',
    draw: {
        polygon: {
            allowIntersection: false,
            shapeOptions: { color: '#6a1b9a', fillColor: '#ce93d8', fillOpacity: 0.5 }
        },
        polyline: false,
        rectangle: false,
        circle: false,
        marker: false,
        circlemarker: false
    },
    edit: { featureGroup: drawnItems }
});
map.addControl(drawControl);

map.on(L.Draw.Event.CREATED, async function (e) {
    const geojson = e.layer.toGeoJSON();
    const nama = prompt('Nama area parkir baru:', 'Parkir Baru');
    if (!nama) return;
    const kapasitas = parseInt(prompt('Kapasitas:', '20')) || 20;

    geojson.properties = { nama: nama, kapasitas: kapasitas, jenis: 'terbuka' };

    try {
        const res = await fetch('/api/feature/parkir_kampus', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ feature: geojson })
        });
        if (!res.ok) throw new Error('Gagal menyimpan');
        const result = await res.json();
        alert(`Area "${nama}" tersimpan. Total: ${result.total}`);
        location.reload();
    } catch (err) {
        alert('Gagal: ' + err.message);
    }
});

// ---------- RENDER TITIK (Cluster + Filter) ----------
function renderTitik() {
    grupTitik.clearLayers();
    if (!rawData.titik) return;

    // Cluster atau layer group biasa
    const container = state.cluster
        ? L.markerClusterGroup({
            maxClusterRadius: 50,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false,
            zoomToBoundsOnClick: true
        })
        : L.layerGroup();

    rawData.titik.features.forEach(f => {
        const kat = f.properties.kategori || 'lainnya';

        // FILTER: lewati kategori yang tidak dicentang
        if (state.filters[kat] === false) return;

        const latlng = [f.geometry.coordinates[1], f.geometry.coordinates[0]];
        const color = WARNA_KATEGORI[kat] || WARNA_KATEGORI.lainnya;

        // L.marker + divIcon agar kompatibel dengan MarkerCluster
        const marker = L.marker(latlng, { icon: createCircleIcon(color) });
        marker.bindPopup(buildPopupHTML(f));

        // Label rule-based: hanya kafe
        if (state.showLabels && kat === 'kafe') {
            bindLabel(marker, f);
        }

        container.addLayer(marker);
    });

    grupTitik.addLayer(container);
}

// ---------- RENDER STATIS ----------
function renderParkir() {
    grupParkir.clearLayers();
    if (!rawData.parkir) return;

    const layer = L.geoJSON(rawData.parkir, {
        style: (f) => ({
            color: '#fff',
            weight: 2,
            fillColor: warnaKapasitas(f.properties.kapasitas || 0),
            fillOpacity: 0.75
        }),
        onEachFeature: (f, l) => {
            l.bindPopup(buildPopupHTML(f));
            if (state.showLabels) bindLabel(l, f);
        }
    });
    grupParkir.addLayer(layer);
}

function renderBatas() {
    if (!rawData.batas) return;
    activeLayers.batas = L.geoJSON(rawData.batas, {
        style: {
            color: '#2e7d32',
            weight: 2,
            fillColor: '#a5d6a7',
            fillOpacity: 0.25,
            dashArray: '6 4'
        },
        onEachFeature: (f, l) => l.bindPopup(buildPopupHTML(f))
    }).addTo(map);
}

function renderJalan() {
    if (!rawData.jalan) return;
    activeLayers.jalan = L.geoJSON(rawData.jalan, {
        style: (f) => {
            if (f.properties.kelas === 'primary') {
                return { color: '#374151', weight: 5, opacity: 0.8 };
            }
            return { color: '#6b7280', weight: 3, opacity: 0.7 };
        },
        onEachFeature: (f, l) => l.bindPopup(buildPopupHTML(f))
    }).addTo(map);
}

// ---------- LAYER CONTROL ----------
// Parkir dirender ulang saat toggle label, jadi referensinya berubah.
// Solusi: control dibuat sekali, lalu parkir didaftarkan lewat grup tetap.
const layerControl = L.control.layers(null, {}, {
    collapsed: false,
    position: 'topright'
});

// ---------- MUAT DATA ----------
async function muatSemuaData() {
    try {
        const [titik, batas, parkir, jalan] = await Promise.all([
            fetch('/api/data/titik_favorit').then(r => r.json()),
            fetch('/api/data/batas_kampus').then(r => r.json()),
            fetch('/api/data/parkir_kampus').then(r => r.json()),
            fetch('/api/data/jalan').then(r => r.json())
        ]);

        rawData.titik = titik;
        rawData.batas = batas;
        rawData.parkir = parkir;
        rawData.jalan = jalan;

        // Urutan: bawah ke atas
        renderJalan();
        renderBatas();
        grupParkir.addTo(map);
        renderParkir();
        grupTitik.addTo(map);
        renderTitik();

        layerControl.addOverlay(grupTitik, 'Titik Favorit');
        layerControl.addOverlay(activeLayers.batas, 'Batas Kampus');
        layerControl.addOverlay(grupParkir, 'Area Parkir');
        layerControl.addOverlay(activeLayers.jalan, 'Jaringan Jalan');
        layerControl.addTo(map);

        const stats = await fetch('/api/stats/kategori').then(r => r.json());
        renderStatistik(stats);
    } catch (err) {
        console.error(err);
        document.getElementById('stats').innerHTML =
            '<p style="color:#c62828">Gagal memuat. Pastikan server berjalan.</p>';
    }
}

// ---------- STATISTIK ----------
function renderStatistik(stats) {
    const box = document.getElementById('stats');
    let html = '<ul>';
    Object.entries(stats).forEach(([kat, count]) => {
        const color = WARNA_KATEGORI[kat] || '#6a1b9a';
        html += `<li><span style="display:inline-block;width:10px;height:10px;background:${color};border-radius:50%;margin-right:6px"></span>${kat}: <strong>${count}</strong></li>`;
    });
    html += '</ul>';
    box.innerHTML = html;
}

// ---------- EVENT: FILTER KATEGORI ----------
document.querySelectorAll('.filter-kategori').forEach(cb => {
    cb.addEventListener('change', e => {
        state.filters[e.target.value] = e.target.checked;
        renderTitik();
    });
});

// ---------- EVENT: TOGGLE LABEL ----------
document.getElementById('toggleLabels').addEventListener('change', e => {
    state.showLabels = e.target.checked;
    renderTitik();
    renderParkir();
});

// ---------- EVENT: TOGGLE CLUSTER ----------
document.getElementById('toggleCluster').addEventListener('change', e => {
    state.cluster = e.target.checked;
    renderTitik();
});

// ---------- JALANKAN ----------
muatSemuaData();