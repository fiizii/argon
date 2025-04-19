#!/bin/bash


if ! command -v node &> /dev/null; then
    echo "Node.js is not installed"
    exit 1
fi

echo "Found Node.js:"
node --version

if ! command -v npm &> /dev/null; then
    echo "npm is not installed or not in your PATH"
    exit 1
fi

if [ ! -f "package.json" ]; then
    echo "Warning: package.json not found in current directory"
    read -p "Continue anyway? (y/n): " choice
    if [[ ! "$choice" =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

MAIN="index.js"
if [ ! -f "$MAIN" ]; then
    echo "Warning: $MAIN not found"
    read -p "Bot file (default: index.js): " input_file
    if [ ! -z "$input_file" ]; then
        MAIN="$input_file"
    fi
    
    if [ ! -f "$MAIN" ]; then
        echo "Error: $MAIN not found"
        exit 1
    fi
fi

echo "Checking for dependencies..."
if [ -f "package.json" ]; then
    if [ ! -d "node_modules" ]; then
        echo "Installing dependencies..."
        npm install
        if [ $? -ne 0 ]; then
            echo "Failed to install dependencies"
            exit 1
        fi
    fi
fi

echo "Starting Argon..."

run_bot() {
    while true; do
        echo "[$(date)] Launching bot..."
        node "$MAIN"
        
        if [ $? -ne 0 ]; then
            echo "[$(date)] Argon crashed with error code $?"
            echo "Restarting in 5 seconds..."
            sleep 5
        else
            echo "[$(date)] Argon exited normally"
            read -t 10 -p "Restart bot? (Y/n): " restart
            if [[ "$restart" =~ ^[Nn]$ ]]; then
                break
            fi
        fi
    done
}

trap 'echo "Received interrupt signal, shutting down..."; exit 0' SIGINT SIGTERM

run_bot

echo "Argon service terminated."