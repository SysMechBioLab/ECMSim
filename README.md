# ECMSim

A real-time interactive web-based simulation of cardiac fibroblast extracellular matrix (ECM) signaling pathways using WebAssembly and ODE-based modeling.

## Overview

This simulation models complex signaling networks in cardiac fibroblasts, including:

- **Intracellular signaling cascades** (more than 125 molecules including receptors, kinases, transcription factors)
- **ECM production and regulation** (17 molecules including collagens, MMPs, TIMPs)
- **Feedback mechanisms** between cells (4 key signaling feedback molecules)
- **Spatial diffusion** of molecules across a 100×100 cellular grid
- **Brush-based cell selection** for localized input stimulation
- **Real-time visualization** with heatmaps and concentration tracking

## Key Features

### Interactive Brush Tool

- Select specific regions of cells using an adjustable brush
- Apply different input concentrations to selected cells only
- Continuous feeding of input values throughout simulation
- Visual feedback with overlay highlighting

### Real-time ODE Simulation

- Euler integration with adjustable time steps (0.01-0.5)
- Configurable rate constants for all pathway parameters
- Diffusion modeling for ECM and feedback molecules
- Per-cell concentration tracking and modification

### Advanced Visualization

- Main heatmap (500×500px) showing full 100×100 grid
- Small tracking heatmap (150×150px) for detailed cell monitoring
- Real-time line plots of concentration changes over time
- Color-coded gradients (red-yellow for ECM, blue for feedback)

## Project Structure

```
ecm_simulation/
├── ecm.cpp                # C++ simulation engine with ODE system
├── ecm_visualizer.js      # JavaScript UI and visualization
├── index.html             # Web interface
├── compile.sh             # Emscripten compilation script
├── server.sh              # Local development server
├── ecm.js                 # Generated WebAssembly wrapper (after compilation)
├── ecm.wasm              # Compiled WebAssembly binary (after compilation)
└── README.md             # This file
```

## Prerequisites

### Required Software

- **Emscripten SDK** (emsdk) - for compiling C++ to WebAssembly
- **Python 3** - for local web server
- **Modern web browser** - with WebAssembly support (Chrome, Firefox, Safari, Edge)

### System Requirements

- 4GB+ RAM (for handling 10,000 cell simulation)
- Multi-core CPU recommended for smooth real-time performance

## Installation & Setup

### 1. Install Emscripten SDK

```bash
# Clone and setup emsdk
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
./emsdk install latest
./emsdk activate latest
source ./emsdk_env.sh
cd ..
```

### 2. Clone and Setup Project

```bash
# Clone this repository
git clone https://github.com/SysMechBioLab/ECMSim
cd ecm_simulation

# Make scripts executable
chmod +x compile.sh server.sh
```

### 3. Compile the Simulation

```bash
# Activate Emscripten environment
source ./emsdk/emsdk_env.sh

# Compile C++ to WebAssembly
./compile.sh
```

Expected output: `ecm.js` and `ecm.wasm` files will be generated.

### 4. Run the Simulation

```bash
# Start local web server
./server.sh
```

Open browser and navigate to: `http://localhost:8000`

## Usage Guide

### Basic Simulation Controls

1. **Molecule Selection**: Choose from dropdown menu

   - ECM molecules (collagen, fibronectin, MMPs, etc.)
   - Feedback molecules (TGFβ, AngII, IL-6, ET-1)
2. **Simulation Controls**:

   - **Start**: Begin continuous simulation
   - **Stop**: Pause the simulation
   - **Step**: Execute single simulation step
   - **Reset**: Clear all data and restart

### Advanced Features

#### Brush Selection Tool

1. Click "Enable Brush Mode"
2. Adjust brush size (1-15 cells radius)
3. Click and drag on main heatmap to select cells
4. Set input concentrations using sliders
5. Selected cells will continuously receive specified inputs

#### Cell Tracking

1. Click on small heatmap to select up to 2 cells for detailed tracking
2. View real-time concentration plots
3. Manually edit individual cell concentrations
4. Monitor spatial and temporal dynamics

#### Parameter Tuning

- Click "Show ODE Parameters" to access:
  - Time step control (0.01-0.5)
  - Rate constants for all pathway components
  - Input, feedback, degradation, and diffusion rates

## Scientific Background

### Modeled Pathways

**Input Signals**: AngII, TGFβ, mechanical tension, cytokines (IL-6, IL-1, TNFα), catecholamines, growth factors (PDGF), endothelin-1, natriuretic peptides, estrogen

**Key Signaling Cascades**:

- MAPK pathways (ERK, p38, JNK)
- PI3K-Akt-mTOR signaling
- Rho/ROCK cytoskeletal regulation
- Calcium and cAMP second messenger systems
- NFκB, AP-1, STAT transcriptional programs

**ECM Regulation**:

- Collagen synthesis (Type I, III)
- Matrix metalloproteinases (MMPs 1,2,3,8,9,12,14)
- Tissue inhibitors (TIMP1, TIMP2)
- Matricellular proteins (fibronectin, periostin, tenascin-C)

### Diffusion Model

- **Feedback molecules**: Diffusion coefficient = 0.2 (dimensionless units)
- **ECM molecules**: Diffusion coefficient = 0.04 (5× slower than feedback)
- **Spatial discretization**: 100×100 cellular grid
- **Boundary conditions**: Periodic (toroidal topology)

## Technical Implementation

### WebAssembly Performance

- **C++ simulation core**: Handles 10,000 cells × 142 molecules in real-time
- **JavaScript visualization**: 60 FPS rendering with Canvas API
- **Memory management**: Efficient pointer-based data access
- **Function exports**: 15+ C++ functions accessible from JavaScript

### Numerical Methods

- **ODE integration**: Forward Euler method
- **Diffusion solver**: Explicit finite difference with periodic boundaries
- **Rate constants**: Biologically-informed parameter ranges
- **Stability**: Adaptive time stepping prevents numerical instabilities

## Troubleshooting

### Common Issues

**"Module not found" error**:

```bash
# Ensure Emscripten is properly activated
source ./emsdk/emsdk_env.sh
./compile.sh
```

**Slow performance**:

- Reduce time step in ODE parameters
- Use Chrome for best WebAssembly performance
- Close other browser tabs to free memory

**Compilation errors**:

```bash
# Check Emscripten version
emcc --version

# Clean and recompile
rm ecm.js ecm.wasm
./compile.sh
```

**Visualization not updating**:

- Check browser console (F12) for JavaScript errors
- Verify all files are served from same domain (use local server)

## Development

### Extending the Model

**Adding new molecules**:

1. Add to appropriate struct in `ecm.cpp`
2. Update initialization functions
3. Add rate equations in `calculateRates()`
4. Update JavaScript molecule mappings

**Modifying UI**:

- Edit `ecm_visualizer.js` for interface changes
- Update `index.html` for layout modifications
- Recompile only needed for C++ changes

### Performance Optimization

**C++ optimizations**:

- Compiler flags: `-O2` (already enabled)
- Memory layout: Structure of arrays for better cache locality
- SIMD instructions: Potential future enhancement

**JavaScript optimizations**:

- Canvas rendering: Off-screen buffer for complex visualizations
- Data structures: Typed arrays for numerical data
- Animation: RequestAnimationFrame for smooth updates

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/new-pathway`)
3. Add tests for new functionality
4. Commit changes (`git commit -am 'Add new signaling pathway'`)
5. Push to branch (`git push origin feature/new-pathway`)
6. Create Pull Request

### Code Style

- **C++**: Google Style Guide with 2-space indentation
- **JavaScript**: ESLint standard configuration
- **Comments**: Biological rationale for all rate equations

## Citation

If you use this simulation in research, please cite:

```
[Paper Citation]

```

## License

MIT License 

## Acknowledgments

- Emscripten team for WebAssembly toolchain
- Scientific literature on cardiac fibroblast signaling
- Open source contributors to mathematical and visualization libraries

---

**Note**: This simulation is for research and educational purposes. Results should be validated against experimental data before drawing biological conclusions.
