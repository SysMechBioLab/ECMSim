class ECMVisualizer {
    constructor() {
        this.gridSize = 100;
        this.currentMoleculeIndex = 0; // proCI by default
        this.simulationRunning = false;
        this.iteration = 0;
        this.currentTime = 0.0; // ADDED: Missing property initialization
        this.dataBuffer = null;
        this.timeStep = 0.1; // Default time step for ODE integration
        
        // For visualization range (needed for text display)
        this.minValue = 0.1; // ADDED: Default values
        this.maxValue = 0.9; // ADDED: Default values
        this.brushSelectedCells = 0; // ADDED: Missing property
        
        // Individual cell selection for tracking (NOT for input)
        this.cellSelectionMode = false;
        this.trackedCells = []; // Array of {row, col, color} objects for line plot tracking
        // Publication-quality colorblind-safe palette (Wong, Nature Methods 2011)
        this.cellColors = ['#0072B2', '#D55E00', '#009E73', '#CC79A7', '#E69F00', '#56B4E9', '#F0E442', '#000000'];
        
        // Track modified values for selected cells
        this.modifiedCellValues = {};
        
        // Brush selection properties (for input molecules)
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
            {name: 'tensionin', index: 2},
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
        
        // Initialize data for tracking concentrations
        this.concentrationData = {}; // Will store data for each tracked cell
        
        // Store elements for later access
        this.uiElements = {};
        
        // Initialize UI
        this.initUI();
        this.initCanvas();
        this.initLinePlot();
        
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
            this.updateTrackedCellsUI();
        });
        
        document.body.appendChild(selector);
        
        // Create brush selection controls (for input molecules) - KEEP ABOVE HEATMAP
        const brushContainer = document.createElement('div');
        brushContainer.id = 'brush-controls';
        brushContainer.style.border = '2px solid #007acc';
        brushContainer.style.padding = '10px';
        brushContainer.style.margin = '10px 0';
        brushContainer.style.backgroundColor = '#f0f8ff';
        
        const brushTitle = document.createElement('h3');
        brushTitle.textContent = 'Brush selection tool (for input molecules)';
        brushTitle.style.margin = '0 0 10px 0';
        brushContainer.appendChild(brushTitle);
        
        // Brush mode toggle
        const brushToggle = document.createElement('button');
        brushToggle.id = 'brush-toggle';
        brushToggle.textContent = 'Enable brush mode';
        brushToggle.style.marginRight = '10px';
        brushToggle.addEventListener('click', () => this.toggleBrushMode());
        brushContainer.appendChild(brushToggle);
        
        // Clear selection button
        const clearSelection = document.createElement('button');
        clearSelection.textContent = 'Clear selection';
        clearSelection.style.marginRight = '10px';
        clearSelection.addEventListener('click', () => this.clearBrushSelection());
        brushContainer.appendChild(clearSelection);
        
        // Brush size control
        const brushSizeContainer = document.createElement('div');
        brushSizeContainer.style.display = 'inline-block';
        brushSizeContainer.style.marginLeft = '10px';
        
        const brushSizeLabel = document.createElement('label');
        brushSizeLabel.textContent = 'Brush size: ';
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
        inputTitle.textContent = 'Input molecule concentrations (for brush-selected cells)';
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
            { id: 'k_input', name: 'Input rate', min: 0.1, max: 5.0, default: this.rateConstants.k_input },
            { id: 'k_feedback', name: 'Feedback rate', min: 0.1, max: 5.0, default: this.rateConstants.k_feedback },
            { id: 'k_degradation', name: 'Degradation rate', min: 0.01, max: 1.0, default: this.rateConstants.k_degradation },
            { id: 'k_receptor', name: 'Receptor rate', min: 0.1, max: 5.0, default: this.rateConstants.k_receptor },
            { id: 'k_inhibition', name: 'Inhibition rate', min: 0.1, max: 5.0, default: this.rateConstants.k_inhibition },
            { id: 'k_activation', name: 'Activation rate', min: 0.1, max: 5.0, default: this.rateConstants.k_activation },
            { id: 'k_production', name: 'Production rate', min: 0.001, max: 0.1, default: this.rateConstants.k_production },
            { id: 'k_diffusion', name: 'Diffusion rate', min: 0.01, max: 1.0, default: this.rateConstants.k_diffusion }
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
        toggleButton.textContent = 'Show ODE parameters';
        toggleButton.addEventListener('click', () => {
            if (odeContainer.style.display === 'none') {
                odeContainer.style.display = 'block';
                toggleButton.textContent = 'Hide ODE parameters';
            } else {
                odeContainer.style.display = 'none';
                toggleButton.textContent = 'Show ODE parameters';
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
    
    // Initialize line plot canvas
    initLinePlot() {
        const container = document.createElement('div');
        container.style.marginTop = '20px';

        const plotsLabel = document.createElement('div');
        plotsLabel.textContent = 'Tracked cell concentrations over time';
        plotsLabel.style.fontWeight = 'bold';
        plotsLabel.style.marginBottom = '10px';

        // Create a flex container for canvas and buttons
        const plotContainer = document.createElement('div');
        plotContainer.style.display = 'flex';
        plotContainer.style.alignItems = 'flex-end';
        plotContainer.style.gap = '15px';

        // Create canvas for line plots
        this.linePlotCanvas = document.createElement('canvas');
        this.linePlotCanvas.width = 700;
        this.linePlotCanvas.height = 300;
        this.linePlotCanvas.style.border = '1px solid #000';
        this.linePlotCtx = this.linePlotCanvas.getContext('2d');

        // Export buttons container (right side, bottom aligned)
        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.flexDirection = 'column';
        buttonContainer.style.gap = '10px';

        const exportSVGButton = document.createElement('button');
        exportSVGButton.textContent = '📥 Export Plot as SVG';
        exportSVGButton.style.padding = '10px 15px';
        exportSVGButton.style.backgroundColor = '#FF9800';
        exportSVGButton.style.color = 'white';
        exportSVGButton.style.border = 'none';
        exportSVGButton.style.borderRadius = '4px';
        exportSVGButton.style.cursor = 'pointer';
        exportSVGButton.style.fontSize = '14px';
        exportSVGButton.style.fontWeight = 'bold';
        exportSVGButton.addEventListener('click', () => {
            this.exportLinePlotToSVG();
        });
        buttonContainer.appendChild(exportSVGButton);

        const exportPNGButton = document.createElement('button');
        exportPNGButton.textContent = '📄 Export Plot as PNG';
        exportPNGButton.style.padding = '10px 15px';
        exportPNGButton.style.backgroundColor = '#2196F3';
        exportPNGButton.style.color = 'white';
        exportPNGButton.style.border = 'none';
        exportPNGButton.style.borderRadius = '4px';
        exportPNGButton.style.cursor = 'pointer';
        exportPNGButton.style.fontSize = '14px';
        exportPNGButton.style.fontWeight = 'bold';
        exportPNGButton.addEventListener('click', () => {
            this.exportLinePlotToPNG();
        });
        buttonContainer.appendChild(exportPNGButton);

        plotContainer.appendChild(this.linePlotCanvas);
        plotContainer.appendChild(buttonContainer);

        container.appendChild(plotsLabel);
        container.appendChild(plotContainer);

        document.body.appendChild(container);
    }
    
    initCanvas() {
        const canvasContainer = document.createElement('div');
        canvasContainer.style.display = 'flex';
        canvasContainer.style.alignItems = 'flex-start';
        canvasContainer.style.gap = '15px';
        canvasContainer.style.marginTop = '20px';
        
        // Create a container for the canvas and tracking controls
        const leftContainer = document.createElement('div');
        leftContainer.style.display = 'flex';
        leftContainer.style.flexDirection = 'column';
        leftContainer.style.gap = '15px';
        
        // Canvas
        this.canvas = document.createElement('canvas');
        this.canvas.width = 600;
        this.canvas.height = 600;
        this.ctx = this.canvas.getContext('2d');
        this.canvas.style.cursor = 'crosshair';
        this.canvas.style.border = '1px solid #ccc';
        this.canvas.style.width = '500px';
        this.canvas.style.height = '500px';
        
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('mouseleave', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('click', (e) => this.handleCellClick(e));
        
        leftContainer.appendChild(this.canvas);
        
        // NOW ADD CELL TRACKING TOOL BELOW THE HEATMAP
        const trackingContainer = document.createElement('div');
        trackingContainer.id = 'tracking-controls';
        trackingContainer.style.border = '2px solid #ff6600';
        trackingContainer.style.padding = '10px';
        trackingContainer.style.margin = '10px 0';
        trackingContainer.style.backgroundColor = '#fff5f0';
        
        const trackingTitle = document.createElement('h3');
        trackingTitle.textContent = 'Cell tracking tool (for line plot)';
        trackingTitle.style.margin = '0 0 10px 0';
        trackingContainer.appendChild(trackingTitle);
        
        // Cell selection mode toggle
        const cellSelectToggle = document.createElement('button');
        cellSelectToggle.id = 'cell-select-toggle';
        cellSelectToggle.textContent = 'Enable cell selection';
        cellSelectToggle.style.marginRight = '10px';
        cellSelectToggle.addEventListener('click', () => this.toggleCellSelectionMode());
        trackingContainer.appendChild(cellSelectToggle);
        
        // Clear tracked cells button
        const clearTrackedCells = document.createElement('button');
        clearTrackedCells.textContent = 'Clear tracked cells';
        clearTrackedCells.style.marginRight = '10px';
        clearTrackedCells.addEventListener('click', () => this.clearTrackedCells());
        trackingContainer.appendChild(clearTrackedCells);
        
        // Tracked cells info
        const cellsInfo = document.createElement('div');
        cellsInfo.id = 'cells-info';
        cellsInfo.style.marginTop = '10px';
        cellsInfo.style.fontStyle = 'italic';
        cellsInfo.textContent = 'No cells selected for tracking';
        trackingContainer.appendChild(cellsInfo);
        
        // Container for tracked cell concentration controls
        const trackedCellsContainer = document.createElement('div');
        trackedCellsContainer.id = 'tracked-cells-container';
        trackedCellsContainer.style.marginTop = '10px';
        trackingContainer.appendChild(trackedCellsContainer);
        
        leftContainer.appendChild(trackingContainer);
        
        canvasContainer.appendChild(leftContainer);
        
        // Export buttons container (right side)
        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.flexDirection = 'column';
        buttonContainer.style.gap = '10px';
        
        const exportSVGButton = document.createElement('button');
        exportSVGButton.textContent = '📥 Export as SVG (600x600)';
        exportSVGButton.style.padding = '10px 15px';
        exportSVGButton.style.backgroundColor = '#FF9800';
        exportSVGButton.style.color = 'white';
        exportSVGButton.style.border = 'none';
        exportSVGButton.style.borderRadius = '4px';
        exportSVGButton.style.cursor = 'pointer';
        exportSVGButton.style.fontSize = '14px';
        exportSVGButton.style.fontWeight = 'bold';
        exportSVGButton.addEventListener('click', () => {
            console.log("SVG Export button clicked");
            this.exportCanvasToSVG();
        });
        buttonContainer.appendChild(exportSVGButton);
        
        const exportPNGButton = document.createElement('button');
        exportPNGButton.textContent = '📄 Export as PNG (600x600)';
        exportPNGButton.style.padding = '10px 15px';
        exportPNGButton.style.backgroundColor = '#2196F3';
        exportPNGButton.style.color = 'white';
        exportPNGButton.style.border = 'none';
        exportPNGButton.style.borderRadius = '4px';
        exportPNGButton.style.cursor = 'pointer';
        exportPNGButton.style.fontSize = '14px';
        exportPNGButton.style.fontWeight = 'bold';
        exportPNGButton.addEventListener('click', () => {
            console.log("PNG Export button clicked");
            this.exportCanvasToPNG();
        });
        buttonContainer.appendChild(exportPNGButton);
        
        canvasContainer.appendChild(buttonContainer);
        document.body.appendChild(canvasContainer);
    }
    
    exportCanvasToSVG() {
        try {
            console.log("Starting SVG export...");
            
            // Set dimensions to 600x600
            const width = 600;
            const height = 600;
            const gridSize = this.gridSize;
            
            // Get current time value
            const currentTime = (this.iteration * this.timeStep).toFixed(2);
            
            // Update min/max values before export (call the updateVisualization method to set them)
            this.updateMinMaxValues();
            
            // Calculate brush selected cells count
            this.brushSelectedCells = this.selectedCellsForInput.size;
            
            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svg.setAttribute("width", width);
            svg.setAttribute("height", height);
            svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
            svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
            svg.setAttribute("version", "1.1");
            
            // Add metadata
            const metadata = document.createElementNS("http://www.w3.org/2000/svg", "metadata");
            metadata.textContent = `Created by ECM Simulation - Iteration ${this.iteration}`;
            svg.appendChild(metadata);
            
            const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
            title.textContent = `ECMSim - Iteration ${this.iteration}`;
            svg.appendChild(title);
            
            const cellWidth = width / gridSize;
            const cellHeight = height / gridSize;
            
            // Create a group for the heatmap cells
            const cellGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
            cellGroup.setAttribute("class", "heatmap-cells");
            
            // Create a temporary canvas to get color data - BUT DON'T DRAW THE LEGEND!
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = width;
            tempCanvas.height = height;
            const tempCtx = tempCanvas.getContext('2d');

            // Clear the temporary canvas
            tempCtx.clearRect(0, 0, width, height);

            // Draw ONLY the heatmap cells (not the legend) - we need to recreate the heatmap
            if (this.wasm) {
                try {
                    // Get data based on molecule type (ECM or feedback)
                    let dataPtr;
                    let isFeedback = false;
                    
                    if (this.currentMoleculeIndex >= 100) {
                        const adjustedIndex = this.currentMoleculeIndex - 100;
                        dataPtr = this.wasm._getFeedbackData(adjustedIndex);
                        isFeedback = true;
                    } else {
                        dataPtr = this.wasm._getECMData(this.currentMoleculeIndex);
                    }
                    
                    // Apply log scaling for better visualization
                    const logMin = this.minValue > 0 ? Math.log10(this.minValue) : -3;
                    const logMax = Math.log10(this.maxValue);
                    const logRange = Math.max(logMax - logMin, 0.01);
                    
                    // Draw heatmap cells directly to temp canvas
                    for (let i = 0; i < gridSize; i++) {
                        for (let j = 0; j < gridSize; j++) {
                            let value = this.wasm._readDataValue(dataPtr, i, j);
                            
                            // Apply log scaling for better visualization of small values
                            if (value > 0) {
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
                            
                            tempCtx.fillStyle = `rgb(${Math.floor(r)}, ${Math.floor(g)}, ${Math.floor(b)})`;
                            tempCtx.fillRect(j * cellWidth, i * cellHeight, cellWidth, cellHeight);
                        }
                    }
                    
                    // Free the data memory
                    this.wasm._freeData(dataPtr);
                    
                } catch (error) {
                    console.error("Error generating heatmap for SVG:", error);
                }
            }

            const imageData = tempCtx.getImageData(0, 0, width, height);
            const pixelData = imageData.data;

            // Draw heatmap cells as SVG rectangles
            for (let row = 0; row < gridSize; row++) {
                for (let col = 0; col < gridSize; col++) {
                    const x = Math.floor(col * cellWidth + cellWidth / 2);
                    const y = Math.floor(row * cellHeight + cellHeight / 2);
                    const pixelIndex = (y * width + x) * 4;
                    
                    // Check if pixel index is within bounds
                    if (pixelIndex < 0 || pixelIndex + 3 >= pixelData.length) {
                        continue;
                    }
                    
                    const r = pixelData[pixelIndex];
                    const g = pixelData[pixelIndex + 1];
                    const b = pixelData[pixelIndex + 2];
                    
                    // Check if pixel is valid
                    if (isNaN(r) || isNaN(g) || isNaN(b)) {
                        continue;
                    }
                    
                    const color = `rgb(${r},${g},${b})`;
                    
                    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                    rect.setAttribute("x", col * cellWidth);
                    rect.setAttribute("y", row * cellHeight);
                    rect.setAttribute("width", Math.ceil(cellWidth));
                    rect.setAttribute("height", Math.ceil(cellHeight));
                    rect.setAttribute("fill", color);
                    rect.setAttribute("stroke", "none");
                    cellGroup.appendChild(rect);
                }
            }
            svg.appendChild(cellGroup);

            // Add brush selection overlay if there are selected cells
            console.log("SVG Export - Brush selected cells:", this.selectedCellsForInput.size);
            if (this.selectedCellsForInput.size > 0) {
                const brushGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
                brushGroup.setAttribute("class", "brush-selection");

                this.selectedCellsForInput.forEach(cellKey => {
                    const [row, col] = cellKey.split(',').map(Number);
                    const x = col * cellWidth;
                    const y = row * cellHeight;

                    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                    rect.setAttribute("x", x);
                    rect.setAttribute("y", y);
                    rect.setAttribute("width", Math.ceil(cellWidth));
                    rect.setAttribute("height", Math.ceil(cellHeight));
                    // Use proper SVG opacity attributes instead of rgba()
                    rect.setAttribute("fill", "#FFFFFF");
                    rect.setAttribute("fill-opacity", "0.3");
                    rect.setAttribute("stroke", "#FFFFFF");
                    rect.setAttribute("stroke-opacity", "0.8");
                    rect.setAttribute("stroke-width", "0.5");
                    brushGroup.appendChild(rect);
                });

                svg.appendChild(brushGroup);
                console.log("SVG Export - Added brush selection group with", this.selectedCellsForInput.size, "cells");
            }

            // Add tracked cells with colored borders and labels
            console.log("SVG Export - Tracked cells:", this.trackedCells.length);
            if (this.trackedCells.length > 0) {
                const trackedGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
                trackedGroup.setAttribute("class", "tracked-cells");

                this.trackedCells.forEach((cell, index) => {
                    const x = cell.col * cellWidth;
                    const y = cell.row * cellHeight;

                    // Outer colored border
                    const outerRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                    outerRect.setAttribute("x", x - 2);
                    outerRect.setAttribute("y", y - 2);
                    outerRect.setAttribute("width", Math.ceil(cellWidth) + 4);
                    outerRect.setAttribute("height", Math.ceil(cellHeight) + 4);
                    outerRect.setAttribute("fill", "none");
                    outerRect.setAttribute("stroke", cell.color);
                    outerRect.setAttribute("stroke-width", "4");
                    trackedGroup.appendChild(outerRect);

                    // Inner white border for contrast
                    const innerRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                    innerRect.setAttribute("x", x);
                    innerRect.setAttribute("y", y);
                    innerRect.setAttribute("width", Math.ceil(cellWidth));
                    innerRect.setAttribute("height", Math.ceil(cellHeight));
                    innerRect.setAttribute("fill", "none");
                    innerRect.setAttribute("stroke", "#FFFFFF");
                    innerRect.setAttribute("stroke-width", "1");
                    trackedGroup.appendChild(innerRect);

                    // Cell number label with stroke for visibility
                    const textStroke = document.createElementNS("http://www.w3.org/2000/svg", "text");
                    textStroke.setAttribute("x", x + 2);
                    textStroke.setAttribute("y", y + 12);
                    textStroke.setAttribute("font-family", "Arial, sans-serif");
                    textStroke.setAttribute("font-size", "12");
                    textStroke.setAttribute("font-weight", "bold");
                    textStroke.setAttribute("fill", "none");
                    textStroke.setAttribute("stroke", "#000000");
                    textStroke.setAttribute("stroke-width", "3");
                    textStroke.textContent = `${index + 1}`;
                    trackedGroup.appendChild(textStroke);

                    // Cell number label fill
                    const textFill = document.createElementNS("http://www.w3.org/2000/svg", "text");
                    textFill.setAttribute("x", x + 2);
                    textFill.setAttribute("y", y + 12);
                    textFill.setAttribute("font-family", "Arial, sans-serif");
                    textFill.setAttribute("font-size", "12");
                    textFill.setAttribute("font-weight", "bold");
                    textFill.setAttribute("fill", "#FFFFFF");
                    textFill.textContent = `${index + 1}`;
                    trackedGroup.appendChild(textFill);
                });

                svg.appendChild(trackedGroup);
                console.log("SVG Export - Added tracked cells group with", this.trackedCells.length, "cells");
            }

            // Add text details as SVG text (crisp and scalable)
            const textGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
            textGroup.setAttribute("class", "heatmap-text");
            
            // Background rectangle for text
            const textBg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            textBg.setAttribute("x", 10);
            textBg.setAttribute("y", 10);
            textBg.setAttribute("width", 320);
            textBg.setAttribute("height", 80);
            textBg.setAttribute("fill", "white");
            textBg.setAttribute("fill-opacity", "0.8");
            textBg.setAttribute("stroke", "#333");
            textBg.setAttribute("stroke-width", "1");
            textBg.setAttribute("rx", "5");
            textBg.setAttribute("ry", "5");
            textGroup.appendChild(textBg);
            
            // Create text lines
            const textLines = [
                `Iteration: ${this.iteration} | Time: ${currentTime}`,
                `Range: ${this.minValue.toExponential(2)} - ${this.maxValue.toExponential(2)}`,
                `Brush selected (input): ${this.brushSelectedCells} cells`,
                `Tracked cells (plot): ${this.trackedCells.length}`
            ];
            
            // Add each text line
            textLines.forEach((line, index) => {
                const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
                text.setAttribute("x", 20);
                text.setAttribute("y", 30 + (index * 15));
                text.setAttribute("font-family", "Arial, sans-serif");
                text.setAttribute("font-size", "12");
                text.setAttribute("fill", "#333");
                text.textContent = line;
                textGroup.appendChild(text);
            });
            
            svg.appendChild(textGroup);
            
            const svgString = new XMLSerializer().serializeToString(svg);
            const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            
            // Create and trigger download
            const link = document.createElement("a");
            link.href = url;
            link.download = `ecm-heatmap-${this.iteration}-600x600.svg`;
            
            // Append to body, click, and remove
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // Revoke the object URL
            setTimeout(() => {
                URL.revokeObjectURL(url);
            }, 100);
            
            console.log("SVG export completed successfully");
            
        } catch (error) {
            console.error("Error exporting SVG:", error);
            alert("Failed to export SVG: " + error.message);
        }
    }
    
    exportCanvasToPNG() {
        try {
            console.log("Starting PNG export...");
            
            // Create a temporary canvas for high-resolution PNG
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = 600;
            tempCanvas.height = 600;
            const tempCtx = tempCanvas.getContext('2d');
            
            // Scale the original canvas content to 600x600
            tempCtx.drawImage(this.canvas, 0, 0, this.canvas.width, this.canvas.height, 
                            0, 0, 600, 600);
            
            const dataUrl = tempCanvas.toDataURL('image/png');
            
            // Create and trigger download
            const link = document.createElement('a');
            link.href = dataUrl;
            link.download = `ecm-heatmap-${this.iteration}-600x600.png`;
            
            // Append to body, click, and remove
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            console.log("PNG export completed successfully");

        } catch (error) {
            console.error("Error exporting PNG:", error);
            alert("Failed to export PNG: " + error.message);
        }
    }

    exportLinePlotToPNG() {
        try {
            console.log("Starting Line Plot PNG export...");

            const dataUrl = this.linePlotCanvas.toDataURL('image/png');

            // Create and trigger download
            const link = document.createElement('a');
            link.href = dataUrl;
            link.download = `ecm-lineplot-${this.iteration}.png`;

            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            console.log("Line Plot PNG export completed successfully");

        } catch (error) {
            console.error("Error exporting Line Plot PNG:", error);
            alert("Failed to export Line Plot PNG: " + error.message);
        }
    }

    exportLinePlotToSVG() {
        try {
            console.log("Starting Line Plot SVG export...");

            const width = this.linePlotCanvas.width;
            const height = this.linePlotCanvas.height;
            const padding = 40;
            const plotWidth = width - padding * 2;
            const plotHeight = height - padding * 2;

            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svg.setAttribute("width", width);
            svg.setAttribute("height", height);
            svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
            svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");

            // White background
            const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            bg.setAttribute("width", width);
            bg.setAttribute("height", height);
            bg.setAttribute("fill", "white");
            svg.appendChild(bg);

            // Draw axes
            const axes = document.createElementNS("http://www.w3.org/2000/svg", "path");
            axes.setAttribute("d", `M ${padding} ${padding} L ${padding} ${padding + plotHeight} L ${padding + plotWidth} ${padding + plotHeight}`);
            axes.setAttribute("stroke", "#000");
            axes.setAttribute("stroke-width", "1");
            axes.setAttribute("fill", "none");
            svg.appendChild(axes);

            // Draw grid lines
            for (let i = 0; i <= 10; i++) {
                const y = padding + plotHeight - (i * plotHeight / 10);
                const gridLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
                gridLine.setAttribute("x1", padding);
                gridLine.setAttribute("y1", y);
                gridLine.setAttribute("x2", padding + plotWidth);
                gridLine.setAttribute("y2", y);
                gridLine.setAttribute("stroke", "#eee");
                gridLine.setAttribute("stroke-width", "0.5");
                svg.appendChild(gridLine);
            }

            // Find max value for scaling
            let maxValue = 0;
            Object.values(this.concentrationData).forEach(data => {
                data.forEach(v => maxValue = Math.max(maxValue, v));
            });
            if (maxValue <= 0) maxValue = 1;

            // Draw data lines for each tracked cell
            this.trackedCells.forEach((cell, cellIndex) => {
                const key = `${cell.row},${cell.col}`;
                const data = this.concentrationData[key];

                if (data && data.length > 1) {
                    let pathD = '';
                    for (let i = 0; i < data.length; i++) {
                        const x = padding + (i / (data.length - 1)) * plotWidth;
                        const y = padding + plotHeight - (data[i] / maxValue * plotHeight);

                        if (i === 0) {
                            pathD = `M ${x} ${y}`;
                        } else {
                            pathD += ` L ${x} ${y}`;
                        }
                    }

                    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
                    path.setAttribute("d", pathD);
                    path.setAttribute("stroke", cell.color);
                    path.setAttribute("stroke-width", "2");
                    path.setAttribute("fill", "none");
                    svg.appendChild(path);
                }
            });

            // Draw legend (no background)
            const legendX = padding + plotWidth - 70;
            const legendY = padding + 10;

            // Draw legend entries
            this.trackedCells.forEach((cell, index) => {
                if (index < 8) {
                    const y = legendY + index * 18;

                    // Text first (just Cell number, no coordinates)
                    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
                    text.setAttribute("x", legendX);
                    text.setAttribute("y", y + 14);
                    text.setAttribute("font-family", "Arial, sans-serif");
                    text.setAttribute("font-size", "11");
                    text.setAttribute("fill", "#000");
                    text.textContent = `Cell ${index + 1}`;
                    svg.appendChild(text);

                    // Color line on the right side (closer to text)
                    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
                    line.setAttribute("x1", legendX + 35);
                    line.setAttribute("y1", y + 10);
                    line.setAttribute("x2", legendX + 55);
                    line.setAttribute("y2", y + 10);
                    line.setAttribute("stroke", cell.color);
                    line.setAttribute("stroke-width", "3");
                    svg.appendChild(line);
                }
            });

            // X-axis label
            const xLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
            xLabel.setAttribute("x", padding + plotWidth / 2);
            xLabel.setAttribute("y", height - 10);
            xLabel.setAttribute("font-family", "Arial, sans-serif");
            xLabel.setAttribute("font-size", "12");
            xLabel.setAttribute("fill", "#000");
            xLabel.setAttribute("text-anchor", "middle");
            xLabel.textContent = "Iterations";
            svg.appendChild(xLabel);

            // Y-axis labels
            const yLabel0 = document.createElementNS("http://www.w3.org/2000/svg", "text");
            yLabel0.setAttribute("x", padding - 5);
            yLabel0.setAttribute("y", padding + plotHeight + 3);
            yLabel0.setAttribute("font-family", "Arial, sans-serif");
            yLabel0.setAttribute("font-size", "12");
            yLabel0.setAttribute("fill", "#000");
            yLabel0.setAttribute("text-anchor", "end");
            yLabel0.textContent = "0";
            svg.appendChild(yLabel0);

            const yLabelMax = document.createElementNS("http://www.w3.org/2000/svg", "text");
            yLabelMax.setAttribute("x", padding - 5);
            yLabelMax.setAttribute("y", padding + 3);
            yLabelMax.setAttribute("font-family", "Arial, sans-serif");
            yLabelMax.setAttribute("font-size", "12");
            yLabelMax.setAttribute("fill", "#000");
            yLabelMax.setAttribute("text-anchor", "end");
            yLabelMax.textContent = maxValue.toFixed(3);
            svg.appendChild(yLabelMax);

            // Y-axis title (rotated)
            const yTitle = document.createElementNS("http://www.w3.org/2000/svg", "text");
            yTitle.setAttribute("x", 10);
            yTitle.setAttribute("y", padding + plotHeight / 2);
            yTitle.setAttribute("font-family", "Arial, sans-serif");
            yTitle.setAttribute("font-size", "12");
            yTitle.setAttribute("fill", "#000");
            yTitle.setAttribute("text-anchor", "middle");
            yTitle.setAttribute("transform", `rotate(-90, 10, ${padding + plotHeight / 2})`);
            yTitle.textContent = "Concentration";
            svg.appendChild(yTitle);

            // Serialize and download
            const svgString = new XMLSerializer().serializeToString(svg);
            const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
            const url = URL.createObjectURL(blob);

            const link = document.createElement("a");
            link.href = url;
            link.download = `ecm-lineplot-${this.iteration}.svg`;

            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            setTimeout(() => {
                URL.revokeObjectURL(url);
            }, 100);

            console.log("Line Plot SVG export completed successfully");

        } catch (error) {
            console.error("Error exporting Line Plot SVG:", error);
            alert("Failed to export Line Plot SVG: " + error.message);
        }
    }

    // Helper method to update min/max values
    updateMinMaxValues() {
        if (!this.wasm) return;
        
        try {
            // Get data based on molecule type (ECM or feedback)
            let dataPtr;
            let isFeedback = false;
            
            if (this.currentMoleculeIndex >= 100) {
                const adjustedIndex = this.currentMoleculeIndex - 100;
                dataPtr = this.wasm._getFeedbackData(adjustedIndex);
                isFeedback = true;
            } else {
                dataPtr = this.wasm._getECMData(this.currentMoleculeIndex);
            }
            
            // Track min/max values
            this.minValue = 1.0;
            this.maxValue = 0.0;
            
            for (let i = 0; i < this.gridSize; i++) {
                for (let j = 0; j < this.gridSize; j++) {
                    const value = this.wasm._readDataValue(dataPtr, i, j);
                    if (value > 0) {
                        this.minValue = Math.min(this.minValue, value);
                        this.maxValue = Math.max(this.maxValue, value);
                    }
                }
            }
            
            // Avoid division by zero
            if (this.maxValue <= 0) this.maxValue = 0.01;
            if (this.minValue >= this.maxValue) this.minValue = 0;
            
            // Free the data memory
            this.wasm._freeData(dataPtr);
            
        } catch (error) {
            console.error("Error updating min/max values:", error);
        }
    }
    
    // Toggle cell selection mode
    toggleCellSelectionMode() {
        this.cellSelectionMode = !this.cellSelectionMode;
        const button = document.getElementById('cell-select-toggle');

        if (this.cellSelectionMode) {
            // Do NOT disable brush mode - let both modes coexist
            button.textContent = 'Disable Cell Selection';
            button.style.backgroundColor = '#ff6600';
            button.style.color = 'white';
            this.canvas.style.cursor = 'pointer';
        } else {
            button.textContent = 'Enable Cell Selection';
            button.style.backgroundColor = '';
            button.style.color = '';
            this.canvas.style.cursor = 'default';
        }

        this.updateVisualization();
    }
    
    // Handle individual cell click for tracking
    handleCellClick(e) {
        if (!this.cellSelectionMode) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Convert canvas coordinates to grid coordinates
        const scale = 500 / this.gridSize; // Use display size (500px)
        const gridCol = Math.floor(x / scale);
        const gridRow = Math.floor(y / scale);
        
        // Check if this cell is already tracked
        const existingIndex = this.trackedCells.findIndex(
            cell => cell.row === gridRow && cell.col === gridCol
        );
        
        if (existingIndex >= 0) {
            // Remove if already tracked
            this.trackedCells.splice(existingIndex, 1);
            delete this.concentrationData[`${gridRow},${gridCol}`];
        } else if (this.trackedCells.length < 8) {
            // Add new cell with a unique color
            const color = this.cellColors[this.trackedCells.length];
            this.trackedCells.push({
                row: gridRow,
                col: gridCol,
                color: color
            });
            
            // Initialize concentration tracking for this cell
            this.concentrationData[`${gridRow},${gridCol}`] = [];
        }
        
        this.updateTrackedCellsUI();
        this.updateVisualization();
    }
    
    // Clear all tracked cells
    clearTrackedCells() {
        this.trackedCells = [];
        this.concentrationData = {};
        this.updateTrackedCellsUI();
        this.updateVisualization();
    }
    
    // Update tracked cells UI
    updateTrackedCellsUI() {
        const info = document.getElementById('cells-info');
        const count = this.trackedCells.length;
        info.textContent = `${count} cells selected for tracking (max 8)`;
        
        // Update concentration edit controls for tracked cells
        const container = document.getElementById('tracked-cells-container');
        container.innerHTML = '';
        
        if (count > 0 && this.wasm) {
            // Get current molecule name
            let moleculeName = 'proCI';
            if (this.currentMoleculeIndex >= 100) {
                const fbIndex = this.currentMoleculeIndex - 100;
                moleculeName = this.fbMolecules.find(m => m.index === fbIndex)?.name || 'TGFBfb';
            } else {
                moleculeName = this.ecmMolecules.find(m => m.index === this.currentMoleculeIndex)?.name || 'proCI';
            }
            
            const title = document.createElement('div');
            title.style.fontWeight = 'bold';
            title.style.marginBottom = '10px';
            title.textContent = `Edit ${moleculeName} Concentration:`;
            container.appendChild(title);
            
            this.trackedCells.forEach((cell, index) => {
                const cellDiv = document.createElement('div');
                cellDiv.style.marginBottom = '10px';
                cellDiv.style.display = 'flex';
                cellDiv.style.alignItems = 'center';
                
                // Color indicator
                const colorBox = document.createElement('span');
                colorBox.style.display = 'inline-block';
                colorBox.style.width = '20px';
                colorBox.style.height = '20px';
                colorBox.style.backgroundColor = cell.color;
                colorBox.style.border = '1px solid black';
                colorBox.style.marginRight = '10px';
                
                // Cell label
                const label = document.createElement('span');
                label.textContent = `Cell ${index + 1} (${cell.row},${cell.col}):`;
                label.style.width = '120px';
                label.style.marginRight = '10px';
                
                // Get current value
                let dataPtr;
                let isFeedback = false;
                if (this.currentMoleculeIndex >= 100) {
                    const adjustedIndex = this.currentMoleculeIndex - 100;
                    dataPtr = this.wasm._getFeedbackData(adjustedIndex);
                    isFeedback = true;
                } else {
                    dataPtr = this.wasm._getECMData(this.currentMoleculeIndex);
                }
                
                const currentValue = this.wasm._readDataValue(dataPtr, cell.row, cell.col);
                this.wasm._freeData(dataPtr);
                
                // Value input
                const valueInput = document.createElement('input');
                valueInput.type = 'number';
                valueInput.min = '0';
                valueInput.max = '1';
                valueInput.step = '0.01';
                valueInput.value = currentValue.toFixed(4);
                valueInput.style.width = '80px';
                
                valueInput.addEventListener('change', (e) => {
                    const newValue = parseFloat(e.target.value);
                    
                    // Apply the change to the simulation grid
                    this.wasm._setCellConcentration(
                        isFeedback ? 1 : 0,
                        isFeedback ? this.currentMoleculeIndex - 100 : this.currentMoleculeIndex,
                        cell.row, cell.col, newValue
                    );
                    
                    this.updateVisualization();
                });
                
                cellDiv.appendChild(colorBox);
                cellDiv.appendChild(label);
                cellDiv.appendChild(valueInput);
                container.appendChild(cellDiv);
            });
        }
    }
    
    // Brush mode toggle
    toggleBrushMode() {
        this.brushMode = !this.brushMode;
        const button = document.getElementById('brush-toggle');

        if (this.brushMode) {
            // Do NOT disable cell selection mode - let both modes coexist
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
    
    // Clear brush selection
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
        // Don't paint if cell selection mode is enabled (cell selection takes priority)
        if (!this.brushMode || this.cellSelectionMode) return;

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
        const scale = 500 / this.gridSize; // Use display size (500px)
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
        info.textContent = `${count} cells selected for input`;
    }
    
    // Apply current input values to selected cells
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
                // Apply input concentrations to selected cells before each step
                this.applyInputToSelectedCells();
                
                this.wasm._simulateStep(this.timeStep);
                this.iteration++;
                this.currentTime = this.iteration * this.timeStep; // Update current time
                this.updateVisualization();
                this.updateTrackedCellsUI(); // Update input values to reflect simulation changes
            } catch (error) {
                console.error("Error during simulation step:", error);
                this.stopSimulation();
            }
        }
    }
    
    // Reset simulation with proper cleanup
    resetSimulation() {
        if (this.wasm) {
            try {
                // Reset the iteration counter
                this.iteration = 0;
                this.currentTime = 0.0;
                
                // Clear concentration data for tracked cells
                Object.keys(this.concentrationData).forEach(key => {
                    this.concentrationData[key] = [];
                });
                
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
                
                // Update visualization
                this.updateVisualization();
                this.updateTrackedCellsUI();
                
                console.log("Simulation reset");
            } catch (error) {
                console.error("Error resetting simulation:", error);
            }
        }
    }
    
    // Simulation loop
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
            this.minValue = 1.0;
            this.maxValue = 0.0;
            
            // First pass: find min/max values
            for (let i = 0; i < this.gridSize; i++) {
                for (let j = 0; j < this.gridSize; j++) {
                    const value = this.wasm._readDataValue(dataPtr, i, j);
                    if (value > 0) {
                        this.minValue = Math.min(this.minValue, value);
                        this.maxValue = Math.max(this.maxValue, value);
                    }
                }
            }
            
            // Avoid division by zero
            if (this.maxValue <= 0) this.maxValue = 0.01;
            if (this.minValue >= this.maxValue) this.minValue = 0;
            
            // Apply log scaling for better visualization
            const logMin = this.minValue > 0 ? Math.log10(this.minValue) : -3;
            const logMax = Math.log10(this.maxValue);
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
            
            // Draw brush selection overlay if there are selected cells (regardless of brush mode)
            if (this.selectedCellsForInput.size > 0) {
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
            
            // Draw tracked cells with thick colored borders
            this.trackedCells.forEach((cell, index) => {
                const x = cell.col * scale;
                const y = cell.row * scale;
                
                // Draw thick colored border
                this.ctx.strokeStyle = cell.color;
                this.ctx.lineWidth = 4;
                this.ctx.strokeRect(x - 2, y - 2, scale + 4, scale + 4);
                
                // Draw white inner border for contrast
                this.ctx.strokeStyle = '#FFFFFF';
                this.ctx.lineWidth = 1;
                this.ctx.strokeRect(x, y, scale, scale);
                
                // Add cell number label
                this.ctx.fillStyle = '#FFFFFF';
                this.ctx.strokeStyle = '#000000';
                this.ctx.lineWidth = 3;
                this.ctx.font = 'bold 12px Arial';
                const text = `${index + 1}`;
                this.ctx.strokeText(text, x + 2, y + 12);
                this.ctx.fillText(text, x + 2, y + 12);
            });
            
            // Add iteration counter and range info
            this.ctx.fillStyle = 'white';
            this.ctx.fillRect(10, 10, 320, 80);
            this.ctx.fillStyle = 'black';
            this.ctx.font = '16px Arial';
            this.ctx.fillText(`Iteration: ${this.iteration} | Time: ${(this.iteration * this.timeStep).toFixed(2)}`, 15, 30);
            this.ctx.font = '12px Arial';
            this.ctx.fillText(`Range: ${this.minValue.toExponential(2)} - ${this.maxValue.toExponential(2)}`, 15, 50);
            this.ctx.fillText(`Brush selected (input): ${this.selectedCellsForInput.size} cells`, 15, 70);
            this.ctx.fillText(`Tracked cells (plot): ${this.trackedCells.length}`, 15, 90);
            
            // Update line plots for tracked cells
            this.updateLinePlots(dataPtr, isFeedback);
            
            // Free the data memory
            this.wasm._freeData(dataPtr);
            
        } catch (error) {
            console.error("Error updating visualization:", error);
        }
    }
    
    updateLinePlots(dataPtr, isFeedback) {
        if (!this.wasm || this.trackedCells.length === 0) return;
        
        // Clear line plot canvas
        this.linePlotCtx.clearRect(0, 0, this.linePlotCanvas.width, this.linePlotCanvas.height);
        
        // Get current values for tracked cells and update concentration data
        this.trackedCells.forEach(cell => {
            const key = `${cell.row},${cell.col}`;
            const value = this.wasm._readDataValue(dataPtr, cell.row, cell.col);
            
            if (!this.concentrationData[key]) {
                this.concentrationData[key] = [];
            }
            
            this.concentrationData[key].push(value);
            
            // Limit data history to keep plots manageable
            const maxDataPoints = 300;
            if (this.concentrationData[key].length > maxDataPoints) {
                this.concentrationData[key].shift();
            }
        });
        
        // Draw line plots
        const padding = 40;
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
        for (let i = 0; i <= 10; i++) {
            const y = padding + plotHeight - (i * plotHeight / 10);
            this.linePlotCtx.beginPath();
            this.linePlotCtx.moveTo(padding, y);
            this.linePlotCtx.lineTo(padding + plotWidth, y);
            this.linePlotCtx.stroke();
        }
        
        // Find max value for scaling
        let maxValue = 0;
        Object.values(this.concentrationData).forEach(data => {
            data.forEach(v => maxValue = Math.max(maxValue, v));
        });
        if (maxValue <= 0) maxValue = 1;
        
        // Draw data for each tracked cell
        this.trackedCells.forEach((cell, cellIndex) => {
            const key = `${cell.row},${cell.col}`;
            const data = this.concentrationData[key];
            
            if (data && data.length > 1) {
                this.linePlotCtx.strokeStyle = cell.color;
                this.linePlotCtx.lineWidth = 2;
                this.linePlotCtx.beginPath();
                
                for (let i = 0; i < data.length; i++) {
                    const x = padding + (i / (data.length - 1)) * plotWidth;
                    const y = padding + plotHeight - (data[i] / maxValue * plotHeight);
                    
                    if (i === 0) {
                        this.linePlotCtx.moveTo(x, y);
                    } else {
                        this.linePlotCtx.lineTo(x, y);
                    }
                }
                this.linePlotCtx.stroke();
            }
        });
        
        // Add legend (no background)
        const legendX = padding + plotWidth - 70;
        const legendY = padding + 10;

        // Draw legend entries
        this.trackedCells.forEach((cell, index) => {
            if (index < 8) {
                const y = legendY + index * 18;

                // Text first (just Cell number, no coordinates)
                this.linePlotCtx.fillStyle = '#000';
                this.linePlotCtx.font = '11px Arial';
                this.linePlotCtx.fillText(`Cell ${index + 1}`, legendX, y + 14);

                // Color line on the right side (closer to text)
                this.linePlotCtx.strokeStyle = cell.color;
                this.linePlotCtx.lineWidth = 3;
                this.linePlotCtx.beginPath();
                this.linePlotCtx.moveTo(legendX + 35, y + 10);
                this.linePlotCtx.lineTo(legendX + 55, y + 10);
                this.linePlotCtx.stroke();
            }
        });
        
        // Add axis labels
        this.linePlotCtx.fillStyle = '#000';
        this.linePlotCtx.font = '12px Arial';
        this.linePlotCtx.textAlign = 'center';
        this.linePlotCtx.fillText('Iterations', padding + plotWidth / 2, this.linePlotCanvas.height - 10);
        
        // Y-axis labels
        this.linePlotCtx.textAlign = 'right';
        this.linePlotCtx.fillText('0', padding - 5, padding + plotHeight + 3);
        this.linePlotCtx.fillText(maxValue.toFixed(3), padding - 5, padding + 3);
        
        // Y-axis title
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