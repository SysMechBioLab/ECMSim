class ECMVisualizer {
    constructor() {
        this.gridSize = 100;
        this.currentMoleculeIndex = 0; // proCI by default
        this.simulationRunning = false;
        this.iteration = 0;
        this.dataBuffer = null;
        this.timeStep = 0.1; // Default time step for ODE integration
        this.smallGridSize = 5; // Size of the small heatmap grid
        this.selectedCells = []; // Will store randomly selected cell positions
        
        // Track modified values for selected cells
        this.modifiedCellValues = {};
        
        // Brush selection properties
        this.brushMode = false;
        this.brushSize = 5; // Brush radius in cells
        this.selectedCellsForInput = new Set(); // Stores "row,col" strings of selected cells
        this.isMouseDown = false;
        this.lastMousePos = null;
        
        // Define molecule mappings
        this.ecmMolecules = [
            {name: 'proCI', index: 0},
            {name: 'proCIII', index: 1},
            {name: 'fibronectin', index: 2},
            {name: 'periostin', index: 3},
            {name: 'TNC', index: 4},
            {name: 'PAI1', index: 5},
            {name: 'CTGF', index: 6},
            {name: 'EDAFN', index: 7},
            {name: 'TIMP1', index: 8},
            {name: 'TIMP2', index: 9},
            {name: 'proMMP1', index: 10},
            {name: 'proMMP2', index: 11},
            {name: 'proMMP3', index: 12},
            {name: 'proMMP8', index: 13},
            {name: 'proMMP9', index: 14},
            {name: 'proMMP12', index: 15},
            {name: 'proMMP14', index: 16}
        ];
        
        this.fbMolecules = [
            {name: 'TGFBfb', index: 0},
            {name: 'AngIIfb', index: 1},
            {name: 'IL6fb', index: 2},
            {name: 'ET1fb', index: 3},
        ];
        
        this.inputMolecules = [
            {name: 'AngIIin', index: 0},
            {name: 'TGFBin', index: 1},
            {name: 'IL6in', index: 3},
            {name: 'IL1in', index: 4},
            {name: 'TNFain', index: 5},
            {name: 'NEin', index: 6},
            {name: 'PDGFin', index: 7},
            {name: 'ET1in', index: 8},
            {name: 'NPin', index: 9},
            {name: 'E2in', index: 10}
        ];
        
        // Rate constants with defaults
        this.rateConstants = {
            k_input: 1.0,
            k_feedback: 0.5,
            k_degradation: 0.1,
            k_receptor: 2.0,
            k_inhibition: 0.5,
            k_activation: 1.0,
            k_production: 0.01,
            k_diffusion: 0.2
        };
        
        // Store current input values for selected cells
        this.currentInputValues = {};
        this.inputMolecules.forEach(mol => {
            this.currentInputValues[mol.name] = 0;
        });
        
        // Initialize UI
        this.initUI();
        this.initCanvas();
        this.initSmallCanvas();
        
        // Connect to WebAssembly module
        this.initWasm();
    }
    
    initUI() {
        // Create molecule selector
        const selector = document.createElement('select');
        selector.id = 'molecule-selector';
        
        const addOptions = (groupName, molecules) => {
            const group = document.createElement('optgroup');
            group.label = groupName;
            molecules.forEach(mol => {
                const option = document.createElement('option');
                option.value = mol.index;
                option.textContent = mol.name;
                group.appendChild(option);
            });
            selector.appendChild(group);
        };
        
        addOptions('ECM Molecules', this.ecmMolecules);
        addOptions('Feedback Molecules', this.fbMolecules);
        selector.value = this.currentMoleculeIndex;
        selector.addEventListener('change', (e) => {
            this.currentMoleculeIndex = parseInt(e.target.value);
            this.updateVisualization();
            this.updateCellEditUI();
        });
        
        document.body.appendChild(selector);
        
        // Create brush selection controls
        const brushContainer = document.createElement('div');
        brushContainer.id = 'brush-controls';
        brushContainer.style.border = '2px solid #007acc';
        brushContainer.style.padding = '10px';
        brushContainer.style.margin = '10px 0';
        brushContainer.style.backgroundColor = '#f0f8ff';
        
        const brushTitle = document.createElement('h3');
        brushTitle.textContent = 'Brush Selection Tool';
        brushTitle.style.margin = '0 0 10px 0';
        brushContainer.appendChild(brushTitle);
        
        // Brush mode toggle
        const brushToggle = document.createElement('button');
        brushToggle.id = 'brush-toggle';
        brushToggle.textContent = 'Enable Brush Mode';
        brushToggle.style.marginRight = '10px';
        brushToggle.addEventListener('click', () => this.toggleBrushMode());
        brushContainer.appendChild(brushToggle);
        
        // Clear selection button
        const clearSelection = document.createElement('button');
        clearSelection.textContent = 'Clear Selection';
        clearSelection.style.marginRight = '10px';
        clearSelection.addEventListener('click', () => this.clearBrushSelection());
        brushContainer.appendChild(clearSelection);
        
        // Brush size control
        const brushSizeContainer = document.createElement('div');
        brushSizeContainer.style.display = 'inline-block';
        brushSizeContainer.style.marginLeft = '10px';
        
        const brushSizeLabel = document.createElement('label');
        brushSizeLabel.textContent = 'Brush Size: ';
        brushSizeLabel.htmlFor = 'brush-size';
        
        const brushSizeInput = document.createElement('input');
        brushSizeInput.type = 'range';
        brushSizeInput.id = 'brush-size';
        brushSizeInput.min = '1';
        brushSizeInput.max = '15';
        brushSizeInput.value = this.brushSize.toString();
        brushSizeInput.style.width = '100px';
        
        const brushSizeDisplay = document.createElement('span');
        brushSizeDisplay.textContent = this.brushSize.toString();
        brushSizeDisplay.style.marginLeft = '5px';
        
        brushSizeInput.addEventListener('input', (e) => {
            this.brushSize = parseInt(e.target.value);
            brushSizeDisplay.textContent = this.brushSize.toString();
        });
        
        brushSizeContainer.appendChild(brushSizeLabel);
        brushSizeContainer.appendChild(brushSizeInput);
        brushSizeContainer.appendChild(brushSizeDisplay);
        brushContainer.appendChild(brushSizeContainer);
        
        // Selected cells count display
        const selectionInfo = document.createElement('div');
        selectionInfo.id = 'selection-info';
        selectionInfo.style.marginTop = '10px';
        selectionInfo.style.fontStyle = 'italic';
        selectionInfo.textContent = 'No cells selected';
        brushContainer.appendChild(selectionInfo);
        
        document.body.appendChild(brushContainer);
        
        // Create input molecule controls
        const inputContainer = document.createElement('div');
        inputContainer.id = 'input-controls';
        inputContainer.style.border = '1px solid #ccc';
        inputContainer.style.padding = '10px';
        inputContainer.style.margin = '10px 0';
        
        const inputTitle = document.createElement('h3');
        inputTitle.textContent = 'Input Molecule Concentrations (for selected cells)';
        inputTitle.style.margin = '0 0 10px 0';
        inputContainer.appendChild(inputTitle);
        
        const inputNote = document.createElement('div');
        inputNote.textContent = 'Note: These values will be applied only to brush-selected cells. Unselected cells use default values (0).';
        inputNote.style.fontSize = '12px';
        inputNote.style.color = '#666';
        inputNote.style.marginBottom = '10px';
        inputContainer.appendChild(inputNote);
        
        this.inputMolecules.forEach(mol => {
            const div = document.createElement('div');
            div.className = 'input-control';
            
            const label = document.createElement('label');
            label.textContent = mol.name;
            label.htmlFor = `input-${mol.name}`;
            
            const input = document.createElement('input');
            input.type = 'range';
            input.id = `input-${mol.name}`;
            input.min = '0';
            input.max = '1';
            input.step = '0.01';
            input.value = '0';
            
            const valueDisplay = document.createElement('span');
            valueDisplay.className = 'value-display';
            valueDisplay.textContent = '0.00';
            valueDisplay.style.marginLeft = '10px';
            valueDisplay.style.width = '40px';
            valueDisplay.style.display = 'inline-block';
            
            input.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                valueDisplay.textContent = value.toFixed(2);
                this.currentInputValues[mol.name] = value;
                this.applyInputToSelectedCells();
            });
            
            div.appendChild(label);
            div.appendChild(input);
            div.appendChild(valueDisplay);
            inputContainer.appendChild(div);
        });
        
        document.body.appendChild(inputContainer);
        
        // Create ODE parameter controls
        const odeContainer = document.createElement('div');
        odeContainer.id = 'ode-controls';
        odeContainer.innerHTML = '<h3>ODE Parameters</h3>';
        
        // Create time step control
        const timeStepDiv = document.createElement('div');
        timeStepDiv.className = 'ode-param';
        
        const timeStepLabel = document.createElement('label');
        timeStepLabel.textContent = 'Time Step';
        timeStepLabel.htmlFor = 'time-step';
        
        const timeStepInput = document.createElement('input');
        timeStepInput.type = 'range';
        timeStepInput.id = 'time-step';
        timeStepInput.min = '0.01';
        timeStepInput.max = '0.5';
        timeStepInput.step = '0.01';
        timeStepInput.value = this.timeStep.toString();
        
        const timeStepDisplay = document.createElement('span');
        timeStepDisplay.textContent = this.timeStep.toFixed(2);
        timeStepDisplay.style.marginLeft = '10px';
        
        timeStepInput.addEventListener('input', (e) => {
            this.timeStep = parseFloat(e.target.value);
            timeStepDisplay.textContent = this.timeStep.toFixed(2);
            if (this.wasm) {
                this.wasm._setTimeStep(this.timeStep);
            }
        });
        
        timeStepDiv.appendChild(timeStepLabel);
        timeStepDiv.appendChild(timeStepInput);
        timeStepDiv.appendChild(timeStepDisplay);
        odeContainer.appendChild(timeStepDiv);
        
        // Add rate constant controls
        const rateParams = [
            { id: 'k_input', name: 'Input Rate', min: 0.1, max: 5.0, default: this.rateConstants.k_input },
            { id: 'k_feedback', name: 'Feedback Rate', min: 0.1, max: 5.0, default: this.rateConstants.k_feedback },
            { id: 'k_degradation', name: 'Degradation Rate', min: 0.01, max: 1.0, default: this.rateConstants.k_degradation },
            { id: 'k_receptor', name: 'Receptor Rate', min: 0.1, max: 5.0, default: this.rateConstants.k_receptor },
            { id: 'k_inhibition', name: 'Inhibition Rate', min: 0.1, max: 5.0, default: this.rateConstants.k_inhibition },
            { id: 'k_activation', name: 'Activation Rate', min: 0.1, max: 5.0, default: this.rateConstants.k_activation },
            { id: 'k_production', name: 'Production Rate', min: 0.001, max: 0.1, default: this.rateConstants.k_production },
            { id: 'k_diffusion', name: 'Diffusion Rate', min: 0.01, max: 1.0, default: this.rateConstants.k_diffusion }
        ];
        
        rateParams.forEach(param => {
            const div = document.createElement('div');
            div.className = 'ode-param';
            
            const label = document.createElement('label');
            label.textContent = param.name;
            label.htmlFor = param.id;
            
            const input = document.createElement('input');
            input.type = 'range';
            input.id = param.id;
            input.min = param.min.toString();
            input.max = param.max.toString();
            input.step = ((param.max - param.min) / 100).toString();
            input.value = param.default.toString();
            
            const display = document.createElement('span');
            display.textContent = param.default.toFixed(4);
            display.style.marginLeft = '10px';
            
            input.addEventListener('input', (e) => {
                this.rateConstants[param.id] = parseFloat(e.target.value);
                display.textContent = this.rateConstants[param.id].toFixed(4);
                this.updateRateConstants();
            });
            
            div.appendChild(label);
            div.appendChild(input);
            div.appendChild(display);
            odeContainer.appendChild(div);
        });
        
        // Hide ODE controls initially
        odeContainer.style.display = 'none';
        
        // Add button to toggle ODE controls
        const toggleButton = document.createElement('button');
        toggleButton.textContent = 'Show ODE Parameters';
        toggleButton.addEventListener('click', () => {
            if (odeContainer.style.display === 'none') {
                odeContainer.style.display = 'block';
                toggleButton.textContent = 'Hide ODE Parameters';
            } else {
                odeContainer.style.display = 'none';
                toggleButton.textContent = 'Show ODE Parameters';
            }
        });
        
        document.body.appendChild(toggleButton);
        document.body.appendChild(odeContainer);
        
        // Create simulation controls
        const controls = document.createElement('div');
        controls.id = 'simulation-controls';
        
        const startButton = document.createElement('button');
        startButton.textContent = 'Start';
        startButton.addEventListener('click', () => this.startSimulation());
        
        const stopButton = document.createElement('button');
        stopButton.textContent = 'Stop';
        stopButton.addEventListener('click', () => this.stopSimulation());
        
        const stepButton = document.createElement('button');
        stepButton.textContent = 'Step';
        stepButton.addEventListener('click', () => this.stepSimulation());
        
        const resetButton = document.createElement('button');
        resetButton.textContent = 'Reset';
        resetButton.addEventListener('click', () => this.resetSimulation());
        
        controls.appendChild(startButton);
        controls.appendChild(stopButton);
        controls.appendChild(stepButton);
        controls.appendChild(resetButton);
        document.body.appendChild(controls);
    }
    
    // Modified canvas initialization with mouse event handlers
    initCanvas() {
        this.canvas = document.createElement('canvas');
        this.canvas.width = 500;
        this.canvas.height = 500;
        this.ctx = this.canvas.getContext('2d');
        this.canvas.style.cursor = 'crosshair';
        
        // Add mouse event listeners for brush selection
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('mouseleave', (e) => this.handleMouseUp(e));
        
        document.body.appendChild(this.canvas);
    }
    
    // Brush mode toggle
    toggleBrushMode() {
        this.brushMode = !this.brushMode;
        const button = document.getElementById('brush-toggle');
        
        if (this.brushMode) {
            button.textContent = 'Disable Brush Mode';
            button.style.backgroundColor = '#ff4444';
            button.style.color = 'white';
            this.canvas.style.cursor = 'crosshair';
        } else {
            button.textContent = 'Enable Brush Mode';
            button.style.backgroundColor = '';
            button.style.color = '';
            this.canvas.style.cursor = 'default';
            this.isMouseDown = false;
        }
        
        this.updateVisualization();
    }
    
    // Clear brush selection - CORRECTED
    clearBrushSelection() {
        this.selectedCellsForInput.clear();
        this.updateSelectionInfo();
        this.updateVisualization();
        
        // Use the C++ function to properly clear all input overrides
        if (this.wasm) {
            this.wasm._clearAllInputOverrides();
        }
    }
    
    // Handle mouse down for brush selection
    handleMouseDown(e) {
        if (!this.brushMode) return;
        
        this.isMouseDown = true;
        this.paintCells(e);
    }
    
    // Handle mouse move for brush selection
    handleMouseMove(e) {
        if (!this.brushMode || !this.isMouseDown) return;
        
        this.paintCells(e);
    }
    
    // Handle mouse up for brush selection
    handleMouseUp(e) {
        this.isMouseDown = false;
        this.lastMousePos = null;
        
        if (this.brushMode) {
            this.applyInputToSelectedCells();
        }
    }
    
    // Paint cells with brush
    paintCells(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Convert canvas coordinates to grid coordinates
        const scale = this.canvas.width / this.gridSize;
        const gridX = Math.floor(x / scale);
        const gridY = Math.floor(y / scale);
        
        // Paint all cells within brush radius
        for (let dy = -this.brushSize; dy <= this.brushSize; dy++) {
            for (let dx = -this.brushSize; dx <= this.brushSize; dx++) {
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance <= this.brushSize) {
                    const cellX = gridX + dx;
                    const cellY = gridY + dy;
                    
                    // Check bounds
                    if (cellX >= 0 && cellX < this.gridSize && cellY >= 0 && cellY < this.gridSize) {
                        const cellKey = `${cellY},${cellX}`;
                        this.selectedCellsForInput.add(cellKey);
                    }
                }
            }
        }
        
        this.updateSelectionInfo();
        this.updateVisualization();
    }
    
    // Update selection info display
    updateSelectionInfo() {
        const info = document.getElementById('selection-info');
        const count = this.selectedCellsForInput.size;
        info.textContent = `${count} cells selected`;
    }
    
    // CORRECTED: Apply current input values to selected cells
    applyInputToSelectedCells() {
        if (!this.wasm) return;
        
        // First, clear all input overrides to reset the system
        this.wasm._clearAllInputOverrides();
        
        // Then apply current values to selected cells using the proper C++ function
        this.selectedCellsForInput.forEach(cellKey => {
            const [row, col] = cellKey.split(',').map(Number);
            
            this.inputMolecules.forEach(mol => {
                const value = this.currentInputValues[mol.name];
                // Always set the value for selected cells, even if it's 0
                // This ensures the cell has an override and will use this specific value
                this.wasm._setCellInputConcentration(mol.index, row, col, value);
            });
        });
        
        console.log(`Applied input values to ${this.selectedCellsForInput.size} selected cells`);
    }
    
    // CORRECTED: Set input concentration for a specific cell
    setCellInputConcentration(moleculeIndex, row, col, value) {
        if (!this.wasm) return;
        
        // Use the actual C++ function instead of JavaScript workaround
        this.wasm._setCellInputConcentration(moleculeIndex, row, col, value);
    }
    
    initSmallCanvas() {
        // Create a container for the small canvas and line plots
        const container = document.createElement('div');
        container.style.marginTop = '20px';
        container.style.display = 'flex';
        container.style.gap = '20px';
        
        // Left side: small heatmap and selection controls
        const heatmapContainer = document.createElement('div');
        
        // Add a label for the small heatmap
        const label = document.createElement('div');
        label.textContent = 'Select 2 Cells to Track (Click to select/deselect)';
        label.style.fontWeight = 'bold';
        label.style.marginBottom = '10px';
        
        // Create the small canvas
        this.smallCanvas = document.createElement('canvas');
        this.smallCanvas.width = 150;
        this.smallCanvas.height = 150;
        this.smallCanvas.style.border = '1px solid #000';
        this.smallCanvas.style.cursor = 'pointer';
        this.smallCtx = this.smallCanvas.getContext('2d');
        
        // Add click handler for cell selection
        this.smallCanvas.addEventListener('click', (e) => this.handleCellSelection(e));
        
        // Add clear selection button
        const clearButton = document.createElement('button');
        clearButton.textContent = 'Clear Selection';
        clearButton.style.marginTop = '10px';
        clearButton.addEventListener('click', () => {
            this.selectedCells = [];
            this.modifiedCellValues = {}; // Clear any modified values
            this.updateCellEditUI();
            this.updateVisualization();
        });
        
        heatmapContainer.appendChild(label);
        heatmapContainer.appendChild(this.smallCanvas);
        heatmapContainer.appendChild(clearButton);
        
        // Add UI for editing selected cell concentrations
        const editContainer = document.createElement('div');
        editContainer.style.marginTop = '20px';
        editContainer.style.border = '1px solid #ccc';
        editContainer.style.padding = '10px';

        const editTitle = document.createElement('h4');
        editTitle.textContent = 'Edit Selected Cell Concentrations';
        editTitle.style.margin = '0 0 10px 0';
        editContainer.appendChild(editTitle);

        // Create UI for Cell 1
        this.cell1Container = document.createElement('div');
        this.cell1Container.style.marginBottom = '10px';
        const cell1Label = document.createElement('div');
        cell1Label.textContent = 'Cell 1: Not selected';
        cell1Label.style.fontWeight = 'bold';
        this.cell1Container.appendChild(cell1Label);

        // Create UI for Cell 2
        this.cell2Container = document.createElement('div');
        const cell2Label = document.createElement('div');
        cell2Label.textContent = 'Cell 2: Not selected';
        cell2Label.style.fontWeight = 'bold';
        this.cell2Container.appendChild(cell2Label);

        editContainer.appendChild(this.cell1Container);
        editContainer.appendChild(this.cell2Container);
        heatmapContainer.appendChild(editContainer);
        
        // Right side: line plots
        this.linePlotsContainer = document.createElement('div');
        this.linePlotsContainer.style.flexGrow = '1';
        
        // Create canvas for line plots
        this.linePlotCanvas = document.createElement('canvas');
        this.linePlotCanvas.width = 500;
        this.linePlotCanvas.height = 150;
        this.linePlotCanvas.style.border = '1px solid #000';
        this.linePlotCtx = this.linePlotCanvas.getContext('2d');
        
        // Add label for line plots
        const plotsLabel = document.createElement('div');
        plotsLabel.textContent = 'Molecule Concentration Over Time';
        plotsLabel.style.fontWeight = 'bold';
        plotsLabel.style.marginBottom = '10px';
        
        this.linePlotsContainer.appendChild(plotsLabel);
        this.linePlotsContainer.appendChild(this.linePlotCanvas);
        
        // Add both containers to main container
        container.appendChild(heatmapContainer);
        container.appendChild(this.linePlotsContainer);
        
        // Add container to the document
        document.body.appendChild(container);
        
        // Initialize data for tracking concentrations
        this.concentrationData = {
            cell1: [],
            cell2: []
        };
        
        // Select 2 random cells if none selected
        if (this.selectedCells.length === 0) {
            this.selectRandomCells();
        }
        
        // Initially update the cell UI
        this.updateCellEditUI();
    }
    
    updateCellEditUI() {
        // Clear existing controls
        while (this.cell1Container.childNodes.length > 1) {
            this.cell1Container.removeChild(this.cell1Container.lastChild);
        }
        
        while (this.cell2Container.childNodes.length > 1) {
            this.cell2Container.removeChild(this.cell2Container.lastChild);
        }
        
        // Update cell labels and add controls
        for (let i = 0; i < Math.min(this.selectedCells.length, 2); i++) {
            const cell = this.selectedCells[i];
            const container = i === 0 ? this.cell1Container : this.cell2Container;
            const label = container.firstChild;
            
            label.textContent = `Cell ${i+1}: Small Grid (${cell.row}, ${cell.col}) -> Full Grid (${cell.fullGridRow}, ${cell.fullGridCol})`;
            
            // Get current molecule data
            let isFeedback = false;
            let dataPtr;
            
            if (this.wasm) {
                if (this.currentMoleculeIndex >= 100) {
                    // For feedback molecules
                    const adjustedIndex = this.currentMoleculeIndex - 100;
                    dataPtr = this.wasm._getFeedbackData(adjustedIndex);
                    isFeedback = true;
                } else {
                    // For ECM molecules
                    dataPtr = this.wasm._getECMData(this.currentMoleculeIndex);
                }
                
                // Get current value from the actual simulation
                let currentValue = this.wasm._readDataValue(dataPtr, cell.fullGridRow, cell.fullGridCol);
                
                // Free data pointer
                this.wasm._freeData(dataPtr);
                
                // Create input control for this cell
                const inputGroup = document.createElement('div');
                inputGroup.style.marginTop = '5px';
                inputGroup.style.display = 'flex';
                inputGroup.style.alignItems = 'center';
                
                const valueLabel = document.createElement('span');
                valueLabel.textContent = 'Concentration: ';
                valueLabel.style.marginRight = '10px';
                
                const valueInput = document.createElement('input');
                valueInput.type = 'number';
                valueInput.min = '0';
                valueInput.max = '1';
                valueInput.step = '0.01';
                valueInput.value = currentValue.toFixed(4);
                valueInput.style.width = '80px';
                
                // Add event handler to update when changed
                valueInput.addEventListener('change', (e) => {
                    const newValue = parseFloat(e.target.value);
                    
                    // Apply the change immediately to the simulation
                    this.wasm._setCellConcentration(isFeedback ? 1 : 0, 
                                                    isFeedback ? this.currentMoleculeIndex - 100 : this.currentMoleculeIndex,
                                                    cell.fullGridRow, cell.fullGridCol, newValue);
                    
                    // Update visualization
                    this.updateVisualization();
                });
                
                inputGroup.appendChild(valueLabel);
                inputGroup.appendChild(valueInput);
                container.appendChild(inputGroup);
            }
        }
    }
    
    handleCellSelection(event) {
        const rect = this.smallCanvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
        const cellSize = this.smallCanvas.width / this.smallGridSize;
        const col = Math.floor(x / cellSize);
        const row = Math.floor(y / cellSize);
        
        // Check if cell is already selected
        const existingIndex = this.selectedCells.findIndex(cell => 
            cell.row === row && cell.col === col);
        
        if (existingIndex >= 0) {
            // Remove if clicked again
            this.selectedCells.splice(existingIndex, 1);
        } else if (this.selectedCells.length < 2) {
            // Current code:
            // Adjust these values to control how close the cells are in the large grid
            const regionSize = 1; // Make cells closer together (was 20)
            const offsetRow = 40;  // Starting position in large grid
            const offsetCol = 40;  // Starting position in large grid

            // Calculate full grid coordinates  
            const fullGridRow = offsetRow + (row * regionSize);
            const fullGridCol = offsetCol + (col * regionSize);
            
            this.selectedCells.push({
                row: row,  // Small grid row (for display)
                col: col,  // Small grid col (for display)
                fullGridRow: fullGridRow,  // Full grid row (for simulation)
                fullGridCol: fullGridCol   // Full grid col (for simulation)
            });
        } else {
            // Replace the first selection if we already have 2
            // Use the same mapping as in handleCellSelection
            const regionSize = 1;
            const offsetRow = 40;
            const offsetCol = 40;

            const fullGridRow = offsetRow + (row * regionSize);
            const fullGridCol = offsetCol + (col * regionSize);
            
            this.selectedCells[0] = {
                row: row,
                col: col,
                fullGridRow: fullGridRow,
                fullGridCol: fullGridCol
            };
        }
        
        // Update the cell editing UI
        this.updateCellEditUI();
        
        // Update the visualization
        this.updateVisualization();
    }
    
    selectRandomCells() {
        this.selectedCells = [];
        
        // Select 2 random positions from the 5x5 grid
        for (let i = 0; i < 2; i++) {
            const row = Math.floor(Math.random() * this.smallGridSize);
            const col = Math.floor(Math.random() * this.smallGridSize);
            
            // Make sure we don't select the same cell twice
            const position = `${row},${col}`;
            if (this.selectedCells.some(cell => `${cell.row},${cell.col}` === position)) {
                i--; // Try again
                continue;
            } else {
                // Map to full grid coordinates
                const scaleFactorRows = this.gridSize / this.smallGridSize;
                const scaleFactorCols = this.gridSize / this.smallGridSize;
                
                const fullGridRow = Math.floor(row * scaleFactorRows + scaleFactorRows / 2);
                const fullGridCol = Math.floor(col * scaleFactorCols + scaleFactorCols / 2);
                
                this.selectedCells.push({ 
                    row, 
                    col,
                    fullGridRow,
                    fullGridCol
                });
            }
        }
        
        // Update the cell editing UI
        this.updateCellEditUI();
    }
    
    async initWasm() {
        try {
            // Load the WebAssembly module using the generated wrapper
            const module = await ECMModule();
            this.wasm = module;
            
            // Initialize the grid
            this.wasm._initializeGrid();
            
            // Set initial rate constants
            this.updateRateConstants();
            
            console.log("WASM module initialized successfully");
            
            // Update the visualization
            this.updateVisualization();
            
            // Add status information
            const status = document.createElement('div');
            status.className = 'status';
            status.textContent = "ODE Simulation loaded and ready.";
            document.body.appendChild(status);
        } catch (error) {
            console.error("Failed to initialize WASM module:", error);
            
            const status = document.createElement('div');
            status.className = 'status';
            status.textContent = "Error loading simulation: " + error.message;
            status.style.color = "red";
            document.body.appendChild(status);
        }
    }
    
    updateRateConstants() {
        if (this.wasm) {
            try {
                this.wasm._setRateConstants(
                    this.rateConstants.k_input,
                    this.rateConstants.k_feedback,
                    this.rateConstants.k_degradation,
                    this.rateConstants.k_receptor,
                    this.rateConstants.k_inhibition,
                    this.rateConstants.k_activation,
                    this.rateConstants.k_production,
                    this.rateConstants.k_diffusion
                );
            } catch (error) {
                console.error("Error updating rate constants:", error);
            }
        }
    }
    
    setInputConcentration(moleculeIndex, value) {
        // This function is now deprecated in favor of applyInputToSelectedCells
        // But we keep it for compatibility
        if (this.wasm) {
            try {
                this.wasm._setInputConcentration(moleculeIndex, value);
                this.updateVisualization();
            } catch (error) {
                console.error(`Error setting concentration for molecule index ${moleculeIndex}:`, error);
            }
        }
    }
    
    startSimulation() {
        this.simulationRunning = true;
        this.simulationLoop();
    }
    
    stopSimulation() {
        this.simulationRunning = false;
    }
    
    stepSimulation() {
        if (this.wasm) {
            try {
                // CRITICAL: Apply input concentrations to selected cells before each step
                // This ensures continuous feeding of updated values
                this.applyInputToSelectedCells();
                
                this.wasm._simulateStep(this.timeStep);
                this.iteration++;
                this.updateVisualization();
                this.updateCellEditUI(); // Update input values to reflect simulation changes
            } catch (error) {
                console.error("Error during simulation step:", error);
                this.stopSimulation();
            }
        }
    }
    
    // CORRECTED: Reset simulation with proper cleanup
    resetSimulation() {
        if (this.wasm) {
            try {
                // Reset the iteration counter
                this.iteration = 0;
                
                // Clear concentration data
                this.concentrationData = {
                    cell1: [],
                    cell2: []
                };
                
                // Clear modified cell values
                this.modifiedCellValues = {};
                
                // Clear brush selection
                this.selectedCellsForInput.clear();
                this.updateSelectionInfo();
                
                // Use the C++ function to properly clear all input overrides
                this.wasm._clearAllInputOverrides();
                
                // Re-initialize the grid
                this.wasm._initializeGrid();
                
                // Reset all input sliders and their value displays
                this.inputMolecules.forEach(mol => {
                    const input = document.getElementById(`input-${mol.name}`);
                    if (input) {
                        const valueDisplay = input.nextElementSibling;
                        input.value = 0;
                        if (valueDisplay) {
                            valueDisplay.textContent = '0.00';
                        }
                    }
                    this.currentInputValues[mol.name] = 0;
                });
                
                // Select new random cells
                this.selectRandomCells();
                
                // Update visualization
                this.updateVisualization();
                
                console.log("Simulation reset");
            } catch (error) {
                console.error("Error resetting simulation:", error);
            }
        }
    }
    
    // CORRECTED: Ensure continuous application during simulation loop
    simulationLoop() {
        if (!this.simulationRunning) return;
        
        // Apply input values before each step to ensure continuous feeding
        this.stepSimulation();
        requestAnimationFrame(() => this.simulationLoop());
    }
    
    updateVisualization() {
        if (!this.wasm) return;
        
        try {
            // Get data based on molecule type (ECM or feedback)
            let dataPtr;
            let isFeedback = false;
            
            // Check if it's a feedback molecule (using indexes 100+ for feedback)
            if (this.currentMoleculeIndex >= 100) {
                // For feedback molecules, adjust index
                const adjustedIndex = this.currentMoleculeIndex - 100;
                dataPtr = this.wasm._getFeedbackData(adjustedIndex);
                isFeedback = true;
            } else {
                // For ECM molecules
                dataPtr = this.wasm._getECMData(this.currentMoleculeIndex);
            }
            
            // Create scaled canvas for display
            const scale = this.canvas.width / this.gridSize;
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            
            // Track min/max values for better visualization
            let minVal = 1.0;
            let maxVal = 0.0;
            
            // First pass: find min/max values
            for (let i = 0; i < this.gridSize; i++) {
                for (let j = 0; j < this.gridSize; j++) {
                    const value = this.wasm._readDataValue(dataPtr, i, j);
                    if (value > 0) {
                        minVal = Math.min(minVal, value);
                        maxVal = Math.max(maxVal, value);
                    }
                }
            }
            
            // Avoid division by zero
            if (maxVal <= 0) maxVal = 0.01;
            if (minVal >= maxVal) minVal = 0;
            
            // Apply log scaling for better visualization
            const logMin = minVal > 0 ? Math.log10(minVal) : -3;
            const logMax = Math.log10(maxVal);
            const logRange = Math.max(logMax - logMin, 0.01);
            
            // Second pass: draw with enhanced contrast
            for (let i = 0; i < this.gridSize; i++) {
                for (let j = 0; j < this.gridSize; j++) {
                    let value = this.wasm._readDataValue(dataPtr, i, j);
                    
                    // Apply log scaling for better visualization of small values
                    if (value > 0) {
                        // Normalize to 0-1 range with log scaling
                        let logVal = Math.log10(value);
                        value = (logVal - logMin) / logRange;
                    } else {
                        value = 0;
                    }
                    
                    // Create heatmap color (red to yellow for ECM, blue for feedback)
                    let r, g, b;
                    
                    if (isFeedback) {
                        // Blue gradient for feedback molecules
                        r = 0;
                        g = Math.min(255, value * 255);
                        b = Math.min(255, value * 255 * 2);
                    } else {
                        // Red-yellow gradient for ECM molecules
                        r = Math.min(255, value * 255 * 2);
                        g = Math.min(255, value * 255);
                        b = 0;
                    }
                    
                    this.ctx.fillStyle = `rgb(${Math.floor(r)}, ${Math.floor(g)}, ${Math.floor(b)})`;
                    this.ctx.fillRect(j * scale, i * scale, scale, scale);
                }
            }
            
            // Draw brush selection overlay if brush mode is enabled
            if (this.brushMode && this.selectedCellsForInput.size > 0) {
                this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
                this.ctx.lineWidth = 0.3; // Thin outline as requested
                this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
                
                this.selectedCellsForInput.forEach(cellKey => {
                    const [row, col] = cellKey.split(',').map(Number);
                    const x = col * scale;
                    const y = row * scale;
                    
                    this.ctx.fillRect(x, y, scale, scale);
                    this.ctx.strokeRect(x, y, scale, scale);
                });
            }
            
            // Add iteration counter and range info
            this.ctx.fillStyle = 'white';
            this.ctx.fillRect(10, 10, 280, 70);
            this.ctx.fillStyle = 'black';
            this.ctx.font = '16px Arial';
            this.ctx.fillText(`Iteration: ${this.iteration} | Time: ${(this.iteration * this.timeStep).toFixed(2)}`, 15, 30);
            this.ctx.font = '12px Arial';
            this.ctx.fillText(`Range: ${minVal.toExponential(2)} - ${maxVal.toExponential(2)}`, 15, 50);
            this.ctx.fillText(`Selected cells: ${this.selectedCellsForInput.size}`, 15, 70);
            
            // Now update the small heatmap
            this.updateSmallHeatmap(dataPtr, isFeedback);
            
            // Update line plots
            this.updateLinePlots(dataPtr, isFeedback);
            
            // Free the data memory
            this.wasm._freeData(dataPtr);
            
        } catch (error) {
            console.error("Error updating visualization:", error);
        }
    }
    
    updateSmallHeatmap(dataPtr, isFeedback) {
        if (!this.wasm) return;
        
        // Clear small canvas
        this.smallCtx.clearRect(0, 0, this.smallCanvas.width, this.smallCanvas.height);
        
        // Draw the 5x5 grid
        const cellSize = this.smallCanvas.width / this.smallGridSize;
        
        // Draw grid background
        this.smallCtx.fillStyle = '#f0f0f0';
        this.smallCtx.fillRect(0, 0, this.smallCanvas.width, this.smallCanvas.height);
        
        // Draw grid lines
        this.smallCtx.strokeStyle = '#ccc';
        this.smallCtx.lineWidth = 1;
        
        for (let i = 0; i <= this.smallGridSize; i++) {
            const pos = i * cellSize;
            
            // Vertical line
            this.smallCtx.beginPath();
            this.smallCtx.moveTo(pos, 0);
            this.smallCtx.lineTo(pos, this.smallCanvas.height);
            this.smallCtx.stroke();
            
            // Horizontal line
            this.smallCtx.beginPath();
            this.smallCtx.moveTo(0, pos);
            this.smallCtx.lineTo(this.smallCanvas.width, pos);
            this.smallCtx.stroke();
        }
        
        // Map the selected cells from the 5x5 grid to the actual simulation grid
        const regionSize = 1;
        const offsetRow = 40;
        const offsetCol = 40;
        
        // First draw all cells with their average values
        for (let row = 0; row < this.smallGridSize; row++) {
            for (let col = 0; col < this.smallGridSize; col++) {
                // Calculate average value over the corresponding region in the full grid
                let totalValue = 0;
                let cellCount = 0;
                
                const startRow = offsetRow + (row * regionSize);
                const endRow = Math.min(startRow + regionSize, this.gridSize);
                const startCol = offsetCol + (col * regionSize);
                const endCol = Math.min(startCol + regionSize, this.gridSize);
                
                for (let i = startRow; i < endRow; i++) {
                    for (let j = startCol; j < endCol; j++) {
                        totalValue += this.wasm._readDataValue(dataPtr, i, j);
                        cellCount++;
                    }
                }
                
                const avgValue = cellCount > 0 ? totalValue / cellCount : 0;
                
                // Set fill color based on average value
                let r, g, b;
                if (isFeedback) {
                    // Blue gradient for feedback molecules
                    r = 0;
                    g = Math.min(255, avgValue * 255);
                    b = Math.min(255, avgValue * 255 * 2);
                } else {
                    // Red-yellow gradient for ECM molecules
                    r = Math.min(255, avgValue * 255 * 2);
                    g = Math.min(255, avgValue * 255);
                    b = 0;
                }
                
                // Fill the cell
                this.smallCtx.fillStyle = `rgb(${Math.floor(r)}, ${Math.floor(g)}, ${Math.floor(b)})`;
                this.smallCtx.fillRect(col * cellSize + 1, row * cellSize + 1, cellSize - 2, cellSize - 2);
                
                // Draw the value text
                this.smallCtx.fillStyle = avgValue > 0.5 ? 'black' : 'white';
                this.smallCtx.font = '10px Arial';
                this.smallCtx.textAlign = 'center';
                this.smallCtx.textBaseline = 'middle';
                this.smallCtx.fillText(avgValue.toFixed(3), 
                                      (col + 0.5) * cellSize, 
                                      (row + 0.5) * cellSize);
            }
        }
        
        // Then highlight selected cells with a border
        this.selectedCells.forEach((cell, index) => {
            this.smallCtx.strokeStyle = index === 0 ? '#ff0000' : '#0000ff'; // Red for cell 1, blue for cell 2
            this.smallCtx.lineWidth = 3;
            this.smallCtx.strokeRect(
                cell.col * cellSize + 1, 
                cell.row * cellSize + 1, 
                cellSize - 2, 
                cellSize - 2
            );
        });
    }
    
    updateLinePlots(dataPtr, isFeedback) {
        if (!this.wasm || this.selectedCells.length === 0) return;
        
        // Clear line plot canvas
        this.linePlotCtx.clearRect(0, 0, this.linePlotCanvas.width, this.linePlotCanvas.height);
        
        // Get current values for selected cells
        const currentValues = [];
        for (let i = 0; i < Math.min(2, this.selectedCells.length); i++) {
            const cell = this.selectedCells[i];
            const value = this.wasm._readDataValue(dataPtr, cell.fullGridRow, cell.fullGridCol);
            currentValues.push(value);
        }
        
        // Store current values
        if (currentValues.length > 0) {
            this.concentrationData.cell1.push(currentValues[0]);
            if (currentValues.length > 1) {
                this.concentrationData.cell2.push(currentValues[1]);
            }
        }
        
        // Limit data history to keep plots manageable
        const maxDataPoints = 200;
        if (this.concentrationData.cell1.length > maxDataPoints) {
            this.concentrationData.cell1.shift();
            if (this.concentrationData.cell2.length > 0) {
                this.concentrationData.cell2.shift();
            }
        }
        
        // Draw line plots
        const padding = 30;
        const plotWidth = this.linePlotCanvas.width - padding * 2;
        const plotHeight = this.linePlotCanvas.height - padding * 2;
        
        // Draw axes
        this.linePlotCtx.strokeStyle = '#000';
        this.linePlotCtx.lineWidth = 1;
        this.linePlotCtx.beginPath();
        this.linePlotCtx.moveTo(padding, padding);
        this.linePlotCtx.lineTo(padding, padding + plotHeight);
        this.linePlotCtx.lineTo(padding + plotWidth, padding + plotHeight);
        this.linePlotCtx.stroke();
        
        // Draw grid lines
        this.linePlotCtx.strokeStyle = '#eee';
        this.linePlotCtx.lineWidth = 0.5;
        this.linePlotCtx.beginPath();
        for (let i = 0; i <= 10; i++) {
            const y = padding + plotHeight - (i * plotHeight / 10);
            this.linePlotCtx.moveTo(padding, y);
            this.linePlotCtx.lineTo(padding + plotWidth, y);
        }
        this.linePlotCtx.stroke();
        
        // Find max value for scaling
        let maxValue = 0;
        this.concentrationData.cell1.forEach(v => maxValue = Math.max(maxValue, v));
        if (this.concentrationData.cell2.length > 0) {
            this.concentrationData.cell2.forEach(v => maxValue = Math.max(maxValue, v));
        }
        if (maxValue <= 0) maxValue = 1;
        
        // Draw cell 1 data
        if (this.concentrationData.cell1.length > 1) {
            this.linePlotCtx.strokeStyle = '#ff0000';
            this.linePlotCtx.lineWidth = 2;
            this.linePlotCtx.beginPath();
            
            for (let i = 0; i < this.concentrationData.cell1.length; i++) {
                const x = padding + (i / (this.concentrationData.cell1.length - 1)) * plotWidth;
                const y = padding + plotHeight - (this.concentrationData.cell1[i] / maxValue * plotHeight);
                
                if (i === 0) {
                    this.linePlotCtx.moveTo(x, y);
                } else {
                    this.linePlotCtx.lineTo(x, y);
                }
            }
            this.linePlotCtx.stroke();
        }
        
        // Draw cell 2 data
        if (this.concentrationData.cell2.length > 1) {
            this.linePlotCtx.strokeStyle = '#0000ff';
            this.linePlotCtx.lineWidth = 2;
            this.linePlotCtx.beginPath();
            
            for (let i = 0; i < this.concentrationData.cell2.length; i++) {
                const x = padding + (i / (this.concentrationData.cell2.length - 1)) * plotWidth;
                const y = padding + plotHeight - (this.concentrationData.cell2[i] / maxValue * plotHeight);
                
                if (i === 0) {
                    this.linePlotCtx.moveTo(x, y);
                } else {
                    this.linePlotCtx.lineTo(x, y);
                }
            }
            this.linePlotCtx.stroke();
        }
        
        // Add legend with improved positioning and better visibility
        this.linePlotCtx.font = '12px Arial';

        // Add a small background for the legend
        this.linePlotCtx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        this.linePlotCtx.fillRect(padding + 10, padding + 10, 60, 50);

        // Draw Cell 1 label (red)
        this.linePlotCtx.fillStyle = '#ff0000';
        this.linePlotCtx.fillText('Cell 1', padding + 20, padding + 25);

        // Draw Cell 2 label (blue) if there's data for cell 2
        if (this.concentrationData.cell2.length > 0) {
            this.linePlotCtx.fillStyle = '#0000ff';
            this.linePlotCtx.fillText('Cell 2', padding + 20, padding + 45);
        }
        
        // Add axis labels
        this.linePlotCtx.fillStyle = '#000';
        this.linePlotCtx.textAlign = 'center';
        this.linePlotCtx.fillText('Iterations', padding + plotWidth / 2, this.linePlotCanvas.height - 5);
        
        // Add Y-axis labels
        this.linePlotCtx.textAlign = 'right';
        this.linePlotCtx.fillText('0', padding - 5, padding + plotHeight + 3);
        this.linePlotCtx.fillText(maxValue.toFixed(3), padding - 5, padding + 3);
        
        this.linePlotCtx.save();
        this.linePlotCtx.translate(10, padding + plotHeight / 2);
        this.linePlotCtx.rotate(-Math.PI / 2);
        this.linePlotCtx.textAlign = 'center';
        this.linePlotCtx.fillText('Concentration', 0, 0);
        this.linePlotCtx.restore();
    }
}

// Initialize visualizer when page loads and WASM module is available
window.addEventListener('DOMContentLoaded', () => {
    // Wait for the ECMModule to be defined (it's loaded by the ecm.js script)
    const checkModule = () => {
        if (typeof ECMModule !== 'undefined') {
            new ECMVisualizer();
        } else {
            console.log("Waiting for ECMModule to load...");
            setTimeout(checkModule, 100);
        }
    };
    
    checkModule();
});