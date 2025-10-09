#!/bin/bash

# Make sure Emscripten is activated
source ./emsdk/emsdk_env.sh

# Compile the C++ code to WebAssembly with ODE-specific exports
emcc -std=c++17 ecm.cpp -o ecm.js \
    -s WASM=1 \
    -s EXPORTED_RUNTIME_METHODS='["ccall", "cwrap"]' \
    -s EXPORTED_FUNCTIONS='["_malloc", "_free", "_initializeGrid", "_simulateStep", 
                            "_setInputConcentration", "_getECMData", "_getFeedbackData", 
                            "_freeData", "_readDataValue", "_setAllInputs", 
                            "_setTimeStep", "_setRateConstants", "_getODEParameters",
                            "_setCellConcentration", "_setCellInputConcentration",
                            "_clearCellInputOverrides", "_clearAllInputOverrides"]' \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s MODULARIZE=1 \
    -s EXPORT_NAME="ECMModule" \
    -O2

echo "ODE-based simulation with brush selection compilation complete!"