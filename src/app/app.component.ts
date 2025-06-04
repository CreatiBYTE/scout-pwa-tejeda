import { Component, OnInit, ApplicationRef, ChangeDetectorRef } from '@angular/core';
import { Observable, combineLatest, map, interval } from 'rxjs';
import { ConfigService } from './core/services/config.service';
import { PwaService } from './core/services/pwa.service';
import { EventConfig } from './core/models/config.model';
import { SwUpdate, VersionEvent, UnrecoverableStateEvent } from '@angular/service-worker'; // Añadir UnrecoverableStateEvent

import { CommonModule } from '@angular/common';
import { WelcomeScreenComponent } from './features/welcome-screen/welcome-screen.component';
import { NavigationScreenComponent } from './features/navigation-screen/navigation-screen.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    WelcomeScreenComponent,
    NavigationScreenComponent
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  title = 'scout-pwa';
  eventConfig$: Observable<EventConfig | null>;
  selectedTeam$: Observable<string | null>;
  showWelcomeScreen$: Observable<boolean>;
  showNavigationScreen$: Observable<boolean>;

  swLogMessages: string[] = [];
  newVersionAvailable: boolean = false;
  newVersionHash: string | null = null;

  constructor(
    private configService: ConfigService,
    public pwaService: PwaService,
    private updates: SwUpdate,
    private appRef: ApplicationRef,
    private cdr: ChangeDetectorRef
  ) {
    this.eventConfig$ = this.configService.getEventConfig();
    this.selectedTeam$ = this.pwaService.selectedTeam$;
    this.showWelcomeScreen$ = this.selectedTeam$.pipe(map(team => !team));
    this.showNavigationScreen$ = this.selectedTeam$.pipe(map(team => !!team));
  }

  ngOnInit() {
    this.swLogMessages.push('App Inicializada. Verificando Service Worker...');
    this.handleServiceWorkerUpdates();

    window.addEventListener('beforeinstallprompt', (event) => {
      this.logSwMessage('AppComponent: beforeinstallprompt capturado.');
      this.pwaService.captureInstallPrompt(event);
    });
  }

  private logSwMessage(message: string): void {
    console.log(message); // Mantener el log de consola
    const timestamp = new Date().toLocaleTimeString();
    const limitedMessage = message.length > 150 ? message.substring(0, 150) + '...' : message;
    this.swLogMessages.push(`[${timestamp}] ${limitedMessage}`);
    if (this.swLogMessages.length > 15) {
      this.swLogMessages.shift();
    }
    try {
      // Simplemente intentar llamar a detectChanges.
      // Si cdr está destruido, esto lanzará un error que será capturado.
      this.cdr.detectChanges();
    } catch (e) {
        // Este error es esperado si el componente se destruye mientras un log está pendiente.
        // Podemos loguearlo a la consola si es útil para depuración, pero no debería romper la app.
        // console.warn("logSwMessage: ChangeDetectorRef.detectChanges() falló (probable componente destruido):", e);
    }
  }

  private handleServiceWorkerUpdates(): void {
    if (!this.updates.isEnabled) {
      this.logSwMessage('Service Worker NO HABILITADO.');
      return;
    }
    this.logSwMessage('Service Worker está HABILITADO.');

    this.updates.checkForUpdate().then(isUpdateFound => {
      if (isUpdateFound) {
        this.logSwMessage('SW: Actualización encontrada al inicio. Intentando activar...');
        this.updates.activateUpdate().then(() => {
          this.logSwMessage('SW: Actualización activada. Recargando...');
          document.location.reload();
        }).catch(err => {
          this.logSwMessage(`SW: Error al activar actualización al inicio: ${err.message}`);
        });
      } else {
        this.logSwMessage('SW: No hay actualizaciones pendientes al inicio.');
      }
    }).catch(err => {
      this.logSwMessage(`SW: Error al buscar actualizaciones al inicio: ${err.message}`);
    });

    this.updates.versionUpdates.subscribe((evt: VersionEvent) => {
      const message = `SW Event: ${evt.type}`;
      this.logSwMessage(message);
      switch (evt.type) {
        case 'VERSION_DETECTED':
          this.logSwMessage(`SW: Descargando nueva versión: ${evt.version.hash.substring(0,8)}`);
          break;
        case 'VERSION_READY':
          this.logSwMessage(`SW: Nueva versión lista (${evt.latestVersion.hash.substring(0,8)}). Actual: ${evt.currentVersion.hash.substring(0,8)}.`);
          this.newVersionAvailable = true;
          this.newVersionHash = evt.latestVersion.hash;
          this.cdr.detectChanges();
          // Podrías mostrar un toast/snackbar en lugar de confirm
          // if (confirm('Nueva versión de la app disponible. ¿Cargarla ahora?')) {
          //   this.activateUpdate();
          // }
          break;
        case 'VERSION_INSTALLATION_FAILED':
          this.logSwMessage(`SW: Falló instalación de versión '${evt.version.hash.substring(0,8)}': ${evt.error}`);
          break;
        case 'NO_NEW_VERSION_DETECTED':
          this.logSwMessage('SW: No se detectó nueva versión tras verificar.');
          break;
        // El caso 'UPDATE_ACTIVATION_FAILED' se elimina de aquí
      }
    });

    // Escuchar errores irrecuperables del Service Worker
    this.updates.unrecoverable.subscribe((event: UnrecoverableStateEvent) => {
        const reason = event.reason;
        this.logSwMessage(`SW Error IRRECUPERABLE: ${reason}. Es recomendable recargar la página.`);
        // Considera mostrar un mensaje persistente al usuario para que recargue manualmente
        // document.location.reload(); // Recargar automáticamente puede causar bucles si el problema persiste en el servidor
        // En su lugar, podrías ofrecer un botón "Recargar Aplicación"
        this.newVersionAvailable = true; // Reutilizar el flag para mostrar el botón de recarga
        this.newVersionHash = "ERROR SW"; // Indicar que es por un error
        this.cdr.detectChanges();
    });

    this.logSwMessage('SW: Suscrito a eventos de actualización y errores.');
  }

  activateUpdate(): void {
    if (this.newVersionHash === "ERROR SW") { // Si es por un error irrecuperable
        this.logSwMessage('Usuario solicitó recargar debido a error de SW...');
        document.location.reload();
        return;
    }
    this.logSwMessage('SW: Usuario solicitó activar actualización...');
    this.updates.activateUpdate().then(() => {
      this.logSwMessage('SW: Actualización activada por el usuario. Recargando...');
      document.location.reload();
    }).catch(err => {
      this.logSwMessage(`SW: Error al activar actualización por usuario: ${err.message}`);
    });
  }
}