import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, ReplaySubject } from 'rxjs';
import { tap } from 'rxjs/operators';
import { EventConfig } from '../models/config.model';

@Injectable({
  providedIn: 'root'
})
export class ConfigService {
  private configUrl = 'assets/config.json';
  private configSubject = new ReplaySubject<EventConfig>(1);
  public config$: Observable<EventConfig> = this.configSubject.asObservable();

  constructor(private http: HttpClient) {
    this.loadConfig();
  }

  private loadConfig(): void {
    this.http.get<EventConfig>(this.configUrl)
      .pipe(
        tap(config => console.log('Configuración cargada:', config))
      )
      .subscribe(
        config => this.configSubject.next(config),
        error => console.error('Error al cargar la configuración:', error)
      );
  }

  getEventConfig(): Observable<EventConfig> {
    return this.config$;
  }
}