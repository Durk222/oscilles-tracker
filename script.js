//OSCILLESTRACKER SCRIPT MAIN. . .
document.addEventListener('DOMContentLoaded', () => {
    // Verificar carga de librería
    if (typeof lcjs === 'undefined') {
        alert('Error: LightningChart JS no cargó. Revisa tu conexión.');
        return;
    }
    const app = new AppController();
    app.init();
});

// --- Configuración de Teclado (Estilo Tracker) ---
const KEYBOARD_MAP = {
    'z': 'C-', 's': 'C#', 'x': 'D-', 'd': 'D#', 'c': 'E-', 'v': 'F-',
    'g': 'F#', 'b': 'G-', 'h': 'G#', 'n': 'A-', 'j': 'A#', 'm': 'B-',
    ',': 'C-' // Octava siguiente
};

// --- MOTOR DE AUDIO ---
class AudioEngine {
    constructor() {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.audioCtx.createGain();
        this.masterGain.gain.value = 0.5;
        this.masterGain.connect(this.audioCtx.destination);
    }

    // Método vital para desbloquear el audio en navegadores modernos
    async checkContext() {
        if (this.audioCtx.state === 'suspended') {
            await this.audioCtx.resume();
        }
    }

    playNote(noteName, instrumentId, volumeHex, trackGainNode) {
        this.checkContext(); // Intentar desbloquear siempre que se intente tocar
        if (noteName === '---') return;

        const freq = this.noteToFreq(noteName);
        if (!freq) return;

        const osc = this.audioCtx.createOscillator();
        osc.type = 'sawtooth'; 
        osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);

        const gainNode = this.audioCtx.createGain();
        // Convertir volumen Hex (00-FF) a 0.0-1.0
        let volVal = 0.5;
        if (volumeHex && volumeHex !== '--') {
            volVal = parseInt(volumeHex, 16) / 255;
        }
        
        gainNode.gain.setValueAtTime(volVal, this.audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.4);

        osc.connect(gainNode);
        gainNode.connect(trackGainNode);

        osc.start();
        osc.stop(this.audioCtx.currentTime + 0.5);
    }

    noteToFreq(note) {
        if (!note || note.length < 3) return null;
        const notes = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
        const name = note.slice(0, 2);
        const octave = parseInt(note.charAt(2)); // C-4 -> 4
        const index = notes.indexOf(name);
        
        if (index === -1 || isNaN(octave)) return null;
        
        const midiNote = index + (octave + 1) * 12;
        return 440 * Math.pow(2, (midiNote - 69) / 12);
    }
    
    // Helper para obtener valor MIDI numérico (para el visualizador)
    getMidiNumber(note) {
        const notes = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
        const name = note.slice(0, 2);
        const octave = parseInt(note.charAt(2));
        if (notes.indexOf(name) === -1) return 0;
        return notes.indexOf(name) + (octave + 1) * 12;
    }
}

// --- VISUALIZADOR MIDI (Piano Roll Vertical) ---
class MidiVisualizer {
    constructor(canvas, color, audioEngine) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.color = color;
        this.audioEngine = audioEngine;
    }

    setColor(newColor) {
        this.color = newColor;
    }

    draw(patternData) {
        // Limpiar canvas
        this.ctx.fillStyle = '#000'; 
        this.ctx.fillRect(0,0, this.canvas.width, this.canvas.height);

        const rowHeight = 15; 
        // Rango de visualización: De C-1 (24) a C-8 (108) = 84 notas aprox
        const minMidi = 24; 
        const maxMidi = 96; 
        const midiRange = maxMidi - minMidi;

        patternData.forEach((row, rowIndex) => {
            if (row.note && row.note !== '---') {
                const midiNum = this.audioEngine.getMidiNumber(row.note);
                
                // Normalizar posición X basada en la altura de la nota (0 a 1)
                let normalizedPos = (midiNum - minMidi) / midiRange;
                // Clamp (limitar entre 0 y 1)
                normalizedPos = Math.max(0, Math.min(1, normalizedPos));

                const x = normalizedPos * (this.canvas.width - 10); // -10 para que no se salga
                const y = rowIndex * rowHeight;
                
                this.ctx.fillStyle = this.color;
                this.ctx.fillRect(x, y, 8, rowHeight - 1); // Nota de 8px de ancho
                
                // Brillo extra
                this.ctx.fillStyle = 'rgba(255,255,255,0.3)';
                this.ctx.fillRect(x+2, y+2, 4, rowHeight - 4);
            }
        });
    }
}

// --- VISUALIZADOR DE AUDIO (LightningChart) ---
class AudioVisualizer {
    constructor(container, analyserNode, color) {
        this.container = container;
        this.analyser = analyserNode;
        this.color = color;
        this.chart = null;
        this.lineSeries = null;
        this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        
        // Esperar un tick para asegurar que el contenedor está renderizado en el DOM
        setTimeout(() => this.initChart(), 0);
    }

    initChart() {
        const { lightningChart, AxisTickStrategies, Themes, ColorHEX, SolidLine, SolidFill } = lcjs;

        // Crear gráfico
        this.chart = lightningChart().ChartXY({
            container: this.container,
            theme: Themes.darkGold,
            disableAnimations: true // Rendimiento
        })
        .setTitle('')
        .setPadding(0)
        .setBackgroundFillStyle(new SolidFill({ color: ColorHEX('#000000') }));

        // Ocultar ejes
        this.chart.getDefaultAxisX().setTickStrategy(AxisTickStrategies.Empty).setStrokeStyle(emptyLine => emptyLine.setFillStyle(new SolidFill({ color: ColorHEX('#000') })));
        this.chart.getDefaultAxisY().setTickStrategy(AxisTickStrategies.Empty).setScrollStrategy(undefined).setInterval(-140, 140);

        // Crear la serie de línea CORRECTAMENTE
        this.lineSeries = this.chart.addLineSeries({
            dataPattern: { pattern: 'ProgressiveX' }
        });

        // Aplicar color inicial usando la sintaxis robusta de v4
        this.updateColorStyle(this.color);

        this.animate();
    }

    updateColorStyle(hexColor) {
        if (!this.lineSeries) return;
        const { SolidLine, SolidFill, ColorHEX } = lcjs;
        
        try {
            const lcColor = ColorHEX(hexColor);
            const stroke = new SolidLine({
                thickness: 2,
                fillStyle: new SolidFill({ color: lcColor })
            });
            this.lineSeries.setStrokeStyle(stroke);
        } catch (e) {
            console.error("Error al actualizar color del gráfico:", e);
        }
    }

    setColor(newColor) {
        this.color = newColor;
        this.updateColorStyle(newColor);
    }

    animate() {
        if (!this.analyser || !this.lineSeries) {
            requestAnimationFrame(() => this.animate());
            return;
        }
        
        this.analyser.getByteTimeDomainData(this.dataArray);
        
        const points = [];
        // Downsampling para rendimiento (tomar 1 de cada 4 puntos)
        for (let i = 0; i < this.dataArray.length; i += 4) { 
            const y = this.dataArray[i] - 128;
            points.push({ x: i, y: y });
        }

        this.lineSeries.clear().add(points);
        requestAnimationFrame(() => this.animate());
    }
}

// --- CLASE PISTA (TRACK) ---
class Track {
    constructor(id, appController, initialColor) {
        this.id = id;
        this.app = appController; // Referencia al controlador principal
        this.audioEngine = appController.audioEngine;
        this.color = initialColor;
        
        this.trackGain = this.audioEngine.audioCtx.createGain();
        this.trackGain.connect(this.audioEngine.masterGain);
        this.analyser = this.audioEngine.audioCtx.createAnalyser();
        this.analyser.fftSize = 512; 
        this.trackGain.connect(this.analyser);

        this.patternData = Array(64).fill(null).map(() => ({ note: '---', inst: '--', vol: '--', fx: '---' }));
        
        this.element = null;
        this.midiVisualizer = null;
        this.audioVisualizer = null;
    }

    render(container) {
        const template = document.getElementById('track-template');
        const clone = template.content.cloneNode(true);
        this.element = clone.querySelector('.track-module');
        container.appendChild(this.element);

        this.initColorPicker();
        this.initGrid();
        
        // Inicializar visualizadores
        const midiCanvas = this.element.querySelector('.midi-canvas');
        this.midiVisualizer = new MidiVisualizer(midiCanvas, this.color, this.audioEngine);
        this.midiVisualizer.draw(this.patternData);

        const waveContainer = this.element.querySelector('.wave-chart-container');
        // Generar ID único para el contenedor del gráfico (LCJS lo requiere a veces)
        const chartId = `chart-container-${this.id}`;
        waveContainer.id = chartId; 
        this.audioVisualizer = new AudioVisualizer(chartId, this.analyser, this.color);
        
        this.initAddRowBtn();
        this.updateColor(this.color);
    }

    initColorPicker() {
        const picker = this.element.querySelector('.track-color-picker');
        picker.value = this.color;
        picker.addEventListener('input', (e) => this.updateColor(e.target.value));
    }

    updateColor(newColor) {
        this.color = newColor;
        this.element.style.setProperty('--track-color', this.color);
        // Generar versión oscura
        const darkColor = this.adjustColorBrightness(this.color, -70); 
        this.element.style.setProperty('--track-color-dark', darkColor);
        
        const rgb = this.hexToRgb(this.color);
        if(rgb) this.element.style.setProperty('--track-color-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);

        if (this.midiVisualizer) {
            this.midiVisualizer.setColor(this.color);
            this.midiVisualizer.draw(this.patternData); // Redibujar con nuevo color
        }
        if (this.audioVisualizer) this.audioVisualizer.setColor(this.color);
    }

    initGrid() {
        const rowsContainer = this.element.querySelector('.tracker-rows');
        rowsContainer.innerHTML = '';
        this.patternData.forEach((rowData, index) => this.createRowElement(rowsContainer, rowData, index));
    }

    createRowElement(container, rowData, index) {
        const row = document.createElement('div');
        row.className = `tracker-row ${index % 4 === 0 ? 'highlight' : ''}`;
        
        // HTML directo es más rápido
        row.innerHTML = `
            <div class="row-number">${index.toString().padStart(2,'0')}</div>
            <input type="text" class="tracker-cell note-cell" data-type="note" data-row="${index}" value="${rowData.note}" readonly>
            <input type="text" class="tracker-cell inst-cell" data-type="inst" data-row="${index}" value="${rowData.inst}" maxlength="2">
            <input type="text" class="tracker-cell" data-type="vol" data-row="${index}" value="${rowData.vol}" maxlength="2">
            <input type="text" class="tracker-cell" data-type="fx" data-row="${index}" value="${rowData.fx}" maxlength="3">
        `;
        container.appendChild(row);

        // EVENTO DE TECLADO (Keydown) para estilo Tracker
        const noteInput = row.querySelector('.note-cell');
        
        // Click para seleccionar
        noteInput.addEventListener('click', () => {
             // Necesario para iniciar AudioContext si es la primera interacción
             this.audioEngine.checkContext();
             noteInput.focus();
             noteInput.classList.add('editing');
        });

        noteInput.addEventListener('keydown', (e) => {
            e.preventDefault(); // Prevenir escritura normal
            
            // Borrar nota con tecla Supr o Backspace
            if (e.key === 'Delete' || e.key === 'Backspace') {
                this.updateNoteCell(index, '---');
                return;
            }

            // Mapeo de teclas tipo piano
            const key = e.key.toLowerCase();
            if (KEYBOARD_MAP[key]) {
                const baseNote = KEYBOARD_MAP[key];
                // Calcular octava base (por defecto 4, si presiona ',' es 5)
                const octave = key === ',' ? 5 : 4; 
                const fullNote = baseNote + octave;

                // 1. Actualizar Datos
                this.updateNoteCell(index, fullNote);

                // 2. Tocar Sonido (Preview)
                this.audioEngine.playNote(fullNote, '01', 'FF', this.trackGain);

                // 3. Auto-avance (Mover foco a la siguiente fila)
                const nextRowIndex = index + 1;
                if (nextRowIndex < this.patternData.length) {
                    const nextInput = container.children[nextRowIndex].querySelector('.note-cell');
                    if (nextInput) nextInput.focus();
                }
            }
        });

        noteInput.addEventListener('blur', () => noteInput.classList.remove('editing'));
        
        // Listeners simples para otras celdas (Vol, Inst)
        const otherInputs = row.querySelectorAll('.tracker-cell:not(.note-cell)');
        otherInputs.forEach(input => {
            input.addEventListener('input', (e) => {
                const type = e.target.dataset.type;
                this.patternData[index][type] = e.target.value.toUpperCase();
            });
        });
    }

    updateNoteCell(index, noteValue) {
        this.patternData[index].note = noteValue;
        
        // Actualizar DOM
        const rowsContainer = this.element.querySelector('.tracker-rows');
        const input = rowsContainer.children[index].querySelector('.note-cell');
        input.value = noteValue;

        // Actualizar Piano Roll inmediatamente
        this.midiVisualizer.draw(this.patternData);
    }

    initAddRowBtn() {
        const btn = this.element.querySelector('.add-row-btn');
        btn.addEventListener('click', () => {
            const newData = { note: '---', inst: '--', vol: '--', fx: '---' };
            this.patternData.push(newData);
            const rowsContainer = this.element.querySelector('.tracker-rows');
            this.createRowElement(rowsContainer, newData, this.patternData.length - 1);
            this.midiVisualizer.draw(this.patternData);
        });
    }

    // Utilidades de color
    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
    }
    adjustColorBrightness(hex, percent) {
        let r = parseInt(hex.substring(1,3),16), g = parseInt(hex.substring(3,5),16), b = parseInt(hex.substring(5,7),16);
        r = parseInt(r * (100 + percent) / 100); g = parseInt(g * (100 + percent) / 100); b = parseInt(b * (100 + percent) / 100);
        r = (r<255)?r:255; g = (g<255)?g:255; b = (b<255)?b:255;
        r = (r>0)?r:0; g = (g>0)?g:0; b = (b>0)?b:0; // correccion limites
        const rr = (r.toString(16).length==1)?"0"+r.toString(16):r.toString(16);
        const gg = (g.toString(16).length==1)?"0"+g.toString(16):g.toString(16);
        const bb = (b.toString(16).length==1)?"0"+b.toString(16):b.toString(16);
        return "#"+rr+gg+bb;
    }
}

// --- CONTROLADOR PRINCIPAL ---
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
        this.playBtn.addEventListener('click', () => {
            this.audioEngine.checkContext(); // Desbloquear audio al hacer click en Play
            this.togglePlay();
        });
        this.stopBtn.addEventListener('click', () => this.stop());
        
        // Crear pista inicial
        this.addTrack();
    }

    addTrack() {
        const trackId = this.tracks.length;
        // Pista 1 Naranja, Pista 2 Azul (si hubiera más)
        const color = trackId === 0 ? '#ff9900' : '#00aaff';
        const track = new Track(trackId, this, color);
        track.render(this.rackBody);
        this.tracks.push(track);
    }

    togglePlay() {
        if (this.isPlaying) this.stop();
        else this.play();
    }

    play() {
        this.isPlaying = true;
        this.playBtn.textContent = 'PAUSE';
        this.playBtn.style.background = '#6d6';
        this.playBtn.style.color = '#000';
        
        const msPerRow = (60000 / this.bpm) / 4; 
        this.intervalId = setInterval(() => this.playRow(), msPerRow);
    }

    stop() {
        this.isPlaying = false;
        this.playBtn.textContent = 'PLAY';
        this.playBtn.style.background = '#444';
        this.playBtn.style.color = '#fff';
        clearInterval(this.intervalId);
        this.currentRow = 0;
        this.updatePlayheadPosition();
    }

    playRow() {
        this.tracks.forEach(track => {
            const rowData = track.patternData[this.currentRow % track.patternData.length];
            if (rowData && rowData.note !== '---') {
                track.element.querySelector(`.tracker-rows > div:nth-child(${(this.currentRow % track.patternData.length) + 1})`).classList.add('flash');
                setTimeout(() => {
                     const el = track.element.querySelector(`.tracker-rows > div:nth-child(${(this.currentRow % track.patternData.length) + 1})`);
                     if(el) el.classList.remove('flash');
                }, 100);
                
                this.audioEngine.playNote(rowData.note, rowData.inst, rowData.vol, track.trackGain);
            }
        });
        this.updatePlayheadPosition();
        this.currentRow++;
    }

    updatePlayheadPosition() {
        const rowHeight = 15; 
        const maxRows = Math.max(...this.tracks.map(t => t.patternData.length));
        const scrollOffset = (this.currentRow % maxRows) * rowHeight;
        
        // Centrar el playhead: Restamos la mitad de la altura visible del tracker (200px aprox)
        // para que la fila actual esté siempre en el medio
        const centerOffset = scrollOffset - 180; 

        this.tracks.forEach(track => {
            const rowsContainer = track.element.querySelector('.tracker-rows');
            rowsContainer.style.transform = `translateY(-${scrollOffset}px)`;
        });
    }
}
