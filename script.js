// Esperar a que se cargue el DOM y la librería de gráficos
document.addEventListener('DOMContentLoaded', () => {
    // Asegurar que LCJS está cargado
    if (typeof lcjs === 'undefined') {
        console.error('LightningChart JS no se ha cargado correctamente.');
        return;
    }
    // Iniciar la aplicación
    const app = new AppController();
    app.init();
});

// --- Clases Auxiliares ---

// Clase para manejar el Audio Web API
class AudioEngine {
    constructor() {
        this.audioCtx = null;
        this.masterGain = null;
        this.isPlaying = false;
    }

    init() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.audioCtx.createGain();
            this.masterGain.gain.setValueAtTime(0.5, this.audioCtx.currentTime);
            this.masterGain.connect(this.audioCtx.destination);
            console.log('Motor de Audio Iniciado');
        }
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }
    }

    // Tocar una nota simple
    playNote(noteName, instrumentId, volume, trackGainNode) {
        if (!this.audioCtx) return;
        if (noteName === '---') return;

        const freq = this.noteToFreq(noteName);
        if (!freq) return;

        const osc = this.audioCtx.createOscillator();
        osc.type = 'sawtooth'; // Un sonido de sintetizador básico
        osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);

        const gainNode = this.audioCtx.createGain();
        // Volumen simple: 0-99 -> 0.0-1.0
        const vol = parseInt(volume, 16) / 255 || 0.5;
        gainNode.gain.setValueAtTime(vol, this.audioCtx.currentTime);
        // Decay simple para que no sea un tono infinito
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.5);

        osc.connect(gainNode);
        // Conectar al gain de la pista para que el analizador lo capte
        gainNode.connect(trackGainNode);

        osc.start();
        osc.stop(this.audioCtx.currentTime + 0.5);
    }

    // Convertir nombre de nota (ej. C-4) a frecuencia
    noteToFreq(note) {
        const notes = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
        const name = note.slice(0, 2);
        const octave = parseInt(note.slice(2));
        const index = notes.indexOf(name);
        if (index === -1) return null;
        // Fórmula estándar de frecuencia MIDI: f = 440 * 2^((n-69)/12)
        const midiNote = index + (octave + 1) * 12;
        return 440 * Math.pow(2, (midiNote - 69) / 12);
    }
}

// Clase para manejar la visualización MIDI (Piano Roll)
class MidiVisualizer {
    constructor(canvas, color) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.color = color;
    }

    setColor(newColor) {
        this.color = newColor;
        this.draw([]); // Redibujar
    }

    draw(patternData) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        const rowHeight = 15; // Altura de cada fila en el tracker
        const noteWidth = this.canvas.width / 12; // Ancho de una nota

        patternData.forEach((row, rowIndex) => {
            if (row.note && row.note !== '---') {
                const noteName = row.note.slice(0, 2);
                const notes = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
                const noteIndex = notes.indexOf(noteName);

                if (noteIndex !== -1) {
                    const x = noteIndex * noteWidth;
                    const y = rowIndex * rowHeight;
                    
                    // Dibujar la nota con el color de la pista
                    this.ctx.fillStyle = this.color;
                    this.ctx.fillRect(x, y, noteWidth - 1, rowHeight - 1);
                }
            }
        });
    }
}

// Clase para manejar la visualización de Audio (LightningChart)
class AudioVisualizer {
    constructor(container, analyserNode, color) {
        this.container = container;
        this.analyser = analyserNode;
        this.color = color;
        this.chart = null;
        this.series = null;
        this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        this.initChart();
    }

    initChart() {
        const { lightningChart, AxisTickStrategies, Themes, ColorHEX } = lcjs;

        // Crear el gráfico dentro del contenedor
        this.chart = lightningChart().ChartXY({
            container: this.container,
            theme: Themes.darkGold // Un tema oscuro base
        })
        .setTitle('')
        .setAutoCursorMode('disabled') // Desactivar cursor para rendimiento
        .setPadding({ top: 0, bottom: 0, left: 0, right: 0 });

        // Configurar ejes para que no se vean
        this.chart.getDefaultAxisX().setTickStrategy(AxisTickStrategies.Empty).setStrokeStyle(null);
        this.chart.getDefaultAxisY().setTickStrategy(AxisTickStrategies.Empty).setStrokeStyle(null).setInterval(-128, 128);

        // Crear la serie de líneas para la onda
        this.series = this.chart.addLineSeries({
            dataPattern: { pattern: 'ProgressiveX' }
        })
        .setStrokeStyle((style) => style.setThickness(2).setColor(ColorHEX(this.color)))
        .setMouseInteractions(false);

        this.animate();
    }

    setColor(newColor) {
        this.color = newColor;
        if (this.series) {
            this.series.setStrokeStyle((style) => style.setColor(lcjs.ColorHEX(this.color)));
        }
    }

    animate() {
        if (!this.analyser) return;
        
        // Obtener datos de la onda de tiempo
        this.analyser.getByteTimeDomainData(this.dataArray);
        
        const points = [];
        for (let i = 0; i < this.dataArray.length; i += 4) { // Muestrear para rendimiento
            // Convertir el dato de 0-255 a un rango centrado en 0
            const y = this.dataArray[i] - 128;
            points.push({ x: i, y: y });
        }

        // Actualizar la serie con los nuevos puntos
        this.series.clear().add(points);
        
        requestAnimationFrame(() => this.animate());
    }
}

// Clase que representa una Pista del Tracker
class Track {
    constructor(id, audioCtx, masterGain, initialColor) {
        this.id = id;
        this.audioCtx = audioCtx;
        this.masterGain = masterGain;
        this.color = initialColor;
        
        // Nodo de ganancia y analizador para esta pista
        this.trackGain = this.audioCtx.createGain();
        this.trackGain.connect(this.masterGain);
        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 256; // Tamaño de la ventana de análisis
        this.trackGain.connect(this.analyser);

        // Datos del patrón
        this.patternData = [];
        for (let i = 0; i < 64; i++) { // Patrón inicial de 64 filas
            this.patternData.push({ note: '---', inst: '--', vol: '--', fx: '---' });
        }

        this.element = null;
        this.midiVisualizer = null;
        this.audioVisualizer = null;
    }

    render(container) {
        const template = document.getElementById('track-template');
        const clone = template.content.cloneNode(true);
        this.element = clone.querySelector('.track-module');
        container.appendChild(this.element);

        // Inicializar componentes
        this.initColorPicker();
        this.initGrid();
        this.initVisualizers();
        this.initAddRowBtn();
        
        // Aplicar color inicial
        this.updateColor(this.color);
    }

    initColorPicker() {
        const picker = this.element.querySelector('.track-color-picker');
        picker.value = this.color;
        picker.addEventListener('input', (e) => {
            this.updateColor(e.target.value);
        });
    }

    updateColor(newColor) {
        this.color = newColor;
        
        // Actualizar variables CSS de la pista
        this.element.style.setProperty('--track-color', this.color);
        // Crear un color más oscuro para el fondo y el playhead
        const darkColor = this.adjustColorBrightness(this.color, -50);
        this.element.style.setProperty('--track-color-dark', darkColor);

        const rgb = this.hexToRgb(this.color);
        if(rgb) {
             this.element.style.setProperty('--track-color-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);
        }

        // Actualizar visualizadores
        if (this.midiVisualizer) this.midiVisualizer.setColor(this.color);
        if (this.audioVisualizer) this.audioVisualizer.setColor(this.color);
    }

    initVisualizers() {
        // Piano Roll
        const midiCanvas = this.element.querySelector('.midi-canvas');
        this.midiVisualizer = new MidiVisualizer(midiCanvas, this.color);
        this.midiVisualizer.draw(this.patternData);

        // Audio Wave (LightningChart)
        const waveContainer = this.element.querySelector('.wave-chart-container');
        this.audioVisualizer = new AudioVisualizer(waveContainer, this.analyser, this.color);
    }

    initGrid() {
        const rowsContainer = this.element.querySelector('.tracker-rows');
        rowsContainer.innerHTML = ''; // Limpiar

        this.patternData.forEach((rowData, index) => {
            this.createRowElement(rowsContainer, rowData, index);
        });
    }

    createRowElement(container, rowData, index) {
        const row = document.createElement('div');
        row.className = `tracker-row ${index % 4 === 0 ? 'highlight' : ''}`;
        row.innerHTML = `
            <input type="text" class="tracker-cell note-cell" data-type="note" data-row="${index}" value="${rowData.note}" maxlength="3">
            <input type="text" class="tracker-cell inst-cell" data-type="inst" data-row="${index}" value="${rowData.inst}" maxlength="2">
            <input type="text" class="tracker-cell" data-type="vol" data-row="${index}" value="${rowData.vol}" maxlength="2">
            <input type="text" class="tracker-cell" data-type="fx" data-row="${index}" value="${rowData.fx}" maxlength="3">
        `;
        container.appendChild(row);

        // Añadir listeners para editar los datos
        const inputs = row.querySelectorAll('.tracker-cell');
        inputs.forEach(input => {
            input.addEventListener('input', (e) => {
                const type = e.target.dataset.type;
                const rowIndex = parseInt(e.target.dataset.row);
                // Actualizar datos del patrón
                this.patternData[rowIndex][type] = e.target.value.toUpperCase();
                
                // Si se cambia una nota, redibujar el piano roll
                if (type === 'note') {
                    this.midiVisualizer.draw(this.patternData);
                }
            });
            // Seleccionar todo el texto al hacer foco
            input.addEventListener('focus', (e) => e.target.select());
        });
    }

    initAddRowBtn() {
        const btn = this.element.querySelector('.add-row-btn');
        btn.addEventListener('click', () => {
            // Añadir una nueva fila vacía a los datos
            const newData = { note: '---', inst: '--', vol: '--', fx: '---' };
            this.patternData.push(newData);
            
            // Añadir el elemento visual de la fila
            const rowsContainer = this.element.querySelector('.tracker-rows');
            this.createRowElement(rowsContainer, newData, this.patternData.length - 1);
            
            // Redibujar el piano roll para incluir la nueva fila
            this.midiVisualizer.draw(this.patternData);
        });
    }

    // --- Funciones de utilidad para el color ---
    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }

    adjustColorBrightness(hex, percent) {
        let r = parseInt(hex.substring(1, 3), 16);
        let g = parseInt(hex.substring(3, 5), 16);
        let b = parseInt(hex.substring(5, 7), 16);

        r = parseInt(r * (100 + percent) / 100);
        g = parseInt(g * (100 + percent) / 100);
        b = parseInt(b * (100 + percent) / 100);

        r = (r < 255) ? r : 255;
        g = (g < 255) ? g : 255;
        b = (b < 255) ? b : 255;

        const rr = ((r.toString(16).length == 1) ? "0" + r.toString(16) : r.toString(16));
        const gg = ((g.toString(16).length == 1) ? "0" + g.toString(16) : g.toString(16));
        const bb = ((b.toString(16).length == 1) ? "0" + b.toString(16) : b.toString(16));

        return "#" + rr + gg + bb;
    }
}

// --- Controlador Principal de la Aplicación ---
class AppController {
    constructor() {
        this.audioEngine = new AudioEngine();
        this.tracks = [];
        this.isPlaying = false;
        this.currentRow = 0;
        this.bpm = 130;
        this.intervalId = null;
        
        this.playBtn = document.getElementById('playBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.rackBody = document.getElementById('rackBody');
    }

    init() {
        this.initEventListeners();
        // Crear una pista inicial
        this.addTrack();
    }

    initEventListeners() {
        this.playBtn.addEventListener('click', () => this.togglePlay());
        this.stopBtn.addEventListener('click', () => this.stop());
    }

    addTrack() {
        // Asegurar que el motor de audio esté listo antes de crear pistas
        this.audioEngine.init();
        const trackId = this.tracks.length;
        // Color naranja inicial por defecto
        const track = new Track(trackId, this.audioEngine.audioCtx, this.audioEngine.masterGain, '#ff9900');
        track.render(this.rackBody);
        this.tracks.push(track);
    }

    togglePlay() {
        if (this.isPlaying) {
            this.stop();
        } else {
            this.play();
        }
    }

    play() {
        this.audioEngine.init(); // Asegurar que el audioContext esté activo
        this.isPlaying = true;
        this.playBtn.textContent = 'PAUSE';
        this.playBtn.style.background = '#6d6';
        
        // Calcular el tiempo por fila (en ms) basado en BPM
        // Suponiendo 4 filas por beat (patrón de semicorcheas estándar)
        const msPerRow = (60000 / this.bpm) / 4;
        
        this.intervalId = setInterval(() => {
            this.playRow();
        }, msPerRow);
    }

    stop() {
        this.isPlaying = false;
        this.playBtn.textContent = 'PLAY';
        this.playBtn.style.background = '#444';
        clearInterval(this.intervalId);
        this.currentRow = 0;
        this.updatePlayheadPosition();
    }

    playRow() {
        this.tracks.forEach(track => {
            // Obtener datos de la fila actual para esta pista
            // Usar módulo (%) para que el patrón haga loop si llega al final
            const rowData = track.patternData[this.currentRow % track.patternData.length];
            
            // Disparar la nota si existe
            if (rowData && rowData.note !== '---') {
                const vol = rowData.vol !== '--' ? rowData.vol : 'FF'; // FF = volumen máximo por defecto
                this.audioEngine.playNote(rowData.note, rowData.inst, vol, track.trackGain);
            }
        });

        this.updatePlayheadPosition();
        this.currentRow++;
    }

    updatePlayheadPosition() {
        const rowHeight = 15; // Altura fija de fila definida en CSS
        // Obtener la longitud máxima del patrón entre todas las pistas
        const maxRows = Math.max(...this.tracks.map(t => t.patternData.length));
        // Calcular el desplazamiento en píxeles
        const scrollOffset = (this.currentRow % maxRows) * rowHeight;
        
        // Mover el contenedor de filas de cada pista
        this.tracks.forEach(track => {
            const rowsContainer = track.element.querySelector('.tracker-rows');
            // Usamos transform para un movimiento suave y eficiente
            rowsContainer.style.transform = `translateY(-${scrollOffset}px)`;
        });
    }
}
