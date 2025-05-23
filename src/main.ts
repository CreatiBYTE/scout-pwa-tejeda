import { enableProdMode, importProvidersFrom, isDevMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component'; // Asegúrate que la ruta sea correcta
import { environment } from './environments/environment';
import { ServiceWorkerModule } from '@angular/service-worker';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
// Si usas FormsModule globalmente (aunque es mejor importarlo en los componentes standalone que lo necesitan)
// import { FormsModule } from '@angular/forms';

if (environment.production) {
  enableProdMode();
}

bootstrapApplication(AppComponent, {
  providers: [
    provideHttpClient(withInterceptorsFromDi()),
    importProvidersFrom(
      ServiceWorkerModule.register('ngsw-worker.js', {
        enabled: !isDevMode(), // Se habilita en producción, y 'ng serve' lo activa para desarrollo
        registrationStrategy: 'registerWhenStable:30000'
        // Para pruebas offline intensivas, podrías cambiar temporalmente a:
        // registrationStrategy: 'registerImmediately'
      })
    ),
    // Ejemplo si necesitaras FormsModule globalmente:
    // importProvidersFrom(FormsModule),
    // Aquí puedes añadir otros providers globales si fueran necesarios en el futuro
  ]
}).catch(err => {
  console.error("Error durante el bootstrap de la aplicación:", err);
});