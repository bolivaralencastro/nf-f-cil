import { Component, ChangeDetectionStrategy, output, viewChild, ElementRef, AfterViewInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

type CaptureState = 'preview' | 'captured' | 'sending';

@Component({
  selector: 'app-photo-capture',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './photo-capture.component.html',
  styleUrl: './photo-capture.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PhotoCaptureComponent implements AfterViewInit, OnDestroy {
  photoSuccess = output<string>();
  cancel = output<void>();

  videoElement = viewChild.required<ElementRef<HTMLVideoElement>>('video');
  canvasElement = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  captureState = signal<CaptureState>('preview');
  capturedImageSrc = signal<string | null>(null);
  
  private stream: MediaStream | null = null;

  async ngAfterViewInit() {
    await this.startCamera();
  }

  ngOnDestroy() {
    this.stopCamera();
  }

  async startCamera() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      const video = this.videoElement().nativeElement;
      video.srcObject = this.stream;
      video.setAttribute('playsinline', 'true');
      video.play();
      this.captureState.set('preview');
    } catch (err) {
      console.error('Error accessing camera:', err);
      this.onCancel();
    }
  }

  stopCamera() {
     if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
  }

  takePicture() {
    const video = this.videoElement().nativeElement;
    const canvas = this.canvasElement().nativeElement;
    const context = canvas.getContext('2d');

    if (context) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      this.capturedImageSrc.set(dataUrl);
      this.captureState.set('captured');
      this.stopCamera();
    }
  }

  retakePicture() {
    this.capturedImageSrc.set(null);
    this.startCamera();
  }

  usePhoto() {
    const imageDataUrl = this.capturedImageSrc();
    if (imageDataUrl) {
      // Remove the "data:image/jpeg;base64," part
      const base64Data = imageDataUrl.split(',')[1];
      this.captureState.set('sending');
      this.photoSuccess.emit(base64Data);
    }
  }

  onCancel() {
    this.cancel.emit();
  }
}
