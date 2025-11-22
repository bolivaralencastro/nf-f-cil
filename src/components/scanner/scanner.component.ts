import { Component, ChangeDetectionStrategy, output, viewChild, ElementRef, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import jsQR from 'jsqr';

@Component({
  selector: 'app-scanner',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './scanner.component.html',
  styleUrl: './scanner.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScannerComponent implements AfterViewInit, OnDestroy {
  scanSuccess = output<string>();
  scanCancel = output<void>();

  videoElement = viewChild.required<ElementRef<HTMLVideoElement>>('video');
  canvasElement = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  
  private stream: MediaStream | null = null;
  private animationFrameId: number | null = null;

  async ngAfterViewInit() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      const video = this.videoElement().nativeElement;
      video.srcObject = this.stream;
      video.setAttribute('playsinline', 'true'); // Required for iOS
      video.play();
      this.animationFrameId = requestAnimationFrame(this.tick.bind(this));
    } catch (err) {
      console.error('Erro ao acessar a câmera:', err);
      this.cancel();
    }
  }

  ngOnDestroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
    }
  }

  private tick() {
    const video = this.videoElement().nativeElement;
    const canvasEl = this.canvasElement().nativeElement;
    const context = canvasEl.getContext('2d', { willReadFrequently: true });

    if (video.readyState === video.HAVE_ENOUGH_DATA && context) {
      canvasEl.height = video.videoHeight;
      canvasEl.width = video.videoWidth;
      context.drawImage(video, 0, 0, canvasEl.width, canvasEl.height);
      const imageData = context.getImageData(0, 0, canvasEl.width, canvasEl.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert',
      });

      if (code) {
        this.scanSuccess.emit(code.data);
        return; // Stop the loop
      }
    }
    this.animationFrameId = requestAnimationFrame(this.tick.bind(this));
  }

  cancel() {
    this.scanCancel.emit();
  }
}