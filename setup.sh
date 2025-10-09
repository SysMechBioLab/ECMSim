#!/bin/bash

# Create project structure
mkdir -p ecm_simulation
cd ecm_simulation

# Save the C++ code
cat > ecm.cpp << 'EOF'
#include <vector>
#include <unordered_map>
#include <string>
#include <cstring>
#include <emscripten.h>
#include <emscripten/bind.h>
#include <emscripten/val.h>

using namespace emscripten;

const int GRID_SIZE = 100;
const int NUM_MOLECULES = 50; // Adjust based on your actual molecules

struct Cell {
    std::unordered_map<std::string, double> icm;
    std::unordered_map<std::string, double> ecm;
    std::unordered_map<std::string, double> feedback;
}

EMSCRIPTEN_KEEPALIVE
void simulateStep() {
    // Update intracellular signaling
    for (auto& row : grid) {
        for (auto& cell : row) {
            updateICM(cell);
        }
    }
    
    // Diffuse feedback molecules (simple averaging with neighbors)
    for (int i = 1; i < GRID_SIZE-1; i++) {
        for (int j = 1; j < GRID_SIZE-1; j++) {
            for (auto& [key, val] : grid[i][j].feedback) {
                double sum = 0;
                for (int di = -1; di <= 1; di++) {
                    for (int dj = -1; dj <= 1; dj++) {
                        sum += grid[i+di][j+dj].feedback[key];
                    }
                }
                grid[i][j].feedback[key] = sum / 9.0;
            }
        }
    }
}

EMSCRIPTEN_KEEPALIVE
void setInputConcentration(const char* molecule, double value) {
    std::string mol(molecule);
    for (auto& row : grid) {
        for (auto& cell : row) {
            cell.icm[mol] = value;
        }
    }
}

// String handling functions
EMSCRIPTEN_KEEPALIVE
char* allocateString(const std::string& str) {
    char* ptr = (char*)malloc(str.length() + 1);
    strcpy(ptr, str.c_str());
    return ptr;
}

EMSCRIPTEN_KEEPALIVE
void freeString(char* ptr) {
    free(ptr);
}

EMSCRIPTEN_KEEPALIVE
val getECMData(const char* molecule) {
    std::string mol(molecule);
    val result = val::array();
    for (int i = 0; i < GRID_SIZE; i++) {
        val row = val::array();
        for (int j = 0; j < GRID_SIZE; j++) {
            row.call<void>("push", grid[i][j].ecm[mol]);
        }
        result.call<void>("push", row);
    }
    return result;
}

EMSCRIPTEN_KEEPALIVE
val getFeedbackData(const char* molecule) {
    std::string mol(molecule);
    val result = val::array();
    for (int i = 0; i < GRID_SIZE; i++) {
        val row = val::array();
        for (int j = 0; j < GRID_SIZE; j++) {
            row.call<void>("push", grid[i][j].feedback[mol]);
        }
        result.call<void>("push", row);
    }
    return result;
}

EMSCRIPTEN_KEEPALIVE
double* allocateData(int size) {
    return (double*)malloc(size * size * sizeof(double));
}

EMSCRIPTEN_KEEPALIVE
void freeData(double* ptr) {
    free(ptr);
}

EMSCRIPTEN_KEEPALIVE
double readDataValue(double* data, int i, int j) {
    return data[i * GRID_SIZE + j];
}

EMSCRIPTEN_BINDINGS(ECMModule) {
    function("initializeGrid", &initializeGrid);
    function("simulateStep", &simulateStep);
    function("setInputConcentration", &setInputConcentration);
    function("getECMData", &getECMData);
    function("getFeedbackData", &getFeedbackData);
    function("allocateString", &allocateString);
    function("freeString", &freeString);
    function("allocateData", &allocateData);
    function("freeData", &freeData);
    function("readDataValue", &readDataValue);
}
EOF

# Save the updated JavaScript file as ecm_visualizer.js
cat > ecm_visualizer.js << 'EOF'
class ECMVisualizer {
    constructor() {
        this.gridSize = 100;
        this.currentMolecule = 'proCI';
        this.simulationRunning = false;
        this.iteration = 0;
        
        // Initialize UI
        this.initUI();
        this.initCanvas();
        
        // Connect to WebAssembly module
        this.initWasm();
    }
    
    initUI() {
        // Create molecule selector
        const ecmMolecules = ['proCI', 'proCIII', 'EDAFN', 'TIMP1', 'TIMP2', 
                                'proMMP1', 'proMMP2', 'proMMP3', 'proMMP8', 
                                'proMMP9', 'proMMP12', 'proMMP14'];
        const fbMolecules = ['TGFBfb', 'AngIIfb', 'IL6fb', 'ET1fb', 'tensionfb'];
        
        const selector = document.createElement('select');
        selector.id = 'molecule-selector';
        
        const addOptions = (groupName, molecules) => {
            const group = document.createElement('optgroup');
            group.label = groupName;
            molecules.forEach(mol => {
                const option = document.createElement('option');
                option.value = mol;
                option.textContent = mol;
                group.appendChild(option);
            });
            selector.appendChild(group);
        };
        
        addOptions('ECM Molecules', ecmMolecules);
        addOptions('Feedback Molecules', fbMolecules);
        selector.value = this.currentMolecule;
        selector.addEventListener('change', (e) => {
            this.currentMolecule = e.target.value;
            this.updateVisualization();
        });
        
        document.body.appendChild(selector);
        
        // Create input molecule controls
        const inputMolecules = ['AngIIin', 'TGFBin', 'IL6in', 'IL1in', 'TNFain', 
                                'NEin', 'PDGFin', 'ET1in', 'NPin', 'E2in'];
        
        const inputContainer = document.createElement('div');
        inputContainer.id = 'input-controls';
        
        inputMolecules.forEach(mol => {
            const div = document.createElement('div');
            div.className = 'input-control';
            
            const label = document.createElement('label');
            label.textContent = mol;
            label.htmlFor = `input-${mol}`;
            
            const input = document.createElement('input');
            input.type = 'range';
            input.id = `input-${mol}`;
            input.min = '0';
            input.max = '1';
            input.step = '0.01';
            input.value = '0';
            input.addEventListener('input', (e) => {
                this.setInputConcentration(mol, parseFloat(e.target.value));
            });
            
            div.appendChild(label);
            div.appendChild(input);
            inputContainer.appendChild(div);
        });
        
        document.body.appendChild(inputContainer);
        
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
        
        controls.appendChild(startButton);
        controls.appendChild(stopButton);
        controls.appendChild(stepButton);
        document.body.appendChild(controls);
    }
    
    initCanvas() {
        this.canvas = document.createElement('canvas');
        this.canvas.width = 500;
        this.canvas.height = 500;
        this.ctx = this.canvas.getContext('2d');
        document.body.appendChild(this.canvas);
    }
    
    async initWasm() {
        try {
            // Load the WebAssembly module using the generated wrapper
            const module = await ECMModule();
            this.wasm = module;
            
            // Initialize the grid
            this.wasm.initializeGrid();
            console.log("WASM module initialized successfully");
            
            // Update the visualization
            this.updateVisualization();
            
            // Update status
            const status = document.querySelector('.status');
            if (status) {
                status.textContent = "Simulation loaded and ready.";
            }
        } catch (error) {
            console.error("Failed to initialize WASM module:", error);
            const status = document.querySelector('.status');
            if (status) {
                status.textContent = "Error: " + error.message;
                status.style.color = "red";
            }
        }
    }
    
    setInputConcentration(molecule, value) {
        if (this.wasm) {
            try {
                const stringPtr = this.wasm.allocateString(molecule);
                this.wasm.setInputConcentration(stringPtr, value);
                this.wasm.freeString(stringPtr);
                this.updateVisualization();
            } catch (error) {
                console.error(`Error setting concentration for ${molecule}:`, error);
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
                this.wasm.simulateStep();
                this.iteration++;
                this.updateVisualization();
            } catch (error) {
                console.error("Error during simulation step:", error);
                this.stopSimulation();
            }
        }
    }
    
    simulationLoop() {
        if (!this.simulationRunning) return;
        
        this.stepSimulation();
        requestAnimationFrame(() => this.simulationLoop());
    }
    
    updateVisualization() {
        if (!this.wasm) return;
        
        try {
            // Get visualization data based on molecule type
            let dataArray;
            const stringPtr = this.wasm.allocateString(this.currentMolecule);
            
            if (this.currentMolecule.endsWith('fb')) {
                // For feedback molecules
                dataArray = this.wasm.getFeedbackData(stringPtr);
            } else {
                // For ECM molecules
                dataArray = this.wasm.getECMData(stringPtr);
            }
            
            this.wasm.freeString(stringPtr);
            
            // Create scaled canvas for display
            const scale = this.canvas.width / this.gridSize;
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            
            // Draw the heatmap
            for (let i = 0; i < this.gridSize; i++) {
                for (let j = 0; j < this.gridSize; j++) {
                    const value = dataArray[i][j] || 0;
                    
                    // Create heatmap color (red to yellow for ECM, blue for feedback)
                    let r, g, b;
                    
                    if (this.currentMolecule.endsWith('fb')) {
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
            
            // Add iteration counter
            this.ctx.fillStyle = 'white';
            this.ctx.fillRect(10, 10, 100, 30);
            this.ctx.fillStyle = 'black';
            this.ctx.font = '16px Arial';
            this.ctx.fillText(`Iteration: ${this.iteration}`, 15, 30);
            
        } catch (error) {
            console.error("Error updating visualization:", error);
        }
    }
}

// Initialize visualizer when page loads and WASM module is available
window.addEventListener('DOMContentLoaded', () => {
    // The ECMModule will be defined by the emscripten-generated code
    if (typeof ECMModule !== 'undefined') {
        new ECMVisualizer();
    } else {
        console.error("ECMModule not found. Make sure ecm.js from Emscripten is loaded first.");
    }
});
EOF

# Save the HTML file
cat > index.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ECM Signaling Pathway Visualization</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 20px;
        }
        
        #molecule-selector {
            margin-bottom: 20px;
            padding: 5px;
            font-size: 16px;
        }
        
        #input-controls {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
            margin-bottom: 20px;
        }
        
        .input-control {
            display: flex;
            align-items: center;
        }
        
        .input-control label {
            width: 80px;
            margin-right: 10px;
        }
        
        .input-control input {
            flex-grow: 1;
        }
        
        #simulation-controls {
            margin-bottom: 20px;
        }
        
        #simulation-controls button {
            padding: 8px 15px;
            margin-right: 10px;
            font-size: 14px;
        }
        
        canvas {
            border: 1px solid #ccc;
            margin-top: 20px;
        }
        
        .status {
            margin-top: 10px;
            font-style: italic;
            color: #666;
        }
    </style>
</head>
<body>
    <h1>ECM Signaling Pathway Visualization</h1>
    <div class="status">Loading simulation...</div>
    
    <!-- First load the Emscripten generated module -->
    <script src="ecm.js"></script>
    
    <!-- Then load our custom JS code -->
    <script src="ecm_visualizer.js"></script>
</body>
</html>
EOF

# Create compile script
cat > compile.sh << 'EOF'
#!/bin/bash
# Make sure the Emscripten SDK is activated before running this script

# Compile the C++ code to WebAssembly
emcc -std=c++17 ecm.cpp -o ecm.js \
    -s WASM=1 \
    -s EXPORTED_RUNTIME_METHODS='["ccall", "cwrap"]' \
    -s EXPORTED_FUNCTIONS='["_malloc", "_free"]' \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s MODULARIZE=1 \
    -s EXPORT_NAME="ECMModule"

echo "Compilation complete. Now start a web server to view the simulation."
EOF

# Make the compile script executable
chmod +x compile.sh

# Create a simple server script
cat > server.sh << 'EOF'
#!/bin/bash
# Simple Python HTTP server to serve the files
python3 -m http.server 8000
EOF

# Make the server script executable
chmod +x server.sh

echo "Setup complete! Project created in the 'ecm_simulation' directory."
echo "Next steps:"
echo "1. Activate the Emscripten SDK"
echo "2. Run ./compile.sh to compile the C++ code"
echo "3. Run ./server.sh to start a local web server"
echo "4. Open http://localhost:8000 in your browser"
;

std::vector<std::vector<Cell>> grid(GRID_SIZE, std::vector<Cell>(GRID_SIZE));

// Initialize all molecules in the grid
EMSCRIPTEN_KEEPALIVE
void initializeGrid() {
    for (int i = 0; i < GRID_SIZE; i++) {
        for (int j = 0; j < GRID_SIZE; j++) {
            grid[i][j].icm.clear();
            grid[i][j].ecm.clear();
            grid[i][j].feedback.clear();
            
            // Initialize input molecules with default values
            grid[i][j].icm["AngIIin"] = 0;
            grid[i][j].icm["TGFBin"] = 0;
            grid[i][j].icm["tensionin"] = 0;
            grid[i][j].icm["IL6in"] = 0;
            grid[i][j].icm["IL1in"] = 0;
            grid[i][j].icm["TNFain"] = 0;
            grid[i][j].icm["NEin"] = 0;
            grid[i][j].icm["PDGFin"] = 0;
            grid[i][j].icm["ET1in"] = 0;
            grid[i][j].icm["NPin"] = 0;
            grid[i][j].icm["E2in"] = 0;
            
            // Initialize feedback molecules
            grid[i][j].feedback["TGFBfb"] = 0;
            grid[i][j].feedback["AngIIfb"] = 0;
            grid[i][j].feedback["IL6fb"] = 0;
            grid[i][j].feedback["ET1fb"] = 0;
            grid[i][j].feedback["tensionfb"] = 0;
            
            // Initialize ECM molecules with small random values
            grid[i][j].ecm["proCI"] = 0.01 * (rand() % 10) / 10.0;
            grid[i][j].ecm["proCIII"] = 0.01 * (rand() % 10) / 10.0;
            grid[i][j].ecm["fibronectin"] = 0.01 * (rand() % 10) / 10.0;
            grid[i][j].ecm["periostin"] = 0.01 * (rand() % 10) / 10.0;
            grid[i][j].ecm["TNC"] = 0.01 * (rand() % 10) / 10.0;
            grid[i][j].ecm["PAI1"] = 0.01 * (rand() % 10) / 10.0;
            grid[i][j].ecm["CTGF"] = 0.01 * (rand() % 10) / 10.0;
            grid[i][j].ecm["EDAFN"] = 0.01 * (rand() % 10) / 10.0;
            
            // Initialize MMPs and TIMPs
            grid[i][j].ecm["proMMP1"] = 0.01 * (rand() % 10) / 10.0;
            grid[i][j].ecm["proMMP2"] = 0.01 * (rand() % 10) / 10.0;
            grid[i][j].ecm["proMMP3"] = 0.01 * (rand() % 10) / 10.0;
            grid[i][j].ecm["proMMP8"] = 0.01 * (rand() % 10) / 10.0;
            grid[i][j].ecm["proMMP9"] = 0.01 * (rand() % 10) / 10.0;
            grid[i][j].ecm["proMMP12"] = 0.01 * (rand() % 10) / 10.0;
            grid[i][j].ecm["proMMP14"] = 0.01 * (rand() % 10) / 10.0;
            grid[i][j].ecm["TIMP1"] = 0.01 * (rand() % 10) / 10.0;
            grid[i][j].ecm["TIMP2"] = 0.01 * (rand() % 10) / 10.0;
        }
    }
}

// Update intracellular signaling based on your rules
void updateICM(Cell& cell) {
    // Input signals to ligands
    cell.icm["AngII"] = cell.icm["AngIIin"] + cell.feedback["AngIIfb"];
    cell.icm["TGFB"] = cell.icm["TGFBin"] + cell.feedback["TGFBfb"];
    cell.icm["tension"] = cell.icm["tensionin"] + cell.feedback["tensionfb"];
    cell.icm["IL6"] = cell.icm["IL6in"] + cell.feedback["IL6fb"];
    cell.icm["IL1"] = cell.icm["IL1in"];
    cell.icm["TNFa"] = cell.icm["TNFain"];
    cell.icm["NE"] = cell.icm["NEin"];
    cell.icm["PDGF"] = cell.icm["PDGFin"];
    cell.icm["ET1"] = cell.icm["ET1in"] + cell.feedback["ET1fb"];
    cell.icm["NP"] = cell.icm["NPin"];
    cell.icm["E2"] = cell.icm["E2in"];

    // Receptor activation
    cell.icm["AT1R"] = cell.icm["AngII"] * (1.0 - cell.icm["ERB"]);
    cell.icm["TGFB1R"] = cell.icm["TGFB"] * (1.0 - cell.icm["BAMBI"]);
    cell.icm["ETAR"] = cell.icm["ET1"];
    cell.icm["IL1RI"] = cell.icm["IL1"];
    cell.icm["PDGFR"] = cell.icm["PDGF"];
    cell.icm["TNFaR"] = cell.icm["TNFa"];
    cell.icm["NPRA"] = cell.icm["NP"];
    cell.icm["gp130"] = cell.icm["IL6"];
    cell.icm["BAR"] = cell.icm["NE"];
    cell.icm["AT2R"] = cell.icm["AngII"];

    // Second messengers
    cell.icm["NOX"] = cell.icm["AT1R"] + cell.icm["TGFB1R"];
    cell.icm["ROS"] = cell.icm["NOX"] + cell.icm["ETAR"];
    cell.icm["DAG"] = cell.icm["ETAR"] + cell.icm["AT1R"];
    cell.icm["AC"] = cell.icm["BAR"] + cell.icm["BAR"] * cell.icm["AT1R"];
    cell.icm["cAMP"] = cell.icm["AC"] + cell.icm["ERB"];
    cell.icm["cGMP"] = cell.icm["NPRA"];
    cell.icm["Ca"] = cell.icm["TRPC"];
    
    // Kinases and phosphatases
    cell.icm["PKA"] = cell.icm["cAMP"] + cell.icm["ERB"];
    cell.icm["PKG"] = cell.icm["cGMP"];
    cell.icm["PKC"] = cell.icm["DAG"] * cell.icm["mTORC2"] + cell.icm["syndecan4"];
    cell.icm["calcineurin"] = cell.icm["Ca"];
    cell.icm["PP1"] = cell.icm["p38"];
    
    // Transcription factors
    cell.icm["CREB"] = cell.icm["PKA"];
    cell.icm["CBP"] = (1.0 - cell.icm["smad3"]) + (1.0 - cell.icm["CREB"]);
    cell.icm["NFAT"] = cell.icm["calcineurin"];
    cell.icm["AP1"] = cell.icm["ERK"] + cell.icm["JNK"];
    cell.icm["STAT"] = cell.icm["gp130"];
    cell.icm["NFKB"] = (cell.icm["IL1RI"] * (1.0 - cell.icm["ERX"])) + 
                      (cell.icm["ERK"] * (1.0 - cell.icm["ERX"])) + 
                      (cell.icm["p38"] * (1.0 - cell.icm["ERX"])) + 
                      (cell.icm["Akt"] * (1.0 - cell.icm["ERX"]));
    cell.icm["SRF"] = cell.icm["MRTF"];
    cell.icm["MRTF"] = cell.icm["NFAT"] * (1.0 - cell.icm["Gactin"]);
    
    // MAPK pathways
    cell.icm["Ras"] = cell.icm["AT1R"] + cell.icm["Grb2"];
    cell.icm["Raf"] = cell.icm["Ras"];
    cell.icm["MEK1"] = cell.icm["Raf"] * (1.0 - cell.icm["ERK"]);
    cell.icm["ERK"] = cell.icm["MEK1"] * (1.0 - cell.icm["PP1"]) + 
                     (cell.icm["ROS"] * (1.0 - cell.icm["AT2R"]));
    cell.icm["p38"] = cell.icm["ROS"] + cell.icm["MKK3"] + cell.icm["Ras"] + 
                     (cell.icm["Rho"] * (1.0 - cell.icm["Rac1"]));
    cell.icm["JNK"] = cell.icm["ROS"] + 
                     (cell.icm["MKK4"] * (1.0 - cell.icm["NFKB"])) + 
                     (cell.icm["MKK4"] * (1.0 - cell.icm["Rho"]));
    cell.icm["MKK3"] = cell.icm["ASK1"];
    cell.icm["MKK4"] = cell.icm["MEKK1"] + cell.icm["ASK1"];
    cell.icm["MEKK1"] = cell.icm["FAK"] + cell.icm["Rac1"];
    cell.icm["ASK1"] = cell.icm["TRAF"] + cell.icm["IL1RI"];
    cell.icm["TRAF"] = cell.icm["TGFB1R"] + cell.icm["TNFaR"];
    
    // PI3K-Akt-mTOR pathway
    cell.icm["PI3K"] = cell.icm["TNFaR"] + cell.icm["TGFB1R"] + cell.icm["PDGFR"] + cell.icm["FAK"];
    cell.icm["Akt"] = cell.icm["PI3K"] * cell.icm["mTORC2"] + cell.icm["ERX"] + cell.icm["GPR30"];
    cell.icm["mTORC1"] = cell.icm["Akt"];
    cell.icm["mTORC2"] = (1.0 - cell.icm["p70S6K"]);
    cell.icm["p70S6K"] = cell.icm["mTORC1"];
    cell.icm["EBP1"] = (1.0 - cell.icm["mTORC1"]);
    
    // Rho/ROCK pathway
    // Fixed the missing parenthesis here:
    cell.icm["Rho"] = cell.icm["TGFB1R"] + 
                     (cell.icm["RhoGEF"] * (1.0 - cell.icm["RhoGDI"]) * (1.0 - cell.icm["PKG"]));
    cell.icm["ROCK"] = cell.icm["Rho"];
    cell.icm["RhoGEF"] = cell.icm["FAK"] * cell.icm["Src"];
    cell.icm["RhoGDI"] = (1.0 - cell.icm["Src"]) + cell.icm["PKA"] + (1.0 - cell.icm["PKC"]);
    
    // Cytoskeleton and adhesion
    cell.icm["Factin"] = cell.icm["ROCK"] * cell.icm["Gactin"];
    cell.icm["Gactin"] = (1.0 - cell.icm["Factin"]);
    cell.icm["B1int"] = cell.icm["tension"] + cell.icm["PKC"] * cell.icm["tension"];
    cell.icm["B3int"] = (cell.icm["tension"] * (1.0 - cell.icm["thrombospondin4"])) + cell.icm["osteopontin"];
    cell.icm["FAK"] = cell.icm["B1int"];
    cell.icm["Src"] = cell.icm["PDGFR"] + cell.icm["B3int"];
    cell.icm["Grb2"] = cell.icm["FAK"] * cell.icm["Src"];
    cell.icm["p130Cas"] = cell.icm["tension"] * cell.icm["Src"] + cell.icm["FAK"] * cell.icm["Src"];
    cell.icm["Rac1"] = cell.icm["abl"] + cell.icm["p130Cas"] * cell.icm["abl"];
    cell.icm["abl"] = cell.icm["PDGFR"];
    cell.icm["talin"] = cell.icm["B1int"] + cell.icm["B3int"];
    cell.icm["vinculin"] = cell.icm["contractility"] * cell.icm["talin"];
    cell.icm["paxillin"] = cell.icm["FAK"] * cell.icm["Src"] * cell.icm["MLC"];
    cell.icm["FA"] = cell.icm["vinculin"] * cell.icm["CDK1"] * (1.0 - cell.icm["paxillin"]);
    cell.icm["MLC"] = cell.icm["ROCK"];
    cell.icm["contractility"] = cell.icm["Factin"] * cell.icm["MLC"] + cell.icm["aSMA"] * cell.icm["MLC"];
    
    // YAP/TAZ signaling
    cell.icm["YAP"] = cell.icm["AT1R"] + cell.icm["Factin"];
    
    // Estrogen signaling
    cell.icm["ERX"] = cell.icm["E2"];
    cell.icm["ERB"] = cell.icm["E2"];
    cell.icm["GPR30"] = cell.icm["E2"];
    cell.icm["CyclinB1"] = (1.0 - cell.icm["GPR30"]);
    cell.icm["CDK1"] = cell.icm["CyclinB1"] * cell.icm["AngII"];
    
    // ECM production
    cell.icm["proCI"] = cell.icm["SRF"] + cell.icm["smad3"] * cell.icm["CBP"] * (1.0 - cell.icm["epac"]);
    cell.icm["proCIII"] = cell.icm["SRF"] + cell.icm["smad3"] * cell.icm["CBP"] * (1.0 - cell.icm["epac"]);
    cell.icm["fibronectin"] = cell.icm["smad3"] * cell.icm["CBP"] + cell.icm["NFKB"];
    cell.icm["periostin"] = cell.icm["smad3"] * cell.icm["CBP"] + cell.icm["CREB"] * cell.icm["CBP"];
    cell.icm["TNC"] = cell.icm["NFKB"] + cell.icm["MRTF"];
    cell.icm["PAI1"] = cell.icm["smad3"] + cell.icm["YAP"];
    cell.icm["CTGF"] = cell.icm["smad3"] * cell.icm["CBP"] * cell.icm["ERK"] + cell.icm["YAP"];
    cell.icm["aSMA"] = cell.icm["YAP"] + cell.icm["smad3"] * cell.icm["CBP"] + cell.icm["SRF"];
    cell.icm["LOX"] = cell.icm["Akt"];
    
    // MMPs and TIMPs
    cell.icm["proMMP1"] = cell.icm["NFKB"] * cell.icm["AP1"] * (1.0 - cell.icm["smad3"]);
    cell.icm["proMMP2"] = cell.icm["AP1"] + cell.icm["STAT"];
    cell.icm["proMMP3"] = cell.icm["NFKB"] * cell.icm["AP1"] * (1.0 - cell.icm["smad3"]);
    cell.icm["proMMP8"] = cell.icm["NFKB"] * cell.icm["AP1"] * (1.0 - cell.icm["smad3"]);
    cell.icm["proMMP9"] = cell.icm["STAT"] + cell.icm["NFKB"] * cell.icm["AP1"];
    cell.icm["proMMP12"] = cell.icm["CREB"];
    cell.icm["proMMP14"] = cell.icm["AP1"] + cell.icm["NFKB"];
    cell.icm["TIMP1"] = cell.icm["AP1"];
    cell.icm["TIMP2"] = cell.icm["AP1"];
    
    // Other ECM components
    cell.icm["latentTGFB"] = cell.icm["AP1"];
    cell.icm["EDAFN"] = cell.icm["NFAT"];
    cell.icm["thrombospondin4"] = cell.icm["smad3"];
    cell.icm["osteopontin"] = cell.icm["AP1"];
    cell.icm["syndecan4"] = cell.icm["tension"] * (1.0 - cell.icm["TNC"]);
    
    // Feedback mechanisms
    cell.feedback["TGFBfb"] = cell.icm["proMMP9"] * cell.icm["latentTGFB"] + 
                             cell.icm["proMMP2"] * cell.icm["latentTGFB"] + 
                             cell.icm["tension"] * cell.icm["latentTGFB"];
    cell.feedback["AngIIfb"] = cell.icm["ACE"] * cell.icm["AGT"];
    cell.feedback["IL6fb"] = cell.icm["CREB"] * cell.icm["CBP"] + cell.icm["NFKB"] + cell.icm["AP1"];
    cell.feedback["ET1fb"] = cell.icm["AP1"];
    cell.feedback["tensionfb"] = cell.icm["FA"] * cell.icm["contractility"];
    cell.icm["AGT"] = (1.0 - cell.icm["AT1R"]) * (1.0 - cell.icm["JNK"]) * cell.icm["p38"];
    cell.icm["ACE"] = cell.icm["TGFB1R"];
    cell.icm["BAMBI"] = cell.icm["TGFB"] * cell.icm["IL1RI"];
    cell.icm["smad3"] = cell.icm["TGFB1R"] * (1.0 - cell.icm["smad7"]) * (1.0 - cell.icm["PKG"]) * (1.0 - cell.icm["ERB"]) + 
                        cell.icm["Akt"];
    cell.icm["smad7"] = cell.icm["STAT"] + cell.icm["AP1"] * (1.0 - cell.icm["YAP"]);
    cell.icm["epac"] = cell.icm["cAMP"];
    cell.icm["cmyc"] = cell.icm["JNK"];
    cell.icm["proliferation"] = cell.icm["CDK1"] + cell.icm["AP1"] + cell.icm["CREB"] + cell.icm["CTGF"] + 
                               cell.icm["PKC"] + (cell.icm["p70S6K"] * (1.0 - cell.icm["EBP1"])) + cell.icm["cmyc"];
    
    // Update ECM values based on intracellular signaling
    cell.ecm["proCI"] += 0.01 * cell.icm["proCI"];
    cell.ecm["proCIII"] += 0.01 * cell.icm["proCIII"];
    cell.ecm["proMMP1"] += 0.01 * cell.icm["proMMP1"];
    cell.ecm["proMMP2"] += 0.01 * cell.icm["proMMP2"];
    cell.ecm["proMMP3"] += 0.01 * cell.icm["proMMP3"];
    cell.ecm["proMMP8"] += 0.01 * cell.icm["proMMP8"];
    cell.ecm["proMMP9"] += 0.01 * cell.icm["proMMP9"];
    cell.ecm["proMMP12"] += 0.01 * cell.icm["proMMP12"];
    cell.ecm["proMMP14"] += 0.01 * cell.icm["proMMP14"];
    cell.ecm["TIMP1"] += 0.01 * cell.icm["TIMP1"];
    cell.ecm["TIMP2"] += 0.01 * cell.icm["TIMP2"];
    cell.ecm["fibronectin"] += 0.01 * cell.icm["fibronectin"];
    cell.ecm["periostin"] += 0.01 * cell.icm["periostin"];
    cell.ecm["TNC"] += 0.01 * cell.icm["TNC"];
    cell.ecm["PAI1"] += 0.01 * cell.icm["PAI1"];
    cell.ecm["CTGF"] += 0.01 * cell.icm["CTGF"];
    cell.ecm["EDAFN"] += 0.01 * cell.icm["EDAFN"];
}