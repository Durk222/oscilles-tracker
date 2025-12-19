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
    ',': { note: 'C-', oct: 5 },
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
    const app = new AppController();
    app.init();
});
// --- MOTOR DE AUDIO ---
class AudioEngine {
    constructor() {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.audioCtx.createGain();
        this.masterGain.gain.value = 0.5;

        this.masterAnalyser = this.audioCtx.createAnalyser();
        this.masterAnalyser.fftSize = 256; 
        
        this.masterGain.connect(this.masterAnalyser); 
        this.masterAnalyser.connect(this.audioCtx.destination);
    }

    async checkContext() {
        if (this.audioCtx.state === 'suspended') {
            await this.audioCtx.resume();
        }
    }
playNote(noteName, instrumentId, volumeHex, trackGainNode, waveType = 'sawtooth') {
    this.checkContext();
    if (noteName === '---' || noteName === '===') return null;

    const freq = this.noteToFreq(noteName);
    if (!freq) return null;

    const osc = this.audioCtx.createOscillator();
    const gainNode = this.audioCtx.createGain();
    
    osc.type = waveType; 
    osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);

    let volVal = 0.5;
    if (volumeHex && volumeHex !== '--') {
        volVal = parseInt(volumeHex, 16) / 127; 
    }
    
    gainNode.gain.setValueAtTime(0, this.audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(volVal, this.audioCtx.currentTime + 0.005);

    osc.connect(gainNode);
    gainNode.connect(trackGainNode);

    osc.start();
    return { osc, gainNode };
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

draw(patternData, offsetY = 0) {
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

    this.ctx.save();
    this.ctx.translate(0, -offsetY);

    patternData.forEach((row, rowIndex) => {
        const y = rowIndex * rowHeight;
        
        if (y - offsetY < -rowHeight || y - offsetY > this.canvas.height) return;
        if (row.note && row.note !== '---' && row.note !== '===') {
            const midiNum = this.audioEngine.getMidiNumber(row.note);
            let normalizedPos = (midiNum - minMidi) / midiRange;
            normalizedPos = Math.max(0, Math.min(1, normalizedPos));
            
            const x = normalizedPos * (this.canvas.width - 10);
            
            this.ctx.fillStyle = this.color;
            this.ctx.fillRect(x, y, 8, rowHeight - 1);
        } else if (row.note === '===') {
            this.ctx.fillStyle = this.color;
            this.ctx.globalAlpha = 0.5;
            this.ctx.fillRect(0, y + 7, this.canvas.width, 2);
            this.ctx.globalAlpha = 1.0;
        }
    });
    this.ctx.restore();
  }
}
// --- VISUALIZADOR DE AUDIO ---
class AudioVisualizer {
    constructor(containerId, analyserNode, color) {
        this.container = document.getElementById(containerId);
        this.analyser = analyserNode;
        this.color = color;
        this.bgColor = '#0a0a0a'; 
        
        if (!this.container) return;

        this.canvas = document.createElement('canvas');
        this.canvas.className = 'wave-canvas';
        this.container.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d', { alpha: false });

        this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.animate();
    }

    resize() {
        if (!this.container) return;
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = this.container.clientWidth * dpr;
        this.canvas.height = this.container.clientHeight * dpr;
        this.ctx.scale(dpr, dpr);
    }

    setColor(newColor) { this.color = newColor; }
    setBackgroundColor(hexColor) { this.bgColor = hexColor; }

    animate() {
        if (!this.analyser) return;
        requestAnimationFrame(() => this.animate());

        const width = this.canvas.width / (window.devicePixelRatio || 1);
        const height = this.canvas.height / (window.devicePixelRatio || 1);

        this.analyser.getByteTimeDomainData(this.dataArray);

        this.ctx.fillStyle = this.bgColor; 
        this.ctx.fillRect(0, 0, width, height);

        this.ctx.lineWidth = 2;
        this.ctx.strokeStyle = this.color;
        this.ctx.beginPath();

        const sliceHeight = height / this.dataArray.length;
        let y = 0;

        for (let i = 0; i < this.dataArray.length; i++) {
            const v = this.dataArray[i] / 128.0;
            const x = (v * width) / 2;
            if (i === 0) this.ctx.moveTo(x, y);
            else this.ctx.lineTo(x, y);
            y += sliceHeight;
        }
        this.ctx.stroke();
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
        this.activeVoices = [];
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

        const waveSelect = this.element.querySelector('.wave-type-select');
        if (waveSelect) {
            this.waveType = waveSelect.value;
            waveSelect.addEventListener('change', (e) => {
                this.waveType = e.target.value;
            });
        }

        muteBtn.addEventListener('click', () => {
            this.isMuted = !this.isMuted;
            this.app.updateVisualStates(); 
        });

        soloBtn.addEventListener('click', () => {
            this.app.toggleSolo(this);
        });

        this.initColorPicker();
        this.initGrid();

        const addRowBtn = this.element.querySelector('.add-row-btn');
        if (addRowBtn) {
            addRowBtn.addEventListener('click', () => this.addRow());
        }

        const deleteBtn = this.element.querySelector('.delete-track-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => this.app.removeTrack(this));
        }

        const midiCanvas = this.element.querySelector('.midi-canvas');
        this.midiVisualizer = new MidiVisualizer(midiCanvas, this.color, this.audioEngine);

        const waveContainer = this.element.querySelector('.wave-chart-container');
        const containerId = `chart-container-${this.id}-${Date.now()}`; 
        waveContainer.id = containerId; 
        this.audioVisualizer = new AudioVisualizer(containerId, this.analyser, this.color);

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
    let rowClass = 'tracker-row';
    if (index % 16 === 0) rowClass += ' measure-highlight';
    else if (index % 4 === 0) rowClass += ' beat-highlight';
    
    row.className = rowClass;
    const displayNote = rowData.note === '===' ? '. . .' : rowData.note;
    row.innerHTML = `<div class="row-number">${index.toString().padStart(2,'0')}</div><input type="text" class="tracker-cell note-cell" value="${displayNote}" data-note="${rowData.note}" readonly><input type="text" class="tracker-cell inst-cell" value="${rowData.inst}" maxlength="2"><input type="text" class="tracker-cell vol-cell" value="${rowData.vol}" maxlength="2"><input type="text" class="tracker-cell fx-cell" value="${rowData.fx}" maxlength="3">`;
    
    container.appendChild(row);
    const noteInput = row.querySelector('.note-cell');
    noteInput.addEventListener('click', () => {
        this.audioEngine.checkContext();
        noteInput.focus();
    });

    noteInput.addEventListener('keydown', (e) => {
        e.preventDefault();
        const key = e.key;
        if (key === 'Delete' || key === 'Backspace') {
            this.updateNoteCell(index, '---');
            this.updateVolCell(index, '--');
        } else if (key === 'CapsLock') {
            this.updateNoteCell(index, '===');
            const nextRow = container.children[index + 1];
            if (nextRow) nextRow.querySelector('.note-cell').focus();
        } else if (KEYBOARD_MAP[key.toLowerCase()]) {
            const noteInfo = KEYBOARD_MAP[key.toLowerCase()];
            const fullNote = noteInfo.note + noteInfo.oct;
            this.updateNoteCell(index, fullNote);
            this.updateVolCell(index, '64'); 
            this.stopAllVoices();
            const voice = this.audioEngine.playNote(fullNote, '01', '64', this.trackGain, this.waveType);
            if (voice) this.activeVoices.push(voice);
            const nextRow = container.children[index + 1];
            if (nextRow) nextRow.querySelector('.note-cell').focus();
        }
    });

    const volInput = row.querySelector('.vol-cell');
    volInput.addEventListener('keydown', (e) => {
        if (e.key >= '0' && e.key <= '9') {
            e.preventDefault();
            const volMap = {'1':'0A','2':'14','3':'1E','4':'28','5':'32','6':'3C','7':'46','8':'50','9':'5A','0':'64'};
            const newVol = volMap[e.key];
            this.updateVolCell(index, newVol);
            const nextRow = container.children[index + 1];
            if (nextRow) nextRow.querySelector('.vol-cell').focus();
        }
    });
}

stopAllVoices() {
    const releaseTime = 0.1; 
    const now = this.audioEngine.audioCtx.currentTime;

    this.activeVoices.forEach(v => {
        try {
            v.gainNode.gain.cancelScheduledValues(now);
            v.gainNode.gain.setValueAtTime(v.gainNode.gain.value, now);
            v.gainNode.gain.exponentialRampToValueAtTime(0.001, now + releaseTime);
            
            v.osc.stop(now + releaseTime);
        } catch(e) {
        }
    });
    this.activeVoices = [];
}

     updateNoteCell(index, noteValue) {
        this.patternData[index].note = noteValue;
        const noteInputs = this.element.querySelectorAll('.note-cell');
        const cell = noteInputs[index];
    
        if (cell) {
        cell.value = (noteValue === '===') ? ". . ." : noteValue;
        cell.setAttribute('data-note', noteValue);
        }
    
       this.midiVisualizer.draw(this.patternData);
    }

    updateVolCell(index, volValue) {
        this.patternData[index].vol = volValue;
        const volInputs = this.element.querySelectorAll('.vol-cell');
        if (volInputs[index]) volInputs[index].value = volValue;
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
        
        this.bpmInput = document.getElementById('bpmInput');
        if (this.bpmInput) {
        this.bpmInput.value = this.bpm; 
        
         this.bpmInput.addEventListener('change', (e) => {
            this.bpm = parseFloat(e.target.value);
            console.log("Nuevo BPM:", this.bpm);
            
            if (this.isPlaying) {
                this.pauseInterval();
                this.startInterval();
            }
        });
    }

       const addTrackBtn = document.getElementById('addTrackBtn'); 
       if (addTrackBtn) {
       addTrackBtn.addEventListener('click', () => this.addTrack());
         }
// --- LISTENERS DE ARCHIVO ---
document.querySelectorAll('.menu-item span').forEach(span => {
    const text = span.textContent.toUpperCase();
    if (text.includes('SAVE PROJECT')) {
        span.style.cursor = 'pointer';
        span.addEventListener('click', () => this.exportProject());
    }
    if (text.includes('OPEN PROJECT')) {
        span.style.cursor = 'pointer';
        span.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.osc';
            input.onchange = (e) => this.importProject(e.target.files[0]);
            input.click();
        });
    }
});
        window.addEventListener('keydown', (e) => {
            if (e.target.id === 'bpmInput') return;

            if (e.code === 'Space') {
                e.preventDefault();
                this.audioEngine.checkContext();
                this.togglePlay();
            }
            
            if (e.code === 'Escape') {
                this.stop();
            }
        });
        
        this.addTrack();
        this.updateMasterVu();
    }

                                                            
    startInterval() {
    const msPerRow = (60000 / this.bpm) / 4; 
    this.intervalId = setInterval(() => this.playRow(), msPerRow);
    }

    pauseInterval() {
    if (this.intervalId) clearInterval(this.intervalId);
    }
        
    addTrack() {
    const colors = ['#ff9900', '#00ccff', '#ff0055', '#22ff88', '#aa00ff', '#ffff00'];
    const color = colors[this.tracks.length % colors.length];
    
    const track = new Track(this.tracks.length, this, color);
    track.render(document.getElementById('rackBody'));
    this.tracks.push(track);
    }

    removeTrack(trackInstance) {
    if (!confirm(`¿Borrar ${trackInstance.element.querySelector('.track-name').textContent}?`)) return;

    this.tracks = this.tracks.filter(t => t !== trackInstance);
        
    trackInstance.element.remove();
    
    console.log(`Pista ${trackInstance.id} eliminada.`);
    }
togglePlay() {
        if (this.isPlaying) {
            this.stop();
        } else {
            this.play();
        }
    }

    play() {
        if (this.isPlaying) return; 
        this.isPlaying = true;
        const playBtn = document.getElementById('playBtn');
        if (playBtn) playBtn.textContent = 'PAUSE';
        this.updateVisualStates();
        this.startInterval();
    }

    stop() {
        this.isPlaying = false;
        const playBtn = document.getElementById('playBtn');
        if (playBtn) playBtn.textContent = 'PLAY';
        
        this.pauseInterval();
        this.allTracksStop();
        
        this.currentRow = 0;
        this.updatePlayheadPosition();
        
        document.querySelectorAll('.tracker-row').forEach(row => row.classList.remove('flash'));
        console.log("Tracker detenido y reseteado.");
    }

    playRow() {
        if (!this.isPlaying) return;

        // --- METRÓNOMO VISUAL ---
        if (this.currentRow % 4 === 0 && this.bpmInput) {
            this.bpmInput.style.color = '#ffffff';
            this.bpmInput.style.textShadow = '0 0 10px #ffffff';
            setTimeout(() => {
                if(this.bpmInput) {
                    this.bpmInput.style.color = '#22ff88';
                    this.bpmInput.style.textShadow = 'none';
                }
            }, 100);
        }

        const anySolo = this.tracks.some(t => t.isSolo);

        this.tracks.forEach(track => {
            const shouldBeSilent = track.isMuted || (anySolo && !track.isSolo);
            const index = this.currentRow % track.patternData.length;
            const rowData = track.patternData[index];

            if (rowData.note === '===') {
                track.stopAllVoices();
            } 
            else if (rowData && rowData.note !== '---') {
                track.stopAllVoices(); 

                if (!shouldBeSilent) {
                    const voice = this.audioEngine.playNote(
                        rowData.note, 
                        rowData.inst, 
                        rowData.vol, 
                        track.trackGain, 
                        track.waveType
                    ); 
                    if (voice) track.activeVoices.push(voice);

                    const rowElements = track.element.querySelectorAll('.tracker-row');
                    if (rowElements[index]) {
                        rowElements[index].classList.add('flash');
                        setTimeout(() => {
                            if (rowElements[index]) rowElements[index].classList.remove('flash');
                        }, 100);
                    }
                }
            }
        });

        this.updatePlayheadPosition();
        
        const maxLen = this.tracks.length > 0 
            ? Math.max(...this.tracks.map(t => t.patternData.length)) 
            : 64;

        this.currentRow = (this.currentRow + 1) % maxLen;
    }
allTracksStop() {
        const now = this.audioEngine.audioCtx.currentTime;
        this.tracks.forEach(track => {
            if (track) {
                if (typeof track.stopAllVoices === 'function') {
                    track.stopAllVoices();
                }
                if (track.trackGain && track.trackGain.gain) {
                    track.trackGain.gain.cancelScheduledValues(now);
                    track.trackGain.gain.setValueAtTime(0, now);
                    setTimeout(() => {
                        if(!this.isPlaying) track.trackGain.gain.setValueAtTime(1, this.audioEngine.audioCtx.currentTime);
                    }, 50);
                }
            }
        });
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
        if (track.midiVisualizer) {
            track.midiVisualizer.draw(track.patternData, offset);
        }
    });
}
toggleSolo(trackInstance) {
    trackInstance.isSolo = !trackInstance.isSolo;
    if (trackInstance.isSolo) {
        this.tracks.forEach(t => { if (t !== trackInstance) t.isSolo = false; });
    }
    this.updateVisualStates();
}
updateVisualStates() {
    const anySolo = this.tracks.some(t => t.isSolo);

    this.tracks.forEach(track => {
        const isSilencedBySolo = anySolo && !track.isSolo;
        const isEffectivelyMuted = track.isMuted || isSilencedBySolo;
        
        // --- LÓGICA DE OSCURIDAD (DIMMING) ---
        if (isEffectivelyMuted) {
            track.element.style.opacity = "0.8";
            track.element.style.filter = "grayscale(0.8) brightness(0.5)";
            track.element.classList.add('track-silenced');
        } else {
            track.element.style.opacity = "1";
            track.element.style.filter = "none";
            track.element.classList.remove('track-silenced');
        }

        // --- LÓGICA DEL GLOW (BRILLO) ---
        // Si la pista está activa, le devolvemos su resplandor de color
        const trackColor = track.color;
        if (!isEffectivelyMuted) {
            track.element.style.boxShadow = `0 0 15px rgba(${this.hexToRgb(trackColor)}, 0.2)`;
        } else {
            track.element.style.boxShadow = "none";
        }

        // Actualizar colores de los botones Mute/Solo
        const muteBtn = track.element.querySelector('.mute-btn');
        const soloBtn = track.element.querySelector('.solo-btn');
        
        if (muteBtn) {
            muteBtn.style.backgroundColor = track.isMuted ? "#ff4444" : "#444";
            muteBtn.style.boxShadow = track.isMuted ? "0 0 10px #ff4444" : "none";
        }
        if (soloBtn) {
            soloBtn.style.backgroundColor = track.isSolo ? "#ffcc00" : "#444";
            soloBtn.style.color = track.isSolo ? "#000" : "#fff";
            soloBtn.style.boxShadow = track.isSolo ? "0 0 10px #ffcc00" : "none";
        }
    });
}
hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? 
        `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` 
        : "255, 255, 255";
}
exportProject() {
    const projectData = {
        version: "0.8.5",
        bpm: this.bpm,
        tracks: this.tracks.map(t => ({
            id: t.id,
            name: t.element.querySelector('.track-name').textContent, // Guardamos nombre
            color: t.color,
            waveType: t.waveType,
            patternData: t.patternData
        }))
    };
    const blob = new Blob([JSON.stringify(projectData)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `project_v085_${Date.now()}.osc`;
    a.click();
}
importProject(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const data = JSON.parse(e.target.result);
        document.getElementById('rackBody').innerHTML = '';
        this.tracks = [];
        this.bpm = data.bpm;
        if(this.bpmInput) this.bpmInput.value = this.bpm;
        
        data.tracks.forEach(tData => {
            const track = new Track(tData.id, this, tData.color);
            track.render(document.getElementById('rackBody'));
            
            const nameEl = track.element.querySelector('.track-name');
            if (nameEl) nameEl.textContent = tData.name || `TRACK ${tData.id + 1}`;
            
            track.waveType = tData.waveType;
            const waveSelect = track.element.querySelector('.wave-type-select');
            if (waveSelect) waveSelect.value = tData.waveType;
            
            track.patternData = tData.patternData;
            track.initGrid();

            track.patternData.forEach((row, idx) => {
                if (row.note === '===') track.updateNoteCell(idx, '===');
            });
            
            this.tracks.push(track);
        });
    };
    reader.readAsText(file);
}
updateMasterVu() {
        const data = new Uint8Array(this.audioEngine.masterAnalyser.frequencyBinCount);
        this.audioEngine.masterAnalyser.getByteFrequencyData(data);
        
        const average = data.reduce((a, b) => a + b, 0) / data.length;
        const vuFill = document.getElementById('masterVuFill');
        if (vuFill) {

        const volumeWidth = Math.min(average * 2, 100); 
        vuFill.style.width = `${volumeWidth}%`;
        }
        requestAnimationFrame(() => this.updateMasterVu());
    }
} // FIN.
