class PianoRoll {
    constructor(appController) {
        this.app = appController;
        this.track = null; // La pista que estamos editando
        
        this.modal = document.getElementById('pianoRollModal');
        this.gridCanvas = document.getElementById('pianoGridCanvas');
        this.keysCanvas = document.getElementById('pianoKeysCanvas');
        this.ctx = this.gridCanvas.getContext('2d');
        this.keysCtx = this.keysCanvas.getContext('2d');
        
        // Configuración visual
        this.rowWidth = 30;  // Ancho de cada fila (tiempo)
        this.keyHeight = 12; // Alto de cada nota
        this.numOctaves = 8; 
        this.startOctave = 1;
        
        // Eventos de la ventana
        document.getElementById('closePrBtn').addEventListener('click', () => this.close());
        
        // Eventos del Mouse en el Grid
        this.gridCanvas.addEventListener('mousedown', (e) => this.handleGridClick(e));
    }

    open(trackInstance) {
        this.track = trackInstance;
        this.modal.classList.remove('hidden');
        document.getElementById('prTrackName').textContent = `EDITANDO: TRACK ${trackInstance.id} (Color: ${trackInstance.color})`;
        document.getElementById('prTrackName').style.color = trackInstance.color;

        // Ajustamos tamaño del canvas
        this.totalRows = this.track.patternData.length;
        this.totalKeys = 12 * this.numOctaves;
        
        this.gridCanvas.width = this.totalRows * this.rowWidth;
        this.gridCanvas.height = this.totalKeys * this.keyHeight;
        this.keysCanvas.height = this.totalKeys * this.keyHeight;

        this.drawKeys();
        this.drawGrid();
        
        // Scrollear para ver octava 4 (centro)
        const middleY = (this.totalKeys * this.keyHeight) / 2;
        this.gridCanvas.parentElement.scrollTop = middleY - 200;
    }

    close() {
        this.modal.classList.add('hidden');
        this.track = null;
        // Actualizamos la vista del tracker normal al salir
        this.app.updateVisualStates(); 
    }

    drawKeys() {
        const notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
        this.keysCtx.fillStyle = "#000";
        this.keysCtx.fillRect(0, 0, 40, this.keysCanvas.height);

        for (let i = 0; i < this.totalKeys; i++) {
            const y = this.keysCanvas.height - ((i + 1) * this.keyHeight);
            const noteIndex = i % 12;
            const octave = Math.floor(i / 12) + this.startOctave;
            const isBlack = [1, 3, 6, 8, 10].includes(noteIndex);

            // Dibujar tecla
            this.keysCtx.fillStyle = isBlack ? "#333" : "#eee";
            this.keysCtx.fillRect(0, y, 40, this.keyHeight - 1);
            
            // Texto (solo en notas C)
            if (noteIndex === 0) {
                this.keysCtx.fillStyle = isBlack ? "#fff" : "#000";
                this.keysCtx.font = "10px monospace";
                this.keysCtx.fillText(`C${octave}`, 5, y + 10);
            }
        }
    }

    drawGrid() {
        // Fondo
        this.ctx.fillStyle = "#111";
        this.ctx.fillRect(0, 0, this.gridCanvas.width, this.gridCanvas.height);

        // Líneas de filas (Verticales) - Tiempo
        for (let r = 0; r <= this.totalRows; r++) {
            const x = r * this.rowWidth;
            this.ctx.beginPath();
            this.ctx.strokeStyle = (r % 4 === 0) ? "#444" : "#222"; // Resaltar cada beat
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.gridCanvas.height);
            this.ctx.stroke();
            
            // Número de fila
            if (r < this.totalRows) {
                this.ctx.fillStyle = "#666";
                this.ctx.font = "10px monospace";
                this.ctx.fillText(r, x + 2, 10);
            }
        }

        // Líneas de notas (Horizontales) - Altura
        for (let i = 0; i < this.totalKeys; i++) {
            const y = this.keysCanvas.height - ((i + 1) * this.keyHeight);
            const noteIndex = i % 12;
            // Línea más oscura para teclas negras
            const isBlack = [1, 3, 6, 8, 10].includes(noteIndex);
            
            this.ctx.fillStyle = isBlack ? "#161616" : "#1a1a1a";
            this.ctx.fillRect(0, y, this.gridCanvas.width, this.keyHeight);
            
            this.ctx.beginPath();
            this.ctx.strokeStyle = "#222";
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.gridCanvas.width, y);
            this.ctx.stroke();
        }

        // --- DIBUJAR NOTAS EXISTENTES ---
        this.track.patternData.forEach((row, rowIndex) => {
            if (row.note !== '---' && row.note !== '===') {
                const midiVal = this.app.audioEngine.getMidiNumber(row.note);
                // Convertir MIDI a coordenada Y (invertida porque canvas Y crece hacia abajo)
                // Restamos el offset de la octava inicial (Midi 24 = C1)
                const keyIndex = midiVal - 24; 
                
                if (keyIndex >= 0 && keyIndex < this.totalKeys) {
                    const x = rowIndex * this.rowWidth;
                    const y = this.gridCanvas.height - ((keyIndex + 1) * this.keyHeight);
                    
                    // Dibujar rectángulo de nota
                    this.ctx.fillStyle = this.track.color;
                    this.ctx.fillRect(x + 1, y + 1, this.rowWidth - 2, this.keyHeight - 2);
                    
                    // Brillo
                    this.ctx.shadowColor = this.track.color;
                    this.ctx.shadowBlur = 10;
                    this.ctx.shadowBlur = 0;
                }
            }
        });
        
        // Dibujar cabezal de reproducción si está sonando
        if (this.app.isPlaying) {
            const playX = this.app.currentRow * this.rowWidth;
            this.ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
            this.ctx.fillRect(playX, 0, this.rowWidth, this.gridCanvas.height);
        }
        
        // Loop visual si está reproduciendo
        if(this.app.isPlaying) {
             requestAnimationFrame(() => this.drawGrid());
        }
    }

    handleGridClick(e) {
        const rect = this.gridCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Calcular fila y nota
        const rowIndex = Math.floor(x / this.rowWidth);
        
        // Invertir lógica Y para obtener índice de nota
        const clickedYFromBottom = this.gridCanvas.height - y;
        const keyIndex = Math.floor(clickedYFromBottom / this.keyHeight);
        
        if (rowIndex >= 0 && rowIndex < this.totalRows && keyIndex >= 0 && keyIndex < this.totalKeys) {
            const midiNote = keyIndex + 24; // +24 porque empezamos en Octava 1 (Midi 24)
            const noteName = this.midiToNoteName(midiNote);
            
            // Lógica: Si ya existe esa nota, borrar. Si no, poner.
            const currentNote = this.track.patternData[rowIndex].note;
            
            if (currentNote === noteName) {
                // Borrar
                this.track.updateNoteCell(rowIndex, '---');
                this.track.updateVolCell(rowIndex, '--');
            } else {
                // Poner
                this.track.updateNoteCell(rowIndex, noteName);
                this.track.updateVolCell(rowIndex, '64');
                // Preview sonido
                this.app.audioEngine.playNote(noteName, '01', '64', this.track.trackGain, this.track.waveType);
            }
            this.drawGrid(); // Redibujar
        }
    }

    midiToNoteName(midi) {
        const notes = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
        const octave = Math.floor(midi / 12) - 1;
        const noteIndex = midi % 12;
        return notes[noteIndex] + octave;
    }
}
