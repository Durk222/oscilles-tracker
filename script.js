//OSCILLESTRACKER MAIN SCRIPT.JS. . . 
// --- CONFIGURACIÓN GLOBAL ---
const KEYBOARD_MAP = {
// Octava 4 (Fila inferior)
    'z': { note: 'C-', oct: 4 }, 's': { note: 'C#', oct: 4 },
    'x': { note: 'D-', oct: 4 }, 'd': { note: 'D#', oct: 4 },
    'c': { note: 'E-', oct: 4 }, 'v': { note: 'F-', oct: 4 },
    'g': { note: 'F#', oct: 4 }, 'b': { note: 'G-', oct: 4 },
    'h': { note: 'G#', oct: 4 }, 'n': { note: 'A-', oct: 4 },
    'j': { note: 'A#', oct: 4 }, 'm': { note: 'B-', oct: 4 },
    ',': { note: 'C-', oct: 5 }, // Salto a octava siguiente

    // Octava 5 (Fila superior - QWERTY)
    'q': { note: 'C-', oct: 5 }, '2': { note: 'C#', oct: 5 },
    'w': { note: 'D-', oct: 5 }, '3': { note: 'D#', oct: 5 },
    'e': { note: 'E-', oct: 5 }, 'r': { note: 'F-', oct: 5 },
    '5': { note: 'F#', oct: 5 }, 't': { note: 'G-', oct: 5 },
    '6': { note: 'G#', oct: 5 }, 'y': { note: 'A-', oct: 5 },
    '7': { note: 'A#', oct: 5 }, 'u': { note: 'B-', oct: 5 },
    'i': { note: 'C-', oct: 6 }
};

document.addEventListener('DOMContentLoaded', () => {
    if (typeof lcjs === 'undefined') {
        alert('Error: LightningChart JS no cargó.');
        return;
    }
    const app = new AppController();
    app.init();
});

// --- MOTOR DE AUDIO ---
class AudioEngine {
    constructor() {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.audioCtx.createGain();
        this.masterGain.gain.value = 0.5;
        this.masterGain.connect(this.audioCtx.destination);
    }

    async checkContext() {
        if (this.audioCtx.state === 'suspended') {
            await this.audioCtx.resume();
        }
    }

    playNote(noteName, instrumentId, volumeHex, trackGainNode, waveType = 'sawtooth') {
        this.checkContext();
        if (noteName === '---') return;

        const freq = this.noteToFreq(noteName);
        if (!freq) return;

        const osc = this.audioCtx.createOscillator();
        osc.type = waveType; 
        osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);

        const gainNode = this.audioCtx.createGain();
        let volVal = 0.5;
        if (volumeHex && volumeHex !== '--') {
        volVal = parseInt(volumeHex, 16) / 100; 
        }
        
        gainNode.gain.setValueAtTime(volVal, this.audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.4);

        osc.connect(gainNode);
        gainNode.connect(trackGainNode);

        osc.start();
        osc.stop(this.audioCtx.currentTime + 0.5);
    }

    noteToFreq(note) {
        const notes = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
        const name = note.slice(0, 2);
        const octave = parseInt(note.charAt(2));
        const index = notes.indexOf(name);
        if (index === -1 || isNaN(octave)) return null;
        const midiNote = index + (octave + 1) * 12;
        return 440 * Math.pow(2, (midiNote - 69) / 12);
    }

    getMidiNumber(note) {
        const notes = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
        const name = note.slice(0, 2);
        const octave = parseInt(note.charAt(2));
        if (notes.indexOf(name) === -1) return 0;
        return notes.indexOf(name) + (octave + 1) * 12;
    }
}

// --- VISUALIZADOR MIDI ---
class MidiVisualizer {
    constructor(canvas, color, audioEngine) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.color = color;
        this.bgColor = '#000';
        this.audioEngine = audioEngine;
    }

    setColor(newColor) { this.color = newColor; }
    setBackgroundColor(hexColor) { this.bgColor = hexColor; }

    draw(patternData) {
    // AJUSTE: Sincronizar tamaño del buffer con el tamaño real de la pantalla
    if (this.canvas.width !== this.canvas.clientWidth || this.canvas.height !== this.canvas.clientHeight) {
        this.canvas.width = this.canvas.clientWidth;
        this.canvas.height = this.canvas.clientHeight;
    }
        this.ctx.fillStyle = this.bgColor; 
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const rowHeight = 15;
        const minMidi = 24; 
        const maxMidi = 96; 
        const midiRange = maxMidi - minMidi;

        patternData.forEach((row, rowIndex) => {
            if (row.note && row.note !== '---') {
                const midiNum = this.audioEngine.getMidiNumber(row.note);
                let normalizedPos = (midiNum - minMidi) / midiRange;
                normalizedPos = Math.max(0, Math.min(1, normalizedPos));

                const x = normalizedPos * (this.canvas.width - 10);
                const y = rowIndex * rowHeight;
                
                this.ctx.fillStyle = this.color;
                this.ctx.fillRect(x, y, 8, rowHeight - 1);
            }
        });
    }
}

// --- VISUALIZADOR DE AUDIO (LightningChart VERTICAL) ---
class AudioVisualizer {
    constructor(container, analyserNode, color) {
        this.container = container;
        this.analyser = analyserNode;
        this.color = color;
        this.chart = null;
        this.lineSeries = null;
        this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        setTimeout(() => this.initChart(), 0);
    }

initChart() {
    const { lightningChart, AxisTickStrategies, Themes, ColorHEX, SolidLine, SolidFill } = lcjs;

    this.chart = lightningChart().ChartXY({
        container: this.container,
        theme: Themes.darkGold,
        disableAnimations: true
    }).setTitle('').setPadding(0);

    // EJE X: Amplitud (Izquierda a Derecha)
    // Lo fijamos de -128 a 128 para que la onda no se salga ni se mueva el eje
    this.chart.getDefaultAxisX()
        .setTickStrategy(AxisTickStrategies.Empty)
        .setInterval(-128, 128) 
        .setStrokeStyle(empty => empty.setFillStyle(new SolidFill({color: ColorHEX('#00000000')})));

    this.chart.getDefaultAxisX()
    .setInterval(-128, 128)
    .setScrollStrategy(undefined); // <--- AÑADE ESTO

    this.chart.getDefaultAxisY()
    .setInterval(0, 128)
    .setScrollStrategy(undefined); // <--- AÑADE ESTO

    // EJE Y: El cuerpo de la onda (Arriba a Abajo)
    // 0 a 128 coincide con la cantidad de puntos que dibujamos (512 / 4 = 128)
    this.chart.getDefaultAxisY()
        .setTickStrategy(AxisTickStrategies.Empty)
        .setInterval(0, 128)
        .setStrokeStyle(empty => empty.setFillStyle(new SolidFill({color: ColorHEX('#00000000')})));

    this.lineSeries = this.chart.addLineSeries();
    
    // Aplicar colores inmediatamente al crear
    this.updateColorStyle(this.color);
    this.setBackgroundColor(this.adjustColorBrightness(this.color, -80)); // Función de apoyo
    
    this.animate();
}

    updateColorStyle(hexColor) {
        if (!this.lineSeries) return;
        const { SolidLine, SolidFill, ColorHEX } = lcjs;
        this.lineSeries.setStrokeStyle(new SolidLine({
            thickness: 2,
            fillStyle: new SolidFill({ color: ColorHEX(hexColor) })
        }));
    }

    setBackgroundColor(hexColor) {
        if (this.chart) {
            const { SolidFill, ColorHEX } = lcjs;
            this.chart.setBackgroundFillStyle(new SolidFill({ color: ColorHEX(hexColor) }));
            this.chart.setSeriesBackgroundFillStyle(new SolidFill({ color: ColorHEX(hexColor) }));
        }
    }

    setColor(newColor) {
        this.color = newColor;
        this.updateColorStyle(newColor);
    }

    adjustColorBrightness(hex, percent) {
    let r = parseInt(hex.substring(1,3),16), g = parseInt(hex.substring(3,5),16), b = parseInt(hex.substring(5,7),16);
    r = Math.max(0, Math.min(255, r + percent));
    g = Math.max(0, Math.min(255, g + percent));
    b = Math.max(0, Math.min(255, b + percent));
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }

    animate() {
        if (!this.analyser || !this.lineSeries) {
            requestAnimationFrame(() => this.animate());
            return;
        }
        this.analyser.getByteTimeDomainData(this.dataArray);
        const points = [];
        for (let i = 0; i < this.dataArray.length; i += 4) { 
            const amplitude = this.dataArray[i] - 128;
            points.push({ x: amplitude, y: i / 4 }); 
        }
        this.lineSeries.clear().add(points);
        requestAnimationFrame(() => this.animate());
    }
}

// --- CLASE PISTA (TRACK) ---
class Track {
    constructor(id, appController, initialColor) {
        this.id = id;
        this.app = appController;
        this.audioEngine = appController.audioEngine;
        this.color = initialColor;
        this.waveType = 'sawtooth';
        this.trackGain = this.audioEngine.audioCtx.createGain();
        this.trackGain.connect(this.audioEngine.masterGain);
        this.analyser = this.audioEngine.audioCtx.createAnalyser();
        this.analyser.fftSize = 512; 
        this.trackGain.connect(this.analyser);
        this.patternData = Array(64).fill(null).map(() => ({ note: '---', inst: '--', vol: '--', fx: '---' }));
        this.isMuted = false;
        this.isSolo = false;
    }

    render(container) {
        const template = document.getElementById('track-template');
        const clone = template.content.cloneNode(true);
        this.element = clone.querySelector('.track-module');
        container.appendChild(this.element);

        const muteBtn = this.element.querySelector('.mute-btn');
        const soloBtn = this.element.querySelector('.solo-btn');

        // SELECTOR DE ONDA
        const waveSelect = this.element.querySelector('.wave-type-select');
        if (waveSelect) {
            this.waveType = waveSelect.value; // Lee el valor inicial del HTML
            waveSelect.addEventListener('change', (e) => {
                this.waveType = e.target.value; // Cambia a SAW, SQR, TRI o SIN
            });
        }
    //  BOTONES MUTE Y SOLO
    muteBtn.addEventListener('click', () => {
    this.isMuted = !this.isMuted;
    // En lugar de solo togglear la clase del botón, 
    // llamamos a la app para que actualice toda la lógica visual
    this.app.updateVisualStates(); 
    });

        soloBtn.addEventListener('click', () => {
        this.app.toggleSolo(this);
        });

        this.initColorPicker();
        this.initGrid();

     // LÓGICA PARA EL BOTÓN DE FILAS
    const addRowBtn = this.element.querySelector('.add-row-btn');
    if (addRowBtn) {
        addRowBtn.addEventListener('click', () => {
            this.addRow(); // Ejecuta la función que añade una fila de datos
        });
    }
// LÓGICA PARA EL BOTÓN DE ELIMINAR FILA
const deleteBtn = this.element.querySelector('.delete-track-btn');
if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
        this.app.removeTrack(this); 
    });
}
        
    const midiCanvas = this.element.querySelector('.midi-canvas');
    this.midiVisualizer = new MidiVisualizer(midiCanvas, this.color, this.audioEngine);

    const waveContainer = this.element.querySelector('.wave-chart-container');
    waveContainer.id = `chart-container-${this.id}`; 
    this.audioVisualizer = new AudioVisualizer(waveContainer.id, this.analyser, this.color);
    
    // USAMOS UN PEQUEÑO TIMEOUT:
    // Esto asegura que LightningChart ya exista antes de pedirle que cambie de negro a color
    setTimeout(() => {
        this.updateColor(this.color);
    }, 50);
    }

    initColorPicker() {
        const picker = this.element.querySelector('.track-color-picker');
        picker.value = this.color;
        picker.addEventListener('input', (e) => this.updateColor(e.target.value));
    }

    updateColor(newColor) {
        this.color = newColor;
        const darkColor = this.adjustColorBrightness(this.color, -80);
        this.element.style.setProperty('--track-color', this.color);
        this.element.style.setProperty('--track-color-dark', darkColor);
        
        const rgb = this.hexToRgb(this.color);
        if(rgb) this.element.style.setProperty('--track-color-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);

        if (this.midiVisualizer) {
            this.midiVisualizer.setColor(this.color);
            this.midiVisualizer.setBackgroundColor(darkColor);
            this.midiVisualizer.draw(this.patternData);
        }
        if (this.audioVisualizer) {
            this.audioVisualizer.setColor(this.color);
            this.audioVisualizer.setBackgroundColor(darkColor);
        }
    }

    initGrid() {
        const rowsContainer = this.element.querySelector('.tracker-rows');
        rowsContainer.innerHTML = '';
        this.patternData.forEach((rowData, index) => this.createRowElement(rowsContainer, rowData, index));
    }

    createRowElement(container, rowData, index) {
        const row = document.createElement('div');
        row.className = `tracker-row ${index % 4 === 0 ? 'highlight' : ''}`;
        row.innerHTML = `
            <div class="row-number">${index.toString().padStart(2,'0')}</div>
            <input type="text" class="tracker-cell note-cell" value="${rowData.note}" readonly>
            <input type="text" class="tracker-cell inst-cell" value="${rowData.inst}" maxlength="2">
            <input type="text" class="tracker-cell vol-cell" value="${rowData.vol}" maxlength="2">
            <input type="text" class="tracker-cell fx-cell" value="${rowData.fx}" maxlength="3">
        `;
        container.appendChild(row);

        const noteInput = row.querySelector('.note-cell');
        noteInput.addEventListener('click', () => {
            this.audioEngine.checkContext();
            noteInput.focus();
        });

    noteInput.addEventListener('keydown', (e) => {
    e.preventDefault();
    const key = e.key.toLowerCase();
    
    if (e.key === 'Delete' || e.key === 'Backspace') {
        this.updateNoteCell(index, '---');
        this.updateVolCell(index, '--'); // Limpia volumen si borras nota
    } else if (KEYBOARD_MAP[key]) {
        const noteInfo = KEYBOARD_MAP[key];
        const fullNote = noteInfo.note + noteInfo.oct;
        
        // Insertamos Nota
        this.updateNoteCell(index, fullNote);
        
        // Insertamos Volumen por defecto (64 hex = 100 decimal aprox)
        this.updateVolCell(index, '64'); 
        
        this.audioEngine.playNote(fullNote, '01', '64', this.trackGain, this.waveType);
        
        const nextRow = container.children[index + 1];
        if (nextRow) nextRow.querySelector('.note-cell').focus();
             }
        });
        const volInput = row.querySelector('.vol-cell');

volInput.addEventListener('keydown', (e) => {
    // Si es un número del 0 al 9
    if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        const volMap = {
            '1': '0A', '2': '14', '3': '1E', '4': '28', '5': '32', 
            '6': '3C', '7': '46', '8': '50', '9': '5A', '0': '64'
        };
        const newVol = volMap[e.key];
        this.updateVolCell(index, newVol);
        
        // Auto-avanzar al siguiente volumen
        const nextRow = container.children[index + 1];
        if (nextRow) nextRow.querySelector('.vol-cell').focus();
          }
         // Si el usuario escribe manualmente (letras/números), permitimos el comportamiento normal
      });
    }

    updateNoteCell(index, noteValue) {
        this.patternData[index].note = noteValue;
        this.element.querySelectorAll('.note-cell')[index].value = noteValue;
        this.midiVisualizer.draw(this.patternData);
    }

    addRow() {
        const newData = { note: '---', inst: '--', vol: '--', fx: '---' };
        this.patternData.push(newData);
        this.createRowElement(this.element.querySelector('.tracker-rows'), newData, this.patternData.length - 1);
    }

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
    }

    adjustColorBrightness(hex, percent) {
        let r = parseInt(hex.substring(1,3),16), g = parseInt(hex.substring(3,5),16), b = parseInt(hex.substring(5,7),16);
        r = Math.max(0, Math.min(255, r + percent));
        g = Math.max(0, Math.min(255, g + percent));
        b = Math.max(0, Math.min(255, b + percent));
        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }
    updateVolCell(index, volValue) {
    this.patternData[index].vol = volValue;
    const volInputs = this.element.querySelectorAll('.vol-cell');
    if (volInputs[index]) {
        volInputs[index].value = volValue;
    }
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
        this.bpmInput = null;
    }

    init() {
        document.getElementById('playBtn').addEventListener('click', () => {
            this.audioEngine.checkContext();
            this.togglePlay();
        });
        
        document.getElementById('stopBtn').addEventListener('click', () => this.stop());
        
        // 2. Configurar el Input de BPM (Fuera de los botones de play)
        this.bpmInput = document.getElementById('bpmInput');
        if (this.bpmInput) {
        // Sincronizar valor inicial
        this.bpmInput.value = this.bpm; 
        
         this.bpmInput.addEventListener('change', (e) => {
            this.bpm = parseFloat(e.target.value);
            console.log("Nuevo BPM:", this.bpm);
            
            // Si está sonando, reiniciamos el ritmo inmediatamente
            if (this.isPlaying) {
                this.pauseInterval();
                this.startInterval();
            }
        });
    }
        // Botón Añadir Pista
       const addTrackBtn = document.getElementById('addTrackBtn'); 
       if (addTrackBtn) {
       addTrackBtn.addEventListener('click', () => this.addTrack());
         }
        // Crea la primera pista por defecto
        this.addTrack();
    }

                                                            
    startInterval() {
    const msPerRow = (60000 / this.bpm) / 4; 
    this.intervalId = setInterval(() => this.playRow(), msPerRow);
    }

    pauseInterval() {
    if (this.intervalId) clearInterval(this.intervalId);
    }
        
    addTrack() {
    // Genera un color aleatorio simple o usa una lista
    const colors = ['#ff9900', '#00ccff', '#ff0055', '#22ff88', '#aa00ff', '#ffff00'];
    const color = colors[this.tracks.length % colors.length];
    
    const track = new Track(this.tracks.length, this, color);
    track.render(document.getElementById('rackBody'));
    this.tracks.push(track);
    }

    removeTrack(trackInstance) {
    // 1. Confirmación opcional
    if (!confirm(`¿Borrar ${trackInstance.element.querySelector('.track-name').textContent}?`)) return;

    // 2. Eliminar del array de pistas para que deje de sonar en playRow()
    this.tracks = this.tracks.filter(t => t !== trackInstance);

    // 3. Limpiar visualizadores (opcional pero recomendado para performance)
    if (trackInstance.audioVisualizer && trackInstance.audioVisualizer.chart) {
        trackInstance.audioVisualizer.chart.dispose();
    }

    // 4. Eliminar del DOM (la interfaz)
    trackInstance.element.remove();
    
    console.log(`Pista ${trackInstance.id} eliminada.`);
    }
    
    togglePlay() {
        this.isPlaying ? this.stop() : this.play();
    }

    play() {
        this.isPlaying = true;
        document.getElementById('playBtn').textContent = 'PAUSE';
        this.startInterval();
    }

// Método nuevo para centralizar el efecto visual
updateVisualStates() {
    const anySolo = this.tracks.some(t => t.isSolo);

    this.tracks.forEach(track => {
        const isMutedBySolo = anySolo && !track.isSolo;
        const shouldBeSilent = track.isMuted || isMutedBySolo;

        // EFECTO VISUAL
        track.element.classList.toggle('muted-effect', shouldBeSilent);
        
        // CONTROL DE AUDIO REAL (Opcional pero recomendado)
        // Esto silencia cualquier cola de sonido (release) instantáneamente
        if (track.trackGain) {
            const gainValue = shouldBeSilent ? 0 : 1;
            track.trackGain.gain.setTargetAtTime(gainValue, this.audioEngine.audioCtx.currentTime, 0.02);
        }

        // ACTUALIZAR BOTONES
        const soloBtn = track.element.querySelector('.solo-btn');
        const muteBtn = track.element.querySelector('.mute-btn');
        if (soloBtn) soloBtn.classList.toggle('active', track.isSolo);
        if (muteBtn) muteBtn.classList.toggle('active', track.isMuted);
    });
}

// Actualiza toggleSolo para que use el nuevo método
toggleSolo(trackToSolo) {
    trackToSolo.isSolo = !trackToSolo.isSolo;
    this.updateVisualStates(); // Llamada inmediata
}

    stop() {
        this.isPlaying = false;
        document.getElementById('playBtn').textContent = 'PLAY';
        this.pauseInterval();
        
        //LIMPIEZA EN EL SCROLL
        this.currentRow = 0;
        this.updatePlayheadPosition();
        document.querySelectorAll('.tracker-row').forEach(row => row.classList.remove('flash'));
    }

playRow() {
    // --- METRÓNOMO VISUAL ---
    if (this.currentRow % 4 === 0 && this.bpmInput) {
        this.bpmInput.style.color = '#ffffff'; // Color de destello
        this.bpmInput.style.textShadow = '0 0 10px #ffffff'; // Opcional: un pequeño brillo
        
        setTimeout(() => {
            if(this.bpmInput) {
                this.bpmInput.style.color = '#22ff88'; // Vuelve al color original
                this.bpmInput.style.textShadow = 'none';
            }
        }, 100);
    }
    // --- LÓGICA DE AUDIO ---
    const anySolo = this.tracks.some(t => t.isSolo);

    this.tracks.forEach(track => {
        const shouldBeSilent = track.isMuted || (anySolo && !track.isSolo);
        if (shouldBeSilent) return; 

        const index = this.currentRow % track.patternData.length;
        const rowData = track.patternData[index];

        // 3. Si hay una nota válida en esta celda
        if (rowData && rowData.note !== '---') {
            // EFECTO VISUAL: Destello en la fila que está sonando
            const rowEl = track.element.querySelectorAll('.tracker-row')[index];
            if (rowEl) {
                rowEl.classList.add('flash');
                setTimeout(() => rowEl.classList.remove('flash'), 100);
            }

            // MOTOR DE AUDIO: Enviamos la nota, volumen y el tipo de onda elegido en el selector
            this.audioEngine.playNote(
                rowData.note, 
                rowData.inst, 
                rowData.vol, 
                track.trackGain, 
                track.waveType,
            );
        }
    });

    this.updatePlayheadPosition();
    
    const maxLen = this.tracks.length > 0 
        ? Math.max(...this.tracks.map(t => t.patternData.length)) 
        : 64;

    this.currentRow = (this.currentRow + 1) % maxLen;
}
updatePlayheadPosition() {
        this.tracks.forEach(track => {
            const totalRows = track.patternData.length;
            const index = this.currentRow % totalRows;
            const offset = index * 15; 
            
            const rowsContainer = track.element.querySelector('.tracker-rows');
            if (rowsContainer) {
                rowsContainer.style.transform = `translateY(-${offset}px)`;
            }
        });
    } 
}
