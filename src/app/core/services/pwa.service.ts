import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, fromEvent } from 'rxjs'; // Añadir fromEvent
import { map, startWith } from 'rxjs/operators'; // Añadir operadores

const SELECTED_TEAM_KEY = 'scoutSelectedTeam';
// const PWA_INSTALLED_KEY = 'scoutPwaInstalled'; // Ya no necesitamos simular con localStorage así

@Injectable({
  providedIn: 'root'
})
export class PwaService {
  // Detección real de PWA instalada
  // Se basa en el display-mode o en si el evento 'appinstalled' se disparó.
  private isInstalledSubject: BehaviorSubject<boolean>;
  isInstalled$: Observable<boolean>;

  private selectedTeamSubject = new BehaviorSubject<string | null>(this.getSelectedTeam());
  selectedTeam$: Observable<string | null> = this.selectedTeamSubject.asObservable();

  private deferredInstallPrompt: any = null; // Para el evento beforeinstallprompt

  constructor() {
    // Inicializar isInstalled$
    // 1. Verificar si ya se instaló (si 'appinstalled' se disparó en una sesión anterior)
    //    Podríamos usar localStorage para recordar esto si 'appinstalled' ya ocurrió.
    const appInstalledPreviously = localStorage.getItem('appWasInstalled') === 'true';

    // 2. Crear un observable para el modo de visualización (standalone)
    const standaloneMatchMedia = window.matchMedia('(display-mode: standalone)');
    const displayMode$: Observable<boolean> = fromEvent<MediaQueryListEvent>(standaloneMatchMedia, 'change').pipe(
      map((event: MediaQueryListEvent) => event.matches),
      startWith(standaloneMatchMedia.matches) // Emitir el estado actual al suscribirse
    );

    // Combinar ambas lógicas (priorizar standalone si está disponible)
    this.isInstalledSubject = new BehaviorSubject<boolean>(standaloneMatchMedia.matches || appInstalledPreviously);
    this.isInstalled$ = this.isInstalledSubject.asObservable();

    // Actualizar el subject y localStorage si el displayMode cambia a standalone o si appinstalled se dispara
    displayMode$.subscribe(isStandalone => {
      if (isStandalone && !this.isInstalledSubject.getValue()) {
        console.log('PWAService: Detectado modo standalone.');
        this.isInstalledSubject.next(true);
        localStorage.setItem('appWasInstalled', 'true');
      }
    });

    window.addEventListener('appinstalled', () => {
      console.log('PWAService: Evento appinstalled disparado. PWA instalada con éxito.');
      this.isInstalledSubject.next(true);
      localStorage.setItem('appWasInstalled', 'true'); // Recordar para futuras sesiones
      this.deferredInstallPrompt = null; // El prompt ya no es necesario
    });
  }

  // ELIMINAR ESTOS MÉTODOS DE SIMULACIÓN
  // private getIsPwaInstalledSimulation(): boolean { ... }
  // simulatePwaInstallation(installed: boolean): void { ... }

  setSelectedTeam(team: string): void {
    localStorage.setItem(SELECTED_TEAM_KEY, team);
    this.selectedTeamSubject.next(team);
  }

  getSelectedTeam(): string | null {
    return localStorage.getItem(SELECTED_TEAM_KEY);
  }

  clearSelectedTeam(): void {
    localStorage.removeItem(SELECTED_TEAM_KEY);
    this.selectedTeamSubject.next(null);
  }

  captureInstallPrompt(event: Event): void {
    event.preventDefault();
    this.deferredInstallPrompt = event;
    console.log('PwaService: Evento beforeinstallprompt capturado.');
    // Notificar a los componentes que el prompt está disponible (podría ser un BehaviorSubject si es necesario)
    // WelcomeScreenComponent simplemente llamará a canInstall()
  }

  canInstall(): boolean {
    return !!this.deferredInstallPrompt;
  }

  async triggerInstallPrompt(): Promise<void> {
    if (!this.deferredInstallPrompt) {
      console.log('PwaService: El prompt de instalación no está disponible.');
      return;
    }
    this.deferredInstallPrompt.prompt(); // Muestra el prompt al usuario
    const { outcome } = await this.deferredInstallPrompt.userChoice;
    console.log(`PwaService: Respuesta del usuario al prompt: ${outcome}`);
    if (outcome === 'accepted') {
      console.log('PwaService: El usuario aceptó el prompt de instalación.');
      // 'appinstalled' event se encargará de actualizar isInstalledSubject
      // this.isInstalledSubject.next(true); // No es estrictamente necesario aquí si 'appinstalled' funciona
    } else {
      console.log('PwaService: El usuario rechazó el prompt de instalación.');
    }
    this.deferredInstallPrompt = null; // El prompt solo se puede usar una vez
  }
}