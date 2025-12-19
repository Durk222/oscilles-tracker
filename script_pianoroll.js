class PianoRoll {
    constructor(appController) {
        this.app = appController;
        this.track = null;
        this.previewVoice = null; // Para la solución anti-migraña
        
        this.modal = document.getElementById('pianoRollModal');
        this.gridCanvas = document.getElementById('pianoGridCanvas');
        this.keysCanvas = document.getElementById('pianoKeysCanvas');
        this.ctx = this.gridCanvas.getContext('2d');
        this.keysCtx = this.keysCanvas.getContext('2d');
        
        // --- CONFIGURACIÓN VISUAL MEJORADA ---
        this.rowWidth = 40;  // Más ancho para mejor visibilidad
        this.keyHeight = 20; // Más alto para que quepa el texto
        this.numOctaves = 7; 
        this.startOctave = 1;
        
        document.getElementById('closePrBtn').addEventListener('click', () => this.close());
        
        this.gridCanvas.addEventListener('mousedown', (e) => this.handleGridClick(e));
    }

    open(trackInstance) {
        this.track = trackInstance;
        this.modal.classList.remove('hidden');
        
        const header = document.getElementById('prTrackName');
        header.textContent = `EDITANDO: ${trackInstance.element.querySelector('.track-name').textContent}`;
        header.style.color = trackInstance.color;

        this.totalRows = this.track.patternData.length;
        this.totalKeys = 12 * this.numOctaves;
        
        // Ajustar dimensiones del lienzo
        this.gridCanvas.width = this.totalRows * this.rowWidth;
        this.gridCanvas.height = this.totalKeys * this.keyHeight;
        this.keysCanvas.height = this.totalKeys * this.keyHeight;
        this.keysCanvas.width = 60; // Un poco más ancho para el texto

        this.drawKeys();
        this.drawGrid();
        
        // Centrar en la Octava 4 al abrir
        const octave4Y = this.gridCanvas.height - ((4 * 12) * this.keyHeight);
        this.gridCanvas.parentElement.scrollTop = octave4Y - 150;
    }

    close() {
        this.stopPreview(); // Parar cualquier sonido al cerrar
        this.modal.classList.add('hidden');
        this.track = null;
        this.app.updateVisualStates(); 
    }

    stopPreview() {
        if (this.previewVoice) {
            this.previewVoice.stop();
            this.previewVoice = null;
        }
    }

    drawKeys() {
        const notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
        this.keysCtx.clearRect(0, 0, this.keysCanvas.width, this.keysCanvas.height);

        for (let i = 0; i < this.totalKeys; i++) {
            const y = this.keysCanvas.height - ((i + 1) * this.keyHeight);
            const noteIndex = i % 12;
            const octave = Math.floor(i / 12) + this.startOctave;
            const isBlack = [1, 3, 6, 8, 10].includes(noteIndex);

            // Dibujar Tecla
            this.keysCtx.fillStyle = isBlack ? "#1a1a1a" : "#ffffff";
            this.keysCtx.strokeStyle = "#555";
            this.keysCtx.fillRect(0, y, 60, this.keyHeight);
            this.keysCtx.strokeRect(0, y, 60, this.keyHeight);
            
            // Dibujar Texto de la nota (Más visible)
            this.keysCtx.fillStyle = isBlack ? "#888" : "#333";
            this.keysCtx.font = "bold 10px Arial";
            const noteName = notes[noteIndex].replace('-', '') + octave;
            this.keysCtx.fillText(noteName, 5, y + this.keyHeight - 5);
        }
    }

    drawGrid() {
        this.ctx.fillStyle = "#111";
        this.ctx.fillRect(0, 0, this.gridCanvas.width, this.gridCanvas.height);

        // Dibujar fondo de filas (cebras para notas negras)
        for (let i = 0; i < this.totalKeys; i++) {
            const y = this.gridCanvas.height - ((i + 1) * this.keyHeight);
            const isBlack = [1, 3, 6, 8, 10].includes(i % 12);
            if (isBlack) {
                this.ctx.fillStyle = "#181818";
                this.ctx.fillRect(0, y, this.gridCanvas.width, this.keyHeight);
            }
        }

        // Líneas Verticales (Tiempo)
        for (let r = 0; r <= this.totalRows; r++) {
            const x = r * this.rowWidth;
            this.ctx.beginPath();
            this.ctx.strokeStyle = (r % 4 === 0) ? "#444" : "#222";
            this.ctx.lineWidth = (r % 4 === 0) ? 2 : 1;
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.gridCanvas.height);
            this.ctx.stroke();
        }

        // Líneas Horizontales (Notas)
        this.ctx.lineWidth = 1;
        for (let i = 0; i <= this.totalKeys; i++) {
            const y = i * this.keyHeight;
            this.ctx.beginPath();
            this.ctx.strokeStyle = "#222";
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.gridCanvas.width, y);
            this.ctx.stroke();
        }

        // Dibujar Notas
        this.track.patternData.forEach((row, rowIndex) => {
            if (row.note !== '---' && row.note !== '===') {
                const midiVal = this.app.audioEngine.getMidiNumber(row.note);
                const keyIndex = midiVal - (this.startOctave + 1) * 12; 
                
                if (keyIndex >= 0 && keyIndex < this.totalKeys) {
                    const x = rowIndex * this.rowWidth;
                    const y = this.gridCanvas.height - ((keyIndex + 1) * this.keyHeight);
                    
                    // Cuerpo de la nota
                    this.ctx.fillStyle = this.track.color;
                    this.ctx.fillRect(x + 2, y + 2, this.rowWidth - 4, this.keyHeight - 4);
                    
                    // Brillo estético
                    this.ctx.fillStyle = "rgba(255,255,255,0.3)";
                    this.ctx.fillRect(x + 2, y + 2, this.rowWidth - 4, 4);
                }
            }
        });

        // Cabezal de reproducción
        if (this.app.isPlaying) {
            const playX = this.app.currentRow * this.rowWidth;
            this.ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
            this.ctx.fillRect(playX, 0, this.rowWidth, this.gridCanvas.height);
            requestAnimationFrame(() => this.drawGrid());
        }
    }

    handleGridClick(e) {
        const rect = this.gridCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const rowIndex = Math.floor(x / this.rowWidth);
        const clickedYFromBottom = this.gridCanvas.height - y;
        const keyIndex = Math.floor(clickedYFromBottom / this.keyHeight);
        
        if (rowIndex >= 0 && rowIndex < this.totalRows && keyIndex >= 0 && keyIndex < this.totalKeys) {
            const midiNote = keyIndex + (this.startOctave + 1) * 12;
            const noteName = this.midiToNoteName(midiNote);
            
            const currentNote = this.track.patternData[rowIndex].note;
            
            // Parar sonido anterior si existe
            this.stopPreview();

            if (currentNote === noteName) {
                this.track.updateNoteCell(rowIndex, '---');
                this.track.updateVolCell(rowIndex, '--');
            } else {
                this.track.updateNoteCell(rowIndex, noteName);
                this.track.updateVolCell(rowIndex, '64');
                
                // --- SOLUCIÓN ANTI MIGRANIA ---
                // Tocamos la nota y guardamos la referencia para pararla
                this.previewVoice = this.app.audioEngine.playNote(
                    noteName, '01', '40', this.track.trackGain, this.track.waveType
                );
                
                // Auto-parado después de 500ms
                setTimeout(() => this.stopPreview(), 500);
            }
            this.drawGrid();
        }
    }

    midiToNoteName(midi) {
        const notes = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
        const octave = Math.floor(midi / 12) - 1;
        const noteIndex = midi % 12;
        return notes[noteIndex] + octave;
    }
}
