class PianoRoll {
    constructor(appController) {
        this.app = appController;
        this.track = null;
        this.previewVoice = null;
        
        this.modal = document.getElementById('pianoRollModal');
        this.gridCanvas = document.getElementById('pianoGridCanvas');
        this.keysCanvas = document.getElementById('pianoKeysCanvas');
        this.ctx = this.gridCanvas.getContext('2d');
        this.keysCtx = this.keysCanvas.getContext('2d');
        
        // Configuración visual estable
        this.rowWidth = 40;  
        this.keyHeight = 22; // Un poco más alto para facilitar el click
        this.totalKeys = 84; // 7 octavas completas
        this.offsetMidi = 24; // Empezamos en C1
        
        // Evento cerrar con prevención de propagación
        document.getElementById('closePrBtn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.close();
        });
        
        this.gridCanvas.addEventListener('mousedown', (e) => this.handleGridClick(e));
    }

    open(trackInstance) {
        if (!trackInstance) return;
        this.track = trackInstance;
        
        // Mostrar modal
        this.modal.classList.remove('hidden');
        this.modal.style.display = 'flex'; // Asegura que se vea

        const header = document.getElementById('prTrackName');
        if (header) {
            header.textContent = `EDITANDO: ${trackInstance.element.querySelector('.track-name').textContent}`;
            header.style.color = trackInstance.color;
        }

        this.totalRows = this.track.patternData.length;
        
        // Ajustar dimensiones
        this.gridCanvas.width = this.totalRows * this.rowWidth;
        this.gridCanvas.height = this.totalKeys * this.keyHeight;
        this.keysCanvas.height = this.gridCanvas.height;
        this.keysCanvas.width = 60;

        this.drawKeys();
        this.drawGrid();
        
        // Scroll automático a C4 (Midi 60)
        const c4Position = (this.totalKeys - (60 - this.offsetMidi)) * this.keyHeight;
        this.gridCanvas.parentElement.scrollTop = c4Position - 150;
    }

    close() {
        this.stopPreview();
        this.modal.classList.add('hidden');
        this.modal.style.display = 'none';
        this.track = null;
        if (this.app) this.app.updateVisualStates(); 
    }

    stopPreview() {
        if (this.previewVoice) {
            if (typeof this.previewVoice.stop === 'function') {
                this.previewVoice.stop();
            }
            this.previewVoice = null;
        }
    }

    drawKeys() {
        const notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
        this.keysCtx.clearRect(0, 0, this.keysCanvas.width, this.keysCanvas.height);

        for (let i = 0; i < this.totalKeys; i++) {
            const midi = i + this.offsetMidi;
            const noteIndex = midi % 12;
            const octave = Math.floor(midi / 12) - 1;
            const isBlack = [1, 3, 6, 8, 10].includes(noteIndex);
            const y = this.gridCanvas.height - ((i + 1) * this.keyHeight);

            this.keysCtx.fillStyle = isBlack ? "#1a1a1a" : "#ffffff";
            this.keysCtx.strokeStyle = "#444";
            this.keysCtx.fillRect(0, y, 60, this.keyHeight);
            this.keysCtx.strokeRect(0, y, 60, this.keyHeight);
            
            this.keysCtx.fillStyle = isBlack ? "#777" : "#333";
            this.keysCtx.font = "bold 11px Arial";
            this.keysCtx.fillText(`${notes[noteIndex]}${octave}`, 5, y + this.keyHeight - 7);
        }
    }

    drawGrid() {
        if (!this.track) return;
        this.ctx.clearRect(0, 0, this.gridCanvas.width, this.gridCanvas.height);
        this.ctx.fillStyle = "#111";
        this.ctx.fillRect(0, 0, this.gridCanvas.width, this.gridCanvas.height);

        // Fondo de teclas negras en el grid
        for (let i = 0; i < this.totalKeys; i++) {
            const isBlack = [1, 3, 6, 8, 10].includes((i + this.offsetMidi) % 12);
            if (isBlack) {
                const y = this.gridCanvas.height - ((i + 1) * this.keyHeight);
                this.ctx.fillStyle = "#161616";
                this.ctx.fillRect(0, y, this.gridCanvas.width, this.keyHeight);
            }
        }

        // Líneas
        this.ctx.strokeStyle = "#222";
        this.ctx.lineWidth = 1;
        for (let r = 0; r <= this.totalRows; r++) {
            const x = r * this.rowWidth;
            if (r % 4 === 0) { this.ctx.strokeStyle = "#333"; this.ctx.lineWidth = 2; }
            else { this.ctx.strokeStyle = "#222"; this.ctx.lineWidth = 1; }
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.gridCanvas.height);
            this.ctx.stroke();
        }

        // Dibujar notas grabadas
        this.track.patternData.forEach((row, rowIndex) => {
            if (row.note !== '---' && row.note !== '===') {
                const midi = this.app.audioEngine.getMidiNumber(row.note);
                const i = midi - this.offsetMidi;
                if (i >= 0 && i < this.totalKeys) {
                    const x = rowIndex * this.rowWidth;
                    const y = this.gridCanvas.height - ((i + 1) * this.keyHeight);
                    this.ctx.fillStyle = this.track.color;
                    this.ctx.shadowBlur = 8;
                    this.ctx.shadowColor = this.track.color;
                    this.ctx.fillRect(x + 2, y + 2, this.rowWidth - 4, this.keyHeight - 4);
                    this.ctx.shadowBlur = 0;
                }
            }
        });

        if (this.app.isPlaying) {
            const playX = (this.app.currentRow % this.totalRows) * this.rowWidth;
            this.ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
            this.ctx.fillRect(playX, 0, this.rowWidth, this.gridCanvas.height);
            requestAnimationFrame(() => this.drawGrid());
        }
    }

    handleGridClick(e) {
        const rect = this.gridCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const rowIndex = Math.floor(x / this.rowWidth);
        const i = Math.floor((this.gridCanvas.height - y) / this.keyHeight);
        
        if (rowIndex >= 0 && rowIndex < this.totalRows && i >= 0 && i < this.totalKeys) {
            const midiNote = i + this.offsetMidi;
            const noteName = this.midiToNoteName(midiNote);
            
            this.stopPreview();

            if (this.track.patternData[rowIndex].note === noteName) {
                this.track.updateNoteCell(rowIndex, '---');
                this.track.updateVolCell(rowIndex, '--');
            } else {
                this.track.updateNoteCell(rowIndex, noteName);
                this.track.updateVolCell(rowIndex, '64');
                
                // Sonido guía con auto-stop
                this.previewVoice = this.app.audioEngine.playNote(
                    noteName, '01', '40', this.track.trackGain, this.track.waveType
                );
                setTimeout(() => this.stopPreview(), 400);
            }
            this.drawGrid();
        }
    }

    midiToNoteName(midi) {
        const notes = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
        const octave = Math.floor(midi / 12) - 1;
        return notes[midi % 12] + octave;
    }
}
