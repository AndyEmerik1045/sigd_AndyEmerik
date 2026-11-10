// ========== KONFIGURASI ==========
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

// ========== INISIALISASI PETA ==========
const map = L.map('map', {
  center: MAP_CENTER,
  zoom: MAP_ZOOM,
  zoomControl: true
});

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors',
  maxZoom: 19
}).addTo(map);

// ========== HELPER POPUP (Topik 2) ==========
function buildPopupHTML(feature) {
  const props = feature.properties || {};
  let html = '<div style="min-width:200px">';
  html += `<h4>${props.nama || 'Tanpa Nama'}</h4><table>`;
  Object.keys(props).forEach(key => {
    if (key === 'nama') return;
    html += `<tr><td>${key}</td><td>${props[key]}</td></tr>`;
  });
  html += '</table></div>';
  return html;
}

// ========== HELPER LABEL (Topik 6) ==========
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

// ========== DIGITASI ONLINE (Topik 3) ==========
const drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

const drawControl = new L.Control.Draw({
  position: 'topleft',
  draw: {
    polygon: {
      allowIntersection: false,
      shapeOptions: {
        color: '#6a1b9a',
        fillColor: '#ce93d8',
        fillOpacity: 0.5
      }
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

// ========== LAYER BUILDERS (Topik 4 & 5) ==========
function buatLayerTitikFavorit(geojson) {
  return L.geoJSON(geojson, {
    pointToLayer: (feature, latlng) => {
      const kat = feature.properties.kategori || 'lainnya';
      const marker = L.circleMarker(latlng, {
        radius: 8,
        fillColor: WARNA_KATEGORI[kat] || WARNA_KATEGORI.lainnya,
        color: '#fff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.9
      });
      marker.bindPopup(buildPopupHTML(feature));
      return marker;
    },
    onEachFeature: (feature, layer) => {
      if (feature.properties.kategori === 'kafe') {
        bindLabel(layer, feature);
      }
    }
  });
}

function buatLayerBatasKampus(geojson) {
  return L.geoJSON(geojson, {
    style: {
      color: '#2e7d32',
      weight: 2,
      fillColor: '#a5d6a7',
      fillOpacity: 0.25,
      dashArray: '6 4'
    },
    onEachFeature: (feature, layer) => {
      layer.bindPopup(buildPopupHTML(feature));
    }
  });
}

function buatLayerParkir(geojson) {
  return L.geoJSON(geojson, {
    style: (feature) => ({
      color: '#fff',
      weight: 2,
      fillColor: warnaKapasitas(feature.properties.kapasitas || 0),
      fillOpacity: 0.75
    }),
    onEachFeature: (feature, layer) => {
      layer.bindPopup(buildPopupHTML(feature));
      bindLabel(layer, feature);
    }
  });
}

function buatLayerJalan(geojson) {
  return L.geoJSON(geojson, {
    style: (feature) => {
      const kelas = feature.properties.kelas;
      if (kelas === 'primary') {
        return { color: '#374151', weight: 5, opacity: 0.8 };
      }
      return { color: '#6b7280', weight: 3, opacity: 0.7 };
    },
    onEachFeature: (feature, layer) => {
      layer.bindPopup(buildPopupHTML(feature));
    }
  });
}

// ========== MUAT SEMUA LAYER ==========
async function muatSemuaLayer() {
  try {
    const [titik, batas, parkir, jalan] = await Promise.all([
      fetch('/api/data/titik_favorit').then(r => r.json()),
      fetch('/api/data/batas_kampus').then(r => r.json()),
      fetch('/api/data/parkir_kampus').then(r => r.json()),
      fetch('/api/data/jalan').then(r => r.json())
    ]);

    const layerTitik = buatLayerTitikFavorit(titik);
    const layerBatas = buatLayerBatasKampus(batas);
    const layerParkir = buatLayerParkir(parkir);
    const layerJalan = buatLayerJalan(jalan);

    // Urutan tambah: bawah ke atas
    layerJalan.addTo(map);
    layerBatas.addTo(map);
    layerParkir.addTo(map);
    layerTitik.addTo(map);

    L.control.layers(null, {
      'Titik Favorit': layerTitik,
      'Batas Kampus': layerBatas,
      'Area Parkir': layerParkir,
      'Jaringan Jalan': layerJalan
    }, {
      collapsed: false,
      position: 'topright'
    }).addTo(map);

    const stats = await fetch('/api/stats/kategori').then(r => r.json());
    renderStatistik(stats);
  } catch (err) {
    console.error(err);
    document.getElementById('stats').innerHTML =
      '<p style="color:#c62828">Gagal memuat data. Pastikan server berjalan.</p>';
  }
}

function renderStatistik(stats) {
  const box = document.getElementById('stats');
  let html = '<ul>';
  Object.entries(stats).forEach(([kat, count]) => {
    const color = WARNA_KATEGORI[kat] || '#6a1b9a';
    // Perbaikan: "inlineblock" di modul diganti "inline-block"
    html += `<li><span style="display:inline-block;width:10px;height:10px;background:${color};border-radius:50%;margin-right:6px"></span>${kat}: <strong>${count}</strong></li>`;
  });
  html += '</ul>';
  box.innerHTML = html;
}

// ========== TOGGLE LABEL ==========
document.getElementById('toggleLabels').addEventListener('change', function (e) {
  const show = e.target.checked;
  map.eachLayer(layer => {
    if (layer.getTooltip && layer.getTooltip()) {
      if (show) layer.openTooltip();
      else layer.closeTooltip();
    }
  });
});

muatSemuaLayer();