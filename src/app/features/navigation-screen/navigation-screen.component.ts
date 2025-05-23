import { Component, Input, OnInit, OnDestroy, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EventConfig, PointOfInterest } from '../../core/models/config.model';
import { GeoService, Coordinates } from '../../core/services/geo.service';
import { PwaService } from '../../core/services/pwa.service';
import { Subscription, BehaviorSubject, Observable } from 'rxjs';
import { CompassComponent } from '../../shared/components/compass/compass.component';

interface ExtendedDeviceOrientationEvent extends DeviceOrientationEvent {
  webkitCompassHeading?: number;
}

interface DeviceState {
  currentLocation: Coordinates | null;
  deviceOrientation: number;
  locationError: string | null;
  orientationError: string | null;
  accuracy: number | null;
  userCourse: number | null;
}

@Component({
  selector: 'app-navigation-screen',
  standalone: true,
  imports: [CommonModule, CompassComponent],
  templateUrl: './navigation-screen.component.html',
  styleUrls: ['./navigation-screen.component.scss']
})
export class NavigationScreenComponent implements OnInit, OnDestroy {
  @Input() eventConfig!: EventConfig;
  @Input() selectedTeam!: string | null;

  sensoresActivados: boolean = false;
  mostrarBotonActivarSensores: boolean = true;

  private deviceStateSubject = new BehaviorSubject<DeviceState>({
    currentLocation: null,
    deviceOrientation: 0,
    locationError: null,
    orientationError: null,
    accuracy: null,
    userCourse: null,
  });
  deviceState$: Observable<DeviceState> = this.deviceStateSubject.asObservable();

  currentPOIIndex: number = 0;
  nextPOI: PointOfInterest | null = null; // Será null cuando la ruta termine
  distanceToNextPOI: number = 0;
  bearingToNextPOI: number = 0;
  navigationStatus: string = 'Pulsa "Activar Brújula" para iniciar.';
  navigationStatusClass: string = '';
  visitedPOIs: PointOfInterest[] = [];

  private readonly GEOFENCE_CORRIDOR_WIDTH_METERS = 40;
  private _isInCorridor: boolean = false;
  get isInCorridor(): boolean { return this._isInCorridor; }

  private locationWatcherId: number | null = null;
  private orientationListenerAttached: boolean = false;
  private subscriptions: Subscription = new Subscription();

  private previousLocation: Coordinates | null = null;
  private lastLocationTimestamp: number = 0;
  private readonly MIN_SPEED_FOR_COURSE_MPS = 0.3;
  private readonly MIN_DISTANCE_FOR_COURSE_METERS = 3;
  private readonly COURSE_BEARING_ALIGNMENT_THRESHOLD_DEGREES = 35;

  private audioContext: AudioContext | null = null;
  private offRouteSoundEnabled: boolean = true;
  private hasPlayedOffRouteSoundSinceLastInCorridor: boolean = false;
  private poiReachedSoundEnabled: boolean = true;

  constructor(
    private geoService: GeoService,
    private pwaService: PwaService,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    if (!this.eventConfig || this.eventConfig.ruta.length === 0) {
      this.navigationStatus = "Error: No hay ruta configurada.";
      this.updateDeviceStatePartial({ locationError: this.navigationStatus });
      this.mostrarBotonActivarSensores = false;
      return;
    }
    this.initializeNavigation();

    this.subscriptions.add(
      this.deviceState$.subscribe(state => {
        if (this.sensoresActivados) {
          if (state.currentLocation && this.nextPOI) { // Solo actualizar si hay un POI objetivo
            this.updateNavigationState(state.currentLocation, state.deviceOrientation, state.userCourse);
          } else if (!this.nextPOI && this.currentPOIIndex >= this.eventConfig.ruta.length -1 && this.navigationStatus !== "¡Felicidades, has completado la ruta!") {
            // Caso donde la ruta ya se completó pero el estado se re-evalúa
            this.navigationStatus = "¡Felicidades, has completado la ruta!";
            this.navigationStatusClass = 'text-status-in-route';
          } else if (state.locationError && this.navigationStatus !== state.locationError) {
            this.navigationStatus = state.locationError;
            this.navigationStatusClass = 'text-status-warning';
          } else if (!state.currentLocation && !state.locationError) {
            this.navigationStatus = "Esperando señal GPS...";
            this.navigationStatusClass = 'text-status-warning';
          }
        }
        this.cdr.detectChanges();
      })
    );
  }

  solicitarPermisosYActivarSensores(): void {
    this.navigationStatus = 'Solicitando permisos...';
    this.mostrarBotonActivarSensores = false;
    this.sensoresActivados = true;
    this.startDeviceTracking();

    if (!this.audioContext && typeof AudioContext !== 'undefined') { // Solo verificar AudioContext
      try {
        this.audioContext = new AudioContext(); // Usar directamente AudioContext
        console.log('[Audio] AudioContext inicializado.');
      } catch (e) {
        console.error('[Audio] Error inicializando AudioContext:', e);
        this.offRouteSoundEnabled = false;
        this.poiReachedSoundEnabled = false; // También deshabilitar este sonido
      }
    } else if (typeof AudioContext === 'undefined') { // Si AudioContext no está definido en absoluto
      console.warn('[Audio] Web Audio API no soportada.');
      this.offRouteSoundEnabled = false;
      this.poiReachedSoundEnabled = false;
    }
  }

  private updateDeviceStatePartial(partialState: Partial<DeviceState>): void {
    this.ngZone.run(() => {
      const currentState = this.deviceStateSubject.getValue();
      this.deviceStateSubject.next({ ...currentState, ...partialState });
    });
  }

  startDeviceTracking(): void {
    // ... (lógica de startDeviceTracking como en la versión anterior, sin cambios aquí)
    this.navigationStatus = 'Activando sensores...';
    if ('geolocation' in navigator) {
      this.locationWatcherId = navigator.geolocation.watchPosition(
        (position) => {
          const newCoords: Coordinates = { latitud: position.coords.latitude, longitud: position.coords.longitude };
          const newTimestamp = position.timestamp || Date.now();
          let calculatedUserCourse: number | null = null;
          if (typeof position.coords.heading === 'number' && position.coords.heading !== null && position.coords.speed !== null && position.coords.speed > this.MIN_SPEED_FOR_COURSE_MPS) {
            calculatedUserCourse = position.coords.heading;
          } else if (this.previousLocation) {
            const distanceMoved = this.geoService.calculateDistance(this.previousLocation, newCoords);
            const timeElapsedSeconds = (newTimestamp - this.lastLocationTimestamp) / 1000;
            if (distanceMoved >= this.MIN_DISTANCE_FOR_COURSE_METERS && timeElapsedSeconds > 0.5) {
              const speed = distanceMoved / timeElapsedSeconds;
              if (speed >= this.MIN_SPEED_FOR_COURSE_MPS) {
                calculatedUserCourse = this.geoService.calculateBearing(this.previousLocation, newCoords);
              }
            }
          }
          this.updateDeviceStatePartial({ currentLocation: newCoords, locationError: null, accuracy: position.coords.accuracy, userCourse: calculatedUserCourse });
          this.previousLocation = newCoords;
          this.lastLocationTimestamp = newTimestamp;
        },
        (error) => {
          console.error('[Geo] Error obteniendo ubicación:', error);
          let message = 'Error de ubicación: ';
          switch (error.code) {
            case error.PERMISSION_DENIED: message += "Permiso denegado."; break;
            case error.POSITION_UNAVAILABLE: message += "Ubicación no disponible."; break;
            case error.TIMEOUT: message += "Timeout obteniendo ubicación."; break;
            default: message += "Error desconocido."; break;
          }
          this.updateDeviceStatePartial({ currentLocation: null, locationError: message, accuracy: null, userCourse: null });
        },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
      );
    } else { console.error('[Geo] Geolocalización no soportada.'); this.updateDeviceStatePartial({ locationError: 'Geolocalización no soportada.' });}

    if ('DeviceOrientationEvent' in window) {
      const typedDeviceOrientationEvent = DeviceOrientationEvent as any;
      if (typeof typedDeviceOrientationEvent.requestPermission === 'function') {
        typedDeviceOrientationEvent.requestPermission()
          .then((permissionState: string) => {
            if (permissionState === 'granted') { this.updateDeviceStatePartial({ orientationError: null }); this.attachDeviceOrientationListener(); }
            else { console.error('[Orient] Permiso para orientación denegado.'); this.updateDeviceStatePartial({ orientationError: 'Permiso para orientación denegado.' }); }
          })
          .catch((err: any) => { console.error('[Orient] Error solicitando permiso para orientación:', err); this.updateDeviceStatePartial({ orientationError: 'Error al solicitar permiso de orientación.' }); });
      } else { this.attachDeviceOrientationListener(); }
    } else { console.error('[Orient] Orientación del dispositivo no soportada.'); this.updateDeviceStatePartial({ orientationError: 'Orientación del dispositivo no soportada.' });}
  }

  private attachDeviceOrientationListener = (): void => {
    if (this.orientationListenerAttached) return;
    window.addEventListener('deviceorientation', this.handleDeviceOrientation, true);
    this.orientationListenerAttached = true;
    console.log('[Orient] Listener de orientación añadido.');
  }

  private handleDeviceOrientation = (event: ExtendedDeviceOrientationEvent): void => {
    let heading: number | null = null;
    if (typeof event.webkitCompassHeading === 'number') { heading = event.webkitCompassHeading; }
    else if (typeof event.alpha === 'number') {
      heading = event.absolute ? event.alpha : null;
      if (heading === null && !event.webkitCompassHeading) { heading = event.alpha; }
    }
    if (heading === null) return;
    const orientation = Number(heading) || 0;
    this.updateDeviceStatePartial({ deviceOrientation: orientation, orientationError: null });
  }

  initializeNavigation(): void {
    this.currentPOIIndex = 0;
    this.nextPOI = this.eventConfig.ruta.length > 0 ? this.eventConfig.ruta[0] : null; // Establecer el primer POI
    this.previousLocation = null;
    this.lastLocationTimestamp = 0;
    this.updateDeviceStatePartial({ userCourse: null });
    this.visitedPOIs = [];
    this._isInCorridor = false;
    this.hasPlayedOffRouteSoundSinceLastInCorridor = false;
  }

  updateNavigationState(currentLocation: Coordinates, deviceOrientation: number, userCourse: number | null): void {
    if (!this.nextPOI) { // Si nextPOI es null, la ruta ya se completó o no hay ruta.
        if (this.currentPOIIndex >= this.eventConfig.ruta.length -1 && this.navigationStatus !== "¡Felicidades, has completado la ruta!") {
            this.navigationStatus = "¡Felicidades, has completado la ruta!";
            this.navigationStatusClass = 'text-status-in-route';
            this.stopDeviceTracking(); // Asegurar que se detiene el tracking
        }
      return;
    }

    // nextPOI ya está establecido por initializeNavigation o advanceToNextPOI
    this.distanceToNextPOI = this.geoService.calculateDistance(currentLocation, this.nextPOI);
    this.bearingToNextPOI = this.geoService.calculateBearing(currentLocation, this.nextPOI);

    const previousIsInCorridor = this._isInCorridor;
    this.checkGeofenceCorridor(currentLocation);

    if (previousIsInCorridor && !this._isInCorridor && !this.hasPlayedOffRouteSoundSinceLastInCorridor) {
      this.playOffRouteSound();
      this.hasPlayedOffRouteSoundSinceLastInCorridor = true;
    } else if (this._isInCorridor) {
      this.hasPlayedOffRouteSoundSinceLastInCorridor = false;
    }

    this.updateUserFeedback(userCourse);

    const POI_PROXIMITY_THRESHOLD = 15;
    if (this.distanceToNextPOI < POI_PROXIMITY_THRESHOLD) {
      if (!this.nextPOI.reached) {
        this.nextPOI.reached = true;
        console.log(`[Nav] Cerca del POI: ${this.nextPOI.nombrePOI}. Intentando avanzar en 1s.`);
        setTimeout(() => {
          const latestState = this.deviceStateSubject.getValue();
          if (latestState.currentLocation &&
              this.nextPOI && // Asegurar que nextPOI no sea null aquí
              this.eventConfig.ruta[this.currentPOIIndex] === this.nextPOI &&
              this.geoService.calculateDistance(latestState.currentLocation, this.nextPOI) < POI_PROXIMITY_THRESHOLD) {
            this.advanceToNextPOI(latestState.currentLocation, latestState.deviceOrientation, latestState.userCourse);
          } else {
            if (this.nextPOI) this.nextPOI.reached = false;
          }
        }, 1000);
      }
    } else if (this.nextPOI.reached) {
      this.nextPOI.reached = false;
    }
  }

  checkGeofenceCorridor(currentLocation: Coordinates): void {
    const routeStart = this.eventConfig.ruta[0];
    const routeEnd = this.eventConfig.ruta[this.eventConfig.ruta.length - 1];
    if (!routeStart || !routeEnd || !currentLocation) { this._isInCorridor = false; return; }
    const distanceToRouteLine = this.geoService.distanceToLineSegment(currentLocation, routeStart, routeEnd);
    this._isInCorridor = distanceToRouteLine <= (this.GEOFENCE_CORRIDOR_WIDTH_METERS / 2);
  }

  private normalizeAngle(angle: number): number {
    let result = angle % 360;
    if (result < 0) { result += 360; }
    return result;
  }

  updateUserFeedback(userCourse: number | null): void {
    // ... (sin cambios significativos respecto a la versión anterior de updateUserFeedback)
    if (!this.nextPOI) return;
    const deviceState = this.deviceStateSubject.getValue();
    const currentLocation = deviceState.currentLocation;

    if (!currentLocation && deviceState.locationError) { this.navigationStatus = deviceState.locationError; this.navigationStatusClass = 'text-status-off-route'; return; }
    if (!currentLocation) { this.navigationStatus = "Esperando señal GPS..."; this.navigationStatusClass = 'text-status-warning'; return; }

    let IS_MOVING_TOWARDS_POI = false;
    if (userCourse !== null && this.bearingToNextPOI !== null) {
        const courseNorm = this.normalizeAngle(userCourse);
        const bearingNorm = this.normalizeAngle(this.bearingToNextPOI);
        let angularDiff = Math.abs(courseNorm - bearingNorm);
        if (angularDiff > 180) { angularDiff = 360 - angularDiff; }
        IS_MOVING_TOWARDS_POI = angularDiff < this.COURSE_BEARING_ALIGNMENT_THRESHOLD_DEGREES;
    }

    if (this._isInCorridor) {
      if (userCourse === null) { this.navigationStatus = `En el corredor hacia ${this.nextPOI.nombrePOI}.`; this.navigationStatusClass = 'text-status-in-route'; }
      else if (IS_MOVING_TOWARDS_POI) { this.navigationStatus = `¡Excelente! Vas directo a ${this.nextPOI.nombrePOI}.`; this.navigationStatusClass = 'text-status-in-route'; }
      else { this.navigationStatus = `En el corredor, pero ajusta tu dirección hacia ${this.nextPOI.nombrePOI}.`; this.navigationStatusClass = 'text-status-warning'; }
    } else {
      const distanceToRouteLine = this.geoService.distanceToLineSegment(currentLocation, this.eventConfig.ruta[0], this.eventConfig.ruta[this.eventConfig.ruta.length - 1]);
      if (distanceToRouteLine > this.GEOFENCE_CORRIDOR_WIDTH_METERS * 2.5) { this.navigationStatus = `¡MUY FUERA DE RUTA! Muy lejos. Hacia ${this.nextPOI.nombrePOI}.`; this.navigationStatusClass = 'text-status-off-route'; }
      else { this.navigationStatus = `¡Te estás desviando! Hacia ${this.nextPOI.nombrePOI}.`; this.navigationStatusClass = 'text-status-warning'; }
    }
  }

  advanceToNextPOI(currentLocation: Coordinates, deviceOrientation: number, userCourse: number | null): void {
    const DONT_PLAY_SOUND_FOR_FIRST_POI = true;
    const currentPOIJustReached = this.eventConfig.ruta[this.currentPOIIndex];

    if (currentPOIJustReached) {
      if (!(DONT_PLAY_SOUND_FOR_FIRST_POI && this.currentPOIIndex === 0)) {
        this.playPOIReachedSound();
      }
      if (!this.visitedPOIs.find(p => p.orden === currentPOIJustReached.orden)) {
        this.visitedPOIs.push(currentPOIJustReached);
      }
    }

    if (this.currentPOIIndex >= this.eventConfig.ruta.length - 1) {
      console.log(`[Nav] Último POI (${currentPOIJustReached?.nombrePOI}) alcanzado. RUTA FINALIZADA.`);
      this.navigationStatus = "¡Felicidades, has completado la ruta!";
      this.navigationStatusClass = 'text-status-in-route';
      this.nextPOI = null; // IMPORTANTE para que la UI muestre el estado final
      this.stopDeviceTracking();
      this.cdr.detectChanges();
      return;
    }

    this.currentPOIIndex++;
    this.nextPOI = this.eventConfig.ruta[this.currentPOIIndex]; // Actualizar nextPOI inmediatamente
    if (this.nextPOI) {
      this.nextPOI.reached = false;
    }
    console.log(`Avanzando al POI (índice ${this.currentPOIIndex}): ${this.nextPOI?.nombrePOI}. Visitados: ${this.visitedPOIs.map(p=>p.nombrePOI).join(', ')}`);
    
    // Forzar la reevaluación del estado de navegación con el nuevo nextPOI
    this.updateNavigationState(currentLocation, deviceOrientation, userCourse);
  }

  private playOffRouteSound(): void {
    // ... (sin cambios)
    if (!this.audioContext || !this.offRouteSoundEnabled) { console.log('[Audio] No se puede reproducir sonido (AudioContext no listo o sonido deshabilitado).'); return; }
    if (this.audioContext.state === 'suspended') { this.audioContext.resume().catch(e => console.error("Error resuming audio context", e)); }
    console.log('[Audio] Reproduciendo sonido de fuera de ruta.');
    const oscillator = this.audioContext.createOscillator(); const gainNode = this.audioContext.createGain();
    oscillator.connect(gainNode); gainNode.connect(this.audioContext.destination);
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(440, this.audioContext.currentTime);
    gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
    oscillator.start(this.audioContext.currentTime); oscillator.stop(this.audioContext.currentTime + 0.5);
  }

  private playPOIReachedSound(): void {
    // ... (sin cambios)
    if (!this.audioContext || !this.poiReachedSoundEnabled) { return; }
    if (this.audioContext.state === 'suspended') { this.audioContext.resume().catch(e => console.error("Error resuming audio context", e)); }
    console.log('[Audio] Reproduciendo sonido de POI alcanzado.');
    const oscillator = this.audioContext.createOscillator(); const gainNode = this.audioContext.createGain();
    oscillator.connect(gainNode); gainNode.connect(this.audioContext.destination);
    oscillator.type = 'triangle'; oscillator.frequency.setValueAtTime(660, this.audioContext.currentTime);
    gainNode.gain.setValueAtTime(0.4, this.audioContext.currentTime);
    oscillator.start(this.audioContext.currentTime); oscillator.stop(this.audioContext.currentTime + 0.2);
    setTimeout(() => {
      if (!this.audioContext || this.audioContext.state === 'closed') return;
      const oscillator2 = this.audioContext.createOscillator(); const gainNode2 = this.audioContext.createGain();
      oscillator2.connect(gainNode2); gainNode2.connect(this.audioContext.destination);
      oscillator2.type = 'triangle'; oscillator2.frequency.setValueAtTime(880, this.audioContext.currentTime);
      gainNode2.gain.setValueAtTime(0.4, this.audioContext.currentTime);
      oscillator2.start(this.audioContext.currentTime); oscillator2.stop(this.audioContext.currentTime + 0.2);
    }, 250);
  }

  stopDeviceTracking(): void {
    // ... (sin cambios)
    if (this.locationWatcherId !== null) { navigator.geolocation.clearWatch(this.locationWatcherId); this.locationWatcherId = null; console.log('[Geo] Watcher de ubicación detenido.'); }
    if (this.orientationListenerAttached) { window.removeEventListener('deviceorientation', this.handleDeviceOrientation, true); this.orientationListenerAttached = false; console.log('[Orient] Listener de orientación eliminado.'); }
  }

  changeTeam(): void {
    // ... (sin cambios)
    this.pwaService.clearSelectedTeam(); this.stopDeviceTracking();
    this.sensoresActivados = false; this.mostrarBotonActivarSensores = true;
    this.navigationStatus = 'Pulsa "Activar Brújula" para iniciar.'; this.visitedPOIs = [];
    this.nextPOI = null; // Asegurar que nextPOI se resetee
    this.currentPOIIndex = 0; // Resetear el índice
    this.initializeNavigation(); // Reinicializar el estado de navegación
  }

  ngOnDestroy(): void {
    // ... (sin cambios)
    this.stopDeviceTracking(); this.subscriptions.unsubscribe();
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().then(() => { console.log('[Audio] AudioContext cerrado.'); this.audioContext = null; })
      .catch(err => console.error('[Audio] Error al cerrar AudioContext:', err));
    }
  }
}