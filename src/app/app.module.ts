import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser'; // Necesario si bootstrapModule se usara
                                                          // No estrictamente necesario si solo es para agrupar
                                                          // componentes no standalone y no es el módulo raíz.
// import { FormsModule } from '@angular/forms'; // Importar solo si componentes NO standalone lo necesitan
                                             // y no se importa globalmente o en esos componentes.

// NO importes AppComponent aquí si es standalone y es tu raíz.
// NO importes ServiceWorkerModule.register(...) aquí.
// NO importes HttpClientModule aquí.

@NgModule({
  declarations: [
    // Aquí irían tus componentes, directivas, pipes que NO son standalone
    // Ejemplo: OldComponent, AnotherOldComponent
  ],
  imports: [
    BrowserModule, // Podría ser necesario si este módulo se usa de alguna manera especial
                   // o si tienes componentes que dependen de directivas de BrowserModule.
    // FormsModule, // Si es necesario para los componentes declarados aquí
    // Otros NgModules que no sean standalone y que necesites
  ],
  providers: [
    // NO proveas HttpClient aquí si ya está en main.ts
    // NO registres el ServiceWorker aquí
  ],
  // bootstrap: [] // No se usa bootstrap aquí si AppComponent es standalone y es la raíz
})
export class AppModule { }