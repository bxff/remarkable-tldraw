#!/bin/bash

set -euo pipefail

# Directory containing .rm files
TEST_DIR="tests/rm"
OUTPUT_DIR="rm_output"

# Check if directory exists
if [ ! -d "$TEST_DIR" ]; then
    echo "Error: Directory $TEST_DIR does not exist"
    exit 1
fi

# Create output directories
if [ ! -d "$OUTPUT_DIR" ]; then
    mkdir -p "$OUTPUT_DIR"
    mkdir -p "$OUTPUT_DIR/svg"
    mkdir -p "$OUTPUT_DIR/tldr"
fi

# Iterate through all .rm files in the directory
for file in "$TEST_DIR"/*.rm; do
    # Check if files exist (in case directory is empty)
    if [ -f "$file" ]; then
        echo "Converting file: $file"
        file_name=$(basename "$file" .rm)
        
        # Convert to SVG
        echo "Converting to SVG..."
        if PYTHONPATH=src python3 -m rmc "$file" -o "$OUTPUT_DIR/svg/$file_name.svg" 2>/dev/null; then
            echo "✓ SVG conversion successful"
        else
            echo "✗ SVG conversion failed"
        fi
        
        # Convert to TLDR
        echo "Converting to TLDR..."
        if PYTHONPATH=src python3 -m rmc "$file" -o "$OUTPUT_DIR/tldr/$file_name.ink" 2>/dev/null; then
            echo "✓ TLDR conversion successful"
        else
            echo "✗ TLDR conversion failed"
        fi

        echo "----------------------------------------"
    fi
done

echo "All conversions completed"
echo "SVG files saved to: $OUTPUT_DIR/svg/"
echo "TLDR files saved to: $OUTPUT_DIR/tldr/"
