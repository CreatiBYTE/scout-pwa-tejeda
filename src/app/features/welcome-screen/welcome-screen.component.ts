import { Component, Input, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core'; // Añadir ChangeDetectorRef
import { EventConfig } from '../../core/models/config.model';
import { PwaService } from '../../core/services/pwa.service';
import { Observable, Subscription, interval, map, startWith, BehaviorSubject } from 'rxjs'; // BehaviorSubject para canInstall
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-welcome-screen',
  standalone: true,
  imports: [ CommonModule, FormsModule ],
  templateUrl: './welcome-screen.component.html',
  styleUrls: ['./welcome-screen.component.scss']
})
export class WelcomeScreenComponent implements OnInit, OnDestroy {
  @Input() eventConfig!: EventConfig;

  isPwaActuallyInstalled$: Observable<boolean>; // Usará el observable real de PwaService
  canShowInstallPrompt$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false); // Para reactividad del botón

  countdownDisplay: string = '';
  showTeamSelection: boolean = false;
  selectedTeamModel: string = '';

  private countdownSubscription!: Subscription;
  private oneHourBeforeEvent: boolean = false;
  private subscriptions: Subscription = new Subscription();

  constructor(
    public pwaService: PwaService, // Público para usar en template
    private cdr: ChangeDetectorRef
  ) {
    this.isPwaActuallyInstalled$ = this.pwaService.isInstalled$;
  }

  ngOnInit(): void {
    if (!this.eventConfig) return;

    // Escuchar cambios en isInstalled$ para actualizar canShowInstallPrompt$
    // y también directamente si el prompt está disponible.
    this.subscriptions.add(
        this.isPwaActuallyInstalled$.subscribe(() => this.updateCanShowInstallPrompt())
    );
    // Actualizar inicialmente
    this.updateCanShowInstallPrompt();


    // Listener para cuando el prompt de instalación esté disponible (capturado por PwaService)
    // Esto es un poco redundante si PwaService expone canInstall() reactivamente,
    // pero asegura que reaccionamos si el evento beforeinstallprompt llega después de ngOnInit.
    // PwaService.canInstall() ya es reactivo a través de cómo actualiza deferredInstallPrompt.
    // Una forma más simple es que el template llame a pwaService.canInstall()
    // o podemos hacer que pwaService emita un evento cuando deferredInstallPrompt cambie.

    // Para este caso, PwaService.canInstall() es un método síncrono.
    // Lo mejor es que `pwaService.captureInstallPrompt` también actualice un observable en PwaService.
    // Por ahora, el template llamará directamente a pwaService.canInstall() y
    // nos basaremos en que el beforeinstallprompt se captura antes o durante ngOnInit.
    // Si no, PwaService necesitaría un observable para 'promptAvailability'.

    const eventStartDateTime = new Date(`${this.eventConfig.fechaInicio}T${this.eventConfig.horaInicio}`);
    this.countdownSubscription = interval(1000).pipe(
      startWith(0),
      map(() => this.calculateTimeRemaining(eventStartDateTime))
    ).subscribe(remaining => {
      this.countdownDisplay = remaining.display;
      this.oneHourBeforeEvent = remaining.oneHourBefore;
      if (this.oneHourBeforeEvent && !this.showTeamSelection) {
        this.showTeamSelection = true;
      }
      this.cdr.detectChanges(); // Asegurar que el countdown se actualice
    });
    this.subscriptions.add(this.countdownSubscription);
  }

  // Método para actualizar el estado del botón de instalación
  updateCanShowInstallPrompt(): void {
    // El botón se muestra si PWA no está instalada Y el prompt está disponible
    this.pwaService.isInstalled$.subscribe(isInstalled => {
      this.canShowInstallPrompt$.next(this.pwaService.canInstall() && !isInstalled);
      this.cdr.detectChanges(); // Notify Angular of changes
    });
    this.cdr.detectChanges(); // Notificar a Angular de los cambios
  }


  private calculateTimeRemaining(eventStartDateTime: Date): { display: string, oneHourBefore: boolean } {
    // ... (sin cambios)
    const now = new Date().getTime();
    const distance = eventStartDateTime.getTime() - now;

    if (distance <= 0) {
      this.showTeamSelection = true;
      return { display: '¡El evento ha comenzado!', oneHourBefore: true };
    }

    const oneHour = 60 * 60 * 1000;
    const oneHourBefore = distance < oneHour;

    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((distance % (1000 * 60)) / 1000);

    let display = '';
    if (days > 0) display += `${days}d `;
    display += `${this.pad(hours)}h ${this.pad(minutes)}m ${this.pad(seconds)}s para el evento`;

    return { display, oneHourBefore };
  }

  private pad(num: number): string {
    return num < 10 ? '0' + num : num.toString();
  }

  onTeamSelect(): void {
    if (this.selectedTeamModel) {
      this.pwaService.setSelectedTeam(this.selectedTeamModel);
    }
  }

  // Método para llamar al prompt de instalación desde el template
  requestPwaInstall(): void {
    this.pwaService.triggerInstallPrompt().then(() => {
        // Después de intentar instalar, re-evaluar si se debe mostrar el prompt
        this.updateCanShowInstallPrompt();
    });
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    // this.countdownSubscription ya está en this.subscriptions
  }
}