import React, { useState, useRef, useEffect } from "react";
import { Camera, Square, StopCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useTranslation } from "../lib/i18n";

interface BarcodeScannerProps {
  onScanResult: (barcode: string) => void;
  children: React.ReactNode;
}

export const BarcodeScanner: React.FC<BarcodeScannerProps> = ({
  onScanResult,
  children,
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startScanning = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment", // Use back camera
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsScanning(true);

        // In a real implementation, you would use a library like QuaggaJS or ZXing
        // For demo purposes, simulate scanning after 3 seconds
        setTimeout(() => {
          const mockBarcode = Math.random().toString().slice(2, 14);
          onScanResult(mockBarcode);
          stopScanning();
          setIsOpen(false);
        }, 3000);
      }
    } catch (err) {
      setError(t("cameraAccessDenied"));
      console.error("Error starting camera:", err);
    }
  };

  const stopScanning = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsScanning(false);
  };

  useEffect(() => {
    if (isOpen && !isScanning) {
      startScanning();
    }

    return () => {
      stopScanning();
    };
  }, [isOpen]);

  useEffect(() => {
    return () => {
      stopScanning();
    };
  }, []);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        className="glass-card max-w-lg max-h-[90vh] overflow-y-auto"
        data-testid="barcode-scanner-modal">
        <DialogHeader>
          <DialogTitle className="text-foreground">{t("barcodeScanner")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {error ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-danger/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Camera className="w-8 h-8 text-danger" />
              </div>
              <p className="text-danger font-medium mb-2">{t("cameraError")}</p>
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button
                variant="outline"
                onClick={startScanning}
                className="mt-4"
                data-testid="button-retry-camera">
                {t("tryAgain")}
              </Button>
            </div>
          ) : (
            <div className="relative">
              <video
                ref={videoRef}
                className="w-full h-64 bg-black rounded-xl object-cover"
                playsInline
                muted
                data-testid="video-scanner"
              />

              {isScanning && (
                <>
                  {/* Scanning overlay */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="relative">
                      <Square
                        className="w-32 h-32 text-primary opacity-80"
                        strokeWidth={2}
                      />
                      <div className="absolute inset-0 barcode-scanner">
                        <div className="w-full h-0.5 bg-primary animate-scan-line"></div>
                      </div>
                    </div>
                  </div>

                  {/* Instructions */}
                  <div className="absolute bottom-4 left-4 right-4 text-center">
                    <p className="text-foreground text-sm bg-black/50 rounded-lg px-3 py-2">
                      {t("positionBarcodeWithinSquare")}
                    </p>
                  </div>
                </>
              )}

              {!isScanning && !error && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-xl">
                  <div className="text-center text-foreground">
                    <Camera className="w-12 h-12 mx-auto mb-2" />
                    <p>{t("startingCamera")}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-between gap-3">
            <Button
              variant="outline"
              onClick={() => setIsOpen(false)}
              className="flex-1"
              data-testid="button-cancel-scan">
              {t("cancel")}
            </Button>

            {isScanning && (
              <Button
                onClick={stopScanning}
                className="flex-1 bg-danger hover:bg-danger/80"
                data-testid="button-stop-scan">
                <StopCircle className="w-4 h-4 mr-2" />
                {t("stop")}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
