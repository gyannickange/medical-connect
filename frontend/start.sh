#!/bin/bash

# Medical Connect Client - Start Script

echo "🚀 Starting Medical Connect Client..."
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

# Check if backend is running
echo "🔍 Checking if backend is running on port 5000..."
if ! curl -s http://localhost:5000 > /dev/null; then
    echo "⚠️  WARNING: Backend is not responding on port 5000"
    echo "   Please start the backend first:"
    echo "   cd /Users/gyannick97/Sites/React/Medical Connect/backend && npm run dev"
    echo ""
    echo "❓ Continue anyway? (y/n)"
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    echo "✅ Backend is running"
fi

echo ""
echo "🎨 Starting development server..."
echo "   Client: http://localhost:3000"
echo "   Backend: http://localhost:5000"
echo ""

npm run dev

