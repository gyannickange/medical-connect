import { useState, useCallback, useRef } from 'react';

interface BarcodeScannerConfig {
  onResult: (barcode: string) => void;
  onError?: (error: string) => void;
  continuous?: boolean;
  formats?: string[];
}

export const useBarcode = (config: BarcodeScannerConfig) => {
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const startScanning = useCallback(async () => {
    try {
      setError(null);
      
      // Check if browser supports camera access
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access not supported');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment', // Use back camera
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsScanning(true);
        
        // In a real implementation, you would use a library like:
        // - QuaggaJS for barcode scanning
        // - ZXing for QR/barcode detection
        // - @zxing/library for TypeScript support
        
        // For demo purposes, simulate scanning after a delay
        if (!config.continuous) {
          setTimeout(() => {
            const mockBarcode = generateMockBarcode();
            config.onResult(mockBarcode);
            stopScanning();
          }, 3000);
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Camera access denied';
      setError(errorMessage);
      config.onError?.(errorMessage);
    }
  }, [config]);

  const stopScanning = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    setIsScanning(false);
    setError(null);
  }, []);

  const generateMockBarcode = () => {
    // Generate a realistic-looking barcode for demo
    const prefixes = ['123', '456', '789', '012'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const suffix = Math.random().toString().slice(2, 11);
    return prefix + suffix;
  };

  // Handle keyboard input for manual barcode entry
  const handleKeyboardInput = useCallback((event: KeyboardEvent) => {
    if (!isScanning) return;
    
    // Common pattern: barcode scanners send data followed by Enter
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
      const barcode = event.target.value.trim();
      if (barcode) {
        config.onResult(barcode);
        event.target.value = '';
        if (!config.continuous) {
          stopScanning();
        }
      }
    }
  }, [isScanning, config, stopScanning]);

  // Attach video element ref
  const attachVideoRef = useCallback((element: HTMLVideoElement | null) => {
    videoRef.current = element;
  }, []);

  return {
    isScanning,
    error,
    startScanning,
    stopScanning,
    attachVideoRef,
    handleKeyboardInput,
  };
};

// Hook for simple barcode input handling without camera
export const useBarcodeInput = (onScan: (barcode: string) => void) => {
  const [buffer, setBuffer] = useState('');
  const timeoutRef = useRef<NodeJS.Timeout>();

  const handleKeyPress = useCallback((event: KeyboardEvent) => {
    // Clear timeout on new input
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    if (event.key === 'Enter') {
      // Barcode complete
      if (buffer.length > 0) {
        onScan(buffer);
        setBuffer('');
      }
    } else if (event.key.length === 1) {
      // Add character to buffer
      const newBuffer = buffer + event.key;
      setBuffer(newBuffer);
      
      // Auto-submit after delay (typical barcode scanner behavior)
      timeoutRef.current = setTimeout(() => {
        if (newBuffer.length >= 8) { // Minimum barcode length
          onScan(newBuffer);
          setBuffer('');
        }
      }, 100);
    }
  }, [buffer, onScan]);

  return {
    handleKeyPress,
    currentBuffer: buffer,
    clearBuffer: () => setBuffer(''),
  };
};
