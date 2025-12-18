document.addEventListener('DOMContentLoaded', () => {
    initTracker();
    animate();
});

function initTracker() {
    const trackerRows = document.getElementById('trackerRows1');
    
    // Generamos 64 filas (un patrón típico de tracker)
    for (let i = 0; i < 64; i++) {
        const row = document.createElement('div');
        row.className = `tracker-row ${i % 4 === 0 ? 'highlight' : ''}`;
        
        // Datos de ejemplo (como si ya hubieras escrito algo)
        // Nota | Instrumento | Volumen | Efecto
        const note = i % 8 === 0 ? 'C-4' : '---';
        const inst = i % 8 === 0 ? '01' : '--';
        
        row.innerHTML = `
            <span style="color: ${i%8===0 ? '#fff' : '#444'}">${note}</span>
            <span style="color: #ea4">${inst}</span>
            <span>--</span>
            <span>000</span>
        `;
        trackerRows.appendChild(row);
    }
}

// Simulación visual (Loop de animación)
const midiCanvas = document.getElementById('midiCanvas1');
const waveCanvas = document.getElementById('waveCanvas1');
const midiCtx = midiCanvas.getContext('2d');
const waveCtx = waveCanvas.getContext('2d');

let offset = 0;

function animate() {
    requestAnimationFrame(animate);
    offset += 2; // Velocidad de scroll simulada

    // 1. Dibujar Visualizador de Onda (Derecha)
    // Simulamos una onda moviéndose verticalmente
    waveCtx.fillStyle = '#0a0a0a';
    waveCtx.fillRect(0, 0, 60, 400);
    
    waveCtx.beginPath();
    waveCtx.strokeStyle = '#0f8'; // Verde neón clásico
    waveCtx.lineWidth = 2;
    
    for (let y = 0; y < 400; y++) {
        // Fórmula matemática para simular onda de audio
        const x = 30 + Math.sin((y + offset) * 0.1) * 20 * Math.sin(y * 0.05);
        if (y===0) waveCtx.moveTo(x, y);
        else waveCtx.lineTo(x, y);
    }
    waveCtx.stroke();

    // 2. Dibujar Notas MIDI (Izquierda) - Piano Roll Vertical
    // Aquí pintamos rectángulos que bajan
    midiCtx.fillStyle = '#111';
    midiCtx.fillRect(0, 0, 60, 400);
    
    // Dibujamos algunas "notas" cayendo
    midiCtx.fillStyle = '#ff9900';
    const noteSpacing = 40; 
    
    // Simulamos notas fijas que se mueven con el offset
    for (let i = 0; i < 10; i++) {
        let yPos = (i * noteSpacing * 4) + (offset % (noteSpacing * 4)) - 50;
        // Dibujamos un rectángulo (nota)
        if (yPos < 400 && yPos > -20) {
            midiCtx.fillRect(10, yPos, 40, 15); // x, y, width, height
        }
    }
    
    // Mover el HTML del tracker (scroll)
    // Esto es solo visual para el demo, en la realidad moverás el índice
    const trackerContainer = document.getElementById('trackerRows1');
    trackerContainer.style.transform = `translateY(${-offset % 20}px)`; 
}
